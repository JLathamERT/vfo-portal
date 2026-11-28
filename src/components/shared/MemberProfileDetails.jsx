import vfoCertifiedSeal from '../../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../../assets/vfo-accredited-emblem.png'
import { formatDate } from '../../lib/dates'
import { logoUrl } from './logoPng'
import { useIsPhone } from '../../lib/useMediaQuery'
import { Field, FieldGrid, Initials, ProfileCard, subLabel } from './ProfileKit'

// The member profile's read-only body, shared by the admin member profile
// (Details tab) and the member's own Profile tab so the two always mirror.
// Order: Member Details (+ Certifications) / Revenue Details (+ Tax Planning,
// which also shows the two branding CHOICES) / Branding (the logo alone) /
// Network / Bio. Every value comes off `profile` (the member_profile_load row). The admin passes `payoutSlot` (its Stripe controls),
// `directControl` (the Direct to Tax Planning tick box) and `onOpenMember`
// (clickable names); the member gets read-only status lines.
//
// Network is ONE full-width card whose people sit in a responsive grid, so a
// long introductions / connections / corporate list grows sideways first
// instead of stretching a narrow column down the page.

function normalizeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// members.contract_name_mode; NULL (never chosen) is shown as "—" and the
// agreement leaves the member out.
function agreementNameValue(profile) {
  const mode = profile.contract_name_mode
  const company = (profile.trading_name || '').trim()
  const real = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  if (mode === 'company') return `Company name${company ? ` (${company})` : ' (not set)'}`
  if (mode === 'personal') return `Real name${real ? ` (${real})` : ''}`
  if (mode === 'none') return 'Neither'
  return '—'
}

// One person in the Network box: initials, name (an admin can open it), number and
// type, and the introducer tier where there is one.
function Person({ person, chip, onOpenMember }) {
  const clickable = !!onOpenMember
  return (
    <div onClick={clickable ? () => onOpenMember(person) : undefined}
      onMouseEnter={clickable ? e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 22px rgba(20,45,95,0.12)'; e.currentTarget.style.borderColor = 'var(--vfo-border-mid)' } : undefined}
      onMouseLeave={clickable ? e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--vfo-border-soft)' } : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 13px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-input)', minWidth: 0, cursor: clickable ? 'pointer' : 'default', transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease' }}>
      <Initials name={person.name} size={34} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 700, color: clickable ? 'var(--vfo-accent-text)' : 'var(--vfo-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'monospace' }}>{person.number}</span>{person.member_type ? <> · {person.member_type}</> : null}
        </div>
        {chip && <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#0095ff', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip}</div>}
      </div>
    </div>
  )
}

function PeopleGroup({ title, people, onOpenMember, first }) {
  if (!people.length) return null
  return (
    <div style={{ marginTop: first ? 0 : '20px' }}>
      <div style={{ ...subLabel, marginBottom: '9px' }}>{title}<span style={{ color: 'var(--vfo-muted)', marginLeft: '6px' }}>{people.length}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
        {people.map(p => <Person key={p.number} person={p} chip={p.chip} onOpenMember={onOpenMember} />)}
      </div>
    </div>
  )
}

// Payout account status as one line; shared so the member and the admin see the
// same words for the same state.
export function PayoutStatusLine({ status }) {
  const pill = status === 'complete' ? { dot: '#16a34a', label: 'Account set up' }
    : status === 'eligible_capped' ? { dot: '#f59e0b', label: 'Account set up — details outstanding' }
    : status === 'pending' ? { dot: '#dc2626', label: 'Setup pending' }
    : status === 'none' ? { dot: 'var(--vfo-faint)', label: 'Not set up' }
    : status === 'loading' || status == null ? { dot: 'var(--vfo-faint)', label: 'Checking…' }
    : { dot: 'var(--vfo-faint)', label: 'Status unavailable' }
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: pill.dot, flexShrink: 0 }} />{pill.label}</span>
}

// people: { introducedBy, introducerOf[], connections[], corporate[], lead } —
// each person is { name, number, member_type, chip? }. `lead` is a corporate
// member's lead member, the mirror of the lead's Corporate Members group.
// Direct to Tax Planning on the Tax Planning card (2026-10-28): 2 qualifying
// clients make a member READY; an admin's tick (directControl, admin only)
// switches it on. `standing` is member_profile_load's direct_eligibility.
export function directCountLabel(count) {
  const n = Number(count) || 0
  return n > 2 ? `${n} qualifying clients` : `${n}/2 qualifying clients`
}

const standingNote = { fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 500, marginTop: '3px' }
const standingCount = { fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 500 }

// One plain line — the state, then the count muted after a dot — plus a second
// only once switched on (who / since when). The admin's tick box (`control`)
// sits to the left of it.
function DirectStanding({ standing, admin, control }) {
  const count = <span style={standingCount}> · {directCountLabel(standing.qualifying_count)}</span>
  let line
  let note = null
  if (standing.approved) {
    line = <>On{admin && count}</>
    note = admin
      ? `By ${standing.approved_by || 'a VFO admin'}, ${formatDate(standing.approved_at)}`
      : standing.feature_released === false ? 'Opens when Direct is released' : `Since ${formatDate(standing.approved_at)}`
  } else if (standing.ready) {
    line = <>{admin ? 'Needs approval' : 'Awaiting approval'}{count}</>
  } else {
    line = <>Not yet eligible{count}</>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
      {control}
      <div>
        {line}
        {note && <div style={standingNote}>{note}</div>}
      </div>
    </div>
  )
}

// The member's VFO certifications as seal badges: the last section of Member
// Details, shown only when the member holds one (2026-11-26 - a side box squeezed
// the details). Renders nothing without vfo_certified_date / vfo_accredited_date.
function CertificationSeals({ profile }) {
  const isPhone = useIsPhone()
  if (!profile?.vfo_certified_date && !profile?.vfo_accredited_date) return null
  const badge = (gold) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: isPhone ? '7px 12px 7px 8px' : '8px 14px 8px 9px', borderRadius: '12px', minWidth: 0, background: gold ? 'linear-gradient(135deg, rgba(176,141,38,0.14) 0%, rgba(176,141,38,0.03) 100%)' : 'var(--vfo-card)', border: gold ? '1px solid rgba(176,141,38,0.32)' : '1px solid var(--vfo-border-soft)' })
  const img = { width: isPhone ? '34px' : '42px', height: isPhone ? '34px' : '42px', flexShrink: 0 }
  return (
    <FieldGrid min={360} phoneCols={1}>
      {profile.vfo_certified_date && (
        <div style={badge(true)}>
          <img src={vfoCertifiedSeal} alt="" style={img} />
          <div><div style={{ fontSize: '13px', fontWeight: 800, color: '#b08d26', whiteSpace: 'nowrap' }}>VFO Certified</div><div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '1px' }}>{formatDate(profile.vfo_certified_date)}</div></div>
        </div>
      )}
      {profile.vfo_accredited_date && (
        <div style={badge(false)}>
          <img src={vfoAccreditedSeal} alt="" style={img} />
          <div><div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>VFO Accredited</div><div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '1px' }}>{formatDate(profile.vfo_accredited_date)}</div></div>
        </div>
      )}
    </FieldGrid>
  )
}

export default function MemberProfileDetails({
  profile, memberNumber, directEligibility, directControl, hideRevenueDecision = false,
  payoutSlot, people = {}, onOpenMember, adminView = false, omit = [],
}) {
  // `omit` leaves out what a caller is not sent (the tax planner's member view has
  // no logo or agreement-name fields): 'renewal', 'taxPlanning', 'logo'.
  const shows = key => !omit.includes(key)
  const lost = profile.elite_status === 'Lost' || profile.elite_status === 'Removed'
  const introducedBy = people.introducedBy ? [people.introducedBy] : []
  const introducerOf = people.introducerOf || []
  const connections = people.connections || []
  const corporate = people.corporate || []
  const lead = people.lead ? [people.lead] : []
  const hasNetwork = introducedBy.length + introducerOf.length + connections.length + corporate.length + lead.length > 0
  const row = { display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }
  const col = (basis, min) => ({ flex: `1 1 ${basis}`, minWidth: min, display: 'flex' })
  const card = { flex: 1, minWidth: 0 }

  return (
    <div>
      <div style={row}>
        <div style={col('100%', '0px')}>
          <ProfileCard icon="id" title="Member Details" style={card}>
            {/* Who they are and how to reach them, then their membership dates. */}
            <FieldGrid min={360} phoneCols={1}>
              <Field label="Company Name">{profile.trading_name}</Field>
              <Field label="Website" nowrap>
                {profile.website_url
                  ? <a href={normalizeUrl(profile.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vfo-link)', textDecoration: 'none' }} title={profile.website_url}>{profile.website_url}</a>
                  : null}
              </Field>
              <Field label="Work email" nowrap pair>{profile.email}</Field>
              <Field label="Personal email" nowrap pair>{profile.personal_email}</Field>
            </FieldGrid>
            <div style={{ ...subLabel, margin: '18px 0 9px' }}>Membership</div>
            <FieldGrid min={360}>
              <Field label="Join Date">{profile.join_date ? formatDate(profile.join_date) : null}</Field>
              {shows('renewal') && <Field label="Renewal Date">{profile.membership_renewal_date ? formatDate(profile.membership_renewal_date) : null}</Field>}
              {lost && <Field label="Leave Date">{profile.leave_date ? formatDate(profile.leave_date) : null}</Field>}
            </FieldGrid>
            {(profile.vfo_certified_date || profile.vfo_accredited_date) && <>
              <div style={{ ...subLabel, margin: '18px 0 9px' }}>Certifications</div>
              <CertificationSeals profile={profile} />
            </>}
          </ProfileCard>
        </div>
      </div>

      <div style={row}>
        <div style={col('420px', '300px')}>
          <ProfileCard icon="dollar" tone="green" title="Revenue Details" style={card}>
            <FieldGrid min={180}>
              {!hideRevenueDecision && <Field label="Revenue Decision">{profile.revenue_decision}</Field>}
              <Field label="Eligible for Credit Note">{profile.credit_note_eligible === false ? 'No' : 'Yes'}</Field>
              {payoutSlot && <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>{payoutSlot}</div>}
            </FieldGrid>
          </ProfileCard>
        </div>
        {shows('taxPlanning') && <div style={col('300px', '260px')}>
          <ProfileCard icon="calculator" title="Tax Planning" style={card}>
            <FieldGrid min={240} phoneCols={1}>
              {directEligibility && (
                <Field label="Direct to Tax Planning" wide>
                  <DirectStanding standing={directEligibility} admin={!!directControl} control={directControl} />
                </Field>
              )}
              <Field label="Logo on ROI presentations" wide>{profile.logo_image ? (profile.logo_enabled ? 'On' : 'Off') : null}</Field>
              <Field label="Name in tax planning agreements" wide>{agreementNameValue(profile)}</Field>
            </FieldGrid>
          </ProfileCard>
        </div>}
      </div>

      {profile.bio && (
        <ProfileCard icon="text" title="Bio">
          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.75, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.bio}</div>
        </ProfileCard>
      )}

      {shows('logo') && <ProfileCard icon="image" title="Logo"
        sub={adminView
          ? "Shown on this member's clients' ROI presentations, beside the VFO Services logo and the tax planning team's logo."
          : "Shown on your clients' ROI presentations, beside the VFO Services logo and the tax planning team's logo."}>
        {profile.logo_image
          ? <div style={{ display: 'inline-flex', padding: '14px 18px', borderRadius: '12px', background: '#fff', border: '1px solid var(--vfo-border-soft)', maxWidth: '100%', boxSizing: 'border-box' }}><img src={logoUrl(profile.logo_image)} alt="Logo" style={{ height: '72px', maxWidth: '100%', objectFit: 'contain', display: 'block' }} /></div>
          : <div style={{ width: '240px', maxWidth: '100%', height: '80px', borderRadius: '12px', border: '1px dashed var(--vfo-border-mid)', background: 'var(--vfo-input)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12.5px', color: 'var(--vfo-faint)' }}>No logo yet</div>}
      </ProfileCard>}

      {hasNetwork && (
        <ProfileCard icon="users" title="Network">
          {introducedBy.length > 0 && (
            <div>
              <div style={{ ...subLabel, marginBottom: '9px' }}>Introduced By</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
                <Person person={introducedBy[0]} chip={introducedBy[0].chip} onOpenMember={onOpenMember} />
              </div>
            </div>
          )}
          <PeopleGroup title="Introducer Of" people={introducerOf} onOpenMember={onOpenMember} first={!introducedBy.length} />
          <PeopleGroup title="Connections" people={connections} onOpenMember={onOpenMember} first={!introducedBy.length && !introducerOf.length} />
          <PeopleGroup title="Corporate Members" people={corporate} onOpenMember={onOpenMember} first={!introducedBy.length && !introducerOf.length && !connections.length} />
          <PeopleGroup title="Lead Member" people={lead} onOpenMember={onOpenMember} first={!introducedBy.length && !introducerOf.length && !connections.length && !corporate.length} />
        </ProfileCard>
      )}

    </div>
  )
}
