import { useEffect, useMemo, useRef, useState } from 'react'
import { callApi } from '../../../lib/api'
import ListFilterButton from '../ListFilterButton'
import { clearedTaxPayments } from '../taxShared'
import { Skeleton, TableSkeleton } from '../../shared/Skeleton'
import CumulativeSummary from './kpiSummary/CumulativeSummary'
import AverageFees from './kpiSummary/AverageFees'
import SuccessFormula from './kpiSummary/SuccessFormula'

// Tax Planning KPI Summary (2026-11-23, Workbench card "General Tax Planning KPis"):
// the Cumulative Summary, Average Fees and Success Formula sub-tabs on Tax Planner
// KPIs. Every figure comes from tax_plan_kpi_summary_load (step statuses and days
// from tax_plan_kpis, so they agree with the per-plan tiles); this page filters,
// loads and lays out. The one exception is the VFO revenue card, whose split lives
// only in clearedTaxPayments (Tax Planning Revenue), fed by tax_planning_load.

const TITLES = { cumulative: 'Cumulative Summary', fees: 'Average Fees', formula: 'Success Formula' }
const DATE_PRESETS = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'custom', label: 'Custom' },
]

const todayEt = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

function rangeFor(preset, custom) {
  const today = todayEt()
  const [y, m] = today.split('-').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  if (preset === 'month') return { from: `${y}-${pad(m)}-01`, to: today }
  if (preset === 'quarter') return { from: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, to: today }
  if (preset === 'ytd') return { from: `${y}-01-01`, to: today }
  if (preset === 'custom') return { from: custom.from || null, to: custom.to || null }
  return { from: null, to: null }
}

const ctrl = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }
const pillBtn = { display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '7px 13px', borderRadius: '999px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }

function Loading({ tab }) {
  return (
    <div>
      {tab === 'cumulative' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height="150px" style={{ borderRadius: '12px' }} />)}
        </div>
      )}
      {tab === 'fees' && <Skeleton height="170px" style={{ borderRadius: '16px', marginBottom: '12px' }} />}
      {tab === 'formula' && <Skeleton height="150px" style={{ borderRadius: '16px', marginBottom: '12px' }} />}
      <TableSkeleton cols={tab === 'formula' ? 8 : 4} rows={8} />
    </div>
  )
}

export default function TaxPlanningKpiSummary({ tab }) {
  const [listFilter, setListFilter] = useState({ team: [] })
  const [preset, setPreset] = useState('all')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [compare, setCompare] = useState(false)
  const [data, setData] = useState(null)
  const [teamsAll, setTeamsAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [revRows, setRevRows] = useState(null)
  const [vfoState, setVfoState] = useState({ state: 'idle' })
  const reqId = useRef(0)

  const { from, to } = rangeFor(preset, custom)
  const teams = listFilter.team
  const query = useMemo(() => ({ from, to, teams }), [from, to, JSON.stringify(teams)])

  useEffect(() => {
    if (preset === 'custom' && custom.from && custom.to && custom.from > custom.to) return
    const id = ++reqId.current
    setLoading(true)
    setError('')
    callApi('tax_plan_kpi_summary_load', query)
      .then((res) => {
        if (id !== reqId.current) return
        if (res?.error) { setError(res.error); return }
        setData(res)
        if (Array.isArray(res.teams_all) && res.teams_all.length) setTeamsAll(res.teams_all)
        for (const w of res.warnings || []) console.warn(`Tax KPI: ${w}`)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        if (e?.status === 403) setForbidden(true)
        else setError(e?.data?.error || e?.message || 'Unknown error')
      })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [query, reloadKey])

  // The VFO revenue card: loaded once, the first time Average Fees opens.
  useEffect(() => {
    if (tab !== 'fees' || vfoState.state !== 'idle') return
    setVfoState({ state: 'loading' })
    callApi('tax_planning_load')
      .then((res) => {
        if (res?.error) { setVfoState({ state: 'error', error: res.error }); return }
        setRevRows(res.rows || [])
        setVfoState({ state: 'ok' })
      })
      .catch((e) => setVfoState(e?.status === 403 ? { state: 'forbidden' } : { state: 'error', error: e?.data?.error || e?.message || 'Unknown error' }))
  }, [tab, vfoState.state])

  const payments = useMemo(() => (revRows ? clearedTaxPayments(revRows) : []), [revRows])
  const vfo = useMemo(() => {
    if (vfoState.state !== 'ok' || !data) return { ...vfoState, total: 0 }
    const ids = new Set(data.summary.fees.plan_ids.map(String))
    const total = payments.filter((p) => ids.has(String(p.planId))).reduce((a, p) => a + (Number(p.vfos) || 0), 0)
    return { state: 'ok', total }
  }, [vfoState, payments, data])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    if (vfoState.state !== 'idle' && vfoState.state !== 'forbidden') setVfoState({ state: 'idle' })
  }

  if (forbidden) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', fontSize: '13px', color: 'var(--vfo-muted)' }}>
        Needs Client Overview access. Ask a superadmin to grant the Client Overview tab to see the tax planning summary.
      </div>
    )
  }

  const filterGroups = [
    { key: 'team', label: 'Tax team', options: teamsAll, get: (c) => c.team },
  ]
  const caseCount = data?.summary?.cumulative?.all?.total_cases ?? 0
  const teamChip = teams.length === 0 ? 'All tax teams' : teams.length === 1 ? teams[0] : `${teams.length} tax teams`
  const presetLabel = DATE_PRESETS.find((p) => p.key === preset)?.label
  const chip = { padding: '5px 11px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }
  const empty = data && caseCount === 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--vfo-heading)', marginRight: '6px' }}>
          {TITLES[tab]}
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-muted)', marginLeft: '6px' }}>
            · {caseCount} cases
          </span>
        </div>
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} align="left" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)' }}>
          Plan created
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={ctrl} aria-label="Plan created">
            {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={ctrl} />
            <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>to</span>
            <input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={ctrl} />
          </>
        )}
        <span style={chip}>{teamChip}</span>
        <span style={chip}>{presetLabel}</span>
        <div style={{ flex: '1 1 auto' }} />
        {tab === 'cumulative' && (
          <button onClick={() => setCompare((v) => !v)} aria-pressed={compare} style={pillBtn}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: '30px', height: '17px', borderRadius: '999px', position: 'relative', background: compare ? 'var(--vfo-primary)' : 'var(--vfo-border-strong)' }}>
              <span style={{ position: 'absolute', top: '2px', left: compare ? '15px' : '2px', width: '13px', height: '13px', borderRadius: '50%', background: '#ffffff', transition: 'left .15s' }} />
            </span>
            Compare teams
          </button>
        )}
        <button onClick={refresh} disabled={loading} style={{ ...pillBtn, color: 'var(--vfo-primary)', fontWeight: 700, opacity: loading ? 0.6 : 1 }}>Refresh</button>
      </div>

      {preset === 'custom' && custom.from && custom.to && custom.from > custom.to && (
        <div style={{ fontSize: '12.5px', color: '#c0392b', marginBottom: '10px' }}>The From date is after the To date.</div>
      )}

      {error ? (
        <div style={{ padding: '10px 14px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>
          Could not load tax planning KPIs: {error}
        </div>
      ) : loading && !data ? (
        <Loading tab={tab} />
      ) : empty ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13px', color: 'var(--vfo-faint)', fontStyle: 'italic' }}>No tax plans match these filters.</div>
      ) : data ? (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          {tab === 'cumulative' && <CumulativeSummary data={data} compare={compare} />}
          {tab === 'fees' && <AverageFees data={data} vfo={vfo} />}
          {tab === 'formula' && <SuccessFormula data={data} />}
        </div>
      ) : null}
    </div>
  )
}
