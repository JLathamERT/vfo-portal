import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { callApi, getSession, getLastSeen, setLastSeen } from '../../lib/api'
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
import ListTable, { ListName, ListPill, ListText, listSearchStyle } from '../shared/ListTable'
import SpecialistPicker from '../shared/SpecialistPicker'
import { MemberEditFormSkeleton, MemberProfileDetailsSkeleton, ProgramNotesSkeleton, Skeleton, SkeletonText } from '../shared/Skeleton'
import { HeroAvatar, ListHeader } from '../shared/TrackKit'
import { ChoiceButtons, DotText, Field, FormGrid, PersonName, formInput, formLabel, formReadOnly, Initials, PageHeading, ProfileCard, ProfileHero, SaveBar, SettingRow, Switch } from '../shared/ProfileKit'
import { btnDanger, btnOutline, btnPrimary, btnSecondary, btnState, BTN_SMALL } from '../shared/buttonStyles'
import ExportButton from '../shared/ExportButton'
import { splitName, exportDate } from '../../lib/exportXlsx'
import { IS_STAGING } from '../../lib/environment'
import ImageCropModal from './ImageCropModal'
import { MemberNameLink } from '../shared/personLinks'
import { CORPORATE_TYPES, isCorporateMember, leadMemberNumberOf, findLeadMember } from '../shared/corporateMember'
import { MEMBER_TYPES, ACCOUNTANT_TYPES } from '../shared/memberTypes'
import { GCServicesView, GCTransactionHistory } from '../shared/GCMarketplaceViews'
import { HEADSHOTS_URL } from '../../lib/environment'
// The engagement rating is set on the Member Overview tab; the profile hero
// only DISPLAYS it. Admin surface throughout — the member portal never renders
// it, and load_data strips the column for non-admin callers.
import { engagementMeta } from './MemberOverviewPanel'

// Creating advisors / accountants / strategic members is restricted to the
// SuperAdmin (Jake) plus Tray Valdés-Dennis (tvaldes@elitert.com).
const canAddMembers = () => { const s = getSession(); return !!s?.is_superadmin || (s?.email || '').toLowerCase() === 'tvaldes@elitert.com' }

const HEADSHOT_SUPABASE = HEADSHOTS_URL
// Prepend https:// to a bare domain so member website links resolve as absolute.
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
import vfoCertifiedSeal from '../../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../../assets/vfo-accredited-emblem.png'
import { formatDate } from '../../lib/dates'
import { cleanText, formatPersonName } from '../../lib/formatters'
import PhoneInput from '../shared/PhoneInput'
import MemberBrandingCard from '../shared/MemberBrandingCard'
import MemberProfileDetails from '../shared/MemberProfileDetails'
import StripeAccountField from '../shared/StripeAccountField'
import { STATUS_COLORS, statusColor } from '../shared/statusColors'

// Detail-view tab sets. Advisors/accountants get the full set; Strategic Members
// get a trimmed view: Profile (all sub-tabs, always shown), MSM limited to
// Holistic + Tax Planning, plus Specialists + Showroom + CIQ (no Website Plugin /
// GC Marketplace / Growth Plan).
const DEFAULT_MSM_OPTIONS = [
  { key: 'msm_meetings', label: 'Programs' },
  { key: 'msm_program_tax', label: 'VFO Tax Planning' },
  { key: 'msm_program_holistic', label: 'VFO Holistic Planning' },
  { key: 'msm_program_partnership', label: 'Partnership Fast Track' },
  { key: 'msm_program_tailored', label: 'Tailored Route for Accountants' },
  { key: 'msm_program_coaching', label: 'Advanced Coaching' },
  { key: 'msm_program_standard', label: 'Standard Coaching' },
]
const DEFAULT_EXTRA_TABS = [['specialists', 'Specialists'], ['showroom', 'Showroom'], ['website', 'Website Plugin'], ['ciq', 'CIQ'], ['gc', 'Growth Credit Marketplace']]
const STRATEGIC_MSM_OPTIONS = [
  { key: 'msm_meetings', label: 'Programs' },
  { key: 'msm_program_tax', label: 'VFO Tax Planning' },
  { key: 'msm_program_holistic', label: 'VFO Holistic Planning' },
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

// Staging only: members are not added by hand there. Each person's test member is
// made with their admin login (edge utils/staging-test-member.ts; the server refuses
// add_member / add_member_full on staging too).
function StagingAddMemberNote() {
  return (
    <ProfileCard icon="alert" tone="gold" title="Test site" sub="Members are not added by hand on the test site, so Create is switched off here.">
      <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink-2)', lineHeight: 1.55 }}>
        Each person's own test member is made automatically when their admin login is added in the Admin Editor, and they sign in to the member portal with the same email and password. Members made by running an onboarding test are fine.
      </div>
    </ProfileCard>
  )
}

// The Add Advisor / Accountant / Strategic Member page (2026-11-26, Jake): the Edit
// Profile look, the fields in titled boxes and the pinned Create bar. Each form
// keeps its own state, checks and save, and hands them in here. On the test site
// the boxes show (so the page can be looked at) with Create switched off, because
// the server refuses add_member_full there.
const ADD_STATUS_CHOICES = [['Active', 'Active'], ['Lost', 'Lost'], ['Removed', 'Removed']]
const ADD_REVENUE_CHOICES = [['Revenue Share', 'Revenue Share'], ['Money Mapping', 'Money Mapping']]
const ADD_MODEL_CHOICES = [['Legacy Model', 'Legacy Model'], ['New Model', 'New Model']]

function AddMemberCards({ heading, v, set, typeOptions, typePlaceholder = '-- Select --', typeDisabled = false, notice, connectedField, showCompany = false, showModel = true, numberPlaceholder, loading, onCreate, createLabel, status, statusType }) {
  const field = (label, node, wide) => (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={formLabel}>{label}</label>{node}</div>
  )
  return (
    <div>
      {heading}
      {IS_STAGING && <StagingAddMemberNote />}
      {notice}
      <ProfileCard icon="user" title="Name & Member Type" style={{ overflow: 'visible' }}>
        <FormGrid min={200}>
          {field('First Name *', <input value={v.firstName} onChange={e => set.firstName(e.target.value)} style={formInput} />)}
          {field('Last Name *', <input value={v.lastName} onChange={e => set.lastName(e.target.value)} style={formInput} />)}
          {field('Member Type *', (
            <select value={v.memberType} onChange={e => set.memberType(e.target.value)} style={formInput} disabled={typeDisabled}>
              <option value="">{typePlaceholder}</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ))}
          {connectedField && <div style={{ gridColumn: '1 / -1', position: 'relative' }}>{connectedField}</div>}
        </FormGrid>
      </ProfileCard>
      <ProfileCard icon="contacts" title="Contact">
        <FormGrid min={240}>
          {field('Work Email *', <input value={v.email} onChange={e => set.email(e.target.value)} type="email" style={formInput} />)}
          {showCompany && field('Company Name', <input value={v.tradingName} onChange={e => set.tradingName(e.target.value)} placeholder="Company name (optional)" style={formInput} />)}
        </FormGrid>
      </ProfileCard>
      <ProfileCard icon="id" title="Membership" sub="The member number is made automatically unless you type one.">
        <div style={{ display: 'grid', gap: '16px' }}>
          {field('Status *', <ChoiceButtons options={ADD_STATUS_CHOICES} value={v.eliteStatus} onChange={set.eliteStatus} />)}
          {field('Revenue Decision *', <ChoiceButtons options={ADD_REVENUE_CHOICES} value={v.revenueDecision} onChange={set.revenueDecision} />)}
          {showModel && field('Advisor Model *', <ChoiceButtons options={ADD_MODEL_CHOICES} value={v.advisorModel} onChange={set.advisorModel} />)}
          {field('Member Number', <input value={v.customMemberNumber} onChange={e => set.customMemberNumber(e.target.value)} placeholder={numberPlaceholder} style={{ ...formInput, maxWidth: '220px' }} />)}
        </div>
      </ProfileCard>
      <SaveBar saving={loading} onSave={onCreate} disabled={IS_STAGING} label={createLabel} savingLabel="Creating…" status={status} statusType={statusType} />
    </div>
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
    <AddMemberCards
      heading={<PageHeading eyebrow="Accountants" title="Add Accountant" />}
      v={{ firstName, lastName, memberType, tradingName, email, eliteStatus, revenueDecision, advisorModel, customMemberNumber }}
      set={{ firstName: setFirstName, lastName: setLastName, memberType: setMemberType, tradingName: setTradingName, email: setEmail, eliteStatus: setEliteStatus, revenueDecision: setRevenueDecision, advisorModel: setAdvisorModel, customMemberNumber: setCustomMemberNumber }}
      typeOptions={ACCOUNTANT_TYPES} showCompany numberPlaceholder="e.g. 59452"
      loading={loading} onCreate={submit} createLabel="Create Accountant" status={status} statusType={statusType}
    />
  )
}

export function FeatureTabDropdown({ label, isActive, options, onSelect, onLabelClick }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { setOpen(false) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button onClick={onLabelClick ? () => { onLabelClick(); setOpen(false) } : undefined} style={{ padding: '7px 16px', background: isActive ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: isActive ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
// Export columns for the three member search pages. A member with no profile
// first/last name falls back to splitting the display name. Status reads blank
// as Active, exactly as the Status filter does. `default: false` columns start
// unticked in the Export window.
const memberFirstLast = (m) => (m.first_name || m.last_name) ? [m.first_name || '', m.last_name || ''] : splitName(m.name)
const memberStanding = (m) => [m.suspended && 'Suspended', m.paused && 'Paused', m.membership_arrears && 'In Arrears'].filter(Boolean).join(', ')
const MEMBER_EXPORT_COLUMNS = [
  { header: '#', value: m => m.plugin_member_number },
  { header: 'First Name', value: m => memberFirstLast(m)[0] },
  { header: 'Last Name', value: m => memberFirstLast(m)[1] },
  { header: 'Status', value: m => m.elite_status || 'Active' },
  { header: 'Email', value: m => m.email || '' },
  { header: 'Member Type', value: m => m.member_type || '' },
  { header: 'Full Name', value: m => m.name || '', default: false },
  { header: 'MSM', value: m => (m.assigned_msm || '').trim(), default: false },
  { header: 'Model', value: m => m.advisor_model || '', default: false },
  { header: 'Standing', value: memberStanding, default: false },
  { header: 'Join Date', value: m => exportDate(m.join_date), default: false },
  { header: 'Leave Date', value: m => exportDate(m.leave_date), default: false },
  { header: 'VFO Certified', value: m => exportDate(m.vfo_certified_date), default: false },
  { header: 'VFO Accredited', value: m => exportDate(m.vfo_accredited_date), default: false },
  { header: 'Trading Name', value: m => m.trading_name || '', default: false },
  { header: 'Website', value: m => m.website_url || '', default: false },
  { header: 'Introduced By #', value: m => m.introduced_by_member_number || '', default: false },
]
// Filter-only label for a member with no `assigned_msm` (the same sentinel as
// Member Overview's): nothing stores it, and '' cannot be an option because
// matchesFilter reads an empty selection as no filter.
const UNASSIGNED_MSM = 'Unassigned'

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
  // MSM options come from the members on this list (`assigned_msm` is free text,
  // there is no roster); the names sort first, then Unassigned.
  const msmNames = [...new Set(displayMembers.map(m => (m.assigned_msm || '').trim()).filter(Boolean))].sort()
  const msmFilterOptions = displayMembers.some(m => !(m.assigned_msm || '').trim()) ? [...msmNames, UNASSIGNED_MSM] : msmNames
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
    ...(msmFilterOptions.length ? [{ key: 'msm', label: 'MSM', options: msmFilterOptions, get: m => (m.assigned_msm || '').trim() || UNASSIGNED_MSM }] : []),
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
          <ListHeader title={listTitle} count={filteredMembers.length} action={<ExportButton title={listTitle} columns={MEMBER_EXPORT_COLUMNS} rows={sortMembers(searched, listSort)} filterGroups={filterGroups} filterValue={listFilter} />} />
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name or number..." style={listSearchStyle} onChange={e => setMemberSearch(e.target.value.toLowerCase())} value={memberSearch} />
            <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
            <SortSelect value={listSort} onChange={setListSort} options={MEMBER_SORT_OPTIONS} />
          </div>
          <ListTable
            rows={sortMembers(filteredMembers, listSort)}
            rowKey={m => m.plugin_member_number}
            resetSortOn={listSort}
            minWidth="760px"
            empty={memberSearch ? 'No members match your search.' : 'No members match the current filters.'}
            onRowClick={(m, e) => { if (reconciliationLocked(m)) { flashDeny(e); return } setSelectedMember(m); setMemberFeatureTab('profile_details'); sessionStorage.setItem(selectedKey, m.plugin_member_number); sessionStorage.setItem(featureTabKey, 'profile_details'); sessionStorage.removeItem(MEMBER_PROFILE_ORIGIN_KEY); window.scrollTo(0, 0) }}
            columns={[
              { key: 'number', label: 'Number', width: '100px', get: m => m.plugin_member_number, render: m => <ListText mono>{m.plugin_member_number}</ListText> },
              { key: 'name', label: 'Name', width: '1.6fr', get: m => m.name, render: m => <ListName>{m.name}</ListName> },
              { key: 'status', label: 'Status', width: '110px', get: m => m.elite_status, render: m => m.elite_status ? <ListPill color={statusColor(m.elite_status, '#8a94a6')}>{m.elite_status}</ListPill> : <ListText /> },
              { key: 'type', label: 'Type', width: '1.3fr', get: m => m.member_type, render: m => <ListText>{m.member_type}</ListText> },
              ...(showModel ? [{ key: 'model', label: 'Model', width: '120px', get: m => m.advisor_model, render: m => <ListText style={m.advisor_model === 'New Model' ? { color: 'var(--vfo-accent-text)', fontWeight: 600 } : undefined}>{m.advisor_model}</ListText> }] : []),
              { key: 'flags', label: '', width: '1fr', render: m => (
                <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
                  {m.paused && <ListPill color="#e06717">Paused</ListPill>}
                  {m.suspended && <ListPill color="#e74c3c">Suspended</ListPill>}
                  {m.membership_arrears && <ListPill color="#b45309">In Arrears</ListPill>}
                </span>
              ) },
            ]}
          />
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
          <ProfileHero
            eyebrow={listTitle}
            name={<PersonName first={selectedMember.first_name} last={selectedMember.last_name} preferred={selectedMember.preferred_name} fallback={selectedMember.name} />}
            avatar={<HeroAvatar src={selectedMember.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(selectedMember.headshot_image) : null} name={selectedMember.name} size={72} />}
            facts={[
              { label: 'Member number', value: <span style={{ fontFamily: 'monospace' }}>{selectedMember.plugin_member_number}</span> },
              { label: 'Type', value: selectedMember.member_type ? <>{selectedMember.member_type}{heroLeadNumber && <> - <MemberNameLink memberNumber={heroLeadNumber}>{heroLeadName || heroLeadNumber}</MemberNameLink></>}</> : null },
              { label: 'Status', value: selectedMember.elite_status ? <DotText color={statusColor(selectedMember.elite_status)}>{selectedMember.elite_status}</DotText> : null },
              { label: 'Engagement', value: engagementMeta(selectedMember.engagement_level) ? <DotText color={engagementMeta(selectedMember.engagement_level).color}>{engagementMeta(selectedMember.engagement_level).label}</DotText> : null },
            ]}
            alerts={(selectedMember.paused || selectedMember.suspended || selectedMember.membership_arrears) ? <>
              {selectedMember.paused && <DotText color="#e06717">Paused</DotText>}
              {selectedMember.suspended && <DotText color="#e74c3c">Suspended</DotText>}
              {selectedMember.membership_arrears && <DotText color="#b45309">In Arrears</DotText>}
            </> : null}
          />
          <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px', flexWrap: 'wrap', position: 'relative', zIndex: 50 }}>
          {/* The order (Jake, 2026-11-26) matches the member's own bar: Profile, Vault,
              Programs (was MSM), Showroom (with Specialists and Website Plugin under
              it), Growth Plan, CIQ, Growth Credit Marketplace. */}
          {(() => {
            const go = k => { setMemberFeatureTab(k); sessionStorage.setItem(featureTabKey, k) }
            const pill = active => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })
            const labelOf = Object.fromEntries(extraTabs)
            const showroomOpts = ['showroom', 'specialists', 'website'].filter(k => labelOf[k]).map(key => ({ key, label: labelOf[key] }))
            return (
              <>
                <FeatureTabDropdown label="Profile" isActive={['profile_details','profile_edit','profile_history','profile_payments','settings'].includes(memberFeatureTab)} options={[{key:'profile_details',label:'Profile'},{key:'profile_edit',label:'Edit Profile'},{key:'profile_history',label:'Type History'},{key:'profile_payments',label:'Payments'},{key:'settings',label:'Settings'}]} onSelect={setMemberFeatureTab} onLabelClick={() => setMemberFeatureTab('profile_details')} />
                <button style={pill(memberFeatureTab === 'vault')} onClick={() => go('vault')}>Vault</button>
                <FeatureTabDropdown label="Programs" isActive={msmOptions.map(o => o.key).includes(memberFeatureTab)} options={msmOptions} onSelect={go} onLabelClick={() => go('msm_meetings')} />
                {showroomOpts.length > 1
                  ? <FeatureTabDropdown label="Showroom" isActive={showroomOpts.some(o => o.key === memberFeatureTab)} options={showroomOpts} onSelect={go} onLabelClick={() => go('showroom')} />
                  : showroomOpts.map(o => <button key={o.key} style={pill(memberFeatureTab === o.key)} onClick={() => go(o.key)}>{o.label}</button>)}
                {growthPlan && <button style={pill(memberFeatureTab.startsWith('gp_'))} onClick={() => go('gp_hub')}>Growth Plan</button>}
                {['ciq', 'gc'].filter(k => labelOf[k]).map(k => <button key={k} style={pill(memberFeatureTab === k)} onClick={() => go(k)}>{labelOf[k]}</button>)}
              </>
            )
          })()}
          </div>
          {['profile_details','profile_edit','profile_history'].includes(memberFeatureTab) && <MemberProfile member={selectedMember} allMembers={allMembers} onDataChange={onDataChange} activeSection={memberFeatureTab} hiddenFields={hiddenFields} typeOptionsOverride={showModel ? null : typeOptions} onOpenMember={onOpenMember} memberConnections={memberConnections} />}
          {memberFeatureTab === 'profile_payments' && <MemberPaymentsTab member={selectedMember} />}
          {['msm_meetings','msm_program_holistic','msm_program_partnership','msm_program_tailored','msm_program_tax','msm_program_coaching','msm_program_standard'].includes(memberFeatureTab) && <MSMTracking member={selectedMember} activeSection={memberFeatureTab} onDataChange={onDataChange} bypassEnableGate={msmBypassEnableGate} allowedProgramKeys={msmAllowedPrograms} />}          {memberFeatureTab === 'specialists' && <MemberSpecialists member={selectedMember} allExperts={allExperts} allExclusionMap={allExclusionMap} ecoMap={ecoMap} onDataChange={onDataChange} />}
          {memberFeatureTab === 'showroom' && <MemberShowroom experts={allExperts} exclusions={allExclusionMap[selectedMember.plugin_member_number] || []} ecoMap={ecoMap} showMemberServices showRevenueShare showVault showAccredited />}
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

  const connectedField = isCorporate && (
    <>
      <label style={formLabel}>Connected Member *</label>
      <input type="search" name="search" autoComplete="off" value={connectedSearch} onChange={e => { setConnectedSearch(e.target.value); setConnectedMember(null) }} placeholder="Search by name or number..." style={formInput} />
      {connectedSearch && !connectedMember && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', zIndex: 10, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {allMembers.filter(m => m.name?.toLowerCase().includes(connectedSearch.toLowerCase()) || m.plugin_member_number?.toLowerCase().includes(connectedSearch.toLowerCase())).map(m => (
            <div key={m.plugin_member_number} onClick={() => { setConnectedMember(m); setConnectedSearch(m.name + ' (' + m.plugin_member_number + ')') }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--vfo-border-soft)', color: 'var(--vfo-ink)', fontSize: '14px' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {m.name} <span style={{ color: 'var(--vfo-muted)' }}>({m.plugin_member_number})</span>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <AddMemberCards
      heading={<PageHeading eyebrow="Advisors" title="Add Advisor" />}
      v={{ firstName, lastName, memberType, email, eliteStatus, revenueDecision, advisorModel, customMemberNumber }}
      set={{ firstName: setFirstName, lastName: setLastName, memberType: setMemberType, email: setEmail, eliteStatus: setEliteStatus, revenueDecision: setRevenueDecision, advisorModel: setAdvisorModel, customMemberNumber: setCustomMemberNumber }}
      typeOptions={MEMBER_TYPES} connectedField={connectedField} numberPlaceholder="e.g. 59452"
      loading={loading} onCreate={submit} createLabel="Create Advisor" status={status} statusType={statusType}
    />
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
      <PageHeading eyebrow="Strategic Members" title="Add Strategic Member" />
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
    <AddMemberCards
      v={{ firstName, lastName, memberType, email, eliteStatus, revenueDecision, customMemberNumber }}
      set={{ firstName: setFirstName, lastName: setLastName, memberType: setMemberType, email: setEmail, eliteStatus: setEliteStatus, revenueDecision: setRevenueDecision, customMemberNumber: setCustomMemberNumber }}
      notice={groupNames.length === 0 && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(0,149,255,0.07)', border: '1px solid rgba(0,149,255,0.22)', color: 'var(--vfo-ink)', fontSize: '13px' }}>
          No Strategic Member Groups yet. Add one under the <strong>Add Strategic Member Group</strong> tab — each group becomes a Member Type option here.
        </div>
      )}
      typeOptions={groupNames} typePlaceholder="-- Select group --" typeDisabled={groupNames.length === 0}
      showModel={false} numberPlaceholder="e.g. 20000"
      loading={loading} onCreate={submit} createLabel="Create Strategic Member" status={status} statusType={statusType}
    />
  )
}

function AddStrategicGroupForm({ onGroupsChange }) {
  const [groupName, setGroupName] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)


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
    <ProfileCard icon="users" title="New Strategic Member Group" sub="Each group becomes a Member Type option when adding a strategic member.">
      <div style={{ maxWidth: '420px', marginBottom: '14px' }}>
        <label style={formLabel}>Strategic Group Name *</label>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Action Coach" style={formInput} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={submit} disabled={loading} style={{ ...btnState(btnPrimary, loading), cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'Creating…' : 'Create Group'}</button>
        {status && <span style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 500 }}>{status}</span>}
      </div>
    </ProfileCard>
  )
}

// The admin's "Switch on Direct for this member" tick box on the Tax Planning
// card (2026-10-28, any admin). Ticking needs 2/2 qualifying clients (the server
// refuses it otherwise); unticking is always allowed and stops only NEW Direct
// cases. Writes through member_tax_direct_set, which logs who clicked.
function DirectApprovalControl({ standing, memberNumber, memberName, onChange }) {
  const [busy, setBusy] = useState(false)
  const on = !!standing?.approved
  const locked = !on && !standing?.ready
  async function toggle() {
    if (busy || locked) return
    const next = !on
    const question = next
      ? `Switch on Direct to Tax Planning for ${memberName}?

They will be able to choose "I run this case (Direct)" when they add a tax client.`
      : `Switch off Direct to Tax Planning for ${memberName}?

They will no longer be able to start new Direct cases. Direct cases already running carry on.`
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      const res = await callApi('member_tax_direct_set', { member_number: memberNumber, approved: next })
      if (res?.standing) onChange(res.standing)
    } catch (err) {
      window.alert(err?.message || 'Something went wrong')
    } finally { setBusy(false) }
  }
  return (
    <input type="checkbox" checked={on} disabled={locked || busy} onChange={toggle}
      title={locked ? 'Available once they reach 2/2' : on ? 'Untick to switch Direct off' : 'Switch on Direct for this member'}
      aria-label="Switch on Direct for this member"
      style={{ width: '16px', height: '16px', margin: '2px 0 0', flexShrink: 0, cursor: locked || busy ? 'not-allowed' : 'pointer' }} />
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
  const [brandingKey, setBrandingKey] = useState(0)

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

  useEffect(() => { loadProfile() }, [member.plugin_member_number])

  // Branding is saved from the Edit Profile tab straight through
  // member_branding_save, bypassing this form's state. On returning to Details,
  // re-read ONLY the branding columns so they are current without touching any
  // unsaved edit held in `profile`.
  useEffect(() => {
    if (activeTab !== 'details' || !profile) return
    let alive = true
    callApi('member_profile_load', { member_number: member.plugin_member_number })
      .then(d => {
        const p = d?.profile
        if (alive && p) setProfile(cur => cur ? { ...cur, logo_image: p.logo_image, logo_enabled: p.logo_enabled, contract_name_mode: p.contract_name_mode } : cur)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [activeTab])

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
      setBrandingKey(k => k + 1)
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

  const inputStyle = formInput
  const labelStyle = formLabel
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
  const statusColors = STATUS_COLORS

  if (loading) return activeTab === 'edit' ? <MemberEditFormSkeleton /> : activeTab === 'history' ? <ProgramNotesSkeleton rows={3} add={false} /> : <MemberProfileDetailsSkeleton />
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
        const nameLink = (base) => onOpenMember ? { ...base, color: 'var(--vfo-link)', cursor: 'pointer' } : base
        const linkHandlers = onOpenMember ? {
          onMouseEnter: e => e.currentTarget.style.textDecoration = 'underline',
          onMouseLeave: e => e.currentTarget.style.textDecoration = 'none',
        } : {}
        // Chips reuse styles already in this file: the blue introducer pill and
        // the neutral count chip.
        const introChip = { fontSize: '11px', padding: '2px 9px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }
        return (
          <div>
            {/* The read-only body is SHARED with the member's own Profile tab
                (shared/MemberProfileDetails) so the two always mirror; only the
                Stripe controls and clickable names are admin extras. */}
            <MemberProfileDetails
              profile={profile}
              memberNumber={member.plugin_member_number}
              directEligibility={directEligibility}
              directControl={directEligibility ? (
                <DirectApprovalControl
                  standing={directEligibility}
                  memberNumber={member.plugin_member_number}
                  memberName={member.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || member.plugin_member_number}
                  onChange={setDirectEligibility}
                />
              ) : null}
              hideRevenueDecision={hiddenFields.includes('revenue_decision')}
              onOpenMember={onOpenMember}
              people={{
                introducedBy: introducedByObj && !CORPORATE_TYPES.includes(member.member_type) ? { ...introducedByObj, number: introducedByObj.plugin_member_number, chip: profile.connection_type || null } : null,
                introducerOf: introducedByMe.map(m => ({ ...m, number: m.plugin_member_number, chip: m.connection_type || null })),
                connections: connectedToMe.map(m => ({ ...m, number: m.plugin_member_number })),
                corporate: corporateMembers.map(m => ({ ...m, number: m.plugin_member_number })),
                lead: leadRow ? { ...leadRow, number: leadRow.plugin_member_number } : null,
              }}
              adminView
              payoutSlot={profile.stripe_account_id ? (
                    <StripeAccountField label={linkedFrom ? 'Borrowed Stripe Account' : 'Stripe Account'}
                      acctId={profile.stripe_account_id} loading={connectLoading} connectStatus={connectStatus}
                      onRefresh={() => setConnectRefresh(n => n + 1)}
                      note={linkedFrom ? <>Payouts go to <strong>{linkedLeadName} ({linkedFrom})</strong>'s Stripe account. This member has no Stripe Connect account of their own.</> : null}
                      labelSuffix={linkedFrom ? ` — ${linkedLeadName}'s account` : ''}
                      msg={stripeMsg} msgType={stripeMsgType}>
                      {linkedFrom && (
                        <button type="button" onClick={() => unlinkStripeFromLead(linkedLeadName)} disabled={stripeLinking}
                          style={{ ...btnState({ ...btnSecondary, ...BTN_SMALL }, stripeLinking), cursor: stripeLinking ? 'wait' : 'pointer' }}>
                          {stripeLinking ? 'Working…' : 'Unlink'}
                        </button>
                      )}
                    </StripeAccountField>
                  ) : (
                    <Field label="Stripe Connect">
                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={sendStripeRequest} disabled={stripeRequesting}
                          style={{ ...btnState(btnOutline, stripeRequesting), cursor: stripeRequesting ? 'wait' : 'pointer' }}>
                          {stripeRequesting ? 'Working…' : 'Send Stripe Connect setup email'}
                        </button>
                        {canLinkToLead && (
                          <button type="button" onClick={linkStripeToLead} disabled={stripeLinking || leadLacksAccount}
                            title={leadLacksAccount ? `${leadRowName} has no Stripe Connect account yet` : undefined}
                            style={{ ...btnState(btnOutline, stripeLinking || leadLacksAccount), cursor: leadLacksAccount ? 'not-allowed' : stripeLinking ? 'wait' : 'pointer' }}>
                            {stripeLinking ? 'Working…' : "Link to Lead Member's Stripe Connect"}
                          </button>
                        )}
                      </div>
                      {stripeMsg && <p style={{ fontSize: '12px', fontWeight: 500, margin: '8px 0 0', color: stripeMsgType === 'success' ? 'var(--vfo-success-text)' : '#d93025' }}>{stripeMsg}</p>}
                    </Field>
                  )
              }
            />


            <MemberAdditionalContacts memberNumber={member.plugin_member_number} contacts={contacts} onReload={reloadContacts}
              styles={{ sectionStyle, cardTitle, inputStyle, labelStyle }} />

            {profile.notes && (
              <ProfileCard icon="note" title="Notes">
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.75, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.notes}</div>
              </ProfileCard>
            )}

            {/* Program notes live on the MSM Home now (2026-11-26); the profile keeps the general Notes. */}
          </div>
        )
      })()}

      {activeTab === 'edit' && (() => {
        const editInitials = `${profile.first_name || ''} ${profile.last_name || ''}`.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
        const currentPhoto = photoPreview || (profile.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(profile.headshot_image) : null)
        return (
        <>
          <ProfileCard icon="camera" title={'Photo, Bio & Website'}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div onClick={() => { if (currentPhoto) setCropState({ src: currentPhoto }) }}
                  style={{ width: '104px', height: '104px', borderRadius: '50%', overflow: 'hidden', background: currentPhoto ? 'var(--vfo-tint)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: '3px solid var(--vfo-card)', boxShadow: '0 6px 18px rgba(18,94,204,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPhoto ? 'pointer' : 'default', margin: '0 auto' }}>
                  {currentPhoto
                    ? <img src={currentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#fff', fontSize: '30px', fontWeight: 700 }}>{editInitials || '?'}</span>}
                </div>
                <label style={{ ...btnPrimary, display: 'inline-block', marginTop: '12px' }}>
                  {currentPhoto ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: 'none' }} />
                </label>
                {currentPhoto && <button type="button" onClick={() => setCropState({ src: currentPhoto })} style={{ ...btnSecondary, display: 'block', margin: '8px auto 0' }}>Adjust / Zoom</button>}
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
          </ProfileCard>
          <ProfileCard icon="id" title="Basic Info">
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name</label><input value={profile.first_name || ''} onChange={e => update('first_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name</label><input value={profile.last_name || ''} onChange={e => update('last_name', e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Preferred Name (optional)</label><input value={profile.preferred_name || ''} onChange={e => update('preferred_name', e.target.value)} maxLength={60} style={inputStyle} /></div>
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
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Renewal Date</label><input type="text" readOnly value={profile.membership_renewal_date ? String(profile.membership_renewal_date).split('T')[0] : '—'} title="Set by the membership fee plan under Accounting" style={formReadOnly} /></div>
            </div>
          </ProfileCard>
          <ProfileCard icon="settings" title="Settings">
            <div style={{ display: 'grid', gap: '10px' }}>
              <SettingRow title="Suspended" hint="Stops all active processing and holds revenue share payouts — they release automatically when unsuspended">
                <Switch on={!!profile.suspended} color="#e74c3c" label="Suspended" onClick={() => update('suspended', !profile.suspended)} />
              </SettingRow>
              {profile.membership_arrears && (
                <div style={{ fontSize: '12px', color: '#b45309', padding: '0 4px', lineHeight: 1.45, fontWeight: 600 }}>
                  In arrears on membership fees — revenue shares are held; clears automatically when the arrears are paid.
                </div>
              )}
              <SettingRow title="Paused" hint="Temporarily pauses activity and holds revenue share payouts — they release automatically when unpaused">
                <Switch on={!!profile.paused} color="#e06717" label="Paused" onClick={() => update('paused', !profile.paused)} />
              </SettingRow>
            </div>
          </ProfileCard>
          <ProfileCard icon="dollar" tone="green" title="Revenue">
            {!hiddenFields.includes('revenue_decision') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Revenue Decision</label>
                <ChoiceButtons options={[['Revenue Share', 'Revenue Share'], ['Money Mapping', 'Money Mapping']]} value={profile.revenue_decision} onChange={v => update('revenue_decision', v)} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Eligible for Credit Note</label>
              <ChoiceButtons options={[[true, 'On'], [false, 'Off']]} value={profile.credit_note_eligible !== false} onChange={v => update('credit_note_eligible', v)} />
            </div>
          </ProfileCard>
          {/* Branding saves on its own (member_branding_save), not through the
              Save Changes button below — member_profile_save ignores it. */}
          <MemberBrandingCard memberNumber={member.plugin_member_number} mode="admin" reloadKey={brandingKey} />
          {/* Introduction slot — who introduced this member. The tier
              (connection_type) is what THAT introducer earns, so it lives here.
              Shown for every member category, accountants included. */}
          <ProfileCard icon="link" title="Introductions">
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
              <button onClick={() => { update('introduced_by_member_number', null); update('connection_type', ''); setIntroducedSearch('') }} style={{ ...btnDanger, marginTop: '12px' }}>Remove Introduction</button>
            )}
          </ProfileCard>
          {/* Connections are mutual pairs with no tier and no limit. Every row here
              writes immediately — the Save button below does NOT cover this card. */}
          <ProfileCard icon="users" title="Connections" sub={`${connectionPartners.length} ${connectionPartners.length === 1 ? 'connection' : 'connections'}. Each change here saves at once.`}>
            {connectionPartners.length === 0
              ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0 }}>No connections yet.</p>
              : <div style={{ display: 'grid', gap: '8px' }}>{connectionPartners.map(cp => (
                <div key={cp.plugin_member_number} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 13px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-input)' }}>
                  <Initials name={cp.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{cp.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{cp.plugin_member_number}</span>{cp.member_type ? <> · {cp.member_type}</> : null}</div>
                  </div>
                  <button onClick={() => writeConnection('member_connection_remove', cp.plugin_member_number)} disabled={connSaving} style={{ ...btnState({ ...btnDanger, ...BTN_SMALL }, connSaving), marginLeft: 'auto', flexShrink: 0 }}>Remove</button>
                </div>
              ))}</div>
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
          </ProfileCard>
          <ProfileCard icon="award" tone="gold" title="VFO Certification">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Certified Date</label><input type="date" value={profile.vfo_certified_date || ''} onChange={e => update('vfo_certified_date', e.target.value || null)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '200px' }}><label style={labelStyle}>VFO Accredited Date</label><input type="date" value={profile.vfo_accredited_date || ''} onChange={e => update('vfo_accredited_date', e.target.value || null)} style={inputStyle} /></div>
            </div>
          </ProfileCard>
          <ProfileCard icon="note" title="Notes">
            <textarea value={profile.notes || ''} onChange={e => update('notes', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </ProfileCard>
          <SaveBar dirty={dirty} saving={saving} onSave={save} status={status} statusType={statusType} />
        </>
        )
      })()}

      {activeTab === 'history' && (
        <ProfileCard icon="history" title="Member Type History">
          {typeHistory.length === 0
            ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No type changes recorded yet.</p>
            : typeHistory.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                <div style={{ textAlign: 'left' }}><span style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>{h.old_type}</span><span style={{ color: 'var(--vfo-muted)', margin: '0 8px' }}>→</span><span style={{ color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: '600' }}>{h.new_type}</span></div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{new Date(h.changed_at).toLocaleDateString()}</div>
              </div>
            ))
          }
        </ProfileCard>
      )}

      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}
    </div>
  )
}

function ComingSoon({ title }) {
  return <div style={{ textAlign: 'center', padding: '60px 20px' }}><p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '12px' }}>{title}</p><p style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>Coming soon.</p></div>
}

function MemberSpecialists({ member, allExperts, allExclusionMap, ecoMap = {}, onDataChange }) {
  // The shared Specialists tab (2026-11-26); the admin saves through save_member.
  return (
    <SpecialistPicker allExperts={allExperts} excluded={allExclusionMap[member.plugin_member_number] || []} ecoMap={ecoMap}
      intro="Which specialists appear in this member's VFO Showroom and Website Plugin."
      onSave={async list => { await callApi('save_member', { member_number: member.plugin_member_number, exclusions: list }); await onDataChange() }} />
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
  const [deductAmount, setDeductAmount] = useState('')
  const [deductReason, setDeductReason] = useState('')
  const [deductStatus, setDeductStatus] = useState(null) // { ok, text }
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [banner, setBanner] = useState('')

  // Re-opened tab: draw the last balance/history at once, refresh behind it.
  useLayoutEffect(() => {
    const snap = getLastSeen(`membergc:${member.plugin_member_number}`)
    if (snap) applyGC(snap.bal, snap.trans, snap.red)
    loadGC()
  }, [member.plugin_member_number])

  function applyGC(bal, trans, red) {
    setBalance(bal.balance || 0)
    setTransactions(trans.transactions || [])
    setRedemptions(red.redemptions || [])
  }

  async function loadGC() {
    try {
      const [bal, trans, red] = await Promise.all([
        callApi('gc_load_balance', { member_number: member.plugin_member_number }),
        callApi('gc_load_transactions', { member_number: member.plugin_member_number }),
        callApi('gc_load_redemptions', { member_number: member.plugin_member_number }),
      ])
      applyGC(bal, trans, red)
      setLastSeen(`membergc:${member.plugin_member_number}`, { bal, trans, red })
    } catch (err) { console.error(err) }
  }

  function showBanner(msg) { setBanner(msg); setTimeout(() => setBanner(''), 5000) }

  async function addCredits() {
    if (!addAmount) return
    const a = Number(addAmount)
    if (!(a > 0) || Math.abs(a * 4 - Math.round(a * 4)) > 1e-9) { setStatusType('error'); setStatus('Use whole credits or quarters (.25, .5, .75).'); return }
    try {
      await callApi('gc_add_credits', { member_number: member.plugin_member_number, amount: a, description: addDesc })
      setAddAmount(''); setAddDesc('')
      setStatusType('success'); setStatus('Credits added!')
      setTimeout(() => setStatus(''), 4000)
      loadGC()
    } catch (err) { setStatusType('error'); setStatus(err.message) }
  }

  // Deduct credits (gc_deduct_credits, 2026-10-13): whole credits only, a reason is
  // required (it is the history entry the member sees), never below zero.
  async function deductCredits() {
    const n = Number(deductAmount)
    // Quarter steps (numeric(10,2) since 2026-10-13): 0.25, 1.5, 43.75 ...
    if (!(n > 0) || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) { setDeductStatus({ ok: false, text: 'Use whole credits or quarters (.25, .5, .75).' }); return }
    if (!deductReason.trim()) { setDeductStatus({ ok: false, text: 'Enter a reason - it is shown in the credit history.' }); return }
    if (balance !== null && n > balance) { setDeductStatus({ ok: false, text: `Only ${balance} credits available.` }); return }
    if (!window.confirm(`Deduct ${n} credit${n === 1 ? '' : 's'} from ${member.name || 'this member'}?\n\nBalance: ${balance} -> ${balance - n}\nReason: ${deductReason.trim()}`)) return
    try {
      const res = await callApi('gc_deduct_credits', { member_number: member.plugin_member_number, amount: n, description: deductReason.trim() })
      setDeductAmount(''); setDeductReason('')
      setDeductStatus({ ok: true, text: `Deducted ${n} credit${n === 1 ? '' : 's'} - balance now ${res.balance}.` })
      setTimeout(() => setDeductStatus(null), 5000)
      loadGC()
    } catch (err) { setDeductStatus({ ok: false, text: err.message }) }
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
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Amount</label><input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="e.g. 100" min="0.25" step="0.25" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Description (optional)</label><input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="e.g. Monthly allocation" style={inputStyle} /></div>
              <button onClick={addCredits} style={{ padding: '12px 24px', minWidth: '150px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Credits</button>
            </div>
            {status && <p style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Deduct Credits</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Amount</label><input type="number" value={deductAmount} onChange={e => setDeductAmount(e.target.value)} placeholder="e.g. 43.75" min="0.25" step="0.25" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Reason (shown in history)</label><input value={deductReason} onChange={e => setDeductReason(e.target.value)} placeholder="e.g. Prorated - downgrade to Catalyst" maxLength={300} style={inputStyle} /></div>
              <button onClick={deductCredits} style={{ padding: '12px 24px', minWidth: '150px', borderRadius: '8px', background: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 100%)', border: 'none', boxShadow: '0 2px 8px rgba(217,48,37,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Deduct Credits</button>
            </div>
            {deductStatus && <p style={{ color: deductStatus.ok ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{deductStatus.text}</p>}
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
  const [portalAccess, setPortalAccess] = useState(true)
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
      setPortalAccess(data.portal_access !== false)
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
      <ProfileCard icon="lock" title="Member Login">
        {loginLoading
          ? <SkeletonText lines={2} />
          : !portalAccess ? (
            <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0 }}>
              <strong style={{ color: 'var(--vfo-ink)' }}>No portal access.</strong> This member type does not include the member portal, so this member cannot sign in
              {existingLogin ? <> (their login, <strong>{existingLogin.email}</strong>, is kept but refused)</> : null}.
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: '0 0 16px' }}>
                {existingLogin
                  ? <>This member can sign in as <strong>{existingLogin.email}</strong>. Send a setup email to let them set a new passcode.</>
                  : <>No login yet. Send a setup email so this member can create their own passcode.</>}
              </p>
              <SendSetupEmailButton loginType="member" subjectId={member.plugin_member_number} hint="Drafts a Gmail with a secure link. The member sets their own passcode." />
            </>
          )}
        {loginStatus && <p style={{ color: loginStatusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{loginStatus}</p>}
      </ProfileCard>
      <ProfileCard icon="dollar" tone="green" title="Stripe Connect">
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
              <span style={{ display: 'inline-block', marginTop: '12px', fontSize: '13px', color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '8px 12px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '10px' }}>{connectStatus.stripe_account_id}</span>
            )}
          </div>
        ) : (connectStatus && connectStatus.status !== 'none') ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '8px 12px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '10px' }}>{connectStatus.stripe_account_id}</span>
            <button onClick={sendStripeRequest} disabled={stripeRequesting} style={btnState(btnSecondary, stripeRequesting)}>
              {stripeRequesting ? 'Sending...' : 'Resend setup email'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: '0 0 16px' }}>No payment account yet. Send the member a secure Stripe setup link.</p>
            <button onClick={sendStripeRequest} disabled={stripeRequesting} style={btnState(btnPrimary, stripeRequesting)}>
              {stripeRequesting ? 'Sending...' : 'Set Up Payment Details'}
            </button>
          </div>
        )}
        {stripeMsg && <p style={{ fontSize: '12.5px', marginTop: '12px', color: stripeMsgType === 'success' ? 'var(--vfo-success-text)' : '#d93025' }}>{stripeMsg}</p>}
      </ProfileCard>
      <ProfileCard icon="alert" tone="red" title="Danger Zone" style={{ border: '1px solid rgba(231,76,60,0.3)' }}>
        {!deleteConfirm
          ? <button onClick={() => setDeleteConfirm(true)} style={btnDanger}>Delete Member</button>
          : <div>
              <p style={{ color: '#e74c3c', fontWeight: 500, fontSize: '14px', margin: '0 0 12px' }}>Are you sure? This will remove all settings and exclusions. This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={deleteMember} style={btnPrimary}>Yes, Delete</button>
                <button onClick={() => setDeleteConfirm(false)} style={btnSecondary}>Cancel</button>
              </div>
              {deleteStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '12px' }}>{deleteStatus}</p>}
            </div>
        }
      </ProfileCard>
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
      await callApi('member_contact_add', { member_number: memberNumber, first_name: formatPersonName(addFirst), last_name: formatPersonName(addLast), email: cleanText(addEmail), phone: cleanText(addPhone) })
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
    const ok = await saveContact(id, { first_name: formatPersonName(editFirst), last_name: formatPersonName(editLast), email: next, phone: cleanText(editPhone) })
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
    <ProfileCard icon="contacts" title="Additional Contacts"
      sub={<>People on this member's team. With <strong>Cc on all emails</strong> switched on, a contact is Cc'd on every portal email this member receives or is Cc'd on.</>}
      action={<button type="button" onClick={() => { setShowAdd(!showAdd); setAddError('') }} style={{ ...btnPrimary, ...BTN_SMALL }}>+ Add</button>}>

      {showAdd && (
        <div style={{ padding: '16px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={addFirst} onChange={e => setAddFirst(e.target.value)} onBlur={() => setAddFirst(formatPersonName(addFirst))} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={addLast} onChange={e => setAddLast(e.target.value)} onBlur={() => setAddLast(formatPersonName(addLast))} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={labelStyle}>Email *</label>
              <input value={addEmail} onChange={e => setAddEmail(e.target.value)} type="email" style={inputStyle} />
              {!!addEmail.trim() && !addEmailValid && <div style={{ ...labelStyle, marginTop: '6px', marginBottom: 0 }}>Enter a valid email address.</div>}
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><PhoneInput value={addPhone} onChange={setAddPhone} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" onClick={addContact} disabled={!canAdd} style={{ ...primaryBtn, padding: '8px 20px', fontSize: '13px', background: canAdd ? primaryBtn.background : 'var(--vfo-tint)', border: canAdd ? 'none' : '1px solid var(--vfo-border-mid)', boxShadow: canAdd ? primaryBtn.boxShadow : 'none', color: canAdd ? '#fff' : 'var(--vfo-muted)', cursor: canAdd ? 'pointer' : 'not-allowed' }}>Save</button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ ...ghostBtn, padding: '8px 20px', fontSize: '13px' }}>Cancel</button>
            {addError && <span style={{ color: '#e74c3c', fontSize: '12px', fontWeight: 500 }}>{addError}</span>}
          </div>
        </div>
      )}

      {addedFlash && <div style={{ color: 'var(--vfo-success-text)', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Contact added</div>}
      {contacts.length === 0 && !showAdd && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0 }}>No additional contacts yet.</p>}
      {contacts.map(c => (
        <div key={c.id} style={{ padding: '11px 14px', marginBottom: '8px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-input)' }}>
          {editId === c.id ? (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={editFirst} onChange={e => setEditFirst(e.target.value)} onBlur={() => setEditFirst(formatPersonName(editFirst))} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={editLast} onChange={e => setEditLast(e.target.value)} onBlur={() => setEditLast(formatPersonName(editLast))} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><PhoneInput value={editPhone} onChange={setEditPhone} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => saveEdit(c.id)} disabled={busyId === c.id} style={{ ...primaryBtn, cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>{busyId === c.id ? 'Saving...' : 'Save'}</button>
                <button type="button" onClick={() => { setEditId(null); setError(c.id, '') }} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '160px', display: 'flex', alignItems: 'center', gap: '11px' }}>
                <Initials name={`${c.first_name || ''} ${c.last_name || ''}`} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{c.first_name} {c.last_name}</div>
                  {c.email
                    ? <div title={c.email} style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                    : <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '2px', fontStyle: 'italic' }}>No email on file{c.phone ? ` · ${c.phone}` : ''}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--vfo-muted)', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={!!c.cc_on_emails} disabled={busyId === c.id}
                    onChange={() => toggleCc(c)} style={{ accentColor: '#125ecc', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }} />
                  Cc on all emails
                </label>
                {busyId === c.id && <span style={{ color: 'var(--vfo-muted)', fontSize: '12px' }}>Saving...</span>}
                {busyId !== c.id && rowSaved[c.id] && <span style={{ color: 'var(--vfo-success-text)', fontWeight: 600, fontSize: '12px' }}>Saved</span>}
                <button type="button" onClick={() => startEdit(c)} style={{ ...btnSecondary, ...BTN_SMALL }}>Edit</button>
                <button type="button" onClick={() => removeContact(c)} style={{ ...btnDanger, ...BTN_SMALL }}>Remove</button>
              </div>
            </div>
          )}
          {rowError[c.id] && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{rowError[c.id]}</div>}
        </div>
      ))}
    </ProfileCard>
  )
}
