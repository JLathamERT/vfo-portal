import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// Public, no-login page reached from the 4 "Set Up Payment Details" payout emails
// (members, specialists, strategic groups, tax planning groups). The link is
// durable — on every visit the backend mints a FRESH Stripe account-onboarding
// link and we redirect to it, so a second click never dead-ends. Stripe's own
// mid-flow expiry loops back here (refresh_url) and gets a new link. We never see
// any bank/card details.
//
// Stripe sends people back here (?token=…&done=1) whenever they LEAVE onboarding,
// finished or not, so `done` is never taken as success: the page asks
// connect_setup_status for the account's real state (2026-10-01). A `done` with no
// token is a return from a link minted before that change — nothing to check, so the
// page stays neutral rather than claiming success.
export default function PayoutSetupPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const justDone = searchParams.get('done') === '1'
  const [status, setStatus] = useState(!token ? (justDone ? 'returned' : 'error') : (justDone ? 'checking' : 'redirecting'))
  const [error, setError] = useState(token || justDone ? '' : 'This setup link is not valid. Please contact VFO Services for a new link.')
  const [missing, setMissing] = useState([])

  useEffect(() => {
    if (!token) return
    if (justDone) check(token)
    else go(token)
  }, [])

  async function go(tok) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect_setup_link', token: tok }),
      })
      const d = await res.json()
      if (d.url) { window.location.replace(d.url); return }
      setError(d.error || 'This setup link is not valid. Please contact VFO Services for a new link.')
      setStatus('error')
    } catch {
      setError('Could not start the setup. Please try again.')
      setStatus('error')
    }
  }

  async function check(tok) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect_setup_status', token: tok }),
      })
      const d = await res.json()
      if (d.error) { setError(d.error); setStatus('error'); return }
      setMissing(Array.isArray(d.missing) ? d.missing : [])
      setStatus(['complete', 'verifying', 'incomplete'].includes(d.state) ? d.state : 'returned')
    } catch {
      setStatus('returned')
    }
  }

  if (status === 'complete') return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>✓</span></div>
        <h1 style={titleStyle}>You're all set</h1>
        <p style={subtitleStyle}>Your payout details are complete and verified by Stripe. Payments to you can now be sent. You can close this page.</p>
      </div>
    </TokenShell>
  )

  if (status === 'verifying') return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: 'rgba(0,149,255,0.12)' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>⏳</span></div>
        <h1 style={titleStyle}>Submitted — Stripe is verifying your details</h1>
        <p style={subtitleStyle}>You have entered everything Stripe asked for. Stripe is now checking it, which usually takes a few minutes and occasionally a day or two. If Stripe needs anything else, open the link in your setup email again.</p>
      </div>
    </TokenShell>
  )

  if (status === 'incomplete') return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: 'rgba(214,158,46,0.15)', color: '#b7791f' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>!</span></div>
        <h1 style={titleStyle}>Setup not finished yet</h1>
        <p style={subtitleStyle}>Your payout setup with Stripe is not complete, so payments cannot be sent to you yet.{missing.length > 0 ? ' Stripe still needs:' : ''}</p>
        {missing.length > 0 && (
          <ul style={listStyle}>
            {missing.map(m => <li key={m} style={{ padding: '3px 0' }}>{m}</li>)}
          </ul>
        )}
        <button type="button" onClick={() => go(token)} style={buttonStyle}>Continue setup</button>
        <p style={tipStyle}>
          <strong>Tip:</strong> at the bank account step, if signing in to your bank fails or Stripe says you have tried too many times, choose <strong>"Enter bank details manually"</strong> and type your routing and account numbers instead. Then click through to the final screen and accept Stripe's terms to finish.
        </p>
      </div>
    </TokenShell>
  )

  if (status === 'returned') return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Thanks — you've left Stripe's setup</h1>
        <p style={subtitleStyle}>If you finished every step, including adding a bank account and accepting Stripe's terms on the last screen, there is nothing more to do. If Stripe stopped you or you left early, open the link in your setup email again to continue where you left off.</p>
      </div>
    </TokenShell>
  )

  if (status === 'error') return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Something went wrong</h1>
        <p style={subtitleStyle}>{error}</p>
        <p style={{ ...subtitleStyle, marginTop: '10px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          If you keep seeing this message, reply to the setup email and we will send you a fresh link.
        </p>
      </div>
    </TokenShell>
  )

  return (
    <TokenShell>
      <p style={centerMuted}>{status === 'checking' ? 'Checking your setup with Stripe...' : "Taking you to Stripe's secure payment setup..."}</p>
    </TokenShell>
  )
}

const centerMuted = { color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }
const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontWeight: 800 }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)', margin: 0, lineHeight: 1.55 }
const listStyle = { textAlign: 'left', display: 'inline-block', margin: '12px auto 0', paddingLeft: '20px', fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }
const buttonStyle = { display: 'block', margin: '22px auto 0', padding: '14px 32px', borderRadius: '10px', border: 'none', background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const tipStyle = { fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '20px', lineHeight: 1.55, textAlign: 'left', background: 'var(--vfo-tint)', padding: '12px 14px', borderRadius: '10px' }
