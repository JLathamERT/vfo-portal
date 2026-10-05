import { useState, useEffect, useRef, useCallback } from 'react'
import { callApi } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { Skeleton, TableSkeleton } from '../shared/Skeleton'

// Accounting > Manually sent Stripe Connect Payment. Pick anyone with a Stripe
// Connect account, type an amount + memo, Send: the transfer happens at once from the
// VFO Services balance and the recipient gets a short confirmation email. The server
// resolves the account, probes it and logs every send (manual_connect_payments).

const TYPE_LABELS = {
  member: 'Member',
  specialist: 'Specialist',
  tax_planning_group: 'Tax Planning Group',
  strategic_group: 'Strategic Partner',
}

function newClientRef() {
  return crypto.randomUUID().replace(/-/g, '')
}

function fmtDateTime(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return String(s) }
}

// Same searchable single-select as MembershipFeesPanel / SpecialistPaymentInput.
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
          <input type="search" name="search" autoComplete="off" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--vfo-tint)', fontSize: '13px', outline: 'none', fontFamily: 'Inter, sans-serif', background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }} />
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
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

function StatusChip({ status, sandbox }) {
  const map = {
    sent: { bg: '#dcfce7', fg: '#166534', text: 'Sent' },
    failed: { bg: '#fee2e2', fg: '#b91c1c', text: 'Failed' },
    pending: { bg: '#fef3c7', fg: '#92400e', text: 'Unconfirmed' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ background: s.bg, color: s.fg, borderRadius: '999px', padding: '2px 9px', fontSize: '11px', fontWeight: 700 }}>{s.text}</span>
      {sandbox && <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: '999px', padding: '2px 8px', fontSize: '10.5px', fontWeight: 700 }}>Sandbox</span>}
    </span>
  )
}

function emailLabel(s) {
  if (!s) return '—'
  if (s === 'sent') return 'Sent'
  if (s === 'drafted') return 'In Gmail Drafts'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function ManualConnectPaymentPanel() {
  const [recipients, setRecipients] = useState([])
  const [maxAmount, setMaxAmount] = useState(50000)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [picked, setPicked] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  // One idempotency key per submission: a double-click replays the same key (the
  // server's unique row refuses the second), and a new key is minted after every
  // answer so the next send is genuinely new.
  const [clientRef, setClientRef] = useState(newClientRef)

  const loadHistory = useCallback(async () => {
    const res = await callApi('manual_connect_payment_history', {})
    if (!res?.error) setHistory(res?.payments || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setLoadError('')
      const [r, h] = await Promise.all([
        callApi('manual_connect_payment_recipients', {}),
        callApi('manual_connect_payment_history', {}),
      ])
      if (cancelled) return
      if (r?.error) setLoadError(r.error)
      else { setRecipients(r?.recipients || []); if (r?.max_amount) setMaxAmount(r.max_amount) }
      if (!h?.error) setHistory(h?.payments || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const options = recipients
    .map(r => ({
      key: `${r.type}:${r.key}`,
      label: `${r.name} — ${TYPE_LABELS[r.type]}${r.detail ? ` · ${r.detail}` : ''}`,
    }))
  const sel = recipients.find(r => `${r.type}:${r.key}` === picked) || null

  const amt = parseFloat(String(amount).replace(/[,$]/g, '')) || 0
  const memoText = memo.trim()
  const canSend = !!sel && !sel.borrowed_from && amt > 0 && amt <= maxAmount && memoText !== '' && !sending

  async function send() {
    if (!canSend) return
    if (!window.confirm(`Send ${money(amt)} to ${sel.name} (${TYPE_LABELS[sel.type]}) now?\n\nMemo: ${memoText}\n\nThis moves real money from the VFO Services Stripe balance immediately.`)) return
    setSending(true); setError(''); setDone(null)
    try {
      const res = await callApi('manual_connect_payment_send', {
        entity_type: sel.type, entity_key: sel.key, amount: amt, memo: memoText, client_ref: clientRef,
      })
      if (res?.error) { setError(res.error); setClientRef(newClientRef()); return }
      if (res?.duplicate) { setError('That payment was already submitted — see the history below.'); setClientRef(newClientRef()); return }
      setDone({ name: res.recipient_name, amount: res.amount, transfer_id: res.transfer_id, sandbox: !!res.sandbox, email_status: res.email_status })
      setPicked(''); setAmount(''); setMemo(''); setClientRef(newClientRef())
    } catch (e) {
      setError(e?.message || 'Could not send the payment. Check the history below before trying again.')
    } finally {
      setSending(false)
      loadHistory()
    }
  }

  const wrap = { padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '20px', marginBottom: '22px' }
  const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }
  const histCols = '150px 1.3fr 90px 1.6fr 1.1fr 150px'

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Manually sent Stripe Connect Payment</h2>
        <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
          Sends money straight from the VFO Services Stripe balance to the person's Stripe Connect account, then emails them a short confirmation.
        </p>
      </div>

      {loadError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '16px' }}>{loadError}</div>}

      <div style={card}>
        {loading ? (
          <>
            <Skeleton width={260} height={14} />
            <Skeleton height={38} style={{ marginTop: '14px' }} />
            <Skeleton height={38} style={{ marginTop: '14px' }} />
          </>
        ) : (
          <>
            <div style={label}>Pay to</div>
            <SearchSelect options={options} value={picked} onChange={setPicked} placeholder="Search and pick a member, specialist, tax planning group or strategic partner…" />
            {sel?.borrowed_from && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#b45309' }}>
                {sel.name}'s payouts go to member {sel.borrowed_from}'s Stripe account. Pay that member directly instead.
              </div>
            )}
            {sel && !sel.borrowed_from && !sel.has_email && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#b45309' }}>
                No email address on file — the payment will send, but no confirmation email can go out.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) 1fr', gap: '14px', alignItems: 'start', marginTop: '14px' }}>
              <div>
                <div style={label}>Amount $</div>
                <input style={input} inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div>
                <div style={label}>Memo (shown in their email)</div>
                <input style={input} maxLength={200} placeholder="What this payment is for" value={memo} onChange={e => setMemo(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
              <button type="button" disabled={!canSend} onClick={send}
                style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: canSend ? 'linear-gradient(90deg, #0b4bad 0%, #125ecc 100%)' : '#c7d2e4', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: canSend ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}>
                {sending ? 'Sending…' : 'Send payment'}
              </button>
              {amt > maxAmount && <span style={{ fontSize: '12px', color: '#b45309' }}>Maximum {money(maxAmount)} per payment.</span>}
              {!sel && !sending && <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Pick who to pay, then enter an amount and a memo.</span>}
            </div>

            {error && <div style={{ marginTop: '14px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}
            {done && (
              <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '12px', padding: '14px', fontSize: '13px', lineHeight: 1.6 }}>
                {money(done.amount)} sent to {done.name}{done.sandbox ? ' (sandbox)' : ''} · transfer {done.transfer_id || '—'}<br />
                Confirmation email: {emailLabel(done.email_status)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 2px 10px' }}>History</div>
      {loading ? <TableSkeleton cols={[1.2, 1.3, 0.8, 1.6, 1.1, 1.2]} rows={3} /> : (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: histCols, gap: '10px', padding: '10px 16px', background: 'var(--vfo-tint)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', minWidth: '760px' }}>
            <div>Date</div><div>Paid to</div><div style={{ textAlign: 'right' }}>Amount</div><div>Memo</div><div>Sent by</div><div>Status</div>
          </div>
          {history.length === 0 && <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--vfo-faint)' }}>No manual payments yet.</div>}
          {history.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: histCols, gap: '10px', padding: '10px 16px', borderTop: '1px solid var(--vfo-border-soft)', fontSize: '12.5px', color: 'var(--vfo-ink)', alignItems: 'center', minWidth: '760px' }}>
              <div>{fmtDateTime(p.created_at)}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{p.recipient_name || p.entity_key}</div>
                <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{TYPE_LABELS[p.entity_type] || p.entity_type}</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>{money(Number(p.amount))}</div>
              <div style={{ wordBreak: 'break-word' }}>{p.memo}</div>
              <div style={{ fontSize: '11.5px', wordBreak: 'break-all' }}>{p.created_by || '—'}</div>
              <div title={p.error || p.stripe_transfer_id || ''}>
                <StatusChip status={p.status} sandbox={p.sandbox} />
                {p.status === 'failed' && p.error && <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '3px' }}>{p.error}</div>}
                {p.status === 'pending' && <div style={{ fontSize: '11px', color: '#92400e', marginTop: '3px' }}>Check Stripe before resending</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
