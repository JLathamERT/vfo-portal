import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'

// Public /membership-pay?token= page. The member chooses Bank account (ACH) or
// Card and pays their FIRST membership payment at the Stripe Checkout — the
// method is saved and future payments auto-charge on the same day each period.
// (Annual transfers / fully-credited plans have nothing due now: save-only.)
// Legacy members pay the same on card and ACH (no fee); New Model members see
// the standard 2.9% + $0.30 gross-up on the card option.

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function MembershipPayPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [hoveredOption, setHoveredOption] = useState(null)

  const token = searchParams.get('token')
  const setupSuccess = searchParams.get('setup_success') === '1'

  useEffect(() => {
    if (!token) { setError('Invalid setup link.'); setStatus('error'); return }
    if (setupSuccess) { setStatus('success'); return }
    load(token)
  }, [])

  async function load(t) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'membership_setup_load', token: t }),
      })
      const d = await res.json()
      if (d.error) { setError(d.error); setStatus('error'); return }
      setData(d)
      if (d.canceled) { setStatus('canceled'); return }
      if (d.update_mode) { setStatus('update'); return }
      setStatus('ready')
    } catch {
      setError('Failed to load your membership details.')
      setStatus('error')
    }
  }

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'membership_setup_checkout', token, method }),
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      setError(d.error || 'Failed to start the secure setup.')
      setStatus('error')
    } catch {
      setError('Failed to start the secure setup.')
      setStatus('error')
    }
  }

  if (status === 'loading') return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Loading your membership details…</p>
    </TokenShell>
  )

  if (status === 'redirecting') return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Redirecting to Stripe…</p>
    </TokenShell>
  )

  if (status === 'error') return (
    <TokenShell maxWidth={520}>
      <div style={messageCard}>
        <div style={{ ...iconCircle, background: '#ef444420' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>⚠️</span></div>
        <h1 style={title}>Something went wrong</h1>
        <p style={subtitle}>{error}</p>
      </div>
    </TokenShell>
  )

  if (status === 'success') return (
    <TokenShell maxWidth={520}>
      <div style={messageCard}>
        <div style={{ ...iconCircle, background: 'rgba(34,197,94,0.15)' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>✓</span></div>
        <h1 style={title}>You're all set</h1>
        <p style={subtitle}>
          Thank you — your payment method is saved securely with Stripe, and if a payment was due today it has been submitted
          (bank payments can take a few days to clear).<br />
          Future membership payments run automatically — no further action is needed.
        </p>
      </div>
    </TokenShell>
  )

  if (status === 'canceled') return (
    <TokenShell maxWidth={520}>
      <div style={messageCard}>
        <div style={{ ...iconCircle, background: 'rgba(107,114,128,0.15)' }}><span style={{ fontSize: '28px', lineHeight: 1 }}>ℹ️</span></div>
        <h1 style={title}>Plan no longer active</h1>
        <p style={subtitle}>This membership plan has been canceled. If you think this is a mistake, please contact VFO Services.</p>
      </div>
    </TokenShell>
  )

  if (status === 'update') {
    // An active plan in arrears: the link collects the missed months now (the
    // backend quotes the same rows it will charge) and saves the method for
    // the pulls that follow. With nothing owed it is the save-only update page.
    const owed = Number(data.amount) || 0
    const owedToday = !!data.pay_today && owed > 0
    const owedFee = !!data.card_fee_applies
    const owedCardTotal = owedFee && owedToday ? Math.round((owed + 0.30) / (1 - 0.029) * 100) / 100 : owed
    const owedCardFee = Math.round((owedCardTotal - owed) * 100) / 100
    const owedMonths = Array.isArray(data.arrears_months) ? data.arrears_months.join(', ') : ''
    return (
    <TokenShell>
      <div style={{ width: '100%' }}>
        <div style={{ ...iconCircle, width: '64px', height: '64px', background: owedToday ? 'rgba(180,83,9,0.15)' : 'rgba(0,149,255,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...title, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>{owedToday ? 'Update Your Payment Method & Pay Now' : 'Update Your Payment Method'}</h1>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '32px' }}>
          Hi {data.first_name} — choose a new payment method for your membership.
          {data.current_method ? <> You're currently paying by {data.current_method === 'ach' ? 'bank account' : 'card'}{data.current_last4 ? ` ending ${data.current_last4}` : ''}.</> : null}
          <br />
          {owedToday ? (
            <>Your outstanding membership payment of <strong>${fmt(owed)}</strong>{owedMonths ? <> for <strong>{owedMonths}</strong></> : null} is collected securely today, and future membership payments use the new method automatically.</>
          ) : (
            <>Nothing is charged now — future membership payments use the new method automatically.</>
          )}
        </p>
        <OptionCard
          isHovered={hoveredOption === 'ach'} onHover={() => setHoveredOption('ach')} onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')}
          title="Bank Account (ACH)" badgeText="No Fee" badgeClass="green" amount={owedToday ? owed : null} cadence={owedToday ? 'due today' : null}
          breakdown={owedToday ? [
            { label: 'Outstanding membership fees', value: `$${fmt(owed)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ] : []} footer="Payments transfer directly from your bank account."
        />
        <div style={divider}>— or —</div>
        <OptionCard
          isHovered={hoveredOption === 'card'} onHover={() => setHoveredOption('card')} onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')}
          title="Credit / Debit Card" badgeText={owedFee && owedToday ? '2.9% + $0.30 Fee' : owedFee ? '2.9% + $0.30 Fee on charges' : 'No Fee'} badgeClass={owedFee ? 'blue' : 'green'} amount={owedToday ? owedCardTotal : null} cadence={owedToday ? 'due today' : null}
          breakdown={owedToday ? (owedFee ? [
            { label: 'Outstanding membership fees', value: `$${fmt(owed)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${fmt(owedCardFee)}`, valueColor: 'var(--vfo-ink-2)' },
          ] : [
            { label: 'Outstanding membership fees', value: `$${fmt(owed)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]) : []} footer="Payments charge to your card automatically."
        />
        <p style={securityNote}>
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
        </p>
      </div>
    </TokenShell>
    )
  }

  const base = Number(data.amount) || 0
  const feeApplies = !!data.card_fee_applies
  const payToday = !!data.pay_today
  const cardTotal = feeApplies && payToday ? Math.round((base + 0.30) / (1 - 0.029) * 100) / 100 : base
  const cardFee = Math.round((cardTotal - base) * 100) / 100
  const cadence = data.frequency === 'monthly' ? 'per month' : 'per year'
  const renewalFmt = fmtLong(data.renewal_date)
  // A monthly transfer that keeps a fixed charge day: the link only saves the
  // method. The member's page stays free of amounts, counts and dates so nothing
  // reads as a charge happening today — the admin preview carries the figures.
  const daySched = !payToday && data.first_charge_date && data.charge_day ? data : null

  return (
    <TokenShell>
      <div style={{ width: '100%' }}>
        <div style={{ ...iconCircle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...title, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>Set Up Your Membership Payment</h1>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '12px' }}>
          Hi {data.first_name} — choose how you'd like your VFO membership to be paid.
        </p>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '32px', fontSize: '13px' }}>
          {payToday ? (
            <>Your first payment of <strong>${fmt(base)}</strong> is collected securely today
              {data.frequency === 'monthly' ? <> — then payments run automatically on the same day each month.</> : <> and covers your membership year.</>}</>
          ) : daySched ? (
            <><strong>Nothing is charged today.</strong> This securely saves your payment method — your membership
              payments then continue automatically on the {daySched.charge_day_ordinal} of each month, just as they do now.</>
          ) : (
            <><strong>Nothing is charged today.</strong> This securely saves your payment method
              {renewalFmt ? <> — your next membership charge is at your renewal on <strong>{renewalFmt}</strong>.</> : <> for your automatic membership payments.</>}</>
          )}
        </p>

        <OptionCard
          isHovered={hoveredOption === 'ach'}
          onHover={() => setHoveredOption('ach')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')}
          title="Bank Account (ACH)"
          badgeText="No Fee"
          badgeClass="green"
          amount={daySched ? null : base}
          cadence={daySched ? null : cadence}
          breakdown={daySched ? [] : [
            { label: 'VFO Membership', value: `$${fmt(base)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer="Payments transfer directly from your bank account."
        />

        <div style={divider}>— or —</div>

        <OptionCard
          isHovered={hoveredOption === 'card'}
          onHover={() => setHoveredOption('card')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')}
          title="Credit / Debit Card"
          badgeText={feeApplies && payToday ? '2.9% + $0.30 Fee' : feeApplies ? '2.9% + $0.30 Fee on charges' : 'No Fee'}
          badgeClass={feeApplies ? 'blue' : 'green'}
          amount={daySched ? null : cardTotal}
          cadence={daySched ? null : cadence}
          breakdown={daySched ? [] : feeApplies && payToday ? [
            { label: 'VFO Membership', value: `$${fmt(base)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${fmt(cardFee)}`, valueColor: 'var(--vfo-ink-2)' },
          ] : [
            { label: 'VFO Membership', value: `$${fmt(base)}`, valueColor: 'var(--vfo-ink-2)' },
            { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' },
          ]}
          footer="Payments charge to your card automatically."
        />

        <p style={securityNote}>
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
        </p>
      </div>
    </TokenShell>
  )
}

function OptionCard({ isHovered, onHover, onLeave, onClick, title: t, badgeText, badgeClass, amount, cadence, breakdown, footer }) {
  return (
    <div onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{ ...optionCard, borderColor: isHovered ? '#0095ff' : 'var(--vfo-border)', background: isHovered ? 'rgba(0,149,255,0.05)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{t}</span>
        <span style={{ ...badgeBase, ...badgeStyles[badgeClass] }}>{badgeText}</span>
      </div>
      {amount !== null && <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '4px' }}>${fmt(amount)}</div>}
      {cadence && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{cadence}</div>}
      <div style={{ marginBottom: '16px' }}>
        {breakdown.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--vfo-muted)' }}>{row.label}</span>
            <span style={{ color: row.valueColor, fontWeight: 600 }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>{footer}</div>
    </div>
  )
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Date-only ISO strings from the API — the T00:00:00 keeps them on their own day.
function fmtLong(iso) {
  if (!iso) return null
  return new Date(String(iso).slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const messageCard = { textAlign: 'center', padding: '12px 0' }
const iconCircle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const title = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitle = { fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const optionCard = { border: '2px solid var(--vfo-border)', borderRadius: '16px', padding: '28px', marginBottom: '16px', cursor: 'pointer', transition: 'all 0.2s' }
const badgeBase = { fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const badgeStyles = {
  green: { background: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  blue: { background: 'rgba(0,149,255,0.15)', color: '#0095ff' },
}
const divider = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: '8px 0' }
const securityNote = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6 }
