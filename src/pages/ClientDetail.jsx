import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getSession, callApi, loadCachedData } from '../lib/api'
import { usePortalTheme } from '../lib/theme'
import ClientTrackViewV2 from '../components/admin/map1/ClientTrackViewV2'
import RegularPrioritiesTab from '../components/admin/regular/RegularPrioritiesTab'
import PipMeetingsTab from '../components/admin/pip/PipMeetingsTab'
import ClientVaultTab from '../components/admin/ClientVaultTab'
import SendSetupEmailButton from '../components/admin/SendSetupEmailButton'
import ClientPaymentsTab from '../components/payments/ClientPaymentsTab'
import PFTEngagementTrack from '../components/admin/pft/PFTEngagementTrack'
import TaxPrioritiesTab from '../components/admin/tax/TaxPrioritiesTab'
import PaymentContinuationTab from '../components/admin/migration/PaymentContinuationTab'
import AddGeneralNote from '../components/shared/AddGeneralNote'
import { PhaseNotesButton, PhaseNotesPanel } from '../components/shared/PhaseNotes'
import { VisibilityBadge, noteTint, SaveVisibilityButtons } from '../components/shared/NoteVisibility'
import { Skeleton, ProfileTabSkeleton } from '../components/shared/Skeleton'
import { TrackHero, HeroAvatar } from '../components/shared/TrackKit'
import { MemberNameLink } from '../components/shared/personLinks'
import VfoWordmark from '../components/shared/VfoWordmark'
import NotificationBell from '../components/NotificationBell'

const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael', 'Bridger Silvester', 'Tracy Miller', 'Evan Anderson']
const statusColors = { Completed: '#1b9254', Confirmed: '#1b9254', Yes: '#1b9254', 'In Progress': '#e06717', Scheduled: '#0095ff', No: '#e74c3c', 'N/A': 'var(--vfo-muted)', Pending: '#e06717' }
// Specialist-style section heading (navy, underlined) — matches SpecialistProfileView.
const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
// Additional Contact Cc — an additional contact is a future Cc recipient, so the
// email bar here matches the backend's (add-client-contact.ts / dedupeEmails).
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Muted read-only marker shown wherever contacts are listed without controls.
const ccBadgeStyle = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.4px', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-chip)', background: 'var(--vfo-tint)', borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }

function ClientTabDropdown({ label, isActive, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)
  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { closeTimer.current = setTimeout(() => setOpen(false), 200) }
  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '7px 16px', background: isActive ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: isActive ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '160px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientDetail() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const session = getSession()
  usePortalTheme()
  console.log('session on client detail:', session)
  const [activeTab, setActiveTab] = useState(new URLSearchParams(window.location.search).get('tab') || 'home')
  // Deep-link from Client Overview: a specific track/plan to auto-open once the
  // matching tab's list has loaded. Captured at mount so later URL rewrites
  // (the self-heal below preserves these params) can't retrigger auto-select.
  const [initialTrackId] = useState(() => { const v = new URLSearchParams(window.location.search).get('track'); return v ? parseInt(v) : null })
  const [initialPlanId] = useState(() => { const v = new URLSearchParams(window.location.search).get('plan'); return v ? parseInt(v) : null })
  const [client, setClient] = useState(null)
  const [program, setProgram] = useState(null)
  const [contacts, setContacts] = useState([])
  const [specialists, setSpecialists] = useState([])
  // vfo_ecosystem_assignments rows ({ expert_id, name }) from the same cached
  // load_data payload — the Tax 5 picker scopes its roster to Tax Planning.
  const [ecosystems, setEcosystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [clientNotes, setClientNotes] = useState([])

  // Back URL — prefer state passed via navigate, fallback to admin
  const isMember = location.pathname.startsWith('/member')
  // Tax-planner portal viewer: same ClientDetail component, reached from the
  // planner's own client list. Never an admin — sees a stripped, view/edit-tax
  // surface only.
  const isPlanner = location.pathname.startsWith('/tax-planner')
  const isAdmin = !isMember && !isPlanner
  const backUrl = location.state?.from || (isMember ? '/member' : isPlanner ? '/tax-planner' : '/admin')

  // Program sub-tabs (PFT / MAP 1 / Regular / Tax / PIP) are locked on the admin
  // side until a PF is assigned to this client (set on the Profile tab). Members
  // and planners never assign PFs, so the gate never applies to those views.
  const PROGRAM_TABS = ['pft', 'map1', 'regular', 'tax', 'pip']
  const pfLocked = isAdmin && !(client?.assigned_pf && String(client.assigned_pf).trim())

  // PFT accountants are reached from MSMTracking's internal drill-down (not a
  // route), so navigate(-1) loses that state. Restore the member's Accountants
  // list by re-seeding the AdminPortal/MemberDirectoryView sessionStorage keys.
  const isPFTBack = program?.name === 'Partnership Fast Track' && location.state?.backTo === 'pft_accountants'
  const backLabel = isPFTBack ? '← Back to Accountants' : '← Back to Clients'
  function handleBack() {
    if (isPlanner) {
      sessionStorage.setItem('taxPlannerActiveTab', 'planning')
      navigate('/tax-planner')
      return
    }
    if (isPFTBack && location.state?.memberNumber) {
      sessionStorage.setItem('adminActiveTab', 'accountants')
      sessionStorage.setItem('adminAccountantsSection', 'accountant_search')
      sessionStorage.setItem('adminSelectedAccountant', String(location.state.memberNumber))
      sessionStorage.setItem('adminAccountantFeatureTab', 'msm_program_partnership')
      sessionStorage.setItem('pftReturnEnrolledTab', 'clients')
      navigate('/admin')
    } else {
      navigate(-1)
    }
  }

  useEffect(() => {
    if (isPlanner) {
      if (!session || session.role !== 'tax_planner') { navigate('/tax-planner/login'); return }
    } else if (!session) {
      navigate('/admin/login?next=' + encodeURIComponent(location.pathname + location.search)); return
    }
    loadData()
  }, [clientId])

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const qp = new URLSearchParams(window.location.search)
      const passedEnrollmentId = location.state?.enrollment_id || null
      const passedProgramId = location.state?.program_id || (qp.get('program') ? parseInt(qp.get('program')) : null)
      // Planners never call load_data (admin-wide dataset, denied for their role);
      // the specialists list it feeds is only used by admin-only surfaces.
      const [data, expertsData] = await Promise.all([
        callApi('msm_load_client_home', { client_id: parseInt(clientId), enrollment_id: passedEnrollmentId, program_id: passedProgramId }),
        isPlanner ? Promise.resolve({ experts: [], ecosystems: [] }) : loadCachedData(),
      ])
      setClient(data.client)
      setProgram(data.program)
      setContacts(data.contacts || [])
      setSpecialists(expertsData.experts || [])
      setEcosystems(expertsData.ecosystems || [])
      if (!isMember) {
        const notesData = await callApi('load_client_notes', { client_id: parseInt(clientId) })
        setClientNotes(notesData.notes || [])
      } else {
        // Members only ever see notes the team explicitly shared.
        const sharedData = await callApi('client_notes_load_shared', { client_id: parseInt(clientId) })
        setClientNotes(sharedData.notes || [])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function reloadContacts() {
    try {
      const data = await callApi('msm_load_client_home', { client_id: parseInt(clientId) })
      setContacts(data.contacts || [])
    } catch (err) { console.error(err) }
  }

  // Which tabs are valid for the resolved program (mirror the render conditions).
  function validTabsForProgram(prog) {
    if (isPlanner) {
      // Planner: Profile + Vault always; Tax Priorities for Holistic + Tax
      // Planning; no track tab for any other program (e.g. PFT).
      const base = ['home', 'vault']
      if (prog?.name === 'Partnership Fast Track') return base
      return [...base, 'tax']
    }
    const profile = isMember ? ['home', 'vault'] : ['home', 'details', 'vault', 'payments', 'settings', ...(session?.is_superadmin ? ['continuation'] : [])]
    if (prog?.name === 'Partnership Fast Track') return [...profile, 'pft']
    if (prog?.name === 'VFO Tax Planning') return [...profile, 'tax']
    return [...profile, 'map1', 'regular', 'tax', 'pip']
  }

  // Keep ?program= and ?tab= in the URL so a browser reload (which loses
  // location.state) resolves the same program + tab instead of defaulting to
  // Holistic. Written via history.replaceState so react-router never observes
  // it — the data-load effect keys off [clientId] only, so this cannot re-fire
  // it or push history entries. Also self-corrects a stale ?tab= carried over
  // from a different program.
  useEffect(() => {
    if (!program?.id) return
    if (activeTab !== 'home' && !validTabsForProgram(program).includes(activeTab)) {
      setActiveTab('home')
      return
    }
    const params = new URLSearchParams(window.location.search)
    params.set('program', String(program.id))
    params.set('tab', activeTab)
    window.history.replaceState(null, '', window.location.pathname + '?' + params.toString())
  }, [program?.id, activeTab])

  // 'ciq' is a navigation action, not a tab: it hands off to the member's CIQ
  // feature in AdminPortal with this client pre-selected.
  function handleTabSelect(key) {
    if (key === 'ciq') {
      if (!client?.member_number) return
      navigate(`/admin?member=${encodeURIComponent(client.member_number)}&feature=ciq&ciqclient=${client.id || clientId}&_n=${Date.now()}`)
      return
    }
    setActiveTab(key)
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const tabStyle = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })
  const statusColors2 = { active: '#1b9254', pending: '#e06717', lost: '#e74c3c' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={() => {
          if (isPlanner) {
            sessionStorage.removeItem('taxPlannerActiveTab')
            navigate('/tax-planner')
          } else if (isMember) {
            sessionStorage.setItem('memberActiveTab', 'profile')
            navigate('/member')
          } else {
            sessionStorage.removeItem('adminActiveTab')
            sessionStorage.removeItem('adminOpenView')
            navigate('/admin')
          }
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Mirror the AdminPortal header for admin sessions so the top bar
              stays identical on the client-detail route (bell + Settings /
              Admin Editor deep-link back into the portal). Members keep the
              slim name + Sign Out variant. */}
          {!isMember && <NotificationBell />}
          <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.name || ''}</span>
          {isAdmin && session?.is_superadmin && (
            <button onClick={() => { sessionStorage.setItem('adminOpenView', 'editor'); navigate('/admin') }}
              style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,205,150,0.5)', background: 'transparent', color: '#ffd9a0', fontWeight: 500, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Admin Editor
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { sessionStorage.setItem('adminOpenView', 'settings'); navigate('/admin') }}
              style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Settings
            </button>
          )}
          {isPlanner && (
            <button onClick={() => { sessionStorage.setItem('taxPlannerActiveTab', 'settings'); navigate('/tax-planner') }}
              style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Settings
            </button>
          )}
          <button onClick={() => { sessionStorage.clear(); navigate(isMember ? '/member/login' : isPlanner ? '/tax-planner/login' : '/admin/login') }} style={{ padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>{backLabel}</button>

        {/* Client header */}
        {loading ? (
          <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--vfo-border)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <Skeleton width={260} height={32} />
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Skeleton width={90} height={14} />
              <Skeleton width={130} height={14} />
              <Skeleton width={70} height={20} style={{ borderRadius: '4px' }} />
            </div>
          </div>
        ) : (
          <TrackHero
            eyebrow="Clients"
            title={`${client?.first_name} ${client?.last_name}`}
            avatar={<HeroAvatar src={null} name={`${client?.first_name || ''} ${client?.last_name || ''}`} />}
            meta={
              <>
                <span style={{ fontFamily: 'monospace' }}>{client?.client_ref}</span>
                {program && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ color: '#0095ff', fontWeight: 500 }}>{program.name}</span></>}
                {client?.member_name && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>Member: <MemberNameLink memberNumber={client.member_number}>{client.member_name}</MemberNameLink></span></>}
                {contacts?.length > 0 && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ fontStyle: 'italic' }}>with {contacts.map(c => `${c.first_name} ${c.last_name}`).join(', ')}</span></>}
                {client?.status && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors2[client?.status] || 'var(--vfo-faint)', flexShrink: 0 }} />{client.status.charAt(0).toUpperCase() + client.status.slice(1)}</span></>}
              </>
            }
          />
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px', gap: '8px', paddingBottom: '10px' }}>
          {loading ? (
            <>
              <Skeleton width={70} height={20} />
              <Skeleton width={80} height={20} />
              <Skeleton width={110} height={20} />
            </>
          ) : (
            isPlanner ? (
              <>
                <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Profile</button>
                <button style={tabStyle(activeTab === 'vault')} onClick={() => setActiveTab('vault')}>Vault</button>
                {program && program.name !== 'Partnership Fast Track' && (
                  <button style={tabStyle(activeTab === 'tax')} onClick={() => setActiveTab('tax')}>Tax Priorities</button>
                )}
              </>
            ) : (
            <>
              {isMember
                ? <>
                    <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Profile</button>
                    <button style={tabStyle(activeTab === 'vault')} onClick={() => setActiveTab('vault')}>Vault</button>
                  </>
                : <ClientTabDropdown label="Profile" isActive={activeTab === 'home' || activeTab === 'details' || activeTab === 'vault' || activeTab === 'payments' || activeTab === 'settings' || activeTab === 'continuation'} options={[{key:'home',label:'Profile'},{key:'details',label:'Edit Profile'},{key:'vault',label:'Vault'},...(client?.member_number ? [{key:'ciq',label:'CIQ'}] : []),{key:'payments',label:'Payments'},{key:'settings',label:'Settings'},...(session?.is_superadmin ? [{key:'continuation',label:'Payment Continuation'}] : [])]} onSelect={handleTabSelect} />
              }
              {program?.name === 'Partnership Fast Track' ? (
                <button style={tabStyle(activeTab === 'pft')} onClick={() => setActiveTab('pft')}>PFT Engagement Process</button>
              ) : program?.name === 'VFO Tax Planning' ? (
                <button style={tabStyle(activeTab === 'tax')} onClick={() => setActiveTab('tax')}>Tax Priorities</button>
              ) : (
                <>
                  <button style={tabStyle(activeTab === 'map1')} onClick={() => setActiveTab('map1')}>MAP 1</button>
                  <button style={tabStyle(activeTab === 'regular')} onClick={() => setActiveTab('regular')}>Regular Priorities</button>
                  <button style={tabStyle(activeTab === 'tax')} onClick={() => setActiveTab('tax')}>Tax Priorities</button>
                  <button style={tabStyle(activeTab === 'pip')} onClick={() => setActiveTab('pip')}>PIP Meetings</button>
                </>
              )}
            </>
            )
          )}
        </div>

        {loading ? (
          <ProfileTabSkeleton sections={isMember ? 3 : 4} />
        ) : (
          <>
            {activeTab === 'home' && <ClientHome client={client} contacts={contacts} onUpdate={() => loadData(true)} onReloadContacts={reloadContacts} sectionStyle={sectionStyle} readOnly={isMember || isPlanner} plannerMode={isPlanner} notes={clientNotes} onNotesChange={setClientNotes} program={program} />}
            {activeTab === 'details' && isAdmin && <ClientDetails client={client} onUpdate={loadData} sectionStyle={sectionStyle} />}
            {pfLocked && PROGRAM_TABS.includes(activeTab) && (
              <div style={{ ...sectionStyle, borderColor: 'rgba(231,76,60,0.3)', textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '15px', color: 'var(--vfo-muted)' }}>Please Select a PF</div>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '8px' }}>Assign a PF on the Profile tab before working this client's tracks.</div>
              </div>
            )}
            {activeTab === 'map1' && program && !pfLocked && !isPlanner && <ClientTrackViewV2 clientId={parseInt(clientId)} programId={program.id} client={client} readOnly={isMember} notes={clientNotes} onNotesChange={setClientNotes} />}
            {activeTab === 'pft' && program && !pfLocked && !isPlanner && <PFTEngagementTrack clientId={parseInt(clientId)} programId={program.id} client={client} readOnly={isMember} notes={clientNotes} onNotesChange={setClientNotes} />}
            {activeTab === 'regular' && program && !pfLocked && !isPlanner && <RegularPrioritiesTab clientId={parseInt(clientId)} programId={program.id} client={client} specialists={specialists} readOnly={isMember} notes={clientNotes} onNotesChange={setClientNotes} initialTrackId={initialTrackId} />}
            {activeTab === 'tax' && program && !pfLocked && <TaxPrioritiesTab clientId={parseInt(clientId)} programId={program.id} programName={program.name} client={client} specialists={specialists} ecosystems={ecosystems} readOnly={isMember} plannerMode={isPlanner} notes={clientNotes} onNotesChange={setClientNotes} initialPlanId={initialPlanId} />}
            {activeTab === 'pip' && program && !pfLocked && !isPlanner && <PipMeetingsTab clientId={parseInt(clientId)} programId={program.id} client={client} readOnly={isMember} notes={clientNotes} onNotesChange={setClientNotes} />}
            {/* memberMode is its own flag, not a relaxed readOnly: a member gets
                view on all three sections + add on the two client-owned ones,
                and never share / delete / request-docs / drag-to-move. */}
            {activeTab === 'vault' && (isAdmin || isPlanner || isMember) && <ClientVaultTab clientId={parseInt(clientId)} sectionStyle={sectionStyle} specialists={specialists} readOnly={isPlanner} allowUpload={isPlanner} memberMode={isMember} recipientName={`${client?.first_name || ''} ${client?.last_name || ''}`.trim() || undefined} recipientFirst={client?.first_name || undefined} />}
            {activeTab === 'payments' && isAdmin && <ClientPaymentsTab clientId={parseInt(clientId)} sectionStyle={sectionStyle} />}
            {activeTab === 'settings' && isAdmin && (
              <div style={sectionStyle}>
                <div style={cardTitle}>Client Login</div>
                <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>Send a setup email so this client can create their own portal passcode.</p>
                <SendSetupEmailButton loginType="client" subjectId={parseInt(clientId)} hint="Drafts a Gmail with a secure link. The client sets their own passcode." />
              </div>
            )}
            {activeTab === 'continuation' && isAdmin && session?.is_superadmin && (
              <PaymentContinuationTab clientId={parseInt(clientId)} client={client} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ClientHome({ client, contacts = [], onUpdate, onReloadContacts, sectionStyle, readOnly = false, plannerMode = false, notes = [], onNotesChange, program }) {
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [status, setStatus] = useState(client?.status || 'pending')
  const [saving, setSaving] = useState(false)
  const [assignedPf, setAssignedPf] = useState(client?.assigned_pf || '')
  const [savingPf, setSavingPf] = useState(false)
  const [pfSaved, setPfSaved] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)

  async function updateNote(noteId, visibility) {
    if (!editNoteText.trim()) return
    try {
      const result = await callApi('update_client_note', { note_id: noteId, note_text: editNoteText.trim(), visibility })
      onNotesChange(notes.map(n => n.id === noteId ? result.note : n))
      setEditingNoteId(null)
    } catch (err) { console.error(err) }
  }

  async function deleteNote(noteId) {
    try {
      await callApi('delete_client_note', { note_id: noteId })
      onNotesChange(notes.filter(n => n.id !== noteId))
    } catch (err) { console.error(err) }
  }

  async function savePf() {
    setSavingPf(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: client.status, first_name: client.first_name, last_name: client.last_name, email: client.email, phone: client.phone, assigned_pf: assignedPf })
      setPfSaved(true)
      setTimeout(() => setPfSaved(false), 3000)
      onUpdate()
    } catch (err) { console.error(err) }
    finally { setSavingPf(false) }
  }
  const statusColors = { active: '#1b9254', pending: '#e06717', lost: '#e74c3c' }

  async function updateStatus(newStatus) {
    setStatus(newStatus)
    setSaving(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: newStatus, first_name: client.first_name, last_name: client.last_name, email: client.email, phone: client.phone })
      setStatusSaved(true)
      setTimeout(() => setStatusSaved(false), 3000)
      onUpdate()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px', wordBreak: 'break-word' }
  const initials = (first, last) => `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase()

  return (
    <div>
      {/* Contact info — full width across the top. */}
      <div style={sectionStyle}>
        <div style={cardTitle}>Contact Info</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
          <div><div style={fieldLabel}>Email</div><div style={fieldValue}>{client?.email || '—'}</div></div>
          <div><div style={fieldLabel}>Phone</div><div style={fieldValue}>{client?.phone || '—'}</div></div>
        </div>
        {readOnly && contacts?.length > 0 && <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-tint)' }}>
          <div style={{ ...fieldLabel, marginBottom: '10px' }}>Additional Contacts</div>
          {contacts.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: i < contacts.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{initials(c.first_name, c.last_name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{c.first_name} {c.last_name}</span>
                  {c.cc_on_emails && <span style={ccBadgeStyle}>Cc'd on client emails</span>}
                  {c.use_in_greeting && <span style={ccBadgeStyle}>Included in greeting</span>}
                </div>
                {c.email && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '1px' }}>{c.email}</div>}
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* Status + assigned PF — side by side. */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
          <div style={sectionStyle}>
            <div style={cardTitle}>Client Status</div>
            {readOnly
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColors[status], flexShrink: 0 }} />{status.charAt(0).toUpperCase() + status.slice(1)}</span>
              : <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColors[status], flexShrink: 0 }} />
                  <select value={status} onChange={e => updateStatus(e.target.value)} disabled={saving} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif', minWidth: '160px', flex: 1 }}>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="lost">Lost</option>
                  </select>
                  {statusSaved && <span style={{ color: '#1b9254', fontSize: '14px', fontWeight: '600' }}>Saved!</span>}
                </div>
            }
          </div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
          <div style={sectionStyle}>
            <div style={cardTitle}>Assigned PF</div>
            {readOnly
              ? <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{client?.assigned_pf || '—'}</div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <select value={assignedPf} onChange={e => setAssignedPf(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif', minWidth: '160px', flex: 1 }}>
                    <option value="">-- Select --</option>
                    <option value="Evan Anderson">Evan Anderson</option>
                    <option value="Bridger Silvester">Bridger Silvester</option>
                    <option value="Ian Welham">Ian Welham</option>
                    <option value="Jake Latham">Jake Latham</option>
                  </select>
                  <button onClick={savePf} disabled={savingPf} style={{ padding: '8px 20px', borderRadius: '8px', background: savingPf ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '14px', cursor: savingPf ? 'not-allowed' : 'pointer' }}>{savingPf ? 'Saving...' : 'Save'}</button>
                  {pfSaved && <span style={{ color: '#1b9254', fontSize: '14px', fontWeight: '600' }}>Saved!</span>}
                </div>
            }
          </div>
        </div>
      </div>

      {/* Admins manage Additional Contacts right here on the Profile tab;
          members/planners get the read-only list in Contact Info instead. */}
      {!readOnly && <ClientAdditionalContacts client={client} contacts={contacts} onReloadContacts={onReloadContacts} sectionStyle={sectionStyle} isAdmin />}

      {/* Notes — full width so long threads use the whole row. */}
      {!readOnly && (
        <div style={sectionStyle}>
          <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>All Notes</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{notes.length}</span>
            </div>
            <AddGeneralNote clientId={client.id} notes={notes} onNotesChange={onNotesChange} programName={program?.name || null} />
          </div>
          {notes.map(note => (
            <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
              {editingNoteId === note.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea value={editNoteText} onChange={e => setEditNoteText(e.target.value)} rows={2} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                    <SaveVisibilityButtons onSave={(v) => updateNote(note.id, v)} disabled={!editNoteText.trim()} size="sm" hint={false} />
                    <button onClick={() => setEditingNoteId(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                    <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                    <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                    <VisibilityBadge visibility={note.visibility} />
                    {note.program_name && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.2)' }}>{note.program_name}</span>}
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.tab_name}</span>
                    {note.phase_name !== 'General' && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{note.phase_name}</span>}
                    <button onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.note_text) }} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => deleteNote(note.id)} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Planner view — the FULL All Notes list (internal + shared), read-only:
          same rows as the admin block but with no composer / edit / delete. */}
      {readOnly && plannerMode && (
        <div style={sectionStyle}>
          <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>All Notes</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{notes.length}</span>
            </div>
          </div>
          {notes.length === 0 && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>No notes yet.</div>}
          {notes.map(note => (
            <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                <VisibilityBadge visibility={note.visibility} />
                {note.program_name && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.2)' }}>{note.program_name}</span>}
                {note.tab_name && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.tab_name}</span>}
                {note.phase_name !== 'General' && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{note.phase_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Member view — read-only list of notes the team chose to share. */}
      {readOnly && !plannerMode && notes.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ ...cardTitle, marginBottom: '4px' }}>Notes from your team</div>
          {notes.map(note => (
            <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                {note.program_name && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.2)' }}>{note.program_name}</span>}
                {note.tab_name && note.phase_name !== 'General' && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.2)' }}>{note.phase_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ClientDetails({ client, onUpdate, sectionStyle }) {
  const [firstName, setFirstName] = useState(client?.first_name || '')
  const [lastName, setLastName] = useState(client?.last_name || '')
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }

  async function save() {
    setSaving(true)
    try {
      await callApi('msm_update_client', { client_id: client.id, status: client.status, first_name: firstName, last_name: lastName, email, phone })
      setStatus('saved')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatus('error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={cardTitle}>Primary Contact</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', background: saving ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
          {status === 'saved' && <span style={{ color: '#1b9254', fontSize: '14px', fontWeight: '600' }}>✓ Changes saved</span>}
          {status === 'error' && <span style={{ color: '#e74c3c', fontWeight: 500, fontSize: '14px' }}>Something went wrong</span>}
        </div>
      </div>

    </div>
  )
}

// Additional Contacts card — lives on the client Profile (home) tab for admins
// (moved off Edit Profile 2026-09-16 so it is always visible, empty or not).
// Members and planners see the read-only list inside ClientHome's Contact Info
// card instead; this component is admin-only.
function ClientAdditionalContacts({ client, contacts = [], onReloadContacts, sectionStyle, isAdmin = false }) {
  const [contactStatus, setContactStatus] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  // Inline edit of one existing contact (name + email) and the per-row error
  // line that surfaces both the local no-email block and any backend 400.
  const [editId, setEditId] = useState(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [rowError, setRowError] = useState({})
  const [busyId, setBusyId] = useState(null)
  // Cc / greeting are staged locally: a row only appears here once its ticks
  // differ from what's stored, and the entry is dropped again the moment they
  // match (either by re-clicking back, or by a successful save).
  const [stagedToggles, setStagedToggles] = useState({})
  const [rowSaved, setRowSaved] = useState({})

  const contactEmailValid = CONTACT_EMAIL_RE.test(contactEmail.trim())
  const canAddContact = !!contactFirst.trim() && !!contactLast.trim() && contactEmailValid

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }

  async function addContact() {
    if (!canAddContact) return
    try {
      await callApi('msm_add_client_contact', { client_id: client.id, first_name: contactFirst.trim(), last_name: contactLast.trim(), email: contactEmail.trim() })
      setContactFirst(''); setContactLast(''); setContactEmail(''); setShowAddContact(false)
      setContactStatus('saved')
      setTimeout(() => setContactStatus(''), 4000)
      onReloadContacts()
    } catch (err) { console.error(err) }
  }

  async function deleteContact(contactId) {
    try { await callApi('msm_delete_client_contact', { contact_id: contactId }); onReloadContacts() }
    catch (err) { console.error(err) }
  }

  function startEdit(c) {
    setEditId(c.id)
    setEditFirst(c.first_name || ''); setEditLast(c.last_name || ''); setEditEmail(c.email || '')
    setRowError(prev => ({ ...prev, [c.id]: '' }))
  }

  function setError(contactId, msg) { setRowError(prev => ({ ...prev, [contactId]: msg })) }

  // One call per change; the backend re-checks every invariant on the final
  // state, so anything it rejects lands in this row's error line.
  async function saveContact(contactId, patch) {
    setBusyId(contactId)
    try {
      await callApi('msm_update_client_contact', { contact_id: contactId, ...patch })
      setError(contactId, '')
      onReloadContacts()
      return true
    } catch (err) {
      setError(contactId, err?.message || 'Something went wrong')
      return false
    } finally { setBusyId(null) }
  }

  async function saveEdit(contactId) {
    const next = editEmail.trim()
    if (!editFirst.trim() || !editLast.trim()) { setError(contactId, 'First and last name are required.'); return }
    if (next && !CONTACT_EMAIL_RE.test(next)) { setError(contactId, 'Enter a valid email address.'); return }
    const ok = await saveContact(contactId, { first_name: editFirst.trim(), last_name: editLast.trim(), email: next })
    if (ok) setEditId(null)
  }

  // What the ticks should show: the staged edit if there is one, else what's stored.
  function toggleState(c) {
    return stagedToggles[c.id] || { cc_on_emails: !!c.cc_on_emails, use_in_greeting: !!c.use_in_greeting }
  }

  function stageToggles(c, next) {
    setError(c.id, '')
    setRowSaved(prev => (prev[c.id] ? { ...prev, [c.id]: false } : prev))
    setStagedToggles(prev => {
      const copy = { ...prev }
      if (next.cc_on_emails === !!c.cc_on_emails && next.use_in_greeting === !!c.use_in_greeting) delete copy[c.id]
      else copy[c.id] = next
      return copy
    })
  }

  // Cc needs an email on file. Existing rows predate that rule, so the toggle
  // stays clickable and explains itself rather than sitting silently disabled.
  function toggleCc(c) {
    const cur = toggleState(c)
    if (!cur.cc_on_emails && !String(c.email || '').trim()) {
      setError(c.id, 'This contact has no email address on file — add one to enable Cc.')
      return
    }
    // Turning Cc off drops the greeting with it — the greeting is meaningless
    // for a contact who isn't on the email.
    stageToggles(c, cur.cc_on_emails ? { cc_on_emails: false, use_in_greeting: false } : { ...cur, cc_on_emails: true })
  }

  function toggleGreeting(c) {
    const cur = toggleState(c)
    if (!cur.cc_on_emails) return
    stageToggles(c, { ...cur, use_in_greeting: !cur.use_in_greeting })
  }

  // One call carries both flags. On failure the staged state is left alone so
  // the row keeps its Save button and the user can fix and retry.
  async function saveToggles(c) {
    const next = stagedToggles[c.id]
    if (!next) return
    const ok = await saveContact(c.id, { cc_on_emails: next.cc_on_emails, use_in_greeting: next.use_in_greeting })
    if (!ok) return
    setStagedToggles(prev => { const copy = { ...prev }; delete copy[c.id]; return copy })
    setRowSaved(prev => ({ ...prev, [c.id]: true }))
    setTimeout(() => setRowSaved(prev => ({ ...prev, [c.id]: false })), 4000)
  }

  return (
      <div style={sectionStyle}>
        <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Additional Contacts</span>
          <button onClick={() => setShowAddContact(!showAddContact)} style={{ padding: '6px 14px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>+ Add</button>
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
          People on this client's side. With <strong>Cc on all client emails</strong> switched on, a contact is Cc'd on every portal email addressed to this client; <strong>Include in the greeting</strong> also names them in the salutation.
        </div>

        {showAddContact && (
          <div style={{ padding: '16px', background: 'var(--vfo-tint)', borderRadius: '8px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={contactFirst} onChange={e => setContactFirst(e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={contactLast} onChange={e => setContactLast(e.target.value)} style={inputStyle} /></div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={labelStyle}>Email *</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" style={inputStyle} />
                {!!contactEmail.trim() && !contactEmailValid && <div style={{ ...labelStyle, marginTop: '6px', marginBottom: 0 }}>Enter a valid email address.</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addContact} disabled={!canAddContact} style={{ padding: '8px 20px', borderRadius: '8px', background: canAddContact ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : 'var(--vfo-tint)', border: canAddContact ? 'none' : '1px solid var(--vfo-border-mid)', boxShadow: canAddContact ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: canAddContact ? '#fff' : 'var(--vfo-muted)', fontSize: '13px', cursor: canAddContact ? 'pointer' : 'not-allowed' }}>Save</button>
              <button onClick={() => setShowAddContact(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {contactStatus === 'saved' && <div style={{ color: '#1b9254', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>✓ Contact added</div>}
        {contacts.length === 0 && !showAddContact && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No additional contacts yet.</p>}
        {contacts.map(c => (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            {editId === c.id ? (
              <div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={editFirst} onChange={e => setEditFirst(e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={editLast} onChange={e => setEditLast(e.target.value)} style={inputStyle} /></div>
                  <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email</label><input value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" style={inputStyle} /></div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => saveEdit(c.id)} disabled={busyId === c.id} style={{ padding: '6px 16px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '12px', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>{busyId === c.id ? 'Saving...' : 'Save'}</button>
                  <button onClick={() => { setEditId(null); setError(c.id, '') }} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '160px' }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{c.first_name} {c.last_name}</div>
                  {c.email
                    ? <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{c.email}</div>
                    : <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '2px', fontStyle: 'italic' }}>No email on file</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {isAdmin && (() => {
                    const t = toggleState(c)
                    const dirty = !!stagedToggles[c.id]
                    return (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--vfo-muted)', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>
                          <input type="checkbox" checked={t.cc_on_emails} disabled={busyId === c.id}
                            onChange={() => toggleCc(c)} style={{ accentColor: '#125ecc', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }} />
                          Cc on all client emails
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: t.cc_on_emails ? 'var(--vfo-muted)' : 'var(--vfo-faint)', cursor: t.cc_on_emails && busyId !== c.id ? 'pointer' : 'not-allowed' }}>
                          <input type="checkbox" checked={t.use_in_greeting} disabled={!t.cc_on_emails || busyId === c.id}
                            onChange={() => toggleGreeting(c)} style={{ accentColor: '#125ecc', cursor: t.cc_on_emails && busyId !== c.id ? 'pointer' : 'not-allowed' }} />
                          Include in the greeting
                        </label>
                        {dirty && <button onClick={() => saveToggles(c)} disabled={busyId === c.id} style={{ padding: '6px 16px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '12px', cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}>{busyId === c.id ? 'Saving...' : 'Save'}</button>}
                        {!dirty && rowSaved[c.id] && <span style={{ color: '#1b9254', fontWeight: 600, fontSize: '12px' }}>Saved</span>}
                      </>
                    )
                  })()}
                  <button onClick={() => startEdit(c)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => deleteContact(c.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
            )}
            {rowError[c.id] && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '12px', marginTop: '6px' }}>{rowError[c.id]}</div>}
          </div>
        ))}
      </div>
  )
}
