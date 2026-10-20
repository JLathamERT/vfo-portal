// The tax planner portal's tab bar, shared by TaxPlannerPortal and the planner's
// client page (2026-10-20) so the bar is identical on both.
export const PLANNER_TABS = [['planning', 'Tax Planning']]

export default function PlannerNavBar({ activeTab, onSelect }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)' }}>
      {PLANNER_TABS.map(([key, label]) => (
        <button key={key} onClick={() => onSelect(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === key ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: activeTab === key ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: activeTab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
      ))}
    </div>
  )
}
