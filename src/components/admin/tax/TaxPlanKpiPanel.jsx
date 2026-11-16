import { useEffect } from 'react'

// Tax Plan KPI Tracker (2026-11-16, Jake's Workbench spec): the body under a plan
// row on Client Overview > Tax Planning. Every rule (statuses, day counts, fee
// path, deposit waiver) is computed by the SQL function tax_plan_kpis behind
// tax_plan_kpis_load; this only formats and lays it out.

const TONES = {
  green: { bg: 'rgba(27,146,84,0.13)', color: 'var(--vfo-success-text)', rail: '#1b9254' },
  amber: { bg: 'rgba(224,103,23,0.14)', color: '#e06717', rail: '#e06717' },
  grey: { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)', rail: 'var(--vfo-border-strong)' },
  red: { bg: 'rgba(231,76,60,0.13)', color: '#e74c3c', rail: '#e74c3c' },
}

const NA_TIP = 'Step dates unavailable for plans created before Aug 12, 2026 or migrated from the old system.'
const NA_TEXT = 'Step dates unavailable for migrated accounts'

function fmtKpiMoney(v) {
  const n = Number(v)
  if (v === null || v === undefined || !Number.isFinite(n)) return '$0'
  const cents = Math.round(n * 100) % 100 !== 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}

const fmtDays = (n) => (n === 1 ? '1 day' : `${n} days`)

const stepName = (n) => (String(n) === '0' ? 'Set Up' : `Step ${n}`)

// What a day count measures, under the number: "Set Up to Step 1" for a finished
// step (label "0–1"), "so far in Step 4" for the step the plan is in now.
function dayCaption(day) {
  if (day.label === 'total') return 'total'
  if (day.kind === 'in_step') return `so far in ${stepName(day.label)}`
  const [a, b] = String(day.label).split('–')
  return b != null ? `${stepName(a)} to ${stepName(b)}` : stepName(a)
}

// One day count: { state: value | na | dash | blocked, kind: between | in_step, label, days }.
// size 'lg' (step tiles, header) shows the number as the tile's headline; 'sm' is inline.
function DayLine({ day, size = 'sm' }) {
  if (!day) return null
  const base = { fontSize: '12px', fontWeight: 600 }
  if (day.state === 'na') return <span title={NA_TIP} style={{ ...base, fontWeight: 500, color: 'var(--vfo-faint)' }}>{NA_TEXT}</span>
  if (day.state === 'blocked') return <span style={{ ...base, color: '#e06717' }}>Awaiting deposit</span>
  if (day.state !== 'value') return <span style={{ ...base, color: 'var(--vfo-faint)', fontSize: size === 'lg' ? '20px' : '12px' }}>—</span>
  // A step still running counts up, in amber; a finished one reads in ink.
  const color = day.kind === 'in_step' ? '#e06717' : 'var(--vfo-ink)'
  if (size === 'sm') {
    return <span style={{ ...base, color }}>{fmtDays(day.days)}{day.label === 'total' ? '' : ` · ${dayCaption(day)}`}</span>
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.1 }}>
      <span style={{ color, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }}>{day.days}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{day.days === 1 ? 'day' : 'days'}</span>
      </span>
      {day.label !== 'total' && <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--vfo-muted)', marginTop: '2px' }}>{dayCaption(day)}</span>}
    </span>
  )
}

function StatusChip({ tone, children }) {
  const t = TONES[tone] || TONES.grey
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: t.bg, color: t.color, whiteSpace: 'nowrap', alignSelf: 'flex-start', letterSpacing: '0.2px' }}>{children}</span>
  )
}

const tileStyle = (tone) => ({
  flex: '1 1 160px', minWidth: '150px', maxWidth: '230px',
  background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderTop: `3px solid ${(TONES[tone] || TONES.grey).rail}`,
  borderRadius: '10px', boxShadow: 'var(--vfo-shadow-card)', padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: '6px',
})
const stepLabel = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }

function MoneyLines({ money }) {
  if (!money || money.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
      {money.map(m => (
        <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
          <span style={{ color: 'var(--vfo-muted)', fontWeight: 600, letterSpacing: '0.2px' }}>{m.label}</span>
          <span style={{ fontWeight: 700, color: m.muted ? 'var(--vfo-faint)' : 'var(--vfo-ink)', whiteSpace: 'nowrap' }}>{fmtKpiMoney(m.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function StepTile({ step, strategies, blockedReason }) {
  const isImpl = step.number === 6
  const subs = isImpl ? (strategies || []) : []
  return (
    <div style={{ ...tileStyle(step.tone), ...(subs.length ? { flex: '2 1 300px', maxWidth: '480px' } : null) }}>
      {/* Step 0 is the plan page's Set Up phase (Deposit Paid). */}
      <span style={stepLabel}>{step.number === 0 ? 'Set Up' : `Step ${step.number}`}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)', lineHeight: 1.25 }}>{step.name}</span>
      <StatusChip tone={step.tone}>{step.status}</StatusChip>
      {step.day && <div style={{ marginTop: '2px' }}><DayLine day={step.day} size="lg" /></div>}
      {step.reason && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{step.reason}</span>}
      {step.number === 0 && blockedReason && <span style={{ fontSize: '12px', fontWeight: 600, color: '#e06717' }}>{blockedReason}</span>}
      {step.number === 0 && step.paid_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Paid {fmtShortDate(step.paid_date)}</span>}
      <MoneyLines money={step.money} />
      {subs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
          {subs.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--vfo-border-soft)', borderLeft: `3px solid ${(TONES[s.tone] || TONES.grey).rail}`, borderRadius: '8px', padding: '6px 9px', background: 'var(--vfo-input)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{s.strategy || 'Strategy'}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{s.specialist_name || '—'}</span>
              <StatusChip tone={s.tone}>{s.status}</StatusChip>
              {s.day && <span style={{ marginLeft: 'auto' }}><DayLine day={s.day} size="lg" /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtShortDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : String(iso)
}

const metaLabel = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
function Meta({ label, children }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={metaLabel}>{label}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{children}</span>
    </span>
  )
}

export default function TaxPlanKpiPanel({ plan, loading = false, error = '' }) {
  useEffect(() => {
    if (!plan) return
    ;(plan.warnings || []).forEach(w => console.warn(`Tax KPI: ${w}`))
    const days = [...(plan.steps || []).map(s => s.day), ...(plan.strategies || []).map(s => s.day), plan.total_days]
    if (days.some(d => d && d.bad)) console.warn(`Tax KPI: plan ${plan.plan_id} has a negative day count (bad step dates)`)
  }, [plan])

  const wrap = { padding: '12px 18px 16px 52px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', cursor: 'default' }
  if (loading) return <div style={{ ...wrap, fontSize: '12.5px', color: 'var(--vfo-muted)' }}>Loading tax plan progress...</div>
  if (error) return <div style={{ ...wrap, fontSize: '12.5px', color: '#c0392b' }}>Could not load tax plan progress: {error}</div>
  if (!plan) return <div style={{ ...wrap, fontSize: '12.5px', color: 'var(--vfo-faint)' }}>No progress data for this plan.</div>

  const direct = plan.program === 'Direct'
  return (
    <div style={wrap} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px 24px', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#0a85e8', alignSelf: 'center' }}>Tax Plan Progress</span>
        <Meta label="Program">
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', background: direct ? 'rgba(224,103,23,0.12)' : 'var(--vfo-accent-tint)', color: direct ? '#e06717' : 'var(--vfo-accent-text)', border: '1px solid var(--vfo-border-chip)' }}>{plan.program}</span>
        </Meta>
        <Meta label="Tax plan team">{plan.team}</Meta>
        <Meta label="Current step">{plan.current_step?.label || '—'}</Meta>
        <Meta label="Total days"><DayLine day={plan.total_days} size="lg" /></Meta>
        {plan.stopped && <span style={{ alignSelf: 'center', fontSize: '10.5px', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', background: '#e74c3c', color: '#fff' }}>Stopped</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {(plan.steps || []).map(s => <StepTile key={s.number} step={s} strategies={plan.strategies} blockedReason={plan.timing_blocked_reason} />)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--vfo-border-strong)' }}>
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 700, letterSpacing: '0.4px' }}>VFO REV GENERATED <span style={{ color: 'var(--vfo-ink)' }}>{fmtKpiMoney(plan.vfos_share)}</span></span>
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 700, letterSpacing: '0.4px' }}>TOTAL DAYS <DayLine day={plan.total_days} /></span>
      </div>
    </div>
  )
}
