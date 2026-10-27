import { useNavigate } from 'react-router-dom'
import VfoWordmark from '../components/shared/VfoWordmark'
import { useMediaQuery } from '../lib/useMediaQuery'

const ROLES = [
  { label: 'VFOS/ERT', sub: 'Team access', to: '/admin/login', initials: 'VE' },
  { label: 'VFO Specialist', sub: 'Your secure Specialist portal', to: '/specialist/login', initials: 'SP' },
  { label: 'Member', sub: 'Advisor and Accountant access', to: '/member/login', initials: 'ME' },
  { label: 'Client', sub: 'Your secure Client portal', to: '/client/login', initials: 'CL' },
]

const FOOTER_LINK = { color: '#ffffff', textDecoration: 'none' }
const underline = e => { e.currentTarget.style.textDecoration = 'underline' }
const noUnderline = e => { e.currentTarget.style.textDecoration = 'none' }

export default function RolePicker() {
  const navigate = useNavigate()
  // A phone, or any short window: everything has to fit without scrolling to the
  // portal buttons (2026-10-27), so the intro paragraph goes (the sign-in pages
  // carry the same line) and the spacing tightens.
  const compact = useMediaQuery('(max-width: 640px), (max-height: 620px)')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: compact ? '6px' : '12px', background: 'linear-gradient(160deg, #002973 0%, #0d47a8 55%, #125ecc 100%)', padding: compact ? '20px 16px' : '24px', position: 'relative', overflow: 'hidden' }}>
      {/* decorative rosette outlines */}
      <svg width="520" height="520" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: '-160px', right: '-160px', opacity: 0.08 }} aria-hidden="true">
        {[0, 60, 120, 180, 240, 300].map(a => (
          <circle key={a} cx={12 + 4.4 * Math.cos((a * Math.PI) / 180)} cy={12 + 4.4 * Math.sin((a * Math.PI) / 180)} r="5.8" stroke="#ffffff" strokeWidth="0.5" />
        ))}
      </svg>
      <svg width="420" height="420" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', bottom: '-140px', left: '-140px', opacity: 0.07 }} aria-hidden="true">
        {[0, 60, 120, 180, 240, 300].map(a => (
          <circle key={a} cx={12 + 4.4 * Math.cos((a * Math.PI) / 180)} cy={12 + 4.4 * Math.sin((a * Math.PI) / 180)} r="5.8" stroke="#ffffff" strokeWidth="0.5" />
        ))}
      </svg>

      <VfoWordmark size={compact ? 22 : 28} light />
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.02em', fontSize: compact ? '24px' : '32px', color: '#ffffff', margin: compact ? '12px 0 0' : '20px 0 0', textAlign: 'center' }}>Welcome to the VFO Portal</h1>
      {!compact && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', maxWidth: '560px', textAlign: 'center', margin: '14px 0 0', position: 'relative' }}>
        VFO Services is a virtual family office serving Elite Resource Team members and their clients - top national specialists in tax planning, legal services, risk mitigation, wealth management, and business advisory services.
      </p>}
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', color: 'rgba(255,255,255,0.7)', margin: compact ? '12px 0 6px' : '22px 0 10px', position: 'relative' }}>Select your portal to sign in</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? '10px' : '14px', width: '100%', maxWidth: '560px', position: 'relative' }}>
        {ROLES.map(role => (
          <button
            key={role.label}
            onClick={() => role.to && navigate(role.to)}
            onMouseEnter={e => { if (role.to) { e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,15,46,0.4)'; e.currentTarget.style.transform = 'translateY(-3px)' } }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,15,46,0.25)'; e.currentTarget.style.transform = 'none' }}
            style={{
              padding: compact ? '14px 16px' : '20px 22px', borderRadius: compact ? '14px' : '16px', border: 'none',
              background: 'var(--vfo-card)', textAlign: 'left', cursor: role.to ? 'pointer' : 'default',
              fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px rgba(0,15,46,0.25)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              opacity: role.to ? 1 : 0.75, display: 'flex', alignItems: 'center', gap: '14px',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '3px' }}>{role.label}</span>
              <span style={{ display: 'block', fontSize: '12.5px', color: role.to ? 'var(--vfo-muted)' : '#e06717', fontWeight: role.to ? 400 : 600 }}>{role.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <footer style={{ fontFamily: 'Inter, sans-serif', fontSize: compact ? '11px' : '12.5px', lineHeight: compact ? 1.6 : 1.8, color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: '620px', margin: compact ? '16px 0 0' : '34px 0 0', position: 'relative' }}>
        <div>&copy; 2026 VFO Services &middot; An affiliate of Elite Resource Team</div>
        <div>
          12636 High Bluff Drive, Suite 400, San Diego, CA 92130 &middot; (619) 981-9703 &middot;{' '}
          <a href="mailto:support@vfo-services.com" style={FOOTER_LINK} onMouseEnter={underline} onMouseLeave={noUnderline}>support@vfo-services.com</a>
        </div>
        <div>
          <a href="https://www.vfo-services.com" target="_blank" rel="noopener noreferrer" style={FOOTER_LINK} onMouseEnter={underline} onMouseLeave={noUnderline}>vfo-services.com</a>
          <span style={{ opacity: 0.5 }}> &middot; </span>
          <a href="/privacy.html" style={FOOTER_LINK} onMouseEnter={underline} onMouseLeave={noUnderline}>Privacy Policy</a>
          <span style={{ opacity: 0.5 }}> &middot; </span>
          <a href="/terms.html" style={FOOTER_LINK} onMouseEnter={underline} onMouseLeave={noUnderline}>Terms of Use</a>
        </div>
      </footer>
    </div>
  )
}
