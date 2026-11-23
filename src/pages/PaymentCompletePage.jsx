import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

// PUBLIC page — /payment-complete?m=card|ach[&verify=1][&setup=1]. Where Stripe sends
// a payer after a hosted Checkout (the backend's utils/payment-complete-url.ts builds
// the link). It reads nothing and carries no token: the wording comes from the method.
//   verify  the payer could type bank details in, so Stripe may still need to verify them
//   setup   a monthly payment was set up and nothing was charged today
export default function PaymentCompletePage() {
  const [searchParams] = useSearchParams()
  const bank = searchParams.get('m') === 'ach'
  const setup = searchParams.get('setup') === '1'
  const verify = bank && searchParams.get('verify') === '1'

  const title = setup ? "You're all set" : bank ? 'Thank you - your bank payment is on its way' : 'Thank you'
  const message = setup
    ? 'Your payment method is saved and nothing was charged today. Your first payment is collected on your charge day.'
    : bank
      ? 'Bank payments take 3-5 business days to clear. Your receipt will follow by email.'
      : 'Your payment has been processed. Your receipt will follow by email.'

  return (
    <TokenShell maxWidth={520}>
      <div style={messageCardStyle}>
        <div className="vfo-statusicon" style={iconCircleStyle}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 style={titleStyle}>{title}</h1>
        <p style={subtitleStyle}>{message}</p>
        {verify && <p style={subtitleStyle}>If you typed in your bank details, Stripe will email you a link to verify them.</p>}
        <p style={{ ...subtitleStyle, marginBottom: 0 }}>You can close this page.</p>
      </div>
    </TokenShell>
  )
}

const messageCardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', background: 'rgba(34,197,94,0.15)' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginTop: 0, marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6, margin: '0 0 10px' }
