import { Fragment } from 'react'
import { fmtKpiMoney } from '../kpiFormat'
import { LOW_N, fmtPct, fmtDays, card, cardTitle, heroGradient, thStyle, num } from './shared'

// Success Formula: the three headline figures (emphasised equally), then one
// table: a subtotal row per tax team, its planners under it, and an All row.
// Sorted by ROI success $, highest first (server side). The spec's VFOS / Direct
// split is left out for now (Paxton 2026-11-23).

const money = (v) => (v === null || v === undefined ? '—' : fmtKpiMoney(Math.round(v)))
const days = (a) => (a && a.n > 0 ? fmtDays(a.avg) : '—')

function Headline({ m }) {
  const col = (i) => ({ minWidth: 0, ...(i > 0 ? { paddingLeft: '24px', borderLeft: '1px solid rgba(255,255,255,0.25)' } : {}) })
  const label = { fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.75 }
  const big = { fontSize: '44px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, marginTop: '10px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const sub = { fontSize: '12px', fontWeight: 600, opacity: 0.72, marginTop: '8px' }
  return (
    <div style={{ borderRadius: '16px', padding: '22px 26px', marginBottom: '12px', background: heroGradient, boxShadow: '0 14px 34px rgba(0,41,115,0.22)', color: '#ffffff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '24px' }}>
        <div style={col(0)}>
          <div style={label}>Average ROI % Success</div>
          <div style={big}>{fmtPct(m.roi_pct)}</div>
          <div style={sub}>Step 3 Yes ÷ Step 2 total ({m.step3_total} of {m.step2_total})</div>
        </div>
        <div style={col(1)}>
          <div style={label}>Average ROI Success ($)</div>
          <div style={big}>{money(m.roi_dollars)}</div>
          <div style={sub}>Avg anticipated fee {money(m.avg_fee.n > 0 ? m.avg_fee.avg : null)} × {fmtPct(m.roi_pct)}</div>
        </div>
        <div style={col(2)}>
          <div style={label}>ROI Success ÷ Days to ROI Yes</div>
          <div style={big}>{money(m.roi_per_day)}</div>
          <div style={sub}>{money(m.roi_dollars)} ÷ {days(m.days_to_roi)} · quicker = higher</div>
        </div>
      </div>
      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 600, opacity: 0.72 }}>
        All {m.cases} cases in the filter · the same three figures are shaded in the table below
      </div>
    </div>
  )
}

// Table lines, as on the Cumulative Summary table.
const GRID = '1px solid var(--vfo-border-strong)'
const hl = { background: 'var(--vfo-accent-tint)', fontSize: '14px', fontWeight: 800, color: 'var(--vfo-heading)' }

function Row({ name, m, kind }) {
  const low = m.cases < LOW_N
  const sub = kind === 'team' || kind === 'all'
  const td = { padding: '7px 10px', borderTop: GRID, borderLeft: GRID, ...num }
  const lowColor = low ? { color: 'var(--vfo-faint)' } : {}
  return (
    <tr title={low ? `Low n: fewer than ${LOW_N} cases` : undefined} style={{ color: low ? 'var(--vfo-faint)' : 'var(--vfo-ink)', background: sub ? 'var(--vfo-tint)' : undefined, fontWeight: sub ? 700 : 400 }}>
      <td style={{ padding: '7px 16px', borderTop: kind === 'all' ? '2px solid var(--vfo-border-mid)' : GRID, paddingLeft: kind === 'planner' ? '34px' : '16px', fontWeight: kind === 'planner' ? 500 : 800, color: low ? undefined : kind === 'planner' ? 'var(--vfo-ink)' : 'var(--vfo-heading)', whiteSpace: 'nowrap' }}>{name}</td>
      <td style={td}>{m.cases}</td>
      <td style={td}>{days(m.speed_2_4)}</td>
      <td style={td}>{money(m.avg_fee.n > 0 ? m.avg_fee.avg : null)}</td>
      <td style={{ ...td, ...hl, ...lowColor, padding: '7px 12px' }}>{fmtPct(m.roi_pct)}</td>
      <td style={{ ...td, ...hl, ...lowColor, padding: '7px 12px' }}>{money(m.roi_dollars)}</td>
      <td style={td}>{days(m.days_to_roi)}</td>
      <td style={{ ...td, ...hl, ...lowColor, padding: '7px 16px' }}>{money(m.roi_per_day)}</td>
    </tr>
  )
}

export default function SuccessFormula({ data }) {
  const s = data.summary.success
  const hlHead = { background: 'var(--vfo-accent-tint)', color: 'var(--vfo-accent-text)' }
  const th = { ...thStyle, borderLeft: GRID, borderBottom: '2px solid var(--vfo-border-mid)' }
  return (
    <div>
      <Headline m={s.headline} />
      <div style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '10px 14px', fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--vfo-ink)' }}>ROI success $</b> = avg anticipated fee × ROI % success (a Yes at Step 3 ÷ the Step 2 total). <b style={{ color: 'var(--vfo-ink)' }}>ROI $ per day</b> = ROI success $ ÷ days to ROI Yes, so quicker teams score higher. Rows are sorted by ROI success $, highest first. Rows with fewer than {LOW_N} cases are greyed out.
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ ...cardTitle, padding: '11px 16px', borderBottom: '1px solid var(--vfo-border-soft)' }}>By tax team and planner</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '860px' }}>
            <thead>
              <tr>
                <th style={{ ...th, borderLeft: 'none', textAlign: 'left', padding: '8px 16px' }}>Team · Planner</th>
                <th style={{ ...th, textAlign: 'right' }}>Cases</th>
                <th style={{ ...th, textAlign: 'right' }} title="Mean of Step 2 + Step 3 + Step 4 days, over cases that passed Step 4">Speed steps 2–4</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg anticipated fee</th>
                <th style={{ ...th, ...hlHead, textAlign: 'right' }}>ROI % success</th>
                <th style={{ ...th, ...hlHead, textAlign: 'right' }}>ROI success $</th>
                <th style={{ ...th, textAlign: 'right' }}>Days to ROI Yes</th>
                <th style={{ ...th, ...hlHead, textAlign: 'right', padding: '8px 16px' }}>ROI $ / day</th>
              </tr>
            </thead>
            <tbody>
              {s.teams.map((t) => (
                <Fragment key={t.team}>
                  <Row name={t.team} m={t.metrics} kind="team" />
                  {t.team !== 'Not allocated' && t.planners.map((pl) => <Row key={pl.planner_id ?? 'none'} name={pl.planner_name} m={pl.metrics} kind="planner" />)}
                </Fragment>
              ))}
              <Row name="All tax teams" m={s.headline} kind="all" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
