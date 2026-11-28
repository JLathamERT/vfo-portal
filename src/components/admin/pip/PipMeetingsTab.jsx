import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen, getWriteCount } from '../../../lib/api'
import { PhaseNotesButton, PhaseNotesPanel, useOpenLinkedNote } from '../../shared/PhaseNotes'
import { PipMeetingDetailSkeleton, PipMeetingsListSkeleton } from '../../shared/Skeleton'
import { TrackHero, ListHeader, StepRow, SubStepRow, AutoSteps, PhaseCard, StepAnswer, TrackEmpty } from '../../shared/TrackKit'
import Tag from '../../shared/Tag'
import { btnPrimary, btnState, btnStep, stepChoice, stepSend } from '../../shared/buttonStyles'
import PipPurchaseDecisionForm from './PipPurchaseDecisionForm'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'
import { readable } from '../../shared/readableColor'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { BackLink, cardBox, formInput, ProfileCard } from '../../shared/ProfileKit'
import { formatDate } from '../../../lib/dates'

// Replicates the backend [Scheduled Meeting Date] substitution (see
// actions/msm/pip-meeting-confirmation-email.ts): formatLongDate ("August 18,
// 2026", UTC) plus " at <12h time> <tz>" when a time is on the track.
function fmtLongDateUTC(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return ''
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z')
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
function fmtTime12(t) {
  if (!t) return ''
  const parts = String(t).split(':')
  let h = parseInt(parts[0], 10)
  const m = parts[1] || '00'
  if (isNaN(h)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

function meetingLabel(track) {
  if (track.pip_completed_date) return `PIP meeting completed on ${formatDate(track.pip_completed_date)}`
  if (track.pip_scheduled_date) return `PIP meeting scheduled for ${formatDate(track.pip_scheduled_date)}`
  return 'PIP meeting not yet scheduled'
}

function meetingLabelColor(track) {
  if (track.pip_completed_date) return '#1b9254'
  if (track.pip_scheduled_date) return '#0095ff'
  return 'var(--vfo-muted)'
}

function PipMeetingDetailView({ track, phases, progress, onBack, onProgressChange, onTrackUpdate, readOnly, memberNotes = false, memberCanAdd = false, mirror = false, notes, onNotesChange, clientId, client, initialNoteId = null }) {
  const [localProgress, setLocalProgress] = useState(progress)
  const [scheduledDate, setScheduledDate] = useState(track.pip_scheduled_date || '')
  // Time/tz mirrors of the track columns the confirmation email writes back, so a
  // second reschedule in the same session pre-fills from the last slot sent.
  const [scheduledTime, setScheduledTime] = useState(track.pip_scheduled_time || '')
  const [scheduledTz, setScheduledTz] = useState(track.pip_scheduled_timezone || '')
  const [savingDate, setSavingDate] = useState(false)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [reconfirmShowDate, setReconfirmShowDate] = useState(false)
  const [reconfirmDate, setReconfirmDate] = useState('')
  const [reconfirmTime, setReconfirmTime] = useState('')
  const [reconfirmTz, setReconfirmTz] = useState('ET')
  const [reconfirmSending, setReconfirmSending] = useState(false)
  const isPhone = useIsPhone()

  useEffect(() => {
    const expandState = {}
    phases.forEach(phase => {
      const tasks = countedTasks(phase)
      const allDone = tasks.length === 0 || tasks.every(isTaskDone)
      expandState[phase.id] = !allDone
    })
    setExpanded(expandState)
  }, [])

  // PIP notes are not per meeting (#386): a linked note opens in the meeting opened.
  useOpenLinkedNote(initialNoteId, notes, phases.length ? phases : null, (note) => {
    if (note.tab_name !== 'PIP Meetings') return null
    const phase = phases.find(ph => ph.name === note.phase_name)
    return phase ? [phase.id, `notes_${phase.id}`] : null
  }, setExpanded)

  async function saveScheduled(newDate) {
    setSavingDate(true)
    setScheduledDate(newDate)
    try {
      await callApi('msm_update_pip_meeting', { priority_track_id: track.id, pip_scheduled_date: newDate || null })
    } catch (err) { console.error(err) }
    finally { setSavingDate(false) }
  }

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

  async function toggleCheckbox(taskId) {
    const cur = localProgress[taskId] || {}
    if (cur.status) return
    const today = new Date().toISOString().split('T')[0]
    setSaving(s => ({ ...s, [taskId]: true }))
    try {
      await callApi('msm_save_priority_task', { priority_track_id: track.id, task_id: taskId, status: 'Completed', completed_date: today })
      const updated = { task_id: taskId, status: 'Completed', completed_date: today }
      setLocalProgress(prev => ({ ...prev, [taskId]: updated }))
      onProgressChange(taskId, updated)
    } catch (err) { console.error(err) }
    finally { setSaving(s => ({ ...s, [taskId]: false })) }
  }

  // Opens the confirmation form pre-filled with the slot currently on the track —
  // used both for the first send and for a reschedule.
  function openReconfirm() {
    setReconfirmDate(scheduledDate || '')
    setReconfirmTime(scheduledTime || '')
    setReconfirmTz(scheduledTz || 'ET')
    setReconfirmShowDate(true)
  }

  async function sendReconfirm(taskId) {
    if (!reconfirmDate) return
    setReconfirmSending(true)
    try {
      await callApi('msm_pip_meeting_confirmation_email', {
        priority_track_id: track.id,
        task_id: taskId,
        meeting_date: reconfirmDate,
        meeting_time: reconfirmTime || null,
        meeting_tz: reconfirmTz || null,
      })
      const updated = { task_id: taskId, status: 'Sent confirmation email', completed_date: reconfirmDate }
      setLocalProgress(p => ({ ...p, [taskId]: updated }))
      onProgressChange(taskId, updated)
      if (reconfirmDate !== scheduledDate) setScheduledDate(reconfirmDate)
      setScheduledTime(reconfirmTime || '')
      setScheduledTz(reconfirmTz || '')
      setReconfirmShowDate(false)
      setReconfirmDate('')
    } catch (err) {
      console.error(err)
      alert('Failed to send: ' + (err?.message || 'unknown error'))
    }
    finally { setReconfirmSending(false) }
  }

  const statusColors = { Completed: '#1b9254', Yes: '#1b9254', No: '#e74c3c' }
  const inputStyle = { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }

  // Known-value substitution for the email previews (see StepEmailsChip).
  const emailCtx = (() => {
    const ctx = {}
    const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
    if (full) { ctx['Client Name'] = full; ctx['Client First'] = full.split(/\s+/)[0] }
    const pf = client?.assigned_pf ? String(client.assigned_pf).trim() : ''
    if (pf) ctx['PF Name'] = pf
    const member = client?.member_name ? String(client.member_name).trim() : ''
    if (member) { ctx['Member Name'] = member; ctx['Member First'] = member.split(/\s+/)[0] }
    const dateStr = fmtLongDateUTC(scheduledDate || track.pip_scheduled_date || '')
    if (dateStr) {
      const timeStr = fmtTime12(scheduledTime || '')
      const tz = scheduledTz || ''
      ctx['Scheduled Meeting Date'] = timeStr ? `${dateStr} at ${timeStr}${tz ? ` ${tz}` : ''}` : dateStr
    }
    return ctx
  })()

  const purchaseTaskRef = phases.flatMap(ph => ph.program_client_tasks || []).find(t => t.name === 'Purchase Additional Services (optional)')
  const purchaseStatus = purchaseTaskRef ? (localProgress[purchaseTaskRef.id]?.status || '') : ''
  const purchaseDecision = purchaseStatus.startsWith('Completed - ') ? purchaseStatus.replace('Completed - ', '') : ''
  const aiPcAdminVisible = purchaseDecision === 'Tax Planning (if not purchased already)' || purchaseDecision === 'Additional PIP meeting(s)'

  function countedTasks(phase) {
    return (phase.program_client_tasks || []).filter(t => {
      if (t.status_options !== 'auto') return true
      if (t.name === 'AI PC Admin' && phase.name === 'Post PIP Meeting admin') return aiPcAdminVisible
      return false
    })
  }

  function isTaskDone(t) {
    if (t.status_options === 'pip_meeting_date') return !!scheduledDate
    if (t.status_options === 'auto' && t.name === 'AI PC Admin') return false
    return !!localProgress[t.id]?.status
  }

  function getPhaseState(phase) {
    const tasks = countedTasks(phase)
    if (tasks.length === 0) return 'pending'
    if (tasks.every(isTaskDone)) return 'done'
    if (tasks.some(isTaskDone)) return 'active'
    return 'pending'
  }

  // Display-only hero stats: same countedTasks/isTaskDone rules the phase
  // pills already use, summed across phases.
  const heroTotalTasks = phases.reduce((s, ph) => s + countedTasks(ph).length, 0)
  const heroDoneTasks = phases.reduce((s, ph) => s + countedTasks(ph).filter(isTaskDone).length, 0)
  const heroLabelColor = meetingLabelColor(track)

  return (
    <div className="vfo-track">
      <BackLink onClick={onBack}>Back to PIP Meetings</BackLink>
      <TrackHero
        eyebrow={`PIP Meeting${track.pip_engagement_year ? ` · Year ${track.pip_engagement_year}` : ''}`}
        title="PIP Meeting"
        meta={<span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${heroLabelColor}22`, color: readable(heroLabelColor), border: `1px solid ${heroLabelColor}44`, fontWeight: 600 }}>{meetingLabel(track)}</span>}
        completed={heroDoneTasks}
        total={heroTotalTasks}
        steps={phases.map(ph => ({ label: ph.name, state: getPhaseState(ph) }))}
      />

      {phases.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = (phase.program_client_tasks || []).slice().sort((a, b) => (a.task_order ?? 0) - (b.task_order ?? 0))
        const nonAutoTasks = countedTasks(phase)
        const doneTasks = nonAutoTasks.filter(isTaskDone).length

        return (
          <PhaseCard
            key={phase.id}
            number={phaseIdx + 1}
            state={state}
            name={phase.name}
            done={doneTasks}
            total={nonAutoTasks.length}
            open={isExpanded}
            onToggle={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))}
            notes={(!readOnly || memberNotes) && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'PIP Meetings').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
            notesPanel={(!readOnly || memberNotes) && expanded[`notes_${phase.id}`] && <PhaseNotesPanel memberMode={!!memberNotes} canAdd={!memberNotes || !!memberCanAdd} clientId={clientId} phaseName={phase.name} tabName="PIP Meetings" programName="VFO Holistic Planning" notes={notes} onNotesChange={onNotesChange} />}
          >
                {tasks.length === 0 && <TrackEmpty inline>No tasks defined for this phase yet.</TrackEmpty>}
                {tasks.map(task => {
                  const p = localProgress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'

                  if (task.name === 'AI PC Admin' && phase.name === 'Post PIP Meeting admin') {
                    const purchaseTask = phases.flatMap(ph => ph.program_client_tasks || []).find(t => t.name === 'Purchase Additional Services (optional)')
                    const purchaseStatus = purchaseTask ? (localProgress[purchaseTask.id]?.status || '') : ''
                    const decision = purchaseStatus.startsWith('Completed - ') ? purchaseStatus.replace('Completed - ', '') : ''
                    const isShown = decision === 'Tax Planning (if not purchased already)' || decision === 'Additional PIP meeting(s)'
                    if (!isShown) return null
                    // `pending` = the PIP ACH is in flight (pip_payment_status
                    // 'processing'). Mirrors AutoRow in AdvisorOnboarding.jsx —
                    // orange dot + orange tag instead of nothing.
                    const autoStep = (label, stepDone, tag = null, emailTpls = null, date = null, pending = false) => (
                      <SubStepRow
                        done={stepDone || pending}
                        dotColor={!stepDone && pending ? '#e06717' : undefined}
                        name={label}
                        emails={!readOnly && emailTpls && <StepEmailsChip pipeline="PIP" title={label} templates={emailTpls} context={emailCtx} />}
                        date={<StepDate value={stepDone ? date : ''} readOnly />}
                      >
                        {stepDone && tag ? <StepAnswer>{tag}</StepAnswer> : !stepDone && pending ? <Tag color="#e06717">Bank payment clearing</Tag> : null}
                      </SubStepRow>
                    )
                    const methodTag = !mirror && track.pip_payment_method_type
                      ? track.pip_payment_method_type.toUpperCase()
                      : null
                    const allDone = false
                    return (
                      <AutoSteps key={task.id} done={allDone}>
                          {autoStep('Payment link sent (ACH or Card choice)', !!track.pip_payment_email_sent_at, null, [{ name: 'PIP_payment', when: 'Automatic — payment link' }], track.pip_payment_email_sent_at)}
                          {/* The ACH confirmation email no longer gets its own step — the
                              step completes on the payment alone. Preview it here. */}
                          {autoStep('Payment collected', !!track.pip_payment_completed_at, methodTag, [{ name: 'PIP_confirmation', when: 'Bank transfer (ACH) only — card gets the invoice/receipt instead' }], track.pip_payment_completed_at, track.pip_payment_status === 'processing')}
                          {autoStep('Invoice and receipt created and emailed to client', !!track.pip_invoice_receipt_email_sent_at, null, [{ name: 'PIP_invoicereceipt_email', when: 'Automatic — invoice + receipt' }], track.pip_invoice_receipt_email_sent_at)}
                          {!mirror && autoStep('Revenue shares paid · Email member to confirm revenue share details', !!track.pip_rev_share_completed_at && !!track.pip_rev_member_email_sent_at, null, [{ name: 'PIP_member_revshare', when: 'Automatic — member revenue-share notice' }], track.pip_rev_share_completed_at)}
                      </AutoSteps>
                    )
                  }

                  if (task.status_options === 'auto') return null

                  if (task.name === 'Purchase Additional Services (optional)' && task.status_options === 'enter_details') {
                    const done = !!p.status
                    const rawDecision = done ? p.status.replace('Completed - ', '') : ''
                    const decisionLabel = rawDecision === 'Tax Planning (if not purchased already)' ? 'Tax Planning' : rawDecision
                    let existingData = null
                    if (done) {
                      try { existingData = p.notes ? JSON.parse(p.notes) : { decision: decisionLabel } }
                      catch { existingData = { decision: decisionLabel } }
                    }
                    const pillColor = done ? '#1b9254' : 'var(--vfo-muted)'
                    const formExpandKey = `purchaseform_${task.id}`
                    const isFormShown = done ? !!expanded[formExpandKey] : true
                    return (
                      <div key={task.id}>
                        <StepRow
                          done={done}
                          dotColor={pillColor}
                          name={task.name}
                          onClick={done ? () => setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] })) : undefined}
                          open={isFormShown}
                          onToggle={done ? () => setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] })) : undefined}
                          date={<StepDate value={done ? p.completed_date : ''} readOnly />}
                        >
                          {done && <StepAnswer color={readable(pillColor)}>{decisionLabel}</StepAnswer>}
                        </StepRow>
                        {!readOnly && isFormShown && (
                          <PipPurchaseDecisionForm
                            task={task}
                            priorityTrackId={track.id}
                            clientId={clientId}
                            engagementYear={track.pip_engagement_year}
                            existingData={existingData}
                            onSubmitted={(status, formData, today) => {
                              const updated = { task_id: task.id, status, completed_date: today, notes: JSON.stringify(formData) }
                              setLocalProgress(prev => ({ ...prev, [task.id]: updated }))
                              onProgressChange(task.id, updated)
                            }}
                          />
                        )}
                      </div>
                    )
                  }

                  if (task.status_options === 'pip_checklist') {
                    const done = !!p.status
                    return (
                      // A checklist step (HOUSE_STYLE §6: a dot, never a square checkbox):
                      // "Mark done" records it with today's date, which staff can correct.
                      <StepRow key={task.id} done={done} name={task.name} date={<StepDate value={done ? p.completed_date : ''} />}>
                        {!done && !readOnly && <button onClick={() => toggleCheckbox(task.id)} disabled={!!saving[task.id]} style={btnState(stepChoice, !!saving[task.id])}>{saving[task.id] ? 'Saving…' : 'Mark done'}</button>}
                      </StepRow>
                    )
                  }

                  if (task.status_options === 'pip_reconfirm_email') {
                    const doneColor = '#1b9254'
                    return (
                      <StepRow
                        key={task.id}
                        done={isDone}
                        dotColor={doneColor}
                        name={task.name}
                        emails={!readOnly && <StepEmailsChip pipeline="PIP" title={task.name} templates={[{ name: 'PIP_meeting_confirmation', when: 'Meeting confirmation to the client' }]} context={emailCtx} />}
                        date={<StepDate value={isDone ? p.completed_date : ''} readOnly />}
                      >
                        {isDone && !reconfirmShowDate
                          ? <div className="vfo-stepchips" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <StepAnswer color={readable(doneColor)}>{p.status}</StepAnswer>
                              {/* Reschedule reopens the same form (pre-filled from the track) and
                                  re-sends the same confirmation email with the new slot. */}
                              {!readOnly && <button onClick={openReconfirm} style={btnStep}>Reschedule</button>}
                            </div>
                          : readOnly
                            ? null
                            : reconfirmShowDate
                              ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input type="date" value={reconfirmDate} onChange={e => setReconfirmDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }} />
                                  <input type="time" value={reconfirmTime} onChange={e => setReconfirmTime(e.target.value)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }} />
                                  <select value={reconfirmTz} onChange={e => setReconfirmTz(e.target.value)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '11px' }}>
                                    <option value="ET">Eastern (ET)</option>
                                    <option value="CT">Central (CT)</option>
                                    <option value="MT">Mountain (MT)</option>
                                    <option value="PT">Pacific (PT)</option>
                                    <option value="AKT">Alaska (AKT)</option>
                                    <option value="HT">Hawaii (HT)</option>
                                  </select>
                                  <button onClick={() => sendReconfirm(task.id)} disabled={reconfirmSending || !reconfirmDate} style={btnState(stepSend, reconfirmSending || !reconfirmDate)}>{reconfirmSending ? '...' : 'Send'}</button>
                                  <button onClick={() => setReconfirmShowDate(false)} style={btnStep}>Cancel</button>
                                </div>
                              : <button onClick={openReconfirm} style={stepChoice}>Send confirmation email to client</button>
                        }
                      </StepRow>
                    )
                  }

                  if (task.status_options === 'pip_meeting_date') {
                    const savedDate = scheduledDate || ''
                    return (
                      <StepRow key={task.id} done={!!savedDate} name={task.name}>
                        {readOnly ? (
                          savedDate && <StepAnswer color="var(--vfo-success-text)">{formatDate(savedDate)}</StepAnswer>
                        ) : (
                          <input type="date" value={savedDate} onChange={e => saveScheduled(e.target.value)} style={{ ...inputStyle, fontFamily: 'Inter, sans-serif' }} />
                        )}
                      </StepRow>
                    )
                  }

                  if (readOnly) return (
                    <StepRow key={task.id} done={isDone} dotColor={statusColor} name={task.name} date={<StepDate value={isDone ? p.completed_date : ''} readOnly />}>
                      {isDone && p.status !== 'Completed' && <StepAnswer color={readable(statusColor)}>{p.status}</StepAnswer>}
                    </StepRow>
                  )

                  return (
                    <StepRow key={task.id} done={isDone} dotColor={statusColor} name={task.name} date={<StepDate value={isDone ? p.completed_date : ''} />}>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? readable(statusColor) : 'var(--vfo-ink)' }}>
                        <option value="">-- Select --</option>
                        {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </StepRow>
                  )
                })}
          </PhaseCard>
        )
      })}
    </div>
  )
}

// mirror (Client Mirroring, L5): a member viewing a client mirrored to them -
// with readOnly, and no payment-method tag or revenue-share row.
function PipMeetingsTab({ clientId, programId, client = null, readOnly = false, memberNotes = false, memberCanAdd = false, mirror = false, notes = [], onNotesChange, initialNoteId = null }) {
  const [tracks, setTracks] = useState([])
  const [phases, setPhases] = useState([])
  const [allProgress, setAllProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newCount, setNewCount] = useState('')
  const [addStatus, setAddStatus] = useState('')
  const [adding, setAdding] = useState(false)
  const [collapsedYears, setCollapsedYears] = useState({})
  const isPhone = useIsPhone()

  // True while the list on screen is the last-seen snapshot and the quiet refresh
  // has not landed yet: nothing may open a meeting off snapshot data, because the
  // detail view seeds its editable progress and dates from what it is handed at mount.
  const [snapPending, setSnapPending] = useState(false)
  const [pendingOpenId, setPendingOpenId] = useState(null)
  // The save/send count when the list on screen was loaded: Back or a re-open
  // only holds a click for fresh data if something was written since.
  const writesAtLoadRef = useRef(-1)
  const snapKey = `pipmeetings:${clientId}:${programId ?? ''}`

  // Re-opened in the same session: draw the last meeting list at once, refresh behind it.
  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) {
      applyLoaded(snap)
      writesAtLoadRef.current = snap.writes ?? -1
      setSnapPending(snap.writes !== getWriteCount())
      setLoading(false)
    }
    loadData(!!snap)
  }, [clientId])

  // A meeting clicked while the snapshot was showing opens from the fresh list.
  useEffect(() => {
    if (snapPending || pendingOpenId == null) return
    const fresh = tracks.find(t => t.id === pendingOpenId)
    setPendingOpenId(null)
    if (fresh) setSelectedTrack(fresh)
  }, [snapPending, pendingOpenId, tracks])

  function pipTracksOf(tracksData) {
    return (tracksData.tracks || []).filter(t => t.track_type === 'pip').sort((a, b) => a.id - b.id)
  }

  // Applies the raw responses — fresh from loadData, or the last-seen snapshot.
  function applyLoaded({ tracksData, phasesData, perTrack }) {
    const pipTracks = pipTracksOf(tracksData)
    setTracks(pipTracks)
    setPhases(phasesData.phases || [])
    if (!perTrack) return
    const progressMap = {}
    pipTracks.forEach(track => {
      progressMap[track.id] = {}
      ;(perTrack[track.id]?.progress || []).forEach(p => { progressMap[track.id][p.task_id] = p })
    })
    setAllProgress(progressMap)
  }

  async function loadData(quiet = false) {
    if (quiet !== true) setLoading(true)
    const startWrites = getWriteCount()
    let base = null
    try {
      const [tracksData, phasesData] = await Promise.all([
        callApi('msm_load_priority_tracks', { client_id: clientId }),
        callApi('msm_load_pip_phases', { program_id: programId }),
      ])
      base = { tracksData, phasesData }
      const perTrack = {}
      await Promise.all(pipTracksOf(tracksData).map(async track => {
        perTrack[track.id] = await callApi('msm_load_priority_progress', { priority_track_id: track.id })
      }))
      const raw = { ...base, perTrack }
      applyLoaded(raw)
      setLastSeen(snapKey, { ...raw, writes: startWrites })
      writesAtLoadRef.current = startWrites
    } catch (err) {
      console.error(err)
      // A normal load keeps the list it got, as before; a quiet one keeps the snapshot.
      if (quiet !== true && base) applyLoaded({ ...base, perTrack: null })
    }
    finally { setLoading(false); setSnapPending(false) }
  }

  function nextYearDefault() {
    const years = tracks.map(t => t.pip_engagement_year).filter(y => Number.isFinite(y))
    return years.length ? Math.max(...years) + 1 : 1
  }

  function openAdd() {
    setNewCount('')
    setAddStatus('')
    setShowAdd(true)
  }

  async function addMeetings() {
    const yearInt = nextYearDefault()
    const countInt = parseInt(newCount, 10)
    if (!Number.isFinite(countInt) || countInt < 1 || countInt > 50) { setAddStatus('Enter number of meetings (1-50).'); return }
    setAdding(true)
    try {
      await callApi('msm_add_pip_meetings_for_year', { client_id: clientId, engagement_year: yearInt, count: countInt })
      setShowAdd(false); setNewCount(''); setAddStatus('')
      loadData()
    } catch (err) { setAddStatus(err.message) }
    finally { setAdding(false) }
  }

  const sectionStyle = cardBox
  const rowStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(20,45,95,0.05)', padding: '14px 18px', marginBottom: '8px' }
  const inputStyle = formInput

  if (loading && selectedTrack) return <PipMeetingDetailSkeleton back readOnly={readOnly} />
  if (loading) return <PipMeetingsListSkeleton action={!readOnly} />

  // Clicked while the list was still refreshing: go to the page at once and show
  // its skeleton; it opens with the fresh data the moment that lands.
  if (pendingOpenId != null) {
    return (
      <div>
        <BackLink onClick={() => setPendingOpenId(null)}>Back to PIP Meetings</BackLink>
        <PipMeetingDetailSkeleton readOnly={readOnly} />
      </div>
    )
  }

  if (selectedTrack) {
    return (
      <PipMeetingDetailView
        track={selectedTrack}
        phases={phases}
        progress={allProgress[selectedTrack.id] || {}}
        onBack={() => { setSelectedTrack(null); setSnapPending(getWriteCount() !== writesAtLoadRef.current); loadData(true) }}
        onProgressChange={(taskId, p) => setAllProgress(prev => ({ ...prev, [selectedTrack.id]: { ...prev[selectedTrack.id], [taskId]: p } }))}
        onTrackUpdate={loadData}
        readOnly={readOnly}
        memberNotes={memberNotes}
        memberCanAdd={memberCanAdd}
        mirror={mirror}
        notes={notes}
        onNotesChange={onNotesChange}
        clientId={clientId}
        client={client}
        initialNoteId={initialNoteId}
      />
    )
  }

  const byYear = tracks.reduce((acc, t) => {
    const y = t.pip_engagement_year || 0
    if (!acc[y]) acc[y] = []
    acc[y].push(t)
    return acc
  }, {})
  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => a - b)

  return (
    <div>
      <ListHeader
        title="PIP Meetings"
        count={tracks.length}
        action={!readOnly && <button onClick={() => showAdd ? setShowAdd(false) : openAdd()} style={btnPrimary}>+ Add Year</button>}
      />


      {showAdd && (
        <ProfileCard icon="calendar" title={`Add PIP Meetings · Year ${nextYearDefault()}`} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px' }}>How many PIP meetings paid for (excluding PIP 1 where applicable)?</label>
            <input type="number" min="1" max="50" value={newCount} onChange={e => setNewCount(e.target.value)} style={inputStyle} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addMeetings} disabled={adding} style={btnState(btnPrimary, adding)}>{adding ? 'Adding...' : 'Add'}</button>
            <button onClick={() => setShowAdd(false)} disabled={adding} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
          {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
        </ProfileCard>
      )}

      {tracks.length === 0 && !showAdd && (
        <TrackEmpty>No PIP meetings added yet.</TrackEmpty>
      )}

      {sortedYears.map(year => {
        const yearTracks = byYear[year]
        const isCollapsed = collapsedYears[year]
        const completedCount = yearTracks.filter(t => t.pip_completed_date).length
        return (
          <div key={year} style={{ marginBottom: '16px' }}>
            <div onClick={() => setCollapsedYears(p => ({ ...p, [year]: !p[year] }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: 'rgba(0,149,255,0.08)', border: '1px solid rgba(0,149,255,0.2)', borderRadius: '10px', cursor: 'pointer', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#0095ff', fontWeight: 600, fontSize: '11px', transform: isCollapsed ? 'rotate(-90deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--vfo-ink)' }}>Year {year}</span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>· {yearTracks.length} {yearTracks.length === 1 ? 'meeting' : 'meetings'}{completedCount > 0 ? ` · ${completedCount} completed` : ''}</span>
              </div>
            </div>
            {!isCollapsed && yearTracks.map(track => {
              const labelColor = meetingLabelColor(track)
              const isLocked = track.pip_paid === false
              if (isLocked) {
                return (
                  <div key={track.id}
                    title="Locked until payment + revenue share are recorded"
                    style={{ ...rowStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: isPhone ? 0 : '18px', opacity: 0.55, cursor: 'not-allowed', ...(isPhone ? { padding: '12px 14px', gap: '10px' } : {}) }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--vfo-muted)' }}>{meetingLabel(track)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Awaiting payment · Created {formatDate(track.created_at)}</div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(251,137,90,0.15)', color: '#e06717', fontWeight: 600, border: '1px solid rgba(251,137,90,0.3)' }}>Locked</span>
                  </div>
                )
              }
              return (
                <div key={track.id} onClick={() => snapPending ? setPendingOpenId(track.id) : setSelectedTrack(track)}
                  style={{ ...rowStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: isPhone ? 0 : '18px', ...(isPhone ? { padding: '12px 14px', gap: '10px' } : {}) }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: labelColor }}>{meetingLabel(track)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Created {formatDate(track.created_at)}</div>
                  </div>
                  {isPhone
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>
                    : <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default PipMeetingsTab
