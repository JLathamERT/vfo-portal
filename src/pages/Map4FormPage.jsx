import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TokenFormSkeleton } from '../components/shared/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const EMPTY = { q1_meeting: '', q2_concerns: '', q3_moving_forward: '', q4_yes_facilitate: '', q4_no_feedback: '' }

// Public token page for the MAP 4 Meeting Follow-Up form (linked from the CRON
// follow-up email). Same layout as the Specialist SIF form. Q4 swaps based on the
// Q3 Yes/No answer. Loads context (PF name, meeting date) via the token.
export default function Map4FormPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState('loading') // loading | valid | invalid | success
  // specialist_name is who actually ran the meeting; pf_name stays for anything
  // that is genuinely about the client's PF.
  const [ctx, setCtx] = useState({ client_first: '', pf_name: 'your VFO Services team', specialist_name: 'your VFO Specialist', priority_name: '', meeting_date: null })
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    if (!token) { setState('invalid'); return }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_REGULAR_loadmap4form', token }),
      })
      const data = await res.json()
      if (!res.ok || data.state === 'invalid') { setState('invalid'); return }
      setCtx({
        client_first: data.client_first || '',
        pf_name: data.pf_name || 'your VFO Services team',
        specialist_name: data.specialist_name || 'your VFO Specialist',
        priority_name: data.priority_name || '',
        meeting_date: data.meeting_date || null,
      })
      if (data.data) setForm({ ...EMPTY, ...data.data })
      setState(data.state === 'submitted' ? 'success' : 'valid')
    } catch { setState('invalid') }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function fmtDate(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }

  async function submit() {
    const REQUIRED = ['q1_meeting', 'q2_concerns', 'q3_moving_forward']
    if (form.q3_moving_forward === 'Yes') REQUIRED.push('q4_yes_facilitate')
    if (form.q3_moving_forward === 'No') REQUIRED.push('q4_no_feedback')
    if (REQUIRED.some(k => !String(form[k] || '').trim())) {
      setError('Please complete all required fields (marked with *).')
      return
    }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_REGULAR_submitmap4form', token, form }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Something went wrong. Please try again.'); setSubmitting(false); return }
      setState('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('Unable to connect. Please try again later.'); setSubmitting(false) }
  }

  if (state === 'loading') {
    return (
      <div style={{ ...pageStyle, alignItems: 'center' }}>
        <div style={{ maxWidth: '480px', width: '100%', padding: '48px 32px' }}><TokenFormSkeleton /></div>
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div style={{ ...pageStyle, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#ef444420', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <span style={{ fontSize: '32px', lineHeight: 1 }}>⚠️</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }}>Link Not Valid</h1>
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>This form link is invalid or has expired. Please contact your VFO representative for a new link.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div style={{ ...pageStyle, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#16a34a20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <span style={{ fontSize: '32px', lineHeight: 1 }}>✓</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }}>Thank You!</h1>
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>Your feedback has been submitted. Our team will be in touch shortly.</p>
        </div>
      </div>
    )
  }

  const meetingStr = fmtDate(ctx.meeting_date)
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '28px', color: 'var(--vfo-ink)', marginBottom: '6px' }}>VFO Specialist Meeting Follow-Up</div>
          <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Let us know how your meeting went{ctx.priority_name ? ` — ${ctx.priority_name}` : ''}</div>
        </div>

        <SectionLabel n="1" required>How was your meeting with {ctx.specialist_name}{meetingStr ? ` on ${meetingStr}` : ''}?</SectionLabel>
        <Area value={form.q1_meeting} onChange={v => set('q1_meeting', v)} />

        <SectionLabel n="2" required>Do you have any questions or concerns?</SectionLabel>
        <Area value={form.q2_concerns} onChange={v => set('q2_concerns', v)} />

        <SectionLabel n="3" required>Are you moving forward to implement with the Specialist?</SectionLabel>
        <SelectField value={form.q3_moving_forward} onChange={v => set('q3_moving_forward', v)} options={['Yes', 'No']} />

        {form.q3_moving_forward === 'Yes' && (
          <>
            <SectionLabel n="4" required>If yes, please let us know if we can facilitate the next steps with the Specialist.</SectionLabel>
            <Area value={form.q4_yes_facilitate} onChange={v => set('q4_yes_facilitate', v)} />
          </>
        )}
        {form.q3_moving_forward === 'No' && (
          <>
            <SectionLabel n="4" required>If no, do you have any feedback you can share with us? Additionally, would you like to explore some other solutions / VFO Specialists?</SectionLabel>
            <Area value={form.q4_no_feedback} onChange={v => set('q4_no_feedback', v)} />
          </>
        )}

        {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>{error}</div>}

        <button onClick={submit} disabled={submitting} style={{ marginTop: '24px', width: '100%', padding: '14px', borderRadius: '8px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          {submitting ? 'Submitting…' : 'Submit Form'}
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ n, children, required }) {
  return <div style={{ fontSize: '13px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '28px 0 12px', borderTop: '1px solid var(--vfo-tint-deep)', paddingTop: '20px' }}>{n}. {children}{required && <span style={{ color: '#d93025' }}> *</span>}</div>
}

function SelectField({ label, value, onChange, options, hint, required }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      {label && <label style={labelStyle}>{label}{required && <span style={{ color: '#d93025' }}> *</span>}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="" style={{ background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }}>-- Select --</option>
        {options.map(o => <option key={o} value={o} style={{ background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }}>{o}</option>)}
      </select>
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

function Area({ value, onChange, hint, label, required }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      {label && <label style={labelStyle}>{label}{required && <span style={{ color: '#d93025' }}> *</span>}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

const pageStyle = {
  fontFamily: '"Inter", sans-serif',
  background: 'var(--vfo-card)',
  minHeight: '100vh',
  padding: '40px 20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
}

const cardStyle = {
  width: '100%',
  maxWidth: '720px',
  background: 'var(--vfo-tint)',
  border: '1px solid var(--vfo-tint-deep)',
  borderRadius: '16px',
  padding: '36px 40px',
}

const labelStyle = { display: 'block', fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '6px' }
const hintStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '5px', fontStyle: 'italic', lineHeight: 1.5 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }
