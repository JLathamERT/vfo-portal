import { useEffect, useState } from 'react'
import CollapsibleNavBar from '../shared/CollapsibleNavBar'
import { getSession, loadCachedAction } from '../../lib/api'

// The tax planner portal's tab bar, shared by TaxPlannerPortal and the planner's
// client page (2026-10-20) so the bar is identical on both.
export const PLANNER_TABS = [['planning', 'Tax Planning']]

// SDP - Advanced Tax Strategy Governance (2026-11-17): only the planners and
// team members of a group running ATSG (the server decides, sdp_atsg_access_load).
const ATSG_TAB = ['sdp_atsg', 'SDP - Advanced Tax Strategy Governance']
// The last answer, keyed to the session token so a different login never sees it.
let atsgKnown = { token: null, enabled: null }

export default function PlannerNavBar({ activeTab, onSelect }) {
  const token = getSession()?.token || null
  const [atsg, setAtsg] = useState(atsgKnown.token === token ? atsgKnown.enabled : null)
  useEffect(() => {
    let live = true
    loadCachedAction('sdp_atsg_access_load').then(d => { atsgKnown = { token, enabled: !!d?.enabled }; if (live) setAtsg(atsgKnown.enabled) }).catch(() => {})
    return () => { live = false }
  }, [])
  const tabs = atsg ? [...PLANNER_TABS, ATSG_TAB] : PLANNER_TABS
  const menuItems = tabs.map(([key, label]) => ({ key, label, active: activeTab === key, onSelect: () => onSelect(key) }))
  return (
    <CollapsibleNavBar items={menuItems} currentLabel={Object.fromEntries(tabs)[activeTab]}>
      {tabs.map(([key, label]) => (
        <button key={key} onClick={() => onSelect(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === key ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: activeTab === key ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: activeTab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{label}</button>
      ))}
    </CollapsibleNavBar>
  )
}
