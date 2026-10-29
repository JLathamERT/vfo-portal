import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// Confirm stage for the money-moving decision pages (/tax-postreview-decide,
// /tax-implement-decide). Link-checking bots open these pages and click their
// buttons, so a click only emails the recipient a 6-digit code (decision_code_send);
// the decision is recorded when onSubmit(code) succeeds on the server.
// onSubmit resolves to { codeError } to keep the client here with a message;
// anything else means the page has moved on to its own result view.
export default function DecisionCodeCard({ kind, token, decision, title, message, buttonLabel, buttonColor, onSubmit, onExisting, onError }) {
  const [stage, setStage] = useState('intro')
  const [masked, setMasked] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendCode() {
    setBusy(true)
    setErr('')
    setInfo('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decision_code_send', kind, token, decision }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.existing_decision) { onExisting(data.existing_decision); return }
      if (!res.ok) {
        if (stage === 'intro') onError(data.error || 'We could not send your code.')
        else setErr(data.error || 'We could not send a new code.')
        return
      }
      setMasked(data.masked_email || '')
      if (stage === 'code') {
        setCode('')
        setInfo(data.throttled
          ? `A code was sent less than a minute ago. Please check your email, or try again in ${data.wait_seconds || 60} seconds.`
          : 'A new code has been sent.')
      }
      setStage('code')
    } catch {
      if (stage === 'intro') onError('Unable to connect. Please try again later.')
      else setErr('Unable to connect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setErr('')
    setInfo('')
    const result = await onSubmit(code)
    if (result?.codeError) {
      setErr(result.codeError)
      setBusy(false)
    }
  }

  if (stage === 'intro') {
    return (
      <div style={cardStyle}>
        <div className="vfo-statusicon" style={{ ...iconCircleStyle, background: buttonColor + '20' }}>
          <span style={{ fontSize: '32px', lineHeight: 1, fontWeight: 700, color: buttonColor }}>?</span>
        </div>
        <h1 style={titleStyle}>{title}</h1>
        <p style={messageStyle}>{message}</p>
        <p style={footerStyle}>To keep your engagement secure, we will email you a code to confirm this decision. Nothing is recorded until you enter that code. If you did not mean to open this link, you can simply close this page.</p>
        <button type="button" className="vfo-tokenbtn" onClick={sendCode} disabled={busy} style={{ ...buttonStyle, background: buttonColor, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Sending your code…' : 'Email me a code'}
        </button>
      </div>
    )
  }

  return (
    <form style={cardStyle} onSubmit={submit}>
      <div className="vfo-statusicon" style={{ ...iconCircleStyle, background: buttonColor + '20' }}>
        <span style={{ fontSize: '28px', lineHeight: 1, fontWeight: 700, color: buttonColor }}>@</span>
      </div>
      <h1 style={titleStyle}>Check your email</h1>
      <p style={messageStyle}>
        A code has been sent to your email address{masked ? <> <strong>{masked}</strong></> : ''}. Please enter the code that was sent to you to confirm your decision.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        aria-label="Confirmation code"
        style={inputStyle}
        autoFocus
      />
      {err && <p style={errStyle}>{err}</p>}
      {info && !err && <p style={footerStyle}>{info}</p>}
      <button type="submit" className="vfo-tokenbtn" disabled={busy || code.length !== 6} style={{ ...buttonStyle, background: buttonColor, opacity: busy || code.length !== 6 ? 0.6 : 1 }}>
        {busy ? 'Confirming… please keep this page open' : buttonLabel}
      </button>
      <p style={footerStyle}>
        The code expires in 15 minutes.{' '}
        <button type="button" onClick={sendCode} disabled={busy} style={linkStyle}>Send a new code</button>
      </p>
    </form>
  )
}

const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const messageStyle = { fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const footerStyle = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.6, marginTop: '16px' }
const errStyle = { fontSize: '14px', color: '#ef4444', lineHeight: 1.5, marginTop: '12px', fontWeight: 600 }
const buttonStyle = { marginTop: '24px', border: 'none', borderRadius: '8px', padding: '12px 28px', color: '#fff', fontWeight: 600, fontSize: '15px', fontFamily: 'inherit', cursor: 'pointer' }
const inputStyle = { marginTop: '20px', width: '200px', maxWidth: '100%', textAlign: 'center', fontSize: '28px', letterSpacing: '8px', fontWeight: 700, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontFamily: 'inherit' }
const linkStyle = { background: 'none', border: 'none', padding: 0, color: 'var(--vfo-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }
