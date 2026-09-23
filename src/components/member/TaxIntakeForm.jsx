import { useEffect, useMemo, useState } from 'react'
import { callApi } from '../../lib/api'
import {
  TAX_INTAKE_QUESTIONS,
  TAX_INTAKE_Q18_POOR_FIT,
  validateTaxIntakeAnswers,
  normalizeTaxIntakeAnswers,
} from './taxIntakeQuestions'

// The 37-question VFO Tax Planning intake form.
//
// Four entry points, one component:
//   CHOOSER      the member portal's "Add new tax client" button lands here
//                first: complete the form themselves (route A) or send the
//                client a link to complete it (route B).
//   NEW CLIENT   route A. Shows the deposit line ($500, or waived with the
//                qualifying count), submits to tax_intake_submit, and either
//                follows the returned url (the /tax-deposit-pay card-or-ACH
//                choice page) or lands straight on the success card (waived).
//   HOLISTIC     ?intake_client=<id>, reached from the "Complete the Tax
//                Planning Form" email. The client already exists, so name /
//                email / phone are prefilled and locked, there is NO deposit,
//                and it submits to tax_intake_holistic_submit. Skips the chooser.
//   PUBLIC       the client's own /tax-intake page (TaxIntakePage.jsx). No
//                session, so no eligibility call and no callApi: the page owns
//                the fetch and passes `onPublicSubmit`.
//
// Q1 "Who is completing this form?" is never rendered on any of them — the
// server derives it (taxIntakeQuestions.js, type "derived").
//
// Validation is the SAME module the server re-validates with
// (taxIntakeQuestions.js mirrors the edge function's copy), so a message shown
// here is the message the server would have produced.

const green = '#1b9254'

export default function TaxIntakeForm({
  member,
  existingClient = null,
  onCancel,
  onDone,
  // Public (client-link) mode.
  publicMode = false,
  publicIntake = null,
  onPublicSubmit = null,
  // Public VFO Tax Diagnostic page (TaxDiagnosticPage.jsx): its own questions
  // render above the 37 (`prelude`, checked by `validatePrelude`), the numbering
  // continues after them, and the header/button copy is the page's.
  prelude = null,
  validatePrelude = null,
  numberOffset = 0,
  title = null,
  intro = null,
  submitLabel = null,
  allowTestFill = false,
}) {
  const holistic = !!existingClient
  const [step, setStep] = useState(() => (holistic || publicMode ? 'form' : 'choose'))
  const [answers, setAnswers] = useState(() => {
    const seed = {}
    for (const q of TAX_INTAKE_QUESTIONS) seed[q.id] = ''
    // Q7-Q9 come from the session and are never shown.
    seed.q7 = `${member?.first_name || ''} ${member?.last_name || ''}`.trim() || member?.member_number || ''
    seed.q8 = member?.email || ''
    seed.q9 = member?.trading_name || ''
    if (existingClient) {
      seed.q2 = existingClient.first_name || ''
      seed.q3 = existingClient.last_name || ''
      seed.q4 = existingClient.email || ''
      seed.q5 = existingClient.phone || ''
    }
    if (publicIntake) {
      // The member filled these three in when they sent the link. The client may
      // correct their name; the email is the one we invited and is locked.
      seed.q2 = publicIntake.client_first_name || ''
      seed.q3 = publicIntake.client_last_name || ''
      seed.q4 = publicIntake.client_email || ''
      seed.q7 = publicIntake.member_display_name || ''
    }
    return seed
  })
  const [eligibility, setEligibility] = useState(null)
  // Who runs the case (unit 2). Classic by default — Direct is an option the
  // member takes deliberately, never one they fall into. The server re-decides
  // whether they may have it.
  const [taxRoute, setTaxRoute] = useState('classic')
  const [fillMode, setFillMode] = useState('form')
  const [errors, setErrors] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState('')
  // Route B mini form.
  const [linkForm, setLinkForm] = useState({ first: '', last: '', email: '' })

  useEffect(() => {
    if (holistic || publicMode) return
    let live = true
    callApi('tax_intake_eligibility', { member_number: member?.member_number })
      .then(d => { if (live) setEligibility(d) })
      .catch(() => { if (live) setEligibility(null) })
    return () => { live = false }
  }, [holistic, publicMode, member?.member_number])

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)', display: 'block', marginBottom: '6px', lineHeight: 1.45 }
  const noteStyle = { fontSize: '11.5px', color: 'var(--vfo-muted)', lineHeight: 1.55, marginTop: '-2px', marginBottom: '8px' }

  // Hidden = session-filled; derived = server-filled. Neither is ever rendered.
  const visible = useMemo(() => TAX_INTAKE_QUESTIONS.filter(q => !q.hidden && q.type !== 'derived'), [])
  // Test Member 59524 only (mirrors the backend TEST_SANDBOX_MEMBER_NUMBERS):
  // one button that fills every field with plausible test values so a
  // click-through does not mean typing 36 answers. The public link page learns
  // it from the token row via publicIntake.test_member, never from the URL.
  const isTestMember = allowTestFill || (publicMode ? publicIntake?.test_member === true : String(member?.member_number || '') === '59524')
  function fillTestValues() {
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
    setAnswers(a => {
      const next = { ...a }
      for (const q of visible) {
        if (lockedIds.has(q.id) && next[q.id]) continue
        if (q.id === 'q2') next.q2 = next.q2 || 'Test'
        else if (q.id === 'q3') next.q3 = next.q3 || `Client ${stamp}`
        else if (q.id === 'q4') next.q4 = next.q4 || `test.client.${stamp}@example.com`
        else if (q.id === 'q5') next.q5 = '555-555-0100'
        else if (q.id === 'q18') next.q18 = q.options.find(o => o.startsWith('$100k')) || q.options[1]
        else if (q.type === 'radio') next[q.id] = q.options[0]
        else if (q.type === 'select') next[q.id] = q.options.find(o => o && !/select/i.test(String(o))) || q.options[0]
        else if (q.type === 'money') next[q.id] = '100000'
        else if (q.type === 'textarea') next[q.id] = 'Test answer - sandbox click-through, ignore.'
        else next[q.id] = 'Test answer'
      }
      return next
    })
  }
  // q4 is locked on a link page (the invited address is half of what the token
  // proves) but typed freely on the public diagnostic page, which has no token.
  const lockedIds = holistic ? new Set(['q2', 'q3', 'q4', 'q5']) : publicMode && publicIntake ? new Set(['q4']) : new Set()

  function set(id, value) {
    setAnswers(a => ({ ...a, [id]: value }))
  }

  const poorFit = answers.q18 === TAX_INTAKE_Q18_POOR_FIT

  async function submit() {
    const found = [...(validatePrelude ? validatePrelude() : []), ...validateTaxIntakeAnswers(answers)]
    setErrors(found)
    setFailed('')
    if (found.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    try {
      const normalized = normalizeTaxIntakeAnswers(answers)
      const res = publicMode
        ? await onPublicSubmit(normalized)
        : holistic
          ? await callApi('tax_intake_holistic_submit', { answers: normalized, client_id: existingClient.id })
          : await callApi('tax_intake_submit', { answers: normalized, ...(taxRoute === 'direct' ? { tax_route: 'direct' } : {}) })
      // A url means the deposit is owed — since 2026-09-23 it is the card-or-ACH
      // choice page (/tax-deposit-pay), for route A and route B alike.
      if (res?.url) { window.location.assign(res.url); return }
      onDone?.(res)
    } catch (err) {
      setFailed(err?.message || 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  async function sendLink() {
    setFailed('')
    const first = linkForm.first.trim()
    const last = linkForm.last.trim()
    const email = linkForm.email.trim()
    const found = []
    if (!first) found.push('Client First Name is required')
    if (!last) found.push('Client Last Name is required')
    if (!email) found.push('Client Email is required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.push('Client Email must be a valid email address')
    setErrors(found)
    if (found.length > 0) return
    setSubmitting(true)
    try {
      await callApi('tax_intake_send_link', {
        member_number: member?.member_number,
        client_first_name: first,
        client_last_name: last,
        client_email: email,
        ...(taxRoute === 'direct' ? { tax_route: 'direct' } : {}),
      })
      onDone?.({ link_sent_to: `${first} ${last}`.trim() })
    } catch (err) {
      setFailed(err?.message || 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  function renderInput(q) {
    const locked = lockedIds.has(q.id)
    const val = answers[q.id] || ''
    if (q.type === 'radio') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {q.options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer', lineHeight: 1.5 }}>
              <input type="radio" name={q.id} value={opt} checked={val === opt} onChange={() => set(q.id, opt)} style={{ marginTop: '3px', flexShrink: 0 }} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )
    }
    if (q.type === 'select') {
      return (
        <select value={val} onChange={e => set(q.id, e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
          <option value="">-- Select --</option>
          {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
    }
    if (q.type === 'textarea') {
      return <textarea value={val} onChange={e => set(q.id, e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
    }
    return (
      <input
        type="text"
        value={val}
        disabled={locked}
        onChange={e => set(q.id, e.target.value)}
        placeholder={q.type === 'money' ? '$' : ''}
        style={{ ...inputStyle, opacity: locked ? 0.65 : 1, cursor: locked ? 'not-allowed' : 'text' }}
      />
    )
  }

  const depositRequired = publicMode
    ? publicIntake?.deposit_required
    : eligibility?.deposit_required
  const depositAmount = publicMode ? (publicIntake?.deposit_amount || 500) : (eligibility?.deposit_amount || 500)

  // The public diagnostic page (no intake row yet) takes no payment and quotes none.
  const depositLine = holistic || (publicMode && !publicIntake)
    ? null
    : publicMode
      ? (depositRequired ? `Deposit: $${depositAmount}` : 'Deposit: waived')
      : eligibility == null
        ? 'Checking your deposit...'
        : eligibility.deposit_required
          ? `Deposit: $${eligibility.deposit_amount}`
          : `Deposit: waived (you have ${eligibility.qualifying_count} qualifying clients)`

  const errorBox = errors.length > 0 && (
    <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#d93025', marginBottom: '6px' }}>Please complete the following:</div>
      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--vfo-ink)' }}>
        {errors.map(e => <li key={e}>{e}</li>)}
      </ul>
    </div>
  )
  const failBox = failed && (
    <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: '#d93025' }}>{failed}</div>
  )

  // ─── The feature gate, belt and braces ────────────────────────────────
  // The button that opens this form is already hidden when the flag is off, and
  // every write behind it 403s — this only covers a stale tab or a hand-typed
  // deep link. `null` is "still loading", so the form is never flashed away.
  if (eligibility?.intake_enabled === false) return (
    <div style={{ ...sectionStyle, borderColor: 'rgba(224,103,23,0.35)' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '8px' }}>Not available yet</div>
      <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
        Adding a tax client from the portal is not available for your account yet. Please speak to your VFO team.
      </div>
      <button type="button" onClick={onCancel}
        style={{ marginTop: '16px', padding: '8px 18px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
        Back to clients
      </button>
    </div>
  )

  // ─── Step 1: who fills the form in? ───────────────────────────────────
  if (step === 'choose') {
    // Who RUNS the case, asked on both routes and decided here — the client is
    // never asked. Shown only to a member the server says is eligible; when the
    // feature is off for them, nothing about Direct is shown at all.
    const routeOptions = [
      {
        key: 'classic',
        title: 'VFO Services runs this case',
        body: 'Our tax planning team and your VFO team run every step; you follow along.',
      },
      {
        key: 'direct',
        title: 'I run this case (Direct)',
        body: "You run the steps our VFO team normally runs; the tax planning team's steps stay with them. You act as the Planning Facilitator for this client.",
      },
    ]
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>Add a new tax client</div>
          {depositLine && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: eligibility && !eligibility.deposit_required ? green : 'var(--vfo-ink)', marginTop: '8px' }}>{depositLine}</div>
          )}
        </div>
        {/* Asked BEFORE the two cards below: those advance the moment they are
            clicked, so a choice placed under them could never be made. */}
        {(() => {
          const fillOptions = [
            { key: 'form', title: 'Complete the form for my client', body: `You answer the Tax Planning Form now${depositRequired === false ? '' : ' and pay the deposit'}. The client is created as soon as you are done.` },
            { key: 'link', title: 'Send my client a link', body: `We email your client the Tax Planning Form${depositRequired === false ? '' : ', and they pay the deposit'}. You only need their name and email address.` },
          ]
          // Both questions render at once. Direct starts DISABLED (grey) and only
          // lights up once eligibility confirms it, so nothing appears late or
          // jumps; the note under it explains the state without a loading flash.
          const directOk = !!eligibility?.direct_eligible
          const directOff = eligibility && eligibility.direct_enabled === false
          const questionStyle = { fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }
          const groupStyle = { display: 'inline-flex', border: '1px solid var(--vfo-border-strong)', borderRadius: '999px', padding: '3px', background: 'var(--vfo-card)' }
          const pillStyle = (on, disabled) => ({ padding: '7px 16px', borderRadius: '999px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
            background: on ? '#125ecc' : 'transparent', color: on ? '#fff' : disabled ? 'var(--vfo-border-strong)' : 'var(--vfo-ink)', transition: 'background 0.15s, color 0.15s' })
          // Fixed height so switching an option never shoves the next question around.
          const explainStyle = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.6, marginTop: '10px', maxWidth: '640px', minHeight: '42px' }
          const Toggle = ({ options, value, onChange, disabledKeys = [] }) => (
            <div role="radiogroup" style={groupStyle}>
              {options.map(opt => {
                const disabled = disabledKeys.includes(opt.key)
                return (
                  <button key={opt.key} type="button" role="radio" aria-checked={value === opt.key} aria-disabled={disabled}
                    onClick={() => { if (!disabled) onChange(opt.key) }} style={pillStyle(value === opt.key, disabled)}>
                    {opt.title}
                  </button>
                )
              })}
            </div>
          )
          const directNote = !eligibility
            ? 'Direct (run the case yourself) is available once you have 2 qualifying tax clients.'
            : directOff
              ? 'Direct (run the case yourself) is not available for your account yet.'
              : directOk
                ? `Direct is available because you have ${eligibility.qualifying_count} qualifying tax clients.`
                : `Direct (run the case yourself) becomes available once you have 2 qualifying tax clients — you have ${eligibility.qualifying_count}.`
          return (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={questionStyle}>1. Who runs this case?</div>
                <Toggle options={routeOptions} value={taxRoute} onChange={setTaxRoute} disabledKeys={directOk ? [] : ['direct']} />
                <div style={explainStyle}>{routeOptions.find(o => o.key === taxRoute)?.body}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{directNote}</div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <div style={questionStyle}>2. How will the Tax Planning Form be completed?</div>
                <Toggle options={fillOptions} value={fillMode} onChange={setFillMode} />
                <div style={explainStyle}>{fillOptions.find(o => o.key === fillMode)?.body}</div>
              </div>
            </>
          )
        })()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '32px' }}>
          <button type="button" onClick={() => { setErrors([]); setStep(fillMode) }}
            style={{ padding: '10px 22px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Continue
          </button>
          <button type="button" onClick={onCancel}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ─── Route B: the three fields we need to email the client ────────────
  if (step === 'link') {
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>Send my client a link</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px', lineHeight: 1.6 }}>
            We will email your client the Tax Planning Form{depositRequired === false ? '.' : ' and take the $500 deposit at the end of it.'} You will be copied in.
          </div>
        </div>
        {errorBox}
        {failBox}
        <div style={sectionStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px 28px' }}>
            <div>
              <label style={labelStyle}>Client First Name<span style={{ color: '#d93025' }}> *</span></label>
              <input type="text" value={linkForm.first} onChange={e => setLinkForm(f => ({ ...f, first: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Client Last Name<span style={{ color: '#d93025' }}> *</span></label>
              <input type="text" value={linkForm.last} onChange={e => setLinkForm(f => ({ ...f, last: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Client Email<span style={{ color: '#d93025' }}> *</span></label>
              <input type="text" value={linkForm.email} onChange={e => setLinkForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '32px' }}>
          <button type="button" onClick={() => { setErrors([]); setStep('choose') }} disabled={submitting}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            Back
          </button>
          <button type="button" onClick={sendLink} disabled={submitting}
            style={{ padding: '10px 24px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: submitting ? 'var(--vfo-faint)' : '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif', boxShadow: submitting ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
            {submitting ? 'Sending...' : 'Send link'}
          </button>
        </div>
      </div>
    )
  }

  // ─── The 37 questions ─────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>{title || 'Tax Planning Form'}</div>
        {intro && (
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px', lineHeight: 1.6 }}>{intro}</div>
        )}
        {publicMode && publicIntake?.member_display_name && (
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px', lineHeight: 1.6 }}>
            {publicIntake.member_display_name} has asked us to start your tax planning. Please answer the questions below.
          </div>
        )}
        {depositLine && (
          <div style={{ fontSize: '13px', fontWeight: 600, color: depositRequired === false ? green : 'var(--vfo-ink)', marginTop: '8px' }}>{depositLine}</div>
        )}
        {holistic && (
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px' }}>
            For {existingClient.first_name} {existingClient.last_name} — no deposit is required.
          </div>
        )}
      </div>

      {errorBox}
      {failBox}

      {prelude && <div style={sectionStyle}>{prelude}</div>}

      <div style={sectionStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px 28px' }}>
          {visible.map((q, i) => (
            <div key={q.id} style={q.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
              <label style={labelStyle}>
                {i + 1 + numberOffset}. {q.label}{q.required && <span style={{ color: '#d93025' }}> *</span>}
              </label>
              {q.note && <div style={noteStyle}>{q.note}</div>}
              {renderInput(q)}
              {q.id === 'q18' && poorFit && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#e06717', lineHeight: 1.55 }}>
                  The client is currently not a good fit for VFO Tax Planning. Please reach out to Tracy Miller if you have any questions.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isTestMember && (
        <div style={{ margin: '0 0 16px', padding: '12px 16px', border: '1px dashed #e06717', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12.5px', color: '#e06717', fontWeight: 600 }}>{allowTestFill ? 'Dev server only' : 'Test member only'}: fill every question with test values.</span>
          <button type="button" onClick={fillTestValues} disabled={submitting}
            style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid #e06717', background: 'transparent', color: '#e06717', fontFamily: 'Inter, sans-serif' }}>
            Fill with test values
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '32px' }}>
        {!publicMode && (
          <button type="button" onClick={holistic ? onCancel : () => setStep('choose')} disabled={submitting}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            {holistic ? 'Cancel' : 'Back'}
          </button>
        )}
        <button type="button" onClick={submit} disabled={submitting}
          style={{ padding: '10px 24px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: submitting ? 'var(--vfo-faint)' : '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif', boxShadow: submitting ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
          {submitting ? 'Submitting...' : (submitLabel || (holistic || depositRequired === false ? 'Submit' : 'Submit and pay deposit'))}
        </button>
      </div>
    </div>
  )
}
