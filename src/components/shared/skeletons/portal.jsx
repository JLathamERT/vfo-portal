// Member / client / specialist portal skeletons, desktop and phone.
import { useIsPhone } from '../../../lib/useMediaQuery'
import { getTheme } from '../../../lib/theme'
import { Skeleton, SkeletonText, CardShell, HeroSkeleton, PillTabsSkeleton, SearchFilterSkeleton, RuledTitleSkeleton, ACCENT_STRIP, ProfileCardSkeleton } from './primitives'
import { ClientOverviewSkeleton, PageHeadingSkeleton } from './adminLists'
import { MemberProfileDetailsSkeleton, ProgramCardHeadSkeleton, ProgramTabsSkeleton } from './adminPages'
import { CiqListSkeleton, MsmHomeSkeleton } from './tracks'

// Placeholders on the showroom's solid blue cards: the same shimmer, in white.
const onBlue = {
  background: 'linear-gradient(100deg, rgba(255,255,255,0.14) 36%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.14) 64%)',
  backgroundSize: '200% 100%',
}

// Showroom (member, client and specialist portals): centred search, category
// buttons + count, then the blue specialist cards. Phone: count + category dropdown
// on one row, then one row per specialist.
export function ShowroomSkeleton({ cards = 8 }) {
  const isPhone = useIsPhone()
  const dark = getTheme() === 'dark'
  return (
    <div style={{ background: dark ? '#001b4f' : '#ffffff', minHeight: '60vh' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isPhone ? '16px 14px 36px' : '36px 48px 64px' }}>
        <div style={{ maxWidth: isPhone ? '100%' : '480px', margin: isPhone ? '0 auto 12px' : '0 auto 32px' }}>
          <Skeleton height={isPhone ? 40 : 52} style={{ borderRadius: isPhone ? '10px' : '12px' }} />
        </div>
        {isPhone ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <Skeleton width={110} height={12} />
            <Skeleton width={140} height={34} style={{ borderRadius: '10px' }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '26px', flexWrap: 'wrap' }}>
              {[64, 128, 112, 136, 148, 120, 104].map((w, i) => <Skeleton key={i} width={w} height={43} style={{ borderRadius: '10px' }} />)}
            </div>
            <Skeleton width={130} height={14} style={{ margin: '0 auto 30px' }} />
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: isPhone ? '10px' : '22px' }}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} style={{ background: '#0b4bad', borderRadius: isPhone ? '14px' : '16px', padding: isPhone ? '12px 14px' : '22px 20px 18px', display: 'flex', flexDirection: isPhone ? 'row' : 'column', alignItems: 'center', gap: isPhone ? '12px' : '10px' }}>
              <Skeleton width={isPhone ? 52 : 74} height={isPhone ? 52 : 74} style={{ ...onBlue, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: isPhone ? 1 : undefined, width: isPhone ? undefined : '100%', display: 'flex', flexDirection: 'column', alignItems: isPhone ? 'flex-start' : 'center', gap: '8px', minWidth: 0 }}>
                <Skeleton width={i % 2 ? 130 : 160} height={17} style={{ ...onBlue, maxWidth: '100%' }} />
                <Skeleton width="85%" height={12} style={onBlue} />
                {!isPhone && <Skeleton width="60%" height={12} style={onBlue} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Vault: the document sections, each with a couple of file rows and the add box.
export function VaultSectionsSkeleton({ sections = 2, filesPerSection = 2 }) {
  // Each section a profile box (VaultKit, 2026-11-26).
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <ProfileCardSkeleton key={s} titleWidth={170} sub>
          <VaultRowsSkeleton rows={filesPerSection} add />
        </ProfileCardSkeleton>
      ))}
    </div>
  )
}

// The file tiles of one vault section. `add` = the dashed upload tile under them;
// `icon={false}` = tiles without the file-type badge.
export function VaultRowsSkeleton({ rows = 2, add = false, icon = true }) {
  const isPhone = useIsPhone()
  const tile = { display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', marginBottom: '8px' }
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => isPhone ? (
        <div key={i} style={{ ...tile, padding: '10px 10px 10px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}><Skeleton width="70%" height={13} /><Skeleton width={46} height={10} style={{ marginTop: '6px' }} /></div>
          <Skeleton width={30} height={30} style={{ borderRadius: '50%', flexShrink: 0 }} />
        </div>
      ) : (
        <div key={i} style={{ ...tile, padding: '10px 12px' }}>
          {icon && <Skeleton width={36} height={36} style={{ borderRadius: '10px', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}><Skeleton width="45%" height={13} /><Skeleton width={50} height={10} style={{ marginTop: '6px' }} /></div>
          <Skeleton width={48} height={24} style={{ borderRadius: '7px' }} />
        </div>
      ))}
      {add && <Skeleton height={56} style={{ borderRadius: '12px', marginTop: '10px' }} />}
    </div>
  )
}

// "Shared with Me" (specialist portal): one row per client, inside the tab's card.
export function SharedDocsSkeleton({ rows = 3 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px' }}>
      <div style={{ flex: 1, minWidth: 0 }}><Skeleton width={i % 2 ? 170 : 220} height={14} style={{ maxWidth: '100%' }} /></div>
      <Skeleton width={46} height={12} />
      <Skeleton width={8} height={12} />
    </div>
  ))
}

// The member's own Edit Profile page: Profile Picture, Contact & Company (two
// rows of two inputs), the Save Changes bar, then the Branding card.
export function MemberEditProfileSkeleton() {
  const isPhone = useIsPhone()
  const pad = 'var(--vfo-card-pad)'
  const field = (key) => (
    <div key={key} style={{ flex: 1, minWidth: '240px' }}>
      <Skeleton width={150} height={11} />
      <Skeleton height={40} style={{ borderRadius: '8px', marginTop: '8px' }} />
    </div>
  )
  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
      <ProfileCardSkeleton titleWidth={170}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <Skeleton width={110} height={110} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />
          {!isPhone && <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />}
        </div>
      </ProfileCardSkeleton>
      <ProfileCardSkeleton titleWidth={190}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>{[0, 1].map(field)}</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{[2, 3].map(field)}</div>
      </ProfileCardSkeleton>
      <div style={{ padding: '16px 0', marginBottom: '16px', borderTop: '1px solid var(--vfo-border)' }}>
        <Skeleton width={150} height={40} style={{ borderRadius: '8px' }} />
      </div>
      <ProfileCardSkeleton titleWidth={120}>
        <BrandingBodySkeleton />
      </ProfileCardSkeleton>
    </div>
  )
}

// Inside the Branding card: intro, the two logo strips, the upload button and the
// two setting rows.
export function BrandingBodySkeleton() {
  return (
    <>
      <SkeletonText lines={2} />
      <div style={{ display: 'flex', gap: '12px', margin: '14px 0', flexWrap: 'wrap' }}>
        {[0, 1].map(i => <div key={i} style={{ flex: '1 1 200px' }}><Skeleton height={96} style={{ borderRadius: '10px' }} /></div>)}
      </div>
      <Skeleton width={120} height={34} style={{ borderRadius: '8px', marginBottom: '18px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
        <Skeleton width={260} height={14} />
        <Skeleton width={54} height={30} style={{ borderRadius: '999px', flexShrink: 0 }} />
      </div>
      <div style={{ padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
        <Skeleton width={280} height={14} style={{ maxWidth: '100%' }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <Skeleton width={120} height={34} style={{ borderRadius: '6px' }} />
          <Skeleton width={100} height={34} style={{ borderRadius: '6px' }} />
          <Skeleton width={90} height={34} style={{ borderRadius: '6px' }} />
        </div>
      </div>
    </>
  )
}

// The member's own Profile tab: header card, then the shared profile body.
export function MemberProfileSkeleton() {
  const isPhone = useIsPhone()
  const avatar = isPhone ? 48 : 64
  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
      <CardShell pad={0} style={{ overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ height: '4px', background: ACCENT_STRIP }} />
        <div style={{ padding: isPhone ? '16px' : '22px 24px', display: 'flex', alignItems: 'center', gap: isPhone ? '14px' : '18px' }}>
          <Skeleton width={avatar} height={avatar} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div>
            <Skeleton width={110} height={10} />
            <Skeleton width={190} height={22} style={{ margin: '8px 0' }} />
            <Skeleton width={140} height={12} />
          </div>
        </div>
      </CardShell>
      <MemberProfileDetailsSkeleton />
    </div>
  )
}

// A member's program page: PROGRAM eyebrow, name, joined line, tab pills, then the
// opening tab's own skeleton.
export function MemberProgramSkeleton({ tabs = 2, children }) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
      <ProgramCardHeadSkeleton />
      {tabs > 0 && <ProgramTabsSkeleton tabs={tabs} />}
      {children}
    </div>
  )
}

// The coaching program's Home tab: the one notes card.
export function TeamNotesSkeleton() {
  return (
    <CardShell pad="var(--vfo-card-pad)" style={{ marginBottom: '20px' }}>
      <Skeleton width={170} height={12} style={{ marginBottom: '16px' }} />
      <Skeleton width="90%" height={14} style={{ marginBottom: '8px' }} />
      <Skeleton width="70%" height={14} />
    </CardShell>
  )
}

// Growth Plan: three tab pills, the One Page Plan hero, the 3x3 matrix card and the
// New / Ongoing action tables (each card with the gradient strip). `tabs={false}` =
// the caller has its own menu (the admin view).
export function GrowthPlanSkeleton({ tabs = true }) {
  const isPhone = useIsPhone()
  const strip = <div style={{ height: '4px', background: ACCENT_STRIP }} />
  const card = { overflow: 'hidden', marginBottom: '18px' }
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: isPhone ? '16px var(--vfo-gutter)' : '24px' }}>
      {tabs && <PillTabsSkeleton widths={isPhone ? [110, 96, 96] : [140, 150, 130]} style={{ marginBottom: isPhone ? '14px' : '18px' }} />}
      <HeroSkeleton />
      <CardShell pad={0} style={card}>
        {strip}
        <div style={{ padding: isPhone ? '14px' : '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} height={isPhone ? 64 : 96} style={{ borderRadius: '10px' }} />)}
        </div>
      </CardShell>
      {[0, 1].map(t => (
        <CardShell key={t} pad={0} style={card}>
          {strip}
          <div style={{ padding: isPhone ? '14px' : '20px' }}>
            <Skeleton width={170} height={15} style={{ marginBottom: '14px' }} />
            {[0, 1].map(i => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}><Skeleton width={24} height={24} style={{ borderRadius: '50%', flexShrink: 0 }} /><div style={{ flex: 1 }}><Skeleton width="55%" height={14} /></div><Skeleton width={70} height={13} /></div>)}
          </div>
        </CardShell>
      ))}
    </div>
  )
}

// My One Page Plan (client portal): title, Latest / History toggles, the intro, then
// the Immediate and Parked cards.
export function OnePagePlanSkeleton() {
  return (
    <div>
      <Skeleton width={230} height={20} style={{ marginBottom: '20px' }} />
      <PillTabsSkeleton widths={[116, 80]} height={32} style={{ marginBottom: '24px' }} />
      <Skeleton width={180} height={12} style={{ marginBottom: '14px' }} />
      <SkeletonText lines={2} style={{ marginBottom: '26px' }} />
      {[0, 1].map(s => (
        <div key={s} style={{ marginBottom: '24px' }}>
          <Skeleton width={180} height={16} style={{ marginBottom: '7px' }} />
          <Skeleton width={320} height={11} style={{ marginBottom: '13px', maxWidth: '100%' }} />
          <CardShell pad="var(--vfo-card-pad)" style={{ marginBottom: 0 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}><Skeleton width={i % 2 ? '40%' : '55%'} height={14} /><Skeleton width={120} height={10} style={{ marginTop: '6px' }} /></div>)}
          </CardShell>
        </div>
      ))}
    </div>
  )
}

// The member portal while its first load runs, per tab (MemberPortal). Profile, Edit
// Profile and Growth Credits have their own; the rest are here.
export function MemberTabSkeleton({ tab }) {
  const isPhone = useIsPhone()
  if (tab === 'msm_home') return <MsmHomeSkeleton />
  if (tab === 'showroom') return <ShowroomSkeleton />
  if (tab === 'growthplan') return <GrowthPlanSkeleton />
  if (tab === 'ciq') return <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}><CiqListSkeleton /></div>
  if (tab === 'vault') return <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}><VaultSectionsSkeleton /></div>
  if (tab === 'client_overview') {
    return (
      <div style={{ maxWidth: '1500px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
        <PageHeadingSkeleton />
        <PillTabsSkeleton widths={[84, 120]} style={{ marginBottom: '16px' }} />
        <SearchFilterSkeleton boxes={isPhone ? [84] : [84, 150]} />
        <ClientOverviewSkeleton grid="280px 110px 180px 1fr 80px" minWidth="820px" twoLine={false} cards={isPhone} />
      </div>
    )
  }
  if (tab === 'website' || tab === 'specialists') {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>
        {[0, 1].map(i => <CardShell key={i} pad="var(--vfo-card-pad)" style={{ marginBottom: '20px' }}><Skeleton width={150} height={12} style={{ marginBottom: '16px' }} /><SkeletonText lines={3} /><Skeleton height={40} style={{ borderRadius: '8px', marginTop: '16px' }} /></CardShell>)}
      </div>
    )
  }
  if (tab === 'tax_diagnostic') return <MemberTaxDiagnosticSkeleton />
  return <MemberProfileSkeleton />
}

// The member's Tax Diagnostic tab (MemberTaxDiagnostic) as it opens: the heading,
// the two view pills with Refresh on the right, then the Submitted Diagnostics cards.
export function MemberTaxDiagnosticSkeleton() {
  const isPhone = useIsPhone()
  const pill = (w, extra) => <Skeleton width={w} height={32} style={{ borderRadius: '999px', flexShrink: 0, ...extra }} />
  return (
    <div style={{ padding: isPhone ? '16px var(--vfo-gutter)' : '24px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ marginBottom: '18px' }}>
        <Skeleton width={130} height={12} />
        <Skeleton width={170} height={24} style={{ marginTop: '8px' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {pill(isPhone ? 108 : 196)}
        {pill(isPhone ? 84 : 166)}
        {pill(isPhone ? 32 : 76, { marginLeft: 'auto', ...(isPhone ? { borderRadius: '50%' } : {}) })}
      </div>
      <TaxDiagnosticCardsSkeleton />
    </div>
  )
}

// The member's Submitted Diagnostics cards (DiagnosticCard, memberMode, closed):
// name + the facts line, the status chip and the Open button. Phone: name and chip
// over one fact per line, the round open button on the right.
export function TaxDiagnosticCardsSkeleton({ cards = 3 }) {
  const isPhone = useIsPhone()
  return Array.from({ length: cards }).map((_, i) => (
    <CardShell key={i} pad={isPhone ? 'var(--vfo-card-pad)' : '24px'} style={{ marginBottom: isPhone ? '12px' : '20px' }}>
      {isPhone ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <Skeleton width={140} height={16} style={{ maxWidth: '100%' }} />
              <Skeleton width={84} height={22} style={{ borderRadius: '999px', flexShrink: 0 }} />
            </div>
            {[160, 190].map((w, j) => <Skeleton key={j} width={w} height={12} style={{ marginTop: j ? '6px' : '8px', maxWidth: '100%' }} />)}
          </div>
          <Skeleton width={30} height={30} style={{ borderRadius: '50%', flexShrink: 0 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={180} height={16} style={{ maxWidth: '100%' }} />
            <Skeleton width={420} height={12} style={{ marginTop: '8px', maxWidth: '100%' }} />
          </div>
          <Skeleton width={96} height={24} style={{ borderRadius: '999px', flexShrink: 0 }} />
          <Skeleton width={72} height={30} style={{ borderRadius: '999px', flexShrink: 0 }} />
        </div>
      )}
    </CardShell>
  ))
}

// Set-up pages (/member-setup, /set-password): the 480px column with its centred
// title, the three label + input pairs and the full-width button.
export function SetupFormSkeleton() {
  return (
    <div style={{ maxWidth: '480px', width: '100%' }}>
      <Skeleton width={260} height={22} style={{ margin: '0 auto 32px', maxWidth: '100%' }} />
      {[0, 1, 2].map(i => <div key={i} style={{ marginBottom: '18px' }}><Skeleton width={120} height={11} /><Skeleton height={44} style={{ borderRadius: '8px', marginTop: '8px' }} /></div>)}
      <Skeleton height={46} style={{ borderRadius: '8px', marginTop: '26px' }} />
      <Skeleton width="80%" height={11} style={{ margin: '22px auto 0' }} />
    </div>
  )
}

// The long public forms (SIF, DDC, MAP 4, PFT discovery): the 720px tinted card from
// the top of the page, title + intro, then headed sections of inputs.
export function PublicFormSkeleton({ sections = 2 }) {
  const isPhone = useIsPhone()
  return (
    <div className="vfo-skel-on-tint" style={{ maxWidth: '720px', width: '100%', boxSizing: 'border-box', margin: '0 auto', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '16px', padding: isPhone ? '24px 18px' : '36px 40px', alignSelf: 'flex-start' }}>
      <Skeleton width={280} height={28} style={{ margin: '0 auto 12px', maxWidth: '100%' }} />
      <Skeleton width={220} height={13} style={{ margin: '0 auto 30px', maxWidth: '100%' }} />
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} style={{ borderTop: '1px solid var(--vfo-border)', paddingTop: '20px', marginBottom: '24px' }}>
          <Skeleton width={160} height={14} style={{ marginBottom: '18px' }} />
          {[0, 1, 2].map(i => <div key={i} style={{ marginBottom: '16px' }}><Skeleton width={150} height={11} /><Skeleton height={42} style={{ borderRadius: '8px', marginTop: '7px' }} /></div>)}
        </div>
      ))}
      <Skeleton height={46} style={{ borderRadius: '8px' }} />
    </div>
  )
}
