import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fileSizeError } from '../lib/fileUpload'
import { PublicFormSkeleton } from '../components/shared/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const IMG_ACCEPT = 'image/*'
const DOC_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,image/*,application/pdf'

const EMPTY = {
  headshot: null, bio: '',
  licenses: [],
  case_studies: '', case_study_files: [],
  eo_insurance: [],
  disciplinary_history: '', disciplinary_history_files: [],
  audit_support: '', audit_support_files: [],
  plr_files: [],
  tol_files: [],
  legal_dd_files: [],
  exit_strategies: '', exit_strategies_files: [],
  sample_materials_notes: '', sample_materials_files: [],
}

// Uploads a single file: mint a one-time signed upload url (token-gated), then PUT
// the bytes straight to the private bucket. Returns the stored file reference.
async function uploadFile(token, slot, file) {
  const tooBig = fileSizeError(file)
  if (tooBig) throw new Error(tooBig)
  const r1 = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'automation_SPECIALIST_ddcuploadurl', token, slot, filename: file.name }),
  })
  const d1 = await r1.json()
  if (!r1.ok || !d1.success || !d1.signed_url) throw new Error(d1.error || 'Could not start upload')
  // Match supabase-js uploadToSignedUrl for a browser Blob: PUT + multipart
  // FormData (file under an empty field name). Do NOT set Content-Type — the
  // browser sets the multipart boundary.
  const fd = new FormData()
  fd.append('cacheControl', '3600')
  fd.append('', file)
  const put = await fetch(d1.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
  if (!put.ok) throw new Error('Upload failed — please try again')
  return { path: d1.path, name: file.name, size: file.size, type: file.type || '' }
}

export default function SpecialistDdcPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState('loading') // loading | valid | invalid
  const [form, setForm] = useState(EMPTY)
  const [isTax, setIsTax] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [submittedAt, setSubmittedAt] = useState(null)
  const [reviewStatus, setReviewStatus] = useState(null)
  const [editsReason, setEditsReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    if (!token) { setState('invalid'); return }
    try {
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_SPECIALIST_loadddc', token }),
      })
      const data = await res.json()
      if (!res.ok || data.state === 'invalid') { setState('invalid'); return }
      setForm({ ...EMPTY, ...(data.data || {}) })
      setIsTax(!!data.is_tax_specialist)
      setSubmittedAt(data.submitted_at || null)
      setReviewStatus(data.review_status || null)
      setEditsReason(data.edits_reason || '')
      setState('valid')
    } catch { setState('invalid') }
  }

  async function persist(payload) {
    setSaving(true); setSavedTick(false)
    try {
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_SPECIALIST_saveddc', token, ddc: payload }),
      })
      const d = await res.json()
      if (res.ok && d.success) { setSavedTick(true); setTimeout(() => setSavedTick(false), 2500) }
    } catch { /* keep local state; user can retry Save */ }
    setSaving(false)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  // Apply a file add/remove and persist the resulting payload immediately so an
  // uploaded reference is never lost.
  function applyAndPersist(updater) {
    setForm(prev => { const next = updater(prev); persist(next); return next })
  }

  async function submit() {
    setSubmitting(true); setError('')
    // Flush any unsaved text edits first, then mark submitted.
    await persist(form)
    try {
      const res = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'automation_SPECIALIST_submitddc', token }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) { setError(d.error || 'Something went wrong. Please try again.'); setSubmitting(false); return }
      setSubmittedAt(new Date().toISOString())
      setReviewStatus('pending_review')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('Unable to connect. Please try again later.') }
    setSubmitting(false)
  }

  if (state === 'loading') return (
    <div style={pageStyle}>
      <PublicFormSkeleton />
    </div>
  )

  if (state === 'invalid') return (
    <div style={{ ...pageStyle, alignItems: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '480px', padding: '48px 32px' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#ef444420', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>⚠️</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }}>Link Not Valid</h1>
        <p style={{ fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>This Due Diligence Checklist link is invalid or has expired. Please contact your VFO representative for a new link.</p>
      </div>
    </div>
  )

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '28px', color: 'var(--vfo-ink)', marginBottom: '6px' }}>VFO Specialist Due Diligence Checklist</div>
          <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Please send over the materials and documentation below.</div>
        </div>

        <div style={noteStyle}>
          You don't need to complete everything at once. Use the <strong>Save progress</strong> button at any time and return to this link later — your answers and uploaded files will be waiting for you. When you've added everything, click <strong>Submit for review</strong>.
        </div>

        {reviewStatus === 'edits_requested' && (
          <div style={editsBanner}>
            <strong>Updates requested.</strong> Please review the note below, make the changes, then click <strong>Submit for review</strong> again.
            {editsReason && <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', color: '#b3500f', lineHeight: 1.5 }}>{editsReason}</div>}
          </div>
        )}

        {submittedAt && (
          <div style={submittedBanner}>
            ✓ Submitted for review. You can still add or update materials below — click <strong>Submit for review</strong> again to flag any updates.
          </div>
        )}

        <SectionLabel n="1">Materials</SectionLabel>
        <FileField token={token} slot="headshot" label="Headshot" accept={IMG_ACCEPT}
          value={form.headshot} onChange={v => applyAndPersist(f => ({ ...f, headshot: v }))} />
        <Area label="Professional Bio" value={form.bio} onChange={v => set('bio', v)} onBlur={() => persist(form)} />

        <SectionLabel n="2">Credentials &amp; Experience</SectionLabel>
        <FileField token={token} slot="licenses" label="Professional licenses / designations (if applicable)" hint="Please attach the supporting documentation." accept={DOC_ACCEPT} multi
          value={form.licenses} onChange={v => applyAndPersist(f => ({ ...f, licenses: v }))} />
        <BothField token={token} slot="case_studies" accept={DOC_ACCEPT}
          label="Please provide 2 relevant case studies with measurable outcomes"
          textValue={form.case_studies} onTextChange={v => set('case_studies', v)} onTextBlur={() => persist(form)}
          filesValue={form.case_study_files} onFilesChange={v => applyAndPersist(f => ({ ...f, case_study_files: v }))} />

        {isTax && (
          <>
            <SectionLabel n="3">Compliance &amp; Risk <span style={{ color: 'var(--vfo-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(Tax Professionals only)</span></SectionLabel>
            <FileField token={token} slot="eo_insurance" accept={DOC_ACCEPT} multi
              label="Proof of E&amp;O / professional liability insurance"
              value={form.eo_insurance} onChange={v => applyAndPersist(f => ({ ...f, eo_insurance: v }))} />
            <BothField token={token} slot="disciplinary_history" accept={DOC_ACCEPT}
              label="Disclosure of any regulatory or disciplinary history"
              textValue={form.disciplinary_history} onTextChange={v => set('disciplinary_history', v)} onTextBlur={() => persist(form)}
              filesValue={form.disciplinary_history_files} onFilesChange={v => applyAndPersist(f => ({ ...f, disciplinary_history_files: v }))} />
            <BothField token={token} slot="audit_support" accept={DOC_ACCEPT}
              label="Overview of audit support and scope of services"
              textValue={form.audit_support} onTextChange={v => set('audit_support', v)} onTextBlur={() => persist(form)}
              filesValue={form.audit_support_files} onFilesChange={v => applyAndPersist(f => ({ ...f, audit_support_files: v }))} />

            <Subheading>Provide one or more of the following:</Subheading>
            <FileField token={token} slot="plr" accept={DOC_ACCEPT} multi
              label="Private Letter Ruling (PLR)"
              value={form.plr_files} onChange={v => applyAndPersist(f => ({ ...f, plr_files: v }))} />
            <FileField token={token} slot="tol" accept={DOC_ACCEPT} multi
              label="Tax Opinion Letter (TOL)"
              value={form.tol_files} onChange={v => applyAndPersist(f => ({ ...f, tol_files: v }))} />
            <FileField token={token} slot="legal_dd" accept={DOC_ACCEPT} multi
              label="Independent legal due diligence"
              value={form.legal_dd_files} onChange={v => applyAndPersist(f => ({ ...f, legal_dd_files: v }))} />

            <BothField token={token} slot="exit_strategies" accept={DOC_ACCEPT}
              label="Outline exit strategies and contingency plans for adverse IRS or state findings"
              textValue={form.exit_strategies} onTextChange={v => set('exit_strategies', v)} onTextBlur={() => persist(form)}
              filesValue={form.exit_strategies_files} onFilesChange={v => applyAndPersist(f => ({ ...f, exit_strategies_files: v }))} />
          </>
        )}

        <SectionLabel n={isTax ? '4' : '3'}>Client Experience</SectionLabel>
        <BothField token={token} slot="sample_materials" accept={DOC_ACCEPT}
          label="Sample materials (presentations, webinars, articles, etc.)"
          textValue={form.sample_materials_notes} onTextChange={v => set('sample_materials_notes', v)} onTextBlur={() => persist(form)}
          filesValue={form.sample_materials_files} onFilesChange={v => applyAndPersist(f => ({ ...f, sample_materials_files: v }))} />

        {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
          <button onClick={() => persist(form)} disabled={saving} style={{ ...btnBase, flex: 1, minWidth: '160px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-strong)' }}>
            {saving ? 'Saving…' : savedTick ? 'Saved ✓' : 'Save progress'}
          </button>
          <button onClick={submit} disabled={submitting} style={{ ...btnBase, flex: 1, minWidth: '160px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none' }}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Bare upload control (file chips + add/replace button) with no outer label —
// shared by the file-only FileField and the combined BothField.
function FilePicker({ token, slot, accept, multi, value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const files = multi ? (value || []) : (value ? [value] : [])

  async function pick(e) {
    const chosen = Array.from(e.target.files || [])
    e.target.value = ''
    if (!chosen.length) return
    setBusy(true); setErr('')
    try {
      const refs = []
      for (const f of chosen) refs.push(await uploadFile(token, slot, f))
      if (multi) onChange([...(value || []), ...refs])
      else onChange(refs[0])
    } catch (ex) { setErr(ex.message || 'Upload failed') }
    setBusy(false)
  }

  function remove(idx) {
    if (multi) onChange((value || []).filter((_, i) => i !== idx))
    else onChange(null)
  }

  return (
    <>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {files.map((f, i) => (
            <div key={i} style={fileChip}>
              <span title={f.name} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}{f.size ? <span style={{ color: 'var(--vfo-muted)' }}> · {prettySize(f.size)}</span> : null}</span>
              <button onClick={() => remove(i)} style={removeBtn} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
      <label style={{ ...uploadBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Uploading…' : files.length && !multi ? 'Replace file' : multi ? '+ Add file(s)' : 'Choose file'}
        <input type="file" accept={accept} multiple={multi} onChange={pick} disabled={busy} style={{ display: 'none' }} />
      </label>
      {err && <div style={{ color: '#d93025', fontWeight: 600, fontSize: '12px', marginTop: '6px' }}>{err}</div>}
    </>
  )
}

// File-only field: label + hint + upload control.
function FileField({ token, slot, label, hint, accept, multi, value, onChange }) {
  return (
    <div style={itemStyle}>
      <label style={labelStyle}>{label}</label>
      {hint && <div style={{ ...hintStyle, marginTop: 0, marginBottom: '8px' }}>{hint}</div>}
      <FilePicker token={token} slot={slot} accept={accept} multi={multi} value={value} onChange={onChange} />
    </div>
  )
}

// Combined field: a text response AND an optional attachment for the same item.
function BothField({ token, slot, accept, label, hint, textValue, onTextChange, onTextBlur, filesValue, onFilesChange }) {
  return (
    <div style={itemStyle}>
      <label style={labelStyle}>{label}</label>
      {hint && <div style={{ ...hintStyle, marginTop: 0, marginBottom: '8px' }}>{hint}</div>}
      <textarea value={textValue} onChange={e => onTextChange(e.target.value)} onBlur={onTextBlur} rows={3}
        placeholder="Type your response here, and/or attach a file below." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, marginBottom: '8px' }} />
      <FilePicker token={token} slot={slot} accept={accept} multi value={filesValue} onChange={onFilesChange} />
    </div>
  )
}

// Sub-section heading (e.g. "Provide one or more of the following:").
function Subheading({ children }) {
  return <div style={{ fontSize: '13px', fontWeight: 600, color: '#4d5f80', margin: '4px 0 14px' }}>{children}</div>
}

function prettySize(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function SectionLabel({ n, children }) {
  return <div style={{ fontSize: '13px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '28px 0 14px', borderTop: '1px solid var(--vfo-tint-deep)', paddingTop: '20px' }}>{n}. {children}</div>
}

function Area({ value, onChange, onBlur, hint, label }) {
  return (
    <div style={itemStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

const pageStyle = { fontFamily: '"Inter", sans-serif', background: 'var(--vfo-card)', minHeight: '100vh', padding: '40px 20px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }
const cardStyle = { width: '100%', maxWidth: '720px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '16px', padding: '36px 40px' }
const noteStyle = { fontSize: '13px', color: '#4d5f80', background: 'rgba(18,94,204,0.10)', border: '1px solid rgba(18,94,204,0.25)', borderRadius: '8px', padding: '12px 16px', lineHeight: 1.6, marginTop: '20px' }
const submittedBanner = { fontSize: '13px', color: '#15803d', fontWeight: 500, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '12px 16px', lineHeight: 1.6, marginTop: '12px' }
const editsBanner = { fontSize: '13px', color: '#b3500f', fontWeight: 500, background: 'rgba(251,137,90,0.12)', border: '1px solid rgba(251,137,90,0.35)', borderRadius: '8px', padding: '12px 16px', lineHeight: 1.6, marginTop: '12px' }
const itemStyle = { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '10px', padding: '16px 18px', marginBottom: '12px' }
const labelStyle = { display: 'block', fontSize: '14px', fontWeight: 600, color: '#2e4166', marginBottom: '8px', lineHeight: 1.4 }
const hintStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '5px', fontStyle: 'italic', lineHeight: 1.5 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }
const fileChip = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--vfo-muted)', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '7px', padding: '8px 12px' }
const removeBtn = { background: 'none', border: 'none', color: '#d93025', fontWeight: 500, cursor: 'pointer', fontSize: '13px', flexShrink: 0 }
const uploadBtn = { display: 'inline-block', fontSize: '13px', color: 'var(--vfo-muted)', background: 'var(--vfo-tint)', border: '1px dashed var(--vfo-border-strong)', borderRadius: '8px', padding: '10px 16px', fontWeight: 600 }
const btnBase = { padding: '14px', borderRadius: '8px', color: 'var(--vfo-ink)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
