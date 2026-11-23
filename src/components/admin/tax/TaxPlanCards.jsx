import { useState } from 'react'
import { callApi } from '../../../lib/api'
import { formatDate } from '../../../lib/dates'
import { useIsPhone } from '../../../lib/useMediaQuery'
import DirectPill from '../../shared/DirectPill'
import { taxDisplayName } from '../../shared/taxDisplayNames'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import BacklogModal, { errorText, fieldLabel, inputStyle } from '../backlog/BacklogModal'
import { PlanStatusTag, planIsLive } from './TaxPlanStatus'

// The Tax Plans screen (2026-11-23): the open plan on top, closed ones below, each
// card saying which plan it is, who has it, where it stands and what has been paid.

export const planTitle = (plan) => plan.tax_year ? `${plan.tax_year} tax plan` : 'Tax plan'

const dash = <span style={{ color: 'var(--vfo-faint)' }}>-</span>

// Each payment on the plan and the colour its amount reads in: green once cleared,
// orange until then. Refunded or failed reads red; unpaid on a closed plan, grey. An
// amount not agreed yet (or masked by Client Mirroring) is a dash.
function planPayments(plan) {
  const three = plan.final_retainer_amount != null
  const refunded = plan.refund_status === 'succeeded'
  const one = (label, amount, status, isRefunded) => {
    const n = parseFloat(String(amount ?? '').replace(/[,$]/g, ''))
    if (!Number.isFinite(n)) return { label, text: '-', color: 'var(--vfo-faint)', note: '' }
    const text = `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (isRefunded) return { label, text, color: '#e74c3c', note: 'Refunded' }
    if (status === 'succeeded') return { label, text, color: 'var(--vfo-success-text)', note: 'Paid' }
    if (status === 'failed' || status === 'declined') return { label, text, color: '#e74c3c', note: 'Payment failed' }
    if (n === 0) return { label, text, color: 'var(--vfo-faint)', note: 'Nothing to pay' }
    if (status === 'processing' || status === 'check_pending') return { label, text, color: '#e06717', note: 'Payment clearing' }
    return { label, text, color: plan.status === 'stopped' || plan.status === 'completed' ? 'var(--vfo-faint)' : '#e06717', note: 'Not paid' }
  }
  return [
    three ? one('Initial', plan.initial_retainer_amount, plan.retainer_status, refunded) : one('Retainer', plan.retainer_amount, plan.retainer_status, refunded),
    ...(three ? [one('Final', plan.final_retainer_amount, plan.final_retainer_status, refunded && plan.final_retainer_status === 'succeeded')] : []),
    one('Implementation', plan.implementation_amount, plan.implementation_charge_status, false),
  ]
}

const factLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
const factValue = { fontSize: '13px', color: 'var(--vfo-ink)', marginTop: '4px', lineHeight: 1.45, overflowWrap: 'anywhere' }

function Fact({ label, children }) {
  return <div style={{ minWidth: 0 }}><div style={factLabel}>{label}</div><div style={factValue}>{children}</div></div>
}

export function TaxPlanCard({ plan, state, done, total, summary, canRemove, onOpen, onYear, onRemove }) {
  const isPhone = useIsPhone()
  const pct = total > 0 ? Math.round(done / total * 100) : 0
  const open = planIsLive(plan) || plan.status === 'paused'
  const payments = planPayments(plan)
  const program = plan.program_id === 4 ? 'VFO Tax Planning' : 'VFO Holistic Planning'
  const people = [plan.tax_planner_name, plan.team_member_name].filter(Boolean)
  return (
    <div onClick={onOpen} className="vfo-track"
      style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '12px', overflow: 'hidden', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--vfo-card)' }}>
      <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
      <div style={{ padding: isPhone ? '14px 16px' : '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{planTitle(plan)}</span>
            {plan.tax_route === 'direct' && <DirectPill />}
            {onYear && <button onClick={e => { e.stopPropagation(); onYear() }} style={{ background: 'none', border: 'none', padding: 0, color: '#0095ff', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}>{plan.tax_year ? 'Change year' : 'Set tax year'}</button>}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Started {formatDate(plan.created_at)} - {program}</div>
        </div>
        <PlanStatusTag plan={plan} state={state} />
      </div>

      {open && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
          <div style={{ flex: 1, height: '7px', borderRadius: '999px', background: 'var(--vfo-tint-deep)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg, #125ecc 0%, #0a85e8 100%)' }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{pct}% - {done} / {total} tasks</span>
        </div>
      )}

      <div style={{ ...(isPhone ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' } : { display: 'flex', justifyContent: 'space-between', gap: '24px' }), marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--vfo-border-soft)' }}>
        <Fact label="Phase">{summary?.phase ? taxDisplayName(summary.phase) : dash}</Fact>
        <Fact label="Route">{plan.rapid_route && !plan.roi_meeting_skipped_at ? 'Rapid' : 'Traditional'}{plan.international_tax === true ? ' - International' : ''}</Fact>
        <Fact label="Tax Team">{people.length > 0 ? people.join(' / ') : dash}</Fact>
        <Fact label={payments.map(p => p.label).join(' / ')}>{payments.every(p => p.text === '-') ? dash : payments.map((p, i) => (
          <span key={p.label}>{i > 0 && <span style={{ color: 'var(--vfo-faint)' }}> / </span>}<span title={p.note ? `${p.label}: ${p.note}` : undefined} style={{ color: p.color, fontWeight: 600 }}>{p.text}</span></span>
        ))}</Fact>
      </div>

      {canRemove && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
          <button style={btnSecondary} onClick={onRemove}>Remove</button>
        </div>
      )}
      </div>
    </div>
  )
}

export function StartPlanModal({ clientId, programId, previousPlan, onClose, onStarted }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(previousPlan?.next_tax_year || thisYear))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function start() {
    setSaving(true); setError('')
    try {
      const res = await callApi('tax_start_plan', { client_id: clientId, program_id: programId, tax_year: Number(year), previous_plan_id: previousPlan?.id })
      onStarted(res.plan)
    } catch (err) {
      setError(err.message || 'The plan was not started')
      setSaving(false)
    }
  }
  return (
    <BacklogModal title="Start a tax plan" onClose={() => { if (!saving) onClose() }} width={440}
      footer={<>
        <button style={btnState(btnSecondary, saving)} disabled={saving} onClick={onClose}>Cancel</button>
        <button style={btnState(btnPrimary, saving)} disabled={saving} onClick={start}>{saving ? 'Starting…' : `Start ${year} plan`}</button>
      </>}>
      <label style={fieldLabel} htmlFor="start-plan-year">Tax year</label>
      <select id="start-plan-year" value={year} onChange={e => setYear(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }}>
        {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2, thisYear + 3].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {previousPlan && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '10px', lineHeight: 1.5 }}>Follows the {planTitle(previousPlan).toLowerCase()} that was moved to next tax year. Anything already paid stays on that plan.</div>}
      {error && <div style={errorText}>{error}</div>}
    </BacklogModal>
  )
}

export function PlanYearModal({ plan, onClose, onSaved }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(plan.tax_year || thisYear))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true); setError('')
    try {
      await callApi('tax_plan_year_save', { tax_plan_id: plan.id, tax_year: Number(year) })
      onSaved(Number(year))
    } catch (err) {
      setError(err.message || 'The tax year was not saved')
      setSaving(false)
    }
  }
  return (
    <BacklogModal title="Tax year of this plan" onClose={() => { if (!saving) onClose() }} width={400}
      footer={<>
        <button style={btnState(btnSecondary, saving)} disabled={saving} onClick={onClose}>Cancel</button>
        <button style={btnState(btnPrimary, saving)} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <label style={fieldLabel} htmlFor="plan-year">Tax year</label>
      <select id="plan-year" value={year} onChange={e => setYear(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }}>
        {Array.from({ length: 9 }, (_, i) => thisYear + 3 - i).map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {error && <div style={errorText}>{error}</div>}
    </BacklogModal>
  )
}
