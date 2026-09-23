import { useEffect, useMemo, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/dates'
import { TAX_INTAKE_QUESTIONS } from '../member/taxIntakeQuestions'

// Tax Diagnostics — the queue of public /tax-diagnostic submissions (grantable
// tab `tax_diagnostics`, backend TAB_ACTIONS.tax_diagnostics).
//
// Nothing is created by a submission. A person CONFIRMS the member (pre-selected
// when the form named exactly one; a choice when the name matches several; a
// free pick for a lead) and who pays the deposit (pre-set from "Who is
// completing this form?", which a public page cannot verify). Confirm then runs
// the ordinary intake pipeline: a waived member gets the case straight away,
// otherwise the payer is emailed the review-and-pay link.

const PUBLIC_URL = 'https://vfoportal.com/tax-diagnostic'
const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
]
const STATUS_CHIP = {
  new: { label: 'New', color: '#e06717' },
  confirmed: { label: 'Confirmed', color: '#1b9254' },
  dismissed: { label: 'Dismissed', color: '#64748b' },
}
// The intake row a Confirm produced, in plain words.
function intakeLabel(intake) {
  if (!intake) return null
  const who = intake.payer === 'member' ? 'the member' : 'the client'
  switch (intake.status) {
    case 'invited': return `Deposit link sent to ${who}${intake.link_opened_at ? ' (opened)' : ''}`
    case 'pending': return `${intake.payer === 'member' ? 'Member' : 'Client'} started the payment`
    case 'expired': return 'Payment page abandoned — the link still works'
    case 'paid': return 'Deposit paid — creating the case'
    case 'waived': return 'Deposit waived — case not created yet (press Retry)'
    case 'completed': return 'Case created'
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

  async function load() {
    try {
      const res = await callApi('tax_diagnostic_list')
      setData(res)
      setError('')
    } catch (err) {
      setError(err?.message || 'Could not load diagnostics')
    }
  }
  useEffect(() => { load() }, [])

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
    const c = { new: 0, confirmed: 0, dismissed: 0, all: 0 }
    for (const d of data?.diagnostics || []) { c[d.status] = (c[d.status] || 0) + 1; c.all++ }
    return c
  }, [data])

  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '20px 24px', marginBottom: '14px' }

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>Tax Diagnostics</div>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px', lineHeight: 1.6 }}>
          Submissions from the public form at <span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{PUBLIC_URL}</span>. Nothing is created until you confirm the member.
        </div>
      </div>

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
  const label = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', marginBottom: '3px' }
  const value = { fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }

  return (
    <div id={`diag-${d.id}`} style={card}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', cursor: 'pointer' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{clientName}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.55 }}>
            Submitted {formatDateTime(d.created_at)} · {d.completed_by === 'member' ? 'Completed by a VFO member' : 'Completed by the client'} · Referred by: {referrerText(d)}
          </div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color: chip.color, background: chip.color + '1a' }}>{chip.label}</span>
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{open ? 'Hide' : 'Open'}</span>
      </div>

      {open && (
        <div style={{ marginTop: '18px', borderTop: '1px solid var(--vfo-border-soft)', paddingTop: '18px' }}>
          {d.status === 'new' && <ConfirmBox d={d} members={members} onChanged={onChanged} />}

          {d.status === 'confirmed' && (
            <ConfirmedSummary d={d} onChanged={onChanged} />
          )}

          {d.status === 'dismissed' && (
            <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '16px', lineHeight: 1.6 }}>
              Dismissed by {d.dismissed_by} on {formatDate(d.dismissed_at)}{d.dismiss_reason ? ` — ${d.dismiss_reason}` : ''}.
            </div>
          )}

          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '8px 0 12px' }}>Answers</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px 24px' }}>
            {visibleQuestions.map(q => (
              <div key={q.id} style={q.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                <div style={label}>{q.label}</div>
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
      setMsg(res?.waived
        ? 'Confirmed. The deposit is waived for this member, so the case has been created and the confirmation email drafted.'
        : res?.email_drafted
          ? `Confirmed. The deposit link email to the ${payer} has been ${res.email_sent ? 'sent' : 'drafted in Gmail'}.`
          : `Confirmed, but the deposit link email could not be drafted (${res?.email_error || 'unknown'}).`)
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
        <button type="button" onClick={dismiss} disabled={busy} style={btn(false, busy)}>Dismiss</button>
      </div>
    </div>
  )
}

function ConfirmedSummary({ d, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const m = d.confirmed_member
  const stage = intakeLabel(d.intake)

  async function retry() {
    setBusy(true); setErr('')
    try {
      await callApi('tax_diagnostic_confirm', { id: d.id })
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
      <div><strong>Confirmed by:</strong> {d.confirmed_by} on {formatDate(d.confirmed_at)}</div>
      {stage && <div><strong>Status:</strong> {stage}{d.intake?.sandbox ? ' (sandbox)' : ''}</div>}
      {d.intake?.status === 'waived' && (
        <button type="button" onClick={retry} disabled={busy}
          style={{ marginTop: '8px', padding: '7px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', border: 'none', background: '#e06717', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Retrying...' : 'Retry creating the case'}
        </button>
      )}
      {err && <div style={{ color: '#d93025', marginTop: '6px' }}>{err}</div>}
    </div>
  )
}
