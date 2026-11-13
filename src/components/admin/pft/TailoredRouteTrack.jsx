import { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, loadCachedAction, getLastSeen, setLastSeen } from '../../../lib/api'
import { PhaseNotesButton, PhaseNotesPanel, useOpenLinkedNote } from '../../shared/PhaseNotes'
import { PFTTrackSkeleton } from '../../shared/Skeleton'
import { TrackHero, PhaseBadge, noMultiClickSelect } from '../../shared/TrackKit'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'
import { readable } from '../../shared/readableColor'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { TAILORED_PROGRAM } from '../../shared/accountantPrograms'

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
const inputStyle = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
const dateSpanStyle = { fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'left', flexShrink: 0 }
const greenBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600 }
const blueBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }

function formatDate(d) {
  if (!d) return ''
  const parts = String(d).split('-')
  return `${parts[1]}/${parts[2]}`
}

// MM/DD: a plain DATE is split as a string; a timestamp reads in local time.
const fmtMMDD = (v) => {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return `${p[1]}/${p[2]}` }
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function nameCtx(client) {
  const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
  const ctx = {}
  if (full) { ctx.FULL_NAME = full; ctx.FIRST_NAME = client.first_name || full.split(/\s+/)[0] }
  return ctx
}

function Dot({ done, color }) {
  return <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? color : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? color : 'var(--vfo-border-mid)'}` }} />
}

function StatusPill({ status, color }) {
  return <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${color}22`, color: readable(color), border: `1px solid ${color}44` }}>{status}</span>
}

function NotStarted() {
  return <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
}

function autoStep(label, done, at = null) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
      <span className="vfo-substepname" style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
      {done
        ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: 'var(--vfo-success-text)', fontWeight: 600, marginLeft: 'auto' }}>Done</span>
        : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', marginLeft: 'auto' }}>Not completed</span>}
      {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
    </div>
  )
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
      {checked && ackAt && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(ackAt)}</span>}
    </div>
  )
}

// Step 1: Completed / No show, recorded only (Jake, 2026-11-12).
function MeetingStep({ task, p, readOnly, saving, onSelect, onDate }) {
  const isDone = !!p.status
  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <Dot done={isDone} color={statusColor} />
      <span className="vfo-stepname" style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
      {readOnly
        ? (isDone ? <StatusPill status={p.status} color={statusColor} /> : <NotStarted />)
        : <select value={p.status || ''} onChange={e => onSelect(e.target.value)} disabled={saving} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? readable(statusColor) : 'var(--vfo-ink)' }}>
            <option value="">-- Select --</option>
            {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
      }
      {readOnly
        ? <span className="vfo-stepdate" style={dateSpanStyle}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
        : <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={onDate} disabled={saving} />
      }
    </div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
        <Dot done={isDone} color={statusColor} />
        <span className="vfo-stepname" style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}{!readOnly && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline={PFT_PIPELINE} title={task.name} templates={TRA_DECISION_EMAILS} context={nameCtx(client)} /></span>}</span>
        {isDone
          ? <StatusPill status={p.status} color={statusColor} />
          : readOnly
            ? <NotStarted />
            : open ? null : <button onClick={() => { setError(''); setOpen(true) }} style={greenBtn}>Write decision email</button>
        }
        {readOnly
          ? <span className="vfo-stepdate" style={dateSpanStyle}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
          : <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={onDate} disabled={pending} />
        }
      </div>
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
            <button disabled={pending} onClick={() => { setOpen(false); setError('') }} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: pending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
            <button disabled={!canSend} onClick={send} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: canSend ? 'pointer' : 'not-allowed', border: '1px solid rgba(27,146,84,0.4)', background: canSend ? 'rgba(27,146,84,0.18)' : 'rgba(27,146,84,0.06)', color: 'var(--vfo-success-text)', fontWeight: 600 }}>{pending ? 'Sending...' : 'Send Decision Email'}</button>
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
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Accountant's question · {fmtMMDD(q.asked_at)}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{q.question}</div>
      {q.reply ? (
        <>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--vfo-success-text)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 2px' }}>Our reply · {fmtMMDD(q.replied_at)}</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{q.reply}</div>
        </>
      ) : isOpen && !readOnly ? (
        <div style={{ marginTop: '8px' }}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} disabled={pending} placeholder="Type your reply - it is emailed to the accountant with the same buttons."
            style={{ width: '100%', minHeight: '80px', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: 1.5, boxSizing: 'border-box', resize: 'vertical' }} />
          {error && <div style={{ color: '#d93025', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button onClick={send} disabled={!reply.trim() || pending} style={{ ...blueBtn, opacity: (!reply.trim() || pending) ? 0.6 : 1, cursor: (!reply.trim() || pending) ? 'not-allowed' : 'pointer' }}>{pending ? 'Sending...' : 'Send reply'}</button>
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
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: complete ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${complete ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
        <span className="vfo-stepname" style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1, fontWeight: '600' }}>Automated steps</span>
      </div>
      <div style={{ marginLeft: isPhone ? 0 : '18px', padding: isPhone ? '8px 10px' : '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
                <span className="vfo-substepname" style={{ fontSize: '12px', color: 'var(--vfo-ink)', flex: 1 }}>Accountant onboarding progress</span>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{onboarding.stage_label}</span>
                {!readOnly && <button onClick={() => onOpenOnboarding(onboarding.id)} style={blueBtn}>View onboarding →</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
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

  if (loading) return <PFTTrackSkeleton />

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
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} onMouseDown={noMultiClickSelect} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <PhaseBadge number={i + 1} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {(!readOnly || memberNotes) && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === NOTES_TAB).length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: 'var(--vfo-success-text)', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{tasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </div>
            {(!readOnly || memberNotes) && expanded[`notes_${phase.id}`] && <PhaseNotesPanel memberMode={!!memberNotes} canAdd={!memberNotes || !!memberCanAdd} clientId={clientId} phaseName={phase.name} tabName={NOTES_TAB} programName={TAILORED_PROGRAM} notes={notes} onNotesChange={onNotesChange} />}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(renderTask)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
