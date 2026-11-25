import { useEffect, useMemo, useState } from 'react'
import { callApi } from '../../lib/api'
import { IS_STAGING } from '../../lib/environment'
import {
  TAX_INTAKE_QUESTIONS,
  TAX_INTAKE_POOR_FIT_WARNING,
  TAX_INTAKE_Q38_TRADITIONAL,
  validateTaxIntakeAnswers,
  normalizeTaxIntakeAnswers,
  numberTaxIntakeQuestions,
  formatTaxIntakeMoneyInput,
  isInternationalTaxCase,
  parseTaxIntakeContactList,
  taxIntakeContactProblem,
  TAX_INTAKE_CONTACT_MAX_MESSAGE,
  TAX_INTAKE_CC_MAX,
  TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE,
  TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE_PUBLIC,
} from './taxIntakeQuestions'
import PhoneInput from '../shared/PhoneInput'
import { cleanText, formatPersonName, formatPreferredName, nameProblem } from '../../lib/formatters'
import { useIsPhone } from '../../lib/useMediaQuery'
import TaxFormPlanPicker, { planPickBody, planPickProblem } from '../shared/TaxFormPlanPicker'

// The VFO Tax Planning intake form (q1-q39).
//
// Three entry points, one component:
//   CHOOSER      the member portal's "+ Add Client" button (MSM Tax Planning) lands here
//                first: complete the form themselves (route A) or send the
//                client a link to complete it (route B).
//   NEW CLIENT   route A. Shows the deposit line ($500, or waived with the
//                qualifying count), submits to tax_intake_submit, and either
//                follows the returned url (the /tax-deposit-pay card-or-ACH
//                choice page) or lands straight on the success card (waived).
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
  onCancel,
  onDone,
  // Public (client-link) mode.
  publicMode = false,
  publicIntake = null,
  onPublicSubmit = null,
  // Public VFO Tax Diagnostic page (TaxDiagnosticPage.jsx): its own questions
  // render above the intake questions (`prelude`, checked by `validatePrelude`), the numbering
  // continues after them, and the header/button copy is the page's.
  prelude = null,
  validatePrelude = null,
  numberOffset = 0,
  title = null,
  intro = null,
  submitLabel = null,
  allowTestFill = false,
  // The CLIENT is the one filling it in (the /tax-intake link page, or the
  // diagnostic's "I am the client"): a question's selfLabel replaces its label.
  clientFilling = false,
  // The diagnostic's "I am a VFO member completing this for my client": with
  // q41 Yes, the hedged international deposit note shows (the page cannot know
  // the named member's waiver).
  memberFilling = false,
  // The personal Tax Diagnostic link for an EXISTING client (2026-10-07): the
  // client's first / last name and email come from their record and are locked,
  // and there is no deposit line (no deposit is ever due).
  lockClientIdentity = false,
  // The member Tax Diagnostic tab (2026-10-14) draws its own Client-Overview-
  // style page heading above the form: drop the eyebrow, smaller step titles.
  pageHeading = false,
  // An EXISTING client of this member (2026-11-13: the client's Vault tab
  // "Start the Tax Diagnostic" button). Their name, email and phone come from
  // the record (tax_intake_eligibility returns them after checking the client is
  // the caller's own), both routes send client_id, and the server puts the case
  // on that client instead of creating one.
  existingClientId = null,
}) {
  const isPhone = useIsPhone()
  const [step, setStep] = useState(() => (publicMode ? 'form' : 'choose'))
  const [answers, setAnswers] = useState(() => {
    const seed = {}
    for (const q of TAX_INTAKE_QUESTIONS) seed[q.id] = ''
    seed.q38 = TAX_INTAKE_Q38_TRADITIONAL
    // Q7-Q9 come from the session and are never shown.
    seed.q7 = `${member?.first_name || ''} ${member?.last_name || ''}`.trim() || member?.member_number || ''
    seed.q8 = member?.email || ''
    seed.q9 = member?.trading_name || ''
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
  // q42's typed-but-not-yet-added person, and why the last Add was refused.
  const [ccDraft, setCcDraft] = useState({ first: '', last: '', email: '' })
  const [ccError, setCcError] = useState('')

  // The client already has a tax plan (2026-11-23): theirs when the form was started
  // for them, or found by email when it is sent. The plan is picked before anything
  // is saved or paid. `planPick` = { clientName, plans, resume } while it is asked.
  const [planPick, setPlanPick] = useState(null)
  const [planChoice, setPlanChoice] = useState('')
  const [replaceForm, setReplaceForm] = useState(false)
  const [pickedPlan, setPickedPlan] = useState(null) // { body, plan } once picked
  function askForPlan(err, resume) {
    if (!err?.data?.needs_plan_pick) return false
    setPlanChoice('')
    setReplaceForm(false)
    setPickedPlan(null)
    setPlanPick({ clientName: err.data.client_name || '', plans: err.data.plans || [], resume })
    setSubmitting(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return true
  }

  const [existingError, setExistingError] = useState('')
  useEffect(() => {
    if (publicMode) return
    let live = true
    callApi('tax_intake_eligibility', { member_number: member?.member_number, ...(existingClientId ? { client_id: existingClientId } : {}) })
      .then(d => {
        if (!live) return
        setEligibility(d)
        const c = existingClientId ? d?.client : null
        if (!c) return
        setAnswers(a => ({ ...a, q2: c.first_name || a.q2, q3: c.last_name || a.q3, q4: c.email || a.q4, q5: c.phone || a.q5 }))
        setLinkForm({ first: c.first_name || '', last: c.last_name || '', email: c.email || '' })
        if (Array.isArray(c.plans) && c.plans.length > 0) {
          setPlanPick({ clientName: `${c.first_name || ''} ${c.last_name || ''}`.trim(), plans: c.plans, resume: null })
        }
      })
      .catch(err => {
        if (!live) return
        setEligibility(null)
        if (existingClientId) setExistingError(err?.message || 'Could not load this client.')
      })
    return () => { live = false }
  }, [publicMode, member?.member_number, existingClientId])
  const existingClient = existingClientId ? (eligibility?.client || null) : null
  const existingName = existingClient ? `${existingClient.first_name} ${existingClient.last_name}`.trim() : ''

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: isPhone ? 'var(--vfo-card-pad)' : '24px', marginBottom: '20px' }
  // A public page already draws the form inside its own card (TokenShell): on a
  // phone the question groups lose their frame rather than nest a second card.
  const questionsStyle = publicMode && isPhone ? { marginBottom: '20px' } : sectionStyle
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)', display: 'block', marginBottom: '6px', lineHeight: 1.45 }
  const noteStyle = { fontSize: '11.5px', color: 'var(--vfo-muted)', lineHeight: 1.55, marginTop: '-2px', marginBottom: '8px' }

  // Hidden = session-filled; derived = server-filled. Neither is ever rendered.
  const visible = useMemo(() => TAX_INTAKE_QUESTIONS.filter(q => !q.hidden && !q.retired && q.type !== 'derived'), [])
  // The test site only: one button that fills every field with plausible test
  // values so a click-through does not mean typing 36 answers.
  const showTestFill = allowTestFill || IS_STAGING
  function fillTestValues() {
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
    setAnswers(a => {
      const next = { ...a }
      for (const q of visible) {
        if (lockedIds.has(q.id) && next[q.id]) continue
        if (q.id === 'q2') next.q2 = next.q2 || 'Test'
        else if (q.id === 'q3') next.q3 = next.q3 || `Client ${stamp}`
        else if (q.id === 'q4') next.q4 = next.q4 || `test.client.${stamp}@example.com`
        else if (q.id === 'q5') next.q5 = '(555) 555-0100'
        else if (q.id === 'q18') next.q18 = q.options.find(o => o.startsWith('$100k')) || q.options[1]
        else if (q.id === 'q41') next.q41 = next.q41 || 'No'
        else if (q.type === 'contact_list' || q.id === 'q43') continue
        else if (q.poorFitOption) next[q.id] = q.options.find(o => o !== q.poorFitOption)
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
  // An existing client's name is their record's; so is the email when the record
  // has one (a blank one is typed here and used for the emails only).
  const lockedIds = lockClientIdentity ? new Set(['q2', 'q3', 'q4'])
      : existingClient ? new Set(['q2', 'q3', ...(existingClient.email ? ['q4'] : [])])
      : publicMode && publicIntake ? new Set(publicIntake.name_locked ? ['q2', 'q3', 'q4'] : ['q4']) : new Set()

  function set(id, value) {
    setAnswers(a => ({ ...a, [id]: value }))
  }


  // q42: the Add button. The typed person (names tidied like the client's own)
  // joins the stored list, or the reason they cannot is shown under the boxes.
  // Returns the new answers, or null when nothing was added.
  function addCc(id, base = answers) {
    const person = {
      first_name: formatPersonName(ccDraft.first),
      last_name: formatPersonName(ccDraft.last),
      email: cleanText(ccDraft.email).toLowerCase(),
    }
    const list = parseTaxIntakeContactList(base[id])
    const problem = taxIntakeContactProblem(person)
      || (person.email === String(base.q4 || '').trim().toLowerCase() ? "That is the client's own email address" : null)
      || (list.some(c => c.email === person.email) ? 'That person is already on the list' : null)
      || (list.length >= TAX_INTAKE_CC_MAX ? TAX_INTAKE_CONTACT_MAX_MESSAGE : null)
    if (problem) { setCcError(problem); return null }
    const next = { ...base, [id]: JSON.stringify([...list, person]) }
    setAnswers(next)
    setCcDraft({ first: '', last: '', email: '' })
    setCcError('')
    return next
  }
  function removeCc(id, email) {
    const list = parseTaxIntakeContactList(answers[id]).filter(c => c.email !== email)
    set(id, list.length ? JSON.stringify(list) : '')
  }
  const ccDraftStarted = !!(ccDraft.first.trim() || ccDraft.last.trim() || ccDraft.email.trim())

  async function submit(picked = pickedPlan) {
    // A person typed into q42 but never added is added now rather than lost; one
    // who cannot be added stops the submit with the reason under the boxes.
    let toCheck = answers
    if (ccDraftStarted) {
      const ccQ = visible.find(q => q.type === 'contact_list')
      if (ccQ) {
        const next = addCc(ccQ.id, answers)
        if (!next) {
          setErrors([`${ccQ.label}: press Add for the person you typed, or clear the boxes`])
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        toCheck = next
      }
    }
    const found = [...(validatePrelude ? validatePrelude() : []), ...validateTaxIntakeAnswers(toCheck, lockedIds)]
    setErrors(found)
    setFailed('')
    if (found.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    try {
      const normalized = normalizeTaxIntakeAnswers(toCheck)
      const res = publicMode
        ? await onPublicSubmit(normalized)
        : await callApi('tax_intake_submit', { answers: normalized, ...(taxRoute === 'direct' ? { tax_route: 'direct' } : {}), ...(existingClient ? { client_id: existingClient.id } : {}), ...(picked?.body || {}) })
      // A url means the deposit is owed — since 2026-09-23 it is the card-or-ACH
      // choice page (/tax-deposit-pay), for route A and route B alike.
      if (res?.url) { window.location.assign(res.url); return }
      onDone?.(res)
    } catch (err) {
      if (askForPlan(err, 'form')) return
      setFailed(err?.message || 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  async function sendLink(picked = pickedPlan) {
    setFailed('')
    const first = formatPersonName(linkForm.first)
    const last = formatPersonName(linkForm.last)
    const email = cleanText(linkForm.email)
    const found = []
    if (!first) found.push('Client First Name is required')
    if (!last) found.push('Client Last Name is required')
    if (!email) found.push('Client Email is required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.push('Client Email must be a valid email address')
    const badName = existingClient ? null : nameProblem(first, last)
    if (badName) found.push(badName)
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
        ...(existingClient ? { client_id: existingClient.id } : {}),
        ...(picked?.body || {}),
      })
      onDone?.({ link_sent_to: `${first} ${last}`.trim() })
    } catch (err) {
      if (askForPlan(err, 'link')) return
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
              <span>
                {opt}
                {q.optionNotes?.[opt] && (
                  <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{q.optionNotes[opt]}</span>
                )}
              </span>
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
    // q42: first name, last name and email, then Add (or Enter in any box); each
    // added person is a pill with its own remove button. Names tidy when a box
    // is left, exactly like the client's own.
    if (q.type === 'contact_list') {
      const list = parseTaxIntakeContactList(val)
      const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); addCc(q.id) } }
      const draft = (k, v) => { setCcDraft(d => ({ ...d, [k]: v })); if (ccError) setCcError('') }
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1.4fr auto', gap: '8px' }}>
            <input type="text" value={ccDraft.first} placeholder="First name" aria-label="First name"
              onChange={e => draft('first', e.target.value)} onBlur={() => draft('first', formatPersonName(ccDraft.first))}
              onKeyDown={onKey} style={{ ...inputStyle, minWidth: 0 }} />
            <input type="text" value={ccDraft.last} placeholder="Last name" aria-label="Last name"
              onChange={e => draft('last', e.target.value)} onBlur={() => draft('last', formatPersonName(ccDraft.last))}
              onKeyDown={onKey} style={{ ...inputStyle, minWidth: 0 }} />
            <input type="email" value={ccDraft.email} placeholder="name@example.com" aria-label="Email"
              onChange={e => draft('email', e.target.value)} onKeyDown={onKey} style={{ ...inputStyle, minWidth: 0 }} />
            <button type="button" onClick={() => addCc(q.id)} disabled={!ccDraftStarted}
              style={{ padding: isPhone ? '10px 18px' : '0 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: ccDraftStarted ? 'pointer' : 'not-allowed', border: '1px solid #125ecc', background: 'transparent', color: '#125ecc', fontFamily: 'Inter, sans-serif' }}>
              Add
            </button>
          </div>
          {ccError && <div style={{ marginTop: '6px', fontSize: '12px', color: '#d93025' }}>{ccError}</div>}
          {list.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {list.map(({ first_name, last_name, email }) => (
                <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 6px 4px 12px', borderRadius: '999px', background: 'rgba(18,94,204,0.08)', border: '1px solid rgba(18,94,204,0.22)', fontSize: '12.5px', color: 'var(--vfo-ink)', maxWidth: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first_name} {last_name} &middot; {email}</span>
                  <button type="button" onClick={() => removeCc(q.id, email)} aria-label={`Remove ${first_name} ${last_name}`}
                    style={{ border: 'none', background: 'transparent', color: 'var(--vfo-muted)', cursor: 'pointer', fontSize: '15px', lineHeight: 1, padding: '0 4px', fontFamily: 'Inter, sans-serif' }}>
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }
    // q5 shapes itself as typed; q2 / q3 names tidy when the box is left
    // (src/lib/formatters.js - the server tidies again on save).
    if (q.format === 'phone') {
      return <PhoneInput value={val} disabled={locked} onChange={v => set(q.id, v)}
        style={{ ...inputStyle, opacity: locked ? 0.65 : 1, cursor: locked ? 'not-allowed' : 'text' }} />
    }
    // A money box shows commas as it is typed (2026-10-26); the server strips them.
    if (q.type === 'money') {
      return (
        <input type="text" inputMode="decimal" value={formatTaxIntakeMoneyInput(val)} disabled={locked}
          onChange={e => set(q.id, formatTaxIntakeMoneyInput(e.target.value))} placeholder="$"
          style={{ ...inputStyle, opacity: locked ? 0.65 : 1, cursor: locked ? 'not-allowed' : 'text' }} />
      )
    }
    return (
      <input
        type="text"
        value={val}
        disabled={locked}
        onChange={e => set(q.id, e.target.value)}
        onBlur={locked ? undefined : q.format === 'name' ? () => set(q.id, formatPersonName(val)) : q.format === 'preferred' ? () => set(q.id, formatPreferredName(val)) : undefined}
        style={{ ...inputStyle, opacity: locked ? 0.65 : 1, cursor: locked ? 'not-allowed' : 'text' }}
      />
    )
  }

  // q41 Yes (international tax): the $500 deposit is always taken — the
  // qualifying-client waiver never applies. The server decides the same way.
  const international = isInternationalTaxCase(answers)
  const baseDepositRequired = publicMode
    ? publicIntake?.deposit_required
    : eligibility?.deposit_required
  // A plan picked that has a deposit, is Holistic or is not in progress takes none.
  const planTakesNone = !!pickedPlan?.plan && !pickedPlan.plan.takes_deposit
  const depositRequired = planTakesNone ? false : international && baseDepositRequired === false ? true : baseDepositRequired
  const depositAmount = publicMode ? (publicIntake?.deposit_amount || 500) : (eligibility?.deposit_amount || 500)
  // The member's own form, a deposit normally waived, and q41 Yes: say why it is due.
  // The public diagnostic page has no signed-in member, so a member filling it in
  // gets the hedged wording instead (whether a named member's deposit is waived is
  // never revealed to an unsigned-in page).
  const waiverLostNote = !international || planTakesNone ? ''
    : !publicMode
      ? (eligibility && eligibility.deposit_required === false ? TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE : '')
      : (memberFilling && !publicIntake ? TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE_PUBLIC : '')

  // The public diagnostic page (no intake row yet) takes no payment and quotes none.
  const depositLine = lockClientIdentity || (publicMode && !publicIntake)
    ? null
    : planTakesNone
      ? 'Deposit: none, this plan does not need one'
    : international && (publicMode || eligibility != null)
      ? `Deposit: $${depositAmount} (international tax case)`
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

  // ─── Started for an existing client that could not be loaded ────────────
  if (existingClientId && existingError) return (
    <div style={{ ...sectionStyle, borderColor: 'rgba(224,103,23,0.35)' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '8px' }}>
        This client could not be loaded
      </div>
      <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
        {existingError}
      </div>
      <button type="button" onClick={onCancel}
        style={{ marginTop: '16px', padding: '8px 18px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
        Start a different Tax Diagnostic
      </button>
    </div>
  )

  // ─── The client already has a tax plan ────────────────────────────────
  if (planPick) {
    const chosen = planPick.plans.find(p => String(p.id) === planChoice) || null
    const problem = planPickProblem(planChoice, planPick.plans, replaceForm)
    // Where the member was: the form or the link they were sending. Started from the
    // client's Vault, the plan is asked first and the choices follow.
    const back = () => {
      if (planPick.resume === null) { onCancel?.(); return }
      setPlanPick(null)
    }
    const next = () => {
      const picked = { body: planPickBody(planChoice, planPick.plans, replaceForm), plan: chosen }
      const resume = planPick.resume
      setPickedPlan(picked)
      setPlanPick(null)
      if (resume === 'form') submit(picked)
      else if (resume === 'link') sendLink(picked)
    }
    const willPay = planPick.resume === 'form' && (chosen ? chosen.takes_deposit : true) && (international || baseDepositRequired !== false)
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          {!pageHeading && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>}
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: pageHeading ? '18px' : '22px', color: 'var(--vfo-heading)' }}>{planPick.clientName || 'This client'} already has a tax plan</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px', lineHeight: 1.6 }}>Which plan is this form for?</div>
        </div>
        <div style={sectionStyle}>
          <TaxFormPlanPicker clientName={planPick.clientName} plans={planPick.plans} choice={planChoice}
            onChoice={c => { setPlanChoice(c); setReplaceForm(false) }} replace={replaceForm} onReplace={setReplaceForm} disabled={submitting} />
          {chosen && !chosen.takes_deposit && <div style={{ fontSize: '12.5px', fontWeight: 600, color: green, marginTop: '4px' }}>No deposit is needed for this plan.</div>}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '32px' }}>
          <button type="button" onClick={back} disabled={submitting}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            {planPick.resume === null ? 'Cancel' : 'Back'}
          </button>
          <button type="button" onClick={next} disabled={!!problem || submitting} title={problem || undefined}
            style={{ padding: '10px 24px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: problem || submitting ? 'not-allowed' : 'pointer', border: 'none', background: problem || submitting ? 'var(--vfo-faint)' : '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            {planPick.resume === 'link' ? 'Send link' : planPick.resume === 'form' ? (willPay ? 'Submit and pay deposit' : 'Submit') : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  // ─── Step 1: who fills the form in? ───────────────────────────────────
  if (step === 'choose') {
    // Who RUNS the case, asked on both routes and decided here — the client is
    // never asked. Shown only to a member the server says is eligible; when the
    // feature is off for them, nothing about Direct is shown at all.
    // phoneTitle: a phone draws each toggle's two options on one line (the long
    // titles wrapped to two lines each); the sentence under the toggle explains.
    const routeOptions = [
      {
        key: 'classic',
        title: 'VFO Services runs this case',
        phoneTitle: 'VFO Services runs it',
        body: 'Our tax planning team and your VFO team run every step; you follow along.',
      },
      {
        key: 'direct',
        title: 'I run this case (Direct)',
        phoneTitle: 'I run it (Direct)',
        body: "You run the steps our VFO team normally runs; the tax planning team's steps stay with them. You act as the Planning Facilitator for this client.",
      },
    ]
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          {!pageHeading && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>}
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: pageHeading ? '18px' : '22px', color: 'var(--vfo-heading)' }}>{existingClientId ? `Start tax planning for ${existingName || 'your client'}` : 'Add a new tax client'}</div>
          {depositLine && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: eligibility && !eligibility.deposit_required ? green : 'var(--vfo-ink)', marginTop: '8px' }}>{depositLine}</div>
          )}
        </div>
        {/* Asked BEFORE the two cards below: those advance the moment they are
            clicked, so a choice placed under them could never be made. */}
        {(() => {
          const fillOptions = [
            { key: 'form', title: 'Complete the form for my client', phoneTitle: 'Fill it in now', body: `You answer the Tax Planning Form now${depositRequired === false ? '' : ' and pay the deposit'}. ${existingClientId ? 'Tax planning starts on this client as soon as you are done.' : 'The client is created as soon as you are done.'}` },
            { key: 'link', title: 'Send my client a link', phoneTitle: 'Send my client a link', body: `We email your client the Tax Planning Form${depositRequired === false ? '' : ', and they pay the deposit'}. ${existingClientId ? 'Tax planning starts on this client once they are done.' : 'You only need their name and email address.'}` },
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
                    {isPhone ? opt.phoneTitle : opt.title}
                  </button>
                )
              })}
            </div>
          )
          // 2 qualifying clients make a member READY; the VFO team's tick on their
          // profile switches Direct on (2026-10-28).
          const directNote = !eligibility
            ? 'Direct (run the case yourself) is available once you have 2 qualifying tax clients and the VFO team switches it on.'
            : directOff
              ? 'Direct (run the case yourself) is not available for your account yet.'
              : directOk
                ? 'Direct is switched on for your account.'
                : eligibility.direct_ready
                  ? `You have ${eligibility.qualifying_count > 2 ? eligibility.qualifying_count : '2/2'} qualifying tax clients. Direct is waiting for the VFO team to switch it on.`
                  : `Direct (run the case yourself) becomes available once you have 2 qualifying tax clients and the VFO team switches it on — you have ${eligibility.qualifying_count}.`
          // The route question shows only while the member's tax_direct switch is
          // on (Jake 2026-10-14); otherwise every case is classic and only the
          // fill question is asked.
          // Never for an existing client (Jake 2026-11-13): the PF is stored on
          // the client, so Direct would move every program it is on. VFO-run
          // only; the server refuses Direct there too.
          const showRoute = eligibility?.direct_enabled === true && !existingClientId
          return (
            <>
              {showRoute && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={questionStyle}>1. Who runs this case?</div>
                  <Toggle options={routeOptions} value={taxRoute} onChange={setTaxRoute} disabledKeys={directOk ? [] : ['direct']} />
                  <div style={explainStyle}>{routeOptions.find(o => o.key === taxRoute)?.body}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{directNote}</div>
                  {taxRoute === 'direct' && (
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e06717', lineHeight: 1.55, marginTop: '8px', maxWidth: '640px' }}>
                      Direct always creates a new client. If this person is already your client, choose VFO Services runs this case, so they are not added twice.
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginBottom: '24px' }}>
                <div style={questionStyle}>{showRoute ? '2. ' : ''}How will the Tax Planning Form be completed?</div>
                <Toggle options={fillOptions} value={fillMode} onChange={setFillMode} />
                <div style={explainStyle}>{fillOptions.find(o => o.key === fillMode)?.body}</div>
              </div>
            </>
          )
        })()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '32px' }}>
          <button type="button" onClick={() => { setErrors([]); setStep(fillMode) }}
            style={{ padding: isPhone ? '8px 18px' : '10px 22px', borderRadius: '999px', fontSize: isPhone ? '12.5px' : '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Continue
          </button>
          <button type="button" onClick={onCancel}
            style={{ padding: isPhone ? '8px 16px' : '10px 20px', borderRadius: '999px', fontSize: isPhone ? '12.5px' : '13px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ─── Route B: the three fields we need to email the client ────────────
  if (step === 'link') {
    // An existing client's name (and email, when the record has one) is locked.
    const linkInputStyle = locked => ({ ...inputStyle, opacity: locked ? 0.65 : 1, cursor: locked ? 'not-allowed' : 'text' })
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          {!pageHeading && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>}
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: pageHeading ? '18px' : '22px', color: 'var(--vfo-heading)' }}>Send my client a link</div>
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
              <input type="text" value={linkForm.first} disabled={!!existingClient} onChange={e => setLinkForm(f => ({ ...f, first: e.target.value }))} style={linkInputStyle(!!existingClient)} />
            </div>
            <div>
              <label style={labelStyle}>Client Last Name<span style={{ color: '#d93025' }}> *</span></label>
              <input type="text" value={linkForm.last} disabled={!!existingClient} onChange={e => setLinkForm(f => ({ ...f, last: e.target.value }))} style={linkInputStyle(!!existingClient)} />
            </div>
            <div>
              <label style={labelStyle}>Client Email<span style={{ color: '#d93025' }}> *</span></label>
              <input type="text" value={linkForm.email} disabled={!!existingClient?.email} onChange={e => setLinkForm(f => ({ ...f, email: e.target.value }))} style={linkInputStyle(!!existingClient?.email)} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '32px' }}>
          <button type="button" onClick={() => { setErrors([]); setStep('choose') }} disabled={submitting}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            Back
          </button>
          <button type="button" onClick={() => sendLink()} disabled={submitting}
            style={{ padding: '10px 24px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: submitting ? 'var(--vfo-faint)' : '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif', boxShadow: submitting ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
            {submitting ? 'Sending...' : 'Send link'}
          </button>
        </div>
      </div>
    )
  }

  // ─── The intake questions ─────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        {!pageHeading && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>VFO Tax Planning</div>}
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: pageHeading ? '18px' : '22px', color: 'var(--vfo-heading)' }}>{title || 'Tax Planning Form'}</div>
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
      </div>

      {errorBox}
      {failBox}

      {prelude && <div style={questionsStyle}>{prelude}</div>}

      <div style={questionsStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px 28px' }}>
          {numberTaxIntakeQuestions(visible, answers, numberOffset).map(({ q, num }) => (
            <div key={q.id} style={q.type === 'textarea' || q.type === 'contact_list' ? { gridColumn: '1 / -1' } : undefined}>
              <label style={labelStyle}>
                {num}. {clientFilling && q.selfLabel ? q.selfLabel : q.label}{q.required && <span style={{ color: '#d93025' }}> *</span>}
              </label>
              {q.note && <div style={noteStyle}>{q.note}</div>}
              {renderInput(q)}
              {q.poorFitOption && answers[q.id] === q.poorFitOption && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#e06717', lineHeight: 1.55 }}>
                  {TAX_INTAKE_POOR_FIT_WARNING}
                </div>
              )}
              {q.alertOption && q.alertText && answers[q.id] === q.alertOption && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#e06717', lineHeight: 1.55 }}>
                  {q.alertText}
                  {q.id === 'q41' && waiverLostNote && (
                    <div style={{ marginTop: '6px', fontWeight: 600 }}>{waiverLostNote}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showTestFill && (
        <div style={{ margin: '0 0 16px', padding: '12px 16px', border: '1px dashed #e06717', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12.5px', color: '#e06717', fontWeight: 600 }}>Test site only: fill every question with test values.</span>
          <button type="button" onClick={fillTestValues} disabled={submitting}
            style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid #e06717', background: 'transparent', color: '#e06717', fontFamily: 'Inter, sans-serif' }}>
            Fill with test values
          </button>
        </div>
      )}
      {waiverLostNote && (
        <div style={{ margin: '0 0 12px', textAlign: 'right', fontSize: '12.5px', fontWeight: 600, color: '#e06717', lineHeight: 1.5 }}>
          {waiverLostNote}
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '32px' }}>
        {!publicMode && (
          <button type="button" onClick={() => setStep('choose')} disabled={submitting}
            style={{ padding: '10px 20px', borderRadius: '999px', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
            Back
          </button>
        )}
        <button type="button" onClick={() => submit()} disabled={submitting}
          style={{ padding: '10px 24px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: submitting ? 'var(--vfo-faint)' : '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif', boxShadow: submitting ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
          {submitting ? 'Submitting...' : (submitLabel || (depositRequired === false ? 'Submit' : 'Submit and pay deposit'))}
        </button>
      </div>
    </div>
  )
}
