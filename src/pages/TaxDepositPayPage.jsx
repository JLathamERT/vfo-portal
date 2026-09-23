import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// PUBLIC page — /tax-deposit-pay?token=… (2026-09-23). The card-or-ACH choice for
// the $500 Tax Planning Deposit. Every route lands here: the member portal form
// (route A) after Submit, the client's /tax-intake form (route B) after Submit,
// and the VFO Tax Diagnostic's "Pay deposit" email button.
//
// The token in the URL is the whole credential (#310): the page sends the token
// and the chosen method and nothing else. The figures (card total, card fee) come
// from tax_intake_deposit_load and are never recomputed here.
//
// Structure modelled on BgRequestPay (SpecialistPayPage.jsx); the choice cards and
// their copy are TaxPayPage.jsx's. Raw fetch like every other token page. No emoji.
export default function TaxDepositPayPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const returnedPaid = searchParams.get('paid') === '1'
  const returnedAch = searchParams.get('ach') === '1'
  const returnedCanceled = searchParams.get('canceled') === '1'
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    if (!token) { setError('This link is not valid.'); setStatus('error'); return }
    let live = true
    ;(async () => {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tax_intake_deposit_load', token }),
        })
        const d = await res.json().catch(() => ({}))
        if (!live) return
        if (!res.ok || d.error) { setError(d.error || 'This link is not valid.'); setStatus('error'); return }
        setData(d)
        setStatus('ready')
      } catch {
        if (!live) return
        setError('Unable to connect. Please try again later.')
        setStatus('error')
      }
    })()
    return () => { live = false }
  }, [token])

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tax_intake_deposit_checkout', token, method }),
      })
      const d = await res.json().catch(() => ({}))
      if (d.url) { window.location.assign(d.url); return }
      if (d.waived) { setData(prev => ({ ...(prev || {}), state: 'waived' })); setStatus('ready'); return }
      if (d.state === 'processing') { setData(prev => ({ ...(prev || {}), state: 'processing' })); setStatus('ready'); return }
      setError(d.error || 'Could not start the payment — please try again.')
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
        <div style={{ ...iconCircleStyle, background: '#ef444420', color: '#ef4444', fontSize: '30px', fontWeight: 800 }}>!</div>
        <h1 style={titleStyle}>Payment Error</h1>
        <p style={subtitleStyle}>{error}</p>
      </div>
    </TokenShell>
  )

  if (status === 'redirecting') return (
    <TokenShell><p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Redirecting to Stripe…</p></TokenShell>
  )

  const state = data?.state
  const clientName = `${data?.client_first_name || ''} ${data?.client_last_name || ''}`.trim()

  if (state === 'not_ready') return (
    <TokenShell maxWidth={520}>
      <Message tone="muted" title="This link is not ready yet." message="Please use the link in your email to complete the Tax Planning Form first." />
    </TokenShell>
  )

  // A bank transfer in flight (the row says so, or the payer just came back from
  // Stripe having chosen ACH): nothing left to choose.
  if (state === 'processing' || (returnedPaid && returnedAch && state !== 'paid' && state !== 'completed')) return (
    <TokenShell maxWidth={520}>
      <Message tone="green" title="Thank you — payment submitted" message="Bank transfers take 2-4 business days to clear; your invoice and receipt will follow by email." />
    </TokenShell>
  )

  // Card paid (a just-returned card payer may beat the webhook, so paid=1 alone is
  // trusted here), or the row already records the deposit.
  if (state === 'paid' || state === 'completed' || (returnedPaid && state !== 'not_ready' && state !== 'waived')) return (
    <TokenShell maxWidth={520}>
      <Message tone="green" title="Thank you." message="Your deposit has been received. A confirmation email is on its way, and the tax planning team will be allocated in due course." />
    </TokenShell>
  )

  if (state === 'waived') return (
    <TokenShell maxWidth={520}>
      <Message tone="green" title="Thank you." message="No deposit is needed. A confirmation email is on its way, and the tax planning team will be allocated in due course." />
    </TokenShell>
  )

  // Payable, but the member now qualifies for the waiver: the checkout recomputes
  // it server-side and completes without a payment.
  if (data?.deposit_required === false) return (
    <TokenShell maxWidth={520}>
      <div style={messageCardStyle}>
        <h1 style={titleStyle}>No deposit needed</h1>
        <p style={{ ...subtitleStyle, marginBottom: '24px' }}>The Tax Planning Deposit is not needed for {clientName || 'this client'}. Please continue to complete the request.</p>
        <button type="button" onClick={() => handleChoice('card')} style={continueButtonStyle}>Continue</button>
      </div>
    </TokenShell>
  )

  const baseAmount = Number(data.deposit_amount) || 0
  const cardTotal = Number(data.card_total) || 0
  const cardFee = Number(data.card_fee) || 0
  const lineLabel = 'Tax Planning Deposit'
  const notice = data.failed_before
    ? 'Your previous bank payment did not go through — please choose a method to pay again.'
    : returnedCanceled ? 'Payment not completed — choose a method to try again.' : ''

  return (
    <TokenShell>
      <div style={pageContainerStyle}>
        <div style={{ ...iconCircleStyle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </div>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>VFO Tax Planning Deposit</h1>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>Choose your preferred payment method</p>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: notice ? '16px' : '32px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          {lineLabel}{clientName ? ` · ${clientName}` : ''}
        </p>
        {notice && (
          <p style={noticeStyle}>{notice}</p>
        )}

        <OptionCard
          isHovered={hoveredOption === 'ach'}
          onHover={() => setHoveredOption('ach')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')}
          title="ACH Bank Transfer"
          badgeText="No Fee"
          badgeClass="green"
          amount={baseAmount}
          breakdown={[
            { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer="Funds transfer directly from your bank account. Takes 2-4 business days to process."
        />

        <div style={dividerStyle}>— or —</div>

        <OptionCard
          isHovered={hoveredOption === 'card'}
          onHover={() => setHoveredOption('card')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')}
          title="Credit / Debit Card"
          badgeText="2.9% + $0.30 Fee"
          badgeClass="blue"
          amount={cardTotal}
          breakdown={[
            { label: lineLabel, value: `$${formatMoney(baseAmount)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${formatMoney(cardFee)}`, valueColor: 'var(--vfo-ink-2)' },
          ]}
          footer="Processes immediately. The processing fee covers card transaction costs."
        />

        <p style={securityNoteStyle}>
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
        </p>
      </div>
    </TokenShell>
  )
}

function Message({ tone, title, message }) {
  const green = tone === 'green'
  return (
    <div style={messageCardStyle}>
      <div style={{ ...iconCircleStyle, background: green ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)' }}>
        {green
          ? <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>}
      </div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={subtitleStyle}>{message}</p>
    </div>
  )
}

function OptionCard({ isHovered, onHover, onLeave, onClick, title, badgeText, badgeClass, amount, breakdown, footer }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...optionCardStyle,
        borderColor: isHovered ? '#0095ff' : 'var(--vfo-border)',
        background: isHovered ? 'rgba(0,149,255,0.05)' : 'transparent',
      }}
    >
      <div style={optionHeaderStyle}>
        <span style={optionTitleStyle}>{title}</span>
        <span style={{ ...optionBadgeBaseStyle, ...badgeStyles[badgeClass] }}>{badgeText}</span>
      </div>
      <div style={optionAmountStyle}>${formatMoney(amount)}</div>
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
const noticeStyle = { fontSize: '13px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '0 0 24px', textAlign: 'center' }
const continueButtonStyle = { padding: '12px 28px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#1b9254', color: '#fff', fontFamily: 'Inter, sans-serif' }
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
