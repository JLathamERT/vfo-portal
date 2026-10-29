import VfoWordmark from './VfoWordmark'
import { useIsPhone } from '../../lib/useMediaQuery'

// Branded shell for public token pages (pay / decide / setup links): navy
// gradient header with the wordmark, page background, and a centered white
// card with the gradient accent strip. Presentation only — children carry
// all content and behavior.
export default function TokenShell({ children, maxWidth = 560 }) {
  // Phone: the page gutter + card padding (content ~30px from the edge, not 52px).
  const isPhone = useIsPhone()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', height: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,41,115,0.25)', flexShrink: 0 }}>
        <VfoWordmark size={17} light />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isPhone ? '20px var(--vfo-gutter)' : '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: `${maxWidth}px`, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
          <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
          <div style={{ padding: isPhone ? '24px var(--vfo-card-pad)' : '36px 32px' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}
