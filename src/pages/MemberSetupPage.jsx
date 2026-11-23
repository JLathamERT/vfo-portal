import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SetupFormSkeleton } from '../components/shared/Skeleton'
import PasswordInput from '../components/shared/PasswordInput'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function MemberSetupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  // Which onboarding pipeline matched the token — used to pick the matching
  // submit action. 'advisor' if the token lives in advisor_onboarding,
  // 'accountant' if it lives in accountant_onboarding.
  const [kind, setKind] = useState(null)
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setError('Invalid setup link — missing token.'); setStatus('error'); return }
    loadSetup(token)
  }, [])

  async function loadSetup(token) {
    // Try advisor first; if invalid, fall through to accountant. Either way
    // remember which pipeline matched so submit fires the right action.
    try {
      const advRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_ADVISOR_loadloginsetup', token }),
      })
      const advData = await advRes.json()
      if (advData.state === 'ready') { setData(advData); setKind('advisor'); setStatus('ready'); return }
      if (advData.state === 'already_setup') { setKind('advisor'); setStatus('already_setup'); return }

      // Advisor table didn't match — try accountant.
      const acctRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_ACCOUNTANT_loadloginsetup', token }),
      })
      const acctData = await acctRes.json()
      if (acctData.state === 'ready') { setData(acctData); setKind('accountant'); setStatus('ready'); return }
      if (acctData.state === 'already_setup') { setKind('accountant'); setStatus('already_setup'); return }

      // Accountant didn't match either — try specialist (separate portal).
      const specRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_SPECIALIST_loadloginsetup', token }),
      })
      const specData = await specRes.json()
      if (specData.state === 'ready') { setData({ ...specData, email: specData.email }); setKind('specialist'); setStatus('ready'); return }
      if (specData.state === 'already_setup') { setKind('specialist'); setStatus('already_setup'); return }

      // None of the tables had the token.
      setError(specData.error || acctData.error || advData.error || 'This setup link is no longer valid.')
      setStatus('error')
    } catch {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (passcode.length < 6) { setError('Passcode must be at least 6 characters.'); return }
    if (passcode !== confirm) { setError('Passcodes do not match.'); return }

    setSubmitting(true)
    try {
      const action = kind === 'specialist'
        ? 'automation_SPECIALIST_submitloginsetup'
        : kind === 'accountant'
        ? 'automation_ACCOUNTANT_submitloginsetup'
        : 'automation_ADVISOR_submitloginsetup'
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          token: searchParams.get('token'),
          passcode,
        }),
      })
      const d = await res.json()
      if (d.success) {
        const loginPath = kind === 'specialist' ? '/specialist/login' : '/member/login'
        navigate(loginPath, { state: { email: d.email, fromSetup: true } })
        return
      }
      if (d.state === 'already_setup') { setStatus('already_setup'); return }
      setError(d.error || 'Something went wrong. Please try again.')
    } catch {
      setError('Unable to connect. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  const portalLabel = kind === 'specialist' ? 'Specialist' : 'Member'
  const loginPath = kind === 'specialist' ? '/specialist/login' : '/member/login'

  if (status === 'loading') return (
    <div style={containerStyle}>
      <SetupFormSkeleton />
    </div>
  )

  if (status === 'error') return (
    <div style={containerStyle}>
      <div style={messageCardStyle}>
        <div style={{ ...iconCircleStyle, background: '#ef444420' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>⚠️</span>
        </div>
        <h1 style={titleStyle}>Setup Link Error</h1>
        <p style={subtitleStyle}>{error}</p>
      </div>
    </div>
  )

  if (status === 'already_setup') return (
    <div style={containerStyle}>
      <div style={messageCardStyle}>
        <div style={{ ...iconCircleStyle, background: 'rgba(0,149,255,0.20)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>ℹ️</span>
        </div>
        <h1 style={titleStyle}>Login Already Set Up</h1>
        <p style={subtitleStyle}>You already have a login for the {portalLabel.toLowerCase()} portal. Click below to sign in.</p>
        <button
          onClick={() => navigate(loginPath)}
          style={primaryButtonStyle}
        >
          Go to Login
        </button>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={pageContainerStyle}>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '32px' }}>Set Up Your {portalLabel} Portal Login</h1>

        <form onSubmit={handleSubmit} style={formStyle}>
          <label style={labelStyle}>Email</label>
          <input value={data.email} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />

          <label style={{ ...labelStyle, marginTop: '16px' }}>Passcode (min 6 characters)</label>
          <PasswordInput
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: '16px' }}>Confirm Passcode</label>
          <PasswordInput
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            style={inputStyle}
          />

          {error && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '12px', marginBottom: 0 }}>{error}</p>}

          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, marginTop: '24px', opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Setting up…' : 'Set up my login'}
          </button>
        </form>

        <p style={securityNoteStyle}>
          After setup, you'll be taken to the {portalLabel.toLowerCase()} login page to sign in with your new passcode.
        </p>
      </div>
    </div>
  )
}

const containerStyle = { fontFamily: '"Inter", sans-serif', background: 'var(--vfo-card)', color: 'var(--vfo-ink-2)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }
const pageContainerStyle = { maxWidth: '480px', width: '100%' }
const messageCardStyle = { textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const formStyle = { display: 'flex', flexDirection: 'column' }
const labelStyle = { fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '6px', fontWeight: 500 }
const inputStyle = { padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'inherit' }
const primaryButtonStyle = { padding: '12px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '16px' }
const securityNoteStyle = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6 }
