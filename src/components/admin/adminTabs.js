// The admin tabs a superadmin turns on per admin in the Admin Editor. Every other
// admin tab is open to every admin (Jake, 2026-11-25). Keys must match the backend
// TAB_ACTIONS (constants/role-gates.ts), which is the real gate; this only decides
// what is drawn.
export const GATED_ADMIN_TABS = [
  { key: 'accounting', label: 'Accounting' },
  { key: 'automation', label: 'Automation & Config' },
  { key: 'sdp_atsg', label: 'SDP ATSG' },
  { key: 'feature_switches', label: 'Feature Switches' },
]

export const canSeeAdminTab = (session, key) =>
  !GATED_ADMIN_TABS.some(t => t.key === key) || !!session?.is_superadmin || (session?.allowed_tabs || []).includes(key)
