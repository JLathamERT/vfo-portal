import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi } from '../lib/api'
import MemberWebsitePlugin from '../components/shared/MemberWebsitePlugin'
import MemberVault from '../components/shared/MemberVault'
import MemberGCMarketplace from '../components/member/MemberGCMarketplace'
import MemberMSMTracking from '../components/member/MemberMSMTracking'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'

export default function MemberPortal() {
  const navigate = useNavigate()
  const session = getSession()
  const [activeTab, setActiveTab] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [memberData, setMemberData] = useState(null)
  const [allExperts, setAllExperts] = useState([])
  const [exclusions, setExclusions] = useState([])
  const [loading, setLoading] = useState(true)
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [allPrograms, setAllPrograms] = useState([])

  useEffect(() => {
    if (!session || session.role !== 'member') { navigate('/member/login'); return }
    loadData()
  }, [])

  async function loadData() {
    try {
      const [data, progData, enabledData] = await Promise.all([
        callApi('load_data'),
        callApi('msm_load_programs'),
        callApi('msm_load_enabled_programs', { member_number: session.member_number }),
      ])
      const me = (data.members || []).find(m => m.member_number === session.member_number)
      setMemberData(me || null)
      setAllExperts(data.experts || [])
      const myExclusions = (data.exclusions || [])
        .filter(e => e.member_number === session.member_number)
        .map(e => e.expert_id)
      setExclusions(myExclusions)
      setAllPrograms(progData.programs || [])
      setEnabledPrograms(enabledData.enabled || [])
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  function signOut() { clearSession(); navigate('/') }
  function handleTitleClick() { setShowSettings(false); setActiveTab(null) }

  if (!session) return null

  const PROGRAM_KEYS = { 'VFO Holistic Planning': 'msm_holistic', 'Partnership Fast Track': 'msm_partnership', 'VFO Tax Planning': 'msm_tax', 'Advanced Coaching': 'msm_coaching' }

  const enabledProgramTabs = allPrograms
    .filter(p => enabledPrograms.some(e => e.program_id === p.id))
    .map(p => PROGRAM_KEYS[p.name])
    .filter(Boolean)

  const tabs = ['profile', 'msm_home', ...enabledProgramTabs, 'specialists', 'showroom', 'website', 'ciq', 'growthplan', 'gc', 'vault']
  const tabLabels = {
    profile: 'Profile', msm_home: 'MSM Home',
    msm_holistic: 'Holistic Planning', msm_partnership: 'Partnership Fast Track',
    msm_tax: 'Tax Planning', msm_coaching: 'Advanced Coaching',
    specialists: 'Specialists', showroom: 'Showroom', website: 'Website Plugin',
    ciq: 'CIQ', growthplan: 'Growth Plan', gc: 'GC Marketplace', vault: 'The Vault'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#073991', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#0a2260', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '20px', cursor: 'pointer' }} onClick={handleTitleClick}>VFO Portal</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#8bacc8' }}>{session.name}</span>
          <button onClick={() => { setShowSettings(true); setActiveTab(null) }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {showSettings && <MemberSettings session={session} />}

      {!showSettings && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 24px', background: '#0a2260', position: 'relative', zIndex: 100 }}>
            <button onClick={() => setActiveTab('profile')} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === 'profile' ? '2px solid #5b9fe6' : '2px solid transparent', color: activeTab === 'profile' ? '#fff' : '#8bacc8', fontSize: '14px', fontWeight: activeTab === 'profile' ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>Profile</button>
            <NavDropdown
              label="MSM Tracking"
              isActive={activeTab === 'msm_home' || activeTab?.startsWith('msm_')}
              activeTab={activeTab}
              options={[
                { key: 'msm_home', label: 'MSM Home' },
                ...allPrograms
                  .filter(p => enabledPrograms.some(e => e.program_id === p.id))
                  .map(p => ({ key: { 'VFO Holistic Planning': 'msm_holistic', 'Partnership Fast Track': 'msm_partnership', 'VFO Tax Planning': 'msm_tax', 'Advanced Coaching': 'msm_coaching' }[p.name], label: p.name }))
                  .filter(o => o.key)
              ]}
              onSelect={setActiveTab}
            />
            {['specialists','showroom','website','ciq','growthplan','gc','vault'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #5b9fe6' : '2px solid transparent', color: activeTab === tab ? '#fff' : '#8bacc8', fontSize: '14px', fontWeight: activeTab === tab ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          {!activeTab && (
            <div style={{ textAlign: 'center', padding: '60px 0 0' }}>
              <p style={{ fontSize: '14px', color: '#8bacc8', marginBottom: '8px' }}>Welcome back</p>
              <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: '#fff', margin: 0 }}>{session.name}</p>
            </div>
          )}

          {loading && activeTab && <div style={{ textAlign: 'center', padding: '60px', color: '#8bacc8' }}>Loading...</div>}

          {!loading && activeTab === 'profile' && memberData && (
            <MemberProfile member={memberData} />
          )}
          {!loading && (activeTab === 'msm_home' || activeTab?.startsWith('msm_')) && memberData && (
            <MemberMSMTracking member={memberData} activeTab={activeTab} onNavigate={setActiveTab} />
          )}
          {!loading && activeTab === 'specialists' && memberData && (
            <MemberSpecialists member={memberData} allExperts={allExperts} exclusions={exclusions} onDataChange={loadData} />
          )}
          {!loading && activeTab === 'showroom' && <ComingSoon title="Showroom" />}
          {!loading && activeTab === 'website' && memberData && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
              <MemberWebsitePlugin member={memberData} onDataChange={loadData} />
            </div>
          )}
          {!loading && activeTab === 'ciq' && <ComingSoon title="CIQ" />}
          {!loading && activeTab === 'growthplan' && <ComingSoon title="Growth Plan" />}
          {!loading && activeTab === 'gc' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
              <MemberGCMarketplace memberNumber={session.member_number} />
            </div>
          )}
          {!loading && activeTab === 'vault' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
              <MemberVault memberNumber={session.member_number} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NavDropdown({ label, isActive, options, activeTab, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { closeTimer.current = setTimeout(() => setOpen(false), 200) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #5b9fe6' : '2px solid transparent', color: isActive ? '#fff' : '#8bacc8', fontSize: '14px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: '#0d2a6e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', minWidth: '200px', zIndex: 200, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: activeTab === opt.key ? 'rgba(91,159,230,0.15)' : 'transparent', border: 'none', color: activeTab === opt.key ? '#5b9fe6' : '#fff', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = activeTab === opt.key ? 'rgba(91,159,230,0.15)' : 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ComingSoon({ title }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: '#fff', marginBottom: '12px' }}>{title}</p>
      <p style={{ fontSize: '14px', color: '#8bacc8' }}>Coming soon.</p>
    </div>
  )
}

function MemberSpecialists({ member, allExperts, exclusions, onDataChange }) {
  const [enabled, setEnabled] = useState(() => {
    const set = {}
    allExperts.forEach(e => { set[e.id] = !exclusions.includes(e.id) })
    return set
  })
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
      await callApi('save_member', { member_number: member.member_number, exclusions: newExcluded })
      await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 24px 0' }}>
      <p style={{ color: '#8bacc8', fontSize: '13px', marginBottom: '20px', fontStyle: 'italic' }}>Changes here affect which specialists appear in your VFO Showroom and, if enabled, your Website Plugin.</p>
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

function MemberProfile({ member }) {
  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const labelStyle = { fontSize: '11px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }
  const statusColors = { Active: '#27ae60', Lost: '#e74c3c', Removed: '#8bacc8' }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div><div style={labelStyle}>Member Type</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{member.member_type || '—'}</div></div>
          <div><div style={labelStyle}>Status</div><div style={{ fontSize: '15px', color: statusColors[member.elite_status] || '#fff', marginTop: '4px', fontWeight: '600' }}>{member.elite_status || '—'}</div></div>
          <div><div style={labelStyle}>Member Number</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px', fontFamily: 'monospace' }}>{member.member_number}</div></div>
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div><div style={labelStyle}>Join Date</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{member.join_date ? member.join_date.split('T')[0] : '—'}</div></div>
          <div><div style={labelStyle}>Email</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{member.email || '—'}</div></div>
          <div><div style={labelStyle}>Revenue Decision</div><div style={{ fontSize: '15px', color: '#fff', marginTop: '4px' }}>{member.revenue_decision || '—'}</div></div>
        </div>
      </div>
    </div>
  )
}

function MemberSettings({ session }) {
  const [email, setEmail] = useState(session.email || '')
  const [newPasscode, setNewPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  function showStatus(type, msg) { setStatusType(type); setStatus(msg); setTimeout(() => setStatus(''), 4000) }

  async function update() {
    if (newPasscode && newPasscode !== confirmPasscode) { showStatus('error', 'Passcodes do not match.'); return }
    try {
      await callApi('update_member_login', { member_number: session.member_number, email, passcode: newPasscode || undefined })
      setNewPasscode(''); setConfirmPasscode('')
      showStatus('success', 'Account updated!')
    } catch (err) { showStatus('error', err.message) }
  }

  const sectionStyle = { background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '12px', color: '#8bacc8', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: '#8bacc8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Account Settings</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>New Passcode</label>
            <input value={newPasscode} onChange={e => setNewPasscode(e.target.value)} placeholder="Leave blank to keep current" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Confirm Passcode</label>
            <input value={confirmPasscode} onChange={e => setConfirmPasscode(e.target.value)} placeholder="Confirm new passcode" style={inputStyle} />
          </div>
        </div>
        <button onClick={update} style={{ padding: '10px 28px', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Update</button>
        {status && <p style={{ color: statusType === 'success' ? '#27ae60' : '#ff6b6b', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
      </div>
    </div>
  )
}