import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TokenFormSkeleton } from '../components/shared/Skeleton'
import PasswordInput from '../components/shared/PasswordInput'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function ClientSetupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('loading') // loading | ready | already_setup | invalid
  const [data, setData] = useState(null)
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    if (!token) { setStatus('invalid'); return }
    try {
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load_client_setup', token }),
      })
      const d = await res.json()
      if (d.state === 'ready') { setData(d); setStatus('ready') }
      else if (d.state === 'already_setup') { setStatus('already_setup') }
      else { setStatus('invalid') }
    } catch { setStatus('invalid') }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (passcode.length < 6) { setError('Passcode must be at least 6 characters.'); return }
    if (passcode !== confirm) { setError('Passcodes do not match.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_client_setup', token, passcode }),
      })
      const d = await res.json()
      if (d.success) { navigate('/client/login', { state: { email: d.email, fromSetup: true } }) }
      else if (d.state === 'already_setup') { setStatus('already_setup') }
      else { setError(d.error || 'Could not create login') }
    } catch { setError('Something went wrong. Please try again.') }
    finally { setSubmitting(false) }
  }

  const wrap = { minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--vfo-page)',fontFamily:'Inter, sans-serif' }
  const card = { background:'var(--vfo-card)',padding:'40px',borderRadius:'16px',width:'380px',border:'1px solid var(--vfo-border)',color:'var(--vfo-ink)' }
  const input = { padding:'10px 14px',borderRadius:'8px',border:'1px solid var(--vfo-border-strong)',background:'var(--vfo-input)',color:'var(--vfo-ink)',fontSize:'14px',width:'100%',boxSizing:'border-box' }

  if (status === 'loading') return <div style={wrap}><div style={card}><TokenFormSkeleton /></div></div>
  if (status === 'invalid') return <div style={wrap}><div style={card}>This setup link is invalid or has expired. Please contact us for a new one.</div></div>
  if (status === 'already_setup') return <div style={wrap}><div style={card}><p>Your login is already set up.</p><button onClick={()=>navigate('/client/login')} style={{...input,background:'#125ecc',cursor:'pointer',marginTop:'12px'}}>Go to login</button></div></div>

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{fontFamily:'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em',marginBottom:'6px',fontSize:'23px'}}>Set Up Your Portal Login</h2>
        <p style={{color:'var(--vfo-muted)',fontSize:'13px',marginBottom:'20px'}}>{data?.client_name} · {data?.email}</p>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'12px'}}>
          <PasswordInput value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="Choose a passcode (min 6 chars)" required style={input} />
          <PasswordInput value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm passcode" required style={input} />
          {error && <p style={{color:'#d93025', fontWeight: 500,fontSize:'13px',margin:0}}>{error}</p>}
          <button type="submit" disabled={submitting} style={{...input,background:'#125ecc',cursor:'pointer',fontWeight:500,marginTop:'4px'}}>{submitting ? 'Creating…' : 'Create Login'}</button>
        </form>
      </div>
    </div>
  )
}
