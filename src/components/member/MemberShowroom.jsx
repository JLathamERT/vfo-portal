import { useState, useEffect, useLayoutEffect } from 'react'
import { detailEntries, entryLabel, DB_FIELDS, REVENUE_SHARE_KEY } from '../shared/specialistDetails'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
const HEADSHOT_FALLBACK = 'https://biz-diagnostic.com/img/expert/'

// Fixed "standard plugin" look — identical on every member's account. Only the
// specialist list differs (driven by each member's own exclusions). Colours match
// the VFO portal. This view intentionally reads NONE of a member's saved plugin
// customisation (member_plugin_settings) — those settings stay separate/untouched.
const S = {
  bg_color: '#ffffff',        // page background
  text_color: '#002973',      // headings, search, filters, count
  accent_color: '#0b4bad',    // card + modal background
  card_text_color: '#ffffff', // names + bios on cards/modal
  primary_color: '#fb895a',   // active buttons, tags, hover, underlines
  font: 'Playfair Display',
  widget_font_size: 14,
  last_initial_only: false,
}

const FILTER_CATS = ['All', 'Tax Planning', 'Business Advisory', 'Legal Services', 'Risk Mitigation', 'Wealth Management']
// "Member Services" is an internal-only ecosystem — shown only where showMemberServices
// is passed (admin Specialists showroom, admin per-member preview, member portal). It is
// mutually exclusive with the five public ecosystems, so a Member-Services specialist has
// no other category and is filtered out entirely on surfaces that don't show it.
const MEMBER_SERVICES = 'Member Services'

function formatName(name) {
  if (!S.last_initial_only || !name) return name
  const parts = name.trim().split(' ')
  if (parts.length < 2) return name
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.'
}

// Headshot with the same fallback chain as the standard widget:
// supabase headshot -> legacy host -> initial placeholder.
function Avatar({ expert, big }) {
  const [stage, setStage] = useState(expert.headshot_image ? 0 : 2)
  const src = stage === 0 ? HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)
    : stage === 1 ? HEADSHOT_FALLBACK + expert.headshot_image
    : null
  if (!src) return <div className="vfo-sr-avatar-ph" style={big ? { fontSize: '36px' } : undefined}>{(expert.name || '?').charAt(0)}</div>
  return <img src={src} alt={formatName(expert.name)} loading="lazy" decoding="async" onError={() => setStage(s => s + 1)} />
}

// Background-check tiers, styled so the symbol is nicest for Max, a notch down
// for Core, and minimal for Lite. Empty/unknown background_check → no badge.
const BG_CHECK_TIERS = {
  Max:  { bg: 'linear-gradient(135deg,#ffe7a0 0%,#e8b73e 100%)', fg: '#3a2c05', border: 'rgba(255,255,255,0.55)', glow: '0 3px 12px rgba(232,183,62,0.6)', star: true },
  Core: { bg: 'linear-gradient(135deg,#d6e6ff 0%,#9cc0f2 100%)', fg: '#0c2c54', border: 'rgba(255,255,255,0.5)', glow: 'none', star: false },
  Lite: { bg: 'rgba(255,255,255,0.14)', fg: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.28)', glow: 'none', star: false },
}

function ShieldCheck({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2 4 5v6c0 5 3.5 8.4 8 11 4.5-2.6 8-6 8-11V5l-8-3z" fill="currentColor" opacity="0.16" />
      <path d="M12 2 4 5v6c0 5 3.5 8.4 8 11 4.5-2.6 8-6 8-11V5l-8-3z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.4 12.1l2.3 2.3 4.9-4.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// `large` = modal variant (shows the explicit tier); compact card variant otherwise.
function BackgroundCheckBadge({ value, large = false }) {
  const cfg = BG_CHECK_TIERS[value]
  if (!cfg) return null
  return (
    <span
      title={`Background check: ${value}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: large ? '7px' : '5px',
        padding: large ? '5px 13px' : '3px 10px', borderRadius: '999px',
        background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}`,
        boxShadow: cfg.glow, fontFamily: '"DM Sans", sans-serif',
        fontSize: large ? '12px' : '10.5px', fontWeight: 700, letterSpacing: '0.02em',
        lineHeight: 1, whiteSpace: 'nowrap',
      }}
    >
      <ShieldCheck size={large ? 14 : 12} />
      {large ? `Background Verified · ${value}` : 'Background Check'}
      {cfg.star && (
        <svg viewBox="0 0 24 24" width={large ? 12 : 10} height={large ? 12 : 10} fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M12 2l2.4 5.9L20.5 9l-4.6 4 1.4 6.4L12 16.9 6.7 19.4 8.1 13 3.5 9l6.1-1.1L12 2z" />
        </svg>
      )}
    </span>
  )
}

// The Details & Benefits panel the modal's button opens. Everything it renders
// already exists on the experts row — this is a new VIEW of it, not new data.
// `showRevenueShare` gates the Revenue Share section to admins and members
// (Jake, 2026-09-22); the client and specialist showroom payloads also have the
// column stripped server-side, so on those surfaces it is absent as well as hidden.
function DetailsAndBenefits({ entries, showRevenueShare }) {
  const [active, setActive] = useState(0)
  const idx = Math.min(active, entries.length - 1)
  const c = entries[idx].content
  const fields = DB_FIELDS.filter(([k]) => String(c[k] || '').trim() !== '')
  const revenueShare = showRevenueShare ? String(c[REVENUE_SHARE_KEY] || '').trim() : ''

  return (
    <div className="vfo-sr-db">
      {entries.length > 1 && (
        <div className="vfo-sr-db-chips">
          {entries.map((en, i) => (
            <button key={en.eco + i} onClick={() => setActive(i)}
              className={'vfo-sr-db-chip' + (i === idx ? ' is-active' : '')}>{entryLabel(entries, i)}</button>
          ))}
        </div>
      )}
      {fields.map(([k, label]) => (
        <div key={k} className="vfo-sr-db-field">
          <div className="vfo-sr-db-label">{label}</div>
          <div className="vfo-sr-db-value">{c[k]}</div>
        </div>
      ))}
      {revenueShare && (
        <div className="vfo-sr-db-revshare">
          <div className="vfo-sr-db-label">Revenue Share</div>
          <div className="vfo-sr-db-value">{revenueShare}</div>
        </div>
      )}
    </div>
  )
}

function ShowroomModal({ expert, onClose, showRevenueShare = false }) {
  const [showDetails, setShowDetails] = useState(false)
  // useLayoutEffect (not useEffect) so the scroll lock applies BEFORE the browser
  // paints the modal — otherwise the background reflow lands a frame late and the
  // screen visibly flickers as the modal appears.
  useLayoutEffect(() => {
    const html = document.documentElement
    // Reserve the scrollbar's width as padding so hiding it doesn't reflow the
    // page wider (the portal keeps a permanent scrollbar via html overflow-y),
    // which otherwise makes the content shift sideways when the modal opens.
    const scrollBarW = window.innerWidth - html.clientWidth
    const prevBody = document.body.style.overflow
    const prevHtml = html.style.overflow
    const prevPad = html.style.paddingRight
    document.body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    if (scrollBarW > 0) html.style.paddingRight = scrollBarW + 'px'
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevBody
      html.style.overflow = prevHtml
      html.style.paddingRight = prevPad
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const bio = (expert.long_bio || '').replace(/\r\n/g, '\n')
  const entries = detailEntries(expert, expert.categories)
  return (
    <div className="vfo-sr-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vfo-sr-modal">
        <button className="vfo-sr-modal-close" onClick={onClose}>{'×'}</button>
        <div className="vfo-sr-modal-header">
          <div className="vfo-sr-modal-avatar"><Avatar expert={expert} big /></div>
          <div>
            <h3 className="vfo-sr-modal-name">{formatName(expert.name)}</h3>
            <p className="vfo-sr-modal-tagline">{expert.short_bio || ''}</p>
            {expert.background_check && <div style={{ marginTop: '10px' }}><BackgroundCheckBadge value={expert.background_check} large /></div>}
          </div>
        </div>
        {(expert.categories || []).length > 0 && (
          <div className="vfo-sr-modal-tags">
            {expert.categories.map(cat => <span key={cat} className="vfo-sr-modal-tag">{cat}</span>)}
          </div>
        )}
        {entries.length > 0 && (
          <div className="vfo-sr-db-wrap">
            <button className={'vfo-sr-db-toggle' + (showDetails ? ' is-open' : '')} onClick={() => setShowDetails(o => !o)}
              aria-expanded={showDetails}>
              Details &amp; Benefits
              <span className="vfo-sr-db-caret">{showDetails ? '▲' : '▼'}</span>
            </button>
            {showDetails && <DetailsAndBenefits entries={entries} showRevenueShare={showRevenueShare} />}
          </div>
        )}
        <div className="vfo-sr-modal-divider" />
        <div className="vfo-sr-modal-bio">{bio}</div>
      </div>
    </div>
  )
}

export default function MemberShowroom({ experts = [], exclusions = [], ecoMap = {}, showMemberServices = false, showRevenueShare = false }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  // In-portal the showroom follows the portal theme; the CSS template appends
  // hex-alpha suffixes (e.g. `${color}33`), so dark mode swaps in raw hexes
  // rather than var(--vfo-*). The website widget is unaffected (separate file).
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const P = dark ? { ...S, bg_color: '#001b4f', text_color: '#eef3ff' } : S

  const filterCats = showMemberServices ? [...FILTER_CATS, MEMBER_SERVICES] : FILTER_CATS

  // Member's chosen specialists = all experts minus their exclusions, with categories.
  const excluded = new Set(exclusions)
  const shown = experts
    .filter(ex => !excluded.has(ex.id))
    .filter(ex => (ex.status || 'Active') === 'Active') // Feature C: only Active specialists appear in any showroom
    .filter(ex => !ex.vfo_accredited) // VFO Accredited Professional Specialists are hidden from EVERY showroom surface (they surface only in Specialist Search + the Holistic/Tax specialist pickers)
    .map(ex => ({ ...ex, categories: ecoMap[ex.id] || [] }))
    // Internal-only: hide Member-Services specialists where the category isn't shown.
    .filter(ex => showMemberServices || !ex.categories.includes(MEMBER_SERVICES))

  const q = search.trim().toLowerCase()
  const filtered = shown.filter(ex => {
    const matchFilter = activeFilter === 'All' || ex.categories.indexOf(activeFilter) !== -1
    const matchSearch = !q || (ex.name || '').toLowerCase().indexOf(q) !== -1 || (ex.short_bio || '').toLowerCase().indexOf(q) !== -1
    return matchFilter && matchSearch
  })

  return (
    <div className="vfo-sr-root" style={{ background: P.bg_color, color: P.text_color }}>
      <style>{showroomCss(P, P.widget_font_size / 14)}</style>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(P.font)}:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap`} />

      <div className="vfo-sr-container">
        <div className="vfo-sr-search-wrap">
          <span className="vfo-sr-search-icon">{'⌕'}</span>
          <input type="search" name="search" autoComplete="off" className="vfo-sr-search" placeholder="Search specialists..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="vfo-sr-filters">
          {filterCats.map(cat => (
            <button key={cat} className={'vfo-sr-filter-btn' + (cat === activeFilter ? ' vfo-sr-active' : '')} onClick={() => setActiveFilter(cat)}>{cat}</button>
          ))}
        </div>

        <p className="vfo-sr-count">{filtered.length} SPECIALIST{filtered.length !== 1 ? 'S' : ''}</p>

        {filtered.length === 0 ? (
          <div className="vfo-sr-empty">No specialists match your search.</div>
        ) : (
          <div className="vfo-sr-grid">
            {filtered.map((ex, i) => (
              <div key={ex.id} className="vfo-sr-card" style={{ animationDelay: (i * 0.03) + 's' }} onClick={() => setSelected(ex)}>
                <div className="vfo-sr-card-header">
                  <div className="vfo-sr-avatar"><Avatar expert={ex} /></div>
                  <div>
                    <h3 className="vfo-sr-card-name">{formatName(ex.name)}</h3>
                    <p className="vfo-sr-card-tagline">{ex.short_bio || ''}</p>
                  </div>
                  {ex.background_check && <BackgroundCheckBadge value={ex.background_check} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && <ShowroomModal expert={selected} onClose={() => setSelected(null)} showRevenueShare={showRevenueShare} />}
    </div>
  )
}

function showroomCss(s, scale) {
  const r = (n) => Math.round(n * scale)
  return `
    .vfo-sr-root { font-family: "DM Sans", sans-serif; position: relative; line-height: 1.5; -webkit-font-smoothing: antialiased; min-height: 60vh; }
    .vfo-sr-root *, .vfo-sr-root *::before, .vfo-sr-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .vfo-sr-container { max-width: 1280px; margin: 0 auto; padding: 36px 48px 64px; }
    .vfo-sr-search-wrap { max-width: 480px; margin: 0 auto 32px; position: relative; display: block; }
    .vfo-sr-search-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); font-size: 15px; pointer-events: none; color: ${s.text_color}aa; }
    .vfo-sr-search { width: 100%; padding: 14px 20px 14px 46px; border-radius: 12px; border: 2px solid ${s.text_color}33; background: ${s.text_color}08; font-size: ${r(15)}px; font-family: "DM Sans", sans-serif; outline: none; transition: border-color 0.2s; display: block; color: ${s.text_color}; }
    .vfo-sr-search::placeholder { color: ${s.text_color}; opacity: 0.45; }
    .vfo-sr-search:focus { border-color: ${s.primary_color}; }
    .vfo-sr-filters { display: flex; justify-content: center; gap: 10px; margin-bottom: 26px; flex-wrap: wrap; }
    .vfo-sr-filter-btn { padding: ${r(10)}px ${r(22)}px; border-radius: 10px; border: 2px solid ${s.text_color}33; background: transparent; font-size: ${r(13)}px; font-weight: 500; cursor: pointer; font-family: "DM Sans", sans-serif; letter-spacing: 0.3px; transition: all 0.25s ease; color: ${s.text_color}cc; }
    .vfo-sr-filter-btn:hover { border-color: ${s.text_color}66; color: ${s.text_color}; }
    .vfo-sr-filter-btn.vfo-sr-active { border-color: ${s.primary_color}; background: ${s.primary_color}1a; color: ${s.primary_color}; font-weight: 600; }
    .vfo-sr-count { font-size: ${r(14)}px; text-align: center; margin-bottom: 26px; letter-spacing: 1px; font-weight: 600; color: ${s.text_color}aa; }
    .vfo-sr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 22px; }
    .vfo-sr-card { background: ${s.accent_color}; border: 1px solid ${s.card_text_color}1f; border-radius: 16px; padding: 22px 20px 18px; cursor: pointer; transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease; opacity: 0; transform: translateY(18px); animation: vfoSrFadeUp 0.5s ease forwards; }
    .vfo-sr-card:hover { transform: translateY(-4px); border-color: ${s.primary_color}66; box-shadow: 0 18px 36px rgba(11,75,173,0.22); }
    .vfo-sr-card-header { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
    .vfo-sr-avatar { width: ${r(74)}px; height: ${r(74)}px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid ${s.card_text_color}26; background: ${s.card_text_color}14; transition: border-color 0.3s; margin: 0 auto; }
    .vfo-sr-card:hover .vfo-sr-avatar { border-color: ${s.primary_color}; }
    .vfo-sr-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
    .vfo-sr-avatar-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: ${r(26)}px; font-weight: 700; color: ${s.primary_color}; font-family: '${s.font}', serif; }
    .vfo-sr-card-name { font-size: ${r(18)}px; font-weight: 600; margin: 0; line-height: 1.3; color: ${s.card_text_color}; font-family: '${s.font}', serif; }
    .vfo-sr-card-tagline { font-size: ${r(13)}px; margin: 6px 0 0; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: ${r(37)}px; color: ${s.card_text_color}cc; }
    .vfo-sr-empty { text-align: center; padding: 72px 0; font-size: 16px; color: ${s.text_color}66; }
    .vfo-sr-overlay { position: fixed; inset: 0; background: rgba(8,20,45,0.55); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 24px; }
    .vfo-sr-modal { background: ${s.accent_color}; border: 1px solid ${s.primary_color}40; border-radius: 20px; max-width: 640px; width: 100%; max-height: 85vh; overflow: auto; padding: 40px; position: relative; box-shadow: 0 40px 80px rgba(8,20,45,0.4); color: ${s.card_text_color}; }
    .vfo-sr-modal-close { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid ${s.card_text_color}26; background: ${s.card_text_color}14; color: ${s.card_text_color}cc; font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .vfo-sr-modal-close:hover { background: ${s.card_text_color}26; color: ${s.card_text_color}; }
    .vfo-sr-modal-header { display: flex; align-items: center; gap: 22px; margin-bottom: 24px; }
    .vfo-sr-modal-avatar { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: ${s.card_text_color}14; border: 2px solid ${s.primary_color}; }
    .vfo-sr-modal-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
    .vfo-sr-modal-name { font-size: ${r(27)}px; font-weight: 700; margin: 0; color: ${s.card_text_color}; font-family: '${s.font}', serif; }
    .vfo-sr-modal-tagline { font-size: ${r(15)}px; margin: 7px 0 0; font-weight: 500; color: ${s.card_text_color}cc; }
    .vfo-sr-modal-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .vfo-sr-modal-tag { padding: 6px 14px; border-radius: 8px; font-size: ${r(12)}px; font-weight: 500; display: inline-block; background: ${s.card_text_color}1a; color: ${s.card_text_color}; border: 1px solid ${s.card_text_color}33; }
    .vfo-sr-db-wrap { margin-bottom: 24px; }
    .vfo-sr-db-toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 12px 18px; border-radius: 10px; border: 1px solid ${s.primary_color}80; background: ${s.card_text_color}0f; color: ${s.card_text_color}; font-family: 'DM Sans', sans-serif; font-size: ${r(13.5)}px; font-weight: 700; letter-spacing: 0.02em; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
    .vfo-sr-db-toggle:hover { background: ${s.card_text_color}1f; border-color: ${s.primary_color}; }
    .vfo-sr-db-toggle.is-open { background: ${s.card_text_color}1f; border-color: ${s.primary_color}; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    .vfo-sr-db-caret { font-size: 9px; opacity: 0.75; }
    .vfo-sr-db { border: 1px solid ${s.primary_color}80; border-top: none; border-radius: 0 0 10px 10px; padding: 20px 18px 6px; background: ${s.card_text_color}0a; }
    .vfo-sr-db-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .vfo-sr-db-chip { padding: 5px 12px; border-radius: 999px; font-size: ${r(11.5)}px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; background: transparent; color: ${s.card_text_color}99; border: 1px solid ${s.card_text_color}33; }
    .vfo-sr-db-chip.is-active { background: ${s.primary_color}; color: #241004; border-color: ${s.primary_color}; }
    .vfo-sr-db-field { margin-bottom: 18px; }
    .vfo-sr-db-revshare { margin-bottom: 18px; padding-top: 16px; border-top: 1px solid ${s.card_text_color}26; }
    .vfo-sr-db-label { font-family: 'DM Sans', sans-serif; font-size: ${r(10.5)}px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${s.primary_color}; margin-bottom: 6px; }
    .vfo-sr-db-value { font-size: ${r(13.5)}px; line-height: 1.75; font-weight: 300; white-space: pre-wrap; color: ${s.card_text_color}d9; }
    .vfo-sr-modal-divider { height: 1px; margin-bottom: 24px; background: linear-gradient(90deg, transparent, ${s.primary_color}59, transparent); }
    .vfo-sr-modal-bio { font-size: ${r(15)}px; line-height: 1.8; white-space: pre-wrap; font-weight: 300; color: ${s.card_text_color}d9; }
    @keyframes vfoSrFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 640px) { .vfo-sr-container { padding: 20px 14px 36px; } .vfo-sr-grid { grid-template-columns: 1fr; gap: 14px; } .vfo-sr-modal { padding: 22px; } .vfo-sr-overlay { padding: 12px; } .vfo-sr-modal-header { flex-direction: column; text-align: center; } .vfo-sr-modal-name { font-size: 22px; } .vfo-sr-modal-avatar { width: 80px; height: 80px; } .vfo-sr-search-wrap { max-width: 100%; } .vfo-sr-filters { gap: 6px; } }
  `
}
