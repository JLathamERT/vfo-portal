import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/dates'
import { TAX_INTAKE_QUESTIONS, numberTaxIntakeQuestions } from '../member/taxIntakeQuestions'
import CopyLink from '../shared/CopyLink'

// Tax Diagnostics — the queue of public /tax-diagnostic submissions (grantable
// tab `tax_diagnostics`, backend TAB_ACTIONS.tax_diagnostics).
//
// PAY-FIRST (2026-09-30). A form naming ONE member is approved by the form itself
// (Confirmed, "Tax Diagnostic form (auto)"): the payer went straight to the
// deposit page and the case is created when it clears — or at once when that
// member's deposit is waived. A "No one" lead pays first and waits here (New) for
// the team to choose the member (Confirm creates the case) or Deny (refunds the
// $500). A name matching two members is queued as before: choose the member and
// the payer, Confirm, and the deposit link email follows.

const PUBLIC_URL = 'https://vfoportal.com/tax-diagnostic'
const AUTO_CONFIRMED_BY = 'Tax Diagnostic form (auto)'
const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'denied', label: 'Denied' },
  { key: 'all', label: 'All' },
]
const STATUS_CHIP = {
  new: { label: 'New', color: '#e06717' },
  confirmed: { label: 'Confirmed', color: '#1b9254' },
  dismissed: { label: 'Dismissed', color: '#64748b' },
  denied: { label: 'Denied — refunded', color: '#d93025' },
}

// The intake row a Confirm produced, in plain words.
function intakeLabel(intake) {
  if (!intake) return null
  const who = intake.payer === 'member' ? 'the member' : 'the client'
  switch (intake.status) {
    case 'invited': return intake.link_sent_at
      ? `Deposit link sent to ${who}${intake.link_opened_at ? ' (opened)' : ''}`
      : `Deposit link to ${who} NOT drafted yet (press Retry)`
    // A bank transfer in flight keeps the row 'pending' (a side-column, not a
    // status — 2026-09-23); tax_diagnostic_list selects deposit_processing_at /
    // deposit_failed_at so these two readings are possible.
    case 'pending': return intake.deposit_processing_at
      ? (intake.deposit_bank_verification_pending_at
        ? 'Bank transfer awaiting bank verification (details entered by hand)'
        : 'Bank transfer clearing (2-4 business days)')
      : `${intake.payer === 'member' ? 'Member' : 'Client'} started the payment`
    case 'expired': return intake.deposit_failed_at
      ? 'Bank payment failed — link works again'
      : 'Payment page abandoned — the link still works'
    case 'paid': return intake.member_number ? 'Deposit paid — creating the case' : 'Deposit paid — choose the member'
    case 'waived': return 'Deposit waived — case not created yet (press Retry)'
    case 'completed': return 'Case created'
    case 'refunded': return 'Deposit refunded'
    case 'dismissed': return 'Payment link closed'
    default: return intake.status
  }
}

const visibleQuestions = TAX_INTAKE_QUESTIONS.filter(q => !q.hidden && q.type !== 'derived')

export default function TaxDiagnosticsPanel({ initialDiagnosticId = null }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('new')
  const [openId, setOpenId] = useState(initialDiagnosticId)
  const scrolled = useRef(false)

  async function load(quiet) {
    try {
      const res = await callApi('tax_diagnostic_list')
      setData(res)
      setError('')
      setLastSeen('taxdiagnostics:list', res)
    } catch (err) {
      if (quiet === true) { console.error(err); return }
      setError(err?.message || 'Could not load diagnostics')
    }
  }
  // Re-opened panel: draw the last queue at once, refresh behind it.
  useEffect(() => {
    const snap = getLastSeen('taxdiagnostics:list')
    if (snap) setData(snap)
    load(!!snap)
  }, [])

  // A bell deep link opens that card whatever its status.
  useEffect(() => {
    if (!initialDiagnosticId || !data) return
    const row = (data.diagnostics || []).find(d => d.id === initialDiagnosticId)
    if (row && row.status !== filter && filter !== 'all') setFilter('all')
    setOpenId(initialDiagnosticId)
  }, [initialDiagnosticId, data])
  useEffect(() => {
    if (scrolled.current || !openId || !data) return
    const el = document.getElementById(`diag-${openId}`)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); scrolled.current = true }
  }, [openId, data, filter])

  const rows = useMemo(() => {
    const all = data?.diagnostics || []
    return filter === 'all' ? all : all.filter(d => d.status === filter)
  }, [data, filter])
  const counts = useMemo(() => {
    const c = { new: 0, confirmed: 0, dismissed: 0, denied: 0, all: 0 }
    for (const d of data?.diagnostics || []) { c[d.status] = (c[d.status] || 0) + 1; c.all++ }
    return c
  }, [data])

  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  return (
    // Same page frame as the FAQ Editor / Growth Credits tabs.
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 6px' }}>Tax Diagnostics</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
        Submissions from the public form at <CopyLink url={PUBLIC_URL} />. A form naming one member is approved automatically; a paid lead waits under New for you to choose the member or Deny.
      </p>

      {data && data.public_page_enabled === false && (
        <div style={{ ...card, borderColor: 'rgba(224,103,23,0.45)', background: 'rgba(224,103,23,0.06)', fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
          <strong style={{ color: '#e06717' }}>The public page is switched off.</strong> Nobody can submit the form, and deposit links from confirmed diagnostics will not open, until it is switched on (<code>portal_feature_flags.tax_diagnostic</code>).
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{ padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              border: filter === f.key ? 'none' : '1px solid var(--vfo-border-strong)',
              background: filter === f.key ? '#125ecc' : 'transparent', color: filter === f.key ? '#fff' : 'var(--vfo-ink)' }}>
            {f.label} ({counts[f.key] || 0})
          </button>
        ))}
        <button type="button" onClick={load}
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
          Refresh
        </button>
      </div>

      {error && <div style={{ ...card, color: '#d93025', fontSize: '13px' }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading...</div>}
      {data && rows.length === 0 && (
        <div style={{ ...card, fontSize: '13px', color: 'var(--vfo-muted)' }}>Nothing here.</div>
      )}

      {rows.map(d => (
        <DiagnosticCard key={d.id} d={d} members={data.members || []} open={openId === d.id}
          onToggle={() => setOpenId(openId === d.id ? null : d.id)} onChanged={load} card={card} />
      ))}
    </div>
  )
}

function referrerText(d) {
  if (d.referrer_name && !d.referrer_none) return `${d.referrer_name} (named on the form)`
  const how = d.heard_from === 'Other' ? `Other${d.heard_from_other ? ` - ${d.heard_from_other}` : ''}` : (d.heard_from || 'not given')
  return `No one - heard about us via: ${how}`
}

function DiagnosticCard({ d, members, open, onToggle, onChanged, card }) {
  const chip = STATUS_CHIP[d.status] || { label: d.status, color: '#64748b' }
  const clientName = `${d.client_first_name || ''} ${d.client_last_name || ''}`.trim() || '(no name)'
  const answers = d.answers || {}
  const navigate = useNavigate()
  // Linked only once the diagnostic is an OFFICIAL client (the case was created).
  const clientProfileUrl = d.intake?.status === 'completed' && d.intake?.client_id
    ? `/admin/client/${d.intake.client_id}?program=4&tab=home`
    : null
  const label = { fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginBottom: '3px' }
  const value = { fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }

  return (
    <div id={`diag-${d.id}`} style={card}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', cursor: 'pointer' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)' }}>
            {clientProfileUrl
              ? <a href={clientProfileUrl} onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(clientProfileUrl) }}
                  title="Open client profile" style={{ color: '#125ecc', textDecoration: 'underline' }}>{clientName}</a>
              : clientName}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.55 }}>
            Submitted {formatDateTime(d.created_at)} · {d.completed_by === 'member' ? 'Completed by a VFO member' : 'Completed by the client'} · Referred by: {referrerText(d)}
          </div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color: chip.color, background: chip.color + '1a' }}>{chip.label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', border: '1px solid var(--vfo-border-strong)', fontSize: '12px', fontWeight: 600, color: '#125ecc' }}>
          {open ? 'Hide' : 'Open'}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: '18px', borderTop: '1px solid var(--vfo-border-soft)', paddingTop: '18px' }}>
          {d.status === 'new' && d.intake && <LeadBox d={d} members={members} onChanged={onChanged} />}
          {d.status === 'new' && !d.intake && <ConfirmBox d={d} members={members} onChanged={onChanged} />}

          {d.status === 'confirmed' && (
            <ConfirmedSummary d={d} onChanged={onChanged} />
          )}

          {d.status === 'dismissed' && (
            <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '16px', lineHeight: 1.6 }}>
              Dismissed by {d.dismissed_by} on {formatDate(d.dismissed_at)}{d.dismiss_reason ? ` — ${d.dismiss_reason}` : ''}.
              {d.intake && ' The payment link was closed.'}
            </div>
          )}

          {d.status === 'denied' && (
            <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '16px', lineHeight: 1.6 }}>
              Denied by {d.denied_by} on {formatDate(d.denied_at)}{d.dismiss_reason ? ` — ${d.dismiss_reason}` : ''}.
              {d.intake?.deposit_refund_id
                ? ` $${Number(d.intake.deposit_refund_amount || 0).toFixed(2)} refunded to the client (${d.intake.deposit_refund_id}${d.intake.sandbox ? ', sandbox' : ''}).`
                : ' The refund was issued in Stripe.'}
            </div>
          )}

          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '8px 0 4px' }}>Answers</div>
          {/* One question per row — a list to scroll, not a grid. */}
          <div>
            {numberTaxIntakeQuestions(visibleQuestions, answers, 0, true).map(({ q, num }, i, all) => (
              <div key={q.id} style={{ padding: '10px 0', borderBottom: i === all.length - 1 ? 'none' : '1px solid var(--vfo-tint)' }}>
                <div style={label}>{num}. {q.label}</div>
                <div style={value}>{answers[q.id] || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConfirmBox({ d, members, onChanged }) {
  const suggested = d.suggested_members || []
  const [memberNumber, setMemberNumber] = useState(suggested.length === 1 ? suggested[0].member_number : '')
  const [payer, setPayer] = useState(d.completed_by === 'member' ? 'member' : 'client')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const picked = members.find(m => m.member_number === memberNumber) || null
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return []
    return members.filter(m => m.name.toLowerCase().includes(t) || m.member_number.includes(t)).slice(0, 25)
  }, [search, members])

  async function confirm() {
    if (!picked) { setErr('Choose the member this client belongs to.'); return }
    const clientName = `${d.client_first_name || ''} ${d.client_last_name || ''}`.trim()
    if (!window.confirm(`Create ${clientName} under ${picked.name} (${picked.member_number})? The deposit will be paid by the ${payer}.`)) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const res = await callApi('tax_diagnostic_confirm', { id: d.id, member_number: picked.member_number, deposit_payer: payer })
      const text = res?.waived
        ? 'Confirmed. The deposit is waived for this member, so the case has been created and the confirmation email drafted.'
        : res?.email_drafted
          ? `Confirmed. The deposit link email to the ${payer} has been ${res.email_sent ? 'sent' : 'drafted in Gmail'}.`
          : (res?.email_error || 'Confirmed, but the deposit link email could not be drafted. Press Retry.')
      // The card moves to the Confirmed list on reload, so say it where it will still be seen.
      window.alert(text)
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Could not confirm')
      setBusy(false)
    }
  }

  async function dismiss() {
    const reason = window.prompt('Dismiss this diagnostic? Optional reason (e.g. spam, not a fit):', '')
    if (reason === null) return
    setBusy(true); setErr('')
    try {
      await callApi('tax_diagnostic_dismiss', { id: d.id, reason })
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Could not dismiss')
      setBusy(false)
    }
  }

  const btn = (primary, disabled) => ({ padding: '9px 20px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
    border: primary ? 'none' : '1px solid var(--vfo-border-strong)', background: primary ? (disabled ? 'var(--vfo-faint)' : '#1b9254') : 'transparent', color: primary ? '#fff' : 'var(--vfo-muted)' })
  const pill = on => ({ padding: '7px 16px', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', background: on ? '#125ecc' : 'transparent', color: on ? '#fff' : 'var(--vfo-ink)' })
  const inputStyle = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: 'rgba(18,94,204,0.05)', border: '1px solid rgba(18,94,204,0.18)' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>1. Member</div>
      {suggested.length > 1 && !picked && (
        <div style={{ fontSize: '12.5px', color: 'var(--vfo-ink)', marginBottom: '8px' }}>
          The form named <strong>{d.referrer_name}</strong>, which matches {suggested.length} members. Choose one:
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            {suggested.map(s => (
              <button key={s.member_number} type="button" onClick={() => setMemberNumber(s.member_number)} style={{ ...btn(false, false), padding: '6px 14px', fontSize: '12.5px' }}>
                {s.name} ({s.member_number}) {s.member_type ? `- ${s.member_type}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {d.referrer_none && !picked && (
        <div style={{ fontSize: '12.5px', color: '#e06717', marginBottom: '8px' }}>
          This is a lead — no member was named. Choose the member to introduce them to.
        </div>
      )}
      {picked ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <span style={{ padding: '7px 14px', borderRadius: '999px', background: 'rgba(18,94,204,0.10)', color: '#125ecc', fontSize: '13px', fontWeight: 600 }}>
            {picked.name} ({picked.member_number}){picked.member_type ? ` - ${picked.member_type}` : ''}
          </span>
          <button type="button" onClick={() => { setMemberNumber(''); setSearch('') }} style={{ ...btn(false, false), padding: '6px 14px', fontSize: '12px' }}>Change</button>
        </div>
      ) : (
        <div style={{ marginBottom: '6px' }}>
          <input type="text" value={search} placeholder="Search members by name or number" onChange={e => setSearch(e.target.value)} style={inputStyle} />
          {filtered.length > 0 && (
            <div style={{ marginTop: '6px', maxWidth: '420px', border: '1px solid var(--vfo-border-soft)', borderRadius: '8px', overflow: 'hidden', background: 'var(--vfo-card)' }}>
              {filtered.map(m => (
                <button key={m.member_number} type="button" onClick={() => setMemberNumber(m.member_number)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--vfo-border-soft)', background: 'transparent', fontSize: '12.5px', color: 'var(--vfo-ink)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {m.name} ({m.member_number}){m.member_type ? ` - ${m.member_type}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '16px 0 8px' }}>2. Who pays the $500 deposit?</div>
      <div role="radiogroup" style={{ display: 'inline-flex', border: '1px solid var(--vfo-border-strong)', borderRadius: '999px', padding: '3px', background: 'var(--vfo-card)' }}>
        <button type="button" role="radio" aria-checked={payer === 'client'} onClick={() => setPayer('client')} style={pill(payer === 'client')}>The client</button>
        <button type="button" role="radio" aria-checked={payer === 'member'} onClick={() => setPayer('member')} style={pill(payer === 'member')}>The member</button>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '6px', lineHeight: 1.55 }}>
        Pre-set from the form ({d.completed_by === 'member' ? 'a VFO member completed it' : 'the client completed it'}). If the member&apos;s deposit is waived nobody pays and the case is created straight away.
      </div>

      {err && <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#d93025' }}>{err}</div>}
      {msg && <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#1b9254' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button type="button" onClick={confirm} disabled={busy || !picked} style={btn(true, busy || !picked)}>{busy ? 'Working...' : 'Confirm'}</button>
        <button type="button" onClick={dismiss} disabled={busy}
          style={{ ...btn(false, busy), border: 'none', background: busy ? 'var(--vfo-faint)' : '#d93025', color: '#fff' }}>Dismiss</button>
      </div>
    </div>
  )
}

// A PAY-FIRST lead ("No one", 2026-09-30): the intake row exists from the
// submit. Unpaid → wait (Dismiss closes the pay link). Bank transfer clearing →
// wait. Paid → choose the member (Confirm creates the case; the client paid, so
// there is no payer choice) or Deny (refunds the $500, card fee kept).
function LeadBox({ d, members, onChanged }) {
  const intake = d.intake
  const [memberNumber, setMemberNumber] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const paid = intake.status === 'paid' && !intake.member_number
  const clearing = !!intake.deposit_processing_at && intake.status !== 'paid'
  const clientName = `${d.client_first_name || ''} ${d.client_last_name || ''}`.trim()

  const picked = members.find(m => m.member_number === memberNumber) || null
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return []
    return members.filter(m => m.name.toLowerCase().includes(t) || m.member_number.includes(t)).slice(0, 25)
  }, [search, members])

  async function run(action, payload, okText) {
    setBusy(true); setErr('')
    try {
      const res = await callApi(action, { id: d.id, ...payload })
      if (okText) window.alert(okText(res))
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Something went wrong')
      setBusy(false)
    }
  }
  function confirm() {
    if (!picked) { setErr('Choose the member this client belongs to.'); return }
    if (!window.confirm(`Create ${clientName} under ${picked.name} (${picked.member_number})? The client has already paid the $500 deposit.`)) return
    run('tax_diagnostic_confirm', { member_number: picked.member_number },
      () => 'Confirmed. The case has been created and the confirmation email with the deposit invoice and receipt drafted to the client.')
  }
  function deny() {
    const reason = window.prompt(`Deny ${clientName}? The $500 deposit is refunded to the client straight away (any card fee is not refunded). Optional reason:`, '')
    if (reason === null) return
    run('tax_diagnostic_deny', { reason }, res => `Denied. $${Number(res?.refund_amount || 0).toFixed(2)} refunded (${res?.refund_id}).`)
  }
  function dismiss() {
    const reason = window.prompt('Dismiss this diagnostic? The client has not paid; their payment link will stop working. Optional reason:', '')
    if (reason === null) return
    run('tax_diagnostic_dismiss', { reason })
  }

  const btn = (color, disabled) => ({ padding: '9px 20px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
    border: 'none', background: disabled ? 'var(--vfo-faint)' : color, color: '#fff' })
  const inputStyle = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: 'rgba(18,94,204,0.05)', border: '1px solid rgba(18,94,204,0.18)' }}>
      <div style={{ fontSize: '12.5px', color: '#e06717', marginBottom: '4px' }}>
        A lead — no member was named. The client pays the deposit first; then you choose the member or Deny.
      </div>
      <DepositTrack intake={intake} payer="client" payFirst createdAt={d.created_at} />

      {paid && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '14px 0 8px' }}>Choose the member</div>
          {picked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span style={{ padding: '7px 14px', borderRadius: '999px', background: 'rgba(18,94,204,0.10)', color: '#125ecc', fontSize: '13px', fontWeight: 600 }}>
                {picked.name} ({picked.member_number}){picked.member_type ? ` - ${picked.member_type}` : ''}
              </span>
              <button type="button" onClick={() => { setMemberNumber(''); setSearch('') }}
                style={{ padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>Change</button>
            </div>
          ) : (
            <div style={{ marginBottom: '6px' }}>
              <input type="text" value={search} placeholder="Search members by name or number" onChange={e => setSearch(e.target.value)} style={inputStyle} />
              {filtered.length > 0 && (
                <div style={{ marginTop: '6px', maxWidth: '420px', border: '1px solid var(--vfo-border-soft)', borderRadius: '8px', overflow: 'hidden', background: 'var(--vfo-card)' }}>
                  {filtered.map(m => (
                    <button key={m.member_number} type="button" onClick={() => setMemberNumber(m.member_number)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--vfo-border-soft)', background: 'transparent', fontSize: '12.5px', color: 'var(--vfo-ink)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                      {m.name} ({m.member_number}){m.member_type ? ` - ${m.member_type}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {intake.sandbox && (
            <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Test (sandbox) payment — it can only be linked to the Test Member.</div>
          )}
        </>
      )}

      {clearing && (
        <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '10px' }}>The bank transfer is still clearing. Choose the member or Deny once it has settled.</div>
      )}

      {err && <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#d93025' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
        {paid && <button type="button" onClick={confirm} disabled={busy || !picked} style={btn('#1b9254', busy || !picked)}>{busy ? 'Working...' : 'Confirm'}</button>}
        {paid && <button type="button" onClick={deny} disabled={busy} style={btn('#d93025', busy)}>Deny and refund</button>}
        {!paid && !clearing && <button type="button" onClick={dismiss} disabled={busy} style={btn('#d93025', busy)}>Dismiss</button>}
      </div>
    </div>
  )
}

// The confirmed diagnostic's deposit as a step track (the Automated-steps look):
// link sent → payment made → payment cleared → client created. Chip wording is
// the portal's own ("Pending — ACH clearing" / "Pending — bank verification",
// TaxPrioritiesTab + the onboarding/PIP tracks). Read from the intake row the
// Confirm produced; nothing here writes.
// payFirst (2026-09-30): the payer went straight from the form to the deposit
// page, so there is no link email — the first step is the form itself.
function DepositTrack({ intake, payer, payFirst = false, createdAt = null }) {
  const navigate = useNavigate()
  const who = payer === 'member' ? 'the member' : 'the client'
  const isAch = intake.deposit_payment_method_type === 'us_bank_account'
  const isCard = intake.deposit_payment_method_type === 'card'
  const finished = intake.status === 'paid' || intake.status === 'completed'
  const waived = intake.status === 'waived' || (intake.status === 'completed' && intake.deposit_required === false)
  const clientCreated = intake.status === 'completed' && intake.client_id
  const orange = '#e06717'
  const chip = (text, color) => (
    <span style={{ fontSize: '10.5px', padding: '2px 9px', borderRadius: '999px', background: color + '26', border: `1px solid ${color}4d`, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</span>
  )

  const steps = waived
    ? [
        { label: 'Deposit', done: true, right: chip('Waived — member has 2+ qualifying clients', '#1b9254') },
      ]
    : [
        payFirst
          ? {
            label: `Sent to the payment page from the form (${who} pays)`,
            done: true,
            right: <span>{formatDate(createdAt)}</span>,
          }
          : {
            label: `Payment link sent to ${who}`,
            done: !!intake.link_sent_at,
            right: intake.link_sent_at
              ? <span>{formatDate(intake.link_sent_at)}{intake.link_opened_at ? ` · opened ${formatDate(intake.link_opened_at)}` : ''}</span>
              : chip('Not sent yet', orange),
          },
        {
          label: 'Payment made',
          done: finished || !!intake.deposit_processing_at,
          right: intake.deposit_failed_at && !intake.deposit_processing_at && !finished
            ? chip(`Bank payment failed ${formatDate(intake.deposit_failed_at)} — link works again`, '#d93025')
            : isAch && (intake.deposit_processing_at || finished)
              ? <span>ACH Bank Transfer · {formatDate(intake.deposit_processing_at || intake.paid_at)}</span>
              : isCard || finished
                ? <span>Card · {formatDate(intake.paid_at)}</span>
                : chip('Not paid yet', orange),
        },
        {
          label: 'Payment cleared',
          done: finished,
          right: finished
            ? <span>{formatDate(intake.paid_at)}</span>
            : intake.deposit_bank_verification_pending_at
              ? chip('Pending — bank verification', orange)
              : intake.deposit_processing_at
                ? chip('Pending — ACH clearing', orange)
                : null,
        },
      ]
  steps.push({
    label: 'Client created',
    done: !!clientCreated,
    right: clientCreated
      ? (
        <button type="button"
          onClick={() => navigate(`/admin/client/${intake.client_id}?program=4&tab=home`)}
          style={{ padding: '4px 12px', borderRadius: '999px', border: 'none', background: '#125ecc', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Open client profile
        </button>
      )
      : intake.status === 'paid'
        ? chip(intake.member_number ? 'Creating the case…' : 'Choose the member', orange)
        : null,
  })

  return (
    <div style={{ margin: '12px 0 4px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '6px 14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', padding: '8px 0 4px' }}>
        Deposit{intake.sandbox ? ' (sandbox)' : ''}
      </div>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--vfo-tint)' }}>
          <span style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
            background: s.done ? '#1b9254' : 'transparent', color: s.done ? '#fff' : 'var(--vfo-muted)', border: s.done ? 'none' : '1.5px solid var(--vfo-border-strong)' }}>
            {s.done
              ? <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : i + 1}
          </span>
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: s.done ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>{s.label}</span>
          <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', textAlign: 'right' }}>{s.right}</span>
        </div>
      ))}
    </div>
  )
}

function ConfirmedSummary({ d, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const m = d.confirmed_member
  const stage = intakeLabel(d.intake)
  const auto = d.confirmed_by === AUTO_CONFIRMED_BY
  const payFirst = auto && !d.intake?.link_sent_at
  // An auto-approved diagnostic whose payer never paid may be closed (the pay
  // link stops working); one that has paid or has a case may not.
  const unpaid = d.intake && ['pending', 'expired', 'invited'].includes(d.intake.status) && !d.intake.deposit_processing_at

  async function dismiss() {
    const reason = window.prompt('Dismiss this diagnostic? Nothing has been paid; the payment link will stop working. Optional reason:', '')
    if (reason === null) return
    setBusy(true); setErr('')
    try {
      await callApi('tax_diagnostic_dismiss', { id: d.id, reason })
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Could not dismiss')
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true); setErr('')
    try {
      await callApi('tax_diagnostic_confirm', { id: d.id })
      setBusy(false)
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Retry failed')
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: '18px', fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.7 }}>
      <div><strong>Member:</strong> {m ? `${m.name} (${m.member_number})` : d.confirmed_member_number}</div>
      <div><strong>Deposit paid by:</strong> {d.deposit_payer === 'member' ? 'The member' : 'The client'}</div>
      <div><strong>Confirmed by:</strong> {auto ? 'Approved automatically by the form (one member named)' : d.confirmed_by} on {formatDate(d.confirmed_at)}</div>
      {d.intake && <DepositTrack intake={d.intake} payer={d.deposit_payer} payFirst={payFirst} createdAt={d.created_at} />}
      {!d.intake && stage && <div><strong>Status:</strong> {stage}</div>}
      {(d.intake?.status === 'waived' || (d.intake?.status === 'invited' && !d.intake?.link_sent_at) || (d.intake?.status === 'paid' && d.intake?.member_number) || !d.intake) && (
        <button type="button" onClick={retry} disabled={busy}
          style={{ marginTop: '8px', padding: '7px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', border: 'none', background: '#e06717', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Retrying...' : (d.intake?.status === 'waived' || d.intake?.status === 'paid') ? 'Retry creating the case' : d.intake ? 'Retry the deposit link email' : 'Retry'}
        </button>
      )}
      {auto && unpaid && (
        <button type="button" onClick={dismiss} disabled={busy}
          style={{ marginTop: '8px', marginLeft: '8px', padding: '7px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', border: 'none', background: '#d93025', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
          Dismiss (never paid)
        </button>
      )}
      {err && <div style={{ color: '#d93025', marginTop: '6px' }}>{err}</div>}
    </div>
  )
}
