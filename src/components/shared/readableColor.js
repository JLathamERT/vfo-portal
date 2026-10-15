// Text colour for a chip whose fill/border is built from the same hex
// (`${hex}22`): the dark brand hexes are unreadable on navy, so they map to
// theme tokens that hold the identical value in light mode.
const TOKENS = {
  '#125ecc': 'var(--vfo-accent-text)',
  '#1b9254': 'var(--vfo-success-text)',
  '#16a34a': 'var(--vfo-success-text-2)',
}

export const readable = (c) => TOKENS[String(c || '').toLowerCase()] || c
