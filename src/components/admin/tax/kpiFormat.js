// Shared by the per-plan Tax Plan KPI Tracker (TaxPlanKpiPanel) and the Tax
// Planning KPI Summary sub-tabs: status tones and the money format.

export const TONES = {
  green: { bg: 'rgba(27,146,84,0.13)', color: 'var(--vfo-success-text)', rail: '#1b9254' },
  amber: { bg: 'rgba(224,103,23,0.14)', color: '#e06717', rail: '#e06717' },
  grey: { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)', rail: 'var(--vfo-border-strong)' },
  red: { bg: 'rgba(231,76,60,0.13)', color: '#e74c3c', rail: '#e74c3c' },
}

export function fmtKpiMoney(v) {
  const n = Number(v)
  if (v === null || v === undefined || !Number.isFinite(n)) return '$0'
  const cents = Math.round(n * 100) % 100 !== 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}
