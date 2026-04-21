import { useState, useEffect, useRef } from 'react'
import { callApi } from '../../lib/api'
import MemberWebsitePlugin from '../shared/MemberWebsitePlugin'
import MSMTracking from './MSMTracking'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'

const MEMBER_TYPES = [
  'Implementation', 'Catalyst', 'Catalyst A', 'Free Catalyst',
  'Fusion', 'Fusion A', 'Fusion A - I/M', 'Free Fusion', 'Free Legacy TBM', 'Legacy Fusion',
  'Accelerator', 'Accelerator A', 'Legacy Accelerator',
  'Corporate Member', 'Free Corporate Member', 'Free Corporate Member (Legacy)',
  'Financial Collaborator', 'VFO Reconciliation (Free)'
]

const CORPORATE_TYPES = ['Corporate Member', 'Free Corporate Member', 'Free Corporate Member (Legacy)']

export default function MembersPanel({ allMembers, allExperts, allExclusionMap, onDataChange, section }) {
  if (section === 'search_accountants' || section === 'add_accountant') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff', marginBottom: '12px' }}>Accountants</p>
          <p style={{ fontSize: '14px', color: '#8bacc8' }}>Coming soon.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <AdvisorsPanel allMembers={allMembers} allExperts={allExperts} allExclusionMap={allExclusionMap} onDataChange={onDataChange} initialTab={section === 'add_advisor' ? 'add' : 'search'} />
    </div>
  )
}

function FeatureTabDropdown({ label, isActive, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { closeTimer.current = setTimeout(() => setOpen(false), 200) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #5b9fe6' : '2px solid transparent', color: isActive ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

function AdvisorsPanel({ allMembers, allExperts, allExclusionMap, onDataChange, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'search')
  useEffect(() => { setActiveTab(initialTab || 'search') }, [initialTab])
  const [selectedMember, setSelectedMember] = useState(() => {
    const saved = sessionStorage.getItem('adminSelectedMember')
    if (saved && allMembers.length) return allMembers.find(m => m.plugin_member_number === saved) || null
    return null
  })
  const [memberFeatureTab, setMemberFeatureTab] = useState(sessionStorage.getItem('adminMemberFeatureTab') || 'profile')
  const [memberSearch, setMemberSearch] = useState('')

  const subTabStyle = (active) => ({
    padding: '10px 18px', background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent',
    color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400',
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap'
  })

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }

  const filteredMembers = memberSearch
    ? allMembers.filter(m => m.name?.toLowerCase().includes(memberSearch) || m.plugin_member_number?.toLowerCase().includes(memberSearch))
    : allMembers

  return (
    <div>

      {activeTab === 'add' && <AddAdvisorForm allMembers={allMembers} onDataChange={onDataChange} />}

      {activeTab === 'search' && !selectedMember && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <input placeholder="Search by name or member number..." style={inputStyle} onChange={e => setMemberSearch(e.target.value.toLowerCase())} value={memberSearch} />
          </div>
          <div>
            {filteredMembers.map(m => (
              <div key={m.plugin_member_number}
                onClick={() => { setSelectedMember(m); setMemberFeatureTab('profile_details'); sessionStorage.setItem('adminSelectedMember', m.plugin_member_number); sessionStorage.setItem('adminMemberFeatureTab', 'profile_details') }}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 14px', marginBottom: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}>
                <span style={{ fontSize: '12px', color: '#8bacc8', width: '70px', flexShrink: 0, fontFamily: 'monospace' }}>{m.plugin_member_number}</span>
                <span style={{ fontSize: '14px', color: '#fff', width: '200px', flexShrink: 0 }}>{m.name}</span>
                <span style={{ fontSize: '12px', color: m.elite_status === 'Active' ? '#27ae60' : m.elite_status === 'Lost' ? '#e74c3c' : '#8bacc8', width: '80px', flexShrink: 0 }}>{m.elite_status || '—'}</span>
                <span style={{ fontSize: '12px', color: '#8bacc8' }}>{m.member_type || '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'search' && selectedMember && (
        <>
          <button onClick={() => { setSelectedMember(null); sessionStorage.removeItem('adminSelectedMember'); sessionStorage.removeItem('adminMemberFeatureTab') }} style={{ background: 'none', border: 'none', color: '#5b9fe6', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>
          <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', color: '#fff' }}>{selectedMember.name}</div>
            <div style={{ fontSize: '13px', color: '#8bacc8', marginTop: '4px' }}>{selectedMember.plugin_member_number}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {selectedMember.member_type && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8bacc8', border: '1px solid rgba(255,255,255,0.1)' }}>{selectedMember.member_type}</span>}
              {selectedMember.elite_status && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${selectedMember.elite_status === 'Active' ? 'rgba(39,174,96,0.15)' : selectedMember.elite_status === 'Lost' ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.06)'}`, color: selectedMember.elite_status === 'Active' ? '#27ae60' : selectedMember.elite_status === 'Lost' ? '#e74c3c' : '#8bacc8', border: `1px solid ${selectedMember.elite_status === 'Active' ? 'rgba(39,174,96,0.3)' : selectedMember.elite_status === 'Lost' ? 'rgba(231,76,60,0.3)' : 'rgba(255,255,255,0.1)'}` }}>{selectedMember.elite_status}</span>}
              {selectedMember.paused && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(243,156,18,0.15)', color: '#f39c12', border: '1px solid rgba(243,156,18,0.3)' }}>Paused</span>}
              {selectedMember.suspended && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>Suspended</span>}
              
            </div>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px', flexWrap: 'wrap' }}>
          <FeatureTabDropdown label="Profile" isActive={['profile_details','profile_edit','profile_history'].includes(memberFeatureTab)} options={[{key:'profile_details',label:'Profile'},{key:'profile_edit',label:'Edit Profile'},{key:'profile_history',label:'Type History'}]} onSelect={setMemberFeatureTab} />
          <FeatureTabDropdown label="MSM" isActive={['msm_meetings','msm_program_holistic','msm_program_partnership','msm_program_tax','msm_program_coaching'].includes(memberFeatureTab)} options={[{key:'msm_meetings',label:'MSM'},{key:'msm_program_holistic',label:'VFO Holistic Planning'},{key:'msm_program_partnership',label:'Partnership Fast Track'},{key:'msm_program_tax',label:'VFO Tax Planning'},{key:'msm_program_coaching',label:'Advanced Coaching'}]} onSelect={k => { setMemberFeatureTab(k); sessionStorage.setItem('adminMemberFeatureTab', k) }} />
            {[['specialists','Specialists'],['showroom','Showroom'],['website','Website Plugin'],['ciq','CIQ'],['growthplan','Growth Plan'],['gc','GC Marketplace'],['vault','The Vault'],['settings','Settings']].map(([key, label]) => (
            <button key={key} style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: memberFeatureTab === key ? '2px solid #5b9fe6' : '2px solid transparent', color: memberFeatureTab === key ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: memberFeatureTab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }} onClick={() => { setMemberFeatureTab(key); sessionStorage.setItem('adminMemberFeatureTab', key) }}>{label}</button>
          ))}
          </div>
          {['profile_details','profile_edit','profile_history'].includes(memberFeatureTab) && <MemberProfile member={selectedMember} allMembers={allMembers} onDataChange={onDataChange} activeSection={memberFeatureTab} />}
          {['msm_meetings','msm_program_holistic','msm_program_partnership','msm_program_tax','msm_program_coaching'].includes(memberFeatureTab) && <MSMTracking member={selectedMember} activeSection={memberFeatureTab} onDataChange={onDataChange} />}          {memberFeatureTab === 'specialists' && <MemberSpecialists member={selectedMember} allExperts={allExperts} allExclusionMap={allExclusionMap} onDataChange={onDataChange} />}
          {memberFeatureTab === 'showroom' && <ComingSoon title="Showroom" />}
          {memberFeatureTab === 'website' && <MemberWebsitePlugin member={selectedMember} onDataChange={onDataChange} readOnly={false} />}
          {memberFeatureTab === 'ciq' && <ComingSoon title="CIQ" />}
          {memberFeatureTab === 'growthplan' && <ComingSoon title="Growth Plan" />}
          {memberFeatureTab === 'gc' && <MemberGC member={selectedMember} />}
          {memberFeatureTab === 'vault' && <MemberVault member={selectedMember} />}
          {memberFeatureTab === 'settings' && <MemberSettings member={selectedMember} onDataChange={onDataChange} />}
        </>
      )}
    </div>
  )
}

function AddAdvisorForm({ allMembers, onDataChange }) {
  const [memberType, setMemberType] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [eliteStatus, setEliteStatus] = useState('Active')
  const [revenueDecision, setRevenueDecision] = useState('Revenue Share')
  const [connectedSearch, setConnectedSearch] = useState('')
  const [connectedMember, setConnectedMember] = useState(null)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)

  const isCorporate = CORPORATE_TYPES.includes(memberType)
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  function generateMemberNumber() {
    if (isCorporate && connectedMember) {
      const existing = allMembers.filter(m => m.plugin_member_number?.startsWith(connectedMember.plugin_member_number + '-C'))
      return `${connectedMember.plugin_member_number}-C${existing.length + 1}`
    }
    const nums = allMembers.map(m => parseInt(m.plugin_member_number)).filter(n => !isNaN(n))
    return String(Math.max(...nums, 0) + 1)
  }

  async function submit() {
    if (!firstName || !lastName || !memberType) { setStatusType('error'); setStatus('First name, last name, and member type are required.'); return }
    if (isCorporate && !connectedMember) { setStatusType('error'); setStatus('Corporate members require a connected member.'); return }
    setLoading(true)
    try {
      const member_number = generateMemberNumber()
      await callApi('add_member_full', { name: `${firstName} ${lastName}`, member_number, first_name: firstName, last_name: lastName, member_type: memberType, elite_status: eliteStatus, email, revenue_decision: revenueDecision, connected_member_number: connectedMember?.plugin_member_number || null })
      await onDataChange()
      setFirstName(''); setLastName(''); setEmail(''); setMemberType(''); setConnectedMember(null); setConnectedSearch('')
      setStatusType('success'); setStatus(`Member created with number ${member_number}`)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>First Name *</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>Last Name *</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={labelStyle}>Member Type *</label>
          <select value={memberType} onChange={e => setMemberType(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
            <option value="">-- Select --</option>
            {MEMBER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {isCorporate && (
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <label style={labelStyle}>Connected Member *</label>
          <input value={connectedSearch} onChange={e => { setConnectedSearch(e.target.value); setConnectedMember(null) }} placeholder="Search by name or number..." style={inputStyle} />
          {connectedSearch && !connectedMember && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0d2a6e', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
              {allMembers.filter(m => m.name?.toLowerCase().includes(connectedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(connectedSearch.toLowerCase())).map(m => (
                <div key={m.plugin_member_number} onClick={() => { setConnectedMember(m); setConnectedSearch(m.name + ' (' + m.plugin_member_number + ')') }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '14px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  {m.name} <span style={{ color: '#8bacc8' }}>({m.plugin_member_number})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={labelStyle}>Status</label>
          <select value={eliteStatus} onChange={e => setEliteStatus(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
            {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={labelStyle}>Revenue Decision</label>
          <select value={revenueDecision} onChange={e => setRevenueDecision(e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
            <option value="Revenue Share">Revenue Share</option>
            <option value="Money Mapping">Money Mapping</option>
          </select>
        </div>
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
        {loading ? 'Creating...' : 'Create Advisor'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

function MemberProfile({ member, allMembers, onDataChange, activeSection }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const activeTab = activeSection === 'profile_edit' ? 'edit' : activeSection === 'profile_history' ? 'history' : 'details'
  const [typeHistory, setTypeHistory] = useState([])
  const [corporateMembers, setCorporateMembers] = useState([])
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [connectedSearch, setConnectedSearch] = useState('')
  const [showConnectedSearch, setShowConnectedSearch] = useState(false)

  useEffect(() => { loadProfile() }, [member.plugin_member_number])

  async function loadProfile() {
    setLoading(true)
    try {
      const data = await callApi('member_profile_load', { member_number: member.plugin_member_number })
      setProfile(data.profile || { member_number: member.plugin_member_number, first_name: member.name?.split(' ')[0] || '', last_name: member.name?.split(' ').slice(1).join(' ') || '', elite_status: 'Active', member_type: '', email: '', suspended: false, paused: false, revenue_decision: 'Revenue Share', stripe_account_id: '', connected_member_number: null, connection_type: '', notes: '' })
      setTypeHistory(data.type_history || [])
      setCorporateMembers(allMembers.filter(m => m.plugin_member_number?.startsWith(member.plugin_member_number + '-C') || m.plugin_member_number?.startsWith(member.plugin_member_number + '-FC')))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function update(key, val) { setProfile(p => ({ ...p, [key]: val })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      await callApi('member_profile_save', { profile })
      setDirty(false)
      setStatusType('success'); setStatus('Saved!')
      setTimeout(() => setStatus(''), 4000)
      await loadProfile()
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setSaving(false) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', color: '#8bacc8', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }
  const subTabStyle = (active) => ({ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent', color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' })
  const CONNECTION_TYPES = ['No Connection', '5% - Regular Advisor', '10% - Accredited Introducer', '10% - Accredited Mentor', '20% - Accredited Introducer + Mentor']
  const statusColors = { Active: '#27ae60', Lost: '#e74c3c', Removed: '#8bacc8' }

  if (loading) return <div style={{ padding: '40px', color: '#8bacc8', textAlign: 'center' }}>Loading profile...</div>
  if (!profile) return null

  const connectedMemberObj = allMembers.find(m => m.plugin_member_number === profile.connected_member_number)

  return (
    <div>
      

      {activeTab === 'details' && (
        <div>
          {profile.stripe_account_id && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Stripe Account</div><div style={{ fontSize: '14px', color: '#8bacc8', fontFamily: 'monospace', marginTop: '4px' }}>{profile.stripe_account_id}</div>
            </div>
          )}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><div style={labelStyle}>Join Date</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{profile.join_date ? profile.join_date.split('T')[0] : '—'}</div></div>
              {(profile.elite_status === 'Lost' || profile.elite_status === 'Removed') && <div style={{ flex: 1, minWidth: '140px' }}><div style={labelStyle}>Leave Date</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{profile.leave_date ? profile.leave_date.split('T')[0] : '—'}</div></div>}
              <div style={{ flex: 2, minWidth: '200px' }}><div style={labelStyle}>Email</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{profile.email || '—'}</div></div>
              <div style={{ flex: 1, minWidth: '160px' }}><div style={labelStyle}>Revenue Decision</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{profile.revenue_decision || '—'}</div></div>
            </div>
            {(profile.vfo_certified_date || profile.vfo_accredited_date) && (
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: '16px' }}>
                {profile.vfo_certified_date && <div><div style={{ fontSize: '15px', color: '#27ae60', fontWeight: '600' }}>✓ VFO Certified</div><div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '2px' }}>{profile.vfo_certified_date.split('T')[0]}</div></div>}
                {profile.vfo_accredited_date && <div><div style={{ fontSize: '15px', color: '#5b9fe6', fontWeight: '600' }}>✓ VFO Accredited</div><div style={{ fontSize: '11px', color: '#8bacc8', marginTop: '2px' }}>{profile.vfo_accredited_date.split('T')[0]}</div></div>}
              </div>
            )}
          </div>
          
          {corporateMembers.length > 0 && (
            <div style={sectionStyle}>
              <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Corporate Members</div>
              {corporateMembers.map(cm => <div key={cm.plugin_member_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}><span style={{ fontSize: '14px', color: '#fff' }}>{cm.name}</span><span style={{ fontSize: '13px', color: '#8bacc8' }}>{cm.plugin_member_number}</span></div>)}
            </div>
          )}
          {connectedMemberObj && !CORPORATE_TYPES.includes(member.member_type) && (
            <div style={sectionStyle}>
              <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Connected Member</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#fff' }}>{connectedMemberObj.name}</span>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '13px', color: '#8bacc8' }}>{connectedMemberObj.plugin_member_number}</div>{profile.connection_type && <div style={{ fontSize: '12px', color: '#5b9fe6', marginTop: '2px' }}>{profile.connection_type}</div>}</div>
              </div>
            </div>
          )}
          {profile.notes && <div style={sectionStyle}><div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Notes</div><p style={{ fontSize: '14px', color: '#fff', lineHeight: '1.6', margin: 0 }}>{profile.notes}</p></div>}
        </div>
      )}

      {activeTab === 'edit' && (
        <>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Basic Info</div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name</label><input value={profile.first_name || ''} onChange={e => update('first_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name</label><input value={profile.last_name || ''} onChange={e => update('last_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 2, minWidth: '200px' }}><label style={labelStyle}>Email</label><input value={profile.email || ''} onChange={e => update('email', e.target.value)} type="email" style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '0', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={labelStyle}>Member Type</label>
                <select value={profile.member_type || ''} onChange={e => update('member_type', e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  <option value="">-- Select --</option>
                  {MEMBER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={labelStyle}>Status</label>
                <select value={profile.elite_status || 'Active'} onChange={e => update('elite_status', e.target.value)} style={{ ...inputStyle, background: '#0d2a6e' }}>
                  {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Join Date</label><input type="date" value={profile.join_date || ''} onChange={e => update('join_date', e.target.value)} style={inputStyle} /></div>
              {(profile.elite_status === 'Lost' || profile.elite_status === 'Removed') && <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Leave Date</label><input type="date" value={profile.leave_date || ''} onChange={e => update('leave_date', e.target.value)} style={inputStyle} /></div>}
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Settings</div>
            <div style={rowStyle}>
              <div><div style={{ fontSize: '14px', color: '#fff' }}>Suspended</div><div style={{ fontSize: '12px', color: '#8bacc8' }}>Stops all active processing</div></div>
              <div onClick={() => update('suspended', !profile.suspended)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: profile.suspended ? '#e74c3c' : 'rgba(255,255,255,0.15)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: profile.suspended ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <div><div style={{ fontSize: '14px', color: '#fff' }}>Paused</div><div style={{ fontSize: '12px', color: '#8bacc8' }}>Temporarily pauses activity</div></div>
              <div onClick={() => update('paused', !profile.paused)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: profile.paused ? '#f39c12' : 'rgba(255,255,255,0.15)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: profile.paused ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Revenue & Stripe</div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Revenue Decision</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {['Revenue Share', 'Money Mapping'].map(v => (
                  <button key={v} onClick={() => update('revenue_decision', v)} style={{ padding: '8px 18px', borderRadius: '6px', border: `1px solid ${profile.revenue_decision === v ? '#5b9fe6' : 'rgba(255,255,255,0.2)'}`, background: profile.revenue_decision === v ? 'rgba(91,159,230,0.15)' : 'transparent', color: profile.revenue_decision === v ? '#5b9fe6' : '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Stripe Account ID</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input value={profile.stripe_account_id || ''} onChange={e => update('stripe_account_id', e.target.value)} placeholder="acct_..." style={inputStyle} />
                <button style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Send Request</button>
              </div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Connected Member</div>
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={labelStyle}>Search Member</label>
              <input
                value={connectedMemberObj && !showConnectedSearch ? `${connectedMemberObj.name} (${connectedMemberObj.plugin_member_number})` : connectedSearch}
                onChange={e => { setConnectedSearch(e.target.value); setShowConnectedSearch(true); if (!e.target.value) update('connected_member_number', null) }}
                placeholder="Search by name or number..."
                style={{ ...inputStyle, marginTop: '6px' }}
                onFocus={() => setShowConnectedSearch(true)}
              />
              {showConnectedSearch && connectedSearch && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0d2a6e', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                  {allMembers.filter(m => m.plugin_member_number !== member.plugin_member_number && (m.name?.toLowerCase().includes(connectedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(connectedSearch.toLowerCase()))).map(m => (
                    <div key={m.plugin_member_number} onClick={() => { update('connected_member_number', m.plugin_member_number); setConnectedSearch(''); setShowConnectedSearch(false) }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '14px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {m.name} <span style={{ color: '#8bacc8' }}>({m.plugin_member_number})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Connection Type</label>
              <select value={profile.connection_type || ''} onChange={e => update('connection_type', e.target.value)} style={{ ...inputStyle, background: '#0d2a6e', marginTop: '6px' }}>
                <option value="">-- Select --</option>
                {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>VFO Certification</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Certified Date</label><input type="date" value={profile.vfo_certified_date || ''} onChange={e => update('vfo_certified_date', e.target.value || null)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Accredited Date</label><input type="date" value={profile.vfo_accredited_date || ''} onChange={e => update('vfo_accredited_date', e.target.value || null)} style={inputStyle} /></div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Notes</div>
            <textarea value={profile.notes || ''} onChange={e => update('notes', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ position: 'sticky', bottom: 0, background: '#073991', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {dirty && <span style={{ fontSize: '13px', color: '#d4af37' }}>You have unsaved changes</span>}
            <button onClick={save} disabled={saving} style={{ padding: '10px 28px', borderRadius: '8px', background: saving ? '#1a4a9e' : '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {status && <span style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px' }}>{status}</span>}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Member Type History</div>
          {typeHistory.length === 0
            ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No type changes recorded yet.</p>
            : typeHistory.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ textAlign: 'left' }}><span style={{ color: '#8bacc8', fontSize: '13px' }}>{h.old_type}</span><span style={{ color: '#8bacc8', margin: '0 8px' }}>→</span><span style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{h.new_type}</span></div>
                <div style={{ fontSize: '12px', color: '#8bacc8' }}>{new Date(h.changed_at).toLocaleDateString()}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

function ComingSoon({ title }) {
  return <div style={{ textAlign: 'center', padding: '60px 20px' }}><p style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#ffffff', marginBottom: '12px' }}>{title}</p><p style={{ fontSize: '14px', color: '#8bacc8' }}>Coming soon.</p></div>
}

function MemberSpecialists({ member, allExperts, allExclusionMap, onDataChange }) {
  const excluded = allExclusionMap[member.plugin_member_number] || []
  const [enabled, setEnabled] = useState(() => { const set = {}; allExperts.forEach(e => { set[e.id] = !excluded.includes(e.id) }); return set })
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  const enabledCount = Object.values(enabled).filter(Boolean).length
  const filtered = search ? allExperts.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : allExperts

  function toggle(id) { setEnabled(p => ({ ...p, [id]: !p[id] })); setDirty(true) }
  function enableAll() { const s = {}; allExperts.forEach(e => s[e.id] = true); setEnabled(s); setDirty(true) }
  function disableAll() { const s = {}; allExperts.forEach(e => s[e.id] = false); setEnabled(s); setDirty(true) }

  async function save() {
    const newExcluded = allExperts.filter(e => !enabled[e.id]).map(e => e.id)
    try {
      await callApi('save_member', { member_number: member.plugin_member_number, exclusions: newExcluded })
      await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }

  return (
    <div>
      <p style={{ color: '#8bacc8', fontSize: '13px', marginBottom: '20px', fontStyle: 'italic' }}>Changes here affect which specialists appear in this member's VFO Showroom and Website Plugin.</p>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
        <div><div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>{enabledCount}</div><div style={{ fontSize: '11px', color: '#8bacc8', letterSpacing: '1px' }}>ENABLED</div></div>
        <div><div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>{allExperts.length}</div><div style={{ fontSize: '11px', color: '#8bacc8', letterSpacing: '1px' }}>TOTAL</div></div>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search specialists..." style={{ ...inputStyle, marginBottom: '12px' }} />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={enableAll} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Enable All</button>
        <button onClick={disableAll} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '13px', cursor: 'pointer' }}>Disable All</button>
      </div>
      <div style={{ marginBottom: '8px' }}>
        {filtered.map(expert => (
          <div key={expert.id} onClick={() => toggle(expert.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }}>
                {expert.headshot_image && <img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', color: '#fff' }}>{expert.name}</div>
                <div style={{ fontSize: '12px', color: '#8bacc8' }}>{expert.short_bio}</div>
              </div>
            </div>
            <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${enabled[expert.id] ? '#5b9fe6' : 'rgba(255,255,255,0.2)'}`, background: enabled[expert.id] ? '#5b9fe6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {enabled[expert.id] && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'sticky', bottom: 0, background: '#073991', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {dirty && <span style={{ fontSize: '13px', color: '#d4af37' }}>You have unsaved changes</span>}
        <button onClick={save} style={{ padding: '10px 28px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Save Changes</button>
        {status && <span style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px' }}>{status}</span>}
      </div>
    </div>
  )
}

function MemberGC({ member }) {
  const [gcTab, setGcTab] = useState('dashboard')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [addAmount, setAddAmount] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  useEffect(() => { loadGC() }, [member.plugin_member_number])

  async function loadGC() {
    try {
      const [bal, trans, red] = await Promise.all([
        callApi('gc_load_balance', { member_number: member.plugin_member_number }),
        callApi('gc_load_transactions', { member_number: member.plugin_member_number }),
        callApi('gc_load_redemptions', { member_number: member.plugin_member_number }),
      ])
      setBalance(bal.balance || 0)
      setTransactions(trans.transactions || [])
      setRedemptions(red.redemptions || [])
    } catch (err) { console.error(err) }
  }

  async function addCredits() {
    if (!addAmount) return
    try {
      await callApi('gc_add_credits', { member_number: member.plugin_member_number, amount: parseInt(addAmount), description: addDesc })
      setAddAmount(''); setAddDesc('')
      setStatusType('success'); setStatus('Credits added!')
      setTimeout(() => setStatus(''), 4000)
      loadGC()
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const subTabStyle = (active) => ({ padding: '10px 18px', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #5b9fe6' : '2px solid transparent', color: active ? '#fff' : '#8bacc8', fontSize: '13px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' })
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
        <button style={subTabStyle(gcTab === 'dashboard')} onClick={() => setGcTab('dashboard')}>Dashboard</button>
        <button style={subTabStyle(gcTab === 'details')} onClick={() => setGcTab('details')}>Member Details</button>
      </div>
      {gcTab === 'dashboard' && (
        <>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...sectionStyle, flex: 1, textAlign: 'center' }}>
              <p style={{ color: '#8bacc8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Credit Balance</p>
              <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '42px', color: '#fff', margin: 0 }}>{balance}</p>
            </div>
            <div style={{ ...sectionStyle, flex: 1 }}>
              <p style={{ color: '#8bacc8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Quick Stats</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}><span style={{ color: '#8bacc8', fontSize: '13px' }}>Total Redemptions</span><span style={{ color: '#fff', fontWeight: '600' }}>{redemptions.length}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><span style={{ color: '#8bacc8', fontSize: '13px' }}>Total Spent</span><span style={{ color: '#fff', fontWeight: '600' }}>{redemptions.reduce((s, r) => s + (r.credits || 0), 0)}</span></div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Credits</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Amount</label><input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="e.g. 100" min="1" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Description (optional)</label><input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="e.g. Monthly allocation" style={inputStyle} /></div>
              <button onClick={addCredits} style={{ padding: '12px 24px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Credits</button>
            </div>
            {status && <p style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
          </div>
        </>
      )}
      {gcTab === 'details' && (
        <>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Transaction History</div>
            {transactions.length === 0 ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No transactions yet.</p> : transactions.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ textAlign: 'left' }}><span style={{ fontSize: '13px', color: '#fff' }}>{t.description}</span><span style={{ fontSize: '11px', color: '#8bacc8', marginLeft: '8px' }}>{new Date(t.created_at).toLocaleDateString()}</span></div>
                <span style={{ color: t.amount > 0 ? '#27ae60' : '#e74c3c', fontWeight: '600', fontSize: '14px' }}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
              </div>
            ))}
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Redemption History</div>
            {redemptions.length === 0 ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No redemptions yet.</p> : redemptions.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ textAlign: 'left' }}><span style={{ fontSize: '13px', color: '#fff' }}>{r.service_name || 'Service'}</span><span style={{ fontSize: '11px', color: '#8bacc8', marginLeft: '8px' }}>{new Date(r.created_at).toLocaleDateString()}</span></div>
                <span style={{ color: '#e74c3c', fontWeight: '600', fontSize: '14px' }}>-{r.credits}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MemberVault({ member }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  useEffect(() => { loadFiles() }, [member.plugin_member_number])

  async function loadFiles() {
    try {
      const data = await callApi('vault_list', { member_number: member.plugin_member_number })
      setFiles(data.files || [])
    } catch (err) { console.error(err) }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      await callApi('vault_upload', { member_number: member.plugin_member_number, filename: file.name, file_base64: base64, content_type: file.type })
      setStatusType('success'); setStatus('File uploaded!')
      setTimeout(() => setStatus(''), 4000)
      loadFiles()
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setUploading(false) }
  }

  async function deleteFile(filename) {
    try { await callApi('vault_delete', { member_number: member.plugin_member_number, filename }); loadFiles() }
    catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>The Vault</div>
        <p style={{ color: '#8bacc8', fontSize: '13px', marginBottom: '20px' }}>Upload and manage files for this member.</p>
        <label style={{ display: 'block', border: '2px dashed rgba(255,255,255,0.25)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: '20px' }}>
          <p style={{ color: '#8bacc8', fontSize: '14px', marginBottom: '8px' }}>Click to browse files</p>
          <p style={{ color: '#5a8ab5', fontSize: '12px' }}>Max 50MB per file</p>
          <input type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </label>
        {uploading && <p style={{ color: '#8bacc8', fontSize: '14px' }}>Uploading...</p>}
        {status && <p style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px' }}>{status}</p>}
      </div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Member Files</div>
        {files.length === 0 ? <p style={{ color: '#5a8ab5', fontSize: '14px' }}>No files uploaded yet.</p> : files.map(f => (
          <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '14px', color: '#fff' }}>{f.name}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', color: '#8bacc8', fontSize: '12px', textDecoration: 'none' }}>Download</a>
              <button onClick={() => deleteFile(f.name)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberSettings({ member, onDataChange }) {
  const [loginLoading, setLoginLoading] = useState(true)
  const [existingLogin, setExistingLogin] = useState(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPasscode, setLoginPasscode] = useState('')
  const [loginStatus, setLoginStatus] = useState('')
  const [loginStatusType, setLoginStatusType] = useState('success')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState('')

  useEffect(() => { loadLogin() }, [member.plugin_member_number])

  async function loadLogin() {
    setLoginLoading(true)
    try {
      const data = await callApi('load_member_login', { member_number: member.plugin_member_number })
      setExistingLogin(data.login || null)
      if (data.login) setLoginEmail(data.login.email)
    } catch (err) { console.error(err) }
    finally { setLoginLoading(false) }
  }

  function showLoginStatus(type, msg) { setLoginStatusType(type); setLoginStatus(msg); setTimeout(() => setLoginStatus(''), 4000) }

  async function createLogin() {
    if (!loginEmail || !loginPasscode) { showLoginStatus('error', 'Email and passcode are required.'); return }
    try { await callApi('create_member_login', { member_number: member.plugin_member_number, email: loginEmail, passcode: loginPasscode, name: member.name }); showLoginStatus('success', 'Login created!'); loadLogin() }
    catch (err) { showLoginStatus('error', err.message) }
  }

  async function updateLogin() {
    try { await callApi('update_member_login', { member_number: member.plugin_member_number, email: loginEmail, passcode: loginPasscode || undefined }); showLoginStatus('success', 'Login updated!'); loadLogin() }
    catch (err) { showLoginStatus('error', err.message) }
  }

  async function deleteMember() {
    try { await callApi('delete_member', { member_number: member.plugin_member_number }); await onDataChange() }
    catch (err) { setDeleteStatus(err.message) }
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Member Login</div>
        {loginLoading && <p style={{ color: '#8bacc8', fontSize: '14px' }}>Loading...</p>}
        {!loginLoading && !existingLogin && (
          <>
            <p style={{ color: '#5a8ab5', fontSize: '14px', marginBottom: '16px' }}>No login set up. Create one to give this member portal access.</p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Email *</label><input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="member@example.com" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Passcode *</label><input value={loginPasscode} onChange={e => setLoginPasscode(e.target.value)} placeholder="Login passcode" style={inputStyle} /></div>
            </div>
            <button onClick={createLogin} style={{ padding: '10px 24px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Create Login</button>
          </>
        )}
        {!loginLoading && existingLogin && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>Email</label><input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }}>New Passcode (leave blank to keep)</label><input value={loginPasscode} onChange={e => setLoginPasscode(e.target.value)} placeholder="New passcode" style={inputStyle} /></div>
            </div>
            <button onClick={updateLogin} style={{ padding: '10px 24px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Update Login</button>
          </>
        )}
        {loginStatus && <p style={{ color: loginStatusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{loginStatus}</p>}
      </div>
      <div style={{ ...sectionStyle, border: '1px solid rgba(231,76,60,0.3)' }}>
        <div style={{ fontSize: '13px', color: '#e74c3c', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Danger Zone</div>
        {!deleteConfirm
          ? <button onClick={() => setDeleteConfirm(true)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontSize: '14px', cursor: 'pointer' }}>Delete Member</button>
          : <div>
              <p style={{ color: '#e74c3c', fontSize: '14px', marginBottom: '12px' }}>Are you sure? This will remove all settings and exclusions. This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={deleteMember} style={{ padding: '10px 24px', borderRadius: '8px', background: '#e74c3c', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Yes, Delete</button>
                <button onClick={() => setDeleteConfirm(false)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#8bacc8', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              </div>
              {deleteStatus && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{deleteStatus}</p>}
            </div>
        }
      </div>
    </div>
  )
}