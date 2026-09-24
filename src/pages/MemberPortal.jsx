import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi, loadCachedData, loadCachedAction, clearCachedData } from '../lib/api'
import MemberWebsitePlugin from '../components/shared/MemberWebsitePlugin'
import MemberVault from '../components/shared/MemberVault'
import MemberCIQ from '../components/shared/MemberCIQ'
import MemberGCMarketplace from '../components/member/MemberGCMarketplace'
import MemberMSMTracking from '../components/member/MemberMSMTracking'
import MemberShowroom from '../components/member/MemberShowroom'
import MemberGrowthPlan from '../components/member/MemberGrowthPlan'
import VfoWordmark from '../components/shared/VfoWordmark'
import NotificationBell from '../components/NotificationBell'
import AppearanceCard from '../components/shared/AppearanceCard'
import { HeroAvatar } from '../components/shared/TrackKit'
import { usePortalTheme } from '../lib/theme'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
// Prepend https:// to a bare domain so member website links resolve as absolute.
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
import vfoCertifiedSeal from '../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../assets/vfo-accredited-emblem.png'
import { MemberProfileSkeleton, MemberEditProfileSkeleton } from '../components/shared/Skeleton'
import { CORPORATE_TYPES, leadMemberNumberOf, findLeadMember } from '../components/shared/corporateMember'
import { formatDate } from '../lib/dates'
import MemberBrandingCard from '../components/shared/MemberBrandingCard'
import MemberProfileDetails, { PayoutStatusLine } from '../components/shared/MemberProfileDetails'
import ImageCropModal from '../components/admin/ImageCropModal'

export default function MemberPortal() {
  const navigate = useNavigate()
  const session = getSession()
  usePortalTheme()
  const [activeTab, setActiveTab] = useState(() => {
    const qs = new URLSearchParams(window.location.search)
    // Land returning Stripe buyers (/member?gc_success=1) on the GC Marketplace.
    if (qs.get('gc_success') === '1') return 'gc'
    // Tax intake (2026-09-17): the $500 deposit Checkout returns to
    // ?tab=msm_tax&intake=<id>&paid=1, and the Holistic "complete the form"
    // email opens ?tab=msm_tax&intake_client=<id>. Either one lands on the Tax
    // Planning tab regardless of the tab the member last used.
    if (qs.get('intake') || qs.get('intake_client')) return 'msm_tax'
    return sessionStorage.getItem('memberActiveTab') || 'profile'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [memberData, setMemberData] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [memberConnections, setMemberConnections] = useState([])
  const [allExperts, setAllExperts] = useState([])
  const [exclusions, setExclusions] = useState([])
  const [ecoMap, setEcoMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [features, setFeatures] = useState({})
  const [allPrograms, setAllPrograms] = useState([])

  useEffect(() => {
    if (!session || session.role !== 'member') { navigate('/member/login'); return }
    if (sessionStorage.getItem('memberOpenView') === 'settings') {
      sessionStorage.removeItem('memberOpenView')
      setShowSettings(true); setActiveTab(null)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab) sessionStorage.setItem('memberActiveTab', activeTab)
    else sessionStorage.removeItem('memberActiveTab')
  }, [activeTab])

  async function loadData() {
    try {
      // loadData re-runs after saves (onDataChange) — clear any prior banner first.
      setLoadError(null)
      const [data, progData, enabledData] = await Promise.all([
        loadCachedData(),
        loadCachedAction('msm_load_programs'),
        callApi('msm_load_enabled_programs', { member_number: session.member_number }),
      ])
      const me = (data.members || []).find(m => m.member_number === session.member_number)
      setMemberData(me || null)
      // Full roster is kept only to name a corporate member's lead member.
      setAllMembers(data.members || [])
      setMemberConnections(data.member_connections || [])
      setAllExperts(data.experts || [])
      const myExclusions = (data.exclusions || [])
        .filter(e => e.member_number === session.member_number)
        .map(e => e.expert_id)
      setExclusions(myExclusions)
      const eco = {}
      ;(data.ecosystems || []).forEach(e => {
        if (!eco[e.expert_id]) eco[e.expert_id] = []
        eco[e.expert_id].push(e.name)
      })
      setEcoMap(eco)
      setAllPrograms(progData.programs || [])
      setEnabledPrograms(enabledData.enabled || [])
      setFeatures(enabledData.features || {})
    } catch (err) {
      console.error('Load error:', err)
      setLoadError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function signOut() { clearSession(); navigate('/') }
  function handleTitleClick() { setShowSettings(false); setActiveTab('profile') }

  if (!session) return null

  const TAX_PROGRAM_NAME = 'VFO Tax Planning'
  const taxIntakeEnabled = features.tax_intake === true
  const PROGRAM_KEYS = { 'VFO Holistic Planning': 'msm_holistic', 'Partnership Fast Track': 'msm_partnership', 'VFO Tax Planning': 'msm_tax', 'Advanced Coaching': 'msm_coaching', 'Standard Coaching': 'msm_standard' }
  // Canonical program order — matches the admin MSM Home program-toggle list.
  const PROGRAM_ORDER = ['VFO Holistic Planning', 'Partnership Fast Track', 'VFO Tax Planning', 'Advanced Coaching', 'Standard Coaching']
  // ANY member may start a tax client (decision 2026-09-17) — but only once Jake
  // flips portal_feature_flags.tax_intake. Until then VFO Tax Planning falls back
  // to the pre-unit-1 rule it shares with every other program: a
  // member_program_enabled row.
  const orderedEnabledPrograms = allPrograms
    .filter(p => enabledPrograms.some(e => e.program_id === p.id) || (taxIntakeEnabled && p.name === TAX_PROGRAM_NAME))
    .sort((a, b) => {
      const ia = PROGRAM_ORDER.indexOf(a.name), ib = PROGRAM_ORDER.indexOf(b.name)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

  const enabledProgramTabs = orderedEnabledPrograms.map(p => PROGRAM_KEYS[p.name]).filter(Boolean)

  const tabs = ['profile', 'msm_home', ...enabledProgramTabs, 'specialists', 'showroom', 'website', 'growthplan', 'ciq', 'gc', 'vault']
  const tabLabels = {
    profile: 'Profile', msm_home: 'MSM Home',
    msm_holistic: 'Holistic Planning', msm_partnership: 'Partnership Fast Track',
    msm_tax: 'Tax Planning', msm_coaching: 'Advanced Coaching', msm_standard: 'Standard Coaching',
    specialists: 'Specialists', showroom: 'Showroom', website: 'Website Plugin',
    ciq: 'CIQ', growthplan: 'Growth Plan', gc: 'GC Marketplace', vault: 'Vault'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={handleTitleClick} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Mounted exactly as TaxPlannerPortal.jsx mounts it. The member's
              rows are scoped server-side to their own login email — never the
              'admin'/'all' broadcasts (#259). */}
          <NotificationBell />
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name}</span>
          <button onClick={() => { setShowSettings(true); setActiveTab(null) }} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {showSettings && <MemberSettings session={session} />}

      {!showSettings && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', position: 'relative', zIndex: 100 }}>
            <NavDropdown
              label="Profile"
              isActive={activeTab === 'profile' || activeTab === 'profile_edit'}
              activeTab={activeTab}
              options={[{ key: 'profile', label: 'Profile' }, { key: 'profile_edit', label: 'Edit Profile' }]}
              onSelect={setActiveTab}
              onLabelClick={() => setActiveTab('profile')}
            />
            <NavDropdown
              label="MSM"
              isActive={activeTab === 'msm_home' || activeTab?.startsWith('msm_')}
              activeTab={activeTab}
              options={[
                { key: 'msm_home', label: 'MSM Home' },
                ...orderedEnabledPrograms
                  .map(p => ({ key: PROGRAM_KEYS[p.name], label: p.name }))
                  .filter(o => o.key)
              ]}
              onSelect={setActiveTab}
            />
            {['specialists','showroom','website','growthplan','ciq','gc','vault'].filter(tab => tab !== 'website' || memberData?.website_enabled).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #125ecc' : '2px solid transparent', color: activeTab === tab ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: activeTab === tab ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          {loadError && (
            <div style={{ maxWidth: '980px', margin: '20px auto 0', padding: '0 24px' }}>
              <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#d93025', marginBottom: '6px' }}>We couldn't load your portal</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', wordBreak: 'break-word' }}>{loadError}</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Please refresh the page — if this keeps happening, contact your VFO team.</div>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && activeTab && (activeTab === 'profile_edit' ? <MemberEditProfileSkeleton /> : <MemberProfileSkeleton />)}

          {!loading && activeTab === 'profile' && memberData && (
            <MemberProfile member={memberData} allMembers={allMembers} memberConnections={memberConnections} />
          )}
          {!loading && activeTab === 'profile_edit' && memberData && (
            <MemberEditProfile member={memberData} onSaved={() => { clearCachedData(); loadData() }} />
          )}
          {!loading && (activeTab === 'msm_home' || activeTab?.startsWith('msm_')) && memberData && (
            <MemberMSMTracking member={memberData} activeTab={activeTab} onNavigate={setActiveTab} />
          )}
          {!loading && activeTab === 'specialists' && memberData && (
            <MemberSpecialists member={memberData} allExperts={allExperts} exclusions={exclusions} ecoMap={ecoMap} onDataChange={loadData} />
          )}
          {!loading && activeTab === 'showroom' && <MemberShowroom experts={allExperts} exclusions={exclusions} ecoMap={ecoMap} showMemberServices showRevenueShare />}
          {!loading && activeTab === 'website' && memberData && memberData.website_enabled && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
              <MemberWebsitePlugin member={memberData} onDataChange={loadData} />
            </div>
          )}
          {!loading && activeTab === 'ciq' && (
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
              <MemberCIQ memberNumber={session.member_number} memberName={session.name || session.member_number} ciqEnabled={session.ciq_enabled} ciqVfosManaged={session.ciq_vfos_managed} isAdmin={false} />
            </div>
          )}
          {!loading && activeTab === 'growthplan' && (
            (memberData?.member_category === 'advisor' || memberData?.member_category === 'accountant')
              ? <MemberGrowthPlan memberNumber={session.member_number} variant={memberData?.member_category === 'accountant' ? 'accountant' : 'advisor'} />
              : <ComingSoon title="Growth Plan" />
          )}
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
          </div>
        </>
      )}
    </div>
  )
}

// The member's own Edit Profile page. Profile fields save through
// member_self_profile_save (the member's own row only; revenue decision, status
// and the rest stay admin-owned); Branding saves through member_branding_save.
function MemberEditProfile({ member, onSaved }) {
  const [row, setRow] = useState(null)
  const [form, setForm] = useState({ email: '', trading_name: '', website_url: '' })
  const [loadError, setLoadError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropState, setCropState] = useState(null)
  const [brandingKey, setBrandingKey] = useState(0)

  async function load() {
    try {
      const d = await callApi('member_profile_load', { member_number: member.member_number })
      const p = d?.profile || {}
      setRow(p)
      setForm({ email: p.email || '', trading_name: p.trading_name || '', website_url: p.website_url || '' })
      setDirty(false)
    } catch (err) { setLoadError(err?.message || 'Your profile could not be loaded') }
  }
  useEffect(() => { load() }, [member.member_number])

  function update(key, val) { setForm(f => ({ ...f, [key]: val })); setDirty(true); setStatus('') }

  function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCropState({ src: ev.target.result })
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true); setStatus('')
    try {
      const payload = { email: form.email, trading_name: form.trading_name, website_url: form.website_url }
      if (photoPreview) payload.headshot_base64 = photoPreview.split(',')[1]
      await callApi('member_self_profile_save', payload)
      setPhotoPreview(null)
      await load()
      setBrandingKey(k => k + 1)
      setStatusType('success'); setStatus('Saved!')
      onSaved()
    } catch (err) { setStatusType('error'); setStatus(err?.message || 'Something went wrong') }
    finally { setSaving(false) }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  if (loadError) return <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}><div style={sectionStyle}><div style={{ color: '#d93025', fontSize: '13px' }}>{loadError}</div></div></div>
  if (!row) return <MemberEditProfileSkeleton />

  const currentPhoto = photoPreview || (row.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(row.headshot_image) : null)
  const initials = `${row.first_name || ''} ${row.last_name || ''}`.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}>
      <div style={sectionStyle}>
        <div style={cardTitle}>Profile Picture</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ width: '110px', height: '110px', borderRadius: '50%', overflow: 'hidden', background: currentPhoto ? 'var(--vfo-tint)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: '1px solid var(--vfo-border-chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {currentPhoto
              ? <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: '#fff', fontSize: '30px', fontWeight: 700 }}>{initials || '?'}</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {currentPhoto ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
            </label>
            {currentPhoto && <button type="button" onClick={() => setCropState({ src: currentPhoto })} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Adjust / Zoom</button>}
          </div>
        </div>
        {photoPreview && <div style={{ fontSize: '12.5px', color: '#b08d26', fontWeight: 500, marginTop: '10px' }}>New photo selected. Click Save Changes to use it.</div>}
      </div>

      <div style={sectionStyle}>
        <div style={cardTitle}>Contact &amp; Company</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={labelStyle}>Work email (emails sent here)</label>
            <input value={form.email} onChange={e => update('email', e.target.value)} type="email" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={labelStyle}>Personal email (not emailed)</label>
            <input value={row.personal_email || ''} readOnly title="Ask the VFO team to change this" style={{ ...inputStyle, background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', cursor: 'not-allowed' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={labelStyle}>Company Name</label>
            <input value={form.trading_name} onChange={e => update('trading_name', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={labelStyle}>Website</label>
            <input value={form.website_url} onChange={e => update('website_url', e.target.value)} placeholder="https://example.com" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--vfo-page)', borderTop: '1px solid var(--vfo-border)', padding: '16px 0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 5 }}>
        {(dirty || photoPreview) && <span style={{ fontSize: '13px', color: '#b08d26', fontWeight: 500 }}>You have unsaved changes</span>}
        <button onClick={save} disabled={saving || !(dirty || photoPreview)} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: saving ? 'wait' : 'pointer', opacity: (dirty || photoPreview) ? 1 : 0.55 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
        {status && <span style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px' }}>{status}</span>}
      </div>

      <MemberBrandingCard memberNumber={member.member_number} mode="member" styles={{ sectionStyle, cardTitle }} reloadKey={brandingKey} />

      {cropState && <ImageCropModal src={cropState.src} onApply={dataUrl => { setPhotoPreview(dataUrl); setCropState(null) }} onCancel={() => setCropState(null)} />}
    </div>
  )
}

// onLabelClick (optional): clicking the tab's own label navigates too, so the
// first option is reachable without opening the menu (Profile uses it).
function NavDropdown({ label, isActive, options, activeTab, onSelect, onLabelClick }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { setOpen(false) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button onClick={onLabelClick ? () => { onLabelClick(); setOpen(false) } : undefined} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #125ecc' : '2px solid transparent', color: isActive ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '200px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: activeTab === opt.key ? 'rgba(0,149,255,0.15)' : 'transparent', border: 'none', color: activeTab === opt.key ? '#0095ff' : 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = activeTab === opt.key ? 'rgba(0,149,255,0.15)' : 'transparent'}>
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
      <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '12px' }}>{title}</p>
      <p style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>Coming soon.</p>
    </div>
  )
}

function MemberSpecialists({ member, allExperts, exclusions, ecoMap = {}, onDataChange }) {
  // Member Services specialists are internal-only (never shown to clients or in the
  // website plugin), so they aren't enable/disable-able — listed separately below.
  const isMemberService = (id) => (ecoMap[id] || []).includes('Member Services')
  const regularExperts = allExperts.filter(e => !isMemberService(e.id))
  const memberServiceExperts = allExperts.filter(e => isMemberService(e.id))
  const [enabled, setEnabled] = useState(() => {
    const set = {}
    regularExperts.forEach(e => { set[e.id] = !exclusions.includes(e.id) })
    return set
  })
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  const enabledCount = regularExperts.filter(e => enabled[e.id]).length
  const filtered = search ? regularExperts.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : regularExperts

  function toggle(id) { setEnabled(p => ({ ...p, [id]: !p[id] })); setDirty(true) }
  function enableAll() { const s = {}; regularExperts.forEach(e => s[e.id] = true); setEnabled(s); setDirty(true) }
  function disableAll() { const s = {}; regularExperts.forEach(e => s[e.id] = false); setEnabled(s); setDirty(true) }

  async function save() {
    // Only the public five drive exclusions; preserve any pre-existing Member Services exclusions untouched.
    const newExcluded = regularExperts.filter(e => !enabled[e.id]).map(e => e.id)
      .concat(exclusions.filter(id => isMemberService(id)))
    try {
      await callApi('member_save_exclusions', { member_number: member.member_number, exclusions: newExcluded })
      await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 24px 0' }}>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginBottom: '20px', fontStyle: 'italic' }}>Changes here affect which specialists appear in your VFO Showroom and, if enabled, your Website Plugin.</p>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
        <div><div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--vfo-ink)' }}>{enabledCount}</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', letterSpacing: '1px' }}>ENABLED</div></div>
        <div><div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--vfo-ink)' }}>{regularExperts.length}</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', letterSpacing: '1px' }}>TOTAL</div></div>
      </div>
      <input type="search" name="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search specialists..." style={{ ...inputStyle, marginBottom: '12px' }} />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={enableAll} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Enable All</button>
        <button onClick={disableAll} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Disable All</button>
      </div>
      <div style={{ marginBottom: '8px' }}>
        {filtered.map(expert => (
          <div key={expert.id} onClick={() => toggle(expert.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: '4px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-border)', flexShrink: 0 }}>
                {expert.headshot_image && <img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{expert.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{expert.short_bio}</div>
              </div>
            </div>
            <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${enabled[expert.id] ? '#0095ff' : 'var(--vfo-border-mid)'}`, background: enabled[expert.id] ? '#0095ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {enabled[expert.id] && <span style={{ color: 'var(--vfo-ink)', fontSize: '12px' }}>✓</span>}
            </div>
          </div>
        ))}
      </div>
      {memberServiceExperts.length > 0 && (
        <div style={{ marginTop: '20px', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Member Services</div>
          <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', fontStyle: 'italic', marginBottom: '10px' }}>Visible only to you — these specialists never appear in your clients' showrooms or your website plugin, so there is nothing to enable or disable.</p>
          {memberServiceExperts.map(expert => (
            <div key={expert.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: '4px', background: 'var(--vfo-tint)', border: '1px dashed var(--vfo-border-strong)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-border)', flexShrink: 0 }}>
                  {expert.headshot_image && <img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{expert.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{expert.short_bio}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--vfo-page)', borderTop: '1px solid var(--vfo-border)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {dirty && <span style={{ fontSize: '13px', color: '#b08d26', fontWeight: 500 }}>You have unsaved changes</span>}
        <button onClick={save} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Save Changes</button>
        {status && <span style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px' }}>{status}</span>}
      </div>
    </div>
  )
}

function MemberProfile({ member, allMembers = [], memberConnections = [] }) {
  // The member's own Stripe Connect setup state — a tag, never the account id
  // (member_my_connect_status is session-scoped and strips it).
  const [connectStatus, setConnectStatus] = useState(null)
  useEffect(() => {
    let alive = true
    callApi('member_my_connect_status', {})
      .then(r => { if (alive) setConnectStatus(r?.status || 'unavailable') })
      .catch(() => { if (alive) setConnectStatus('unavailable') })
    return () => { alive = false }
  }, [member?.member_number])

  // The member's own full row (renewal date, credit note, Direct eligibility)
  // through member_profile_load, which is confined to the session's member.
  const [profileRow, setProfileRow] = useState(null)
  const [directEligibility, setDirectEligibility] = useState(null)
  const [profileLoadError, setProfileLoadError] = useState('')
  useEffect(() => {
    let alive = true
    callApi('member_profile_load', { member_number: member.member_number })
      .then(d => { if (alive) { setProfileRow({ ...member, ...(d?.profile || {}) }); setDirectEligibility(d?.direct_eligibility || null) } })
      .catch(err => { if (alive) setProfileLoadError(err?.message || 'Your profile details could not be loaded') })
    return () => { alive = false }
  }, [member?.member_number])

  // Network: the same four groups the admin Details tab shows, built from the
  // roster load_data already returns. Names are plain text here.
  const me = member.member_number
  const person = m => ({ ...m, number: m.member_number || m.plugin_member_number })
  const introducedByRow = member.introduced_by_member_number ? allMembers.find(m => m.member_number === member.introduced_by_member_number) : null
  const partnerNumbers = [...new Set(memberConnections
    .map(p => String(p.member_a) === String(me) ? String(p.member_b) : String(p.member_b) === String(me) ? String(p.member_a) : null)
    .filter(Boolean))]
  const people = {
    introducedBy: introducedByRow && !CORPORATE_TYPES.includes(member.member_type) ? { ...person(introducedByRow), chip: member.connection_type || null } : null,
    introducerOf: allMembers.filter(m => m.introduced_by_member_number === me && !CORPORATE_TYPES.includes(m.member_type)).map(m => ({ ...person(m), chip: m.connection_type || null })),
    connections: partnerNumbers.map(n => allMembers.find(m => m.member_number === n)).filter(m => m && !CORPORATE_TYPES.includes(m.member_type)).map(person),
    corporate: allMembers.filter(m => m.member_number?.startsWith(me + '-C') || m.member_number?.startsWith(me + '-FC')).map(person),
  }

  // Mirrors the admin-side member profile (MembersPanel MemberProfile):
  // hero header with headshot + status meta, short facts side by side, then
  // full-width long-form (bio).
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px' }
  // Accountants have no revenue decision — hide the field for them. Advisors
  // and uncategorized members keep it. Mirrors the admin-side hiddenFields.
  const isAccountant = member.member_category === 'accountant'
  const isAdvisor = member.member_category === 'advisor'
  const statusColors = { Active: '#1b9254', Lost: '#e74c3c', Removed: '#e74c3c' }
  const hasCerts = member.vfo_certified_date || member.vfo_accredited_date
  const headshotSrc = member.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(member.headshot_image) : null
  // Corporate members name their lead member in the identity line. Plain text
  // here — MemberNameLink routes into the admin portal.
  const leadNumber = leadMemberNumberOf(member)
  const leadName = findLeadMember(allMembers, member)?.name

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}>
      {/* Profile header */}
      <div style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
        <div style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <HeroAvatar src={headshotSrc} name={member.name} size={64} />
          <div style={{ minWidth: '200px', flex: 1 }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>Member Profile</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '24px', color: 'var(--vfo-heading)', lineHeight: 1.15 }}>{member.name}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace' }}>{member.member_number}</span>
              {member.member_type && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>{member.member_type}{leadNumber && ` - ${leadName || leadNumber}`}</span></>}
              {member.elite_status && (
                <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[member.elite_status] || 'var(--vfo-faint)', flexShrink: 0 }} />
                  {member.elite_status}
                </span></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The read-only body is SHARED with the admin member profile's Details
          tab (shared/MemberProfileDetails) so the two always mirror. */}
      {profileLoadError && <div style={{ ...sectionStyle, color: '#d93025', fontSize: '13px' }}>{profileLoadError}</div>}
      {profileRow && (
        <MemberProfileDetails
          profile={profileRow}
          memberNumber={member.member_number}
          directEligibility={directEligibility}
          hideRevenueDecision={isAccountant}
          styles={{ sectionStyle, cardTitle }}
          people={people}
          payoutSlot={<div><div style={fieldLabel}>Revenue Share Payout Account</div><div style={fieldValue}><PayoutStatusLine status={connectStatus} /></div></div>}
        />
      )}
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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Account Settings</div>
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
        <button onClick={update} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Update</button>
        {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
      </div>
      <AppearanceCard />
    </div>
  )
}