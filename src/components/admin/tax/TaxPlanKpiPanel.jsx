import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { Skeleton } from '../../shared/Skeleton'
import { TONES, fmtKpiMoney } from './kpiFormat'

// Tax Plan KPI Tracker (2026-11-16, Jake's Workbench spec): the body under a plan
// row on Client Overview > Tax Planning. Every rule (statuses, day counts, fee
// path, deposit waiver, the split) is computed by the SQL function tax_plan_kpis
// behind tax_plan_kpis_load; this only formats and lays it out. Six steps, no gaps
// (round 3, 2026-11-20): each step counts from the previous step's end to its own,
// so Steps 1-6 add up to Total days.

const NA_TIP = 'Step dates unavailable for plans created before Aug 12, 2026 or migrated from the old system.'
const NA_TEXT = 'Step dates unavailable for migrated accounts'

const bigNumber = { fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }

// One day count: { state: value | na | hidden | dash | blocked, kind: between | in_step, days, tone? }.
// The number is the tile's headline: the days since the previous step finished (the header's is the whole process).
// 'hidden' (a plan without reliable step dates) shows nothing and takes no room.
const DAY_TONES = { red: '#e74c3c', grey: 'var(--vfo-muted)' }
function DayLine({ day }) {
  if (!day || day.state === 'hidden') return null
  const base = { fontSize: '12px', fontWeight: 600 }
  if (day.state === 'na') return <span title={NA_TIP} style={{ ...base, fontWeight: 500, color: 'var(--vfo-faint)' }}>{NA_TEXT}</span>
  if (day.state === 'blocked') return <span style={{ ...base, color: '#e06717' }}>Awaiting deposit</span>
  if (day.state !== 'value') return <span style={{ ...base, color: 'var(--vfo-faint)', fontSize: '20px' }}>—</span>
  // A step still running counts up, in amber, "so far"; a stopped strategy takes its tag's
  // tone; a finished step reads in ink.
  const running = day.kind === 'in_step'
  const color = running ? '#e06717' : DAY_TONES[day.tone] || 'var(--vfo-ink)'
  return (
    <span style={{ color, whiteSpace: 'nowrap', lineHeight: 1.1 }}>
      <span style={bigNumber}>{day.days}</span>
      <span style={{ fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{day.days === 1 ? 'day' : 'days'}{running ? ' so far' : ''}</span>
    </span>
  )
}

function StatusChip({ tone, children }) {
  const t = TONES[tone] || TONES.grey
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: t.bg, color: t.color, alignSelf: 'flex-start', maxWidth: '100%', overflowWrap: 'anywhere', letterSpacing: '0.2px' }}>{children}</span>
  )
}

// A tile fills the cell StepRow gives it; StepRow owns the widths and the gaps between tiles.
const tileStyle = (tone) => ({
  flex: '1 1 auto', minWidth: 0,
  background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderTop: `3px solid ${(TONES[tone] || TONES.grey).rail}`,
  borderRadius: '10px', boxShadow: 'var(--vfo-shadow-card)', padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: '6px',
})
const stepLabel = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }

// One short label and its amount; on a narrow tile the amount drops to the next line.
// An unpaid step shows what is due, muted ("—" while the amount is not set yet).
function MoneyLines({ money }) {
  if (!money || money.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', minWidth: 0 }}>
      {money.map(m => (
        <div key={m.label} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 8px', minWidth: 0, fontSize: '11px' }}>
          <span style={{ color: 'var(--vfo-muted)', fontWeight: 600, letterSpacing: '0.2px', minWidth: 0 }}>{m.label}</span>
          <span style={{ fontWeight: 700, color: m.muted ? 'var(--vfo-faint)' : 'var(--vfo-ink)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{m.due && (m.amount === null || m.amount === undefined) ? '—' : fmtKpiMoney(m.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function StepTile({ step, strategies, blockedReason }) {
  const isImpl = step.number === 6
  const subs = isImpl ? (strategies || []) : []
  return (
    <div style={tileStyle(step.tone)}>
      {/* Step 0 is the plan page's Set Up phase (Deposit Paid). */}
      <span style={stepLabel}>{step.number === 0 ? 'Set Up' : `Step ${step.number}`}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)', lineHeight: 1.25 }}>{step.name}</span>
      <StatusChip tone={step.tone}>{step.status}</StatusChip>
      {step.day && step.day.state !== 'hidden' && <div style={{ marginTop: '2px' }}><DayLine day={step.day} /></div>}
      {step.reason && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{step.reason}</span>}
      {step.number === 0 && blockedReason && <span style={{ fontSize: '12px', fontWeight: 600, color: '#e06717' }}>{blockedReason}</span>}
      {step.number === 0 && step.paid_date && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Paid {fmtShortDate(step.paid_date)}</span>}
      <MoneyLines money={step.money} />
      {subs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
          {subs.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--vfo-border-soft)', borderLeft: `3px solid ${(TONES[s.tone] || TONES.grey).rail}`, borderRadius: '8px', padding: '6px 9px', background: 'var(--vfo-input)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', minWidth: 0 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 10px', minWidth: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-ink)', overflowWrap: 'anywhere' }}>{s.strategy || 'Strategy'}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', overflowWrap: 'anywhere' }}>{s.specialist_name || '—'}</span>
                </span>
                <StatusChip tone={s.tone}>{s.status}</StatusChip>
              </span>
              {s.day && s.day.state !== 'hidden' && <span style={{ marginLeft: 'auto' }}><DayLine day={s.day} /></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// The six steps sit side by side with no connectors between them (round 3: each
// step's count already includes the wait before it).
const TILE_GAP = 10
const TILE_MIN = 120 // the narrowest a tile gets before the row wraps
const TILE_MIN_PHONE = 140

// The step tiles, laid out from the row's measured width. When every tile fits at
// TILE_MIN, they sit on ONE row at equal widths (Implementation twice as wide when it
// lists strategies). Otherwise they wrap into an even grid.
function StepRow({ plan, isPhone }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const steps = plan.steps || []
  const strategies = plan.strategies || []
  const isWide = (s) => s.number === 6 && strategies.length > 0
  const units = steps.reduce((n, s) => n + (isWide(s) ? 2 : 1), 0)
  const tile = (s) => <StepTile step={s} strategies={strategies} blockedReason={plan.timing_blocked_reason} />

  const oneRow = !isPhone && width > 0 && width >= units * TILE_MIN + Math.max(steps.length - 1, 0) * TILE_GAP
  const cellMin = isPhone ? TILE_MIN_PHONE : TILE_MIN
  const cols = Math.max(1, Math.floor(((width || cellMin) + TILE_GAP) / (cellMin + TILE_GAP)))

  return (
    <div ref={ref}>
      {oneRow ? (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: `${TILE_GAP}px` }}>
          {steps.map(s => (
            <div key={s.number} style={{ flex: `${isWide(s) ? 2 : 1} 1 0`, minWidth: 0, display: 'flex' }}>{tile(s)}</div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `${TILE_GAP}px` }}>
          {steps.map(s => (
            <div key={s.number} style={{ display: 'flex', minWidth: 0, gridColumn: isWide(s) && cols > 1 ? 'span 2' : undefined }}>
              {tile(s)}
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

// Every header label sits on one top line (fixed line height), its value below.
const metaLabel = { fontSize: '10px', lineHeight: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }
function Meta({ label, children }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={metaLabel}>{label}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.25 }}>{children}</span>
    </span>
  )
}

const hasShare = (v) => Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) > 0

// The agreed split of the whole fee, as stored on the plan (not what has been collected).
function RevenueSplit({ split }) {
  const sp = split || {}
  const parties = [
    { key: 'member', label: 'Member', amount: sp.member_share, who: sp.member_name },
    { key: 'planner', label: 'Tax planner', amount: sp.tax_planner_share, who: sp.team },
    { key: 'vfos', label: 'VFOS', amount: sp.vfos_share, who: null },
    { key: 'partner', label: 'Strategic partner', amount: sp.strategic_partner_share, who: sp.atp_name },
  ].filter(p => hasShare(p.amount))
  const heading = { fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 700, letterSpacing: '0.4px', whiteSpace: 'nowrap' }
  // The split type is the heading's sub-header, the parties the line under it.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <span style={heading}>REVENUE SPLIT</span>
        {parties.length > 0 && sp.split_label && <span style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{sp.split_label}</span>}
      </span>
      {parties.length === 0 ? (
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-faint)' }}>Split not set</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 18px', minWidth: 0 }}>
          {parties.map(p => (
            <span key={p.key} style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
              {p.label} <span style={{ color: 'var(--vfo-ink)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtKpiMoney(p.amount)}</span>
              {p.who && <span style={{ fontWeight: 500 }}> ({p.who})</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// fitWidth: the width of the table's visible area (Client Overview measures it), so
// the panel stays on screen while the table itself scrolls sideways.
export default function TaxPlanKpiPanel({ plan, loading = false, error = '', fitWidth = null }) {
  const isPhone = useIsPhone()
  useEffect(() => {
    if (!plan) return
    ;(plan.warnings || []).forEach(w => console.warn(`Tax KPI: ${w}`))
    const days = [...(plan.steps || []).map(s => s.day), ...(plan.strategies || []).map(s => s.day), plan.total_days]
    if (days.some(d => d && d.bad)) console.warn(`Tax KPI: plan ${plan.plan_id} has a negative day count (bad step dates)`)
  }, [plan])

  const wrap = {
    padding: isPhone ? '12px var(--vfo-gutter) 16px' : '12px 18px 16px 52px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', cursor: 'default',
    ...(fitWidth ? { position: 'sticky', left: 0, width: `${fitWidth}px`, boxSizing: 'border-box' } : null),
  }
  if (loading) return <div style={wrap}><Skeleton width={220} height={13} style={{ marginBottom: '14px' }} /><Skeleton height={64} style={{ borderRadius: '10px' }} /></div>
  if (error) return <div style={{ ...wrap, fontSize: '12.5px', color: '#c0392b' }}>Could not load tax plan progress: {error}</div>
  if (!plan) return <div style={{ ...wrap, fontSize: '12.5px', color: 'var(--vfo-faint)' }}>No progress data for this plan.</div>

  const fee = plan.total_fee
  const feeSet = fee !== null && fee !== undefined && fee !== '' && Number.isFinite(Number(fee))
  return (
    <div style={wrap} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '10px 24px', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#0a85e8', whiteSpace: 'nowrap', alignSelf: 'center' }}>Tax Plan Progress</span>
        <Meta label="Total fee">
          {feeSet
            ? <span style={{ ...bigNumber, color: 'var(--vfo-ink)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{fmtKpiMoney(fee)}</span>
            : <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--vfo-faint)' }}>—</span>}
        </Meta>
        <Meta label="Total days"><DayLine day={plan.total_days} /></Meta>
        {plan.stopped && <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', background: '#e74c3c', color: '#fff' }}>Stopped</span>}
      </div>

      <StepRow plan={plan} isPhone={isPhone} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--vfo-border-strong)' }}>
        <RevenueSplit split={plan.split} />
      </div>
    </div>
  )
}
