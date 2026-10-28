import { useMemo, useState } from 'react'
import { KpiHero, SplitDonut, BreakdownRows, BreakdownCard } from './KpiKit'

// Tax planner analytics. Same instrument-panel language as the specialist KPI
// page: statuses are Active / Lost / Removed only, then a Stripe Connect split
// (set up vs not) and a leaderboard of planners by the number of tax plans they
// are allocated to.

const LENSES = [
  { key: 'active', label: 'Active', color: '#1b9254', desc: 'of total' },
  { key: 'lost', label: 'Lost', color: '#e74c3c', desc: 'of total' },
  { key: 'removed', label: 'Removed', color: '#9b1c1c', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'incl. lost & removed' },
]

const statusOf = (p) => p.status || 'Active'
const LENS_PREDICATE = {
  all: () => true,
  active: (p) => statusOf(p) === 'Active',
  lost: (p) => statusOf(p) === 'Lost',
  removed: (p) => statusOf(p) === 'Removed',
}

const fullName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(unnamed)'

export default function TaxPlannerKpiPanel({ planners = [], groups = [] }) {
  const [lens, setLens] = useState('active')

  // A planner's payout is "set up" when their Member Type resolves to a Tax
  // Planning Group that has a Stripe account. No group (or a group without an
  // account) = not set up.
  const groupHasStripe = useMemo(() => {
    const m = new Map()
    for (const g of groups) m.set(g.name, !!(g.stripe_account_id || '').trim())
    return m
  }, [groups])
  const plannerConnected = (p) => !!p.member_type && groupHasStripe.get(p.member_type) === true

  const pool = planners
  const statusCounts = useMemo(() => ({
    all: pool.length,
    active: pool.filter(LENS_PREDICATE.active).length,
    lost: pool.filter(LENS_PREDICATE.lost).length,
    removed: pool.filter(LENS_PREDICATE.removed).length,
  }), [pool])

  const scoped = useMemo(() => pool.filter(LENS_PREDICATE[lens]), [pool, lens])

  const stripe = useMemo(() => {
    const connected = scoped.filter(plannerConnected).length
    return { connected, notSet: scoped.length - connected }
  }, [scoped, groupHasStripe])

  // Team Members are never allocated to tax plans, so they stay off the leaderboard.
  const allocationRows = useMemo(() => {
    return scoped
      .filter((p) => p.planner_role !== 'Team Member')
      .map((p) => ({ key: p.id, label: fullName(p), count: Number(p.allocation_count) || 0 }))
      .sort((a, b) => b.count - a.count)
  }, [scoped])
  const totalAllocations = allocationRows.reduce((s, r) => s + r.count, 0)

  const activeLens = LENSES.find((l) => l.key === lens)

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}>
      <KpiHero
        title="Tax Planner KPIs"
        subtitle={`${statusCounts.all} tax planners total · ${scoped.length} in view`}
        lenses={LENSES}
        counts={statusCounts}
        lens={lens}
        setLens={setLens}
        unitLabel="tax planners"
      />

      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: '280px', display: 'flex', flexDirection: 'column' }}>
          <SplitDonut
            title="Stripe Connect"
            total={scoped.length}
            segments={[
              { label: 'Set up', n: stripe.connected, color: '#1b9254' },
              { label: 'Not set up', n: stripe.notSet, color: '#8a9bbd' },
            ]}
          />
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <BreakdownCard
          title="Tax plans allocated"
          count={scoped.length}
          activeLens={lens !== 'all' ? activeLens : null}
          onClearLens={() => setLens('all')}
          note="Planners ranked by how many tax plans they are currently allocated to."
        >
          {allocationRows.length > 0
            ? <BreakdownRows rows={allocationRows} denom={totalAllocations} />
            : <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>No tax planners in view.</div>}
        </BreakdownCard>
      </div>
    </div>
  )
}
