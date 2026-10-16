import { useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate } from '../../lib/dates'

// Portal licensing L2: the member's "Send portal access" on one of their clients.
// Rendered only when msm_load_client_home carries portal_access, i.e. while the
// client_basic_portal switch is on for this client's member. One click, no
// confirm and no success message (Jake): the button just becomes "Resend portal
// access". Only a refusal (no email, email taken) is shown. There is no revoke
// (decision 9).
//
// Portal licensing L4 (2026-10-16): when msm_load_client_home also carries
// ciq_licence (ciq_licence switch on), the card gains the "Standard portal -
// $25/month" line - turn on / turn off / keep it on. Every rule is the server's
// (member_ciq_licence_*); the copy never claims a payment the row doesn't show
// (#567) - a return from Stripe only adds "refresh in a moment".
export default function MemberPortalAccessCard({ client, portalAccess, onSent, ciqLicence, sectionStyle, cardTitle }) {
  const [access, setAccess] = useState(portalAccess)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lic, setLic] = useState(ciqLicence)
  const [licBusy, setLicBusy] = useState(false)
  const [licError, setLicError] = useState(null)

  const sentAt = access?.sent_at || null
  const hasLogin = !!access?.has_login
  const justPaid = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ciq_licence') === 'done'

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

  async function licenceAction(action) {
    if (action === 'member_ciq_licence_stop' && !window.confirm(`Turn off the Standard portal for ${client.first_name || 'this client'}? It stays on until the end of the month you have paid for, then they go back to the Basic portal.`)) return
    setLicBusy(true); setLicError(null)
    try {
      const d = await callApi(action, { client_id: client.id })
      if (d?.url) { window.location.href = d.url; return }
      if (d?.ok) setLic(d.ciq_licence)
      else setLicError(d?.error || 'Something went wrong.')
    } catch (e) {
      setLicError(e.message || 'Something went wrong.')
    }
    setLicBusy(false)
  }

  const btn = { padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }
  const ghost = { padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: 600, cursor: licBusy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }
  const first = client?.first_name || 'your client'
  const method = lic?.acct_last4 ? ` (${lic.payment_method_type === 'ach' ? 'bank' : 'card'} ending ${lic.acct_last4})` : ''

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

      {lic && (
        <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '6px' }}>Standard portal - $25/month</div>
          <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            {lic.state === 'covered' && <>Covered by the tax licence until <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.covered_until)}</strong> - no charge.</>}
            {lic.state === 'basic' && <>{first} is on the Basic portal (Showroom only). The Standard portal adds their One Page Plan and Client Vault. It is charged to you monthly; {first} never sees the cost.</>}
            {lic.state === 'active' && <>The Standard portal is on{lic.period_end ? <>. Renews <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.period_end)}</strong></> : ''}{method}.</>}
            {lic.state === 'ending' && <>The Standard portal is on until <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.period_end)}</strong>, then {first} goes back to the Basic portal.</>}
            {lic.state === 'past_due' && <>The last payment failed and Stripe is retrying{method}. {first} keeps the Standard portal until the end of the month already paid for.</>}
          </p>
          {lic.state === 'basic' && justPaid && (
            <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>If you have just paid, refresh in a moment to see it on.</p>
          )}
          {lic.state === 'basic' && (
            <button onClick={() => licenceAction('member_ciq_licence_start')} disabled={licBusy || !hasLogin} style={{ ...btn, opacity: hasLogin ? 1 : 0.55, cursor: licBusy || !hasLogin ? 'not-allowed' : 'pointer' }}
              title={hasLogin ? undefined : 'Send portal access first'}>
              {licBusy ? 'Working…' : 'Turn on Standard portal'}
            </button>
          )}
          {lic.state === 'basic' && !hasLogin && <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '8px 0 0' }}>Send portal access first, so {first} can log in.</p>}
          {(lic.state === 'active' || lic.state === 'past_due') && (
            <button onClick={() => licenceAction('member_ciq_licence_stop')} disabled={licBusy} style={ghost}>{licBusy ? 'Working…' : 'Turn off'}</button>
          )}
          {lic.state === 'ending' && (
            <button onClick={() => licenceAction('member_ciq_licence_resume')} disabled={licBusy} style={ghost}>{licBusy ? 'Working…' : 'Keep it on'}</button>
          )}
          {licError && <p style={{ fontSize: '13px', marginTop: '10px', marginBottom: 0, color: '#d93025' }}>{licError}</p>}
        </div>
      )}
    </div>
  )
}
