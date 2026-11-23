import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PublicFormSkeleton } from '../components/shared/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const EMPTY = {
  // Part 1
  business_name: '', firm_ownership_length: '', firm_goals: '',
  // Part 2
  est_current_gross_revenue: '', last_year_gross_revenue: '',
  current_year_clients: '', last_year_clients: '',
  est_current_hours_billed: '', last_year_hours_billed: '',
  current_year_billable_employees: '', last_year_billable_employees: '',
  current_year_total_employees: '', last_year_total_employees: '',
  pct_business_owners: '', pct_nonbusiness_owners: '',
  pct_traditional_services: '', pct_nontraditional: '',
  pct_billed_hourly: '', pct_billed_flat_value: '',
  // Part 3
  strengths: '', challenges: '', hours_per_week: '', work_life_balance: '',
  satisfied_with_money: '', improve_opportunities: '', compelling_reason: '',
  best_describes_you: '', referral_team: '', resource_usage_frequency: '',
  benefit_financially: '', magic_wand: '',
}

// Everything is required except firm_ownership_length.
const OPTIONAL = ['firm_ownership_length']
const REQUIRED = Object.keys(EMPTY).filter(k => !OPTIONAL.includes(k))

export default function PftDiscoveryPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState('loading') // loading | valid | invalid | success
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
        body: JSON.stringify({ action: 'automation_PFT_loaddiscovery', token }),
      })
      const data = await res.json()
      if (!res.ok || data.state === 'invalid') { setState('invalid'); return }
      setForm({ ...EMPTY, ...(data.data || {}) })
      setState('valid')
    } catch { setState('invalid') }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit() {
    if (REQUIRED.some(k => !String(form[k] || '').trim())) {
      setError('Please complete all required fields (marked with *).')
      return
    }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_PFT_submitdiscovery', token, discovery: form }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Something went wrong. Please try again.'); setSubmitting(false); return }
      setState('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('Unable to connect. Please try again later.'); setSubmitting(false) }
  }

  if (state === 'loading') {
    return <div style={pageStyle}><PublicFormSkeleton /></div>
  }

  if (state === 'invalid') {
    return (
      <div style={{ ...pageStyle, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#ef444420', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}><span style={{ fontSize: '32px', lineHeight: 1 }}>⚠️</span></div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }}>Link Not Valid</h1>
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>This discovery form link is invalid or has expired. Please contact your VFO representative for a new link.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div style={{ ...pageStyle, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#16a34a20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}><span style={{ fontSize: '32px', lineHeight: 1 }}>✓</span></div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }}>Thank You!</h1>
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>Your discovery form has been submitted. We'll review it ahead of your next meeting and be in touch shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '28px', color: 'var(--vfo-ink)', marginBottom: '6px' }}>VFO Partnership Fast Track</div>
          <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Discovery Form</div>
        </div>

        <SectionLabel>Part 1</SectionLabel>
        <Field label="Business Name" value={form.business_name} onChange={v => set('business_name', v)} required />
        <Field label="How long have you owned your firm?" value={form.firm_ownership_length} onChange={v => set('firm_ownership_length', v)} />
        <Area label="What are your goals for your firm? Please be specific." value={form.firm_goals} onChange={v => set('firm_goals', v)} required />

        <SectionLabel>Part 2</SectionLabel>
        <div style={rowStyle}>
          <Field label="Est Current Full Year - $ Gross Revenue" value={form.est_current_gross_revenue} onChange={v => set('est_current_gross_revenue', v)} flex required />
          <Field label="Last Year - $ Gross Revenue" value={form.last_year_gross_revenue} onChange={v => set('last_year_gross_revenue', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="Current Year - # Clients" value={form.current_year_clients} onChange={v => set('current_year_clients', v)} flex required />
          <Field label="Last Year - # Clients" value={form.last_year_clients} onChange={v => set('last_year_clients', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="EST Current Full Year - # Hours Billed" value={form.est_current_hours_billed} onChange={v => set('est_current_hours_billed', v)} flex required />
          <Field label="Last Year - # Hours Actually Billed" value={form.last_year_hours_billed} onChange={v => set('last_year_hours_billed', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="Current Year - # Billable Employees Inc Partners" value={form.current_year_billable_employees} onChange={v => set('current_year_billable_employees', v)} flex required />
          <Field label="Last Year - # Billable Employees Inc Partners" value={form.last_year_billable_employees} onChange={v => set('last_year_billable_employees', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="Current Year - # Total Employees Inc Partners" value={form.current_year_total_employees} onChange={v => set('current_year_total_employees', v)} flex required />
          <Field label="Last Year - # Total Employees Inc Partners" value={form.last_year_total_employees} onChange={v => set('last_year_total_employees', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="% of Total Clients - Business Owners" value={form.pct_business_owners} onChange={v => set('pct_business_owners', v)} flex required />
          <Field label="% of Total Clients - Nonbusiness Owners" value={form.pct_nonbusiness_owners} onChange={v => set('pct_nonbusiness_owners', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="% of Total Clients - Traditional Services" value={form.pct_traditional_services} onChange={v => set('pct_traditional_services', v)} flex required />
          <Field label="% of Total Clients - Nontraditional" value={form.pct_nontraditional} onChange={v => set('pct_nontraditional', v)} flex required />
        </div>
        <div style={rowStyle}>
          <Field label="% of Total Clients - Billed Hourly" value={form.pct_billed_hourly} onChange={v => set('pct_billed_hourly', v)} flex required />
          <Field label="% of Total Clients - Billed Flat Fee or Value" value={form.pct_billed_flat_value} onChange={v => set('pct_billed_flat_value', v)} flex required />
        </div>

        <SectionLabel>Part 3</SectionLabel>
        <Area label="Please describe the strengths you bring to your business." value={form.strengths} onChange={v => set('strengths', v)} required />
        <Area label="Please describe your main challenges." value={form.challenges} onChange={v => set('challenges', v)} required />
        <Field label="How many hours do you work per week, on average?" value={form.hours_per_week} onChange={v => set('hours_per_week', v)} required />
        <Field label="How would you describe your work/life balance? Please choose an option that best describes you." value={form.work_life_balance} onChange={v => set('work_life_balance', v)} required />
        <Field label="Are you satisfied with the amount of money you currently make in relation to the time you work?" value={form.satisfied_with_money} onChange={v => set('satisfied_with_money', v)} required />
        <Area label="Are there opportunities to improve this? If so, please describe." value={form.improve_opportunities} onChange={v => set('improve_opportunities', v)} required />
        <Area label="What is the compelling reason for someone to do business with you?" value={form.compelling_reason} onChange={v => set('compelling_reason', v)} required />
        <Field label="Please choose the option that best describes you." value={form.best_describes_you} onChange={v => set('best_describes_you', v)} required />
        <Field label="Do you have a team of referral professionals that can bring additional value to help your clients?" value={form.referral_team} onChange={v => set('referral_team', v)} required />
        <Field label="How often do you use these resources?" value={form.resource_usage_frequency} onChange={v => set('resource_usage_frequency', v)} required />
        <Field label="Do you benefit financially when your clients use these resources?" value={form.benefit_financially} onChange={v => set('benefit_financially', v)} required />
        <Area label="If you had a magic wand, what would your business look like in 12 months time?" value={form.magic_wand} onChange={v => set('magic_wand', v)} required />

        {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>{error}</div>}

        <button onClick={submit} disabled={submitting} style={{ marginTop: '24px', width: '100%', padding: '14px', borderRadius: '8px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
          {submitting ? 'Submitting…' : 'Submit Form'}
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: '15px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '28px 0 12px', borderTop: '1px solid var(--vfo-tint-deep)', paddingTop: '20px' }}>{children}</div>
}

function Field({ label, value, onChange, hint, required, flex }) {
  return (
    <div style={{ marginBottom: '14px', flex: flex ? 1 : undefined, minWidth: flex ? '220px' : undefined }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#d93025' }}> *</span>}</label>
      <input value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
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

const pageStyle = { fontFamily: '"Inter", sans-serif', background: 'var(--vfo-card)', minHeight: '100vh', padding: '40px 20px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }
const cardStyle = { width: '100%', maxWidth: '720px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '16px', padding: '36px 40px' }
const labelStyle = { display: 'block', fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '6px' }
const hintStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '5px', fontStyle: 'italic', lineHeight: 1.5 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }
const rowStyle = { display: 'flex', gap: '12px', flexWrap: 'wrap' }
