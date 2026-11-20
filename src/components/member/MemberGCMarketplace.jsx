import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { Skeleton } from '../shared/Skeleton'
import { GCServicesView, GCTransactionHistory } from '../shared/GCMarketplaceViews'
import { useIsPhone } from '../../lib/useMediaQuery'
import { useGcPromo } from '../../lib/gcPromo'
import { GC_PACKAGES, creditWord, gcMoney } from '../../lib/gcPackages'
import { BF, BlackFridayBuyBanner } from '../shared/BlackFridayPromo'

// The member's Growth Credits marketplace. The packages are always on the
// Dashboard as cards (2026-11-20, replacing the Buy Credits table behind a
// button); a card opens /growth-credits-pay, the house-style pay page where the
// member picks bank or card. During a sale (Black Friday) the packages it
// covers carry the free credits, each deal once per member - the server decides
// the bonus at checkout, this is display.

export default function MemberGCMarketplace({ memberNumber, openBuyKey = 0 }) {
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const promo = useGcPromo()
  const [claimed, setClaimed] = useState([])
  useEffect(() => {
    if (!promo.promo) return
    callApi('gc_promo_member_claims', { member_number: memberNumber }).then(r => setClaimed(r.claimed || [])).catch(() => {})
  }, [promo.promo?.key, memberNumber])
  const dealBonus = (credits) => claimed.includes(credits) ? 0 : promo.bonusFor(credits)
  const [gcTab, setGcTab] = useState('dashboard')
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState(null)
  const [hoverPkg, setHoverPkg] = useState(null)
  const [banner, setBanner] = useState('')
  const buyRef = useRef(null)

  // Re-opened tab: draw the last balance and history at once, refresh behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen(`membergcmarket:${memberNumber}`)
    if (snap) applyDashboard(snap.balData, snap.transData)
    loadDashboard()
  }, [memberNumber])

  function showPackages() {
    setGcTab('dashboard')
    setTimeout(() => buyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // The Black Friday strip was clicked: bring the packages into view.
  useEffect(() => { if (openBuyKey) showPackages() }, [openBuyKey])

  // Stripe returns the buyer to /member?gc_success=1&m=<method>. The package and
  // the balance BEFORE buying were saved by buy(), so "done" is measured against
  // that: a card purchase is usually credited before the page is even back, and
  // measuring from the first read here waited for a rise that never came.
  // Card: poll until the balance passes the saved one. Bank: explain and wait.
  const [purchase, setPurchase] = useState(null) // { state: 'adding' | 'done' | 'slow' | 'bank', credits, bonus, balance }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gc_success') !== '1') return
    const method = params.get('m')
    params.delete('gc_success')
    params.delete('m')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''))
    let pending = null
    try { pending = JSON.parse(sessionStorage.getItem('gcPendingBuy') || 'null'); sessionStorage.removeItem('gcPendingBuy') } catch { pending = null }
    const credits = Number(pending?.credits) || 0
    const bonus = Number(pending?.bonus) || 0
    const before = pending && pending.balance !== null && pending.balance !== undefined ? Number(pending.balance) : null

    if (method === 'ach') { setPurchase({ state: 'bank', credits, bonus }); return }

    setPurchase({ state: 'adding', credits, bonus })
    let cancelled = false
    ;(async () => {
      let base = before
      const start = Date.now()
      while (!cancelled && Date.now() - start < 30000) {
        try {
          const b = await callApi('gc_load_balance', { member_number: memberNumber })
          const nb = Number(b.balance) || 0
          if (base === null) base = nb   // nothing saved: fall back to the first read
          else if (nb > base) {
            if (cancelled) return
            setPurchase({ state: 'done', credits: credits || nb - base, bonus, balance: nb })
            loadDashboard()
            return
          }
        } catch { /* transient - keep polling */ }
        await new Promise(r => setTimeout(r, 2500))
      }
      if (!cancelled) setPurchase(p => p && p.state === 'adding' ? { ...p, state: 'slow' } : p)
    })()
    return () => { cancelled = true }
  }, [])
  function applyDashboard(balData, transData) {
    setBalance(balData.balance || 0)
    setTransactions(transData.transactions || [])
  }

  async function loadDashboard() {
    try {
      const [balData, transData] = await Promise.all([
        callApi('gc_load_balance', { member_number: memberNumber }),
        callApi('gc_load_transactions', { member_number: memberNumber }),
      ])
      applyDashboard(balData, transData)
      setLastSeen(`membergcmarket:${memberNumber}`, { balData, transData })
    } catch (err) { console.error(err) }
  }

  // The pay page: back (or Stripe's cancel) lands on this tab again.
  function buy(amount) {
    try {
      sessionStorage.setItem('memberActiveTab', 'gc')
      sessionStorage.setItem('gcPendingBuy', JSON.stringify({ credits: amount, bonus: dealBonus(amount), balance }))
    } catch { /* private mode */ }
    navigate(`/growth-credits-pay?credits=${amount}`)
  }

  function showBanner(msg) { setBanner(msg); setTimeout(() => setBanner(''), 5000) }

  const subTabStyle = (active) => ({
    padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px'
  })
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)', marginBottom: '16px' }
  // The member portal's own card + heading styles (MemberPortal sectionStyle / cardTitle / profile eyebrow).
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const eyebrow = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        {[['dashboard', 'Dashboard'], ['services', 'Services'], ['history', 'History']].map(([key, label]) => (
          <button key={key} style={subTabStyle(gcTab === key)} onClick={() => setGcTab(key)}>{label}</button>
        ))}
      </div>

      {/* Dashboard - the balance as a slim hero (the Member Profile's header
          style), then Buy Credits straight under it so buying is on screen
          without scrolling (2026-11-20). */}
      {gcTab === 'dashboard' && (
        <>
          {purchase && <PurchaseNotice purchase={purchase} onClose={() => setPurchase(null)} isPhone={isPhone} />}
          {banner && <div style={{ background: 'rgba(27,146,84,0.15)', border: '1px solid rgba(27,146,84,0.4)', color: 'var(--vfo-success-text)', fontWeight: 500, padding: '14px 20px', borderRadius: '10px', fontSize: '14px', marginBottom: '16px', textAlign: 'left' }}>{banner}</div>}

          <div style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
            <div style={{ padding: isPhone ? '16px' : '20px 24px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={eyebrow}>Credit Balance</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontWeight: 800, letterSpacing: '-0.03em', fontSize: isPhone ? '30px' : '34px', color: 'var(--vfo-heading)', lineHeight: 1.1, minHeight: '36px', display: 'inline-flex', alignItems: 'center' }}>
                    {balance === null ? <Skeleton width={60} height={30} /> : balance}
                  </span>
                  {balance !== null && <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-muted)' }}>Growth {creditWord(Number(balance))}</span>}
                </div>
              </div>
            </div>
          </div>

          <div ref={buyRef} style={{ ...sectionStyle, scrollMarginTop: '16px' }}>
            <div style={cardTitle}>Buy Credits</div>
            <BlackFridayBuyBanner claimed={claimed} />
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isPhone ? '10px' : '14px' }}>
              {GC_PACKAGES.map(pkg => (
                <PackageCard key={pkg.amount} pkg={pkg} bonus={dealBonus(pkg.amount)} used={claimed.includes(pkg.amount) && promo.bonusFor(pkg.amount) > 0}
                  hovered={hoverPkg === pkg.amount} onHover={setHoverPkg} onBuy={() => buy(pkg.amount)} isPhone={isPhone} />
              ))}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '14px' }}>Pick a package, then choose bank (no fee) or card on the next page.</div>
          </div>
        </>
      )}

      {/* Services — shared with the admin per-member GC tab. Kept mounted so
          the loaded catalogue and open Details survive a tab switch. */}
      <GCServicesView
        active={gcTab === 'services'}
        memberNumber={memberNumber}
        balance={balance}
        banner={banner}
        showBanner={showBanner}
        onBalanceChange={setBalance}
        onRedeemed={loadDashboard}
        onBuyCredits={showPackages}
      />

      {/* History */}
      {gcTab === 'history' && <GCTransactionHistory transactions={transactions} />}
    </div>
  )
}

// What happened to the purchase just made (2026-11-20): a card in the page's
// own style, not a loose banner. adding -> done (or slow), or bank.
function PurchaseNotice({ purchase, onClose, isPhone }) {
  const { state, credits, bonus, balance } = purchase
  const total = (Number(credits) || 0) + (Number(bonus) || 0)
  const what = credits
    ? `${credits} Growth ${credits === 1 ? 'Credit' : 'Credits'}${bonus > 0 ? ` + ${bonus} free` : ''}`
    : 'Your Growth Credits'
  const tone = state === 'done' ? { line: 'linear-gradient(90deg, #1b9254 0%, #34c47c 100%)', bg: 'rgba(27,146,84,0.12)', fg: '#1b9254' }
    : state === 'bank' ? { line: 'linear-gradient(90deg, #d97706 0%, #fbbf24 100%)', bg: 'rgba(217,119,6,0.12)', fg: '#d97706' }
    : { line: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)', bg: 'rgba(18,94,204,0.1)', fg: '#125ecc' }
  const title = state === 'done' ? 'Purchase complete'
    : state === 'bank' ? 'Your bank payment is on its way'
    : state === 'slow' ? 'Payment processed'
    : 'Adding your credits…'
  const text = state === 'done' ? <>{what} {total === 1 ? 'has' : 'have'} been added. Your balance is now <strong>{balance}</strong>.{bonus > 0 ? ' Enjoy your free credits.' : ''}</>
    : state === 'bank' ? <>{what} will be added automatically once it clears, usually in 3-5 business days. We'll email your invoice and receipt then.</>
    : state === 'slow' ? <>{what} will appear in your balance shortly. If they don't, refresh this page in a minute.</>
    : <>Your card payment has been processed. {what} will be in your balance in a few seconds.</>
  const icon = state === 'done'
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    : state === 'bank' || state === 'slow'
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    : <span className="vfo-gc-spin" style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2.5px solid rgba(18,94,204,0.25)', borderTopColor: '#125ecc', display: 'inline-block', animation: 'vfoGcSpin 0.8s linear infinite' }} />
  return (
    <div role="status" style={{ position: 'relative', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden', marginBottom: '16px' }}>
      <style>{'@keyframes vfoGcSpin { to { transform: rotate(360deg) } } @media (prefers-reduced-motion: reduce) { .vfo-gc-spin { animation: none !important } }'}</style>
      <div style={{ height: '4px', background: tone.line }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '12px' : '16px', padding: isPhone ? '14px 40px 14px 16px' : '16px 48px 16px 22px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: tone.bg, color: tone.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--vfo-heading)', letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.5 }}>{text}</div>
        </div>
      </div>
      {state !== 'adding' && (
        <button type="button" onClick={onClose} aria-label="Dismiss" style={{ position: 'absolute', top: '14px', right: '12px', width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--vfo-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  )
}

// The page while the member portal loads (and the Dashboard while its balance
// loads): the sub-tabs, the balance card and the Buy Credits card, in place.
export function GCMarketplaceSkeleton({ inner = false }) {
  const isPhone = useIsPhone()
  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)', marginBottom: '16px' }
  const body = (
    <>
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--vfo-border)', paddingBottom: '10px', marginBottom: '24px' }}>
        {[88, 72, 64].map((w, i) => <Skeleton key={i} width={w} height={28} style={{ borderRadius: '999px' }} />)}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
        <div style={{ padding: isPhone ? '16px' : '20px 24px' }}>
          <Skeleton width={110} height={11} />
          <Skeleton width={150} height={30} style={{ marginTop: '8px' }} />
        </div>
      </div>
      <div style={card}>
        <Skeleton width={130} height={16} style={{ marginBottom: '22px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isPhone ? '10px' : '14px' }}>
          {GC_PACKAGES.map(p => (
            <div key={p.amount} style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', padding: isPhone ? '14px 12px' : '20px 18px' }}>
              <Skeleton width={64} height={18} style={{ borderRadius: '999px', marginBottom: '12px' }} />
              <Skeleton width={56} height={36} />
              <Skeleton width={90} height={12} style={{ marginTop: '8px' }} />
              <Skeleton width={80} height={22} style={{ marginTop: '22px' }} />
              <Skeleton width="100%" height={36} style={{ marginTop: '16px', borderRadius: '9px' }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
  return inner ? body : <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>{body}</div>
}

// One package. A sale package (bonus > 0) gets the gold edge, the deal tag and
// the doubled credit count; the struck price is what the credits are worth at
// $100 each.
function PackageCard({ pkg, bonus, used, hovered, onHover, onBuy, isPhone }) {
  const deal = bonus > 0
  const total = pkg.amount + bonus
  const worth = total * 100
  const perCredit = pkg.price / total
  const struck = worth > pkg.price ? worth : null
  return (
    <div role="button" tabIndex={0} onClick={onBuy}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBuy() } }}
      onMouseEnter={() => onHover(pkg.amount)} onMouseLeave={() => onHover(null)}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: '16px', padding: isPhone ? '14px 12px' : '20px 18px',
        background: deal ? 'linear-gradient(180deg, rgba(255,193,69,0.14) 0%, var(--vfo-card) 55%)' : 'var(--vfo-card)',
        border: deal ? `2px solid ${BF.goldDeep}` : `1px solid ${hovered ? '#0a85e8' : 'var(--vfo-border-soft)'}`,
        boxShadow: hovered ? (deal ? '0 12px 28px rgba(255,159,28,0.28)' : '0 12px 28px rgba(0,41,115,0.14)') : 'var(--vfo-shadow-card)',
        transform: hovered ? 'translateY(-3px)' : 'none', transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
      }}>
      <div style={{ minHeight: '22px', marginBottom: '10px' }}>
        {deal ? (
          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, color: BF.ink, fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Buy {pkg.amount} Get {bonus} Free</span>
        ) : used ? (
          <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontSize: '11px', fontWeight: 700 }}>Black Friday deal used</span>
        ) : pkg.discountPct > 0 ? (
          <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontSize: '11px', fontWeight: 700 }}>Save {pkg.discountPct}%</span>
        ) : null}
      </div>
      <div style={{ fontSize: isPhone ? '32px' : '40px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--vfo-ink)' }}>{total}</div>
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-muted)', marginTop: '4px' }}>Growth {creditWord(total)}</div>
      <div style={{ fontSize: '11.5px', fontWeight: 700, color: deal ? '#d97706' : 'transparent', marginTop: '2px', minHeight: '15px' }}>{deal ? `${pkg.amount} + ${bonus} free` : '.'}</div>
      <div style={{ marginTop: isPhone ? '12px' : '16px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: isPhone ? '20px' : '22px', fontWeight: 800, color: 'var(--vfo-ink)' }}>{gcMoney(pkg.price)}</span>
          {struck && <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)', textDecoration: 'line-through' }}>{gcMoney(struck)}</span>}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{gcMoney(Math.round(perCredit * 100) / 100)} per credit</div>
      </div>
      <div style={{ marginTop: '14px', textAlign: 'center', padding: '9px 0', borderRadius: '9px', fontSize: '13px', fontWeight: 700,
        ...(deal
          ? { background: `linear-gradient(135deg, ${BF.ink} 0%, ${BF.navy} 100%)`, color: BF.gold, boxShadow: '0 4px 12px rgba(255,159,28,0.3)' }
          : { background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', boxShadow: '0 2px 8px rgba(18,94,204,0.28)' }) }}>
        {deal ? 'Get the deal' : 'Buy'}
      </div>
    </div>
  )
}
