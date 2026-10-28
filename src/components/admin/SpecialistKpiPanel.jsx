import { useState, useMemo } from 'react'
import { KpiHero, SplitDonut, BreakdownRows, BreakdownCard } from './KpiKit'

// Specialist (experts) analytics. Same instrument-panel language as the member
// KPI pages, for the specialist data model: statuses are Active / Lost /
// Removed only (no suspended/paused), the "model" split becomes Top of the T
// vs not, and the type breakdown becomes the ecosystems — which OVERLAP,
// because a specialist can belong to more than one (Member Services excepted —
// it's mutually exclusive). So ecosystem counts intentionally sum to more than
// the roster, and we say so.

const ECOSYSTEMS = ['Business Advisory', 'Risk Mitigation', 'Legal Services', 'Tax Planning', 'Wealth Management', 'Member Services']

const LENSES = [
  { key: 'active', label: 'Active', color: '#1b9254', desc: 'of total' },
  { key: 'lost', label: 'Lost', color: '#e74c3c', desc: 'of total' },
  { key: 'removed', label: 'Removed', color: '#9b1c1c', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'incl. lost & removed' },
]

const statusOf = (e) => e.status || 'Active'
const LENS_PREDICATE = {
  all: () => true,
  active: (e) => statusOf(e) === 'Active',
  lost: (e) => statusOf(e) === 'Lost',
  removed: (e) => statusOf(e) === 'Removed',
}

export default function SpecialistKpiPanel({ experts = [], ecoMap = {} }) {
  const [lens, setLens] = useState('active')

  const pool = experts
  const statusCounts = useMemo(() => ({
    all: pool.length,
    active: pool.filter(LENS_PREDICATE.active).length,
    lost: pool.filter(LENS_PREDICATE.lost).length,
    removed: pool.filter(LENS_PREDICATE.removed).length,
  }), [pool])

  const scoped = useMemo(() => pool.filter(LENS_PREDICATE[lens]), [pool, lens])
  const ecosOf = (e) => ecoMap[e.id] || []

  const top = useMemo(() => {
    const t = scoped.filter((e) => e.top_of_t === true).length
    return { topT: t, notTopT: scoped.length - t }
  }, [scoped])

  // Ecosystem membership is NOT mutually exclusive — a specialist counts in
  // each ecosystem they belong to. Sorted by count desc; all six always shown.
  const ecoData = useMemo(() => {
    const counts = ECOSYSTEMS.map((name) => ({ key: name, label: name, count: scoped.filter((e) => ecosOf(e).includes(name)).length }))
    return counts.sort((a, b) => b.count - a.count)
  }, [scoped, ecoMap])
  const multi = useMemo(() => scoped.filter((e) => ecosOf(e).length > 1).length, [scoped, ecoMap])
  const none = useMemo(() => scoped.filter((e) => ecosOf(e).length === 0).length, [scoped, ecoMap])

  const activeLens = LENSES.find((l) => l.key === lens)

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}>
      <KpiHero
        title="Specialist KPIs"
        subtitle={`${statusCounts.all} specialists total · ${scoped.length} in view`}
        lenses={LENSES}
        counts={statusCounts}
        lens={lens}
        setLens={setLens}
        unitLabel="specialists"
      />

      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: '280px', display: 'flex', flexDirection: 'column' }}>
          <SplitDonut
            title="Top of the T"
            total={scoped.length}
            segments={[
              { label: 'Top of the T', n: top.topT, color: '#c89b2a' },
              { label: 'Not Top of the T', n: top.notTopT, color: '#8a9bbd' },
            ]}
          />
        </div>
        <div style={{ flex: '2 1 460px', minWidth: '300px' }}>
          <BreakdownCard
            title="Breakdown by ecosystem"
            count={scoped.length}
            activeLens={lens !== 'all' ? activeLens : null}
            onClearLens={() => setLens('all')}
            note="Specialists can belong to more than one ecosystem, so these counts overlap and add up to more than the roster."
          >
            <BreakdownRows rows={ecoData} denom={scoped.length} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--vfo-tint)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '999px', background: 'rgba(0,149,255,0.1)', border: '1px solid rgba(0,149,255,0.25)', color: '#0095ff' }}>
                {multi} in 2+ ecosystems
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>
                {none} in none
              </span>
            </div>
          </BreakdownCard>
        </div>
      </div>
    </div>
  )
}
