import { Fragment } from 'react'
import {
  PASS_GREEN_FROM, PASS_AMBER_FROM, RAG, ragFor, fmtPct, fmtDays, StatusDot,
  card, cardTitle, thStyle, num, footNote,
} from './shared'

// Cumulative Summary: the six step tiles, the average-days timeline, then one
// status table (a section per step). Compare teams repeats Count · % per team.

const BAR_BLUES = ['#002973', '#0a3f9e', '#125ecc', '#0a85e8', '#4a7fd4', '#7aa3e0']
const SEG_MIN = '78px'
// Table lines: a full grid inside each step, a heavier rule between steps.
const GRID = '1px solid var(--vfo-border-strong)'
const STEP_RULE = '2px solid var(--vfo-border-mid)'

// What each tile's big number counts (the step total, which carries into the next step).
const PASS_HINT = {
  1: 'Submitted',
  2: 'Completed – Yes',
  3: 'Yes – Paid, Yes – Payment Pending, Yes – Agreement Pending',
  4: 'Yes – Move to 5, Yes – Payment Pending',
  5: 'Yes – Paid, Yes – Payment Pending',
  6: 'Completed',
}

function StepTile({ step }) {
  const rag = RAG[ragFor(step.denom > 0 ? step.pass_pct : null)]
  const passLabel = step.number === 1 ? 'of cases' : 'passed'
  const line = { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11.5px', lineHeight: '17px', whiteSpace: 'nowrap' }
  return (
    <div style={{ ...card, borderRadius: '12px', borderTop: `3px solid ${rag.rail}`, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)', lineHeight: '14px', height: '14px' }}>Step {step.number}</div>
      <div title={step.name} style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--vfo-ink)', lineHeight: '16px', height: '16px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.name}</div>
      <div title={`Cases counted: ${PASS_HINT[step.number]}`} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', height: '28px', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--vfo-heading)', lineHeight: '28px', fontVariantNumeric: 'tabular-nums' }}>{step.total}</span>
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--vfo-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.number === 1 ? 'cases submitted' : 'cases passed'}</span>
      </div>
      <div style={{ height: '22px', marginTop: '6px' }}>
        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, color: rag.text, background: rag.bg, whiteSpace: 'nowrap' }}>
          {step.denom > 0 ? `${fmtPct(step.pass_pct)} ${passLabel}` : '—'}
        </span>
      </div>
      <div style={{ borderTop: '1px solid var(--vfo-border-soft)', marginTop: '8px', paddingTop: '8px' }}>
        <div style={line}><span style={{ color: 'var(--vfo-faint)' }}>Avg</span><span style={{ fontWeight: 700, color: 'var(--vfo-ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.avg_days.n > 0 ? `${fmtDays(step.avg_days.avg)} · n=${step.avg_days.n}` : '—'}</span></div>
        <div style={line}><span style={{ color: 'var(--vfo-faint)' }}>Cum.</span><span style={{ fontWeight: 700, color: 'var(--vfo-ink)' }}>{fmtDays(step.avg_cum_days.avg)}</span></div>
        <div style={line}><span style={{ color: 'var(--vfo-faint)' }}>Cum. %</span><span style={{ fontWeight: 700, color: 'var(--vfo-ink)' }}>{fmtPct(step.pct_step2)}</span></div>
      </div>
    </div>
  )
}

function Timeline({ steps }) {
  const parts = steps.map((s) => ({ n: s.number, name: s.name, d: s.avg_days.avg }))
  const total = parts.reduce((a, p) => a + (p.d || 0), 0)
  return (
    <div style={{ ...card, padding: '14px 18px', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <span style={cardTitle}>Average days per step</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)' }}>{total > 0 ? `${total.toFixed(1)} d plan start → implementation` : 'No finished steps with day counts yet'}</span>
      </div>
      {total > 0 && (
        <>
          {/* Widths follow the days, but every step keeps room for its own label
              (SEG_MIN), so a short step still shows its days. */}
          <div style={{ display: 'flex', height: '26px', borderRadius: '8px', overflow: 'hidden', marginTop: '10px', gap: '2px' }}>
            {parts.map((p, i) => p.d > 0 && (
              <div key={p.n} title={`Step ${p.n} ${p.name}: ${p.d.toFixed(1)} days`} style={{ flex: `${p.d} 1 0`, minWidth: SEG_MIN, background: BAR_BLUES[i], color: '#ffffff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {p.d.toFixed(1)} d
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: '6px', gap: '2px', fontSize: '11px', color: 'var(--vfo-muted)' }}>
            {parts.map((p) => p.d > 0 && (
              <div key={p.n} title={`Step ${p.n} ${p.name}`} style={{ flex: `${p.d} 1 0`, minWidth: SEG_MIN, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>Step {p.n} · {p.name}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const chip = { padding: '4px 10px', borderRadius: '8px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }
const chipB = { fontWeight: 800, color: 'var(--vfo-ink)' }

export default function CumulativeSummary({ data, compare }) {
  const all = data.summary.cumulative.all
  const teams = compare ? data.summary.cumulative.by_team : []
  const columns = [{ key: 'All', label: 'All', cum: all }, ...teams.map((t) => ({ key: t.team, label: t.team, cum: t }))]
  const span = 2 + columns.length
  const strat = all.steps[5]?.strategies || {}
  const cellBase = { padding: '6px 12px', borderLeft: GRID, borderTop: GRID, ...num }
  const countCell = (step, status, col, i) => {
    const s = col.cum.steps[step.number - 1]
    const row = s?.rows.find((r) => r.status === status)
    return (
      <td key={col.key} style={{ ...cellBase, background: i > 0 ? 'var(--vfo-tint)' : undefined }}>
        <b style={{ fontWeight: 700, display: 'inline-block', minWidth: '24px' }}>{row ? row.count : 0}</b>
        <span style={{ display: 'inline-block', minWidth: '46px', marginLeft: '6px', color: 'var(--vfo-muted)' }}>{row ? fmtPct(row.pct_prev) : '—'}</span>
      </td>
    )
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px' }}>
        {all.steps.map((s) => <StepTile key={s.number} step={s} />)}
      </div>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: RAG.green.rail, marginRight: '5px' }} />% passed {PASS_GREEN_FROM}% or more</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: RAG.amber.rail, marginRight: '5px' }} />{PASS_AMBER_FROM}% to under {PASS_GREEN_FROM}%</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: RAG.red.rail, marginRight: '5px' }} />below {PASS_AMBER_FROM}%</span>
        <span style={{ color: 'var(--vfo-faint)' }}>Step 1 is % of Total Cases; Steps 2-6 are % of the previous step's total</span>
      </div>

      <Timeline steps={all.steps} />

      <div style={{ ...card, overflow: 'hidden', marginTop: '12px' }}>
        <div style={{ overflowX: 'auto' }}>
          {/* Sized so All + three teams fit a 1024px screen; more teams scroll
              inside this card, never the page. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: `${320 + columns.length * 112}px` }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', padding: '9px 16px', verticalAlign: 'bottom', borderBottom: STEP_RULE }}>Step · Status</th>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...thStyle, textAlign: 'right', whiteSpace: 'normal', minWidth: '104px', maxWidth: '150px', verticalAlign: 'bottom', borderLeft: GRID, borderBottom: STEP_RULE }}>
                    {c.label}
                    <div style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--vfo-faint)', whiteSpace: 'nowrap' }}>Count · %</div>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right', whiteSpace: 'normal', width: '96px', verticalAlign: 'bottom', borderLeft: GRID, borderBottom: STEP_RULE, padding: '9px 16px' }}>% of Step 2 total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--vfo-accent-tint)' }}>
                <td style={{ padding: '9px 16px', fontWeight: 800, color: 'var(--vfo-heading)' }}>Total Cases</td>
                {columns.map((c) => <td key={c.key} style={{ ...cellBase, borderTop: 'none', padding: '9px 12px', fontWeight: 800 }}>{c.cum.total_cases}</td>)}
                <td style={{ borderLeft: GRID }} />
              </tr>
              {all.steps.map((s) => (
                <Fragment key={s.number}>
                  <tr>
                    <td colSpan={span} style={{ padding: '14px 16px 8px', borderTop: STEP_RULE, borderBottom: '2px solid var(--vfo-primary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
                        <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--vfo-primary)', color: '#ffffff', fontSize: '11px', alignItems: 'center', justifyContent: 'center' }}>{s.number}</span>
                        Step {s.number} · {s.name}
                      </span>
                    </td>
                  </tr>
                  {s.rows.map((r, ri) => (
                    <tr key={r.status} style={{ color: r.count === 0 ? 'var(--vfo-faint)' : 'var(--vfo-ink)', background: ri % 2 === 1 ? 'rgba(18,94,204,0.035)' : undefined }}>
                      <td style={{ padding: '6px 16px 6px 46px', whiteSpace: 'nowrap', borderTop: GRID }}><StatusDot status={r.status} />{s.number === 1 ? 'Total Submitted' : r.status}</td>
                      {columns.map((c, i) => countCell(s, r.status, c, i))}
                      <td style={{ ...cellBase, padding: '6px 16px', color: 'var(--vfo-muted)' }}>{s.number >= 2 ? fmtPct(r.pct_step2) : ''}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--vfo-tint)' }}>
                    <td colSpan={span} style={{ padding: '7px 16px 9px 46px', borderTop: GRID }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--vfo-heading)' }}>Step {s.number} total</span>
                        <div style={{ flex: '1 1 auto' }} />
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ ...chip, background: 'var(--vfo-accent-tint)', color: 'var(--vfo-accent-text)' }}>
                            Total <b style={{ fontWeight: 800 }}>{s.total}</b> · {fmtPct(s.pass_pct)} of {s.number === 1 ? 'cases' : `Step ${s.number - 1}`}
                          </span>
                          <span style={chip}>Avg <b style={chipB}>{fmtDays(s.avg_days.avg)}</b> <span style={{ color: 'var(--vfo-faint)' }}>n={s.avg_days.n}</span></span>
                          <span style={chip}>Cumulative <b style={chipB}>{fmtDays(s.avg_cum_days.avg)}</b></span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={footNote}>
          <span>{all.no_day_counts} {all.no_day_counts === 1 ? 'case' : 'cases'} without day counts left out of time averages</span>
          <span>Step 6 strategies: Completed {strat.Completed || 0} · Still in Process {strat['Still in Process'] || 0} · Stop {strat.Stop || 0} · N/A {strat['N/A'] || 0}</span>
          <span>% = of the previous step's total · Avg = passed cases only · Cumulative = plan start → end of step</span>
        </div>
      </div>
    </div>
  )
}
