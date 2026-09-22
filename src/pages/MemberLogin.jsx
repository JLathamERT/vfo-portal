import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { callApi, setSession } from '../lib/api'
import AuthShell from '../components/shared/AuthShell'
import LoginError from '../components/shared/LoginError'

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px' }
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' }

export default function MemberLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefilledEmail = location.state?.email || ''
  const fromSetup = !!location.state?.fromSetup
  const [email, setEmail] = useState(prefilledEmail)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const emailRef = useRef(null)
  const passRef = useRef(null)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const emailVal = (email || emailRef.current?.value || '').trim()
      const passVal = passcode || (passRef.current?.value ?? '')
      const data = await callApi('member_login', { email: emailVal, passcode: passVal })
      sessionStorage.removeItem('memberActiveTab')
      setSession({ token: data.token, email: emailVal, name: data.name, role: 'member', member_number: data.member_number, website_enabled: data.website_enabled })
      navigate('/member')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <p style={{ fontSize: '11.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', margin: '0 0 10px' }}>Member Portal</p>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', marginTop: 0, marginBottom: '8px', fontSize: '28px' }}>Sign in</h2>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '28px' }}>Welcome back — enter your member credentials.</p>
      {fromSetup && <p style={{ color: '#16a34a', fontWeight: 500, fontSize: '13px', marginBottom: '16px', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: '10px', padding: '10px 14px' }}>Login created. Sign in with your new passcode.</p>}
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input ref={emailRef} id="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Passcode</label>
          <input ref={passRef} id="password" name="password" autoComplete="current-password" value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="••••••••" type="password" required style={inputStyle} />
        </div>
        <LoginError message={error} portalLabel="Member" />
        <button type="submit" disabled={loading} style={{ padding: '13px', borderRadius: '10px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 4px 14px rgba(18,94,204,0.35)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}>{loading ? 'Signing in...' : 'Sign In'}</button>
      </form>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '20px', textAlign: 'center', cursor: 'pointer' }} onClick={()=>navigate('/forgot-password?type=member')}>Forgot passcode?</p>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '10px', textAlign: 'center', cursor: 'pointer' }} onClick={()=>navigate('/')}>← Back to portal selection</p>
    </AuthShell>
  )
}