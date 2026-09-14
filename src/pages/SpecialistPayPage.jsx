import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import { ordinal } from '../lib/ordinal'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function SpecialistPayPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)
  const type = searchParams.get('type') === 'max' ? 'max' : 'core'
  // kind=license → recurring $99/mo VFO License subscription; otherwise the
  // one-time Core/Max background-check payment.
  const isLicense = searchParams.get('kind') === 'license'

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setError('Invalid payment link.'); setStatus('error'); return }
    loadPaymentData(token)
  }, [])

  async function loadPaymentData(token) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLicense
          ? { action: 'automation_SPECIALIST_licloadpayment', token }
          : { action: 'automation_SPECIALIST_bgloadpayment', token, type }),
      })
      const d = await res.json()
      if (d.error) { setError(d.error); setStatus('error'); return }
      setData(d)
      setStatus('ready')
    } catch {
      setError('Failed to load payment details.')
      setStatus('error')
    }
  }

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLicense
          ? { action: 'automation_SPECIALIST_liccheckout', token: searchParams.get('token'), method }
          : { action: 'automation_SPECIALIST_bgcheckout', token: searchParams.get('token'), method, type }),
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
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

  const baseAmount = isLicense ? (Number(data.monthly_amount) || 0) : (Number(data.payment_amount) || 0)
  const cardTotal = Math.round((baseAmount + 0.30) / (1 - 0.029) * 100) / 100
  const cardFee = Math.round((cardTotal - baseAmount) * 100) / 100
  const lineLabel = isLicense ? 'VFO Monthly License' : `${data.check_type} Background Check & Due Diligence`
  const amtSuffix = isLicense ? '/mo' : ''
  // A license CONTINUATION (existing specialist moved onto the portal) is ACH-only —
  // the checkout action rejects card for these, so the card option is never offered.
  const isContinuation = isLicense && !!data.continuation
  const chargeDay = Number(data.charge_day) || 0
  const dayText = chargeDay ? `${ordinal(chargeDay)} of the month` : 'charge day'

  return (
    <TokenShell>
      <div style={pageContainerStyle}>
        <div style={{ ...iconCircleStyle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>{isLicense ? 'VFO Specialist Monthly License' : 'VFO Specialist Background Check & Due Diligence'}</h1>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>{isContinuation ? 'Set up your monthly bank transfer (ACH)' : 'Choose your preferred payment method'}</p>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '32px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          {isLicense ? `$99/month recurring · ${data.specialist_name}` : `${data.check_type} background check & due diligence · ${data.specialist_name}`}
        </p>

        <OptionCard
          isHovered={hoveredOption === 'ach'} onHover={() => setHoveredOption('ach')} onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')} title="ACH Bank Transfer" badgeText="No Fee" badgeClass="green" amount={baseAmount} suffix={amtSuffix}
          breakdown={[
            { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer={isContinuation
            ? `Funds transfer directly from your bank account. Nothing is charged today — your first payment collects on the ${dayText} (next month's if this month's has already passed) and monthly on that day after that.`
            : isLicense ? 'Funds transfer directly from your bank account. Your license renews automatically each month.' : 'Funds transfer directly from your bank account. Takes 2-4 business days to process.'}
        />

        {!isContinuation && (
          <>
            <div style={dividerStyle}>— or —</div>

            <OptionCard
              isHovered={hoveredOption === 'card'} onHover={() => setHoveredOption('card')} onLeave={() => setHoveredOption(null)}
              onClick={() => handleChoice('card')} title="Credit / Debit Card" badgeText="2.9% + $0.30 Fee" badgeClass="blue" amount={cardTotal} suffix={amtSuffix}
              breakdown={[
                { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
                { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${formatMoney(cardFee)}`, valueColor: 'var(--vfo-ink-2)' },
              ]}
              footer={isLicense ? 'Charged immediately and automatically each month. The processing fee covers card transaction costs.' : 'Processes immediately. The processing fee covers card transaction costs.'}
            />
          </>
        )}

        <p style={securityNoteStyle}>
          {isContinuation
            ? `Your bank details are saved securely through Stripe. Nothing is charged at setup — $99 is transferred on the ${dayText} each month until cancelled. To change your bank details, contact us.`
            : isLicense ? 'The payment method you choose will be charged $99 each month until cancelled. To change it, contact us.' : ''}<br />
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
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
