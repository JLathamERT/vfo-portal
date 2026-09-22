import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/shared/AuthShell'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// Self-service "forgot passcode" page. ?type= carries which portal the person
// came from (never admin) — the backend needs it to know which *_logins table to
// look in. The confirmation is deliberately identical whether or not the address
// matches an account, including when the API call itself fails: this page must
// never reveal that an account exists.
const PORTAL = {
  member: { label: 'Member', login: '/member/login' },
  specialist: { label: 'Specialist', login: '/specialist/login' },
  client: { label: 'Client', login: '/client/login' },
  tax_planner: { label: 'Tax Planner', login: '/tax-planner/login' },
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px' }
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' }

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const loginType = searchParams.get('type') || ''
  const portal = PORTAL[loginType] || null
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!portal) return
    setLoading(true)
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_password_reset', login_type: loginType, email: (email || '').trim() }),
      })
    } catch {
      // Swallowed on purpose — the confirmation below is the same either way.
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  return (
    <AuthShell>
      <p style={{ fontSize: '11.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', margin: '0 0 10px' }}>{portal ? `${portal.label} Portal` : 'VFO Portal'}</p>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', marginTop: 0, marginBottom: '8px', fontSize: '28px' }}>Reset your passcode</h2>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: portal ? '16px' : '28px' }}>Enter the email address on your account and we'll send you a link to choose a new passcode.</p>
      {/* The four portals each hold their own passcode, and people land on the wrong
          one. Naming the portal here — BEFORE they type — is the part of that fix
          the person can see; the backend's silent cross-portal fallback is the other
          half, and it deliberately never says which portal matched. */}
      {portal && (
        <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', lineHeight: 1.6, marginTop: 0, marginBottom: '28px', padding: '12px 14px', borderRadius: '10px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)' }}>
          This resets your <strong style={{ color: 'var(--vfo-ink)' }}>{portal.label}</strong> passcode.{' '}
          {Object.values(PORTAL).filter(p => p.label !== portal.label).map(p => p.label).join(', ')} accounts sign in separately —{' '}
          <span onClick={() => navigate('/')} style={{ color: '#0a85e8', fontWeight: 600, cursor: 'pointer' }}>choose your portal</span>.
        </p>
      )}
      {sent ? (
        <p style={{ color: '#16a34a', fontWeight: 500, fontSize: '13px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: '10px', padding: '12px 14px', margin: 0, lineHeight: 1.6 }}>If an account exists for that email, a reset link is on its way. It expires in 1 hour.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input id="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" required style={inputStyle} />
          </div>
          {!portal && <p style={{ color: 'var(--vfo-muted)', fontWeight: 500, fontSize: '13px', margin: 0 }}>We couldn't tell which portal you're resetting. Go back to your portal's sign-in page and use the "Forgot passcode?" link there.</p>}
          <button type="submit" disabled={loading || !portal} style={{ padding: '13px', borderRadius: '10px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 4px 14px rgba(18,94,204,0.35)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: (loading || !portal) ? 'not-allowed' : 'pointer', opacity: (loading || !portal) ? 0.6 : 1, marginTop: '4px' }}>{loading ? 'Sending...' : 'Send reset link'}</button>
        </form>
      )}
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '20px', textAlign: 'center', cursor: 'pointer' }} onClick={()=>navigate(portal ? portal.login : '/')}>← Back to sign in</p>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '10px', textAlign: 'center', cursor: 'pointer' }} onClick={()=>navigate('/')}>← Back to portal selection</p>
    </AuthShell>
  )
}
