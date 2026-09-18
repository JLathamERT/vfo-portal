import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi, loadCachedData, loadCachedAction } from '../lib/api'
import MemberWebsitePlugin from '../components/shared/MemberWebsitePlugin'
import MemberVault from '../components/shared/MemberVault'
import MemberCIQ from '../components/shared/MemberCIQ'
import MemberGCMarketplace from '../components/member/MemberGCMarketplace'
import MemberMSMTracking from '../components/member/MemberMSMTracking'
import MemberShowroom from '../components/member/MemberShowroom'
import MemberGrowthPlan from '../components/member/MemberGrowthPlan'
import VfoWordmark from '../components/shared/VfoWordmark'
import AppearanceCard from '../components/shared/AppearanceCard'
import { HeroAvatar } from '../components/shared/TrackKit'
import { usePortalTheme } from '../lib/theme'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
// Prepend https:// to a bare domain so member website links resolve as absolute.
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
import vfoCertifiedSeal from '../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../assets/vfo-accredited-emblem.png'
import { MemberProfileSkeleton } from '../components/shared/Skeleton'
import { leadMemberNumberOf, findLeadMember } from '../components/shared/corporateMember'

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
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name}</span>
          <button onClick={() => { setShowSettings(true); setActiveTab(null) }} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Settings</button>
          <button onClick={signOut} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {showSettings && <MemberSettings session={session} />}

      {!showSettings && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', position: 'relative', zIndex: 100 }}>
            <button onClick={() => setActiveTab('profile')} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === 'profile' ? '2px solid #125ecc' : '2px solid transparent', color: activeTab === 'profile' ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: activeTab === 'profile' ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>Profile</button>
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
          {loading && activeTab && <MemberProfileSkeleton />}

          {!loading && activeTab === 'profile' && memberData && (
            <MemberProfile member={memberData} allMembers={allMembers} />
          )}
          {!loading && (activeTab === 'msm_home' || activeTab?.startsWith('msm_')) && memberData && (
            <MemberMSMTracking member={memberData} activeTab={activeTab} onNavigate={setActiveTab} />
          )}
          {!loading && activeTab === 'specialists' && memberData && (
            <MemberSpecialists member={memberData} allExperts={allExperts} exclusions={exclusions} ecoMap={ecoMap} onDataChange={loadData} />
          )}
          {!loading && activeTab === 'showroom' && <MemberShowroom experts={allExperts} exclusions={exclusions} ecoMap={ecoMap} showMemberServices />}
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

function NavDropdown({ label, isActive, options, activeTab, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { setOpen(false) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid #125ecc' : '2px solid transparent', color: isActive ? '#125ecc' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

function MemberProfile({ member, allMembers = [] }) {
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

      {/* Short facts side by side; long-form (bio) runs full width below. */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: '300px', display: 'flex' }}>
          <div style={{ ...sectionStyle, flex: 1 }}>
            <div style={cardTitle}>Member Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
              <div><div style={fieldLabel}>Member Number</div><div style={{ ...fieldValue, fontFamily: 'monospace' }}>{member.member_number}</div></div>
              <div><div style={fieldLabel}>Join Date</div><div style={fieldValue}>{member.join_date ? member.join_date.split('T')[0] : '—'}</div></div>
              <div><div style={fieldLabel}>Work email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{member.email || '—'}</div></div>
              <div><div style={fieldLabel}>Personal email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{member.personal_email || '—'}</div></div>
              <div><div style={fieldLabel}>Company Name</div><div style={fieldValue}>{member.trading_name || '—'}</div></div>
              {member.website_url && <div><div style={fieldLabel}>Website</div><div style={fieldValue}><a href={normalizeUrl(member.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: '#0095ff', textDecoration: 'none', wordBreak: 'break-all' }}>{member.website_url}</a></div></div>}
              {!isAccountant && <div><div style={fieldLabel}>Revenue Decision</div><div style={fieldValue}>{member.revenue_decision || '—'}</div></div>}
              <div><div style={fieldLabel}>Revenue Share Payout Account</div><div style={fieldValue}>
                {(() => {
                  const st = connectStatus
                  const pill = st === 'complete' ? { dot: '#16a34a', label: 'Account set up' }
                    : st === 'eligible_capped' ? { dot: '#f59e0b', label: 'Account set up — details outstanding' }
                    : st === 'pending' ? { dot: '#dc2626', label: 'Setup pending' }
                    : st === 'none' ? { dot: 'var(--vfo-faint)', label: 'Not set up' }
                    : st === null ? { dot: 'var(--vfo-faint)', label: 'Checking…' }
                    : { dot: 'var(--vfo-faint)', label: 'Status unavailable' }
                  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: pill.dot, flexShrink: 0 }} />{pill.label}</span>
                })()}
              </div></div>
            </div>
          </div>
        </div>

        {hasCerts && (
          <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
            <div style={sectionStyle}>
              <div style={cardTitle}>Certifications</div>
              {member.vfo_certified_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: member.vfo_accredited_date ? '14px' : 0 }}>
                  <img src={vfoCertifiedSeal} style={{ width: '44px', height: '44px' }} />
                  <div>
                    <div style={{ fontSize: '14px', color: '#b08d26', fontWeight: '600' }}>VFO Certified</div>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{member.vfo_certified_date.split('T')[0]}</div>
                  </div>
                </div>
              )}
              {member.vfo_accredited_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={vfoAccreditedSeal} style={{ width: '44px', height: '44px' }} />
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--vfo-muted)', fontWeight: '600' }}>VFO Accredited</div>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{member.vfo_accredited_date.split('T')[0]}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {member.bio && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Bio</div>
          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{member.bio}</div>
        </div>
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