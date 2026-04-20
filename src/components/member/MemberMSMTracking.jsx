import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'

const PROGRAMS = [
  { key: 'holistic', name: 'VFO Holistic Planning' },
  { key: 'partnership', name: 'Partnership Fast Track' },
  { key: 'tax', name: 'VFO Tax Planning' },
  { key: 'coaching', name: 'Advanced Coaching' },
]

export default function MemberMSMTracking({ member, activeTab, onNavigate }) {
  const [programs, setPrograms] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [member.member_number])

  async function loadData() {
    setLoading(true)
    try {
      const [progData, enrollData, enabledData, meetData] = await Promise.all([
        callApi('msm_load_programs'),
        callApi('msm_load_enrollments', { member_number: member.member_number }),
        callApi('msm_load_enabled_programs', { member_number: member.member_number }),
        callApi('msm_load_meetings', { member_number: member.member_number }),
      ])
      setPrograms(progData.programs || [])
      setEnrollments(enrollData.enrollments || [])
      setEnabledPrograms(enabledData.enabled || [])
      setMeetings(meetData.meetings || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function getEnrollment(programName) {
    return enrollments.find(e => e.programs?.name === programName) || null
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  const msmCount = meetings.filter(m => m.meeting_type === 'MSM Meeting').length
  const advancedCount = meetings.filter(m => m.meeting_type === 'Advanced Meeting').length
  const vfo90Count = meetings.filter(m => m.meeting_type === 'VFO 90 Day Plan Meeting').length
  const pft90Count = meetings.filter(m => m.meeting_type === 'PFT 90 Day Plan Meeting').length

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>

  const activeProgramKey = activeTab === 'msm_home' ? null
    : activeTab === 'msm_holistic' ? 'holistic'
    : activeTab === 'msm_partnership' ? 'partnership'
    : activeTab === 'msm_tax' ? 'tax'
    : activeTab === 'msm_coaching' ? 'coaching'
    : null

  if (activeTab === 'msm_home') {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Assigned MSM</div>
          <div style={{ fontSize: '16px', color: '#fff', fontWeight: '600' }}>{member.assigned_msm || '—'}</div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Your Programs</div>
          {PROGRAMS.map(p => {
            const dbProgram = programs.find(prog => prog.name === p.name)
            if (!dbProgram) return null
            const isEnabled = enabledPrograms.some(e => e.program_id === dbProgram.id)
            if (!isEnabled) return null
            const enrollment = getEnrollment(p.name)
            const tabKey = { holistic: 'msm_holistic', partnership: 'msm_partnership', tax: 'msm_tax', coaching: 'msm_coaching' }[p.key]
            return (
              <div key={p.key} onClick={() => onNavigate(tabKey)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: '14px', color: '#5b9fe6' }}>{p.name}</span>
                <span style={{ fontSize: '13px', color: enrollment ? '#27ae60' : '#8bacc8' }}>{enrollment ? enrollment.program_status || 'Enrolled' : 'Not Enrolled'}</span>
              </div>
            )
          })}
          {enabledPrograms.length === 0 && <p style={{ color: '#8bacc8', fontSize: '14px' }}>No programs enabled yet.</p>}
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting Summary</div>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {[['MSM Meetings', msmCount], ['Advanced Meetings', advancedCount], ['VFO 90 Day Plan', vfo90Count], ['PFT 90 Day Plan', pft90Count]].map(([label, count]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{count}</div>
                <div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '2px', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
          {meetings.length === 0
            ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No meetings logged yet.</p>
            : meetings.map(m => (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: '14px', color: '#fff' }}>{m.meeting_type}</div>
                <div style={{ fontSize: '12px', color: '#8bacc8', marginTop: '2px' }}>
                  {new Date(m.meeting_date + 'T12:00:00').toLocaleDateString()}{m.conducted_by ? ` · ${m.conducted_by}` : ''}
                </div>
                {m.notes && <div style={{ fontSize: '12px', color: '#5a8ab5', marginTop: '2px' }}>{m.notes}</div>}
              </div>
            ))
          }
        </div>
      </div>
    )
  }

  if (activeProgramKey) {
    const p = PROGRAMS.find(p => p.key === activeProgramKey)
    const dbProgram = programs.find(prog => prog.name === p?.name)
    const isEnabled = dbProgram && enabledPrograms.some(e => e.program_id === dbProgram.id)

    if (!isEnabled) return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8bacc8' }}>
        <div style={{ fontSize: '18px', color: '#fff', marginBottom: '8px', fontFamily: 'Playfair Display, serif' }}>{p?.name}</div>
        <div style={{ fontSize: '14px' }}>This program is not enabled.</div>
      </div>
    )

    const enrollment = getEnrollment(p.name)

    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff', marginBottom: '20px' }}>{p.name}</div>
        {!enrollment
          ? <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>You are not yet enrolled in this program.</div>
          : <MemberEnrolledView enrollment={enrollment} program={dbProgram} member={member} />
        }
      </div>
    )
  }

  return null
}

function MemberEnrolledView({ enrollment, program, member }) {
  const [activeTab, setActiveTab] = useState('training')
  const tabStyle = (active) => ({ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent', color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' })
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const statusColors = { 'On Fast Track': '#27ae60', 'Paused Fast Track': '#f39c12', 'Lost/Removed': '#e74c3c', 'Revert to Legacy': '#8bacc8' }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Joined</div><div style={{ fontSize: '14px', color: '#fff', marginTop: '4px' }}>{enrollment.date_enrolled ? enrollment.date_enrolled.split('T')[0] : '—'}</div></div>
          <div><div style={{ fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Program Status</div><div style={{ fontSize: '14px', color: statusColors[enrollment.program_status] || '#fff', marginTop: '4px', fontWeight: '600' }}>{enrollment.program_status || '—'}</div></div>
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
        <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>90 Day Plan</button>
        <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>Clients</button>
      </div>
      {activeTab === 'training' && <MemberTrainingView enrollment={enrollment} program={program} />}
      {activeTab === 'clients' && <MemberClientsView enrollment={enrollment} member={member} program={program} />}
    </div>
  )
}

function MemberTrainingView({ enrollment, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)

  function handleTaskComplete(taskId, status, date) {
    setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date } }))
  }

  useEffect(() => { loadTrack() }, [enrollment.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_training_track', { program_id: program.id }),
        callApi('msm_load_training_progress', { enrollment_id: enrollment.id }),
      ])
      setPhases(trackData.phases || [])
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }
  const statusColors = { Completed: '#27ae60', 'Have Watched': '#27ae60', 'In Progress': '#f39c12', 'N/A': '#8bacc8', Pending: '#e74c3c' }
  const statusBg = { Completed: 'rgba(39,174,96,0.15)', 'Have Watched': 'rgba(39,174,96,0.15)', 'In Progress': 'rgba(243,156,18,0.15)', 'N/A': 'rgba(139,172,200,0.15)', Pending: 'rgba(231,76,60,0.15)' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>
  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No training track defined yet.</div>

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
        const isReview = phase.name.includes('Review')
        return (
        <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '16px', marginTop: isReview ? '-6px' : '0', marginLeft: isReview ? '20px' : '0', borderTopLeftRadius: isReview ? '0' : '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}{isReview && <span style={{ fontSize: '10px', color: '#8bacc8', marginLeft: '8px', textTransform: 'none', fontWeight: '400', letterSpacing: '0' }}>checkpoint</span>}</div>
          {(phase.program_training_tasks || []).map(task => {
            const p = progress[task.id] || {}
            const code = task.task_code

            if (task.video_url) return (
              <VideoTask key={task.id} task={task} progress={p} enrollmentId={enrollment.id} onComplete={handleTaskComplete} />
            )

            // --- REVIEW TASKS (auto-calculated, read-only) ---
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
                <div key={task.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: reviewColor, flexShrink: 0, border: `1px solid ${reviewColor}` }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{code}</span>
                    <span style={{ fontSize: '14px', color: '#fff' }}>{task.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: `${reviewColor}22`, color: reviewColor, border: `1px solid ${reviewColor}44`, fontWeight: '600' }}>{reviewStatus}</span>
                </div>
              )
            }

            // --- M22/M23 number display (read-only on member side) ---
            if (code === 'M22' || code === 'M23') {
              const label = code === 'M22' ? 'Sent' : 'Called'
              const numVal = p.status || '—'
              return (
                <div key={task.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.status ? '#27ae60' : 'transparent', flexShrink: 0, border: `1px solid ${p.status ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{code}</span>
                    <span style={{ fontSize: '14px', color: '#fff' }}>{task.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: p.status ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.08)', color: p.status ? '#27ae60' : '#8bacc8', fontWeight: '600' }}>{numVal} {label}</span>
                </div>
              )
            }

            // --- NORMAL TASKS ---
            return (
              <div key={task.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColors[p.status] || 'transparent', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{task.task_code}</span>
                  <span style={{ fontSize: '14px', color: '#fff' }}>{task.name}</span>
                </div>
                {p.status && (
                  <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '12px', background: statusBg[p.status] || 'rgba(255,255,255,0.08)', color: statusColors[p.status] || '#fff' }}>{p.status}</span>
                )}
              </div>
            )
          })}
        </div>
        )
      })}
    </div>
  )
}

function MemberClientsView({ enrollment, member, program }) {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addStatus, setAddStatus] = useState('')
  const [expandedClient, setExpandedClient] = useState(null)

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
      await callApi('msm_add_client', { enrollment_id: enrollment.id, member_number: member.member_number, first_name: firstName, last_name: lastName, email, phone })
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
            onClick={() => navigate(`/member/client/${client.id}`)}
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

function MemberClientTrackView({ client, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => { loadTrack() }, [client.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_client_track', { program_id: program.id }),
        callApi('msm_load_client_progress', { client_id: client.id }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)

      const expandState = {}
      loadedPhases.forEach(phase => {
        const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
        const allDone = tasks.length > 0 && tasks.every(t => prog[t.id]?.status)
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

  const statusColors = { Completed: '#27ae60', Confirmed: '#27ae60', Yes: '#27ae60', 'Call arranged': '#27ae60', 'PIP 1 scheduled': '#27ae60', 'Follow-up scheduled': '#27ae60', 'PIP Follow-up confirmed': '#27ae60', 'Send confirmation email': '#27ae60', 'Regular priorities tab enabled': '#27ae60', 'Tax priorities tab enabled': '#27ae60', 'Completed + N/A': '#27ae60', 'Completed + Risk 1': '#27ae60', 'Completed + Risk 2': '#27ae60', 'Completed + Risk 3': '#27ae60', 'Completed + Risk 4': '#27ae60', 'Completed + Risk 5': '#27ae60', Lite: '#27ae60', Core: '#27ae60', Max: '#27ae60', 'In Progress': '#f39c12', Undecided: '#f39c12', 'No response': '#e74c3c', No: '#e74c3c', 'PIP Follow-up declined': '#e74c3c', 'Send declined email': '#e74c3c' }

  if (loading) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>Loading track...</div>
  if (phases.length === 0) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>No client track defined yet.</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_client_tasks || []).filter(t => t.status_options !== 'auto').length, 0)
  const completedTasks = phases.reduce((s, phase) => s + (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && progress[t.id]?.status && progress[t.id].status !== '').length, 0)

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
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        const doneTasks = nonAutoTasks.filter(t => progress[t.id]?.status && progress[t.id].status !== '').length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
        const c10TaskId = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.task_code === 'C10')?.id
        const c10Status = progress[c10TaskId]?.status || ''
        const c14c15Active = c10Status === 'No' || c10Status === 'Undecided'

        return (
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status && p.status !== ''
                  const statusColor = statusColors[p.status] || '#8bacc8'
                  const isGreyedOut = (task.task_code === 'C14' || task.task_code === 'C15') && !c14c15Active

                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isGreyedOut ? 0.3 : 1 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: task.status_options === 'auto' || isDone ? (task.status_options === 'auto' ? '#27ae60' : statusColor) : 'transparent', flexShrink: 0, border: `1.5px solid ${task.status_options === 'auto' || isDone ? (task.status_options === 'auto' ? '#27ae60' : statusColor) : 'rgba(255,255,255,0.2)'}` }} />
                      <span style={{ fontSize: '12px', color: '#8bacc8', fontFamily: 'monospace', width: '32px' }}>{task.task_code}</span>
                      <span style={{ fontSize: '13px', color: isDone || task.status_options === 'auto' ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      {task.status_options === 'auto'
                        ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>
                        : isDone
                          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                          : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
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

function VideoTask({ task, progress, enrollmentId, onComplete }) {
  const [showVideo, setShowVideo] = useState(false)
  const [completed, setCompleted] = useState(!!progress?.status)
  const playerRef = useRef(null)
  const containerId = `yt-player-${task.id}`

  const videoId = task.video_url?.match(/v=([^&]+)/)?.[1]
  const statusColor = completed ? '#27ae60' : '#5b9fe6'

  useEffect(() => {
    if (!showVideo || !videoId) return
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
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: showVideo ? '12px' : '0' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: completed ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${completed ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '13px', color: '#8bacc8', marginRight: '8px' }}>{task.task_code}</span>
          <span style={{ fontSize: '14px', color: completed ? '#8bacc8' : '#fff' }}>{task.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setShowVideo(!showVideo)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid rgba(91,159,230,0.4)`, background: showVideo ? 'rgba(231,76,60,0.15)' : 'rgba(91,159,230,0.15)', color: showVideo ? '#e74c3c' : '#5b9fe6' }}>
            {showVideo ? 'Hide Video' : '▶ Watch Video'}
          </button>
          {completed && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Have Watched</span>}
        </div>
      </div>
      {showVideo && (
        <div style={{ borderRadius: '8px', overflow: 'hidden', marginLeft: '22px' }}>
          <div id={containerId} />
        </div>
      )}
    </div>
  )
}