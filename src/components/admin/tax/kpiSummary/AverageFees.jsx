import { fmtKpiMoney } from '../kpiFormat'
import { fmtPct, card, cardTitle, heroGradient, thStyle, num, footNote } from './shared'

// Average Fees: the anticipated-fee hero (with collection success), the VFO
// revenue card, then fees paid by component. Compare teams is not offered here.

// Averages read in whole dollars, as on the mockup.
const money = (a) => (a && a.n > 0 ? fmtKpiMoney(Math.round(a.avg)) : '—')

// `vfo` = { state: 'loading' | 'ok' | 'forbidden' | 'error', total, error }: the
// Elite VFO Income on these plans, worked out by the page from tax_planning_load.
export default function AverageFees({ data, vfo }) {
  const f = data.summary.fees
  const anticipatedAvg = f.anticipated.n > 0 ? f.anticipated.avg : null
  const parts = [
    { label: 'Average Initial Retainer Paid', a: f.initial_retainer },
    { label: 'Average Final Retainer Paid', a: f.final_retainer },
    { label: 'Average Implementation Fee Paid', a: f.implementation },
  ]
  const strategies = f.completed_strategies
  let vfoValue = '—'
  let vfoNote = `VFO share collected ÷ ${strategies} completed ${strategies === 1 ? 'strategy' : 'strategies'}`
  if (vfo.state === 'loading') vfoValue = '…'
  else if (vfo.state === 'forbidden') { vfoValue = '—'; vfoNote = 'Needs Accounting access' }
  else if (vfo.state === 'error') { vfoValue = '—'; vfoNote = `Could not load VFO revenue: ${vfo.error}` }
  else if (strategies > 0) vfoValue = fmtKpiMoney(Math.round(vfo.total / strategies))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
        <div style={{ gridColumn: 'span 2', borderRadius: '16px', padding: '22px 26px', background: heroGradient, boxShadow: '0 14px 34px rgba(0,41,115,0.22)', color: '#ffffff', minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.75 }}>Average Total Engagement Fee Anticipated</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '48px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{money(f.anticipated)}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.75 }}>n = {f.anticipated.n} · projected total fee, else total fee</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.2)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.7 }}>Avg total paid as % of anticipated</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {f.collection_pct.n > 0 ? fmtPct(f.collection_pct.avg) : '—'}
                <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7, marginLeft: '8px' }}>collection success · n = {f.collection_pct.n}</span>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.7 }}>Made up of</div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '7px', opacity: 0.9 }}>Initial retainer + final retainer + implementation fee, net of refunds (deposit excluded)</div>
            </div>
          </div>
        </div>
        <div style={{ borderRadius: '16px', padding: '22px 24px', background: 'var(--vfo-gold-bg)', border: '1px solid var(--vfo-gold-border)', borderTop: '4px solid var(--vfo-gold-text)', boxShadow: 'var(--vfo-shadow-card)', minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--vfo-gold-text)' }}>VFO revenue</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', marginTop: '6px' }}>Average Gross VFO Revenue per completed strategy</div>
          <div style={{ fontSize: '40px', fontWeight: 800, color: 'var(--vfo-gold-strong)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: '12px', fontVariantNumeric: 'tabular-nums' }}>{vfoValue}</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '10px' }}>{vfoNote}</div>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden', marginTop: '12px' }}>
        <div style={{ ...cardTitle, padding: '11px 16px', borderBottom: '1px solid var(--vfo-border-soft)' }}>Fees paid · by component</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', padding: '8px 16px' }}>Component</th>
                <th style={{ ...thStyle, textAlign: 'right', padding: '8px 16px' }}>Average paid</th>
                <th style={{ ...thStyle, textAlign: 'right', padding: '8px 16px' }}>n</th>
                <th style={{ ...thStyle, textAlign: 'left', padding: '8px 16px', width: '260px' }}>Share of anticipated</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const share = anticipatedAvg && p.a.n > 0 ? Math.min((p.a.avg / anticipatedAvg) * 100, 100) : 0
                const td = { padding: '10px 16px', borderTop: '1px solid var(--vfo-border-soft)' }
                return (
                  <tr key={p.label}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--vfo-ink)' }}>{p.label}</td>
                    <td style={{ ...td, ...num, fontWeight: 800, color: 'var(--vfo-heading)' }}>{money(p.a)}</td>
                    <td style={{ ...td, ...num, color: 'var(--vfo-muted)' }}>{p.a.n}</td>
                    <td style={td}>
                      <div title={anticipatedAvg && p.a.n > 0 ? `${fmtPct((p.a.avg / anticipatedAvg) * 100)} of the average anticipated fee` : ''} style={{ height: '8px', borderRadius: '999px', background: 'var(--vfo-tint)' }}>
                        <div style={{ width: `${share}%`, height: '8px', borderRadius: '999px', background: 'var(--vfo-primary)' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={footNote}>
          <span>Succeeded payments only · bar = average paid ÷ average anticipated fee ({money(f.anticipated)})</span>
        </div>
      </div>
    </div>
  )
}
