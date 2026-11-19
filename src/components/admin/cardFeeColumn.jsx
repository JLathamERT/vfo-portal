// The Accounting Card fee column (Jake 2026-11-19): every money table shows the main
// figure in Amount and the card processing fee in its own column — the fee, or an
// empty dash for a bank payment, a check, a waived fee or a row not paid yet. The
// totals row adds the two columns up separately.
export const CARD_FEE_COL = '96px'

// Its own formatter (the house $1,234.56), so the shared Specialist Revenue module
// can import this file without an import cycle.
const money = n => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const CARD_FEE_LABEL = 'Card fee'

export function CardFeeCell({ fee, style }) {
  const n = Number(fee) || 0
  return n > 0
    ? <span style={{ fontSize: '12.5px', color: 'var(--vfo-ink-2, var(--vfo-ink))', ...style }}>{money(n)}</span>
    : <span style={{ color: 'var(--vfo-faint)', ...style }}>—</span>
}

/** Sum of a list's fees, to the cent. */
export function sumFees(list, get) {
  return Math.round((list || []).reduce((s, x) => s + (Number(get(x)) || 0), 0) * 100) / 100
}
