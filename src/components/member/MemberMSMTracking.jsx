import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, loadCachedAction } from '../../lib/api'
import { Skeleton, ClientsListSkeleton, TrainingTrackSkeleton, CoachingMeetingsSkeleton, CoachingRenewalSkeleton, MsmHomeSkeleton } from '../shared/Skeleton'
import { TrackHero, PhaseBadge } from '../shared/TrackKit'
import { countedTasks, countedDone, phaseState, isPositiveStatus, isTrackStopped, planStatusLabel, STATUS_STOPPED, STATUS_NOT_APPLICABLE } from '../shared/trainingStatus'
import { isTrackerTask } from '../shared/trackerSteps'

// Group a phase's tasks so each section header owns the contiguous sub-steps beneath it,
// letting the UI enclose the group and keep following standalone tasks visually separate.
const groupTasks = (list) => {
  const tasks = list || []
  const nodes = []
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (t.task_type === 'section') {
      const subs = []
      while (i + 1 < tasks.length && tasks[i + 1].task_type === 'substep') { subs.push(tasks[i + 1]); i++ }
      nodes.push({ kind: 'group', section: t, subs })
    } else {
      nodes.push({ kind: 'task', task: t })
    }
  }
  return nodes
}

const PROGRAMS = [
  { key: 'holistic', name: 'VFO Holistic Planning' },
  { key: 'partnership', name: 'Partnership Fast Track' },
  { key: 'tax', name: 'VFO Tax Planning' },
  { key: 'coaching', name: 'Advanced Coaching' },
  { key: 'standard', name: 'Standard Coaching' },
]

// Read-only card of the program notes an admin has shared with this member.
// The backend (load_member_program_notes) returns only visibility='shared' rows
// for member callers, so no client-side filtering is needed. Optional
// programName narrows to one program (e.g. the Advanced Coaching home);
// emptyText renders an empty card instead of hiding the card entirely.
function MemberProgramNotes({ memberNumber, sectionStyle, programName = null, title = 'Program Notes', emptyText = null }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    callApi('load_member_program_notes', { member_number: memberNumber, ...(programName ? { program_name: programName } : {}) })
      .then(d => { if (live) setNotes(d.notes || []) })
      .catch(err => console.error(err))
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [memberNumber, programName])

  if (loading) return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{title}</div>
      <Skeleton width="90%" height={14} style={{ marginBottom: '8px' }} />
      <Skeleton width="70%" height={14} />
    </div>
  )
  if (notes.length === 0) {
    if (!emptyText) return null
    return (
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{title}</div>
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--vfo-faint)', fontSize: '13px' }}>{emptyText}</div>
      </div>
    )
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{title}</div>
      {notes.map(note => (
        <div key={note.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
            {note.program_name && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.program_name}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MemberMSMTracking({ member, activeTab, onNavigate }) {
  const [programs, setPrograms] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [vfo90Count, setVfo90Count] = useState(0)
  // Coaching-meeting counts keyed by program name — coaching meetings live in
  // coaching_meetings (per enrollment), not member_meetings.
  const [coachingCounts, setCoachingCounts] = useState({})

  useEffect(() => { loadData() }, [member.member_number])

  // Refresh the coaching counts whenever the member returns to MSM Home (no reload).
  useEffect(() => {
    if (activeTab === 'msm_home' && enrollments.length) loadCoachingCounts(enrollments)
  }, [activeTab])

  async function loadCoachingCounts(enrollList) {
    const counts = {}
    await Promise.all(['Advanced Coaching', 'Standard Coaching'].map(async name => {
      const enr = (enrollList || []).find(e => e.programs?.name === name)
      if (!enr) { counts[name] = 0; return }
      try {
        const md = await callApi('coaching_load_meetings', { enrollment_id: enr.id })
        counts[name] = (md.meetings || []).filter(m => m.status === 'completed').length
      } catch { counts[name] = 0 }
    }))
    setCoachingCounts(counts)
  }

  async function loadData() {
    setLoading(true)
    try {
      const [progData, enrollData, enabledData, meetData] = await Promise.all([
        loadCachedAction('msm_load_programs'),
        callApi('msm_load_enrollments', { member_number: member.member_number }),
        callApi('msm_load_enabled_programs', { member_number: member.member_number }),
        callApi('msm_load_meetings', { member_number: member.member_number }),
      ])
      setPrograms(progData.programs || [])
      setEnrollments(enrollData.enrollments || [])
      setEnabledPrograms(enabledData.enabled || [])
      setMeetings(meetData.meetings || [])

      // Count completed coaching meetings for the two coaching programs.
      await loadCoachingCounts(enrollData.enrollments || [])

      // Calculate VFO 90 Day Plan count from completed phases
      const holisticProg = (progData.programs || []).find(p => p.name === 'VFO Holistic Planning')
      const holisticEnroll = (enrollData.enrollments || []).find(e => e.programs?.name === 'VFO Holistic Planning')
      if (holisticProg && holisticEnroll) {
        const [trackData, progressData] = await Promise.all([
          loadCachedAction('msm_load_training_track', { program_id: holisticProg.id }),
          callApi('msm_load_training_progress', { enrollment_id: holisticEnroll.id }),
        ])
        const phases = trackData.phases || []
        const prog = {}
        ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
        const completedPhases = phases.filter(phase => {
          if (phase.name.includes('Review')) return false
          return phaseState(phase.program_training_tasks, prog) === 'done'
        }).length
        setVfo90Count(completedPhases)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function getEnrollment(programName) {
    return enrollments.find(e => e.programs?.name === programName) || null
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  const msmCount = meetings.filter(m => m.meeting_type === 'MSM Meeting').length
  const advancedCount = coachingCounts['Advanced Coaching'] || 0
  const standardCount = coachingCounts['Standard Coaching'] || 0
  const pft90Count = meetings.filter(m => m.meeting_type === 'PFT 90 Day Plan Meeting').length

  if (loading) {
    if (activeTab === 'msm_home') return <MsmHomeSkeleton />
    const isCoach = activeTab === 'msm_coaching' || activeTab === 'msm_standard'
    const inner =
      isCoach ? <CoachingMeetingsSkeleton /> :
      activeTab === 'msm_tax' ? <ClientsListSkeleton /> :
      (activeTab === 'msm_holistic' || activeTab === 'msm_partnership') ? <TrainingTrackSkeleton /> :
      <TrainingTrackSkeleton phaseCount={3} rowsPerPhase={3} />
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <Skeleton width={240} height={28} style={{ marginBottom: '20px' }} />
        <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={90} height={11} />
              <Skeleton width={100} height={15} />
            </div>
            {!isCoach && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton width={110} height={11} />
                <Skeleton width={100} height={15} />
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', paddingBottom: '10px', borderBottom: '1px solid var(--vfo-border)' }}>
          <Skeleton width={80} height={20} />
          {activeTab !== 'msm_tax' && <Skeleton width={80} height={20} />}
        </div>
        {inner}
      </div>
    )
  }

  const activeProgramKey = activeTab === 'msm_home' ? null
    : activeTab === 'msm_holistic' ? 'holistic'
    : activeTab === 'msm_partnership' ? 'partnership'
    : activeTab === 'msm_tax' ? 'tax'
    : activeTab === 'msm_coaching' ? 'coaching'
    : activeTab === 'msm_standard' ? 'standard'
    : null

  if (activeTab === 'msm_home') {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Assigned MSM</div>
          <div style={{ fontSize: '16px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{member.assigned_msm || '—'}</div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Your Programs</div>
          {PROGRAMS.map(p => {
            const dbProgram = programs.find(prog => prog.name === p.name)
            if (!dbProgram) return null
            const isEnabled = enabledPrograms.some(e => e.program_id === dbProgram.id)
            if (!isEnabled) return null
            const tabKey = { holistic: 'msm_holistic', partnership: 'msm_partnership', tax: 'msm_tax', coaching: 'msm_coaching', standard: 'msm_standard' }[p.key]
            return (
              <div key={p.key} onClick={() => onNavigate(tabKey)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: '14px', color: '#0095ff', fontWeight: 500 }}>{p.name}</span>
              </div>
            )
          })}
          {enabledPrograms.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No programs enabled yet.</p>}
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting Summary</div>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {[['MSM Meetings', msmCount], ['Advanced Meetings', advancedCount], ['Standard Meetings', standardCount], ['VFO 90 Day Plan', vfo90Count], ['PFT 90 Day Plan', pft90Count]].map(([label, count]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)' }}>{count}</div>
                <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '3px', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
          {meetings.length === 0
            ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No meetings logged yet.</p>
            : meetings.map(m => (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{m.meeting_type}</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                  {new Date(m.meeting_date + 'T12:00:00').toLocaleDateString()}{m.conducted_by ? ` · ${m.conducted_by}` : ''}
                </div>
                {m.notes && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{m.notes}</div>}
              </div>
            ))
          }
        </div>

        <MemberProgramNotes memberNumber={member.member_number} sectionStyle={sectionStyle} />
      </div>
    )
  }

  if (activeProgramKey) {
    const p = PROGRAMS.find(p => p.key === activeProgramKey)
    const dbProgram = programs.find(prog => prog.name === p?.name)
    const isEnabled = dbProgram && enabledPrograms.some(e => e.program_id === dbProgram.id)

    if (!isEnabled) return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--vfo-muted)' }}>
        <div style={{ fontSize: '18px', color: 'var(--vfo-ink)', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>{p?.name}</div>
        <div style={{ fontSize: '14px' }}>This program is not enabled.</div>
      </div>
    )

    const enrollment = getEnrollment(p.name)

    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        {!enrollment
          ? <>
              <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '20px' }}>{p.name}</div>
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>You are not yet enrolled in this program.</div>
            </>
          : <MemberEnrolledView enrollment={enrollment} program={dbProgram} member={member} />
        }
      </div>
    )
  }

  return null
}



function MemberEnrolledView({ enrollment, program, member }) {
  const isCoaching = program.name === 'Advanced Coaching'
  const isStandard = program.name === 'Standard Coaching'
  // Standard Coaching mirrors Advanced Coaching minus the Renewal tab.
  const isCoachingLike = isCoaching || isStandard
  const isPFT = program.name === 'Partnership Fast Track'
  const defaultTab = isCoachingLike ? 'home' : program.name === 'VFO Tax Planning' ? 'clients' : 'training'
  const [activeTab, setActiveTab] = useState(defaultTab)
  useEffect(() => { setActiveTab(defaultTab) }, [program.id])
  const tabStyle = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const statusColors = { 'On Fast Track': '#1b9254', 'Paused Fast Track': '#e06717', 'Lost/Removed': '#e74c3c', 'Revert to Legacy': 'var(--vfo-muted)', 'Active': '#1b9254' }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>Program</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>{program.name}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>Joined {enrollment.date_enrolled ? enrollment.date_enrolled.split('T')[0] : '—'}</span>
          {!isCoachingLike && enrollment.program_status && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[enrollment.program_status] || 'var(--vfo-faint)', flexShrink: 0 }} />{enrollment.program_status}</span></>}
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        {isStandard ? (
          <>
            <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Home</button>
            <button style={tabStyle(activeTab === 'meetings')} onClick={() => setActiveTab('meetings')}>Meetings</button>
          </>
        ) : isCoaching ? (
          <>
            <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Home</button>
            <button style={tabStyle(activeTab === 'meetings')} onClick={() => setActiveTab('meetings')}>Meetings</button>
            <button style={tabStyle(activeTab === 'renewal')} onClick={() => setActiveTab('renewal')}>Renewal</button>
          </>
        ) : program.name === 'VFO Tax Planning' ? (
          <>
            <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>Clients</button>
          </>
        ) : (
          <>
            <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>90 Day Plan</button>
            <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>{isPFT ? 'Accountants' : 'Clients'}</button>
          </>
        )}
      </div>
      {activeTab === 'home' && isCoachingLike && (
        <MemberProgramNotes
          memberNumber={member.member_number}
          sectionStyle={sectionStyle}
          programName={program.name}
          title="Notes from your team"
          emptyText="No notes from your coaching team yet."
        />
      )}
      {activeTab === 'training' && <MemberTrainingView enrollment={enrollment} program={program} />}
      {activeTab === 'clients' && <MemberClientsView enrollment={enrollment} member={member} program={program} />}
      {activeTab === 'meetings' && <MemberCoachingMeetings enrollment={enrollment} eyebrow={program.name} />}
      {activeTab === 'renewal' && <MemberCoachingRenewal enrollment={enrollment} />}
    </div>
  )
}

function MemberTrainingView({ enrollment, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [saving, setSaving] = useState({})
  const [errors, setErrors] = useState({})

  function handleTaskComplete(taskId, status, date, completedBy) {
    setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date, completed_by: completedBy === undefined ? p[taskId]?.completed_by : completedBy } }))
  }

  // Member-set status for any non-tracker step. Optimistic, then reconciled with the
  // server's own status / completed_date / completed_by; a rejection (tracker step,
  // section row, or an admin 'Stopped'/'N/A' the member may not overwrite) reverts the
  // row to exactly what it was and shows the backend's message inline.
  async function saveStatus(taskId, status) {
    const previous = progress[taskId]
    setErrors(e => ({ ...e, [taskId]: '' }))
    setSaving(s => ({ ...s, [taskId]: true }))
    setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status } }))
    try {
      const data = await callApi('training_member_save_task', { enrollment_id: enrollment.id, task_id: taskId, status })
      handleTaskComplete(taskId, data.status ?? status, data.completed_date ?? null, data.completed_by ?? null)
    } catch (err) {
      setProgress(p => {
        const next = { ...p }
        if (previous) next[taskId] = previous
        else delete next[taskId]
        return next
      })
      setErrors(e => ({ ...e, [taskId]: err.message || 'Could not save that status.' }))
    } finally { setSaving(s => ({ ...s, [taskId]: false })) }
  }

  useEffect(() => { loadTrack() }, [enrollment.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        loadCachedAction('msm_load_training_track', { program_id: program.id }),
        callApi('msm_load_training_progress', { enrollment_id: enrollment.id }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
      // A fully-done phase defaults collapsed on load; manual toggles win after.
      const expandState = {}
      loadedPhases.forEach(phase => {
        expandState[phase.id] = phaseState(phase.program_training_tasks, prog) !== 'done'
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const statusColors = { Completed: '#1b9254', 'Have Watched': '#1b9254', 'In Progress': '#e06717', 'Will Watch': '#e06717', Outstanding: 'var(--vfo-muted)', 'N/A': 'var(--vfo-muted)', Pending: '#e74c3c', Stopped: '#e74c3c' }
  const statusBg = { Completed: 'rgba(27,146,84,0.15)', 'Have Watched': 'rgba(27,146,84,0.15)', 'In Progress': 'rgba(251,137,90,0.15)', 'Will Watch': 'rgba(251,137,90,0.15)', Outstanding: 'rgba(91,107,140,0.15)', 'N/A': 'rgba(91,107,140,0.15)', Pending: 'rgba(231,76,60,0.15)', Stopped: 'rgba(231,76,60,0.15)' }
  // Positive values are open-ended per program ("3 to Call", "Built - 45%", "Type 2 ...")
  // so anything unmapped falls back to done-green / muted rather than rendering colourless.
  const colorFor = (status) => statusColors[status] || (isPositiveStatus(status) ? '#1b9254' : 'var(--vfo-muted)')
  const bgFor = (status) => statusBg[status] || (isPositiveStatus(status) ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)')
  const borderFor = (status) => {
    const c = colorFor(status)
    return status && c.startsWith('#') ? `${c}66` : 'var(--vfo-border-strong)'
  }
  const memberOptions = (task) => (task.status_options || 'Completed|Outstanding|Stopped')
    .split('|')
    .filter(s => s && s !== STATUS_STOPPED && s !== STATUS_NOT_APPLICABLE)

  if (loading) return <TrainingTrackSkeleton />
  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No training track defined yet.</div>

  const totalTasks = phases.reduce((s, p) => s + countedTasks(p.program_training_tasks, progress).length, 0)
  const completedTasks = phases.reduce((s, p) => s + countedDone(p.program_training_tasks, progress), 0)
  const planStopped = isTrackStopped(phases, progress)
  const planStatus = planStatusLabel(phases, progress)

  return (
    <div>
      <TrackHero
        accent={false}
        completed={completedTasks}
        total={totalTasks}
        meta={<>
          <span>90 Day Plan:</span>
          <span style={{ fontWeight: 600, color: planStopped ? '#e74c3c' : 'var(--vfo-ink)' }}>{planStatus}</span>
        </>}
        steps={phases.map(ph => ({ label: ph.name, state: phaseState(ph.program_training_tasks, progress) }))}
      />
      {phases.map(phase => {
        const isReview = phase.name.includes('Review')
        const isExpanded = expanded[phase.id]
        return (
        <div key={phase.id} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px', marginTop: isReview ? '-6px' : '0', marginLeft: isReview ? '20px' : '0', borderTopLeftRadius: isReview ? '0' : '12px' }}>
          <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: isExpanded ? '16px' : '0' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}{isReview && <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', marginLeft: '8px', textTransform: 'none', fontWeight: '400', letterSpacing: '0' }}>checkpoint</span>}</span>
            <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
          </div>
          {isExpanded && (() => {
            const renderMemberTask = (task, inGroup) => {
              const p = progress[task.id] || {}
              const trackerMeta = isTrackerTask(task)
              if (trackerMeta) return (
                <MemberTrackerTask key={task.id} task={task} meta={trackerMeta} enrollmentId={enrollment.id} progress={p} inGroup={inGroup} onStatusChange={handleTaskComplete} />
              )
              // 'Stopped' / 'N/A' are admin-only escapes: the backend refuses a member write
              // over them, so the row shows a locked chip instead of a select.
              const locked = p.status === STATUS_STOPPED || p.status === STATUS_NOT_APPLICABLE
              const isTouched = !!p.status
              const statusNode = locked ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '12px', background: bgFor(p.status), color: colorFor(p.status) }}>{p.status}</span>
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Set by your MSM</span>
                </span>
              ) : (
                <select
                  value={p.status || ''}
                  onChange={e => saveStatus(task.id, e.target.value)}
                  disabled={!!saving[task.id]}
                  style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${borderFor(p.status)}`, background: 'var(--vfo-input)', color: isTouched ? colorFor(p.status) : 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif', minWidth: '132px', cursor: saving[task.id] ? 'wait' : 'pointer', opacity: saving[task.id] ? 0.6 : 1 }}
                >
                  <option value="">-- Status --</option>
                  {memberOptions(task).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )
              const errorNode = errors[task.id]
                ? <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '4px', marginLeft: '22px' }}>{errors[task.id]}</div>
                : null
              if (task.video_url) return (
                <div key={task.id} style={{ marginBottom: '8px' }}>
                  <VideoTask task={task} statusNode={statusNode} errorNode={errorNode} isTouched={isTouched} isPositive={isPositiveStatus(p.status)} statusColor={colorFor(p.status)} />
                </div>
              )
              return (
                <div key={task.id} style={{ padding: '10px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isTouched ? colorFor(p.status) : 'transparent', flexShrink: 0, border: '1px solid var(--vfo-border-mid)' }} />
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{task.name}</span>
                    </div>
                    {statusNode}
                  </div>
                  {errorNode}
                </div>
              )
            }
            return groupTasks(phase.program_training_tasks).map(node => node.kind === 'group' ? (
              <div key={`sec-${node.section.id}`} style={{ margin: '12px 0', padding: '4px 16px 8px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px' }}>
                <div style={{ padding: '8px 0 6px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{node.section.name}</span>
                </div>
                {node.subs.map(t => renderMemberTask(t, true))}
              </div>
            ) : renderMemberTask(node.task, false))
          })()}
        </div>
        )
      })}
    </div>
  )
}

// Member-driven "90 Day Plan" tracker step: an expandable row where the member fills a
// short form and each Add appends a read-only entry. Backend re-derives the step status
// from the count, so after an add we patch the parent's progress map (onStatusChange) to
// keep the phase / TrackHero coloring live without a full reload.
function MemberTrackerTask({ task, meta, enrollmentId, progress, inGroup, onStatusChange }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [firmName, setFirmName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('')
  const [warmCold, setWarmCold] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }

  // Before the entries load we can only approximate the count from the step status
  // (Completed ⇒ at/above threshold; any other status ⇒ at least one). Once loaded the
  // exact length replaces it and the pill self-corrects.
  const fallbackCount = isPositiveStatus(progress?.status) ? meta.threshold : (progress?.status ? 1 : 0)
  const count = entries != null ? entries.length : fallbackCount
  const dotColor = count >= meta.threshold ? '#1b9254' : count >= 1 ? '#e06717' : 'transparent'
  const pillStyle = count >= meta.threshold
    ? { background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }
    : count >= 1
      ? { background: 'rgba(224,103,23,0.15)', color: '#e06717', fontWeight: 600 }
      : { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }

  async function ensureLoaded() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const data = await callApi('training_tracker_load', { enrollment_id: enrollmentId, task_id: task.id })
      setEntries(data.entries || [])
      setLoaded(true)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) ensureLoaded()
  }

  async function addEntry() {
    const fn = firstName.trim(), ln = lastName.trim(), em = email.trim()
    if (!fn) { setError('First name is required.'); return }
    if (!ln) { setError('Last name is required.'); return }
    if (!em || !em.includes('@')) { setError('A valid email is required.'); return }
    if (!warmCold) { setError('Please choose Warm or Cold.'); return }
    setError('')
    setSubmitting(true)
    try {
      const data = await callApi('training_tracker_add', {
        enrollment_id: enrollmentId,
        task_id: task.id,
        entry: { first_name: fn, last_name: ln, firm_name: firmName.trim(), email: em, phone: phone.trim(), source: source.trim(), warm_cold: warmCold, notes: notes.trim() },
      })
      setEntries(prev => [...(prev || []), data.entry])
      setFirstName(''); setLastName(''); setFirmName(''); setEmail(''); setPhone(''); setSource(''); setWarmCold(''); setNotes('')
      if (data.status && onStatusChange) onStatusChange(task.id, data.status, null)
    } catch (err) { setError(err.message) }
    finally { setSubmitting(false) }
  }

  const fieldGroup = (label, node, minWidth = '140px') => (
    <div style={{ flex: 1, minWidth }}><label style={labelStyle}>{label}</label>{node}</div>
  )

  return (
    <div style={{ padding: '10px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)' }}>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor, flexShrink: 0, border: '1px solid var(--vfo-border-mid)' }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{task.name}</span>
        </div>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', ...pillStyle }}>{count}/{meta.threshold}</span>
        <button onClick={(e) => { e.stopPropagation(); toggle() }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: open ? 'rgba(231,76,60,0.15)' : 'rgba(0,149,255,0.15)', color: open ? '#e74c3c' : '#0095ff', fontFamily: 'Inter, sans-serif' }}>
          {open ? 'Hide' : `+ Add ${meta.nounPlural}`}
        </button>
      </div>

      {open && (
        <div style={{ marginLeft: '18px', marginTop: '12px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px', padding: '16px' }}>
          {loading && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>Loading...</div>}
          {(entries || []).map(en => (
            <TrackerEntryCard key={en.id} entry={en} />
          ))}
          {loaded && (entries || []).length === 0 && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>No {meta.nounPlural.toLowerCase()} added yet.</div>}

          <div style={{ marginTop: (entries || []).length ? '12px' : '0' }}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Add {meta.noun}</div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {fieldGroup('First Name *', <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />)}
              {fieldGroup('Last Name *', <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />)}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {fieldGroup('Firm Name', <input value={firmName} onChange={e => setFirmName(e.target.value)} style={inputStyle} />)}
              {fieldGroup('Email *', <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} />, '180px')}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {fieldGroup('Phone', <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />)}
              {fieldGroup('Source', <input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. LinkedIn, Word of mouth" style={inputStyle} />)}
              {fieldGroup('Warm / Cold *', (
                <select value={warmCold} onChange={e => setWarmCold(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                  <option value="">-- Select --</option>
                  <option value="Warm">Warm</option>
                  <option value="Cold">Cold</option>
                </select>
              ), '130px')}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            {error && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>{error}</div>}
            <button onClick={addEntry} disabled={submitting} style={{ padding: '10px 24px', borderRadius: '8px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {submitting ? 'Adding...' : `Add ${meta.noun}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Read-only rendering of one tracker entry in the SIF label/value style.
function TrackerEntryCard({ entry, onRemove }) {
  const dash = (v) => (v && String(v).trim() ? v : '—')
  const field = (label, value) => (
    <div style={{ marginBottom: '10px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{dash(value)}</div>
    </div>
  )
  const warm = entry.warm_cold
  return (
    <div style={{ padding: '10px 12px', marginBottom: '8px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{entry.first_name} {entry.last_name}</span>
          {entry.firm_name && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{entry.firm_name}</span>}
          {warm && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, background: warm === 'Warm' ? 'rgba(224,103,23,0.15)' : 'rgba(0,149,255,0.15)', color: warm === 'Warm' ? '#e06717' : '#0095ff' }}>{warm}</span>}
        </div>
        {onRemove && <button onClick={onRemove} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Remove</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 20px' }}>
        {field('Email', entry.email)}
        {field('Phone', entry.phone)}
        {field('Source', entry.source)}
      </div>
      {field('Notes', entry.notes)}
      {entry.created_at && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Added {entry.created_at.split('T')[0]}</div>}
    </div>
  )
}

function MemberClientsView({ enrollment, member, program }) {
  const navigate = useNavigate()
  const isPFT = program?.name === 'Partnership Fast Track'
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [contactsMap, setContactsMap] = useState({})

  useEffect(() => { loadClients() }, [enrollment.id])

  async function loadClients() {
    setLoading(true)
    try {
      const [data, contactData] = await Promise.all([
        callApi('msm_load_clients', { enrollment_id: enrollment.id }),
        callApi('load_member_contacts', { member_number: member.member_number }),
      ])
      setClients(data.clients || [])
      setContactsMap(contactData.contacts || {})
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const statusColors = { pending: '#e06717', active: '#1b9254', declined: '#e74c3c' }

  if (loading) return <ClientsListSkeleton />


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', paddingLeft: '24px' }}>
          <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{clients.length}</div><div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '4px' }}>TOTAL</div></div>
          <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{clients.filter(c => c.status === 'active').length}</div><div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '4px' }}>ACTIVE</div></div>
        </div>
      </div>

      {clients.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No {isPFT ? 'accountants' : 'clients'} added yet.</div>
        : clients.map(client => (
          <div key={client.id} style={{ ...sectionStyle, cursor: 'pointer' }}
            onClick={() => navigate(`/member/client/${client.id}`, { state: { enrollment_id: enrollment.id } })}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{client.first_name} {client.last_name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{client.client_ref}</span>
                  {client.status && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[client.status] || 'var(--vfo-faint)', flexShrink: 0 }} />{client.status.charAt(0).toUpperCase() + client.status.slice(1)}</span>}
                </div>
                {(client.email || client.phone) && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{client.email}{client.email && client.phone ? ' · ' : ''}{client.phone}</div>}
                {contactsMap[client.id]?.length > 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px', fontStyle: 'italic' }}>with {contactsMap[client.id].map(c => `${c.first_name} ${c.last_name}`).join(', ')}</div>}
              </div>
              <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>
            </div>
          </div>
        ))
      }
    </div>
  )
}

function MemberClientTrackView({ client, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [pipelineData, setPipelineData] = useState(null)

  useEffect(() => { loadTrack() }, [client.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData, pipelineRes] = await Promise.all([
        loadCachedAction('msm_load_client_track', { program_id: program.id }),
        callApi('msm_load_client_progress', { client_id: client.id }),
        callApi('member_load_pipeline', { client_id: client.id }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
      setPipelineData(pipelineRes?.row || null)

      const expandState = {}
      loadedPhases.forEach(phase => {
        const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
        const allDone = tasks.length === 0 || tasks.every(t => prog[t.id]?.status)
        expandState[phase.id] = !allDone
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  function getPhaseState(phase) {
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (tasks.length === 0) return 'done'
    if (tasks.every(t => progress[t.id]?.status)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }

  const statusColors = { Completed: '#1b9254', Confirmed: '#1b9254', Yes: '#1b9254', 'Call arranged': '#1b9254', 'PIP 1 scheduled': '#1b9254', 'Follow-up scheduled': '#1b9254', 'PIP Follow-up confirmed': '#1b9254', 'Send confirmation email': '#1b9254', 'Regular priorities tab enabled': '#1b9254', 'Tax priorities tab enabled': '#1b9254', 'Completed + N/A': '#1b9254', 'Completed + Risk 1': '#1b9254', 'Completed + Risk 2': '#1b9254', 'Completed + Risk 3': '#1b9254', 'Completed + Risk 4': '#1b9254', 'Completed + Risk 5': '#1b9254', Lite: '#1b9254', Core: '#1b9254', Max: '#1b9254', 'In Progress': '#e06717', Undecided: '#e06717', 'No response': '#e74c3c', No: '#e74c3c', 'PIP Follow-up declined': '#e74c3c', 'Send declined email': '#e74c3c' }

  if (loading) return <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', padding: '16px' }}>Loading track...</div>
  if (phases.length === 0) return <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', padding: '16px' }}>No client track defined yet.</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_client_tasks || []).filter(t => t.status_options !== 'auto').length, 0)
  const completedTasks = phases.reduce((s, phase) => s + (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && progress[t.id]?.status && progress[t.id].status !== '').length, 0)

  return (
    <div>
      <TrackHero
        eyebrow={program?.name || 'Client Track'}
        title="MAP 1 — Engagement Process"
        completed={completedTasks}
        total={totalTasks}
        steps={phases.map(ph => ({ label: ph.name.replace(/^MAP 1 - /, ''), state: getPhaseState(ph) }))}
      />

      {phases.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        const doneTasks = nonAutoTasks.filter(t => progress[t.id]?.status && progress[t.id].status !== '').length
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        const c10TaskId = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.task_code === 'C10')?.id
        const c10Status = progress[c10TaskId]?.status || ''
        const c14c15Active = c10Status === 'No' || c10Status === 'Undecided'

        return (
          <div key={phase.id} style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <PhaseBadge number={phaseIdx + 1} state={state} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status && p.status !== ''
                  const statusColor = statusColors[p.status] || 'var(--vfo-muted)'
                  const isGreyedOut = (task.task_code === 'C14' || task.task_code === 'C15') && !c14c15Active

                  if (task.name === 'AI PC Admin' && pipelineData) {
                    const pd = pipelineData
                    const pipDecision = pd?.c13_decision
                    const finalDec = pd?.c15_final_decision
                    const autoStep = (label, done, tag = null) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                        <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                          {done && tag && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{tag}</span>}
                          {done && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Done</span>}
                        </span>
                      </div>
                    )
                    return (
                      <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: pd?.c18_ceo_signed === 'Yes' ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${pd?.c18_ceo_signed === 'Yes' ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                        </div>
                        {pipDecision && (
                          <div style={{ marginLeft: '18px' }}>
                            {finalDec === 'Yes' && (
                              <>
                                {autoStep('Engagement agreement created and sent for signing', pd?.c16_sent === 'Yes')}
                                {autoStep('Engagement agreement signed', pd?.c17_client_signed === 'Yes')}
                                {autoStep('Engagement agreement signed by CEO', pd?.c18_ceo_signed === 'Yes')}
                                {autoStep('Payment link sent (ACH or Card choice)', false)}
                                {autoStep('Payment made', !!pd?.pay1_status, pd?.pay1_status && pd?.payment_method_type ? pd.payment_method_type.toUpperCase() : null)}
                                {autoStep('Payment collected', pd?.pay1_status === 'succeeded')}
                                {autoStep('Invoice and receipt created and emailed to client', !!pd?.invoice_number)}
                                {autoStep('Revenue share paid', !!pd?.rec1_rev_share)}
                                {autoStep('Member notified of revenue share', pd?.c24_email_sent === 'Yes')}
                              </>
                            )}
                            {finalDec === 'No' && autoStep('Decline email sent to client', true)}
                            {!finalDec && autoStep('Awaiting client decision', false)}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', opacity: isGreyedOut ? 0.3 : 1 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: task.status_options === 'auto' || isDone ? (task.status_options === 'auto' ? '#1b9254' : statusColor) : 'transparent', flexShrink: 0, border: `1.5px solid ${task.status_options === 'auto' || isDone ? (task.status_options === 'auto' ? '#1b9254' : statusColor) : 'var(--vfo-border-mid)'}` }} />
                      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontFamily: 'monospace', width: '32px' }}>{task.task_code}</span>
                      <span style={{ fontSize: '13px', color: isDone || task.status_options === 'auto' ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{task.name}</span>
                      {task.status_options === 'auto'
                        ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>
                        : isDone
                          ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                          : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{formatDate(p.completed_date)}</span>}
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

// Video sub-step. There is deliberately NO playback tracking: the member declares
// Have Watched / Will Watch on the caller-supplied status select (statusNode).
function VideoTask({ task, statusNode, errorNode, isTouched, isPositive, statusColor }) {
  const [showVideo, setShowVideo] = useState(false)
  const playerRef = useRef(null)
  const containerId = `yt-player-${task.id}`

  const url = task.video_url || ''
  // Wistia and Loom are plain iframe embeds; anything else is treated as a YouTube watch URL.
  const isEmbed = url.includes('wistia') || url.includes('loom')
  const videoId = isEmbed ? null : url.match(/v=([^&]+)/)?.[1]

  useEffect(() => {
    if (!showVideo || isEmbed || !videoId) return
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = () => initPlayer()
    } else {
      initPlayer()
    }
    return () => { if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null } }
  }, [showVideo])

  function initPlayer() {
    if (playerRef.current) return
    playerRef.current = new window.YT.Player(containerId, {
      videoId,
      width: '100%',
      height: '360',
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onStateChange: () => {}
      }
    })
  }

  

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: showVideo ? '12px' : '0', flexWrap: 'wrap' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isTouched ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isTouched ? statusColor : 'var(--vfo-border-mid)'}` }} />
        <div style={{ flex: 1, minWidth: '150px' }}>
          <span style={{ fontSize: '14px', color: isPositive ? 'var(--vfo-muted)' : 'var(--vfo-ink)' }}>{task.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setShowVideo(!showVideo)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid rgba(0,149,255,0.4)`, background: showVideo ? 'rgba(231,76,60,0.15)' : 'rgba(0,149,255,0.15)', color: showVideo ? '#e74c3c' : '#0095ff' }}>
            {showVideo ? 'Hide Video' : '▶ Watch Video'}
          </button>
          {statusNode}
        </div>
      </div>
      {errorNode}
      {showVideo && (
        <div style={{ borderRadius: '8px', overflow: 'hidden', marginLeft: '22px' }}>
          {isEmbed ? (
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
              <iframe src={url} title={task.name} allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          ) : (
            <div id={containerId} />
          )}
        </div>
      )}
    </div>
  )
}

function MemberCoachingMeetings({ enrollment, eyebrow = 'Advanced Coaching' }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedMeeting, setExpandedMeeting] = useState(null)

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  useEffect(() => { loadMeetings() }, [enrollment.id])

  async function loadMeetings() {
    setLoading(true)
    try {
      const data = await callApi('coaching_load_meetings', { enrollment_id: enrollment.id })
      setMeetings(data.meetings || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const completedMeetings = meetings.filter(m => m.status === 'completed').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const scheduledMeetings = meetings.filter(m => m.status === 'scheduled').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const nextScheduled = scheduledMeetings[0]

  if (loading) return <CoachingMeetingsSkeleton />

  return (
    <div>
      <TrackHero
        eyebrow={eyebrow}
        title="Coaching Meetings"
        meta={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b9254', flexShrink: 0 }} />{completedMeetings.length} completed</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0095ff', flexShrink: 0 }} />{scheduledMeetings.length} scheduled</span>
          {nextScheduled && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>Next meeting {nextScheduled.meeting_date.split('T')[0]}</span></>}
        </>}
      />

      {scheduledMeetings.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Upcoming</div>
          {scheduledMeetings.map(m => (
            <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{m.meeting_date.split('T')[0]}</span>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>Scheduled</span>
            </div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
        {completedMeetings.length === 0
          ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No meetings completed yet.</p>
          : completedMeetings.map(m => (
            <div key={m.id} style={{ borderBottom: '1px solid var(--vfo-tint)' }}>
              <div onClick={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: m.notes ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{m.meeting_date.split('T')[0]}</span>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Completed</span>
                </div>
                {m.notes && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>has notes</span>
                    <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expandedMeeting === m.id ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                )}
              </div>
              {expandedMeeting === m.id && m.notes && (
                <div style={{ padding: '0 0 12px 0' }}>
                  <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: '1.5', margin: 0 }}>{m.notes}</p>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

function MemberCoachingRenewal({ enrollment }) {
  const [renewals, setRenewals] = useState([])
  const [loading, setLoading] = useState(true)

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  useEffect(() => { loadRenewals() }, [enrollment.id])

  async function loadRenewals() {
    setLoading(true)
    try {
      const data = await callApi('coaching_load_renewals', { enrollment_id: enrollment.id })
      setRenewals(data.renewals || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const latestRenewal = renewals.length > 0 ? renewals[0] : null
  const nextDate = latestRenewal?.next_renewal_date
  const joinDate = enrollment.date_enrolled?.split('T')[0]
  const currentPeriod = latestRenewal?.period_label || 'Year 1'
  const currentStatus = latestRenewal?.action === 'cancelled' ? 'Cancelled' : 'Active'
  const statusColor = currentStatus === 'Active' ? '#1b9254' : '#e74c3c'

  let daysUntilRenewal = null
  let renewalUrgency = '#1b9254'
  if (nextDate) {
    const diff = Math.ceil((new Date(nextDate) - new Date()) / (1000 * 60 * 60 * 24))
    daysUntilRenewal = diff
    if (diff < 0) renewalUrgency = '#e74c3c'
    else if (diff <= 30) renewalUrgency = '#e74c3c'
    else if (diff <= 60) renewalUrgency = '#e06717'
  }

  const actionColors = { renewed: '#1b9254', cancelled: '#e74c3c' }

  if (loading) return <CoachingRenewalSkeleton />


  return (
    <div>
      <TrackHero
        eyebrow="Advanced Coaching"
        title="Membership Renewal"
        meta={<>
          <span>Joined {joinDate || '—'}</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, flexShrink: 0 }} />{currentStatus}</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span>{currentPeriod}</span>
          {nextDate && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ fontWeight: 600, color: renewalUrgency }}>{daysUntilRenewal !== null && daysUntilRenewal < 0 ? `Overdue ${Math.abs(daysUntilRenewal)} days` : `Ends ${nextDate.split('T')[0]}${daysUntilRenewal !== null ? ` (${daysUntilRenewal} days)` : ''}`}</span></>}
        </>}
      />

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Renewal History</div>
        {renewals.length === 0
          ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No renewals recorded yet.</p>
          : renewals.map(r => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${actionColors[r.action] || 'var(--vfo-muted)'}22`, color: actionColors[r.action] || 'var(--vfo-muted)', border: `1px solid ${actionColors[r.action] || 'var(--vfo-muted)'}44`, textTransform: 'capitalize' }}>{r.action}</span>
                <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{r.action_date?.split('T')[0]}</span>
                {r.period_label && <span style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600 }}>{r.period_label}</span>}
              </div>
              {r.notes && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{r.notes}</div>}
            </div>
          ))
        }
      </div>
    </div>
  )
}