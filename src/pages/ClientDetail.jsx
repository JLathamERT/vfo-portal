import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getSession, callApi } from '../lib/api'

const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael', 'Bridger Silvester', 'Tracy Miller', 'Evan Anderson']
const statusColors = { Completed: '#27ae60', Confirmed: '#27ae60', Yes: '#27ae60', 'In Progress': '#f39c12', Scheduled: '#5b9fe6', No: '#e74c3c', 'N/A': '#8bacc8', Pending: '#f39c12' }

function ClientTabDropdown({ label, isActive, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)
  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { closeTimer.current = setTimeout(() => setOpen(false), 200) }
  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #5b9fe6' : '2px solid transparent', color: isActive ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: '#0d2a6e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', minWidth: '160px', zIndex: 200, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientDetail() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const session = getSession()
  console.log('session on client detail:', session)
  const [activeTab, setActiveTab] = useState('home')
  const [client, setClient] = useState(null)
  const [program, setProgram] = useState(null)
  const [contacts, setContacts] = useState([])
  const [specialists, setSpecialists] = useState([])
  const [loading, setLoading] = useState(true)

  // Back URL — prefer state passed via navigate, fallback to admin
  const isMember = location.pathname.startsWith('/member')
  const backUrl = location.state?.from || (isMember ? '/member' : '/admin')

  useEffect(() => {
    if (!session) { navigate('/admin/login'); return }
    loadData()
  }, [clientId])

  async function loadData() {
    setLoading(true)
    try {
      const [data, expertsData] = await Promise.all([
        callApi('msm_load_client_home', { client_id: parseInt(clientId) }),
        callApi('load_data'),
      ])
      setClient(data.client)
      setProgram(data.program)
      setContacts(data.contacts || [])
      setSpecialists(expertsData.experts || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function reloadContacts() {
    try {
      const data = await callApi('msm_load_client_home', { client_id: parseInt(clientId) })
      setContacts(data.contacts || [])
    } catch (err) { console.error(err) }
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const tabStyle = (active) => ({ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent', color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' })
  const statusColors2 = { active: '#27ae60', pending: '#f39c12', lost: '#e74c3c' }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#073991', color: '#fff', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#8bacc8' }}>Loading...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#073991', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#0a2260', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '20px', cursor: 'pointer' }} onClick={() => navigate(isMember ? '/member' : '/admin')}>VFO Portal</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#5b9fe6', fontSize: '14px' }}>{session?.name || ''}</span>
          <button onClick={() => { sessionStorage.clear(); navigate(isMember ? '/member/login' : '/admin/login') }} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#5b9fe6', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to Clients</button>

        {/* Client header */}
        <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: '#fff' }}>{client?.first_name} {client?.last_name}</div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#8bacc8', fontFamily: 'monospace' }}>{client?.client_ref}</span>
            {program && <span style={{ fontSize: '13px', color: '#5b9fe6' }}>{program.name}</span>}
            {client?.member_name && <span style={{ fontSize: '13px', color: '#8bacc8' }}>Member: {client.member_name}</span>}
            <span style={{ padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: `${statusColors2[client?.status] || '#8bacc8'}22`, color: statusColors2[client?.status] || '#8bacc8', border: `1px solid ${statusColors2[client?.status] || '#8bacc8'}44` }}>{client?.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : ''}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
          {isMember
            ? <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Profile</button>
            : <ClientTabDropdown label="Profile" isActive={activeTab === 'home' || activeTab === 'details'} options={[{key:'home',label:'Profile'},{key:'details',label:'Edit Profile'}]} onSelect={setActiveTab} />
          }
          {program?.name === 'Partnership Fast Track' ? (
            <button style={tabStyle(activeTab === 'pft')} onClick={() => setActiveTab('pft')}>PFT Engagement Process</button>
          ) : (
            <>
              <button style={tabStyle(activeTab === 'map1')} onClick={() => setActiveTab('map1')}>MAP 1</button>
              <button style={tabStyle(activeTab === 'regular')} onClick={() => setActiveTab('regular')}>Regular Priorities</button>
              <button style={tabStyle(activeTab === 'tax')} onClick={() => setActiveTab('tax')}>Tax Priorities</button>
            </>
          )}
        </div>

        {activeTab === 'home' && <ClientHome client={client} onUpdate={loadData} sectionStyle={sectionStyle} readOnly={isMember} />}
        {activeTab === 'details' && !isMember && <ClientDetails client={client} contacts={contacts} onUpdate={loadData} onReloadContacts={reloadContacts} sectionStyle={sectionStyle} />}
        {activeTab === 'map1' && program && <ClientTrackViewV2 clientId={parseInt(clientId)} programId={program.id} readOnly={isMember} />}
        {activeTab === 'pft' && program && <PFTEngagementTrack clientId={parseInt(clientId)} programId={program.id} readOnly={isMember} />}
        {activeTab === 'regular' && program && <RegularPrioritiesTab clientId={parseInt(clientId)} programId={program.id} client={client} specialists={specialists} readOnly={isMember} />}
        {activeTab === 'tax' && program && <TaxPrioritiesTab clientId={parseInt(clientId)} programId={program.id} specialists={specialists} readOnly={isMember} />}
      </div>
    </div>
  )
}

function ClientHome({ client, onUpdate, sectionStyle, readOnly = false }) {
  const [status, setStatus] = useState(client?.status || 'pending')
  const [saving, setSaving] = useState(false)
  const [assignedPf, setAssignedPf] = useState(client?.assigned_pf || '')
  const [savingPf, setSavingPf] = useState(false)
  const [pfSaved, setPfSaved] = useState(false)

  async function savePf() {
    setSavingPf(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: client.status, first_name: client.first_name, last_name: client.last_name, email: client.email, phone: client.phone, assigned_pf: assignedPf })
      setPfSaved(true)
      setTimeout(() => setPfSaved(false), 3000)
    } catch (err) { console.error(err) }
    finally { setSavingPf(false) }
  }
  const statusColors = { active: '#27ae60', pending: '#f39c12', lost: '#e74c3c' }

  async function updateStatus(newStatus) {
    setStatus(newStatus)
    setSaving(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: newStatus, first_name: client.first_name, last_name: client.last_name, email: client.email, phone: client.phone })
      onUpdate()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Client Status</div>
        {readOnly
          ? <span style={{ padding: '4px 14px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', background: `${statusColors[status]}22`, color: statusColors[status], border: `1px solid ${statusColors[status]}44` }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          : <div style={{ display: 'flex', gap: '8px' }}>
              {[['active','Active'], ['pending','Pending'], ['lost','Lost']].map(([val, label]) => (
                <button key={val} onClick={() => updateStatus(val)} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: `1px solid ${status === val ? statusColors[val] : 'rgba(255,255,255,0.2)'}`, background: status === val ? `${statusColors[val]}22` : 'transparent', color: status === val ? statusColors[val] : '#8bacc8', fontSize: '13px', cursor: 'pointer', fontWeight: status === val ? '600' : '400' }}>
                  {label}
                </button>
              ))}
            </div>
        }
      </div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Assigned PF</div>
        {readOnly
          ? <div style={{ fontSize: '14px', color: '#fff' }}>{client?.assigned_pf || '—'}</div>
          : <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <select value={assignedPf} onChange={e => setAssignedPf(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: '#0d2a6e', color: '#fff', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', minWidth: '200px' }}>
                <option value="">-- Select --</option>
                <option value="Evan Anderson">Evan Anderson</option>
                <option value="Bridger Silvester">Bridger Silvester</option>
              </select>
              <button onClick={savePf} disabled={savingPf} style={{ padding: '8px 20px', borderRadius: '8px', background: savingPf ? '#1a4a9e' : '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: savingPf ? 'not-allowed' : 'pointer' }}>{savingPf ? 'Saving...' : 'Save'}</button>
              {pfSaved && <span style={{ color: '#27ae60', fontSize: '14px', fontWeight: '600' }}>✓ Saved!</span>}
            </div>
        }
      </div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Contact Info</div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: '11px', color: '#8bacc8', marginBottom: '4px' }}>EMAIL</div><div style={{ fontSize: '14px', color: '#fff' }}>{client?.email || '—'}</div></div>
          <div><div style={{ fontSize: '11px', color: '#8bacc8', marginBottom: '4px' }}>PHONE</div><div style={{ fontSize: '14px', color: '#fff' }}>{client?.phone || '—'}</div></div>
        </div>
      </div>
    </div>
  )
}

function ClientDetails({ client, contacts, onUpdate, onReloadContacts, sectionStyle }) {
  const [firstName, setFirstName] = useState(client?.first_name || '')
  const [lastName, setLastName] = useState(client?.last_name || '')
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [contactStatus, setContactStatus] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }

  async function save() {
    setSaving(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: client.status, first_name: firstName, last_name: lastName, email, phone })
      setStatus('saved')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatus('error') }
    finally { setSaving(false) }
  }

  async function addContact() {
    if (!contactFirst || !contactLast) return
    try {
      await callApi('msm_add_client_contact', { client_id: client.id, first_name: contactFirst, last_name: contactLast, email: contactEmail })
      setContactFirst(''); setContactLast(''); setContactEmail(''); setShowAddContact(false)
      setContactStatus('saved')
      setTimeout(() => setContactStatus(''), 4000)
      onReloadContacts()
    } catch (err) { console.error(err) }
  }

  async function deleteContact(contactId) {
    try { await callApi('msm_delete_client_contact', { contact_id: contactId }); onReloadContacts() }
    catch (err) { console.error(err) }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Primary Contact</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#1a4a9e' : '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
          {status === 'saved' && <span style={{ color: '#27ae60', fontSize: '14px', fontWeight: '600' }}>✓ Changes saved</span>}
          {status === 'error' && <span style={{ color: '#e74c3c', fontSize: '14px' }}>Something went wrong</span>}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px' }}>Additional Contacts</div>
          <button onClick={() => setShowAddContact(!showAddContact)} style={{ padding: '6px 14px', borderRadius: '6px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>+ Add</button>
        </div>

        {showAddContact && (
          <div style={{ padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={contactFirst} onChange={e => setContactFirst(e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={contactLast} onChange={e => setContactLast(e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addContact} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setShowAddContact(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {contactStatus === 'saved' && <div style={{ color: '#27ae60', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>✓ Contact added</div>}
        {contacts.length === 0 && !showAddContact && <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No additional contacts yet.</p>}
        {contacts.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{c.first_name} {c.last_name}</div>
              {c.email && <div style={{ fontSize: '12px', color: '#8bacc8', marginTop: '2px' }}>{c.email}</div>}
            </div>
            <button onClick={() => deleteContact(c.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontSize: '11px', cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClientTrackView({ clientId, programId, sectionStyle }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [completedPhases, setCompletedPhases] = useState({})

  useEffect(() => { loadTrack() }, [clientId])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_client_track', { program_id: programId }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      setPhases(trackData.phases || [])
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function saveTask(taskId, status, completedDate, phaseId) {
    const today = new Date().toISOString().split('T')[0]
    const date = completedDate || (status ? today : null)
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status, completed_date: date || null, completed_by: null, notes: null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  async function saveDateChange(taskId, completedDate) {
    const p = progress[taskId] || {}
    setSaving(prev => ({ ...prev, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status: p.status, completed_date: completedDate || null, completed_by: null, notes: null })
      setProgress(prev => ({ ...prev, [taskId]: { ...prev[taskId], completed_date: completedDate } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [taskId]: false })) }
  }

  async function handlePhaseComplete(phase) {
    const today = new Date().toISOString().split('T')[0]
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options && t.status_options !== 'auto')
    setCompletedPhases(p => ({ ...p, [phase.id]: 'saving' }))
    try {
      await Promise.all(tasks.map(task => {
        const firstOption = task.status_options.split('|')[0]
        return callApi('msm_save_client_task', { client_id: clientId, task_id: task.id, status: firstOption, completed_date: today, completed_by: null, notes: null })
      }))
      const newProgress = { ...progress }
      tasks.forEach(task => {
        const firstOption = task.status_options.split('|')[0]
        newProgress[task.id] = { ...newProgress[task.id], task_id: task.id, status: firstOption, completed_date: today }
      })
      setProgress(newProgress)
      setCompletedPhases(p => ({ ...p, [phase.id]: 'done' }))
      setTimeout(() => setCompletedPhases(p => ({ ...p, [phase.id]: null })), 3000)
    } catch (err) { console.error(err); setCompletedPhases(p => ({ ...p, [phase.id]: null })) }
  }

  const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>
  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No client track defined yet.</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_client_tasks?.length || 0), 0)
  const completedTasks = Object.values(progress).filter(p => ['Completed','Confirmed','Yes'].includes(p.status)).length

  return (
    <div>
      

      {phases.map(phase => (
        <div key={phase.id} style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</div>
            {phase.name === 'MAP 1 - PIP 1' && (
              <MeetingCompleteButton phase={phase} progress={progress} onComplete={handlePhaseComplete} completedPhases={completedPhases} />
            )}
          </div>
          {(phase.program_client_tasks || []).map(task => {
            const p = progress[task.id] || {}
            return (
              <div key={task.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColors[p.status] || 'transparent', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1, minWidth: '150px' }}>
                  
                  <span style={{ fontSize: '14px', color: '#fff' }}>{task.name}</span>
                </div>
                {task.status_options === 'auto'
                  ? <span style={{ fontSize: '12px', color: '#27ae60', padding: '4px 10px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', border: '1px solid rgba(39,174,96,0.3)' }}>Auto-completed</span>
                  : task.name === 'PIP Follow-up meeting re-confirmation/declined email'
                  ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => saveTask(task.id, 'Send confirmation email', p.completed_date, phase.id)}
                        style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: p.status === 'Send confirmation email' ? 'rgba(39,174,96,0.15)' : 'rgba(91,159,230,0.15)', border: `1px solid ${p.status === 'Send confirmation email' ? 'rgba(39,174,96,0.4)' : 'rgba(91,159,230,0.4)'}`, color: p.status === 'Send confirmation email' ? '#27ae60' : '#5b9fe6' }}>
                        Re-confirm Meeting
                      </button>
                      <button onClick={() => saveTask(task.id, 'Send declined email', p.completed_date, phase.id)}
                        style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: p.status === 'Send declined email' ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${p.status === 'Send declined email' ? 'rgba(231,76,60,0.4)' : 'rgba(255,255,255,0.15)'}`, color: p.status === 'Send declined email' ? '#e74c3c' : '#8bacc8' }}>
                        Meeting Declined
                      </button>
                      {p.status && <span style={{ fontSize: '12px', color: '#8bacc8' }}>{p.completed_date}</span>}
                    </div>
                  : <>
                    <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, phase.id)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '160px' }}>
                      <option value="">-- Select --</option>
                      {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="date" value={p.completed_date || ''} onChange={e => saveDateChange(task.id, e.target.value)} style={{ ...inputStyle, width: '140px' }} />
                  </>
                }
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MeetingCompleteButton({ phase, progress, onComplete, completedPhases }) {
  const state = completedPhases[phase.id]
  const tasks = (phase.program_client_tasks || []).filter(t => t.status_options && t.status_options !== 'auto')
  const allDone = tasks.every(t => progress[t.id]?.status)

  if (allDone && state !== 'done') return null

  return (
    <button
      onClick={() => onComplete(phase)}
      disabled={state === 'saving'}
      style={{
        padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: state === 'saving' ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
        background: state === 'done' ? 'rgba(39,174,96,0.15)' : 'rgba(91,159,230,0.15)',
        border: `1px solid ${state === 'done' ? 'rgba(39,174,96,0.4)' : 'rgba(91,159,230,0.4)'}`,
        color: state === 'done' ? '#27ae60' : '#5b9fe6',
      }}>
      {state === 'saving' ? 'Saving...' : state === 'done' ? '✓ Meeting Completed' : '✓ Meeting Completed'}
    </button>
  )
}

const PIP_PRIORITIES = [
  { group: '— Business Advisory —', items: ['Business Growth', 'Business Exit', 'Business Advisory'] },
  { group: '— Tax —', items: ['Tax Planning (Income Tax Focus)', 'Tax Planning (Capital Gain Tax Focus)', 'Tax Planning (Retirement/Estate Tax Focus)', 'Tax Planning (Charitable/Gift Tax Focus)', 'Tax Planning (Business Tax Focus)', 'Tax Planning'] },
  { group: '— Risk Mitigation —', items: ['Long Term Sickness Concern', 'Living too Long Concern', 'Death Impacting Dependents Concern', 'Asset Protection (Personally Sued)', 'Loss of Key Person', 'Asset Protection (Business Sued)', 'Technology Advancements', 'Risk Mitigation'] },
  { group: '— Wealth Planning —', items: ['Wealth Planning (Short Term)', 'Wealth Planning (Long Term)', 'Wealth Planning (Short/Long Term)', 'Wealth Planning (Grow Wealth)', 'Wealth Planning (Retain Wealth)', 'Wealth Planning (Grow/Retain Wealth)', 'Wealth Planning (Young Kids Focus)', 'Wealth Planning (College Planning Focus)', 'Wealth Planning (Retirement Planning Focus)', 'Wealth Planning (Legacy Planning Focus)', 'Wealth Planning (Alternative Investments Focus)', 'Wealth Planning'] },
  { group: '— Legal —', items: ['Family Law', 'Trusts and Wills (Estate Planning)', 'Contract / Corporate Law', 'Structuring Entities', 'Buy / Sell Agreements', 'Joint Venture Agreements', 'Intellectual Property', 'Legal Focus'] },
]
 
function PIPDecisionForm({ task, clientId, saveTask, existingData, onSubmitted }) {
  const existing = existingData || {}
  const isViewMode = !!existingData
 
  const [decision, setDecision] = useState(existing.decision || '')
  const [currentPriorities, setCurrentPriorities] = useState(existing.currentPriorities || [])
  const [currentPriorityInput, setCurrentPriorityInput] = useState('')
  const [parkedPriorities, setParkedPriorities] = useState(existing.parkedPriorities || [])
  const [parkedPriorityInput, setParkedPriorityInput] = useState('')
  const [clientService, setClientService] = useState(existing.clientService || '')
  const [grossServiceValue, setGrossServiceValue] = useState(existing.grossServiceValue || '')
  const [memberContribution, setMemberContribution] = useState(existing.memberContribution || '')
  const netInvoiceValue = ((parseFloat(grossServiceValue) || 0) - (parseFloat(memberContribution) || 0)).toFixed(2)
  const [memberShare, setMemberShare] = useState(existing.memberShare || '')
  const [vfosShare, setVfosShare] = useState(existing.vfosShare || '')
  const [paymentPlan, setPaymentPlan] = useState(existing.paymentPlan || '')
  const [undecidedReasons, setUndecidedReasons] = useState(existing.undecidedReasons || [])
  const [liteCost, setLiteCost] = useState(existing.liteCost || '')
  const [coreCost, setCoreCost] = useState(existing.coreCost || '')
  const [maxCost, setMaxCost] = useState(existing.maxCost || '')
  const [maxNA, setMaxNA] = useState(existing.maxNA || false)
  const [ccRecipients, setCcRecipients] = useState(existing.ccRecipients || [])
  const [ccInput, setCcInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
 
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '16px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.06)' }
  const readOnlyInput = { ...inputStyle, opacity: 0.6, pointerEvents: 'none' }
 
  function addCc() {
    if (ccInput && ccInput.includes('@')) { setCcRecipients([...ccRecipients, ccInput]); setCcInput('') }
  }
  function removeCc(i) { if (!isViewMode) setCcRecipients(ccRecipients.filter((_, idx) => idx !== i)) }
  function addCurrentPriority() {
    if (currentPriorityInput && !currentPriorities.includes(currentPriorityInput)) { setCurrentPriorities([...currentPriorities, currentPriorityInput]); setCurrentPriorityInput('') }
  }
  function addParkedPriority() {
    if (parkedPriorityInput && !parkedPriorities.includes(parkedPriorityInput)) { setParkedPriorities([...parkedPriorities, parkedPriorityInput]); setParkedPriorityInput('') }
  }
  function toggleUndecidedReason(reason) {
    if (isViewMode) return
    setUndecidedReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason])
  }
 
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit() {
    if (!decision) return
    if (decision === 'Yes') {
      if (currentPriorities.length === 0) { setSubmitError('Please add at least one current priority'); return }
      if (!clientService) { setSubmitError('Please select a client service'); return }
      if (!grossServiceValue) { setSubmitError('Please enter gross service value'); return }
      if (!paymentPlan) { setSubmitError('Please select a payment plan'); return }
      const splitTotal = (parseFloat(memberShare) || 0) + (parseFloat(vfosShare) || 0)
      const netVal = parseFloat(netInvoiceValue) || 0
      if (Math.abs(splitTotal - netVal) > 0.01) {
        setSubmitError(`Revenue split ($${splitTotal.toFixed(2)}) must equal Net Invoice Value ($${netVal.toFixed(2)})`)
        return
      }
    }
    if (decision === 'Undecided') {
      if (undecidedReasons.length === 0) { setSubmitError('Please select at least one reason for being undecided'); return }
      if (currentPriorities.length === 0) { setSubmitError('Please add at least one current priority'); return }
      if (!liteCost) { setSubmitError('Please enter Lite cost'); return }
      if (!coreCost) { setSubmitError('Please enter Core cost'); return }
      if (!maxNA && !maxCost) { setSubmitError('Please enter Max cost or check N/A'); return }
    }
    setSubmitError('')
    setSubmitting(true)
    const formData = { decision, ccRecipients }
    if (decision === 'Yes') {
      formData.currentPriorities = currentPriorities
      formData.parkedPriorities = parkedPriorities
      formData.clientService = clientService
      formData.grossServiceValue = grossServiceValue
      formData.memberContribution = memberContribution
      formData.netInvoiceValue = netInvoiceValue.toString()
      formData.memberShare = memberShare
      formData.vfosShare = vfosShare
      formData.paymentPlan = paymentPlan
    } else if (decision === 'Undecided') {
      formData.undecidedReasons = undecidedReasons
      formData.currentPriorities = currentPriorities
      formData.parkedPriorities = parkedPriorities
      formData.liteCost = liteCost
      formData.coreCost = coreCost
      formData.maxCost = maxCost
      formData.maxNA = maxNA
    }
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: task.id, status: `Completed - ${decision}`, completed_date: new Date().toISOString().split('T')[0], completed_by: null, notes: JSON.stringify(formData) })
      if (onSubmitted) onSubmitted(`Completed - ${decision}`, formData)
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }
 
  const priorityDropdown = (value, onChange) => (
    <select value={value} onChange={onChange} style={{ ...inputStyle, background: '#0d2a6e', flex: 1 }}>
      <option value="">-- Select Priority --</option>
      {PIP_PRIORITIES.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map(item => <option key={item} value={item}>{item}</option>)}
        </optgroup>
      ))}
    </select>
  )
 
  const tagList = (items, onRemove) => items.map((item, i) => (
    <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', fontSize: '12px', marginRight: '6px', marginBottom: '4px' }}>
      {item}
      {!isViewMode && <span onClick={() => onRemove(i)} style={{ cursor: 'pointer', color: '#e74c3c', fontSize: '14px' }}>×</span>}
    </div>
  ))
 
  return (
    <div style={{ marginLeft: '18px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', marginTop: '4px', marginBottom: '8px' }}>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Client decision</label>
        {isViewMode
          ? <div style={{ ...inputStyle, opacity: 0.6 }}>{decision}</div>
          : <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
              <option value="">-- Select --</option>
              <option value="Yes">Yes</option>
              <option value="Undecided">Undecided</option>
              <option value="No">No</option>
            </select>
        }
      </div>
 
      {/* === YES FIELDS === */}
      {decision === 'Yes' && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Current priorities</label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                {priorityDropdown(currentPriorityInput, e => setCurrentPriorityInput(e.target.value))}
                <button onClick={addCurrentPriority} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {currentPriorities.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            <div>{tagList(currentPriorities, i => setCurrentPriorities(currentPriorities.filter((_, idx) => idx !== i)))}</div>
          </div>
 
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Parked priorities</label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                {priorityDropdown(parkedPriorityInput, e => setParkedPriorityInput(e.target.value))}
                <button onClick={addParkedPriority} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {parkedPriorities.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            <div>{tagList(parkedPriorities, i => setParkedPriorities(parkedPriorities.filter((_, idx) => idx !== i)))}</div>
          </div>
 
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Client service</label>
            {isViewMode
              ? <div style={readOnlyInput}>{clientService || '—'}</div>
              : <select value={clientService} onChange={e => setClientService(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  <option value="">-- Select --</option>
                  <option value="Lite">Lite</option>
                  <option value="Core">Core</option>
                  <option value="Max">Max</option>
                </select>
            }
          </div>
 
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Pricing</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Gross service value</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={grossServiceValue} onChange={e => setGrossServiceValue(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Member contribution <span style={{ textTransform: 'none', opacity: 0.6 }}>(if applicable)</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={memberContribution} onChange={e => setMemberContribution(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Net invoice value</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={isViewMode ? (existing.netInvoiceValue || '0.00') : netInvoiceValue} readOnly style={{ ...readOnlyInput, paddingLeft: '28px', background: 'rgba(39,174,96,0.08)', borderColor: 'rgba(39,174,96,0.2)' }} />
              </div>
            </div>
          </div>
 
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Revenue split</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Member share</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                  <input value={memberShare} onChange={e => setMemberShare(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>VFOS share</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                  <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
            </div>
          </div>
 
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Payment plan</label>
            {isViewMode
              ? <div style={readOnlyInput}>{paymentPlan || '—'}</div>
              : <select value={paymentPlan} onChange={e => setPaymentPlan(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  <option value="">-- Select --</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="1 Time Payment">1 Time Payment</option>
                </select>
            }
          </div>
        </>
      )}
 
      {/* === UNDECIDED FIELDS === */}
      {decision === 'Undecided' && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Reason for being undecided</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['Undecided whether to continue the process / unsure if would benefit from the service', 'Undecided on which service level to choose'].map(reason => (
                <label key={reason} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: isViewMode ? 'default' : 'pointer', fontSize: '13px', color: '#fff' }}>
                  <input type="checkbox" checked={undecidedReasons.includes(reason)} onChange={() => toggleUndecidedReason(reason)} disabled={isViewMode} style={{ marginTop: '3px', accentColor: '#5b9fe6' }} />
                  {reason}
                </label>
              ))}
            </div>
          </div>
 
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Current priorities</label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                {priorityDropdown(currentPriorityInput, e => setCurrentPriorityInput(e.target.value))}
                <button onClick={addCurrentPriority} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {currentPriorities.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            <div>{tagList(currentPriorities, i => setCurrentPriorities(currentPriorities.filter((_, idx) => idx !== i)))}</div>
          </div>
 
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Parked priorities</label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                {priorityDropdown(parkedPriorityInput, e => setParkedPriorityInput(e.target.value))}
                <button onClick={addParkedPriority} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {parkedPriorities.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            <div>{tagList(parkedPriorities, i => setParkedPriorities(parkedPriorities.filter((_, idx) => idx !== i)))}</div>
          </div>
 
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Membership options outlined</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: '#27ae60', fontWeight: '600', width: '40px' }}>Lite</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={liteCost} onChange={e => setLiteCost(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: '#5b9fe6', fontWeight: '600', width: '40px' }}>Core</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={coreCost} onChange={e => setCoreCost(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#f39c12', fontWeight: '600', width: '40px' }}>Max</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={maxNA ? '' : maxCost} onChange={e => setMaxCost(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px', opacity: maxNA ? 0.3 : 1 }} readOnly={isViewMode || maxNA} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8bacc8', cursor: isViewMode ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={maxNA} onChange={e => { if (!isViewMode) setMaxNA(e.target.checked) }} disabled={isViewMode} style={{ accentColor: '#5b9fe6' }} />
                N/A
              </label>
            </div>
          </div>
        </>
      )}
 
      {/* === SHARED FIELDS (all decisions) === */}
      {decision && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Additional CC recipients <span style={{ textTransform: 'none', opacity: 0.6 }}>(optional — these email addresses will be CC'd on all client emails)</span></label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input value={ccInput} onChange={e => setCcInput(e.target.value)} placeholder="Enter email address" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCc())} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={addCc} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {ccRecipients.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            {ccRecipients.map((email, i) => (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', fontSize: '12px', marginRight: '6px', marginBottom: '4px' }}>
                {email}
                {!isViewMode && <span onClick={() => removeCc(i)} style={{ cursor: 'pointer', color: '#e74c3c', fontSize: '14px' }}>×</span>}
              </div>
            ))}
          </div>
 
          {!isViewMode && (
            <>
              {submitError && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '8px' }}>{submitError}</div>}
              <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: submitting ? '#1a4a9e' : '#2563eb', border: 'none', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {submitting ? 'Submitting...' : 'Submit Outcome'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ClientTrackViewV2({ clientId, programId, readOnly = false }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [completedPhases, setCompletedPhases] = useState({})

  useEffect(() => { loadTrack() }, [clientId])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_client_track', { program_id: programId }),
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
        const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
        const allDone = tasks.length === 0 || tasks.every(t => prog[t.id]?.status)
        expandState[phase.id] = !allDone
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
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

  async function saveDate(taskId, date) {
    const p = progress[taskId] || {}
    setSaving(prev => ({ ...prev, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status: p.status, completed_date: date || null, completed_by: null, notes: null })
      setProgress(prev => ({ ...prev, [taskId]: { ...prev[taskId], completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [taskId]: false })) }
  }

  async function completePhase(phase) {
    const today = new Date().toISOString().split('T')[0]
    const autoCompleteCodes = {
          'MAP 1 - Initial Contact': ['Call outcome', 'PIP 1 scheduled', 'PIP Follow-Up scheduled'],
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

  const statusColors = { Completed: '#27ae60', Confirmed: '#27ae60', Yes: '#27ae60', 'Call arranged': '#27ae60', 'PIP 1 scheduled': '#27ae60', 'Follow-up scheduled': '#27ae60', 'PIP Follow-up confirmed': '#27ae60', 'Send confirmation email': '#27ae60', 'Sent confirmation email': '#27ae60', 'Regular priorities tab enabled': '#27ae60', 'Tax priorities tab enabled': '#27ae60', 'Completed + N/A': '#27ae60', 'Completed + Risk 1': '#27ae60', 'Completed + Risk 2': '#27ae60', 'Completed + Risk 3': '#27ae60', 'Completed + Risk 4': '#27ae60', 'Completed + Risk 5': '#27ae60', 'Lite': '#27ae60', 'Core': '#27ae60', 'Max': '#27ae60', 'In Progress': '#f39c12', Undecided: '#f39c12', 'No response': '#e74c3c', No: '#e74c3c', 'PIP Follow-up declined': '#e74c3c', 'Send declined email': '#e74c3c', 'Meeting declined': '#e74c3c', 'Completed - Yes': '#27ae60', 'Completed - No': '#e74c3c', 'Completed - Undecided': '#f39c12' }

  function getPhaseState(phase) {
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (tasks.length === 0) return 'done'
    if (tasks.every(t => progress[t.id]?.status)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  const inputStyle = { padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '12px', fontFamily: 'DM Sans, sans-serif' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>

  const totalTasks = phases.reduce((s, p) => s + (p.program_client_tasks || []).filter(t => t.status_options !== 'auto').length, 0)
  const completedTasks = phases.reduce((s, phase) => {
    return s + (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && progress[t.id]?.status && progress[t.id].status !== '').length
  }, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{completedTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>COMPLETED</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>{totalTasks}</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>TOTAL</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#27ae60' }}>{totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%</div><div style={{ fontSize: '11px', color: '#8bacc8' }}>PROGRESS</div></div>
      </div>

      {/* Phases */}
      {phases.map(phase => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        const doneTasks = nonAutoTasks.filter(t => progress[t.id]?.status && progress[t.id].status !== '').length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
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
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {/* Phase body */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                
{phase.name === 'MAP 1 - PC Admin' && (() => {
                  const pipDecisionTask = phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'PIP Follow Up decision')
                  const pipStatus = pipDecisionTask ? (progress[pipDecisionTask.id]?.status || '') : ''
                  const pipDecision = pipStatus.replace('Completed - ', '')

                  if (!pipStatus || !pipStatus.startsWith('Completed')) return (
                    <div style={{ padding: '12px', color: '#8bacc8', fontSize: '13px' }}>Waiting for PIP Follow Up decision</div>
                  )

                  const decisionColor = pipDecision === 'Yes' ? '#27ae60' : pipDecision === 'No' ? '#e74c3c' : '#f39c12'
                  const decisionLabel = pipDecision === 'Yes' ? 'Yes — proceeding' : pipDecision === 'No' ? 'No — declined' : 'Undecided — awaiting client'

                  const autoStep = (label) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span style={{ fontSize: '12px', color: '#8bacc8' }}>{label}</span>
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8', marginLeft: 'auto' }}>Not completed</span>
                    </div>
                  )

                  const yesSteps = [
                    'Engagement letter created',
                    'Engagement letter signed by client',
                    'Engagement letter signed by VFO Services',
                    'Take the payment due (and send confirmation email)',
                    'Create invoice (once money settled)',
                    'Email to client (invoice + next steps/priorities)',
                    'Revenue shares paid',
                    'Email member to confirm revenue share details',
                    'Email VFO-L & PPT',
                  ]

                  return (
                    <div style={{ padding: '8px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#8bacc8' }}>Decision:</span>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>
                      </div>

                      {pipDecision === 'No' && autoStep('Decline email sent to client')}

                      {pipDecision === 'Yes' && yesSteps.map((s, i) => <div key={i}>{autoStep(s)}</div>)}

                      {pipDecision === 'Undecided' && (
                        <>
                          {autoStep('Decision email sent')}
                          {autoStep('Client response received')}
                          <div style={{ marginLeft: '14px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                            <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px' }}>If Yes:</div>
                            {yesSteps.map((s, i) => <div key={`y${i}`}>{autoStep(s)}</div>)}
                            <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If No:</div>
                            {autoStep('Decline email sent to client')}
                            <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If extra meeting:</div>
                            {autoStep('Extra meeting held')}
                            {autoStep('PF submits outcome')}
                            <div style={{ marginLeft: '14px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                              <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px' }}>If Yes:</div>
                              {autoStep('PF completed pricing')}
                              {yesSteps.map((s, i) => <div key={`ey${i}`}>{autoStep(s)}</div>)}
                              <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If No:</div>
                              {autoStep('Decline email sent to client')}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}

                {phase.name !== 'MAP 1 - PC Admin' &&
                tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || '#8bacc8'

                  if (task.status_options === 'auto') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27ae60', flexShrink: 0 }} />
                      
                      <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>
                    </div>
                  )

                  // READ-ONLY MODE (member side)
                  if (readOnly) {
                    const isPCAdmin = phase.name === 'MAP 1 - PC Admin'
                    const c10Status2 = progress[phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'Client PIP decision')?.id]?.status || ''
                    const c14c15Active2 = c10Status2 === 'No' || c10Status2 === 'Undecided'
                    const isGreyedOut2 = isPCAdmin && (task.name === 'Email to Client if "Undecided" or "No" in C12' || task.name === 'Final client decision (if previously "Undecided" or "No")') && !c14c15Active2
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isGreyedOut2 ? 0.3 : 1 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                        
                        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                        {isDone
                          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                          : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
                        }
                        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                      </div>
                    )
                  }

                  if (task.name === 'PIP Follow-up meeting re-confirmation/declined email') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                        : <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => saveTask(task.id, 'Sent confirmation email', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Send re-confirmation email to client</button>
                            <button onClick={() => saveTask(task.id, 'Send declined email', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>Meeting declined - Email client</button>
                          </div>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#8bacc8' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (task.name === 'Call arranged with client') return (
                    <div key={task.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                        
                        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                        <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                          <option value="">-- Select --</option>
                          {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                      </div>
                      
                    </div>
                  )

                  const isPCAdmin = phase.name === 'MAP 1 - PC Admin'
                  const c10Status = progress[phases.find(ph => ph.name === 'MAP 1 - PIP Follow Up')?.program_client_tasks?.find(t => t.name === 'Client PIP decision')?.id]?.status || ''
                  const c14c15Active = c10Status === 'No' || c10Status === 'Undecided'
                  const isGreyedOut = isPCAdmin && (task.name === 'Email to Client if "Undecided" or "No" in C12' || task.name === 'Final client decision (if previously "Undecided" or "No")') && !c14c15Active

                  if (isPCAdmin) return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isGreyedOut ? 0.3 : 1 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: isDone ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)', color: isDone ? '#27ae60' : '#8bacc8', border: `1px solid ${isDone ? 'rgba(39,174,96,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
                        {isDone ? 'Completed' : 'Not completed'}
                      </span>
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (task.name === 'PIP Follow Up decision' && task.status_options === 'enter_details') {
                    if (readOnly && isDone) {
                      const dl = p.status.replace('Completed - ', '')
                      const dc = dl === 'Yes' ? '#27ae60' : dl === 'No' ? '#e74c3c' : '#f39c12'
                      return (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dc, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${dc}22`, color: dc, border: `1px solid ${dc}44` }}>{dl}</span>
                          {p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                        </div>
                      )
                    }
                    if (readOnly && !isDone) {
                      return (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.2)' }} />
                          <span style={{ fontSize: '13px', color: '#fff', flex: 1 }}>{task.name}</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
                        </div>
                      )
                    }
                    const dl = isDone ? p.status.replace('Completed - ', '') : ''
                    const dc = dl === 'Yes' ? '#27ae60' : dl === 'No' ? '#e74c3c' : dl === 'Undecided' ? '#f39c12' : '#8bacc8'
                    let formData = null
                    if (isDone) { try { formData = JSON.parse(p.notes || '{}') } catch(e) { formData = {} } }
                    const formExpandKey = `pipform_${task.id}`
                    const isFormShown = isDone ? expanded[formExpandKey] : true
                    return (
                      <div key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '7px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isDone ? 'pointer' : 'default' }} onClick={() => isDone && setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] }))}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? dc : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? dc : 'rgba(255,255,255,0.2)'}` }} />
                          <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
                          {isDone && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${dc}22`, color: dc, border: `1px solid ${dc}44` }}>{dl}</span>}
                          {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                          {isDone && <span style={{ color: '#8bacc8', fontSize: '10px', transform: isFormShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
                        </div>
                        {isFormShown && (
                          <PIPDecisionForm
                            task={task}
                            clientId={clientId}
                            saveTask={saveTask}
                            existingData={formData}
                            onSubmitted={(status, data) => {
                              setProgress(prev => ({ ...prev, [task.id]: { ...prev[task.id], task_id: task.id, status, completed_date: new Date().toISOString().split('T')[0], notes: JSON.stringify(data) } }))
                            }}
                          />
                        )}
                      </div>
                    )
                  }
                    

                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                        <option value="">-- Select --</option>
                        {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
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

function RegularPrioritiesTab({ clientId, programId, client, specialists, readOnly = false }) {
  const [priorityTracks, setPriorityTracks] = useState([])
  const [phases, setPhases] = useState([])
  const [allProgress, setAllProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newPriority, setNewPriority] = useState('')
  const [newSpecialist, setNewSpecialist] = useState('')
  const [addStatus, setAddStatus] = useState('')
  const [regularEnabled, setRegularEnabled] = useState(false)

  useEffect(() => { loadData() }, [clientId])

  async function loadData() {
    setLoading(true)
    try {
      const [tracksData, phasesData, map1Progress] = await Promise.all([
        callApi('msm_load_priority_tracks', { client_id: clientId }),
        callApi('msm_load_regular_phases', { program_id: programId }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      setPriorityTracks(tracksData.tracks || [])
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
    try {
      await callApi('msm_add_priority_track', { client_id: clientId, priority_name: newPriority, track_type: 'regular', specialist_name: newSpecialist })
      setNewPriority(''); setNewSpecialist(''); setShowAdd(false); setAddStatus('')
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

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const stateColors = { 'not started': '#8bacc8', 'in progress': '#5b9fe6', 'completed': '#27ae60' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>

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
      />
    )
  }

  return (
    <div>
      {!regularEnabled && (
        <div style={{ ...sectionStyle, borderColor: 'rgba(231,76,60,0.3)', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '15px', color: '#8bacc8' }}>Regular Priorities is not yet enabled for this client.</div>
          <div style={{ fontSize: '13px', color: '#5a8ab5', marginTop: '8px' }}>Set C25 to "Regular priorities tab enabled" in MAP 1 first.</div>
        </div>
      )}

      {regularEnabled && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px' }}>{priorityTracks.length} {priorityTracks.length === 1 ? 'Priority' : 'Priorities'}</div>
            {!readOnly && <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Add Priority</button>}
          </div>

          {showAdd && (
            <div style={{ ...sectionStyle, marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Regular Priority</div>
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e', marginBottom: '12px' }}>
                <option value="">-- Select Priority --</option>
                {REGULAR_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={newSpecialist} onChange={e => setNewSpecialist(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e', marginBottom: '12px' }}>
                <option value="">-- Select Specialist --</option>
                {specialists.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addPriority} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Add</button>
                <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              </div>
              {addStatus && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
            </div>
          )}

          {priorityTracks.length === 0 && !showAdd && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No priorities added yet.</div>
          )}

          {priorityTracks.map(track => {
            const state = getTrackState(track)
            const stateColor = stateColors[state]
            return (
              <div key={track.id} onClick={() => setSelectedTrack(track)}
                style={{ ...sectionStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.12)'}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{track.priority_name}{track.specialist_name ? ` (${track.specialist_name})` : ''}</div>
                  <div style={{ fontSize: '12px', color: '#8bacc8' }}>{new Date(track.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: track.status === 'stopped' ? 'rgba(231,76,60,0.15)' : 'rgba(39,174,96,0.15)', color: track.status === 'stopped' ? '#e74c3c' : '#27ae60', border: `1px solid ${track.status === 'stopped' ? 'rgba(231,76,60,0.3)' : 'rgba(39,174,96,0.3)'}` }}>{track.status === 'stopped' ? 'Stopped' : 'Live'}</span>
                  {track.status !== 'stopped' && <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44`, textTransform: 'capitalize' }}>{state}</span>}
                  <span style={{ color: '#5b9fe6', fontSize: '13px' }}>View →</span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function PriorityTrackView({ track, phases, progress, specialists, onBack, onProgressChange, readOnly = false, onTrackUpdate }) {
  const [localProgress, setLocalProgress] = useState(() => {
    // Auto-fill C25.1 with track's specialist if not already set
    if (track.specialist_name) {
      const c251Task = phases.flatMap(p => p.program_client_tasks || []).find(t => t.name === 'Allocate to VFO Specialist')
      if (c251Task && !progress[c251Task.id]?.status) {
        return { ...progress, [c251Task.id]: { ...progress[c251Task.id], task_id: c251Task.id, status: track.specialist_name } }
      }
    }
    return progress
  })
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
      const allDone = tasks.length > 0 && tasks.every(t => localProgress[t.id]?.status)
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

  async function saveDate(taskId, date) {
    const p = localProgress[taskId] || {}
    setSaving(prev => ({ ...prev, [taskId]: true }))
    try {
      await callApi('msm_save_priority_task', { priority_track_id: track.id, task_id: taskId, status: p.status, completed_date: date || null })
      setLocalProgress(prev => ({ ...prev, [taskId]: { ...prev[taskId], completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [taskId]: false })) }
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

  const statusColors = { Completed: '#27ae60', Yes: '#27ae60', 'No additional info required': '#27ae60', 'MAP 4 scheduled': '#27ae60', 'MAP 4 Scheduled': '#27ae60', No: '#e74c3c', 'Additional info required': '#27ae60' }
  const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }

  function getPhaseState(phase) {
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
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

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  const totalTasks = phases.reduce((s, p) => s + (p.program_client_tasks || []).filter(t => t.status_options !== 'auto').length, 0)
  const completedTasks = phases.reduce((s, phase) => s + (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && localProgress[t.id]?.status).length, 0)

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#5b9fe6', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to Priorities</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff' }}>{track.priority_name}{track.specialist_name ? ` (${track.specialist_name})` : ''}</div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: trackStatus === 'live' ? '#27ae60' : '#e74c3c', fontWeight: '600' }}>{trackStatus === 'live' ? 'Live' : 'Stopped'}</span>
            <div onClick={() => !togglingStatus && toggleTrackStatus()}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: trackStatus === 'live' ? '#27ae60' : '#e74c3c', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: trackStatus === 'live' ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      </div>


      {phases.map(phase => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        const doneTasks = nonAutoTasks.filter(t => localProgress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
        const showCompleteBtn = false
        const phaseCompleteState = completedPhases[phase.id]

        return (
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {showCompleteBtn && (
                  <button onClick={e => { e.stopPropagation(); completePhase(phase) }} disabled={phaseCompleteState === 'saving'}
                    style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: phaseCompleteState === 'done' ? 'rgba(39,174,96,0.15)' : 'rgba(91,159,230,0.15)', border: `1px solid ${phaseCompleteState === 'done' ? 'rgba(39,174,96,0.4)' : 'rgba(91,159,230,0.4)'}`, color: phaseCompleteState === 'done' ? '#27ae60' : '#5b9fe6', whiteSpace: 'nowrap' }}>
                    {phaseCompleteState === 'saving' ? 'Saving...' : '✓ Auto complete — all completed and confirmed'}
                  </button>
                )}
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => {
                  const p = localProgress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = statusColors[p.status] || '#8bacc8'

                  if (task.status_options === 'auto') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: isDone ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)', color: isDone ? '#27ae60' : '#8bacc8', border: `1px solid ${isDone ? 'rgba(39,174,96,0.3)' : 'rgba(255,255,255,0.1)'}` }}>{isDone ? 'Completed' : 'Not completed'}</span>
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (readOnly) return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                        : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
                      }
                      {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                    </div>
                  )

                  if (task.status_options === 'specialist_select') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '200px', color: isDone ? '#27ae60' : '#fff', borderColor: isDone ? 'rgba(39,174,96,0.4)' : 'rgba(255,255,255,0.15)' }}>
                        <option value="">-- Select Specialist --</option>
                        {specialists.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                    </div>
                  )

                  if (task.status_options === 'enter_details') return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      {isDone
                        ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Completed</span>
                        : <button onClick={() => saveTask(task.id, 'Completed', p.completed_date)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(91,159,230,0.4)', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6' }}>Enter details</button>
                      }
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                    </div>
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
                      <div key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                          <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                          <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                            <option value="">-- Select --</option>
                            {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
                        </div>
                        <div style={{ marginLeft: '18px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '12px', paddingBottom: '4px', opacity: greyed ? 0.3 : 1, pointerEvents: greyed ? 'none' : 'auto' }}>
                          {childTasks.map(ct => {
                            const cp = localProgress[ct.id] || {}
                            const cDone = !!cp.status
                            const cColor = statusColors[cp.status] || '#8bacc8'
                            return (
                              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cDone ? cColor : 'transparent', flexShrink: 0, border: `1px solid ${cDone ? cColor : 'rgba(255,255,255,0.2)'}` }} />
                                <span style={{ fontSize: '12px', color: cDone ? '#8bacc8' : '#fff', flex: 1 }}>{ct.name}</span>
                                <select value={cp.status || ''} onChange={e => saveTask(ct.id, e.target.value, cp.completed_date)} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '120px', fontSize: '11px', borderColor: cDone ? `${cColor}66` : 'rgba(255,255,255,0.15)', color: cDone ? cColor : '#fff' }}>
                                  <option value="">-- Select --</option>
                                  {(ct.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input type="date" value={cp.completed_date || ''} onChange={e => saveDate(ct.id, e.target.value)} style={{ ...inputStyle, width: '120px', fontSize: '11px' }} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  const isGreyedOut = false
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', opacity: isGreyedOut ? 0.3 : 1, pointerEvents: isGreyedOut ? 'none' : 'auto' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                        <option value="">-- Select --</option>
                        {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
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

function PFTEngagementTrack({ clientId, programId, readOnly = false }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})

  useEffect(() => { loadTrack() }, [clientId])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        callApi('msm_load_client_track', { program_id: programId, track_type: 'partnership_fast_track' }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)

      const expandState = {}
      loadedPhases.forEach(phase => {
        const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && !t.status_options?.startsWith('auto_') && t.name !== 'Set Up accountant on tracker')
        const allDone = tasks.length === 0 || tasks.every(t => prog[t.id]?.status)
        expandState[phase.id] = !allDone
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
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

  async function saveDate(taskId, date) {
    const p = progress[taskId] || {}
    setSaving(prev => ({ ...prev, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: clientId, task_id: taskId, status: p.status, completed_date: date || null, completed_by: null, notes: null })
      setProgress(prev => ({ ...prev, [taskId]: { ...prev[taskId], completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [taskId]: false })) }
  }

  function getA11Status() {
    const allTasks = phases.flatMap(p => p.program_client_tasks || [])
    const a8 = allTasks.find(t => t.name === 'Right clients?')
    const a9 = allTasks.find(t => t.name === 'Right client relationships?')
    const a10 = allTasks.find(t => t.name === 'Right attitude (to change)?')
    if (!a8 || !a9 || !a10) return null
    const v8 = progress[a8.id]?.status
    const v9 = progress[a9.id]?.status
    const v10 = progress[a10.id]?.status
    if (!v8 || !v9 || !v10) return null
    if (v10 === 'No') return 'No'
    if ([v8, v9, v10].filter(v => v === 'Yes').length >= 2) return 'Yes'
    return 'No'
  }

  function getPhaseState(phase) {
    const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto' && !t.status_options?.startsWith('auto_') && t.name !== 'Set Up accountant on tracker')
    if (tasks.length === 0) return 'done'
    if (tasks.every(t => progress[t.id]?.status)) return 'done'
    if (tasks.some(t => progress[t.id]?.status)) return 'active'
    return 'pending'
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  const pftStatusColors = { Complete: '#27ae60', 'Complete - Yes': '#27ae60', 'Complete - No': '#e74c3c', Yes: '#27ae60', No: '#e74c3c', Undecided: '#f39c12', New: '#5b9fe6', 'Re-Set': '#f39c12', 'VFO FT': '#27ae60', 'VFO Associate': '#5b9fe6', Stopped: '#e74c3c' }
  const inputStyle = { padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '12px', fontFamily: 'DM Sans, sans-serif' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>

  const a23Task = phases.flatMap(p => p.program_client_tasks || []).find(t => t.name === 'Accountant decision')
  const a23Status = a23Task ? progress[a23Task.id]?.status : null

  return (
    <div>
      {phases.map(phase => {
        // Phase 6 visibility based on A23
        const isAssociatePhase = phase.name.includes('VFO-Associate')
        const isFTPhase = phase.name.includes('VFO-FT Accountant')
        const phaseGreyedOut = (isAssociatePhase && a23Status && a23Status !== 'VFO Associate') || (isFTPhase && a23Status && a23Status !== 'VFO FT')

        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto' && !t.status_options?.startsWith('auto_'))
        const doneTasks = nonAutoTasks.filter(t => progress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'

        return (
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden', opacity: phaseGreyedOut ? 0.3 : 1, pointerEvents: phaseGreyedOut ? 'none' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => {
                  const p = progress[task.id] || {}
                  const isDone = !!p.status
                  const statusColor = pftStatusColors[p.status] || '#8bacc8'

                  // A11 auto-calculated
                  if (task.status_options === 'auto_pft_a11') {
                    const a11Val = getA11Status()
                    const a11Color = a11Val === 'Yes' ? '#27ae60' : a11Val === 'No' ? '#e74c3c' : '#8bacc8'
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a11Val ? a11Color : 'transparent', flexShrink: 0, border: `1.5px solid ${a11Val ? a11Color : 'rgba(255,255,255,0.2)'}` }} />
                        
                        <span style={{ fontSize: '13px', color: '#fff', flex: 1 }}>{task.name}</span>
                        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: `${a11Color}22`, color: a11Color, border: `1px solid ${a11Color}44`, fontWeight: '600' }}>{a11Val || 'Pending'}</span>
                      </div>
                    )
                  }

                  // A1 auto-complete
                  if (task.name === 'Set Up accountant on tracker') {
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27ae60', flexShrink: 0 }} />
                        
                        <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>
                      </div>
                    )
                  }

                  // Read-only mode
                  if (readOnly) {
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                        
                        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                        {isDone
                          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
                          : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
                        }
                        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
                      </div>
                    )
                  }

                  

                  // Normal editable task
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
                      
                      <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date)} disabled={saving[task.id]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
                        <option value="">-- Select --</option>
                        {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value)} style={{ ...inputStyle, width: '130px' }} />
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

function TaxPrioritiesTab({ clientId, programId, specialists, readOnly = false }) {
  const [taxPlans, setTaxPlans] = useState([])
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [allProgress, setAllProgress] = useState({})
 
  useEffect(() => { loadData() }, [clientId])
 
  async function loadData() {
    setLoading(true)
    try {
      const [plansData, phasesData, map1Progress] = await Promise.all([
        callApi('tax_load_plans', { client_id: clientId }),
        callApi('msm_load_client_track', { program_id: programId, track_type: 'tax' }),
        callApi('msm_load_client_progress', { client_id: clientId }),
      ])
      setTaxPlans(plansData.plans || [])
      const loadedPhases = phasesData.phases || []
      loadedPhases.forEach(p => p.program_client_tasks?.sort((a, b) => a.task_order - b.task_order))
      setPhases(loadedPhases)
 
      const enabled = (map1Progress.progress || []).some(p => p.status === 'Tax priorities tab enabled')
      setTaxEnabled(enabled)
 
      // Load progress for all plans
      const progressMap = {}
      await Promise.all((plansData.plans || []).map(async plan => {
        const pd = await callApi('tax_load_progress', { tax_plan_id: plan.id })
        progressMap[plan.id] = {}
        ;(pd.progress || []).forEach(p => {
          const key = p.tax_specialist_id ? `${p.task_id}_${p.tax_specialist_id}` : p.task_id
          progressMap[plan.id][key] = p
        })
      }))
      setAllProgress(progressMap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
 
  async function startPlan() {
    try {
      await callApi('tax_start_plan', { client_id: clientId })
      loadData()
    } catch (err) { console.error(err) }
  }
 
  function getPlanState(plan) {
    const prog = allProgress[plan.id] || {}
    const allTasks = phases.filter(p => p.name !== 'Tax 5 - Education & DD (Specialist Allocation)' && p.name !== 'Tax 5 - Education & DD (Post Allocation)').flatMap(p => p.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    if (allTasks.length === 0) return 'not started'
    if (allTasks.every(t => prog[t.id]?.status)) return 'completed'
    if (allTasks.some(t => prog[t.id]?.status)) return 'in progress'
    return 'not started'
  }
 
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }
  const stateColors = { 'not started': '#8bacc8', 'in progress': '#5b9fe6', 'completed': '#27ae60' }
 
  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading...</div>
 
  if (selectedPlan) {
    return (
      <TaxPlanTrackView
        plan={selectedPlan}
        phases={phases}
        progress={allProgress[selectedPlan.id] || {}}
        specialists={specialists}
        onBack={() => { setSelectedPlan(null); loadData() }}
        readOnly={readOnly}
      />
    )
  }
 
  return (
    <div>
      {!taxEnabled && (
        <div style={{ ...sectionStyle, borderColor: 'rgba(231,76,60,0.3)', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '15px', color: '#8bacc8' }}>Tax Priorities is not yet enabled for this client.</div>
          <div style={{ fontSize: '13px', color: '#5a8ab5', marginTop: '8px' }}>Set C26 to "Tax priorities tab enabled" in MAP 1 first.</div>
        </div>
      )}
 
      {taxEnabled && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px' }}>{taxPlans.length} {taxPlans.length === 1 ? 'Tax Plan' : 'Tax Plans'}</div>
            {!readOnly && <button onClick={startPlan} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Start Tax Plan</button>}
          </div>
 
          {taxPlans.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8bacc8' }}>No tax plans started yet.</div>
          )}
 
          {taxPlans.map(plan => {
            const state = getPlanState(plan)
            const stateColor = stateColors[state]
            return (
              <div key={plan.id} onClick={() => setSelectedPlan(plan)}
                style={{ ...sectionStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.12)'}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>Tax Plan</div>
                  <div style={{ fontSize: '12px', color: '#8bacc8' }}>{plan.created_at?.split('T')[0]}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: plan.status === 'stopped' ? 'rgba(231,76,60,0.15)' : 'rgba(39,174,96,0.15)', color: plan.status === 'stopped' ? '#e74c3c' : '#27ae60', border: `1px solid ${plan.status === 'stopped' ? 'rgba(231,76,60,0.3)' : 'rgba(39,174,96,0.3)'}` }}>{plan.status === 'stopped' ? 'Stopped' : 'Live'}</span>
                  {plan.status !== 'stopped' && <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44`, textTransform: 'capitalize' }}>{state}</span>}
                  <span style={{ color: '#5b9fe6', fontSize: '13px' }}>View →</span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function TaxDecisionForm({ task, plan, saveTask, taxSpecialistId, existingData, onSubmitted }) {
  const existing = existingData || {}
  const isViewMode = !!existingData
  
  const [decision, setDecision] = useState(existing.decision || '')
  const [taxRiskMindset, setTaxRiskMindset] = useState(existing.taxRiskMindset || '')
  const [retainerPayment, setRetainerPayment] = useState(existing.retainerPayment || '')
  const [implementationFee, setImplementationFee] = useState(existing.implementationFee || '')
  const [splitType, setSplitType] = useState(existing.splitType || '')
  const [memberShare, setMemberShare] = useState(existing.memberShare || '')
  const [vfosShare, setVfosShare] = useState(existing.vfosShare || '')
  const [potentialTaxSavings, setPotentialTaxSavings] = useState(existing.potentialTaxSavings || '')
  const [initialRetainer, setInitialRetainer] = useState(existing.initialRetainer || '')
  const [ccRecipients, setCcRecipients] = useState(existing.ccRecipients || [])
  const [ccInput, setCcInput] = useState('')
  const [presentationLink, setPresentationLink] = useState(existing.presentationLink || '')
  const [meetingNotes, setMeetingNotes] = useState(existing.meetingNotes || '')
  const [submitting, setSubmitting] = useState(false)
 
  const totalFee = (parseFloat(retainerPayment) || 0) + (parseFloat(implementationFee) || 0)
 
  // Auto-calc split when splitType changes
  useEffect(() => {
    if (isViewMode) return
    if (splitType === '1/3 Member, 2/3 VFOS') {
      const ms = (totalFee / 3).toFixed(2)
      const vs = (totalFee - parseFloat(ms)).toFixed(2)
      setMemberShare(ms)
      setVfosShare(vs)
    } else if (splitType === '50/50') {
      const half = (totalFee / 2).toFixed(2)
      setMemberShare(half)
      setVfosShare(half)
    }
  }, [splitType, totalFee])
 
  // For custom split, balance the other field
  function handleMemberShareChange(val) {
    setMemberShare(val)
    if (splitType === 'Custom') {
      const remaining = (totalFee - (parseFloat(val) || 0)).toFixed(2)
      setVfosShare(remaining >= 0 ? remaining : '0.00')
    }
  }
  function handleVfosShareChange(val) {
    setVfosShare(val)
    if (splitType === 'Custom') {
      const remaining = (totalFee - (parseFloat(val) || 0)).toFixed(2)
      setMemberShare(remaining >= 0 ? remaining : '0.00')
    }
  }
 
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '16px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.06)' }
  const readOnlyInput = { ...inputStyle, opacity: 0.6, pointerEvents: 'none' }
 
  function addCc() {
    if (ccInput && ccInput.includes('@')) {
      setCcRecipients([...ccRecipients, ccInput])
      setCcInput('')
    }
  }
 
  function removeCc(i) {
    if (isViewMode) return
    setCcRecipients(ccRecipients.filter((_, idx) => idx !== i))
  }
 
  async function handleSubmit() {
    if (!decision) return
    setSubmitting(true)
    const formData = { decision, presentationLink, meetingNotes, ccRecipients }
    if (decision === 'Yes') {
      formData.taxRiskMindset = taxRiskMindset
      formData.retainerPayment = retainerPayment
      formData.implementationFee = implementationFee
      formData.totalFee = totalFee.toFixed(2)
      formData.splitType = splitType
      formData.memberShare = memberShare
      formData.vfosShare = vfosShare
    } else if (decision === 'Undecided') {
      formData.potentialTaxSavings = potentialTaxSavings
      formData.initialRetainer = initialRetainer
    }
    try {
      await callApi('tax_save_task', {
        tax_plan_id: plan.id,
        task_id: task.id,
        status: `Completed - ${decision}`,
        completed_date: new Date().toISOString().split('T')[0],
        notes: JSON.stringify(formData),
        tax_specialist_id: taxSpecialistId || null
      })
      if (onSubmitted) onSubmitted(`Completed - ${decision}`, formData)
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }
 
  const riskOptions = [
    'Yes – Risk 1 – Very Conservative Mindset',
    'Yes – Risk 2 - Moderately Conservative Mindset',
    'Yes – Risk 3 – Average Risk Mindset',
    'Yes – Risk 4 – Moderately Aggressive Mindset',
    'Yes – Risk 5 – Very Aggressive Mindset',
  ]
 
  const splitOptions = ['1/3 Member, 2/3 VFOS', '50/50', 'Custom']
  const isCustomSplit = splitType === 'Custom'
  const isPresetSplit = splitType && !isCustomSplit
 
  return (
    <div style={{ marginLeft: '18px', padding: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', marginTop: '4px', marginBottom: '8px' }}>
      {/* Decision dropdown */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Client decision</label>
        {isViewMode
          ? <div style={{ ...inputStyle, opacity: 0.6 }}>{decision}</div>
          : <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
              <option value="">-- Select --</option>
              <option value="Yes">Yes</option>
              <option value="Undecided">Undecided</option>
              <option value="No">No</option>
            </select>
        }
      </div>
 
      {/* === YES FIELDS === */}
      {decision === 'Yes' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Tax risk mindset</label>
            {isViewMode
              ? <div style={readOnlyInput}>{taxRiskMindset || '—'}</div>
              : <select value={taxRiskMindset} onChange={e => setTaxRiskMindset(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  <option value="">-- Select --</option>
                  {riskOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            }
          </div>
 
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Fee details</div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Retainer payment</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                  <input value={retainerPayment} onChange={e => setRetainerPayment(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Implementation fee</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                  <input value={implementationFee} onChange={e => setImplementationFee(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Total fee</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={isViewMode ? (existing.totalFee || '0.00') : totalFee.toFixed(2)} readOnly style={{ ...readOnlyInput, paddingLeft: '28px', background: 'rgba(39,174,96,0.08)', borderColor: 'rgba(39,174,96,0.2)' }} />
              </div>
            </div>
          </div>
 
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Revenue split</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Split type</label>
              {isViewMode
                ? <div style={readOnlyInput}>{splitType || '—'}</div>
                : <select value={splitType} onChange={e => setSplitType(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                    <option value="">-- Select --</option>
                    {splitOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
              }
            </div>
            {splitType && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={labelStyle}>Member share</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                    <input value={memberShare} onChange={e => handleMemberShareChange(e.target.value)} placeholder="0.00" readOnly={isViewMode || isPresetSplit} style={{ ...(isViewMode || isPresetSplit ? readOnlyInput : inputStyle), paddingLeft: '28px' }} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={labelStyle}>VFOS share</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                    <input value={vfosShare} onChange={e => handleVfosShareChange(e.target.value)} placeholder="0.00" readOnly={isViewMode || isPresetSplit} style={{ ...(isViewMode || isPresetSplit ? readOnlyInput : inputStyle), paddingLeft: '28px' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
 
      {/* === UNDECIDED FIELDS === */}
      {decision === 'Undecided' && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Meeting figures</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>Potential tax savings</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={potentialTaxSavings} onChange={e => setPotentialTaxSavings(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={labelStyle}>Initial retainer</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8bacc8', fontSize: '14px' }}>$</span>
                <input value={initialRetainer} onChange={e => setInitialRetainer(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
          </div>
        </div>
      )}
 
      {/* === SHARED FIELDS (all decisions) === */}
      {decision && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Additional CC recipients <span style={{ textTransform: 'none', opacity: 0.6 }}>(optional)</span></label>
            {!isViewMode && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input value={ccInput} onChange={e => setCcInput(e.target.value)} placeholder="email@example.com" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCc())} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={addCc} style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            )}
            {ccRecipients.length === 0 && isViewMode && <div style={{ fontSize: '13px', color: '#5a8ab5' }}>None</div>}
            {ccRecipients.map((email, i) => (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', fontSize: '12px', marginRight: '6px', marginBottom: '4px' }}>
                {email}
                {!isViewMode && <span onClick={() => removeCc(i)} style={{ cursor: 'pointer', color: '#e74c3c', fontSize: '14px' }}>x</span>}
              </div>
            ))}
          </div>
 
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Presentation link</label>
            <input value={presentationLink} onChange={e => setPresentationLink(e.target.value)} placeholder="Paste Google Drive link to presentation..." style={isViewMode ? readOnlyInput : inputStyle} readOnly={isViewMode} />
            {!isViewMode && <div style={{ fontSize: '11px', color: '#5a8ab5', marginTop: '4px' }}>Export your presentation slides as a PDF, upload to Google Drive, then set sharing to "Anyone with the link can view" and paste the link here</div>}
          </div>
 
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Meeting notes</label>
            <textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} placeholder="Enter any additional notes from the meeting..." rows={4} style={isViewMode ? { ...readOnlyInput, resize: 'none' } : { ...inputStyle, resize: 'vertical' }} readOnly={isViewMode} />
          </div>
 
          {!isViewMode && (
            <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: submitting ? '#1a4a9e' : '#2563eb', border: 'none', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              {submitting ? 'Submitting...' : 'Submit Outcome'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
 
function TaxPlanTrackView({ plan, phases, progress: initialProgress, specialists, onBack, readOnly = false }) {
  const [localProgress, setLocalProgress] = useState(initialProgress)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [taxSpecialists, setTaxSpecialists] = useState([])
  const [specProgress, setSpecProgress] = useState({})
  const [showAddSpec, setShowAddSpec] = useState(false)
  const [newSpecId, setNewSpecId] = useState('')
  const [loadingSpecs, setLoadingSpecs] = useState(true)
 
  useEffect(() => {
    const expandState = {}
    phases.forEach(phase => {
      if (phase.name === 'Tax 5 - Education & DD (Specialist Allocation)' || phase.name === 'Tax 5 - Education & DD (Post Allocation)') return
      const tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
      const allDone = tasks.length > 0 && tasks.every(t => localProgress[t.id]?.status)
      expandState[phase.id] = !allDone
    })
    setExpanded(expandState)
    loadSpecialists()
  }, [])
 
  async function loadSpecialists() {
    setLoadingSpecs(true)
    try {
      const [specData, progData] = await Promise.all([
        callApi('tax_load_specialists', { tax_plan_id: plan.id }),
        callApi('tax_load_progress', { tax_plan_id: plan.id }),
      ])
      setTaxSpecialists(specData.specialists || [])
 
      // Rebuild full progress map
      const prog = {}
      ;(progData.progress || []).forEach(p => {
        const key = p.tax_specialist_id ? `${p.task_id}_${p.tax_specialist_id}` : p.task_id
        prog[key] = p
      })
      setLocalProgress(prog)
    } catch (err) { console.error(err) }
    finally { setLoadingSpecs(false) }
  }
 
  async function addSpecialist() {
    if (!newSpecId) return
    const expert = specialists.find(s => s.id === parseInt(newSpecId))
    if (!expert) return
    try {
      await callApi('tax_add_specialist', { tax_plan_id: plan.id, expert_id: expert.id, specialist_name: expert.name })
      setNewSpecId('')
      setShowAddSpec(false)
      loadSpecialists()
    } catch (err) { console.error(err) }
  }
 
  async function saveTask(taskId, status, existingDate, taxSpecialistId = null) {
    const today = new Date().toISOString().split('T')[0]
    const date = existingDate || (status ? today : null)
    const key = taxSpecialistId ? `${taskId}_${taxSpecialistId}` : taskId
    setSaving(p => ({ ...p, [key]: true }))
    try {
      await callApi('tax_save_task', { tax_plan_id: plan.id, task_id: taskId, status, completed_date: date || null, tax_specialist_id: taxSpecialistId || null })
      setLocalProgress(p => ({ ...p, [key]: { ...p[key], task_id: taskId, status, completed_date: date, tax_specialist_id: taxSpecialistId } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [key]: false })) }
  }
 
  async function saveDate(taskId, date, taxSpecialistId = null) {
    const key = taxSpecialistId ? `${taskId}_${taxSpecialistId}` : taskId
    const p = localProgress[key] || {}
    setSaving(prev => ({ ...prev, [key]: true }))
    try {
      await callApi('tax_save_task', { tax_plan_id: plan.id, task_id: taskId, status: p.status, completed_date: date || null, tax_specialist_id: taxSpecialistId || null })
      setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], completed_date: date } }))
    } catch (err) { console.error(err) }
    finally { setSaving(prev => ({ ...prev, [key]: false })) }
  }
 
  const statusColors = {
    Completed: '#27ae60', Yes: '#27ae60', 'No additional info required': '#27ae60',
    'Introductions Completed': '#27ae60', 'Combo Tax Plan': '#27ae60', 'ROI Plan': '#27ae60',
    'Continue Process': '#27ae60', 'Move to Implementation': '#27ae60', 'Refund Completed': '#27ae60',
    'Schedule Tax 3': '#27ae60', 'Paid': '#27ae60',
    'Yes - Confirmation email to client': '#27ae60', 'No - Declined email to client': '#e74c3c',
    'Tim Gacsy': '#27ae60', 'Steven Cox': '#27ae60',
    'Yes – Risk 1 – Very Conservative Mindset': '#27ae60', 'Yes – Risk 2 - Moderately Conservative Mindset': '#27ae60',
    'Yes – Risk 3 – Average Risk Mindset': '#27ae60', 'Yes – Risk 4 – Moderately Aggressive Mindset': '#27ae60',
    'Yes – Risk 5 – Very Aggressive Mindset': '#27ae60',
    No: '#e74c3c', 'Stop Process': '#e74c3c', 'Stopped': '#e74c3c',
    'Additional info required': '#27ae60', Undecided: '#f39c12',
    'Continue DD': '#27ae60', 'Continue - Revenue Share': '#27ae60', 'Stop - Refund': '#e74c3c', 'N/A': '#8bacc8',
    'Proceed with Implementation': '#27ae60', 'Not Implementing': '#e74c3c',
    'Pending Completion': '#f39c12',
  }
    
 
  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }
 
  function getPhaseState(phase) {
    let tasks = (phase.program_client_tasks || []).filter(t => t.status_options !== 'auto')
    // Exclude greyed conditional tasks from count
    if (phase.name === 'Tax 1 - Diagnostic' && !additionalInfoRequired) {
      tasks = tasks.filter(t => !['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(t.name))
    }
    if (tasks.length === 0) {
      const autoTasks = phase.program_client_tasks || []
      const allAutoDone = autoTasks.length > 0 && autoTasks.every(t => localProgress[t.id]?.status)
      return allAutoDone ? 'done' : 'pending'
    }
    if (tasks.every(t => localProgress[t.id]?.status)) return 'done'
    if (tasks.some(t => localProgress[t.id]?.status)) return 'active'
    return 'pending'
  }
 
  // Conditional logic lookups
  const allTasks = phases.flatMap(p => p.program_client_tasks || [])
 
  // Tax 1: Additional info required
  const addInfoTask = allTasks.find(t => t.name === 'Additional information required')
  const addInfoStatus = addInfoTask ? localProgress[addInfoTask.id]?.status : ''
  const additionalInfoRequired = addInfoStatus === 'Additional info required'
 
  // Tax 2: Ready for Tax 3 buttons
  const readyForTax3Task = allTasks.find(t => t.name === 'Ready for Tax 3?')
 
  // Tax 4: Client decision 1 buttons
  const decision1Task = allTasks.find(t => t.name === 'Client decision 1')
  const decision1Status = decision1Task ? localProgress[decision1Task.id]?.status : ''
 
  // Tax 4: Client decision 2 buttons
  const decision2Task = allTasks.find(t => t.name === 'Client decision 2')
  const decision2Status = decision2Task ? localProgress[decision2Task.id]?.status : ''
 
  // Tax 5a: Check if any specialist has C26.19 (Confirm ready for implementation) done
  const confirmReadyTask = allTasks.find(t => t.name === 'Confirm ready for implementation')
  const updatePcTask = allTasks.find(t => t.name === 'Implementing?' && phases.find(p => p.name === 'Tax 5 - Education & DD (Specialist Allocation)')?.program_client_tasks?.some(pt => pt.id === t.id))
  const anySpecialistUpdateDone = updatePcTask && taxSpecialists.some(spec => {
    const key = `${updatePcTask.id}_${spec.id}`
    return localProgress[key]?.status
  })
 
  // AI PC Admin sub-steps for Tax 3
  const aiPcAdminSteps = [
    'Email to client if Yes — signing link and next steps',
    'Email to client if No — decline',
    'Email to client if Undecided — decision buttons + agreement PDF attached',
    'Final client decision if previously Undecided (Stop/Continue/Extra Meeting)',
    'Extra meeting decision if requested (PF submits Yes with pricing or No)',
    'PF completes pricing if Undecided→Yes',
    'Engagement agreement created and sent for signing',
    'Engagement agreement signed by client',
    'Engagement agreement signed by Anton',
    'Payment link sent to client (ACH or Card choice)',
    'Retainer payment collected and confirmation email sent',
    'Invoice and receipt created and emailed to client',
  ]
 
  const inputStyle = { padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '12px', fontFamily: 'DM Sans, sans-serif' }
 
  // Get Tax 5a phase
  const tax5aPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Specialist Allocation)')
  const tax5bPhase = phases.find(p => p.name === 'Tax 5 - Education & DD (Post Allocation)')
  const tax5aTasks = tax5aPhase?.program_client_tasks || []
 
  // Filter out 5a and 5b from normal phase rendering
  const phasesBeforeSpec = phases.filter(p => ['Tax 1 - Diagnostic', 'Tax 2 - Deeper Dive', 'Tax 3 - ROI Meeting', 'Tax 4 - Tax Plan Review'].includes(p.name))
  const phasesAfterSpec = phases.filter(p => p.name === 'Tax 6 - Implementation')
 
  function renderTask(task, phase, taxSpecialistId = null) {
    const key = taxSpecialistId ? `${task.id}_${taxSpecialistId}` : task.id
    const p = localProgress[key] || {}
    const isDone = !!p.status
    const statusColor = statusColors[p.status] || '#8bacc8'
 
    
    // Client tax planning decision — inline form with conditional fields
    if (task.name === 'Client tax planning decision' && task.status_options === 'enter_details') {
      const enterPhase = phases.find(p => p.name === 'Tax 3 - ROI Meeting')
      const isInTax3 = enterPhase?.program_client_tasks?.some(pt => pt.id === task.id)
      
      if (isInTax3) {
        if (readOnly && isDone) {
          const decisionLabel = p.status.replace('Completed - ', '')
          const decisionColor = decisionLabel === 'Yes' ? '#27ae60' : decisionLabel === 'No' ? '#e74c3c' : '#f39c12'
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: decisionColor, flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>
              {p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
            </div>
          )
        }
        if (readOnly && !isDone) {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.2)' }} />
              <span style={{ fontSize: '13px', color: '#fff', flex: 1 }}>{task.name}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
            </div>
          )
        }
        const decisionLabel = isDone ? p.status.replace('Completed - ', '') : ''
        const decisionColor = decisionLabel === 'Yes' ? '#27ae60' : decisionLabel === 'No' ? '#e74c3c' : decisionLabel === 'Undecided' ? '#f39c12' : '#8bacc8'
        let formData = null
        if (isDone) { try { formData = JSON.parse(p.notes || '{}') } catch(e) { formData = {} } }
        
        const formExpandKey = `taxform_${task.id}`
        const isFormShown = isDone ? expanded[formExpandKey] : true
        
        return (
          <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '7px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isDone ? 'pointer' : 'default' }} onClick={() => isDone && setExpanded(prev => ({ ...prev, [formExpandKey]: !prev[formExpandKey] }))}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? decisionColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? decisionColor : 'rgba(255,255,255,0.2)'}` }} />
              <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
              {isDone && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>}
              {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
              {isDone && <span style={{ color: '#8bacc8', fontSize: '10px', transform: isFormShown ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
            </div>
            {isFormShown && (
              <TaxDecisionForm
                task={task}
                plan={plan}
                saveTask={saveTask}
                taxSpecialistId={taxSpecialistId}
                existingData={formData}
                onSubmitted={(status, data) => {
                  setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], task_id: task.id, status, completed_date: new Date().toISOString().split('T')[0], notes: JSON.stringify(data) } }))
                }}
              />
            )}
          </div>
        )
      }
    }

    // AI PC Admin — conditional branching, all auto badges, no interactive buttons
    if (task.name === 'AI PC Admin') {
      const enterDetailsTask = allTasks.find(t => t.name === 'Client tax planning decision')
      const enterDetailsStatus = enterDetailsTask ? (localProgress[enterDetailsTask.id]?.status || '') : ''
      
      if (!enterDetailsStatus || !enterDetailsStatus.startsWith('Completed')) return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: '13px', color: '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8', border: '1px solid rgba(255,255,255,0.1)' }}>Waiting for details</span>
        </div>
      )
 
      const decision = enterDetailsStatus.replace('Completed - ', '')
 
      const autoStep = (label, done) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#27ae60' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
          <span style={{ fontSize: '12px', color: done ? '#27ae60' : '#8bacc8' }}>{label}</span>
          {done && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', marginLeft: 'auto' }}>Done</span>}
        </div>
      )
 
      const yesSteps = [
        'Engagement agreement created and sent for signing',
        'Engagement agreement signed by client',
        'Engagement agreement signed by VFOS',
        'Payment link sent to client (ACH or Card choice)',
        'Retainer payment collected and confirmation email sent',
        'Invoice and receipt created and emailed to client',
      ]
 
      const decisionColor = decision === 'Yes' ? '#27ae60' : decision === 'No' ? '#e74c3c' : '#f39c12'
      const decisionLabel = decision === 'Yes' ? 'Yes — proceeding' : decision === 'No' ? 'No — declined' : 'Undecided — awaiting client'
 
      return (
        <div key={key} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
            <span style={{ fontSize: '13px', color: '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>
          </div>
          <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
 
            {/* === NO PATH === */}
            {decision === 'No' && autoStep('Decline email sent to client', false)}
 
            {/* === YES PATH === */}
            {decision === 'Yes' && yesSteps.map((s, i) => <div key={i}>{autoStep(s, false)}</div>)}
 
            {/* === UNDECIDED PATH === */}
            {decision === 'Undecided' && (
              <>
                {autoStep('Decision email sent', false)}
                {autoStep('Client response received', false)}
                <div style={{ marginLeft: '14px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px' }}>If Yes:</div>
                  {yesSteps.map((s, i) => <div key={`y${i}`}>{autoStep(s, false)}</div>)}
                  <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If No:</div>
                  {autoStep('Decline email sent to client', false)}
                  <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If extra meeting:</div>
                  {autoStep('Extra meeting held', false)}
                  {autoStep('PF submits outcome', false)}
                  <div style={{ marginLeft: '14px', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px' }}>If Yes:</div>
                    {autoStep('PF completed pricing', false)}
                    {yesSteps.map((s, i) => <div key={`ey${i}`}>{autoStep(s, false)}</div>)}
                    <div style={{ fontSize: '11px', color: '#5a8ab5', marginBottom: '6px', marginTop: '10px' }}>If No:</div>
                    {autoStep('Decline email sent to client', false)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )
    }
 
    // AI PC Admin — conditional branching based on Enter Details decision
    if (task.name === 'AI PC Admin') {
      const enterDetailsTask = allTasks.find(t => t.name === 'Enter Details')
      const enterDetailsStatus = enterDetailsTask ? (localProgress[enterDetailsTask.id]?.status || '') : ''
      
      let aiState = {}
      try { aiState = JSON.parse(localProgress[key]?.notes || '{}') } catch(e) { aiState = {} }
      
      if (!enterDetailsStatus || !enterDetailsStatus.startsWith('Completed')) return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: '13px', color: '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8', border: '1px solid rgba(255,255,255,0.1)' }}>Waiting for details</span>
        </div>
      )
 
      const decision = enterDetailsStatus.replace('Completed - ', '')
      const clientResponse = aiState.client_response || ''
      const pfResponse = aiState.pf_response || ''
 
      const autoStep = (label, done) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#27ae60' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
          <span style={{ fontSize: '12px', color: done ? '#27ae60' : '#8bacc8' }}>{label}</span>
          {done && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', marginLeft: 'auto' }}>Done</span>}
        </div>
      )
 
      const sharedSteps = [
        'Engagement agreement created and sent for signing',
        'Engagement agreement signed by client',
        'Engagement agreement signed by Anton',
        'Payment link sent to client (ACH or Card choice)',
        'Retainer payment collected and confirmation email sent',
        'Invoice and receipt created and emailed to client',
      ]
 
      const decisionColor = decision === 'Yes' ? '#27ae60' : decision === 'No' ? '#e74c3c' : '#f39c12'
      const decisionLabel = decision === 'Yes' ? 'Yes — proceeding' : decision === 'No' ? 'No — declined' : 'Undecided — awaiting client'
 
      function saveAiState(newState, status) {
        callApi('tax_save_task', { tax_plan_id: plan.id, task_id: task.id, status, notes: JSON.stringify(newState) })
        setLocalProgress(prev => ({ ...prev, [key]: { ...prev[key], task_id: task.id, status, notes: JSON.stringify(newState) } }))
      }
 
      return (
        <div key={key} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
            <span style={{ fontSize: '13px', color: '#fff', flex: 1, fontWeight: '600' }}>{task.name}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${decisionColor}22`, color: decisionColor, border: `1px solid ${decisionColor}44` }}>{decisionLabel}</span>
          </div>
          <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
 
            {/* === NO PATH === */}
            {decision === 'No' && autoStep('Decline email sent to client', true)}
 
            {/* === YES PATH === */}
            {decision === 'Yes' && (
              <>
                {autoStep('Signing link and next steps email sent', false)}
                {sharedSteps.map((s, i) => <div key={i}>{autoStep(s, false)}</div>)}
              </>
            )}
 
            {/* === UNDECIDED PATH === */}
            {decision === 'Undecided' && (
              <>
                {autoStep('Decision email sent with agreement PDF', true)}
 
                {!clientResponse && !readOnly && (
                  <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '12px', color: '#fff', marginBottom: '8px' }}>Client decision:</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => saveAiState({ ...aiState, client_response: 'yes' }, 'Undecided - Client Yes')} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Continue (Yes)</button>
                      <button onClick={() => saveAiState({ ...aiState, client_response: 'no' }, 'Undecided - Client No')} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>Stop (No)</button>
                      <button onClick={() => saveAiState({ ...aiState, client_response: 'extra_meeting' }, 'Undecided - Extra Meeting')} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(91,159,230,0.4)', background: 'rgba(91,159,230,0.12)', color: '#5b9fe6' }}>Request extra meeting</button>
                    </div>
                  </div>
                )}
 
                {clientResponse === 'yes' && (
                  <>
                    {autoStep('Client confirmed — Yes', true)}
                    {autoStep('Signing link and next steps email sent', false)}
                    {sharedSteps.map((s, i) => <div key={i}>{autoStep(s, false)}</div>)}
                  </>
                )}
 
                {clientResponse === 'no' && (
                  <>
                    {autoStep('Client confirmed — Stop', true)}
                    {autoStep('Decline email sent to client', true)}
                  </>
                )}
 
                {clientResponse === 'extra_meeting' && (
                  <>
                    {autoStep('Client requested extra meeting', true)}
                    {autoStep('Extra meeting held', false)}
 
                    {!pfResponse && !readOnly && (
                      <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize: '12px', color: '#fff', marginBottom: '8px' }}>PF decision after extra meeting:</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveAiState({ ...aiState, pf_response: 'yes' }, 'Undecided - Extra Meeting - Yes')} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Yes — proceed with pricing</button>
                          <button onClick={() => saveAiState({ ...aiState, pf_response: 'no' }, 'Undecided - Extra Meeting - No')} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>No — decline</button>
                        </div>
                      </div>
                    )}
 
                    {pfResponse === 'yes' && (
                      <>
                        {autoStep('PF confirmed — Yes with pricing', true)}
                        {autoStep('PF completed pricing', false)}
                        {sharedSteps.map((s, i) => <div key={i}>{autoStep(s, false)}</div>)}
                      </>
                    )}
 
                    {pfResponse === 'no' && (
                      <>
                        {autoStep('PF confirmed — No', true)}
                        {autoStep('Decline email sent to client', true)}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )
    }

    // Skip tasks rendered as children inside other handlers
    if (task.name === 'Refund initial 50%' || task.name === 'Revenue share for initial 50%') return null
    if (['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(task.name)) return null

    // Auto badge
    if (task.status_options === 'auto') return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>{task.name}</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: isDone ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)', color: isDone ? '#27ae60' : '#8bacc8', border: `1px solid ${isDone ? 'rgba(39,174,96,0.3)' : 'rgba(255,255,255,0.1)'}` }}>{isDone ? 'Completed' : 'Not completed'}</span>
        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
      </div>
    )
 
 
    // Read-only mode
    if (readOnly) return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
        {isDone
          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
          : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>
        }
        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
      </div>
    )

    // Implementing? — 3 buttons with auto-stamped date, not editable
    if (task.name === 'Implementing?') {
      const implColor = p.status === 'Proceed with Implementation' ? '#27ae60' : p.status === 'Not Implementing' ? '#e74c3c' : p.status === 'Undecided' ? '#f39c12' : '#8bacc8'
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? implColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? implColor : 'rgba(255,255,255,0.2)'}` }} />
          <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
          {isDone
            ? <>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${implColor}22`, color: implColor, border: `1px solid ${implColor}44` }}>{p.status}</span>
                {p.completed_date && <span style={{ fontSize: '11px', color: '#5a8ab5' }}>{formatDate(p.completed_date)}</span>}
              </>
            : <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => saveTask(task.id, 'Proceed with Implementation', null, taxSpecialistId)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Proceed with Implementation</button>
                <button onClick={() => saveTask(task.id, 'Not Implementing', null, taxSpecialistId)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>Not Implementing</button>
                <button onClick={() => saveTask(task.id, 'Undecided', null, taxSpecialistId)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(243,156,18,0.4)', background: 'rgba(243,156,18,0.12)', color: '#f39c12' }}>Undecided</button>
              </div>
          }
        </div>
      )
    }
 
    // Enter details button
    if (task.status_options === 'enter_details') return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
        {isDone
          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Completed</span>
          : <button onClick={() => saveTask(task.id, 'Completed', p.completed_date, taxSpecialistId)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(91,159,230,0.4)', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6' }}>Enter details</button>
        }
        <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value, taxSpecialistId)} style={{ ...inputStyle, width: '130px' }} />
      </div>
    )
 
    // Two-button: Ready for Tax 3
    if (task.status_options === 'tax_3_decision') return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
        {isDone
          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
          : <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => saveTask(task.id, 'Yes - Confirmation email to client', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Yes - Confirmation email to client</button>
              <button onClick={() => saveTask(task.id, 'No - Declined email to client', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>No - Declined email to client</button>
            </div>
        }
        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#8bacc8' }}>{formatDate(p.completed_date)}</span>}
      </div>
    )
 
    // Two-button: Continue / Stop
    if (task.status_options === 'tax_continue_stop') {
      const refundTask = allTasks.find(t => t.name === 'Refund initial 50%')
      const revShareTask = allTasks.find(t => t.name === 'Revenue share for initial 50%')
      const refundDone = refundTask ? !!localProgress[refundTask.id]?.status : false
      const revShareDone = revShareTask ? !!localProgress[revShareTask.id]?.status : false
      const refundGreyed = decision1Status !== 'Stop - Refund'
      const revShareGreyed = decision1Status !== 'Continue - Revenue Share'
      return (
        <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
            <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
            {isDone
              ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
              : <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => saveTask(task.id, 'Continue - Revenue Share', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Continue - Revenue Share</button>
                  <button onClick={() => saveTask(task.id, 'Stop - Refund', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}>Stop - Refund</button>
                </div>
            }
            {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#8bacc8' }}>{formatDate(p.completed_date)}</span>}
          </div>
          <div style={{ marginLeft: '18px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '12px', paddingBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', opacity: refundGreyed ? 0.15 : 1 }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: refundDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1px solid ${refundDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
              <span style={{ fontSize: '12px', color: '#8bacc8', flex: 1 }}>Refund initial 50%</span>
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: refundDone ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)', color: refundDone ? '#27ae60' : '#8bacc8' }}>{refundDone ? 'Completed' : 'Not completed'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', opacity: revShareGreyed ? 0.15 : 1 }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: revShareDone ? '#27ae60' : 'transparent', flexShrink: 0, border: `1px solid ${revShareDone ? '#27ae60' : 'rgba(255,255,255,0.2)'}` }} />
              <span style={{ fontSize: '12px', color: '#8bacc8', flex: 1 }}>Revenue share for initial 50%</span>
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: revShareDone ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)', color: revShareDone ? '#27ae60' : '#8bacc8' }}>{revShareDone ? 'Completed' : 'Not completed'}</span>
            </div>
          </div>
        </div>
      )
    }
 
    // Two-button: DD / Implementation
    if (task.status_options === 'tax_dd_implementation') return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
        {isDone
          ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{p.status}</span>
          : <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => saveTask(task.id, 'Continue DD', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Continue DD</button>
              <button onClick={() => saveTask(task.id, 'Move to Implementation', p.completed_date)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}>Move to Implementation</button>
            </div>
        }
        {isDone && p.completed_date && <span style={{ fontSize: '11px', color: '#8bacc8' }}>{formatDate(p.completed_date)}</span>}
      </div>
    )

    

    // Specialist select (for Tax 5a)
    if (task.status_options === 'specialist_select') return null // handled in specialist section
 
    // Greyed conditional tasks
    // Tax 1: tasks after "Additional information required"
    
    

    // Tax 1: Additional information required — render with indented children
    if (task.name === 'Additional information required') {
      const childTaskNames = ['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L']
      const childTasks = allTasks.filter(t => childTaskNames.includes(t.name))
      const greyed = !additionalInfoRequired
      return (
        <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', flexWrap: 'wrap' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
            <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}</span>
            <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, taxSpecialistId)} disabled={saving[key]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
              <option value="">-- Select --</option>
              {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value, taxSpecialistId)} style={{ ...inputStyle, width: '130px' }} />
          </div>
          <div style={{ marginLeft: '18px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '12px', paddingBottom: '4px', opacity: greyed ? 0.3 : 1, pointerEvents: greyed ? 'none' : 'auto' }}>
            {childTasks.map(ct => {
              const ck = taxSpecialistId ? `${ct.id}_${taxSpecialistId}` : ct.id
              const cp = localProgress[ck] || {}
              const cDone = !!cp.status
              const cColor = statusColors[cp.status] || '#8bacc8'
              return (
                <div key={ck} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cDone ? cColor : 'transparent', flexShrink: 0, border: `1px solid ${cDone ? cColor : 'rgba(255,255,255,0.2)'}` }} />
                  <span style={{ fontSize: '12px', color: cDone ? '#8bacc8' : '#fff', flex: 1 }}>{ct.name}</span>
                  <select value={cp.status || ''} onChange={e => saveTask(ct.id, e.target.value, cp.completed_date, taxSpecialistId)} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '120px', fontSize: '11px', borderColor: cDone ? `${cColor}66` : 'rgba(255,255,255,0.15)', color: cDone ? cColor : '#fff' }}>
                    <option value="">-- Select --</option>
                    {(ct.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="date" value={cp.completed_date || ''} onChange={e => saveDate(ct.id, e.target.value, taxSpecialistId)} style={{ ...inputStyle, width: '120px', fontSize: '11px' }} />
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    // Tax 5a per-specialist: greyed if Move to Implementation
    const isSpecIntroTask = task.name === 'VFO specialist introductions / discussions'
    const isConfirmReadyImplTask = task.name === 'Confirm ready for implementation'
 
    let isGreyedOut = false
    let greyNote = ''
    
    
    if ((isSpecIntroTask || isConfirmReadyImplTask) && decision2Status === 'Move to Implementation') {
      isGreyedOut = true
      greyNote = 'Moved to implementation'
    }
 
    return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', opacity: isGreyedOut ? 0.3 : 1, pointerEvents: isGreyedOut ? 'none' : 'auto' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'rgba(255,255,255,0.2)'}` }} />
        <span style={{ fontSize: '13px', color: isDone ? '#8bacc8' : '#fff', flex: 1 }}>{task.name}{greyNote && <span style={{ fontSize: '11px', color: '#f39c12', marginLeft: '8px' }}>({greyNote})</span>}</span>
        <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, taxSpecialistId)} disabled={saving[key]} style={{ ...inputStyle, background: '#0d2a6e', minWidth: '150px', borderColor: isDone ? `${statusColor}66` : 'rgba(255,255,255,0.15)', color: isDone ? statusColor : '#fff' }}>
          <option value="">-- Select --</option>
          {(task.status_options || '').split('|').map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={p.completed_date || ''} onChange={e => saveDate(task.id, e.target.value, taxSpecialistId)} style={{ ...inputStyle, width: '130px' }} />
      </div>
    )
  }
 
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#5b9fe6', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to Tax Plans</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff' }}>Tax Plan</div>
        <div style={{ fontSize: '12px', color: '#8bacc8' }}>Started {plan.created_at?.split('T')[0]}</div>
      </div>
 
      {/* Tax 1-4 and Tax 6 — normal collapsible phases */}
      {phasesBeforeSpec.map(phase => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        let nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        if (phase.name === 'Tax 1 - Diagnostic' && !additionalInfoRequired) {
          nonAutoTasks = nonAutoTasks.filter(t => !['Email to obtain information required sent', 'Information received', 'Information passed to VFO-L'].includes(t.name))
        }
        const doneTasks = nonAutoTasks.filter(t => localProgress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
 
        return (
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => renderTask(task, phase))}
              </div>
            )}
          </div>
        )
      })}
 
      

      {/* Tax 5a — Specialist Allocation */}
      {tax5aPhase && (
        <div style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(91,159,230,0.4)', borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#5b9fe6', border: '1.5px solid #5b9fe6', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#5b9fe6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tax 5 - Education & DD (Specialist Allocation)</span>
            </div>
            {!readOnly && (
              <button onClick={() => setShowAddSpec(!showAddSpec)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', background: '#2563eb', border: 'none', color: '#fff' }}>+ Add Specialist</button>
            )}
          </div>
 
          <div style={{ borderTop: '1px solid rgba(91,159,230,0.2)', padding: '12px 18px' }}>
            {showAddSpec && (
              <div style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', marginBottom: '12px' }}>
                <select value={newSpecId} onChange={e => setNewSpecId(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e', width: '100%', marginBottom: '8px', padding: '8px 12px' }}>
                  <option value="">-- Select Specialist --</option>
                  {specialists.filter(s => !taxSpecialists.some(ts => ts.expert_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={addSpecialist} style={{ padding: '6px 16px', borderRadius: '6px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setShowAddSpec(false)} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
 
            {taxSpecialists.length === 0 && !showAddSpec && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#8bacc8', fontSize: '13px' }}>No specialists allocated yet.</div>
            )}
 
            {taxSpecialists.map(spec => {
              const allocateTask = tax5aTasks.find(t => t.status_options === 'specialist_select')
              const specTasks = tax5aTasks.filter(t => t.status_options !== 'specialist_select')
              const specExpKey = `spec_${spec.id}`
              const specTasks2 = tax5aTasks.filter(t => t.status_options !== 'specialist_select')
              const allSpecDone = specTasks2.every(t => {
                const sk = `${t.id}_${spec.id}`
                return localProgress[sk]?.status
              })
              const isSpecExpanded = expanded[specExpKey] !== undefined ? expanded[specExpKey] : !allSpecDone
 
              return (
                <div key={spec.id} style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                  <div onClick={() => setExpanded(p => ({ ...p, [specExpKey]: !isSpecExpanded }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>{spec.specialist_name}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: spec.status === 'stopped' ? 'rgba(231,76,60,0.15)' : 'rgba(39,174,96,0.15)', color: spec.status === 'stopped' ? '#e74c3c' : '#27ae60', border: `1px solid ${spec.status === 'stopped' ? 'rgba(231,76,60,0.3)' : 'rgba(39,174,96,0.3)'}` }}>{spec.status === 'stopped' ? 'Stopped' : 'Live'}</span>
                    </div>
                    <span style={{ color: '#8bacc8', fontSize: '10px', transform: isSpecExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                  {isSpecExpanded && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px' }}>
                      {allocateTask && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27ae60', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: '#8bacc8', flex: 1 }}>Allocate to VFO Specialist</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>
                        </div>
                      )}
                      {specTasks.map(task => renderTask(task, tax5aPhase, spec.id))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
 
      {/* Tax 5b — Post-Specialist (locked) */}
      {tax5bPhase && (
        <div style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', marginBottom: '10px', overflow: 'hidden', opacity: anySpecialistUpdateDone ? 1 : 0.3, pointerEvents: anySpecialistUpdateDone ? 'auto' : 'none' }}>
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tax 5 - Education & DD (Post Allocation)</span>
            {!anySpecialistUpdateDone && <span style={{ fontSize: '11px', color: '#f39c12' }}>(Unlocks when Update PC re outcome is completed for any specialist)</span>}
          </div>
          {anySpecialistUpdateDone && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px 18px' }}>
              {(tax5bPhase.program_client_tasks || []).map(task => renderTask(task, tax5bPhase))}
            </div>
          )}
        </div>
      )}
      {/* Tax 6 */}
      {phasesAfterSpec.map(phase => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_client_tasks || []
        const nonAutoTasks = tasks.filter(t => t.status_options !== 'auto')
        const doneTasks = nonAutoTasks.filter(t => localProgress[t.id]?.status).length
        const borderColor = state === 'done' ? 'rgba(39,174,96,0.3)' : state === 'active' ? 'rgba(91,159,230,0.4)' : 'rgba(255,255,255,0.1)'
        const dotColor = state === 'done' ? '#27ae60' : state === 'active' ? '#5b9fe6' : 'transparent'
        const titleColor = state === 'active' ? '#5b9fe6' : '#fff'
        return (
          <div key={phase.id} style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'rgba(255,255,255,0.2)' : dotColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{phase.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(39,174,96,0.15)', color: '#27ae60', border: '1px solid rgba(39,174,96,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(91,159,230,0.15)', color: '#5b9fe6', border: '1px solid rgba(91,159,230,0.3)' }}>In progress · {doneTasks}/{nonAutoTasks.length}</span>}
                {state === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: '#8bacc8', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {tasks.map(task => renderTask(task, phase))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

}