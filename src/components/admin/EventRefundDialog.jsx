import { useState } from 'react'
import { callApi } from '../../lib/api'
import { btnDanger, btnSecondary, btnState } from '../shared/buttonStyles'

// Events > Attendees > Refund (2026-11-25): tick whose tickets go back. The ticket
// price only (events_refund_order), and each person loses their place with it.
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function EventRefundDialog({ row, onClose, onDone }) {
  const [people] = useState(() => row.people.filter(p => !p.cancelled && !p.checked_in_at))
  const [ids, setIds] = useState(() => people.map(p => p.id))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const off = busy || !ids.length || !!err

  async function refund() {
    setBusy(true); setErr('')
    try {
      const res = await callApi('events_refund_order', { order_id: row.order_id, attendee_ids: ids }, 1)
      await onDone(`${money(res.amount)} refunded to ${row.name}.`)
      onClose()
    } catch (e) {
      setErr(e?.message || 'The refund failed.')
      setBusy(false)
      await onDone('')   // refused, or not confirmed yet: the list says which
    }
  }

  return (
    <div onClick={() => { if (!busy) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(9,14,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Refund tickets" style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 18px 50px rgba(9,14,26,0.35)', padding: '26px 28px', maxWidth: '460px', width: '100%', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Refund tickets</div>
        <p style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', margin: '0 0 14px', lineHeight: 1.5 }}>Which of <strong>{row.name}</strong>'s tickets? Each person loses their place, and {row.name} is emailed.</p>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
          {people.map(p => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13.5px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={ids.includes(p.id)} onChange={() => setIds(ids.includes(p.id) ? ids.filter(x => x !== p.id) : [...ids, p.id])} style={{ accentColor: '#125ecc', cursor: 'pointer' }} />
              {p.name} <span style={{ color: 'var(--vfo-muted)' }}>{money(row.unit_price)}</span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>The ticket price goes back to how they paid{row.card_fee > 0 ? '. The card fee is not refunded' : ''}. This cannot be undone.</p>
        {err && <div style={{ fontSize: '12.5px', color: '#d93025', marginBottom: '12px' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" disabled={busy} onClick={onClose} style={btnSecondary}>{err ? 'Close' : 'Cancel'}</button>
          <button type="button" disabled={off} onClick={refund} style={btnState(btnDanger, off)}>{busy ? 'Refunding...' : `Refund ${money(ids.length * row.unit_price)}`}</button>
        </div>
      </div>
    </div>
  )
}
