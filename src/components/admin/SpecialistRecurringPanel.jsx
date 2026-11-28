import { useState, useEffect, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { NAVY, BLUE, money, StatusPill, RecipientName } from './specialistRevenueShared'
import { RowCardsSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink } from '../shared/personLinks'
import { emptyCardStyle, errorStyle, innerTotalsStyle, refreshBtnStyle, toolbarStyle } from './accountingTable'
import { paymentStatusLabel } from '../../lib/paymentStatusLabel'
import ExpandChevron from '../shared/ExpandChevron'
import { formatDate } from '../../lib/dates'

// Accounting → VFO Specialist Recurring Revenue Payments. Lists every recurring
// plan (setup_pending / active / canceled) built from the Payment Input form's
// "Recurring monthly" method. Expand a plan to see its recipient split; cancel a
// live/pending plan to stop future monthly charges.

function ordinal(n) {
  const v = Number(n) || 0
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`
}

function moPerMonth(n) {
  return `${money(n)} / mo`
}

const PLAN_STATUS = {
  setup_pending: { label: 'Setup pending', color: '#0095ff' },
  active: { label: 'Active', color: '#16a34a' },
  canceled: { label: 'Canceled', color: '#6b7280' },
}

export default function SpecialistRecurringPanel({ embedded = false }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Re-open draws the last plans at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistrecurring:')
    if (snap) { setPlans(snap.plans || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_revenue_recurring_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setPlans(res.plans || [])
      setLastSeen('specialistrecurring:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist Recurring Revenue Payments</h2>
        </div>
      )}

      <div style={toolbarStyle}>
        <button type="button" onClick={() => load()} style={refreshBtnStyle}>Refresh</button>
      </div>

      {loading && <RowCardsSkeleton blocks={[110]} pill={120} />}
      {error && <div style={errorStyle}>{error}</div>}
      {!loading && !error && plans.length === 0 && (
        <div style={emptyCardStyle}>No recurring plans yet.</div>
      )}
      {!loading && !error && plans.map(p => <PlanRow key={p.id} plan={p} onChanged={load} />)}
    </div>
  )
}

function PlanRow({ plan, onChanged }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const meta = PLAN_STATUS[plan.status] || { label: paymentStatusLabel(plan.status), color: '#6b7280' }
  const lines = plan.lines || []
  const canceled = plan.status === 'canceled'

  async function cancel(e) {
    e.stopPropagation()
    if (!window.confirm('Cancel this recurring plan? Future monthly charges stop immediately. A payment already in progress will still complete and pay out.')) return
    setBusy(true); setMsg('')
    try {
      const res = await callApi('specialist_revenue_recurring_cancel', { plan_id: plan.id })
      if (res?.ok) { onChanged?.() }
      else setMsg(res?.error || 'Could not cancel the plan.')
    } catch (err) {
      setMsg(err?.message || 'Could not cancel the plan.')
    } finally {
      setBusy(false)
    }
  }

  const grid = '1.4fr 110px 110px 110px 70px 1fr'

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', marginBottom: '10px', overflow: 'hidden', opacity: canceled ? 0.7 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}><SpecialistNameLink expertId={plan.expert_id}>{plan.specialist_name || '—'}</SpecialistNameLink>{plan.sandbox ? ' (sandbox)' : ''}</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
            {lines.length} recipient{lines.length === 1 ? '' : 's'} · Bills on the {ordinal(plan.charge_day)}
            {plan.status === 'active' && plan.next_billing_date ? ` · Next ${formatDate(plan.next_billing_date, '—')}` : ''}
            {plan.activated_at ? ` · Activated ${formatDate(plan.activated_at, '—')}` : ''}
            {plan.canceled_at ? ` · Canceled ${formatDate(plan.canceled_at, '—')}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{moPerMonth(plan.monthly_amount)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>monthly</div>
        </div>
        <div style={{ width: '130px', textAlign: 'right' }}>
          <StatusPill label={meta.label} color={meta.color} />
        </div>
        <ExpandChevron open={open} />
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
            <div>Recipient</div><div style={{ textAlign: 'right' }}>ERT $</div><div style={{ textAlign: 'right' }}>VFOS $</div><div style={{ textAlign: 'right' }}>Member $</div><div style={{ textAlign: 'right' }}>Deals</div><div>Transaction details</div>
          </div>
          <div style={{ ...innerTotalsStyle, gridTemplateColumns: grid, borderBottom: '2px solid var(--vfo-border)' }}>
            <div>Totals</div>
            <div style={{ textAlign: 'right' }}>{money(plan.total_ert_share)}</div>
            <div style={{ textAlign: 'right' }}>{money(plan.total_vfos_share)}</div>
            <div style={{ textAlign: 'right' }}>{money(plan.total_member_share)}</div>
            <div style={{ textAlign: 'right' }}>{plan.total_deals || 0}</div>
            <div />
          </div>
          {lines.map((line, i) => (
            <div key={line.id || i} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
              <div>
                <div style={{ fontWeight: 600 }}><RecipientName line={line} /></div>
                <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{line.recipient_type === 'specialist' ? 'Specialist' : (line.member_number || 'Member')} · {line.revenue_decision || 'Revenue Share'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>{money(line.ert_share)}</div>
              <div style={{ textAlign: 'right' }}>{money(line.vfos_share)}</div>
              <div style={{ textAlign: 'right' }}>{money(line.member_share)}</div>
              <div style={{ textAlign: 'right' }}>{line.deals || 0}</div>
              <div style={{ color: 'var(--vfo-muted)' }}>{line.transaction_details || '—'}</div>
            </div>
          ))}

          {!canceled && (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
              <button type="button" disabled={busy} onClick={cancel}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #f3c0c0', background: busy ? '#c7d2e4' : `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)`, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {busy ? 'Canceling…' : 'Cancel recurring plan'}
              </button>
              {msg && <div style={{ fontSize: '12.5px', color: '#b91c1c' }}>{msg}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
