import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TokenFormSkeleton } from '../components/shared/Skeleton'
import { formatPhoneTyping } from '../lib/formatters'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const TZ_OPTIONS = ['Eastern (ET)', 'Central (CT)', 'Mountain (MT)', 'Pacific (PT)', 'Alaska (AKT)', 'Hawaii (HT)']

const EMPTY = {
  full_name: '', company_name: '', address: '', phone: '', email: '', website_url: '', time_zone: '',
  strategy_expertise: '', cutoff_date: '',
  client_requirements: '', investment_cost: '',
  ideal_client: '', benefits_summary: '', getting_started: '', process_steps: '', competitive_advantage: '',
  is_tax_specialist: '',
  tax_general_risks: '', tax_risk_history: '', tax_worst_case: '', tax_precautions: '',
}

// Tax-specialist-only questions, revealed (and required) when is_tax_specialist === 'Yes'.
const TAX_QUESTIONS = [
  ['tax_general_risks', 'What are the general risks of this strategy?'],
  ['tax_risk_history', 'What has been the history of these risks coming to fruition?'],
  ['tax_worst_case', 'What are potential worst-case scenarios?'],
  ['tax_precautions', 'What precautions are in place to prevent or minimize the risks?'],
]

export default function SpecialistSifPage() {
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
        body: JSON.stringify({ action: 'automation_SPECIALIST_loadsif', token }),
      })
      const data = await res.json()
      if (!res.ok || data.state === 'invalid') { setState('invalid'); return }
      setForm({
        ...EMPTY,
        ...(data.data || {}),
        full_name: (data.data && data.data.full_name) || data.specialist_name || '',
        email: (data.data && data.data.email) || data.specialist_email || '',
      })
      setState('valid')
    } catch { setState('invalid') }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit() {
    const REQUIRED = ['full_name', 'address', 'phone', 'email', 'time_zone', 'strategy_expertise', 'client_requirements', 'ideal_client', 'benefits_summary', 'getting_started', 'process_steps', 'competitive_advantage', 'is_tax_specialist']
    if (form.is_tax_specialist === 'Yes') REQUIRED.push('tax_general_risks', 'tax_risk_history', 'tax_worst_case', 'tax_precautions')
    if (REQUIRED.some(k => !String(form[k] || '').trim())) {
      setError('Please complete all required fields (marked with *). Fields noted "if applicable" are optional.')
      return
    }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_SPECIALIST_submitsif', token, sif: form }),
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
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>This Specialist Information Form link is invalid or has expired. Please contact your VFO representative for a new link.</p>
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
          <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>Your Specialist Information Form has been submitted. We'll review it ahead of your next meeting and be in touch shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '28px', color: 'var(--vfo-ink)', marginBottom: '6px' }}>VFO Specialist Information</div>
          <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Basic information on the Specialist</div>
        </div>

        <SectionLabel n="1">Please provide the following information about you as a VFO Specialist</SectionLabel>
        <Field label="Full Name" value={form.full_name} onChange={v => set('full_name', v)} required />
        <Field label="Company Name" value={form.company_name} onChange={v => set('company_name', v)} />
        <Field label="Address" value={form.address} onChange={v => set('address', v)} required />
        <div style={rowStyle}>
          <Field label="Phone" value={form.phone} onChange={v => set('phone', formatPhoneTyping(v, form.phone))} flex required />
          <Field label="Email" value={form.email} onChange={v => set('email', v)} flex required />
        </div>
        <Field label="Website URL" value={form.website_url} onChange={v => set('website_url', v)} />
        <SelectField label="Time Zone" hint="Deadlines will be based on this time zone." value={form.time_zone} onChange={v => set('time_zone', v)} options={TZ_OPTIONS} required />

        <SectionLabel n="2" required>Strategy / Expertise</SectionLabel>
        <Field value={form.strategy_expertise} onChange={v => set('strategy_expertise', v)} maxLength={85} hint="Keep this to one short line — it appears in your agreement. For example: 1031 Exchanges (through Private Placement Delaware Statutory Trust)" />
        <Field label="2A. Cut-off Date for Strategy (if applicable)" value={form.cutoff_date} onChange={v => set('cutoff_date', v)} hint="For example: December 31st 11:59 pm EST" />

        <SectionLabel n="3" required>Client Requirements</SectionLabel>
        <Area value={form.client_requirements} onChange={v => set('client_requirements', v)} hint="For example: Accredited Investor — $200,000 income in each of the last 2 years (and expected this year); or $300,000 joint income with spouse; or net worth exceeding $1MM excluding primary residence." />
        <Field label="3A. Amount of Investment or Cost (if applicable)" value={form.investment_cost} onChange={v => set('investment_cost', v)} hint="For example: 3.5% admin fee cost" />

        <SectionLabel n="4" required>Ideal Client Description</SectionLabel>
        <Area value={form.ideal_client} onChange={v => set('ideal_client', v)} hint="For example: Older client; highly appreciated real estate; fully depreciated; interested in investing in a DST that owns a portfolio of real estate assets." />

        <SectionLabel n="5" required>Summary of Benefits</SectionLabel>
        <Area value={form.benefits_summary} onChange={v => set('benefits_summary', v)} hint="For example: Deferral of capital gain; diversification through a DST; estate planning (stepped-up basis for heirs); no management responsibilities." />

        <SectionLabel n="6" required>Getting Started with a Client</SectionLabel>
        <Area value={form.getting_started} onChange={v => set('getting_started', v)} hint="For example: Email an outline of the client's circumstances — equity/debt in real estate, contract to sell and its date, whether it closed, income needs." />

        <SectionLabel n="7" required>Steps of Professional Process</SectionLabel>
        <Area value={form.process_steps} onChange={v => set('process_steps', v)} hint="What are the steps of your business process? What are the responsibilities of an advisor / accountant?" />

        <SectionLabel n="8" required>What Makes You Better than the Competition</SectionLabel>
        <Area value={form.competitive_advantage} onChange={v => set('competitive_advantage', v)} hint="For example: Only deal with senior partners with more than 20 years' experience." />

        <SectionLabel n="9" required>Tax Specialist</SectionLabel>
        <SelectField label="Are you a Tax Specialist?" value={form.is_tax_specialist} onChange={v => set('is_tax_specialist', v)} options={['Yes', 'No']} required />
        {form.is_tax_specialist === 'Yes' && (
          <div style={{ marginTop: '4px' }}>
            {TAX_QUESTIONS.map(([k, label], i) => (
              <Area key={k} label={`9${String.fromCharCode(65 + i)}. ${label}`} required value={form[k]} onChange={v => set(k, v)} />
            ))}
          </div>
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

function Field({ label, value, onChange, hint, required, flex, maxLength }) {
  return (
    <div style={{ marginBottom: '14px', flex: flex ? 1 : undefined, minWidth: flex ? '180px' : undefined }}>
      {label && <label style={labelStyle}>{label}{required && <span style={{ color: '#d93025' }}> *</span>}</label>}
      <input value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} style={inputStyle} />
      {(hint || maxLength) && (
        <div style={{ ...hintStyle, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span>{hint}</span>
          {maxLength && <span style={{ flexShrink: 0 }}>{(value || '').length}/{maxLength}</span>}
        </div>
      )}
    </div>
  )
}

function SelectField({ label, value, onChange, options, hint, required }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#d93025' }}> *</span>}</label>
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
const rowStyle = { display: 'flex', gap: '12px', flexWrap: 'wrap' }
