import { useState, useEffect, useRef, Fragment } from 'react'
import { callApi, getSession } from '../../lib/api'
import MemberWebsitePlugin from '../shared/MemberWebsitePlugin'
import MemberVault from '../shared/MemberVault'
import MemberCIQ from '../shared/MemberCIQ'
import MemberShowroom from '../member/MemberShowroom'
import MemberPaymentsTab from '../payments/MemberPaymentsTab'
import MSMTracking from './MSMTracking'
import AdvisorOnboarding from './AdvisorOnboarding'
import AccountantOnboarding from './AccountantOnboarding'
import MemberKpiPanel from './MemberKpiPanel'
import StrategicPartnersPanel from './StrategicPartnersPanel'
import AdminGrowthPlan from '../growth/AdminGrowthPlan'
import SendSetupEmailButton from './SendSetupEmailButton'
import ListFilterButton, { matchesFilter, sortMembers, SortSelect, MEMBER_SORT_OPTIONS } from './ListFilterButton'
import { MemberProfileDetailsSkeleton, Skeleton, SkeletonText } from '../shared/Skeleton'
import { TrackHero, HeroAvatar, ListHeader } from '../shared/TrackKit'
import { VisibilityBadge, noteTint } from '../shared/NoteVisibility'
import ImageCropModal from './ImageCropModal'
import { MemberNameLink } from '../shared/personLinks'
import { CORPORATE_TYPES, isCorporateMember, leadMemberNumberOf, findLeadMember } from '../shared/corporateMember'
import { MEMBER_TYPES, ACCOUNTANT_TYPES } from '../shared/memberTypes'
import { GCServicesView, GCTransactionHistory } from '../shared/GCMarketplaceViews'
// The engagement rating is set on the Member Overview tab; the profile hero
// only DISPLAYS it. Admin surface throughout — the member portal never renders
// it, and load_data strips the column for non-admin callers.
import { engagementMeta } from './MemberOverviewPanel'

// Creating advisors / accountants / strategic members is restricted to the
// SuperAdmin (Jake) plus Tray Valdés-Dennis (tvaldes@elitert.com).
const canAddMembers = () => { const s = getSession(); return !!s?.is_superadmin || (s?.email || '').toLowerCase() === 'tvaldes@elitert.com' }

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
// Prepend https:// to a bare domain so member website links resolve as absolute.
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
import vfoCertifiedSeal from '../../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../../assets/vfo-accredited-emblem.png'

// Members carrying the "VFO Reconciliation (Free)" type that ANY admin may still
// open. 59524 is the standing sandbox-forced Test Member (#251) — it holds that
// type only because the test account sits on the free tier, and locking it to
// Jake + Paul would leave every other admin unable to exercise the test member.
const RECONCILIATION_EXEMPT_MEMBERS = ['59524']

// Detail-view tab sets. Advisors/accountants get the full set; Strategic Members
// get a trimmed view: Profile (all sub-tabs, always shown), MSM limited to
// Holistic + Tax Planning, plus Specialists + Showroom + CIQ (no Website Plugin /
// GC Marketplace / Growth Plan).
const DEFAULT_MSM_OPTIONS = [
  { key: 'msm_meetings', label: 'MSM' },
  { key: 'msm_program_holistic', label: 'VFO Holistic Planning' },
  { key: 'msm_program_partnership', label: 'Partnership Fast Track' },
  { key: 'msm_program_tax', label: 'VFO Tax Planning' },
  { key: 'msm_program_coaching', label: 'Advanced Coaching' },
  { key: 'msm_program_standard', label: 'Standard Coaching' },
]
const DEFAULT_EXTRA_TABS = [['specialists', 'Specialists'], ['showroom', 'Showroom'], ['website', 'Website Plugin'], ['ciq', 'CIQ'], ['gc', 'GC Marketplace']]
const STRATEGIC_MSM_OPTIONS = [
  { key: 'msm_meetings', label: 'MSM' },
  { key: 'msm_program_holistic', label: 'VFO Holistic Planning' },
  { key: 'msm_program_tax', label: 'VFO Tax Planning' },
]
// Strategic members only run Holistic + Tax, so their MSM Home shows just those
// two program toggles and drops the Advanced (coaching) + PFT (partnership)
// meeting counters.
const STRATEGIC_PROGRAM_KEYS = ['holistic', 'tax']
const STRATEGIC_EXTRA_TABS = [['specialists', 'Specialists'], ['showroom', 'Showroom'], ['ciq', 'CIQ']]

// Where the currently-open member profile was reached FROM. Written by
// AdminPortal.openMemberProfile when the jump came off the Member Overview list,
// read by that profile's "Back to list" so it returns you to the list you were
// actually on rather than to the category directory the profile happens to live
// in. Cleared whenever a profile is opened any other way (a directory row click,
// or an openMemberProfile call with no origin), so it can never go stale and
// send a later Back click somewhere the user never was.
export const MEMBER_PROFILE_ORIGIN_KEY = 'adminMemberProfileOrigin'

export default function MembersPanel({ allMembers, allExperts, allExclusionMap, ecoMap, onDataChange, section, navClickCount, onOpenMember, onBackToOrigin, memberConnections = [] }) {
  if (section === 'advisor_onboarding') return <AdvisorOnboarding />
  if (section === 'accountant_onboarding') return <AccountantOnboarding />
  if (section === 'advisor_kpis') return <MemberKpiPanel allMembers={allMembers} category="advisor" />
  if (section === 'accountant_kpis') return <MemberKpiPanel allMembers={allMembers} category="accountant" />
  if (section === 'strategic_member_kpis') return <MemberKpiPanel allMembers={allMembers} category="strategic_member" />
  if (section === 'strategic_partners') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <StrategicPartnersPanel />
      </div>
    )
  }
  if (section === 'strategic_member_search' || section === 'add_strategic_member') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <StrategicMembersPanel allMembers={allMembers} allExperts={allExperts} allExclusionMap={allExclusionMap} ecoMap={ecoMap} onDataChange={onDataChange} initialTab={section === 'add_strategic_member' ? 'add' : 'search'} section={section} navClickCount={navClickCount} onOpenMember={onOpenMember} onBackToOrigin={onBackToOrigin} memberConnections={memberConnections} />
      </div>
    )
  }
  if (section === 'accountant_search' || section === 'add_accountant') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <AccountantsPanel allMembers={allMembers} allExperts={allExperts} allExclusionMap={allExclusionMap} ecoMap={ecoMap} onDataChange={onDataChange} initialTab={section === 'add_accountant' ? 'add' : 'search'} section={section} navClickCount={navClickCount} onOpenMember={onOpenMember} onBackToOrigin={onBackToOrigin} memberConnections={memberConnections} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <AdvisorsPanel allMembers={allMembers} allExperts={allExperts} allExclusionMap={allExclusionMap} ecoMap={ecoMap} onDataChange={onDataChange} initialTab={section === 'add_advisor' ? 'add' : 'search'} section={section} navClickCount={navClickCount} onOpenMember={onOpenMember} onBackToOrigin={onBackToOrigin} memberConnections={memberConnections} />
    </div>
  )
}

function AccountantsPanel({ allMembers, allExperts, allExclusionMap, ecoMap, onDataChange, initialTab, section, navClickCount, onOpenMember, onBackToOrigin, memberConnections = [] }) {
  // Accountants are tagged durably by member_category (set at create time).
  const accountantMembers = allMembers.filter(m => m.member_category === 'accountant')

  return (
    <MemberDirectoryView
      displayMembers={accountantMembers}
      typeOptions={ACCOUNTANT_TYPES}
      allMembers={allMembers}
      allExperts={allExperts}
      allExclusionMap={allExclusionMap}
      ecoMap={ecoMap}
      onDataChange={onDataChange}
      addForm={<AddAccountantForm allMembers={allMembers} onDataChange={onDataChange} />}
      selectedKey="adminSelectedAccountant"
      featureTabKey="adminAccountantFeatureTab"
      initialTab={initialTab}
      navClickCount={navClickCount}
      onOpenMember={onOpenMember}
      onBackToOrigin={onBackToOrigin}
      memberConnections={memberConnections}
      growthPlan={true}
      listTitle="Accountants"
    />
  )
}

function AddAccountantForm({ allMembers, onDataChange }) {
  const [memberType, setMemberType] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [eliteStatus, setEliteStatus] = useState('')
  const [revenueDecision, setRevenueDecision] = useState('')
  const [advisorModel, setAdvisorModel] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)
  const [customMemberNumber, setCustomMemberNumber] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function submit() {
    if (!canAddMembers()) { setStatusType('error'); setStatus('Access Denied'); return }
    if (!firstName || !lastName || !memberType) { setStatusType('error'); setStatus('First name, last name, and member type are required.'); return }
    if (!email.trim()) { setStatusType('error'); setStatus('Email is required.'); return }
    if (!eliteStatus) { setStatusType('error'); setStatus('Please pick a status.'); return }
    if (!revenueDecision) { setStatusType('error'); setStatus('Please pick a revenue decision.'); return }
    if (!advisorModel) { setStatusType('error'); setStatus('Please pick Legacy Model or New Model.'); return }
    setLoading(true)
    try {
      const customNum = customMemberNumber.trim()
      if (customNum) {
        const exists = (allMembers || []).find(m => m.plugin_member_number === customNum)
        if (exists) { setStatusType('error'); setStatus(`Member number ${customNum} already exists.`); setLoading(false); return }
      }
      // Member number: explicit custom value, or omit so the backend auto-generates
      // for the (accountant × advisorModel) bucket — single source of truth.
      const res = await callApi('add_member_full', {
        name: `${firstName} ${lastName}`,
        member_number: customNum || undefined,
        first_name: firstName,
        last_name: lastName,
        member_type: memberType,
        trading_name: tradingName.trim() || null,
        elite_status: eliteStatus,
        email,
        revenue_decision: revenueDecision,
        advisor_model: advisorModel,
        member_category: 'accountant',
        connected_member_number: null,
      })
      await onDataChange()
      setFirstName(''); setLastName(''); setEmail(''); setMemberType(''); setTradingName(''); setCustomMemberNumber(''); setAdvisorModel(''); setEliteStatus(''); setRevenueDecision('')
      setStatusType('success'); setStatus(`Accountant created with number ${res.member_number}`)
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
          <select value={memberType} onChange={e => setMemberType(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {ACCOUNTANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Company Name</label>
        <input value={tradingName} onChange={e => setTradingName(e.target.value)} placeholder="Company name (optional)" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Work Email *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={labelStyle}>Status *</label>
          <select value={eliteStatus} onChange={e => setEliteStatus(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={labelStyle}>Revenue Decision *</label>
          <select value={revenueDecision} onChange={e => setRevenueDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            <option value="Revenue Share">Revenue Share</option>
            <option value="Money Mapping">Money Mapping</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Advisor Model *</label>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['Legacy Model', 'New Model'].map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: `1px solid ${advisorModel === m ? 'rgba(0,149,255,0.5)' : 'var(--vfo-border-strong)'}`, background: advisorModel === m ? 'rgba(0,149,255,0.08)' : 'var(--vfo-tint)', cursor: 'pointer', fontSize: '13px', color: advisorModel === m ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>
              <input type="radio" name="add_acct_advisor_model" value={m} checked={advisorModel === m} onChange={() => setAdvisorModel(m)} style={{ accentColor: '#0095ff' }} />
              {m}
            </label>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Member Number <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>— leave blank to auto-generate</span></label>
        <input value={customMemberNumber} onChange={e => setCustomMemberNumber(e.target.value)} placeholder="e.g. 59452" style={{ ...inputStyle, maxWidth: '200px' }} />
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Creating...' : 'Create Accountant'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

export function FeatureTabDropdown({ label, isActive, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { setOpen(false) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '7px 16px', background: isActive ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: isActive ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '160px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Shared search-list + click-into-profile view used by both AdvisorsPanel
// and AccountantsPanel. Type-specific bits are passed in as props:
//   - displayMembers : the filtered list rendered in the search results
//     (e.g. allMembers for advisors, accountant-filtered for accountants)
//   - allMembers     : the FULL unfiltered list, needed by shared inner
//     components (Connected Member lookup, corporate roster, etc.)
//   - addForm        : the type-specific Add form rendered when activeTab='add'
//   - selectedKey    : sessionStorage key for "which member is selected"
//                      (advisors use 'adminSelectedMember', accountants
//                       use 'adminSelectedAccountant')
//   - featureTabKey  : sessionStorage key for the active feature sub-tab
//   - hiddenFields   : list of profile field strings to suppress in the
//                      profile view (e.g. ['revenue_decision'] for accountants)
function MemberDirectoryView({
  displayMembers,
  allMembers,
  allExperts,
  allExclusionMap,
  ecoMap,
  onDataChange,
  addForm,
  selectedKey,
  featureTabKey,
  initialTab,
  navClickCount,
  onOpenMember,
  onBackToOrigin,
  memberConnections = [],
  hiddenFields = [],
  growthPlan = false,
  listTitle = 'Members',
  typeOptions = [],
  showModel = true,
  showCredential = true,
  msmOptions = DEFAULT_MSM_OPTIONS,
  extraTabs = DEFAULT_EXTRA_TABS,
  msmBypassEnableGate = false,
  msmAllowedPrograms = null,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'search')
  useEffect(() => { setActiveTab(initialTab || 'search') }, [initialTab])
  // Only the SuperAdmin (Jake) and Paul Latham (platham@elitert.com) may open a
  // "VFO Reconciliation (Free)" advisor. Any other admin's click flashes a small
  // "Access Denied" marker at the cursor (click-only, never on hover) and the
  // row does not open.
  const _sess = getSession()
  const canOpenReconciliation = !!_sess?.is_superadmin || (_sess?.email || '').toLowerCase() === 'platham@elitert.com'
  const reconciliationLocked = (m) => m.member_type === 'VFO Reconciliation (Free)'
    && !canOpenReconciliation
    && !RECONCILIATION_EXEMPT_MEMBERS.includes(String(m.plugin_member_number ?? m.member_number ?? ''))
  const [deny, setDeny] = useState(null) // { x, y } screen coords of the last blocked click
  const denyTimer = useRef(null)
  useEffect(() => () => clearTimeout(denyTimer.current), [])
  function flashDeny(e) {
    setDeny({ x: e.clientX, y: e.clientY })
    clearTimeout(denyTimer.current)
    denyTimer.current = setTimeout(() => setDeny(null), 1400)
  }
  const [selectedMember, setSelectedMember] = useState(() => {
    const saved = sessionStorage.getItem(selectedKey)
    if (saved && allMembers.length) return allMembers.find(m => m.plugin_member_number === saved) || null
    return null
  })

  // A nav click either CLEARS the selection (ordinary tab navigation wipes the
  // sessionStorage key first) or PRE-SEEDS it (AdminPortal.openMemberProfile,
  // used by the Member Overview list and the profile "Introduced By /
  // Connections" name links). Cross-category jumps remount this component and
  // the useState initializer picks the seed up; a same-category jump keeps it
  // mounted, so adopt whatever the key now says.
  useEffect(() => {
    const saved = sessionStorage.getItem(selectedKey)
    if (!saved) { setSelectedMember(null); setMemberFeatureTab('profile_details'); return }
    const seeded = allMembers.find(m => m.plugin_member_number === saved)
    if (seeded) {
      setSelectedMember(seeded)
      setMemberFeatureTab(sessionStorage.getItem(featureTabKey) || 'profile_details')
      window.scrollTo(0, 0)
    }
  }, [navClickCount])

  // Keep selectedMember in sync when allMembers refreshes (e.g. after saving MSM assignment)
  useEffect(() => {
    if (selectedMember && allMembers.length) {
      const fresh = allMembers.find(m => m.plugin_member_number === selectedMember.plugin_member_number)
      if (fresh && fresh !== selectedMember) setSelectedMember(fresh)
    }
  }, [allMembers])
  const [memberFeatureTab, setMemberFeatureTab] = useState(sessionStorage.getItem(featureTabKey) || 'profile')
  const [memberSearch, setMemberSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active'] })
  const [listSort, setListSort] = useState('number_asc')
  const filterGroups = [
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: m => m.elite_status || 'Active' },
    ...(showModel ? [{ key: 'model', label: 'Model', options: ['New Model', 'Legacy Model'], get: m => m.advisor_model || '' }] : []),
    ...(typeOptions.length ? [{ key: 'type', label: 'Member Type', options: typeOptions, get: m => m.member_type || '' }] : []),
    // Suspended / Paused are boolean flags that sit on top of an Active member.
    // `get` returns the set of flags so a member matches when EITHER is selected.
    { key: 'standing', label: 'Standing', options: ['Suspended', 'Paused', 'In Arrears'], get: m => { const f = []; if (m.suspended) f.push('Suspended'); if (m.paused) f.push('Paused'); if (m.membership_arrears) f.push('In Arrears'); return f } },
    // VFO Certified / Accredited are date columns; presence = the credential is held.
    // Hidden for strategic members (they don't carry these credentials).
    ...(showCredential ? [{ key: 'credential', label: 'VFO Credential', options: ['VFO Certified', 'VFO Accredited'], get: m => { const f = []; if (m.vfo_certified_date) f.push('VFO Certified'); if (m.vfo_accredited_date) f.push('VFO Accredited'); return f } }] : []),
  ]

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  const searched = memberSearch
    ? displayMembers.filter(m => m.name?.toLowerCase().includes(memberSearch) || m.plugin_member_number?.toLowerCase().includes(memberSearch))
    : displayMembers
  const filteredMembers = searched.filter(m => matchesFilter(m, filterGroups, listFilter))

  // Corporate members name their lead member in the hero identity line. Falls
  // back to the bare number when the lead is not in this roster slice.
  const heroLeadNumber = selectedMember ? leadMemberNumberOf(selectedMember) : null
  const heroLeadName = selectedMember ? findLeadMember(allMembers, selectedMember)?.name : null

  return (
    <div>

      {deny && (
        <div style={{ position: 'fixed', left: deny.x, top: deny.y, transform: 'translate(-50%, calc(-100% - 12px))', zIndex: 9999, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(24,24,28,0.93)', color: '#fff', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 10px 28px rgba(0,0,0,0.3)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff5a52" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></svg>
          Access Denied for this member type
        </div>
      )}

      {activeTab === 'add' && addForm}

      {activeTab === 'search' && !selectedMember && (
        <>
          <ListHeader title={listTitle} count={filteredMembers.length} />
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name or number..." style={inputStyle} onChange={e => setMemberSearch(e.target.value.toLowerCase())} value={memberSearch} />
            <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
            <SortSelect value={listSort} onChange={setListSort} options={MEMBER_SORT_OPTIONS} />
          </div>
          <div>
            {sortMembers(filteredMembers, listSort).map(m => (
              <div key={m.plugin_member_number}
                onClick={(e) => { if (reconciliationLocked(m)) { flashDeny(e); return } setSelectedMember(m); setMemberFeatureTab('profile_details'); sessionStorage.setItem(selectedKey, m.plugin_member_number); sessionStorage.setItem(featureTabKey, 'profile_details'); sessionStorage.removeItem(MEMBER_PROFILE_ORIGIN_KEY); window.scrollTo(0, 0) }}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', marginBottom: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(20,45,95,0.04)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,149,255,0.4)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vfo-border-soft)'}>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '70px', flexShrink: 0, fontFamily: 'monospace' }}>{m.plugin_member_number}</span>
                <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, width: '200px', flexShrink: 0 }}>{m.name}</span>
                <span style={{ width: '80px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: m.elite_status === 'Active' ? '#1b9254' : m.elite_status === 'Lost' ? '#e74c3c' : 'var(--vfo-faint)' }} />
                  {m.elite_status || '—'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '160px', flexShrink: 0 }}>{m.member_type || '—'}</span>
                {showModel && <span style={{ fontSize: '12px', color: m.advisor_model === 'New Model' ? '#0095ff' : 'var(--vfo-muted)' }}>{m.advisor_model || '—'}</span>}
                {(m.paused || m.suspended || m.membership_arrears) && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '12px', flexShrink: 0 }}>
                    {m.paused && <span style={{ fontSize: '12px', fontWeight: 700, color: '#e06717' }}>Paused</span>}
                    {m.suspended && <span style={{ fontSize: '12px', fontWeight: 700, color: '#e74c3c' }}>Suspended</span>}
                    {m.membership_arrears && <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309' }}>In Arrears</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'search' && selectedMember && (
        <>
          <button onClick={() => {
            // "The list" is wherever you came from. Reaching this profile off the
            // Member Overview tab and landing back in the Advisors directory is a
            // different list than the one you left, so honour the origin stamp
            // first — and clear it either way, so the next Back is judged on its
            // own journey.
            const origin = sessionStorage.getItem(MEMBER_PROFILE_ORIGIN_KEY)
            sessionStorage.removeItem(MEMBER_PROFILE_ORIGIN_KEY)
            setSelectedMember(null); sessionStorage.removeItem(selectedKey); sessionStorage.removeItem(featureTabKey)
            if (origin && onBackToOrigin) onBackToOrigin(origin)
          }} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>
          <TrackHero
            eyebrow={listTitle}
            title={selectedMember.name}
            avatar={<HeroAvatar src={selectedMember.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(selectedMember.headshot_image) : null} name={selectedMember.name} />}
            meta={
              <>
                <span style={{ fontFamily: 'monospace' }}>{selectedMember.plugin_member_number}</span>
                {selectedMember.member_type && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>{selectedMember.member_type}{heroLeadNumber && <> - <MemberNameLink memberNumber={heroLeadNumber}>{heroLeadName || heroLeadNumber}</MemberNameLink></>}</span></>}
                {selectedMember.elite_status && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedMember.elite_status === 'Active' ? '#1b9254' : selectedMember.elite_status === 'Lost' ? '#e74c3c' : 'var(--vfo-faint)', flexShrink: 0 }} />{selectedMember.elite_status}</span></>}
                {engagementMeta(selectedMember.engagement_level) && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: engagementMeta(selectedMember.engagement_level).color, flexShrink: 0 }} />{engagementMeta(selectedMember.engagement_level).label}</span></>}
                {selectedMember.paused && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e06717', flexShrink: 0 }} />Paused</span></>}
                {selectedMember.suspended && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e74c3c', flexShrink: 0 }} />Suspended</span></>}
                {selectedMember.membership_arrears && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b45309', flexShrink: 0 }} />In Arrears</span></>}
              </>
            }
          />
          <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px', flexWrap: 'wrap', position: 'relative', zIndex: 50 }}>
          <FeatureTabDropdown label="Profile" isActive={['profile_details','profile_edit','profile_history','vault','profile_payments','settings'].includes(memberFeatureTab)} options={[{key:'profile_details',label:'Profile'},{key:'profile_edit',label:'Edit Profile'},{key:'profile_history',label:'Type History'},{key:'vault',label:'Vault'},{key:'profile_payments',label:'Payments'},{key:'settings',label:'Settings'}]} onSelect={setMemberFeatureTab} />
          <FeatureTabDropdown label="MSM" isActive={msmOptions.map(o => o.key).includes(memberFeatureTab)} options={msmOptions} onSelect={k => { setMemberFeatureTab(k); sessionStorage.setItem(featureTabKey, k) }} />
            {extraTabs.map(([key, label]) => (
            <Fragment key={key}>
              {growthPlan && key === 'ciq' && <button style={{ padding: '7px 16px', background: memberFeatureTab.startsWith('gp_') ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: memberFeatureTab.startsWith('gp_') ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: memberFeatureTab.startsWith('gp_') ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' }} onClick={() => { setMemberFeatureTab('gp_hub'); sessionStorage.setItem(featureTabKey, 'gp_hub') }}>Growth Plan</button>}
              <button style={{ padding: '7px 16px', background: memberFeatureTab === key ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: memberFeatureTab === key ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: memberFeatureTab === key ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' }} onClick={() => { setMemberFeatureTab(key); sessionStorage.setItem(featureTabKey, key) }}>{label}</button>
            </Fragment>
          ))}
          </div>
          {['profile_details','profile_edit','profile_history'].includes(memberFeatureTab) && <MemberProfile member={selectedMember} allMembers={allMembers} onDataChange={onDataChange} activeSection={memberFeatureTab} hiddenFields={hiddenFields} typeOptionsOverride={showModel ? null : typeOptions} onOpenMember={onOpenMember} memberConnections={memberConnections} />}
          {memberFeatureTab === 'profile_payments' && <MemberPaymentsTab member={selectedMember} />}
          {['msm_meetings','msm_program_holistic','msm_program_partnership','msm_program_tax','msm_program_coaching','msm_program_standard'].includes(memberFeatureTab) && <MSMTracking member={selectedMember} activeSection={memberFeatureTab} onDataChange={onDataChange} bypassEnableGate={msmBypassEnableGate} allowedProgramKeys={msmAllowedPrograms} />}          {memberFeatureTab === 'specialists' && <MemberSpecialists member={selectedMember} allExperts={allExperts} allExclusionMap={allExclusionMap} ecoMap={ecoMap} onDataChange={onDataChange} />}
          {memberFeatureTab === 'showroom' && <MemberShowroom experts={allExperts} exclusions={allExclusionMap[selectedMember.plugin_member_number] || []} ecoMap={ecoMap} showMemberServices />}
          {memberFeatureTab === 'website' && <MemberWebsitePlugin member={selectedMember} onDataChange={onDataChange} readOnly={false} isAdmin={true} />}
          {memberFeatureTab === 'ciq' && <MemberCIQ memberNumber={selectedMember.plugin_member_number} memberName={selectedMember.name} ciqEnabled={selectedMember.ciq_enabled} ciqVfosManaged={selectedMember.ciq_vfos_managed} isAdmin={true} />}
          {growthPlan && memberFeatureTab.startsWith('gp_') && <AdminGrowthPlan member={selectedMember} activeStep={memberFeatureTab} onNavigate={k => { setMemberFeatureTab(k); sessionStorage.setItem(featureTabKey, k) }} />}
          {memberFeatureTab === 'gc' && <MemberGC member={selectedMember} />}
          {memberFeatureTab === 'vault' && <MemberVault memberNumber={selectedMember.plugin_member_number} admin={true} recipientName={selectedMember.name} recipientFirst={(selectedMember.name || '').trim().split(/\s+/)[0]} />}
          {memberFeatureTab === 'settings' && <MemberSettings member={selectedMember} allMembers={allMembers} onDataChange={onDataChange} />}
        </>
      )}
    </div>
  )
}

function AdvisorsPanel({ allMembers, allExperts, allExclusionMap, ecoMap, onDataChange, initialTab, section, navClickCount, onOpenMember, onBackToOrigin, memberConnections = [] }) {
  return (
    <MemberDirectoryView
      displayMembers={allMembers.filter(m => m.member_category !== 'accountant' && m.member_category !== 'strategic_member')}
      typeOptions={MEMBER_TYPES}
      allMembers={allMembers}
      allExperts={allExperts}
      allExclusionMap={allExclusionMap}
      ecoMap={ecoMap}
      onDataChange={onDataChange}
      addForm={<AddAdvisorForm allMembers={allMembers} onDataChange={onDataChange} />}
      selectedKey="adminSelectedMember"
      featureTabKey="adminMemberFeatureTab"
      initialTab={initialTab}
      navClickCount={navClickCount}
      onOpenMember={onOpenMember}
      onBackToOrigin={onBackToOrigin}
      memberConnections={memberConnections}
      hiddenFields={[]}
      growthPlan={true}
      listTitle="Advisors"
    />
  )
}

function AddAdvisorForm({ allMembers, onDataChange }) {
  const [memberType, setMemberType] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [eliteStatus, setEliteStatus] = useState('')
  const [revenueDecision, setRevenueDecision] = useState('')
  const [advisorModel, setAdvisorModel] = useState('')
  const [connectedSearch, setConnectedSearch] = useState('')
  const [connectedMember, setConnectedMember] = useState(null)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)
  const [customMemberNumber, setCustomMemberNumber] = useState('')

  const isCorporate = CORPORATE_TYPES.includes(memberType)
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  // Corporate members keep their parent-linked "<parent>-C<n>" numbering and
  // stay uncategorized (member_category=null), so they never enter the integer
  // numbering buckets. Standard advisors are auto-numbered by the backend.
  function corporateMemberNumber() {
    const existing = allMembers.filter(m => m.plugin_member_number?.startsWith(connectedMember.plugin_member_number + '-C'))
    return `${connectedMember.plugin_member_number}-C${existing.length + 1}`
  }

  async function submit() {
    if (!canAddMembers()) { setStatusType('error'); setStatus('Access Denied'); return }
    if (!firstName || !lastName || !memberType) { setStatusType('error'); setStatus('First name, last name, and member type are required.'); return }
    if (!email.trim()) { setStatusType('error'); setStatus('Email is required.'); return }
    if (!eliteStatus) { setStatusType('error'); setStatus('Please pick a status.'); return }
    if (!revenueDecision) { setStatusType('error'); setStatus('Please pick a revenue decision.'); return }
    if (!advisorModel) { setStatusType('error'); setStatus('Please pick Legacy Model or New Model.'); return }
    if (isCorporate && !connectedMember) { setStatusType('error'); setStatus('Corporate members require a connected member.'); return }
    setLoading(true)
    try {
      if (customMemberNumber.trim()) {
        const exists = allMembers.find(m => m.plugin_member_number === customMemberNumber.trim())
        if (exists) { setStatusType('error'); setStatus(`Member number ${customMemberNumber.trim()} already exists.`); setLoading(false); return }
      }
      // Explicit number for a custom override or corporate -C; otherwise omit
      // so the backend auto-generates for the (advisor × advisorModel) bucket.
      const customNum = customMemberNumber.trim()
      const member_number = customNum || (isCorporate && connectedMember ? corporateMemberNumber() : undefined)
      const res = await callApi('add_member_full', { name: `${firstName} ${lastName}`, member_number, first_name: firstName, last_name: lastName, member_type: memberType, elite_status: eliteStatus, email, revenue_decision: revenueDecision, advisor_model: advisorModel, member_category: isCorporate ? null : 'advisor', connected_member_number: connectedMember?.plugin_member_number || null })
      await onDataChange()
      setFirstName(''); setLastName(''); setEmail(''); setMemberType(''); setConnectedMember(null); setConnectedSearch(''); setCustomMemberNumber(''); setAdvisorModel(''); setEliteStatus(''); setRevenueDecision('')
      setStatusType('success'); setStatus(`Member created with number ${res.member_number}`)
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
          <select value={memberType} onChange={e => setMemberType(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {MEMBER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {isCorporate && (
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <label style={labelStyle}>Connected Member *</label>
          <input type="search" name="search" autoComplete="off" value={connectedSearch} onChange={e => { setConnectedSearch(e.target.value); setConnectedMember(null) }} placeholder="Search by name or number..." style={inputStyle} />
          {connectedSearch && !connectedMember && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
              {allMembers.filter(m => m.name?.toLowerCase().includes(connectedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(connectedSearch.toLowerCase())).map(m => (
                <div key={m.plugin_member_number} onClick={() => { setConnectedMember(m); setConnectedSearch(m.name + ' (' + m.plugin_member_number + ')') }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--vfo-tint-deep)', color: 'var(--vfo-ink)', fontSize: '14px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  {m.name} <span style={{ color: 'var(--vfo-muted)' }}>({m.plugin_member_number})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Work Email *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={labelStyle}>Status *</label>
          <select value={eliteStatus} onChange={e => setEliteStatus(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={labelStyle}>Revenue Decision *</label>
          <select value={revenueDecision} onChange={e => setRevenueDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            <option value="Revenue Share">Revenue Share</option>
            <option value="Money Mapping">Money Mapping</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Advisor Model *</label>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['Legacy Model', 'New Model'].map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: `1px solid ${advisorModel === m ? 'rgba(0,149,255,0.5)' : 'var(--vfo-border-strong)'}`, background: advisorModel === m ? 'rgba(0,149,255,0.08)' : 'var(--vfo-tint)', cursor: 'pointer', fontSize: '13px', color: advisorModel === m ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>
              <input type="radio" name="advisor_model" value={m} checked={advisorModel === m} onChange={() => setAdvisorModel(m)} style={{ accentColor: '#0095ff' }} />
              {m}
            </label>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Member Number <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>— leave blank to auto-generate</span></label>
        <input value={customMemberNumber} onChange={e => setCustomMemberNumber(e.target.value)} placeholder="e.g. 59452" style={{ ...inputStyle, maxWidth: '200px' }} />
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
        {loading ? 'Creating...' : 'Create Advisor'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

// ── Strategic Members ────────────────────────────────────────────────
// A 3rd member category (member_category='strategic_member'). The "Member Type"
// dropdown is DB-driven: each Strategic Member Group (a company) is an option,
// and a strategic member (a person at that company) stores the group name in
// member_type. No Legacy/New model — they auto-number from a single bucket.
function StrategicMembersPanel({ allMembers, allExperts, allExclusionMap, ecoMap, onDataChange, initialTab, section, navClickCount, onOpenMember, onBackToOrigin, memberConnections = [] }) {
  const [groups, setGroups] = useState([])

  async function loadGroups() {
    try { const d = await callApi('strategic_groups_load'); setGroups(d.groups || []) }
    catch (err) { console.error(err) }
  }
  useEffect(() => { loadGroups() }, [])

  const strategicMembers = allMembers.filter(m => m.member_category === 'strategic_member')
  const groupNames = groups.map(g => g.name)

  return (
    <MemberDirectoryView
      displayMembers={strategicMembers}
      typeOptions={groupNames}
      allMembers={allMembers}
      allExperts={allExperts}
      allExclusionMap={allExclusionMap}
      ecoMap={ecoMap}
      onDataChange={onDataChange}
      addForm={<AddStrategicSection groupNames={groupNames} allMembers={allMembers} onDataChange={onDataChange} onGroupsChange={loadGroups} />}
      selectedKey="adminSelectedStrategicMember"
      featureTabKey="adminStrategicFeatureTab"
      initialTab={initialTab}
      navClickCount={navClickCount}
      onOpenMember={onOpenMember}
      onBackToOrigin={onBackToOrigin}
      memberConnections={memberConnections}
      hiddenFields={[]}
      listTitle="Strategic Members"
      showModel={false}
      showCredential={false}
      msmOptions={STRATEGIC_MSM_OPTIONS}
      extraTabs={STRATEGIC_EXTRA_TABS}
      msmBypassEnableGate={true}
      msmAllowedPrograms={STRATEGIC_PROGRAM_KEYS}
    />
  )
}

// The Add view has TWO inner tabs (this two-tab pattern is unique to Strategic
// Members): the person form + the one-field group-creation form.
function AddStrategicSection({ groupNames, allMembers, onDataChange, onGroupsChange }) {
  const [tab, setTab] = useState('member')
  const pill = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '6px' })
  return (
    <div>
      <div style={{ display: 'flex', marginBottom: '18px' }}>
        <button style={pill(tab === 'member')} onClick={() => setTab('member')}>Add Strategic Member</button>
        <button style={pill(tab === 'group')} onClick={() => setTab('group')}>Add Strategic Member Group</button>
      </div>
      {tab === 'member' && <AddStrategicMemberForm groupNames={groupNames} allMembers={allMembers} onDataChange={onDataChange} />}
      {tab === 'group' && <AddStrategicGroupForm onGroupsChange={onGroupsChange} />}
    </div>
  )
}

function AddStrategicMemberForm({ groupNames, allMembers, onDataChange }) {
  const [memberType, setMemberType] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [eliteStatus, setEliteStatus] = useState('')
  const [revenueDecision, setRevenueDecision] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)
  const [customMemberNumber, setCustomMemberNumber] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function submit() {
    if (!canAddMembers()) { setStatusType('error'); setStatus('Access Denied'); return }
    if (!firstName || !lastName || !memberType) { setStatusType('error'); setStatus('First name, last name, and member type are required.'); return }
    if (!email.trim()) { setStatusType('error'); setStatus('Email is required.'); return }
    if (!eliteStatus) { setStatusType('error'); setStatus('Please pick a status.'); return }
    if (!revenueDecision) { setStatusType('error'); setStatus('Please pick a revenue decision.'); return }
    setLoading(true)
    try {
      const customNum = customMemberNumber.trim()
      if (customNum) {
        const exists = (allMembers || []).find(m => m.plugin_member_number === customNum)
        if (exists) { setStatusType('error'); setStatus(`Member number ${customNum} already exists.`); setLoading(false); return }
      }
      // Strategic members carry no advisor_model — the backend auto-numbers them
      // from the model-less strategic bucket when member_number is omitted.
      const res = await callApi('add_member_full', {
        name: `${firstName} ${lastName}`,
        member_number: customNum || undefined,
        first_name: firstName,
        last_name: lastName,
        member_type: memberType,
        elite_status: eliteStatus,
        email,
        revenue_decision: revenueDecision,
        member_category: 'strategic_member',
        connected_member_number: null,
      })
      await onDataChange()
      setFirstName(''); setLastName(''); setEmail(''); setMemberType(''); setCustomMemberNumber(''); setEliteStatus(''); setRevenueDecision('')
      setStatusType('success'); setStatus(`Strategic member created with number ${res.member_number}`)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={sectionStyle}>
      {groupNames.length === 0 && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,149,255,0.07)', border: '1px solid rgba(0,149,255,0.22)', color: 'var(--vfo-ink)', fontSize: '13px' }}>
          No Strategic Member Groups yet. Add one under the <strong>Add Strategic Member Group</strong> tab — each group becomes a Member Type option here.
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>First Name *</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>Last Name *</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={labelStyle}>Member Type *</label>
          <select value={memberType} onChange={e => setMemberType(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }} disabled={groupNames.length === 0}>
            <option value="">-- Select group --</option>
            {groupNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Work Email *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={labelStyle}>Status *</label>
          <select value={eliteStatus} onChange={e => setEliteStatus(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={labelStyle}>Revenue Decision *</label>
          <select value={revenueDecision} onChange={e => setRevenueDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            <option value="Revenue Share">Revenue Share</option>
            <option value="Money Mapping">Money Mapping</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Member Number <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>— leave blank to auto-generate</span></label>
        <input value={customMemberNumber} onChange={e => setCustomMemberNumber(e.target.value)} placeholder="e.g. 20000" style={{ ...inputStyle, maxWidth: '200px' }} />
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Creating...' : 'Create Strategic Member'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

function AddStrategicGroupForm({ onGroupsChange }) {
  const [groupName, setGroupName] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function submit() {
    const name = groupName.trim()
    if (!name) { setStatusType('error'); setStatus('Strategic Group Name is required.'); return }
    setLoading(true)
    try {
      await callApi('strategic_group_add', { name })
      await onGroupsChange()
      setGroupName('')
      setStatusType('success'); setStatus(`Group "${name}" created. It's now a Member Type option.`)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ marginBottom: '16px', maxWidth: '420px' }}>
        <label style={labelStyle}>Strategic Group Name *</label>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Action Coach" style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Creating...' : 'Create Group'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

function MemberProfile({ member, allMembers, onDataChange, activeSection, hiddenFields = [], typeOptionsOverride = null, onOpenMember, memberConnections = [] }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const activeTab = activeSection === 'profile_edit' ? 'edit' : activeSection === 'profile_history' ? 'history' : 'details'
  const [typeHistory, setTypeHistory] = useState([])
  const [contacts, setContacts] = useState([])
  // Read-only: computed by the loader from the member's qualifying tax clients
  // and the tax_direct release flag. No control — Direct is never granted here.
  const [directEligibility, setDirectEligibility] = useState(null)
  const [corporateMembers, setCorporateMembers] = useState([])
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [connectedSearch, setConnectedSearch] = useState('')
  const [showConnectedSearch, setShowConnectedSearch] = useState(false)
  const [connSaving, setConnSaving] = useState(false)
  // Introduction is a SECOND, independent link slot (introduced_by_member_number)
  // with its own typeahead state — never share it with the Connection picker.
  const [introducedSearch, setIntroducedSearch] = useState('')
  const [showIntroducedSearch, setShowIntroducedSearch] = useState(false)
  const [programNotes, setProgramNotes] = useState([])
  const [stripeRequesting, setStripeRequesting] = useState(false)
  const [stripeLinking, setStripeLinking] = useState(false)
  const [stripeMsg, setStripeMsg] = useState('')
  const [stripeMsgType, setStripeMsgType] = useState('success')
  const [connectStatus, setConnectStatus] = useState(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [connectRefresh, setConnectRefresh] = useState(0)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropState, setCropState] = useState(null)

  function handlePhotoPick(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCropState({ src: ev.target.result })
    reader.readAsDataURL(file)
    e.target.value = '' // let the same file be re-picked later
  }
  function applyCrop(dataUrl) {
    // data URL -> File so the existing base64 upload path is reused.
    const bstr = atob(dataUrl.split(',')[1])
    let n = bstr.length
    const u8 = new Uint8Array(n)
    while (n--) u8[n] = bstr.charCodeAt(n)
    setPhotoFile(new File([u8], 'headshot.jpg', { type: 'image/jpeg' }))
    setPhotoPreview(dataUrl)
    setCropState(null)
    setDirty(true)
  }

  async function sendStripeRequest() {
    setStripeRequesting(true); setStripeMsg('')
    try {
      let res = await callApi('member_stripe_connect_request', { member_number: member.plugin_member_number })
      // Guard refusal (new backend only — an older one never returns this).
      if (res.already_sent_at) {
        if (!window.confirm(`A setup email was already sent to this member on ${new Date(res.already_sent_at).toLocaleString()}. Send another?`)) return
        res = await callApi('member_stripe_connect_request', { member_number: member.plugin_member_number, force: true })
      }
      setStripeMsgType('success')
      setStripeMsg(`Setup email sent to ${res.to_email}${res.sandbox ? ' (sandbox)' : ''}. Stripe account ${res.stripe_account_id} is ready.`)
      await loadProfile()
    } catch (err) { setStripeMsgType('error'); setStripeMsg(err.message) }
    finally { setStripeRequesting(false) }
  }

  // A Corporate Member has no Connect account of their own — their rev-share is
  // paid into the LEAD member's account. The backend resolves the lead itself
  // (a lead id from the client would let anyone redirect anyone's payouts) and
  // returns a written-for-the-admin sentence on every refusal, so err.message
  // goes straight into the message line.
  async function linkStripeToLead() {
    setStripeLinking(true); setStripeMsg('')
    try {
      const res = await callApi('member_stripe_link_lead', { member_number: member.plugin_member_number })
      setStripeMsgType('success')
      setStripeMsg(`Payouts now go to ${res.lead_name} (${res.lead_member_number})'s Stripe account ${res.stripe_account_id}.`)
      await loadProfile()
    } catch (err) { setStripeMsgType('error'); setStripeMsg(err.message) }
    finally { setStripeLinking(false) }
  }

  async function unlinkStripeFromLead(leadLabel) {
    if (!window.confirm(`Stop paying ${member.name} into ${leadLabel}'s Stripe account? Their rev-share will have nowhere to go until a new account is set up.`)) return
    setStripeLinking(true); setStripeMsg('')
    try {
      await callApi('member_stripe_link_lead', { member_number: member.plugin_member_number, unlink: true })
      setStripeMsgType('success')
      setStripeMsg('Link removed. This member has no Stripe account until a new one is set up.')
      await loadProfile()
    } catch (err) { setStripeMsgType('error'); setStripeMsg(err.message) }
    finally { setStripeLinking(false) }
  }

  useEffect(() => { loadProfile(); loadProgramNotes() }, [member.plugin_member_number])

  const connectAcctId = profile?.stripe_account_id || ''
  useEffect(() => {
    if (!connectAcctId) { setConnectStatus(null); setConnectLoading(false); return }
    let alive = true
    setConnectLoading(true)
    callApi('member_connect_status', { member_number: member.plugin_member_number })
      .then(res => { if (alive) setConnectStatus(res || { status: 'unavailable' }) })
      .catch(() => { if (alive) setConnectStatus({ status: 'unavailable' }) })
      .finally(() => { if (alive) setConnectLoading(false) })
    return () => { alive = false }
  }, [connectAcctId, member.plugin_member_number, connectRefresh])

  async function loadProgramNotes() {
    try {
      const data = await callApi('load_member_program_notes', { member_number: member.plugin_member_number })
      setProgramNotes(data.notes || [])
    } catch (err) { console.error(err) }
  }

  // Additional Contacts ride on member_profile_load; a silent re-read after
  // every contact write keeps the list in step without flashing the skeleton.
  async function reloadContacts() {
    try {
      const data = await callApi('member_profile_load', { member_number: member.plugin_member_number })
      setContacts(data.contacts || [])
    } catch (err) { console.error(err) }
  }

  async function loadProfile() {
    setLoading(true)
    try {
      const data = await callApi('member_profile_load', { member_number: member.plugin_member_number })
      setProfile(data.profile || { member_number: member.plugin_member_number, first_name: member.name?.split(' ')[0] || '', last_name: member.name?.split(' ').slice(1).join(' ') || '', elite_status: 'Active', member_type: '', email: '', suspended: false, paused: false, revenue_decision: 'Revenue Share', credit_note_eligible: true, stripe_account_id: '', connected_member_number: null, introduced_by_member_number: null, connection_type: '', notes: '' })
      setTypeHistory(data.type_history || [])
      setContacts(data.contacts || [])
      setDirectEligibility(data.direct_eligibility || null)
      setCorporateMembers(allMembers.filter(m => m.plugin_member_number?.startsWith(member.plugin_member_number + '-C') || m.plugin_member_number?.startsWith(member.plugin_member_number + '-FC')))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function update(key, val) { setProfile(p => ({ ...p, [key]: val })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      let toSave = profile
      if (photoFile) {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        const nm = `${profile.first_name || ''} ${profile.last_name || ''}`.replace(/[^a-zA-Z0-9 ]/g, '').trim()
        const filename = ts + '_' + (nm || 'member') + '.jpg'
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(photoFile)
        })
        await callApi('upload_headshot', { filename, file_base64: base64, content_type: photoFile.type })
        toSave = { ...profile, headshot_image: filename }
        setProfile(toSave)
      }
      await callApi('member_profile_save', { profile: toSave })
      setPhotoFile(null); setPhotoPreview(null)
      setDirty(false)
      setStatusType('success'); setStatus('Saved!')
      setTimeout(() => setStatus(''), 4000)
      await loadProfile()
      await onDataChange() // refresh the list so the header headshot updates
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setSaving(false) }
  }

  // Connections write straight through (no Save button): the pair lives in its own
  // table, so onDataChange() — AdminPortal.loadAllData — is what re-reads it.
  async function writeConnection(action, otherNumber) {
    setConnSaving(true)
    try {
      await callApi(action, { member_a: member.plugin_member_number, member_b: otherNumber })
      await onDataChange()
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setConnSaving(false) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }
  const subTabStyle = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })
  const CONNECTION_TYPES = ['5% - Regular Advisor', '10% - Accredited Introducer', '10% - Accredited Mentor', '20% - Accredited Introducer + Mentor']
  // Accountants pick from their own product-tier list.
  const isAccountant = member.member_category === 'accountant'
  const isAdvisor = member.member_category === 'advisor'
  // Strategic members pick their "type" from the DB-driven group list (passed in
  // as typeOptionsOverride); advisors/accountants use their hardcoded tier lists.
  const typeOptions = (typeOptionsOverride && typeOptionsOverride.length) ? typeOptionsOverride : (isAccountant ? ACCOUNTANT_TYPES : MEMBER_TYPES)
  const statusColors = { Active: '#1b9254', Lost: '#e74c3c', Removed: 'var(--vfo-muted)' }

  if (loading) return <MemberProfileDetailsSkeleton />
  if (!profile) return null

  // Introduction stays a one-way slot: introduced_by_member_number points at who
  // introduced THIS member (tier = connection_type).
  const introducedByObj = profile.introduced_by_member_number ? allMembers.find(m => m.plugin_member_number === profile.introduced_by_member_number) : null

  // Connections are MUTUAL unordered pairs from member_connections — for every
  // pair naming me, the partner is the other side. No hierarchy, no limit.
  const myNumber = member.plugin_member_number
  const initials = (name) => (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const partnerNumbers = myNumber
    ? [...new Set((memberConnections || [])
        .map(p => String(p.member_a) === String(myNumber) ? String(p.member_b) : String(p.member_b) === String(myNumber) ? String(p.member_a) : null)
        .filter(Boolean))]
    : []
  const connectionPartners = partnerNumbers.map(n => allMembers.find(m => m.plugin_member_number === n)).filter(Boolean)

  // Reciprocal roster: everyone linked to me through an introduction or a pair.
  // Corporate members are excluded — they live in their own card.
  const introducedByMe = myNumber ? allMembers.filter(m => m.introduced_by_member_number === myNumber && !CORPORATE_TYPES.includes(m.member_type)) : []
  const connectedToMe = connectionPartners.filter(m => !CORPORATE_TYPES.includes(m.member_type))

  // stripe_account_linked_from is the BORROWED marker: when it is set,
  // stripe_account_id is the lead member's account, not this member's.
  const linkedFrom = (profile.stripe_account_linked_from || '').trim()
  const linkedLeadRow = linkedFrom ? allMembers.find(m => m.plugin_member_number === linkedFrom) : null
  const linkedLeadName = linkedLeadRow?.name || linkedFrom
  // The roster gives the disabled state immediately; the backend refusal
  // ("<name> (<number>) has no Stripe Connect account yet…") is the backstop.
  const canLinkToLead = isCorporateMember(member)
  const leadRow = canLinkToLead ? findLeadMember(allMembers, member) : null
  const leadLacksAccount = !!leadRow && !(leadRow.stripe_account_id || '').trim()
  const leadRowName = leadRow?.name || leadMemberNumberOf(member) || 'The lead member'

  return (
    <div>
      

      {activeTab === 'details' && (() => {
        const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
        const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px' }
        // Clickable member names reuse AdminPortal.openMemberProfile (the same
        // callback Member Overview uses), so a link lands on the target's own
        // category tab — an advisor card can open an accountant's profile.
        // Link treatment matches MemberOverviewPanel: #125ecc + underline on hover.
        const nameLink = (base) => onOpenMember ? { ...base, color: '#125ecc', cursor: 'pointer' } : base
        const linkHandlers = onOpenMember ? {
          onMouseEnter: e => e.currentTarget.style.textDecoration = 'underline',
          onMouseLeave: e => e.currentTarget.style.textDecoration = 'none',
        } : {}
        // Chips reuse styles already in this file: the blue introducer pill and
        // the neutral count chip.
        const introChip = { fontSize: '11px', padding: '2px 9px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }
        const connectState = (connectLoading || !connectStatus) ? 'loading' : (connectStatus.status || 'unavailable')
        const connectPill =
          connectState === 'complete' ? { dot: '#16a34a', label: 'Account Set up' }
          : connectState === 'eligible_capped' ? { dot: '#f59e0b', label: 'Account setup — payouts eligible to $3,000' }
          : connectState === 'pending' ? { dot: '#dc2626', label: 'Setup pending' }
          : connectState === 'mode_mismatch' ? { dot: 'var(--vfo-faint)', label: `Status unavailable (account created in ${connectStatus.found_in_sandbox ? 'sandbox' : 'live'} mode)` }
          : connectState === 'loading' ? { dot: 'var(--vfo-faint)', label: 'Checking status…' }
          : { dot: 'var(--vfo-faint)', label: 'Status unavailable' }
        return (
          <div>
            {/* Short facts sit side by side; long-form (bio, notes) runs full
                width below so a long bio never strands an empty sidebar. */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 340px', minWidth: '300px' }}>
                <div style={sectionStyle}>
                  <div style={cardTitle}>Member Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
                    <div><div style={fieldLabel}>Join Date</div><div style={fieldValue}>{profile.join_date ? profile.join_date.split('T')[0] : '—'}</div></div>
                    {(profile.elite_status === 'Lost' || profile.elite_status === 'Removed') && <div><div style={fieldLabel}>Leave Date</div><div style={fieldValue}>{profile.leave_date ? profile.leave_date.split('T')[0] : '—'}</div></div>}
                    <div><div style={fieldLabel}>Renewal Date</div><div style={fieldValue}>{profile.membership_renewal_date ? String(profile.membership_renewal_date).split('T')[0] : '—'}</div></div>
                    <div><div style={fieldLabel}>Work email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{profile.email || '—'}</div></div>
                    <div><div style={fieldLabel}>Personal email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{profile.personal_email || '—'}</div></div>
                    {(isAccountant || isAdvisor) && <div><div style={fieldLabel}>Company Name</div><div style={fieldValue}>{profile.trading_name || '—'}</div></div>}
                    {!hiddenFields.includes('revenue_decision') && (
                      <div><div style={fieldLabel}>Revenue Decision</div><div style={fieldValue}>{profile.revenue_decision || '—'}</div></div>
                    )}
                    <div><div style={fieldLabel}>Eligible for Credit Note</div><div style={fieldValue}>{profile.credit_note_eligible === false ? 'No' : 'Yes'}</div></div>
                    {profile.website_url && <div><div style={fieldLabel}>Website</div><div style={fieldValue}><a href={normalizeUrl(profile.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: '#0095ff', textDecoration: 'none', wordBreak: 'break-all' }}>{profile.website_url}</a></div></div>}
                  </div>
                  {profile.stripe_account_id ? (
                    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-tint)' }}>
                      <div style={fieldLabel}>{linkedFrom ? 'Borrowed Stripe Account' : 'Stripe Account'}</div>
                      {linkedFrom && (
                        <div style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', lineHeight: 1.5, marginTop: '7px' }}>
                          Payouts go to <strong>{linkedLeadName} ({linkedFrom})</strong>'s Stripe account. This member has no Stripe Connect account of their own.
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '7px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '6px 12px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px' }}>{profile.stripe_account_id}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '999px', padding: '4px 12px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectPill.dot, flexShrink: 0 }} />
                          {linkedFrom ? `${connectPill.label} — ${linkedLeadName}'s account` : connectPill.label}
                        </span>
                        <button type="button" onClick={() => setConnectRefresh(n => n + 1)} disabled={connectLoading}
                          style={{ background: 'none', border: 'none', padding: 0, color: '#0095ff', fontSize: '12px', fontWeight: 600, cursor: connectLoading ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          Refresh
                        </button>
                        {linkedFrom && (
                          <button type="button" onClick={() => unlinkStripeFromLead(linkedLeadName)} disabled={stripeLinking}
                            style={{ padding: '5px 14px', borderRadius: '999px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, cursor: stripeLinking ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            {stripeLinking ? 'Working…' : 'Unlink'}
                          </button>
                        )}
                      </div>
                      {stripeMsg && <p style={{ fontSize: '12px', marginTop: '8px', color: stripeMsgType === 'success' ? '#1b9254' : '#d93025' }}>{stripeMsg}</p>}
                    </div>
                  ) : (
                    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-tint)' }}>
                      <div style={fieldLabel}>Stripe Connect</div>
                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={sendStripeRequest} disabled={stripeRequesting}
                          style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #125ecc', background: 'var(--vfo-card)', color: '#125ecc', fontSize: '13px', fontWeight: 600, cursor: stripeRequesting ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          {stripeRequesting ? 'Working…' : 'Send Stripe Connect setup email'}
                        </button>
                        {canLinkToLead && (
                          <button type="button" onClick={linkStripeToLead} disabled={stripeLinking || leadLacksAccount}
                            title={leadLacksAccount ? `${leadRowName} has no Stripe Connect account yet` : undefined}
                            style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #125ecc', background: 'var(--vfo-card)', color: '#125ecc', fontSize: '13px', fontWeight: 600, cursor: leadLacksAccount ? 'not-allowed' : stripeLinking ? 'wait' : 'pointer', opacity: leadLacksAccount ? 0.5 : 1, fontFamily: 'Inter, sans-serif' }}>
                            {stripeLinking ? 'Working…' : "Link to Lead Member's Stripe Connect"}
                          </button>
                        )}
                      </div>
                      {stripeMsg && <p style={{ fontSize: '12px', marginTop: '8px', color: stripeMsgType === 'success' ? '#1b9254' : '#d93025' }}>{stripeMsg}</p>}
                    </div>
                  )}
                </div>
              </div>

              {((introducedByObj && !CORPORATE_TYPES.includes(member.member_type)) || introducedByMe.length > 0 || connectedToMe.length > 0 || corporateMembers.length > 0 || profile.vfo_certified_date || profile.vfo_accredited_date) && (
                <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                  {((introducedByObj && !CORPORATE_TYPES.includes(member.member_type)) || introducedByMe.length > 0) && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Introductions</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{(introducedByObj && !CORPORATE_TYPES.includes(member.member_type) ? 1 : 0) + introducedByMe.length}</span>
                      </div>
                      {introducedByObj && !CORPORATE_TYPES.includes(member.member_type) && (
                        <div style={{ marginBottom: introducedByMe.length > 0 ? '16px' : 0 }}>
                          <div style={{ ...fieldLabel, marginBottom: '8px' }}>Introduced By</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0, boxShadow: '0 2px 8px rgba(18,94,204,0.28)' }}>{initials(introducedByObj.name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span onClick={() => onOpenMember && onOpenMember(introducedByObj)} {...linkHandlers} style={nameLink({ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' })}>{introducedByObj.name}</span>
                                {profile.connection_type && <span style={introChip}>{profile.connection_type}</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}><span style={{ fontFamily: 'monospace' }}>{introducedByObj.plugin_member_number}</span>{introducedByObj.member_type ? <> · {introducedByObj.member_type}</> : null}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {introducedByMe.length > 0 && (
                        <div>
                          <div style={{ ...fieldLabel, marginBottom: '2px' }}>Introducer Of</div>
                          {introducedByMe.map((im, i) => (
                            <div key={im.plugin_member_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < introducedByMe.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(im.name)}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span onClick={() => onOpenMember && onOpenMember(im)} {...linkHandlers} style={nameLink({ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' })}>{im.name}</span>
                                  {im.connection_type && <span style={introChip}>{im.connection_type}</span>}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{im.plugin_member_number}</span>{im.member_type ? <> · {im.member_type}</> : null}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {connectedToMe.length > 0 && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Connections</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{connectedToMe.length}</span>
                      </div>
                      {connectedToMe.map((im, i) => (
                        <div key={im.plugin_member_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < connectedToMe.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(im.name)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div onClick={() => onOpenMember && onOpenMember(im)} {...linkHandlers} style={nameLink({ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' })}>{im.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{im.plugin_member_number}</span>{im.member_type ? <> · {im.member_type}</> : null}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {corporateMembers.length > 0 && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Corporate Members</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{corporateMembers.length}</span>
                      </div>
                      {corporateMembers.map((cm, i) => (
                        <div key={cm.plugin_member_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < corporateMembers.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(cm.name)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div onClick={() => onOpenMember && onOpenMember(cm)} {...linkHandlers} style={nameLink({ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' })}>{cm.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{cm.plugin_member_number}</span>{cm.member_type ? <> · {cm.member_type}</> : null}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(profile.vfo_certified_date || profile.vfo_accredited_date) && (
                    <div style={sectionStyle}>
                      <div style={cardTitle}>Certifications</div>
                      {profile.vfo_certified_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: profile.vfo_accredited_date ? '12px' : 0 }}>
                          <img src={vfoCertifiedSeal} style={{ width: '36px', height: '36px' }} />
                          <div><div style={{ fontSize: '14px', color: '#b08d26', fontWeight: '600' }}>VFO Certified</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{profile.vfo_certified_date.split('T')[0]}</div></div>
                        </div>
                      )}
                      {profile.vfo_accredited_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={vfoAccreditedSeal} style={{ width: '36px', height: '36px' }} />
                          <div><div style={{ fontSize: '14px', color: 'var(--vfo-muted)', fontWeight: '600' }}>VFO Accredited</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{profile.vfo_accredited_date.split('T')[0]}</div></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Long-form — full width so a long bio uses the whole row. */}
            {profile.bio && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Bio</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.bio}</div>
              </div>
            )}

            {directEligibility && (
              <div style={{ ...sectionStyle, fontSize: '13px', color: 'var(--vfo-muted)' }}>
                Direct tax planning: {directEligibility.eligible
                  ? `eligible (${directEligibility.qualifying_count} qualifying clients)`
                  : `not yet eligible (${directEligibility.qualifying_count} of 2 qualifying clients)`}
                {directEligibility.feature_released === false && ' — feature not released'}
              </div>
            )}

            <MemberAdditionalContacts memberNumber={member.plugin_member_number} contacts={contacts} onReload={reloadContacts}
              styles={{ sectionStyle, cardTitle, inputStyle, labelStyle }} />

            {profile.notes && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Notes</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.notes}</div>
              </div>
            )}

            {programNotes.length > 0 && (
              <div style={sectionStyle}>
                <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>All Program Notes</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{programNotes.length}</span>
                </div>
                {programNotes.map(note => (
                  <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
                    <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.program_name}</span>
                      <VisibilityBadge visibility={note.visibility} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {activeTab === 'edit' && (() => {
        const editInitials = `${profile.first_name || ''} ${profile.last_name || ''}`.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
        const currentPhoto = photoPreview || (profile.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(profile.headshot_image) : null)
        return (
        <>
          <div style={sectionStyle}>
            <div style={cardTitle}>Photo, Bio &amp; Website</div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div onClick={() => { if (currentPhoto) setCropState({ src: currentPhoto }) }}
                  style={{ width: '110px', height: '110px', borderRadius: '50%', overflow: 'hidden', background: currentPhoto ? 'var(--vfo-tint)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: '1px solid var(--vfo-border-chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPhoto ? 'pointer' : 'default', margin: '0 auto' }}>
                  {currentPhoto
                    ? <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#fff', fontSize: '30px', fontWeight: 700 }}>{editInitials || '?'}</span>}
                </div>
                <label style={{ display: 'inline-block', marginTop: '12px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {currentPhoto ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: 'none' }} />
                </label>
                {currentPhoto && <button type="button" onClick={() => setCropState({ src: currentPhoto })} style={{ display: 'block', margin: '8px auto 0', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Adjust / Zoom</button>}
              </div>
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Bio</label>
                  <textarea value={profile.bio || ''} onChange={e => update('bio', e.target.value)} rows={5} placeholder="A short professional biography for this member." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={labelStyle}>Website URL</label>
                  <input value={profile.website_url || ''} onChange={e => update('website_url', e.target.value)} placeholder="https://example.com" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={cardTitle}>Basic Info</div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name</label><input value={profile.first_name || ''} onChange={e => update('first_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name</label><input value={profile.last_name || ''} onChange={e => update('last_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 2, minWidth: '200px' }}><label style={labelStyle}>Work email (emails sent here)</label><input value={profile.email || ''} onChange={e => update('email', e.target.value)} type="email" style={inputStyle} /></div>
              <div style={{ flex: 2, minWidth: '200px' }}><label style={labelStyle}>Personal email (not emailed)</label><input value={profile.personal_email || ''} onChange={e => update('personal_email', e.target.value)} type="email" style={inputStyle} /></div>
            </div>
            {(isAccountant || isAdvisor) && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>Company Name</label><input value={profile.trading_name || ''} onChange={e => update('trading_name', e.target.value)} style={inputStyle} /></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '0', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={labelStyle}>Member Type</label>
                <select value={profile.member_type || ''} onChange={e => update('member_type', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                  <option value="">-- Select --</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={labelStyle}>Status</label>
                <select value={profile.elite_status || 'Active'} onChange={e => update('elite_status', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                  {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Join Date</label><input type="date" value={profile.join_date || ''} onChange={e => update('join_date', e.target.value)} style={inputStyle} /></div>
              {(profile.elite_status === 'Lost' || profile.elite_status === 'Removed') && <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Leave Date</label><input type="date" value={profile.leave_date || ''} onChange={e => update('leave_date', e.target.value)} style={inputStyle} /></div>}
              {/* Derived from the member's membership fee plan (Accounting → Membership Fees) — display only. */}
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Renewal Date</label><input type="text" readOnly value={profile.membership_renewal_date ? String(profile.membership_renewal_date).split('T')[0] : '—'} title="Set by the membership fee plan under Accounting" style={{ ...inputStyle, background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', cursor: 'not-allowed' }} /></div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={cardTitle}>Settings</div>
            <div style={rowStyle}>
              <div><div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Suspended</div><div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Stops all active processing and holds revenue share payouts — they release automatically when unsuspended</div></div>
              <div onClick={() => update('suspended', !profile.suspended)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: profile.suspended ? '#e74c3c' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: profile.suspended ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
              </div>
            </div>
            {profile.membership_arrears && (
              <div style={{ fontSize: '12px', color: '#b45309', padding: '0 0 8px', lineHeight: 1.45, fontWeight: 600 }}>
                In arrears on membership fees — revenue shares are held; clears automatically when the arrears are paid.
              </div>
            )}
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <div><div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Paused</div><div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Temporarily pauses activity and holds revenue share payouts — they release automatically when unpaused</div></div>
              <div onClick={() => update('paused', !profile.paused)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: profile.paused ? '#e06717' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', left: profile.paused ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={cardTitle}>Revenue</div>
            {!hiddenFields.includes('revenue_decision') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Revenue Decision</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {['Revenue Share', 'Money Mapping'].map(v => (
                    <button key={v} onClick={() => update('revenue_decision', v)} style={{ padding: '8px 18px', borderRadius: '6px', border: `1px solid ${profile.revenue_decision === v ? '#0095ff' : 'var(--vfo-border-mid)'}`, background: profile.revenue_decision === v ? 'rgba(0,149,255,0.15)' : 'transparent', color: profile.revenue_decision === v ? '#0095ff' : 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>{v}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={labelStyle}>Eligible for Credit Note</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {[['On', true], ['Off', false]].map(([lbl, v]) => {
                  const active = (profile.credit_note_eligible !== false) === v
                  return (
                    <button key={lbl} onClick={() => update('credit_note_eligible', v)} style={{ padding: '8px 18px', borderRadius: '6px', border: `1px solid ${active ? '#0095ff' : 'var(--vfo-border-mid)'}`, background: active ? 'rgba(0,149,255,0.15)' : 'transparent', color: active ? '#0095ff' : 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>{lbl}</button>
                  )
                })}
              </div>
            </div>
          </div>
          {/* Introduction slot — who introduced this member. The tier
              (connection_type) is what THAT introducer earns, so it lives here.
              Shown for every member category, accountants included. */}
          <div style={sectionStyle}>
            <div style={cardTitle}>Introductions</div>
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={labelStyle}>Introduced By (search member)</label>
              <input
                type="search"
                name="search"
                autoComplete="off"
                value={introducedByObj && !showIntroducedSearch ? `${introducedByObj.name} (${introducedByObj.plugin_member_number})` : introducedSearch}
                onChange={e => { setIntroducedSearch(e.target.value); setShowIntroducedSearch(true); if (!e.target.value) update('introduced_by_member_number', null) }}
                placeholder="Search by name or number..."
                style={{ ...inputStyle, marginTop: '6px' }}
                onFocus={() => setShowIntroducedSearch(true)}
              />
              {showIntroducedSearch && introducedSearch && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                  {allMembers.filter(m => m.plugin_member_number !== member.plugin_member_number && (m.name?.toLowerCase().includes(introducedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(introducedSearch.toLowerCase()))).map(m => (
                    <div key={m.plugin_member_number} onClick={() => { update('introduced_by_member_number', m.plugin_member_number); setIntroducedSearch(''); setShowIntroducedSearch(false) }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--vfo-tint-deep)', color: 'var(--vfo-ink)', fontSize: '14px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {m.name} <span style={{ color: 'var(--vfo-muted)' }}>({m.plugin_member_number})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Introducer Benefit</label>
              <select value={profile.connection_type || ''} onChange={e => update('connection_type', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)', marginTop: '6px' }}>
                <option value="">-- Select --</option>
                {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {profile.introduced_by_member_number && (
              <button onClick={() => { update('introduced_by_member_number', null); update('connection_type', ''); setIntroducedSearch('') }} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Remove Introduction</button>
            )}
          </div>
          {/* Connections are mutual pairs with no tier and no limit. Every row here
              writes immediately — the Save button below does NOT cover this card. */}
          <div style={sectionStyle}>
            <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Connections</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{connectionPartners.length}</span>
            </div>
            {connectionPartners.length === 0
              ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No connections yet.</p>
              : connectionPartners.map((cp, i) => (
                <div key={cp.plugin_member_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < connectionPartners.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(cp.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{cp.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{cp.plugin_member_number}</span>{cp.member_type ? <> · {cp.member_type}</> : null}</div>
                  </div>
                  <button onClick={() => writeConnection('member_connection_remove', cp.plugin_member_number)} disabled={connSaving} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600, fontSize: '12px', cursor: connSaving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: connSaving ? 0.6 : 1, flexShrink: 0 }}>Remove</button>
                </div>
              ))
            }
            <div style={{ position: 'relative', marginTop: '16px' }}>
              <label style={labelStyle}>Add Connection (search member)</label>
              <input
                type="search"
                name="search"
                autoComplete="off"
                value={connectedSearch}
                onChange={e => { setConnectedSearch(e.target.value); setShowConnectedSearch(true) }}
                placeholder="Search by name or number..."
                style={{ ...inputStyle, marginTop: '6px' }}
                onFocus={() => setShowConnectedSearch(true)}
                disabled={connSaving}
              />
              {showConnectedSearch && connectedSearch && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                  {allMembers.filter(m => m.plugin_member_number !== member.plugin_member_number && !partnerNumbers.includes(m.plugin_member_number) && (m.name?.toLowerCase().includes(connectedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(connectedSearch.toLowerCase()))).map(m => (
                    <div key={m.plugin_member_number} onClick={() => { setConnectedSearch(''); setShowConnectedSearch(false); writeConnection('member_connection_add', m.plugin_member_number) }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--vfo-tint-deep)', color: 'var(--vfo-ink)', fontSize: '14px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {m.name} <span style={{ color: 'var(--vfo-muted)' }}>({m.plugin_member_number})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={cardTitle}>VFO Certification</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Certified Date</label><input type="date" value={profile.vfo_certified_date || ''} onChange={e => update('vfo_certified_date', e.target.value || null)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Accredited Date</label><input type="date" value={profile.vfo_accredited_date || ''} onChange={e => update('vfo_accredited_date', e.target.value || null)} style={inputStyle} /></div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={cardTitle}>Notes</div>
            <textarea value={profile.notes || ''} onChange={e => update('notes', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ position: 'sticky', bottom: 0, background: 'var(--vfo-page)', borderTop: '1px solid var(--vfo-border)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {dirty && <span style={{ fontSize: '13px', color: '#b08d26', fontWeight: 500 }}>You have unsaved changes</span>}
            <button onClick={save} disabled={saving} style={{ padding: '10px 28px', borderRadius: '8px', background: saving ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {status && <span style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px' }}>{status}</span>}
          </div>
        </>
        )
      })()}

      {activeTab === 'history' && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Member Type History</div>
          {typeHistory.length === 0
            ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No type changes recorded yet.</p>
            : typeHistory.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                <div style={{ textAlign: 'left' }}><span style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>{h.old_type}</span><span style={{ color: 'var(--vfo-muted)', margin: '0 8px' }}>→</span><span style={{ color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: '600' }}>{h.new_type}</span></div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{new Date(h.changed_at).toLocaleDateString()}</div>
              </div>
            ))
          }
        </div>
      )}

      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}
    </div>
  )
}

function ComingSoon({ title }) {
  return <div style={{ textAlign: 'center', padding: '60px 20px' }}><p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '12px' }}>{title}</p><p style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>Coming soon.</p></div>
}

function MemberSpecialists({ member, allExperts, allExclusionMap, ecoMap = {}, onDataChange }) {
  const excluded = allExclusionMap[member.plugin_member_number] || []
  // Member Services specialists are internal-only (never shown to clients or in the
  // website plugin), so they aren't enable/disable-able — listed separately below.
  const isMemberService = (id) => (ecoMap[id] || []).includes('Member Services')
  const regularExperts = allExperts.filter(e => !isMemberService(e.id))
  const memberServiceExperts = allExperts.filter(e => isMemberService(e.id))
  const [enabled, setEnabled] = useState(() => { const set = {}; regularExperts.forEach(e => { set[e.id] = !excluded.includes(e.id) }); return set })
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
      .concat(excluded.filter(id => isMemberService(id)))
    try {
      await callApi('save_member', { member_number: member.plugin_member_number, exclusions: newExcluded })
      await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginBottom: '20px', fontStyle: 'italic' }}>Changes here affect which specialists appear in this member's VFO Showroom and Website Plugin.</p>
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
          <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', fontStyle: 'italic', marginBottom: '10px' }}>Internal only — these specialists never appear in clients' showrooms or website plugins, so there is nothing to enable or disable.</p>
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

// Admin-side view of one member's Growth Credits. Services and History are the
// member's own views (shared components) so the two can never drift; Dashboard
// stays admin-only (balance, stats, Add Credits).
function MemberGC({ member }) {
  const [gcTab, setGcTab] = useState('dashboard')
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState(null)
  const [redemptions, setRedemptions] = useState(null)
  const [addAmount, setAddAmount] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [banner, setBanner] = useState('')

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

  function showBanner(msg) { setBanner(msg); setTimeout(() => setBanner(''), 5000) }

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

  const subTabStyle = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        {[['dashboard', 'Dashboard'], ['services', 'Services'], ['history', 'History']].map(([key, label]) => (
          <button key={key} style={subTabStyle(gcTab === key)} onClick={() => setGcTab(key)}>{label}</button>
        ))}
      </div>
      {gcTab === 'dashboard' && (
        <>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...sectionStyle, flex: 1, textAlign: 'center' }}>
              <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Credit Balance</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '42px', color: 'var(--vfo-ink)', margin: 0, minHeight: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {balance === null ? <Skeleton width={70} height={36} /> : balance}
              </p>
            </div>
            <div style={{ ...sectionStyle, flex: 1 }}>
              <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Quick Stats</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                <span style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>Total Redemptions</span>
                {redemptions === null ? <Skeleton width={30} height={14} /> : <span style={{ color: 'var(--vfo-ink)', fontWeight: '600' }}>{redemptions.length}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>Total Spent</span>
                {redemptions === null ? <Skeleton width={30} height={14} /> : <span style={{ color: 'var(--vfo-ink)', fontWeight: '600' }}>{redemptions.reduce((s, r) => s + (r.credits || 0), 0)}</span>}
              </div>
            </div>
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Credits</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Amount</label><input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="e.g. 100" min="1" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Description (optional)</label><input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="e.g. Monthly allocation" style={inputStyle} /></div>
              <button onClick={addCredits} style={{ padding: '12px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Credits</button>
            </div>
            {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
          </div>
        </>
      )}
      {/* Kept mounted so the catalogue and open Details survive a tab switch.
          Every gc_* call inside is passed this member's number explicitly —
          admins are not member-scoped by the backend. */}
      <GCServicesView
        active={gcTab === 'services'}
        adminMode
        memberNumber={member.plugin_member_number}
        balance={balance}
        banner={banner}
        showBanner={showBanner}
        onBalanceChange={setBalance}
        onRedeemed={loadGC}
      />
      {gcTab === 'history' && <GCTransactionHistory transactions={transactions} />}
    </div>
  )
}



function MemberSettings({ member, allMembers = [], onDataChange }) {
  const [loginLoading, setLoginLoading] = useState(true)
  const [existingLogin, setExistingLogin] = useState(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPasscode, setLoginPasscode] = useState('')
  const [loginStatus, setLoginStatus] = useState('')
  const [loginStatusType, setLoginStatusType] = useState('success')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState('')
  const [ciqEnabled, setCiqEnabled] = useState(member.ciq_enabled || false)
  const [ciqVfosManaged, setCiqVfosManaged] = useState(member.ciq_vfos_managed !== false)
  const [ciqStatus, setCiqStatus] = useState('')
  const [stripeRequesting, setStripeRequesting] = useState(false)
  const [stripeMsg, setStripeMsg] = useState('')
  const [stripeMsgType, setStripeMsgType] = useState('success')
  const [connectStatus, setConnectStatus] = useState(null)
  const [connectLoading, setConnectLoading] = useState(true)
  const [connectRefresh, setConnectRefresh] = useState(0)
  const [linkedFrom, setLinkedFrom] = useState('')

  useEffect(() => { loadLogin() }, [member.plugin_member_number])

  // The borrowed-account marker lives only on the members row — the roster blob
  // load_data returns does not carry it — so read it from the profile.
  useEffect(() => {
    let alive = true
    callApi('member_profile_load', { member_number: member.plugin_member_number })
      .then(d => { if (alive) setLinkedFrom((d?.profile?.stripe_account_linked_from || '').trim()) })
      .catch(() => { if (alive) setLinkedFrom('') })
    return () => { alive = false }
  }, [member.plugin_member_number, connectRefresh])

  // The `member` prop comes from allMembers and goes stale the moment a send
  // creates the account, so ask Stripe rather than trusting the cached row.
  useEffect(() => {
    let alive = true
    setConnectLoading(true)
    callApi('member_connect_status', { member_number: member.plugin_member_number })
      .then(res => { if (alive) setConnectStatus(res || { status: 'unavailable' }) })
      .catch(() => { if (alive) setConnectStatus({ status: 'unavailable' }) })
      .finally(() => { if (alive) setConnectLoading(false) })
    return () => { alive = false }
  }, [member.plugin_member_number, connectRefresh])

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

  async function saveCiqSettings(enabled, vfosManaged) {
    try {
      await callApi('member_profile_save', { profile: { member_number: member.plugin_member_number, ciq_enabled: enabled, ciq_vfos_managed: vfosManaged } })
      setCiqEnabled(enabled)
      setCiqVfosManaged(vfosManaged)
      if (onDataChange) await onDataChange()
      setCiqStatus('Saved!'); setTimeout(() => setCiqStatus(''), 3000)
    } catch (err) { setCiqStatus(err.message) }
  }

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

  async function sendStripeRequest() {
    setStripeRequesting(true); setStripeMsg('')
    try {
      let res = await callApi('member_stripe_connect_request', { member_number: member.plugin_member_number })
      // Guard refusal (new backend only — an older one never returns this).
      if (res.already_sent_at) {
        if (!window.confirm(`A setup email was already sent to this member on ${new Date(res.already_sent_at).toLocaleString()}. Send another?`)) return
        res = await callApi('member_stripe_connect_request', { member_number: member.plugin_member_number, force: true })
      }
      setStripeMsgType('success')
      setStripeMsg(`Setup email sent to ${res.to_email}${res.sandbox ? ' (sandbox)' : ''}. Stripe account ${res.stripe_account_id} is ready.`)
      // Local refetch only — a global reload here re-skeletons the whole panel (#245).
      setConnectRefresh(n => n + 1)
    } catch (err) { setStripeMsgType('error'); setStripeMsg(err.message) }
    finally { setStripeRequesting(false) }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const linkedLeadName = (linkedFrom && allMembers.find(m => m.plugin_member_number === linkedFrom)?.name) || linkedFrom

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Member Login</div>
        {loginLoading
          ? <SkeletonText lines={2} />
          : (
            <>
              <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '16px' }}>
                {existingLogin
                  ? <>This member can sign in as <strong>{existingLogin.email}</strong>. Send a setup email to let them set a new passcode.</>
                  : <>No login yet. Send a setup email so this member can create their own passcode.</>}
              </p>
              <SendSetupEmailButton loginType="member" subjectId={member.plugin_member_number} hint="Drafts a Gmail with a secure link. The member sets their own passcode." />
            </>
          )}
        {loginStatus && <p style={{ color: loginStatusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{loginStatus}</p>}
      </div>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Stripe Connect</div>
        {connectLoading ? (
          <SkeletonText lines={2} />
        ) : linkedFrom ? (
          // Borrowed account — the setup-email button 400s for a linked member,
          // so it is not offered here at all.
          <div>
            <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              Payouts go to <strong style={{ color: 'var(--vfo-ink)' }}>{linkedLeadName} ({linkedFrom})</strong>'s Stripe account. This member has no Stripe Connect account of their own — manage the link on the Profile tab.
            </p>
            {connectStatus?.stripe_account_id && (
              <span style={{ display: 'inline-block', marginTop: '12px', fontSize: '13px', color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '8px 12px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px' }}>{connectStatus.stripe_account_id}</span>
            )}
          </div>
        ) : (connectStatus && connectStatus.status !== 'none') ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '8px 12px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px' }}>{connectStatus.stripe_account_id}</span>
            <button onClick={sendStripeRequest} disabled={stripeRequesting} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: stripeRequesting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: stripeRequesting ? 0.6 : 1 }}>
              {stripeRequesting ? 'Sending...' : 'Resend setup email'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '16px' }}>No payment account yet. Send the member a secure Stripe setup link.</p>
            <button onClick={sendStripeRequest} disabled={stripeRequesting} style={{ padding: '10px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: stripeRequesting ? 'not-allowed' : 'pointer', opacity: stripeRequesting ? 0.6 : 1 }}>
              {stripeRequesting ? 'Sending...' : 'Set Up Payment Details'}
            </button>
          </div>
        )}
        {stripeMsg && <p style={{ fontSize: '12.5px', marginTop: '12px', color: stripeMsgType === 'success' ? '#1b9254' : '#d93025' }}>{stripeMsg}</p>}
      </div>
      <div style={{ ...sectionStyle, border: '1px solid rgba(231,76,60,0.3)' }}>
        <div style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Danger Zone</div>
        {!deleteConfirm
          ? <button onClick={() => setDeleteConfirm(true)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontWeight: 500, fontSize: '14px', cursor: 'pointer' }}>Delete Member</button>
          : <div>
              <p style={{ color: '#e74c3c', fontWeight: 500, fontSize: '14px', marginBottom: '12px' }}>Are you sure? This will remove all settings and exclusions. This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={deleteMember} style={{ padding: '10px 24px', borderRadius: '8px', background: '#e74c3c', border: 'none', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Yes, Delete</button>
                <button onClick={() => setDeleteConfirm(false)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              </div>
              {deleteStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '12px' }}>{deleteStatus}</p>}
            </div>
        }
      </div>
    </div>
  )
}
// Member Additional Contacts — the member-side twin of the client Profile
// tab's Additional Contacts (ClientDetail.jsx). Admin-only by decision: one
// switch, "Cc on all emails", no greeting toggle. A flagged contact is Cc'd by
// the backend on EVERY portal email that addresses or Cc's the member
// (resolveTemplateRecipients), so no per-email choice exists here.
// Email bar matches the backend's (contact-add.ts / dedupeEmails).
const MEMBER_CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function MemberAdditionalContacts({ memberNumber, contacts, onReload, styles }) {
  const { sectionStyle, cardTitle, inputStyle, labelStyle } = styles
  const [showAdd, setShowAdd] = useState(false)
  const [addFirst, setAddFirst] = useState('')
  const [addLast, setAddLast] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addError, setAddError] = useState('')
  const [addedFlash, setAddedFlash] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [rowError, setRowError] = useState({})
  const [rowSaved, setRowSaved] = useState({})
  const [busyId, setBusyId] = useState(null)

  const addEmailValid = MEMBER_CONTACT_EMAIL_RE.test(addEmail.trim())
  const canAdd = !!addFirst.trim() && !!addLast.trim() && addEmailValid

  function setError(id, msg) { setRowError(prev => ({ ...prev, [id]: msg })) }

  async function addContact() {
    if (!canAdd) return
    setAddError('')
    try {
      await callApi('member_contact_add', { member_number: memberNumber, first_name: addFirst.trim(), last_name: addLast.trim(), email: addEmail.trim(), phone: addPhone.trim() })
      setAddFirst(''); setAddLast(''); setAddEmail(''); setAddPhone(''); setShowAdd(false)
      setAddedFlash(true); setTimeout(() => setAddedFlash(false), 4000)
      onReload()
    } catch (err) { setAddError(err?.message || 'Something went wrong') }
  }

  async function removeContact(c) {
    if (!window.confirm(`Remove ${c.first_name} ${c.last_name} from this member's additional contacts?`)) return
    try { await callApi('member_contact_delete', { contact_id: c.id }); onReload() }
    catch (err) { setError(c.id, err?.message || 'Something went wrong') }
  }

  // One call per change; the backend re-checks the email invariant on the
  // final state, so anything it rejects lands in this row's error line.
  async function saveContact(id, patch) {
    setBusyId(id)
    try {
      await callApi('member_contact_update', { contact_id: id, ...patch })
      setError(id, '')
      onReload()
      return true
    } catch (err) {
      setError(id, err?.message || 'Something went wrong')
      return false
    } finally { setBusyId(null) }
  }

  function startEdit(c) {
    setEditId(c.id)
    setEditFirst(c.first_name || ''); setEditLast(c.last_name || ''); setEditEmail(c.email || ''); setEditPhone(c.phone || '')
    setError(c.id, '')
  }

  async function saveEdit(id) {
    const next = editEmail.trim()
    if (!editFirst.trim() || !editLast.trim()) { setError(id, 'First and last name are required.'); return }
    if (next && !MEMBER_CONTACT_EMAIL_RE.test(next)) { setError(id, 'Enter a valid email address.'); return }
    const ok = await saveContact(id, { first_name: editFirst.trim(), last_name: editLast.trim(), email: next, phone: editPhone.trim() })
    if (ok) setEditId(null)
  }

  // The switch fires on click — one flag, no staging needed.
  async function toggleCc(c) {
    if (!c.cc_on_emails && !String(c.email || '').trim()) {
      setError(c.id, 'This contact has no email address on file — add one to enable Cc.')
      return
    }
    const ok = await saveContact(c.id, { cc_on_emails: !c.cc_on_emails })
    if (!ok) return
    setRowSaved(prev => ({ ...prev, [c.id]: true }))
    setTimeout(() => setRowSaved(prev => ({ ...prev, [c.id]: false })), 4000)
  }

  const primaryBtn = { padding: '6px 16px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: 'pointer' }
  const ghostBtn = { padding: '6px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }

  return (
    <div style={sectionStyle}>
      <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Additional Contacts</span>
        <button type="button" onClick={() => { setShowAdd(!showAdd); setAddError('') }} style={{ ...primaryBtn, padding: '6px 14px' }}>+ Add</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
        People on this member's team. With <strong>Cc on all emails</strong> switched on, a contact is Cc'd on every portal email this member receives or is Cc'd on.
      </div>

      {showAdd && (
        <div style={{ padding: '16px', background: 'var(--vfo-tint)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={addFirst} onChange={e => setAddFirst(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={addLast} onChange={e => setAddLast(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={labelStyle}>Email *</label>
              <input value={addEmail} onChange={e => setAddEmail(e.target.value)} type="email" style={inputStyle} />
              {!!addEmail.trim() && !addEmailValid && <div style={{ ...labelStyle, marginTop: '6px', marginBottom: 0 }}>Enter a valid email address.</div>}
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><input value={addPhone} onChange={e => setAddPhone(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" onClick={addContact} disabled={!canAdd} style={{ ...primaryBtn, padding: '8px 20px', fontSize: '13px', background: canAdd ? primaryBtn.background : 'var(--vfo-tint)', border: canAdd ? 'none' : '1px solid var(--vfo-border-mid)', boxShadow: canAdd ? primaryBtn.boxShadow : 'none', color: canAdd ? '#fff' : 'var(--vfo-muted)', cursor: canAdd ? 'pointer' : 'not-allowed' }}>Save</button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ ...ghostBtn, padding: '8px 20px', fontSize: '13px' }}>Cancel</button>
            {addError && <span style={{ color: '#e74c3c', fontSize: '12px', fontWeight: 500 }}>{addError}</span>}
          </div>
        </div>
      )}

      {addedFlash && <div style={{ color: '#1b9254', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Contact added</div>}
      {contacts.length === 0 && !showAdd && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0 }}>No additional contacts yet.</p>}
      {contacts.map(c => (
        <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
          {editId === c.id ? (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={editFirst} onChange={e => setEditFirst(e.target.value)} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={editLast} onChange={e => setEditLast(e.target.value)} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => saveEdit(c.id)} disabled={busyId === c.id} style={{ ...primaryBtn, cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>{busyId === c.id ? 'Saving...' : 'Save'}</button>
                <button type="button" onClick={() => { setEditId(null); setError(c.id, '') }} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{c.first_name} {c.last_name}</div>
                {c.email
                  ? <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                  : <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '2px', fontStyle: 'italic' }}>No email on file{c.phone ? ` · ${c.phone}` : ''}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--vfo-muted)', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={!!c.cc_on_emails} disabled={busyId === c.id}
                    onChange={() => toggleCc(c)} style={{ accentColor: '#125ecc', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }} />
                  Cc on all emails
                </label>
                {busyId === c.id && <span style={{ color: 'var(--vfo-muted)', fontSize: '12px' }}>Saving...</span>}
                {busyId !== c.id && rowSaved[c.id] && <span style={{ color: '#1b9254', fontWeight: 600, fontSize: '12px' }}>Saved</span>}
                <button type="button" onClick={() => startEdit(c)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                <button type="button" onClick={() => removeContact(c)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          )}
          {rowError[c.id] && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{rowError[c.id]}</div>}
        </div>
      ))}
    </div>
  )
}
