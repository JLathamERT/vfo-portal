import { useEffect, useState, useRef } from 'react'
import CollapsibleNavBar from '../shared/CollapsibleNavBar'

// The admin nav bar (Advisors ▾ … More ▾), moved out of AdminPortal.jsx on
// 2026-10-20 so the client page draws the very same bar. AdminPortal routes a
// pick to its own section setters; any other page calls openAdminSection() and
// navigates to /admin, which restores the pick from sessionStorage at mount.
// onSelect(tab, section): tab is the AdminPortal activeTab key, section the
// sub-section key (null for the single-screen More tabs).

// A dropdown row that, on hover, flies out a submenu of options to the right.
// An option carrying its own `submenu` nests another flyout (More ▸ Accounting ▸
// Members ▸ …).
// Hover intent for one menu level, so a diagonal move toward an open flyout
// may cross sibling rows (or briefly leave the menu) without losing it: with a
// flyout open, a sibling takes over only after the pointer rests on it, and
// leaving the level closes it only after a grace period.
const FLYOUT_SWITCH_MS = 250
const FLYOUT_CLOSE_MS = 400

function useFlyoutLevel() {
  const [active, setActive] = useState(null)
  const activeRef = useRef(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const set = (key) => { activeRef.current = key; setActive(key) }
  return {
    active,
    enter(key) {
      clearTimeout(timer.current)
      if (activeRef.current === null || activeRef.current === key) set(key)
      else timer.current = setTimeout(() => set(key), FLYOUT_SWITCH_MS)
    },
    leave() {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => set(null), FLYOUT_CLOSE_MS)
    },
    reset() {
      clearTimeout(timer.current)
      set(null)
    },
  }
}

function SubmenuRow({ label, options, onSelect, open, onEnter }) {
  const level = useFlyoutLevel()
  return (
    <div style={{ position: 'relative' }} onMouseEnter={onEnter}>
      <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', padding: '8px 20px', background: open ? 'var(--vfo-tint)' : 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▸</span>
      </button>
      {open && (
        <div onMouseLeave={level.leave} style={{ position: 'absolute', top: '-4px', left: '100%', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '210px', zIndex: 210, paddingTop: '4px', paddingBottom: '4px', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => opt.submenu ? (
            <SubmenuRow key={opt.key} label={opt.label} options={opt.submenu} onSelect={onSelect}
              open={level.active === opt.key} onEnter={() => level.enter(opt.key)} />
          ) : (
            <button key={opt.key} onClick={() => onSelect(opt.key)}
              style={{ display: 'block', width: '100%', padding: '8px 20px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)'; level.enter(opt.key) }}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NavDropdown({ label, items, onSelect, isActive, muted = false }) {
  const [open, setOpen] = useState(false)
  // The top-level menu closes the moment the pointer leaves it, so sweeping
  // across the nav bar never stacks menus; only the flyouts inside get the
  // hover-intent grace (useFlyoutLevel).
  const level = useFlyoutLevel()

  function handleMouseEnter() {
    setOpen(true)
  }

  function closeNow() {
    setOpen(false)
    level.reset()
  }
  const handleMouseLeave = closeNow

  // Key tabs (default) read as primary — larger, bolder, darker. Muted "other"
  // tabs (Accounting / Automation) are visually secondary.
  const btnStyle = muted ? {
    padding: '14px 14px', background: 'transparent', border: 'none',
    borderBottom: isActive ? '2px solid var(--vfo-primary)' : '2px solid transparent',
    color: isActive ? 'var(--vfo-nav-active)' : 'var(--vfo-nav-muted)', fontSize: '13px',
    fontWeight: isActive ? '600' : '500', cursor: 'pointer',
    fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', gap: '6px'
  } : {
    padding: '15px 20px', background: 'transparent', border: 'none',
    borderBottom: isActive ? '2px solid var(--vfo-primary)' : '2px solid transparent',
    color: isActive ? 'var(--vfo-nav-active)' : 'var(--vfo-ink)', fontSize: '14.5px',
    fontWeight: isActive ? '700' : '600', cursor: 'pointer',
    fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', gap: '6px'
  }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={btnStyle}>
        {label}
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '180px', zIndex: 200, paddingTop: '4px', paddingBottom: '4px', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {items.map(item => (
            <div key={item.key}>
              {item.submenu && (
                <SubmenuRow label={item.submenuLabel} options={item.submenu} onSelect={(k) => { onSelect(k); closeNow() }}
                  open={level.active === item.key} onEnter={() => level.enter(item.key)} />
              )}
              {item.header && (
                <div style={{ padding: '8px 16px 4px', fontSize: '10px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.header}</div>
              )}
              {item.options && item.options.map(opt => (
                <button key={opt.key} onClick={() => { onSelect(opt.key); closeNow() }}
                  style={{ display: 'block', width: '100%', padding: '8px 20px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)'; level.enter(opt.key) }}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const advisorsDropdownItems = [
  {
    key: 'advisors', header: null,
    options: [
      { key: 'advisor_search', label: 'Advisor Search' },
      { key: 'advisor_kpis', label: 'Advisor KPIs' },
      { key: 'add_advisor', label: 'Add Advisor' },
      { key: 'advisor_onboarding', label: 'Advisor Onboarding' },
    ]
  },
]

const accountantsDropdownItems = [
  {
    key: 'accountants', header: null,
    options: [
      { key: 'accountant_search', label: 'Accountant Search' },
      { key: 'accountant_kpis', label: 'Accountant KPIs' },
      { key: 'add_accountant', label: 'Add Accountant' },
      { key: 'accountant_onboarding', label: 'Accountant Onboarding' },
    ]
  },
]

const strategicDropdownItems = [
  {
    key: 'strategic', header: null,
    options: [
      { key: 'strategic_member_search', label: 'Strategic Member Search' },
      { key: 'strategic_member_kpis', label: 'Strategic Member KPIs' },
      { key: 'strategic_partners', label: 'Strategic Partners' },
      { key: 'add_strategic_member', label: 'Add Strategic Member' },
    ]
  },
]

const specialistsDropdownItems = [
  {
    key: 'specialists', header: null,
    options: [
      { key: 'specialist_search', label: 'Specialist Search' },
      { key: 'specialist_kpis', label: 'Specialist KPIs' },
      { key: 'add_specialist', label: 'Add Specialist' },
      { key: 'specialist_onboarding', label: 'Specialist Onboarding' },
      { key: 'specialist_showroom', label: 'Showroom' },
    ]
  },
]

const taxPlannersDropdownItems = [
  {
    key: 'taxplanners', header: null,
    options: [
      { key: 'tax_planner_search', label: 'Tax Planner Search' },
      { key: 'tax_planner_kpis', label: 'Tax Planner KPIs' },
      { key: 'tax_planning_partners', label: 'Tax Planning Partners' },
      { key: 'add_tax_planner', label: 'Add Tax Planner' },
    ]
  },
]

const automationOptions = [
  { key: 'map1_pipeline', label: 'Holistic Planning - MAP 1' },
  { key: 'tax_pipeline', label: 'Holistic Planning - Tax Priorities' },
  { key: 'pip_pipeline', label: 'Holistic Planning - PIP Meetings' },
  { key: 'standalone_tax_pipeline', label: 'Tax Planning' },
  { key: 'advisor_pipeline', label: 'Advisor Onboarding' },
  { key: 'accountant_pipeline', label: 'Accountant Onboarding' },
  { key: 'pft_pipeline', label: 'Partnership Fast Track' },
  { key: 'specialist_pipeline', label: 'Specialist Onboarding' },
  { key: 'specialist_revenue_pipeline', label: 'VFO Specialist Revenue' },
  { key: 'growth_credits', label: 'Growth Credits' },
  { key: 'email_templates', label: 'Email Templates' },
  { key: 'notification_editor', label: 'Notification Editor' },
]

const accountingSubmenus = [
  {
    key: 'accounting_members',
    submenuLabel: 'Members',
    submenu: [
      { key: 'advisor_onboarding_fees', label: 'Advisor Onboarding' },
      { key: 'advisor_membership_fees', label: 'Advisor Membership Fees' },
      { key: 'accountant_onboarding_fees', label: 'Accountant Onboarding' },
      { key: 'accountant_membership_fees', label: 'Accountant Membership Fees' },
      { key: 'gc_accounting', label: 'Growth Credits' },
      { key: 'mm_accounting', label: 'Money Mapping' },
    ],
  },
  {
    key: 'accounting_vfo_services',
    submenuLabel: 'VFO Services',
    submenu: [
      { key: 'holistic_revenue', label: 'Holistic Planning' },
      { key: 'tax_revenue', label: 'Tax Planning' },
      { key: 'pip_revenue', label: 'Additional PIP' },
    ],
  },
  {
    key: 'accounting_specialists',
    submenuLabel: 'Specialists',
    submenu: [
      { key: 'specialist_revenue', label: 'VFO Specialist Revenue' },
      { key: 'specialist_license', label: 'VFO Specialist License Fees' },
      { key: 'specialist_bg', label: 'VFO Specialist Background Checks' },
    ],
  },
]

const MORE_TABS = ['member_overview', 'client_overview', 'growth_credits', 'faq_editor', 'tax_diagnostics', 'feature_switches', 'automation', 'accounting']

// The five key tabs, for the narrow-window menu and its current-tab label.
const KEY_TABS = [
  ['advisors', 'Advisors', advisorsDropdownItems],
  ['accountants', 'Accountants', accountantsDropdownItems],
  ['strategic', 'Strategic Members', strategicDropdownItems],
  ['specialists', 'Specialists', specialistsDropdownItems],
  ['taxplanners', 'Tax Planners', taxPlannersDropdownItems],
]
const ADMIN_TAB_LABELS = {
  ...Object.fromEntries(KEY_TABS.map(([key, label]) => [key, label])),
  member_overview: 'Member Overview', client_overview: 'Client Overview', growth_credits: 'Growth Credits',
  faq_editor: 'FAQ Editor', tax_diagnostics: 'Tax Diagnostics', feature_switches: 'Feature Switches',
  automation: 'Automation & Config', accounting: 'Accounting',
}

// The three superadmin-managed "other" tabs. A non-superadmin admin sees one only
// if Jake granted it (session.allowed_tabs). Superadmin sees all.
export const canSeeAdminTab = (session, key) => !!session?.is_superadmin || (session?.allowed_tabs || []).includes(key)

export default function AdminNavBar({ session, activeTab, onSelect }) {
  const canSeeTab = (key) => canSeeAdminTab(session, key)
  // The grantable "other" tabs always sit in one More ▾ menu (2026-09-26 — was a
  // row of tabs on wide screens), whatever mix a given admin is granted.
  // Keys are prefixed so one onSelect can route back to the right section.
  const moreDropdownItems = [
    ...(canSeeTab('member_overview') ? [{ key: 'more_mo', options: [{ key: '__member_overview', label: 'Member Overview' }] }] : []),
    ...(canSeeTab('client_overview') ? [{ key: 'more_co', options: [{ key: '__client_overview', label: 'Client Overview' }] }] : []),
    ...(canSeeTab('growth_credits') ? [{ key: 'more_gc', options: [{ key: '__growth_credits', label: 'Growth Credits' }] }] : []),
    ...(canSeeTab('faq_editor') ? [{ key: 'more_faq', options: [{ key: '__faq_editor', label: 'FAQ Editor' }] }] : []),
    ...(canSeeTab('tax_diagnostics') ? [{ key: 'more_diag', options: [{ key: '__tax_diagnostics', label: 'Tax Diagnostics' }] }] : []),
    // Superadmin only, never grantable (feature_switches_* are SUPERADMIN_ONLY_ACTIONS).
    ...(session?.is_superadmin ? [{ key: 'more_switches', options: [{ key: '__feature_switches', label: 'Feature Switches' }] }] : []),
    // The two tabs with their own sub-options open sideways on hover instead of
    // listing every option inline.
    ...(canSeeTab('automation') ? [{
      key: 'more_auto', submenuLabel: 'Automation & Config',
      submenu: automationOptions.map(o => ({ ...o, key: 'auto:' + o.key })),
    }] : []),
    ...(canSeeTab('accounting') ? [{
      key: 'more_acct', submenuLabel: 'Accounting',
      submenu: [
        { key: 'acct:payments', label: 'Payments' },
        { key: 'acct:manual_connect_payment', label: 'Manually sent Stripe Connect Payment' },
        ...accountingSubmenus.map(item => ({ key: 'more_' + item.key, label: item.submenuLabel, submenu: item.submenu.map(o => ({ ...o, key: 'acct:' + o.key })) })),
      ],
    }] : []),
  ]
  function selectMoreOption(key) {
    if (key.startsWith('auto:')) return onSelect('automation', key.slice(5))
    if (key.startsWith('acct:')) return onSelect('accounting', key.slice(5))
    if (key.startsWith('__')) return onSelect(key.slice(2), null)
  }

  // The same entries as the dropdowns, for the narrow-window menu. The admin bar
  // knows the tab but not the section, so a key tab's whole group is marked.
  const moreOption = opt => opt.submenu
    ? { key: opt.key, label: opt.label, options: opt.submenu.map(moreOption) }
    : { key: opt.key, label: opt.label, active: opt.key === '__' + activeTab, onSelect: () => selectMoreOption(opt.key) }
  const menuItems = [
    ...KEY_TABS.map(([tab, label, dropdownItems]) => ({
      key: tab, label, active: activeTab === tab,
      options: dropdownItems.flatMap(item => item.options).map(o => ({ key: o.key, label: o.label, onSelect: () => onSelect(tab, o.key) })),
    })),
    ...(moreDropdownItems.length > 0 ? [{
      key: 'more', label: 'More',
      options: moreDropdownItems.flatMap(item => item.submenu
        ? [{ key: item.key, label: item.submenuLabel, active: activeTab === (item.key === 'more_auto' ? 'automation' : 'accounting'), options: item.submenu.map(moreOption) }]
        : item.options.map(moreOption)),
    }] : []),
  ]

  return (
    <CollapsibleNavBar items={menuItems} currentLabel={ADMIN_TAB_LABELS[activeTab]}
      barStyle={{ boxShadow: '0 2px 8px rgba(20,45,95,0.04)' }} rowStyle={{ alignItems: 'center' }}>
      {/* Key tabs — the five primary member/specialist directories. */}
      {KEY_TABS.map(([tab, label, dropdownItems]) => (
        <NavDropdown key={tab} label={label} items={dropdownItems} onSelect={k => onSelect(tab, k)} isActive={activeTab === tab} />
      ))}

      {/* Secondary "other" tabs — muted, access-gated, behind a faint divider. */}
      {moreDropdownItems.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', paddingLeft: '12px', borderLeft: '1px solid var(--vfo-tint)' }}>
          <NavDropdown label="More" muted items={moreDropdownItems} onSelect={selectMoreOption} isActive={MORE_TABS.includes(activeTab)} />
        </div>
      )}
    </CollapsibleNavBar>
  )
}

// For a page OUTSIDE AdminPortal (the client page): record a nav pick exactly as
// AdminPortal's own select*Section functions do, so /admin opens on it at mount
// on that section's list, never a member profile left open earlier. The caller
// then navigates to /admin.
const SECTION_KEYS = {
  advisors: 'adminAdvisorsSection', accountants: 'adminAccountantsSection', strategic: 'adminStrategicSection',
  specialists: 'adminSpecialistsSection', taxplanners: 'adminTaxPlannersSection',
  automation: 'adminAutomationSection', accounting: 'adminAccountingSection',
}
export function openAdminSection(tab, section) {
  try {
    sessionStorage.setItem('adminActiveTab', tab)
    if (section && SECTION_KEYS[tab]) sessionStorage.setItem(SECTION_KEYS[tab], section)
    ;['adminSelectedMember', 'adminMemberFeatureTab', 'adminSelectedAccountant', 'adminAccountantFeatureTab',
      'adminSelectedStrategicMember', 'adminStrategicFeatureTab', 'adminOpenView'].forEach(k => sessionStorage.removeItem(k))
    // AccountingCombinedPanel PILL_KEY / ClientOverviewPanel CLIENT_OVERVIEW_SECTION_KEY
    // (literal here so this small module does not pull those panels into the
    // client page's chunk).
    if (tab === 'accounting') sessionStorage.removeItem('adminAccountingPill')
    if (tab === 'client_overview') sessionStorage.removeItem('clientOverviewSection')
  } catch { /* private mode */ }
}
