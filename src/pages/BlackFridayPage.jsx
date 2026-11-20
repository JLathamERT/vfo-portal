import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import VfoWordmark from '../components/shared/VfoWordmark'
import { BF, BF_KEYFRAMES, BfCountdown, BfTag } from '../components/shared/BlackFridayPromo'
import { promoDayLabel, promoEndsLine, useGcPromo } from '../lib/gcPromo'
import { useIsPhone } from '../lib/useMediaQuery'

// The public Black Friday page (2026-11-20): /black-friday, no sign-in. A member
// picks a deal and gives their name, email and phone; bank or card is chosen on
// the house pay page (/growth-credits-pay?public=1 -> gc_public_checkout), which
// reads the details from sessionStorage. Nobody is credited at payment: the team allocates the
// order to the member in Growth Credits > Purchases. The deal's price and cap come
// from gc_promo_status, display only; the server re-prices every checkout.

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function BlackFridayPage() {
  const isPhone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { loaded, promo, phase, remainingMs, deal } = useGcPromo()
  const [pick, setPick] = useState(null)
  const [form, setForm] = useState(() => {
    const blank = { first_name: '', last_name: '', email: '', phone: '' }
    try { return { ...blank, ...(JSON.parse(sessionStorage.getItem('gcPublicBuyer') || 'null') || {}) } } catch { return blank }
  })
  const [error, setError] = useState('')
  const paid = params.get('paid') === '1'
  const paidMethod = params.get('m')

  // The tab title names the sale only once the server says one is on.
  useEffect(() => { document.title = promo ? 'Black Friday - Growth Credits | VFO' : 'Growth Credits | VFO' }, [promo])

  const live = phase === 'live'
  const maxFree = deal?.maxFree || 10
  const creditPrice = deal?.creditPrice || 100

  // The bank-or-card choice is the house pay page; it reads these details back.
  function submit(e) {
    e.preventDefault()
    setError('')
    if (!pick) { setError('Choose how many credits first.'); return }
    if (['first_name', 'last_name', 'email', 'phone'].some(k => !String(form[k] || '').trim())) { setError('Please fill in every field.'); return }
    if (String(form.phone).replace(/\D/g, '').length < 10) { setError('Please enter a full phone number.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Please enter a valid email address.'); return }
    try { sessionStorage.setItem('gcPublicBuyer', JSON.stringify({ ...form, email: form.email.trim() })) } catch { /* private mode */ }
    navigate(`/growth-credits-pay?credits=${pick}&public=1&deal=1`)
  }

  const input = { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '14px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', boxSizing: 'border-box' }
  const req = { color: '#d93025' }
  const label = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', marginBottom: '6px', letterSpacing: '0.3px' }

  const hero = (
    <div style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(70% 120% at 85% 0%, rgba(10,133,232,0.5) 0%, rgba(10,133,232,0) 60%), radial-gradient(60% 120% at 0% 100%, rgba(18,94,204,0.4) 0%, rgba(18,94,204,0) 60%), linear-gradient(135deg, ${BF.ink} 0%, ${BF.ink2} 50%, #0d2350 100%)`, color: '#fff' }}>
      <div className="vfo-bf-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 0%, transparent 42%, rgba(255,255,255,0.06) 50%, transparent 58%, transparent 100%)', backgroundSize: '200% 100%', animation: 'vfoBfSheen 7s linear infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', height: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <VfoWordmark size={17} light />
      </div>
      <div style={{ position: 'relative', maxWidth: '920px', margin: '0 auto', padding: isPhone ? '32px var(--vfo-gutter) 36px' : '56px 24px 60px', textAlign: 'center' }}>
        {/* Nothing about a sale until the server has said one is on: while it loads
            the hero is empty, and with no sale (the gc_black_friday switch Off) it
            says only "Growth Credits" (no flash of the deal, Jake 2026-11-20). */}
        {!loaded ? (
          <div style={{ minHeight: isPhone ? '96px' : '140px' }} />
        ) : !promo ? (
          <h1 style={{ fontSize: isPhone ? '30px' : '44px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '6px 0 0' }}>Growth Credits</h1>
        ) : (
          <>
            <BfTag>{live ? 'Black Friday - live now' : 'Black Friday'}</BfTag>
            <h1 style={{ fontSize: isPhone ? '34px' : '56px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '18px 0 12px' }}>
              Buy 1, Get 1 <span style={{ background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Free</span>
            </h1>
            <p style={{ fontSize: isPhone ? '15px' : '18px', color: 'rgba(255,255,255,0.78)', maxWidth: '620px', margin: '0 auto', lineHeight: 1.5 }}>
              Get twice the Growth Credits to put toward the marketing and business development services available in the VFO Marketplace.
            </p>
          </>
        )}
        {promo && (live || phase === 'upcoming') && (
          <div style={{ marginTop: isPhone ? '26px' : '34px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
              {live ? 'Sale ends in' : 'Sale starts in'}
            </div>
            <BfCountdown ms={remainingMs} size={isPhone ? 'md' : 'lg'} />
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
              {promoEndsLine(promo.ends_at)}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  let body
  if (!loaded) {
    body = <div style={{ textAlign: 'center', color: 'var(--vfo-muted)', padding: '40px 0' }}>Loading...</div>
  } else if (paid) {
    body = (
      <div style={card}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(27,146,84,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1b9254" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, textAlign: 'center', margin: '0 0 10px' }}>Thank you, your order is in</h2>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
          {paidMethod === 'ach'
            ? 'Your bank payment is on its way. It usually takes 3-5 business days to clear, and our team will add your credits to your VFO portal within 1 business day after it does.'
            : 'Your card payment has been processed. Our team will add your credits to your VFO portal within 1 business day.'}
          {' '}We've emailed you a confirmation.
        </p>
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={() => { params.delete('paid'); params.delete('m'); setParams(params) }} style={{ background: 'none', border: 'none', color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Buy the other deal</button>
        </div>
      </div>
    )
  } else if (!promo || phase === 'ended') {
    body = (
      <div style={card}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }}>{promo ? 'The Black Friday sale has ended' : 'There is no sale running right now'}</h2>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', textAlign: 'center', margin: 0 }}>Growth Credits are always available from the Growth Credits section of your VFO portal.</p>
      </div>
    )
  } else {
    body = (
      <>
        {/* The deal: pick 1-10 credits, get the same number free (Jake, 2026-11-20). */}
        <div style={{ ...card, marginBottom: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>How many credits would you like?</div>
            <BfTag small>Buy 1 Get 1 Free</BfTag>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            {money(creditPrice)} per credit. Buy up to {maxFree} and get the same number free.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isPhone ? 5 : 10}, minmax(0, 1fr))`, gap: isPhone ? '8px' : '10px' }}>
            {Array.from({ length: maxFree }, (_, i) => i + 1).map(n => {
              const selected = pick === n
              return (
                <button key={n} type="button" disabled={!live} onClick={() => { setPick(n); setError('') }} aria-pressed={selected}
                  style={{ padding: isPhone ? '12px 0' : '14px 0', borderRadius: '12px', cursor: live ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: 800,
                    border: selected ? `2px solid ${BF.goldDeep}` : '2px solid var(--vfo-border-soft)',
                    background: selected ? `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)` : 'var(--vfo-card)',
                    color: selected ? BF.ink : 'var(--vfo-ink)', boxShadow: selected ? '0 8px 20px rgba(255,159,28,0.3)' : 'none', transition: 'all 0.15s ease' }}>
                  {n}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-border-soft)', minHeight: '44px' }}>
            {pick ? (
              <>
                <div>
                  <span style={{ fontSize: isPhone ? '30px' : '36px', fontWeight: 900, letterSpacing: '-0.03em' }}>{pick * 2}</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-muted)', marginLeft: '8px' }}>Growth Credits</span>
                  <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{pick} {pick === 1 ? 'credit' : 'credits'} + <strong style={{ color: BF.goldDeep }}>{pick} free</strong></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800 }}>{money(pick * creditPrice)}</span>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-faint)', textDecoration: 'line-through' }}>{money(pick * 2 * creditPrice)}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{live ? 'Pick a number above.' : ''}</div>
            )}
          </div>
        </div>
        {!live && (
          <div style={{ ...card, textAlign: 'center', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>The deals open {promoDayLabel(promo.starts_at)} at 12:00 AM PST.</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Come back to this page then. Each deal can be used once per member.</div>
          </div>
        )}

        {live && (
          <form onSubmit={submit} style={card}>
            <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>Your details</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 8px' }}>Enter your information below to add your Growth Credits to your VFO Portal. Please use the name and email address associated with your ERT membership.</p>
              <p style={{ margin: 0 }}>This offer is available to ERT members only. Each member may get up to {maxFree} free credits in total.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div><label style={label} htmlFor="bf-first">First name <span style={req}>*</span></label><input id="bf-first" required autoComplete="given-name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} style={input} /></div>
              <div><label style={label} htmlFor="bf-last">Last name <span style={req}>*</span></label><input id="bf-last" required autoComplete="family-name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={input} /></div>
              <div><label style={label} htmlFor="bf-email">Email <span style={req}>*</span></label><input id="bf-email" type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} /></div>
              <div><label style={label} htmlFor="bf-phone">Phone <span style={req}>*</span></label><input id="bf-phone" type="tel" required autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={input} /></div>
            </div>

            {error && <div style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', color: '#b3261e', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

            <button type="submit" disabled={!pick}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: 'none', cursor: !pick ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 800, color: BF.ink, background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, opacity: !pick ? 0.55 : 1, boxShadow: '0 8px 24px rgba(255,159,28,0.3)' }}>
              {pick ? `Continue to payment - ${pick * 2} credits` : 'Select a Growth Credit Package'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', textAlign: 'center', marginTop: '10px' }}>Next you'll choose bank or card. Payments are processed securely by Stripe.</div>
          </form>
        )}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
      <style>{BF_KEYFRAMES}</style>
      {hero}
      <div style={{ maxWidth: '760px', margin: isPhone ? '-18px auto 0' : '-30px auto 0', padding: `0 ${isPhone ? 'var(--vfo-gutter)' : '24px'} 48px`, position: 'relative' }}>
        {body}
      </div>
    </div>
  )
}

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '18px', boxShadow: 'var(--vfo-shadow-card)', padding: '28px' }
