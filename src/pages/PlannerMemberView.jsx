import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getSession, callApi } from '../lib/api'
import { usePortalTheme } from '../lib/theme'
import { MemberProfileDetailsSkeleton } from '../components/shared/Skeleton'
import { TrackHero, HeroAvatar } from '../components/shared/TrackKit'
import { VisibilityBadge, noteTint } from '../components/shared/NoteVisibility'
import VfoWordmark from '../components/shared/VfoWordmark'
import NotificationBell from '../components/NotificationBell'
import vfoCertifiedSeal from '../assets/vfo-certified-emblem.png'
import vfoAccreditedSeal from '../assets/vfo-accredited-emblem.png'

const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
const normalizeUrl = (u) => { const s = (u || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s }
const LIST_TITLE = { accountant: 'Accountants', strategic_member: 'Strategic Members' }

// Read-only member profile for the tax-planner portal, reached from the
// "Member:" name on a planner's client page. Mirrors the admin MemberProfile
// details tab (MembersPanel.jsx) card for card — same hero, same styles, same
// field order — with the feature-tab row, the Stripe block and every name link
// removed. Every value comes from tax_planner_member_view's additive whitelist;
// the admin component is not reused because it needs the admin roster payload
// and admin-only actions. Keep the two in step when the admin card changes.
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
  // Styles copied from MembersPanel.jsx's MemberProfile so the two render identically.
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px' }
  const countChip = { fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }
  const introChip = { fontSize: '11px', padding: '2px 9px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }
  const initials = (name) => (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const metaDot = (color, label) => <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />{label}</span></>

  // Same row shape as the admin Connections / Corporate Members / Introducer Of
  // lists, with the name as plain text.
  const personRow = (p, i, n) => (
    <div key={p.member_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < n - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(p.name)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{p.name}</span>
          {p.connection_type && <span style={introChip}>{p.connection_type}</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}><span style={{ fontFamily: 'monospace' }}>{p.member_number}</span>{p.member_type ? <> · {p.member_type}</> : null}</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={() => { sessionStorage.removeItem('taxPlannerActiveTab'); navigate('/tax-planner') }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NotificationBell />
          <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.name || ''}</span>
          <button onClick={() => { sessionStorage.setItem('taxPlannerActiveTab', 'settings'); navigate('/tax-planner') }}
            style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Settings
          </button>
          <button onClick={() => { sessionStorage.clear(); navigate('/tax-planner/login') }} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>{backLabel}</button>

        {loading && <MemberProfileDetailsSkeleton />}

        {!loading && error && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', marginBottom: '6px' }}>This member profile is not available</div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>You can only view members connected to a client allocated to your tax planning group.</div>
          </div>
        )}

        {!loading && profile && (
          <>
            <TrackHero
              eyebrow={LIST_TITLE[profile.member_category] || 'Advisors'}
              title={profile.name}
              avatar={<HeroAvatar src={profile.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(profile.headshot_image) : null} name={profile.name} />}
              meta={
                <>
                  <span style={{ fontFamily: 'monospace' }}>{profile.member_number}</span>
                  {profile.member_type && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>{profile.member_type}</span></>}
                  {profile.elite_status && metaDot(profile.elite_status === 'Active' ? '#1b9254' : profile.elite_status === 'Lost' ? '#e74c3c' : 'var(--vfo-faint)', profile.elite_status)}
                  {profile.paused && metaDot('#e06717', 'Paused')}
                  {(profile.suspended || profile.membership_suspended) && metaDot('#e74c3c', 'Suspended')}
                </>
              }
            />

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 340px', minWidth: '300px' }}>
                <div style={sectionStyle}>
                  <div style={cardTitle}>Member Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
                    <div><div style={fieldLabel}>Join Date</div><div style={fieldValue}>{profile.join_date ? profile.join_date.split('T')[0] : '—'}</div></div>
                    {(profile.elite_status === 'Lost' || profile.elite_status === 'Removed') && <div><div style={fieldLabel}>Leave Date</div><div style={fieldValue}>{profile.leave_date ? profile.leave_date.split('T')[0] : '—'}</div></div>}
                    <div><div style={fieldLabel}>Work email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{profile.email || '—'}</div></div>
                    <div><div style={fieldLabel}>Personal email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{profile.personal_email || '—'}</div></div>
                    {(profile.member_category === 'accountant' || profile.member_category === 'advisor') && <div><div style={fieldLabel}>Company Name</div><div style={fieldValue}>{profile.trading_name || '—'}</div></div>}
                    <div><div style={fieldLabel}>Revenue Decision</div><div style={fieldValue}>{profile.revenue_decision || '—'}</div></div>
                    <div><div style={fieldLabel}>Eligible for Credit Note</div><div style={fieldValue}>{profile.credit_note_eligible === false ? 'No' : 'Yes'}</div></div>
                    {profile.website_url && <div><div style={fieldLabel}>Website</div><div style={fieldValue}><a href={normalizeUrl(profile.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: '#0095ff', textDecoration: 'none', wordBreak: 'break-all' }}>{profile.website_url}</a></div></div>}
                  </div>
                </div>
              </div>

              {(data.introduced_by || data.introduced.length > 0 || data.connections.length > 0 || data.corporate_members.length > 0 || profile.vfo_certified_date || profile.vfo_accredited_date) && (
                <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                  {(data.introduced_by || data.introduced.length > 0) && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Introductions</span>
                        <span style={countChip}>{(data.introduced_by ? 1 : 0) + data.introduced.length}</span>
                      </div>
                      {data.introduced_by && (
                        <div style={{ marginBottom: data.introduced.length > 0 ? '16px' : 0 }}>
                          <div style={{ ...fieldLabel, marginBottom: '8px' }}>Introduced By</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0, boxShadow: '0 2px 8px rgba(18,94,204,0.28)' }}>{initials(data.introduced_by.name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{data.introduced_by.name}</span>
                                {data.introduced_by.connection_type && <span style={introChip}>{data.introduced_by.connection_type}</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}><span style={{ fontFamily: 'monospace' }}>{data.introduced_by.member_number}</span>{data.introduced_by.member_type ? <> · {data.introduced_by.member_type}</> : null}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {data.introduced.length > 0 && (
                        <div>
                          <div style={{ ...fieldLabel, marginBottom: '2px' }}>Introducer Of</div>
                          {data.introduced.map((p, i) => personRow(p, i, data.introduced.length))}
                        </div>
                      )}
                    </div>
                  )}

                  {data.connections.length > 0 && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Connections</span>
                        <span style={countChip}>{data.connections.length}</span>
                      </div>
                      {data.connections.map((p, i) => personRow(p, i, data.connections.length))}
                    </div>
                  )}

                  {data.corporate_members.length > 0 && (
                    <div style={sectionStyle}>
                      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Corporate Members</span>
                        <span style={countChip}>{data.corporate_members.length}</span>
                      </div>
                      {data.corporate_members.map((p, i) => personRow(p, i, data.corporate_members.length))}
                    </div>
                  )}

                  {(profile.vfo_certified_date || profile.vfo_accredited_date) && (
                    <div style={sectionStyle}>
                      <div style={cardTitle}>Certifications</div>
                      {profile.vfo_certified_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: profile.vfo_accredited_date ? '12px' : 0 }}>
                          <img src={vfoCertifiedSeal} style={{ width: '36px', height: '36px' }} />
                          <div><div style={{ fontSize: '14px', color: '#b08d26', fontWeight: '600' }}>VFO Certified</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{profile.vfo_certified_date.split('T')[0]}</div></div>
                        </div>
                      )}
                      {profile.vfo_accredited_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={vfoAccreditedSeal} style={{ width: '36px', height: '36px' }} />
                          <div><div style={{ fontSize: '14px', color: 'var(--vfo-muted)', fontWeight: '600' }}>VFO Accredited</div><div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{profile.vfo_accredited_date.split('T')[0]}</div></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {profile.bio && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Bio</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.bio}</div>
              </div>
            )}

            {profile.notes && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Notes</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{profile.notes}</div>
              </div>
            )}

            {data.program_notes.length > 0 && (
              <div style={sectionStyle}>
                <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>All Program Notes</span>
                  <span style={countChip}>{data.program_notes.length}</span>
                </div>
                {data.program_notes.map(note => (
                  <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
                    <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.program_name}</span>
                      <VisibilityBadge visibility={note.visibility} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.type_history.length > 0 && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Member Type History</div>
                {data.type_history.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                    <div style={{ textAlign: 'left' }}><span style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>{h.old_type}</span><span style={{ color: 'var(--vfo-muted)', margin: '0 8px' }}>→</span><span style={{ color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: '600' }}>{h.new_type}</span></div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{new Date(h.changed_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
