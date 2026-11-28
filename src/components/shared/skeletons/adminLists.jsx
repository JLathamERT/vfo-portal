// Admin / tax planner list-page skeletons: directories, automation trackers,
// accounting grids, config panels, onboarding lists.
import { Skeleton, SkeletonText, CardShell, HeroSkeleton, PanelHeroSkeleton, PhaseCardsSkeleton, PillTabsSkeleton, ListHeaderSkeleton, SearchFilterSkeleton, TableSkeleton, RowCardsSkeleton } from './primitives'
import { BackLink } from '../ProfileKit'

// Advisor / Accountant / Strategic / Tax Planner search lists: title + count chip
// + Export, search + filter + sort, then the ListTable card (2026-11-26).
// `numbered` = the table opens with a member number column.
export function DirectoryListSkeleton({ rows = 6, numbered = true, chip = false }) {
  return (
    <div>
      <ListHeaderSkeleton action width={120} />
      <SearchFilterSkeleton boxes={[84, 130]} height={40} />
      <TableSkeleton cols={numbered ? '120px 1.5fr 100px 1.5fr 120px 200px' : chip ? '1.6fr 110px 1.3fr 1fr' : '1.6fr 110px 1.3fr'} rows={rows} pillCol={numbered ? 2 : 1} minWidth={numbered ? '760px' : '700px'} pad="11px 18px" />
    </div>
  )
}

// A coloured status dot and its word.
export function DotText({ width = 44 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Skeleton width={8} height={8} style={{ borderRadius: '50%', flexShrink: 0 }} />
      <Skeleton width={width} height={12} />
    </div>
  )
}

// Search Specialists: toolbar, then the ListTable card.
export function SpecialistDirectorySkeleton({ rows = 6 }) {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <ListHeaderSkeleton action width={120} />
      <SearchFilterSkeleton boxes={[84, 130]} height={40} />
      <TableSkeleton cols="2fr 2fr 120px 110px" rows={rows} pillCol={3} minWidth="760px" pad="11px 18px" />
    </div>
  )
}

// The tax planner portal's client list: title + chip, search, then an ACTIVE group
// label over its ListTable card (ref, client over member, next step, planner, date).
export function PlannerClientsSkeleton({ rows = 5 }) {
  return (
    <div>
      <ListHeaderSkeleton width={130} />
      <SearchFilterSkeleton boxes={[104]} height={40} />
      <Skeleton width={82} height={10} style={{ margin: '0 0 10px 4px' }} />
      <TableSkeleton cols="100px 1.4fr 2fr 1fr 110px" rows={rows} twoLine minWidth="760px" pad="11px 18px" />
    </div>
  )
}

// The Automation trackers. MAP 1 and Tax draw a table (`cols` = its grid); the rest
// draw stacked expandable row cards.
export function AutomationTrackerSkeleton({ cols = null, rows = 4, stats = 5 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>
      <PanelHeroSkeleton stats={stats} />
      {cols ? <TableSkeleton cols={cols} rows={rows} /> : <RowCardsSkeleton rows={rows} pill={120} caretEnd shadow />}
    </div>
  )
}

// The Accounting grid panels: the panels draw their own title + period selects at
// once, so this is the table area. The totals row sits straight under the header,
// as on every one of those tables.
export function AccountingTableSkeleton({ cols = 6, rows = 4, twoLine = false }) {
  return <TableSkeleton cols={cols} rows={rows} totals="top" twoLine={twoLine} />
}

// The uppercase blue eyebrow + 24px title most admin pages open with.
export function PageHeadingSkeleton({ chip = false, marginBottom = '18px' }) {
  return (
    <div style={{ marginBottom }}>
      <Skeleton width={120} height={11} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px' }}>
        <Skeleton width={240} height={24} />
        {chip && <Skeleton width={100} height={22} style={{ borderRadius: '999px' }} />}
      </div>
    </div>
  )
}

// Accounting sections that wait for load_data before they mount: breadcrumb
// eyebrow, 24px title, pill row, then the section's own body.
export function AccountingPageSkeleton({ maxWidth = '1200px', pills = 5, children }) {
  return (
    <div style={{ padding: '24px', maxWidth, margin: '0 auto' }}>
      <PageHeadingSkeleton />
      <PillTabsSkeleton widths={Array.from({ length: pills }).map((_, i) => (i % 2 ? 150 : 120))} style={{ marginBottom: '22px' }} />
      {children}
    </div>
  )
}

// Outstanding Payment Links: each group has a heading + 'n outstanding' line, then
// caret rows with an amount column and a status pill.
export function OutstandingLinksSkeleton({ groups = 2, rows = 2 }) {
  return Array.from({ length: groups }).map((_, g) => (
    <div key={g} style={{ marginBottom: '22px' }}>
      <Skeleton width={170} height={15} />
      <Skeleton width={90} height={11} style={{ margin: '7px 0 12px' }} />
      <RowCardsSkeleton rows={rows} blocks={[120]} pill={100} />
    </div>
  ))
}

// Implementation and Membership Fees: search + selects, then caret rows with their
// figure columns and status pill.
export function AccountingRowsSkeleton({ boxes = [190, 170], search = 240, blocks = [90, 110, 70], pill = 150, rows = 4 }) {
  return (
    <div>
      <SearchFilterSkeleton search={search} boxes={boxes} />
      <RowCardsSkeleton rows={rows} blocks={blocks} pill={pill} />
    </div>
  )
}

// Email Templates / Notification Editor: title, intro lines, then the collapsed
// section bars. `sections` = the panel's real number of sections.
export function EmailTemplatesSkeleton({ sections = 12, buttons = true, introLines = 2 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Skeleton width={220} height={24} style={{ marginBottom: '12px' }} />
      <SkeletonText lines={introLines} style={{ marginBottom: '24px' }} />
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} style={{ marginBottom: '10px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-input)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Skeleton width={10} height={10} />
            <Skeleton width={i % 2 ? 140 : 180} height={14} />
            {buttons && <Skeleton width={34} height={18} style={{ borderRadius: '999px' }} />}
          </div>
          {buttons
            ? <div style={{ display: 'flex', gap: '8px' }}><Skeleton width={66} height={26} style={{ borderRadius: '8px' }} /><Skeleton width={66} height={26} style={{ borderRadius: '8px' }} /></div>
            : <Skeleton width={34} height={18} style={{ borderRadius: '999px' }} />}
        </div>
      ))}
    </div>
  )
}

// Team Notification Emails: title + intro, the 'Sent to this list' card, then the
// People card with its rows and the add-a-person form.
export function TeamNotificationEmailsSkeleton({ rows = 3 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Skeleton width={280} height={24} style={{ marginBottom: '12px' }} />
      <SkeletonText lines={2} style={{ marginBottom: '24px' }} />
      <CardShell style={{ marginBottom: '20px' }}>
        <Skeleton width={140} height={12} style={{ marginBottom: '16px' }} />
        <SkeletonText lines={4} width="60%" />
      </CardShell>
      <CardShell>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Skeleton width={70} height={12} /><Skeleton width={28} height={18} style={{ borderRadius: '999px' }} />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div>
              <Skeleton width={150} height={14} />
              <Skeleton width={200} height={11} style={{ marginTop: '6px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}><Skeleton width={64} height={28} style={{ borderRadius: '8px' }} /><Skeleton width={74} height={28} style={{ borderRadius: '8px' }} /></div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <Skeleton width={180} height={38} style={{ borderRadius: '8px' }} /><Skeleton width={240} height={38} style={{ borderRadius: '8px' }} /><Skeleton width={80} height={38} style={{ borderRadius: '8px' }} />
        </div>
      </CardShell>
    </div>
  )
}

// Member Overview: eyebrow + title + count chip, toolbar, one wide table.
export function MemberOverviewSkeleton({ rows = 8 }) {
  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>
      <PageHeadingSkeleton chip />
      <SearchFilterSkeleton boxes={[84, 150]} />
      <TableSkeleton cols="84px 1.6fr 110px 1.2fr 110px 150px 1fr 180px 90px 110px" rows={rows} minWidth="1320px" pad="11px 18px" />
    </div>
  )
}

// Client Overview: the panel draws its title, pills and toolbar itself, so this is
// the table alone, on the pill's own grid. `cards` = the member's phone list.
export function ClientOverviewSkeleton({ rows = 6, grid = 6, minWidth = 0, twoLine = true, cards = false }) {
  if (cards) return <ListCardsSkeleton rows={4} />
  return <TableSkeleton cols={grid} rows={rows} minWidth={minWidth} twoLine={twoLine} pad="11px 18px" />
}

// The phone list card: name over a grey line on the left, a detail on the right,
// then the chevron.
export function ListCardsSkeleton({ rows = 3, right = true }) {
  return Array.from({ length: rows }).map((_, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '12px 14px', marginBottom: '10px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width={i % 2 ? '55%' : '70%'} height={15} />
        <Skeleton width="45%" height={11} style={{ marginTop: '7px' }} />
      </div>
      {right && <div style={{ flex: 1, minWidth: 0 }}><Skeleton width="80%" height={12} /></div>}
      <Skeleton width={8} height={12} style={{ flexShrink: 0 }} />
    </div>
  ))
}

// Strategic Partners / Tax Planning Partners: title + intro, then one tall card per
// company (name + status pill, revenue split boxes, email box, button).
export function StrategicPartnersSkeleton({ cards = 2 }) {
  return (
    <div>
      <Skeleton width={180} height={18} style={{ marginBottom: '10px' }} />
      <SkeletonText lines={2} style={{ marginBottom: '20px' }} />
      {Array.from({ length: cards }).map((_, i) => (
        <CardShell key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <Skeleton width={190} height={17} />
            <Skeleton width={120} height={24} style={{ borderRadius: '999px' }} />
          </div>
          <Skeleton width={90} height={10} style={{ marginBottom: '10px' }} />
          {[0, 1].map(b => <Skeleton key={b} height={56} style={{ borderRadius: '10px', marginBottom: '8px' }} />)}
          <Skeleton width={100} height={10} style={{ margin: '18px 0 10px' }} />
          <Skeleton width={150} height={11} style={{ marginBottom: '6px' }} />
          <Skeleton height={40} style={{ borderRadius: '8px' }} />
          <Skeleton width={180} height={38} style={{ borderRadius: '8px', marginTop: '14px' }} />
        </CardShell>
      ))}
    </div>
  )
}

// Advisor / Accountant onboarding list: toolbar, then the six-column table. The
// panel's own title and + New Onboarding button are already on screen.
export function OnboardingListSkeleton({ rows = 6 }) {
  return (
    <div>
      <SearchFilterSkeleton boxes={[84, 150]} />
      <TableSkeleton cols="minmax(200px,260px) minmax(220px,1fr) 170px 200px 150px 110px" rows={rows} pad="11px 18px" />
    </div>
  )
}

// Specialist onboarding list: one card per record, stage pill on the right.
// Specialist Onboarding list (2026-11-26): toolbar, then the ListTable card.
export function SpecialistOnboardingListSkeleton({ rows = 4 }) {
  return (
    <>
      <SearchFilterSkeleton boxes={[84, 130]} height={40} />
      <TableSkeleton cols="1.4fr 1.6fr 200px 120px" rows={rows} minWidth="760px" pad="11px 18px" />
    </>
  )
}

// Advisor / Accountant onboarding record: back link, the person's header card, the
// progress card with its step bar, then the stage cards (open until done).
export function OnboardingDetailSkeleton({ onBack }) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <BackToList onBack={onBack} />
      <HeroSkeleton avatar action="toggle" />
      <HeroSkeleton meta={false} progress steps={3} />
      <PhaseCardsSkeleton phases={[5, 6, 2]} control="field" />
    </div>
  )
}

// Specialist onboarding record: back link, one header card with the five-stage
// step bar, then the stage cards.
export function SpecialistOnboardingDetailSkeleton({ onBack }) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <BackToList onBack={onBack} />
      <HeroSkeleton action="toggle" steps={5} />
      <PhaseCardsSkeleton phases={[3, 3, 4, 3, 3]} control="field" />
    </div>
  )
}

function BackToList({ onBack }) {
  if (!onBack) return <Skeleton width={90} height={13} style={{ marginBottom: '18px' }} />
  return <BackLink onClick={onBack}>Back to list</BackLink>
}

// Back-compat aliases (existing imports keep working).
export const AdvisorOnboardingListSkeleton = OnboardingListSkeleton
export const AccountantOnboardingListSkeleton = OnboardingListSkeleton
export const AdvisorOnboardingDetailSkeleton = OnboardingDetailSkeleton
export const AccountantOnboardingDetailSkeleton = OnboardingDetailSkeleton

// An onboarding section still waiting for load_data: its heading + New button, then
// the list that will follow.
export function OnboardingPageSkeleton({ specialist = false }) {
  return (
    <div style={{ padding: '24px', maxWidth: specialist ? '900px' : '1500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '18px' }}>
        {specialist ? <Skeleton width={220} height={22} /> : <PageHeadingSkeleton marginBottom="0" />}
        <Skeleton width={140} height={34} style={{ borderRadius: '8px' }} />
      </div>
      {specialist ? <SpecialistOnboardingListSkeleton /> : <OnboardingListSkeleton />}
    </div>
  )
}

// SDP ATSG client list: its search box and table (title + Add Client are drawn by
// the panel); and one client's page.
export function SdpAtsgListSkeleton({ rows = 5 }) {
  return (
    <div>
      <SearchFilterSkeleton search={360} boxes={[]} />
      <TableSkeleton cols="1.6fr 1.4fr 1.1fr 90px 90px 170px" rows={rows} twoLine pillCol={5} />
    </div>
  )
}

export function SdpAtsgCaseSkeleton() {
  return (
    <div>
      <HeroSkeleton progress steps={2} action="toggle" />
      <ToolCardsSkeleton count={2} />
      <PhaseCardsSkeleton phases={[6, 2]} control="field" />
    </div>
  )
}

// Collapsed tool cards (Pricing split, Tax Planning Form, Route...) above a track.
export function ToolCardsSkeleton({ count = 2 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="vfo-skel-on-tint" style={{ background: 'var(--vfo-plan-tool-bg)', border: '1px solid var(--vfo-border)', borderRadius: '14px', padding: '14px 18px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Skeleton width={i % 2 ? 150 : 180} height={13} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Skeleton width={80} height={20} style={{ borderRadius: '999px' }} /><Skeleton width={10} height={8} /></div>
    </div>
  ))
}

// Stacked cards with a title line, a meta line and a right-hand chip (Tax
// Diagnostics, the member's Submitted list, Feature Switches with `body` lines).
export function StackedCardsSkeleton({ cards = 3, body = 0, pad = 'var(--vfo-card-pad)', gap = '20px' }) {
  return Array.from({ length: cards }).map((_, i) => (
    <CardShell key={i} pad={pad} style={{ marginBottom: gap }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Skeleton width={190} height={16} style={{ maxWidth: '100%' }} />
          <Skeleton width={280} height={12} style={{ marginTop: '8px', maxWidth: '100%' }} />
        </div>
        <Skeleton width={88} height={24} style={{ borderRadius: '999px', flexShrink: 0 }} />
      </div>
      {body > 0 && <SkeletonText lines={body} style={{ marginTop: '18px' }} />}
    </CardShell>
  ))
}
