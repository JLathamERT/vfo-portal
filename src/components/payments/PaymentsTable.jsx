import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { clientPagePath, useOpenMember, specialistProfilePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'

// Global admin page only (rows carry person/clientId): where a client row's payment
// lives on the client page, read off the row key the loader builds (normalize.ts).
// MAP 1 and PIP sit under Holistic (program 1); a tax plan needs its own program —
// 'Tax Planning' is program 4 — or the client page hides it (see clientPagePath).
function clientProgramOf(r) {
  return /^tax-/.test(r.key || '') && r.category === 'Tax Planning' ? 4 : 1
}
function clientPlanPath(r) {
  const k = r.key || ''
  if (/^map1-/.test(k)) return clientPagePath(r.clientId, { program: 1, tab: 'map1' })
  const m = /^tax-(\d+)-/.exec(k)
  if (m) return clientPagePath(r.clientId, { program: clientProgramOf(r), tab: 'tax', plan: m[1] })
  if (/^pip-/.test(k)) return clientPagePath(r.clientId, { program: 1, tab: 'pip' })
  return clientPagePath(r.clientId, { tab: 'home' })
}

// Shared read-only renderer for the per-person Payments tabs (client / member /
// specialist). Takes a list of normalized rows from the *_payments_load actions,
// shows a unified chronological list, and offers "type" filter chips derived from
// the rows' category. No edit/upload/delete affordances — view only.

const STATUS = {
  paid:       { label: 'Paid',              fg: '#1a7f5a', bg: '#e7f5ee' },
  processing: { label: 'Processing',        fg: '#9a6700', bg: '#fdf3d8' },
  failed:     { label: 'Failed',            fg: '#b42318', bg: '#fdecea' },
  refunded:   { label: 'Refunded',          fg: '#475467', bg: 'var(--vfo-tint)' },
  scheduled:  { label: 'Scheduled',         fg: '#1570ef', bg: '#e3effd' },
  awaiting:   { label: 'Awaiting decision', fg: '#7839ee', bg: '#f0e9fe' },
  // Closed by VFO ("Cancel all remaining payments"). Same red family as `failed` —
  // both mean "no money came in" — but a distinct label, because a cancellation is a
  // decision we made, not something that went wrong.
  cancelled:  { label: 'Cancelled',         fg: '#b42318', bg: '#fdecea' },
  unpaid:     { label: 'Not paid',          fg: 'var(--vfo-faint)', bg: '#f2f4f7' },
}

// Person-type tag colours for the global (admin) Payments page — shown in the Person
// column. Absent on the per-person tabs (rows carry no person). No Client tag (Jake,
// 2026-09-30): a client row already reads as one by its "Member: …" line, and the
// tag only cost height.
const PTYPE_TAG = {
  Member:     { fg: '#7839ee', bg: '#f0e9fe' },
  Specialist: { fg: '#0e7490', bg: '#cffafe' },
}

// Preferred display order for the filter chips (categories not listed sort last).
const CATEGORY_ORDER = [
  'MAP 1', 'Tax Priorities', 'Tax Planning', 'PIP Meetings',
  'Onboarding fee', 'On behalf of clients', 'Rev-share payouts',
  'Background check', 'Monthly license',
]

function fmtMoney(n) {
  if (n === null || n === undefined) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `−$${s}` : `$${s}`
}

function fmtDate(d) {
  if (!d) return '—'
  // Date-only values ("YYYY-MM-DD", e.g. pay1_date / retainer_date) are calendar
  // dates — build them in local time so they render as-is. `new Date("YYYY-MM-DD")`
  // would parse as UTC midnight and slip back a day for users west of UTC.
  // Full ISO timestamps (Stripe payouts/invoices) keep their instant behavior.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d))
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMethod(method, last4) {
  if (!method) return '—'
  const m = method === 'card' ? 'Card'
    : method === 'ach' ? 'ACH'
    : method === 'check' ? 'Check'
    : method === 'connect' ? 'Stripe Connect'
    : method
  return last4 ? `${m} ••${last4}` : m
}

function StatusPill({ status, count }) {
  const s = STATUS[status] || STATUS.unpaid
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '999px', background: s.bg, color: s.fg, fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.fg, flexShrink: 0 }} />
      {s.label}{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}

// Rows that fold into one expandable parent: MAP 1 quarterly installments
// (keys map1-<id>-p<n>) and a tax plan's retainer/implementation/refunds
// (keys tax-<id>-<kind>). Returns the shared parent key, or null for standalone
// rows (pay-in-full MAP 1, PIP, onboarding fee, background check, rev-share payout).
function groupKeyOf(r) {
  const k = r.key || ''
  let m = /^(map1-\d+)-p\d+$/.exec(k); if (m) return m[1]
  m = /^(tax-\d+)-[a-z]+$/.exec(k); if (m) return m[1]
  return null
}

// ── "Cancel all remaining payments" support (opt-in) ─────────────────────────
// Only the admin CLIENT Payments tab passes cancellableGroups + onCancelGroup, so
// the Member / Specialist / global AllPayments tabs — which share this table —
// render exactly as before.
//
// A group is cancellable when its program prefix is one the caller opted into AND it
// still holds at least one child the backend would actually close. The child test
// mirrors actions/payments/cancel-remaining.ts one-for-one; keep the two together:
//
//   MAP 1 — key map1-<id>-p<n>, n in 2..4 (payment 1 is NEVER cancellable: it is the
//     engagement's opening payment, not an installment — see the handler header),
//     with a normalized status of 'scheduled' (raw NULL) or 'failed' (raw declined /
//     auth_required). 'paid' / 'processing' are money done or in flight.
//   Tax  — key tax-<id>-fret (final retainer) or tax-<id>-impl (implementation), the
//     only two tax slots that are charged later. Normalized 'awaiting' (raw NULL —
//     exactly the rows the tab shows as still to come) or 'failed' (raw declined /
//     auth_required / manual_required). The initial retainer (tax-<id>-ret) and the
//     two refund rows are never cancellable.
//
// The button reads the normalized status rather than a raw column because that is
// all the loader response carries — and the normalization is 1:1 over the six live
// MAP 1 values and the five tax ones, so nothing is lost. The server re-checks every
// slot against the raw column anyway and is the authority; this test only decides
// whether the button is worth showing.
const MAP1_CANCELLABLE_CHILD = /^map1-\d+-p[2-4]$/
const TAX_CANCELLABLE_CHILD = /^tax-\d+-(fret|impl)$/

function isCancellableChild(r) {
  const k = r.key || ''
  if (MAP1_CANCELLABLE_CHILD.test(k)) return r.status === 'scheduled' || r.status === 'failed'
  if (TAX_CANCELLABLE_CHILD.test(k)) return r.status === 'awaiting' || r.status === 'failed'
  return false
}

/** 'map1-12' -> { program: 'map1', rowId: 12 }; null for anything else. */
export function parseGroupKey(gk) {
  const m = /^(map1|tax)-(\d+)$/.exec(String(gk || ''))
  return m ? { program: m[1], rowId: Number(m[2]) } : null
}

function Tag({ children, fg = 'var(--vfo-muted)', bg = 'var(--vfo-tint)' }) {
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '5px', background: bg, color: fg, fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// cancellableGroups  — array of program prefixes the CALLER supports, e.g.
//                      ['map1', 'tax']. Omit (or leave null) and no cancel control
//                      is ever rendered. Membership / PIP are deliberately not
//                      supported.
// onCancelGroup      — (groupKey, groupLabel) => void. Required alongside the array;
//                      the parent owns the confirm dialog, the API call and reload.
// cancelBusyKey      — group key currently in flight, so its button can disable.
export default function PaymentsTable({
  rows = [], emptyText = 'No payments recorded yet.', buckets = null,
  cancellableGroups = null, onCancelGroup = null, cancelBusyKey = null,
}) {
  const [filter, setFilter] = useState('All')   // payment-type (category) filter
  const [ptype, setPtype] = useState('All')      // person-type filter (global admin page only)
  const [bucketKey, setBucketKey] = useState(buckets ? buckets[0].key : null)  // 2-way money-in/out filter (global page)
  const [expanded, setExpanded] = useState({})   // group key -> true once its installments are shown
  const navigate = useNavigate()                 // global-page person links (client detail / member deep link)
  const openMember = useOpenMember()

  if (!rows.length) {
    return (
      <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13.5px', background: '#f8fafd', border: '1px dashed var(--vfo-border-chip)', borderRadius: '12px' }}>
        {emptyText}
      </div>
    )
  }

  // Distinct categories present, in preferred order, with counts.
  const counts = {}
  for (const r of rows) { const c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1 }
  const cats = Object.keys(counts).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  // Display order: decision-pending ("Awaiting decision") rows float to the top —
  // they're future/actionable — then everything else newest-first (undated last).
  const ordered = [...rows].sort((a, b) => {
    const aw = (a.status === 'awaiting' ? 1 : 0), bw = (b.status === 'awaiting' ? 1 : 0)
    if (aw !== bw) return bw - aw
    const ta = a.date ? Date.parse(a.date) : -Infinity
    const tb = b.date ? Date.parse(b.date) : -Infinity
    return (isNaN(tb) ? -Infinity : tb) - (isNaN(ta) ? -Infinity : ta)
  })
  // Person dimension (present only on the global admin page — rows carry person/personType).
  const hasPerson = rows.some(r => r.person)
  const ptypeCounts = {}
  if (hasPerson) for (const r of rows) { const t = r.personType || 'Other'; ptypeCounts[t] = (ptypeCounts[t] || 0) + 1 }
  const ptypes = ['Client', 'Member', 'Specialist'].filter(t => ptypeCounts[t])

  // When `buckets` is supplied (global admin page), a single 2-way filter — Payments
  // received vs. Revenue share payouts — replaces the per-person category/Who chips.
  const bucketCounts = {}
  if (buckets) for (const b of buckets) bucketCounts[b.key] = ordered.filter(b.match).length
  const activeBucket = buckets ? (buckets.find(b => b.key === bucketKey) || buckets[0]) : null

  const shown = buckets
    ? ordered.filter(activeBucket.match)
    : ordered
        .filter(r => filter === 'All' || (r.category || 'Other') === filter)
        .filter(r => ptype === 'All' || (r.personType || 'Other') === ptype)

  // Fold multi-payment engagements (quarterly MAP 1; tax retainer/implementation) into
  // one expandable parent so scheduled installments don't clutter the list. Each group
  // holds its place at the position of its first (newest) row; singles stay inline.
  const entries = []
  const gmap = new Map()
  for (const r of shown) {
    const gk = groupKeyOf(r)
    if (!gk) { entries.push({ single: r }); continue }
    let g = gmap.get(gk)
    if (!g) { g = { key: gk, rows: [] }; gmap.set(gk, g); entries.push(g) }
    g.rows.push(r)
  }

  const chipStyle = (active) => ({ padding: '5px 13px', background: active ? '#125ecc' : 'var(--vfo-tint)', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
  const chipCount = (active) => ({ marginLeft: '5px', opacity: active ? 0.85 : 0.6, fontWeight: 700 })

  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a89a8', borderBottom: '1px solid var(--vfo-border)', whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: '13px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)', verticalAlign: 'top' }

  // Person-cell links (global admin page only — per-person tabs carry no clientId/
  // memberNumber, so these render plain text there). Underline on hover; stopPropagation
  // so clicking a link inside a group parent row doesn't also toggle its expansion.
  const linkStyle = { color: 'var(--vfo-primary, #125ecc)', cursor: 'pointer', textDecoration: 'none' }
  const linkHover = {
    onMouseEnter: e => { e.currentTarget.style.textDecoration = 'underline' },
    onMouseLeave: e => { e.currentTarget.style.textDecoration = 'none' },
  }
  // Person name: Client with clientId -> client detail; Member with memberNumber ->
  // AdminPortal member deep link; everything else (specialist, or missing ids) plain text.
  function personName(p) {
    if (p.personType === 'Client' && p.clientId) {
      return (
        <div onClick={e => { e.stopPropagation(); navigate(clientPagePath(p.clientId, { program: clientProgramOf(p), tab: 'home' })) }} style={{ fontWeight: 600, ...linkStyle }} {...linkHover}>{p.person}</div>
      )
    }
    if (p.personType === 'Member' && p.memberNumber) {
      return (
        <div onClick={e => { e.stopPropagation(); openMember(p.memberNumber) }} style={{ fontWeight: 600, ...linkStyle }} {...linkHover}>{p.person}</div>
      )
    }
    if (p.personType === 'Specialist' && p.expertId) {
      return (
        <div onClick={e => { e.stopPropagation(); navigate(specialistProfilePath(p.expertId)) }} style={{ fontWeight: 600, ...linkStyle }} {...linkHover}>{p.person}</div>
      )
    }
    return <div style={{ fontWeight: 600 }}>{p.person}</div>
  }
  // "Member: <name>" sub-line under a Client row's person tag — links to the connected
  // member's AdminPortal deep link.
  function memberSubLine(p) {
    if (p.personType !== 'Client' || !p.memberNumber) return null
    return (
      <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '3px' }}>
        Member: <span onClick={e => { e.stopPropagation(); openMember(p.memberNumber) }} style={linkStyle} {...linkHover}>{p.memberName || p.memberNumber}</span>
      </div>
    )
  }
  // Whole-row click (global page only, like Client Overview): a client's payment
  // opens that plan, a member's opens the member. Group parents keep their
  // expand-on-click; their installment rows are clickable once expanded.
  function rowClick(r) {
    if (!hasPerson) return null
    if (r.personType === 'Client' && r.clientId) return () => navigate(clientPlanPath(r))
    if (r.personType === 'Member' && r.memberNumber) return () => openMember(r.memberNumber)
    // No specialist row carries expertId yet (the loader's only specialist source,
    // the onboarding background check, holds no payments) — ready for when one does.
    if (r.personType === 'Specialist' && r.expertId) return () => navigate(specialistProfilePath(r.expertId))
    return null
  }

  // One data row. Used for standalone rows AND, with child=true, the installment rows
  // tucked under an expanded group parent (indented + lighter, no repeated person/tag).
  function renderRow(r, child) {
    const onBehalf = !!r.onBehalfByMember
    // Two rows that are halves of ONE collection (the 3-payment tax retainer: initial +
    // final) share a subGroup and read as one indented block inside the engagement —
    // deeper indent, a tie bar down their left edge and a slightly deeper tint than the
    // other children. Rows without subGroup (everything else) render exactly as before.
    const sub = child && !!r.subGroup
    const onRow = rowClick(r)
    return (
      <tr key={r.key} onClick={onRow || undefined} {...(onRow ? rowHoverProps : {})} style={{ ...(onRow ? clickableRowStyle : null), ...(onBehalf ? { background: '#fffaf2' } : null), ...(child ? { background: '#fbfcfe' } : null), ...(sub && !onBehalf ? { background: '#f3f7fe' } : null) }}>
        <td style={td} />
        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--vfo-muted)', ...(child ? { paddingLeft: '14px' } : null), ...(sub ? { paddingLeft: '24px', borderLeft: '3px solid var(--vfo-border-chip)' } : null) }}>{fmtDate(r.date)}</td>
        {hasPerson && (
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            {!child && personName(r)}
            {!child && r.personType && PTYPE_TAG[r.personType] && (
              <div style={{ marginTop: '3px' }}><Tag fg={PTYPE_TAG[r.personType].fg} bg={PTYPE_TAG[r.personType].bg}>{r.personType}</Tag></div>
            )}
            {!child && memberSubLine(r)}
          </td>
        )}
        <td style={td}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: child ? 500 : 600, color: child ? '#475467' : 'var(--vfo-ink)' }}>{r.label}</span>
          </div>
          {r.detail && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '3px' }}>{r.detail}</div>}
          {onBehalf && <div style={{ marginTop: '5px' }}><Tag fg="#8a5200" bg="#fcefd6">Paid by {r.onBehalfByMember} — not the client’s own payment</Tag></div>}
          {r.onBehalfForClient && <div style={{ marginTop: '5px' }}><Tag fg="#1d4ed8" bg="var(--vfo-tint)">On behalf of {r.onBehalfForClient}</Tag></div>}
          {(r.invoiceNumber || r.receiptNumber) && (
            <div style={{ fontSize: '11px', color: 'var(--vfo-placeholder)', marginTop: '5px', fontFamily: 'ui-monospace, monospace' }}>
              {[r.invoiceNumber, r.receiptNumber].filter(Boolean).join('  ·  ')}
            </div>
          )}
          {r.revShare && (r.revShare.member != null || r.revShare.vfo != null || r.revShare.taxPlanner != null || r.revShare.strategic != null || r.revShare.status) && (
            <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '4px' }}>
              {`Revenue share${r.revShare.splitType ? ` (${r.revShare.splitType})` : ''}`}
              {/* A settled old-system payment carries a status and no breakdown — the
                  split describes what the implementation will pay, not what that
                  retainer did. */}
              {(r.revShare.member != null || r.revShare.vfo != null || r.revShare.taxPlanner != null || r.revShare.strategic != null) && (
                <>
                  {': Member '}
                  {r.revShare.member == null ? '—' : (r.revShare.memberIsPercent ? `${r.revShare.member}%` : fmtMoney(r.revShare.member))}
                  {/* Only shown once a tax planner share exists — plans predating the
                      3-way split have none and should not gain an empty leg. */}
                  {r.revShare.taxPlanner != null && <>{' · Tax planner '}{fmtMoney(r.revShare.taxPlanner)}</>}
                  {/* Same rule for the strategic partner, and the same position it
                      holds in both PricingSplitCards: above VFO, so the residual
                      stays the last leg. Omitting it did NOT change the VFO figure —
                      the server already netted it off — it just hid a payee, which
                      made VFO's number look like the whole remainder (#465). */}
                  {r.revShare.strategic != null && <>{' · Strategic partner '}{fmtMoney(r.revShare.strategic)}</>}
                  {/* Client portal licence (unit 4): its own payee, VFO Portal — it
                      comes off the retainer before the split. */}
                  {r.revShare.licence > 0 && <>{' · VFO Portal '}{fmtMoney(r.revShare.licence)}</>}
                  {' · VFO '}
                  {r.revShare.vfo == null ? '—' : fmtMoney(r.revShare.vfo)}
                </>
              )}
              {r.revShare.status ? <> — <strong>{r.revShare.status}</strong></> : ''}
            </div>
          )}
        </td>
        <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--vfo-muted)' }}>{fmtMethod(r.method, r.last4)}</td>
        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700, color: r.amount < 0 ? '#b42318' : 'var(--vfo-ink)' }}>{fmtMoney((r.amount || 0) - (r.fee || 0))}</div>
          {r.fee > 0 && <div style={{ fontSize: '11px', color: 'var(--vfo-placeholder)', marginTop: '2px', fontWeight: 500 }}>+ {fmtMoney(r.fee)} fee</div>}
        </td>
        <td style={td}><StatusPill status={r.status} /></td>
      </tr>
    )
  }

  // Collapsed parent for a multi-row engagement: engagement label, total, and a status
  // tally (e.g. "Paid ×1 · Scheduled ×3"). Click toggles the installment rows.
  function renderGroup(g) {
    // Same-day rows tie on date (the 3-payment initial + final retainer can both
    // land on one day), so ties break on the payment sequence the row's detail
    // line carries ("Retainer payment 1 of 2" / "2 of 2") — initial before final.
    const seqOf = (r) => {
      const m = /payment (\d+) of/.exec(r.detail || '')
      return m ? Number(m[1]) : 99
    }
    const kids = [...g.rows].sort((a, b) => {
      const ta = a.date ? Date.parse(a.date) : Infinity
      const tb = b.date ? Date.parse(b.date) : Infinity
      const dt = (isNaN(ta) ? Infinity : ta) - (isNaN(tb) ? Infinity : tb)
      return dt !== 0 ? dt : seqOf(a) - seqOf(b)
    })
    const first = kids[0]
    // Overview method = the CURRENT method (what future charges use) = the latest
    // installment's, not the oldest's — installment 1 keeps its frozen original
    // method, so kids[0] would mislead after a payment-method change.
    const latest = kids[kids.length - 1]
    const total = kids.reduce((s, k) => s + (k.amount || 0), 0)
    const feeTotal = kids.reduce((s, k) => s + (k.fee || 0), 0)
    const labels = kids.map(k => k.label)
    const groupLabel = labels.every(l => l === labels[0]) ? labels[0] : (first.category || labels[0])
    const noun = g.key.startsWith('map1') ? 'payments' : 'charges'
    const startDate = (kids.find(k => k.date) || {}).date || null
    // Tally order: still-open states first, settled ones after. 'cancelled' sits with
    // the other closed outcomes, next to 'failed'.
    const order = ['awaiting', 'scheduled', 'processing', 'paid', 'refunded', 'failed', 'cancelled', 'unpaid']
    const tally = {}
    for (const k of kids) tally[k.status] = (tally[k.status] || 0) + 1
    const open = !!expanded[g.key]
    // One button per group, only for a program the caller opted into, and only while
    // the group still holds something the server would close. Once everything is
    // cancelled or collected the button disappears rather than sitting there doing
    // nothing — and there is no un-cancel, so nothing brings it back.
    const parsed = parseGroupKey(g.key)
    const canCancel = !!onCancelGroup &&
      Array.isArray(cancellableGroups) &&
      !!parsed && cancellableGroups.includes(parsed.program) &&
      kids.some(isCancellableChild)
    const cancelBusy = cancelBusyKey === g.key
    const colSpan = hasPerson ? 7 : 6
    return (
      <Fragment key={g.key}>
        <tr onClick={() => setExpanded(p => ({ ...p, [g.key]: !p[g.key] }))} style={{ cursor: 'pointer', background: open ? 'var(--vfo-page)' : 'var(--vfo-card)' }}>
          <td style={{ ...td, padding: '12px 4px', textAlign: 'center', color: 'var(--vfo-muted)' }}>
            <span style={{ fontSize: '18px', lineHeight: 1, fontWeight: 700 }}>{open ? '▾' : '▸'}</span>
          </td>
          <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--vfo-muted)' }}>{fmtDate(startDate)}</td>
          {hasPerson && (
            <td style={{ ...td, whiteSpace: 'nowrap' }}>
              {personName(first)}
              {first.personType && PTYPE_TAG[first.personType] && (
                <div style={{ marginTop: '3px' }}><Tag fg={PTYPE_TAG[first.personType].fg} bg={PTYPE_TAG[first.personType].bg}>{first.personType}</Tag></div>
              )}
              {memberSubLine(first)}
            </td>
          )}
          <td style={td}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>{groupLabel}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '3px' }}>
              {kids.length} {noun}
            </div>
          </td>
          <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--vfo-muted)' }}>{fmtMethod(latest.method, latest.last4)}</td>
          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: total < 0 ? '#b42318' : 'var(--vfo-ink)' }}>{fmtMoney(total - feeTotal)}</div>
            {feeTotal > 0 && <div style={{ fontSize: '11px', color: 'var(--vfo-placeholder)', marginTop: '2px', fontWeight: 500 }}>+ {fmtMoney(feeTotal)} fee</div>}
          </td>
          <td style={td}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {order.filter(s => tally[s]).map(s => <StatusPill key={s} status={s} count={tally[s]} />)}
            </div>
          </td>
        </tr>
        {open && kids.map(k => renderRow(k, true))}
        {open && canCancel && (
          <tr style={{ background: '#fbfcfe' }}>
            <td colSpan={colSpan} style={{ padding: '10px 12px 14px 14px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <button
                onClick={() => onCancelGroup(g.key, groupLabel)}
                disabled={cancelBusy}
                style={{
                  background: 'transparent', color: cancelBusy ? '#c99a95' : '#b42318',
                  border: `1px solid ${cancelBusy ? '#f0d4d0' : '#f7c4bd'}`, borderRadius: '8px',
                  padding: '7px 13px', fontSize: '12px', fontWeight: 700,
                  fontFamily: 'Inter, sans-serif', cursor: cancelBusy ? 'default' : 'pointer',
                }}
              >
                {cancelBusy ? 'Cancelling…' : 'Cancel all remaining payments'}
              </button>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <div>
      {buckets ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {buckets.map(b => (
            <button key={b.key} style={chipStyle(activeBucket.key === b.key)} onClick={() => setBucketKey(b.key)}>
              {b.label}<span style={chipCount(activeBucket.key === b.key)}>{bucketCounts[b.key]}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {hasPerson && ptypes.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#7a89a8', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '2px' }}>Who</span>
              <button style={chipStyle(ptype === 'All')} onClick={() => setPtype('All')}>
                All<span style={chipCount(ptype === 'All')}>{rows.length}</span>
              </button>
              {ptypes.map(t => (
                <button key={t} style={chipStyle(ptype === t)} onClick={() => setPtype(t)}>
                  {t}<span style={chipCount(ptype === t)}>{ptypeCounts[t]}</span>
                </button>
              ))}
            </div>
          )}

          {cats.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              <button style={chipStyle(filter === 'All')} onClick={() => setFilter('All')}>
                All<span style={chipCount(filter === 'All')}>{rows.length}</span>
              </button>
              {cats.map(c => (
                <button key={c} style={chipStyle(filter === c)} onClick={() => setFilter(c)}>
                  {c}<span style={chipCount(filter === c)}>{counts[c]}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ overflowX: 'auto' }}>
        {/* Fixed column widths so the layout is identical across filters/tabs (and the
            expanded child rows) — otherwise auto-sizing shifts the headings per content. */}
        {/* Per-person tabs get NO min width — the description column flexes and wraps,
            so the table always fits its card without a horizontal scrollbar. The
            global admin page (hasPerson) keeps a floor for its extra column. */}
        <table style={{ width: '100%', ...(hasPerson ? { minWidth: '860px' } : null), borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Inter, sans-serif' }}>
          <colgroup>
            <col style={{ width: '30px' }} />
            <col style={{ width: '112px' }} />
            {hasPerson && <col style={{ width: '150px' }} />}
            <col />
            <col style={{ width: '92px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '172px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th} />
              <th style={th}>Date</th>
              {hasPerson && <th style={th}>Person</th>}
              <th style={th}>Description</th>
              <th style={th}>Method</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => e.single
              ? renderRow(e.single, false)
              : (e.rows.length === 1 ? renderRow(e.rows[0], false) : renderGroup(e)))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
