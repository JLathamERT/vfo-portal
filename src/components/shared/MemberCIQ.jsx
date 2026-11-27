import { useState, useEffect, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { CiqListSkeleton, CIQ_LIST_GRID, CIQ_ROWS_GRID, SkeletonText } from './Skeleton'
import { HubGrid, HubCard, HubBanner, HubMenuBar } from './HubKit'
import { formatDate } from '../../lib/dates'
import AddClientForm from './AddClientForm'
import { useIsPhone } from '../../lib/useMediaQuery'
import EmailText from './EmailText'
import { TrackHero } from './TrackKit'
import { BackLink, DotText, ProfileCard, ProfileCardHead, SettingRow, Switch, formInput, formLabel, profileCardStyle, subLabel } from './ProfileKit'
import { btnPrimary, btnSecondary, btnOutline, btnDanger, btnState, BTN_SMALL } from './buttonStyles'
import ListTable, { ListName, ListText } from './ListTable'

// The house look (2026-11-27 refresh): a sub-tab is a round pill (the Accounting
// pills), a page's big buttons are the primary / secondary buttons at the size of
// ProfileKit's SaveBar.
const pillTab = (on) => ({ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (on ? 'transparent' : 'var(--vfo-border-strong)'), background: on ? 'linear-gradient(90deg, #002973 0%, #125ecc 100%)' : 'var(--vfo-card)', color: on ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
const BTN_LARGE = { padding: '10px 26px', fontSize: '14px' }
const BTN_LARGE_PHONE = { padding: '9px 14px', fontSize: '13px' }

const PhoneChevron = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>

// `client` (2026-10-20): the client page's CIQ tab passes its client
// ({ id, first_name, last_name, client_ref, email }) and the list is locked to
// that one client — no client list, no chooser, + Start New CIQ starts one for
// them, and a client with no CIQs still shows their card. Without it this is the
// member-wide CIQ tab, unchanged.
// `readOnly` (2026-10-22, Client Mirroring): a member the client is MIRRORED to sees
// that client's CIQs exactly as the owner does - every view, nothing editable. The
// list comes from ciq_load_client_list (ciq_load_list is the caller's own CIQs);
// the server refuses every CIQ write to them regardless.
export default function MemberCIQ({ memberNumber, memberName, ciqEnabled = true, ciqVfosManaged = true, isAdmin = false, client: lockedClient = null, readOnly = false }) {
  const [ciqs, setCiqs] = useState([])
  const isPhone = useIsPhone()
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState(null)
  const [addStatus, setAddStatus] = useState('')
  const [startingCiq, setStartingCiq] = useState(false)
  const [allClients, setAllClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [activeCiq, setActiveCiq] = useState(null)
  // The list is two levels (2026-10-16, Jake): every client with a CIQ, then one
  // client's CIQs. null = the client list.
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [contactsMap, setContactsMap] = useState({})
  const [expandedBiz, setExpandedBiz] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [ciqView, setCiqView] = useState(null)
  const [priorities, setPriorities] = useState({})
  const [snapshots, setSnapshots] = useState([])
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const [oppSubTab, setOppSubTab] = useState('latest')
  const [showCiqSettings, setShowCiqSettings] = useState(false)
  const [localCiqEnabled, setLocalCiqEnabled] = useState(ciqEnabled)
  const [localCiqVfosManaged, setLocalCiqVfosManaged] = useState(ciqVfosManaged)
  const [ciqSettingsStatus, setCiqSettingsStatus] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  // Portal licensing L4 (decision 37): while ciq_licence is on for this member the
  // toggle is the MSM's "member drives CIQ" switch - same column, new wording.
  const [ciqLicenceOn, setCiqLicenceOn] = useState(false)
  // Read-only frame: disables the inputs and blocks the click-to-pick options;
  // section tabs, Previous / Next and Back sit outside it and stay live.
  const viewOnlyFrame = { border: 0, padding: 0, margin: 0, minWidth: 0, pointerEvents: readOnly ? 'none' : undefined }

  useLayoutEffect(() => {
    // Re-opened tab: use the last settings at once, refresh behind them.
    const snap = getLastSeen(`ciqsettings:${memberNumber}`)
    if (snap) {
      setLocalCiqEnabled(snap.ciq_enabled)
      setLocalCiqVfosManaged(snap.ciq_vfos_managed)
      setCiqLicenceOn(!!snap.ciq_licence)
      setSettingsLoaded(true)
    }
    async function loadCiqSettings() {
      if (readOnly) { setSettingsLoaded(true); return }
      try {
        const data = await callApi('ciq_load_settings', { member_number: memberNumber })
        setLocalCiqEnabled(data.ciq_enabled)
        setLocalCiqVfosManaged(data.ciq_vfos_managed)
        setCiqLicenceOn(!!data.ciq_licence)
        setLastSeen(`ciqsettings:${memberNumber}`, data)
      } catch (err) { console.error(err) }
      finally { setSettingsLoaded(true) }
    }
    loadCiqSettings()
  }, [memberNumber])

  async function saveCiqSetting(enabled, vfosManaged) {
    try {
      await callApi('member_profile_save', { profile: { member_number: memberNumber, ciq_enabled: enabled, ciq_vfos_managed: vfosManaged } })
      setLocalCiqEnabled(enabled)
      setLocalCiqVfosManaged(vfosManaged)
      setCiqSettingsStatus('Saved!'); setTimeout(() => setCiqSettingsStatus(''), 3000)
    } catch (err) { setCiqSettingsStatus(err.message) }
  }

  // Re-opened tab: draw the last CIQ list at once, refresh behind it. The admin
  // deep link below only ever acts on the fresh list.
  useLayoutEffect(() => {
    const snap = readOnly ? null : getLastSeen(`ciqlist:${memberNumber}`)
    if (snap) {
      setCiqs(snap.data.ciqs || [])
      setContactsMap(snap.contactData.contacts || {})
      setLoading(false)
    }
    loadCiqs(!!snap)
  }, [memberNumber])

  async function loadCiqs(quiet = false) {
    if (quiet !== true) setLoading(true)
    try {
      if (readOnly && lockedClient) {
        const data = await callApi('ciq_load_client_list', { client_id: lockedClient.id })
        setCiqs(data.ciqs || [])
        return
      }
      const [data, contactData] = await Promise.all([
        callApi('ciq_load_list', { member_number: memberNumber }),
        callApi('load_member_contacts', { member_number: memberNumber }),
      ])
      const list = data.ciqs || []
      setCiqs(list)
      setContactsMap(contactData.contacts || {})
      setLastSeen(`ciqlist:${memberNumber}`, { data, contactData })
      // A client page's tab never consumes the deep-link keys below - they belong
      // to the member-wide tab.
      if (lockedClient) return
      // Deep-link from a client profile / MAP 1 step (admin) or a Client Overview
      // CIQ pill row (admin + member): open that client's newest CIQ straight away.
      // Consume the key even when nothing matches so a later visit to this tab
      // doesn't re-hijack the list. Only the session's own list is searched.
      const wantedClientId = sessionStorage.getItem('ciqInitialClientId')
      if (wantedClientId) {
        sessionStorage.removeItem('ciqInitialClientId')
        const match = list.find(c => String(c.client_id) === String(wantedClientId))
        if (match) { setSelectedClientId(match.client_id); await openCiq(match) }
      }
      // Client Overview's CIQ pill: land on THAT client's list of CIQs.
      const wantedListClientId = sessionStorage.getItem('ciqInitialListClientId')
      if (wantedListClientId) {
        sessionStorage.removeItem('ciqInitialListClientId')
        const match = list.find(c => String(c.client_id) === String(wantedListClientId))
        if (match) setSelectedClientId(match.client_id)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function loadExistingClients() {
    setLoadingClients(true)
    try {
      const data = await callApi('msm_load_member_clients', { member_number: memberNumber })
      setAllClients(data.clients || [])
    } catch (err) { console.error(err) }
    finally { setLoadingClients(false) }
  }

  function selectAddMode(mode) {
    setAddMode(mode)
    setAddStatus('')
    if (mode === 'existing') loadExistingClients()
  }

  async function createForExisting(clientId) {
    try {
      const data = await callApi('ciq_create', { client_id: clientId, member_number: memberNumber })
      setShowAdd(false); setAddMode(null); setAddStatus('')
      loadCiqs()
      openCiq(data.ciq)
    } catch (err) { setAddStatus(err.message) }
  }

  // The shared AddClientForm validates, tidies and shows a duplicate clash; a
  // throw here goes back to it.
  async function createNew(fields) {
    const data = await callApi('ciq_add_client_and_create', { member_number: memberNumber, ...fields })
    setShowAdd(false); setAddMode(null); setAddStatus('')
    loadCiqs()
    openCiq(data.ciq)
  }

  async function openCiq(ciq) {
    try {
      const [data, prioData, snapData] = await Promise.all([
        callApi('ciq_load', { ciq_id: ciq.id }),
        callApi('ciq_load_priorities', { ciq_id: ciq.id }),
        callApi('ciq_load_priority_snapshots', { ciq_id: ciq.id }),
      ])
      setActiveCiq(data.ciq)
      setAnswers(data.answers || {})
      setPriorities(prioData.priorities || {})
      setSnapshots(snapData.snapshots || [])
      setSelectedSnapshot(null)
      setOppSubTab('latest')
      if (data.ciq.status === 'completed') { setCiqView('chooser'); setShowReport(false) }
      else { setCiqView('diagnostic'); setShowReport(false) }
    } catch (err) { console.error(err) }
  }

  async function saveAnswers() {
    if (!activeCiq) return
    setSaving(true)
    try {
      await callApi('ciq_save', { ciq_id: activeCiq.id, answers })
      setSaving(false)
      setActiveCiq(null)
      setAnswers({})
      setActiveSection('intro')
      loadCiqs()
    } catch (err) { console.error(err); setSaving(false) }
  }

  async function completeCiq() {
    if (!activeCiq) return
    setSaving(true)
    try {
      await callApi('ciq_save', { ciq_id: activeCiq.id, answers })
      await callApi('ciq_complete', { ciq_id: activeCiq.id })
      setShowConfirm(false)
      setCiqView('report')
      setShowReport(true)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const inputStyle = formInput
  const sectionStyle = { ...profileCardStyle, padding: isPhone ? 'var(--vfo-card-pad)' : '24px', marginBottom: isPhone ? '14px' : '16px' }
  const statusColors = { draft: '#e06717', completed: '#1b9254' }
  // A CIQ's status, as words beside a dot: every row has one, so it is not a tag
  // (TEAM_RULES section 9, tags are rare).
  const statusDot = (ciq) => <DotText color={statusColors[ciq.status]} style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span>{ciq.status === 'draft' ? 'Draft' : 'Completed'}</span></DotText>
  // A section card's title row: ProfileCard's header, pulled to the card's edges
  // over its padding, so a padded section reads as the house box.
  const cardPad = isPhone ? 'var(--vfo-card-pad)' : '24px'
  const cardHead = (title, icon, sub, action) => (
    <ProfileCardHead icon={icon} title={title} sub={sub} action={action}
      style={{ margin: `calc(-1 * ${cardPad}) calc(-1 * ${cardPad}) ${isPhone ? '14px' : '20px'}` }} />
  )
  // One clickable CIQ / snapshot / client row: a soft tile (ProfileKit's Field look).
  const ciqRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '11px 14px', marginBottom: '6px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', cursor: 'pointer' }
  const bigBtn = (style, disabled) => btnState({ ...style, ...(isPhone ? BTN_LARGE_PHONE : BTN_LARGE) }, disabled)
  // A box's sub-group header (Personal / Business, a business's name): the
  // house small uppercase label on the input tint.
  const subHead = (title, first) => (
    <div style={{ background: 'var(--vfo-input)', padding: isPhone ? '8px 12px' : '8px 22px', borderTop: first ? 'none' : '1px solid var(--vfo-border-soft)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div style={subLabel}>{title}</div>
    </div>
  )
  // Phone: a rating-grid row (tax interest, risk concern, legal interest) as the
  // area's name over its options as small pills - the four radio columns cut the
  // last options off (tax: 4 x 100px in an overflow-hidden box) or squeezed the
  // name into ~80px. "Concern" is dropped from the risk pills to keep them short.
  const phoneRatingRow = (area, levels, key) => (
    <div key={area} style={{ padding: '10px 12px', borderTop: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '6px' }}>{area}</div>
      <div role="radiogroup" aria-label={area} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {levels.map(level => {
          const on = answers[key] === level
          return (
            <button key={level} type="button" role="radio" aria-checked={on} onClick={() => setAnswers(a => ({ ...a, [key]: level }))}
              style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '12px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: `1px solid ${on ? '#125ecc' : 'var(--vfo-border-strong)'}`, background: on ? 'var(--vfo-accent-tint)' : 'transparent', color: on ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>
              {level.replace(/ Concern$/, '')}
            </button>
          )
        })}
      </div>
    </div>
  )

  const filteredClients = clientSearch
    ? allClients.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase()) || c.client_ref?.toLowerCase().includes(clientSearch.toLowerCase()))
    : allClients

  // ─── Active CIQ form view ─────────────────────────────
  const CIQ_SECTIONS = [
    { key: 'intro', label: 'Introduction', noNumber: true },
    { key: 'personal_info', label: 'Personal Information' },
    { key: 'business_info', label: 'Business Information' },
    { key: 'business_advisory', label: 'Business Advisory' },
    { key: 'tax_planning', label: 'Tax Planning' },
    { key: 'risk_mitigation', label: 'Risk Mitigation' },
    { key: 'wealth_management', label: 'Wealth Management' },
    { key: 'legal_services', label: 'Legal Services' },
    { key: 'finalize', label: 'Finalize', noNumber: true },
  ]

  const [activeSection, setActiveSection] = useState('intro')
  const [showConfirm, setShowConfirm] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])

  function validateCiq() {
    const errors = []
    const biz = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
    const hasBiz = answers.has_business === 'Yes'

    // Personal Info
    const clientInfoMissing = []
    if (!answers.marital_status) clientInfoMissing.push('Marital Status')
    if (!answers.income) clientInfoMissing.push('Income')
    if (!answers.federal_tax) clientInfoMissing.push('Federal Income Taxes Paid')
    if (clientInfoMissing.length > 0) errors.push({ section: 'Personal Information', fields: clientInfoMissing })

    // Business Information
    if (!answers.has_business) {
      errors.push({ section: 'Business Information', fields: ['Do you have a business?'] })
    } else if (hasBiz) {
      if (biz.length === 0) errors.push({ section: 'Business Advisory', fields: ['Add at least one business'] })
      biz.forEach((b, i) => {
        const label = b.name || `Business ${i + 1}`
        const missing = []
        if (!b.name) missing.push('Business Name')
        if (!b.type) missing.push('Business Type')
        if (!b.ownership) missing.push('Ownership %')
        if (!b.revenue) missing.push('Business Revenue')
        if (!b.taxes) missing.push('Business Taxes Paid')
        if (!answers[`biz_focus_${i}`]) missing.push('Key Business Focus')
        if (missing.length > 0) errors.push({ section: `Business Information — ${label}`, fields: missing })
      })
    }

    // Tax Planning
    const taxMissing = []
    if (!answers.tax_primary_focus) taxMissing.push('Primary Focus')
    if (!answers.tax_focus_type) taxMissing.push('Primary Tax Focus Type')
    if (!answers.tax_professional_rating) taxMissing.push('Professional Rating')
    const taxAreas = ['income_tax_planning', 'capital_gains_tax', 'retirement___estate', 'charitable___gift', 'business_tax_planning']
    taxAreas.forEach(a => { if (!answers[`tax_interest_${a}`]) taxMissing.push('Tax Interest Grid') })
    if (taxMissing.length > 0) errors.push({ section: 'Tax Planning', fields: [...new Set(taxMissing)] })

    // Risk Mitigation
    const riskMissing = []
    const personalRiskKeys = ['long-term_sickness__insufficient_income_', 'live_too_long__insufficient_income_', 'die_too_soon__impact_dependents_', 'asset_protection__personally_sued_']
    const businessRiskKeys = ['loss_of_key_person', 'asset_protection__business_sued_', 'technology_advancements']
    personalRiskKeys.forEach(k => { if (!answers[`risk_personal_${k}`]) riskMissing.push('Personal Risks Grid') })
    businessRiskKeys.forEach(k => { if (!answers[`risk_business_${k}`]) riskMissing.push('Business Risks Grid') })
    if (riskMissing.length > 0) errors.push({ section: 'Risk Mitigation', fields: [...new Set(riskMissing)] })

    // Wealth Management
    const wealthMissing = []
    if (!answers.wealth_term_focus) wealthMissing.push('Short/Long Term Focus')
    if (!answers.wealth_term_interest) wealthMissing.push('Short/Long Term Interest')
    if (!answers.wealth_grow_retain) wealthMissing.push('Grow or Retain')
    if (!answers.wealth_grow_retain_interest) wealthMissing.push('Grow/Retain Interest')
    if (!answers.wealth_life_phase) wealthMissing.push('Phase of Life')
    if (!answers.wealth_life_phase_interest) wealthMissing.push('Life Phase Interest')
    if (!answers.wealth_alt_interest) wealthMissing.push('Alternative Investments Interest')
    if (wealthMissing.length > 0) errors.push({ section: 'Wealth Management', fields: wealthMissing })

    // Legal Services
    const legalMissing = []
    if (!answers.legal_personal_trusts_and_wills__estate_planning_) legalMissing.push('Personal Legal Services Grid')
    const bizLegalKeys = ['contract___corporate_law', 'structuring_entities', 'buy___sell_agreements', 'joint_venture_agreements', 'intellectual_property']
    bizLegalKeys.forEach(k => { if (!answers[`legal_business_${k}`]) legalMissing.push('Business Legal Services Grid') })
    if (legalMissing.length > 0) errors.push({ section: 'Legal Services', fields: [...new Set(legalMissing)] })

    return errors
  }

  function handleFinalize() {
    const errors = validateCiq()
    setValidationErrors(errors)
    if (errors.length === 0) setShowConfirm(true)
  }

  function goNext() {
    const idx = CIQ_SECTIONS.findIndex(s => s.key === activeSection)
    if (idx < CIQ_SECTIONS.length - 1) setActiveSection(CIQ_SECTIONS[idx + 1].key)
  }

  function goPrev() {
    const idx = CIQ_SECTIONS.findIndex(s => s.key === activeSection)
    if (idx > 0) setActiveSection(CIQ_SECTIONS[idx - 1].key)
  }

  const sectionIdx = CIQ_SECTIONS.findIndex(s => s.key === activeSection)
  const isFirst = sectionIdx === 0
  const isLast = sectionIdx === CIQ_SECTIONS.length - 1

  if (activeCiq) {
    const client = activeCiq.clients
    const reportBiz = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()

    // ─── CHOOSER VIEW (completed CIQs) ──────────────────
    if (ciqView === 'chooser') {
      return (
        <div>
          <BackLink onClick={() => { setActiveCiq(null); setAnswers({}); setActiveSection('intro'); setCiqView(null); loadCiqs() }}>Back to list</BackLink>
          <TrackHero eyebrow="CIQ" title={`${client?.first_name || ''} ${client?.last_name || ''}`} meta={<>{client?.client_ref} · {client?.email}</>} />

          <HubBanner complete title="CIQ Diagnostic completed" meta={activeCiq.completed_at ? formatDate(activeCiq.completed_at) : ''} />

          <HubGrid>
            <HubCard title="Diagnostic" sub={readOnly ? 'View the questionnaire answers' : 'View or edit the questionnaire answers'} accent="#002973" onClick={() => setCiqView('diagnostic')} />
            <HubCard title="Report" sub="View the completed CIQ summary" accent="#125ecc" onClick={() => { setCiqView('report'); setShowReport(true) }} />
            <HubCard title="Prioritize" sub="Prioritize identified opportunities" accent="#e06717" onClick={() => setCiqView('prioritize')} />
            {activeCiq.priorities_completed_at
              ? <HubCard title="One Page Plan" sub="View your planning summary" accent="#1b9254" onClick={() => setCiqView('onePagePlan')} />
              : <HubCard title="One Page Plan" sub="Complete Prioritize first" accent="#1b9254" disabled />}
          </HubGrid>
        </div>
      )
    }

    // ─── PRIORITIZE VIEW ─────────────────────────────────
    if (ciqView === 'prioritize') {
      const pBiz = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
      const hasBiz = answers.has_business === 'Yes' && pBiz.length > 0

      // Build prioritizable items from diagnostic answers
      function buildItems() {
        const items = []

        // Business Advisory — per business
        if (hasBiz) {
          pBiz.forEach((biz, i) => {
            const bizName = biz.name || `Business ${i + 1}`
            if (answers[`biz_focus_${i}`]) items.push({ key: `biz_focus_${i}`, label: `${answers[`biz_focus_${i}`]}`, sublabel: `${answers[`biz_interest_${i}`] || ''}`, section: `Business Advisory — ${bizName}` })
            if (answers[`biz_other_focus_${i}`]) items.push({ key: `biz_other_focus_${i}`, label: `Any other business focus for ${bizName}?`, sublabel: answers[`biz_other_focus_${i}`], section: `Business Advisory — ${bizName}`, subsection: 'Other' })
          })
        }

        // Tax Planning
        const taxInterestItems = [
          { key: 'tax_interest_income_tax_planning', label: 'Income Tax' },
          { key: 'tax_interest_capital_gains_tax', label: 'Capital Gains Tax' },
          { key: 'tax_interest_retirement___estate', label: 'Retirement / Estate' },
          { key: 'tax_interest_charitable___gift', label: 'Charitable / Gift' },
          { key: 'tax_interest_business_tax_planning', label: 'Business Tax' },
        ]
        taxInterestItems.forEach(t => { if (answers[t.key]) items.push({ key: t.key, label: t.label, value: answers[t.key], section: 'Tax Planning' }) })
        if (answers.tax_other_focus) items.push({ key: 'tax_other_focus', label: 'Any other tax focus?', sublabel: answers.tax_other_focus, section: 'Tax Planning', subsection: 'Other' })

        // Risk Mitigation — Personal
        const personalRiskItems = [
          { key: 'risk_personal_long-term_sickness__insufficient_income_', label: 'Long Term Sickness (Insufficient Income)' },
          { key: 'risk_personal_live_too_long__insufficient_income_', label: 'Live too Long (Insufficient Income)' },
          { key: 'risk_personal_die_too_soon__impact_dependents_', label: 'Die too Soon (Impact Dependents)' },
          { key: 'risk_personal_asset_protection__personally_sued_', label: 'Asset Protection (Personally Sued)' },
        ]
        personalRiskItems.forEach(r => { if (answers[r.key]) items.push({ key: r.key, label: r.label, value: answers[r.key], section: 'Risk Mitigation', subsection: 'Personal' }) })

        // Risk Mitigation — Business
        const businessRiskItems = [
          { key: 'risk_business_loss_of_key_person', label: 'Loss of Key Person' },
          { key: 'risk_business_asset_protection__business_sued_', label: 'Asset Protection (Business Sued)' },
          { key: 'risk_business_technology_advancements', label: 'Technology Advancements' },
        ]
        businessRiskItems.forEach(r => { if (answers[r.key]) items.push({ key: r.key, label: r.label, value: answers[r.key], section: 'Risk Mitigation', subsection: 'Business' }) })
        if (answers.risk_other_focus) items.push({ key: 'risk_other_focus', label: 'Any other risk mitigation focus?', sublabel: answers.risk_other_focus, section: 'Risk Mitigation', subsection: 'Other' })

        // Wealth Management
        if (answers.wealth_term_focus) items.push({ key: 'wealth_term', label: 'Short / Long Term Planning', sublabel: `${answers.wealth_term_focus}, ${answers.wealth_term_interest || ''}`, section: 'Wealth Management' })
        if (answers.wealth_grow_retain) items.push({ key: 'wealth_grow_retain', label: 'Grow or Retain Wealth', sublabel: `${answers.wealth_grow_retain}, ${answers.wealth_grow_retain_interest || ''}`, section: 'Wealth Management' })
        if (answers.wealth_life_phase) items.push({ key: 'wealth_life_phase', label: 'Planning Related to Key Life Phase', sublabel: `${answers.wealth_life_phase}, ${answers.wealth_life_phase_interest || ''}`, section: 'Wealth Management' })
        if (answers.wealth_alt_investments) items.push({ key: 'wealth_alt', label: 'Alternative Investment', sublabel: `${answers.wealth_alt_investments}, ${answers.wealth_alt_interest || ''}`, section: 'Wealth Management' })
        if (answers.wealth_other_focus) items.push({ key: 'wealth_other_focus', label: 'Any other wealth management focus?', sublabel: answers.wealth_other_focus, section: 'Wealth Management', subsection: 'Other' })

        // Legal Services
        if (answers['legal_personal_trusts_and_wills__estate_planning_']) items.push({ key: 'legal_personal_trusts', label: 'Trusts and Wills (Estate Planning)', value: answers['legal_personal_trusts_and_wills__estate_planning_'], section: 'Legal Services', subsection: 'Personal' })

        const bizLegalItems = [
          { key: 'legal_business_contract___corporate_law', label: 'Contract / Corporate Law' },
          { key: 'legal_business_structuring_entities', label: 'Structuring Entities' },
          { key: 'legal_business_buy___sell_agreements', label: 'Buy / Sell Agreements' },
          { key: 'legal_business_joint_venture_agreements', label: 'Joint Venture Agreements' },
          { key: 'legal_business_intellectual_property', label: 'Intellectual Property' },
        ]
        bizLegalItems.forEach(l => { if (answers[l.key]) items.push({ key: l.key, label: l.label, value: answers[l.key], section: 'Legal Services', subsection: 'Business' }) })
        if (answers.legal_other_focus) items.push({ key: 'legal_other_focus', label: 'Any other legal services focus?', sublabel: answers.legal_other_focus, section: 'Legal Services', subsection: 'Other' })

        return items
      }

      const allItems = buildItems()

      // Group by section
      const sections = []
      const sectionMap = {}
      allItems.forEach(item => {
        if (!sectionMap[item.section]) { sectionMap[item.section] = []; sections.push(item.section) }
        sectionMap[item.section].push(item)
      })

      function getPriority(key) { return priorities[key]?.decision || 'drop' }
      function getNote(key) { return priorities[key]?.notes || '' }
      function setPriorityDecision(item, decision) {
        setPriorities(p => ({ ...p, [item.key]: { ...p[item.key], item_key: item.key, item_label: item.label, item_section: item.section, item_value: item.sublabel || item.value || '', decision, notes: p[item.key]?.notes || '' } }))
      }
      function setPriorityNote(item, notes) {
        setPriorities(p => ({ ...p, [item.key]: { ...p[item.key], item_key: item.key, item_label: item.label, item_section: item.section, item_value: item.sublabel || item.value || '', decision: p[item.key]?.decision || 'drop', notes } }))
      }

      async function savePriorities() {
        setSaving(true)
        try {
          const list = allItems.map(item => ({
            item_key: item.key,
            item_label: item.label,
            item_section: item.section,
            item_value: item.sublabel || item.value || '',
            decision: priorities[item.key]?.decision || 'drop',
            notes: priorities[item.key]?.notes || ''
          }))
          await callApi('ciq_save_priorities', { ciq_id: activeCiq.id, priorities: list })
          const session = JSON.parse(sessionStorage.getItem('vfo_session') || '{}')
          await callApi('ciq_save_priority_snapshot', { ciq_id: activeCiq.id, snapshot: list, saved_by: session.name || memberName || memberNumber })
          const freshMap = {}
          list.forEach(p => { freshMap[p.item_key] = p })
          setPriorities(freshMap)
          // Reload snapshots
          try { const snapData = await callApi('ciq_load_priority_snapshots', { ciq_id: activeCiq.id }); setSnapshots(snapData.snapshots || []) } catch {}
        } catch (err) { console.error(err) }
        finally { setSaving(false) }
      }

      const decisionColors = { drop: 'var(--vfo-muted)', park: '#e06717', prioritize: '#1b9254' }

      return (
        <div>
          <HubMenuBar label="CIQ Menu" onBack={() => setCiqView('chooser')} />
          <TrackHero eyebrow="CIQ" title={`Prioritize Opportunities — ${client?.first_name || ''} ${client?.last_name || ''}`} meta={client?.client_ref} />

          <fieldset disabled={readOnly} style={viewOnlyFrame}>
          {sections.map(sectionName => {
            const sectionItems = sectionMap[sectionName]
            let lastSubsection = null
            return (
            <ProfileCard key={sectionName} icon="layers" title={sectionName} flush
              action={!isPhone && <span style={subLabel}>Notes</span>}>
                {sectionItems.map((item, idx) => {
                  const showSubHeader = item.subsection && item.subsection !== lastSubsection
                  lastSubsection = item.subsection || lastSubsection
                  return (<>
                  {showSubHeader && subHead(item.subsection, idx === 0)}
                  {isPhone ? (
                    // Phone: name on top, its value on the left of the next line
                    // with Drop / Park / Prioritize as small pills on the right,
                    // then the notes full width - the three columns had squeezed
                    // the name into ~70px.
                    <div key={item.key} style={{ padding: '10px 12px', borderTop: idx > 0 && !showSubHeader ? '1px solid var(--vfo-border-soft)' : 'none' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{item.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{item.sublabel || item.value || ''}</span>
                        <span role="radiogroup" style={{ display: 'inline-flex', gap: '4px' }}>
                          {['drop', 'park', 'prioritize'].map(d => {
                            const on = getPriority(item.key) === d
                            return (
                              <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setPriorityDecision(item, d)}
                                style={{ padding: '4px 9px', borderRadius: '7px', fontSize: '12px', fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: `1px solid ${on ? decisionColors[d] : 'var(--vfo-border-strong)'}`, background: 'transparent', color: on ? decisionColors[d] : 'var(--vfo-muted)' }}>
                                {d.charAt(0).toUpperCase() + d.slice(1)}
                              </button>
                            )
                          })}
                        </span>
                      </div>
                      <textarea value={getNote(item.key)} onChange={e => setPriorityNote(item, e.target.value)} rows={1} placeholder="Add notes..." style={{ ...inputStyle, fontSize: '13px', resize: 'vertical', minHeight: '36px', marginTop: '8px' }} />
                    </div>
                  ) : (
                  <div key={item.key} style={{ display: 'flex', gap: '0', borderTop: idx > 0 && !showSubHeader ? '1px solid var(--vfo-border-soft)' : 'none' }}>
                    {/* Label + Value */}
                    <div style={{ flex: '1 1 180px', padding: '12px 14px 12px 22px', borderRight: '1px solid var(--vfo-border-soft)' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{item.label}</div>
                      {(item.sublabel || item.value) && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{item.sublabel || item.value}</div>}
                    </div>
                    {/* Decision radios */}
                    <div style={{ flex: '0 0 160px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', borderRight: '1px solid var(--vfo-border-soft)' }}>
                      {['drop', 'park', 'prioritize'].map(d => (
                        <label key={d} onClick={() => setPriorityDecision(item, d)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: getPriority(item.key) === d ? `4px solid ${decisionColors[d]}` : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                          <span style={{ fontSize: '12px', color: getPriority(item.key) === d ? decisionColors[d] : 'var(--vfo-muted)', fontWeight: getPriority(item.key) === d ? '600' : '400' }}>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                    {/* Notes */}
                    <div style={{ flex: '1 1 200px', padding: '8px' }}>
                      <textarea value={getNote(item.key)} onChange={e => setPriorityNote(item, e.target.value)} rows={2} placeholder="Add notes..." style={{ ...inputStyle, fontSize: '12px', resize: 'vertical', height: '100%', minHeight: '60px' }} />
                    </div>
                  </div>
                  )}
                  </>)
                })}
            </ProfileCard>
            )
          })}
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'center', gap: isPhone ? '8px' : '12px', marginTop: isPhone ? '16px' : '24px' }}>
            <button onClick={() => setCiqView('chooser')} style={bigBtn(btnSecondary)}>← Back</button>
            {!readOnly && <button onClick={async () => { await savePriorities(); try { await callApi('ciq_complete_priorities', { ciq_id: activeCiq.id }); setActiveCiq(prev => ({ ...prev, priorities_completed_at: new Date().toISOString() })) } catch(e) { console.error(e) }; setCiqView('onePagePlan') }} disabled={saving} style={bigBtn(btnPrimary, saving)}>{saving ? 'Saving...' : isPhone ? 'Save & Continue →' : 'Save & Continue to One Page Plan →'}</button>}
          </div>
        </div>
      )
    }

    // ─── ONE PAGE PLAN VIEW ──────────────────────────────
    if (ciqView === 'onePagePlan') {
      const planDate = activeCiq.priorities_completed_at?.split('T')[0] || new Date().toISOString().split('T')[0]
      const displayPriorities = selectedSnapshot ? (() => { try { const items = typeof selectedSnapshot.snapshot === 'string' ? JSON.parse(selectedSnapshot.snapshot) : selectedSnapshot.snapshot; const map = {}; items.forEach(p => { map[p.item_key] = p }); return map } catch { return priorities } })() : priorities
      const immediateItems = Object.values(displayPriorities).filter(p => p.decision === 'prioritize' && p.progress_status !== 'completed')
      const parkedItems = Object.values(displayPriorities).filter(p => p.decision === 'park')
      const completedItems = Object.values(displayPriorities).filter(p => p.decision === 'prioritize' && p.progress_status === 'completed')

      const isLatest = oppSubTab === 'latest' && !selectedSnapshot
      const progressMode = isLatest && !!activeCiq.accountability_mode && !readOnly

      async function toggleProgressMode() {
        const next = !activeCiq.accountability_mode
        setActiveCiq(prev => ({ ...prev, accountability_mode: next }))
        try { await callApi('ciq_set_accountability', { ciq_id: activeCiq.id, enabled: next }) }
        catch (err) { console.error(err); setActiveCiq(prev => ({ ...prev, accountability_mode: !next })) }
      }

      // Persist a single priority change (status/decision) through the existing
      // upsert handler; optimistic local update, revert on error.
      async function savePriorityChange(itemKey, changes) {
        const cur = priorities[itemKey]
        if (!cur) return
        const updated = { ...cur, ...changes }
        setPriorities(p => ({ ...p, [itemKey]: updated }))
        try {
          await callApi('ciq_save_priorities', { ciq_id: activeCiq.id, priorities: [{
            item_key: updated.item_key, item_label: updated.item_label, item_section: updated.item_section,
            item_value: updated.item_value || '', decision: updated.decision, notes: updated.notes || '',
            progress_status: updated.progress_status || null,
          }] })
        } catch (err) { console.error(err); setPriorities(p => ({ ...p, [itemKey]: cur })) }
      }

      const progressStatuses = [
        { key: null, label: 'Not Started', color: 'var(--vfo-muted)' },
        { key: 'in_progress', label: 'In Progress', color: '#e06717' },
        { key: 'completed', label: 'Completed', color: '#1b9254' },
      ]
      // Progress controls (Update Progress on): the status is a choice (the chosen
      // one primary, ProfileKit's ChoiceButtons look), the moves are row actions.
      const ctl = (style) => ({ ...style, ...BTN_SMALL })

      function renderPlanItems(items, kind) {
        if (items.length === 0) return <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>None</div>
        return items.map((item, i) => {
          const isOther = item.item_key?.includes('other_focus')
          const bizMatch = item.item_section?.match(/Business Advisory — (.+)/)
          const mainText = isOther ? (item.item_value || item.item_label) : item.item_label
          const displayLabel = bizMatch ? `${mainText} — ${bizMatch[1]}` : mainText
          const displaySection = bizMatch ? 'Business Advisory' : item.item_section
          const curStatus = item.progress_status || null
          return (
            <div key={item.item_key} style={{ paddingTop: i > 0 ? '11px' : 0, paddingBottom: i < items.length - 1 ? '11px' : 0, borderTop: i > 0 ? '1px solid var(--vfo-border-soft)' : 'none' }}>
              <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{displayLabel}{item.notes ? ` — ${item.notes}` : ''}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{displaySection}</div>
              {progressMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {kind !== 'parked' && progressStatuses.map(s => {
                    const active = curStatus === s.key
                    return (
                      <button key={s.label} onClick={() => savePriorityChange(item.item_key, { progress_status: s.key })}
                        style={ctl(active ? btnPrimary : btnSecondary)}>{s.label}</button>
                    )
                  })}
                  {kind === 'parked' && (
                    <button onClick={() => savePriorityChange(item.item_key, { decision: 'prioritize' })} style={ctl(btnOutline)}>Set as Priority</button>
                  )}
                  {kind !== 'parked' && (
                    <button onClick={() => savePriorityChange(item.item_key, { decision: 'park', progress_status: null })} style={{ ...ctl(btnSecondary), marginLeft: '6px' }}>Move to Parked</button>
                  )}
                  <button onClick={() => savePriorityChange(item.item_key, { decision: 'drop', progress_status: null })} style={ctl(btnDanger)}>Drop</button>
                </div>
              )}
            </div>
          )
        })
      }

      return (
        <div>
          <HubMenuBar label="CIQ Menu" onBack={() => { setCiqView('chooser'); setSelectedSnapshot(null); setOppSubTab('latest') }} />
          <TrackHero eyebrow="CIQ"
            title={<>One Page Plan for {client?.first_name} {client?.last_name} <span style={{ fontSize: '14px', fontWeight: '500', letterSpacing: 0, color: 'var(--vfo-muted)' }}>working with {memberName || memberNumber}</span></>}
            meta={localCiqVfosManaged ? <span style={{ color: '#0095ff', fontWeight: 600 }}>Powered by VFO Services</span> : null} />

          {/* Sub tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <button onClick={() => { setOppSubTab('latest'); setSelectedSnapshot(null) }} style={pillTab(oppSubTab === 'latest')}>Latest Version</button>
            <button onClick={() => setOppSubTab('history')} style={pillTab(oppSubTab === 'history')}>History</button>
          </div>

          {/* Latest Version */}
          {oppSubTab === 'latest' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Plan Completed on {formatDate(planDate)}</div>
                {!readOnly && <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>Update Progress</span>
                  <Switch on={!!activeCiq.accountability_mode} onClick={toggleProgressMode} label="Update Progress" />
                </label>}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: '1.8', marginBottom: '18px' }}>
                Having completed: Client Information Questionnaire to identify areas of interest, and Prioritization Process to determine immediate / later areas of focus.
              </div>

              <ProfileCard icon="flag" title="Immediate Priorities" sub="We will begin to address these priorities with immediate effect">{renderPlanItems(immediateItems, 'priority')}</ProfileCard>

              <ProfileCard icon="lock" title="Parked Priorities" sub="We will reconsider these parked priorities at our next Partners In Planning Meeting">{renderPlanItems(parkedItems, 'parked')}</ProfileCard>

              {completedItems.length > 0 && (
                <ProfileCard icon="award" tone="green" title="Completed" sub="Priorities that have been addressed and completed">{renderPlanItems(completedItems, 'priority')}</ProfileCard>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                <button onClick={() => { setCiqView('chooser'); setSelectedSnapshot(null) }} style={bigBtn(btnSecondary)}>← Back</button>
              </div>
            </div>
          )}

          {/* History */}
          {oppSubTab === 'history' && (
            <div>
              {selectedSnapshot ? (
                <div>
                  <BackLink onClick={() => setSelectedSnapshot(null)}>Back to list</BackLink>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>Snapshot from {formatDate(selectedSnapshot.saved_at)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Saved by {selectedSnapshot.saved_by}</div>
                  </div>

                  <ProfileCard icon="flag" title="Immediate Priorities" sub="We will begin to address these priorities with immediate effect">{renderPlanItems(immediateItems)}</ProfileCard>

                  <ProfileCard icon="lock" title="Parked Priorities" sub="We will reconsider these parked priorities at our next Partners In Planning Meeting">{renderPlanItems(parkedItems)}</ProfileCard>
                </div>
              ) : (
                <div>
                  {snapshots.length === 0
                    ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No history yet. Snapshots are saved each time priorities are updated.</div>
                    : snapshots.map(snap => (
                      <div key={snap.id} onClick={() => setSelectedSnapshot(snap)} style={ciqRowStyle}>
                        <div>
                          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{formatDate(snap.saved_at)} at {snap.saved_at?.split('T')[1]?.substring(0, 5)}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Saved by {snap.saved_by}</div>
                        </div>
                        {isPhone ? <PhoneChevron /> : <span style={{ color: 'var(--vfo-link)', fontWeight: 600, fontSize: '12px' }}>View →</span>}
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // ─── REPORT VIEW ─────────────────────────────────────
    if (showReport) {
      const reportRow = (label, value) => (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ flex: 1, padding: isPhone ? '10px 12px' : '10px 22px', fontSize: '13px', color: 'var(--vfo-muted)' }}>{label}</div>
          <div style={{ flex: 1, padding: isPhone ? '10px 12px' : '10px 22px', fontSize: '13px', color: 'var(--vfo-ink)' }}>{value || '—'}</div>
        </div>
      )

      // Each report table is a house box (icon + title) holding its label / value rows.
      const reportSubHeader = (title) => subHead(title, true)

      return (
        <div>
          <HubMenuBar label="CIQ Menu" onBack={() => { setShowReport(false); setCiqView('chooser') }} />
          <TrackHero eyebrow="CIQ" title={`CIQ Report — ${client?.first_name || ''} ${client?.last_name || ''}`} meta={<>{client?.client_ref} · Completed {formatDate(activeCiq.completed_at) || 'just now'}</>} />

          {/* Client Information */}
          <ProfileCard icon="user" title="Client Information" flush>
            {reportRow('Client Name', `${client?.first_name} ${client?.last_name}`)}
            {reportRow('Client Ref', client?.client_ref)}
            {reportRow('Email', client?.email)}
            {reportRow('Marital Status', answers.marital_status)}
            {reportRow('Children', answers.children || '0')}
            {reportRow('Income', answers.income)}
            {reportRow('Federal Income Taxes Paid', answers.federal_tax)}
          </ProfileCard>

          {/* Business Overview */}
          <ProfileCard icon="briefcase" title="Business Overview" flush>
            {reportRow('Has a Business', answers.has_business)}
            {answers.has_business === 'Yes' && reportBiz.map((biz, i) => (
              <div key={i}>
                {reportSubHeader(biz.name || `Business ${i + 1}`)}
                {reportRow('Business Name', biz.name)}
                {reportRow('Business Type', biz.type)}
                {reportRow('Ownership %', biz.ownership ? `${biz.ownership}%` : '')}
                {reportRow('Business Revenue', biz.revenue)}
                {reportRow('Business Taxes Paid', biz.taxes)}
              </div>
            ))}
          </ProfileCard>

          {/* Business Advisory */}
          {answers.has_business === 'Yes' && reportBiz.length > 0 && (
            <ProfileCard icon="briefcase" title="Business Advisory" flush>
              {reportBiz.map((biz, i) => (
                <div key={i}>
                  {reportSubHeader(biz.name || `Business ${i + 1}`)}
                  {reportRow('Key Business Focus', answers[`biz_focus_${i}`])}
                  {(answers[`biz_focus_${i}`] === 'Business Growth' || answers[`biz_focus_${i}`] === 'Business Exit') && reportRow('Level of Interest', answers[`biz_interest_${i}`])}
                  {reportRow('Other Business Focus', answers[`biz_other_focus_${i}`])}
                </div>
              ))}
            </ProfileCard>
          )}

          {/* Tax Planning */}
          <ProfileCard icon="calculator" title="Tax Planning" flush>
            {reportRow('Primary Focus', answers.tax_primary_focus)}
            {reportRow('Tax Focus Type', answers.tax_focus_type)}
            {reportRow('Other Professionals', answers.tax_other_professionals)}
            {reportRow('Professional Rating', answers.tax_professional_rating)}
            {reportSubHeader('Interest Levels')}
            {reportRow('Income Tax Planning', answers.tax_interest_income_tax_planning)}
            {reportRow('Capital Gains Tax', answers.tax_interest_capital_gains_tax)}
            {reportRow('Retirement / Estate', answers.tax_interest_retirement___estate)}
            {reportRow('Charitable / Gift', answers.tax_interest_charitable___gift)}
            {reportRow('Business Tax Planning', answers.tax_interest_business_tax_planning)}
            {answers.tax_which_business && reportRow('Which Business', answers.tax_which_business)}
            {reportSubHeader('Other')}
            {reportRow('Other Tax Focus', answers.tax_other_focus)}
          </ProfileCard>

          {/* Risk Mitigation */}
          <ProfileCard icon="shield" title="Risk Mitigation" flush>
            {reportSubHeader('Personal Risks')}
            {reportRow('Long-term Sickness', answers['risk_personal_long-term_sickness__insufficient_income_'])}
            {reportRow('Live too Long', answers['risk_personal_live_too_long__insufficient_income_'])}
            {reportRow('Die too Soon', answers['risk_personal_die_too_soon__impact_dependents_'])}
            {reportRow('Asset Protection (Personal)', answers['risk_personal_asset_protection__personally_sued_'])}
            {reportSubHeader('Business Risks')}
            {reportRow('Loss of Key Person', answers.risk_business_loss_of_key_person)}
            {reportRow('Asset Protection (Business)', answers['risk_business_asset_protection__business_sued_'])}
            {reportRow('Technology Advancements', answers.risk_business_technology_advancements)}
            {answers.risk_which_business && reportRow('Which Business', answers.risk_which_business)}
            {reportSubHeader('Other')}
            {reportRow('Other Risk Focus', answers.risk_other_focus)}
          </ProfileCard>

          {/* Wealth Management */}
          <ProfileCard icon="dollar" title="Wealth Management" flush>
            {reportRow('Short/Long Term Focus', answers.wealth_term_focus)}
            {reportRow('Short/Long Term Interest', answers.wealth_term_interest)}
            {reportRow('Grow or Retain Wealth', answers.wealth_grow_retain)}
            {reportRow('Grow/Retain Interest', answers.wealth_grow_retain_interest)}
            {reportRow('Phase of Life Focus', answers.wealth_life_phase)}
            {reportRow('Life Phase Interest', answers.wealth_life_phase_interest)}
            {reportRow('Alternative Investments', answers.wealth_alt_investments)}
            {reportRow('Alt Investment Interest', answers.wealth_alt_interest)}
            {reportSubHeader('Other')}
            {reportRow('Other Wealth Focus', answers.wealth_other_focus)}
          </ProfileCard>

          {/* Legal Services */}
          <ProfileCard icon="clipboard" title="Legal Services" flush>
            {reportSubHeader('Personal')}
            {reportRow('Trusts and Wills (Estate Planning)', answers['legal_personal_trusts_and_wills__estate_planning_'])}
            {reportSubHeader('Business')}
            {reportRow('Contract / Corporate Law', answers['legal_business_contract___corporate_law'])}
            {reportRow('Structuring Entities', answers.legal_business_structuring_entities)}
            {reportRow('Buy / Sell Agreements', answers['legal_business_buy___sell_agreements'])}
            {reportRow('Joint Venture Agreements', answers.legal_business_joint_venture_agreements)}
            {reportRow('Intellectual Property', answers.legal_business_intellectual_property)}
            {answers.legal_which_business && reportRow('Which Business', answers.legal_which_business)}
            {reportSubHeader('Other')}
            {reportRow('Other Legal Focus', answers.legal_other_focus)}
          </ProfileCard>

          {/* Bottom actions */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: isPhone ? '8px' : '12px', marginTop: isPhone ? '16px' : '24px' }}>
            <button onClick={() => { setShowReport(false); setCiqView('chooser') }} style={bigBtn(btnSecondary)}>← Back</button>
            <button onClick={() => { setCiqView('prioritize'); setShowReport(false) }} style={bigBtn(btnPrimary)}>{isPhone ? 'Continue to Prioritize →' : 'Continue to Prioritize Opportunities →'}</button>
          </div>
        </div>
      )
    }

    // ─── DIAGNOSTIC VIEW ─────────────────────────────────
    return (
      <div>
        {activeCiq.status !== 'completed' && (
          <BackLink onClick={() => { setActiveCiq(null); setAnswers({}); setActiveSection('intro'); setCiqView(null) }}>Back to list</BackLink>
        )}
        {activeCiq.status === 'completed' && (
          <HubMenuBar label="CIQ Menu" onBack={() => { setCiqView('chooser'); setActiveSection('intro') }} />
        )}
        <TrackHero eyebrow="CIQ" title={`${client?.first_name || ''} ${client?.last_name || ''}`} meta={<>{client?.client_ref} · {client?.email}</>} />

        {/* Section nav. Phone: one dropdown - nine pills wrapped into five rows. */}
        {isPhone ? (
          <select aria-label="Section" value={activeSection} onChange={e => setActiveSection(e.target.value)}
            style={{ ...inputStyle, marginBottom: '14px', fontWeight: 600 }}>
            {CIQ_SECTIONS.map((sec, i) => (
              <option key={sec.key} value={sec.key}>{sec.noNumber ? sec.label : `${CIQ_SECTIONS.filter((s, j) => j < i && !s.noNumber).length + 1}. ${sec.label}`}</option>
            ))}
          </select>
        ) : (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {CIQ_SECTIONS.map((sec, i) => (
            <button key={sec.key} onClick={() => setActiveSection(sec.key)}
              style={{ ...pillTab(activeSection === sec.key), padding: '7px 14px', fontSize: '12.5px' }}>
              {sec.noNumber ? sec.label : `${CIQ_SECTIONS.filter((s, j) => j < i && !s.noNumber).length + 1}. ${sec.label}`}
            </button>
          ))}
        </div>
        )}

        {activeCiq.status === 'completed' && (
          <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(27,146,84,0.1)', border: '1px solid rgba(27,146,84,0.3)', color: 'var(--vfo-success-text)', fontWeight: 500, fontSize: '13px', marginBottom: '20px' }}>✓ This CIQ has been completed</div>
        )}

        <fieldset disabled={readOnly} style={viewOnlyFrame}>
        {/* Intro section */}
        {activeSection === 'intro' && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '16px', color: 'var(--vfo-ink)', lineHeight: '1.7', marginBottom: '20px' }}>
              We will walk through the following questions together to get a better understanding of your planning needs and concerns.
            </div>
            <div style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>
              The questions are organized within the 5 main areas of the Virtual Family Office:
            </div>
            <div style={{ marginLeft: '8px' }}>
              {['Business Advisory', 'Tax Planning', 'Risk Mitigation', 'Wealth Management', 'Legal Services'].map(area => (
                <div key={area} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0095ff', flexShrink: 0 }} />
                  <span style={{ fontSize: '15px', color: 'var(--vfo-ink)' }}>{area}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personal Information */}
        {activeSection === 'personal_info' && (
          <div style={sectionStyle}>
            {cardHead('Personal Information', 'user')}
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>Marital Status *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['Single', 'Married', 'Relationship with Partner'].map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers.marital_status === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers.marital_status === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, marital_status: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers.marital_status === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>Number of children</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setAnswers(a => ({ ...a, children: String(Math.max(0, parseInt(a.children || '0') - 1)) }))} style={{ ...btnSecondary, width: '36px', height: '36px', padding: 0, color: 'var(--vfo-ink)', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: '20px', color: 'var(--vfo-ink)', fontWeight: '600', minWidth: '24px', textAlign: 'center' }}>{answers.children || '0'}</span>
                <button onClick={() => setAnswers(a => ({ ...a, children: String(parseInt(a.children || '0') + 1) }))} style={{ ...btnSecondary, width: '36px', height: '36px', padding: 0, color: 'var(--vfo-ink)', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <input value={answers.children_details || ''} onChange={e => setAnswers(a => ({ ...a, children_details: e.target.value }))} placeholder="Additional details" style={{ ...inputStyle, marginTop: '10px' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>Income *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['<$100k', '$100k - $400k', '$400k - $1M', '>$1M'].map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers.income === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers.income === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, income: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers.income === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>Federal Income taxes paid *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['<$20k', '$20k - $100k', '$100k - $250k', '$250k - $500k', '>$500k'].map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers.federal_tax === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers.federal_tax === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, federal_tax: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers.federal_tax === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Business Information */}
        {activeSection === 'business_info' && (() => {
          const hasBiz = answers.has_business
          const businesses = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
          const setBiz = (newBiz) => setAnswers(a => ({ ...a, businesses: JSON.stringify(newBiz) }))
          const addBusiness = () => setBiz([...businesses, { name: '', type: '', ownership: '', revenue: '', taxes: '' }])
          const updateBiz = (idx, field, val) => { const b = [...businesses]; b[idx] = { ...b[idx], [field]: val }; setBiz(b) }
          const removeBiz = (idx) => { const b = [...businesses]; b.splice(idx, 1); setBiz(b); const adv = {}; Object.keys(answers).filter(k => k.startsWith('biz_focus_') || k.startsWith('biz_interest_')).forEach(k => { adv[k] = undefined }); setAnswers(a => ({ ...a, ...adv })) }
          

          const radioGroup = (label, answerKey, options) => (
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>{label}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers[answerKey] === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers[answerKey] === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, [answerKey]: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers[answerKey] === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )

          const bizRadio = (label, idx, field, options) => {
            const val = businesses[idx]?.[field] || ''
            return (
              <div style={{ marginBottom: '20px' }}>
                <label style={formLabel}>{label}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {options.map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: val === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: val === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                      onClick={() => updateBiz(idx, field, opt)}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: val === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                      <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div>
              {/* Do you have a business? */}
              <div style={sectionStyle}>
                {cardHead('Business Overview', 'briefcase')}
                <div style={{ marginBottom: '20px' }}>
                  <label style={formLabel}>Do you have a business? *</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['Yes', 'No'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: hasBiz === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: hasBiz === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                        onClick={() => setAnswers(a => ({ ...a, has_business: opt }))}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: hasBiz === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                        <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {hasBiz === 'No' && (
                  <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)', color: 'var(--vfo-muted)', fontSize: '13px' }}>
                    No business — this section is complete. Click Next to continue to Tax Planning.
                  </div>
                )}
              </div>

              {/* Business cards — only if Yes */}
              {hasBiz === 'Yes' && (
                <>
                  {businesses.length === 0 && (
                    <div style={{ ...sectionStyle, textAlign: 'center', padding: '40px' }}>
                      <div style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '12px' }}>No businesses added yet.</div>
                      <button onClick={addBusiness} style={btnPrimary}>+ Add Your First Business</button>
                    </div>
                  )}

                  {businesses.map((biz, idx) => (
                    <div key={idx} style={sectionStyle}>
                      {/* Header — click to expand/collapse: the house box header,
                          its hairline only while the business is open. */}
                      <div onClick={() => setExpandedBiz(expandedBiz === idx ? null : idx)} style={{ cursor: 'pointer', margin: `calc(-1 * ${cardPad})`, marginBottom: expandedBiz === idx ? (isPhone ? '14px' : '20px') : `calc(-1 * ${cardPad})` }}>
                        <ProfileCardHead icon="briefcase" rule={expandedBiz === idx}
                          title={biz.name || `Business ${idx + 1}`}
                          sub={biz.type ? `${biz.type}${biz.ownership ? ` · ${biz.ownership}% ownership` : ''}` : null}
                          action={<span style={{ color: 'var(--vfo-muted)', fontSize: '18px' }}>{expandedBiz === idx ? '▾' : '▸'}</span>} />
                      </div>

                      {/* Expanded content */}
                      {expandedBiz === idx && (
                        <div>
                          <div style={{ marginBottom: '20px' }}>
                            <label style={formLabel}>Business Name *</label>
                            <input value={biz.name} onChange={e => updateBiz(idx, 'name', e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ marginBottom: '20px' }}>
                            <label style={formLabel}>Business Type *</label>
                            <input value={biz.type} onChange={e => updateBiz(idx, 'type', e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ marginBottom: '20px' }}>
                            <label style={formLabel}>Ownership % *</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <input type="range" min="0" max="100" step="1" value={biz.ownership || 0} onChange={e => updateBiz(idx, 'ownership', e.target.value)}
                                style={{ flex: 1, accentColor: '#125ecc', cursor: 'pointer' }} />
                              <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--vfo-ink)', minWidth: '50px', textAlign: 'right' }}>{biz.ownership || 0}%</span>
                            </div>
                          </div>
                          {bizRadio('Business Revenue *', idx, 'revenue', ['<$500k', '$500k - $1M', '$1M - $2M', '$2M - $5M', '>$5M', 'N/A'])}
                          {bizRadio('Business Taxes Paid *', idx, 'taxes', ['<$50k', '$50k - $100k', '$100k - $250k', '$250k - $500k', '>$500k', 'N/A'])}

                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <button onClick={() => removeBiz(idx)} style={btnDanger}>Remove Business</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {businesses.length > 0 && (
                    <button onClick={addBusiness} style={{ ...btnOutline, marginBottom: '16px' }}>+ Add Another Business</button>
                  )}
                </>
              )}
            </div>
          )
        })()}

{/* Business Advisory */}
        {activeSection === 'business_advisory' && (() => {
          const businesses = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
          const hasBiz = answers.has_business === 'Yes' && businesses.length > 0

          const radioGroup = (label, answerKey, options) => (
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>{label}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers[answerKey] === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers[answerKey] === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, [answerKey]: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers[answerKey] === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )

          if (!hasBiz) {
            return (
              <div style={sectionStyle}>
                {cardHead('Business Advisory', 'briefcase')}
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)', color: 'var(--vfo-muted)', fontSize: '13px' }}>
                  No businesses added. Add businesses in Business Information to complete this section.
                </div>
              </div>
            )
          }

          return (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)' }}>Business Advisory</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Big Picture Priorities regarding Business Advisory</div>
              </div>
              {businesses.map((biz, idx) => (
                <div key={idx} style={sectionStyle}>
                  {cardHead(biz.name || `Business ${idx + 1}`, 'briefcase')}
                  {radioGroup(`What is your key business focus next year for ${biz.name || 'this business'}?`, `biz_focus_${idx}`, ['Business Growth', 'Business Exit', 'Neither of the Above'])}
                  {(answers[`biz_focus_${idx}`] === 'Business Growth' || answers[`biz_focus_${idx}`] === 'Business Exit') &&
                    radioGroup('Rate your level of interest', `biz_interest_${idx}`, ['Not Applicable', 'Not Interested', 'Somewhat Interested', 'Very Interested'])
                  }
                  <div style={{ marginBottom: '0' }}>
                    <label style={formLabel}>Any other business focus for {biz.name || `Business ${idx + 1}`}?</label>
                    <input value={answers[`biz_other_focus_${idx}`] || ''} onChange={e => setAnswers(a => ({ ...a, [`biz_other_focus_${idx}`]: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {activeSection === 'tax_planning' && (() => {
          const businesses = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
          const hasBiz = answers.has_business === 'Yes' && businesses.length > 0

          const radioGroup = (label, answerKey, options) => (
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>{label}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers[answerKey] === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers[answerKey] === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, [answerKey]: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers[answerKey] === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )

          const interestLevels = ['Not Applicable', 'Not Interested', 'Somewhat Interested', 'Very Interested']
          const taxAreas = ['Income Tax Planning', 'Capital Gains Tax', 'Retirement / Estate', 'Charitable / Gift', 'Business Tax Planning']

          return (
            <div>
              <div style={sectionStyle}>
                {cardHead('Tax Planning', 'calculator')}

                {radioGroup('Where is your primary focus? *', 'tax_primary_focus', ['Prior Tax Years', 'Future Tax Years'])}

                {radioGroup('Is your primary tax focus relating to *', 'tax_focus_type', ['One-time Taxable Transaction', 'Continuing Taxable Planning Required'])}

                <div style={{ marginBottom: '20px' }}>
                  <label style={formLabel}>Aside from anyone in this meeting, are there any other professionals that you would typically run financial decisions by (particularly when it comes to tax planning)?</label>
                  <input value={answers.tax_other_professionals || ''} onChange={e => setAnswers(a => ({ ...a, tax_other_professionals: e.target.value }))} style={inputStyle} />
                </div>

                {radioGroup('How would you rate the primary professional referenced above? *', 'tax_professional_rating', ['Great', 'Average', 'Poor', 'N/A'])}

                <div style={{ marginBottom: '20px' }}>
                  <label style={formLabel}>Please rate your level of interest in the following areas of tax planning *</label>
                  <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
                    {/* Header row */}
                    <div style={{ display: isPhone ? 'none' : 'grid', gridTemplateColumns: '1fr repeat(4, 100px)', background: 'var(--vfo-input)', padding: '10px 14px', gap: '4px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}></div>
                      {interestLevels.map(level => (
                        <div key={level} style={{ fontSize: '11px', color: 'var(--vfo-muted)', textAlign: 'center' }}>{level}</div>
                      ))}
                    </div>
                    {/* Rows */}
                    {taxAreas.map(area => {
                      const key = `tax_interest_${area.toLowerCase().replace(/[\s\/]/g, '_')}`
                      return (
                        isPhone ? phoneRatingRow(area, interestLevels, key) : <div key={area} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 100px)', padding: '10px 14px', borderTop: '1px solid var(--vfo-border-soft)', gap: '4px', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>{area}</div>
                          {interestLevels.map(level => (
                            <div key={level} style={{ display: 'flex', justifyContent: 'center' }}>
                              <div onClick={() => setAnswers(a => ({ ...a, [key]: level }))}
                                style={{ width: '18px', height: '18px', borderRadius: '50%', border: answers[key] === level ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box', cursor: 'pointer' }} />
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>

                  {/* Business Tax Planning — which business dropdown */}
                  {answers.tax_interest_business_tax_planning && answers.tax_interest_business_tax_planning !== 'Not Applicable' && answers.tax_interest_business_tax_planning !== 'Not Interested' && hasBiz && (
                    <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)' }}>
                      <label style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Which business? *</label>
                      <select value={answers.tax_which_business || ''} onChange={e => setAnswers(a => ({ ...a, tax_which_business: e.target.value }))}
                        style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                        <option value="">-- Select a business --</option>
                        {businesses.length > 1 && <option value="All">All</option>}
                        {businesses.map((b, i) => (
                          <option key={i} value={b.name || `Business ${i + 1}`}>{b.name || `Business ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '0' }}>
                  <label style={formLabel}>Any other tax focus?</label>
                  <textarea value={answers.tax_other_focus || ''} onChange={e => setAnswers(a => ({ ...a, tax_other_focus: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )
        })()}
        {activeSection === 'risk_mitigation' && (() => {
          const businesses = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
          const hasBiz = answers.has_business === 'Yes' && businesses.length > 0
          const concernLevels = ['No Concern', 'Little Concern', 'Average Concern', 'Large Concern']
          const personalRisks = ['Long-term Sickness (Insufficient Income)', 'Live too Long (Insufficient Income)', 'Die too Soon (Impact Dependents)', 'Asset Protection (Personally Sued)']
          const businessRisks = ['Loss of Key Person', 'Asset Protection (Business Sued)', 'Technology Advancements']

          const concernGrid = (title, areas, keyPrefix) => (
            <div style={{ marginBottom: '24px' }}>
              <label style={formLabel}>{title}</label>
              <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: isPhone ? 'none' : 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr)', background: 'var(--vfo-input)', padding: '10px 14px', gap: '4px' }}>
                  <div />
                  {concernLevels.map(level => (
                    <div key={level} style={{ fontSize: '11px', color: 'var(--vfo-muted)', textAlign: 'center' }}>{level}</div>
                  ))}
                </div>
                {areas.map(area => {
                  const key = `${keyPrefix}_${area.toLowerCase().replace(/[\s\/\(\)]/g, '_')}`
                  return (
                    isPhone ? phoneRatingRow(area, concernLevels, key) : <div key={area} style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr)', padding: '10px 14px', borderTop: '1px solid var(--vfo-border-soft)', gap: '4px', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>{area}</div>
                      {concernLevels.map(level => (
                        <div key={level} style={{ display: 'flex', justifyContent: 'center' }}>
                          <div onClick={() => setAnswers(a => ({ ...a, [key]: level }))}
                            style={{ width: '18px', height: '18px', borderRadius: '50%', border: answers[key] === level ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )

          return (
            <div>
              <div style={sectionStyle}>
                {cardHead('Risk Mitigation', 'shield', 'Big Picture Priorities regarding Risk Mitigation')}

                {concernGrid('Personal Risks — What are your principal concerns? *', personalRisks, 'risk_personal')}

                {concernGrid('Business Risks — What are your principal concerns? *', businessRisks, 'risk_business')}

                {/* Which business dropdown for business risks */}
                {hasBiz && (
                  <div style={{ marginBottom: '24px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)' }}>
                    <label style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Which business do the above business risks relate to? *</label>
                    <select value={answers.risk_which_business || ''} onChange={e => setAnswers(a => ({ ...a, risk_which_business: e.target.value }))}
                      style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                      <option value="">-- Select a business --</option>
                      {businesses.length > 1 && <option value="All">All</option>}
                      {businesses.map((b, i) => (
                        <option key={i} value={b.name || `Business ${i + 1}`}>{b.name || `Business ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom: '0' }}>
                  <label style={formLabel}>Any other risk mitigation focus?</label>
                  <textarea value={answers.risk_other_focus || ''} onChange={e => setAnswers(a => ({ ...a, risk_other_focus: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )
        })()}
        {activeSection === 'wealth_management' && (() => {
          const interestLevels = ['Not Applicable', 'Not Interested', 'Somewhat Interested', 'Very Interested']

          const radioGroup = (label, answerKey, options) => (
            <div style={{ marginBottom: '20px' }}>
              <label style={formLabel}>{label}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: answers[answerKey] === opt ? '1px solid #125ecc' : '1px solid var(--vfo-border-strong)', background: answers[answerKey] === opt ? 'var(--vfo-accent-tint)' : 'var(--vfo-input)', cursor: 'pointer' }}
                    onClick={() => setAnswers(a => ({ ...a, [answerKey]: opt }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: answers[answerKey] === opt ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )

          return (
            <div>
              <div style={sectionStyle}>
                {cardHead('Wealth Management', 'dollar', 'Big Picture Priorities regarding Wealth Management')}

                {radioGroup('Is your primary focus short term or long term Wealth Management (or both)? *', 'wealth_term_focus', ['Short Term', 'Long Term', 'Both'])}

                {radioGroup('Please rate your level of interest Short / Long Term Planning *', 'wealth_term_interest', interestLevels)}

                {radioGroup('Is your primary focus to grow or retain wealth (or both)? *', 'wealth_grow_retain', ['Grow Wealth', 'Retain Wealth', 'Both'])}

                {radioGroup('Please rate your level of interest of Grow or Retain Wealth *', 'wealth_grow_retain_interest', interestLevels)}

                {radioGroup('Where is your primary Wealth Management focus (in terms of your "phase of life")? *', 'wealth_life_phase', ['Young Children', 'College Planning', 'Retirement Planning', 'Legacy Planning'])}

                {radioGroup('Please rate your level of interest in that primary focus of Key Life Phase *', 'wealth_life_phase_interest', interestLevels)}

                <div style={{ marginBottom: '20px' }}>
                  <label style={formLabel}>Do you have any interest in alternative investments (real estate, crypto, etc)? Note the area you are primarily interested in</label>
                  <textarea value={answers.wealth_alt_investments || ''} onChange={e => setAnswers(a => ({ ...a, wealth_alt_investments: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {radioGroup('Please rate your level of interest in Alternative Investments *', 'wealth_alt_interest', interestLevels)}

                <div style={{ marginBottom: '0' }}>
                  <label style={formLabel}>Any other wealth management focus?</label>
                  <textarea value={answers.wealth_other_focus || ''} onChange={e => setAnswers(a => ({ ...a, wealth_other_focus: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )
        })()}
        {activeSection === 'legal_services' && (() => {
          const businesses = (() => { try { return JSON.parse(answers.businesses || '[]') } catch { return [] } })()
          const hasBiz = answers.has_business === 'Yes' && businesses.length > 0
          const interestLevels = ['Not Applicable', 'Not Interested', 'Somewhat Interested', 'Very Interested']
          const personalLegal = ['Trusts and Wills (Estate Planning)']
          const businessLegal = ['Contract / Corporate Law', 'Structuring Entities', 'Buy / Sell Agreements', 'Joint Venture Agreements', 'Intellectual Property']

          const interestGrid = (title, areas, keyPrefix) => (
            <div style={{ marginBottom: '24px' }}>
              <label style={formLabel}>{title}</label>
              <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: isPhone ? 'none' : 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr)', background: 'var(--vfo-input)', padding: '10px 14px', gap: '4px' }}>
                  <div />
                  {interestLevels.map(level => (
                    <div key={level} style={{ fontSize: '11px', color: 'var(--vfo-muted)', textAlign: 'center' }}>{level}</div>
                  ))}
                </div>
                {areas.map(area => {
                  const key = `${keyPrefix}_${area.toLowerCase().replace(/[\s\/\(\)]/g, '_')}`
                  return (
                    isPhone ? phoneRatingRow(area, interestLevels, key) : <div key={area} style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr)', padding: '10px 14px', borderTop: '1px solid var(--vfo-border-soft)', gap: '4px', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>{area}</div>
                      {interestLevels.map(level => (
                        <div key={level} style={{ display: 'flex', justifyContent: 'center' }}>
                          <div onClick={() => setAnswers(a => ({ ...a, [key]: level }))}
                            style={{ width: '18px', height: '18px', borderRadius: '50%', border: answers[key] === level ? '5px solid #125ecc' : '2px solid var(--vfo-border-strong)', boxSizing: 'border-box', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )

          return (
            <div>
              <div style={sectionStyle}>
                {cardHead('Legal Services', 'clipboard', 'Big Picture Priorities regarding Legal Services')}

                {interestGrid('Please rate your level of interest in the following areas of Personal Legal Services *', personalLegal, 'legal_personal')}

                {interestGrid('Please rate your level of interest in the following areas of Business Legal Services *', businessLegal, 'legal_business')}

                {hasBiz && (
                  <div style={{ marginBottom: '24px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)' }}>
                    <label style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Which business do the above business legal services relate to? *</label>
                    <select value={answers.legal_which_business || ''} onChange={e => setAnswers(a => ({ ...a, legal_which_business: e.target.value }))}
                      style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                      <option value="">-- Select a business --</option>
                      {businesses.length > 1 && <option value="All">All</option>}
                      {businesses.map((b, i) => (
                        <option key={i} value={b.name || `Business ${i + 1}`}>{b.name || `Business ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom: '0' }}>
                  <label style={formLabel}>Any other legal services focus?</label>
                  <textarea value={answers.legal_other_focus || ''} onChange={e => setAnswers(a => ({ ...a, legal_other_focus: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )
        })()}

        {/* Finalize */}
        {activeSection === 'finalize' && !showConfirm && (
          <div style={sectionStyle}>
            {cardHead('Finalize CIQ', 'flag', 'You have reached the end of the CIQ Diagnostic. If you need to go back and make any changes, do that now.')}
            {activeCiq.status !== 'completed' && !readOnly && (
              <button onClick={handleFinalize} style={bigBtn(btnPrimary)}>Finalize CIQ</button>
            )}
            {validationErrors.length > 0 && (
              <div style={{ marginTop: '20px', padding: '16px', borderRadius: '8px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)' }}>
                <div style={{ fontSize: '14px', color: '#e74c3c', fontWeight: '600', marginBottom: '12px' }}>The following sections have incomplete fields:</div>
                {validationErrors.map((err, i) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{err.section}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{err.fields.join(', ')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'finalize' && showConfirm && (
          <div style={sectionStyle}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--vfo-ink)', marginBottom: '12px' }}>Confirm Finalization</div>
              <div style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                You are about to finalize this CIQ Diagnostic. Once finalized, the questionnaire will be marked as completed. You can still view and edit the answers afterward.
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => setShowConfirm(false)} style={bigBtn(btnSecondary)}>Go Back</button>
                <button onClick={async () => { await completeCiq(); setShowConfirm(false) }} disabled={saving} style={bigBtn(btnPrimary, saving)}>{saving ? 'Finalizing...' : 'Finalize CIQ Diagnostic'}</button>
              </div>
            </div>
          </div>
        )}

        </fieldset>

        {/* Navigation + save */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isFirst && <button onClick={goPrev} style={bigBtn(btnSecondary)}>← Previous</button>}
            {!isLast && <button onClick={goNext} style={bigBtn(btnPrimary)}>Next →</button>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!readOnly && <button onClick={saveAnswers} disabled={saving} style={bigBtn(btnOutline, saving)}>{saving ? 'Saving...' : 'Save Draft'}</button>}
          </div>
        </div>
      </div>
    )
  }

  // ─── CIQ access gate ──────────────────────────────────
  if (!settingsLoaded) return <CiqListSkeleton single={!!lockedClient} />


  // Members can always VIEW their CIQs. localCiqEnabled now only gates whether
  // a member can START new CIQs (the "+ Start New CIQ" button below).

  // ─── CIQ list view ────────────────────────────────────
  if (loading) return <CiqListSkeleton single={!!lockedClient} />


  // Group CIQs by client
  const byClient = {}
  ciqs.forEach(ciq => {
    const key = ciq.client_id
    if (!byClient[key]) byClient[key] = { client: ciq.clients, ciqs: [] }
    byClient[key].ciqs.push(ciq)
  })
  // The client whose CIQs are open (level 2); a stale id (deleted / not in this
  // member's list) falls back to the client list.
  const selectedClient = selectedClientId != null ? (byClient[selectedClientId] || null) : null

  // Phone (2026-10-28): one CIQ as one balanced row - its dates one per line on
  // the left, the status pill + a chevron on the right (the whole row opens it) -
  // not a pill, two dates and "View / Edit →" squeezed into one line.
  const phoneCiqRow = (ciq) => (
    <div key={ciq.id} onClick={() => openCiq(ciq)}
      style={{ ...ciqRowStyle, justifyContent: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.5 }}>
        <div>Started {formatDate(ciq.created_at)}</div>
        {ciq.completed_at && <div>Completed {formatDate(ciq.completed_at)}</div>}
      </div>
      {statusDot(ciq)}
      <PhoneChevron />
    </div>
  )
  const ciqCol = CIQ_LIST_GRID.split(' ')
  // One client's CIQs on a computer (Jake 2026-11-27): the client's name and number
  // in a title-bar box, then the CIQs in the house list (ListTable). A phone keeps
  // its rows inside the box.
  const rowCol = CIQ_ROWS_GRID.split(' ')
  // The whole row opens the CIQ, like every other list (no "Continue →" column).
  const ciqTable = (list, empty) => (
    <ListTable rowKey={c => c.id} rows={list} onRowClick={c => openCiq(c)} empty={empty}
      columns={[
        { key: 'status', label: 'Status', width: rowCol[0], get: c => c.status, render: c => statusDot(c) },
        { key: 'started', label: 'Started', width: rowCol[1], get: c => c.created_at || '', type: 'date', render: c => <ListText>{formatDate(c.created_at)}</ListText> },
        { key: 'completed', label: 'Completed', width: rowCol[2], get: c => c.completed_at || '', type: 'date', render: c => <ListText>{c.completed_at ? formatDate(c.completed_at) : ''}</ListText> },
      ]} />
  )
  const withLine = (id) => contactsMap[id]?.length > 0
    ? <span style={{ fontStyle: 'italic' }}>with {contactsMap[id].map(c => `${c.first_name} ${c.last_name}`).join(', ')}</span>
    : null
  const newCiqButton = { ...btnPrimary, ...(isPhone ? { padding: '6px 14px' } : { padding: '8px 20px', fontSize: '13px' }) }

  // The client page's CIQ tab: this one client's CIQs, even when there are none.
  if (lockedClient) {
    const clientCiqs = ciqs.filter(c => String(c.client_id) === String(lockedClient.id))
    const canStart = !readOnly && (isAdmin || localCiqEnabled)
    async function startForClient() {
      if (startingCiq) return
      setStartingCiq(true); setAddStatus('')
      try { await createForExisting(lockedClient.id) }
      finally { setStartingCiq(false) }
    }
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{clientCiqs.length} questionnaire{clientCiqs.length !== 1 ? 's' : ''}</div>
          {canStart && (
            <button disabled={startingCiq} onClick={startForClient} style={{ ...newCiqButton, cursor: startingCiq ? 'not-allowed' : 'pointer', opacity: startingCiq ? 0.7 : 1 }}>{startingCiq ? 'Starting…' : '+ Start New CIQ'}</button>
          )}
        </div>
        {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', margin: '0 0 12px' }}>{addStatus}</p>}
        {(() => {
          const emptyText = canStart ? `${lockedClient.first_name} has no CIQs yet. Click "+ Start New CIQ" to begin.` : readOnly ? `${lockedClient.first_name} has no CIQs yet.` : `${lockedClient.first_name} has no CIQs yet. Your VFO Services representative will start one.`
          const title = `${lockedClient.first_name || ''} ${lockedClient.last_name || ''}`
          const w = withLine(lockedClient.id)
          if (!isPhone) return (
            <>
              <ProfileCard icon="user" title={title} sub={<>{lockedClient.client_ref}{w && <> · {w}</>}</>} />
              {ciqTable(clientCiqs, emptyText)}
            </>
          )
          return (
            <ProfileCard icon="user" title={title} sub={lockedClient.client_ref}>
              {w && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>{w}</div>}
              {clientCiqs.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px', color: 'var(--vfo-muted)', fontSize: '13px' }}>{emptyText}</div>
                : clientCiqs.map(ciq => phoneCiqRow(ciq))}
            </ProfileCard>
          )
        })()}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{ciqs.length} questionnaire{ciqs.length !== 1 ? 's' : ''}</div>
          {isAdmin && (
            <button onClick={() => setShowCiqSettings(!showCiqSettings)} style={{ ...(showCiqSettings ? btnOutline : btnSecondary), ...BTN_SMALL }}>Settings</button>
          )}
        </div>
        {(isAdmin || localCiqEnabled) && (
          <button onClick={() => { setShowAdd(!showAdd); setAddMode(null); setAddStatus('') }} style={{ ...newCiqButton, cursor: 'pointer' }}>+ Start New CIQ</button>
        )}
      </div>

      {showCiqSettings && isAdmin && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          {cardHead('CIQ Settings', 'settings')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SettingRow title={ciqLicenceOn ? 'Member drives CIQ (training complete)' : 'Allow Member to Start New CIQs'}
              hint={ciqLicenceOn
                ? 'Turn on once the MSM is satisfied the CIQ training is complete. The member then runs their own CIQs and chooses, per client, the free Basic portal or the $25/month Premium portal. When off, they can still view existing CIQs but can\'t create new ones.'
                : 'When on, the member can start new CIQs on their own. When off, they can still view existing CIQs but can\'t create new ones.'}>
              <Switch on={localCiqEnabled} onClick={() => setLocalCiqEnabled(!localCiqEnabled)} label={ciqLicenceOn ? 'Member drives CIQ (training complete)' : 'Allow Member to Start New CIQs'} />
            </SettingRow>
            <SettingRow title="VFO Services Managed" hint={'When on, One Page Plan shows "powered by VFO Services"'}>
              <Switch on={localCiqVfosManaged} onClick={() => setLocalCiqVfosManaged(!localCiqVfosManaged)} label="VFO Services Managed" />
            </SettingRow>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button onClick={() => saveCiqSetting(localCiqEnabled, localCiqVfosManaged)} style={btnPrimary}>Save Settings</button>
            {ciqSettingsStatus && <span style={{ color: 'var(--vfo-success-text)', fontWeight: 500, fontSize: '13px' }}>{ciqSettingsStatus}</span>}
          </div>
        </div>
      )}

      {/* Add: choose mode */}
      {showAdd && !addMode && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          {cardHead('Start New CIQ', 'users')}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => selectAddMode('existing')} style={{ ...btnOutline, flex: 1, padding: isPhone ? '14px' : '20px', borderRadius: '12px', fontSize: '14px' }}>Existing Client</button>
            <button onClick={() => selectAddMode('new')} style={{ ...btnOutline, flex: 1, padding: isPhone ? '14px' : '20px', borderRadius: '12px', fontSize: '14px' }}>New Client</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => { setShowAdd(false); setAddMode(null) }} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {/* Add: existing client */}
      {showAdd && addMode === 'existing' && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          {cardHead('Select Client', 'users')}
          {loadingClients
            ? <SkeletonText lines={3} />
            : allClients.length === 0
              ? <div style={{ padding: '20px', color: 'var(--vfo-muted)', textAlign: 'center' }}>No clients found for this member.</div>
              : <>
                  <input type="search" name="search" autoComplete="off" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search by name or ref..." style={{ ...inputStyle, marginBottom: '12px' }} />
                  {filteredClients.map(c => (
                    <div key={c.id} onClick={() => createForExisting(c.id)} style={ciqRowStyle}>
                      <div>
                        <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{c.client_ref}{c.email ? ` · ${c.email}` : ''}</div>
                      </div>
                      <span style={{ color: 'var(--vfo-link)', fontWeight: 600, fontSize: '12px' }}>Select →</span>
                    </div>
                  ))}
                </>
          }
          {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => setAddMode(null)} style={btnSecondary}>Back</button>
          </div>
        </div>
      )}

      {/* Add: new client - the shared form (tidying, duplicates, contact names) */}
      {showAdd && addMode === 'new' && (
        <AddClientForm title="New Client" saveLabel="Create & Start CIQ" showPhone={false}
          profileBase={isAdmin ? '/admin/client' : '/member/client'}
          onSave={createNew} onCancel={() => setAddMode(null)} />
      )}

      {/* Level 1: every client with a CIQ. Level 2: one client's CIQs. */}
      {ciqs.length === 0 && !showAdd
        ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>{(isAdmin || localCiqEnabled) ? 'No CIQs yet. Click "Start New CIQ" to begin.' : 'No CIQs yet. Your VFO Services representative will start one for you.'}</div>
        : selectedClient == null ? isPhone ? (
          // Phone: the list card pattern, straight on the page (a card of cards
          // doubled the padding) - name + ref | email + CIQ count, chevron.
          <div>
            {Object.values(byClient).map(({ client, ciqs: clientCiqs }) => {
              const done = clientCiqs.filter(c => c.status === 'completed').length
              return (
                <div key={client?.id} onClick={() => setSelectedClientId(client?.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', marginBottom: '10px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '14px', alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.3 }}>{client?.first_name} {client?.last_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px', whiteSpace: 'nowrap' }}>{client?.client_ref}</div>
                    </div>
                    <div style={{ minWidth: 0, fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.45, paddingTop: '1px' }}>
                      {client?.email && <div><EmailText email={client.email} /></div>}
                      <div>{clientCiqs.length} CIQ{clientCiqs.length !== 1 ? 's' : ''}{done ? ` · ${done} completed` : ''}</div>
                    </div>
                  </div>
                  <PhoneChevron />
                </div>
              )
            })}
          </div>
        ) : (
          // Computer: the house list (ListTable), one row per client, the row opens
          // their CIQs.
          <ListTable rowKey={r => r.client?.id} rows={Object.values(byClient)}
            onRowClick={r => setSelectedClientId(r.client?.id)}
            columns={[
              { key: 'name', label: 'Client', width: ciqCol[0], get: r => `${r.client?.first_name || ''} ${r.client?.last_name || ''}`.trim().toLowerCase(), render: r => <ListName>{r.client?.first_name} {r.client?.last_name}</ListName> },
              { key: 'ref', label: 'Ref', width: ciqCol[1], get: r => r.client?.client_ref || '', render: r => <ListText>{r.client?.client_ref}</ListText> },
              { key: 'email', label: 'Email', width: ciqCol[2], render: r => <ListText style={{ overflowWrap: 'anywhere' }}>{r.client?.email}</ListText> },
              { key: 'ciqs', label: 'CIQs', width: ciqCol[3], get: r => r.ciqs.length, type: 'number', render: r => { const done = r.ciqs.filter(c => c.status === 'completed').length; return <ListText>{r.ciqs.length} CIQ{r.ciqs.length !== 1 ? 's' : ''}{done ? ` · ${done} completed` : ''}</ListText> } },
            ]} />
        ) : [selectedClient].map(({ client, ciqs: clientCiqs }) => {
          const title = `${client?.first_name || ''} ${client?.last_name || ''}`
          const w = withLine(client?.id)
          const back = <button onClick={() => setSelectedClientId(null)} style={{ ...btnSecondary, ...BTN_SMALL }}>← All clients</button>
          if (!isPhone) return (
            <div key={client?.id}>
              <ProfileCard icon="user" title={title} sub={<>{client?.client_ref}{w && <> · {w}</>}</>} action={back} />
              {ciqTable(clientCiqs)}
            </div>
          )
          return (
            <ProfileCard key={client?.id} icon="user" title={title} sub={client?.client_ref} action={back}>
              {w && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>{w}</div>}
              {clientCiqs.map(ciq => phoneCiqRow(ciq))}
            </ProfileCard>
          )
        })
      }
    </div>
  )
}