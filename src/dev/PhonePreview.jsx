import { useEffect, useRef, useState } from 'react'
import { phoneAudit, clearAudit } from './phoneAudit'

// DEV ONLY — http://localhost:<port>/phone-preview while `npm run dev` runs: the
// portal at phone sizes side by side, so a layout can be checked without
// shrinking the browser window. App.jsx registers the route only under
// import.meta.env.DEV, so a production build holds neither the route nor this file.
//
// The frames are same-origin and share THIS tab's sessionStorage, where the
// session lives, so a tab is signed in as ONE person at a time. "Test as" swaps
// that person: each member / client / specialist / tax planner sign-in made here
// is remembered in this browser's localStorage until the server expires it
// (8 hours, every login action), so a role is signed into once and then one
// click away, and the dev server passes it to every other browser's preview
// (Chrome -> the Claude app's pane). An admin sign-in is never remembered. A frame's width IS its
// viewport, so media queries and the measured nav bars behave as on a phone;
// touch is not emulated (Chrome DevTools' device toolbar, Ctrl+Shift+M, does).

const DEVICES = [
  { key: 'android', label: 'Android', w: 360, h: 780 },
  { key: 'se', label: 'iPhone SE', w: 375, h: 667 },
  { key: 'iphone', label: 'iPhone 15', w: 393, h: 852 },
  { key: 'max', label: 'iPhone 15 Pro Max', w: 430, h: 932 },
  { key: 'tablet', label: 'iPad mini', w: 768, h: 1024 },
]
const DEFAULT_ON = ['android', 'se', 'iphone']
const ZOOMS = [1, 0.85, 0.7, 0.55]
const ROLES = [
  { role: 'member', label: 'Member', home: '/member', login: '/member/login' },
  { role: 'client', label: 'Client', home: '/client', login: '/client/login' },
  { role: 'specialist', label: 'Specialist', home: '/specialist', login: '/specialist/login' },
  { role: 'tax_planner', label: 'Tax Planner', home: '/tax-planner', login: '/tax-planner/login' },
]
const GO_TO = [['/', 'Portal picker'], ['/admin', 'Admin']]
const PREFS = 'vfo_phone_preview'
const SIGNINS = 'vfo_phone_preview_signins'
// The server's admin_sessions.expires_at for every login, less a margin.
const SIGNIN_TTL_MS = 8 * 60 * 60 * 1000 - 10 * 60 * 1000

function readJson(store, key, fallback) {
  try { return JSON.parse(store.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function writeJson(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}
function freshSignIns() {
  const all = readJson(localStorage, SIGNINS, {})
  const now = Date.now()
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v?.session?.token && now - v.saved_at < SIGNIN_TTL_MS))
}

// Swap remembered sign-ins with every other browser on this dev server (memory
// only - vite.config.js phonePreview), so a sign-in made in one browser is one
// click in the other. Returns true when this browser learned a newer one.
const SYNC_URL = '/__phone-preview/signins'
const SYNC_HEADERS = { 'X-VFO-Phone-Preview': '1' }
async function syncSignIns() {
  try {
    const res = await fetch(SYNC_URL, { method: 'POST', headers: { ...SYNC_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(freshSignIns()) })
    if (!res.ok) return false
    const local = readJson(localStorage, SIGNINS, {})
    let changed = false
    for (const [role, v] of Object.entries(await res.json())) {
      if (!local[role] || local[role].saved_at < v.saved_at) { local[role] = v; changed = true }
    }
    if (changed) writeJson(localStorage, SIGNINS, local)
    return changed
  } catch { return false }
}

// A pasted vfoportal.com / localhost link keeps only its path, so it opens here.
function toPath(raw) {
  let p = (raw || '').trim()
  if (/^https?:\/\//i.test(p)) {
    try { const u = new URL(p); p = u.pathname + u.search + u.hash } catch { p = '/' }
  }
  if (!p.startsWith('/')) p = '/' + p
  return p.startsWith('/phone-preview') ? '/' : p
}

export default function PhonePreview() {
  const saved = useRef(readJson(localStorage, PREFS, {})).current
  const [path, setPath] = useState(() => toPath(new URLSearchParams(window.location.search).get('path') || saved.path || '/'))
  const [draft, setDraft] = useState(path)
  const [on, setOn] = useState(() => (Array.isArray(saved.on) && saved.on.length ? saved.on : DEFAULT_ON))
  const [zoom, setZoom] = useState(() => (ZOOMS.includes(saved.zoom) ? saved.zoom : 1))
  const [landscape, setLandscape] = useState(!!saved.landscape)
  const [reloadTick, setReloadTick] = useState(0)
  const [where, setWhere] = useState({})
  const [session, setSessionState] = useState(null)
  const [signIns, setSignIns] = useState(freshSignIns)
  // { [device]: { path, result } } - a result shows only while its frame is still on that page.
  const [audits, setAudits] = useState({})
  const frames = useRef({})
  const lastToken = useRef(undefined)
  const followSignIn = useRef(false)

  useEffect(() => { writeJson(localStorage, PREFS, { path, on, zoom, landscape }) }, [path, on, zoom, landscape])

  useEffect(() => {
    const run = () => syncSignIns().then(changed => { if (changed) setSignIns(freshSignIns()) })
    run()
    const t = setInterval(run, 3000)
    return () => clearInterval(t)
  }, [])

  // Navigation inside the app fires no load event, so poll each frame's address
  // and the shared session.
  useEffect(() => {
    const t = setInterval(() => {
      const next = {}
      for (const [k, f] of Object.entries(frames.current)) {
        try { if (f?.contentWindow) next[k] = f.contentWindow.location.pathname + f.contentWindow.location.search } catch { /* mid-navigation */ }
      }
      setWhere(w => (JSON.stringify(w) === JSON.stringify(next) ? w : next))

      const s = readJson(sessionStorage, 'vfo_session', null)
      const token = s?.token || null
      setSessionState(prev => ((prev?.token || null) === token ? prev : s))
      if (s && ROLES.some(r => r.role === s.role)) {
        const all = readJson(localStorage, SIGNINS, {})
        if (all[s.role]?.session?.token !== token) {
          all[s.role] = { session: s, saved_at: Date.now() }
          writeJson(localStorage, SIGNINS, all)
          setSignIns(freshSignIns())
        }
      }
      // A sign-in inside one frame: once that frame reaches its portal page, send
      // the others there too (they are still on the picker / sign-in page).
      if (token && lastToken.current !== undefined && token !== lastToken.current) followSignIn.current = true
      lastToken.current = token
      if (followSignIn.current) {
        const target = Object.values(next).find(p => p && p !== '/' && !p.split('?')[0].endsWith('/login'))
        if (target) { followSignIn.current = false; go(target) }
      }
    }, 600)
    return () => clearInterval(t)
  }, [])

  function go(raw) {
    const p = toPath(raw)
    setDraft(p); setPath(p); setReloadTick(t => t + 1)
  }
  function reloadAll() {
    for (const f of Object.values(frames.current)) {
      try { f?.contentWindow?.location.reload() } catch { /* frame gone */ }
    }
  }
  function testAs(r) {
    if (session?.role === r.role) { go(r.home); return }
    const remembered = freshSignIns()[r.role]
    // Mark the swap as seen, so it is not mistaken for a fresh sign-in.
    lastToken.current = remembered?.session?.token || null
    followSignIn.current = false
    if (remembered) {
      writeJson(sessionStorage, 'vfo_session', remembered.session)
      go(r.home)
    } else {
      try { sessionStorage.removeItem('vfo_session') } catch { /* private mode */ }
      go(r.login)
    }
  }
  function runAudit() {
    const next = {}
    for (const [k, f] of Object.entries(frames.current)) {
      try { if (f?.contentWindow) next[k] = { path: f.contentWindow.location.pathname + f.contentWindow.location.search, result: phoneAudit(f.contentWindow) } } catch { /* frame mid-load */ }
    }
    setAudits(next)
  }
  function clearAudits() {
    for (const f of Object.values(frames.current)) { try { if (f?.contentWindow) clearAudit(f.contentWindow) } catch { /* frame gone */ } }
    setAudits({})
  }
  function forgetSignIns() {
    try { localStorage.removeItem(SIGNINS) } catch { /* private mode */ }
    fetch(SYNC_URL, { method: 'DELETE', headers: SYNC_HEADERS }).catch(() => {})
    setSignIns({})
  }
  function toggle(key) {
    setOn(list => (list.includes(key) ? list.filter(k => k !== key) : DEVICES.filter(d => d.key === key || list.includes(d.key)).map(d => d.key)))
  }

  const chip = active => ({ padding: '6px 12px', borderRadius: '99px', border: `1px solid ${active ? '#125ecc' : 'var(--vfo-border-mid)'}`, background: active ? 'rgba(18,94,204,0.10)' : 'var(--vfo-card)', color: active ? '#125ecc' : 'var(--vfo-ink)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' })
  const groupLabel = { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--vfo-muted)' }
  const dot = colour => <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: colour, flexShrink: 0 }} />
  const who = session ? `${session.name || session.email || 'unknown'} (${String(session.role || '').replace('_', ' ')})` : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--vfo-card)', borderBottom: '1px solid var(--vfo-border)', boxShadow: '0 2px 10px rgba(0,41,115,0.08)', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, color: 'var(--vfo-heading)', fontSize: '16px', marginRight: '6px' }}>Phone preview <span style={{ fontSize: '11px', fontWeight: 700, color: '#b08d26', marginLeft: '6px' }}>DEV ONLY</span></div>
          <form onSubmit={e => { e.preventDefault(); go(draft) }} style={{ display: 'flex', gap: '8px', flex: '1 1 320px' }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="/member  or paste any vfoportal.com link" style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'monospace' }} />
            <button type="submit" style={{ ...chip(true), background: '#125ecc', color: '#fff' }}>Open</button>
          </form>
          <button type="button" onClick={reloadAll} style={chip(false)}>Reload all</button>
          <button type="button" onClick={runAudit} title="Check every frame against the phone rules and outline what breaks them" style={{ ...chip(true), background: '#b3261e', borderColor: '#b3261e', color: '#fff' }}>Audit</button>
          {Object.keys(audits).length > 0 && <button type="button" onClick={clearAudits} style={chip(false)}>Clear audit</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px 18px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={groupLabel}>Test as</span>
            {ROLES.map(r => {
              const current = session?.role === r.role
              const remembered = !!signIns[r.role]
              return (
                <button key={r.role} type="button" onClick={() => testAs(r)} style={chip(current)}
                  title={current ? 'Signed in now' : remembered ? 'Remembered - one click' : 'Not signed in yet - opens its sign-in page'}>
                  {dot(current || remembered ? '#1b9254' : 'var(--vfo-border-mid)')}{r.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={groupLabel}>Go to</span>
            {GO_TO.map(([p, label]) => <button key={p} type="button" onClick={() => go(p)} style={chip(path === p)}>{label}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={groupLabel}>Devices</span>
            {DEVICES.map(d => <button key={d.key} type="button" onClick={() => toggle(d.key)} style={chip(on.includes(d.key))}>{d.label}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={groupLabel}>Zoom</span>
            {ZOOMS.map(z => <button key={z} type="button" onClick={() => setZoom(z)} style={chip(zoom === z)}>{Math.round(z * 100)}%</button>)}
            <button type="button" onClick={() => setLandscape(l => !l)} style={chip(landscape)}>Landscape</button>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>
          <strong style={{ color: who ? 'var(--vfo-success-text)' : '#b08d26' }}>{who ? `Signed in as ${who}` : 'Not signed in'}</strong>
          {' — '}Test as switches every frame to that role. A green dot = remembered (one click); a grey one opens its sign-in page, once, and is remembered for 8 hours in every browser on this dev server (never an admin).
          {' '}<span onClick={forgetSignIns} style={{ color: '#125ecc', cursor: 'pointer', fontWeight: 600 }}>Forget sign-ins</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '28px', padding: '24px 20px 48px' }}>
        {DEVICES.filter(d => on.includes(d.key)).map(d => {
          const w = landscape ? d.h : d.w
          const h = landscape ? d.w : d.h
          return (
            <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{d.label} <span style={{ fontWeight: 500, color: 'var(--vfo-muted)' }}>{w} × {h}</span></div>
              <div style={{ border: '8px solid #1d2330', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', background: '#1d2330' }}>
                <div style={{ width: `${w * zoom}px`, height: `${h * zoom}px`, overflow: 'hidden', background: '#fff' }}>
                  <iframe key={`${d.key}|${reloadTick}`} ref={el => { frames.current[d.key] = el }} title={`${d.label} preview`} src={path}
                    style={{ width: `${w}px`, height: `${h}px`, border: 0, display: 'block', transform: `scale(${zoom})`, transformOrigin: '0 0' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: `${w * zoom + 16}px` }}>
                <span title={where[d.key] || path} style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{where[d.key] || path}</span>
                <button type="button" onClick={() => go(where[d.key] || path)} style={{ ...chip(false), padding: '4px 10px', fontSize: '11.5px' }}>Show on all</button>
              </div>
              {audits[d.key] && audits[d.key].path === (where[d.key] || path) && (
                <div style={{ maxWidth: `${w * zoom + 16}px`, fontSize: '12px' }}>
                  {audits[d.key].result.total === 0
                    ? <div style={{ color: 'var(--vfo-success-text)', fontWeight: 700 }}>Passes the phone rules</div>
                    : <>
                        <div style={{ color: '#b3261e', fontWeight: 700, marginBottom: '6px' }}>{audits[d.key].result.total} to check (outlined red)</div>
                        <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {audits[d.key].result.findings.map((f, i) => (
                            <div key={i} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '8px', padding: '6px 8px' }}>
                              <div style={{ fontWeight: 700, color: 'var(--vfo-ink)' }}>{f.rule}</div>
                              <div style={{ color: 'var(--vfo-muted)' }}>{f.what} - {f.detail}</div>
                            </div>
                          ))}
                        </div>
                      </>}
                </div>
              )}
            </div>
          )
        })}
        {on.length === 0 && <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Pick a device above.</div>}
      </div>
    </div>
  )
}
