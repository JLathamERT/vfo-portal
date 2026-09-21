import { useState, useEffect, useRef } from 'react'
import { callApi } from '../../../lib/api'
import { PhaseNotesButton, PhaseNotesPanel } from '../../shared/PhaseNotes'
import { TaxPlanListSkeleton } from '../../shared/Skeleton'
import { TrackHero, PhaseBadge, ListHeader } from '../../shared/TrackKit'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'

const REGULAR_PRIORITIES = [
  "Business Growth", "Business Exit", "Business Advisory",
  "Long Term Sickness Concern", "Living too Long Concern", "Death Impacting Dependents Concern",
  "Asset Protection (Personally Sued)", "Loss of Key Person", "Asset Protection (Business Sued)",
  "Technology Advancements", "Risk Mitigation",
  "Wealth Planning (Short Term)", "Wealth Planning (Long Term)", "Wealth Planning (Short/Long Term)",
  "Wealth Planning (Grow Wealth)", "Wealth Planning (Retain Wealth)", "Wealth Planning (Grow/Retain Wealth)",
  "Wealth Planning (Young Kids Focus)", "Wealth Planning (College Planning Focus)",
  "Wealth Planning (Retirement Planning Focus)", "Wealth Planning (Legacy Planning Focus)",
  "Wealth Planning (Alternative Investments Focus)", "Wealth Planning",
  "Family Law", "Trusts and Wills (Estate Planning)", "Contract / Corporate Law",
  "Structuring Entities", "Buy / Sell Agreements", "Joint Venture Agreements",
  "Intellectual Property", "Legal Focus"
]

// "Custom" — a permanent trailing entry in the Add Regular Priority specialist
// picker that stores a typed name instead of a directory specialist. The backend
// owns the "Custom - " prefix; the sentinel can never collide with a real name.
const OTHER_SPEC_VALUE = '__other__'

// MM/DD for the AI PC Admin auto rows. Plain 'YYYY-MM-DD' DATE columns are split
// as strings (new Date() would shift them a day west of UTC); timestamptz values
// go through Date so they read in the viewer's local time.
const fmtMMDD = (v) => {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return `${p[1]}/${p[2]}` }
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// Ack sub-row under a 96h "assigned PF notified" auto row — records that a human
// actually chased the stall. Admin surface only.
function StallAckRow({ pipeline, id, stall, ackAt, onAck }) {
  const [checked, setChecked] = useState(!!ackAt)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setChecked(!!ackAt) }, [ackAt])
  async function toggle(next) {
    setChecked(next)
    setSaving(true)
    try {
      const res = await callApi('automation_stall_ack', { pipeline, id, stall, ack: next })
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

// The confirmed slot is stored in the task notes as a space-joined
// "YYYY-MM-DD HH:MM TZ" string (see fire() below). Best-effort parse for the
// reschedule pre-fill — anything that doesn't match comes back empty.
const TZ_CODES = ['ET', 'CT', 'MT', 'PT', 'AKT', 'HT']
const parseSlotNotes = (s) => {
  const parts = String(s || '').trim().split(/\s+/)
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '') ? parts[0] : '',
    time: /^\d{2}:\d{2}$/.test(parts[1] || '') ? parts[1] : '',
    tz: TZ_CODES.includes(parts[2]) ? parts[2] : 'ET',
  }
}

// MAP 4 confirmation email step — 3-button post-meeting confirm mirroring MAP 1's
// PIP 1 Confirmation Email (PipConfirmStep): "with date" (date/time/tz), "date not
// confirmed", and "declined". Drafts the email via the backend, then records the
// task status. Self-contained so its date/time inputs survive parent re-renders.
function Map4ConfirmStep({ trackId, task, p, track, onDone, emailCtx }) {
  const [showDate, setShowDate] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [tz, setTz] = useState('ET')
  const [pending, setPending] = useState(null)
  // Last slot written to the task notes — kept locally so a reschedule right after
  // a send pre-fills from what was just saved, not the stale parent copy.
  const [slot, setSlot] = useState(p.notes || '')
  const isDone = !!p.status
  const statusColor = isDone ? '#1b9254' : 'var(--vfo-muted)'
  const inputStyle = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
  const greenBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
  const redBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }
  const cancelBtn = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
  function fmtDate(d) { if (!d) return ''; const parts = d.split('-'); return `${parts[1]}/${parts[2]}` }

  async function fire(decision, d, t, z) {
    setPending(decision)
    try {
      await callApi('automation_REGULAR_map4confirmemail', { priority_track_id: trackId, decision, meeting_date: d || null, meeting_time: t || null, meeting_tz: z || null })
      const status = decision === 'declined' ? 'Sent declined email' : decision === 'confirm_no_date' ? 'Email sent - date not arranged' : 'Confirmation email sent'
      const today = new Date().toISOString().split('T')[0]
      // Persist the slot in the task notes so a later reschedule can pre-fill it.
      const notes = decision === 'confirm_date' ? [d, t, z].filter(Boolean).join(' ') : null
      await callApi('msm_save_priority_task', { priority_track_id: trackId, task_id: task.id, status, completed_date: today, notes })
      onDone(task.id, status, today)
      if (decision === 'confirm_date') setSlot(notes || '')
      setShowDate(false); setRescheduling(false); setDate(''); setTime('')
    } catch (err) { console.error('MAP 4 confirm error:', err) }
    finally { setPending(null) }
  }

  // Reschedule reopens the same form pre-filled with the stored slot and re-sends
  // the same confirmation email (the backend builder has no guards or side effects).
  function openReschedule() {
    const s = parseSlotNotes(slot)
    setDate(s.date); setTime(s.time); setTz(s.tz)
    setRescheduling(true)
  }

  // Backend replaces [Specialist Name] with specialist_name minus the "Custom - "
  // prefix a custom track stores, falling back when the track has no name.
  const confirmCtx = {
    ...(emailCtx || {}),
    'Specialist Name': String(track.specialist_name || '').replace(/^custom\s*-\s*/i, '').trim() || 'your VFO Specialist',
  }

  const dateForm = (onCancel) => (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
      <select value={tz} onChange={e => setTz(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
        <option value="ET">Eastern (ET)</option>
        <option value="CT">Central (CT)</option>
        <option value="MT">Mountain (MT)</option>
        <option value="PT">Pacific (PT)</option>
        <option value="AKT">Alaska (AKT)</option>
        <option value="HT">Hawaii (HT)</option>
      </select>
      <button onClick={() => date && fire('confirm_date', date, time, tz)} disabled={!date || !!pending} style={{ ...greenBtn, opacity: (!date || pending) ? 0.6 : 1 }}>{pending === 'confirm_date' ? 'Sending…' : 'Send'}</button>
      <button onClick={() => !pending && onCancel()} disabled={!!pending} style={cancelBtn}>Cancel</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="REGULAR" title={task.name} templates={[{ name: 'REGULAR_map4confirm', when: 'If date confirmed / not confirmed' }, { name: 'REGULAR_map4declined', when: 'If the client declined' }]} context={confirmCtx} /></span></span>
      {isDone
        ? rescheduling
          ? dateForm(() => setRescheduling(false))
          : <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
              <button onClick={openReschedule} style={cancelBtn}>Reschedule</button>
            </div>
        : showDate
          ? dateForm(() => setShowDate(false))
          : <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={() => setShowDate(true)} disabled={!!pending} style={greenBtn}>Send email (with date)</button>
              <button onClick={() => fire('confirm_no_date')} disabled={!!pending} style={{ ...greenBtn, opacity: pending ? 0.6 : 1 }}>{pending === 'confirm_no_date' ? 'Sending…' : 'Send email - date not confirmed'}</button>
              <button onClick={() => fire('declined')} disabled={!!pending} style={{ ...redBtn, opacity: pending ? 0.6 : 1 }}>{pending === 'declined' ? 'Sending…' : 'Meeting declined - email client'}</button>
            </div>
      }
      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? fmtDate(p.completed_date) : ''}</span>
    </div>
  )
}

// MAP 4 follow-up step — admin enters the MAP 4 meeting date (date only), which arms
// the daily cron to draft the follow-up email (To client, Cc member) 2 days later.
// Below, an "AI PC Admin"-style auto group shows the email-sent + form-completed
// sub-steps (the client's answers reveal under a chevron), mirroring the Specialist
// Preliminary-Meeting pattern. Completion flags are read off the track.
function Map4FollowupStep({ trackId, task, p, track, onDone, emailCtx, readOnly = false }) {
  const [showDate, setShowDate] = useState(false)
  const [date, setDate] = useState('')
  const [enteredDate, setEnteredDate] = useState(track.map4_meeting_date || '')
  const [pending, setPending] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [stallAckAt, setStallAckAt] = useState(track.map4_stall_ack_at || null)
  // useState only seeds on mount — without this the checkbox keeps its stale
  // value after the parent reloads the tracks (every other stall copy re-syncs).
  useEffect(() => { setStallAckAt(track.map4_stall_ack_at || null) }, [track.map4_stall_ack_at])
  // Saving a NEW meeting date clears the follow-up/reminder/stall stamps server-side;
  // mirror that here so the auto rows below stop claiming the old sends until reload.
  const [ladderCleared, setLadderCleared] = useState(false)
  const inputStyle ={ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
  const greenBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
  const cancelBtn = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
  function fmtLong(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  function fmtDate(d) { if (!d) return ''; const parts = String(d).split('-'); return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d }

  async function saveDate() {
    if (!date || pending) return
    setPending(true)
    try {
      await callApi('automation_REGULAR_map4_setmeetingdate', { priority_track_id: trackId, meeting_date: date })
      const today = new Date().toISOString().split('T')[0]
      await callApi('msm_save_priority_task', { priority_track_id: trackId, task_id: task.id, status: 'Follow-up scheduled', completed_date: today })
      if (enteredDate && date !== enteredDate) setLadderCleared(true)
      setEnteredDate(date)
      setShowDate(false)
      onDone(task.id, 'Follow-up scheduled', today)
    } catch (err) { console.error('MAP 4 set meeting date error:', err) }
    finally { setPending(false) }
  }

  // Backend replaces [Meeting Date] with formatLongDate(map4_meeting_date) —
  // "August 18, 2026" (long month, UTC). Match it exactly for the preview.
  function fmtMeetingLongUTC(d) {
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return ''
    const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z')
    if (isNaN(dt.getTime())) return ''
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  }
  const followupCtx = (() => {
    const md = fmtMeetingLongUTC(enteredDate)
    return md ? { ...(emailCtx || {}), 'Meeting Date': md } : emailCtx
  })()

  const followupSentAt = ladderCleared ? null : track.map4_followup_sent_at
  const reminderSentAt = ladderCleared ? null : track.map4_reminder_sent_at
  const stallNotifiedAt = ladderCleared ? null : track.map4_stall_notified_at
  const emailSent = !!followupSentAt
  const formDone = !!track.map4_form_submitted_at
  const formData = track.map4_form_data || {}
  const aipcDone = emailSent && formDone
  const movingForward = formData.q3_moving_forward || ''

  const autoStep = (label, done, at = null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', marginLeft: 'auto', ...(done ? { background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 } : { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }) }}>{done ? 'Done' : 'Awaiting'}</span>
      {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
    </div>
  )

  // 48h client reminder / 96h PF notification for the stalled follow-up form.
  // Both only exist once the cron has stamped them.
  const reminderStep = (at) => at ? autoStep('2-business-day reminder email sent to client', true, at) : null
  const pfNotifiedStep = (at) => at ? (
    <>
      {autoStep('4-business-day mark passed — assigned PF notified to follow up', true, at)}
      {!readOnly && <StallAckRow pipeline="regular" id={trackId} stall="map4" ackAt={stallAckAt} onAck={setStallAckAt} />}
    </>
  ) : null
  const answer = (label, val) => (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{val ? val : '—'}</div>
    </div>
  )

  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: enteredDate ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${enteredDate ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: enteredDate ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="REGULAR" title={task.name} templates={[{ name: 'REGULAR_map4followup', when: 'Automatic — follow-up with the form link, 2 days after the meeting' }, { name: 'REGULAR_map4reminder', when: 'Automatic reminder if the form is not completed' }]} context={followupCtx} /></span></span>
        {showDate
          ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              <button onClick={saveDate} disabled={!date || pending} style={{ ...greenBtn, opacity: (!date || pending) ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save'}</button>
              <button onClick={() => !pending && setShowDate(false)} disabled={pending} style={cancelBtn}>Cancel</button>
            </div>
          : enteredDate
            ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', border: '1px solid rgba(27,146,84,0.3)' }}>MAP 4 meeting: {fmtLong(enteredDate)}</span>
                {/* Saving a different date re-arms the follow-up ladder (the backend
                    clears the sent/reminder/stall stamps), so it re-drafts. */}
                <button onClick={() => { setDate(enteredDate); setShowDate(true) }} style={cancelBtn}>Edit date</button>
              </div>
            : <button onClick={() => setShowDate(true)} style={greenBtn}>Enter date of MAP 4 meeting</button>
        }
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{p.completed_date ? fmtDate(p.completed_date) : ''}</span>
      </div>

      {enteredDate && (
        <div style={{ padding: '8px 0 2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: aipcDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${aipcDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1, fontWeight: '600' }}>Automated steps</span>
          </div>
          <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
            {autoStep('MAP 4 follow-up email sent', emailSent, followupSentAt)}
            {reminderStep(reminderSentAt)}
            {pfNotifiedStep(stallNotifiedAt)}
            <div>
              <div onClick={() => formDone && setFormOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', cursor: formDone ? 'pointer' : 'default' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: formDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${formDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>MAP 4 form completed</span>
                {formDone
                  ? <>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, marginLeft: 'auto' }}>Done</span>
                      {track.map4_form_submitted_at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(track.map4_form_submitted_at)}</span>}
                      <span style={{ color: 'var(--vfo-muted)', fontSize: '9px', transform: formOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                    </>
                  : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', marginLeft: 'auto' }}>Awaiting</span>}
              </div>
              {formDone && formOpen && (
                <div style={{ padding: '10px 12px 4px 16px' }}>
                  {answer('How was the meeting?', formData.q1_meeting)}
                  {answer('Questions or concerns', formData.q2_concerns)}
                  {answer('Moving forward to implement with the Specialist?', formData.q3_moving_forward)}
                  {movingForward === 'Yes' && answer('Can we facilitate the next steps with the Specialist?', formData.q4_yes_facilitate)}
                  {movingForward === 'No' && answer('Feedback / explore other solutions or specialists?', formData.q4_no_feedback)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PriorityTrackView({ track, phases, progress, specialists, onBack, onProgressChange, readOnly = false, onTrackUpdate, notes = [], onNotesChange, clientId, emailCtx }) {
  const [localProgress, setLocalProgress] = useState(progress)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [completedPhases, setCompletedPhases] = useState({})
  const [trackStatus, setTrackStatus] = useState(track.status || 'live')
  const [togglingStatus, setTogglingStatus] = useState(false)

  async function toggleTrackStatus() {
    const newStatus = trackStatus === 'live' ? 'stopped' : 'live'
    setTogglingStatus(true)
    try {
      await callApi('msm_update_priority_status', { priority_track_id: track.id, status: newStatus })
      setTrackStatus(newStatus)
    } catch (err) { console.error(err) }
    finally { setTogglingStatus(false) }
  }

  useEffect(() => {
    const expandState = {}
    phases.forEach(phase => {
      const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
      const allDone = tasks.length === 0 || tasks.every(t => localProgress[t.id]?.status)
      expandState[phase.id] = !allDone
    })
    setExpanded(expandState)
  }, [])

  async function saveTask(taskId, status, existingDate) {
    const today = new Date().toISOString().split('T')[0]
    const date = existingDate || (status ? today : null)
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_priority_task', { priority_track_id: track.id, task_id: taskId, status, completed_date: date || null })
      const updated = { ...localProgress[taskId], task_id: taskId, status, completed_date: date }
      setLocalProgress(p => ({ ...p, [taskId]: updated }))
      onProgressChange(taskId, updated)
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  async function completePhase(phase) {
    const today = new Date().toISOString().split('T')[0]
    const autoCompleteCodes = { 'MAP 4 - Educate': ['MAP 4 meeting'] }
    const allowedCodes = autoCompleteCodes[phase.name] || []
    const tasks = (phase.program_client_tasks || []).filter(t => allowedCodes.includes(t.name))
    setCompletedPhases(p => ({ ...p, [phase.id]: 'saving' }))
    try {
      await Promise.all(tasks.map(task => callApi('msm_save_priority_task', { priority_track_id: track.id, task_id: task.id, status: task.status_options.split('|')[0], completed_date: today })))
      const newProgress = { ...localProgress }
      tasks.forEach(task => { newProgress[task.id] = { task_id: task.id, status: task.status_options.split('|')[0], completed_date: today } })
      setLocalProgress(newProgress)
      setCompletedPhases(p => ({ ...p, [phase.id]: 'done' }))
      setTimeout(() => { setCompletedPhases(p => ({ ...p, [phase.id]: null })); setExpanded(p => ({ ...p, [phase.id]: false })) }, 2000)
    } catch (err) { console.error(err); setCompletedPhases(p => ({ ...p, [phase.id]: null })) }
  }

  const statusColors = { Completed: '#1b9254', Yes: '#1b9254', 'No additional info required': '#1b9254', 'Confirmation email sent': '#1b9254', 'Email sent - date not arranged': '#1b9254', 'Sent declined email': '#e74c3c', 'Follow-up scheduled': '#1b9254', Stopped: '#e74c3c', 'N/A': 'var(--vfo-muted)', No: '#e74c3c', 'No show': '#e74c3c', 'Additional info required': '#1b9254' }
  const inputStyle = { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }

  function getPhaseState(phase) {
    const tasks = countedPhaseTasks(phase)
    if (tasks.length === 0) {
      const autoTasks = phase.program_client_tasks || []
      const allAutoDone = autoTasks.length > 0 && autoTasks.every(t => localProgress[t.id]?.status)
      return allAutoDone ? 'done' : 'pending'
    }
    if (tasks.every(t => localProgress[t.id]?.status)) return 'done'
    if (tasks.some(t => localProgress[t.id]?.status)) return 'active'
    return 'pending'
  }

  const c253TaskId = phases.flatMap(p => p.program_client_tasks || []).find(t => t.name === 'Additional information required')?.id
  const c253Status = localProgress[c253TaskId]?.status || ''
  const additionalInfoRequired = c253Status === 'Additional info required'

  const ADD_INFO_CHILD_NAMES = ['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L']
  // "Additional information required" and its children all live in MAP 3. The
  // children render nested under the parent and only count toward the phase
  // when additional info is actually required.
  function countedPhaseTasks(phase) {
    let tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && !ADD_INFO_CHILD_NAMES.includes(t.name))
    const hasParent = (phase.program_client_tasks || []).some(t => t.name === 'Additional information required')
    if (hasParent && additionalInfoRequired) {
      tasks = tasks.concat(phases.flatMap(p => p.program_client_tasks || []).filter(t => ADD_INFO_CHILD_NAMES.includes(t.name)))
    }
    return tasks
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  const totalTasks = phases.reduce((s, p) => s + countedPhaseTasks(p).length, 0)
  const completedTasks = phases.reduce((s, phase) => s + countedPhaseTasks(phase).filter(t => localProgress[t.id]?.status).length, 0)

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to Priorities</button>
      <TrackHero
        eyebrow="Regular Priority"
        title={track.priority_name}
        meta={track.specialist_name ? `Specialist: ${track.specialist_name}` : null}
        completed={completedTasks}
        total={totalTasks}
        steps={phases.map(ph => ({ label: ph.name, state: getPhaseState(ph) }))}
        action={!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{trackStatus === 'live' ? 'Live' : 'Stopped'}</span>
            <div onClick={() => !togglingStatus && toggleTrackStatus()}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: trackStatus === 'live' ? '#1b9254' : '#e74c3c', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: trackStatus === 'live' ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />

      {phases.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = countedPhaseTasks(phase)
        const doneTasks = nonAutoTasks.filter(t => localProgress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        const showCompleteBtn = false
        const phaseCompleteState = completedPhases[phase.id]

        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
                <PhaseBadge number={phaseIdx + 1} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {showCompleteBtn && (
                  <button onClick={e => { e.stopPropagation(); completePhase(phase) }} disabled={phaseCompleteState === 'saving'}
                    style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', background: phaseCompleteState === 'done' ? 'rgba(27,146,84,0.15)' : 'rgba(0,149,255,0.15)', border: `1px solid ${phaseCompleteState === 'done' ? 'rgba(27,146,84,0.4)' : 'rgba(0,149,255,0.4)'}`, color: phaseCompleteState === 'done' ? '#1b9254' : '#0095ff', whiteSpace: 'nowrap' }}>
                    {phaseCompleteState === 'saving' ? 'Saving...' : '✓ Auto complete — all completed and confirmed'}
                  </button>
                )}
                {!readOnly && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'Regular Priorities').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {!readOnly && expanded[`notes_${phase.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={phase.name} tabName="Regular Priorities" programName="VFO Holistic Planning" notes={notes} onNotesChange={onNotesChange} />}

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => {
                  const p = localProgress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'

                  if (task.status_options === 'auto') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: isDone ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', color: isDone ? '#1b9254' : 'var(--vfo-muted)', border: `1px solid ${isDone ? 'rgba(27,146,84,0.3)' : 'var(--vfo-border)'}` }}>{isDone ? 'Completed' : 'Not completed'}</span>
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (readOnly) return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                        : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (task.status_options === 'enter_details') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Completed</span>
                        : <button onClick={() => saveTask(task.id, 'Completed', p.completed_date)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600 }}>Enter details</button>
                      }
                      <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={d => saveTask(task.id, p.status, d)} disabled={saving[task.id]} />
                    </div>
                  )

                  if (task.status_options === 'map4_confirm') return (
                    <Map4ConfirmStep
                      key={task.id}
                      trackId={track.id}
                      task={task}
                      p={p}
                      track={track}
                      emailCtx={emailCtx}
                      onDone={(taskId, status, date) => {
                        const updated = { task_id: taskId, status, completed_date: date }
                        setLocalProgress(pr => ({ ...pr, [taskId]: { ...pr[taskId], ...updated } }))
                        onProgressChange(taskId, updated)
                      }}
                    />
                  )

                  if (task.status_options === 'map4_followup') return (
                    <Map4FollowupStep
                      key={task.id}
                      trackId={track.id}
                      task={task}
                      p={p}
                      track={track}
                      emailCtx={emailCtx}
                      readOnly={readOnly}
                      onDone={(taskId, status, date) => {
                        const updated = { task_id: taskId, status, completed_date: date }
                        setLocalProgress(pr => ({ ...pr, [taskId]: { ...pr[taskId], ...updated } }))
                        onProgressChange(taskId, updated)
                      }}
                    />
                  )

                  // Skip tasks rendered as children inside Additional info handler
                  if (['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(task.name)) return null

                  // Additional information required — render with indented children
                  if (task.name === 'Additional information required') {
                    const childTaskNames = ['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L']
                    const allPhaseTasks = phases.flatMap(p => p.program_client_tasks || [])
                    const childTasks = allPhaseTasks.filter(t => childTaskNames.includes(t.name))
                    const greyed = !additionalInfoRequired
                    return (
                      <div key={task.id} style={{ borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                          <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                          <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? statusColor : 'var(--vfo-ink)' }}>
                            <option value="">-- Select --</option>
                            {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={d => saveTask(task.id, p.status, d)} disabled={saving[task.id]} />
                        </div>
                        <div style={{ marginLeft: '18px', borderLeft: '1px solid var(--vfo-tint-deep)', paddingLeft: '12px', paddingBottom: '4px', opacity: greyed ? 0.3 : 1, pointerEvents: greyed ? 'none' : 'auto' }}>
                          {childTasks.map(ct => {
                            const cp = localProgress[ct.id] || {}
                            const cDone = !!cp.status
                            const cColor = statusColors[cp.status] || 'var(--vfo-muted)'
                            return (
                              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cDone ? cColor : 'transparent', flexShrink: 0, border: `1px solid ${cDone ? cColor : 'var(--vfo-border-mid)'}` }} />
                                <span style={{ fontSize: '12px', color: cDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{ct.name}</span>
                                <select value={cp.status || ''} onChange={e => saveTask(ct.id, e.target.value, cp.completed_date)} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '120px', fontSize: '11px', borderColor: cDone ? `${cColor}66` : 'var(--vfo-border-strong)', color: cDone ? cColor : 'var(--vfo-ink)' }}>
                                  <option value="">-- Select --</option>
                                  {(ct.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <StepDate value={cDone ? (cp.completed_date || '') : ''} onChange={d => saveTask(ct.id, cp.status, d)} disabled={saving[ct.id]} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  const isGreyedOut = false
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap', opacity: isGreyedOut ? 0.3 : 1, pointerEvents: isGreyedOut ? 'none' : 'auto' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? statusColor : 'var(--vfo-ink)' }}>
                        <option value="">-- Select --</option>
                        {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={d => saveTask(task.id, p.status, d)} disabled={saving[task.id]} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RegularPrioritiesTab({ clientId, programId, client, specialists, readOnly = false, notes = [], onNotesChange, initialTrackId = null }) {
  const [priorityTracks, setPriorityTracks] = useState([])
  const [phases, setPhases] = useState([])
  const [allProgress, setAllProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newPriority, setNewPriority] = useState('')
  const [newSpecialist, setNewSpecialist] = useState('')
  const [newCustomName, setNewCustomName] = useState('')
  const [addStatus, setAddStatus] = useState('')
  const [regularEnabled, setRegularEnabled] = useState(false)
  const autoSelectedRef = useRef(false)

  useEffect(() => { loadData() }, [clientId])

  // Deep-link from Client Overview: open the requested track once, after the
  // list has loaded. The user can still navigate back to the list afterwards.
  useEffect(() => {
    if (autoSelectedRef.current || loading || !initialTrackId) return
    const match = priorityTracks.find(t => t.id === initialTrackId)
    if (match) { autoSelectedRef.current = true; setSelectedTrack(match) }
  }, [loading, initialTrackId, priorityTracks])

  async function loadData() {
    setLoading(true)
    try {
      const [tracksData, phasesData, map1Progress] = await Promise.all([
        callApi('msm_load_priority_tracks', { client_id: clientId }),
        callApi('msm_load_regular_phases', { program_id: programId }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      setPriorityTracks((tracksData.tracks || []).filter(t => t.track_type !== 'pip'))
      setPhases(phasesData.phases || [])

      // Check if C25 is enabled
      const enabled = (map1Progress.progress || []).some(p => p.status === 'Regular priorities tab enabled')
      setRegularEnabled(enabled)

      // Load progress for all priority tracks
      const progressMap = {}
      await Promise.all((tracksData.tracks || []).map(async track => {
        const pd = await callApi('msm_load_priority_progress', { priority_track_id: track.id })
        progressMap[track.id] = {}
        ;(pd.progress || []).forEach(p => { progressMap[track.id][p.task_id] = p })
      }))
      setAllProgress(progressMap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function addPriority() {
    if (!newPriority) { setAddStatus('Select a priority.'); return }
    if (!newSpecialist) { setAddStatus('Select a specialist.'); return }
    const isCustom = newSpecialist === OTHER_SPEC_VALUE
    const customName = newCustomName.trim()
    if (isCustom && !customName) { setAddStatus('Enter the specialist name.'); return }
    try {
      // specialist_name rides along on the custom path purely for the deploy
      // window: the old handler ignores custom/custom_name and would store null,
      // so it gets the already-prefixed name. The new handler ignores this field
      // when custom is true and re-derives the identical value via its sanitizer.
      const payload = isCustom
        ? { client_id: clientId, priority_name: newPriority, track_type: 'regular', custom: true, custom_name: customName, specialist_name: `Custom - ${customName}` }
        : { client_id: clientId, priority_name: newPriority, track_type: 'regular', specialist_name: newSpecialist }
      await callApi('msm_add_priority_track', payload)
      setNewPriority(''); setNewSpecialist(''); setNewCustomName(''); setShowAdd(false); setAddStatus('')
      loadData()
    } catch (err) { setAddStatus(err.message) }
  }

  function getTrackState(track) {
    const prog = allProgress[track.id] || {}
    const allTasks = phases.flatMap(p => p.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (allTasks.length === 0) return 'not started'
    if (allTasks.every(t => prog[t.id]?.status)) return 'completed'
    if (allTasks.some(t => prog[t.id]?.status)) return 'in progress'
    return 'not started'
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const stateColors = { 'not started': 'var(--vfo-muted)', 'in progress': '#0095ff', 'completed': '#1b9254' }

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Reactive to the selected client; empty values are omitted so those tokens
  // keep rendering as bracketed chips.
  const emailCtx = (() => {
    const ctx = {}
    const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
    if (full) { ctx['Client Name'] = full; ctx['Client First'] = full.split(/\s+/)[0] }
    const pf = client?.assigned_pf ? String(client.assigned_pf).trim() : ''
    if (pf) ctx['PF Name'] = pf
    return ctx
  })()

  if (loading) return <TaxPlanListSkeleton />


  if (selectedTrack) {
    return (
      <PriorityTrackView
        track={selectedTrack}
        phases={phases}
        progress={allProgress[selectedTrack.id] || {}}
        specialists={specialists}
        onBack={() => { setSelectedTrack(null); loadData() }}
        onProgressChange={(taskId, p) => setAllProgress(prev => ({ ...prev, [selectedTrack.id]: { ...prev[selectedTrack.id], [taskId]: p } }))}
        readOnly={readOnly}
        onTrackUpdate={loadData}
        notes={notes}
        onNotesChange={onNotesChange}
        clientId={clientId}
        emailCtx={emailCtx}
      />
    )
  }

  return (
    <div>
      {!regularEnabled && (
        <div style={{ ...sectionStyle, borderColor: 'rgba(231,76,60,0.3)', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '15px', color: 'var(--vfo-muted)' }}>Regular Priorities is not yet enabled for this client.</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px' }}>Set C25 to "Regular priorities tab enabled" in MAP 1 first.</div>
        </div>
      )}

      {regularEnabled && (
        <>
          <ListHeader
            title="Regular Priorities"
            count={priorityTracks.length}
            action={!readOnly && <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Add Priority</button>}
          />


          {showAdd && (
            <div style={{ ...sectionStyle, marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Regular Priority</div>
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)', marginBottom: '12px' }}>
                <option value="">-- Select Priority --</option>
                {REGULAR_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={newSpecialist} onChange={e => setNewSpecialist(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)', marginBottom: '12px' }}>
                <option value="">-- Select Specialist --</option>
                {specialists.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                <option value={OTHER_SPEC_VALUE}>Custom</option>
              </select>
              {newSpecialist === OTHER_SPEC_VALUE && (
                <input value={newCustomName} onChange={e => setNewCustomName(e.target.value)} maxLength={80} placeholder={'Name — saved as "Custom - Name"'} style={{ ...inputStyle, background: 'var(--vfo-card)', marginBottom: '12px' }} />
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addPriority} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Add</button>
                <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              </div>
              {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
            </div>
          )}

          {priorityTracks.length === 0 && !showAdd && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No priorities added yet.</div>
          )}

          {priorityTracks.map(track => {
            const state = getTrackState(track)
            const stateColor = stateColors[state]
            return (
              <div key={track.id} onClick={() => setSelectedTrack(track)}
                style={{ ...sectionStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)', marginBottom: '4px' }}>{track.priority_name}{track.specialist_name ? ` (${track.specialist_name})` : ''}</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{new Date(track.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: track.status === 'stopped' ? 'rgba(231,76,60,0.15)' : 'rgba(27,146,84,0.15)', color: track.status === 'stopped' ? '#e74c3c' : '#1b9254', border: `1px solid ${track.status === 'stopped' ? 'rgba(231,76,60,0.3)' : 'rgba(27,146,84,0.3)'}` }}>{track.status === 'stopped' ? 'Stopped' : 'Live'}</span>
                  {track.status !== 'stopped' && <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44`, textTransform: 'capitalize' }}>{state}</span>}
                  <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default RegularPrioritiesTab