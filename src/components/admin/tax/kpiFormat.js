// Shared by the per-plan Tax Plan KPI Tracker (TaxPlanKpiPanel) and the Tax
// Planning KPI Summary sub-tabs: status tones and the money format.

export { KPI_TONES as TONES } from '../KpiKit'

export function fmtKpiMoney(v) {
  const n = Number(v)
  if (v === null || v === undefined || !Number.isFinite(n)) return '$0'
  const cents = Math.round(n * 100) % 100 !== 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}
