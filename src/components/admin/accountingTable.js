// The Accounting money table (HOUSE_STYLE §5): one copy of the model page's chrome
// (Accounting > Specialists > VFO Specialist Revenue), imported by every Accounting
// panel instead of typed out again. The card carries tabular figures, so every amount
// in a table lines up digit for digit.
//
// Layout: the card (tableStyle), the header row (headerRowStyle), the totals row
// straight under it (totalsRowStyle, its label + the period as a sub-line), then the
// rows (rowStyle). Columns: who, date, the amounts, Card fee, status last.

export const tableStyle = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)', fontVariantNumeric: 'tabular-nums' }
export const headerRowStyle = { display: 'grid', gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
export const totalsRowStyle = { display: 'grid', gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }
export const totalsLabelStyle = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
export const totalsSubStyle = { display: 'block', fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.4px', color: 'var(--vfo-faint)', textTransform: 'none' }
export const rowStyle = { display: 'grid', gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }
export const emptyRowStyle = { textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '13px' }
export const footnoteStyle = { fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }
export const right = { textAlign: 'right' }

// A table's inner detail list (the rows under an opened line): its own small header,
// money right-aligned, the totals line straight under the header.
export const innerHeaderStyle = { display: 'grid', gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }
export const innerTotalsStyle = { display: 'grid', gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '12.5px', fontWeight: 700, color: 'var(--vfo-heading)' }
export const innerRowStyle = { display: 'grid', gap: '10px', alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)' }

// Above the table: the period <select>s and Refresh.
export const toolbarStyle = { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }
export const selectStyle = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
export const refreshBtnStyle = { ...selectStyle, color: 'var(--vfo-accent-text)', fontWeight: 600 }

// A list of cards with nothing in it, and the red banner for a failed load.
export const emptyCardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }
export const errorStyle = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const periodLabelOf = (year, month) => (month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`)
