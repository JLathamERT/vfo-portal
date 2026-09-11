import { useState, useMemo, useRef, useEffect } from 'react'
import { callApi } from '../../lib/api'

// Accounting → VFO Specialist Payment Input.
// Pick a specialist to charge, add recipient lines (recipient + ERT share + VFOS share +
// member share + deals), watch the live totals, then Send Payment Request (= total gross)
// to the specialist. On payment the backend splits the member shares via Stripe Connect.
// A line's house share goes to ERT or to VFOS, never to both.

const NAVY = '#002973'
const BLUE = '#125ecc'

function money(n) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function amount(v) {
  return parseFloat(String(v).replace(/[,$]/g, '')) || 0
}

function ordinal(n) {
  const v = Number(n) || 0
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`
}

// Self-contained searchable single-select dropdown.
function SearchSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = options.find(o => o.key === value)
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: selected ? 'var(--vfo-ink)' : 'var(--vfo-faint)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : (placeholder || 'Select…')}</span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '10px', zIndex: 50, boxShadow: '0 14px 36px rgba(20,45,95,0.16)', overflow: 'hidden' }}>
          <input type="search" name="search" autoComplete="off" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--vfo-tint)', fontSize: '13px', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '12px', fontSize: '12px', color: 'var(--vfo-faint)' }}>No matches</div>}
            {filtered.map(o => (
              <button key={o.key} type="button" onClick={() => { onChange(o.key); setOpen(false); setQuery('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: o.key === value ? 'var(--vfo-tint)' : 'transparent', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                onMouseLeave={e => e.currentTarget.style.background = o.key === value ? 'var(--vfo-tint)' : 'transparent'}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// A labelled value with a small Copy button (house account details).
function AccountField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(String(value || ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{value || '—'}</span>
        {value && (
          <button type="button" onClick={copy}
            style={{ padding: '2px 9px', borderRadius: '6px', border: `1px solid ${BLUE}`, background: 'var(--vfo-card)', color: BLUE, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

function RevenueBadge({ decision }) {
  const isMM = decision === 'Money Mapping'
  const color = isMM ? '#d97706' : '#16a34a'
  const label = isMM ? 'Money Mapping' : 'Revenue Share'
  return (
    <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}33` }}>{label}</span>
  )
}

let lineSeq = 1

export default function SpecialistPaymentInput({ allExperts = [], allMembers = [], onSent }) {
  const [expertKey, setExpertKey] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('link')
  const [chargeDay, setChargeDay] = useState(1)
  const [lines, setLines] = useState([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // Specialist (the payer) dropdown — all experts, sorted by name.
  const specialistOptions = useMemo(() => (
    [...allExperts]
      .filter(e => e && e.name)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(e => ({ key: `e:${e.id}`, label: `${e.name}${e.status && e.status !== 'Active' ? ` — ${e.status}` : ''}`, expert: e }))
  ), [allExperts])

  // Recipient dropdown — advisors + accountants + strategic members + specialists, one list.
  const recipientOptions = useMemo(() => {
    const memberOpts = [...allMembers]
      .filter(m => m && (m.first_name || m.last_name))
      .map(m => {
        const name = `${m.first_name || ''} ${m.last_name || ''}`.trim()
        const cat = m.member_category === 'accountant' ? 'Accountant'
          : m.member_category === 'strategic_member' ? 'Strategic'
          : 'Advisor'
        return {
          key: `m:${m.member_number}`, label: `${name} (${m.member_number}) — ${cat}`,
          recipient_type: 'member', member_number: m.member_number, expert_id: null,
          recipient_name: name, recipient_email: m.email || '',
          revenue_decision: m.revenue_decision || 'Revenue Share',
        }
      })
    const specOpts = [...allExperts]
      .filter(e => e && e.name)
      .map(e => ({
        key: `e:${e.id}`, label: `${e.name} — Specialist`,
        recipient_type: 'specialist', member_number: null, expert_id: e.id,
        recipient_name: e.name, recipient_email: e.email || '',
        revenue_decision: e.revenue_decision || 'Revenue Share',
      }))
    return [...memberOpts, ...specOpts].sort((a, b) => a.label.localeCompare(b.label))
  }, [allMembers, allExperts])

  const recipientByKey = useMemo(() => {
    const map = {}
    recipientOptions.forEach(o => { map[o.key] = o })
    return map
  }, [recipientOptions])

  function addLine() {
    setLines(ls => [...ls, { id: lineSeq++, recipientKey: '', ert_share: '', vfos_share: '', member_share: '', deals: '', transaction_details: '' }])
  }
  function removeLine(id) { setLines(ls => ls.filter(l => l.id !== id)) }
  function updateLine(id, patch) { setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l)) }

  const totals = useMemo(() => {
    let member = 0, ert = 0, vfos = 0, deals = 0
    lines.forEach(l => {
      member += amount(l.member_share)
      ert += amount(l.ert_share)
      vfos += amount(l.vfos_share)
      deals += parseInt(String(l.deals).replace(/[^0-9]/g, '')) || 0
    })
    return { member, ert, vfos, deals, gross: member + ert + vfos }
  }, [lines])

  const selectedExpert = expertKey ? specialistOptions.find(o => o.key === expertKey)?.expert : null
  // Every line needs a recipient, a member share, deals, and exactly ONE of the two house
  // shares. "One" is counted on the text, not the number, so the long-standing habit of
  // typing a literal 0 in VFOS still completes a line; what is rejected is real money in
  // both boxes at once.
  const lineComplete = (l) => !!l.recipientKey
    && String(l.member_share).trim() !== ''
    && String(l.deals).trim() !== ''
    && (String(l.ert_share).trim() !== '' || String(l.vfos_share).trim() !== '')
    && !(amount(l.ert_share) > 0 && amount(l.vfos_share) > 0)
  const allLinesComplete = lines.length > 0 && lines.every(lineComplete)
  const canSend = !!selectedExpert && !!selectedExpert.email && allLinesComplete && totals.gross > 0 && !sending

  async function send() {
    if (!canSend) return
    setSending(true); setError(''); setResult(null)
    try {
      const mappedLines = lines.map(l => {
        const r = recipientByKey[l.recipientKey]
        return {
          recipient_type: r.recipient_type, member_number: r.member_number, expert_id: r.expert_id,
          recipient_name: r.recipient_name, recipient_email: r.recipient_email,
          revenue_decision: r.revenue_decision,
          ert_share: l.ert_share, vfos_share: l.vfos_share, member_share: l.member_share, deals: l.deals,
          transaction_details: l.transaction_details,
        }
      })
      let res
      if (paymentMethod === 'recurring') {
        res = await callApi('specialist_revenue_recurring_create', {
          expert_id: selectedExpert.id, charge_day: chargeDay, lines: mappedLines,
        })
      } else {
        res = await callApi('specialist_revenue_send_request', {
          expert_id: selectedExpert.id, lines: mappedLines, payment_method: paymentMethod,
        })
      }
      if (res?.error) { setError(res.error); return }
      setResult(res)
      setLines([]); setExpertKey(''); setPaymentMethod('link'); setChargeDay(1)
      onSent?.(res)
    } catch (e) {
      setError(e?.message || 'Failed to send payment request')
    } finally {
      setSending(false)
    }
  }

  const wrap = { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', padding: '22px', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '20px' }
  const numInput = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none' }
  const reqBorder = (filled) => filled ? '1px solid var(--vfo-border-strong)' : '1px solid #f3c0c0'
  const offInput = { background: 'var(--vfo-tint)', color: 'var(--vfo-faint)', cursor: 'not-allowed' }
  const colLabel = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }
  const grid = '1.3fr 115px 115px 115px 70px 1fr 36px'

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist Payment Input</h2>
      </div>

      {result && result.pending && (
        <div style={{ ...card, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Expected payment recorded{result.sandbox ? ' (sandbox)' : ''}</div>
          <div style={{ fontSize: '13px', color: '#166534', marginBottom: '14px' }}>No email was sent. Give the specialist the VFO account details below so they can push the {money(result.gross_amount)} transfer from their own bank. Once the transfer lands, mark it received in Accounting → VFO Specialist Revenue (Automation).</div>
          {result.account && (
            <div style={{ padding: '14px 16px', background: 'var(--vfo-card)', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>VFO house account — give these to the specialist</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <AccountField label="Bank name" value={result.account.bank_name} />
                <AccountField label="Routing number" value={result.account.routing_number} />
                <AccountField label="Account number" value={result.account.account_number} />
                <AccountField label="Account holder" value={result.account.holder_name} />
              </div>
            </div>
          )}
        </div>
      )}
      {result && result.recurring && (
        <div style={{ ...card, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Recurring payment plan created{result.sandbox ? ' (sandbox)' : ''}</div>
          <div style={{ fontSize: '13px', color: '#166534' }}>A setup email was drafted to <strong>{result.to_email}</strong>. The first charge of {money(result.monthly_amount)} lands on the {ordinal(result.charge_day)} after the specialist completes ACH setup, then monthly on that day. Track it in Accounting → VFO Specialist Recurring Revenue Payments.</div>
          {result.email_skipped && (
            <div style={{ fontSize: '12.5px', color: '#b45309', marginTop: '10px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fde68a', background: '#fffbeb' }}>The recurring setup email template is not seeded yet, so no email was drafted. Seed <strong>SPECREV_recurring_setup</strong> in Email Templates, then re-send the link.</div>
          )}
        </div>
      )}
      {result && !result.pending && !result.recurring && (
        <div style={{ ...card, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Payment request created{result.sandbox ? ' (sandbox)' : ''}</div>
          <div style={{ fontSize: '13px', color: '#166534' }}>A {money(result.gross_amount)} payment request was drafted to <strong>{result.to_email}</strong>. Review &amp; send it from the Gmail drafts folder. Track its status in Accounting → VFO Specialist Revenue.</div>
        </div>
      )}
      {error && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>{error}</div>
      )}

      {/* Specialist picker */}
      <div style={card}>
        <div style={{ ...colLabel, marginBottom: '8px' }}>Specialist (who is paying)</div>
        <div style={{ maxWidth: '420px' }}>
          <SearchSelect options={specialistOptions} value={expertKey} onChange={setExpertKey} placeholder="Select a specialist…" />
        </div>
        {selectedExpert && !selectedExpert.email && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#b45309' }}>This specialist has no email on file — add one in their profile before sending a request.</div>
        )}
      </div>

      {/* Payment method */}
      <div style={card}>
        <div style={{ ...colLabel, marginBottom: '10px' }}>Payment method</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          {[
            { key: 'link', title: 'ACH debit — send payment link', desc: 'Specialist gets an email with a secure Stripe link and authorizes the debit.' },
            { key: 'pending', title: 'Bank transfer — record expected payment', desc: 'Specialist pushes to our fixed VFO account. No email is sent; you mark it received once the money lands.' },
            { key: 'recurring', title: 'Recurring monthly — send ACH setup link', desc: 'Emails the specialist a setup link to authorize an automatic monthly ACH payment on a day you choose.' },
          ].map(opt => {
            const active = paymentMethod === opt.key
            return (
              <button key={opt.key} type="button" onClick={() => setPaymentMethod(opt.key)}
                style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '10px', border: active ? `2px solid ${BLUE}` : '1px solid var(--vfo-border-strong)', background: active ? 'var(--vfo-tint)' : 'var(--vfo-card)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ marginTop: '2px', width: '16px', height: '16px', borderRadius: '50%', border: active ? `5px solid ${BLUE}` : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.4 }}>{opt.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
        {paymentMethod === 'recurring' && (
          <div style={{ marginTop: '16px', maxWidth: '260px' }}>
            <div style={{ ...colLabel, marginBottom: '6px' }}>Charge day of month</div>
            <select value={chargeDay} onChange={e => setChargeDay(Number(e.target.value))}
              style={{ ...numInput, cursor: 'pointer', background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{ordinal(d)}</option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '8px', lineHeight: 1.4 }}>
              The first charge lands on the next occurrence of this day after the specialist completes setup.
            </div>
          </div>
        )}
      </div>

      {/* Recipient lines */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '12px', alignItems: 'end', paddingBottom: '10px', borderBottom: '1px solid var(--vfo-tint)' }}>
          <div style={colLabel}>Member / Recipient</div>
          <div style={colLabel}>ERT Share $</div>
          <div style={colLabel}>VFOS Share $</div>
          <div style={colLabel}>Member Share $</div>
          <div style={colLabel}>Deals</div>
          <div style={colLabel}>Transaction details</div>
          <div />
        </div>

        {lines.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>No recipients yet — click "Add member" to start.</div>
        )}

        {lines.map(l => {
          const r = l.recipientKey ? recipientByKey[l.recipientKey] : null
          // The house share lands on ERT or on VFOS. A real amount in one locks the other
          // box; a typed 0 locks nothing, so "0 in VFOS" still means "no house share here".
          const ertLocked = amount(l.vfos_share) > 0
          const vfosLocked = amount(l.ert_share) > 0
          const houseFilled = String(l.ert_share).trim() !== '' || String(l.vfos_share).trim() !== ''
          return (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '12px', alignItems: 'start', padding: '14px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div>
                <SearchSelect options={recipientOptions} value={l.recipientKey} onChange={k => updateLine(l.id, { recipientKey: k })} placeholder="Select a member…" />
                {r && <RevenueBadge decision={r.revenue_decision} />}
              </div>
              <input style={{ ...numInput, border: reqBorder(houseFilled), ...(ertLocked ? offInput : null) }} disabled={ertLocked} inputMode="decimal" placeholder="0.00" value={l.ert_share} onChange={e => updateLine(l.id, { ert_share: e.target.value })} />
              <input style={{ ...numInput, border: reqBorder(houseFilled), ...(vfosLocked ? offInput : null) }} disabled={vfosLocked} inputMode="decimal" placeholder="0.00" value={l.vfos_share} onChange={e => updateLine(l.id, { vfos_share: e.target.value })} />
              <input style={{ ...numInput, border: reqBorder(String(l.member_share).trim() !== '') }} inputMode="decimal" placeholder="0.00" value={l.member_share} onChange={e => updateLine(l.id, { member_share: e.target.value })} />
              <input style={{ ...numInput, border: reqBorder(String(l.deals).trim() !== '') }} inputMode="numeric" placeholder="0" value={l.deals} onChange={e => updateLine(l.id, { deals: e.target.value })} />
              <input style={numInput} placeholder="Optional" value={l.transaction_details} onChange={e => updateLine(l.id, { transaction_details: e.target.value })} />
              <button type="button" onClick={() => removeLine(l.id)} title="Remove"
                style={{ width: '36px', height: '38px', borderRadius: '8px', border: '1px solid #f3d0d0', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
            </div>
          )
        })}

        {/* Totals row aligned to columns */}
        {lines.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '12px', alignItems: 'center', padding: '14px 0 4px', borderTop: '2px solid var(--vfo-border-soft)', marginTop: '2px' }}>
            <div style={{ fontWeight: 700, color: 'var(--vfo-heading)', fontSize: '13px' }}>Totals</div>
            <div style={{ fontWeight: 700, color: 'var(--vfo-ink)', fontSize: '13px' }}>{money(totals.ert)}</div>
            <div style={{ fontWeight: 700, color: 'var(--vfo-ink)', fontSize: '13px' }}>{money(totals.vfos)}</div>
            <div style={{ fontWeight: 700, color: 'var(--vfo-ink)', fontSize: '13px' }}>{money(totals.member)}</div>
            <div style={{ fontWeight: 700, color: 'var(--vfo-ink)', fontSize: '13px' }}>{totals.deals}</div>
            <div />
            <div />
          </div>
        )}

        <button type="button" onClick={addLine}
          style={{ marginTop: '14px', padding: '9px 16px', borderRadius: '8px', border: `1px solid ${BLUE}`, background: 'var(--vfo-card)', color: BLUE, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          + Add member
        </button>
      </div>

      {/* Gross + send */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={colLabel}>Total gross (charged to specialist)</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--vfo-heading)', marginTop: '4px' }}>{money(totals.gross)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <button type="button" disabled={!canSend} onClick={send}
            style={{ padding: '14px 28px', borderRadius: '10px', border: 'none', background: canSend ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : '#c7d2e4', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: canSend ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}>
            {sending ? 'Sending…' : (paymentMethod === 'pending' ? `Record expected payment — ${money(totals.gross)}` : paymentMethod === 'recurring' ? `Send recurring payment link — ${money(totals.gross)}/mo` : `Send Payment Request — ${money(totals.gross)}`)}
          </button>
          {lines.length > 0 && !allLinesComplete && (
            <div style={{ fontSize: '12px', color: '#b45309' }}>Fill in a recipient, an ERT $ or VFOS $ (not both), Member $, and Deals for every line before sending.</div>
          )}
        </div>
      </div>
    </div>
  )
}
