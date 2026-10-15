import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { STRATEGIC_SPLITS } from '../../lib/strategicSplits'
import { Skeleton } from '../shared/Skeleton'

// Strategic Partners (the "companies": Action Coach, Tax Plan IQ, …). Each has a
// profile showing its holistic/tax split blurb + a Stripe Connect payout account
// (Set Up button mirrors the member payout-setup flow). The 10% Strategic Partner
// Share from the revenue engines pays out to this account.
export default function StrategicPartnersPanel() {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await callApi('strategic_groups_load', {})
      setGroups(res.groups || [])
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  if (error) return <p style={{ color: '#d93025', fontSize: '13px' }}>{error}</p>
  if (!groups) return <Skeleton height={140} />

  return (
    <div>
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>Strategic Partners</div>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '4px' }}>
          Each partner company earns a Strategic Partner Share off every strategic member's deals. Set up the company's payout account here — the share transfers to it automatically.
        </div>
      </div>
      {groups.length === 0 && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,149,255,0.07)', border: '1px solid rgba(0,149,255,0.22)', color: 'var(--vfo-ink)', fontSize: '13px' }}>
          No Strategic Member Groups yet. Add one under Add Strategic Member → Add Strategic Member Group.
        </div>
      )}
      {groups.map(g => <PartnerCard key={g.id} group={g} onSaved={load} />)}
    </div>
  )
}

function PartnerCard({ group, onSaved }) {
  const [contactEmail, setContactEmail] = useState(group.contact_email || '')
  const [requesting, setRequesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const cfg = STRATEGIC_SPLITS[group.name]
  const connected = (group.stripe_account_id || '').trim()

  async function setUp() {
    if (!contactEmail.trim()) { setMsgType('error'); setMsg('Enter a contact email first.'); return }
    setRequesting(true); setMsg('')
    try {
      const res = await callApi('strategic_group_stripe_connect_request', { group_id: group.id, contact_email: contactEmail.trim() })
      setMsgType('success')
      setMsg(`Setup email sent to ${res.to_email}${res.sandbox ? ' (sandbox)' : ''}. Account ${res.stripe_account_id} is ready.`)
      await onSaved()
    } catch (err) { setMsgType('error'); setMsg(err.message) }
    finally { setRequesting(false) }
  }

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', maxWidth: '340px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const blurb = (text) => (
    <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, padding: '10px 14px', background: 'var(--vfo-input)', borderRadius: '10px', border: '1px solid var(--vfo-tint)', marginBottom: '8px' }}>{text}</div>
  )

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{group.name}</div>
        {connected
          ? <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-success-text)', background: 'rgba(27,146,84,0.12)', border: '1px solid rgba(27,146,84,0.3)', borderRadius: '999px', padding: '4px 12px' }}>Payout connected</span>
          : <span style={{ fontSize: '12px', fontWeight: 600, color: '#b26a00', background: 'rgba(224,103,23,0.10)', border: '1px solid rgba(224,103,23,0.3)', borderRadius: '999px', padding: '4px 12px' }}>No payout account</span>}
      </div>

      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Revenue split</div>
        {cfg
          ? <>{blurb(cfg.blurbs.holistic)}{blurb(cfg.blurbs.tax)}</>
          : <div style={{ fontSize: '13px', color: '#b26a00', padding: '10px 14px', background: 'rgba(224,103,23,0.08)', borderRadius: '10px', border: '1px solid rgba(224,103,23,0.25)' }}>
              No split logic configured for "{group.name}" yet — the third box won't appear on the input forms until it's added in code (src/lib/strategicSplits.js).
            </div>}
      </div>

      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Payout account</div>
      {connected && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>Stripe account: <code style={{ color: 'var(--vfo-ink)' }}>{connected}</code></div>}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Company contact email</label>
        <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="payments@company.com" style={inputStyle} />
      </div>
      <button onClick={setUp} disabled={requesting}
        style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: requesting ? 'not-allowed' : 'pointer', opacity: requesting ? 0.6 : 1 }}>
        {requesting ? 'Working…' : connected ? 'Resend Setup Email' : 'Set Up Payment Details'}
      </button>
      {msg && <p style={{ color: msgType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{msg}</p>}
    </div>
  )
}
