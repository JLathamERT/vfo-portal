// Shared visual kit for the KPI pages (member + specialist). The status lens
// lives INSIDE the navy hero — a clickable stacked bar + chip row — so the
// page reads as one instrument panel and themes cleanly in dark mode.

export function hexA(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

// Navy gradient hero: title on the left, the selected lens's big count on the
// right, then a proportional status bar (clickable segments; sub-lenses like
// suspended/paused overlap Active so they appear as chips only) and a chip row.
export function KpiHero({ title, subtitle, lenses, counts, lens, setLens, unitLabel = 'members' }) {
  const active = lenses.find((l) => l.key === lens)
  const barLenses = lenses.filter((l) => !l.sub && l.key !== 'all')
  const total = counts.all || 0
  const pick = (key) => setLens(lens === key ? 'all' : key)
  return (
    <div style={{ borderRadius: '18px', overflow: 'hidden', marginBottom: '22px', background: 'linear-gradient(120deg, #002973 0%, #0a3f9e 48%, #125ecc 100%)', boxShadow: '0 14px 34px rgba(0,41,115,0.26)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '-60px', right: '-30px', width: '230px', height: '230px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%)' }} />
      <div style={{ position: 'relative', padding: '24px 30px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', lineHeight: 1.1 }}>{title}</div>
            {subtitle && <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.66)', marginTop: '7px' }}>{subtitle}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '56px', fontWeight: 800, letterSpacing: '-0.04em', color: '#ffffff', lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>{counts[lens] ?? 0}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginTop: '6px' }}>{active?.key === 'all' ? `Total ${unitLabel}` : `${active?.label} ${unitLabel}`}</div>
          </div>
        </div>

        {/* Proportional status bar — click a segment to focus that status. */}
        <div style={{ display: 'flex', height: '12px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)', marginTop: '20px' }}>
          {barLenses.map((l) => counts[l.key] > 0 && (
            <div
              key={l.key}
              onClick={() => pick(l.key)}
              title={`${l.label}: ${counts[l.key]}`}
              style={{ width: `${total > 0 ? (counts[l.key] / total) * 100 : 0}%`, background: l.barColor || l.color, cursor: 'pointer', opacity: lens === 'all' || lens === l.key ? 1 : 0.4, transition: 'opacity .2s' }}
            />
          ))}
        </div>

        {/* Status chips — the lens selector. Sub-lenses show a hollow dot. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          {lenses.map((l) => {
            const sel = lens === l.key
            const denom = l.sub ? counts.active : total
            const pct = denom > 0 ? Math.round(((counts[l.key] || 0) / denom) * 100) : 0
            return (
              <button
                key={l.key}
                onClick={() => pick(l.key)}
                title={l.key === 'all' ? l.desc : `${pct}% ${l.desc}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 13px', borderRadius: '999px',
                  background: sel ? '#ffffff' : 'rgba(255,255,255,0.12)',
                  border: `1px solid rgba(255,255,255,${sel ? 0.95 : 0.26})`,
                  color: sel ? '#0b2a66' : 'rgba(255,255,255,0.92)',
                  fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: l.sub ? 'transparent' : (l.barColor || l.color), border: l.sub ? `2px solid ${l.barColor || l.color}` : 'none', boxSizing: 'border-box' }} />
                {l.label}
                <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{counts[l.key] ?? 0}</span>
                {l.key !== 'all' && <span style={{ opacity: 0.62, fontSize: '11px' }}>{pct}%</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// SVG donut for two/three-way splits (Legacy vs New, Top of the T, …).
// `stack` renders the legend BELOW the donut (narrower + taller card) instead of
// beside it — the default (false) keeps the side-by-side layout.
export function SplitDonut({ title, segments, total, inView, note, stack }) {
  const R = 44, C = 2 * Math.PI * R
  let acc = 0
  const arcs = segments.filter((s) => s.n > 0).map((s) => {
    const frac = total > 0 ? s.n / total : 0
    const arc = { ...s, dash: frac * C, offset: -acc * C }
    acc += frac
    return arc
  })
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px 22px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{title}</span>
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)', fontWeight: 600 }}>{inView ?? total} in view</span>
      </div>
      <div style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', alignItems: 'center', gap: stack ? '16px' : '22px', flexWrap: 'wrap', flex: 1 }}>
        <svg width="118" height="118" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--vfo-tint)" strokeWidth="14" />
          {arcs.map((s) => (
            <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={s.offset} transform="rotate(-90 60 60)" />
          ))}
          <text x="60" y="57" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: 800, fill: 'var(--vfo-ink)' }}>{total}</text>
          <text x="60" y="74" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px', fill: 'var(--vfo-faint)' }}>IN VIEW</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '150px', width: stack ? '100%' : 'auto' }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', minWidth: '28px' }}>{s.n}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>{s.label}</span>
              <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', fontWeight: 700, marginLeft: 'auto' }}>{total > 0 ? Math.round((s.n / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
      {note && <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '14px', lineHeight: 1.5 }}>{note}</div>}
    </div>
  )
}

// Ranked leaderboard rows: rank chip, label, proportional bar, count + share,
// optional sub-type chips under the bar.
export function BreakdownRows({ rows, denom }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.key || r.label} style={{ display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '13px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
          <span style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', fontWeight: 800, fontFamily: 'Inter, sans-serif', background: i === 0 ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : 'var(--vfo-tint)', color: i === 0 ? '#ffffff' : 'var(--vfo-muted)', border: i === 0 ? 'none' : '1px solid var(--vfo-border-chip)', marginTop: '1px' }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--vfo-primary)' }}>{r.count}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-faint)', marginLeft: '7px' }}>{denom > 0 ? Math.round((r.count / denom) * 100) : 0}%</span>
              </span>
            </div>
            <div style={{ height: '7px', borderRadius: '999px', background: 'var(--vfo-tint)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg,#125ecc,#0a85e8)', transition: 'width .3s' }} />
            </div>
            {r.sub && r.sub.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '9px' }}>
                {r.sub.map((st) => (
                  <span key={st.label || '—'} style={{ fontSize: '11.5px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>
                    {st.label || '— (unset)'} <span style={{ fontWeight: 800, color: 'var(--vfo-ink)' }}>{st.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Card wrapper + header for the breakdown section (title, count chip, and the
// "Filtered: X ×" clear button when a lens is focused).
export function BreakdownCard({ title, count, activeLens, onClearLens, note, children }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: note ? '6px' : '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{title}</span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{count}</span>
        </div>
        {activeLens && (
          <button onClick={onClearLens} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', color: activeLens.chipColor || activeLens.color, background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '999px', padding: '6px 13px', cursor: 'pointer' }}>
            Filtered: {activeLens.label}
            <span style={{ fontSize: '14px', lineHeight: 1, opacity: 0.7 }}>×</span>
          </button>
        )}
      </div>
      {note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginBottom: '8px', lineHeight: 1.5 }}>{note}</div>}
      {children}
    </div>
  )
}
