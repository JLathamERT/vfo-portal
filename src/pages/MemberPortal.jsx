import { useEffect, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, clearSession, callApi, loadCachedData, loadCachedAction, clearCachedData, getLastSeen, setLastSeen } from '../lib/api'
import MemberWebsitePlugin from '../components/shared/MemberWebsitePlugin'
import MemberVault from '../components/shared/MemberVault'
import MemberCIQ from '../components/shared/MemberCIQ'
import MemberGCMarketplace, { GCMarketplaceSkeleton } from '../components/member/MemberGCMarketplace'
import MemberEvents, { MemberEventsSkeleton } from '../components/member/MemberEvents'
import MemberMSMTracking, { MemberProgramLoading } from '../components/member/MemberMSMTracking'
import MemberTaxDiagnostic from '../components/member/MemberTaxDiagnostic'
import ClientOverviewPanel from '../components/admin/ClientOverviewPanel'
import MemberShowroom from '../components/member/MemberShowroom'
import MemberGrowthPlan from '../components/member/MemberGrowthPlan'
import PortalHeader from '../components/shared/PortalHeader'
import { BlackFridayStrip } from '../components/shared/BlackFridayPromo'
import MemberNavBar, { orderMemberPrograms, TIER1_TABS } from '../components/member/MemberNavBar'
import AppearanceCard from '../components/shared/AppearanceCard'
import { HeroAvatar } from '../components/shared/TrackKit'
import { DotText, Field, FormGrid, PersonName, formInput, formLabel, formReadOnly, ProfileCard, ProfileHero, SaveBar, SettingsHeader, SETTINGS_WIDTH, useSettingsReturn } from '../components/shared/ProfileKit'
import { btnPrimary, btnSecondary } from '../components/shared/buttonStyles'
import { usePortalTheme } from '../lib/theme'
import { useIsPhone } from '../lib/useMediaQuery'
import { statusColor } from '../components/shared/statusColors'
import { HEADSHOTS_URL } from '../lib/environment'
import SpecialistPicker from '../components/shared/SpecialistPicker'

const HEADSHOT_SUPABASE = HEADSHOTS_URL
// Prepend https:// to a bare domain so member website links resolve as absolute.
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
import vfoCertifiedSeal from '../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../assets/vfo-accredited-emblem.png'
import { MemberEditProfileSkeleton, MemberProfileDetailsSkeleton, MemberTabSkeleton } from '../components/shared/Skeleton'
import { CORPORATE_TYPES, leadMemberNumberOf, findLeadMember } from '../components/shared/corporateMember'
import { formatDate } from '../lib/dates'
import MemberBrandingCard from '../components/shared/MemberBrandingCard'
import MemberProfileDetails, { PayoutStatusLine } from '../components/shared/MemberProfileDetails'
import ImageCropModal from '../components/admin/ImageCropModal'
import PasswordInput from '../components/shared/PasswordInput'

export default function MemberPortal() {
  const navigate = useNavigate()
  const session = getSession()
  usePortalTheme()
  const isPhone = useIsPhone()
  const [pickedTab, setActiveTab] = useState(() => {
    const qs = new URLSearchParams(window.location.search)
    // Land returning Stripe buyers (/member?gc_success=1) on the GC Marketplace.
    if (qs.get('gc_success') === '1') return 'gc'
    // Back from paying for event tickets, or the event link.
    if (qs.get('event_paid') === '1' || qs.get('tab') === 'events') return 'events'
    // Tax intake (2026-09-17): the $500 deposit Checkout returns to
    // ?tab=msm_tax&intake=<id>&paid=1, which lands on the Tax Planning tab
    // regardless of the tab the member last used.
    if (qs.get('intake')) return 'msm_tax'
    // The Client Mirroring email's Open Client Overview button (L5).
    if (qs.get('tab') === 'client_overview') return 'client_overview'
    // Back from paying a tax deposit started on the Tax Diagnostic tab.
    if (qs.get('tab') === 'tax_diagnostic') return 'tax_diagnostic'
    return sessionStorage.getItem('memberActiveTab') || 'profile'
  })
  const [showSettings, setShowSettings] = useState(false)
  // The Black Friday strip's click opens Buy Credits on the GC Marketplace (2026-11-20).
  const [gcBuyKey, setGcBuyKey] = useState(0)
  const [memberData, setMemberData] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [memberConnections, setMemberConnections] = useState([])
  const [allExperts, setAllExperts] = useState([])
  const [exclusions, setExclusions] = useState([])
  const [ecoMap, setEcoMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [enabledPrograms, setEnabledPrograms] = useState([])
  // null until msm_load_enabled_programs answers: the member's tier is unknown till then.
  const [features, setFeatures] = useState(null)
  // Portal licensing L6: the member tier, from the member type (null = not loaded yet).
  const tier1 = features ? features.member_tier === 1 : null
  // A Tier 1 member is never drawn a hidden tab, not even for the paint before the
  // effect below moves them to Profile.
  const eventsEnabled = features?.events === true
  const activeTab = (tier1 && pickedTab && !TIER1_TABS.includes(pickedTab)) || (features && pickedTab === 'events' && !eventsEnabled) ? 'profile' : pickedTab
  const [allPrograms, setAllPrograms] = useState([])

  useLayoutEffect(() => {
    if (!session || session.role !== 'member') { navigate('/member/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); return }
    if (sessionStorage.getItem('memberOpenView') === 'settings') {
      sessionStorage.removeItem('memberOpenView')
      setShowSettings(true); setActiveTab(null)
    }
    // Re-mount (e.g. Back from a client page): draw the last portal at once, refresh behind it.
    const snap = getLastSeen(`memberportal:${session.member_number}`)
    if (snap) { applyData(snap.data, snap.progData, snap.enabledData); setLoading(false) }
    loadData(!!snap)
  }, [])

  useEffect(() => {
    if (activeTab) sessionStorage.setItem('memberActiveTab', activeTab)
    else sessionStorage.removeItem('memberActiveTab')
  }, [activeTab])

  // Portal licensing L6: a Tier 1 member landing on a hidden tab (remembered, or a
  // deep link such as ?gc_success=1 / ?intake=) is put on Profile instead.
  useEffect(() => {
    if (tier1 && pickedTab && !TIER1_TABS.includes(pickedTab)) setActiveTab('profile')
  }, [tier1, pickedTab])

  async function loadData(quiet) {
    try {
      // loadData re-runs after saves (onDataChange) — clear any prior banner first.
      setLoadError(null)
      const [data, progData, enabledData] = await Promise.all([
        loadCachedData(),
        loadCachedAction('msm_load_programs'),
        callApi('msm_load_enabled_programs', { member_number: session.member_number }),
      ])
      applyData(data, progData, enabledData)
      setLastSeen(`memberportal:${session.member_number}`, { data, progData, enabledData })
    } catch (err) {
      console.error('Load error:', err)
      if (quiet !== true) setLoadError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function applyData(data, progData, enabledData) {
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
  }

  function signOut() { clearSession(); navigate('/') }
  function handleTitleClick() { setShowSettings(false); setActiveTab('profile') }
  // Settings keeps the tab you were on (drawn hidden underneath) so Back returns to it.
  const settingsReturn = useSettingsReturn(navigate)
  function closeSettings() { settingsReturn.back(() => { setShowSettings(false); if (!activeTab) setActiveTab('profile') }) }

  if (!session) return null

  const taxIntakeEnabled = features?.tax_intake === true
  const orderedEnabledPrograms = orderMemberPrograms(allPrograms, enabledPrograms, features)

  return (
    // Phone: room under the page for the floating Help (?) button, which sat
    // over a page's last button (MemberHelpButton, bottom-right).
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', ...(isPhone ? { paddingBottom: '64px' } : {}) }}>
      <PortalHeader name={session.name} onTitleClick={handleTitleClick} actions={[
        { key: 'settings', label: 'Settings', onClick: () => { if (!showSettings) settingsReturn.open(); setShowSettings(true) } },
        { key: 'signout', label: 'Sign Out', onClick: signOut },
      ]}>
        {/* The bell inside: the member's rows are scoped server-side to their own
            login email - never the 'admin'/'all' broadcasts (#259). */}
        {!showSettings && <MemberNavBar activeTab={activeTab} onSelect={setActiveTab} programs={orderedEnabledPrograms} websiteEnabled={!!memberData?.website_enabled} tier1={tier1} eventsEnabled={eventsEnabled} />}
      </PortalHeader>

      {/* Black Friday (2026-11-20): above every tab, for the members who have the
          Growth Credits marketplace (Tier 1 has none). Hidden when no sale is on. */}
      {tier1 === false && (
        <BlackFridayStrip onShop={() => { setShowSettings(false); setActiveTab('gc'); setGcBuyKey(k => k + 1) }} />
      )}

      {showSettings && <MemberSettings session={session} onBack={closeSettings} />}

      <div style={{ display: showSettings ? 'none' : 'contents' }}>
          {loadError && (
            <div style={{ maxWidth: '980px', margin: '20px auto 0', padding: '0 var(--vfo-gutter)' }}>
              <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#d93025', marginBottom: '6px' }}>We couldn't load your portal</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', wordBreak: 'break-word' }}>{loadError}</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Please refresh the page — if this keeps happening, contact your VFO team.</div>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && activeTab && (activeTab === 'profile_edit' ? <MemberEditProfileSkeleton /> : activeTab === 'gc' ? <GCMarketplaceSkeleton /> : activeTab === 'events' ? <MemberEventsSkeleton /> : activeTab.startsWith('msm_') && activeTab !== 'msm_home' ? <MemberProgramLoading tab={activeTab} /> : <MemberTabSkeleton tab={activeTab} />)}

          {!loading && activeTab === 'profile' && memberData && (
            <MemberProfile member={memberData} allMembers={allMembers} memberConnections={memberConnections} />
          )}
          {!loading && activeTab === 'profile_edit' && memberData && (
            <MemberEditProfile member={memberData} onSaved={() => { clearCachedData(); loadData() }} />
          )}
          {!loading && (activeTab === 'msm_home' || activeTab?.startsWith('msm_')) && memberData && (
            <MemberMSMTracking member={memberData} activeTab={activeTab} onNavigate={setActiveTab} />
          )}
          {!loading && activeTab === 'client_overview' && <ClientOverviewPanel mode="member" canAddClient={taxIntakeEnabled} />}
          {!loading && activeTab === 'tax_diagnostic' && memberData && <MemberTaxDiagnostic member={memberData} />}
          {!loading && activeTab === 'specialists' && memberData && (
            <MemberSpecialists member={memberData} allExperts={allExperts} exclusions={exclusions} ecoMap={ecoMap} onDataChange={loadData} />
          )}
          {!loading && activeTab === 'showroom' && <MemberShowroom experts={allExperts} exclusions={exclusions} ecoMap={ecoMap} showMemberServices showRevenueShare showVault showAccredited />}
          {!loading && activeTab === 'website' && memberData && memberData.website_enabled && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
              <MemberWebsitePlugin member={memberData} onDataChange={loadData} />
            </div>
          )}
          {!loading && activeTab === 'ciq' && (
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
              <MemberCIQ memberNumber={session.member_number} memberName={session.name || session.member_number} ciqEnabled={session.ciq_enabled} ciqVfosManaged={session.ciq_vfos_managed} isAdmin={false} />
            </div>
          )}
          {!loading && activeTab === 'growthplan' && (
            (memberData?.member_category === 'advisor' || memberData?.member_category === 'accountant')
              ? <MemberGrowthPlan memberNumber={session.member_number} variant={memberData?.member_category === 'accountant' ? 'accountant' : 'advisor'} />
              : <ComingSoon title="Growth Plan" />
          )}
          {!loading && activeTab === 'events' && eventsEnabled && (
            <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
              <MemberEvents memberNumber={session.member_number} />
            </div>
          )}
          {!loading && activeTab === 'gc' && (
            <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
              <MemberGCMarketplace memberNumber={session.member_number} openBuyKey={gcBuyKey} />
            </div>
          )}
          {!loading && activeTab === 'vault' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
              <MemberVault memberNumber={session.member_number} />
            </div>
          )}
          </div>
      </div>
    </div>
  )
}

// The member's own Edit Profile page. Profile fields save through
// member_self_profile_save (the member's own row only; revenue decision, status
// and the rest stay admin-owned); Branding saves through member_branding_save.
function MemberEditProfile({ member, onSaved }) {
  const [row, setRow] = useState(null)
  const [form, setForm] = useState({ email: '', preferred_name: '', trading_name: '', website_url: '' })
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
      setForm({ email: p.email || '', preferred_name: p.preferred_name || '', trading_name: p.trading_name || '', website_url: p.website_url || '' })
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
      const payload = { email: form.email, preferred_name: form.preferred_name, trading_name: form.trading_name, website_url: form.website_url }
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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)', marginBottom: '16px' }
  const labelStyle = formLabel
  const inputStyle = formInput

  if (loadError) return <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}><div style={sectionStyle}><div style={{ color: '#d93025', fontSize: '13px' }}>{loadError}</div></div></div>
  if (!row) return <MemberEditProfileSkeleton />

  const currentPhoto = photoPreview || (row.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(row.headshot_image) : null)
  const initials = `${row.first_name || ''} ${row.last_name || ''}`.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
      <ProfileCard icon="camera" title="Profile Picture">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ borderRadius: '50%', padding: '3px', background: 'var(--vfo-card)', boxShadow: '0 6px 18px rgba(18,94,204,0.22)', flexShrink: 0, display: 'flex' }}>
            <div style={{ width: '104px', height: '104px', borderRadius: '50%', overflow: 'hidden', background: currentPhoto ? 'var(--vfo-tint)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentPhoto
                ? <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: '#fff', fontSize: '30px', fontWeight: 700 }}>{initials || '?'}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ ...btnPrimary, display: 'inline-block' }}>
              {currentPhoto ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
            </label>
            {currentPhoto && <button type="button" onClick={() => setCropState({ src: currentPhoto })} style={btnSecondary}>Adjust / Zoom</button>}
          </div>
        </div>
        {photoPreview && <div style={{ fontSize: '12.5px', color: 'var(--vfo-gold-text)', fontWeight: 600, marginTop: '12px' }}>New photo selected. Click Save Changes to use it.</div>}
      </ProfileCard>

      <ProfileCard icon="building" title={'Contact & Company'}>
        <FormGrid min={240}>
          <div><label style={labelStyle}>Company Name</label><input value={form.trading_name} onChange={e => update('trading_name', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Preferred Name (optional)</label><input value={form.preferred_name} onChange={e => update('preferred_name', e.target.value)} maxLength={60} placeholder="If different from your first name" style={inputStyle} /></div>
          <div><label style={labelStyle}>Work email (emails sent here)</label><input value={form.email} onChange={e => update('email', e.target.value)} type="email" style={inputStyle} /></div>
          <div><label style={labelStyle}>Personal email (not emailed)</label><input value={row.personal_email || ''} readOnly title="Ask the VFO team to change this" style={formReadOnly} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Website</label><input value={form.website_url} onChange={e => update('website_url', e.target.value)} placeholder="https://example.com" style={inputStyle} /></div>
        </FormGrid>
      </ProfileCard>

      <SaveBar dirty={!!(dirty || photoPreview)} saving={saving} disabled={!(dirty || photoPreview)} onSave={save} status={status} statusType={statusType} />

      <MemberBrandingCard memberNumber={member.member_number} mode="member" reloadKey={brandingKey} />

      {cropState && <ImageCropModal src={cropState.src} onApply={dataUrl => { setPhotoPreview(dataUrl); setCropState(null) }} onCancel={() => setCropState(null)} />}
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
  // The shared Specialists tab (2026-11-26); the member saves through member_save_exclusions.
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--vfo-gutter) var(--vfo-gutter) 0' }}>
      <SpecialistPicker allExperts={allExperts} excluded={exclusions} ecoMap={ecoMap}
        intro="Which specialists appear in your VFO Showroom and, if enabled, your Website Plugin."
        onSave={async list => { await callApi('member_save_exclusions', { member_number: member.member_number, exclusions: list }); await onDataChange() }} />
    </div>
  )
}

function MemberProfile({ member, allMembers = [], memberConnections = [] }) {
  const isPhone = useIsPhone()
  // The member's own Stripe Connect setup state — a tag, never the account id
  // (member_my_connect_status is session-scoped and strips it).
  const [connectStatus, setConnectStatus] = useState(null)
  useLayoutEffect(() => {
    let alive = true
    // Re-opened tab: show the last status at once, refresh behind it.
    const key = `memberportalconnect:${member?.member_number}`
    const snap = getLastSeen(key)
    if (snap) setConnectStatus(snap.status || 'unavailable')
    callApi('member_my_connect_status', {})
      .then(r => { if (alive) { setConnectStatus(r?.status || 'unavailable'); setLastSeen(key, r || {}) } })
      .catch(() => { if (alive && !snap) setConnectStatus('unavailable') })
    return () => { alive = false }
  }, [member?.member_number])

  // The member's own full row (renewal date, credit note, Direct eligibility)
  // through member_profile_load, which is confined to the session's member.
  const [profileRow, setProfileRow] = useState(null)
  const [directEligibility, setDirectEligibility] = useState(null)
  const [profileLoadError, setProfileLoadError] = useState('')
  useLayoutEffect(() => {
    let alive = true
    // Re-opened tab: show the last row at once, refresh behind it.
    const key = `memberportalprofile:${member.member_number}`
    const snap = getLastSeen(key)
    const apply = d => { setProfileRow({ ...member, ...(d?.profile || {}) }); setDirectEligibility(d?.direct_eligibility || null) }
    if (snap) apply(snap)
    callApi('member_profile_load', { member_number: member.member_number })
      .then(d => { if (alive) { apply(d); setLastSeen(key, d) } })
      .catch(err => { if (!alive) return; if (snap) console.error(err); else setProfileLoadError(err?.message || 'Your profile details could not be loaded') })
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
    lead: (() => { const l = findLeadMember(allMembers, member); return l ? person(l) : null })(),
  }

  // Mirrors the admin-side member profile (MembersPanel MemberProfile):
  // hero header with headshot + status meta, short facts side by side, then
  // full-width long-form (bio).
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)', marginBottom: '16px' }
  // Accountants have no revenue decision — hide the field for them. Advisors
  // and uncategorized members keep it. Mirrors the admin-side hiddenFields.
  const isAccountant = member.member_category === 'accountant'
  const isAdvisor = member.member_category === 'advisor'
  const hasCerts = member.vfo_certified_date || member.vfo_accredited_date
  const headshotSrc = member.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(member.headshot_image) : null
  // Corporate members name their lead member in the identity line. Plain text
  // here — MemberNameLink routes into the admin portal.
  const leadNumber = leadMemberNumberOf(member)
  const leadName = findLeadMember(allMembers, member)?.name

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
      {/* Profile header: the shared profile hero (shared/ProfileKit) - name, then
          number, type and status in its fact strip. */}
      <ProfileHero
        eyebrow="Member Profile"
        name={<PersonName first={member.first_name} last={member.last_name} preferred={member.preferred_name || profileRow?.preferred_name} fallback={member.name} />}
        avatar={<HeroAvatar src={headshotSrc} name={member.name} size={isPhone ? 56 : 72} />}
        facts={[
          { label: 'Member number', value: <span style={{ fontFamily: 'monospace' }}>{member.member_number}</span> },
          { label: 'Type', value: member.member_type ? `${member.member_type}${leadNumber ? ` - ${leadName || leadNumber}` : ''}` : null },
          { label: 'Status', value: member.elite_status ? <DotText color={statusColor(member.elite_status)}>{member.elite_status}</DotText> : null },
        ]}
      />

      {/* The read-only body is SHARED with the admin member profile's Details
          tab (shared/MemberProfileDetails) so the two always mirror. */}
      {profileLoadError && <div style={{ ...sectionStyle, color: '#d93025', fontSize: '13px' }}>{profileLoadError}</div>}
      {!profileRow && !profileLoadError && <MemberProfileDetailsSkeleton />}
      {profileRow && (
        <MemberProfileDetails
          profile={profileRow}
          memberNumber={member.member_number}
          directEligibility={directEligibility}
          hideRevenueDecision={isAccountant}
          people={people}
          payoutSlot={<Field label="Revenue Share Payout Account"><PayoutStatusLine status={connectStatus} /></Field>}
        />
      )}
    </div>
  )
}

function MemberSettings({ session, onBack }) {
  const isPhone = useIsPhone()
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

  return (
    <div style={{ maxWidth: SETTINGS_WIDTH, margin: '0 auto', padding: '32px var(--vfo-gutter)' }}>
      <SettingsHeader name={session.name} email={session.email} onBack={onBack} />
      <ProfileCard icon="lock" title="Account Settings" sub="The email you sign in with, and your passcode.">
        <form onSubmit={e => { e.preventDefault(); update() }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={formLabel} htmlFor="username">Email</label>
            <input id="username" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} style={formInput} />
          </div>
          {/* Phone: the two passcode boxes stack (FormGrid wraps them). */}
          <FormGrid min={220}>
            <div>
              <label style={formLabel} htmlFor="new-password">New Passcode</label>
              <PasswordInput id="new-password" name="new-password" value={newPasscode} autoComplete="new-password" onChange={e => setNewPasscode(e.target.value)} placeholder="Leave blank to keep current" style={formInput} />
            </div>
            <div>
              <label style={formLabel} htmlFor="confirm-password">Confirm Passcode</label>
              <PasswordInput id="confirm-password" name="confirm-password" value={confirmPasscode} autoComplete="new-password" onChange={e => setConfirmPasscode(e.target.value)} placeholder="Confirm new passcode" style={formInput} />
            </div>
          </FormGrid>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '18px' }}>
            <button type="submit" style={btnPrimary}>Update</button>
            {status && <span style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 500 }}>{status}</span>}
          </div>
        </form>
      </ProfileCard>
      <AppearanceCard />
    </div>
  )
}
