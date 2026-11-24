// Shared bits for the Tax Planning KPI Summary sub-tabs (Tax Planner KPIs).
// Every figure is computed by tax_plan_kpi_summary_load; these only format.

// % passed colours on the step tiles (spec Behaviour 11; still open for Jake).
export const PASS_GREEN_FROM = 70
export const PASS_AMBER_FROM = 40
// A Success Formula row with fewer cases than this is muted ("low n").
export const LOW_N = 3

export const RAG = {
  green: { text: 'var(--vfo-success-text)', bg: 'rgba(27,146,84,0.12)', rail: '#1b9254' },
  amber: { text: '#a86200', bg: 'rgba(217,138,0,0.14)', rail: '#d98a00' },
  red: { text: '#c0392b', bg: 'rgba(231,76,60,0.12)', rail: '#e74c3c' },
  none: { text: 'var(--vfo-muted)', bg: 'var(--vfo-tint)', rail: 'var(--vfo-border-strong)' },
}
export const ragFor = (p) => (p === null || p === undefined ? 'none' : p >= PASS_GREEN_FROM ? 'green' : p >= PASS_AMBER_FROM ? 'amber' : 'red')

export const fmtPct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`)
export const fmtDays = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)} d`)

// Status dot colours in the step table: a Yes is green, waiting amber, a stop red.
const DOT = { green: '#1b9254', amber: '#d98a00', red: '#e74c3c', grey: '#8a9bbd' }
export function statusTone(status) {
  if (status === 'Stop' || status === 'Completed – No') return 'red'
  if (status === 'Not Decided') return 'grey'
  if (status === 'Still in Process' || status === 'Pending') return 'amber'
  return 'green'
}
export function StatusDot({ status }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px', background: DOT[statusTone(status)], flexShrink: 0 }} />
}

export const card = {
  background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px',
  boxShadow: 'var(--vfo-shadow-card)',
}
export const cardTitle = { fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--vfo-ink)' }
export const heroGradient = 'linear-gradient(120deg, #002973 0%, #0a3f9e 48%, #125ecc 100%)'
export const thStyle = { padding: '8px 12px', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', background: 'var(--vfo-tint)', borderBottom: '1px solid var(--vfo-border-soft)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 }
export const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
export const footNote = { padding: '10px 16px', borderTop: '1px solid var(--vfo-border-soft)', fontSize: '11.5px', color: 'var(--vfo-muted)', display: 'flex', gap: '18px', flexWrap: 'wrap' }
