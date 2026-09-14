// Frontend mirror of actions/faq/wistia.ts (edge). The backend resolves ANY
// Wistia link (including /s/<share-token> links, via Wistia's oEmbed) and
// stores the iframe form; this copy only exists so the FAQ Editor can flag a
// non-Wistia host inline and preview the shapes that carry the media id in
// the URL itself. A share link previews only after it is saved.

const WISTIA_IFRAME_BASE = 'https://fast.wistia.net/embed/iframe/'

export function isWistiaLink(raw) {
  return /^https?:\/\/[a-z0-9.-]*wistia\.(com|net)\//i.test(String(raw || '').trim())
}

export function wistiaMediaId(raw) {
  const s = String(raw || '').trim()
  if (!isWistiaLink(s)) return null
  const m =
    s.match(/\/medias\/([a-z0-9]{10})(?:[/.?#]|$)/i) ||
    s.match(/\/embed\/iframe\/([a-z0-9]{10})(?:[/.?#]|$)/i) ||
    s.match(/[?&]wvideo=([a-z0-9]{10})(?:[&#]|$)/i)
  return m ? m[1].toLowerCase() : null
}

export function wistiaEmbedUrl(raw) {
  const id = wistiaMediaId(raw)
  return id ? WISTIA_IFRAME_BASE + id : null
}
