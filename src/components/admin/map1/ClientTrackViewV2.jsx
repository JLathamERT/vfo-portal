import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, loadCachedAction } from '../../../lib/api'
import { Map1TrackSkeleton } from '../../shared/Skeleton'
import PFPricingForm from './PFPricingForm'
import PFExtraMeetingForm from './PFExtraMeetingForm'
import PIPDecisionForm from './PIPDecisionForm'
import MeetingCompleteButton from './MeetingCompleteButton'
import { PhaseNotesButton, PhaseNotesPanel } from '../../shared/PhaseNotes'
import { TrackHero, PhaseBadge } from '../../shared/TrackKit'
import Map1PricingSplitCard from './Map1PricingSplitCard'
import StepDate from '../../shared/StepDate'
import StepEmailsChip from '../../shared/StepEmailsChip'

// The Initial Contact "Who is completing the tracking…" gate step. When it is
// NOT set to "Member" (unset or "VFOS"), the other steps in the phase are inert
// and only this one counts toward the phase.
const isTrackingOwnerTask = (t) => (t?.name || '').startsWith('Who is completing the tracking')

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

// PIP meeting confirmation step (PIP 1 / PIP Follow-up) — 3-button post-meeting
// decision mirroring Partnership Fast Track Meeting 1: "with date" (date/time/tz),
// "date not confirmed", and "declined". Drafts the email via the backend, then
// records the task status. `meeting` is 'pip1' or 'followup'. Self-contained so
// its date/time inputs keep state across parent re-renders.
function PipConfirmStep({ clientId, task, p, meeting, readOnly, onDone, emailCtx }) {
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
  function fmtDate(d) { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

  async function fire(decision, d, t, z) {
    setPending(decision)
    try {
      await callApi('automation_PIP1_reconfirmationemail', { client_id: clientId, decision, meeting, meeting_date: d || null, meeting_time: t || null, meeting_tz: z || null })
      const status = decision === 'declined' ? 'Sent declined email' : decision === 'confirm_no_date' ? 'Email sent - date not arranged' : 'Confirmation email sent'
      const today = new Date().toISOString().split('T')[0]
      const notes = decision === 'confirm_date' ? [d, t, z].filter(Boolean).join(' ') : null
      await callApi('msm_save_client_task', { client_id: clientId, task_id: task.id, status, completed_date: today, completed_by: null, notes })
      onDone(task.id, status, today)
      if (decision === 'confirm_date') setSlot(notes || '')
      setShowDate(false); setRescheduling(false); setDate(''); setTime('')
    } catch (err) { console.error('PIP confirm error:', err) }
    finally { setPending(null) }
  }

  // Reschedule reopens the same form pre-filled with the stored slot and re-sends
  // the same confirmation email (the backend builder has no guards or side effects).
  function openReschedule() {
    const s = parseSlotNotes(slot)
    setDate(s.date); setTime(s.time); setTz(s.tz)
    setRescheduling(true)
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
      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}{!readOnly && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MAP 1" display="modal" title={task.name} templates={[{ name: 'PIP_meeting_confirm', when: 'If date confirmed / not confirmed' }, { name: 'PIP_meeting_declined', when: 'If the client declined the meeting' }]} context={emailCtx} /></span>}</span>
      {isDone
        ? rescheduling
          ? dateForm(() => setRescheduling(false))
          : <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
              {!readOnly && <button onClick={openReschedule} style={cancelBtn}>Reschedule</button>}
            </div>
        : readOnly
          ? <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Not started</span>
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

function ClientTrackViewV2({ clientId, programId, client, readOnly = false, notes = [], onNotesChange }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [completedPhases, setCompletedPhases] = useState({})
  const [pipelineData, setPipelineData] = useState(null)
  const [trackStatus, setTrackStatus] = useState('live')
  const [togglingStatus, setTogglingStatus] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { loadTrack() }, [clientId])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        loadCachedAction('msm_load_client_track', { program_id: programId }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)

      // Auto-expand: first incomplete phase, collapse completed ones
      const expandState = {}
      loadedPhases.forEach(phase => {
        let tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
        // Initial Contact: when the tracking-owner step isn't "Member", only it
        // counts — so a "VFOS" pick completes (and collapses) the phase.
        const owner = tasks.find(isTrackingOwnerTask)
        if (owner && prog[owner.id]?.status !== 'Member') tasks = [owner]
        const allDone = tasks.length === 0 || tasks.every(t => prog[t.id]?.status)
        expandState[phase.id] = !allDone
      })
      setExpanded(expandState)

      // Load pipeline data
      try {
        let clientRow = null
        if (readOnly) {
          const pData = await callApi('member_load_pipeline', { client_id: clientId })
          clientRow = pData.row || null
        } else {
          const pData = await callApi('automation_load_pipeline_data', { table_name: 'pipeline_map1' })
          clientRow = (pData.rows || []).find(r => r.client_id === clientId) || null
        }
        setPipelineData(clientRow || null)
        setTrackStatus(clientRow?.status || 'live')
      } catch (e) { console.error('Pipeline load error:', e) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function toggleTrackStatus() {
    if (!pipelineData?.id) return
    const newStatus = trackStatus === 'live' ? 'stopped' : 'live'
    setTogglingStatus(true)
    try {
      await callApi('map1_update_status', { pipeline_id: pipelineData.id, status: newStatus })
      setTrackStatus(newStatus)
      setPipelineData(p => (p ? { ...p, status: newStatus } : p))
    } catch (err) { console.error(err) }
    finally { setTogglingStatus(false) }
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

  async function saveDateEntry(taskId, date) {
    const status = date ? 'Scheduled' : ''
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status, completed_date: date || null, completed_by: null, notes: null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date || null } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  async function completePhase(phase) {
    const today = new Date().toISOString().split('T')[0]
    const autoCompleteCodes = {
          'MAP 1 - Initial Contact': ['Call outcome'],
          'MAP 1 - PIP 1': ['PIP Initial presentation', 'CIQ complete', 'Prioritization complete'],
          'MAP 1 - PIP Follow Up': ['PIP Follow up presentation', 'Client PIP decision'],
        }
    const allowedCodes = autoCompleteCodes[phase.name] || []
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options && t.status_options !== 'auto' && allowedCodes.includes(t.name))
    setCompletedPhases(p => ({ ...p, [phase.id]: 'saving' }))
    try {
      await Promise.all(tasks.map(task => {
        const firstOption = task.status_options.split('|')[0]
        return callApi('msm_save_client_task', { client_id: clientId, task_id: task.id, status: firstOption, completed_date: today, completed_by: null, notes: null })
      }))
      const newProgress = { ...progress }
      tasks.forEach(task => {
        newProgress[task.id] = { ...newProgress[task.id], task_id: task.id, status: task.status_options.split('|')[0], completed_date: today }
      })
      setProgress(newProgress)
      setCompletedPhases(p => ({ ...p, [phase.id]: 'done' }))
      setTimeout(() => {
        setCompletedPhases(p => ({ ...p, [phase.id]: null }))
        setExpanded(p => ({ ...p, [phase.id]: false }))
      }, 2000)
    } catch (err) { console.error(err); setCompletedPhases(p => ({ ...p, [phase.id]: null })) }
  }

  const statusColors = { Completed: '#1b9254', Confirmed: '#1b9254', Yes: '#1b9254', VFOS: '#0095ff', Member: '#0095ff', 'Call arranged': '#1b9254', 'PIP 1 scheduled': '#1b9254', 'Follow-up scheduled': '#1b9254', 'PIP Follow-up confirmed': '#1b9254', 'Send confirmation email': '#1b9254', 'Sent confirmation email': '#1b9254', 'Regular priorities tab enabled': '#1b9254', 'Tax priorities tab enabled': '#1b9254', 'Completed + N/A': '#1b9254', 'Completed + Risk 1': '#1b9254', 'Completed + Risk 2': '#1b9254', 'Completed + Risk 3': '#1b9254', 'Completed + Risk 4': '#1b9254', 'Completed + Risk 5': '#1b9254', 'Lite': '#1b9254', 'Core': '#1b9254', 'Max': '#1b9254', 'In Progress': '#e06717', Undecided: '#e06717', 'No response': '#e74c3c', No: '#e74c3c', 'PIP Follow-up declined': '#e74c3c', 'Send declined email': '#e74c3c', 'Meeting declined': '#e74c3c', 'No show': '#e74c3c', 'Completed - Yes': '#1b9254', 'Completed - No': '#e74c3c', 'Completed - Undecided': '#e06717' }

  // Non-auto tasks that count toward a phase's completion. For the Initial
  // Contact phase a new first step ("Who is completing the tracking…") gates the
  // rest: only when it is "Member" do all four count; otherwise (unset or "VFOS")
  // just that one step counts and the other three are inert.
  function countedTasks(phase) {
    const nonAuto = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    const owner = nonAuto.find(isTrackingOwnerTask)
    if (!owner) return nonAuto
    return progress[owner.id]?.status === 'Member' ? nonAuto : [owner]
  }

  function getPhaseState(phase) {
    // PC Admin completion lives on pipeline_map1 (the c15 decision + the
    // payment/revshare cascade), NOT on program_client_tasks progress — its
    // non-auto tasks never get a status, so the generic logic below would leave
    // the header grey forever. Derive its state from the pipeline row instead.
    if (phase.name === 'MAP 1 - PC Admin') return pcAdminPhaseState()
    // Allocation's two "Move to ..." tasks are alternatives — a client may do
    // only Regular or only Tax — so either one enabled completes the phase.
    if (phase.name === 'MAP 1 - Allocation') {
      const allocTasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
      return allocTasks.some(t => progress[t.id]?.status) ? 'done' : 'pending'
    }
    const tasks = countedTasks(phase)
    if (tasks.length === 0) return 'done'
    if (tasks.every(t => progress[t.id]?.status)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }

  function pcAdminPhaseState() {
    const pd = pipelineData
    if (!pd) return 'pending'
    const pipTask = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'PIP Follow Up decision')
    const pipStatus = pipTask ? (progress[pipTask.id]?.status || '') : ''
    if (!pipStatus.startsWith('Completed')) return 'pending'   // upstream not done yet
    const pipDecision = pipStatus.replace('Completed - ', '')
    const finalDec = pd.c15_final_decision
    if (pipDecision === 'No' || finalDec === 'No') return 'done'   // declined — terminal
    const zeroShare = parseFloat(String(pd.member_share ?? '').replace(/[$,]/g, '')) === 0
    const revDone = ['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd.rec1_rev_paid) || zeroShare
    const memberNotified = pd.c24_email_sent === true || zeroShare
    if (revDone && memberNotified) return 'done'                  // Yes path fully complete
    if (finalDec || pipDecision === 'Yes' || pd.c16_sent === 'Yes') return 'active'
    return 'pending'
  }

  // Header "X/Y" for the PC Admin phase. Its rows are pipeline-driven (the
  // program_client_tasks never receive a progress status), so the generic
  // doneTasks/nonAutoTasks count always reads 0/N. Mirror the autoStep()
  // done-conditions of whichever decision branch is currently rendered so the
  // pill reflects the steps actually shown. KEEP IN SYNC with the PC Admin body
  // render below (the autoStep calls in the IIFE).
  function pcAdminStepCounts() {
    const pd = pipelineData
    if (!pd) return { done: 0, total: 0 }
    const pipTask = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'PIP Follow Up decision')
    const pipStatus = pipTask ? (progress[pipTask.id]?.status || '') : ''
    if (!pipStatus.startsWith('Completed')) return { done: 0, total: 0 }
    const pipDecision = pipStatus.replace('Completed - ', '')
    const isZeroShare = (v) => parseFloat(String(v ?? '').replace(/[$,]/g, '')) === 0
    const steps = []
    const add = (done, na = false) => steps.push(!!done || !!na)

    if (pipDecision === 'Yes') {
      add(pd?.c16_sent === 'Yes')
      add(pd?.c17_client_signed === 'Yes')
      add(pd?.c18_ceo_signed === 'Yes')
      add(!!pd?.pay1_email_sent_at || !!pd?.pay1_status)
      add(!!pd?.pay1_status)
      add(pd?.pay1_status === 'succeeded')
      add(!!pd?.invoice_number)
      add(['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd?.rec1_rev_paid), isZeroShare(pd?.member_share))
      add(pd?.c24_email_sent === true, isZeroShare(pd?.member_share))
    } else if (pipDecision === 'Undecided') {
      const finalDec = pd?.c15_final_decision
      add(pd?.c14_email_sent === 'Yes')   // Decision email sent
      add(!!finalDec)                      // Client response received
      if (finalDec === 'Yes') {
        add(!!pd?.gross_fee)               // PF completed pricing
        if (pd?.gross_fee) {
          add(pd?.c16_sent === 'Yes')
          add(pd?.c17_client_signed === 'Yes')
          add(pd?.c18_ceo_signed === 'Yes')
          add(!!pd?.pay1_email_sent_at || !!pd?.pay1_status)
          add(!!pd?.pay1_status)           // Payment received (undecided→yes branch)
          add(!!pd?.invoice_number)
          add(['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd?.rec1_rev_paid), isZeroShare(pd?.member_share))
          add(pd?.c24_email_sent === true, isZeroShare(pd?.member_share))
        }
      } else if (finalDec === 'ExtraMeeting') {
        add(true)                          // Extra meeting requested
      }
    }
    return { done: steps.filter(Boolean).length, total: steps.length }
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  const inputStyle = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Reactive to the selected client + loaded pipeline row; empty values are
  // omitted so those tokens keep rendering as bracketed chips.
  const emailCtx = (() => {
    const ctx = {}
    const full = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''
    if (full) { ctx['Client Name'] = full; ctx['Client First'] = full.split(/\s+/)[0] }
    const pf = client?.assigned_pf ? String(client.assigned_pf).trim() : ''
    if (pf) ctx['PF Name'] = pf
    const member = client?.member_name ? String(client.member_name).trim() : ''
    if (member) { ctx['Member Name'] = member; ctx['Member First'] = member.split(/\s+/)[0] }
    const sl = pipelineData?.c15_service_level
    if (sl) ctx['Service Level'] = sl
    return ctx
  })()

  if (loading) return <Map1TrackSkeleton />


  const totalTasks = phases.reduce((s, p) => {
    const nonAuto = (p.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    // Allocation tasks are alternatives: once a path is enabled, only the
    // enabled one(s) count so the unused path doesn't hold the % down.
    if (p.name === 'MAP 1 - Allocation') {
      const set = nonAuto.filter(t => progress[t.id]?.status).length
      return s + (set > 0 ? set : nonAuto.length)
    }
    return s + countedTasks(p).length
  }, 0)
  const completedTasks = phases.reduce((s, phase) => {
    const nonAuto = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    // PC Admin's non-auto tasks are pipeline-driven (no progress status), so
    // count them complete when the phase resolves done (see pcAdminPhaseState).
    if (phase.name === 'MAP 1 - PC Admin') return s + (getPhaseState(phase) === 'done' ? nonAuto.length : 0)
    return s + countedTasks(phase).filter(t => progress[t.id]?.status && progress[t.id].status !== '').length
  }, 0)

  return (
    <div>
      <TrackHero
        eyebrow="VFO Holistic Planning"
        title="MAP 1 — Engagement Process"
        completed={completedTasks}
        total={totalTasks}
        steps={phases.map(ph => ({ label: ph.name.replace(/^MAP 1 - /, ''), state: getPhaseState(ph) }))}
        action={!readOnly && pipelineData?.id && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{trackStatus === 'live' ? 'Live' : 'Stopped'}</span>
            <div onClick={() => { if (!togglingStatus) toggleTrackStatus() }}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: trackStatus === 'live' ? '#1b9254' : '#e74c3c', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: trackStatus === 'live' ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />

      {/* Admin surface only — exposes VFO's own cut, so it is not rendered in the
          member view. Read-only: MAP 1 splits are set through the pricing flow or the
          Payment Continuation tool, not here. (Tax planners never reach this tab.) */}
      {!readOnly && (
        <Map1PricingSplitCard
          plan={pipelineData}
          expanded={!!expanded.map1_split}
          onToggle={() => setExpanded(p => ({ ...p, map1_split: !p.map1_split }))}
        />
      )}

      {/* Phases */}
      {phases.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = countedTasks(phase)
        const isPCAdminPhase = phase.name === 'MAP 1 - PC Admin'
        const pcCounts = isPCAdminPhase ? pcAdminStepCounts() : null
        const doneTasks = isPCAdminPhase ? pcCounts.done : nonAutoTasks.filter(t => progress[t.id]?.status && progress[t.id].status !== '').length
        const headerTotal = isPCAdminPhase ? pcCounts.total : nonAutoTasks.length
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        const autoCompletableCodesForCheck = {
          'MAP 1 - PIP 1': ['PIP Initial presentation', 'CIQ complete', 'Prioritization complete'],
          'MAP 1 - PIP Follow Up': ['PIP Follow up presentation', 'Client PIP decision'],
        }
        const autoCodesForPhase = autoCompletableCodesForCheck[phase.name] || []
        const autoTasksAllDone = autoCodesForPhase.length > 0 && (phase.program_client_tasks || [])
          .filter(t => autoCodesForPhase.includes(t.name))
          .every(t => progress[t.id]?.status && progress[t.id].status !== '')
        const hasCompleteButton = ['MAP 1 - PIP 1', 'MAP 1 - PIP Follow Up'].includes(phase.name) && !autoTasksAllDone
        const hasInlineCompleteButton = phase.name === 'MAP 1 - Initial Contact' && state !== 'done'
        const phaseCompleteState = completedPhases[phase.id]

        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
                <PhaseBadge number={phaseIdx + 1} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!readOnly && <PhaseNotesButton count={(notes || []).filter(n => n.phase_name === phase.name && n.tab_name === 'MAP 1').length} isOpen={expanded[`notes_${phase.id}`]} onClick={() => setExpanded(p => ({ ...p, [`notes_${phase.id}`]: !p[`notes_${phase.id}`] }))} />}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{headerTotal}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {!readOnly && expanded[`notes_${phase.id}`] && <PhaseNotesPanel clientId={clientId} phaseName={phase.name} tabName="MAP 1" programName="VFO Holistic Planning" notes={notes} onNotesChange={onNotesChange} />}

            {/* Phase body */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>

{phase.name === 'MAP 1 - PC Admin' && (() => {
                  const pipDecisionTask = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'PIP Follow Up decision')
                  const pipStatus = pipDecisionTask ? (progress[pipDecisionTask.id]?.status || '') : ''
                  const pipDecision = pipStatus.replace('Completed - ', '')

                  if (!pipStatus || !pipStatus.startsWith('Completed')) return (
                    <div style={{ padding: '12px', color: 'var(--vfo-muted)', fontSize: '13px' }}>Waiting for PIP Follow Up decision</div>
                  )

                  const finalDec = pipelineData?.c15_final_decision
                  const decisionColor = pipDecision === 'Yes' ? '#1b9254' : pipDecision === 'No' ? '#e74c3c' : finalDec === 'Yes' ? '#1b9254' : finalDec === 'No' ? '#e74c3c' : '#e06717'
                  const decisionLabel = pipDecision === 'Yes' ? 'Yes — proceeding' : pipDecision === 'No' ? 'No — declined' : finalDec === 'Yes' ? `Yes — ${pipelineData?.c15_service_level || 'proceeding'}${pipelineData?.c15_via_extra_meeting ? ' (via extra meeting)' : ''}` : finalDec === 'No' ? `No — declined${pipelineData?.c15_via_extra_meeting ? ' (via extra meeting)' : ''}` : finalDec === 'ExtraMeeting' ? 'Extra meeting requested' : 'Undecided — awaiting client'

                  // Read-only email previews keyed by auto-step label. Each auto row that
                  // sends a templated email exposes a "View emails" chip listing every
                  // variant that step can send. Purely additive display (no send behavior).
                  const STEP_EMAIL_TPLS = {
                    'Engagement agreement created and sent for signing': [
                      { name: 'CONTRACT_agreementsent|Yes', when: 'Sent automatically when the decision is Yes' },
                      { name: 'CONTRACT_signing_reminder', when: 'Automatic reminder if unsigned (2 business days)' },
                    ],
                    'Engagement agreement signed by CEO': [
                      { name: 'CONTRACT_ceocountersign|Yes', when: 'Automatic — asks the CEO to countersign' },
                    ],
                    'Payment link sent (ACH or Card choice)': [
                      { name: 'CONTRACT_paymentemail|Yes', when: 'Automatic — first payment link' },
                      { name: 'CONTRACT_payment_reminder', when: 'Automatic reminder if unpaid (2 business days)' },
                    ],
                    'Payment collected': [
                      { name: 'CONTRACT_confirmationemail|card', when: 'No longer sent automatically — card gets the invoice/receipt instead' },
                      { name: 'CONTRACT_confirmationemail|ach', when: 'If paid by bank transfer (ACH) — the only method that gets a confirmation' },
                      { name: 'CONTRACT_confirmationemail|check', when: 'If paid by check' },
                      { name: 'CONTRACT_paidbycheck|check', when: 'When admin records a check is on the way' },
                      { name: 'CONTRACT_checkreminder|check', when: 'Automatic reminder 7 business days before a check payment is due' },
                      { name: 'CONTRACT_installment_charge_failed', when: 'Automatic — if a quarterly auto-charge (payments 2-4) fails' },
                      { name: 'CONTRACT_tracy_newcase', when: 'Internal — new-case notice to Tracy (first payment only)' },
                    ],
                    'Invoice and receipt created and emailed to client': [
                      { name: 'CONTRACT_invoicereceipt_email|first', when: 'First payment' },
                      { name: 'CONTRACT_invoicereceipt_email|subsequent', when: 'Later payments' },
                      { name: 'CONTRACT_invoicereceipt_email|failed', when: 'If a payment failed' },
                    ],
                    'Revenue share paid': [
                      { name: 'CONTRACT_member_revshare|first', when: 'First revenue share' },
                      { name: 'CONTRACT_member_revshare|subsequent', when: 'Later revenue shares' },
                    ],
                    'Member notified of revenue share': [
                      { name: 'CONTRACT_member_revshare|first', when: 'First revenue share' },
                      { name: 'CONTRACT_member_revshare|subsequent', when: 'Later revenue shares' },
                    ],
                    'Decline email sent to client': [
                      { name: 'PCADMIN_followup|No', when: 'Decline email' },
                    ],
                  }
                  // `pending` = the P1 ACH is in flight (pay1_status 'processing');
                  // pass a string to override the tag text (bank verification).
                  // Mirrors AutoRow in AdvisorOnboarding.jsx — orange dot + orange
                  // tag instead of "Not completed".
                  const autoStep = (label, done = false, tag = null, na = false, at = null, pending = false) => {
                    const emailTpls = STEP_EMAIL_TPLS[label]
                    const showPending = !done && !na && !!pending
                    return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: (done || na) ? '#1b9254' : showPending ? '#e06717' : 'transparent', flexShrink: 0, border: `1px solid ${(done || na) ? '#1b9254' : showPending ? '#e06717' : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
                      {!readOnly && emailTpls && <StepEmailsChip pipeline="MAP 1" display="modal" title={label} templates={emailTpls} context={emailCtx} />}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                        {done && tag && !na && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{tag}</span>}
                        {showPending
                          ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.15)', border: '1px solid rgba(224,103,23,0.3)', color: '#e06717' }}>{typeof pending === 'string' ? pending : 'Pending — ACH clearing'}</span>
                          : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: (done || na) ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', border: (done || na) ? '1px solid rgba(27,146,84,0.3)' : '1px solid var(--vfo-border-chip)', color: (done || na) ? '#1b9254' : 'var(--vfo-muted)' }}>{na ? 'N/A' : (done ? 'Done' : 'Not completed')}</span>}
                      </span>
                      {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>}
                    </div>
                    )
                  }

                  // P1 ACH in flight: micro-deposits still being verified reads as
                  // "bank verification"; otherwise the debit is simply clearing.
                  const pay1Pending = (row) => row?.pay1_status === 'processing'
                    ? (row?.pay1_bank_verification_pending_at ? 'Pending — bank verification' : true)
                    : false

                  // 48h client reminder / 96h PF notification for one stalled step.
                  // Both only exist once the cron has stamped them.
                  const reminderStep = (at) => at ? autoStep('2-business-day reminder email sent to client', true, null, false, at) : null
                  const pfNotifiedStep = (stall, at, ackAt) => at ? (
                    <>
                      {autoStep('4-business-day mark passed — assigned PF notified to follow up', true, null, false, at)}
                      {!readOnly && <StallAckRow pipeline="map1" id={pipelineData?.id} stall={stall} ackAt={ackAt} onAck={v => setPipelineData(prev => prev ? { ...prev, [`${stall}_pf_ack_at`]: v } : prev)} />}
                    </>
                  ) : null

                  // Revenue share is N/A when member share is set to $0 (member gets
                  // no share). Applies to both regular + member-paid pipelines.
                  const isZeroShare = (v) => parseFloat(String(v ?? '').replace(/[$,]/g, '')) === 0

                  const pd_yes = pipelineData
                  const yesSteps = null

                  return (
                    <div style={{ padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Decision:</span>
                        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>
                      </div>

                      {pipDecision === 'No' && autoStep('Decline email sent to client')}

                      {pipDecision === 'Yes' && (() => {
                        const pd = pd_yes
                        return (
                          <>
                            {autoStep('Engagement agreement created and sent for signing', pd?.c16_sent === 'Yes', null, false, pd?.c17_followup_sent_date)}
                            {reminderStep(pd?.c17_reminder_sent_at)}
                            {pfNotifiedStep('c17', pd?.c17_pf_notified_at, pd?.c17_pf_ack_at)}
                            {autoStep('Engagement agreement signed', pd?.c17_client_signed === 'Yes')}
                            {autoStep('Engagement agreement signed by CEO', pd?.c18_ceo_signed === 'Yes')}
                            {autoStep('Payment link sent (ACH or Card choice)', !!pd?.pay1_email_sent_at || !!pd?.pay1_status, null, false, pd?.pay1_email_sent_at)}
                            {reminderStep(pd?.pay1_reminder_sent_at)}
                            {pfNotifiedStep('pay1', pd?.pay1_pf_notified_at, pd?.pay1_pf_ack_at)}
                            {autoStep('Payment collected', pd?.pay1_status === 'succeeded', pd?.pay1_status && pd?.payment_method_type ? pd.payment_method_type.toUpperCase() : null, false, pd?.pay1_date, pay1Pending(pd))}
                            {autoStep('Invoice and receipt created and emailed to client', !!pd?.invoice_number, null, false, pd?.invoice_email_sent_at)}
                            {autoStep('Revenue share paid', ['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd?.rec1_rev_paid), null, isZeroShare(pd?.member_share), pd?.rec1_rev_completed_at)}
                            {autoStep('Member notified of revenue share', pd?.c24_email_sent === true, null, isZeroShare(pd?.member_share), pd?.c24_email_sent_at)}
                          </>
                        )
                      })()}

                      {pipDecision === 'Undecided' && (() => {
                        const pd = pipelineData
                        const emailSent = pd?.c14_email_sent === 'Yes'
                        const finalDec = pd?.c15_final_decision
                        const needsPricing = finalDec === 'Yes' && !pd?.gross_fee

                        return (
                          <>
                            {autoStep('Decision email sent', emailSent, null, false, pd?.c14_email_sent_at)}
                            {reminderStep(pd?.c14_reminder_sent_at)}
                            {pfNotifiedStep('c14', pd?.c14_pf_notified_at, pd?.c14_pf_ack_at)}
                            {autoStep('Client response received', !!finalDec, null, false, pd?.c15_final_decision_at)}
                            {finalDec && (
                              <div style={{ marginLeft: '14px', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px', borderLeft: '1px solid var(--vfo-tint-deep)' }}>
                                <div style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', display: 'inline-block', marginBottom: '8px',
                                  background: finalDec === 'Yes' ? 'rgba(27,146,84,0.15)' : finalDec === 'No' ? 'rgba(231,76,60,0.15)' : 'rgba(0,149,255,0.15)',
                                  color: finalDec === 'Yes' ? '#1b9254' : finalDec === 'No' ? '#e74c3c' : '#0095ff',
                                  border: `1px solid ${finalDec === 'Yes' ? 'rgba(27,146,84,0.3)' : finalDec === 'No' ? 'rgba(231,76,60,0.3)' : 'rgba(0,149,255,0.3)'}`
                                }}>
                                  {finalDec === 'Yes' ? `Yes — ${pd?.c15_service_level || ''}` : finalDec === 'No' ? 'No — declined' : 'Extra Meeting requested'}
                                </div>

                                {finalDec === 'No' && autoStep('Decline email sent to client', true)}

                                {finalDec === 'Yes' && (
                                  <>
                                    {needsPricing && !readOnly ? (
                              <PFPricingForm clientId={clientId} serviceLevel={pd?.c15_service_level} pipelineId={pd?.id} memberCategory={client?.member_category} memberType={client?.member_type} onComplete={() => loadTrack()} />
                                    ) : pd?.gross_fee ? (
                                      <>
                                        <div style={{ cursor: 'pointer' }} onClick={() => setExpanded(prev => ({ ...prev, pricing_details: !prev.pricing_details }))}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1b9254', flexShrink: 0, border: '1px solid #1b9254' }} />
                                            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600 }}>PF completed pricing</span>
                                            <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', marginLeft: '4px', transform: expanded.pricing_details ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, marginLeft: 'auto' }}>Done</span>
                                          </div>
                                        </div>
                                        {expanded.pricing_details && (
                                          <div style={{ marginLeft: '14px', padding: '8px 12px', background: 'var(--vfo-tint)', borderRadius: '6px', marginBottom: '4px', borderLeft: '1px solid var(--vfo-border-chip)' }}>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Service level</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.service_level || pd?.c15_service_level || '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Gross fee</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>${pd?.gross_fee || '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Member contribution</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.member_contribution ? `$${pd.member_contribution}` : '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Net invoice</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.net_invoice ? `$${pd.net_invoice}` : '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Member share</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.member_share ? `$${pd.member_share}` : '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>VFOs share</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.vfos_share ? `$${pd.vfos_share}` : '—'}</span></div>
                                            <div style={{ display: 'flex', padding: '2px 0' }}><span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '140px' }}>Payment plan</span><span style={{ fontSize: '11px', color: 'var(--vfo-ink-2)' }}>{pd?.payment_plan || '—'}</span></div>
                                          </div>
                                        )}
                                        {autoStep('Engagement agreement created and sent for signing', pd?.c16_sent === 'Yes', null, false, pd?.c17_followup_sent_date)}
                                        {reminderStep(pd?.c17_reminder_sent_at)}
                                        {pfNotifiedStep('c17', pd?.c17_pf_notified_at, pd?.c17_pf_ack_at)}
                                        {autoStep('Engagement agreement signed', pd?.c17_client_signed === 'Yes')}
                                        {autoStep('Engagement agreement signed by CEO', pd?.c18_ceo_signed === 'Yes')}
                                        {autoStep('Payment link sent (ACH or Card choice)', !!pd?.pay1_email_sent_at || !!pd?.pay1_status, null, false, pd?.pay1_email_sent_at)}
                                        {reminderStep(pd?.pay1_reminder_sent_at)}
                                        {pfNotifiedStep('pay1', pd?.pay1_pf_notified_at, pd?.pay1_pf_ack_at)}
                                        {autoStep('Payment collected', pd?.pay1_status === 'succeeded', pd?.pay1_status && pd?.payment_method_type ? pd.payment_method_type.toUpperCase() : null, false, pd?.pay1_date, pay1Pending(pd))}
                                        {autoStep('Invoice and receipt created and emailed to client', !!pd?.invoice_number, null, false, pd?.invoice_email_sent_at)}
                                        {autoStep('Revenue share paid', ['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd?.rec1_rev_paid), null, isZeroShare(pd?.member_share), pd?.rec1_rev_completed_at)}
                                        {autoStep('Member notified of revenue share', pd?.c24_email_sent === true, null, isZeroShare(pd?.member_share), pd?.c24_email_sent_at)}
                                      </>
                                    ) : null}
                                  </>
                                )}

                                {finalDec === 'ExtraMeeting' && (
                                  <>
                                    {autoStep('Extra meeting requested', true)}
                                    <PFExtraMeetingForm clientId={clientId} pipelineId={pd?.id} memberCategory={client?.member_category} memberType={client?.member_type} onComplete={() => loadTrack()} />
                                  </>
                                )}
                              </div>
                            )}
                            {!finalDec && (
                              <div style={{ marginLeft: '14px', borderLeft: '1px solid var(--vfo-tint-deep)', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '6px' }}>If Yes:</div>
                                {autoStep('Engagement agreement created and sent for signing', pd?.c16_sent === 'Yes', null, false, pd?.c17_followup_sent_date)}
                                {autoStep('Engagement agreement signed', pd?.c17_client_signed === 'Yes')}
                                {autoStep('Engagement agreement signed by CEO', pd?.c18_ceo_signed === 'Yes')}
                                {autoStep('Payment link sent (ACH or Card choice)', !!pd?.pay1_email_sent_at || !!pd?.pay1_status, null, false, pd?.pay1_email_sent_at)}
                                {autoStep('Payment collected', pd?.pay1_status === 'succeeded', pd?.pay1_status && pd?.payment_method_type ? pd.payment_method_type.toUpperCase() : null, false, pd?.pay1_date, pay1Pending(pd))}
                                {autoStep('Invoice and receipt created and emailed to client', !!pd?.invoice_number, null, false, pd?.invoice_email_sent_at)}
                                {autoStep('Revenue share paid', ['Yes', 'Money Mapping', 'N/A — No Share Due'].includes(pd?.rec1_rev_paid), null, isZeroShare(pd?.member_share))}
                                {autoStep('Member notified of revenue share', pd?.c24_email_sent === true, null, isZeroShare(pd?.member_share), pd?.c24_email_sent_at)}
                                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '6px', marginTop: '10px' }}>If No:</div>
                                {autoStep('Decline email sent to client')}
                                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '6px', marginTop: '10px' }}>If extra meeting:</div>
                                {autoStep('Extra meeting held')}
                                {autoStep('PF submits outcome')}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )
                })()}

                {phase.name !== 'MAP 1 - PC Admin' &&
                tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'

                  // Initial Contact: the original steps are inert (greyed, not
                  // clickable) until the tracking-owner step is set to "Member".
                  const ownerTask = (phase.program_client_tasks || []).find(isTrackingOwnerTask)
                  if (ownerTask && !isTrackingOwnerTask(task) && progress[ownerTask.id]?.status !== 'Member') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', opacity: 0.35, pointerEvents: 'none' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>—</span>
                    </div>
                  )

                  if (task.status_options === 'auto') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b9254', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{p.completed_date ? formatDate(p.completed_date) : ''}</span>
                    </div>
                  )

                  if (task.status_options === 'date_entry') {
                    const dateVal = p.completed_date || ''
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dateVal ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${dateVal ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '13px', color: dateVal ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                        {readOnly
                          ? (dateVal
                              ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: '#1b925422', color: '#1b9254', fontWeight: 600, border: '1px solid #1b925444' }}>{formatDate(dateVal)}</span>
                              : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not scheduled</span>)
                          : <input type="date" value={dateVal} onChange={e => saveDateEntry(task.id, e.target.value)} disabled={saving[task.id]} style={inputStyle} />
                        }
                      </div>
                    )
                  }

                  // READ-ONLY MODE (member side)
                  if (readOnly) {
                    const isPCAdmin = phase.name === 'MAP 1 - PC Admin'
                    const c10Status2 = progress[phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'Client PIP decision')?.id]?.status || ''
                    const c14c15Active2 = c10Status2 === 'No' || c10Status2 === 'Undecided'
                    const isGreyedOut2 = isPCAdmin && (task.name === 'Email to Client if "Undecided" or "No" in C12' || task.name === 'Final client decision (if previously "Undecided" or "No")') && !c14c15Active2
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', opacity: isGreyedOut2 ? 0.3 : 1 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                        {isDone
                          ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                          : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                        }
                        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
                      </div>
                    )
                  }

                  if (task.name === 'PIP 1 Confirmation Email' || task.name === 'PIP Follow-up Confirmation Email') return (
                    <PipConfirmStep
                      key={task.id}
                      clientId={clientId}
                      task={task}
                      p={p}
                      meeting={task.name === 'PIP Follow-up Confirmation Email' ? 'followup' : 'pip1'}
                      readOnly={readOnly}
                      emailCtx={emailCtx}
                      onDone={(taskId, status, date) => setProgress(pr => ({ ...pr, [taskId]: { ...pr[taskId], task_id: taskId, status, completed_date: date } }))}
                    />
                  )

                  if (task.name === 'Call arranged with client') return (
                    <div key={task.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                        <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isDone ? statusColor : 'var(--vfo-ink)' }}>
                          <option value="">-- Select --</option>
                          {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <StepDate value={isDone ? (p.completed_date || '') : ''} onChange={d => saveTask(task.id, p.status, d)} disabled={saving[task.id]} />
                      </div>
                    </div>
                  )

                  const isPCAdmin = phase.name === 'MAP 1 - PC Admin'
                  const c10Status = progress[phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'Client PIP decision')?.id]?.status || ''
                  const c14c15Active = c10Status === 'No' || c10Status === 'Undecided'
                  const isGreyedOut = isPCAdmin && (task.name === 'Email to Client if "Undecided" or "No" in C12' || task.name === 'Final client decision (if previously "Undecided" or "No")') && !c14c15Active

                  if (isPCAdmin) return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', opacity: isGreyedOut ? 0.3 : 1 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: isDone ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', color: isDone ? '#1b9254' : 'var(--vfo-muted)', border: `1px solid ${isDone ? 'rgba(27,146,84,0.3)' : 'var(--vfo-border)'}` }}>
                        {isDone ? 'Completed' : 'Not completed'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
                    </div>
                  )

                  if (task.name === 'PIP Follow Up decision' && task.status_options === 'enter_details') {
                    if (readOnly && isDone) {
                      const dl = p.status.replace('Completed - ', '')
                      const dc = dl === 'Yes' ? '#1b9254' : dl === 'No' ? '#e74c3c' : '#e06717'
                      return (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dc, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', flex: 1 }}>{task.name}</span>
                          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${dc}22`, color: dc, border: `1px solid ${dc}44` }}>{dl}</span>
                          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{p.completed_date ? formatDate(p.completed_date) : ''}</span>
                        </div>
                      )
                    }
                    if (readOnly && !isDone) {
                      return (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid var(--vfo-border-mid)' }} />
                          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}></span>
                        </div>
                      )
                    }
                    const dl = isDone ? p.status.replace('Completed - ', '') : ''
                    const dc = dl === 'Yes' ? '#1b9254' : dl === 'No' ? '#e74c3c' : dl === 'Undecided' ? '#e06717' : 'var(--vfo-muted)'
                    let formData = null
                    if (isDone) { try { formData = JSON.parse(p.notes || '{}') } catch(e) { formData = {} } }
                    const formExpandKey = `pipform_${task.id}`
                    const isFormShown = isDone ? expanded[formExpandKey] : true
                    return (
                      <div key={task.id} style={{ borderBottom: '1px solid var(--vfo-border-soft)', padding: '7px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isDone ? 'pointer' : 'default', flexWrap: 'wrap' }} onClick={() => isDone && setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] }))}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? dc : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? dc : 'var(--vfo-border-mid)'}` }} />
                          <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}{!readOnly && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MAP 1" display="modal" title={task.name} templates={[
                            { name: 'CONTRACT_agreementsent|Yes', when: 'If Yes — congratulations + agreement signing link' },
                            { name: 'PCADMIN_followup|Undecided', when: 'If Undecided — options email to the client' },
                            { name: 'PCADMIN_followup|No', when: 'If No — decline email' },
                            { name: 'PIP1_reconfirmation|No', when: 'If the client later clicks No on the email (automatic)' },
                            { name: 'CONTRACT_pcadmin_undecided_reminder', when: 'Automatic reminder if the Undecided email gets no response (2 business days)' },
                          ]} context={emailCtx} /></span>}</span>
                          {isDone && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${dc}22`, color: dc, border: `1px solid ${dc}44` }}>{dl}</span>}
                          <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }}>{isDone && p.completed_date ? formatDate(p.completed_date) : ''}</span>
                          {isDone && <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isFormShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
                        </div>
                        {isFormShown && (
                          <PIPDecisionForm
                            task={task}
                            clientId={clientId}
                            saveTask={saveTask}
                            existingData={formData}
                            memberCategory={client?.member_category}
                            memberType={client?.member_type}
                            onSubmitted={(status, data) => {
                              setProgress(prev => ({ ...prev, [task.id]: { ...prev[task.id], task_id: task.id, status, completed_date: new Date().toISOString().split('T')[0], notes: JSON.stringify(data) } }))
                            }}
                          />
                        )}
                      </div>
                    )
                  }

                  const isCiqStep = task.name === 'CIQ complete' && !readOnly && !!client?.member_number
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
                      {isCiqStep
                        ? <span
                            title="Open this client's CIQ"
                            onClick={() => navigate(`/admin?member=${encodeURIComponent(client.member_number)}&feature=ciq&ciqclient=${clientId}&_n=${Date.now()}`)}
                            onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
                            onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
                            style={{ fontSize: '13px', color: '#0095ff', flex: 1, cursor: 'pointer' }}>{task.name}</span>
                        : <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      }
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

export default ClientTrackViewV2