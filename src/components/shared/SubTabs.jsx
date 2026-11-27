import { useIsPhone } from '../../lib/useMediaQuery'

// The one sub-tab look (docs/HOUSE_STYLE.md, Jake 2026-11-27): the round pills
// along the top of a page, the active one navy-to-blue. Every page with sub-tabs
// draws them through here (AccountingCombinedPanel, the Section pages, the KPI
// pages, the Growth Plan). A profile's own tab bar is NOT this: it keeps its look.
//
// tabs: [{ key, label, phoneLabel? }]. `tablist` adds role="tab" / aria-selected
// for a page that owns tab panels; otherwise each pill reports aria-pressed.
// Phone: smaller pills, so a member page's three tabs sit on one row.
const NAVY = '#002973'
const BLUE = '#125ecc'

export function subTabStyle(on, isPhone = false) {
  return {
    padding: isPhone ? '6px 12px' : '8px 16px', borderRadius: '99px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    fontSize: isPhone ? '12px' : '13px', fontWeight: 700, whiteSpace: 'nowrap',
    border: '1px solid ' + (on ? 'transparent' : 'var(--vfo-border-strong)'),
    background: on ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)',
    color: on ? '#fff' : 'var(--vfo-ink-2)',
  }
}

export default function SubTabs({ tabs, active, onChange, tablist = false, style }) {
  const isPhone = useIsPhone()
  return (
    <div role={tablist ? 'tablist' : undefined} style={{ display: 'flex', gap: isPhone ? '6px' : '8px', flexWrap: 'wrap', marginBottom: '18px', ...style }}>
      {tabs.map(t => {
        const on = active === t.key
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            {...(tablist ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on })}
            style={subTabStyle(on, isPhone)}>
            {isPhone && t.phoneLabel ? t.phoneLabel : t.label}
          </button>
        )
      })}
    </div>
  )
}

// The second level: rectangular 8px-corner tabs inside a sub-tab, or a status
// filter with counts ("By specialist / By member" on VFO Specialist Revenue).
export function miniTabStyle(on) {
  return {
    padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap',
    border: `1px solid ${on ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`,
    background: on ? 'rgba(18,94,204,0.08)' : 'var(--vfo-card)',
    color: on ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)',
  }
}

// `children` sit at the end of the row (a one-line hint, a count).
export function MiniTabs({ tabs, active, onChange, style, children }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px', ...style }}>
      {tabs.map(t => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)} aria-pressed={active === t.key} style={miniTabStyle(active === t.key)}>
          {t.label}
        </button>
      ))}
      {children}
    </div>
  )
}
