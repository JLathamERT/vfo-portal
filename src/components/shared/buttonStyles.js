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

// A row's own action in a list or table (Done, Clear, Re-send): solid white, so it
// stands out on a tinted row. BTN_SMALL is spread after any of them in a tight space.
export const btnOutline = { ...base, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', color: 'var(--vfo-accent-text)' }
export const BTN_SMALL = { padding: '4px 11px', fontSize: '11.5px', borderRadius: '7px' }

// The small button on a step row of a tracker (Edit, Re-send agreement).
export const btnStep = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', lineHeight: 1.2, fontFamily: 'Inter, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }

// Any of them, greyed while it cannot be pressed.
export function btnState(style, disabled) {
  return disabled ? { ...style, opacity: 0.55, cursor: 'not-allowed', boxShadow: 'none' } : style
}
