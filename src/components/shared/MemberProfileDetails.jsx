import vfoCertifiedSeal from '../../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../../assets/vfo-accredited-emblem.png'
import { formatDate } from '../../lib/dates'
import { logoUrl } from './logoPng'

// The member profile's read-only body, shared by the admin member profile
// (Details tab) and the member's own Profile tab so the two always mirror.
// Order: Member Details (+ Certifications) / Revenue Details (+ Tax Planning,
// which also shows the two branding CHOICES) / Branding (the logo alone) /
// Network / Bio. Every value comes off `profile` (the member_profile_load row). The admin passes `payoutSlot` (its Stripe controls)
// and `onOpenMember` (clickable names); the member gets a read-only status line.
//
// Network is ONE full-width card whose people sit in a responsive grid, so a
// long introductions / connections / corporate list grows sideways first
// instead of stretching a narrow column down the page.

const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '18px 24px' }
const countChip = { fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }
const introChip = { fontSize: '11px', padding: '2px 9px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }

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

function Field({ label, children }) {
  return <div><div style={fieldLabel}>{label}</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{children}</div></div>
}

function Person({ person, chip, onOpenMember }) {
  const clickable = !!onOpenMember
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid var(--vfo-border-soft)', borderRadius: '10px', background: 'var(--vfo-card)', minWidth: 0 }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(person.name)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span onClick={clickable ? () => onOpenMember(person) : undefined}
            onMouseEnter={clickable ? e => { e.currentTarget.style.textDecoration = 'underline' } : undefined}
            onMouseLeave={clickable ? e => { e.currentTarget.style.textDecoration = 'none' } : undefined}
            style={{ fontSize: '13px', fontWeight: 600, color: clickable ? '#125ecc' : 'var(--vfo-ink)', cursor: clickable ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
          {chip && <span style={introChip}>{chip}</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'monospace' }}>{person.number}</span>{person.member_type ? <> · {person.member_type}</> : null}
        </div>
      </div>
    </div>
  )
}

function PeopleGroup({ title, people, onOpenMember, first }) {
  if (!people.length) return null
  return (
    <div style={{ marginTop: first ? 0 : '18px' }}>
      <div style={{ ...fieldLabel, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>{title}<span style={countChip}>{people.length}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px' }}>
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

// people: { introducedBy, introducerOf[], connections[], corporate[] } — each
// person is { name, number, member_type, chip? }.
export default function MemberProfileDetails({
  profile, memberNumber, directEligibility, hideRevenueDecision = false,
  payoutSlot, people = {}, onOpenMember, styles,
}) {
  const { sectionStyle, cardTitle } = styles
  const lost = profile.elite_status === 'Lost' || profile.elite_status === 'Removed'
  const hasCerts = profile.vfo_certified_date || profile.vfo_accredited_date
  const introducedBy = people.introducedBy ? [people.introducedBy] : []
  const introducerOf = people.introducerOf || []
  const connections = people.connections || []
  const corporate = people.corporate || []
  const hasNetwork = introducedBy.length + introducerOf.length + connections.length + corporate.length > 0
  const row = { display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }
  const col = (basis, min) => ({ flex: `1 1 ${basis}`, minWidth: min, display: 'flex' })
  const card = { ...sectionStyle, flex: 1 }

  return (
    <div>
      <div style={row}>
        <div style={col('420px', '300px')}>
          <div style={card}>
            <div style={cardTitle}>Member Details</div>
            <div style={grid}>
              <Field label="Join Date">{profile.join_date ? formatDate(profile.join_date) : '—'}</Field>
              {lost && <Field label="Leave Date">{profile.leave_date ? formatDate(profile.leave_date) : '—'}</Field>}
              <Field label="Renewal Date">{profile.membership_renewal_date ? formatDate(profile.membership_renewal_date) : '—'}</Field>
              <Field label="Work email">{profile.email || '—'}</Field>
              <Field label="Personal email">{profile.personal_email || '—'}</Field>
              <Field label="Company Name">{profile.trading_name || '—'}</Field>
              <Field label="Website">
                {profile.website_url
                  ? <a href={normalizeUrl(profile.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: '#0095ff', textDecoration: 'none', wordBreak: 'break-all' }}>{profile.website_url}</a>
                  : '—'}
              </Field>
            </div>
          </div>
        </div>
        {hasCerts && (
          <div style={col('260px', '240px')}>
            <div style={card}>
              <div style={cardTitle}>Certifications</div>
              {profile.vfo_certified_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: profile.vfo_accredited_date ? '14px' : 0 }}>
                  <img src={vfoCertifiedSeal} alt="" style={{ width: '40px', height: '40px' }} />
                  <div><div style={{ fontSize: '14px', color: '#b08d26', fontWeight: 600 }}>VFO Certified</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{formatDate(profile.vfo_certified_date)}</div></div>
                </div>
              )}
              {profile.vfo_accredited_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={vfoAccreditedSeal} alt="" style={{ width: '40px', height: '40px' }} />
                  <div><div style={{ fontSize: '14px', color: 'var(--vfo-muted)', fontWeight: 600 }}>VFO Accredited</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{formatDate(profile.vfo_accredited_date)}</div></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={row}>
        <div style={col('420px', '300px')}>
          <div style={card}>
            <div style={cardTitle}>Revenue Details</div>
            <div style={grid}>
              {!hideRevenueDecision && <Field label="Revenue Decision">{profile.revenue_decision || '—'}</Field>}
              <Field label="Eligible for Credit Note">{profile.credit_note_eligible === false ? 'No' : 'Yes'}</Field>
            </div>
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-tint)' }}>
              {payoutSlot}
            </div>
          </div>
        </div>
        <div style={col('300px', '260px')}>
          <div style={card}>
            <div style={cardTitle}>Tax Planning</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '18px' }}>
              {directEligibility && (
                <Field label="Direct to Tax Planning">
                  {directEligibility.eligible ? 'Eligible' : 'Not yet eligible'}
                  <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 500, marginLeft: '6px' }}>
                    ({directEligibility.qualifying_count} of 2 qualifying clients{directEligibility.feature_released === false ? ', not released yet' : ''})
                  </span>
                </Field>
              )}
              <Field label="Logo on ROI presentations">{profile.logo_image ? (profile.logo_enabled ? 'On' : 'Off') : '—'}</Field>
              <Field label="Name in tax planning agreements">{agreementNameValue(profile)}</Field>
            </div>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={cardTitle}>Logo</div>
        {profile.logo_image
          ? <img src={logoUrl(profile.logo_image)} alt="Logo" style={{ height: '80px', maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
          : <div style={{ width: '240px', height: '80px', borderRadius: '10px', border: '1px dashed var(--vfo-border-mid)', background: 'var(--vfo-tint)', boxSizing: 'border-box' }} />}
      </div>

      {hasNetwork && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Network</div>
          {introducedBy.length > 0 && (
            <div>
              <div style={{ ...fieldLabel, marginBottom: '8px' }}>Introduced By</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px' }}>
                <Person person={introducedBy[0]} chip={introducedBy[0].chip} onOpenMember={onOpenMember} />
              </div>
            </div>
          )}
          <PeopleGroup title="Introducer Of" people={introducerOf} onOpenMember={onOpenMember} first={!introducedBy.length} />
          <PeopleGroup title="Connections" people={connections} onOpenMember={onOpenMember} first={!introducedBy.length && !introducerOf.length} />
          <PeopleGroup title="Corporate Members" people={corporate} onOpenMember={onOpenMember} first={!introducedBy.length && !introducerOf.length && !connections.length} />
        </div>
      )}

      {profile.bio && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Bio</div>
          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.bio}</div>
        </div>
      )}
    </div>
  )
}
