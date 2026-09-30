import { useNavigate, useLocation } from 'react-router-dom'

const baseStyle = { color: 'var(--vfo-primary, #125ecc)', cursor: 'pointer', textDecoration: 'none' }
const hoverProps = {
  onMouseEnter: e => { e.currentTarget.style.textDecoration = 'underline' },
  onMouseLeave: e => { e.currentTarget.style.textDecoration = 'none' },
}

// The client page's URL for one plan/track: ClientDetail picks the program off
// ?program= and must have it for a tax plan — without it the page loads the client's
// default (Holistic) program, whose Tax Priorities tab filters to program 1 and so
// hides a Tax Planning (program 4) plan entirely. tab='home' is the client profile.
export function clientPagePath(clientId, { program, tab, plan } = {}) {
  const q = []
  if (program) q.push(`program=${encodeURIComponent(program)}`)
  if (tab) q.push(`tab=${encodeURIComponent(tab)}`)
  if (plan) q.push(`plan=${encodeURIComponent(plan)}`)
  return `/admin/client/${clientId}${q.length ? `?${q.join('&')}` : ''}`
}

// Opens a member's profile. Shared by MemberNameLink and by clickable rows whose
// whole target is a member (the Accounting reconciliation tables).
export function useOpenMember() {
  const navigate = useNavigate()
  const location = useLocation()
  return (memberNumber) => {
    if (!memberNumber) return
    // Tax-planner portal: /admin needs an admin session, so a planner clicking
    // through would land on the login page. Planners get their own read-only view
    // and carry the page they came from so Back returns exactly there.
    if (location.pathname.startsWith('/tax-planner')) {
      navigate(`/tax-planner/member/${encodeURIComponent(memberNumber)}`, { state: { from: location.pathname + location.search } })
      return
    }
    // _n cache-buster: AdminPortal reads ?member= off window.location.search, so the query
    // string has to change for a repeat click on the same member to register.
    // On the admin shell the link also names the tab it was clicked on, so the
    // profile's "Back to list" can return there (AdminPortal decides which tabs it
    // honours) instead of the member's own directory.
    let origin = ''
    if (location.pathname === '/admin') {
      try { const t = sessionStorage.getItem('adminActiveTab'); if (t) origin = `&origin=${encodeURIComponent(t)}` } catch { /* private mode */ }
    }
    navigate(`/admin?member=${encodeURIComponent(memberNumber)}${origin}&_n=${Date.now()}`)
  }
}

export function MemberNameLink({ memberNumber, children, style }) {
  const openMember = useOpenMember()
  if (!memberNumber) return <span style={style}>{children}</span>
  return (
    <span
      title="Open member profile"
      style={{ ...style, ...baseStyle }}
      onClick={e => { e.stopPropagation(); openMember(memberNumber) }}
      {...hoverProps}>
      {children}
    </span>
  )
}

export function ClientNameLink({ clientId, program, tab, children, style }) {
  const navigate = useNavigate()
  if (!clientId) return <span style={style}>{children}</span>
  const target = clientPagePath(clientId, { program, tab })
  return (
    <span
      title="Open client profile"
      style={{ ...style, ...baseStyle }}
      onClick={e => { e.stopPropagation(); navigate(target) }}
      {...hoverProps}>
      {children}
    </span>
  )
}

// A specialist's profile in the admin Specialists tab. view=profile opens the
// read-only Profile sub-tab; the older Stage-5 "Open specialist" deep link omits it
// and still lands on Edit. Admin shell only. Like MemberNameLink it names the tab it
// was clicked on (origin) so the profile's "Back to list" can return there.
export function specialistProfilePath(expertId) {
  let origin = ''
  if (window.location.pathname === '/admin') {
    try { const t = sessionStorage.getItem('adminActiveTab'); if (t) origin = `&origin=${encodeURIComponent(t)}` } catch { /* private mode */ }
  }
  return `/admin?tab=specialists&section=specialist_search&expert=${encodeURIComponent(expertId)}&view=profile${origin}&_n=${Date.now()}`
}

export function SpecialistNameLink({ expertId, children, style }) {
  const navigate = useNavigate()
  if (!expertId) return <span style={style}>{children}</span>
  return (
    <span
      title="Open specialist profile"
      style={{ ...style, ...baseStyle }}
      onClick={e => { e.stopPropagation(); navigate(specialistProfilePath(expertId)) }}
      {...hoverProps}>
      {children}
    </span>
  )
}
