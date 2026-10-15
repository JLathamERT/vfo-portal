import { Fragment } from 'react'

// Purely presentational track-view kit — progress hero + phase badges.
// No API calls, no state, no business logic: callers pass display data only.

// Numbered circle for phase-card headers. done = green check, active = blue
// gradient number, pending = tinted grey number.
export function PhaseBadge({ number, state }) {
  const isDone = state === 'done'
  const isActive = state === 'active'
  return (
    <div style={{
      width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: 700, fontFamily: 'Inter, sans-serif', lineHeight: 1,
      background: isDone ? '#1b9254' : isActive ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : 'var(--vfo-tint)',
      color: (isDone || isActive) ? '#ffffff' : 'var(--vfo-muted)',
      border: (isDone || isActive) ? 'none' : '1px solid var(--vfo-border-chip)',
      boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none',
    }}>
      {isDone ? '✓' : number}
    </div>
  )
}

// Horizontal mini-stepper: one node per phase, connected by lines.
// steps: [{ label, state: 'done' | 'active' | 'pending', number? }]
// `number` overrides the positional 1..N node label for tracks whose business
// numbering doesn't match render order (see the tax track's Set Up / Tax 5).
function PhaseStepper({ steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--vfo-tint)' }}>
      {steps.map((s, i) => {
        const isDone = s.state === 'done'
        const isActive = s.state === 'active'
        const lineDone = i > 0 && steps[i - 1].state === 'done'
        return (
          <Fragment key={i}>
            {i > 0 && <div style={{ flex: 1, height: '2px', borderRadius: '2px', background: lineDone ? 'rgba(27,146,84,0.4)' : 'var(--vfo-border)', margin: '10px 4px 0', minWidth: '10px' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', maxWidth: '96px', flexShrink: 0 }}>
              <div style={{
                width: '21px', height: '21px', borderRadius: '50%', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, lineHeight: 1,
                background: isDone ? '#1b9254' : 'var(--vfo-card)',
                border: isDone ? 'none' : isActive ? '2px solid #0a85e8' : '2px solid var(--vfo-border-chip)',
                color: isDone ? '#ffffff' : isActive ? 'var(--vfo-accent-text)' : 'var(--vfo-faint)',
                boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.22)' : 'none',
              }}>
                {isDone ? '✓' : (s.number != null ? s.number : i + 1)}
              </div>
              <div style={{
                fontSize: '10px', fontWeight: 600, lineHeight: 1.25, textAlign: 'center',
                color: isActive ? 'var(--vfo-accent-text)' : isDone ? 'var(--vfo-muted)' : 'var(--vfo-faint)',
              }}>{s.label}</div>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

// Circular hero avatar — a headshot image when `src` is given, else a
// gradient-filled initials circle. Used in profile heroes (members, clients).
export function HeroAvatar({ src, name, size = 60 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: src ? 'var(--vfo-tint)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: '1px solid var(--vfo-border-chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(18,94,204,0.28)' }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.36) }}>{initials}</span>}
    </div>
  )
}

// Designed progress hero for track views: gradient accent strip, eyebrow +
// title, optional meta line, % + progress bar (when completed/total given),
// optional right-side action node, optional phase stepper.
// `accent={false}` drops the gradient strip; omitting `title` turns the card
// into a pure progress card (counter shown in the title slot) — use these for
// nested cards so stacked heroes don't repeat the same treatment.
export function TrackHero({ eyebrow, title, meta, action, completed, total, unitLabel = 'tasks completed', steps, accent = true, avatar = null }) {
  const hasBar = typeof total === 'number' && total > 0
  const pct = hasBar ? Math.round(completed / total * 100) : 0
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '20px', overflow: 'hidden' }}>
      {accent && <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />}
      <div style={{ padding: '18px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '200px', flex: 1 }}>
            {avatar}
            <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '5px' }}>{eyebrow}</div>}
            {title && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1.15 }}>{title}</div>}
            {!title && hasBar && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{completed}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-faint)' }}>/ {total}</span>
                <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginLeft: '8px', textTransform: 'uppercase' }}>{unitLabel}</span>
              </div>
            )}
            {meta && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{meta}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {hasBar && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-primary)', lineHeight: 1 }}>{pct}%</div>
                {title && <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.7px', color: 'var(--vfo-muted)', marginTop: '5px', textTransform: 'uppercase' }}>{completed} / {total} {unitLabel}</div>}
              </div>
            )}
            {action}
          </div>
        </div>
        {hasBar && (
          <div style={{ marginTop: '14px', height: '8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: 'linear-gradient(90deg, #125ecc 0%, #0a85e8 100%)', transition: 'width 0.3s' }} />
          </div>
        )}
        {steps && steps.length > 0 && <PhaseStepper steps={steps} />}
      </div>
    </div>
  )
}

// Designed header row for list views (e.g. "Tax Plans", "Regular Priorities"):
// navy title + count chip on the left, caller-provided action on the right.
export function ListHeader({ title, count, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)' }}>{title}</span>
        {typeof count === 'number' && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{count}</span>}
      </div>
      {action}
    </div>
  )
}
