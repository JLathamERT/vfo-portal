// The navy KPI hero (with KPI pages in adminPages.jsx), the Portal Backlog and the
// program notes card. Admin lists are in adminLists.jsx.
import { useMediaQuery } from '../../../lib/useMediaQuery'
import { Skeleton, CardShell } from './primitives'

// Placeholders that sit on the navy KPI hero: the same shimmer, in white.
const onNavy = {
  background: 'linear-gradient(100deg, rgba(255,255,255,0.12) 36%, rgba(255,255,255,0.26) 50%, rgba(255,255,255,0.12) 64%)',
  backgroundSize: '200% 100%',
}

// Mirrors KpiHero (admin/KpiKit.jsx): the navy hero with its real title, and
// placeholders for the big count, the status bar and the lens chips.
export function KpiHeroSkeleton({ title, subtitle, chips = 6 }) {
  return (
    <div style={{ borderRadius: '18px', overflow: 'hidden', marginBottom: '22px', background: 'linear-gradient(120deg, #002973 0%, #0a3f9e 48%, #125ecc 100%)', boxShadow: '0 14px 34px rgba(0,41,115,0.26)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '-60px', right: '-30px', width: '230px', height: '230px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%)' }} />
      <div style={{ position: 'relative', padding: '24px 30px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', lineHeight: 1.1 }}>{title}</div>
            {subtitle
              ? <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.66)', marginTop: '7px' }}>{subtitle}</div>
              : <Skeleton width={190} height={11} style={{ ...onNavy, marginTop: '10px' }} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <Skeleton width={64} height={50} style={onNavy} />
            <Skeleton width={110} height={10} style={onNavy} />
          </div>
        </div>
        <Skeleton width="100%" height={12} style={{ ...onNavy, display: 'block', borderRadius: '999px', marginTop: '20px' }} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          {Array.from({ length: chips }).map((_, i) => (
            <Skeleton key={i} width={i % 2 ? 118 : 96} height={29} style={{ ...onNavy, borderRadius: '999px' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Mirrors BacklogCard (admin/backlog): title, "requester · date", then a
// department chip and the Urgency / Importance pills.
export function BacklogCardSkeleton({ titleWidth = '85%' }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(20,45,95,0.06)', padding: '14px 15px', minWidth: 0 }}>
      <Skeleton width={titleWidth} height={16} style={{ display: 'block' }} />
      <Skeleton width="55%" height={12} style={{ display: 'block', marginTop: '9px' }} />
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '12px' }}>
        <Skeleton width={74} height={20} style={{ borderRadius: '999px' }} />
        <Skeleton width={78} height={20} style={{ borderRadius: '999px' }} />
        <Skeleton width={90} height={20} style={{ borderRadius: '999px' }} />
      </div>
    </div>
  )
}

function BacklogColumnSkeleton({ cards, inLane, tall, label = 110 }) {
  return (
    <div style={{ background: inLane ? 'var(--vfo-card)' : 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, minHeight: tall ? '100%' : '90px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <Skeleton width={label} height={11} />
        <Skeleton width={26} height={18} style={{ borderRadius: '999px' }} />
      </div>
      {Array.from({ length: cards }).map((_, i) => <BacklogCardSkeleton key={i} titleWidth={i % 2 ? '70%' : '88%'} />)}
    </div>
  )
}

// Mirrors BacklogBoard at its breakpoints: Approved but unassigned | the
// superadmin lanes (To do / Working on / Done) | Ready to announce. Two lanes,
// since the real assignees are unknown until the load lands.
export function PortalBacklogBoardSkeleton({ lanes = 2 }) {
  const wide = useMediaQuery('(min-width: 1280px)')
  const tablet = useMediaQuery('(min-width: 768px)')
  const unassigned = <BacklogColumnSkeleton cards={3} tall={wide} label={150} />
  const ready = <BacklogColumnSkeleton cards={2} tall={wide} label={120} />
  const laneBoxes = Array.from({ length: tablet ? lanes : 1 }).map((_, i) => (
    <div key={i} style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', padding: '12px', minWidth: 0 }}>
      {tablet && <Skeleton width={130} height={15} style={{ display: 'block', margin: '2px 4px 12px' }} />}
      <div style={{ display: 'grid', gridTemplateColumns: tablet ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: '12px' }}>
        {[60, 80, 50].map((w) => <BacklogColumnSkeleton key={w} cards={1} inLane label={w} />)}
      </div>
    </div>
  ))
  const lanePicker = !tablet && lanes > 1 && (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {Array.from({ length: lanes }).map((_, i) => <Skeleton key={i} width={120} height={31} style={{ borderRadius: '999px' }} />)}
    </div>
  )
  if (wide) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr)', gap: '16px', alignItems: 'stretch' }}>
        {unassigned}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>{laneBoxes}</div>
        {ready}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      {unassigned}
      {lanePicker}
      {laneBoxes}
      {ready}
    </div>
  )
}

// Mirrors BacklogRequestsTab: the search box and Filter, then the one table the
// New requests / Ready to announce pills pick (same grid and min width, so
// nothing jumps when the data lands).
const REQUESTS_GRID = '32px minmax(260px, 2.4fr) minmax(180px, 1.6fr) 90px 100px 120px 150px'
export function PortalBacklogRequestsSkeleton() {
  const phone = useMediaQuery('(max-width: 640px)')
  const rows = 4
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Skeleton height={37} style={{ borderRadius: '8px', flex: phone ? '1 1 100%' : 1 }} />
        <Skeleton width={78} height={37} style={{ borderRadius: '8px' }} />
      </div>
      <div>
          {phone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton width={i % 2 ? '65%' : '85%'} height={15} />
                  <Skeleton width={120} height={11} />
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
                    <Skeleton width={80} height={20} style={{ borderRadius: '999px' }} />
                    <Skeleton width={90} height={20} style={{ borderRadius: '999px' }} />
                  </div>
                  <Skeleton width={110} height={11} />
                </div>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
            <div style={{ minWidth: 990 }}>
              <div style={{ display: 'grid', gridTemplateColumns: REQUESTS_GRID, gap: '10px', padding: '14px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                <span />
                {[50, 80, 50, 60, 70, 70].map((w, i) => <Skeleton key={i} width={w} height={9} />)}
              </div>
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: REQUESTS_GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center' }}>
                  <Skeleton width={24} height={24} style={{ borderRadius: '6px' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <Skeleton width={i % 2 ? '60%' : '80%'} height={13} />
                    <Skeleton width={90} height={10} />
                  </span>
                  <Skeleton width={80} height={20} style={{ borderRadius: '999px' }} />
                  <Skeleton width={28} height={20} style={{ borderRadius: '999px' }} />
                  <Skeleton width={28} height={20} style={{ borderRadius: '999px' }} />
                  <Skeleton width={70} height={12} />
                  <Skeleton width={80} height={12} />
                </div>
              ))}
            </div>
          </div>
          )}
      </div>
    </div>
  )
}

// Mirrors a BacklogArchive row: status pill + title, requester line, the
// write-up, and the announced / denied column on the right.
export function PortalBacklogArchiveRowsSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-card)' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Skeleton width={74} height={20} style={{ borderRadius: '999px', flexShrink: 0 }} />
              <Skeleton width={i % 2 ? '45%' : '60%'} height={14} />
            </div>
            <Skeleton width={150} height={11} style={{ display: 'block', marginTop: '7px' }} />
            <Skeleton width="90%" height={12} style={{ display: 'block', marginTop: '8px' }} />
            <Skeleton width="65%" height={12} style={{ display: 'block', marginTop: '5px' }} />
          </div>
          <div style={{ flex: '0 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width={150} height={12} />
            <Skeleton width={190} height={11} />
          </div>
        </div>
      ))}
    </div>
  )
}

// The Portal Backlog page body while portal_backlog_load runs, under the
// page's real Tasks / Requests pills: the hero (Requests only), the toolbar, then
// the board or the Requests lists.
export function PortalBacklogSkeleton({ view = 'tasks', lensCount = 7 }) {
  return (
    <>
      {view === 'requests' && <KpiHeroSkeleton title="Portal Backlog" subtitle="Update requests for the VFO Portal" chips={lensCount} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {view === 'tasks' && <Skeleton width={78} height={36} style={{ borderRadius: '8px' }} />}
          {view === 'requests' && <Skeleton width={136} height={32} style={{ borderRadius: '999px' }} />}
          {view === 'requests' && <Skeleton width={160} height={32} style={{ borderRadius: '999px' }} />}
          <Skeleton width={82} height={34} style={{ borderRadius: '8px' }} />
        </div>
        {view === 'requests' && <Skeleton width={132} height={34} style={{ borderRadius: '8px' }} />}
      </div>
      {view === 'requests' ? <PortalBacklogRequestsSkeleton /> : <PortalBacklogBoardSkeleton />}
    </>
  )
}

// Program notes: title (+ Add Note), then tinted note boxes.
export function ProgramNotesSkeleton({ rows = 2, add = true }) {
  return (
    <CardShell pad="var(--vfo-card-pad)" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Skeleton width={80} height={12} />
        {add && <Skeleton width={90} height={26} style={{ borderRadius: '6px' }} />}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)' }}>
          <Skeleton width="85%" height={14} style={{ marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Skeleton width={70} height={11} />
            <Skeleton width={70} height={11} />
          </div>
        </div>
      ))}
    </CardShell>
  )
}
