// Read-only resolver for a specialist's per-ecosystem "Details & Benefits"
// write-up, for surfaces that DISPLAY it (the showroom modal). It mirrors the
// admin editor's `entriesFor` fallback chain in SpecialistsPanel.jsx — an array
// of { ecosystem, ... } rows first, then a { "<eco>": {...} } map, then the
// legacy flat D&B_* columns on the experts row itself. The admin editor is what
// WRITES these three shapes, so the two must stay in step.
export const DB_FIELDS = [
  ['D&B_strategy_expertise', 'Strategy / Expertise'],
  ['D&B_cutoff_date', 'Cut-off Date for Strategy'],
  ['D&B_client_requirements', 'Client Requirements'],
  ['D&B_investment_cost', 'Amount of Investment or Cost'],
  ['D&B_ideal_client', 'Ideal Client Description'],
  ['D&B_summary_benefits', 'Summary of Benefits'],
  ['D&B_getting_started', 'Getting Started with a Client'],
  ['D&B_professional_process', 'Steps of Professional Process'],
  ['D&B_competitive_advantage', 'What Makes Them Better Than the Competition'],
]

// Kept out of DB_FIELDS on purpose: revenue share is rendered as its own
// section and is shown to admins and members only. It is also stripped from the
// client and specialist showroom payloads server-side, so this key is normally
// absent there — the display gate is the belt, the payload strip is the braces.
export const REVENUE_SHARE_KEY = 'D&B_revenue_share'

const KEYS = [...DB_FIELDS.map(([k]) => k), REVENUE_SHARE_KEY]

function pick(src) {
  const out = {}
  KEYS.forEach(k => { out[k] = (src && src[k]) || '' })
  return out
}

const hasAny = content => KEYS.some(k => String(content[k] || '').trim() !== '')

// One entry per ecosystem the specialist serves, with empty ones dropped.
// Returns [] when there is nothing to show — callers use that to hide the
// button entirely rather than opening onto a blank panel.
export function detailEntries(expert, categories = []) {
  const stored = expert && expert.ecosystem_content
  const names = [...new Set(categories || [])]
  let entries
  if (Array.isArray(stored)) {
    entries = stored.filter(i => i && i.ecosystem).map(i => ({ eco: i.ecosystem, content: pick(i) }))
  } else if (stored && typeof stored === 'object') {
    entries = names.map(eco => ({ eco, content: pick(stored[eco]) }))
  } else {
    entries = names.map((eco, i) => ({ eco, content: i === 0 ? pick(expert) : pick(null) }))
  }
  if (entries.length === 0) entries = [{ eco: '', content: pick(expert) }]
  return entries.filter(en => hasAny(en.content))
}

// Chip label for an entry — bare ecosystem name, or "<eco> #n" when the
// specialist has more than one entry in that same ecosystem.
export function entryLabel(entries, idx) {
  const eco = entries[idx].eco || 'Details'
  const same = entries.filter(en => en.eco === entries[idx].eco)
  if (same.length <= 1) return eco
  const n = entries.slice(0, idx + 1).filter(en => en.eco === entries[idx].eco).length
  return `${eco} #${n}`
}
