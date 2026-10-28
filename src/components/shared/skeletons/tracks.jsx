// Program / track skeletons — shared by the admin client views and the
// member portal MSM pages.
import { Skeleton, SkeletonRow, CardShell, HeroSkeleton, SkeletonStats } from './primitives'

// MAP 1 client track: TrackHero with progress + stats, then phase cards.
export function Map1TrackSkeleton({ phaseCount = 4, rowsPerPhase = 3 }) {
  return (
    <div>
      <HeroSkeleton stats={3} progress />
      {Array.from({ length: phaseCount }).map((_, i) => (
        <CardShell key={i} pad="18px 24px" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={24} height={24} style={{ borderRadius: '50%' }} />
              <Skeleton width={180} height={14} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Skeleton width={60} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={10} height={10} />
            </div>
          </div>
          {Array.from({ length: rowsPerPhase }).map((_, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Skeleton width={8} height={8} style={{ borderRadius: '50%' }} />
                <Skeleton width={200} height={14} />
              </div>
              <Skeleton width={120} height={32} style={{ borderRadius: '8px' }} />
            </div>
          ))}
        </CardShell>
      ))}
    </div>
  )
}

// Partnership Fast Track: phase cards with varying row counts.
export function PFTTrackSkeleton() {
  const phases = [1, 3, 5, 2, 2]
  return (
    <div>
      <HeroSkeleton stats={0} progress />
      {phases.map((rows, i) => (
        <CardShell key={i} pad={0} style={{ marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={24} height={24} style={{ borderRadius: '50%' }} />
              <Skeleton width={170} height={13} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={44} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={72} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={10} height={8} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--vfo-border)', padding: '12px 18px' }}>
            {Array.from({ length: rows }).map((_, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                <Skeleton width={8} height={8} style={{ borderRadius: '50%', flexShrink: 0 }} />
                <Skeleton width="45%" height={13} style={{ flex: 1 }} />
                <Skeleton width={140} height={28} style={{ borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// Tax Priorities / Tax Planning / Regular Priorities plan lists.
export function TaxPlanListSkeleton({ count = 2 }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <Skeleton width={90} height={20} />
        <Skeleton width={36} height={18} style={{ borderRadius: '999px' }} />
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <CardShell key={i} pad="20px 24px" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={110} height={16} />
            <Skeleton width={80} height={12} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={45} height={20} style={{ borderRadius: '999px' }} />
            <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
            <Skeleton width={50} height={14} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// PIP Meetings list: header + add button, year band, meeting rows.
export function PipMeetingsListSkeleton({ yearCount = 1, meetingsPerYear = 3 }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Skeleton width={90} height={14} />
        <Skeleton width={110} height={32} style={{ borderRadius: '8px' }} />
      </div>
      {Array.from({ length: yearCount }).map((_, y) => (
        <div key={y} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'rgba(0,149,255,0.08)', border: '1px solid rgba(0,149,255,0.2)', borderRadius: '10px', marginBottom: '6px' }}>
            <Skeleton width={10} height={10} />
            <Skeleton width={60} height={14} />
            <Skeleton width={100} height={12} />
          </div>
          {Array.from({ length: meetingsPerYear }).map((_, i) => (
            <div key={i} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: 'var(--vfo-shadow-card)', padding: '14px 18px', marginBottom: '8px', marginLeft: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Skeleton width={200} height={14} />
                <Skeleton width={120} height={11} />
              </div>
              <Skeleton width={50} height={13} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function PipMeetingDetailSkeleton() {
  return (
    <div>
      <Skeleton width={150} height={13} style={{ marginBottom: '20px' }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <CardShell key={i} pad={0} style={{ marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={24} height={24} style={{ borderRadius: '50%' }} />
              <Skeleton width={180} height={13} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Skeleton width={60} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
              <Skeleton width={10} height={10} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--vfo-border-soft)', padding: '12px 18px' }}>
            {Array.from({ length: i === 1 ? 4 : 2 }).map((_, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                <Skeleton width={8} height={8} style={{ borderRadius: '50%' }} />
                <Skeleton width="50%" height={13} style={{ flex: 1 }} />
                <Skeleton width={130} height={26} style={{ borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// Member-side training tracks (Holistic / Partnership): hero + phase cards.
export function TrainingTrackSkeleton({ phaseCount = 2, rowsPerPhase = 5 }) {
  return (
    <div>
      <HeroSkeleton stats={3} progress />
      {Array.from({ length: phaseCount }).map((_, i) => (
        <CardShell key={i} style={{ marginBottom: '16px' }}>
          <Skeleton width="30%" height={14} style={{ marginBottom: '16px' }} />
          {Array.from({ length: rowsPerPhase }).map((_, j) => <SkeletonRow key={j} withPill />)}
        </CardShell>
      ))}
    </div>
  )
}

export function PhaseListSkeleton({ phases = 4, rowsPerPhase = 3 }) {
  return (
    <div>
      {Array.from({ length: phases }).map((_, i) => (
        <CardShell key={i} pad="20px 24px" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <Skeleton width="40%" height={16} />
            <Skeleton width={70} height={20} style={{ borderRadius: '999px' }} />
          </div>
          {Array.from({ length: rowsPerPhase }).map((_, j) => <SkeletonRow key={j} withDate />)}
        </CardShell>
      ))}
    </div>
  )
}

// Client list under a program (admin member detail → Clients).
export function ClientsListSkeleton({ rows = 3, addButtonLabel = 'Add Client' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', width: '100%' }}>
        <SkeletonStats count={2} />
        <Skeleton width={110} height={36} style={{ borderRadius: '8px' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <CardShell key={i} pad="20px 24px" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton width={120} height={16} />
                <Skeleton width={70} height={11} />
                <Skeleton width={55} height={18} style={{ borderRadius: '999px' }} />
              </div>
              <Skeleton width={180} height={12} />
            </div>
            <Skeleton width={50} height={14} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// Advanced Coaching — Meetings tab: hero stats + upcoming + history cards
// (`hero={false}` on a phone, where the counts sit on the history card).
export function CoachingMeetingsSkeleton({ upcomingRows = 2, historyRows = 3, hero = true }) {
  const meetingRow = (i) => (
    <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Skeleton width={90} height={14} />
      <Skeleton width={70} height={18} style={{ borderRadius: '999px' }} />
    </div>
  )
  return (
    <div>
      {hero && <HeroSkeleton stats={3} action={false} />}
      <CardShell>
        <Skeleton width={80} height={12} style={{ marginBottom: '16px' }} />
        {Array.from({ length: upcomingRows }).map((_, i) => meetingRow(i))}
      </CardShell>
      <CardShell>
        <Skeleton width={120} height={12} style={{ marginBottom: '16px' }} />
        {Array.from({ length: historyRows }).map((_, i) => meetingRow(i))}
      </CardShell>
    </div>
  )
}

// Advanced Coaching — Renewal tab: stat card + renewal history (`phone`: the
// stat card is three label / value rows, as the phone tab draws it).
export function CoachingRenewalSkeleton({ historyRows = 2, phone = false }) {
  return (
    <div>
      {phone ? (
        <CardShell pad="var(--vfo-card-pad)">
          <Skeleton width={90} height={12} style={{ marginBottom: '8px' }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: '9px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={60} height={13} />
              <Skeleton width={100} height={14} />
            </div>
          ))}
        </CardShell>
      ) : (
      <CardShell>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={90} height={10} />
              <Skeleton width={75} height={15} />
            </div>
          ))}
        </div>
      </CardShell>
      )}
      <CardShell>
        <Skeleton width={130} height={12} style={{ marginBottom: '16px' }} />
        {Array.from({ length: historyRows }).map((_, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Skeleton width={70} height={18} style={{ borderRadius: '999px' }} />
            <Skeleton width={90} height={14} />
            <Skeleton width={50} height={12} />
          </div>
        ))}
      </CardShell>
    </div>
  )
}

// Member-portal MSM Home.
export function MsmHomeSkeleton({ programRows = 3, historyRows = 2 }) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <HeroSkeleton action={false} />
      <CardShell>
        <Skeleton width={120} height={11} style={{ marginBottom: '16px' }} />
        {Array.from({ length: programRows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <Skeleton width={180} height={14} />
            <Skeleton width={90} height={13} />
          </div>
        ))}
      </CardShell>
      <CardShell>
        <Skeleton width={140} height={11} style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <Skeleton width={36} height={28} />
              <Skeleton width={100} height={10} />
            </div>
          ))}
        </div>
      </CardShell>
      <CardShell>
        <Skeleton width={130} height={11} style={{ marginBottom: '16px' }} />
        {Array.from({ length: historyRows }).map((_, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Skeleton width={130} height={14} />
            <Skeleton width={200} height={11} />
          </div>
        ))}
      </CardShell>
    </div>
  )
}

// CIQ client list.
export function CiqListSkeleton({ clientCards = 3 }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Skeleton width={110} height={14} />
        <Skeleton width={130} height={36} style={{ borderRadius: '8px' }} />
      </div>
      {Array.from({ length: clientCards }).map((_, i) => (
        <CardShell key={i} pad="20px 24px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '14px' }}>
            <Skeleton width={150} height={16} />
            <Skeleton width={220} height={12} />
          </div>
          <div style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={45} height={18} style={{ borderRadius: '999px' }} />
              <Skeleton width={140} height={13} />
            </div>
            <Skeleton width={70} height={13} />
          </div>
        </CardShell>
      ))}
    </div>
  )
}
