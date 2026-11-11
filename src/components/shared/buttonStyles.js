// The house set of small in-card buttons (2026-11-11): one size and shape for every
// action inside a card, so a card's add / save / edit / remove buttons line up.
// Primary = the portal's blue gradient; secondary = grey outline (Edit, Cancel, No);
// danger = red outline (Remove, Stop mirroring). The transparent border on primary
// keeps all three the same height side by side.
const base = {
  padding: '7px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, lineHeight: 1.2,
  fontFamily: 'Inter, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
}

export const btnPrimary = { ...base, background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: '1px solid transparent', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff' }
export const btnSecondary = { ...base, background: 'transparent', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-muted)' }
export const btnDanger = { ...base, background: 'transparent', border: '1px solid rgba(231,76,60,0.35)', color: '#e74c3c' }

// Any of the three, greyed while it cannot be pressed.
export function btnState(style, disabled) {
  return disabled ? { ...style, opacity: 0.55, cursor: 'not-allowed', boxShadow: 'none' } : style
}
