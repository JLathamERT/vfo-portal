import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { StackedCardsSkeleton } from '../shared/Skeleton'
import { PageHeading } from '../shared/ProfileKit'

// The Feature Switches tab (2026-09-28), under More ▾ — superadmins, and any admin
// it was turned on for in the Admin Editor (2026-11-25). The backend
// (feature_switches_load / feature_switches_save, TAB_ACTIONS.feature_switches) is
// the real gate.
//
// Since 2026-10-19 the tab shows CARDS, not raw switches (Jake): a card can hold
// several portal_feature_flags keys that only make sense together, and its
// control writes the same position to every one of them (one
// feature_switches_save per key). If the keys ever disagree (an SQL flip) the card
// reads MIXED until a position is chosen. The keys themselves are unchanged —
// every backend read still names its own key.
//
// Positions: Off for all · Test member only (59524) · On for all (test member
// included). A card whose keys are not all member-scoped has only Off / On.
// The COPY below is the contract Jake reads before flipping — when a feature
// behind a switch changes, change its card in the same commit. Keep `on` / `off`
// short; the full behaviour goes under `details`.

const CARDS = [
  {
    id: 'sdp_atsg_planners',
    keys: ['sdp_atsg_planners'],
    title: 'SDP ATSG for SDP planners',
    on: [
      [null, 'SDP\'s tax planners and team members see the "SDP - Advanced Tax Strategy Governance" tab in their portal and can add and run their own clients.'],
    ],
    off: 'SDP\'s planners and team members see no tab and cannot open SDP cases. Admins still run SDP ATSG from More ▸ SDP ATSG, and its client emails still Cc SDP.',
    onConfirm: 'ON for SDP\'s tax planners and team members, starting immediately.',
    offConfirm: 'OFF for SDP\'s tax planners and team members. Admins keep More ▸ SDP ATSG.',
  },
  {
    id: 'client_auto_status',
    keys: ['client_auto_status'],
    title: 'Automatic client status',
    on: [
      [null, 'Every client shows one status worked out from their programs: Pending (nothing started), Active (something in progress), Paused, Next tax year or Inactive (everything finished or stopped). Lost is still set by hand, on the profile.'],
    ],
    off: 'Clients show the hand-set Active / Pending / Lost as before. The automatic status is still worked out in the background.',
    onConfirm: 'ON: every client list and profile shows the automatic status, starting immediately.',
    offConfirm: 'OFF: every client list and profile goes back to the hand-set status.',
  },
  {
    id: 'events',
    keys: ['events'],
    title: 'Events',
    on: [
      [null, 'Every member sees the Events tab after Profile. Members buy tickets there; Tier 3 members and their corporate members register free, with up to 4 free guests each.'],
      [null, 'The public page vfoportal.com/events sells tickets to anyone. Those orders appear in More > Events to be allocated.'],
    ],
    off: 'No Events tab, no public page and no ticket sales. More > Events still works, and tickets already bought are kept.',
    onConfirm: 'ON for every member and the public page, starting immediately.',
    offConfirm: 'OFF: the Events tab and the public page disappear.',
  },
  {
    id: 'gc_black_friday',
    keys: ['gc_black_friday'],
    title: 'Black Friday sale',
    on: [
      [null, 'Members see the Black Friday bar at the top of every portal page: "Starts in" until Fri 27 Nov 12:00 AM PST, then "Ends in" Sun 29 Nov 11:59 PM PST. At Mon 30 Nov 12:00 AM PST it turns to "Extended - through Cyber Monday" by itself and counts down to Mon 30 Nov 11:59 PM PST. The deal can be bought from Friday to Monday night without a break. Clicking the bar opens the Growth Credits packages.'],
      [null, 'During the sale members can buy any number of credits from 1 to 10 at $100 each and get the same number free, up to 10 free credits per member in total (several purchases are fine). The usual packages stay at their normal prices.'],
      [null, 'The public page vfoportal.com/black-friday takes orders from members who are not signed in. They appear in Growth Credits > Purchases to be allocated to a member.'],
    ],
    off: 'No bar, no free credits and no public page. Orders already paid keep their free credits, and Purchases > Allocate still works.',
    onConfirm: 'ON for every member and the public page, starting immediately.',
    offConfirm: 'OFF: the bar, the free credits and the public page disappear.',
  },
]

// Switches that are permanently ON and must not be flipped from this tab (Jake):
// hidden here only. The flag row stays ON and every backend read is unchanged;
// feature_switches_load still returns it, and SQL can still flip it.
// tax_diagnostic (2026-10-16) = the public vfoportal.com/tax-diagnostic page + its
// deposit links; tax_reminders (the tax reminder chases) and single_client_profile
// (every program on one client page) since 2026-10-19; mirrored_clients (Client
// Mirroring) and tax_intake (Members add clients) since 2026-11-02.
// Since 2026-11-25: the VFO Client Portal card's four keys and its My Progress tab, and
// tax_direct (Direct to Tax Planning).
const HIDDEN_SWITCHES = [
  'tax_diagnostic', 'tax_reminders', 'single_client_profile', 'mirrored_clients', 'tax_intake',
  'portal_licensing', 'client_basic_portal', 'ciq_licence', 'tpom_additional_benefits', 'client_case_progress',
  'tax_direct',
]

const POSITIONS = [
  { mode: 'off', label: 'Off for all' },
  { mode: 'test', label: 'Test member only' },
  { mode: 'on', label: 'On for all' },
]

const MODE_PILL = {
  off: { label: 'OFF', color: '#e74c3c' },
  test: { label: 'TEST MEMBER ONLY', color: '#e67e22' },
  on: { label: 'ON FOR ALL', color: '#27ae60' },
  mixed: { label: 'MIXED', color: '#7f8c8d' },
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export default function FeatureSwitchesPanel() {
  const [switches, setSwitches] = useState([])
  const [testMember, setTestMember] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyCard, setBusyCard] = useState(null)
  const [openDetails, setOpenDetails] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await callApi('feature_switches_load')
      if (data.error) throw new Error(data.error)
      setSwitches(data.switches || [])
      setTestMember(data.test_member || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Every card on screen: the CARDS whose keys the backend knows, then any other
  // visible switch on its own (a switch added later without a card still shows).
  const byKey = Object.fromEntries(switches.map(s => [s.key, s]))
  const carded = new Set(CARDS.flatMap(c => [...c.keys, ...(c.subSwitches || []).map(s => s.key)]))
  const cards = [
    ...CARDS.map(c => ({ ...c, rows: c.keys.map(k => byKey[k]).filter(Boolean) })).filter(c => c.rows.length > 0),
    ...switches.filter(s => !carded.has(s.key) && !HIDDEN_SWITCHES.includes(s.key))
      .map(s => ({ id: s.key, keys: [s.key], title: s.key, on: [], off: '', rows: [s] })),
  ]

  async function setMode(card, mode, current) {
    if (mode === current || busyCard) return
    const what = mode === 'on'
      ? (card.onConfirm || 'ON for EVERY member, starting immediately.')
      : mode === 'test'
        ? (card.testConfirm || `OFF for everyone except the test member (${testMember}).`)
        : (card.offConfirm || 'OFF for everyone, including the test member.')
    if (!window.confirm(`"${card.title}"\n\nThis turns it ${what}\n\nContinue?`)) return
    setBusyCard(card.id)
    try {
      for (const row of card.rows) {
        if (row.mode === mode) continue
        const res = await callApi('feature_switches_save', { key: row.key, mode })
        if (res.error) throw new Error(res.error)
        setSwitches(prev => prev.map(s => s.key === row.key ? { ...s, mode: res.mode, updated_at: res.updated_at, updated_by: res.updated_by } : s))
      }
    } catch (e) {
      alert('Could not change the switch: ' + e.message + '\n\nThe card will reload to show where each part stands.')
      load()
    } finally {
      setBusyCard(null)
    }
  }

  // The three positions + status line for one set of rows (a card, or a sub-switch
  // inside a card, which flips only its own row).
  function renderControl(card) {
    const modes = [...new Set(card.rows.map(r => r.mode))]
    const current = modes.length === 1 ? modes[0] : 'mixed'
    const positions = card.rows.every(r => r.member_scoped) ? POSITIONS : POSITIONS.filter(p => p.mode !== 'test')
    const busy = busyCard === card.id
    const missing = card.rows.filter(r => !r.exists)
    const last = card.rows.filter(r => r.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', overflow: 'hidden' }}>
          {positions.map(p => {
            const active = current === p.mode
            return (
              <button
                key={p.mode}
                onClick={() => setMode(card, p.mode, current)}
                disabled={busy || missing.length > 0}
                style={{
                  padding: '8px 16px', border: 'none', borderRight: '1px solid var(--vfo-border-strong)',
                  background: active ? MODE_PILL[p.mode].color : 'transparent',
                  color: active ? '#fff' : 'var(--vfo-ink)', fontWeight: active ? 700 : 500, fontSize: '13px',
                  cursor: busy || active ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >{p.label}</button>
            )
          })}
        </div>
        {busy && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Saving…</span>}
        {current === 'mixed' && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Its parts are set differently — choose a position to line them up.</span>}
        {missing.length > 0 && <span style={{ fontSize: '12px', color: '#e74c3c' }}>No database row yet for {missing.map(r => r.key).join(', ')} — it reads as off.</span>}
        {last && (
          <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
            Last changed {fmtWhen(last.updated_at)}{last.updated_by ? ` by ${last.updated_by}` : ''}
          </span>
        )}
      </div>
    )
  }

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-faint)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '14px 0 6px', fontWeight: 600 }
  const listStyle = { margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <PageHeading eyebrow="More" title="Feature Switches" style={{ marginBottom: '8px' }} />
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Features that are built but held back from real members. While a switch is off the portal behaves exactly as it did before the feature. "Test member only" turns it on for the test member ({testMember || '59524'}) alone, so it can be tried on the real portal. A change takes effect immediately — no deploy.
      </p>

      {loading && <StackedCardsSkeleton cards={4} body={3} />}
      {error && <div style={{ color: '#e74c3c', fontSize: '14px', marginBottom: '16px' }}>{error}</div>}

      {!loading && cards.map(card => {
        const modes = [...new Set(card.rows.map(r => r.mode))]
        const current = modes.length === 1 ? modes[0] : 'mixed'
        const pill = MODE_PILL[current] || MODE_PILL.off
        const detailsOpen = !!openDetails[card.id]
        const subs = (card.subSwitches || [])
          .map(s => ({ ...s, id: `${card.id}:${s.key}`, title: `${card.title} - ${s.title}`, label: s.title, rows: [byKey[s.key]].filter(Boolean) }))
          .filter(s => s.rows.length > 0)
        return (
          <div key={card.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{card.title}</div>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: pill.color, borderRadius: '999px', padding: '4px 12px' }}>{pill.label}</span>
            </div>

            {card.on.length > 0 && (
              <>
                <div style={labelStyle}>Switched on</div>
                <ul style={listStyle}>
                  {card.on.map(([head, text], i) => <li key={i}>{head && <strong>{head}: </strong>}{text}</li>)}
                </ul>
              </>
            )}

            {card.off && (
              <>
                <div style={labelStyle}>Switched off</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{card.off}</div>
              </>
            )}

            {card.note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '10px' }}>{card.note}</div>}

            {card.details && card.details.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <button type="button" onClick={() => setOpenDetails(o => ({ ...o, [card.id]: !o[card.id] }))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {detailsOpen ? 'Hide details ▴' : 'Details ▾'}
                </button>
                {detailsOpen && card.details.map(([head, items], i) => (
                  <div key={i}>
                    {head && <div style={labelStyle}>{head}</div>}
                    <ul style={{ ...listStyle, fontSize: '13px', color: 'var(--vfo-muted)', marginTop: head ? 0 : '8px' }}>
                      {items.map((t, j) => <li key={j}>{t}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {renderControl(card)}

            {subs.map(sub => {
              const subMode = sub.rows[0].mode
              const subPill = MODE_PILL[subMode] || MODE_PILL.off
              return (
                <div key={sub.id} style={{ borderTop: '1px solid var(--vfo-border-soft)', marginTop: '20px', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{sub.label}</div>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: subPill.color, borderRadius: '999px', padding: '4px 12px' }}>{subPill.label}</span>
                  </div>
                  <div style={labelStyle}>Switched on</div>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{sub.on}</div>
                  <div style={labelStyle}>Switched off</div>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{sub.off}</div>
                  {sub.note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '10px' }}>{sub.note}</div>}
                  {renderControl(sub)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
