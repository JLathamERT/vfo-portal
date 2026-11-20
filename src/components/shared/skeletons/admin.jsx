// Admin-portal page skeletons: directory lists, automation trackers,
// accounting grids, onboarding pipelines, member detail views.
import { useMediaQuery } from '../../../lib/useMediaQuery'
import { Skeleton, SkeletonRow, SkeletonText, CardShell, SkeletonCard, HeroSkeleton, ListHeaderSkeleton, SearchFilterSkeleton, TableSkeleton } from './primitives'

// Advisor / Accountant / Strategic / Specialist search lists: big title +
// count chip, search + filter + sort toolbar, then row cards
// (member# · name · status pill · type · model).
export function DirectoryListSkeleton({ rows = 3 }) {
  return (
    <div>
      <ListHeaderSkeleton />
      <SearchFilterSkeleton />
      {Array.from({ length: rows }).map((_, i) => (
        <CardShell key={i} pad="14px 20px" style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <Skeleton width={64} height={12} />
            <Skeleton width={150} height={15} />
            <Skeleton width={58} height={20} style={{ borderRadius: '999px' }} />
            <Skeleton width={130} height={12} />
            <Skeleton width={100} height={12} style={{ marginLeft: 'auto' }} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// The Automation trackers (MAP 1 / Tax / PIP / Advisor / Accountant /
// Specialist / Specialist Revenue): PanelHero with stat row, then the
// pipeline table.
export function AutomationTrackerSkeleton({ cols = 7, rows = 3 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <HeroSkeleton stats={5} />
      <TableSkeleton cols={cols} rows={rows} />
    </div>
  )
}

// The Accounting grid panels (Revenue / Reconciliation / fees / onboarding).
// The panels render their own title + period selects instantly — this is just
// the table area, totals row included.
export function AccountingTableSkeleton({ cols = 6, rows = 3 }) {
  return <TableSkeleton cols={cols} rows={rows} totals />
}

// Email Templates: intro title is instant; sections render as collapsed
// accordion bars with a count chip.
export function EmailTemplatesSkeleton({ sections = 5 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Skeleton width={200} height={24} style={{ marginBottom: '10px' }} />
      <Skeleton width={420} height={12} style={{ marginBottom: '24px' }} />
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} style={{ marginBottom: '10px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-card)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Skeleton width={170} height={14} />
            <Skeleton width={34} height={18} style={{ borderRadius: '999px' }} />
          </div>
          <Skeleton width={12} height={12} />
        </div>
      ))}
    </div>
  )
}

// Member Overview: toolbar + wide grid rows with an expand caret, name,
// category chip, engagement select and program chips.
export function MemberOverviewSkeleton({ rows = 3 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <ListHeaderSkeleton />
      <SearchFilterSkeleton />
      <TableSkeleton cols={[0.4, 1, 1.6, 1, 1, 1, 0.8, 0.8, 1.4, 1.2]} rows={rows} />
    </div>
  )
}

// Client Overview: four sub-tab pills + toolbar, then a flat track table
// (client, plan/track, member name, status pill, PF, next action, owner).
export function ClientOverviewSkeleton({ rows = 3 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width={110} height={30} style={{ borderRadius: '999px' }} />)}
      </div>
      <SearchFilterSkeleton />
      <TableSkeleton cols={[1.4, 1.7, 1.3, 0.7, 0.9, 1.9, 1.1]} rows={rows} />
    </div>
  )
}

// Strategic Partners: one card per partner company (name, contact fields,
// Connect button).
export function StrategicPartnersSkeleton({ cards = 2 }) {
  return (
    <div>
      <ListHeaderSkeleton />
      {Array.from({ length: cards }).map((_, i) => (
        <CardShell key={i}>
          <Skeleton width={180} height={16} style={{ marginBottom: '14px' }} />
          <SkeletonText lines={2} width="55%" />
          <Skeleton width={170} height={34} style={{ borderRadius: '8px', marginTop: '16px' }} />
        </CardShell>
      ))}
    </div>
  )
}

// Onboarding pipeline lists (advisor / accountant / specialist).
export function OnboardingListSkeleton({ rows = 3 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <CardShell key={i} pad={18} style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={150} height={16} />
              <Skeleton width={240} height={12} />
            </div>
            <Skeleton width={130} height={20} style={{ borderRadius: '999px' }} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// Onboarding detail: back link, name header, then stage cards with rows.
export function OnboardingDetailSkeleton({ onBack, cards = 3, rowsInFirst = 2 }) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>
      )}
      <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--vfo-border)' }}>
        <Skeleton width={220} height={32} style={{ marginBottom: '8px' }} />
        <Skeleton width={180} height={14} />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <CardShell key={i} pad="18px 24px" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: i === 0 ? '12px' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={10} height={10} style={{ borderRadius: '50%' }} />
              <Skeleton width={220} height={14} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={10} height={10} />
            </div>
          </div>
          {i === 0 && (
            <div style={{ paddingLeft: '20px' }}>
              {Array.from({ length: rowsInFirst }).map((_, j) => <SkeletonRow key={j} withPill withDate />)}
            </div>
          )}
        </CardShell>
      ))}
    </div>
  )
}

// Back-compat aliases (existing imports keep working).
export const AdvisorOnboardingListSkeleton = OnboardingListSkeleton
export const AccountantOnboardingListSkeleton = OnboardingListSkeleton
export const SpecialistOnboardingListSkeleton = OnboardingListSkeleton
export const AdvisorOnboardingDetailSkeleton = OnboardingDetailSkeleton
export const AccountantOnboardingDetailSkeleton = OnboardingDetailSkeleton
export function SpecialistOnboardingDetailSkeleton({ onBack }) {
  return <OnboardingDetailSkeleton onBack={onBack} cards={5} rowsInFirst={3} />
}

// Admin member detail — Profile Details tab. Mirrors the freshened layout:
// TrackHero header, then a two-column body (details grid + sidebar cards).
export function MemberProfileDetailsSkeleton() {
  return (
    <div>
      <HeroSkeleton action={false} />
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 400px', minWidth: '300px' }}>
          <CardShell>
            <Skeleton width={110} height={11} style={{ marginBottom: '18px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '18px 24px' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width={90} height={10} />
                  <Skeleton width={120} height={15} />
                </div>
              ))}
            </div>
          </CardShell>
        </div>
        <div style={{ flex: '1 1 250px', minWidth: '250px' }}>
          <CardShell>
            <Skeleton width={130} height={11} style={{ marginBottom: '14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Skeleton width={40} height={40} style={{ borderRadius: '50%' }} />
              <Skeleton width={120} height={14} />
            </div>
          </CardShell>
          <CardShell>
            <Skeleton width={110} height={11} style={{ marginBottom: '14px' }} />
            <SkeletonText lines={2} />
          </CardShell>
        </div>
      </div>
    </div>
  )
}

// Admin member MSM home: search card, program list, meeting stats.
export function AdminMsmHomeSkeleton() {
  return (
    <div>
      <CardShell>
        <Skeleton width={120} height={11} style={{ marginBottom: '12px' }} />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Skeleton width={220} height={38} style={{ borderRadius: '8px' }} />
          <Skeleton width={70} height={36} style={{ borderRadius: '8px' }} />
        </div>
      </CardShell>
      <CardShell>
        <Skeleton width={100} height={11} style={{ marginBottom: '16px' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <Skeleton width={180} height={14} />
            <Skeleton width={70} height={24} style={{ borderRadius: '12px' }} />
          </div>
        ))}
      </CardShell>
      <CardShell>
        <Skeleton width={140} height={11} style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <Skeleton width={36} height={28} />
              <Skeleton width={100} height={10} />
            </div>
          ))}
        </div>
        <Skeleton width={150} height={36} style={{ borderRadius: '8px' }} />
      </CardShell>
    </div>
  )
}

export function AdminProgramViewSkeleton() {
  return (
    <div>
      <Skeleton width={260} height={28} style={{ marginBottom: '20px' }} />
      <CardShell style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={100} height={11} />
              <Skeleton width={110} height={15} />
            </div>
          ))}
        </div>
        <Skeleton width={50} height={28} style={{ borderRadius: '6px' }} />
      </CardShell>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width={80} height={30} style={{ borderRadius: '999px' }} />)}
      </div>
      <ProgramNotesSkeleton />
    </div>
  )
}

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
            {subtitle && <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'rgba(255,255,255,0.66)', marginTop: '7px' }}>{subtitle}</div>}
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

// Mirrors BacklogRequestsTab: the New requests and Ready to announce cards.
export function PortalBacklogRequestsSkeleton() {
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {[[120, 3], [150, 1]].map(([label, cards]) => (
        <div key={label} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Skeleton width={label} height={12} />
            <Skeleton width={30} height={20} style={{ borderRadius: '999px' }} />
          </div>
          <div style={grid}>
            {Array.from({ length: cards }).map((_, i) => <BacklogCardSkeleton key={i} titleWidth={i % 2 ? '70%' : '88%'} />)}
          </div>
        </div>
      ))}
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
// page's real Tasks / Requests pills: the hero, the toolbar, then the board or
// the Requests lists.
export function PortalBacklogSkeleton({ view = 'tasks', lensCount = 7 }) {
  return (
    <>
      <KpiHeroSkeleton title="Portal Backlog" subtitle="Update requests for the VFO Portal" chips={lensCount} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Skeleton width={150} height={34} style={{ borderRadius: '8px' }} />
          <Skeleton width={82} height={34} style={{ borderRadius: '8px' }} />
        </div>
        <Skeleton width={132} height={34} style={{ borderRadius: '8px' }} />
      </div>
      {view === 'requests' ? <PortalBacklogRequestsSkeleton /> : <PortalBacklogBoardSkeleton />}
    </>
  )
}

export function ProgramNotesSkeleton({ rows = 2 }) {
  return (
    <CardShell style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Skeleton width={80} height={11} />
        <Skeleton width={90} height={26} style={{ borderRadius: '6px' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
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
