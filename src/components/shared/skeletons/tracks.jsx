// Program / track skeletons — shared by the admin client views and the member,
// client and tax planner portals. `readOnly` = the member / client view (no Live
// switch, rows end in status pills); admins get the switch and the row's controls.
import { useIsPhone } from '../../../lib/useMediaQuery'
import { Skeleton, CardShell, HeroSkeleton, SkeletonStats, PhaseCardsSkeleton, ListHeaderSkeleton, PillTabsSkeleton, TableSkeleton, RuledTitleSkeleton, FieldGridSkeleton } from './primitives'
import { ListCardsSkeleton, ToolCardsSkeleton } from './adminLists'
import { ProgramNotesSkeleton } from './admin'
import { SummaryTileSkeleton } from './adminPages'

// MAP 1 client track: progress hero with its step bar, the admin's pricing strip,
// then the five phase cards.
export function Map1TrackSkeleton({ readOnly = false }) {
  return (
    <div>
      <HeroSkeleton meta={false} progress steps={5} action={readOnly ? false : 'toggle'} />
      {!readOnly && <Skeleton height={36} style={{ borderRadius: '10px', marginBottom: '10px' }} />}
      <PhaseCardsSkeleton phases={[3, 3, 3, 4, 2]} notes={!readOnly} control={readOnly ? 'pill' : 'field'} />
    </div>
  )
}

// Partnership Fast Track / Tailored Route: progress hero, then the phase cards
// (`phases` = rows per card, 0 = a collapsed one).
export function PFTTrackSkeleton({ phases = [1, 3, 5, 0, 0], readOnly = false }) {
  return (
    <div>
      <HeroSkeleton meta={false} progress steps={phases.length} />
      <PhaseCardsSkeleton phases={phases} notes={!readOnly} control={readOnly ? 'pill' : 'field'} />
    </div>
  )
}

// One tax plan: back link (`back` = the caller has not drawn it), progress hero with
// the step bar, the collapsed tool cards, then the phases.
export function TaxPlanTrackSkeleton({ back = false, readOnly = false }) {
  return (
    <div>
      {back && <Skeleton width={130} height={13} style={{ marginBottom: '18px' }} />}
      <HeroSkeleton progress steps={8} action={readOnly ? false : 'toggle'} />
      <ToolCardsSkeleton count={readOnly ? 2 : 3} />
      <PhaseCardsSkeleton phases={[0, 3, 4, 0, 0, 0]} notes={!readOnly} control={readOnly ? 'pill' : 'field'} />
    </div>
  )
}

// One Regular Priority.
export function RegularPriorityTrackSkeleton({ readOnly = false }) {
  return (
    <div>
      <HeroSkeleton progress steps={5} action={readOnly ? false : 'toggle'} />
      <PhaseCardsSkeleton phases={[3, 2, 2, 0, 0]} notes={!readOnly} control={readOnly ? 'pill' : 'field'} />
    </div>
  )
}

// One PIP meeting.
export function PipMeetingDetailSkeleton({ back = false, readOnly = false }) {
  return (
    <div>
      {back && <Skeleton width={150} height={13} style={{ marginBottom: '22px' }} />}
      <HeroSkeleton progress steps={3} />
      <PhaseCardsSkeleton phases={[2, 4, 2]} notes={!readOnly} control={readOnly ? 'pill' : 'field'} />
    </div>
  )
}

// Tax Plans / Regular Priorities lists.
export function TaxPlanListSkeleton({ count = 2, titleWidth = 96, action = false }) {
  const isPhone = useIsPhone()
  return (
    <div>
      <ListHeaderSkeleton width={titleWidth} action={action} />
      {isPhone ? <ListCardsSkeleton rows={count} /> : Array.from({ length: count }).map((_, i) => (
        <CardShell key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Skeleton width={260} height={16} />
            <Skeleton width={96} height={12} style={{ marginTop: '7px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={42} height={22} style={{ borderRadius: '4px' }} />
            <Skeleton width={84} height={22} style={{ borderRadius: '4px' }} />
            <Skeleton width={46} height={14} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// PIP Meetings list: title + chip (+ add button), year band, meeting rows.
export function PipMeetingsListSkeleton({ meetings = 3, action = false }) {
  const isPhone = useIsPhone()
  return (
    <div>
      <ListHeaderSkeleton width={130} action={action} />
      <div className="vfo-skel-on-tint" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'rgba(0,149,255,0.08)', border: '1px solid rgba(0,149,255,0.2)', borderRadius: '10px', marginBottom: '6px' }}>
        <Skeleton width={10} height={10} />
        <Skeleton width={60} height={14} />
        <Skeleton width={100} height={12} />
      </div>
      {Array.from({ length: meetings }).map((_, i) => (
        <div key={i} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(20,45,95,0.05)', padding: isPhone ? '12px 14px' : '14px 18px', marginBottom: '8px', marginLeft: isPhone ? 0 : '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <Skeleton width={190} height={14} style={{ maxWidth: '100%' }} />
            <Skeleton width={120} height={11} style={{ marginTop: '6px' }} />
          </div>
          <Skeleton width={isPhone ? 8 : 50} height={13} style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

// The 90 Day Plan: the plain progress card (no strip, no title), then one card per
// phase - uppercase title + caret - whose rows end in a status select.
export function TrainingTrackSkeleton({ phases = [4, 5, 0] }) {
  return (
    <div>
      <HeroSkeleton accent={false} eyebrow={false} title={false} progress steps={phases.length} />
      {phases.map((rows, i) => (
        <CardShell key={i} pad="var(--vfo-card-pad)">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: rows ? '16px' : 0 }}>
            <Skeleton width={i % 2 ? 170 : 130} height={13} />
            <Skeleton width={10} height={8} />
          </div>
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <Skeleton width={10} height={10} style={{ borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}><Skeleton width={j % 2 ? '45%' : '60%'} height={14} /></div>
              <Skeleton width={120} height={28} style={{ borderRadius: '6px', flexShrink: 0 }} />
            </div>
          ))}
        </CardShell>
      ))}
    </div>
  )
}

// Client list under a program (`add` = the Add button is on that view).
export function ClientsListSkeleton({ rows = 3, add = true }) {
  const isPhone = useIsPhone()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isPhone ? 0 : '20px', width: '100%' }}>
        <SkeletonStats count={2} indent={isPhone ? 4 : 24} />
        {add && <Skeleton width={110} height={36} style={{ borderRadius: '8px', marginBottom: isPhone ? '20px' : 0 }} />}
      </div>
      {isPhone ? <ListCardsSkeleton rows={rows} /> : Array.from({ length: rows }).map((_, i) => (
        <CardShell key={i} pad="20px 24px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton width={120} height={16} />
                <Skeleton width={70} height={11} />
                <Skeleton width={55} height={12} />
              </div>
              <Skeleton width={180} height={12} style={{ marginTop: '7px' }} />
            </div>
            <Skeleton width={50} height={14} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// Advanced Coaching — Meetings tab: the hero's one detail line, then the history
// card (an Upcoming card only appears when something is scheduled). `action` = the
// admin's log button; a phone has no hero, its counts sit on the history card.
export function CoachingMeetingsSkeleton({ historyRows = 4, action = false }) {
  const isPhone = useIsPhone()
  return (
    <div>
      {!isPhone && <HeroSkeleton action={action ? 'button' : false} />}
      <CardShell pad="var(--vfo-card-pad)">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Skeleton width={120} height={12} />
          {isPhone && <Skeleton width={90} height={12} />}
        </div>
        {Array.from({ length: historyRows }).map((_, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Skeleton width={90} height={14} />
            {!isPhone && <Skeleton width={70} height={18} style={{ borderRadius: '999px' }} />}
            <Skeleton width={10} height={8} style={{ marginLeft: 'auto' }} />
          </div>
        ))}
      </CardShell>
    </div>
  )
}

// Advanced Coaching — Renewal tab: the Membership Renewal hero + renewal history (a
// phone draws the hero as three label / value rows).
export function CoachingRenewalSkeleton({ historyRows = 2, action = false }) {
  const isPhone = useIsPhone()
  return (
    <div>
      {isPhone ? (
        <CardShell pad="var(--vfo-card-pad)">
          <Skeleton width={90} height={12} style={{ marginBottom: '8px' }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: '9px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={60} height={13} />
              <Skeleton width={100} height={14} />
            </div>
          ))}
        </CardShell>
      ) : <HeroSkeleton action={action ? 'button' : false} />}
      <CardShell pad="var(--vfo-card-pad)">
        <Skeleton width={130} height={12} style={{ marginBottom: '16px' }} />
        {Array.from({ length: historyRows }).map((_, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!isPhone && <Skeleton width={70} height={18} style={{ borderRadius: '999px' }} />}
            <Skeleton width={90} height={14} />
            <Skeleton width={50} height={12} style={{ marginLeft: isPhone ? 'auto' : 0 }} />
          </div>
        ))}
      </CardShell>
    </div>
  )
}

// Member-portal MSM Home.
export function MsmHomeSkeleton({ programRows = 3, historyRows = 2 }) {
  const isPhone = useIsPhone()
  const card = { pad: isPhone ? '14px 16px' : '24px', style: { marginBottom: isPhone ? '12px' : '20px' } }
  const gap = isPhone ? '8px' : '16px'
  const line = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isPhone ? '9px 0' : '12px 0', borderBottom: '1px solid var(--vfo-tint)' }
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: isPhone ? '16px var(--vfo-gutter)' : '24px' }}>
      <CardShell {...card}>
        <div style={isPhone ? { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } : undefined}>
          <Skeleton width={120} height={12} style={{ marginBottom: isPhone ? 0 : '13px' }} />
          <Skeleton width={150} height={16} />
        </div>
      </CardShell>
      <CardShell {...card}>
        <Skeleton width={120} height={12} style={{ marginBottom: gap }} />
        {Array.from({ length: programRows }).map((_, i) => <div key={i} style={{ ...line, padding: '12px 0' }}><Skeleton width={i % 2 ? 150 : 190} height={14} /></div>)}
      </CardShell>
      <CardShell {...card}>
        <Skeleton width={140} height={12} style={{ marginBottom: gap }} />
        {isPhone
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} style={line}><Skeleton width={i % 2 ? 120 : 150} height={13} /><Skeleton width={18} height={15} /></div>)
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>{Array.from({ length: 5 }).map((_, i) => <SummaryTileSkeleton key={i} />)}</div>}
      </CardShell>
      <CardShell {...card}>
        <Skeleton width={130} height={12} style={{ marginBottom: gap }} />
        {Array.from({ length: historyRows }).map((_, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <Skeleton width={130} height={14} />
            <Skeleton width={200} height={11} style={{ marginTop: '6px', maxWidth: '100%' }} />
          </div>
        ))}
      </CardShell>
    </div>
  )
}

// CIQ client list: the count line, then one card of tinted client rows (a phone
// draws list cards). `single` = the client page's CIQ tab, already on one client.
export function CiqListSkeleton({ rows = 3, single = false }) {
  const isPhone = useIsPhone()
  return (
    <div>
      <Skeleton width={110} height={13} style={{ margin: '10px 0 24px' }} />
      {!single && isPhone ? <ListCardsSkeleton rows={rows} /> : (
        <CardShell pad="var(--vfo-card-pad)">
          {single && <><Skeleton width={150} height={16} /><Skeleton width={110} height={11} style={{ margin: '7px 0 18px' }} /></>}
          {Array.from({ length: single ? 2 : rows }).map((_, i) => <CiqRow key={i} />)}
        </CardShell>
      )}
    </div>
  )
}

function CiqRow() {
  return (
    <div className="vfo-skel-on-tint" style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ minWidth: 0 }}>
        <Skeleton width={150} height={15} style={{ maxWidth: '100%' }} />
        <Skeleton width={210} height={11} style={{ marginTop: '6px', maxWidth: '100%' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <Skeleton width={104} height={12} />
        <Skeleton width={78} height={13} />
      </div>
    </div>
  )
}

// The single client page's header: the same card the loaded page draws (no avatar
// on a phone).
export function ClientHeaderSkeleton() {
  const isPhone = useIsPhone()
  return <HeroSkeleton avatar={!isPhone} />
}

// The client page's Profile tab: Contact Info, Status beside Proactive Facilitator,
// Additional Contacts, notes. (A member's phone folds the pair into Contact Info.)
export function ClientProfileTabSkeleton({ notes = true, phoneRows = false }) {
  const pad = 'var(--vfo-card-pad)'
  const cardStyle = { marginBottom: '20px' }
  return (
    <div>
      <CardShell pad={pad} style={cardStyle}>
        <RuledTitleSkeleton width={130} />
        {phoneRows
          ? [0, 1, 2].map(i => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: i ? '1px solid var(--vfo-tint)' : 'none' }}><Skeleton width={70} height={11} /><Skeleton width={140} height={14} /></div>)
          : <FieldGridSkeleton fields={2} columns="repeat(auto-fit, minmax(150px, 1fr))" />}
      </CardShell>
      {!phoneRows && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[130, 190].map(w => (
            <div key={w} style={{ flex: '1 1 300px', minWidth: '260px' }}>
              <CardShell pad={`14px ${pad}`} style={cardStyle}>
                <RuledTitleSkeleton width={w} />
                <Skeleton width={190} height={24}style={{ borderRadius: '8px', maxWidth: '100%' }} />
              </CardShell>
            </div>
          ))}
        </div>
      )}
      <CardShell pad={pad} style={cardStyle}><RuledTitleSkeleton width={180} /><Skeleton width="55%" height={14} /></CardShell>
      {notes && <ProgramNotesSkeleton />}
    </div>
  )
}

// My Progress (client portal): the program pills over the track they open on.
export function ClientProgressSkeleton() {
  return (
    <div>
      <div style={{ borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        <PillTabsSkeleton widths={[150, 110]} height={30} style={{ marginBottom: '10px' }} />
      </div>
      <Map1TrackSkeleton readOnly />
    </div>
  )
}

// The payments tabs, inside the tab's own card: title, then the six-column table.
export function PaymentsTabSkeleton({ rows = 4 }) {
  return (
    <div>
      <Skeleton width={140} height={20} style={{ marginBottom: '18px' }} />
      <TableSkeleton card={false} cols="30px 112px minmax(0,1fr) 92px 96px 172px" rows={rows} pillCol={5} />
    </div>
  )
}
