import { useState, useEffect } from 'react'
import { callApi } from '../../../lib/api'
import { PhaseNotesButton, PhaseNotesPanel } from '../../shared/PhaseNotes'
import { PipMeetingsListSkeleton, PipMeetingDetailSkeleton } from '../../shared/Skeleton'
import { TrackHero, PhaseBadge, ListHeader } from '../../shared/TrackKit'
import PipPurchaseDecisionForm from './PipPurchaseDecisionForm'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

// Plain DATE strings are split, never fed to new Date() — that reads them as UTC
// midnight and renders the previous day west of Greenwich. timestamptz is local.
const fmtMMDD = (v) => {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return `${p[1]}/${p[2]}` }
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

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
  if (track.pip_completed_date) return `PIP meeting completed on ${fmtDate(track.pip_completed_date)}`
  if (track.pip_scheduled_date) return `PIP meeting scheduled for ${fmtDate(track.pip_scheduled_date)}`
  return 'PIP meeting not yet scheduled'
}

function meetingLabelColor(track) {
  if (track.pip_completed_date) return '#1b9254'
  if (track.pip_scheduled_date) return '#0095ff'
  return 'var(--vfo-muted)'
}

function PipMeetingDetailView({ track, phases, progress, onBack, onProgressChange, onTrackUpdate, readOnly, notes, onNotesChange, clientId, client }) {
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

  useEffect(() => {
    const expandState = {}
    phases.forEach(phase => {
      const tasks = countedTasks(phase)
      const allDone = tasks.length === 0 || tasks.every(isTaskDone)
      expandState[phase.id] = !allDone
    })
    setExpanded(expandState)
  }, [])

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
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>← Back to PIP Meetings</button>
      <TrackHero
        eyebrow={`PIP Meeting${track.pip_engagement_year ? ` · Year ${track.pip_engagement_year}` : ''}`}
        title="PIP Meeting"
        meta={<span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${heroLabelColor}22`, color: heroLabelColor, border: `1px solid ${heroLabelColor}44`, fontWeight: 600 }}>{meetingLabel(track)}</span>}
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
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'

        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
                <PhaseBadge number={phaseIdx + 1} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!readOnly && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'PIP Meetings').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {!readOnly && expanded[`notes_${phase.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={phase.name} tabName="PIP Meetings" programName="VFO Holistic Planning" notes={notes} onNotesChange={onNotesChange} />}

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.length === 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic', padding: '4px 0' }}>No tasks defined for this phase yet.</div>}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: stepDone ? '#1b9254' : pending ? '#e06717' : 'transparent', flexShrink: 0, border: `1px solid ${stepDone ? '#1b9254' : pending ? '#e06717' : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}{!readOnly && emailTpls && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="PIP" title={label} templates={emailTpls} context={emailCtx} /></span>}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                          {stepDone && tag && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{tag}</span>}
                          {stepDone && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Done</span>}
                          {!stepDone && pending && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.15)', border: '1px solid rgba(224,103,23,0.3)', color: '#e06717' }}>Pending — ACH clearing</span>}
                        </span>
                        {stepDone && date && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(date)}</span>}
                      </div>
                    )
                    const methodTag = track.pip_payment_method_type
                      ? track.pip_payment_method_type.toUpperCase()
                      : null
                    const allDone = false
                    return (
                      <div key={task.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: allDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${allDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{'Automated steps'}</span>
                        </div>
                        <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                          {autoStep('Payment link sent (ACH or Card choice)', !!track.pip_payment_email_sent_at, null, [{ name: 'PIP_payment', when: 'Automatic — payment link' }], track.pip_payment_email_sent_at)}
                          {/* The ACH confirmation email no longer gets its own step — the
                              step completes on the payment alone. Preview it here. */}
                          {autoStep('Payment collected', !!track.pip_payment_completed_at, methodTag, [{ name: 'PIP_confirmation', when: 'Bank transfer (ACH) only — card gets the invoice/receipt instead' }], track.pip_payment_completed_at, track.pip_payment_status === 'processing')}
                          {autoStep('Invoice and receipt created and emailed to client', !!track.pip_invoice_receipt_email_sent_at, null, [{ name: 'PIP_invoicereceipt_email', when: 'Automatic — invoice + receipt' }], track.pip_invoice_receipt_email_sent_at)}
                          {autoStep('Revenue shares paid · Email member to confirm revenue share details', !!track.pip_rev_share_completed_at && !!track.pip_rev_member_email_sent_at, null, [{ name: 'PIP_member_revshare', when: 'Automatic — member revenue-share notice' }], track.pip_rev_share_completed_at)}
                        </div>
                      </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', cursor: done ? 'pointer' : 'default' }}
                          onClick={() => done && setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] }))}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? pillColor : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? pillColor : 'var(--vfo-border-mid)'}` }} />
                          <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                          {done
                            ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${pillColor}22`, color: pillColor, border: `1px solid ${pillColor}44` }}>{decisionLabel}</span>
                            : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                          }
                          {done && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{fmtDate(p.completed_date)}</span>}
                          {done && <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isFormShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
                        </div>
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
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        <div onClick={() => !readOnly && !done && toggleCheckbox(task.id)} style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-strong)'}`, background: done ? '#1b9254' : 'transparent', cursor: done || readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', flexShrink: 0 }}>{done ? '✓' : ''}</div>
                        <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', textDecoration: done ? 'line-through' : 'none', flex: 1 }}>{task.name}</span>
                        {done && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{fmtDate(p.completed_date)}</span>}
                      </div>
                    )
                  }

                  if (task.status_options === 'pip_reconfirm_email') {
                    const doneColor = '#1b9254'
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? doneColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? doneColor : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}{!readOnly && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="PIP" title={task.name} templates={[{ name: 'PIP_meeting_confirmation', when: 'Meeting confirmation to the client' }]} context={emailCtx} /></span>}</span>
                        {isDone && !reconfirmShowDate
                          ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${doneColor}22`, color: doneColor, border: `1px solid ${doneColor}44` }}>{p.status}</span>
                              {/* Reschedule reopens the same form (pre-filled from the track) and
                                  re-sends the same confirmation email with the new slot. */}
                              {!readOnly && <button onClick={openReconfirm} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Reschedule</button>}
                            </div>
                          : readOnly
                            ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
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
                                  <button onClick={() => sendReconfirm(task.id)} disabled={reconfirmSending || !reconfirmDate} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }}>{reconfirmSending ? '...' : 'Send'}</button>
                                  <button onClick={() => setReconfirmShowDate(false)} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
                                </div>
                              : <button onClick={openReconfirm} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }}>Send confirmation email to client</button>
                        }
                        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? fmtDate(p.completed_date) : ''}</span>
                      </div>
                    )
                  }

                  if (task.status_options === 'pip_meeting_date') {
                    const savedDate = scheduledDate || ''
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: savedDate ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${savedDate ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '13px', color: savedDate ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                        {readOnly ? (
                          savedDate && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: '#1b925422', color: '#1b9254', fontWeight: 600, border: '1px solid #1b925444' }}>{savedDate}</span>
                        ) : (
                          <input type="date" value={savedDate} onChange={e => saveScheduled(e.target.value)} style={{ ...inputStyle, fontFamily: 'Inter, sans-serif' }} />
                        )}
                      </div>
                    )
                  }

                  if (readOnly) return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                        : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{fmtDate(p.completed_date)}</span>}
                    </div>
                  )

                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
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

function PipMeetingsTab({ clientId, programId, client = null, readOnly = false, notes = [], onNotesChange }) {
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

  useEffect(() => { loadData() }, [clientId])

  async function loadData() {
    setLoading(true)
    try {
      const [tracksData, phasesData] = await Promise.all([
        callApi('msm_load_priority_tracks', { client_id: clientId }),
        callApi('msm_load_pip_phases', { program_id: programId }),
      ])
      const pipTracks = (tracksData.tracks || []).filter(t => t.track_type === 'pip').sort((a, b) => a.id - b.id)
      setTracks(pipTracks)
      setPhases(phasesData.phases || [])
      const progressMap = {}
      await Promise.all(pipTracks.map(async track => {
        const pd = await callApi('msm_load_priority_progress', { priority_track_id: track.id })
        progressMap[track.id] = {}
        ;(pd.progress || []).forEach(p => { progressMap[track.id][p.task_id] = p })
      }))
      setAllProgress(progressMap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const rowStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(20,45,95,0.05)', padding: '14px 18px', marginBottom: '8px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  if (loading && selectedTrack) return <PipMeetingDetailSkeleton />
  if (loading) return <PipMeetingsListSkeleton />

  if (selectedTrack) {
    return (
      <PipMeetingDetailView
        track={selectedTrack}
        phases={phases}
        progress={allProgress[selectedTrack.id] || {}}
        onBack={() => { setSelectedTrack(null); loadData() }}
        onProgressChange={(taskId, p) => setAllProgress(prev => ({ ...prev, [selectedTrack.id]: { ...prev[selectedTrack.id], [taskId]: p } }))}
        onTrackUpdate={loadData}
        readOnly={readOnly}
        notes={notes}
        onNotesChange={onNotesChange}
        clientId={clientId}
        client={client}
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
        action={!readOnly && <button onClick={() => showAdd ? setShowAdd(false) : openAdd()} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Add Year</button>}
      />


      {showAdd && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add PIP Meetings · Year {nextYearDefault()}</div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px' }}>How many PIP meetings paid for (excluding PIP 1 where applicable)?</label>
            <input type="number" min="1" max="50" value={newCount} onChange={e => setNewCount(e.target.value)} style={inputStyle} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addMeetings} disabled={adding} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}>{adding ? 'Adding...' : 'Add'}</button>
            <button onClick={() => setShowAdd(false)} disabled={adding} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
          {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
        </div>
      )}

      {tracks.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No PIP meetings added yet.</div>
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
                    style={{ ...rowStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '18px', opacity: 0.55, cursor: 'not-allowed' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--vfo-muted)' }}>{meetingLabel(track)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Awaiting payment · Created {new Date(track.created_at).toLocaleDateString()}</div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(251,137,90,0.15)', color: '#e06717', fontWeight: 600, border: '1px solid rgba(251,137,90,0.3)' }}>Locked</span>
                  </div>
                )
              }
              return (
                <div key={track.id} onClick={() => setSelectedTrack(track)}
                  style={{ ...rowStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '18px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: labelColor }}>{meetingLabel(track)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Created {new Date(track.created_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>
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
