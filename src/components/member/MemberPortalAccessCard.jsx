import { useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate } from '../../lib/dates'

// Portal licensing L2: the member's "Send portal access" on one of their clients.
// Rendered only when msm_load_client_home carries portal_access, i.e. while the
// client_basic_portal switch is on for this client's member. One click, no
// confirm and no success message (Jake): the button just becomes "Resend portal
// access". Only a refusal (no email, email taken) is shown. There is no revoke
// (decision 9).
export default function MemberPortalAccessCard({ client, portalAccess, onSent, sectionStyle, cardTitle }) {
  const [access, setAccess] = useState(portalAccess)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const sentAt = access?.sent_at || null

  async function send() {
    setBusy(true); setError(null)
    try {
      const d = await callApi('member_client_portal_access_send', { client_id: client.id })
      if (d.ok) {
        setAccess(d.portal_access)
        onSent?.(d.portal_access)
      } else {
        setError(d.error || 'Could not send portal access.')
      }
    } catch (e) {
      setError(e.message || 'Could not send portal access.')
    }
    setBusy(false)
  }

  const btn = { padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={sectionStyle}>
      <div style={cardTitle}>Client Portal</div>
      {!client?.email ? (
        <p style={{ fontSize: '13px', color: '#d93025', margin: 0 }}>This client has no email address. Add one to their profile first.</p>
      ) : (
        <button onClick={send} disabled={busy} style={btn}
          title={sentAt ? `Portal access sent ${formatDate(sentAt)}` : undefined}>
          {busy ? 'Sending…' : sentAt ? 'Resend portal access' : 'Send portal access'}
        </button>
      )}
      {error && <p style={{ fontSize: '13px', marginTop: '12px', marginBottom: 0, color: '#d93025' }}>{error}</p>}
    </div>
  )
}
