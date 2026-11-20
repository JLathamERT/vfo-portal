import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import { callApi, getSession } from '../lib/api'
import { useGcPromo } from '../lib/gcPromo'
import { GC_NET_PRICES, creditWord, gcCardTotal, gcMoney2 as fmt } from '../lib/gcPackages'

// /growth-credits-pay?credits=<n> (2026-11-20): the bank-or-card choice for a
// Growth Credits package, in the house pay-page style (a copy of
// MembershipPayPage's layout and option cards). Two callers:
//  - a signed-in member from the portal's Buy Credits cards -> gc_create_checkout;
//  - &public=1 from the public /black-friday page, whose buyer details wait in
//    sessionStorage 'gcPublicBuyer' -> gc_public_checkout.
// Prices are display only; the server re-prices every checkout.

export default function GrowthCreditsPayPage() {
  const [params] = useSearchParams()
  const credits = Number(params.get('credits'))
  const isPublic = params.get('public') === '1'
  // The Black Friday deal (any 1-10 credits, the same free) - always on the public page.
  const isDeal = isPublic || params.get('deal') === '1'
  const session = getSession()
  const member = !isPublic && session?.role === 'member' && session?.member_number ? session : null
  const [buyer] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('gcPublicBuyer') || 'null') } catch { return null }
  })
  const promo = useGcPromo()
  const [freeLeft, setFreeLeft] = useState(null)
  const [status, setStatus] = useState('ready')
  const [error, setError] = useState('')
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    if (!member || !isDeal) { setFreeLeft(Infinity); return }
    callApi('gc_promo_member_claims', { member_number: member.member_number }).then(r => setFreeLeft(Number(r.remaining) || 0)).catch(() => setFreeLeft(0))
  }, [])

  const backHref = isPublic ? '/black-friday' : '/member'
  const backLabel = isPublic ? 'Back to the Black Friday deals' : 'Back to Growth Credits'

  if (!isDeal && !GC_NET_PRICES[credits]) return <Message icon="!" tone="red" title="Something went wrong" text="That credit package doesn't exist." backHref={backHref} backLabel={backLabel} />
  if (isPublic && !buyer?.email) return <Message icon="!" tone="red" title="Your details are missing" text="Please start again from the Black Friday page." backHref={backHref} backLabel={backLabel} />
  if (!isPublic && !member) return <Message icon="i" tone="grey" title="Please sign in" text="Sign in to your VFO portal to buy Growth Credits." backHref="/member/login" backLabel="Go to sign in" />
  if (!promo.loaded || freeLeft === null) return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Loading…</p>
    </TokenShell>
  )

  const deal = promo.live ? promo.deal : null
  if (isDeal && !deal) return <Message icon="i" tone="grey" title="This deal isn't available" text="The Black Friday sale is not running right now." backHref={backHref} backLabel={backLabel} />
  if (isDeal && (!Number.isInteger(credits) || credits < 1 || credits > deal.maxFree)) return <Message icon="!" tone="red" title="Something went wrong" text={`Choose between 1 and ${deal.maxFree} credits.`} backHref={backHref} backLabel={backLabel} />
  if (isDeal && credits > freeLeft) return <Message icon="i" tone="grey" title="Over your free credits" text={freeLeft > 0 ? `You can get up to ${freeLeft} more free ${freeLeft === 1 ? 'credit' : 'credits'} in this sale.` : "You've had all your free credits in this sale."} backHref={backHref} backLabel={backLabel} />
  const price = isDeal ? credits * deal.creditPrice : GC_NET_PRICES[credits]
  const bonus = isDeal ? credits : 0

  const firstName = isPublic ? buyer.first_name : String(member.name || '').split(' ')[0]
  const cardTotal = gcCardTotal(price)
  const cardFee = Math.round((cardTotal - price) * 100) / 100
  const total = credits + bonus
  const promoTitle = promo.promo?.title || 'Sale'
  const creditRows = [
    { label: `${credits} Growth ${creditWord(credits)}`, value: `$${fmt(price)}`, valueColor: 'var(--vfo-ink-2)' },
    ...(bonus > 0 ? [{ label: `${promoTitle} bonus: ${bonus} free ${bonus === 1 ? 'credit' : 'credits'}`, value: '$0.00', valueColor: '#d97706' }] : []),
  ]

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const res = isPublic
        ? await callApi('gc_public_checkout', { ...buyer, amount: credits, payment_method: method }, 1)
        : await callApi('gc_create_checkout', { member_number: member.member_number, amount: credits, payment_method: method, ...(isDeal ? { deal: true } : {}) }, 1)
      if (res.url) { window.location.href = res.url; return }
      setError('Failed to start the secure payment.')
      setStatus('error')
    } catch (e) {
      setError(e?.message || 'Failed to start the secure payment.')
      setStatus('error')
    }
  }

  if (status === 'redirecting') return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Redirecting to Stripe…</p>
    </TokenShell>
  )
  if (status === 'error') return <Message icon="!" tone="red" title="Something went wrong" text={error} backHref={backHref} backLabel={backLabel} />

  return (
    <TokenShell>
      <div style={{ width: '100%' }}>
        <div className="vfo-statusicon" style={{ ...iconCircle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...title, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>Buy Growth Credits</h1>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '12px' }}>
          Hi {firstName || 'there'} — choose how you'd like to pay.
        </p>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: bonus > 0 ? '16px' : '32px', fontSize: '13px' }}>
          You're buying <strong>{credits} Growth {creditWord(credits)}</strong>
          {bonus > 0 ? <> and getting <strong>{bonus} free</strong>, <strong>{total} credits</strong> in all.</> : '.'}
          {isPublic && <> Our team adds them to your VFO portal within 1 business day of your payment clearing.</>}
        </p>
        {bonus > 0 && (
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: '6px', background: 'linear-gradient(135deg, #ffc145 0%, #ff9f1c 100%)', color: '#0a0f1f', fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              {promoTitle}: Buy {credits} Get {bonus} Free
            </span>
          </div>
        )}

        <OptionCard
          isHovered={hoveredOption === 'ach'}
          onHover={() => setHoveredOption('ach')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')}
          title="Bank Account (ACH)"
          badgeText="No Fee"
          badgeClass="green"
          amount={price}
          cadence="one-time payment"
          breakdown={[...creditRows, { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' }]}
          footer={isPublic
            ? 'Funds transfer directly from your bank and take 3-5 business days to clear.'
            : 'Funds transfer directly from your bank and take 3-5 business days to clear. Your credits are added once it has cleared.'}
        />

        <div style={divider}>— or —</div>

        <OptionCard
          isHovered={hoveredOption === 'card'}
          onHover={() => setHoveredOption('card')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')}
          title="Credit / Debit Card"
          badgeText="2.9% + $0.30 Fee"
          badgeClass="blue"
          amount={cardTotal}
          cadence="one-time payment"
          breakdown={[...creditRows, { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${fmt(cardFee)}`, valueColor: 'var(--vfo-ink-2)' }]}
          footer={isPublic ? 'Processes immediately.' : 'Processes immediately. Your credits are added within seconds.'}
        />

        <p style={securityNote}>
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
        </p>
        <p style={{ textAlign: 'center', marginTop: '12px' }}>
          <a href={backHref} style={{ color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{backLabel}</a>
        </p>
      </div>
    </TokenShell>
  )
}

function Message({ icon, tone, title: t, text, backHref, backLabel }) {
  const bg = tone === 'red' ? '#ef444420' : 'rgba(107,114,128,0.15)'
  return (
    <TokenShell maxWidth={520}>
      <div style={messageCard}>
        <div className="vfo-statusicon" style={{ ...iconCircle, background: bg }}><span style={{ fontSize: '28px', lineHeight: 1, fontWeight: 800, color: tone === 'red' ? '#dc2626' : 'var(--vfo-muted)' }}>{icon}</span></div>
        <h1 style={title}>{t}</h1>
        <p style={subtitle}>{text}</p>
        {backHref && <p style={{ marginTop: '18px' }}><a href={backHref} style={{ color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{backLabel}</a></p>}
      </div>
    </TokenShell>
  )
}

// Copied from MembershipPayPage (the house option card).
function OptionCard({ isHovered, onHover, onLeave, onClick, title: t, badgeText, badgeClass, amount, cadence, breakdown, footer }) {
  return (
    <div className="vfo-paycard" onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{ ...optionCard, borderColor: isHovered ? '#0095ff' : 'var(--vfo-border)', background: isHovered ? 'rgba(0,149,255,0.05)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{t}</span>
        <span style={{ ...badgeBase, ...badgeStyles[badgeClass] }}>{badgeText}</span>
      </div>
      {amount !== null && <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '4px' }}>${fmt(amount)}</div>}
      {cadence && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{cadence}</div>}
      <div style={{ marginBottom: '16px' }}>
        {breakdown.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--vfo-muted)' }}>{row.label}</span>
            <span style={{ color: row.valueColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>{footer}</div>
    </div>
  )
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
