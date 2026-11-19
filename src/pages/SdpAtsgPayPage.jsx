import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

// The SDP ATSG client payment page (2026-11-17): a copy of /tax-pay — ACH with no
// fee or card with 2.9% + $0.30 — branded SDP & VFO Services. One link per
// client covers the first advisory retainer payment, any missed payment and
// "update payment method" (?update=1, saves only); a Strategy Impact Fee has its own.

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'
const SDP_ORANGE = '#fd681d'

async function post(body) {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

export default function SdpAtsgPayPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const wantUpdate = searchParams.get('update') === '1'
  const done = searchParams.get('done') === '1'
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    if (!token) { setError('Invalid payment link.'); setStatus('error'); return }
    if (done) { setStatus('done'); return }
    post({ action: 'sdp_atsg_pay_load', token, update: wantUpdate })
      .then(d => {
        if (d.error) { setError(d.error); setStatus('error'); return }
        setData(d)
        setStatus(d.closed ? 'closed' : 'ready')
      })
      .catch(() => { setError('Failed to load payment details.'); setStatus('error') })
  }, [])

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const d = await post({ action: 'sdp_atsg_pay_checkout', token, method, update: wantUpdate })
      if (d.url) { window.location.href = d.url; return }
      setError(d.error || 'Failed to create checkout session.')
      setStatus('error')
    } catch {
      setError('Failed to initiate payment.')
      setStatus('error')
    }
  }

  if (status === 'loading' || status === 'redirecting') return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>{status === 'loading' ? 'Loading payment details…' : 'Redirecting to Stripe…'}</p>
    </TokenShell>
  )

  if (status === 'error' || status === 'closed' || status === 'done') {
    const ok = status !== 'error'
    return (
      <TokenShell maxWidth={520}>
        <div style={messageCardStyle}>
          <div className="vfo-statusicon" style={{ ...iconCircleStyle, background: ok ? 'rgba(34,197,94,0.15)' : '#ef444420' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: ok ? '#16a34a' : '#ef4444', lineHeight: 1 }}>{ok ? '✓' : '!'}</span>
          </div>
          <h1 style={titleStyle}>{status === 'done' ? 'Thank you' : ok ? 'Nothing to pay' : 'Payment Error'}</h1>
          <p style={subtitleStyle}>{status === 'done' ? 'Your details have been received by Stripe. You will get an email confirmation shortly.' : status === 'closed' ? data?.message : error}</p>
        </div>
      </TokenShell>
    )
  }

  const heading = (
    <>
      <div className="vfo-statusicon" style={{ ...iconCircleStyle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
      </div>
      <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>
        <span style={{ color: SDP_ORANGE }}>SDP</span> &amp; VFO Services Payment
      </h1>
    </>
  )

  if (data.mode === 'update') return (
    <TokenShell>
      <div style={pageContainerStyle}>
        {heading}
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>Update the payment method for your advisory retainer</p>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '32px', fontSize: '13px' }}>
          {data.client_name}{data.method_on_file ? ` · on file now: ${data.method_on_file}` : ''}
        </p>
        <OptionCard isHovered={hoveredOption === 'ach'} onHover={() => setHoveredOption('ach')} onLeave={() => setHoveredOption(null)} onClick={() => handleChoice('ach')}
          title="ACH Bank Account" badgeText="No Fee" badgeClass="green" amount={null}
          breakdown={[{ label: 'Charged today', value: '$0.00', valueColor: '#16a34a' }]}
          footer="Your remaining payments are collected from this bank account with no fee." />
        <div style={dividerStyle}>— or —</div>
        <OptionCard isHovered={hoveredOption === 'card'} onHover={() => setHoveredOption('card')} onLeave={() => setHoveredOption(null)} onClick={() => handleChoice('card')}
          title="Credit / Debit Card" badgeText="2.9% + $0.30 Fee" badgeClass="blue" amount={null}
          breakdown={[{ label: 'Charged today', value: '$0.00', valueColor: '#16a34a' }]}
          footer="Your remaining payments are collected from this card, each with the 2.9% + $0.30 card processing fee." />
        <p style={securityNoteStyle}>Your payment details are handled securely by Stripe.<br />We never see or store your payment information.</p>
      </div>
    </TokenShell>
  )

  const baseAmount = Number(data.payment_amount) || 0
  const cardTotal = Number(data.card_total) || baseAmount
  const cardFee = Math.round((cardTotal - baseAmount) * 100) / 100
  const missed = Array.isArray(data.missed) ? data.missed : []
  const lineRows = (data.lines || []).map(l => ({ label: l.label, value: `$${formatMoney(l.amount)}`, valueColor: 'var(--vfo-ink-2)' }))

  return (
    <TokenShell>
      <div style={pageContainerStyle}>
        {heading}
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>Choose your preferred payment method</p>
        <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: missed.length ? '20px' : '32px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
          {data.payment_label} · {data.client_name}
        </p>
        {missed.length > 0 && (
          <div style={missedNoticeStyle}>
            {missed.length === 1
              ? <>Your {missed[0].label} payment{missed[0].due ? <>, due {missed[0].due},</> : null} did not go through. Pay it here; the card or bank you use is saved for your later payments.</>
              : <>{missed.length} advisory retainer payments did not go through: {missed.map(m => `${m.short}${m.due ? ` (due ${m.due})` : ''}`).join(', ')}. Pay them here; the card or bank you use is saved for your later payments.</>}
          </div>
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
          breakdown={[...lineRows, { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' }]}
          footer={`Funds transfer directly from your bank account. Takes 3-5 business days to clear.${data.saves_method ? ' Your later advisory retainer payments are collected from this account.' : ''}`}
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
          breakdown={[...lineRows, { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${formatMoney(cardFee)}`, valueColor: 'var(--vfo-ink-2)' }]}
          footer={`Processes immediately. The processing fee covers card transaction costs.${data.saves_method ? ' Your later advisory retainer payments are collected from this card.' : ''}`}
        />

        <p style={securityNoteStyle}>
          Your payment details are handled securely by Stripe.<br />
          We never see or store your payment information.
        </p>
      </div>
    </TokenShell>
  )
}

function OptionCard({ isHovered, onHover, onLeave, onClick, title, badgeText, badgeClass, amount, breakdown, footer }) {
  return (
    <div
      className="vfo-paycard"
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
      {amount != null && <div style={optionAmountStyle}>${formatMoney(amount)}</div>}
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
const missedNoticeStyle = { background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.35)', borderRadius: '12px', padding: '12px 16px', marginBottom: '24px', fontSize: '13px', lineHeight: 1.5, color: '#b45309', textAlign: 'center' }
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
