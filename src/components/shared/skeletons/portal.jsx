// Member / client / specialist portal skeletons.
import { Skeleton, SkeletonText, CardShell, HeroSkeleton } from './primitives'

// Showroom (member portal, client portal, specialist portal, admin preview):
// centered heading, search bar, filter chips, then the specialist card grid.
export function ShowroomSkeleton({ cards = 6 }) {
  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: '24px' }}>
        <Skeleton width={260} height={26} />
        <Skeleton width={340} height={13} />
      </div>
      <Skeleton width="100%" height={44} style={{ borderRadius: '10px', marginBottom: '14px' }} />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '26px', flexWrap: 'wrap' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={104} height={30} style={{ borderRadius: '999px' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '22px' }}>
        {Array.from({ length: cards }).map((_, i) => (
          <CardShell key={i} style={{ marginBottom: 0, textAlign: 'center' }}>
            <Skeleton width={84} height={84} style={{ borderRadius: '50%', margin: '0 auto 14px', display: 'block' }} />
            <Skeleton width={140} height={16} style={{ marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px' }}>
              <Skeleton width={70} height={18} style={{ borderRadius: '999px' }} />
              <Skeleton width={80} height={18} style={{ borderRadius: '999px' }} />
            </div>
            <SkeletonText lines={2} />
          </CardShell>
        ))}
      </div>
    </div>
  )
}

// Vault (member / client / specialist / admin tabs): the two document
// sections, each with a couple of file rows and the dashed add box.
export function VaultSectionsSkeleton({ sections = 2, filesPerSection = 2 }) {
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '12px', padding: '22px', marginBottom: '20px' }}>
          <Skeleton width={150} height={15} style={{ marginBottom: '8px' }} />
          <Skeleton width={260} height={11} style={{ marginBottom: '16px' }} />
          {Array.from({ length: filesPerSection }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px' }}>
              <Skeleton width={18} height={18} />
              <Skeleton width="45%" height={13} style={{ flex: 1 }} />
              <Skeleton width={44} height={11} />
              <Skeleton width={52} height={24} style={{ borderRadius: '6px' }} />
              <Skeleton width={62} height={24} style={{ borderRadius: '6px' }} />
            </div>
          ))}
          <Skeleton width="100%" height={50} style={{ borderRadius: '8px', marginTop: '10px' }} />
        </div>
      ))}
    </div>
  )
}

// Just the file rows of one vault section (for section-level loading states).
export function VaultRowsSkeleton({ rows = 2 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px' }}>
          <Skeleton width={18} height={18} />
          <Skeleton width="45%" height={13} style={{ flex: 1 }} />
          <Skeleton width={44} height={11} />
          <Skeleton width={52} height={24} style={{ borderRadius: '6px' }} />
        </div>
      ))}
    </div>
  )
}

// "Shared with Me" (specialist portal): client groups with doc rows.
export function SharedDocsSkeleton({ groups = 2, docsPerGroup = 2 }) {
  return (
    <div>
      {Array.from({ length: groups }).map((_, g) => (
        <CardShell key={g}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Skeleton width={160} height={15} />
            <Skeleton width={110} height={12} />
          </div>
          <VaultRowsSkeleton rows={docsPerGroup} />
        </CardShell>
      ))}
    </div>
  )
}

// The member's own Edit Profile page: Profile Picture, Contact & Company (two
// rows of two inputs), the Save Changes bar, then the Branding card.
export function MemberEditProfileSkeleton() {
  const title = <Skeleton width={170} height={14} style={{ marginBottom: '22px' }} />
  const field = (key) => (
    <div key={key} style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton width={150} height={11} />
      <Skeleton width="100%" height={40} style={{ borderRadius: '8px' }} />
    </div>
  )
  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}>
      <CardShell>
        {title}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Skeleton width={110} height={110} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />
          <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />
        </div>
      </CardShell>
      <CardShell>
        {title}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>{[0, 1].map(field)}</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{[2, 3].map(field)}</div>
      </CardShell>
      <div style={{ padding: '16px 0', marginBottom: '16px', borderTop: '1px solid var(--vfo-border)' }}>
        <Skeleton width={150} height={40} style={{ borderRadius: '8px' }} />
      </div>
      <CardShell>
        {title}
        <SkeletonText lines={2} />
        <div style={{ display: 'flex', gap: '12px', margin: '14px 0' }}>
          <Skeleton width="50%" height={96} style={{ borderRadius: '10px' }} />
          <Skeleton width="50%" height={96} style={{ borderRadius: '10px' }} />
        </div>
        <Skeleton width={120} height={34} style={{ borderRadius: '8px', marginBottom: '18px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <Skeleton width={260} height={14} />
          <Skeleton width={54} height={30} style={{ borderRadius: '999px' }} />
        </div>
        <div style={{ padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width={280} height={14} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={120} height={34} style={{ borderRadius: '6px' }} />
            <Skeleton width={100} height={34} style={{ borderRadius: '6px' }} />
            <Skeleton width={90} height={34} style={{ borderRadius: '6px' }} />
          </div>
        </div>
      </CardShell>
    </div>
  )
}

// The member's own Profile tab (also the member-portal initial loading view):
// header card with avatar, then the details grid and a certifications card.
export function MemberProfileSkeleton() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <CardShell pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
        <div style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '18px' }}>
          <Skeleton width={64} height={64} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={100} height={10} />
            <Skeleton width={200} height={22} />
            <Skeleton width={130} height={12} />
          </div>
        </div>
      </CardShell>
      <CardShell>
        <Skeleton width={140} height={11} style={{ marginBottom: '18px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '18px 24px' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={100} height={10} />
              <Skeleton width={120} height={15} />
            </div>
          ))}
        </div>
      </CardShell>
      <CardShell>
        <Skeleton width={110} height={11} style={{ marginBottom: '18px' }} />
        <div style={{ display: 'flex', gap: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Skeleton width={64} height={64} style={{ borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={100} height={13} />
              <Skeleton width={70} height={10} />
            </div>
          </div>
        </div>
      </CardShell>
    </div>
  )
}
