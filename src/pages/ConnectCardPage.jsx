import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import { TokenFormSkeleton } from '../components/shared/Skeleton'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// Public, no-login page reached from the migration "set up your payment method" email
// (clients moved off QBO who aren't on Stripe yet). They enter a card or bank on
// Stripe's hosted setup page (mode:'setup', NO charge); the card_update webhook then
// saves it so the engine can charge their scheduled payments. We never see the numbers.
export default function ConnectCardPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const justDone = searchParams.get('done') === '1'
  const [status, setStatus] = useState('loading') // loading | ready | error | redirecting
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    if (!token) { setError('This setup link is invalid.'); setStatus('error'); return }
    load(token)
  }, [])

  async function load(tok) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migration_connect_load', token: tok }),
      })
      const d = await res.json()
      if (d.error) { setError(d.error); setStatus('error'); return }
      setData(d)
      setStatus('ready')
    } catch {
      setError('Failed to load your details.')
      setStatus('error')
    }
  }

  async function choose(method) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migration_connect_checkout', token, method }),
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      setError(d.error || 'Could not start the setup.')
      setStatus('error')
    } catch {
      setError('Could not start the setup.')
      setStatus('error')
    }
  }

  if (status === 'loading') return (
    <TokenShell><TokenFormSkeleton /></TokenShell>
  )
  if (status === 'redirecting') return (
    <TokenShell><p style={centerMuted}>Redirecting to Stripe…</p></TokenShell>
  )
  if (status === 'error') return (
    <TokenShell maxWidth={520}>
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <h1 style={titleStyle}>Something went wrong</h1>
        <p style={subtitleStyle}>{error}</p>
      </div>
    </TokenShell>
  )

  const done = justDone || data?.done
  // Past-due installments the nightly sweep will collect as soon as a method is
  // saved — the breakdown becomes one row per installment instead of a single
  // "per quarterly payment" line, so the total on the headline is accounted for.
  const dueNowRows = Array.isArray(data?.due_now_rows) ? data.due_now_rows : []
  const amountRow = data?.amount != null
    ? [
        ...(dueNowRows.length > 0
          ? dueNowRows.map((r) => ({
              label: `VFO Services payment (due ${formatDate(r.date)})`,
              value: `$${formatMoney(r.amount)}`,
              valueColor: 'var(--vfo-ink-2)',
            }))
          : [{ label: `VFO Services payment${data?.amount_label ? ` (${data.amount_label})` : ''}`, value: `$${formatMoney(data.amount)}`, valueColor: 'var(--vfo-ink-2)' }]),
        { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
      ]
    : []

  return (
    <TokenShell maxWidth={540}>
      <div style={{ width: '100%' }}>
        <h1 style={{ ...titleStyle, fontSize: '22px', textAlign: 'center', marginBottom: '6px' }}>Set Up Your Payment Method</h1>
        {data?.client_name && (
          <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '20px' }}>{data.client_name} · {data.label}</p>
        )}

        {done ? (
          <div style={{ marginTop: '8px', padding: '16px 18px', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '12px', color: '#0f7a3d', fontSize: '14px', textAlign: 'center' }}>
            You're all set — your payment method is saved. Your scheduled payments will run automatically. You can close this page.
          </div>
        ) : (
          <>
            <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '12px' }}>Choose your preferred payment method</p>
            <p style={{ ...subtitleStyle, textAlign: 'center', marginBottom: '20px', fontSize: '13px', color: 'var(--vfo-muted)' }}>
              {dueNowRows.length > 0
                ? `Saving your payment method is free. Once it's saved, your ${dueNowRows.length} past-due payment${dueNowRows.length === 1 ? '' : 's'} totaling $${formatMoney(data.amount)} will be collected automatically.`
                : 'Add the card or bank account for your VFO Services payments. There is no charge for setting this up.'}
            </p>

            <OptionCard
              isHovered={hoveredOption === 'ach'}
              onHover={() => setHoveredOption('ach')}
              onLeave={() => setHoveredOption(null)}
              onClick={() => choose('ach')}
              title="ACH Bank Transfer"
              badgeText="No Fee"
              badgeClass="green"
              amount={data?.amount}
              breakdown={amountRow}
              footer="Funds transfer directly from your bank account. Takes 3-5 business days to process."
            />

            <div style={dividerStyle}>— or —</div>

            <OptionCard
              isHovered={hoveredOption === 'card'}
              onHover={() => setHoveredOption('card')}
              onLeave={() => setHoveredOption(null)}
              onClick={() => choose('card')}
              title="Credit / Debit Card"
              badgeText="No Fee"
              badgeClass="green"
              amount={data?.amount}
              breakdown={amountRow}
              footer="Processes immediately. No card processing fee applies."
            />
          </>
        )}

        <p style={securityNote}>
          Your details are entered directly with Stripe.<br />
          VFO Services never sees or stores your card or bank information.
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
      {amount != null && (
        <div style={optionAmountStyle}>${formatMoney(amount)}</div>
      )}
      {breakdown.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {breakdown.map((row, i) => (
            <div key={i} style={optionDetailRowStyle}>
              <span style={{ color: 'var(--vfo-muted)' }}>{row.label}</span>
              <span style={{ color: row.valueColor, fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <div style={optionFooterStyle}>{footer}</div>
    </div>
  )
}

function formatMoney(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Same UTC formatting the schedule email uses, so the dates on the page match it exactly.
function formatDate(d) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const centerMuted = { color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitleStyle = { fontSize: '14px', color: 'var(--vfo-muted)', margin: 0 }

const optionCardStyle = {
  border: '2px solid var(--vfo-border)',
  borderRadius: '16px',
  padding: '28px',
  marginBottom: '16px',
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const optionHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}

const optionTitleStyle = {
  fontSize: '16px',
  fontWeight: 700,
  color: 'var(--vfo-ink)',
}

const optionBadgeBaseStyle = {
  fontSize: '11px',
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: '20px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const badgeStyles = {
  green: { background: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  blue: { background: 'rgba(0,149,255,0.15)', color: '#0095ff' },
}

const optionAmountStyle = {
  fontSize: '28px',
  fontWeight: 700,
  color: 'var(--vfo-ink)',
  marginBottom: '16px',
}

const optionDetailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '13px',
}

const optionFooterStyle = {
  fontSize: '12px',
  color: 'var(--vfo-muted)',
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: '1px solid var(--vfo-border-soft)',
}

const dividerStyle = {
  textAlign: 'center',
  color: 'var(--vfo-muted)',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  margin: '8px 0',
}

const securityNote = {
  textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6,
}
