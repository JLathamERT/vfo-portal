// The Portal Backlog's departments and chip colours, in the old sheet's order.
// The backend validates against the same list in constants/portal-departments.ts
// (edge repo) — change both together.
export const PORTAL_DEPARTMENTS = [
  { name: 'Member Settings', color: '#E0E0E0' },
  { name: 'Onboarding', color: '#BFDDF5' },
  { name: 'MSM', color: '#F9C9A8' },
  { name: 'Holistic Planning', color: '#0F6B3E' },
  { name: 'Tax Planning', color: '#B00000' },
  { name: 'Partnership FT', color: '#0B5AB0' },
  { name: 'CIQ', color: '#1F5C6B' },
  { name: 'GCM', color: '#E1CDF0' },
  { name: 'Specialists', color: '#C7DDE0' },
  { name: 'Website / Plugin', color: '#FCE7A2' },
  { name: 'General Update', color: '#3A3A3A' },
]

const BY_NAME = Object.fromEntries(PORTAL_DEPARTMENTS.map((d) => [d.name, d]))

function isDark(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150
}

export function departmentChipStyle(name) {
  const color = BY_NAME[name]?.color || '#8a9bbd'
  return {
    display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '999px',
    fontSize: '12px', fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap',
    background: color, color: isDark(color) ? '#ffffff' : '#1d2a44',
  }
}
