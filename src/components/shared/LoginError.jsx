import { useNavigate } from 'react-router-dom'

// The failed-sign-in message on every portal login page, plus a standing hint
// that the portals are separate doors.
//
// The hint is STATIC: it is shown to everyone who fails, and this component
// never looks the address up. Telling someone "that account is on another
// portal" would confirm to whoever typed the address that an account exists —
// the login page is open to anyone, and that is the disclosure the reset page's
// identical-response rule exists to prevent (#355). Naming the portal you are
// on, and offering the switcher, solves the same confusion without answering a
// question about any particular person.
export default function LoginError({ message, portalLabel }) {
  const navigate = useNavigate()
  if (!message) return null
  return (
    <div style={{ background: 'rgba(217,48,37,0.06)', border: '1px solid rgba(217,48,37,0.25)', borderRadius: '10px', padding: '12px 14px' }}>
      <p style={{ color: '#d93025', fontWeight: 600, fontSize: '13px', margin: 0 }}>
        {message}
      </p>
      <p style={{ color: 'var(--vfo-muted)', fontWeight: 400, fontSize: '12.5px', lineHeight: 1.6, margin: '8px 0 0' }}>
        You're signing in to the <strong style={{ color: 'var(--vfo-ink)' }}>{portalLabel}</strong> portal. Members, Clients, Specialists and Tax Planners each sign in separately —{' '}
        <span onClick={() => navigate('/')} style={{ color: '#0a85e8', fontWeight: 600, cursor: 'pointer' }}>choose your portal</span> if this isn't yours.
      </p>
    </div>
  )
}
