import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import VfoWordmark from '../components/shared/VfoWordmark'
import { BF, BF_KEYFRAMES, BfCountdown, BfExtended, BfTag, bfTagText } from '../components/shared/BlackFridayPromo'
import { BF_HERO_BG } from '../lib/bfHeroBg'
import { promoStartsLine, useGcPromo } from '../lib/gcPromo'
import { useIsPhone } from '../lib/useMediaQuery'

// The public Black Friday page (2026-11-20): /black-friday, no sign-in. A member
// picks a deal and gives their name, email and phone; bank or card is chosen on
// the house pay page (/growth-credits-pay?public=1 -> gc_public_checkout), which
// reads the details from sessionStorage. Nobody is credited at payment: the team allocates the
// order to the member in Growth Credits > Purchases. The deal's price and cap come
// from gc_promo_status, display only; the server re-prices every checkout.

// What Growth Credits buy, under the timer (marketing's text, 2026-11-24).
const GC_USES = [
  'Website upgrades & VFO integration',
  'Custom marketing campaigns, branded presentations, videos, & social media packages',
  'Accountant partnership support and outreach programs',
  'Targeted prospect list building and LinkedIn outreach automation',
  'Personalized coaching, accountability, & tailored VFO planning programs',
  'Done-for-you client marketing and email automation',
]

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function BlackFridayPage() {
  const isPhone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { loaded: answered, failed, retry, promo, phase, live, extended, endsLine, remainingMs, deal } = useGcPromo()
  const [pick, setPick] = useState(null)
  const pickerRef = useRef(null)
  const [form, setForm] = useState(() => {
    const blank = { first_name: '', last_name: '', email: '', phone: '' }
    try { return { ...blank, ...(JSON.parse(sessionStorage.getItem('gcPublicBuyer') || 'null') || {}) } } catch { return blank }
  })
  const [error, setError] = useState('')
  const paid = params.get('paid') === '1'
  const paidMethod = params.get('m')

  // No answer from the server is not "no sale": keep loading, then say so after the
  // third missed try (or 12 seconds), while the tries go on (2026-11-24). A buyer back from paying
  // still gets the thank-you.
  const loaded = answered && (!failed || paid)
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t) }, [])
  const offline = !loaded && (failed >= 3 || slow)
  const [trying, setTrying] = useState(false)
  useEffect(() => { if (!trying) return; const t = setTimeout(() => setTrying(false), 1500); return () => clearTimeout(t) }, [trying])

  // The tab title names the sale only once the server says one is on.
  useEffect(() => { document.title = promo ? 'Black Friday - Growth Credits | VFO' : 'Growth Credits | VFO' }, [promo])

  // Before the sale the page is the top section alone, filling the screen: no
  // picker and no "deals open" card (Jake, 2026-11-24). The same full dark screen
  // while the server answers, so nothing jumps or flashes white.
  const topOnly = !loaded || (phase === 'upcoming' && !paid)
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
    <div style={{ position: 'relative', overflow: 'hidden', background: BF_HERO_BG, color: '#fff', ...(topOnly ? { minHeight: '100vh', display: 'flex', flexDirection: 'column' } : {}) }}>
      <div className="vfo-bf-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 0%, transparent 42%, rgba(255,255,255,0.06) 50%, transparent 58%, transparent 100%)', backgroundSize: '200% 100%', animation: 'vfoBfSheen 7s linear infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', height: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <VfoWordmark size={17} light />
      </div>
      <div key={loaded ? 'ready' : offline ? 'offline' : 'loading'} className="vfo-bf-anim" style={{ position: 'relative', animation: loaded || offline ? 'vfoBfIn 0.45s ease-out' : 'none', maxWidth: '920px', margin: topOnly ? 'auto' : '0 auto', padding: isPhone ? '32px var(--vfo-gutter) 36px' : '56px 24px 60px', textAlign: 'center' }}>
        {/* Nothing about a sale until the server has said one is on: while it loads
            the hero is empty, and with no sale (the gc_black_friday switch Off) it
            says only "Growth Credits" (no flash of the deal, Jake 2026-11-20). */}
        {offline ? (
          <div role="alert">
            <h1 style={{ fontSize: isPhone ? '24px' : '32px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 12px' }}>We're having trouble connecting</h1>
            <p style={{ fontSize: isPhone ? '14px' : '16px', color: 'rgba(255,255,255,0.78)', margin: '0 auto 24px', maxWidth: '440px', lineHeight: 1.5 }}>Please check your internet connection. This page keeps trying on its own.</p>
            <button type="button" disabled={trying} onClick={() => { setTrying(true); retry() }} style={{ opacity: trying ? 0.6 : 1, padding: '12px 26px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 800, color: BF.ink, background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)` }}>{trying ? 'Trying...' : 'Try again'}</button>
          </div>
        ) : !loaded ? (
          // Appears only on a slow connection (half a second in).
          <div className="vfo-bf-anim" role="status" aria-label="Loading" style={{ animation: 'vfoBfIn 0.3s ease-out 0.5s both' }}>
            <div className="vfo-bf-anim" style={{ width: '30px', height: '30px', margin: '0 auto', borderRadius: '50%', border: '3px solid rgba(255,193,69,0.22)', borderTopColor: BF.gold, animation: 'vfoBfSpin 0.8s linear infinite' }} />
          </div>
        ) : !promo ? (
          <h1 style={{ fontSize: isPhone ? '30px' : '44px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '6px 0 0' }}>Growth Credits</h1>
        ) : (
          <>
            <BfTag>{bfTagText(live, extended)}</BfTag>
            {extended && <div style={{ marginTop: '18px' }}><BfExtended size={isPhone ? 54 : 92} /></div>}
            <h1 style={{ fontSize: isPhone ? '34px' : '56px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '18px 0 12px' }}>
              Buy 1, Get 1 <span style={goldText}>Free</span>
            </h1>
            <p style={{ fontSize: isPhone ? '15px' : '18px', color: 'rgba(255,255,255,0.78)', maxWidth: '620px', margin: '0 auto', lineHeight: 1.5 }}>
              Whether you're looking to strengthen your brand, expand your network, or generate more VFO opportunities, Growth Credits can help you put the right resources in place for 2027.
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
              {live ? endsLine : promoStartsLine(promo.starts_at)}
            </div>
            {/* The list below pushes the picker off the first screen. */}
            {live && !paid && (
              <button type="button" onClick={() => pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ marginTop: '10px', padding: '13px 30px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 800, color: BF.ink, background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, boxShadow: '0 8px 24px rgba(255,159,28,0.3)' }}>Get the deal</button>
            )}
          </div>
        )}
        {promo && (live || phase === 'upcoming') && !paid && (
          <div style={{ marginTop: isPhone ? '28px' : '36px', paddingTop: isPhone ? '26px' : '34px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: isPhone ? '23px' : '32px', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.15, margin: isPhone ? '0 0 20px' : '0 0 26px' }}>
              Redeem your <span style={goldText}>Growth Credits</span><br />for services like...
            </h2>
            <ul style={{ listStyle: 'none', margin: '0 auto', padding: 0, width: 'fit-content', maxWidth: '100%', textAlign: 'left', display: 'grid', gap: isPhone ? '12px' : '13px' }}>
              {GC_USES.map(use => (
                <li key={use} style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '12px' : '16px', fontSize: isPhone ? '14.5px' : '16.5px', fontWeight: 500, lineHeight: 1.4, color: 'rgba(255,255,255,0.92)' }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: isPhone ? '32px' : '36px', height: isPhone ? '28px' : '30px', borderRadius: '9px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BF.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  {use}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  let body
  if (!loaded) {
    body = null
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
          <button onClick={() => { params.delete('paid'); params.delete('m'); setParams(params) }} style={{ background: 'none', border: 'none', color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Buy more credits</button>
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
  } else if (topOnly) {
    body = null
  } else {
    body = (
      <>
        {/* The deal: pick 1-10 credits, get the same number free (Jake, 2026-11-20). */}
        <div ref={pickerRef} style={{ ...card, marginBottom: '22px', scrollMarginTop: '16px' }}>
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
      {body && (
        <div className="vfo-bf-anim" style={{ animation: 'vfoBfIn 0.45s ease-out', maxWidth: '760px', margin: isPhone ? '-18px auto 0' : '-30px auto 0', padding: `0 ${isPhone ? 'var(--vfo-gutter)' : '24px'} 48px`, position: 'relative' }}>
          {body}
        </div>
      )}
    </div>
  )
}

const goldText = { backgroundImage: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '18px', boxShadow: 'var(--vfo-shadow-card)', padding: '28px' }
