// Split-screen auth layout: navy brand panel + white form panel. Presentation only.
import VfoWordmark from './VfoWordmark'
import { useMediaQuery } from '../../lib/useMediaQuery'

// Below 800px the two panels (380px + 420px bases) stack. Stacked, the full brand
// panel pushed the sign-in form below the fold on a phone (2026-10-27), so there
// it shrinks to a slim wordmark strip and the form takes the rest of the screen.
export default function AuthShell({ children }) {
  const stacked = useMediaQuery('(max-width: 799px)')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap', flexDirection: stacked ? 'column' : 'row', background: 'var(--vfo-card)', fontFamily: 'Inter, sans-serif' }}>
      {stacked ? (
        <div style={{ background: 'linear-gradient(160deg, #002973 0%, #0d47a8 55%, #125ecc 100%)', padding: '12px 24px', display: 'flex', alignItems: 'center' }}>
          <VfoWordmark size={18} light />
        </div>
      ) : (
        <div style={{
          flex: '1 1 380px', minHeight: '38vh', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(160deg, #002973 0%, #0d47a8 55%, #125ecc 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '56px',
        }}>
          <svg width="560" height="560" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', bottom: '-200px', right: '-200px', opacity: 0.08 }} aria-hidden="true">
            {[0, 60, 120, 180, 240, 300].map(a => (
              <circle key={a} cx={12 + 4.4 * Math.cos((a * Math.PI) / 180)} cy={12 + 4.4 * Math.sin((a * Math.PI) / 180)} r="5.8" stroke="#ffffff" strokeWidth="0.5" />
            ))}
          </svg>
          <VfoWordmark size={24} light />
          <h1 style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: '34px', color: '#ffffff', margin: '28px 0 14px', lineHeight: 1.15, maxWidth: '420px' }}>
            Virtual Family Office team
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.72)', margin: 0, lineHeight: 1.6, maxWidth: '400px' }}>
            Top national specialists in tax planning, legal services, risk mitigation, wealth management, and business advisory services.
          </p>
          <div style={{ width: '46px', height: '4px', borderRadius: '99px', background: '#fb895a', marginTop: '26px' }} />
        </div>
      )}
      <div style={{ flex: stacked ? '1 1 auto' : '1.2 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: stacked ? '16px 24px' : '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
