// The one program order (Jake, 2026-11-26), used everywhere programs are listed:
// the Programs dropdowns, both MSM Homes, the member's nav, a client's program tabs.
export const PROGRAM_ORDER = [
  'VFO Tax Planning',
  'VFO Holistic Planning',
  'Partnership Fast Track',
  'Tailored Route for Accountants',
  'Advanced Coaching',
  'Standard Coaching',
]

// A copy of `list` in that order; `nameOf` reads an item's program name. Names not
// in the list keep their place after the known ones.
export function sortPrograms(list, nameOf = p => p?.name) {
  const rank = p => { const i = PROGRAM_ORDER.indexOf(nameOf(p)); return i === -1 ? 999 : i }
  return [...(list || [])].sort((a, b) => rank(a) - rank(b))
}
