// Admin member detail and KPI page skeletons. The member profile body is shared with
// the member and tax planner portals, so it carries their phone layout too.
import { useIsPhone } from '../../../lib/useMediaQuery'
import { Skeleton, SkeletonText, CardShell, HeroSkeleton, PillTabsSkeleton, RuledTitleSkeleton, FieldGridSkeleton } from './primitives'
import { KpiHeroSkeleton, ProgramNotesSkeleton } from './admin'

// The member profile's read-only body (shared/MemberProfileDetails): paired cards
// with ruled titles, then the full-width ones. `hero` adds the page's header card
// where the caller does not draw its own.
export function MemberProfileDetailsSkeleton({ hero = false }) {
  const isPhone = useIsPhone()
  const columns = isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))'
  const seal = isPhone ? 44 : 76
  const pad = 'var(--vfo-card-pad)'
  const row = { display: 'flex', gap: isPhone ? 0 : '16px', alignItems: 'stretch', flexWrap: 'wrap' }
  const col = (basis, min) => ({ flex: `1 1 ${basis}`, minWidth: isPhone ? '100%' : min, display: 'flex' })
  const card = { flex: 1, marginBottom: '20px', minWidth: 0 }
  return (
    <div>
      {hero && <HeroSkeleton avatar />}
      <div style={row}>
        <div style={col('420px', '300px')}>
          <CardShell pad={pad} style={card}><RuledTitleSkeleton /><FieldGridSkeleton fields={6} columns={columns} gap={isPhone ? '16px' : undefined} /></CardShell>
        </div>
        <div style={col('260px', '240px')}>
          <CardShell pad={pad} style={card}>
            <RuledTitleSkeleton width={130} />
            {[0, 1].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '12px' : '18px', marginTop: i ? '16px' : 0 }}>
                <Skeleton width={seal} height={seal} style={{ borderRadius: '50%', flexShrink: 0 }} />
                <div><Skeleton width={110} height={15} /><Skeleton width={84} height={11} style={{ marginTop: '7px' }} /></div>
              </div>
            ))}
          </CardShell>
        </div>
      </div>
      <div style={row}>
        <div style={col('420px', '300px')}>
          <CardShell pad={pad} style={card}>
            <RuledTitleSkeleton width={170} />
            <FieldGridSkeleton fields={2} columns={columns} />
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-tint)' }}><FieldGridSkeleton fields={1} columns="1fr" /></div>
          </CardShell>
        </div>
        <div style={col('300px', '260px')}>
          <CardShell pad={pad} style={card}><RuledTitleSkeleton width={130} /><FieldGridSkeleton fields={3} columns="1fr" gap="18px" /></CardShell>
        </div>
      </div>
      <CardShell pad={pad} style={{ marginBottom: '20px' }}>
        <RuledTitleSkeleton width={70} />
        <Skeleton width="60%" height={12} style={{ marginBottom: '14px' }} />
        <Skeleton width={240} height={80} style={{ borderRadius: '10px', maxWidth: '100%' }} />
      </CardShell>
      <CardShell pad={pad} style={{ marginBottom: '20px' }}><RuledTitleSkeleton width={60} /><SkeletonText lines={3} /></CardShell>
    </div>
  )
}

// Admin member > Edit Profile: stacked form cards (photo + bio, basic info, ...).
export function MemberEditFormSkeleton() {
  const field = (key, flex = 1) => (
    <div key={key} style={{ flex, minWidth: '140px' }}><Skeleton width={100} height={11} /><Skeleton height={40} style={{ borderRadius: '8px', marginTop: '7px' }} /></div>
  )
  return (
    <div>
      <CardShell style={{ marginBottom: '20px' }}>
        <RuledTitleSkeleton width={190} />
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Skeleton width={110} height={110} style={{ borderRadius: '50%' }} />
            <Skeleton width={110} height={32} style={{ borderRadius: '8px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <Skeleton width={40} height={11} /><Skeleton height={110} style={{ borderRadius: '8px', margin: '7px 0 16px' }} />
            <Skeleton width={90} height={11} /><Skeleton height={40} style={{ borderRadius: '8px', marginTop: '7px' }} />
          </div>
        </div>
      </CardShell>
      {[0, 1].map(i => (
        <CardShell key={i} style={{ marginBottom: '20px' }}>
          <RuledTitleSkeleton width={i ? 110 : 120} />
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>{field(0)}{field(1)}{field(2, 2)}{field(3, 2)}</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{field(4)}{field(5)}{field(6)}</div>
        </CardShell>
      ))}
    </div>
  )
}

// A member's (or specialist's) page while the roster is still loading: back link,
// header card, feature tabs, then the profile body.
export function MemberPageSkeleton({ maxWidth = '900px' }) {
  return (
    <div style={{ maxWidth, margin: '0 auto', padding: '24px' }}>
      <Skeleton width={90} height={13} style={{ marginBottom: '18px' }} />
      <HeroSkeleton avatar />
      <PillTabsSkeleton widths={[96, 70, 104, 118, 84, 100]} />
      <MemberProfileDetailsSkeleton />
    </div>
  )
}

// Admin member > MSM Home: meeting tiles + history on the left, MSM + programs on
// the right.
export function AdminMsmHomeSkeleton() {
  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 400px', minWidth: '300px' }}>
        <CardShell style={{ marginBottom: '20px' }}>
          <Skeleton width={140} height={12} style={{ marginBottom: '16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {Array.from({ length: 5 }).map((_, i) => <SummaryTileSkeleton key={i} />)}
          </div>
          <Skeleton width={160} height={34} style={{ borderRadius: '8px' }} />
        </CardShell>
        <CardShell style={{ marginBottom: '20px' }}>
          <Skeleton width={130} height={12} style={{ marginBottom: '16px' }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div><Skeleton width={150} height={14} /><Skeleton width={190} height={11} style={{ marginTop: '6px' }} /></div>
              <Skeleton width={56} height={24} style={{ borderRadius: '6px' }} />
            </div>
          ))}
        </CardShell>
      </div>
      <div style={{ flex: '1 1 250px', minWidth: '250px' }}>
        <CardShell style={{ marginBottom: '20px' }}>
          <Skeleton width={110} height={12} style={{ marginBottom: '14px' }} />
          <Skeleton height={40} style={{ borderRadius: '8px' }} />
          <Skeleton width={70} height={34} style={{ borderRadius: '8px', marginTop: '12px' }} />
        </CardShell>
        <CardShell style={{ marginBottom: '20px' }}>
          <Skeleton width={90} height={12} style={{ marginBottom: '14px' }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '11px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <Skeleton width={i % 2 ? 110 : 140} height={14} />
              <Skeleton width={44} height={24} style={{ borderRadius: '12px', flexShrink: 0 }} />
            </div>
          ))}
        </CardShell>
      </div>
    </div>
  )
}

// A meeting-count tile (MSM Home).
export function SummaryTileSkeleton() {
  return (
    <div className="vfo-skel-on-tint" style={{ padding: '12px 8px', minHeight: '76px', boxSizing: 'border-box', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
      <Skeleton width={30} height={24} />
      <Skeleton width={112} height={10} style={{ maxWidth: '100%' }} />
    </div>
  )
}

// A member's program page: PROGRAM eyebrow, name, joined line, Edit, then the
// bottom-bordered tab row and the Home tab's notes.
export function AdminProgramViewSkeleton({ tabs = 3, edit = true }) {
  return (
    <div>
      <ProgramHeadingSkeleton edit={edit} />
      <ProgramTabsSkeleton tabs={tabs} />
      <ProgramNotesSkeleton />
    </div>
  )
}

export function ProgramHeadingSkeleton({ edit = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
      <div>
        <Skeleton width={64} height={10} />
        <Skeleton width={230} height={22} style={{ margin: '8px 0' }} />
        <Skeleton width={180} height={12} />
      </div>
      {edit && <Skeleton width={54} height={30} style={{ borderRadius: '6px' }} />}
    </div>
  )
}

export function ProgramTabsSkeleton({ tabs = 2 }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
      {Array.from({ length: tabs }).map((_, i) => <Skeleton key={i} width={i ? 92 : 108} height={30} style={{ borderRadius: '999px', marginRight: '4px' }} />)}
    </div>
  )
}

// KPI pages (members, specialists, tax planners): the navy hero, then the
// breakdown and donut cards. `layout`: 'member' = breakdown + narrow donut column,
// 'single' = breakdown alone (strategic), 'specialist' = donut + breakdown,
// 'planner' = donut over a full-width breakdown. `subTabs`: true for the two
// Advisor KPIs pills, or an array of pill widths.
export function KpiPageSkeleton({ title, layout = 'member', chips = 7, subTabs = false }) {
  const stacked = layout === 'member'
  const donut = (
    <CardShell pad="18px 22px 20px" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}><Skeleton width={120} height={12} /><Skeleton width={56} height={11} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexDirection: stacked ? 'column' : 'row' }}>
        <Skeleton width={112} height={112} style={{ borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: stacked ? '100%' : '170px' }}>{[0, 1].map(i => <Skeleton key={i} width="85%" height={14} />)}</div>
      </div>
    </CardShell>
  )
  const breakdown = (
    <CardShell pad="18px 22px" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}><Skeleton width={170} height={12} /><Skeleton width={34} height={18} style={{ borderRadius: '999px' }} /></div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '13px', padding: '13px 0', borderBottom: i < 4 ? '1px solid var(--vfo-tint)' : 'none' }}>
          <Skeleton width={26} height={26} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '9px' }}><Skeleton width={160} height={14} /><Skeleton width={54} height={14} /></div>
            <Skeleton height={7} style={{ borderRadius: '999px' }} />
          </div>
        </div>
      ))}
    </CardShell>
  )
  const row = { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }
  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}>
      {subTabs && <PillTabsSkeleton widths={Array.isArray(subTabs) ? subTabs : [70, 270]} />}
      <KpiHeroSkeleton title={title} chips={chips} />
      {layout === 'member' && <div style={row}><div style={{ flex: '3 1 560px', minWidth: '300px' }}>{breakdown}</div><div style={{ flex: '1 1 240px', minWidth: '230px', maxWidth: '320px' }}>{donut}</div></div>}
      {layout === 'single' && breakdown}
      {layout === 'specialist' && <div style={row}><div style={{ flex: '1 1 300px', minWidth: '280px' }}>{donut}</div><div style={{ flex: '2 1 460px', minWidth: '300px' }}>{breakdown}</div></div>}
      {layout === 'planner' && <>{donut}<div style={{ marginTop: '16px' }}>{breakdown}</div></>}
    </div>
  )
}
