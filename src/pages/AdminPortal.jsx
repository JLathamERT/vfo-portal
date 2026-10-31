import { useEffect, useState, useLayoutEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getSession, clearSession, loadCachedData, hasCachedData, getLastSeen, setLastSeen } from '../lib/api'
import { usePortalTheme } from '../lib/theme'
import SpecialistsPanel from '../components/admin/SpecialistsPanel'
import TaxPlannersPanel from '../components/admin/TaxPlannersPanel'
import MembersPanel, { MEMBER_PROFILE_ORIGIN_KEY } from '../components/admin/MembersPanel'
import MemberOverviewPanel from '../components/admin/MemberOverviewPanel'
import ClientOverviewPanel, { CLIENT_OVERVIEW_SECTION_KEY } from '../components/admin/ClientOverviewPanel'
import FaqEditorPanel from '../components/admin/FaqEditorPanel'
import FeatureSwitchesPanel from '../components/admin/FeatureSwitchesPanel'
import TaxDiagnosticsPanel from '../components/admin/TaxDiagnosticsPanel'
import AdminEditor from '../components/admin/AdminEditor'
import AdminSettings from '../components/admin/AdminSettings'
import AutomationPanel from '../components/admin/AutomationPanel'
import TaxAutomationPanel from '../components/admin/TaxAutomationPanel'
import PipAutomationPanel from '../components/admin/PipAutomationPanel'
import AdvisorAutomationPanel from '../components/admin/AdvisorAutomationPanel'
import AccountantAutomationPanel from '../components/admin/AccountantAutomationPanel'
import PFTAutomationPanel from '../components/admin/PFTAutomationPanel'
import SpecialistAutomationPanel from '../components/admin/SpecialistAutomationPanel'
import EmailTemplatesPanel from '../components/admin/EmailTemplatesPanel'
import NotificationEditorPanel from '../components/admin/NotificationEditorPanel'
import PortalHeader from '../components/shared/PortalHeader'
import AdminNavBar from '../components/admin/AdminNavBar'
import AllPaymentsTab from '../components/payments/AllPaymentsTab'
import SpecialistRevenuePanel from '../components/admin/SpecialistRevenuePanel'
import SpecialistRecurringPanel from '../components/admin/SpecialistRecurringPanel'
import SpecialistLicensePanel from '../components/admin/SpecialistLicensePanel'
import SpecialistLicenseReconciliationPanel from '../components/admin/SpecialistLicenseReconciliationPanel'
import SpecialistLicenseOutstandingPanel from '../components/admin/SpecialistLicenseOutstandingPanel'
import SpecialistBgPanel from '../components/admin/SpecialistBgPanel'
import SpecialistBgOutstandingPanel from '../components/admin/SpecialistBgOutstandingPanel'
import SpecialistBgReconciliationPanel from '../components/admin/SpecialistBgReconciliationPanel'
import SpecialistReconciliationPanel from '../components/admin/SpecialistReconciliationPanel'
import HolisticRevenuePanel from '../components/admin/HolisticRevenuePanel'
import HolisticReconciliationPanel from '../components/admin/HolisticReconciliationPanel'
import TaxRevenuePanel from '../components/admin/TaxRevenuePanel'
import TaxReconciliationPanel from '../components/admin/TaxReconciliationPanel'
import PipRevenuePanel from '../components/admin/PipRevenuePanel'
import PipReconciliationPanel from '../components/admin/PipReconciliationPanel'
import MemberOnboardingPanel from '../components/admin/MemberOnboardingPanel'
import MembershipFeesPanel from '../components/admin/MembershipFeesPanel'
import AccountingCombinedPanel, { PILL_KEY as ACCOUNTING_PILL_KEY } from '../components/admin/AccountingCombinedPanel'
import OutstandingLinksPanel from '../components/admin/OutstandingLinksPanel'
import HeldPayoutsPanel from '../components/admin/HeldPayoutsPanel'
import SpecialistRevenueAutomationPanel from '../components/admin/SpecialistRevenueAutomationPanel'
import GrowthCreditsPanel from '../components/admin/GrowthCreditsPanel'
import GrowthCreditsAccountingPanel from '../components/admin/GrowthCreditsAccountingPanel'
import MoneyMappingAccountingPanel from '../components/admin/MoneyMappingAccountingPanel'
import ManualConnectPaymentPanel from '../components/admin/ManualConnectPaymentPanel'
import NotificationsPage from '../components/admin/NotificationsPage'
import GrowthCreditsRedemptionsPage from '../components/admin/GrowthCreditsRedemptionsPage'
import { DirectoryListSkeleton } from '../components/shared/Skeleton'

// Tabs a member profile's "Back to list" may return to when the profile was
// opened from them (openMemberProfile's `origin`). Every other origin keeps the
// ordinary Back: the member's own directory list. Accounting returns to the section
// held in adminAccountingSection, and its combined panels restore their own pill.
const PROFILE_ORIGIN_TABS = ['member_overview', 'client_overview', 'accounting']

// Every accountingSection key the Accounting tab renders a block for. Used only by
// the fallback card below, so a stale sessionStorage key can never blank the page.
const ACCOUNTING_SECTIONS = [
  'payments', 'manual_connect_payment',
  'specialist_revenue', 'specialist_payment_input', 'specialist_recurring', 'specialist_reconciliation', 'specialist_held_payouts',
  'specialist_license', 'specialist_bg',
  'holistic_revenue', 'holistic_reconciliation', 'holistic_held_payouts',
  'tax_revenue', 'tax_reconciliation', 'tax_held_payouts',
  'pip_revenue', 'pip_reconciliation', 'pip_held_payouts',
  'advisor_onboarding_fees', 'advisor_membership_fees',
  'accountant_onboarding_fees', 'accountant_membership_fees',
  'gc_accounting', 'mm_accounting',
]

export default function AdminPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const session = getSession()
  usePortalTheme()
  // The three superadmin-managed "other" tabs. A non-superadmin admin sees one
  // only if Jake granted it (session.allowed_tabs). Superadmin sees all.
  const canSeeTab = (key) => !!session?.is_superadmin || (session?.allowed_tabs || []).includes(key)
  const [activeTab, setActiveTab] = useState(() => {
    const t = sessionStorage.getItem('adminActiveTab')
    // The "other" tabs are access-gated — never restore an admin into one they lack.
    if (t === 'automation' && !canSeeTab('automation')) return null
    if ((t === 'accounting' || t === 'payments') && !canSeeTab('accounting')) return null
    if (t === 'member_overview' && !canSeeTab('member_overview')) return null
    if (t === 'client_overview' && !canSeeTab('client_overview')) return null
    if (t === 'growth_credits' && !canSeeTab('growth_credits')) return null
    if (t === 'faq_editor' && !canSeeTab('faq_editor')) return null
    if (t === 'tax_diagnostics' && !canSeeTab('tax_diagnostics')) return null
    if (t === 'feature_switches' && !session?.is_superadmin) return null
    if (t === 'members') return 'advisors'
    // Legacy: the standalone Payments tab is now a sub-tab of Accounting.
    if (t === 'payments') return 'accounting'
    return t || null
  })
  const [advisorsSection, setAdvisorsSection] = useState(sessionStorage.getItem('adminAdvisorsSection') || 'advisor_search')
  const [accountantsSection, setAccountantsSection] = useState(sessionStorage.getItem('adminAccountantsSection') || 'accountant_search')
  const [navClickCount, setNavClickCount] = useState(0)
  const [specialistsSection, setSpecialistsSection] = useState(sessionStorage.getItem('adminSpecialistsSection') || 'specialist_search')
  const [taxPlannersSection, setTaxPlannersSection] = useState(sessionStorage.getItem('adminTaxPlannersSection') || 'tax_planner_search')
  const [strategicSection, setStrategicSection] = useState(sessionStorage.getItem('adminStrategicSection') || 'strategic_member_search')
  const [automationSection, setAutomationSection] = useState(sessionStorage.getItem('adminAutomationSection') || 'map1_pipeline')
  const [accountingSection, setAccountingSection] = useState(sessionStorage.getItem('adminAccountingSection') || 'payments')
  // Membership-fees deep link (?…&member=): the plan card to auto-open once.
  const [initialMemberNumber, setInitialMemberNumber] = useState(null)
  const [initialDiagnosticId, setInitialDiagnosticId] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [allExperts, setAllExperts] = useState([])
  const [allMembers, setAllMembers] = useState([])
  // A ?member= link to someone created since the list loaded (e.g. Create on an
  // onboarding) refreshes the list once instead of silently doing nothing.
  const memberLinkRefreshRef = useRef(null)
  const [memberConnections, setMemberConnections] = useState([])
  const [allExclusionMap, setAllExclusionMap] = useState({})
  const [ecoMap, setEcoMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Layout effect so a remembered copy is on screen before the first paint.
  useLayoutEffect(() => {
    if (!session || session.role !== 'admin') { navigate('/admin/login?next=' + encodeURIComponent(location.pathname + location.search)); return }
    initialLoad()
    // Deep-link from the ClientDetail header's Settings / Admin Editor buttons
    // (that route can't reach this component's view state directly).
    const view = sessionStorage.getItem('adminOpenView')
    if (view) {
      sessionStorage.removeItem('adminOpenView')
      if (view === 'settings') { setShowSettings(true); setActiveTab(null) }
      if (view === 'editor' && session.is_superadmin) { setShowEditor(true); setActiveTab(null) }
    }
  }, [])

  // Deep-link from notifications etc: ?tab=&section= drives the active tab/section,
  // and ?member=&feature= opens a specific member's detail view on a feature tab
  // (e.g. a Growth Plan notification → that member's One Page Plan).
  useEffect(() => {
    // Read the LIVE URL, not router state: after we strip consumed params with
    // history.replaceState below, react-router's location.search still holds
    // the old value, and this effect re-runs when allMembers loads — reading
    // window.location keeps that re-run from re-applying a consumed deep link.
    const params = new URLSearchParams(window.location.search)
    const memberNum = params.get('member')
    // A membership-fees deep link (?tab=accounting&section=..._membership_fees&member=)
    // targets one plan card INSIDE that accounting panel, not the member's own
    // profile view — so it falls through to the tab/section branch below and the
    // member number is handed to the panel as initialMemberNumber.
    const membershipFeesLink = params.get('tab') === 'accounting' &&
      (params.get('section') === 'advisor_membership_fees' || params.get('section') === 'accountant_membership_fees')
    if (memberNum && !membershipFeesLink) {
      if (!allMembers.length) return // members not loaded yet — effect re-runs when they are
      const m = allMembers.find(x => String(x.plugin_member_number) === String(memberNum))
      if (m) {
        // Optional MSM sub-tab (e.g. ?sub=training) — stashed for EnrolledPanel to
        // consume-and-clear once on mount, same as pftReturnEnrolledTab.
        const sub = params.get('sub')
        if (sub) sessionStorage.setItem('msmInitialSubTab', sub)
        // Optional CIQ client (?ciqclient=) — MemberCIQ consumes-and-clears it
        // to auto-open that client's newest questionnaire.
        const ciqClient = params.get('ciqclient')
        if (ciqClient) sessionStorage.setItem('ciqInitialClientId', ciqClient)
        const origin = PROFILE_ORIGIN_TABS.includes(params.get('origin')) ? params.get('origin') : null
        openMemberProfile(m, params.get('feature') || 'profile_details', origin)
        navigate('/admin', { replace: true }) // strip params so manual nav isn't re-hijacked
      } else if (memberLinkRefreshRef.current !== memberNum) {
        memberLinkRefreshRef.current = memberNum
        loadAllData()
      }
      return
    }
    const tab = params.get('tab')
    const section = params.get('section')
    if (!tab) return
    // The "other" tabs are access-gated — ignore a deep-link into one the admin lacks.
    if (tab === 'automation' && !canSeeTab('automation')) return
    if ((tab === 'accounting' || tab === 'payments') && !canSeeTab('accounting')) return
    if (tab === 'member_overview' && !canSeeTab('member_overview')) return
    if (tab === 'client_overview' && !canSeeTab('client_overview')) return
    if (tab === 'growth_credits' && !canSeeTab('growth_credits')) return
    if (tab === 'tax_diagnostics' && !canSeeTab('tax_diagnostics')) return
    if (tab === 'feature_switches' && !session?.is_superadmin) return
    // The diagnostic bell carries its row id so the queue can open that card.
    if (tab === 'tax_diagnostics' && params.get('diag')) {
      // A member-portal form's card is keyed `portal-<intake id>` (2026-10-13).
      const diag = params.get('diag')
      setInitialDiagnosticId(diag.startsWith('portal-') ? diag : Number(diag))
    }
    setActiveTab(tab)
    sessionStorage.setItem('adminActiveTab', tab)
    if (section) {
      const sectionSetters = {
        advisors: [setAdvisorsSection, 'adminAdvisorsSection'],
        accountants: [setAccountantsSection, 'adminAccountantsSection'],
        strategic: [setStrategicSection, 'adminStrategicSection'],
        specialists: [setSpecialistsSection, 'adminSpecialistsSection'],
        taxplanners: [setTaxPlannersSection, 'adminTaxPlannersSection'],
        automation: [setAutomationSection, 'adminAutomationSection'],
        accounting: [setAccountingSection, 'adminAccountingSection'],
      }
      const entry = sectionSetters[tab]
      if (entry) { entry[0](section); sessionStorage.setItem(entry[1], section) }
      if (tab === 'accounting') sessionStorage.removeItem(ACCOUNTING_PILL_KEY)
    }
    // Membership-fees bell: the member number rides along so the panel can open
    // and scroll to that member's plan card. Held in state (not sessionStorage)
    // so a plain reload lands on the section without re-expanding the card.
    if (memberNum && membershipFeesLink) setInitialMemberNumber(memberNum)
    // Deep link consumed — strip it so the URL is clean and a reload restores
    // from sessionStorage instead of re-hijacking to this tab (gotcha #182;
    // replaceState, never navigate, for self-heals).
    window.history.replaceState({}, '', '/admin')
  }, [location.search, allMembers])

  // On mount: when this session already holds load_data (e.g. coming back from a
  // client page), render from it at once and refresh in the background instead
  // of blocking the portal on a fresh fetch.
  async function initialLoad() {
    const snap = getLastSeen('adminportal:loaddata')
    if (snap) {
      applyLoadData(snap)
      setLoading(false)
    } else if (hasCachedData()) {
      try {
        applyLoadData(await loadCachedData())
        setLoading(false)
      } catch { /* the refresh below reports the error */ }
    }
    loadAllData()
  }

  async function loadAllData() {
    try {
      // loadAllData re-runs as panels' onDataChange — clear any prior banner first.
      setLoadError(null)
      // refresh: true also updates the shared cache ClientDetail reads.
      const data = await loadCachedData({ refresh: true })
      applyLoadData(data)
      setLastSeen('adminportal:loaddata', data)
    } catch (err) {
      console.error('Load error:', err)
      setLoadError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function applyLoadData(data) {
    setAllExperts(data.experts || [])
    setAllMembers(data.members || [])
    setMemberConnections(data.member_connections || [])
    const excMap = {}
    ;(data.exclusions || []).forEach(e => {
      if (!excMap[e.member_number]) excMap[e.member_number] = []
      excMap[e.member_number].push(e.expert_id)
    })
    setAllExclusionMap(excMap)
    const eco = {}
    ;(data.ecosystems || []).forEach(e => {
      if (!eco[e.expert_id]) eco[e.expert_id] = []
      eco[e.expert_id].push(e.name)
    })
    setEcoMap(eco)
  }

  // Only these views read load_data (experts / members / exclusions / ecosystems);
  // every other panel loads its own data and mounts without waiting for it.
  const viewNeedsLoadData = ['specialists', 'member_overview', 'advisors', 'accountants', 'strategic'].includes(activeTab) ||
    (activeTab === 'accounting' && ['specialist_revenue', 'specialist_payment_input', 'specialist_recurring', 'specialist_reconciliation', 'specialist_held_payouts',
      'specialist_license', 'specialist_bg', 'advisor_membership_fees', 'accountant_membership_fees'].includes(accountingSection))

  // The return leg of openMemberProfile's `origin`: put the admin back on the tab
  // they jumped from. The profile's Back handler has already cleared the selection
  // keys, so the directory it leaves behind is collapsed to its list either way.
  function backToProfileOrigin(origin) {
    if (!PROFILE_ORIGIN_TABS.includes(origin)) return
    setActiveTab(origin)
    sessionStorage.setItem('adminActiveTab', origin)
    setNavClickCount(c => c + 1)
  }

  // Targeted in-place update of one member row in the payload this portal is
  // holding, for single-field saves that would otherwise need a full loadAllData()
  // round-trip to become visible. `allMembers` is fetched ONCE, so a panel that
  // saves and unmounts loses its change on the way back in.
  function patchMember(memberNumber, patch) {
    setAllMembers(ms => ms.map(m => (
      String(m.plugin_member_number) === String(memberNumber) ? { ...m, ...patch } : m
    )))
  }

  function signOut() { clearSession(); navigate('/') }
  function handleTitleClick() { setShowEditor(false); setShowSettings(false); setActiveTab(null); sessionStorage.removeItem('adminActiveTab') }

  function selectAdvisorsSection(key) {
    setActiveTab('advisors')
    sessionStorage.setItem('adminActiveTab', 'advisors')
    setAdvisorsSection(key)
    sessionStorage.setItem('adminAdvisorsSection', key)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectAccountantsSection(key) {
    setActiveTab('accountants')
    sessionStorage.setItem('adminActiveTab', 'accountants')
    setAccountantsSection(key)
    sessionStorage.setItem('adminAccountantsSection', key)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectStrategicSection(key) {
    setActiveTab('strategic')
    sessionStorage.setItem('adminActiveTab', 'strategic')
    setStrategicSection(key)
    sessionStorage.setItem('adminStrategicSection', key)
    sessionStorage.removeItem('adminSelectedStrategicMember')
    sessionStorage.removeItem('adminStrategicFeatureTab')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectSpecialistsSection(key) {
    setActiveTab('specialists')
    sessionStorage.setItem('adminActiveTab', 'specialists')
    setSpecialistsSection(key)
    sessionStorage.setItem('adminSpecialistsSection', key)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectTaxPlannersSection(key) {
    setActiveTab('taxplanners')
    sessionStorage.setItem('adminActiveTab', 'taxplanners')
    setTaxPlannersSection(key)
    sessionStorage.setItem('adminTaxPlannersSection', key)
    // Re-picking the section you are already on must still reset the panel (back to
    // the planner list from an open planner) — the counter is part of its key.
    setNavClickCount(c => c + 1)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectAutomationSection(key) {
    setActiveTab('automation')
    sessionStorage.setItem('adminActiveTab', 'automation')
    setAutomationSection(key)
    sessionStorage.setItem('adminAutomationSection', key)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectAccountingSection(key) {
    setActiveTab('accounting')
    sessionStorage.setItem('adminActiveTab', 'accounting')
    setAccountingSection(key)
    sessionStorage.setItem('adminAccountingSection', key)
    sessionStorage.removeItem(ACCOUNTING_PILL_KEY)
    sessionStorage.removeItem('adminSelectedMember')
    sessionStorage.removeItem('adminMemberFeatureTab')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectMemberOverview() {
    setActiveTab('member_overview')
    sessionStorage.setItem('adminActiveTab', 'member_overview')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectClientOverview() {
    try { sessionStorage.removeItem(CLIENT_OVERVIEW_SECTION_KEY) } catch { /* private mode */ }
    setActiveTab('client_overview')
    sessionStorage.setItem('adminActiveTab', 'client_overview')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectGrowthCredits() {
    setActiveTab('growth_credits')
    sessionStorage.setItem('adminActiveTab', 'growth_credits')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectFaqEditor() {
    setActiveTab('faq_editor')
    sessionStorage.setItem('adminActiveTab', 'faq_editor')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectFeatureSwitches() {
    setActiveTab('feature_switches')
    sessionStorage.setItem('adminActiveTab', 'feature_switches')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  function selectTaxDiagnostics() {
    setActiveTab('tax_diagnostics')
    sessionStorage.setItem('adminActiveTab', 'tax_diagnostics')
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  // Member Overview → open a member's full existing detail view in their own
  // category tab (Advisors / Accountants / Strategic). Each MemberDirectoryView
  // restores its selection from sessionStorage on mount, so we pre-seed the right
  // selection key + feature tab, then switch tabs.
  // `origin` names the tab the jump came FROM, when that is somewhere the
  // profile's own "Back to list" could not otherwise return to. Only the Member
  // Overview list passes one; every other caller (the profile name links) passes
  // nothing and the stamp is CLEARED, so Back keeps its ordinary meaning there.
  function openMemberProfile(m, feature = 'profile_details', origin = null) {
    const cat = m.member_category
    let tab, sectionSetter, sectionKey, section, selKey, featKey
    if (cat === 'accountant') {
      tab = 'accountants'; sectionSetter = setAccountantsSection; sectionKey = 'adminAccountantsSection'; section = 'accountant_search'
      selKey = 'adminSelectedAccountant'; featKey = 'adminAccountantFeatureTab'
    } else if (cat === 'strategic_member') {
      tab = 'strategic'; sectionSetter = setStrategicSection; sectionKey = 'adminStrategicSection'; section = 'strategic_member_search'
      selKey = 'adminSelectedStrategicMember'; featKey = 'adminStrategicFeatureTab'
    } else {
      tab = 'advisors'; sectionSetter = setAdvisorsSection; sectionKey = 'adminAdvisorsSection'; section = 'advisor_search'
      selKey = 'adminSelectedMember'; featKey = 'adminMemberFeatureTab'
    }
    sessionStorage.setItem(selKey, m.plugin_member_number)
    sessionStorage.setItem(featKey, feature)
    if (origin) sessionStorage.setItem(MEMBER_PROFILE_ORIGIN_KEY, origin)
    else sessionStorage.removeItem(MEMBER_PROFILE_ORIGIN_KEY)
    sectionSetter(section)
    sessionStorage.setItem(sectionKey, section)
    setActiveTab(tab)
    sessionStorage.setItem('adminActiveTab', tab)
    setNavClickCount(c => c + 1)
    setShowEditor(false)
    setShowSettings(false)
  }

  if (!session) return null

  // A pick on the shared AdminNavBar (components/admin/AdminNavBar.jsx).
  function selectNav(tab, section) {
    if (tab === 'advisors') return selectAdvisorsSection(section)
    if (tab === 'accountants') return selectAccountantsSection(section)
    if (tab === 'strategic') return selectStrategicSection(section)
    if (tab === 'specialists') return selectSpecialistsSection(section)
    if (tab === 'taxplanners') return selectTaxPlannersSection(section)
    if (tab === 'automation') return selectAutomationSection(section)
    if (tab === 'accounting') return selectAccountingSection(section)
    if (tab === 'member_overview') return selectMemberOverview()
    if (tab === 'client_overview') return selectClientOverview()
    if (tab === 'growth_credits') return selectGrowthCredits()
    if (tab === 'faq_editor') return selectFaqEditor()
    if (tab === 'tax_diagnostics') return selectTaxDiagnostics()
    if (tab === 'feature_switches') return selectFeatureSwitches()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeader name={session.name} onTitleClick={handleTitleClick} actions={[
        ...(session.is_superadmin ? [{ key: 'editor', label: 'Admin Editor', tone: 'gold', onClick: () => { setShowEditor(true); setShowSettings(false); setActiveTab(null) } }] : []),
        { key: 'settings', label: 'Settings', onClick: () => { setShowSettings(true); setShowEditor(false); setActiveTab(null) } },
        { key: 'signout', label: 'Sign Out', onClick: signOut },
      ]}>
        {!showEditor && !showSettings && <AdminNavBar session={session} activeTab={activeTab} onSelect={selectNav} />}
      </PortalHeader>

      {showEditor && <AdminEditor onBack={handleTitleClick} />}
      {showSettings && <AdminSettings onBack={handleTitleClick} session={session} />}

      {!showEditor && !showSettings && (
        <>
          <div style={{ flex: 1 }}>
          {loadError && (
            <div style={{ maxWidth: '980px', margin: '20px auto 0', padding: '0 24px' }}>
              <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#d93025', marginBottom: '6px' }}>We couldn't load your portal</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', wordBreak: 'break-word' }}>{loadError}</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Please refresh the page — if this keeps happening, contact your VFO team.</div>
              </div>
            </div>
          )}

          {!activeTab && (
            <div style={{ textAlign: 'center', padding: '60px 24px 0' }}>
              <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '10px' }}>Welcome back</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '38px', color: 'var(--vfo-heading)', margin: 0 }}>{session.name}</p>
              <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', margin: '18px auto 0' }} />
              {!loading && (() => {
                // Mirrors MemberKpiPanel: null status counts as Active, and the
                // separate buckets (advisor: VFO Reconciliation (Free); accountant:
                // Team Member) are excluded so these match the KPI Active counts.
                const active = (m) => (m.elite_status || 'Active') === 'Active'
                const cards = [
                  { label: 'Active Advisors', value: allMembers.filter(m => m.member_category !== 'accountant' && m.member_category !== 'strategic_member' && m.member_type !== 'VFO Reconciliation (Free)' && active(m)).length, go: () => selectAdvisorsSection('advisor_search') },
                  { label: 'Active Accountants', value: allMembers.filter(m => m.member_category === 'accountant' && m.member_type !== 'Team Member' && active(m)).length, go: () => selectAccountantsSection('accountant_search') },
                  { label: 'Active Strategic Members', value: allMembers.filter(m => m.member_category === 'strategic_member' && active(m)).length, go: () => selectStrategicSection('strategic_member_search') },
                  { label: 'Active Specialists', value: allExperts.filter(e => (e.status || 'Active') === 'Active').length, go: () => selectSpecialistsSection('specialist_search') },
                ]
                return (
                  <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '40px' }}>
                    {cards.map(c => (
                      <button key={c.label} onClick={c.go} style={{ width: '170px', padding: '20px 14px 16px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{c.value}</div>
                        <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.9px', color: 'var(--vfo-muted)', textTransform: 'uppercase', marginTop: '9px' }}>{c.label}</div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'specialists' && !loading && (
            // key on section forces a clean remount when switching between the
            // onboarding view and the search/add views — SpecialistsPanel early-
            // returns <SpecialistOnboarding/> before its hooks, so changing section
            // in place would trip React's hooks-count check and the navigation
            // (e.g. the Stage-5 "Open specialist →" link) could silently fail.
            <SpecialistsPanel key={specialistsSection} allExperts={allExperts} ecoMap={ecoMap} onDataChange={loadAllData} section={specialistsSection} onBackToOrigin={backToProfileOrigin} />
          )}

          {activeTab === 'taxplanners' && (
            <TaxPlannersPanel key={`${taxPlannersSection}-${navClickCount}`} section={taxPlannersSection} />
          )}

          {activeTab === 'member_overview' && !loading && (
            <MemberOverviewPanel allMembers={allMembers} onOpenMember={(m, feature) => openMemberProfile(m, feature, 'member_overview')} onPatchMember={patchMember} />
          )}

          {activeTab === 'client_overview' && (
            <ClientOverviewPanel key={navClickCount} onOpenCiq={c => {
              // CIQ pill row: open the client's member on the CIQ feature tab, on
              // THAT client's list of CIQs (MemberCIQ consumes the key).
              const m = allMembers.find(x => String(x.plugin_member_number) === String(c.member_number))
              if (!m) return
              sessionStorage.setItem('ciqInitialListClientId', String(c.id))
              openMemberProfile(m, 'ciq', 'client_overview')
            }} />
          )}

          {activeTab === 'faq_editor' && (
            <FaqEditorPanel />
          )}

          {activeTab === 'feature_switches' && session?.is_superadmin && (
            <FeatureSwitchesPanel />
          )}

          {activeTab === 'tax_diagnostics' && canSeeTab('tax_diagnostics') && (
            <TaxDiagnosticsPanel initialDiagnosticId={initialDiagnosticId} />
          )}

          {activeTab === 'advisors' && !loading && (
            <MembersPanel
              allMembers={allMembers} allExperts={allExperts}
              allExclusionMap={allExclusionMap} ecoMap={ecoMap}
              onDataChange={loadAllData} section={advisorsSection} navClickCount={navClickCount}
              onOpenMember={openMemberProfile} onBackToOrigin={backToProfileOrigin} memberConnections={memberConnections}
            />
          )}

          {activeTab === 'accountants' && !loading && (
            <MembersPanel
              allMembers={allMembers} allExperts={allExperts}
              allExclusionMap={allExclusionMap} ecoMap={ecoMap}
              onDataChange={loadAllData} section={accountantsSection} navClickCount={navClickCount}
              onOpenMember={openMemberProfile} onBackToOrigin={backToProfileOrigin} memberConnections={memberConnections}
            />
          )}

          {activeTab === 'strategic' && !loading && (
            <MembersPanel
              allMembers={allMembers} allExperts={allExperts}
              allExclusionMap={allExclusionMap} ecoMap={ecoMap}
              onDataChange={loadAllData} section={strategicSection} navClickCount={navClickCount}
              onOpenMember={openMemberProfile} onBackToOrigin={backToProfileOrigin} memberConnections={memberConnections}
            />
          )}

          {activeTab === 'automation' && automationSection === 'map1_pipeline' && (
            <AutomationPanel section={automationSection} />
          )}
          {activeTab === 'automation' && automationSection === 'tax_pipeline' && (
            <TaxAutomationPanel programScope="holistic" />
          )}
          {activeTab === 'automation' && automationSection === 'pip_pipeline' && (
            <PipAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'standalone_tax_pipeline' && (
            <TaxAutomationPanel programScope="standalone" />
          )}
          {activeTab === 'automation' && automationSection === 'advisor_pipeline' && (
            <AdvisorAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'accountant_pipeline' && (
            <AccountantAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'pft_pipeline' && (
            <PFTAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'specialist_pipeline' && (
            <SpecialistAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'specialist_revenue_pipeline' && (
            <SpecialistRevenueAutomationPanel />
          )}
          {activeTab === 'automation' && automationSection === 'growth_credits' && (
            <GrowthCreditsPanel />
          )}
          {activeTab === 'notifications' && (
            <NotificationsPage />
          )}
          {activeTab === 'growth_credits' && canSeeTab('growth_credits') && (
            <GrowthCreditsRedemptionsPage />
          )}
          {activeTab === 'automation' && automationSection === 'email_templates' && (
            <EmailTemplatesPanel />
          )}
          {activeTab === 'automation' && automationSection === 'notification_editor' && (
            <NotificationEditorPanel />
          )}

          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'payments' && (
            <AllPaymentsTab />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'manual_connect_payment' && (
            <ManualConnectPaymentPanel />
          )}
          {activeTab === 'accounting' && !loading && canSeeTab('accounting') && (accountingSection === 'specialist_revenue' || accountingSection === 'specialist_payment_input' || accountingSection === 'specialist_recurring' || accountingSection === 'specialist_reconciliation' || accountingSection === 'specialist_held_payouts') && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · Specialists" title="VFO Specialist Revenue"
              maxWidth="1200px" initialKey={accountingSection === 'specialist_payment_input' ? 'specialist_revenue' : accountingSection}
              tabs={[
                { key: 'specialist_revenue', label: 'VFO Specialist Revenue', render: () => <SpecialistRevenuePanel allExperts={allExperts} allMembers={allMembers} embedded /> },
                { key: 'specialist_reconciliation', label: 'VFO Specialist Reconciliation', render: () => <SpecialistReconciliationPanel allMembers={allMembers} embedded /> },
                { key: 'specialist_recurring', label: 'VFO Specialist Recurring Revenue Payments', render: () => <SpecialistRecurringPanel embedded /> },
                { key: 'specialist_outstanding_links', label: 'Outstanding Payment Links', render: () => <OutstandingLinksPanel kind="specrev" embedded /> },
                { key: 'specialist_held_payouts', label: 'Held - No Payout Account', render: () => <HeldPayoutsPanel engine="specrev" embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && !loading && canSeeTab('accounting') && accountingSection === 'specialist_license' && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · Specialists" title="VFO Specialist License Fees"
              maxWidth="1200px"
              tabs={[
                { key: 'specialist_license', label: 'VFO Specialist License Fees', render: () => <SpecialistLicensePanel allExperts={allExperts} embedded /> },
                { key: 'specialist_license_reconciliation', label: 'License Reconciliation', render: () => <SpecialistLicenseReconciliationPanel embedded /> },
                { key: 'specialist_license_outstanding', label: 'Outstanding Payment Links', render: () => <SpecialistLicenseOutstandingPanel embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && !loading && canSeeTab('accounting') && accountingSection === 'specialist_bg' && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · Specialists" title="VFO Specialist Background Checks"
              maxWidth="900px"
              tabs={[
                { key: 'specialist_bg', label: 'VFO Specialist Background Checks', render: () => <SpecialistBgPanel allExperts={allExperts} embedded /> },
                { key: 'specialist_bg_reconciliation', label: 'Background Check Reconciliation', render: () => <SpecialistBgReconciliationPanel embedded /> },
                { key: 'specialist_bg_outstanding', label: 'Outstanding Payment Links', render: () => <SpecialistBgOutstandingPanel embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && (accountingSection === 'holistic_revenue' || accountingSection === 'holistic_reconciliation' || accountingSection === 'holistic_held_payouts') && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · VFO Services" title="Holistic Planning"
              maxWidth="1150px" initialKey={accountingSection}
              tabs={[
                { key: 'holistic_revenue', label: 'Holistic Planning Revenue', render: () => <HolisticRevenuePanel embedded /> },
                { key: 'holistic_reconciliation', label: 'Holistic Planning Reconciliation', render: () => <HolisticReconciliationPanel embedded /> },
                { key: 'holistic_outstanding_links', label: 'Outstanding Payment Links', render: () => <OutstandingLinksPanel kind="map1" embedded /> },
                { key: 'holistic_held_payouts', label: 'Held - No Payout Account', render: () => <HeldPayoutsPanel engine="map1" embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && (accountingSection === 'tax_revenue' || accountingSection === 'tax_reconciliation' || accountingSection === 'tax_held_payouts') && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · VFO Services" title="Tax Planning"
              maxWidth="1150px" initialKey={accountingSection}
              tabs={[
                { key: 'tax_revenue', label: 'Tax Planning Revenue', render: () => <TaxRevenuePanel embedded /> },
                { key: 'tax_reconciliation', label: 'Tax Planning Reconciliation', render: () => <TaxReconciliationPanel embedded /> },
                { key: 'tax_outstanding_links', label: 'Outstanding Payment Links', render: () => <OutstandingLinksPanel kind="tax" embedded /> },
                { key: 'tax_held_payouts', label: 'Held - No Payout Account', render: () => <HeldPayoutsPanel engine="tax" embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && (accountingSection === 'pip_revenue' || accountingSection === 'pip_reconciliation' || accountingSection === 'pip_held_payouts') && (
            <AccountingCombinedPanel
              breadcrumb="Accounting · VFO Services" title="Additional PIP"
              maxWidth="1150px" initialKey={accountingSection}
              tabs={[
                { key: 'pip_revenue', label: 'Additional PIP Revenue', render: () => <PipRevenuePanel embedded /> },
                { key: 'pip_reconciliation', label: 'Additional PIP Reconciliation', render: () => <PipReconciliationPanel embedded /> },
                { key: 'pip_held_payouts', label: 'Held - No Payout Account', render: () => <HeldPayoutsPanel engine="pip" embedded /> },
              ]}
            />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'advisor_onboarding_fees' && (
            <MemberOnboardingPanel kind="advisor" title="Advisor Onboarding" />
          )}
          {activeTab === 'accounting' && !loading && canSeeTab('accounting') && accountingSection === 'advisor_membership_fees' && (
            <MembershipFeesPanel title="Advisor Membership Fees" category="advisor" allMembers={allMembers}
              isSuperadmin={canSeeTab('accounting')} initialMemberNumber={initialMemberNumber} />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'accountant_onboarding_fees' && (
            <MemberOnboardingPanel kind="accountant" title="Accountant Onboarding" />
          )}
          {activeTab === 'accounting' && !loading && canSeeTab('accounting') && accountingSection === 'accountant_membership_fees' && (
            <MembershipFeesPanel title="Accountant Membership Fees" category="accountant" allMembers={allMembers}
              isSuperadmin={canSeeTab('accounting')} initialMemberNumber={initialMemberNumber} />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'gc_accounting' && (
            <GrowthCreditsAccountingPanel />
          )}
          {activeTab === 'accounting' && canSeeTab('accounting') && accountingSection === 'mm_accounting' && (
            <MoneyMappingAccountingPanel />
          )}
          {activeTab === 'accounting' && (!canSeeTab('accounting') || !ACCOUNTING_SECTIONS.includes(accountingSection)) && (
            <div style={{ maxWidth: '620px', margin: '40px auto', padding: '22px 24px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', color: 'var(--vfo-muted)', fontSize: '13.5px', fontFamily: 'Inter, sans-serif' }}>
              You don't have access to this section.
            </div>
          )}

          {loading && viewNeedsLoadData && <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}><DirectoryListSkeleton /></div>}
          </div>
        </>
      )}
    </div>
  )
}
