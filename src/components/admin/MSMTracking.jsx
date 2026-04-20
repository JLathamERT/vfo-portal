import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'

const PROGRAMS = [
  { key: 'holistic', name: 'VFO Holistic Planning' },
  { key: 'partnership', name: 'Partnership Fast Track' },
  { key: 'tax', name: 'VFO Tax Planning' },
  { key: 'coaching', name: 'Advanced Coaching' },
]

const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael', 'Bridger Silvester', 'Tracy Miller', 'Evan Anderson']

export default function MSMTracking({ member, activeSection, onDataChange }) {
  const activeTab = activeSection === 'msm_meetings' ? 'home' : 'programs'
  const activeProgramKey = activeSection === 'msm_program_holistic' ? 'holistic'
    : activeSection === 'msm_program_partnership' ? 'partnership'
    : activeSection === 'msm_program_tax' ? 'tax'
    : activeSection === 'msm_program_coaching' ? 'coaching'
    : null
  const [programs, setPrograms] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [meetings, setMeetings] = useState([])
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [activeProgram, setActiveProgram] = useState(activeProgramKey || 'holistic')
  const [loading, setLoading] = useState(true)

  // Meeting log state
  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingConductedBy, setMeetingConductedBy] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')
  const [meetingStatus, setMeetingStatus] = useState('')

  useEffect(() => { loadData() }, [member.plugin_member_number])

  async function loadData() {
    setLoading(true)
    try {
      const [progData, enrollData, meetData, enabledData] = await Promise.all([
        callApi('msm_load_programs'),
        callApi('msm_load_enrollments', { member_number: member.plugin_member_number }),
        callApi('msm_load_meetings', { member_number: member.plugin_member_number }),
        callApi('msm_load_enabled_programs', { member_number: member.plugin_member_number }),
      ])
      setPrograms(progData.programs || [])
      setEnrollments(enrollData.enrollments || [])
      setMeetings(meetData.meetings || [])
      setEnabledPrograms(enabledData.enabled || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function logMeeting() {
    if (!meetingDate) { setMeetingStatus('Date is required.'); return }
    try {
      await callApi('msm_log_meeting', {
        member_number: member.plugin_member_number,
        meeting_date: meetingDate,
        meeting_type: 'MSM Meeting',
        conducted_by: meetingConductedBy,
        notes: meetingNotes,
      })
      setMeetingDate(''); setMeetingConductedBy(''); setMeetingNotes('')
      setShowLogMeeting(false); setMeetingStatus('')
      loadData()
    } catch (err) { setMeetingStatus(err.message) }
  }

  async function deleteMeeting(id) {
    try { await callApi('msm_delete_meeting', { meeting_id: id }); loadData() }
    catch (err) { console.error(err) }
  }

  function getEnrollment(programName) {
    return enrollments.find(e => e.programs?.name === programName) || null
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const tabStyle = (active) => ({
    padding: '10px 18px', background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent',
    color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400',
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap'
  })

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>

  const msmCount = meetings.filter(m => m.meeting_type === 'MSM Meeting').length
  const advancedCount = meetings.filter(m => m.meeting_type === 'Advanced Meeting').length
  const vfo90Count = meetings.filter(m => m.meeting_type === 'VFO 90 Day Plan Meeting').length
  const pft90Count = meetings.filter(m => m.meeting_type === 'PFT 90 Day Plan Meeting').length

  return (
    <div>
      

      {/* PROGRAMS TAB */}
      {activeTab === 'programs' && (
        <div>
          {PROGRAMS.map(p => {
            if (activeProgramKey !== p.key) return null
            const dbProgram = programs.find(prog => prog.name === p.name)
            if (!dbProgram) {
              return (
                <div key={p.key} style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>
                  Program "{p.name}" not found in database.
                </div>
              )
            }
            const isEnabled = enabledPrograms.some(e => e.program_id === dbProgram.id)
            if (!isEnabled) {
              return (
                <div key={p.key} style={{ textAlign: 'center', padding: '60px 20px', color: '#8bacc8' }}>
                  <div style={{ fontSize: '18px', color: '#fff', marginBottom: '8px', fontFamily: 'Playfair Display, serif' }}>{p.name}</div>
                  <div style={{ fontSize: '14px', color: '#8bacc8' }}>This program is not enabled for this member. Enable it from MSM Home.</div>
                </div>
              )
            }
            const enrollment = getEnrollment(p.name)
            if (!enrollment) {
              return <EnrollPanel key={p.key} member={member} program={dbProgram} onEnrolled={loadData} />
            }
            return <EnrolledPanel key={p.key} member={member} enrollment={enrollment} program={dbProgram} onDataChange={loadData} />
          })}
        </div>
      )}

      {/* MSM HOME TAB */}
      {activeTab === 'home' && (
        <div>
          {/* MSM Assignment */}
          <MsmAssignment member={member} onSaved={onDataChange} />

          {/* Program Toggles */}
          <ProgramToggles member={member} programs={programs} enabledPrograms={enabledPrograms} onToggle={loadData} />

          {/* Meeting counts */}
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting Summary</div>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {[
                ['MSM Meetings', msmCount],
                ['Advanced Meetings', advancedCount],
                ['VFO 90 Day Plan', vfo90Count],
                ['PFT 90 Day Plan', pft90Count],
              ].map(([label, count]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{count}</div>
                  <div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '2px', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setShowLogMeeting(!showLogMeeting)}
              style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', marginBottom: showLogMeeting ? '16px' : '0' }}>
              + Log MSM Meeting
            </button>

            {showLogMeeting && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Date *</label>
                    <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Conducted By</label>
                    <select value={meetingConductedBy} onChange={e => setMeetingConductedBy(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                      <option value="">-- Select --</option>
                      {TEAM_MEMBERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Notes</label>
                  <textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={logMeeting} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setShowLogMeeting(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                </div>
                {meetingStatus && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '8px' }}>{meetingStatus}</p>}
              </div>
            )}
          </div>

          {/* Meeting history */}
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
            {meetings.length === 0
              ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No meetings logged yet.</p>
              : meetings.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '14px', color: '#fff' }}>{m.meeting_type}</div>
                    <div style={{ fontSize: '12px', color: '#8bacc8', marginTop: '2px' }}>
                      {new Date(m.meeting_date + 'T12:00:00').toLocaleDateString()}{m.conducted_by ? ` · ${m.conducted_by}` : ''}
                    </div>
                    {m.notes && <div style={{ fontSize: '12px', color: '#5a8ab5', marginTop: '2px' }}>{m.notes}</div>}
                  </div>
                  <button onClick={() => deleteMeeting(m.id)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                    Delete
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function EnrollPanel({ member, program, onEnrolled }) {
  const [dateEnrolled, setDateEnrolled] = useState('')
  const [status, setStatus] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  async function enroll() {
    try {
      await callApi('msm_enroll_member', {
        member_number: member.plugin_member_number,
        program_id: program.id,
        date_enrolled: dateEnrolled || new Date().toISOString().split('T')[0],
      })
      onEnrolled()
    } catch (err) { setStatus(err.message) }
  }

  return (
    <div style={sectionStyle}>
      <p style={{ color: '#8bacc8', fontSize: '14px', marginBottom: '20px' }}>
        {member.name} is not enrolled in {program.name}. Enroll them to start tracking progress.
      </p>
      <div style={{ marginBottom: '12px', maxWidth: '200px' }}>
        <label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Date Joined</label>
        <input type="date" value={dateEnrolled} onChange={e => setDateEnrolled(e.target.value)} style={inputStyle} />
      </div>
      <button onClick={enroll} style={{ padding: '10px 28px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
        Enroll in {program.name}
      </button>
      {status && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

function EnrolledPanel({ member, enrollment, program, onDataChange }) {
  const [activeTab, setActiveTab] = useState('training')
  const [editingEnrollment, setEditingEnrollment] = useState(false)
  const [programStatus, setProgramStatus] = useState(enrollment.program_status || 'active')
  const [saveStatus, setSaveStatus] = useState('')

  const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael', 'Bridger Silvester', 'Tracy Miller', 'Evan Anderson']
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const tabStyle = (active) => ({ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent', color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' })

  async function saveEnrollment() {
    try {
      await callApi('msm_update_enrollment', { enrollment_id: enrollment.id, program_status: programStatus })
      setSaveStatus('Saved!'); setTimeout(() => setSaveStatus(''), 3000)
      onDataChange()
    } catch (err) { setSaveStatus(err.message) }
  }

  const statusColors = { 'On Fast Track': '#27ae60', 'Paused Fast Track': '#f39c12', 'Lost/Removed': '#e74c3c', 'Revert to Legacy': '#8bacc8' }

  return (
    <div>
      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff', marginBottom: '20px' }}>{program.name}</div>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: editingEnrollment ? '16px' : '0' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Joined</div><div style={{ fontSize: '14px', color: '#fff', marginTop: '4px' }}>{enrollment.date_enrolled ? enrollment.date_enrolled.split('T')[0] : '—'}</div></div>
            <div><div style={{ fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Program Status</div><div style={{ fontSize: '14px', color: statusColors[enrollment.program_status?.toLowerCase()] || '#fff', marginTop: '4px', fontWeight: '600' }}>{enrollment.program_status}</div></div>
            <PlanStatusBadge enrollmentId={enrollment.id} programId={program.id} />
          </div>
          <button onClick={() => setEditingEnrollment(!editingEnrollment)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '12px', cursor: 'pointer' }}>
            {editingEnrollment ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editingEnrollment && (
          <div style={{ padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Program Status</label>
                <select value={programStatus} onChange={e => setProgramStatus(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  {['On Fast Track', 'Paused Fast Track', 'Revert to Legacy', 'Lost/Removed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button onClick={saveEnrollment} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
            {saveStatus && <span style={{ color: saveStatus === 'Saved!' ? '#27ae60' : '#ff6b6b', fontSize: '13px', marginLeft: '12px' }}>{saveStatus}</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
        <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>90 Day Plan</button>
        <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>Clients</button>
      </div>

      {activeTab === 'training' && <TrainingTrack enrollment={enrollment} program={program} />}
      {activeTab === 'clients' && <ClientsPanel enrollment={enrollment} member={member} program={program} />}
    </div>
  )
}

function TrainingTrack({ enrollment, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [phaseCompletedBy, setPhaseCompletedBy] = useState({})

  useEffect(() => { loadTrack() }, [enrollment.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_training_track', { program_id: program.id }),
        callApi('msm_load_training_progress', { enrollment_id: enrollment.id }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      const byPhase = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      loadedPhases.forEach(phase => {
        const firstWithBy = (phase.program_training_tasks || []).find(t => prog[t.id]?.completed_by)
        if (firstWithBy) byPhase[phase.id] = prog[firstWithBy.id].completed_by
        else byPhase[phase.id] = ''
      })
      setProgress(prog)
      setPhaseCompletedBy(byPhase)

      const expandState = {}
      loadedPhases.forEach(phase => {
        const tasks = phase.program_training_tasks || []
        const allDone = tasks.length > 0 && tasks.every(t => prog[t.id]?.status)
        expandState[phase.id] = !allDone
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function saveTask(taskId, status, completedDate, phaseId) {
    const completedBy = phaseCompletedBy[phaseId] || null
    const today = new Date().toISOString().split('T')[0]
    const date = completedDate || (status ? today : null)
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_training_task', { enrollment_id: enrollment.id, task_id: taskId, status, completed_date: date || null, completed_by: completedBy, notes: null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date, completed_by: completedBy } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  async function saveDateChange(taskId, completedDate, phaseId) {
    const p = progress[taskId] || {}
    const completedBy = phaseCompletedBy[phaseId] || null
    setSaving(prev => ({ ...prev, [taskId]: true }))
    try {
      await callApi('msm_save_training_task', { enrollment_id: enrollment.id, task_id: taskId, status: p.status, completed_date: completedDate || null, completed_by: completedBy, notes: null })
      setProgress(prev => ({ ...prev, [taskId]: { ...prev[taskId], completed_date: completedDate } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [taskId]: false })) }
  }

  function getPhaseState(phase) {
    const tasks = phase.program_training_tasks || []
    if (tasks.length === 0) return 'pending'
    if (tasks.every(t => progress[t.id]?.status)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  
  const statusColors = { Completed: '#27ae60', 'Training Completed': '#27ae60', '90 Day Plan Completed': '#27ae60', 'Have Watched': '#27ae60', 'Will Watch': '#27ae60', 'In Progress': '#f39c12', Outstanding: '#f39c12', 'N/A': '#8bacc8', Pending: '#e74c3c', Stopped: '#e74c3c' }
  const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading training track...</div>
  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No training track defined for this program yet.</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_training_tasks?.length || 0), 0)
  const completedTasks = Object.values(progress).filter(p => p.status && p.status !== '').length

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{completedTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>COMPLETED</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{totalTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>TOTAL</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#27ae60' }}>{totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>PROGRESS</div></div>
      </div>

      {phases.map(phase => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_training_tasks || []
        const doneTasks = tasks.filter(t => progress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
        const isReview = phase.name.includes('Review')

        return (
          <div key={phase.id} style={{ background: isReview ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: isReview ? '10px' : '10px', marginTop: isReview ? '-6px' : '0', marginLeft: isReview ? '20px' : '0', overflow: 'hidden', borderTopLeftRadius: isReview ? '0' : '12px', borderTopRightRadius: isReview ? '12px' : '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}{isReview && <span style={{ fontSize: '10px', color: '#8bacc8', marginLeft: '8px', textTransform: 'none', fontWeight: '400', letterSpacing: '0' }}>checkpoint</span>}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{tasks.length}</span>}
                {state === 'pending' && !isReview && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {!isReview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '12px', color: '#8bacc8' }}>Completed By</span>
                  <select value={phaseCompletedBy[phase.id] || ''} onChange={e => setPhaseCompletedBy(p => ({ ...p, [phase.id]: e.target.value }))} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '160px' }}>
                    <option value="">-- Select --</option>
                    {TEAM_MEMBERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                )}
                {tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || '#8bacc8'
                  const code = task.task_code

                  // --- REVIEW TASKS (auto-calculated) ---
                  if (isReview) {
                    const allTasks = phases.flatMap(ph => ph.program_training_tasks || [])
                    const findByCode = (c) => allTasks.find(t => t.task_code === c)
                    const isTaskDone = (c) => { const t = findByCode(c); return t && (progress[t.id]?.status === 'Completed' || progress[t.id]?.status === 'Have Watched') }
                    const isTaskNotEmpty = (c) => { const t = findByCode(c); return t && progress[t.id]?.status && progress[t.id]?.status !== '' }
                    let reviewStatus = 'Not Completed'
                    let reviewColor = '#e74c3c'

                    if (code === 'M25') {
                      const codes = ['M3','M8','M15','M21']
                      const doneCount = codes.filter(c => isTaskDone(c)).length
                      if (doneCount === codes.length) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                      else if (doneCount > 0) { reviewStatus = 'In Progress'; reviewColor = '#f39c12' }
                    } else if (code === 'M26') {
                      if (isTaskDone('M4')) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                    } else if (code === 'M27') {
                      const codes = ['M16','M30']
                      const doneCount = codes.filter(c => isTaskDone(c)).length
                      if (doneCount === codes.length) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                      else if (doneCount > 0) { reviewStatus = 'In Progress'; reviewColor = '#f39c12' }
                    } else if (code === 'M28') {
                      if (isTaskDone('M17')) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                    } else if (code === 'M29') {
                      if (isTaskDone('M18')) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                    } else if (code === 'M30') {
                      const m1to24 = []
                      for (let i = 1; i <= 24; i++) m1to24.push('M' + i)
                      const allDone = m1to24.every(c => {
                        if (c === 'M22' || c === 'M23') return isTaskNotEmpty(c)
                        return isTaskDone(c)
                      })
                      if (allDone) { reviewStatus = 'Completed'; reviewColor = '#27ae60' }
                      else {
                        const someStarted = m1to24.some(c => isTaskNotEmpty(c))
                        if (someStarted) { reviewStatus = 'In Progress'; reviewColor = '#f39c12' }
                      }
                    }

                    return (
                      <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: reviewColor, flexShrink: 0, border: `1.5px solid ${reviewColor}` }} />
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{code}</span>
                          <span style={{ fontSize: '14px', color: '#fff' }}>{task.name}</span>
                        </div>
                        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: `${reviewColor}22`, color: reviewColor, border: `1px solid ${reviewColor}44`, fontWeight: '600' }}>{reviewStatus}</span>
                      </div>
                    )
                  }

                  // --- NUMBER INPUT TASKS (M22/M23) ---
                  if (code === 'M22' || code === 'M23') {
                    const label = code === 'M22' ? 'Sent' : 'Called'
                    const numVal = p.status || ''
                    return (
                      <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: numVal ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${numVal ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{code}</span>
                          <span style={{ fontSize: '14px', color: numVal ? '#8bacc8' : '#fff' }}>{task.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input type="number" min="0" value={numVal} onChange={e => saveTask(task.id, e.target.value, p.completed_date, phase.id)} style={{ ...inputStyle, width: '60px', textAlign: 'center' }} placeholder="0" />
                          <span style={{ fontSize: '13px', color: '#8bacc8' }}>{label}</span>
                        </div>
                        <input type="date" value={p.completed_date || ''} onChange={e => saveDateChange(task.id, e.target.value, phase.id)} style={{ ...inputStyle, width: '140px' }} />
                      </div>
                    )
                  }

                  // --- NORMAL TASKS ---
                  return (
                    <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{task.task_code}</span>
                        <span style={{ fontSize: '14px', color: isDone ? '#8bacc8' : '#fff' }}>{task.name}</span>
                      </div>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, phase.id)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '130px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                        <option value="">-- Status --</option>
                        {(task.status_options || 'Completed|Outstanding|Stopped').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDateChange(task.id, e.target.value, phase.id)} style={{ ...inputStyle, width: '140px' }} />
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

function ClientsPanel({ enrollment, member, program }) {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addStatus, setAddStatus] = useState('')

  useEffect(() => { loadClients() }, [enrollment.id])

  async function loadClients() {
    setLoading(true)
    try {
      const data = await callApi('msm_load_clients', { enrollment_id: enrollment.id })
      setClients(data.clients || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function addClient() {
    if (!firstName || !lastName) { setAddStatus('First and last name are required.'); return }
    try {
      await callApi('msm_add_client', { enrollment_id: enrollment.id, member_number: member.plugin_member_number, first_name: firstName, last_name: lastName, email, phone })
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setShowAdd(false); setAddStatus('')
      loadClients()
    } catch (err) { setAddStatus(err.message) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }
  const statusColors = { pending: '#f39c12', active: '#27ae60', declined: '#e74c3c' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading clients...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', lineHeight: 1 }}>{clients.length}</div><div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '4px' }}>TOTAL</div></div>
          <div><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', lineHeight: 1 }}>{clients.filter(c => c.status === 'active').length}</div><div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '4px' }}>ACTIVE</div></div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Add Client</button>
      </div>

      {showAdd && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add New Client</div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>First Name *</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Last Name *</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '180px' }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addClient} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
          {addStatus && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
        </div>
      )}

      {clients.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No clients added yet.</div>
        : clients.map(client => (
          <div key={client.id} style={{ ...sectionStyle, cursor: 'pointer' }}
            onClick={() => navigate(`/admin/client/${client.id}`)}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.12)'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>{client.first_name} {client.last_name}</span>
                  <span style={{ fontSize: '11px', color: '#8bacc8' }}>{client.client_ref}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: `${statusColors[client.status] || '#8bacc8'}22`, color: statusColors[client.status] || '#8bacc8', border: `1px solid ${statusColors[client.status] || '#8bacc8'}44` }}>{client.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : ''}</span>
                </div>
                {(client.email || client.phone) && <div style={{ fontSize: '12px', color: '#8bacc8', marginTop: '4px' }}>{client.email}{client.email && client.phone ? ' · ' : ''}{client.phone}</div>}
              </div>
              <span style={{ color: '#5b9fe6', fontSize: '13px' }}>View →</span>
            </div>
          </div>
        ))
      }
    </div>
  )
}

function ClientTrack({ client, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  useEffect(() => { loadTrack() }, [client.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_client_track', { program_id: program.id }),
        callApi('msm_load_client_progress', { client_id: client.id }),
      ])
      setPhases(trackData.phases || [])
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function saveTask(taskId, status, completedDate, completedBy, notes) {
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: client.id, task_id: taskId, status, completed_date: completedDate || null, completed_by: completedBy || null, notes: notes || null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: completedDate, completed_by: completedBy, notes } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }
  const STATUS_OPTIONS = ['', 'Completed', 'In Progress', 'Confirmed', 'Yes', 'No', 'N/A', 'Pending', 'Scheduled']
  const statusColors = { Completed: '#27ae60', Confirmed: '#27ae60', Yes: '#27ae60', 'In Progress': '#f39c12', Scheduled: '#5b9fe6', No: '#e74c3c', 'N/A': '#8bacc8', Pending: '#f39c12' }

  if (loading) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>Loading track...</div>
  if (phases.length === 0) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>No client track defined for this program yet.</div>

  return (
    <div>
      {phases.map(phase => (
        <div key={phase.id} style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b9fe6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</div>
          {(phase.program_client_tasks || []).map(task => {
            const p = progress[task.id] || {}
            return (
              <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[p.status] || 'transparent', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <span style={{ fontSize: '12px', color: '#8bacc8', marginRight: '6px' }}>{task.task_code}</span>
                  <span style={{ fontSize: '13px', color: '#fff' }}>{task.name}</span>
                </div>
                <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, p.completed_by, p.notes)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '130px' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || '-- Status --'}</option>)}
                </select>
                <input type="date" value={p.completed_date || ''} onChange={e => saveTask(task.id, p.status, e.target.value, p.completed_by, p.notes)} style={{ ...inputStyle, width: '140px' }} />
                <input value={p.notes || ''} onChange={e => saveTask(task.id, p.status, p.completed_date, p.completed_by, e.target.value)} placeholder="Notes" style={{ ...inputStyle, flex: 1, minWidth: '100px' }} onBlur={e => saveTask(task.id, p.status, p.completed_date, p.completed_by, e.target.value)} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MsmAssignment({ member, onSaved }) {
  const [assignedMsm, setAssignedMsm] = useState(member.assigned_msm || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael', 'Bridger Silvester', 'Tracy Miller', 'Evan Anderson']
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  async function save() {
    setSaving(true)
    try {
      await callApi('msm_update_assigned_msm', { member_number: member.plugin_member_number, assigned_msm: assignedMsm })
      setStatus('Saved!')
      setTimeout(() => setStatus(''), 3000)
      onSaved()
    } catch (err) { setStatus(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Assigned MSM</div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <select value={assignedMsm} onChange={e => setAssignedMsm(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '220px' }}>
          <option value="">-- Select MSM --</option>
          {TEAM_MEMBERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {status && <span style={{ color: '#27ae60', fontSize: '13px' }}>{status}</span>}
      </div>
    </div>
  )
}

function PlanStatusBadge({ enrollmentId, programId }) {
  const [planStatus, setPlanStatus] = useState('...')

  useEffect(() => { loadStatus() }, [enrollmentId])

  async function loadStatus() {
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_training_track', { program_id: programId }),
        callApi('msm_load_training_progress', { enrollment_id: enrollmentId }),
      ])
      const phases = trackData.phases || []
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      const allTasks = phases.flatMap(p => p.program_training_tasks || [])
      if (!allTasks.length) { setPlanStatus('Not Started'); return }
      if (allTasks.every(t => prog[t.id]?.status === 'Completed')) { setPlanStatus('Completed'); return }
      for (let i = phases.length - 1; i >= 0; i--) {
        const tasks = phases[i].program_training_tasks || []
        if (tasks.some(t => prog[t.id]?.status)) { setPlanStatus(phases[i].name); return }
      }
      setPlanStatus('Not Started')
    } catch (err) { setPlanStatus('—') }
  }

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>90 Day Plan</div>
      <div style={{ fontSize: '14px', color: planStatus === 'Completed' ? '#27ae60' : planStatus === 'Not Started' ? '#8bacc8' : '#5b9fe6', marginTop: '4px', fontWeight: '600' }}>{planStatus}</div>
    </div>
  )
}

function ProgramToggles({ member, programs, enabledPrograms, onToggle }) {
  const [toggling, setToggling] = useState({})
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  async function toggle(programId, currentlyEnabled) {
    setToggling(t => ({ ...t, [programId]: true }))
    try {
      await callApi('msm_toggle_program', { member_number: member.plugin_member_number, program_id: programId, enabled: !currentlyEnabled })
      onToggle()
    } catch (err) { console.error(err) }
    finally { setToggling(t => ({ ...t, [programId]: false })) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Programs</div>
      {PROGRAMS.map(p => {
        const dbProgram = programs.find(prog => prog.name === p.name)
        if (!dbProgram) return null
        const isEnabled = enabledPrograms.some(e => e.program_id === dbProgram.id)
        return (
          <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '14px', color: isEnabled ? '#fff' : '#8bacc8' }}>{p.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: isEnabled ? '#27ae60' : '#8bacc8' }}>{isEnabled ? 'Enabled' : 'Disabled'}</span>
              <div onClick={() => !toggling[dbProgram.id] && toggle(dbProgram.id, isEnabled)}
                style={{ width: '44px', height: '24px', borderRadius: '12px', background: isEnabled ? '#27ae60' : 'rgba(255,255,255,0.15)', cursor: 'pointer', position: 'relative', opacity: toggling[dbProgram.id] ? 0.5 : 1 }}>
                <div style={{ position: 'absolute', top: '2px', left: isEnabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
