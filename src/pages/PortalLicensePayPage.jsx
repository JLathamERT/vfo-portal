import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// /portal-license-pay (portal licensing L4, 2026-10-16): the card-or-bank choice
// page for a member's $25/month Standard client portal (CIQ licence) - a copy of
// the /specialist-pay?kind=license page (Jake: "copy EXACTLY how it's done
// everywhere else"). The token row is the whole credential; the page sends the
// token and the chosen method and nothing else. Stripe returns the member to their
// client's page.
export default function PortalLicensePayPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const returnedCanceled = searchParams.get('canceled') === '1'
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    if (!token) { setError('Invalid payment link.'); setStatus('error'); return }
    ;(async () => {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'portal_license_pay_load', token }),
        })
        const d = await res.json()
        if (d.error) { setError(d.error); setStatus('error'); return }
        setData(d)
        setStatus('ready')
      } catch {
        setError('Failed to load payment details.')
        setStatus('error')
      }
    })()
  }, [])

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'portal_license_pay_checkout', token, method }),
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      if (d.already) { setData(x => ({ ...(x || {}), already: true, client_id: d.client_id || x?.client_id })); setStatus('ready'); return }
      setError(d.error || 'Failed to create checkout session.')
      setStatus('error')
    } catch {
      setError('Failed to initiate payment.')
      setStatus('error')
    }
  }

  if (status === 'loading') return (
    <TokenShell><p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Loading payment details…</p></TokenShell>
  )

  if (status === 'error') return (
    <TokenShell maxWidth={520}>
      <div style={messageCardStyle}>
        <div style={{ ...iconCircleStyle, background: '#ef444420' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>⚠️</span></div>
        <h1 style={titleStyle}>Payment Error</h1>
        <p style={subtitleStyle}>{error}</p>
      </div>
    </TokenShell>
  )

  if (status === 'redirecting') return (
    <TokenShell><p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Redirecting to Stripe…</p></TokenShell>
  )

  const backHref = data?.client_id ? `/member/client/${data.client_id}?tab=home` : '/member'

  if (data.already) return (
    <TokenShell maxWidth={520}>
      <div style={messageCardStyle}>
        <div style={{ ...iconCircleStyle, background: 'rgba(34,197,94,0.15)' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 style={titleStyle}>Already set up</h1>
        <p style={subtitleStyle}>The Standard portal for {data.client_name} is already set up. <a href={backHref} style={{ color: 'var(--vfo-link)' }}>Back to {data.client_first}</a></p>
      </div>
    </TokenShell>
  )

  const baseAmount = Number(data.monthly_amount) || 0
  // The house card rule (Jake, 2026-10-16): card = 2.9% + $0.30 on top, ACH = no
  // fee. The loader says so explicitly (card_fee_applies); the server charges it.
  const cardFeeApplies = data.card_fee_applies === true
  const cardFee = cardFeeApplies ? Math.round(((baseAmount + 0.30) / (1 - 0.029) - baseAmount) * 100) / 100 : 0
  const cardTotal = Math.round((baseAmount + cardFee) * 100) / 100
  const lineLabel = 'VFO Portal Standard Licence'
  const amtSuffix = '/mo'

  return (
    <TokenShell>
      <div style={pageContainerStyle}>
        <div style={{ ...iconCircleStyle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>VFO Portal - Standard Client Portal</h1>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>Choose your preferred payment method</p>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: returnedCanceled ? '16px' : '32px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          ${formatMoney(baseAmount)}/month recurring · {data.client_name}
        </p>
        {returnedCanceled && (
          <p style={{ fontSize: '13px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '0 0 24px', textAlign: 'center' }}>Your payment was not completed. You can choose a payment method below whenever you are ready.</p>
        )}

        <OptionCard
          isHovered={hoveredOption === 'ach'} onHover={() => setHoveredOption('ach')} onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')} title="ACH Bank Transfer" badgeText="No Fee" badgeClass="green" amount={baseAmount} suffix={amtSuffix}
          breakdown={[
            { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer={`Funds transfer directly from your bank account — choose "Sign in to your bank" on the next page. The first payment takes 2-4 business days to clear; ${data.client_first} gets the Standard portal once it has. Renews automatically each month.`}
        />

        <div style={dividerStyle}>— or —</div>

        <OptionCard
          isHovered={hoveredOption === 'card'} onHover={() => setHoveredOption('card')} onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')} title="Credit / Debit Card"
          badgeText={cardFeeApplies ? '2.9% + $0.30 Fee' : 'No Fee'} badgeClass={cardFeeApplies ? 'blue' : 'green'}
          amount={cardTotal} suffix={amtSuffix}
          breakdown={[
            { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
            cardFeeApplies
              ? { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${formatMoney(cardFee)}`, valueColor: 'var(--vfo-ink-2)' }
              : { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer={`Charged immediately and automatically each month. ${data.client_first} gets the Standard portal straight away.`}
        />

        <p style={securityNoteStyle}>
          The payment method you choose will be charged {cardFeeApplies ? `$${formatMoney(baseAmount)} a month by bank, or $${formatMoney(cardTotal)} a month by card,` : `$${formatMoney(baseAmount)} each month`} until you turn it off from {data.client_first}'s Profile tab. {data.client_first} never sees the cost.<br />
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.<br />
          <a href={backHref} style={{ color: 'var(--vfo-link)' }}>← Back to {data.client_first}</a>
        </p>
      </div>
    </TokenShell>
  )
}

function OptionCard({ isHovered, onHover, onLeave, onClick, title, badgeText, badgeClass, amount, breakdown, footer, suffix = '' }) {
  return (
    <div onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{ ...optionCardStyle, borderColor: isHovered ? '#0095ff' : 'var(--vfo-border)', background: isHovered ? 'rgba(0,149,255,0.05)' : 'transparent' }}>
      <div style={optionHeaderStyle}>
        <span style={optionTitleStyle}>{title}</span>
        <span style={{ ...optionBadgeBaseStyle, ...badgeStyles[badgeClass] }}>{badgeText}</span>
      </div>
      <div style={optionAmountStyle}>${formatMoney(amount)}{suffix}</div>
      <div style={{ marginBottom: '16px' }}>
        {breakdown.map((row, i) => (
          <div key={i} style={optionDetailRowStyle}>
            <span style={{ color: 'var(--vfo-muted)' }}>{row.label}</span>
            <span style={{ color: row.valueColor, fontWeight: 600 }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={optionFooterStyle}>{footer}</div>
    </div>
  )
}

function formatMoney(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const pageContainerStyle = { width: '100%' }
const messageCardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)' }
const optionCardStyle = { border: '2px solid var(--vfo-border)', borderRadius: '16px', padding: '28px', marginBottom: '16px', cursor: 'pointer', transition: 'all 0.2s' }
const optionHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
const optionTitleStyle = { fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)' }
const optionBadgeBaseStyle = { fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const badgeStyles = { green: { background: 'rgba(34,197,94,0.15)', color: '#16a34a' }, blue: { background: 'rgba(0,149,255,0.15)', color: '#0095ff' } }
const optionAmountStyle = { fontSize: '28px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '16px' }
const optionDetailRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }
const optionFooterStyle = { fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }
const dividerStyle = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: '8px 0' }
const securityNoteStyle = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6 }
