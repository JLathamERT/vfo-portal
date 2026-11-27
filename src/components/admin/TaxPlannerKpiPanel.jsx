import { useMemo, useState } from 'react'
import { KpiHero, BreakdownRows, BreakdownCard } from './KpiKit'
import SubTabs from '../shared/SubTabs'
import TaxPlanningKpiSummary from './tax/TaxPlanningKpiSummary'

// Tax planner analytics. Same instrument-panel language as the specialist KPI
// page: statuses are Active / Lost / Removed only, then a leaderboard of planners
// by the number of tax plans they are allocated to. Three more sub-tabs summarise
// every tax plan by step, fees and team success (TaxPlanningKpiSummary,
// 2026-11-23); the Stripe Connect card left this page then.

const LENSES = [
  { key: 'active', label: 'Active', color: '#1b9254', desc: 'of total' },
  { key: 'lost', label: 'Lost', color: '#e74c3c', desc: 'of total' },
  { key: 'removed', label: 'Removed', color: '#9b1c1c', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'incl. lost & removed' },
]

const SUB_TABS = [
  { key: 'kpis', label: 'KPIs' },
  { key: 'cumulative', label: 'Cumulative Summary' },
  { key: 'fees', label: 'Average Fees' },
  { key: 'formula', label: 'Success Formula' },
]

const statusOf = (p) => p.status || 'Active'
const LENS_PREDICATE = {
  all: () => true,
  active: (p) => statusOf(p) === 'Active',
  lost: (p) => statusOf(p) === 'Lost',
  removed: (p) => statusOf(p) === 'Removed',
}

const fullName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(unnamed)'

export default function TaxPlannerKpiPanel({ planners = [] }) {
  const [subTab, setSubTab] = useState('kpis')
  // The summary mounts the first time one of its sub-tabs opens and then stays
  // mounted, so switching sub-tabs keeps its data and filter.
  const [summaryOpened, setSummaryOpened] = useState(false)
  const [lens, setLens] = useState('active')

  const pool = planners
  const statusCounts = useMemo(() => ({
    all: pool.length,
    active: pool.filter(LENS_PREDICATE.active).length,
    lost: pool.filter(LENS_PREDICATE.lost).length,
    removed: pool.filter(LENS_PREDICATE.removed).length,
  }), [pool])

  const scoped = useMemo(() => pool.filter(LENS_PREDICATE[lens]), [pool, lens])

  // Team Members are never allocated to tax plans, so they stay off the leaderboard.
  const allocationRows = useMemo(() => {
    return scoped
      .filter((p) => p.planner_role !== 'Team Member')
      .map((p) => ({ key: p.id, label: fullName(p), count: Number(p.allocation_count) || 0 }))
      .sort((a, b) => b.count - a.count)
  }, [scoped])
  const totalAllocations = allocationRows.reduce((s, r) => s + r.count, 0)

  const activeLens = LENSES.find((l) => l.key === lens)
  const pick = (key) => {
    setSubTab(key)
    if (key !== 'kpis') setSummaryOpened(true)
  }

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}>
      <SubTabs tabs={SUB_TABS} active={subTab} onChange={pick} style={{ marginBottom: '20px' }} />

      {subTab === 'kpis' && (
        <>
          <KpiHero
            title="Tax Planner KPIs"
            subtitle={`${statusCounts.all} tax planners total · ${scoped.length} in view`}
            lenses={LENSES}
            counts={statusCounts}
            lens={lens}
            setLens={setLens}
            unitLabel="tax planners"
          />

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
        </>
      )}

      {summaryOpened && (
        <div style={{ display: subTab === 'kpis' ? 'none' : 'block' }}>
          <TaxPlanningKpiSummary tab={subTab === 'kpis' ? 'cumulative' : subTab} />
        </div>
      )}
    </div>
  )
}
