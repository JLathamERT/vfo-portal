// Skeleton primitives — the building blocks every page skeleton composes.
// All colors come from the --vfo-* palette so skeletons render correctly in
// both light and dark mode. The shimmer itself is the .vfo-skeleton class in
// index.css.
import { useIsPhone } from '../../../lib/useMediaQuery'

export function Skeleton({ width = '100%', height = 16, style = {}, className = '' }) {
  return <span className={`vfo-skeleton ${className}`} style={{ width, height, ...style }} />
}

export function SkeletonText({ lines = 3, width = '100%', spacing = 8, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : width} height={14} />
      ))}
    </div>
  )
}

export function SkeletonRow({ withPill = true, withDate = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <Skeleton width={8} height={8} style={{ borderRadius: '50%', flexShrink: 0 }} />
      <Skeleton width="60%" height={14} style={{ flex: 1 }} />
      {withPill && <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />}
      {withDate && <Skeleton width={55} height={12} />}
    </div>
  )
}

// The standard freshened section card (white 16px-radius card w/ soft shadow).
export function CardShell({ children, pad = 24, style = {} }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: pad, marginBottom: '16px', ...style }}>
      {children}
    </div>
  )
}

export function SkeletonStats({ count = 3, indent = 24 }) {
  return (
    <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', paddingLeft: indent }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <Skeleton width={36} height={28} />
          <Skeleton width={64} height={10} />
        </div>
      ))}
    </div>
  )
}

export const ACCENT_STRIP = 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)'

// Mirrors TrackHero (shared/TrackKit.jsx): gradient accent strip, optional 60px
// avatar, eyebrow, big navy title, optional meta line. `progress` = the % on the
// right, its 'n / m tasks' caption and the bar; `steps` = the step bar's node count
// (never drawn on a phone, as the real one); `action` = 'toggle' (Live switch) or
// 'button'. `accent={false}` + `title={false}` = the plain progress card, where the
// task counter sits in the title's place.
export function HeroSkeleton({ accent = true, eyebrow = true, title = true, meta = true, avatar = false, action = false, progress = false, steps = 0 }) {
  const isPhone = useIsPhone()
  return (
    <CardShell pad={0} style={{ overflow: 'hidden', marginBottom: isPhone ? '14px' : '20px' }}>
      {accent && <div style={{ height: '4px', background: ACCENT_STRIP }} />}
      <div style={{ padding: isPhone ? '14px 16px' : '18px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: isPhone ? '12px' : '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
            {avatar && <Skeleton width={60} height={60} style={{ borderRadius: '50%', flexShrink: 0 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
              {eyebrow && <Skeleton width={96} height={10} style={{ maxWidth: '100%' }} />}
              {title ? <Skeleton width={230} height={22} style={{ maxWidth: '100%' }} /> : progress && <Skeleton width={170} height={22} style={{ maxWidth: '100%' }} />}
              {meta && <Skeleton width={250} height={12} style={{ maxWidth: '100%' }} />}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
            {progress && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <Skeleton width={58} height={25} />
                {title && !isPhone && <Skeleton width={128} height={9} />}
              </div>
            )}
            {action === 'toggle' && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Skeleton width={30} height={13} /><Skeleton width={44} height={24} style={{ borderRadius: '12px' }} /></div>}
            {action === 'button' && <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />}
          </div>
        </div>
        {progress && <Skeleton width="100%" height={8} style={{ borderRadius: '999px', marginTop: '14px' }} />}
        {progress && title && isPhone && <Skeleton width={128} height={9} style={{ marginTop: '8px' }} />}
        {steps > 0 && !isPhone && <StepperSkeleton steps={steps} />}
      </div>
    </CardShell>
  )
}

// Mirrors TrackKit's PhaseStepper: numbered circles joined by lines, labels under.
function StepperSkeleton({ steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--vfo-tint)' }}>
      {Array.from({ length: steps }).flatMap((_, i) => [
        i > 0 && <div key={`l${i}`} style={{ flex: 1, height: '2px', borderRadius: '2px', background: 'var(--vfo-border)', margin: '10px 4px 0', minWidth: '10px' }} />,
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <Skeleton width={21} height={21} style={{ borderRadius: '50%' }} />
          <Skeleton width={58} height={9} />
        </div>,
      ])}
    </div>
  )
}

// Mirrors the automation panels' PanelHero (admin/automation/StepKit.jsx): strip,
// eyebrow, title, right-side action, then the divided stat row.
export function PanelHeroSkeleton({ stats = 5, action = true }) {
  return (
    <CardShell pad={0} style={{ overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ height: '4px', background: ACCENT_STRIP }} />
      <div style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={130} height={10} />
            <Skeleton width={230} height={22} />
          </div>
          {action && <Skeleton width={130} height={28} style={{ borderRadius: '999px' }} />}
        </div>
        {stats > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--vfo-tint)' }}>
            {Array.from({ length: stats }).map((_, i) => (
              <div key={i} style={{ padding: '2px 22px 2px 0', marginRight: '22px', borderRight: i < stats - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                <Skeleton width={30} height={23} />
                <Skeleton width={70} height={9} style={{ marginTop: '6px' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </CardShell>
  )
}

// Mirrors the numbered phase card every track draws: badge + uppercase title, status
// pill + caret, a divider, then step rows. `open={false}` = the header alone;
// `notes` = the header's Notes button; `control` = 'pill' (a read-only status) or
// 'field' (the admin's select / buttons).
export function PhaseCardSkeleton({ rows = 2, open = true, notes = false, control = 'pill', badge = true, titleWidth = 170 }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          {badge && <Skeleton width={24} height={24} style={{ borderRadius: '50%', flexShrink: 0 }} />}
          <Skeleton width={titleWidth} height={13} style={{ maxWidth: '100%' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {notes && <Skeleton width={58} height={20} style={{ borderRadius: '999px' }} />}
          <Skeleton width={74} height={20} style={{ borderRadius: '999px' }} />
          <Skeleton width={10} height={8} />
        </div>
      </div>
      {open && rows > 0 && (
        <div style={{ borderTop: '1px solid var(--vfo-border)', padding: '12px 18px' }}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < rows - 1 ? '1px solid var(--vfo-border-soft)' : 'none' }}>
              <Skeleton width={8} height={8} style={{ borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}><Skeleton width={i % 2 ? '38%' : '48%'} height={13} /></div>
              <Skeleton width={control === 'field' ? 140 : 78} height={control === 'field' ? 28 : 20} style={{ borderRadius: control === 'field' ? '6px' : '999px', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A run of phase cards from a list of row counts; 0 = a collapsed card.
export function PhaseCardsSkeleton({ phases, ...rest }) {
  return phases.map((rows, i) => <PhaseCardSkeleton key={i} rows={rows} open={rows > 0} titleWidth={i % 2 ? 150 : 190} {...rest} />)
}

// A row of sub-tab pills.
export function PillTabsSkeleton({ widths = [70, 80, 110], height = 32, style = {} }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', ...style }}>
      {widths.map((w, i) => <Skeleton key={i} width={w} height={height} style={{ borderRadius: '999px' }} />)}
    </div>
  )
}

// Mirrors ListHeader: big title + count chip, optional action on the right.
export function ListHeaderSkeleton({ action = false, width = 140, chip = true, marginBottom = '20px' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Skeleton width={width} height={22} />
        {chip && <Skeleton width={34} height={20} style={{ borderRadius: '999px' }} />}
      </div>
      {action && <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />}
    </div>
  )
}

// Search input + filter pill + sort select (the standard list toolbar). `search` is
// the box's width (null = it fills the row); `boxes` are the controls after it.
export function SearchFilterSkeleton({ search = null, boxes = [84, 150], height = 38, marginBottom = '16px' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom, flexWrap: search ? 'wrap' : 'nowrap' }}>
      {search ? <Skeleton width={search} height={height} style={{ borderRadius: '8px', maxWidth: '100%' }} /> : <div style={{ flex: 1, minWidth: 0 }}><Skeleton height={height} style={{ borderRadius: '8px' }} /></div>}
      {boxes.map((w, i) => <Skeleton key={i} width={w} height={height} style={{ borderRadius: '8px', flexShrink: 0 }} />)}
    </div>
  )
}

// Grid table card: header band, N data rows, optional totals row.
//   cols    a count, an array of relative widths ([2,1,1]) or the page's own grid
//           template string ('104px 1.3fr 96px')
//   totals  'top' = straight under the header (the accounting tables), true = last
//   twoLine the first cell has a second grey line
//   pillCol index of a column that holds a status pill
export function TableSkeleton({ cols = 5, rows = 3, totals = false, card = true, twoLine = false, pillCol = -1, minWidth = 0, header = true, pad = '12px 18px' }) {
  const grid = typeof cols === 'string' ? cols : (Array.isArray(cols) ? cols : Array.from({ length: cols }).map(() => 1)).map(w => `${w}fr`).join(' ')
  const n = typeof cols === 'string' ? countTracks(cols) : Array.isArray(cols) ? cols.length : cols
  const cells = Array.from({ length: n })
  const rowStyle = { display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: pad, alignItems: 'center' }
  const totalsRow = (
    <div style={{ ...rowStyle, padding: '11px 18px', background: 'var(--vfo-input)', borderBottom: '2px solid var(--vfo-border)' }}>
      {cells.map((_, i) => <Skeleton key={i} width={i === 0 ? '70%' : '55%'} height={13} />)}
    </div>
  )
  const body = (
    <div style={{ minWidth: minWidth || undefined }}>
      {header && (
        <div style={{ ...rowStyle, background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          {cells.map((_, i) => <Skeleton key={i} width="60%" height={10} />)}
        </div>
      )}
      {totals === 'top' && totalsRow}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ ...rowStyle, borderBottom: '1px solid var(--vfo-border-soft)' }}>
          {cells.map((_, i) => i === pillCol
            ? <Skeleton key={i} width={78} height={20} style={{ borderRadius: '999px', maxWidth: '100%' }} />
            : (
              <div key={i} style={{ minWidth: 0 }}>
                <Skeleton width={i === 0 ? '80%' : '65%'} height={13} />
                {twoLine && i === 0 && <Skeleton width="55%" height={10} style={{ marginTop: '6px' }} />}
              </div>
            ))}
        </div>
      ))}
      {totals && totals !== 'top' && totalsRow}
    </div>
  )
  if (!card) return body
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden', marginBottom: '16px' }}>
      {body}
    </div>
  )
}

// Tracks in a grid-template string; minmax(a, b) counts once.
function countTracks(template) {
  return template.replace(/\([^)]*\)/g, '').trim().split(/\s+/).length
}

// Expandable list rows (accounting lists, automation trackers): caret, name over a
// grey line, then right-hand blocks and a status pill.
//   blocks  widths of the right-aligned figure blocks (a figure over a caption)
//   pill    width of the closing pill (0 = none); caretEnd = the caret is last
export function RowCardsSkeleton({ rows = 3, blocks = [], pill = 110, caretEnd = false, shadow = false, pad = '14px 18px' }) {
  const caret = <Skeleton width={10} height={10} style={{ flexShrink: 0 }} />
  return Array.from({ length: rows }).map((_, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: shadow ? '0 3px 12px rgba(20,45,95,0.05)' : 'none', padding: pad, marginBottom: '10px' }}>
      {!caretEnd && caret}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width={180} height={15} style={{ maxWidth: '100%' }} />
        <Skeleton width={260} height={11} style={{ marginTop: '7px', maxWidth: '100%' }} />
      </div>
      {blocks.map((w, b) => (
        <div key={b} style={{ width: w, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Skeleton width="80%" height={14} />
          <Skeleton width="55%" height={9} />
        </div>
      ))}
      {pill > 0 && <Skeleton width={pill} height={22} style={{ borderRadius: '999px', flexShrink: 0 }} />}
      {caretEnd && caret}
    </div>
  ))
}

// The 16px / 800 uppercase card title with its 2px navy rule (profile cards).
export function RuledTitleSkeleton({ width = 160 }) {
  return (
    <div style={{ paddingBottom: '9px', borderBottom: '2px solid var(--vfo-border)', marginBottom: '18px' }}>
      <Skeleton width={width} height={15} style={{ maxWidth: '100%' }} />
    </div>
  )
}

// Label-over-value pairs, as the profile cards lay them out.
export function FieldGridSkeleton({ fields = 6, columns = 'repeat(auto-fit, minmax(170px, 1fr))', gap = '18px 24px' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <Skeleton width={84} height={10} style={{ maxWidth: '100%' }} />
          <Skeleton width={i % 2 ? 120 : 150} height={15} style={{ marginTop: '7px', maxWidth: '100%' }} />
        </div>
      ))}
    </div>
  )
}

// A public token-page card body (title, a few lines, a button) — used by the
// /pay, /decide, setup and form pages while the token loads.
export function TokenFormSkeleton() {
  return (
    <div style={{ padding: '8px 0' }}>
      <Skeleton width={200} height={22} style={{ marginBottom: '14px' }} />
      <SkeletonText lines={3} />
      <Skeleton width={180} height={42} style={{ borderRadius: '10px', marginTop: '20px' }} />
    </div>
  )
}

// The profile box (shared/ProfileKit ProfileCard): icon badge + title over a
// hairline, then the body. `style` reaches the card.
export function ProfileCardSkeleton({ titleWidth = 150, sub = false, children, style = {} }) {
  const isPhone = useIsPhone()
  return (
    <CardShell pad={0} style={{ overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: isPhone ? '13px 16px' : '15px 22px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <Skeleton width={34} height={34} style={{ borderRadius: '10px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton width={titleWidth} height={15} style={{ maxWidth: '100%' }} />
          {sub && <Skeleton width="70%" height={11} style={{ marginTop: '6px' }} />}
        </div>
      </div>
      <div style={{ padding: 'var(--vfo-card-pad)' }}>{children}</div>
    </CardShell>
  )
}

// The profile's facts in tiles (ProfileKit FieldGrid + Field).
export function TileGridSkeleton({ fields = 6, min = 180, phoneCols = 2 }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? `repeat(${phoneCols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: isPhone ? '8px' : '10px' }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '10px 14px', background: 'var(--vfo-input)' }}>
          <Skeleton width={72} height={10} style={{ maxWidth: '100%' }} />
          <Skeleton width={i % 2 ? 100 : 130} height={14} style={{ marginTop: '7px', maxWidth: '100%' }} />
        </div>
      ))}
    </div>
  )
}

// The profile header (ProfileKit ProfileHero): avatar + name, then the fact strip.
export function ProfileHeroSkeleton({ facts = 3 }) {
  const isPhone = useIsPhone()
  return (
    <CardShell pad={0} style={{ overflow: 'hidden', marginBottom: isPhone ? '14px' : '20px' }}>
      <div style={{ height: '4px', background: ACCENT_STRIP }} />
      <div style={{ padding: isPhone ? '16px' : '22px 24px', display: 'flex', alignItems: 'center', gap: isPhone ? '14px' : '18px' }}>
        <Skeleton width={isPhone ? 62 : 78} height={isPhone ? 62 : 78} style={{ borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton width={96} height={10} />
          <Skeleton width={230} height={24} style={{ marginTop: '8px', maxWidth: '100%' }} />
        </div>
      </div>
      {facts > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : `repeat(${facts}, minmax(0, 1fr))`, borderTop: '1px solid var(--vfo-border-soft)' }}>
          {Array.from({ length: facts }).map((_, i) => (
            <div key={i} style={{ padding: isPhone ? '11px 16px' : '13px 24px', borderLeft: (isPhone ? i % 2 : i) ? '1px solid var(--vfo-border-soft)' : 'none', borderTop: isPhone && i >= 2 ? '1px solid var(--vfo-border-soft)' : 'none' }}>
              <Skeleton width={70} height={10} />
              <Skeleton width={i % 2 ? 90 : 110} height={13} style={{ marginTop: '7px' }} />
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}
