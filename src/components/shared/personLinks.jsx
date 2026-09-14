import { useNavigate, useLocation } from 'react-router-dom'

const baseStyle = { color: 'var(--vfo-primary, #125ecc)', cursor: 'pointer', textDecoration: 'none' }
const hoverProps = {
  onMouseEnter: e => { e.currentTarget.style.textDecoration = 'underline' },
  onMouseLeave: e => { e.currentTarget.style.textDecoration = 'none' },
}

export function MemberNameLink({ memberNumber, children, style }) {
  const navigate = useNavigate()
  const location = useLocation()
  if (!memberNumber) return <span style={style}>{children}</span>
  // Tax-planner portal: /admin needs an admin session, so a planner clicking
  // through would land on the login page. Planners get their own read-only view
  // and carry the page they came from so Back returns exactly there.
  const isPlanner = location.pathname.startsWith('/tax-planner')
  // _n cache-buster: AdminPortal reads ?member= off window.location.search, so the query
  // string has to change for a repeat click on the same member to register. Stamped
  // inside the handler so two clicks without a re-render still differ.
  const go = () => isPlanner
    ? navigate(`/tax-planner/member/${encodeURIComponent(memberNumber)}`, { state: { from: location.pathname + location.search } })
    : navigate(`/admin?member=${encodeURIComponent(memberNumber)}&_n=${Date.now()}`)
  return (
    <span
      title="Open member profile"
      style={{ ...style, ...baseStyle }}
      onClick={e => { e.stopPropagation(); go() }}
      {...hoverProps}>
      {children}
    </span>
  )
}

export function ClientNameLink({ clientId, program, tab, children, style }) {
  const navigate = useNavigate()
  if (!clientId) return <span style={style}>{children}</span>
  let target = `/admin/client/${clientId}`
  if (program) target += `?program=${encodeURIComponent(program)}`
  if (tab) target += `${program ? '&' : '?'}tab=${encodeURIComponent(tab)}`
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
