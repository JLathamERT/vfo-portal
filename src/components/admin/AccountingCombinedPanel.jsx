import { useState } from 'react'
import { NAVY, BLUE } from './specialistRevenueShared'

// Accounting: a single tab that condenses several previously-separate panels
// (e.g. Revenue / Reconciliation / Recurring) behind a pill row, mirroring the
// Advisor Membership Fees layout — one breadcrumb + title, then pills that swap
// the content below. Each child panel is rendered with embedded=true so it drops
// its own breadcrumb + title (the wrapper owns the single heading).
//
// tabs: [{ key, label, render: () => <Panel embedded /> }]. Only the active tab
// is mounted (same swap-on-click behavior as the Membership Fees panel).
// initialKey preselects a pill (e.g. a deep link to a sub-view); falls back to
// the first tab.
//
// The chosen pill is remembered (PILL_KEY, "<title>|<key>") so leaving for a client,
// member or specialist profile and coming Back lands on the same pill. AdminPortal
// clears it whenever a section is picked from the menu or a deep link, so those
// still open on initialKey.
export const PILL_KEY = 'adminAccountingPill'

export default function AccountingCombinedPanel({ breadcrumb, title, initialKey, tabs, maxWidth = '1100px' }) {
  const [active, setActiveState] = useState(() => {
    let stored = null
    try {
      const s = sessionStorage.getItem(PILL_KEY)
      if (s && s.startsWith(title + '|')) stored = s.slice(title.length + 1)
    } catch { /* private mode */ }
    if (stored && tabs.some(t => t.key === stored)) return stored
    return tabs.some(t => t.key === initialKey) ? initialKey : tabs[0].key
  })
  const setActive = key => {
    setActiveState(key)
    try { sessionStorage.setItem(PILL_KEY, `${title}|${key}`) } catch { /* private mode */ }
  }
  const current = tabs.find(t => t.key === active) || tabs[0]

  return (
    <div style={{ padding: '24px', maxWidth, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>{breadcrumb}</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>{title}</h2>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} type="button"
            onClick={() => setActive(t.key)}
            style={{ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (active === t.key ? 'transparent' : 'var(--vfo-border-strong)'), background: active === t.key ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: active === t.key ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {t.label}
          </button>
        ))}
      </div>

      {current.render()}
    </div>
  )
}
