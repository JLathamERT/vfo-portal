import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, setSession } from '../lib/api'
import AuthShell from '../components/shared/AuthShell'
import { PhoneNoticeGate } from '../components/shared/PhoneNotReady'

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px' }
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' }

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
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
      const data = await callApi('admin_login', { email: emailVal, passcode: passVal })
      sessionStorage.removeItem('adminActiveTab')
      sessionStorage.removeItem('adminAdvisorsSection')
      sessionStorage.removeItem('adminAccountantsSection')
      sessionStorage.removeItem('adminMembersSection')
      sessionStorage.removeItem('adminSelectedMember')
      sessionStorage.removeItem('adminMemberFeatureTab')
      // NOTE: this object is an explicit WHITELIST, not a copy of the login
      // response — a new server-side session field is invisible to the app until
      // it is added here by name. is_ert_manager was added 2026-08-13.
      setSession({ token: data.token, email: emailVal, name: data.name, role: 'admin', is_superadmin: data.is_superadmin, is_ert_manager: data.is_ert_manager, allowed_tabs: data.allowed_tabs || [] })
      const next = new URLSearchParams(window.location.search).get('next')
      navigate(next && next.startsWith('/admin/') ? next : '/admin')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <PhoneNoticeGate portal="admin">
      <p style={{ fontSize: '11.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', margin: '0 0 10px' }}>VFOS / ERT Portal</p>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', marginTop: 0, marginBottom: '8px', fontSize: '28px' }}>Sign in</h2>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '28px' }}>Welcome back — enter your admin credentials.</p>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input ref={emailRef} id="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@elitert.com" type="email" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Passcode</label>
          <input ref={passRef} id="password" name="password" autoComplete="current-password" value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="••••••••" type="password" required style={inputStyle} />
        </div>
        {error && <p style={{color:'#d93025', fontWeight: 500, fontSize:'13px', margin:'0'}}>{error}</p>}
        <button type="submit" disabled={loading} style={{ padding: '13px', borderRadius: '10px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 4px 14px rgba(18,94,204,0.35)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' }}>{loading ? 'Signing in...' : 'Sign In'}</button>
      </form>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '20px', textAlign: 'center' }}>Are you a Tax Planner? <span style={{ color: '#0a85e8', fontWeight: 600, cursor: 'pointer' }} onClick={()=>navigate('/tax-planner/login')}>Sign in here</span></p>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '10px', textAlign: 'center', cursor: 'pointer' }} onClick={()=>navigate('/')}>← Back to portal selection</p>
      </PhoneNoticeGate>
    </AuthShell>
  )
}