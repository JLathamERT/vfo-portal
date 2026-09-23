import { useEffect, useRef, useState } from 'react'
import TokenShell from '../components/shared/TokenShell'
import TaxIntakeForm from '../components/member/TaxIntakeForm'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// PUBLIC page — the VFO Tax Diagnostic (replaces the Unbounce page). No login and
// no token: anyone can open it, a client for themselves or a member for their
// client. It takes no payment and creates nothing — every submission waits in the
// admin Tax Diagnostics queue until a person confirms the member.
//
// The 37 questions are the member intake's own (TaxIntakeForm in public mode);
// this page adds the three questions above them. The member question searches
// NAMES only (tax_diagnostic_member_search) and never sees a member number.
//
// Raw fetch rather than lib/api.js, like every other public page (the api helper
// attaches the portal session and its retry policy, neither of which applies).

const HEARD_FROM = ['Friend', 'Business partner', 'Social media', 'Post', 'Other']
const NONE_LABEL = 'No one / I heard about VFO elsewhere'
const MIN_LETTERS = 3

async function post(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default function TaxDiagnosticPage() {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  const [completedBy, setCompletedBy] = useState('')
  const [referrerName, setReferrerName] = useState('')
  const [referrerNone, setReferrerNone] = useState(false)
  const [heardFrom, setHeardFrom] = useState('')
  const [heardFromOther, setHeardFromOther] = useState('')
  const [website, setWebsite] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { ok, data } = await post({ action: 'tax_diagnostic_load' })
        if (!live) return
        if (!ok) { setError(data?.error || 'This form is not available.'); setStatus('error'); return }
        setStatus('form')
      } catch {
        if (!live) return
        setError('Unable to connect. Please try again later.')
        setStatus('error')
      }
    })()
    return () => { live = false }
  }, [])

  // A member must name themselves; "No one" is a client-only answer.
  function chooseCompletedBy(v) {
    setCompletedBy(v)
    if (v === 'member' && referrerNone) { setReferrerNone(false); setHeardFrom(''); setHeardFromOther('') }
  }

  function validatePrelude() {
    const found = []
    if (!completedBy) found.push('Who is completing this form? is required')
    if (completedBy === 'member' && !referrerName) found.push('Please choose your name from the member list')
    if (completedBy !== 'member' && !referrerName && !referrerNone) found.push(`Please choose the VFO member, or pick "${NONE_LABEL}"`)
    if (referrerNone && !heardFrom) found.push('How did you hear about us? is required')
    if (referrerNone && heardFrom === 'Other' && !heardFromOther.trim()) found.push('Please tell us how you heard about us')
    return found
  }

  async function submitAnswers(answers) {
    const { ok, data } = await post({
      action: 'tax_diagnostic_submit',
      completed_by: completedBy,
      referrer_name: referrerNone ? '' : referrerName,
      referrer_none: referrerNone,
      heard_from: referrerNone ? heardFrom : '',
      heard_from_other: referrerNone && heardFrom === 'Other' ? heardFromOther : '',
      website,
      answers,
    })
    if (!ok) throw new Error(data?.error || 'Something went wrong — please try again.')
    return data
  }

  if (status === 'loading') {
    return <TokenShell maxWidth={520}><Message icon="…" color="#0095ff" title="One moment" message="Loading the VFO Tax Diagnostic..." /></TokenShell>
  }
  if (status === 'error') {
    return <TokenShell maxWidth={520}><Message icon="!" color="#d93025" title="This form is not available" message={error} /></TokenShell>
  }
  if (status === 'thanks') {
    return <TokenShell maxWidth={520}><Message icon="✓" color="#16a34a" title="Thank you." message="Your VFO Tax Diagnostic has been received. The VFO Services team will be in touch shortly." /></TokenShell>
  }

  const labelStyle = { fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)', display: 'block', marginBottom: '6px', lineHeight: 1.45 }
  const hintStyle = { fontSize: '11.5px', color: 'var(--vfo-muted)', lineHeight: 1.55, marginTop: '-2px', marginBottom: '8px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const radioRow = { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer', lineHeight: 1.5 }
  const req = <span style={{ color: '#d93025' }}> *</span>

  const prelude = (
    <div style={{ display: 'grid', gap: '22px' }}>
      {/* Honeypot: invisible to people, tempting to bots. Filled => the server
          answers "thank you" and stores nothing. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
      </div>

      <div>
        <label style={labelStyle}>1. Who is completing this form?{req}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[['client', 'I am the client'], ['member', 'I am a VFO member completing this for my client']].map(([v, text]) => (
            <label key={v} style={radioRow}>
              <input type="radio" name="completed_by" checked={completedBy === v} onChange={() => chooseCompletedBy(v)} style={{ marginTop: '3px', flexShrink: 0 }} />
              <span>{text}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>2. Which VFO member is this client working with?{req}</label>
        <div style={hintStyle}>
          {completedBy === 'member'
            ? 'Start typing your name and choose it from the list.'
            : `Start typing the member's name and choose it from the list. If no member referred you, choose "${NONE_LABEL}".`}
        </div>
        <MemberPicker
          value={referrerName}
          none={referrerNone}
          allowNone={completedBy !== 'member'}
          inputStyle={inputStyle}
          onPick={name => { setReferrerName(name); setReferrerNone(false); setHeardFrom(''); setHeardFromOther('') }}
          onPickNone={() => { setReferrerName(''); setReferrerNone(true) }}
          onClear={() => { setReferrerName(''); setReferrerNone(false); setHeardFrom(''); setHeardFromOther('') }}
        />
      </div>

      {referrerNone && (
        <div>
          <label style={labelStyle}>3. How did you hear about us?{req}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {HEARD_FROM.map(opt => (
              <label key={opt} style={radioRow}>
                <input type="radio" name="heard_from" checked={heardFrom === opt} onChange={() => setHeardFrom(opt)} style={{ marginTop: '3px', flexShrink: 0 }} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {heardFrom === 'Other' && (
            <input type="text" value={heardFromOther} maxLength={200} onChange={e => setHeardFromOther(e.target.value)}
              placeholder="Please tell us where" style={{ ...inputStyle, marginTop: '8px' }} />
          )}
        </div>
      )}
    </div>
  )

  return (
    <TokenShell maxWidth={900}>
      <TaxIntakeForm
        publicMode
        publicIntake={null}
        onPublicSubmit={submitAnswers}
        onDone={() => setStatus('thanks')}
        prelude={prelude}
        validatePrelude={validatePrelude}
        numberOffset={referrerNone ? 3 : 2}
        title="VFO Tax Diagnostic"
        intro="Please answer the questions below about the client. There is nothing to pay on this form — the VFO Services team will review it and be in touch."
        submitLabel="Submit"
        allowTestFill={import.meta.env.DEV}
      />
    </TokenShell>
  )
}

// Type-ahead over member NAMES (like a country picker). Asks the server only once
// MIN_LETTERS letters are typed; the server caps and rate-limits it too.
function MemberPicker({ value, none, allowNone, inputStyle, onPick, onPickNone, onClear }) {
  const [q, setQ] = useState('')
  const [names, setNames] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    const letters = (q.match(/\p{L}/gu) || []).length
    if (letters < MIN_LETTERS) { setNames([]); setSearchError(''); return }
    const mine = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { ok, data } = await post({ action: 'tax_diagnostic_member_search', q })
        if (mine !== seq.current) return
        if (!ok) { setNames([]); setSearchError(data?.error || 'Search is unavailable — please try again.'); return }
        setSearchError('')
        setNames(Array.isArray(data?.names) ? data.names : [])
      } catch {
        if (mine === seq.current) { setNames([]); setSearchError('Search is unavailable — please try again.') }
      } finally {
        if (mine === seq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  if (value || none) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ padding: '8px 14px', borderRadius: '999px', background: 'rgba(18,94,204,0.10)', color: '#125ecc', fontSize: '13px', fontWeight: 600 }}>
          {none ? NONE_LABEL : value}
        </span>
        <button type="button" onClick={() => { onClear(); setQ(''); setOpen(true) }}
          style={{ padding: '6px 14px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
          Change
        </button>
      </div>
    )
  }

  const letters = (q.match(/\p{L}/gu) || []).length
  const optionStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'transparent', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
  return (
    <div style={{ position: 'relative' }}>
      <input type="text" value={q} autoComplete="off" placeholder="Type at least 3 letters of the name"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={inputStyle} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '10px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
          {letters < MIN_LETTERS && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>Keep typing — at least {MIN_LETTERS} letters.</div>
          )}
          {letters >= MIN_LETTERS && searching && names.length === 0 && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>Searching...</div>
          )}
          {letters >= MIN_LETTERS && !searching && !searchError && names.length === 0 && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>No member found with that name.</div>
          )}
          {searchError && <div style={{ padding: '9px 14px', fontSize: '12px', color: '#d93025' }}>{searchError}</div>}
          {names.map(n => (
            <button key={n} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onPick(n); setOpen(false) }} style={optionStyle}>{n}</button>
          ))}
          {allowNone && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onPickNone(); setOpen(false) }}
              style={{ ...optionStyle, borderTop: '1px solid var(--vfo-border-soft)', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>
              {NONE_LABEL}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Message({ icon, color, title, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '20' }}>
        <span style={{ fontSize: '32px', lineHeight: 1 }}>{icon}</span>
      </div>
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>{title}</h1>
      <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--vfo-muted)', margin: 0 }}>{message}</p>
    </div>
  )
}
