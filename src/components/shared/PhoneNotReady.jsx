import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getSession } from '../../lib/api'
import { useMediaQuery, PHONE_QUERY } from '../../lib/useMediaQuery'

// The admin and tax planner portals have not been laid out for phones yet
// (2026-10-28). On a phone their sign-in pages say so before the form, and anyone
// already signed in sees it once as a card at the foot of the screen. A notice,
// never a block: Continue / OK go straight on. Remembered for the tab session.
const PORTALS = {
  admin: { label: 'VFOS / ERT Portal', name: 'The VFOS / ERT portal' },
  tax_planner: { label: 'Tax Planner Portal', name: 'The Tax Planner portal' },
}
// A phone either way up: landscape is wider than PHONE_QUERY but short and touch.
const NOTICE_QUERY = `${PHONE_QUERY}, (pointer: coarse) and (max-height: 500px)`
const seenKey = portal => `vfo_phone_notice_seen:${portal}`

function seen(portal) {
  try { return sessionStorage.getItem(seenKey(portal)) === '1' } catch { return false }
}
function markSeen(portal) {
  try { sessionStorage.setItem(seenKey(portal), '1') } catch { /* private mode */ }
}

// Wraps a sign-in page's content (inside AuthShell).
export function PhoneNoticeGate({ portal, children }) {
  const navigate = useNavigate()
  const onPhone = useMediaQuery(NOTICE_QUERY)
  const [ok, setOk] = useState(() => seen(portal))
  if (!onPhone || ok) return <>{children}</>
  return (
    <div>
      <p style={{ fontSize: '11.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', margin: '0 0 10px' }}>{PORTALS[portal].label}</p>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', marginTop: 0, marginBottom: '12px', fontSize: '26px' }}>Best on a computer</h2>
      <p style={{ color: 'var(--vfo-ink)', fontSize: '14px', lineHeight: 1.55, margin: '0 0 24px' }}>
        {PORTALS[portal].name} hasn't been set up for phones yet, so some pages may be hard to read or use on a small screen. For the best experience, please sign in on a computer.
      </p>
      <button type="button" onClick={() => { markSeen(portal); setOk(true) }} style={{ width: '100%', padding: '13px', borderRadius: '10px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 4px 14px rgba(18,94,204,0.35)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>Continue on this phone</button>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '20px', textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/')}>← Back to portal selection</p>
    </div>
  )
}

// Mounted once from App.jsx: covers every signed-in admin / planner page,
// client pages included, for a session that skipped the sign-in notice.
export function PhoneNoticeMount() {
  const { pathname } = useLocation()
  const onPhone = useMediaQuery(NOTICE_QUERY)
  const [dismissed, setDismissed] = useState(null)
  const role = getSession()?.role
  const portal = role === 'admin' && pathname.startsWith('/admin') ? 'admin'
    : role === 'tax_planner' && pathname.startsWith('/tax-planner') ? 'tax_planner'
    : null
  if (!portal || !onPhone || pathname.endsWith('/login') || dismissed === portal || seen(portal)) return null
  return (
    <div role="status" style={{ position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: 900, background: 'var(--vfo-card)', color: 'var(--vfo-ink)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: '0 8px 28px rgba(0,41,115,0.22)', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '10px 14px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ flex: '1 1 220px', fontSize: '13px', lineHeight: 1.5 }}>
        <strong>Best on a computer.</strong> {PORTALS[portal].name} hasn't been set up for phones yet, so some pages may be hard to use on a small screen.
      </div>
      <button type="button" onClick={() => { markSeen(portal); setDismissed(portal) }} style={{ padding: '8px 22px', borderRadius: '99px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>OK</button>
    </div>
  )
}
