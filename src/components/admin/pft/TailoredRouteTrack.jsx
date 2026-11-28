import { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, loadCachedAction, getLastSeen, setLastSeen } from '../../../lib/api'
import { PhaseNotesButton, PhaseNotesPanel, useOpenLinkedNote } from '../../shared/PhaseNotes'
import { PFTTrackSkeleton } from '../../shared/Skeleton'
import { AutoSteps, PhaseCard, StepAnswer, StepRow, stepSelect, SubStepRow, TrackHero } from '../../shared/TrackKit'
import { btnState, btnStep, stepChoice, stepSend } from '../../shared/buttonStyles'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'
import { readable } from '../../shared/readableColor'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { TAILORED_PROGRAM } from '../../shared/accountantPrograms'
import OnboardingPhaseChip from './OnboardingPhaseChip'
import { formatDate } from '../../../lib/dates'

// Tailored Route for Accountants (2026-11-12): two steps. The Tailored meeting
// (Completed / No show, recorded only), then the Post Meeting Decision Email: the
// team ticks which paths to offer (VFO FT Accountant, VFO Associate Accountant,
// or both), types the middle of the email, and the accountant answers from the
// email - their choice, "I have questions", or No. A choice runs the same work as
// a Partnership Fast Track decision (actions/pft/decision-email.ts on the edge
// repo), so the engagement row is pft_engagement with track='tailored_route'.

const PFT_PIPELINE = 'PARTNERSHIP_FAST_TRACK'
const MEETING_TASK = 'Tailored meeting'
const DECISION_TASK = 'Post Meeting Decision Email'
const AWAITING = 'Decision email sent - awaiting accountant'
const NOTES_TAB = 'Tailored'

const TRA_DECISION_EMAILS = [
  { name: 'TRA_decision', when: 'The decision email - your text in the middle, the buttons you ticked, the matching agreements attached' },
  { name: 'TRA_decision_reminder', when: 'Automatic reminder if the accountant has not answered (2 business days)' },
  { name: 'TRA_question_reply', when: 'Your reply when the accountant clicks "I have questions"' },
  { name: 'TRA_decision_vfo_ft', when: 'After the accountant picks VFO FT' },
  { name: 'TRA_decision_vfo_ft_reminder', when: 'Automatic reminder on the VFO FT follow-up (2 business days)' },
  { name: 'TRA_decision_vfo_associate', when: 'After the accountant picks VFO Associate' },
  { name: 'TRA_decision_vfo_associate_reminder', when: 'Automatic reminder on the VFO Associate follow-up (2 business days)' },
  { name: 'TRA_decision_no', when: 'After the accountant picks No' },
]

// decision_options on pft_engagement (actions/pft/_shared.ts UNDECIDED_OPTIONS).
const OPTION_LABELS = { ft_no: 'VFO FT Accountant', associate_no: 'VFO Associate Accountant', ft_associate_no: 'VFO FT Accountant + VFO Associate Accountant' }
const PATH_LABEL = { vfo_ft: 'VFO FT Accountant', vfo_associate: 'VFO Associate Accountant', no: 'No' }
const FT_LABEL = { confirm: 'Confirm onboarding - no further meeting', another_meeting: "I'd like another meeting" }
// The sample agreements the decision email attaches (the edge repo's
// actions/pft/_shared.ts TRA_AGREEMENTS names the same files).
const AGREEMENT_NAMES = { ft: 'Accountant-Implementation-Agreement.pdf', associate: 'VFO-Associate-Agreement.pdf' }

const statusColors = { Completed: '#1b9254', 'No show': '#e74c3c', [AWAITING]: '#e06717', 'VFO FT confirmed': '#1b9254', 'VFO Associate confirmed': '#1b9254', 'No confirmed': '#e74c3c' }
const inputStyle = stepSelect
function nameCtx(client) {
  const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
  const ctx = {}
  if (full) { ctx.FULL_NAME = full; ctx.FIRST_NAME = client.first_name || full.split(/\s+/)[0] }
  return ctx
}

// A done step's answer: plain text in its colour, never a tag (Completed says
// nothing the dot and date do not).
function StatusPill({ status, color }) {
  if (status === 'Completed') return null
  return <StepAnswer color={readable(color)}>{status}</StepAnswer>
}

function autoStep(label, done, at = null) {
  return <SubStepRow done={done} name={label} date={<StepDate value={done ? at : ''} readOnly />} />
}

// "Reached out?" under a 4-business-day PF notice (automation_stall_ack, the
// same pft_engagement columns PFT uses).
function StallAckRow({ id, stall, ackAt, onAck }) {
  const [checked, setChecked] = useState(!!ackAt)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setChecked(!!ackAt) }, [ackAt])
  async function toggle(next) {
    setChecked(next)
    setSaving(true)
    try {
      const res = await callApi('automation_stall_ack', { pipeline: 'pft', id, stall, ack: next })
      onAck(res?.ack_at || null)
    } catch (err) { console.error('Stall ack error:', err); setChecked(!next) }
    finally { setSaving(false) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', marginLeft: '14px' }}>
      <input type="checkbox" checked={checked} disabled={saving} onChange={e => toggle(e.target.checked)} style={{ cursor: saving ? 'default' : 'pointer' }} />
      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Reached out?</span>
      {checked && ackAt && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{formatDate(ackAt)}</span>}
    </div>
  )
}

// Step 1: Completed / No show, recorded only (Jake, 2026-11-12).
function MeetingStep({ task, p, readOnly, saving, onSelect, onDate }) {
  const isDone = !!p.status
  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'
  return (
    <StepRow done={isDone} dotColor={statusColor} name={task.name} date={<StepDate value={isDone ? p.completed_date : ''} />}>
      {readOnly
        ? (isDone ? <StatusPill status={p.status} color={statusColor} /> : null)
        : <select value={p.status || ''} onChange={e => onSelect(e.target.value)} disabled={saving} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? readable(statusColor) : 'var(--vfo-ink)' }}>
            <option value="">-- Select --</option>
            {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
      }
    </StepRow>
  )
}

// The email's buttons as the accountant will see them, for the preview.
function ButtonPreview({ ft, associate }) {
  const pill = (label, bg) => <span style={{ display: 'inline-block', padding: '7px 14px', borderRadius: '6px', background: bg, color: '#fff', fontSize: '12px', fontWeight: 700, margin: '0 4px 6px 0' }}>{label}</span>
  return (
    <div style={{ textAlign: 'center', margin: '4px 0 12px' }}>
      {ft && pill('VFO FT Accountant', '#16a34a')}
      {associate && pill('VFO Associate Accountant', '#16a34a')}
      {pill('No', '#dc2626')}
      <div>{pill('I have questions', '#2563eb')}</div>
    </div>
  )
}

// Step 2: the decision email card - tick the paths, type the middle, preview, send.
// The card copies PFT's "we declined" reason card (PFTEngagementTrack MeetingStep).
function DecisionStep({ task, p, readOnly, client, onSend, onDate }) {
  const [open, setOpen] = useState(false)
  const [ft, setFt] = useState(false)
  const [associate, setAssociate] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const isDone = !!p.status
  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'
  const clientFirst = client?.first_name || '[Client First]'
  const clientFull = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
  const canSend = (ft || associate) && message.trim() && !pending
  const attachments = [ft && AGREEMENT_NAMES.ft, associate && AGREEMENT_NAMES.associate].filter(Boolean)

  async function send() {
    if (!canSend) return
    setPending(true); setError('')
    try {
      await onSend(ft && associate ? 'ft_associate_no' : ft ? 'ft_no' : 'associate_no', message.trim())
      setOpen(false); setMessage(''); setFt(false); setAssociate(false)
    } catch (err) { setError(err.message || 'The email could not be sent') }
    finally { setPending(false) }
  }

  const checkRow = (checked, set, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: pending ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={pending} onChange={e => set(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <StepRow
        done={isDone}
        dotColor={statusColor}
        name={task.name}
        style={{ borderBottom: 'none' }}
        emails={!readOnly && <StepEmailsChip pipeline={PFT_PIPELINE} title={task.name} templates={TRA_DECISION_EMAILS} context={nameCtx(client)} />}
        date={<StepDate value={isDone ? p.completed_date : ''} />}
      >
        {isDone
          ? <StatusPill status={p.status} color={statusColor} />
          : readOnly
            ? null
            : open ? null : <button onClick={() => { setError(''); setOpen(true) }} style={stepChoice}>Write decision email</button>
        }
      </StepRow>
      {open && !isDone && !readOnly && (
        <div style={{ marginLeft: '18px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 600, marginBottom: '8px' }}>Which options should the accountant see? (at least one)</div>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {checkRow(ft, setFt, 'VFO FT Accountant')}
            {checkRow(associate, setAssociate, 'VFO Associate Accountant')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '14px' }}>"I have questions" and "No" are always on the email.</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Subject: VFO Services - Next Steps - {clientFull || '[Client Name]'}
          </div>
          <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
            <p style={{ margin: '0 0 12px' }}>Hi {clientFirst},</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type the middle of the email here - written as if speaking directly to the accountant."
              disabled={pending}
              style={{ width: '100%', minHeight: '110px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
            />
            <p style={{ margin: '0 0 12px' }}>Please let us know how you'd like to move forward by clicking one of the buttons below. <b>Once clicked, please allow a moment for the page to load - this confirms your choice has been received.</b></p>
            {(ft || associate)
              ? <ButtonPreview ft={ft} associate={associate} />
              : <p style={{ margin: '0 0 12px', fontStyle: 'italic', color: 'var(--vfo-muted)' }}>[Tick at least one option to see the buttons]</p>}
            <p style={{ margin: 0 }}>Regards,</p>
            <p style={{ color: '#00488d', marginTop: '24px', borderTop: '1px solid #00488d', paddingTop: '16px', marginBottom: 0 }}>
              <strong style={{ fontSize: '18px', letterSpacing: '0.5px' }}>VFO Services - Proactive Coordinator Team</strong>
            </p>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '12px' }}>
            Attached: {attachments.length ? attachments.join(', ') : 'none until an option is ticked'}
          </div>
          {error && <div style={{ color: '#d93025', fontSize: '12px', marginTop: '10px' }}>{error}</div>}
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button disabled={pending} onClick={() => { setOpen(false); setError('') }} style={btnState(btnStep, pending)}>Cancel</button>
            <button disabled={!canSend} onClick={send} style={btnState(stepSend, !canSend)}>{pending ? 'Sending...' : 'Send Decision Email'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// One question from the accountant, with its reply (or the reply box while open).
function QuestionRow({ q, isOpen, chose, readOnly, onReply }) {
  const [reply, setReply] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function send() {
    if (!reply.trim() || pending) return
    setPending(true); setError('')
    try { await onReply(reply.trim()); setReply('') }
    catch (err) { setError(err.message || 'The reply could not be sent') }
    finally { setPending(false) }
  }
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Accountant's question · {formatDate(q.asked_at)}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{q.question}</div>
      {q.reply ? (
        <>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--vfo-success-text)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 2px' }}>Our reply · {formatDate(q.replied_at)}</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{q.reply}</div>
        </>
      ) : isOpen && !readOnly ? (
        <div style={{ marginTop: '8px' }}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} disabled={pending} placeholder="Type your reply - it is emailed to the accountant with the same buttons."
            style={{ width: '100%', minHeight: '80px', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: 1.5, boxSizing: 'border-box', resize: 'vertical' }} />
          {error && <div style={{ color: '#d93025', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button onClick={send} disabled={!reply.trim() || pending} style={btnState(stepSend, !reply.trim() || pending)}>{pending ? 'Sending...' : 'Send reply'}</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '6px', fontStyle: 'italic' }}>{chose ? 'Not answered - the accountant chose an option' : 'Awaiting our reply'}</div>
      )}
    </div>
  )
}

// Automated steps under the decision step: the email, its reminder ladder, any
// questions, the accountant's choice and the onboarding handoff.
function DecisionHistory({ eng, onboarding, readOnly, onAck, onReply, onOpenOnboarding }) {
  const isPhone = useIsPhone()
  if (!eng?.decision_email_sent_at) return null
  const decResp = eng.decision_response || null
  const ftEmailSent = !!eng.ft_email_sent_at
  const ftResp = eng.ft_response || null
  const questions = Array.isArray(eng.decision_questions) ? eng.decision_questions : []
  const openIdx = eng.decision_question_open_at ? questions.length - 1 : -1
  const complete = decResp === 'no' || !!ftResp

  const reminderStep = (at) => at ? autoStep('2-business-day reminder email sent to the accountant', true, at) : null
  const pfNotifiedStep = (stall, at, ackAt) => at ? (
    <>
      {autoStep('4-business-day mark passed - assigned PF notified to follow up', true, at)}
      {!readOnly && <StallAckRow id={eng.id} stall={stall} ackAt={ackAt} onAck={v => onAck(stall, v)} />}
    </>
  ) : null

  return (
    <AutoSteps done={complete}>
        {autoStep(`Decision email sent to the accountant (${OPTION_LABELS[eng.decision_options] || OPTION_LABELS.ft_associate_no})`, true, eng.decision_email_sent_at)}
        {eng.decision_message && (
          <div style={{ padding: '6px 0 6px 14px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Your message</div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{eng.decision_message}</div>
          </div>
        )}
        {questions.map((q, i) => <QuestionRow key={i} q={q} isOpen={i === openIdx} chose={!!decResp} readOnly={readOnly} onReply={onReply} />)}
        {reminderStep(eng.decision_reminder_sent_at)}
        {pfNotifiedStep('decision', eng.decision_pf_notified_at, eng.decision_pf_ack_at)}
        {decResp
          ? autoStep(`Accountant chose "${PATH_LABEL[decResp]}"`, true, eng.decision_response_at)
          : autoStep('Waiting for the accountant to choose', false)}
        {decResp === 'no' && autoStep('Decline email sent to the accountant', true)}
        {(decResp === 'vfo_ft' || decResp === 'vfo_associate') && (
          <>
            {autoStep(`Accountant Onboarding record created (${PATH_LABEL[decResp]})`, !!onboarding, onboarding?.created_at)}
            {autoStep('Confirmation email sent with the "need another meeting?" choice', ftEmailSent, eng.ft_email_sent_at)}
            {reminderStep(eng.ft_reminder_sent_at)}
            {pfNotifiedStep('ft', eng.ft_pf_notified_at, eng.ft_pf_ack_at)}
            {ftResp
              ? autoStep(`Accountant chose "${FT_LABEL[ftResp]}" in the follow-up email`, true, eng.ft_response_at)
              : (ftEmailSent && autoStep('Waiting for the accountant to respond to the follow-up email', false))}
            {onboarding && (
              <SubStepRow last done={!!onboarding.member_created_at} name="Accountant onboarding progress" date={<StepDate value={onboarding.member_created_at || ''} readOnly />}>
                <OnboardingPhaseChip onboarding={onboarding} />
                {!readOnly && <button onClick={() => onOpenOnboarding(onboarding.id)} style={stepChoice}>View onboarding →</button>}
              </SubStepRow>
            )}
          </>
        )}
    </AutoSteps>
  )
}

export default function TailoredRouteTrack({ clientId, programId, client, readOnly = false, memberNotes = false, memberCanAdd = false, notes = [], onNotesChange, initialNoteId = null }) {
  const navigate = useNavigate()
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [engagement, setEngagement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})

  const snapKey = `tratrack:${clientId}:${programId ?? ''}`

  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) {
      applyTrack(snap.trackData, snap.progressData, snap.engData)
      setLoading(false)
    }
    loadTrack(!!snap)
  }, [clientId])

  async function loadTrack(quiet = false) {
    if (quiet !== true) setLoading(true)
    try {
      const [trackData, progressData, engData] = await Promise.all([
        loadCachedAction('msm_load_client_track', { program_id: programId, track_type: 'tailored_route' }),
        callApi('msm_load_client_progress', { client_id: clientId }),
        callApi('pft_load_engagement', { client_id: clientId }),
      ])
      applyTrack(trackData, progressData, engData)
      setLastSeen(snapKey, { trackData, progressData, engData })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function applyTrack(trackData, progressData, engData) {
    const loadedPhases = trackData.phases || []
    setPhases(loadedPhases)
    const prog = {}
    ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
    setProgress(prog)
    setEngagement(engData || null)
    // Open every phase that still has a step to do, plus the decision phase while
    // the accountant's answer (or a question) is outstanding.
    const eng = engData?.engagement || null
    const expandState = {}
    loadedPhases.forEach(phase => {
      const tasks = phase.program_client_tasks || []
      const allDone = tasks.every(t => prog[t.id]?.status)
      const waiting = tasks.some(t => t.name === DECISION_TASK) && eng?.decision_email_sent_at && !(eng.decision_response === 'no' || eng.ft_response)
      expandState[phase.id] = !allDone || !!waiting
    })
    setExpanded(expandState)
  }

  async function reloadEngagement() {
    try { const engData = await callApi('pft_load_engagement', { client_id: clientId }); setEngagement(engData || null) } catch (err) { console.error(err) }
  }

  async function saveTask(taskId, status, existingDate) {
    const today = new Date().toISOString().split('T')[0]
    const date = existingDate || (status ? today : null)
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status, completed_date: date || null, completed_by: null, notes: null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  async function handleDecisionSend(task, options, message) {
    await callApi('automation_TRA_decisionemail', { client_id: clientId, task_id: task.id, options, message })
    const today = new Date().toISOString().split('T')[0]
    setProgress(prev => ({ ...prev, [task.id]: { ...prev[task.id], task_id: task.id, status: AWAITING, completed_date: today } }))
    await reloadEngagement()
  }

  async function handleReply(reply) {
    await callApi('automation_TRA_questionreply', { client_id: clientId, reply })
    await reloadEngagement()
  }

  function applyStallAck(stall, ackAt) {
    setEngagement(prev => prev?.engagement ? { ...prev, engagement: { ...prev.engagement, [`${stall}_pf_ack_at`]: ackAt } } : prev)
  }

  function openOnboarding(id) {
    sessionStorage.setItem('accountantOnboardingOpenId', String(id))
    navigate('/admin?tab=accountants&section=accountant_onboarding')
  }

  useOpenLinkedNote(initialNoteId, notes, !loading && phases.length ? phases : null, (note) => {
    if (note.tab_name !== NOTES_TAB) return null
    const phase = phases.find(ph => ph.name === note.phase_name)
    return phase ? [phase.id, `notes_${phase.id}`] : null
  }, setExpanded)

  if (loading) return <PFTTrackSkeleton phases={[1, 1]} readOnly={readOnly} />

  const eng = engagement?.engagement || null
  const onboarding = engagement?.onboarding || null

  // A step counts as done once it has a status; the decision step's "awaiting"
  // status is the email being out, not the accountant's answer.
  const isTaskDone = (t) => {
    const s = progress[t.id]?.status
    return !!s && s !== AWAITING
  }
  const phaseState = (phase) => {
    const tasks = phase.program_client_tasks || []
    if (tasks.length && tasks.every(isTaskDone)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }
  const heroSteps = phases.map(phase => ({ id: phase.id, label: phase.name, state: phaseState(phase) }))
  const allTasks = phases.flatMap(p => p.program_client_tasks || [])

  function renderTask(task) {
    const p = progress[task.id] || {}
    if (task.name === DECISION_TASK) {
      return (
        <div key={task.id}>
          <DecisionStep task={task} p={p} readOnly={readOnly} client={client} onSend={(options, message) => handleDecisionSend(task, options, message)} onDate={(d) => saveTask(task.id, p.status, d)} />
          <DecisionHistory eng={eng} onboarding={onboarding} readOnly={readOnly} onAck={applyStallAck} onReply={handleReply} onOpenOnboarding={openOnboarding} />
        </div>
      )
    }
    return <MeetingStep key={task.id} task={task} p={p} readOnly={readOnly} saving={!!saving[task.id]} onSelect={(v) => saveTask(task.id, v, p.completed_date)} onDate={(d) => saveTask(task.id, p.status, d)} />
  }

  return (
    <div className="vfo-track">
      <TrackHero
        eyebrow={TAILORED_PROGRAM}
        title="Engagement Process"
        completed={allTasks.filter(isTaskDone).length}
        total={allTasks.length}
        steps={heroSteps}
      />
      {phases.map((phase, i) => {
        const state = phaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const doneTasks = tasks.filter(isTaskDone).length
        return (
          <PhaseCard
            key={phase.id}
            number={i + 1}
            state={state}
            name={phase.name}
            done={doneTasks}
            total={tasks.length}
            open={isExpanded}
            onToggle={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))}
            notes={(!readOnly || memberNotes) && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === NOTES_TAB).length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
            notesPanel={(!readOnly || memberNotes) && expanded[`notes_${phase.id}`] && <PhaseNotesPanel memberMode={!!memberNotes} canAdd={!memberNotes || !!memberCanAdd} clientId={clientId} phaseName={phase.name} tabName={NOTES_TAB} programName={TAILORED_PROGRAM} notes={notes} onNotesChange={onNotesChange} />}
          >
            {tasks.map(renderTask)}
          </PhaseCard>
        )
      })}
    </div>
  )
}
