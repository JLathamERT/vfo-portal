import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { callApi, getSession } from '../../lib/api'
import { wistiaEmbedUrl } from '../shared/wistia'

// The member portal Help button: a fixed blue circle bottom-right on every
// /member page (mounted once from App.jsx via MemberHelpMount, so it follows
// the member across the portal, client detail, settings — everything). Opens
// a panel with a search box and ONE list of FAQs, grouped under the admin's
// categories (a question may carry text, a Wistia video, a PDF or any mix),
// fed by faq_load (active rows only, ordered by the FAQ Editor's sort_order).
//
// Search is client-side: the list is small and loaded once per session, and
// the box filters on question + answer text. A document renders small inside
// the panel and can be expanded to a full-screen overlay, like a video's own
// fullscreen control.

export function MemberHelpMount() {
  const { pathname } = useLocation()
  const session = getSession()
  const onMemberPage = pathname.startsWith('/member') && pathname !== '/member/login'
  if (!onMemberPage || session?.role !== 'member') return null
  return <MemberHelpButton />
}

const UNCATEGORISED = { id: null, name: 'Other questions' }

export default function MemberHelpButton() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)      // null = not loaded yet
  const [categories, setCategories] = useState([])
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [fullDoc, setFullDoc] = useState(null)   // { url, name } shown full-screen
  const [narrow, setNarrow] = useState(() => window.innerWidth < 560)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 560)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open) return
    // Escape closes the full-screen document first, then the panel.
    const onKey = (e) => { if (e.key === 'Escape') { if (fullDoc) setFullDoc(null); else setOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fullDoc])

  useEffect(() => {
    if (!open || items !== null) return
    let cancelled = false
    callApi('faq_load')
      .then(data => { if (!cancelled) { setItems(data.items || []); setCategories(data.categories || []) } })
      .catch(e => { if (!cancelled) { setItems([]); setLoadError(e.message) } })
    return () => { cancelled = true }
  }, [open, items])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    const all = items || []
    if (!q) return all
    return all.filter(i => (i.question || '').toLowerCase().includes(q) || (i.answer || '').toLowerCase().includes(q))
  }, [items, q])

  // FAQs group under the admin's categories (in their order); anything without
  // one sits last. A group with no
  // matching rows is skipped, so a search never shows an empty heading.
  const groups = useMemo(() => {
    if (categories.length === 0) return [{ ...UNCATEGORISED, name: null, rows: filtered }]
    const byCat = new Map()
    for (const c of categories) byCat.set(c.id, { ...c, rows: [] })
    const other = { ...UNCATEGORISED, rows: [] }
    for (const row of filtered) {
      const g = row.category_id != null ? byCat.get(row.category_id) : null
      ;(g || other).rows.push(row)
    }
    return [...byCat.values(), other].filter(g => g.rows.length > 0)
  }, [categories, filtered])


  function toggle(id) { setExpandedId(expandedId === id ? null : id) }

  const fabStyle = {
    position: 'fixed', right: '24px', bottom: '24px', zIndex: 900,
    width: '56px', height: '56px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff',
    boxShadow: '0 6px 20px rgba(18,94,204,0.40)', fontSize: open ? '22px' : '26px', fontWeight: 700,
    fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
  }

  const panelStyle = narrow
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, top: 'auto', zIndex: 899, maxHeight: '85vh', borderRadius: '16px 16px 0 0' }
    : { position: 'fixed', right: '24px', bottom: '92px', zIndex: 899, width: '400px', maxHeight: '72vh', borderRadius: '16px' }


  const smallBtn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(18,94,204,0.35)', background: 'transparent', color: '#125ecc', fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }

  const emptyText = q ? 'No matches. Try a different word.' : 'No FAQs yet.'

  return (
    <>
      {open && fullDoc && (
        <div role="dialog" aria-label={fullDoc.name} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,20,45,0.92)', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullDoc.name}</span>
            <a href={fullDoc.url} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '6px', padding: '6px 12px' }}>Open in new tab</a>
            <button onClick={() => setFullDoc(null)} aria-label="Close document" style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <div style={{ flex: 1, margin: '0 18px 18px', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
            <iframe src={fullDoc.url} title={fullDoc.name} style={{ width: '100%', height: '100%', border: 0 }} />
          </div>
        </div>
      )}

      {open && (
        <div role="dialog" aria-label="Help" style={{ ...panelStyle, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', boxShadow: '0 12px 40px rgba(20,45,95,0.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
          <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>Help</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '12px', marginTop: '2px' }}>Answers, videos and guides for the VFO Portal</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close help" style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setExpandedId(null) }}
              placeholder="Search questions and answers…"
              autoFocus={!narrow}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
            />
          </div>

          <div style={{ overflowY: 'auto', padding: '6px 16px 16px', flex: 1 }}>
            {items === null && !loadError && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: '14px 0' }}>Loading…</p>}
            {loadError && <p style={{ color: '#d93025', fontSize: '13px', margin: '14px 0' }}>Could not load help content — please try again later.</p>}
            {items !== null && !loadError && filtered.length === 0 && (
              <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: '14px 0' }}>{emptyText}</p>
            )}
            {groups.map(group => (
              <div key={group.id ?? 'other'}>
                {group.name && (
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '14px 0 4px' }}>{group.name}</div>
                )}
                {group.rows.map(item => {
                  const isOpen = expandedId === item.id
                  const embed = wistiaEmbedUrl(item.video_url)
                  const mediaOnly = !item.answer && (embed || item.document_url)
                  const showPlay = mediaOnly && embed
                  const showDoc = mediaOnly && !embed && item.document_url
                  return (
                    <div key={item.id} style={{ borderBottom: '1px solid var(--vfo-tint)' }}>
                      <button onClick={() => toggle(item.id)} aria-expanded={isOpen} style={{ width: '100%', textAlign: 'left', padding: '12px 0', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '10px', fontFamily: 'Inter, sans-serif' }}>
                        <span style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: showPlay ? 'rgba(0,149,255,0.15)' : showDoc ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', color: showPlay ? '#0095ff' : '#1b9254', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                          {showPlay ? '▶' : showDoc ? <span style={{ fontSize: '11px', fontWeight: 700 }}>PDF</span> : <span style={{ color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 700 }}>{isOpen ? '−' : '+'}</span>}
                        </span>
                        <span style={{ flex: 1, fontSize: '14px', fontWeight: isOpen ? 600 : 500, color: isOpen ? '#125ecc' : 'var(--vfo-ink)', lineHeight: 1.4 }}>{item.question}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 0 14px 30px' }}>
                          {item.answer && (
                            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginBottom: embed || item.document_url ? '10px' : 0 }}>{item.answer}</div>
                          )}
                          {embed && (
                            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)', marginBottom: item.document_url ? '10px' : 0 }}>
                              <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                                <iframe src={embed} title={item.question} allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
                              </div>
                            </div>
                          )}
                          {item.document_url && (
                            <div>
                              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)', height: '220px', background: '#fff' }}>
                                <iframe src={item.document_url} title={item.document_name || item.question} style={{ width: '100%', height: '100%', border: 0 }} />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => setFullDoc({ url: item.document_url, name: item.document_name || item.question })} style={smallBtn}>⤢ Expand</button>
                                <a href={item.document_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--vfo-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.document_name || 'Open document'} ↗</a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close help' : 'Open help'}
        title="Help"
        style={fabStyle}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {open ? '×' : '?'}
      </button>
    </>
  )
}
