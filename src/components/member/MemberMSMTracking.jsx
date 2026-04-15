import { useState, useEffect } from 'react'
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
  const statusColors = { Completed: '#27ae60', 'Have Watched': '#5b9fe6', 'In Progress': '#f39c12', 'N/A': '#8bacc8', Pending: '#e74c3c' }
  const statusBg = { Completed: 'rgba(39,174,96,0.15)', 'Have Watched': 'rgba(91,159,230,0.15)', 'In Progress': 'rgba(243,156,18,0.15)', 'N/A': 'rgba(139,172,200,0.15)', Pending: 'rgba(231,76,60,0.15)' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>
  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No training track defined yet.</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_training_tasks?.length || 0), 0)
  const completedTasks = Object.values(progress).filter(p => p.status === 'Completed').length

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{completedTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>COMPLETED</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{totalTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>TOTAL</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#27ae60' }}>{totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>PROGRESS</div></div>
      </div>
      {phases.map(phase => (
        <div key={phase.id} style={sectionStyle}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px', fontFamily: 'Playfair Display, serif' }}>{phase.name}</div>
          {(phase.program_training_tasks || []).map(task => {
            const p = progress[task.id] || {}
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
      ))}
    </div>
  )
}

function MemberClientsView({ enrollment, member, program }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{clients.length}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>TOTAL</div></div>
          <div><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{clients.filter(c => c.status === 'active').length}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>ACTIVE</div></div>
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
          <div key={client.id} style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>{client.first_name} {client.last_name}</span>
                  <span style={{ fontSize: '11px', color: '#8bacc8' }}>{client.client_ref}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: `${statusColors[client.status] || '#8bacc8'}22`, color: statusColors[client.status] || '#8bacc8', border: `1px solid ${statusColors[client.status] || '#8bacc8'}44` }}>{client.status}</span>
                </div>
                {(client.email || client.phone) && <div style={{ fontSize: '12px', color: '#8bacc8', marginTop: '4px' }}>{client.email}{client.email && client.phone ? ' · ' : ''}{client.phone}</div>}
              </div>
              <span style={{ color: '#8bacc8', fontSize: '18px' }}>{expandedClient === client.id ? '▲' : '▼'}</span>
            </div>
            {expandedClient === client.id && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <MemberClientTrackView client={client} program={program} />
              </div>
            )}
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

  const statusColors = { Completed: '#27ae60', Confirmed: '#27ae60', Yes: '#27ae60', 'In Progress': '#f39c12', Scheduled: '#5b9fe6', No: '#e74c3c', 'N/A': '#8bacc8', Pending: '#f39c12' }
  const statusBg = { Completed: 'rgba(39,174,96,0.15)', Confirmed: 'rgba(39,174,96,0.15)', Yes: 'rgba(39,174,96,0.15)', 'In Progress': 'rgba(243,156,18,0.15)', Scheduled: 'rgba(91,159,230,0.15)', No: 'rgba(231,76,60,0.15)', 'N/A': 'rgba(139,172,200,0.15)', Pending: 'rgba(243,156,18,0.15)' }

  if (loading) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>Loading track...</div>
  if (phases.length === 0) return <div style={{ color: '#8bacc8', fontSize: '13px', padding: '16px' }}>No client track defined yet.</div>

  return (
    <div>
      {phases.map(phase => (
        <div key={phase.id} style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b9fe6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</div>
          {(phase.program_client_tasks || []).map(task => {
            const p = progress[task.id] || {}
            return (
              <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[p.status] || 'transparent', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '12px', color: '#8bacc8', marginRight: '6px' }}>{task.task_code}</span>
                  <span style={{ fontSize: '13px', color: '#fff' }}>{task.name}</span>
                </div>
                {p.status && (
                  <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '12px', background: statusBg[p.status] || 'rgba(255,255,255,0.08)', color: statusColors[p.status] || '#fff' }}>{p.status}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}