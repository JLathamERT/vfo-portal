import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TokenFormSkeleton } from '../components/shared/Skeleton'
import { useIsPhone } from '../lib/useMediaQuery'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// Generic, on-demand login-setup page (Feature B). One page for all login
// types — the token (login_setup_tokens) carries whether the person is a member,
// specialist, client, or tax planner, and we route them to the right portal after.
// It also serves PASSWORD RESETS: a token minted by request_password_reset (1h,
// created_by='self-service') is indistinguishable here from an admin-sent 14-day
// setup token, and deliberately so. Fields carry autoComplete metadata so a
// password manager can update the saved entry rather than re-fill the old one
// (gotcha #354).
const PORTAL = {
  member: { label: 'Member', login: '/member/login' },
  specialist: { label: 'Specialist', login: '/specialist/login' },
  client: { label: 'Client', login: '/client/login' },
  tax_planner: { label: 'Tax Planner', login: '/tax-planner/login' },
}

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [loginType, setLoginType] = useState('member')
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Phone: the message sits on the page gutter, not 32px inside it as well.
  const isPhone = useIsPhone()
  const messageCard = isPhone ? { ...messageCardStyle, padding: '24px 0' } : messageCardStyle

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setError('Invalid setup link — missing token.'); setStatus('error'); return }
    load(token)
  }, [])

  async function call(action, payload) {
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
    return res.json()
  }

  async function load(token) {
    try {
      const d = await call('load_login_setup', { token })
      if (d.state === 'ok') { setData(d); setLoginType(d.login_type || 'member'); setStatus('ready'); return }
      if (d.state === 'already_setup') { setLoginType(d.login_type || 'member'); setStatus('already_setup'); return }
      setError(d.error || 'This setup link is no longer valid.'); setStatus('error')
    } catch {
      setError('Unable to connect. Please try again later.'); setStatus('error')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if (passcode.length < 6) { setError('Passcode must be at least 6 characters.'); return }
    if (passcode !== confirm) { setError('Passcodes do not match.'); return }
    setSubmitting(true)
    try {
      const d = await call('submit_login_setup', { token: searchParams.get('token'), passcode })
      if (d.success) {
        const path = (PORTAL[d.login_type] || PORTAL.member).login
        navigate(path, { state: { email: data?.email, fromSetup: true } })
        return
      }
      if (d.state === 'already_setup') { setStatus('already_setup'); return }
      setError(d.error || 'Something went wrong. Please try again.')
    } catch {
      setError('Unable to connect. Please try again later.')
    } finally { setSubmitting(false) }
  }

  const portal = PORTAL[loginType] || PORTAL.member

  if (status === 'loading') return (
    <div style={containerStyle}><TokenFormSkeleton /></div>
  )
  if (status === 'error') return (
    <div style={containerStyle}>
      <div style={messageCard}>
        <h1 style={titleStyle}>Setup Link Error</h1>
        <p style={subtitleStyle}>{error}</p>
      </div>
    </div>
  )
  if (status === 'already_setup') return (
    <div style={containerStyle}>
      <div style={messageCard}>
        <h1 style={titleStyle}>Login Already Set Up</h1>
        <p style={subtitleStyle}>You already have a login for the {portal.label.toLowerCase()} portal. Click below to sign in.</p>
        <button className="vfo-tokenbtn" onClick={() => navigate(portal.login)} style={primaryButtonStyle}>Go to Login</button>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={pageContainerStyle}>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '32px' }}>Set Up Your {portal.label} Portal Access</h1>
        <form onSubmit={handleSubmit} style={formStyle}>
          <label style={labelStyle}>Email</label>
          <input id="email" name="email" autoComplete="username" type="email" value={data?.email || ''} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
          <label style={{ ...labelStyle, marginTop: '16px' }}>Passcode (min 6 characters)</label>
          <input id="new-password" name="new-password" value={passcode} onChange={e => setPasscode(e.target.value)} type="password" autoComplete="new-password" required minLength={6} style={inputStyle} />
          <label style={{ ...labelStyle, marginTop: '16px' }}>Confirm Passcode</label>
          <input id="confirm-password" name="confirm-password" value={confirm} onChange={e => setConfirm(e.target.value)} type="password" autoComplete="new-password" required minLength={6} style={inputStyle} />
          {error && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '12px', marginBottom: 0 }}>{error}</p>}
          <button type="submit" className="vfo-tokenbtn" disabled={submitting} style={{ ...primaryButtonStyle, marginTop: '24px', opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Setting up…' : 'Set up my login'}</button>
        </form>
        <p style={securityNoteStyle}>After setup, you'll be taken to the {portal.label.toLowerCase()} login page to sign in with your new passcode.</p>
      </div>
    </div>
  )
}

const containerStyle = { fontFamily: '"Inter", sans-serif', background: 'var(--vfo-card)', color: 'var(--vfo-ink-2)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const pageContainerStyle = { maxWidth: '480px', width: '100%' }
const messageCardStyle = { textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const formStyle = { display: 'flex', flexDirection: 'column' }
const labelStyle = { fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '6px', fontWeight: 500 }
const inputStyle = { padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'inherit' }
const primaryButtonStyle = { padding: '12px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '16px' }
const securityNoteStyle = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6 }
