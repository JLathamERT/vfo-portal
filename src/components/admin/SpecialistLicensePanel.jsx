import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { CARD_FEE_COL, CARD_FEE_LABEL, CardFeeCell } from './cardFeeColumn'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { ordinal } from '../../lib/ordinal'
import { money, StatusPill } from './specialistRevenueShared'
import { AccountingRowsSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink } from '../shared/personLinks'
import { btnDanger, btnPrimary, btnState } from '../shared/buttonStyles'
import { errorStyle, innerTotalsStyle, refreshBtnStyle } from './accountingTable'
import { paymentStatusLabel } from '../../lib/paymentStatusLabel'
import ExpandChevron from '../shared/ExpandChevron'
import { formatDate } from '../../lib/dates'
import { cardFrame, ProfileCard } from '../shared/ProfileKit'

// Accounting > Specialists > VFO Specialist License Fees, laid out like Advisor
// Membership Fees (2026-11-25). Specialists: one card per $99/mo licence — every
// specialist_onboarding row sent a licence link or holding a subscription — which
// opens to its payment history (the specialist_license_payments ledger, grouped here
// by onboarding_id), the next scheduled payment and the Cancel license button.
// Set Up License (LicenseSetupSection) moves an existing specialist onto the portal's
// licence: pick the specialist + a charge day and the portal emails their setup link.

const FEE = 99

const PLAN_STATUS = {
  active: { label: 'Active', color: '#16a34a' },
  scheduled: { label: 'Awaiting first payment', color: '#0095ff' },
  setup_pending: { label: 'Setup pending', color: '#0095ff' },
  awaiting_verification: { label: 'Awaiting bank verification', color: '#e06717' },
  processing: { label: 'Bank payment clearing', color: '#e06717' },
  past_due: { label: 'Past due', color: '#ef4444' },
  failed: { label: 'Payment failed', color: '#ef4444' },
  canceled: { label: 'Canceled', color: '#8a94a6' },
}
const STATE_ORDER = ['active', 'processing', 'scheduled', 'awaiting_verification', 'past_due', 'failed', 'setup_pending', 'canceled']

const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '5px' }
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', outline: 'none' }
const card = { ...cardFrame, borderRadius: '14px' }

function fmtMonth(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function methodWord(t) {
  if (t === 'ach' || t === 'us_bank_account') return 'ACH'
  if (t === 'card') return 'Card'
  return t ? String(t) : ''
}

// The next charge: the charge day's next occurrence from today (today counts).
// An onboarding licence has no charge day of its own; it bills on the day of the
// month its last invoice was paid.
function nextChargeDate(plan) {
  const day = Number(plan.charge_day) || (plan.last_invoice_paid_at ? new Date(plan.last_invoice_paid_at).getDate() : 0)
  if (!day) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let d = new Date(today.getFullYear(), today.getMonth(), day)
  if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
  return d
}

export default function SpecialistLicensePanel({ embedded = false }) {
  const [data, setData] = useState({ plans: [], payments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Re-open draws the last licences at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistlicense:')
    if (snap?.plans) { setData(snap); setLoading(false) }
    load(!!snap?.plans)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_license_payments_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setData({ plans: res.plans || [], payments: res.payments || [] })
      setLastSeen('specialistlicense:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const paymentsByPlan = useMemo(() => {
    const map = {}
    for (const p of data.payments) {
      if (!p.paid_at) continue
      const k = String(p.onboarding_id)
      ;(map[k] || (map[k] = [])).push(p)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at))
    return map
  }, [data.payments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.plans
      .filter(p => statusFilter === 'all' || p.state === statusFilter)
      .filter(p => !q || (p.specialist_name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const r = (STATE_ORDER.indexOf(a.state) + 1 || 99) - (STATE_ORDER.indexOf(b.state) + 1 || 99)
        return r || (a.specialist_name || '').localeCompare(b.specialist_name || '')
      })
  }, [data.plans, query, statusFilter])

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={wrap}>
      {loading && <AccountingRowsSkeleton search={260} boxes={[210]} blocks={[110, 110, 80]} pill={150} />}
      {error && <div style={errorStyle}>{error}</div>}

      {!loading && !error && (
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="search" name="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name…"
              style={{ ...input, width: '260px' }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...input, width: '210px' }}>
              <option value="all">All statuses</option>
              {STATE_ORDER.map(k => <option key={k} value={k}>{PLAN_STATUS[k].label}</option>)}
            </select>
            <button type="button" onClick={() => load()} style={refreshBtnStyle}>Refresh</button>
            <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{filtered.length} license{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {filtered.length === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
              No licenses match — set one up under Set Up License.
            </div>
          )}
          {filtered.map(p => (
            <LicenseCard key={p.onboarding_id} plan={p} payments={paymentsByPlan[String(p.onboarding_id)] || []} onChanged={() => load(true)} />
          ))}
        </div>
      )}
    </div>
  )
}

function LicenseCard({ plan, payments, onChanged }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const meta = PLAN_STATUS[plan.state] || { label: plan.state || '—', color: 'var(--vfo-muted)' }
  const canceled = plan.state === 'canceled'
  const billing = plan.has_subscription && !canceled
  const next = billing ? nextChargeDate(plan) : null
  const paidTotal = payments.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const day = Number(plan.charge_day) || 0
  const method = methodWord(plan.payment_method_type)
  const grid = `1.1fr 120px 110px ${CARD_FEE_COL} 160px 1.6fr`

  async function cancelLicense() {
    const nextLine = next ? ` (the next one was due ${formatDate(next, '—')})` : ''
    if (!window.confirm(`Cancel ${plan.specialist_name}'s $99/month VFO Specialist License now?\n\nThe Stripe subscription is cancelled straight away, so no more payments are taken${nextLine}. The Cancellation Confirmation email goes to the specialist.\n\nTo restart it later, send a new setup link from Set Up License.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await callApi('specialist_license_cancel', { onboarding_id: plan.onboarding_id })
      if (!res?.ok) { setMsg({ tone: 'error', text: res?.error || 'Could not cancel the license.' }); return }
      setMsg(res.already
        ? { tone: 'success', text: 'This license was already canceled.' }
        : res.emailed
        ? { tone: 'success', text: 'License canceled — no more payments will be taken. Cancellation Confirmation email created.' }
        : { tone: 'amber', text: `License canceled — no more payments will be taken. The confirmation email could not be created (${res.email_error || 'unknown'}) — send it by hand.` })
      onChanged?.()
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not cancel the license.' })
    } finally {
      setBusy(false)
    }
  }

  const sub = [
    plan.license_continuation ? 'Moved from old system' : 'Onboarding',
    `Monthly (${money(FEE)}/mo${day ? ` on the ${ordinal(day)}` : ''})`,
    method ? `${method}${plan.acct_last4 ? ` ••${plan.acct_last4}` : ''}` : '',
    plan.has_subscription && plan.setup_at ? `Set up ${formatDate(plan.setup_at, '—')}` : '',
    !plan.has_subscription && plan.link_sent_at ? `Link sent ${formatDate(plan.link_sent_at, '—')}` : '',
    canceled && plan.canceled_at ? `Canceled ${formatDate(plan.canceled_at, '—')}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ ...card, marginBottom: '10px', overflow: 'hidden', opacity: canceled ? 0.7 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
            <SpecialistNameLink expertId={plan.expert_id}>{plan.specialist_name || `Specialist #${plan.expert_id || plan.onboarding_id}`}</SpecialistNameLink>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(FEE)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>per month</div>
        </div>
        <div style={{ textAlign: 'right', width: '110px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{canceled ? formatDate(plan.canceled_at, '—') : next ? formatDate(next, '—') : '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{canceled ? 'canceled' : 'next payment'}</div>
        </div>
        <div style={{ textAlign: 'right', width: '80px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: plan.state === 'past_due' || plan.state === 'failed' ? '#ef4444' : 'var(--vfo-ink-2)' }}>{payments.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>paid</div>
        </div>
        <div style={{ width: '190px', textAlign: 'right' }}>
          <StatusPill label={meta.label} color={meta.color} />
        </div>
        <ExpandChevron open={open} />
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          {!plan.has_subscription ? (
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', padding: '4px 0 6px' }}>
              {canceled
                ? 'Canceled before the payment was set up.'
                : `Waiting for them to set up their payment at the link sent ${formatDate(plan.link_sent_at, '—')}. Nothing is charged at setup — the first payment collects on the ${day ? ordinal(day) : 'charge day'}. It also shows under Outstanding Payment Links.`}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
                <div>Month</div><div>Date</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'right' }}>{CARD_FEE_LABEL}</div><div>Status</div><div style={{ textAlign: 'right' }}>Payment</div>
              </div>
              <div style={{ ...innerTotalsStyle, gridTemplateColumns: grid, padding: '8px 6px', margin: '0 -6px', borderBottom: '2px solid var(--vfo-border)' }}>
                <div>Totals</div>
                <div />
                <div style={{ textAlign: 'right' }}>{money(paidTotal)}</div>
                <div style={{ textAlign: 'right', color: 'var(--vfo-faint)' }}>—</div>
                <div style={{ color: 'var(--vfo-success-text-2)' }}>{payments.length} cleared</div>
                <div />
              </div>
              {payments.length === 0 && !next && (
                <div style={{ padding: '9px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-faint)' }}>No payments yet.</div>
              )}
              {payments.map(r => {
                const paid = r.status === 'succeeded'
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)', background: paid ? 'rgba(22,163,74,0.07)' : 'transparent', borderRadius: '6px' }}>
                    <div style={{ fontWeight: 600 }}>{fmtMonth(new Date(r.paid_at))}</div>
                    <div>{formatDate(r.paid_at, '—')}</div>
                    <div style={{ fontWeight: 600, color: 'var(--vfo-ink)', textAlign: 'right' }}>{money(r.amount)}</div>
                    <div style={{ textAlign: 'right' }}><CardFeeCell fee={null} /></div>
                    <div><StatusPill label={paid ? 'Cleared' : (paymentStatusLabel(r.status) || '—')} color={paid ? '#16a34a' : '#5b6b8c'} /></div>
                    <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>
                      {[
                        r.method ? `${methodWord(r.method)}${r.last4 ? ` ••${r.last4}` : ''}` : '',
                        r.invoice_number || '',
                        r.receipt_number || '',
                      ].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                )
              })}
              {next && (
                <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
                  <div style={{ fontWeight: 600 }}>{fmtMonth(next)}</div>
                  <div>{formatDate(next, '—')}</div>
                  <div style={{ fontWeight: 600, color: 'var(--vfo-ink)', textAlign: 'right' }}>{money(FEE)}</div>
                  <div style={{ textAlign: 'right' }}><CardFeeCell fee={null} /></div>
                  <div><StatusPill label="Scheduled" color="#5b6b8c" /></div>
                  <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{method ? `${method}${plan.acct_last4 ? ` ••${plan.acct_last4}` : ''}` : '—'}</div>
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                {canceled
                  ? `Canceled ${formatDate(plan.canceled_at, '—')} — no more payments are taken.`
                  : `Bills ${money(FEE)} monthly${day ? ` on the ${ordinal(day)}` : ''} until the license is canceled. No card fee on card or bank.`}
              </div>
            </>
          )}

          {billing && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>
              <button type="button" disabled={busy} onClick={cancelLicense} style={btnState(btnDanger, busy)}>
                {busy ? 'Canceling…' : 'Cancel license'}
              </button>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px',
              color: msg.tone === 'success' ? '#166534' : msg.tone === 'amber' ? '#b45309' : '#b91c1c',
              border: `1px solid ${msg.tone === 'success' ? '#bbf7d0' : msg.tone === 'amber' ? '#fde68a' : '#fecaca'}`,
              background: msg.tone === 'success' ? '#f0fdf4' : msg.tone === 'amber' ? '#fffbeb' : '#fef2f2' }}>{msg.text}</div>
          )}
        </div>
      )}
    </div>
  )
}

// Set Up License: moves an existing specialist onto the portal's $99/mo license
// subscription. Pick the specialist + the day of the month they should be charged,
// and the portal emails their setup link. Nothing is charged here — the link only
// saves the payment method (card or bank transfer); the first collection happens on
// the charge day.
export function LicenseSetupSection({ allExperts = [] }) {
  const [expertId, setExpertId] = useState('')
  const [chargeDay, setChargeDay] = useState('')
  const [current, setCurrent] = useState(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [warn, setWarn] = useState('')
  const [error, setError] = useState('')

  const experts = useMemo(() => (
    [...allExperts]
      .filter(e => e && e.name)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [allExperts])

  useEffect(() => {
    setCurrent(null); setWarn(''); setError('')
    if (!expertId) return
    let stale = false
    callApi('specialist_license_continuation_load', { expert_id: Number(expertId) })
      .then(d => { if (!stale) setCurrent(d || null) })
      .catch(() => { if (!stale) setCurrent(null) })
    return () => { stale = true }
  }, [expertId])

  // already_active is the server's own 409 condition, so the amber note below can
  // never disagree with what the start action would refuse.
  const active = !!current?.already_active
  const note = active
    ? 'This specialist already has an active license subscription.'
    : current?.link_sent_at && current?.payment_status !== 'canceled'
      ? `A setup link was already sent on ${formatDate(current.link_sent_at, '—')}. Sending again sends another copy of the same link and restarts the reminder clock.`
      : ''

  async function send() {
    setSending(true); setSent(''); setWarn(''); setError('')
    try {
      const d = await callApi('specialist_license_continuation_start', { expert_id: Number(expertId), charge_day: Number(chargeDay) })
      setSent(`Setup email created for ${d.to_email}${d.sandbox ? ' (sandbox)' : ''}. They appear on the Specialists tab and under Outstanding Payment Links until they set up their payment.`)
      setExpertId(''); setChargeDay('')
    } catch (e) {
      const m = e?.message || 'Could not send the setup link.'
      // The 409 "already has an active subscription" answer is a state note, not a
      // failure — callApi surfaces it as a plain Error, so it reads as a warning here.
      if (/already/i.test(m)) setWarn(m); else setError(m)
    } finally {
      setSending(false)
    }
  }

  const field = { ...input, cursor: 'pointer' }
  const ready = !!expertId && !!chargeDay && !sending && !active

  return (
    <ProfileCard icon="dollar" title="Set Up Monthly License">

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: '14px', alignItems: 'start', marginBottom: '14px' }}>
        <div>
          <div style={label}>Specialist</div>
          <select value={expertId} onChange={e => setExpertId(e.target.value)} style={field}>
            <option value="">Select a specialist…</option>
            {experts.map(e => (
              <option key={e.id} value={String(e.id)}>{e.email ? `${e.name} — ${e.email}` : e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Monthly charge day</div>
          <select value={chargeDay} onChange={e => setChargeDay(e.target.value)} style={field}>
            <option value="">Select a day…</option>
            {Array.from({ length: 15 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>{ordinal(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Monthly license fee</div>
          <div style={{ ...input, cursor: 'default', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(FEE)} · card or ACH, no fee</div>
        </div>
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--vfo-ink-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
        The specialist gets an email with a secure link and chooses card or bank transfer — {money(FEE)} either way, with no processing fee. Their details are saved once, nothing is charged at setup, and the first payment collects on the {chargeDay ? ordinal(Number(chargeDay)) : 'charge day'} — next month's if this month's has already passed.
      </p>

      {note && (
        <p style={{ fontSize: '12.5px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '0 0 16px' }}>{note}</p>
      )}

      <button onClick={send} disabled={!ready}
        style={btnState(btnPrimary, !(ready))}>
        {sending ? 'Sending…' : 'Send setup link'}
      </button>

      {sent && <p style={{ fontSize: '13px', color: 'var(--vfo-success-text)', margin: '14px 0 0' }}>{sent}</p>}
      {warn && <p style={{ fontSize: '13px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '14px 0 0' }}>{warn}</p>}
      {error && <p style={{ fontSize: '13px', color: '#b91c1c', margin: '14px 0 0' }}>{error}</p>}
    </ProfileCard>
  )
}
