import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { Skeleton } from './Skeleton'

// The member-facing Growth Credits Services and History views, shared verbatim
// between the member portal (MemberGCMarketplace) and the admin per-member GC
// tab (MembersPanel -> MemberGC) so the two can never drift. adminMode only
// changes copy and the buy-credits affordance; the markup is one source.

// Escape DB/admin-authored text before it's rendered via dangerouslySetInnerHTML
// (M1a) so a malicious gc_services.description can't inject script into member browsers.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatServiceDetails(description) {
  if (!description) return ''
  const parts = description.split('|')
  const labels = ['Objective', 'Available to', 'Includes', 'Tailoring Options']
  return parts.map((part, i) => part.trim() ? `<div style="margin-bottom:8px;text-align:left;"><span style="color:var(--vfo-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${labels[i] || ''}</span><div style="color:#44557a;font-size:13px;margin-top:2px;">${escapeHtml(part.trim())}</div></div>` : '').join('')
}

const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
const bannerStyle = { background: 'rgba(27,146,84,0.15)', border: '1px solid rgba(27,146,84,0.4)', color: '#1b9254', fontWeight: 500, padding: '14px 20px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px', textAlign: 'left' }
// The hosts funnel failures through showBanner('Error: ...'), so the prefix is
// the discriminator the historical single green banner never had.
const errorBannerStyle = { ...bannerStyle, background: 'rgba(217,48,37,0.12)', border: '1px solid rgba(217,48,37,0.35)', color: '#d93025' }

const INTERVAL_NOUN = { monthly: 'month', yearly: 'year' }
const isRecurring = (svc) => !!INTERVAL_NOUN[svc?.billing_interval]
const intervalNoun = (bi) => INTERVAL_NOUN[bi] || ''
const creditWord = (n) => (n === 1 ? 'credit' : 'credits')

// Mirrors utils/gc-recurring.ts addInterval() on the backend, clamping included
// (Jan 31 + monthly is Feb 28/29, never Mar 3). Used ONLY to preview the second
// payment in the reschedule dialog — the real schedule is still written server
// side, and this must be kept in step with that function if it ever changes.
function addIntervalLocal(dateIso, billingInterval) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) return ''
  const [y, m, d] = String(dateIso).split('-').map(Number)
  const monthsAdded = billingInterval === 'yearly' ? 12 : 1
  const absMonth = m - 1 + monthsAdded
  const year = y + Math.floor(absMonth / 12)
  const month = ((absMonth % 12) + 12) % 12
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(d, lastDayOfTarget))).toISOString().slice(0, 10)
}

// The inverse of addIntervalLocal, used to show the CURRENT start date: a
// subscription stores only its renewal, and day 1 is exactly one interval back
// from it. Same clamping, so start -> renewal -> start round-trips on every day
// of the month except the clamped ones (Aug 31 -> Sep 30 -> Aug 30), where the
// stored renewal is what governs and the box simply opens on the clamped day.
function subIntervalLocal(dateIso, billingInterval) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) return ''
  const [y, m, d] = String(dateIso).split('-').map(Number)
  const monthsBack = billingInterval === 'yearly' ? 12 : 1
  const absMonth = m - 1 - monthsBack
  const year = y + Math.floor(absMonth / 12)
  const month = ((absMonth % 12) + 12) % 12
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(d, lastDayOfTarget))).toISOString().slice(0, 10)
}

// next_charge_date arrives as a bare YYYY-MM-DD, which Date() reads as UTC
// midnight and would render as the previous day west of Greenwich — pin those
// to local midnight before formatting.
function fmtDate(v) {
  if (!v) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(String(v) + 'T00:00:00') : new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TX_GRID = { display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 90px 150px 90px 56px 50px', gap: '12px', alignItems: 'center' }

// The "By" column (gc_transactions.actor_name / actor_role, 2026-10-02). Rows
// written before the column existed, and Stripe purchases, carry none.
function gcActorLabel(tx) {
  if (tx.actor_role === 'system') return 'System (renewal)'
  if (!tx.actor_name) return '—'
  return tx.actor_role === 'admin' ? `${tx.actor_name} (admin)` : tx.actor_name
}

export function GCTransactionHistory({ transactions }) {
  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Transaction History</div>
      {transactions === null
        ? Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <Skeleton width={160} height={14} />
              <Skeleton width={90} height={11} style={{ marginTop: '4px' }} />
            </div>
            <Skeleton width={70} height={20} style={{ borderRadius: '6px' }} />
          </div>
        ))
        : transactions.length === 0
        ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No transactions yet.</p>
        : <>
          <div style={{ ...TX_GRID, padding: '0 0 8px', borderBottom: '1px solid var(--vfo-tint)', fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>Description</span>
            <span>Date</span>
            <span>By</span>
            <span style={{ justifySelf: 'end' }}>Type</span>
            <span style={{ textAlign: 'right' }}>Credits</span>
            <span style={{ textAlign: 'right' }}>Balance</span>
          </div>
          {transactions.map(tx => (
          <div key={tx.id} style={{ ...TX_GRID, padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <span style={{ color: 'var(--vfo-ink)', fontSize: '14px', textAlign: 'left' }}>{tx.description || tx.type}</span>
            <span style={{ color: 'var(--vfo-muted)', fontSize: '12px' }}>{new Date(tx.created_at).toLocaleDateString()}</span>
            <span style={{ color: 'var(--vfo-muted)', fontSize: '12px' }}>{gcActorLabel(tx)}</span>
            <span style={{ justifySelf: 'end' }}>
              {/* A grant is stored as type "purchased" too (gc_add_credits), so the flag
                  alone would tell a member they bought credits they were given — which is
                  exactly what happened to 27 members before this. The Stripe session id is
                  what a real payment leaves behind, so derive the word from that (#465). */}
              {tx.type === 'purchased' && !tx.stripe_session_id
                ? <span style={{ background: 'rgba(0,149,255,0.2)', color: '#0095ff', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>added</span>
                : tx.type === 'purchased'
                ? <span style={{ background: 'rgba(27,146,84,0.2)', color: '#1b9254', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>purchased</span>
                : tx.type === 'refunded'
                ? <span style={{ background: 'rgba(0,149,255,0.2)', color: '#0095ff', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>refunded</span>
                : <span style={{ background: 'rgba(231,76,60,0.2)', color: '#d93025', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>redeemed</span>
              }
            </span>
              <span style={{ color: tx.amount > 0 ? '#1b9254' : '#d93025', fontWeight: '600', textAlign: 'right' }}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '12px', textAlign: 'right' }}>{tx.balance_after}</span>
          </div>
        ))}
        </>
      }
    </div>
  )
}

export function GCServicesView({
  active = true,
  memberNumber,
  adminMode = false,
  balance = null,
  banner = '',
  showBanner,
  onBalanceChange,
  onRedeemed,
  onBuyCredits,
}) {
  const [services, setServices] = useState([])
  const [servicesLoaded, setServicesLoaded] = useState(false)
  const [subscriptions, setSubscriptions] = useState([])
  const [openDetails, setOpenDetails] = useState({})
  const [confirmService, setConfirmService] = useState(null)
  const [redeeming, setRedeeming] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  // Admin-only reschedule of a live subscription's next charge date.
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduling, setRescheduling] = useState(false)

  // The host keeps this component mounted and flips `active`, so the catalogue
  // refreshes on every visit to the tab while what is already loaded stays on
  // screen instead of re-skeletoning.
  useEffect(() => { if (active) loadServices() }, [active, memberNumber])

  async function loadServices() {
    // Subscriptions are additive decoration on the same rows: they are fetched
    // alongside, but a failure there must not blank the catalogue.
    const [svcRes, subRes] = await Promise.all([
      callApi('gc_load_services', adminMode ? { member_number: memberNumber } : {}).catch(err => { console.error(err); return null }),
      callApi('gc_load_subscriptions', { member_number: memberNumber }).catch(err => { console.error(err); return null }),
    ])
    if (svcRes) {
      // An admin session can be served the full catalogue; the member-facing
      // list never shows a retired service, so pin it to the active ones.
      setServices((svcRes.services || []).filter(s => s.active !== false))
    }
    if (subRes) setSubscriptions(subRes.subscriptions || [])
    setServicesLoaded(true)
  }

  async function redeemService(svc) {
    setRedeeming(true)
    try {
      const result = await callApi('gc_redeem', { member_number: memberNumber, service_id: svc.id })
      if (onBalanceChange) onBalanceChange(result.balance)
      const rec = result.recurring
      if (rec) {
        showBanner(`Successfully redeemed ${svc.name}. This service renews automatically on ${fmtDate(rec.next_charge_date)} each ${intervalNoun(rec.billing_interval) || intervalNoun(svc.billing_interval)} — you can cancel anytime from this tab.`)
      } else {
        showBanner(`Successfully redeemed ${svc.name} for ${svc.credit_cost} ${creditWord(svc.credit_cost)}.`)
      }
      if (onRedeemed) onRedeemed()
      // Only a recurring redeem changes what this tab renders (the row flips to
      // Subscribed) — a one-time redeem leaves the catalogue untouched.
      if (rec) loadServices()
    } catch (err) { showBanner('Error: ' + err.message) }
    setRedeeming(false)
    setConfirmService(null)
  }

  async function cancelSubscription(sub, svc) {
    setCancelling(true)
    try {
      await callApi('gc_cancel_subscription', { member_number: memberNumber, subscription_id: sub.id })
      showBanner(`${svc?.name || sub.gc_services?.name || 'Recurring service'} cancelled. No further credits will be deducted.`)
      if (onRedeemed) onRedeemed()
      await loadServices()
    } catch (err) { showBanner('Error: ' + err.message) }
    setCancelling(false)
    setCancelTarget(null)
  }

  async function saveScheduleDate() {
    if (!rescheduleTarget) return
    setRescheduling(true)
    try {
      const res = await callApi('gc_update_subscription_date', { subscription_id: rescheduleTarget.sub.id, start_date: rescheduleDate })
      // Quote the renewal the SERVER derived, not the one previewed here.
      const renewal = res?.subscription?.next_charge_date || rescheduleStart.renewal
      showBanner(`${rescheduleTarget.svc?.name || rescheduleTarget.sub.gc_services?.name || 'Recurring service'} now starts ${fmtDate(rescheduleDate)} and renews ${fmtDate(renewal)}. No additional credits were taken.`)
      setRescheduleTarget(null)
      await loadServices()
    } catch (err) {
      // Leave the dialog open — the likeliest failure is a date the server
      // refuses (in the past, or the row was charged mid-edit), and both are
      // fixed by changing the value that is still on screen.
      showBanner('Error: ' + err.message)
    }
    setRescheduling(false)
  }

  function toggleDetails(id) { setOpenDetails(p => ({ ...p, [id]: !p[id] })) }

  const categories = []
  const catMap = {}
  services.forEach(svc => {
    const cat = svc.category || 'Other Services'
    if (!catMap[cat]) { catMap[cat] = []; categories.push(cat) }
    catMap[cat].push(svc)
  })
  categories.sort((a, b) => a === 'Other Services' ? 1 : b === 'Other Services' ? -1 : 0)

  // Only a live subscription replaces the Redeem button; the API returns newest
  // first, so the first live row per service wins.
  const liveSubByService = {}
  ;(subscriptions || []).forEach(s => {
    if (s.status !== 'active' && s.status !== 'on_hold') return
    if (!liveSubByService[s.service_id]) liveSubByService[s.service_id] = s
  })

  if (!active) return null

  const pillBase = { padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }
  const cancelBtnStyle = { padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: '#d93025', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }
  // Borderless on purpose. A second OUTLINED control beside Cancel widened the
  // right-hand cluster enough to wrap the service name onto two lines; a quiet
  // text link reads as an annotation on the renewal date it sits beside, and
  // leaves Cancel as the only bordered thing on the row.
  const rescheduleBtnStyle = { padding: '4px 2px', border: 'none', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }
  // The server compares against ITS today, which is UTC — mirror that exactly
  // rather than the browser's local today, so the dialog can never accept a date
  // the save would bounce (or warn about one it would have taken).
  const todayUtc = new Date().toISOString().slice(0, 10)
  // The reschedule dialog works in START dates: the box is day 1 and the renewal
  // is derived, so the value being edited can never itself be a charge date.
  const rescheduleInterval = rescheduleTarget
    ? (rescheduleTarget.svc?.billing_interval || rescheduleTarget.sub.gc_services?.billing_interval)
    : ''
  const rescheduleRenewal = addIntervalLocal(rescheduleDate, rescheduleInterval)
  const rescheduleStart = {
    current: rescheduleTarget ? subIntervalLocal(rescheduleTarget.sub.next_charge_date, rescheduleInterval) : '',
    renewal: rescheduleRenewal,
    noun: intervalNoun(rescheduleInterval) || 'month',
    alreadyDue: !!rescheduleRenewal && rescheduleRenewal < todayUtc,
  }
  const rescheduleBlocked = rescheduling || !rescheduleDate || rescheduleStart.alreadyDue
    || rescheduleDate === rescheduleStart.current

  return (
    <>
      {banner && <div style={banner.startsWith('Error') ? errorBannerStyle : bannerStyle}>{banner}</div>}
      {!servicesLoaded && Array.from({ length: 2 }).map((_, ci) => (
        <div key={ci} style={sectionStyle}>
          <Skeleton width={150} height={12} style={{ marginBottom: '18px' }} />
          {Array.from({ length: 4 }).map((_, ri) => (
            <div key={ri} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--vfo-border-soft)', marginBottom: '14px' }}>
              <Skeleton width="42%" height={14} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton width={28} height={14} />
                <Skeleton width={72} height={30} style={{ borderRadius: '6px' }} />
              </div>
            </div>
          ))}
        </div>
      ))}
      {servicesLoaded && categories.map(cat => (
        <div key={cat} style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{cat}</div>
          {catMap[cat].map(svc => {
            const sub = liveSubByService[svc.id]
            const noun = intervalNoun(svc.billing_interval)
            return (
              <div key={svc.id} style={{ paddingBottom: '14px', borderBottom: '1px solid var(--vfo-border-soft)', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--vfo-ink)', fontSize: '14px', textAlign: 'left' }}>{svc.name}</span>
                    {svc.description && (
                      <button onClick={() => toggleDetails(svc.id)}
                        style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {openDetails[svc.id] ? 'Hide' : 'Details'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--vfo-ink)', fontWeight: '700' }}>{svc.credit_cost}</span>
                    <span style={{ color: 'var(--vfo-muted)', fontSize: '11px' }}>{noun ? `credits / ${noun}` : 'credits'}</span>
                    {sub ? (
                      <>
                        {sub.status === 'active' ? (
                          <span style={{ ...pillBase, background: 'rgba(27,146,84,0.15)', color: '#1b9254' }}>Subscribed — renews {fmtDate(sub.next_charge_date)}</span>
                        ) : (
                          <span style={{ ...pillBase, background: 'rgba(176,141,38,0.15)', color: '#b08d26' }}>On hold — add credits to resume</span>
                        )}
                        {adminMode && <button onClick={() => { setRescheduleTarget({ sub, svc }); setRescheduleDate(subIntervalLocal(sub.next_charge_date, svc.billing_interval)) }} style={rescheduleBtnStyle}>Edit date</button>}
                        <button onClick={() => setCancelTarget({ sub, svc })} style={cancelBtnStyle}>Cancel</button>
                      </>
                    ) : balance !== null && balance < svc.credit_cost ? (
                      <button onClick={() => setConfirmService(svc)} title="Not enough credits"
                        style={{ padding: '6px 18px', borderRadius: '6px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>Redeem</button>
                    ) : (
                      <button onClick={() => setConfirmService(svc)} style={{ padding: '6px 18px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Redeem</button>
                    )}
                  </div>
                </div>
                {openDetails[svc.id] && (
                  <div style={{ marginTop: '12px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '8px', textAlign: 'left' }}
                    dangerouslySetInnerHTML={{ __html: formatServiceDetails(svc.description) }} />
                )}
              </div>
            )
          })}
        </div>
      ))}

      {confirmService && (
        <div onClick={() => { if (!redeeming) setConfirmService(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,14,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 18px 50px rgba(9,14,26,0.35)', padding: '26px 28px', maxWidth: '420px', width: '100%', textAlign: 'left' }}>
            {balance !== null && balance < confirmService.credit_cost ? (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Not enough credits</div>
                <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 6px', lineHeight: 1.5 }}>
                  <strong>{confirmService.name}</strong> requires <strong>{confirmService.credit_cost} {creditWord(confirmService.credit_cost)}</strong> and {adminMode ? 'this member' : 'you'} currently {adminMode ? 'has' : 'have'} <strong>{balance}</strong>.
                </p>
                <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 18px' }}>
                  {adminMode
                    ? 'Add credits from the Dashboard tab first.'
                    : `You need ${confirmService.credit_cost - balance} more ${creditWord(confirmService.credit_cost - balance)} to redeem this service.`}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => setConfirmService(null)}
                    style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Close</button>
                  {!adminMode && (
                    <button onClick={() => { setConfirmService(null); if (onBuyCredits) onBuyCredits() }}
                      style={{ padding: '8px 22px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Buy credits</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Redeem service</div>
                <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 6px', lineHeight: 1.5 }}>
                  Redeem <strong>{confirmService.name}</strong> {adminMode ? 'for this member ' : ''}for <strong>{confirmService.credit_cost} {creditWord(confirmService.credit_cost)}</strong>
                  {isRecurring(confirmService)
                    ? <> now, and <strong>{confirmService.credit_cost} {creditWord(confirmService.credit_cost)}</strong> automatically every {intervalNoun(confirmService.billing_interval)} until {adminMode ? 'it is cancelled' : 'you cancel'}?</>
                    : '?'}
                </p>
                {balance !== null && (
                  <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 18px' }}>
                    Balance after: {balance - confirmService.credit_cost} {creditWord(balance - confirmService.credit_cost)}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: balance === null ? '18px' : 0 }}>
                  <button onClick={() => setConfirmService(null)} disabled={redeeming}
                    style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: redeeming ? 'default' : 'pointer', opacity: redeeming ? 0.6 : 1 }}>Cancel</button>
                  <button onClick={() => redeemService(confirmService)} disabled={redeeming}
                    style={{ padding: '8px 22px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: redeeming ? 'default' : 'pointer', opacity: redeeming ? 0.7 : 1 }}>
                    {redeeming ? 'Redeeming…' : 'Confirm redemption'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {rescheduleTarget && (
        <div onClick={() => { if (!rescheduling) setRescheduleTarget(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,14,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 18px 50px rgba(9,14,26,0.35)', padding: '26px 28px', maxWidth: '420px', width: '100%', textAlign: 'left' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Reschedule recurring service</div>
            <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Set the date <strong>{rescheduleTarget.svc?.name || rescheduleTarget.sub.gc_services?.name}</strong> starts. It currently starts <strong>{fmtDate(rescheduleStart.current)}</strong>.
            </p>
            <input type="date" value={rescheduleDate} disabled={rescheduling}
              onChange={e => setRescheduleDate(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }} />
            {rescheduleStart.renewal
              ? (
                <p style={{ fontSize: '12.5px', color: rescheduleStart.alreadyDue ? '#d93025' : 'var(--vfo-muted)', margin: '10px 0 18px', lineHeight: 1.5 }}>
                  {rescheduleStart.alreadyDue
                    ? <>That start date already renewed on <strong>{fmtDate(rescheduleStart.renewal)}</strong>, so they would be charged tonight. Pick a later start date.</>
                    : <>Renews <strong>{fmtDate(rescheduleStart.renewal)}</strong>, then every {rescheduleStart.noun}. No additional credits are taken.</>}
                </p>
              )
              : <div style={{ height: '18px' }} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setRescheduleTarget(null)} disabled={rescheduling}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: rescheduling ? 'default' : 'pointer', opacity: rescheduling ? 0.6 : 1 }}>Cancel</button>
              <button onClick={saveScheduleDate} disabled={rescheduleBlocked}
                style={{ padding: '8px 22px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: rescheduleBlocked ? 'default' : 'pointer', opacity: rescheduleBlocked ? 0.6 : 1 }}>
                {rescheduling ? 'Saving…' : 'Save date'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div onClick={() => { if (!cancelling) setCancelTarget(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,14,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 18px 50px rgba(9,14,26,0.35)', padding: '26px 28px', maxWidth: '420px', width: '100%', textAlign: 'left' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Cancel recurring service</div>
            <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Stop the recurring service <strong>{cancelTarget.svc?.name || cancelTarget.sub.gc_services?.name}</strong>? No further credits will be deducted. Credits already spent for the current period are not refunded.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setCancelTarget(null)} disabled={cancelling}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: cancelling ? 'default' : 'pointer', opacity: cancelling ? 0.6 : 1 }}>Keep it</button>
              <button onClick={() => cancelSubscription(cancelTarget.sub, cancelTarget.svc)} disabled={cancelling}
                style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#d93025', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: cancelling ? 'default' : 'pointer', opacity: cancelling ? 0.7 : 1 }}>
                {cancelling ? 'Cancelling…' : 'Stop service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
