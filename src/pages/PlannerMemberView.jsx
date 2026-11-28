import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getSession, callApi } from '../lib/api'
import { usePortalTheme } from '../lib/theme'
import { MemberProfileDetailsSkeleton } from '../components/shared/Skeleton'
import { HeroAvatar } from '../components/shared/TrackKit'
import { cardBox, DotText, PersonName, ProfileCard, ProfileHero, rememberSettingsReturn } from '../components/shared/ProfileKit'
import MemberProfileDetails from '../components/shared/MemberProfileDetails'
import { VisibilityBadge, noteTint } from '../components/shared/NoteVisibility'
import PortalHeader from '../components/shared/PortalHeader'
import { formatDate } from '../lib/dates'
import { STANDING_COLORS, statusColor } from '../components/shared/statusColors'
import { HEADSHOTS_URL } from '../lib/environment'

const HEADSHOT_SUPABASE = HEADSHOTS_URL
const LIST_TITLE = { accountant: 'Accountants', strategic_member: 'Strategic Members' }

// Read-only member profile for the tax-planner portal, reached from the
// "Member:" name on a planner's client page. Its body is the shared member
// profile (shared/MemberProfileDetails, 2026-11-26), so it matches the admin
// Details tab and the member's own Profile without a copy to keep in step. Names
// are plain text, there is no Stripe block, and only what
// tax_planner_member_view's additive whitelist sends is shown.
export default function PlannerMemberView() {
  const { memberNumber } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const session = getSession()
  usePortalTheme()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const backUrl = location.state?.from || '/tax-planner'
  const backLabel = location.state?.from ? '← Back to Client' : '← Back to Clients'
  function handleBack() {
    if (!location.state?.from) sessionStorage.setItem('taxPlannerActiveTab', 'planning')
    navigate(backUrl)
  }

  useEffect(() => {
    if (!session || session.role !== 'tax_planner') { navigate('/tax-planner/login'); return }
    let cancelled = false
    setLoading(true); setError(''); setData(null)
    callApi('tax_planner_member_view', { member_number: memberNumber })
      .then(res => { if (!cancelled) setData(res) })
      .catch(err => { if (!cancelled) setError(err?.message || 'This member profile is not available.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [memberNumber])

  const profile = data?.member
  const sectionStyle = cardBox
  // The shared body's people shape: { name, number, member_type, chip }.
  const asPerson = (p, chip = false) => ({ ...p, number: p.member_number, chip: chip ? (p.connection_type || null) : null })
  const people = data ? {
    introducedBy: data.introduced_by ? asPerson(data.introduced_by, true) : null,
    introducerOf: data.introduced.map(p => asPerson(p, true)),
    connections: data.connections.map(p => asPerson(p)),
    corporate: data.corporate_members.map(p => asPerson(p)),
    lead: data.lead_member ? asPerson(data.lead_member) : null,
  } : {}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeader name={session?.name || ''} onTitleClick={() => { sessionStorage.removeItem('taxPlannerActiveTab'); navigate('/tax-planner') }} actions={[
        { key: 'settings', label: 'Settings', onClick: () => { rememberSettingsReturn(); sessionStorage.setItem('taxPlannerActiveTab', 'settings'); navigate('/tax-planner') } },
        { key: 'signout', label: 'Sign Out', onClick: () => { sessionStorage.clear(); navigate('/tax-planner/login') } },
      ]} />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>{backLabel}</button>

        {loading && <MemberProfileDetailsSkeleton hero />}

        {!loading && error && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', marginBottom: '6px' }}>This member profile is not available</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>You can only view members connected to a client allocated to your tax planning group.</div>
          </div>
        )}

        {!loading && profile && (
          <>
            <ProfileHero
              eyebrow={LIST_TITLE[profile.member_category] || 'Advisors'}
              name={<PersonName first={profile.first_name} last={profile.last_name} preferred={profile.preferred_name} fallback={profile.name} />}
              avatar={<HeroAvatar src={profile.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(profile.headshot_image) : null} name={profile.name} size={72} />}
              facts={[
                { label: 'Member number', value: <span style={{ fontFamily: 'monospace' }}>{profile.member_number}</span> },
                { label: 'Type', value: profile.member_type },
                { label: 'Status', value: profile.elite_status ? <DotText color={statusColor(profile.elite_status)}>{profile.elite_status}</DotText> : null },
              ]}
              alerts={(profile.paused || profile.suspended || profile.membership_arrears) ? <>
                {profile.paused && <DotText color={STANDING_COLORS.Paused}>Paused</DotText>}
                {profile.suspended && <DotText color={STANDING_COLORS.Suspended}>Suspended</DotText>}
                {profile.membership_arrears && <DotText color="#b45309">In Arrears</DotText>}
              </> : null}
            />

            {/* The member profile body shared with the admin Details tab and the
                member's own Profile (shared/MemberProfileDetails), read-only, with
                plain-text names and only the fields this view is sent. */}
            <MemberProfileDetails profile={profile} memberNumber={profile.member_number} people={people} adminView omit={['taxPlanning', 'logo']} />

            {profile.notes && (
              <ProfileCard icon="note" title="Notes">
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.75, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.notes}</div>
              </ProfileCard>
            )}

            {data.program_notes.length > 0 && (
              <ProfileCard icon="layers" title="All Program Notes" sub={`${data.program_notes.length} ${data.program_notes.length === 1 ? 'note' : 'notes'} across every program`}>
                {data.program_notes.map(note => (
                  <div key={note.id} style={{ padding: '11px 14px', marginBottom: '8px', borderRadius: '12px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
                    <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{formatDate(note.created_at)}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.program_name}</span>
                      <VisibilityBadge visibility={note.visibility} />
                    </div>
                  </div>
                ))}
              </ProfileCard>
            )}

          </>
        )}
      </div>
    </div>
  )
}
