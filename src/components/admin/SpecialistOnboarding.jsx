import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { callApi, getSession } from '../../lib/api'
import { SpecialistOnboardingListSkeleton, SpecialistOnboardingDetailSkeleton } from '../shared/Skeleton'
import { TrackHero, PhaseBadge, ListHeader } from '../shared/TrackKit'
import StepEmailsChip from '../shared/StepEmailsChip'
import { formatDate } from '../../lib/dates'
 
const STAGE_NAMES = ['', 'Preliminary Meeting', 'Detail Meetings', 'Due Diligence', 'Contract & Details', 'Going Live']

// Stage 2 "Initial executive approval" voters. Voting is account-scoped: only the
// matching logged-in exec can cast their vote, and a vote stays private until both
// have voted that round.
const EXECS = ['Anton Anderson', 'Paul Latham']
const EXEC_BY_EMAIL = {
  'aanderson@elitert.com': 'Anton Anderson',
  'platham@elitert.com': 'Paul Latham',
}
 
const STAGE2_CHECKLIST = [
  'Review SIF',
  'Discuss revenue share (detail)',
  'Any queries on contract?',
  'Technology capacity / ability to scale',
  'Tour of VFO Showroom',
  'Tour of VFO Skool',
  'Discuss background check options',
  'Explain benefits of MAX',
  'Explain VFO monthly license',
]
 
const SIF_FIELDS = [
  ['full_name', 'Full Name'],
  ['company_name', 'Company Name'],
  ['address', 'Address'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['website_url', 'Website URL'],
  ['time_zone', 'Time Zone'],
  ['strategy_expertise', 'Strategy / Expertise'],
  ['cutoff_date', 'Cut-off Date for Strategy'],
  ['client_requirements', 'Client Requirements'],
  ['investment_cost', 'Amount of Investment or Cost'],
  ['ideal_client', 'Ideal Client Description'],
  ['benefits_summary', 'Summary of Benefits'],
  ['getting_started', 'Getting Started with a Client'],
  ['process_steps', 'Steps of Professional Process'],
  ['competitive_advantage', 'What Makes You Better than the Competition'],
]

// Tax-specialist-only SIF answers — shown in the read-back only when is_tax_specialist === 'Yes'.
const SIF_TAX_FIELDS = [
  ['tax_general_risks', 'What are the general risks of this strategy?'],
  ['tax_risk_history', 'What has been the history of these risks coming to fruition?'],
  ['tax_worst_case', 'What are potential worst-case scenarios?'],
  ['tax_precautions', 'What precautions are in place to prevent or minimize the risks?'],
]

// Plain DATE strings are split, never fed to new Date() — that reads them as UTC
// midnight and renders the previous day west of Greenwich. timestamptz is local.
const fmtMMDD = (v) => {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return `${p[1]}/${p[2]}` }
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const TZ_CODES = ['ET', 'CT', 'MT', 'PT', 'AKT', 'HT']
// Meeting slots are only ever stored as a space-joined "YYYY-MM-DD HH:MM TZ"
// string (Stage 1: the decision progress notes; Stage 2: "Next meeting: <slot>"
// in the meeting row's notes), so a reschedule has to read them back token by
// token. Best effort — a missing piece just leaves its input blank.
function parseSlotNotes(notes) {
  const parts = String(notes || '').trim().split(/\s+/).filter(Boolean)
  return {
    date: parts.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) || '',
    time: parts.find(x => /^\d{2}:\d{2}$/.test(x)) || '',
    tz: parts.find(x => TZ_CODES.includes(x)) || 'ET',
  }
}

function slotString(date, time, tz) {
  return [date, time, time && tz ? tz : null].filter(Boolean).join(' ')
}

export default function SpecialistOnboarding() {
  const [view, setView] = useState('list')
  const [onboardings, setOnboardings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showStopped, setShowStopped] = useState(false)
  const session = getSession()
  const [searchParams] = useSearchParams()

  // Deep-link from a notification: ?onboarding=<id> opens that specialist's detail.
  useEffect(() => {
    const oid = searchParams.get('onboarding')
    if (oid) { setSelectedId(Number(oid)); setView('detail') }
  }, [searchParams])

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
 
  useEffect(() => { loadList() }, [])
 
  async function loadList() {
    setLoading(true)
    try {
      const data = await callApi('load_onboardings')
      setOnboardings(data.onboardings || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
 
  const newEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())

  async function createNew() {
    if (!newName.trim() || !newEmailValid) return
    setCreating(true)
    try {
      await callApi('create_onboarding', { specialist_name: newName.trim(), specialist_email: newEmail.trim(), created_by: session?.name || 'Admin' })
      setNewName('')
      setNewEmail('')
      setShowNew(false)
      await loadList()
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
  }
 
  if (view === 'detail' && selectedId) {
    return <OnboardingDetail id={selectedId} onBack={() => { setView('list'); setSelectedId(null); loadList() }} />
  }
 
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <ListHeader
        title="Specialist Onboarding"
        count={onboardings.length}
        action={<button onClick={() => setShowNew(!showNew)} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ New Onboarding</button>}
      />
 
      {showNew && (
        <div style={{ ...sectionStyle, marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Start New Onboarding</div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Specialist Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Work Email *</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email address" style={inputStyle} />
            </div>
          </div>
          {newEmail.trim() && !newEmailValid && <div style={{ fontSize: '12px', color: '#e06717', marginBottom: '10px' }}>Please enter a valid email address.</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createNew} disabled={creating || !newName.trim() || !newEmailValid} style={{ padding: '8px 20px', borderRadius: '8px', background: (creating || !newName.trim() || !newEmailValid) ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '13px', cursor: (creating || !newName.trim() || !newEmailValid) ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setShowNew(false); setNewName(''); setNewEmail('') }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Cancel</button>
          </div>
        </div>
      )}
 
      {loading ? (
        <SpecialistOnboardingListSkeleton />
      ) : onboardings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--vfo-muted)' }}>No onboarding records yet. Click "+ New Onboarding" to start.</div>
      ) : (() => {
        // Same three-bucket shape as the advisor / accountant lists: in-progress
        // rows stay loose at the top, done and stopped collapse away.
        const inProgress = onboardings.filter(o => o.status !== 'completed' && o.status !== 'stopped')
        const completed = onboardings.filter(o => o.status === 'completed')
        const stopped = onboardings.filter(o => o.status === 'stopped')

        const renderRow = ob => {
          const isStopped = ob.status === 'stopped'
          const isDone = ob.status === 'completed'
          const stageColor = isStopped ? '#e74c3c' : isDone ? '#1b9254' : '#0095ff'
          return (
            <div key={ob.id} onClick={() => { setSelectedId(ob.id); setView('detail') }} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px', marginBottom: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,149,255,0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vfo-border)'}>
              <div>
                <div style={{ fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: '500', marginBottom: '4px' }}>{ob.specialist_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{ob.specialist_email || 'No email'} · Started {formatDate(ob.created_at)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: isStopped ? 'rgba(231,76,60,0.15)' : isDone ? 'rgba(27,146,84,0.15)' : 'rgba(0,149,255,0.15)', color: stageColor, border: `1px solid ${isStopped ? 'rgba(231,76,60,0.3)' : isDone ? 'rgba(27,146,84,0.3)' : 'rgba(0,149,255,0.3)'}` }}>
                  {isStopped ? 'Stopped' : isDone ? 'Completed' : `Stage ${ob.current_stage} · ${STAGE_NAMES[ob.current_stage]}`}
                </span>
              </div>
            </div>
          )
        }

        const SectionHeader = ({ title, count, open, onToggle, color }) => (
          <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', marginTop: '20px', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
              <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>({count})</span>
            </div>
          </div>
        )

        return (
          <div>
            {inProgress.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vfo-muted)', fontSize: '13px' }}>No active onboardings in progress.</div>
            )}
            {inProgress.map(renderRow)}

            {completed.length > 0 && (
              <>
                <SectionHeader title="Completed" count={completed.length} open={showCompleted} onToggle={() => setShowCompleted(v => !v)} color="#1b9254" />
                {showCompleted && completed.map(renderRow)}
              </>
            )}

            {stopped.length > 0 && (
              <>
                <SectionHeader title="Stopped" count={stopped.length} open={showStopped} onToggle={() => setShowStopped(v => !v)} color="#e74c3c" />
                {showStopped && stopped.map(renderRow)}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
 
function OnboardingDetail({ id, onBack }) {
  const [ob, setOb] = useState(null)
  const [progress, setProgress] = useState({})
  const [meetings, setMeetings] = useState([])
  const [votes, setVotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [fqPending, setFqPending] = useState(null)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [expanded, setExpanded] = useState({})
  const session = getSession()
  const navigate = useNavigate()

  useEffect(() => { loadDetail() }, [id])
 
  async function loadDetail() {
    setLoading(true)
    try {
      const data = await callApi('load_onboarding', { onboarding_id: id })
      setOb(data.onboarding)
      const prog = {}
      ;(data.progress || []).forEach(p => { prog[`${p.stage}-${p.task_key}`] = p })
      setProgress(prog)
      setMeetings(data.meetings || [])
      const v = {}
      ;(data.votes || []).forEach(vote => { v[`${vote.stage}-${vote.voter_name}-${vote.vote_round || 1}`] = vote })
      setVotes(v)
      if (data.onboarding) {
        const o = data.onboarding
        const stageComplete = (s) => o.status === 'completed' ? true : o.current_stage > s
        setExpanded({ 1: !stageComplete(1), 2: !stageComplete(2), 3: !stageComplete(3), 4: !stageComplete(4), 5: !stageComplete(5) })
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
 
  async function saveProgress(stage, taskKey, status, notes) {
    const key = `${stage}-${taskKey}`
    setSaving(p => ({ ...p, [key]: true }))
    try {
      const result = await callApi('save_onboarding_progress', { onboarding_id: id, stage, task_key: taskKey, status: status || 'completed', completed_by: session?.name || 'Admin', notes })
      setProgress(p => ({ ...p, [key]: result.progress }))
      // Saving reviewer notes clears the matching bell notification server-side —
      // ping the bell so it disappears immediately instead of on the next poll.
      if (taskKey === 'tracy_general_notes' || taskKey === 'tim_tax_risk_notes' || taskKey === 'ddc_help_resolved') {
        window.dispatchEvent(new Event('vfo:notifications-changed'))
      }
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [key]: false })) }
  }
 
  // reschedule = the same email re-sent with a new meeting slot after the first
  // send; the flag tells the backend not to re-arm the SIF reminder ladder.
  async function sendPrelimEmail(decision, date, time, tz, reschedule = false) {
    try {
      await callApi('automation_SPECIALIST_prelimemail', { onboarding_id: id, decision, meeting_date: date || null, meeting_time: time || null, meeting_tz: tz || null, reschedule: !!reschedule })
    } catch (err) { console.error(err) }
  }

  async function saveVote(stage, voterName, vote) {
    const key = `${stage}-${voterName}`
    setSaving(p => ({ ...p, [key]: true }))
    try {
      const result = await callApi('save_onboarding_vote', { onboarding_id: id, stage, voter_name: voterName, vote })
      setVotes(v => ({ ...v, [key]: result.vote }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [key]: false })) }
  }
 
  async function updateOnboarding(updates) {
    try {
      const result = await callApi('update_onboarding', { onboarding_id: id, ...updates })
      setOb(result.onboarding)
    } catch (err) { console.error(err) }
  }
 
  async function advanceStage() {
    if (!ob || ob.current_stage >= 5) return
    await updateOnboarding({ current_stage: ob.current_stage + 1 })
  }
 
  async function stopOnboarding() {
    await updateOnboarding({ status: 'stopped' })
  }

  // Header toggle. Lives OUTSIDE every isStopped-disabled region on purpose —
  // it is the only control that can bring a stopped onboarding back.
  async function toggleStatus() {
    const newStatus = ob?.status === 'stopped' ? 'active' : 'stopped'
    setTogglingStatus(true)
    try {
      await updateOnboarding({ status: newStatus })
    } finally { setTogglingStatus(false) }
  }
 
  async function completeOnboarding() {
    await updateOnboarding({ status: 'completed' })
  }

  // Create the specialist's Showroom directory record from their SIF (+ Core/Max),
  // copy their DD-checklist files into their vault, and send the login-setup email.
  // Does NOT complete the onboarding — that happens once the headshot + bios
  // checkboxes are ticked. Specialists are NOT members; this writes experts +
  // specialist_logins only.
  async function createSpecialistAndShowroom() {
    setSaving(p => ({ ...p, ['5-added_to_showroom']: true }))
    try {
      const r = await callApi('automation_SPECIALIST_createspecialist', { onboarding_id: id })
      if (r?.error) throw new Error(r.error)
      await saveProgress(5, 'added_to_showroom', 'completed')
      await loadDetail()
    } catch (err) { console.error(err); alert('Could not create specialist: ' + (err.message || 'unknown')) }
    finally { setSaving(p => ({ ...p, ['5-added_to_showroom']: false })) }
  }

  function getTaskStatus(stage, key) {
    const s = progress[`${stage}-${key}`]?.status
    return (s && s !== 'unchecked') ? s : null
  }
 
  function getVote(stage, voter, round = 1) {
    return votes[`${stage}-${voter}-${round}`]?.vote || null
  }

  // Has this exec cast a vote this round (regardless of whether the value is
  // revealed to the current viewer)?
  function hasVoted(stage, voter, round = 1) {
    return !!votes[`${stage}-${voter}-${round}`]
  }

  // Cast the current admin's exec vote for a given stage (2 = initial, 4 = final).
  // Voter identity is derived server-side.
  async function castExecVote(stage, round, vote) {
    try {
      await callApi('automation_SPECIALIST_execvote', { onboarding_id: id, stage, vote_round: round, vote })
      window.dispatchEvent(new Event('vfo:notifications-changed'))
      await loadDetail()
    } catch (err) { console.error(err) }
  }

  // Tracy resolves a "further questions" request: Proceed (re-send Core/Max) or Stop (decline).
  async function resolveQuestions(resolution) {
    if (fqPending) return
    setFqPending(resolution)
    try {
      await callApi('automation_SPECIALIST_questionsresolve', { onboarding_id: id, resolution })
      window.dispatchEvent(new Event('vfo:notifications-changed'))
      await loadDetail()
    } catch (err) { console.error(err) }
    finally { setFqPending(null) }
  }
 
  function getStageState(stage) {
    if (ob?.status === 'completed') return 'done'
    if (ob?.status === 'stopped') return ob?.current_stage > stage ? 'done' : ob?.current_stage === stage ? 'active' : 'pending'
    if (ob?.current_stage > stage) return 'done'
    if (ob?.current_stage === stage) return 'active'
    return 'pending'
  }
 
  const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }
 
  if (loading) return <SpecialistOnboardingDetailSkeleton onBack={onBack} />
  if (!ob) return <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', textAlign: 'center', color: 'var(--vfo-muted)' }}>Not found.</div>
 
  const isStopped = ob.status === 'stopped'
  const isCompleted = ob.status === 'completed'

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Backend tokens: [SPECIALIST_NAME] = full name, [FIRST_NAME] = first name.
  // Reused by every chip; empty = tokens stay bracketed.
  const emailCtx = (() => {
    const ctx = {}
    const name = (ob.specialist_name || '').trim()
    if (name) {
      ctx['SPECIALIST_NAME'] = name
      ctx['Specialist Name'] = name
      const first = name.split(/\s+/)[0]
      ctx['Specialist First'] = first
      ctx['FIRST_NAME'] = first
    }
    return ctx
  })()
 
  function StageBadge({ stage }) {
    const state = getStageState(stage)
    if (state === 'done') return <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>
    if (state === 'active') return <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress</span>
    return <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>
  }
 
  function StageHeader({ stage, title }) {
    const state = getStageState(stage)
    const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
    const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
    const isExpanded = expanded[stage]
    // the numbered badge replaces the "Stage N — " text prefix
    const displayTitle = title.replace(/^Stage \d+ — /, '')

    return (
      <div style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
          <div onClick={() => setExpanded(p => ({ ...p, [stage]: !p[stage] }))} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
            <PhaseBadge number={stage} state={state} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{displayTitle}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StageBadge stage={stage} />
            <span onClick={() => setExpanded(p => ({ ...p, [stage]: !p[stage] }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
          </div>
        </div>
        {isExpanded && ob.current_stage >= stage && (
          <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
            {stage === 1 && <Stage1Content />}
            {stage === 2 && <Stage2Content />}
            {stage === 3 && <Stage3Content />}
            {stage === 4 && <Stage4Content />}
            {stage === 5 && <Stage5Content />}
          </div>
        )}
        {isExpanded && ob.current_stage < stage && (
          <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
            {stage === 1 && <Stage1Content />}
            {stage === 2 && <Stage2Content />}
            {stage === 3 && <Stage3Content />}
            {stage === 4 && <Stage4Content />}
            {stage === 5 && <Stage5Content />}
          </div>
        )}
      </div>
    )
  }
 
  // Automated (no-click) step — mirrors the MAP 1 tracker's autoStep exactly
  // (small dot, 12px label that greens when done, tiny "Done / Not completed"
  // chip) so it never reads as a clickable button.
  // `pending` = an ACH is in flight (bg_payment_status 'processing'). Mirrors
  // AutoRow in AdvisorOnboarding.jsx — orange dot + orange tag instead of
  // "Not completed".
  function AutoStep({ done, label, detail, date, pending = false }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : pending ? '#e06717' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : pending ? '#e06717' : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          {detail && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{detail}</span>}
          {!done && pending
            ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.15)', border: '1px solid rgba(224,103,23,0.3)', color: '#e06717' }}>Pending — ACH clearing</span>
            : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: done ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', border: done ? '1px solid rgba(27,146,84,0.3)' : '1px solid var(--vfo-border-chip)', color: done ? '#1b9254' : 'var(--vfo-muted)' }}>{done ? 'Done' : 'Not completed'}</span>}
        </span>
        {done && date && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(date)}</span>}
      </div>
    )
  }

  // Cron-sweep paper trail for one stalled substep: the 48h chase email, then the
  // 96h Tracy notification with a "Reached out?" acknowledgement. Each row only
  // exists once its column is stamped, so an un-stalled step shows nothing.
  function StallRows({ stall, noun = 'specialist' }) {
    const reminderAt = ob[`${stall}_reminder_sent_at`]
    const notifiedAt = ob[`${stall}_pf_notified_at`]
    const ackAt = ob[`${stall}_pf_ack_at`]
    const [ackBusy, setAckBusy] = useState(false)

    async function toggleAck(next) {
      const before = ackAt || null
      setAckBusy(true)
      setOb(o => ({ ...o, [`${stall}_pf_ack_at`]: next ? new Date().toISOString() : null }))
      try {
        const r = await callApi('automation_stall_ack', { pipeline: 'specialist', id: ob.id, stall, ack: next })
        setOb(o => ({ ...o, [`${stall}_pf_ack_at`]: r?.ack_at || null }))
      } catch (err) {
        console.error(err)
        setOb(o => ({ ...o, [`${stall}_pf_ack_at`]: before }))
      }
      finally { setAckBusy(false) }
    }

    const doneRow = (label, at) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1b9254', flexShrink: 0, border: '1px solid #1b9254' }} />
        <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', border: '1px solid rgba(27,146,84,0.3)', color: '#1b9254' }}>Done</span>
        </span>
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(at)}</span>
      </div>
    )

    return (
      <>
        {reminderAt && doneRow(`2-business-day reminder email sent to ${noun}`, reminderAt)}
        {notifiedAt && (
          <>
            {doneRow('4-business-day mark passed — Tracy notified to follow up', notifiedAt)}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', marginLeft: '14px' }}>
              <input type="checkbox" checked={!!ackAt} disabled={ackBusy} onChange={e => toggleAck(e.target.checked)} style={{ margin: 0, flexShrink: 0, cursor: ackBusy ? 'default' : 'pointer' }} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Reached out?</span>
              {ackAt && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginLeft: 'auto', flexShrink: 0 }}>{fmtMMDD(ackAt)}</span>}
            </div>
          </>
        )}
      </>
    )
  }

  function CheckItem({ done, label, onClick, toggle }) {
    const clickable = !isStopped && (toggle || !done)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div onClick={() => clickable && onClick?.()} style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-strong)'}`, background: done ? '#1b9254' : 'transparent', cursor: clickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', flexShrink: 0 }}>{done ? '✓' : ''}</div>
        <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
      </div>
    )
  }

  // Stage-5 Showroom task: a toggleable checkbox + a link that opens this
  // specialist's record in Search Specialists so the admin can enter the item.
  function ShowroomCheck({ taskKey, label }) {
    const done = !!getTaskStatus(5, taskKey)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div onClick={async () => { if (isStopped) return; await saveProgress(5, taskKey, done ? 'unchecked' : 'Completed'); await loadDetail() }} style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-strong)'}`, background: done ? '#1b9254' : 'transparent', cursor: isStopped ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', flexShrink: 0 }}>{done ? '✓' : ''}</div>
        <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
        {ob.expert_id && <button onClick={() => navigate(`/admin?tab=specialists&section=specialist_search&expert=${ob.expert_id}&_n=${Date.now()}`)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#0095ff', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: 0, whiteSpace: 'nowrap' }}>Open specialist →</button>}
      </div>
    )
  }


  function ActionButton({ label, onClick, color = '#0095ff', disabled = false }) {
    const bg = color === '#1b9254' ? 'rgba(27,146,84,0.15)' : color === '#e74c3c' ? 'rgba(231,76,60,0.15)' : color === '#e06717' ? 'rgba(251,137,90,0.15)' : 'rgba(0,149,255,0.15)'
    const border = color === '#1b9254' ? 'rgba(27,146,84,0.4)' : color === '#e74c3c' ? 'rgba(231,76,60,0.4)' : color === '#e06717' ? 'rgba(251,137,90,0.4)' : 'rgba(0,149,255,0.4)'
    return (
      <button onClick={onClick} disabled={disabled || isStopped} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', cursor: disabled || isStopped ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', background: bg, border: `1px solid ${border}`, color, whiteSpace: 'nowrap' }}>{label}</button>
    )
  }
 
  function SectionLabel({ children }) {
    return <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', marginTop: '14px' }}>{children}</div>
  }
 
  function Stage1Content() {
    const decision = getTaskStatus(1, 'decision')
    const [showDate, setShowDate] = useState(false)
    const [meetingDate, setMeetingDate] = useState('')
    const [meetingTime, setMeetingTime] = useState('')
    const [meetingTz, setMeetingTz] = useState('ET')
    const [sifOpen, setSifOpen] = useState(false)
    const [pending, setPending] = useState(null)
    const [resched, setResched] = useState(false)

    const isDone = !!decision
    // Only the continue paths can be rescheduled — a stop has no next meeting.
    const canReschedule = isDone && decision !== 'stop' && !isStopped
    const statusColor = decision === 'stop' ? '#e74c3c' : '#1b9254'
    const statusLabel = decision === 'continue'
      ? `Continuing - next meeting ${progress['1-decision']?.notes || ''}`
      : decision === 'continue_no_date'
        ? 'Continuing - date not yet arranged'
        : decision === 'stop'
          ? 'Declined - email sent'
          : ''

    const greenBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
    const redBtn = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }
    const cancelBtn = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDone ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isDone ? statusColor : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '13px', color: isDone ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>Post-meeting decision<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Post-meeting decision" context={emailCtx} templates={[
            { name: 'SPECIALIST_yes', when: 'If Yes — continue email with agreement + presentation attachments' },
            { name: 'SPECIALIST_no', when: 'If No' },
            { name: 'SPECIALIST_sif_reminder', when: 'Automatic reminder if the intake form is not submitted (2 business days)' },
          ]} /></span></span>
          {isDone && !showDate
            ? <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{statusLabel}</span>
                {canReschedule && <button onClick={() => { const s = parseSlotNotes(progress['1-decision']?.notes); setMeetingDate(s.date); setMeetingTime(s.time); setMeetingTz(s.tz); setResched(true); setShowDate(true) }} disabled={!!pending} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}>Reschedule</button>}
              </span>
            : showDate
              ? <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }} />
                  <input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }} />
                  <select value={meetingTz} onChange={e => setMeetingTz(e.target.value)} style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '11px' }}>
                    <option value="ET">Eastern (ET)</option>
                    <option value="CT">Central (CT)</option>
                    <option value="MT">Mountain (MT)</option>
                    <option value="PT">Pacific (PT)</option>
                    <option value="AKT">Alaska (AKT)</option>
                    <option value="HT">Hawaii (HT)</option>
                  </select>
                  <button onClick={async () => {
                    if (!meetingDate || pending) return
                    setPending('continue')
                    // Reschedule: re-send the same email with the new slot and
                    // re-write the decision notes. No advanceStage() — the stage
                    // was already advanced by the original send.
                    if (resched) {
                      await sendPrelimEmail('continue', meetingDate, meetingTime, meetingTz, true)
                      await saveProgress(1, 'decision', 'continue', slotString(meetingDate, meetingTime, meetingTz))
                      setResched(false); setShowDate(false); setPending(null)
                      return
                    }
                    await sendPrelimEmail('continue', meetingDate, meetingTime, meetingTz)
                    saveProgress(1, 'decision', 'continue', slotString(meetingDate, meetingTime, meetingTz))
                    saveProgress(1, 'email_sent', 'completed')
                    advanceStage()
                  }} disabled={!meetingDate || !!pending} style={{ ...greenBtn, opacity: (!meetingDate || pending) ? 0.6 : 1, cursor: (!meetingDate || pending) ? 'not-allowed' : 'pointer' }}>{pending === 'continue' ? 'Sending…' : resched ? 'Re-send' : 'Send'}</button>
                  <button onClick={() => { if (pending) return; setShowDate(false); setResched(false) }} disabled={!!pending} style={cancelBtn}>Cancel</button>
                </div>
              : <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => setShowDate(true)} disabled={isStopped || !!pending} style={{ ...greenBtn, opacity: pending ? 0.6 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}>Continue - Send email (with date)</button>
                  <button onClick={async () => { if (pending) return; setPending('continue_no_date'); await sendPrelimEmail('continue_no_date'); saveProgress(1, 'decision', 'continue_no_date'); saveProgress(1, 'email_sent', 'completed'); advanceStage() }} disabled={isStopped || !!pending} style={{ ...greenBtn, opacity: pending ? 0.6 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}>{pending === 'continue_no_date' ? 'Sending…' : 'Continue - date not yet arranged'}</button>
                  <button onClick={async () => { if (pending) return; setPending('stop'); await sendPrelimEmail('stop'); await saveProgress(1, 'decision', 'stop'); await stopOnboarding() }} disabled={isStopped || !!pending} style={{ ...redBtn, opacity: pending ? 0.6 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}>{pending === 'stop' ? 'Sending…' : 'Stop - Send email'}</button>
                </div>
          }
        </div>

        {decision && decision !== 'stop' && (() => {
          const emailSent = !!getTaskStatus(1, 'email_sent')
          const autoStep = (label, done, date) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
              {done && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, marginLeft: 'auto' }}>Done</span>}
              {done && date && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(date)}</span>}
            </div>
          )
          const sifDone = !!ob.sif_submitted_at
          const sifData = ob.sif_data || {}
          const aipcDone = emailSent && sifDone
          return (
            <div style={{ padding: '7px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: aipcDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${aipcDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1, fontWeight: '600' }}>Automated steps</span>
              </div>
              <div style={{ marginLeft: '18px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
                {autoStep('Email sent to potential VFO specialist (SIF form, rev share examples, template agreement attached)', emailSent, ob.sif_email_sent_at)}
                <StallRows stall="sif" />
                <div>
                  <div onClick={() => sifDone && setSifOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', cursor: sifDone ? 'pointer' : 'default' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: sifDone ? '#1b9254' : 'transparent', flexShrink: 0, border: `1px solid ${sifDone ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
                    <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>SIF form completed by potential specialist</span>
                    {sifDone
                      ? <>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, marginLeft: 'auto' }}>Done</span>
                          <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{fmtMMDD(ob.sif_submitted_at)}</span>
                          <span style={{ color: 'var(--vfo-muted)', fontSize: '9px', transform: sifOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                        </>
                      : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', marginLeft: 'auto' }}>Awaiting</span>}
                  </div>
                  {sifDone && sifOpen && (
                    <div style={{ padding: '10px 12px 4px 16px' }}>
                      {SIF_FIELDS.map(([k, label]) => (
                        <div key={k} style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sifData[k] ? sifData[k] : '—'}</div>
                        </div>
                      ))}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Tax Specialist?</div>
                        <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sifData.is_tax_specialist || '—'}</div>
                      </div>
                      {sifData.is_tax_specialist === 'Yes' && SIF_TAX_FIELDS.map(([k, label]) => (
                        <div key={k} style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{sifData[k] ? sifData[k] : '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </>
    )
  }
 
  function Stage2MeetingButtons({ onLogMeeting, onLogStop, blockSend, allComplete }) {
    const [showDateInput, setShowDateInput] = useState(false)
    const [meetingDate, setMeetingDate] = useState('')
    const [meetingTime, setMeetingTime] = useState('')
    const [meetingTz, setMeetingTz] = useState('ET')
    const [sending, setSending] = useState(null) // 'meeting' | 'stop'

    const inStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }

    async function doMeeting(date, time, tz) {
      if (sending) return
      setSending('meeting')
      try { await onLogMeeting(date, time, tz) } finally { setSending(null); setShowDateInput(false) }
    }
    async function doStop() {
      if (sending) return
      setSending('stop')
      try { await onLogStop() } finally { setSending(null) }
    }

    return (
      <div style={{ marginTop: '12px', marginBottom: '12px' }}>
        {!showDateInput ? (
          <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {allComplete ? (
                <ActionButton label={sending === 'meeting' ? 'Sending…' : 'Still interested — Send email'} onClick={() => doMeeting()} color="#1b9254" disabled={!!sending || blockSend} />
              ) : (
                <>
                  <ActionButton label="Still interested — Send email (with date)" onClick={() => setShowDateInput(true)} color="#1b9254" disabled={!!sending || blockSend} />
                  <ActionButton label={sending === 'meeting' ? 'Sending…' : 'Still interested — date not yet arranged'} onClick={() => doMeeting()} color="#1b9254" disabled={!!sending || blockSend} />
                </>
              )}
              <ActionButton label={sending === 'stop' ? 'Sending…' : 'Stop — Send email'} onClick={doStop} color="#e74c3c" disabled={!!sending} />
            </div>
            {blockSend && <div style={{ fontSize: '11px', color: '#e06717', fontWeight: 600, marginTop: '6px' }}>Fill in the revenue share proposal above before sending.</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Next meeting:</span>
            <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={inStyle} />
            <input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} style={inStyle} />
            <select value={meetingTz} onChange={e => setMeetingTz(e.target.value)} style={inStyle}>
              <option value="ET">Eastern (ET)</option>
              <option value="CT">Central (CT)</option>
              <option value="MT">Mountain (MT)</option>
              <option value="PT">Pacific (PT)</option>
              <option value="AKT">Alaska (AKT)</option>
              <option value="HT">Hawaii (HT)</option>
            </select>
            <ActionButton label={sending === 'meeting' ? 'Sending…' : 'Confirm & Send email'} onClick={() => { if (!meetingDate) return; doMeeting(meetingDate, meetingTime, meetingTz) }} color="#1b9254" disabled={!meetingDate || !!sending || blockSend} />
            <ActionButton label="Cancel" onClick={() => setShowDateInput(false)} color="#0095ff" disabled={!!sending} />
          </div>
        )}
      </div>
    )
  }

  // Shared reviewer-notes block so Stage 2 (initial) and Stage 4 (final) mirror
  // exactly. Tracy's general notes always; Tim's tax-risk notes only for tax
  // specialists, with a visible "only if applicable" reference otherwise.
  function ReviewerNotesSection({ stage }) {
    // Show Tim's tax-risk notes unless the specialist has explicitly answered "No"
    // to being a Tax Specialist. Until they've chosen, show both reviewers.
    // Tim only adds his notes once — before the FIRST executive vote (Stage 2);
    // they are never requested again at the final approval (Stage 4).
    const showTim = stage !== 4 && ob.sif_data?.is_tax_specialist !== 'No'
    return (
      <>
        <SectionLabel>Reviewer notes</SectionLabel>
        <ReviewerNoteInput
          label="General notes" who="Tracy"
          placeholder="General notes regarding this specialist..."
          done={!!getTaskStatus(stage, 'tracy_general_notes')}
          currentNotes={progress[`${stage}-tracy_general_notes`]?.notes || ''}
          onSave={t => saveProgress(stage, 'tracy_general_notes', 'completed', t)}
        />
        {showTim && (
          <ReviewerNoteInput
            label="Tax risk notes" who="Tim" hint="if applicable"
            placeholder="Notes regarding tax risk..."
            done={!!getTaskStatus(stage, 'tim_tax_risk_notes')}
            currentNotes={progress[`${stage}-tim_tax_risk_notes`]?.notes || ''}
            onSave={t => saveProgress(stage, 'tim_tax_risk_notes', 'completed', t)}
          />
        )}
      </>
    )
  }

  function Stage2Content() {
    // Build meeting history from progress keys
    const meetingCount = meetings.length
    // Post-send reschedule of the most recent logged meeting: which row's form
    // is open, and the new slot being typed into it.
    const [resendId, setResendId] = useState(null)
    const [rsDate, setRsDate] = useState('')
    const [rsTime, setRsTime] = useState('')
    const [rsTz, setRsTz] = useState('ET')
    const [rsSending, setRsSending] = useState(false)
    
    // Figure out which items have been locked by previous meetings
    const lockedItems = new Set()
    meetings.forEach(m => {
      (m.items_discussed || []).forEach(item => lockedItems.add(item))
    })
    
    // All 9 items covered across all meetings?
    const allCovered = STAGE2_CHECKLIST.every((_, i) => lockedItems.has(String(i)) || getTaskStatus(2, `checklist_${i}`))
    const allLocked = STAGE2_CHECKLIST.every((_, i) => lockedItems.has(String(i)))
    const stoppedHere = isStopped && ob.current_stage >= 2  // stopped during Stage 2 (vs stopped earlier)
    
    // Initial executive approval — account-scoped two-round voting.
    const myExec = EXEC_BY_EMAIL[(session?.email || '').toLowerCase()] || null
    const votingOpen = !!getTaskStatus(2, 'rev_share_prepared') && !!getTaskStatus(2, 'tracy_general_notes')
      && (ob.sif_data?.is_tax_specialist === 'No' || !!getTaskStatus(2, 'tim_tax_risk_notes'))
    const r1BothVoted = hasVoted(2, 'Anton Anderson', 1) && hasVoted(2, 'Paul Latham', 1)
    const r1AnyFurther = r1BothVoted && (getVote(2, 'Anton Anderson', 1) === 'Further Questions' || getVote(2, 'Paul Latham', 1) === 'Further Questions')
    const r1BothApproved = r1BothVoted && getVote(2, 'Anton Anderson', 1) === 'Approved' && getVote(2, 'Paul Latham', 1) === 'Approved'
    const r2BothVoted = hasVoted(2, 'Anton Anderson', 2) && hasVoted(2, 'Paul Latham', 2)
    const r2BothApproved = r2BothVoted && getVote(2, 'Anton Anderson', 2) === 'Approved' && getVote(2, 'Paul Latham', 2) === 'Approved'
    const r2BothDenied = r2BothVoted && getVote(2, 'Anton Anderson', 2) === 'Denied' && getVote(2, 'Paul Latham', 2) === 'Denied'
    const approved = r1BothApproved || r2BothApproved
    const denied = r2BothDenied
    const approvedBanner = { fontSize: '12px', color: '#1b9254', fontWeight: 600, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(27,146,84,0.3)', background: 'rgba(27,146,84,0.06)', marginBottom: '8px' }

    // Toggle a checklist item on/off (editable until the meeting is submitted).
    // 'unchecked' is treated as not-done by getTaskStatus.
    function toggleChecklist(index) {
      const done = !!getTaskStatus(2, `checklist_${index}`)
      saveProgress(2, `checklist_${index}`, done ? 'unchecked' : 'completed')
    }

    async function logMeeting(date, time, tz) {
      // Gather currently checked items that aren't already locked
      const newlyChecked = []
      STAGE2_CHECKLIST.forEach((_, i) => {
        if (getTaskStatus(2, `checklist_${i}`) && !lockedItems.has(String(i))) {
          newlyChecked.push(String(i))
        }
      })
      if (newlyChecked.length === 0) return

      const completedIdx = [...lockedItems, ...newlyChecked]
      const completedLabels = STAGE2_CHECKLIST.filter((_, i) => completedIdx.includes(String(i)))
      const pendingLabels = STAGE2_CHECKLIST.filter((_, i) => !completedIdx.includes(String(i)))

      // Save the meeting, then send the in-progress email referencing it.
      const noteParts = [date, time, tz].filter(Boolean)
      let meetingId = null
      try {
        const result = await callApi('save_onboarding_meeting', {
          onboarding_id: id,
          meeting_date: new Date().toISOString().split('T')[0],
          items_discussed: completedIdx,
          outcome: 'interested',
          notes: noteParts.length ? `Next meeting: ${noteParts.join(' ')}` : 'Next meeting date not yet arranged',
          created_by: session?.name || 'Admin',
        })
        meetingId = result.meeting?.id
        setMeetings(prev => [result.meeting, ...prev])
      } catch (err) { console.error(err) }

      try {
        await callApi('automation_SPECIALIST_stage2email', { onboarding_id: id, meeting_id: meetingId, completed: completedLabels, pending: pendingLabels, meeting_date: date || null, meeting_time: time || null, meeting_tz: tz || null })
      } catch (err) { console.error(err) }
    }

    // Re-send the Stage 2 progress email for an already-logged meeting with a new
    // next-meeting slot. The checklist context is rebuilt exactly the way
    // logMeeting() built it, but from the items that row recorded as covered —
    // so the re-sent email's Completed / Remaining lists match the original. The
    // meeting row is edited in place (meeting_id) rather than logged again.
    async function resendMeeting(meeting, date, time, tz) {
      const completedIdx = (meeting.items_discussed || []).map(String)
      const completedLabels = STAGE2_CHECKLIST.filter((_, i) => completedIdx.includes(String(i)))
      const pendingLabels = STAGE2_CHECKLIST.filter((_, i) => !completedIdx.includes(String(i)))
      const noteParts = [date, time, tz].filter(Boolean)
      const notes = noteParts.length ? `Next meeting: ${noteParts.join(' ')}` : 'Next meeting date not yet arranged'
      try {
        const result = await callApi('save_onboarding_meeting', { onboarding_id: id, meeting_id: meeting.id, notes })
        setMeetings(prev => prev.map(m => (m.id === meeting.id ? (result.meeting || { ...m, notes }) : m)))
      } catch (err) { console.error(err) }

      try {
        await callApi('automation_SPECIALIST_stage2email', { onboarding_id: id, meeting_id: meeting.id, completed: completedLabels, pending: pendingLabels, meeting_date: date || null, meeting_time: time || null, meeting_tz: tz || null, reschedule: true })
      } catch (err) { console.error(err) }
    }

    async function logStop() {
      // Send the decline (No) email — same as the Stage 1 Stop email
      try { await sendPrelimEmail('stop') } catch (err) { console.error(err) }
      try {
        // Gather all currently checked items
        const allChecked = []
        STAGE2_CHECKLIST.forEach((_, i) => {
          if (getTaskStatus(2, `checklist_${i}`) || lockedItems.has(String(i))) {
            allChecked.push(String(i))
          }
        })
        const result = await callApi('save_onboarding_meeting', {
          onboarding_id: id,
          meeting_date: new Date().toISOString().split('T')[0],
          items_discussed: allChecked,
          outcome: 'stopped',
          created_by: session?.name || 'Admin',
        })
        setMeetings(prev => [result.meeting, ...prev])
        await saveProgress(2, 'decision', 'stop')
        await stopOnboarding()
      } catch (err) { console.error(err) }
    }

    // Items remaining (not locked by previous meetings)
    const remainingItems = STAGE2_CHECKLIST.map((item, i) => ({ item, index: i })).filter(({ index }) => !lockedItems.has(String(index)))
    // This send will cover every item -> no next meeting, so no date/no-date split.
    const allComplete = remainingItems.length > 0 && remainingItems.every(({ index }) => !!getTaskStatus(2, `checklist_${index}`))

    return (
      <>
        {/* Previous meetings */}
        {[...meetings].reverse().map((meeting, mi) => {
          const discussed = meeting.items_discussed || []
          // Items that were NEW in this meeting (not in previous meetings)
          const previousMeetings = [...meetings].reverse().slice(0, mi)
          const previousItems = new Set()
          previousMeetings.forEach(pm => (pm.items_discussed || []).forEach(item => previousItems.add(item)))
          const newInThisMeeting = discussed.filter(idx => !previousItems.has(idx))
          // Only the latest logged meeting can be rescheduled — earlier rows are
          // settled history, and their "next meeting" already happened.
          const isMostRecent = mi === meetings.length - 1
          const rsInStyle = { padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '11px', fontFamily: 'Inter, sans-serif' }

          return (
            <div key={meeting.id} style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', border: '1px solid var(--vfo-tint-deep)', background: 'var(--vfo-tint)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#0095ff', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meeting {mi + 1}</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{meeting.meeting_date} · {meeting.created_by}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>Covered in this meeting:</div>
              {newInThisMeeting.map(idx => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid #1b9254', background: '#1b9254', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', flexShrink: 0 }}>✓</div>
                  <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', textDecoration: 'line-through' }}>{STAGE2_CHECKLIST[parseInt(idx)]}</span>
                </div>
              ))}
              {meeting.outcome === 'stopped' && (
                <>
                  {STAGE2_CHECKLIST.map((item, i) => {
                    if (!(meeting.items_discussed || []).includes(String(i))) {
                      return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid var(--vfo-border-mid)', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{item}</span>
                      </div>
                    }
                    return null
                  })}
                  <div style={{ fontSize: '12px', color: '#e74c3c', fontWeight: '600', marginTop: '6px' }}>✗ Process stopped — email sent</div>
                </>
              )}
              {meeting.outcome === 'interested' && (
                <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>✓ Still interested — email sent</span>
                    {meeting.notes && <span style={{ color: 'var(--vfo-muted)', fontWeight: 400 }}>({meeting.notes})</span>}
                    {isMostRecent && !isStopped && resendId !== meeting.id && (
                      <button onClick={() => { const s = parseSlotNotes(meeting.notes); setRsDate(s.date); setRsTime(s.time); setRsTz(s.tz); setResendId(meeting.id) }} style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}>Resend with new date</button>
                    )}
                  </div>
                  {resendId === meeting.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px', fontWeight: 400 }}>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>New next meeting:</span>
                      <input type="date" value={rsDate} onChange={e => setRsDate(e.target.value)} style={rsInStyle} />
                      <input type="time" value={rsTime} onChange={e => setRsTime(e.target.value)} style={rsInStyle} />
                      <select value={rsTz} onChange={e => setRsTz(e.target.value)} style={rsInStyle}>
                        <option value="ET">Eastern (ET)</option>
                        <option value="CT">Central (CT)</option>
                        <option value="MT">Mountain (MT)</option>
                        <option value="PT">Pacific (PT)</option>
                        <option value="AKT">Alaska (AKT)</option>
                        <option value="HT">Hawaii (HT)</option>
                      </select>
                      <ActionButton label={rsSending ? 'Sending…' : 'Re-send email'} color="#1b9254" disabled={!rsDate || rsSending} onClick={async () => {
                        if (!rsDate || rsSending) return
                        setRsSending(true)
                        try { await resendMeeting(meeting, rsDate, rsTime, rsTz) } finally { setRsSending(false); setResendId(null) }
                      }} />
                      <ActionButton label="Cancel" color="#0095ff" disabled={rsSending} onClick={() => setResendId(null)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Current meeting section — live checklist + buttons. Hidden once the
            process is stopped: no clickable remaining items after a Stop (the
            meeting history above still shows what was/wasn't covered). */}
        {!allLocked && !stoppedHere && (
          <>
            <SectionLabel>{meetingCount === 0 ? 'Stage 2 Checklist' : `Meeting ${meetingCount + 1} — Remaining Items`}<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Stage 2 progress" context={emailCtx} templates={[
                { name: 'SPECIALIST_step2_progress', when: 'Stage 2 progress update' },
                { name: 'SPECIALIST_choice_reminder', when: 'Automatic reminder if Core/Max/Questions not chosen (2 business days)' },
              ]} /></span></SectionLabel>
            {remainingItems.map(({ item, index }) => (
              <CheckItem key={index} done={!!getTaskStatus(2, `checklist_${index}`)} label={item} toggle onClick={() => toggleChecklist(index)} />
            ))}

            {!isStopped && <Stage2MeetingButtons onLogMeeting={logMeeting} onLogStop={logStop} blockSend={false} allComplete={allComplete} />}
          </>
        )}

        {/* All items covered message */}
        {allLocked && !isStopped && (
          <div style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(27,146,84,0.3)', background: 'rgba(27,146,84,0.06)', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600 }}>✓ All Stage 2 items completed across {meetingCount} meeting{meetingCount !== 1 ? 's' : ''}.</span>
          </div>
        )}

        {/* Revenue share proposal — submitting it notifies Tracy (always) + Tim
            (tax specialists only) to add their reviewer notes below. Uses the same
            always-visible box as the reviewer notes: it never collapses after
            submit and stays editable. */}
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
        <SectionLabel>Revenue share proposal</SectionLabel>
        <ReviewerNoteInput
          label="Revenue Share Proposal"
          placeholder="Enter revenue share proposal details..."
          rows={6}
          done={!!getTaskStatus(2, 'rev_share_prepared')}
          currentNotes={progress['2-rev_share_prepared']?.notes || ''}
          onSave={t => saveProgress(2, 'rev_share_prepared', 'completed', t)}
          pendingBadge="Awaiting proposal"
          doneBadge="Submitted"
          saveLabel="Submit revenue share proposal"
          updateLabel="Update revenue share proposal"
        />
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />

        {/* Reviewer notes — always visible (mirrors Stage 4). Tracy (always) + Tim
            (tax specialists only) are notified to add these once the revenue share
            proposal above is submitted; the prompts clear when the notes save. */}
        <ReviewerNotesSection stage={2} />
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />

        {/* Initial executive approval — account-scoped two-round voting */}
        <>
            <SectionLabel>Initial executive approval<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Initial executive approval" context={emailCtx} templates={[
                { name: 'SPECIALIST_denied', when: 'If the executive vote denies' },
                { name: 'SPECIALIST_vote_reminder', when: 'Automatic reminder to executives who have not voted (2 business days)' },
              ]} /></span></SectionLabel>
            {!votingOpen ? (
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-chip)', background: 'var(--vfo-tint)', marginBottom: '12px' }}>
                Voting opens once the revenue share proposal and {ob.sif_data?.is_tax_specialist === 'No' ? "Tracy's notes" : "Tracy's and Tim's notes"} are complete.
              </div>
            ) : (
              <>
                <ExecDetailsDropdown />
                <ExecVoteRow stage={2} round={1} options={['Approved', 'Further Questions']} myExec={myExec} />
                <StallRows stall="vote_r1" noun="execs" />
                {r1BothApproved && <div style={approvedBanner}>✓ Both executives approved.</div>}
                {r1AnyFurther && (
                  <>
                    <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(251,137,90,0.3)', background: 'rgba(251,137,90,0.06)', margin: '12px 0' }}>An executive raised further questions — a second decision is needed after discussion.</div>
                    <SectionLabel>Executive decision (after discussion)</SectionLabel>
                    <ExecVoteRow stage={2} round={2} options={['Approved', 'Denied']} myExec={myExec} />
                    <StallRows stall="vote_r2" noun="execs" />
                    {r2BothApproved && <div style={approvedBanner}>✓ Both executives approved.</div>}
                  </>
                )}
              </>
            )}

            {denied && !approved && (() => {
              const sent = !!getTaskStatus(2, 'denied_email_sent')
              return (
                <>
                  <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sent ? '#e74c3c' : 'transparent', flexShrink: 0, border: `1.5px solid ${sent ? '#e74c3c' : 'var(--vfo-border-mid)'}` }} />
                    <span style={{ fontSize: '13px', color: sent ? '#e74c3c' : 'var(--vfo-muted)', flex: 1 }}>Decline email drafted to specialist — Tracy Miller will follow up</span>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: sent ? 'rgba(231,76,60,0.15)' : 'var(--vfo-tint)', color: sent ? '#e74c3c' : 'var(--vfo-muted)', border: `1px solid ${sent ? 'rgba(231,76,60,0.3)' : 'var(--vfo-border)'}` }}>{sent ? 'Sent — process stopped' : 'Sending…'}</span>
                  </div>
                </>
              )
            })()}
        </>
      </>
    )
  }


  function ReviewerNoteInput({ label, who, placeholder, done, currentNotes, onSave, hint, rows = 4, pendingBadge = 'Awaiting notes', doneBadge = 'Completed', saveLabel = 'Save notes', updateLabel = 'Update notes' }) {
    const [text, setText] = useState(currentNotes)
    const [saving, setSaving] = useState(false)
    const [justSaved, setJustSaved] = useState(false)

    async function handleSave() {
      if (!text.trim() || saving) return
      setSaving(true)
      try { await onSave(text.trim()); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000) }
      catch (err) { console.error(err) }
      finally { setSaving(false) }
    }

    return (
      <div style={{ padding: '12px 14px', borderRadius: '8px', border: `1px solid ${done ? 'rgba(27,146,84,0.3)' : 'rgba(251,137,90,0.3)'}`, background: 'var(--vfo-tint)', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{label}{who && <span style={{ color: 'var(--vfo-muted)', fontWeight: 400 }}> ({who}){hint ? ` — ${hint}` : ''}</span>}</span>
          {done
            ? <span style={{ fontSize: '10px', padding: '1px 8px', borderRadius: '4px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, marginLeft: 'auto' }}>{doneBadge}</span>
            : <span style={{ fontSize: '10px', padding: '1px 8px', borderRadius: '4px', background: 'rgba(251,137,90,0.15)', color: '#e06717', fontWeight: 600, marginLeft: 'auto' }}>{pendingBadge}</span>}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={rows} disabled={isStopped} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
        <ActionButton label={justSaved ? '✓ Saved' : saving ? 'Saving...' : done ? updateLabel : saveLabel} onClick={handleSave} color={done ? '#1b9254' : '#0095ff'} disabled={!text.trim() || saving} />
      </div>
    )
  }

  // One row of two exec cards for a voting round. Buttons are only active for the
  // matching logged-in exec; a vote's value is shown only once revealed by the
  // backend (the caster always sees their own; everyone sees both once both vote).
  function ExecVoteRow({ stage, round, options, myExec }) {
    const [pending, setPending] = useState(null)
    return (
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        {EXECS.map(voter => {
          const voted = hasVoted(stage, voter, round)
          const value = getVote(stage, voter, round)
          const isMe = myExec === voter
          const revealed = voted && value != null
          const color = value === 'Approved' ? '#1b9254' : value === 'Denied' ? '#e74c3c' : '#e06717'
          return (
            <div key={voter} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--vfo-tint-deep)', background: 'var(--vfo-tint)' }}>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>{voter}{isMe && <span style={{ color: '#0095ff' }}> (you)</span>}</div>
              {revealed ? (
                <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{value === 'Approved' ? '✓ ' : value === 'Denied' ? '✗ ' : '⚠ '}{value}</span>
              ) : voted ? (
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }}>Voted — awaiting other executive</span>
              ) : isMe ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {options.map(opt => {
                    const oc = opt === 'Approved' ? '#1b9254' : opt === 'Denied' ? '#e74c3c' : '#e06717'
                    return <button key={opt} onClick={async () => { if (pending) return; setPending(opt); try { await castExecVote(stage, round, opt) } finally { setPending(null) } }} disabled={!!pending} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: pending ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', background: `${oc}22`, border: `1px solid ${oc}66`, color: oc, opacity: pending ? 0.6 : 1 }}>{pending === opt ? 'Saving…' : opt}</button>
                  })}
                </div>
              ) : (
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-chip)' }}>Awaiting response</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Collapsible reference bundle the execs use to decide: SIF answers, the final
  // revenue share proposal, and Tracy's + Tim's notes.
  function ExecDetailsDropdown() {
    const [open, setOpen] = useState(false)
    const sifData = ob.sif_data || {}
    const isTax = sifData.is_tax_specialist === 'Yes'
    const lblStyle = { fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }
    const valStyle = { fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: '10px' }
    const grpStyle = { fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', letterSpacing: '0.3px', margin: '20px 0 12px', paddingBottom: '6px', borderBottom: '2px solid rgba(0,149,255,0.55)' }
    const item = (label, value, key) => (<div key={key} style={{ marginBottom: '10px' }}><div style={lblStyle}>{label}</div><div style={{ ...valStyle, marginBottom: 0 }}>{value ? value : '—'}</div></div>)
    return (
      <div style={{ marginBottom: '14px' }}>
        <div onClick={() => setOpen(o => !o)} style={{ fontSize: '12px', color: '#0095ff', cursor: 'pointer', fontWeight: 600 }}>{open ? '▼ Hide details' : '▶ View details'}</div>
        {open && (
          <div style={{ marginTop: '8px', padding: '12px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
            <div style={{ ...grpStyle, marginTop: 0 }}>SIF answers</div>
            {SIF_FIELDS.map(([k, label]) => item(label, sifData[k], k))}
            {item('Tax Specialist?', sifData.is_tax_specialist, 'taxflag')}
            {isTax && SIF_TAX_FIELDS.map(([k, label]) => item(label, sifData[k], k))}
            <div style={grpStyle}>Final revenue share proposal</div>
            <div style={valStyle}>{progress['2-rev_share_prepared']?.notes || '—'}</div>
            <div style={grpStyle}>General notes (Tracy)</div>
            <div style={valStyle}>{progress['2-tracy_general_notes']?.notes || '—'}</div>
            {isTax && <>
              <div style={grpStyle}>Tax risk notes (Tim)</div>
              <div style={valStyle}>{progress['2-tim_tax_risk_notes']?.notes || '—'}</div>
            </>}
          </div>
        )}
      </div>
    )
  }

  // Stage 4 final-approval reference bundle (same style as the Stage 2 dropdown):
  // background-check result + chosen type, the submitted DD checklist, and the
  // final revenue share proposal.
  function Stage4DetailsDropdown() {
    const [open, setOpen] = useState(false)
    const ddc = ob.ddc_data || {}
    const bgType = ob.background_check_type || '—'
    const revText = ob.rev_share_final_text || progress['2-rev_share_prepared']?.notes || '—'
    const tracyNotes = progress['4-tracy_general_notes']?.notes || '—'
    const lblStyle = { fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }
    const valStyle = { fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: '10px' }
    const grpStyle = { fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', letterSpacing: '0.3px', margin: '20px 0 12px', paddingBottom: '6px', borderBottom: '2px solid rgba(0,149,255,0.55)' }
    async function openFile(path) {
      try { const r = await callApi('automation_SPECIALIST_ddcdownload', { onboarding_id: id, path }); if (r?.url) window.open(r.url, '_blank', 'noopener') } catch (err) { console.error(err) }
    }
    const ddText = [
      ['Professional bio', ddc.bio],
      ['Case studies', ddc.case_studies],
      ['Regulatory / disciplinary history', ddc.disciplinary_history],
      ['Audit support & scope of services', ddc.audit_support],
      ['Exit strategies & contingency plans', ddc.exit_strategies],
      ['Sample materials notes', ddc.sample_materials_notes],
    ].filter(([, v]) => v && String(v).trim())
    const ddFiles = [
      ['Headshot', ddc.headshot ? [ddc.headshot] : []],
      ['Licenses / designations', ddc.licenses || []],
      ['Case study attachments', ddc.case_study_files || []],
      ['E&O / liability insurance', ddc.eo_insurance || []],
      ['Regulatory / disciplinary history', ddc.disciplinary_history_files || []],
      ['Audit support & scope of services', ddc.audit_support_files || []],
      ['Private Letter Ruling (PLR)', ddc.plr_files || []],
      ['Tax Opinion Letter (TOL)', ddc.tol_files || []],
      ['Independent legal due diligence', ddc.legal_dd_files || []],
      ['Exit strategies & contingency plans', ddc.exit_strategies_files || []],
      ['Sample materials', ddc.sample_materials_files || []],
    ].filter(([, f]) => f.length)
    return (
      <div style={{ marginBottom: '14px' }}>
        <div onClick={() => setOpen(o => !o)} style={{ fontSize: '12px', color: '#0095ff', cursor: 'pointer', fontWeight: 600 }}>{open ? '▼ Hide details' : '▶ View details'}</div>
        {open && (
          <div style={{ marginTop: '8px', padding: '12px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
            <div style={{ ...grpStyle, marginTop: 0 }}>Background check</div>
            <div style={valStyle}>Passed — {bgType} check</div>
            <div style={grpStyle}>Due Diligence Checklist</div>
            {ddText.length === 0 && ddFiles.length === 0 && <div style={valStyle}>—</div>}
            {ddText.map(([label, v]) => (<div key={'t-' + label} style={{ marginBottom: '10px' }}><div style={lblStyle}>{label}</div><div style={{ ...valStyle, marginBottom: 0 }}>{v}</div></div>))}
            {ddFiles.map(([label, files]) => (
              <div key={'f-' + label} style={{ marginBottom: '10px' }}>
                <div style={lblStyle}>{label}</div>
                {files.map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span onClick={() => openFile(f.path)} title={f.name} style={{ color: '#0095ff', cursor: 'pointer', textDecoration: 'underline', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={grpStyle}>Final revenue share proposal</div>
            <div style={valStyle}>{revText}</div>
            <div style={grpStyle}>Reviewer notes</div>
            <div style={lblStyle}>Tracy — general notes</div>
            <div style={valStyle}>{tracyNotes}</div>
          </div>
        )}
      </div>
    )
  }

  function Stage3Content() {
    const bgInitiated = !!getTaskStatus(3, 'bg_initiated')
    const bgResult = getTaskStatus(3, 'bg_results_received')
    const bgDone = bgResult === 'passed'
    const bgFailed = bgResult === 'failed'

    const step3Sent = !!ob.bg_step3_email_sent_at
    const confirmSent = !!ob.bg_confirmation_email_sent_at
    const bgPaid = ob.bg_payment_status === 'succeeded' || !!getTaskStatus(2, 'payment_received')
    const fqRequested = !!ob.further_questions_requested_at
    const fqResolved = !!ob.further_questions_resolved_at
    const bgChosen = !!ob.background_check_type

    // Due Diligence checklist review state
    const ddc = ob.ddc_data || {}
    const ddcEmailed = !!ob.ddc_email_sent_at
    const ddcSubmitted = !!ob.ddc_submitted_at
    const ddcReview = ob.ddc_review_status
    const ddcApproved = ddcReview === 'approved'
    const ddcEditsRequested = ddcReview === 'edits_requested'
    const helpRequested = !!ob.ddc_help_requested_at
    const helpResolved = !!getTaskStatus(3, 'ddc_help_resolved')
    const reviewLog = Array.isArray(ob.ddc_review_log) ? ob.ddc_review_log : []
    const ddcEverSubmitted = ddcSubmitted || reviewLog.some(e => e.type === 'submitted')

    // DD checklist layout — mirrors the specialist form exactly: same sections,
    // same question order, sub-questions grouped under their subheading. The
    // Compliance & Risk section applies only to tax specialists (same gate as the
    // form). `file` = single-file slot (headshot); `files` = multi-file slot.
    const ddcIsTax = ob.sif_data?.is_tax_specialist === 'Yes'
    const ddcLayout = [
      ['Materials', [
        { label: 'Headshot', file: 'headshot' },
        { label: 'Professional bio', text: 'bio' },
      ]],
      ['Credentials & Experience', [
        { label: 'Professional licenses / designations', files: 'licenses' },
        { label: 'Case studies', text: 'case_studies', files: 'case_study_files' },
      ]],
      ...(ddcIsTax ? [['Compliance & Risk (Tax Professionals only)', [
        { label: 'Proof of E&O / professional liability insurance', files: 'eo_insurance' },
        { label: 'Regulatory / disciplinary history', text: 'disciplinary_history', files: 'disciplinary_history_files' },
        { label: 'Audit support & scope of services', text: 'audit_support', files: 'audit_support_files' },
        { subheading: 'Provide one or more of the following:' },
        { label: 'Private Letter Ruling (PLR)', files: 'plr_files', indent: true },
        { label: 'Tax Opinion Letter (TOL)', files: 'tol_files', indent: true },
        { label: 'Independent legal due diligence', files: 'legal_dd_files', indent: true },
        { label: 'Exit strategies & contingency plans', text: 'exit_strategies', files: 'exit_strategies_files' },
      ]]] : []),
      ['Client Experience', [
        { label: 'Sample materials', text: 'sample_materials_notes', files: 'sample_materials_files' },
      ]],
    ]
    const ddItemFiles = (it) => it.file ? (ddc[it.file] ? [ddc[it.file]] : []) : (it.files ? (ddc[it.files] || []) : [])
    const ddItemText = (it) => it.text ? String(ddc[it.text] || '').trim() : ''
    const ddItemFilled = (it) => ddItemText(it).length > 0 || ddItemFiles(it).length > 0
    const ddAllItems = ddcLayout.flatMap(([, items]) => items.filter(it => !it.subheading))
    const ddFilled = ddAllItems.filter(ddItemFilled).length
    const ddTotal = ddAllItems.length

    // Final revenue share proposal — specialist responded via the Step 3 email.
    const revResponse = ob.rev_share_final_response
    const revFinalized = !!getTaskStatus(3, 'rev_share_finalized')
    const revFinalizedHow = progress['3-rev_share_finalized']?.notes || ''
    const revProposalText = progress['2-rev_share_prepared']?.notes || ''
    const revFinalText = ob.rev_share_final_text || revProposalText
    const revEmailed = !!ob.bg_receipt_email_sent_at
    const revFinalDone = revResponse === 'Approved' || revFinalized
    const revFinalDetail = revFinalDone ? (revFinalizedHow === 'edited' ? 'Edited' : 'Confirmed') : ''
    // A straight "Approved" response finalises the proposal without an admin
    // action, so there is no progress row to date it — fall back to the response.
    const revFinalizedAt = progress['3-rev_share_finalized']?.completed_at || ob.rev_share_final_response_at

    const [showEdits, setShowEdits] = useState(false)
    const [editsReason, setEditsReason] = useState('')
    const [ddcBusy, setDdcBusy] = useState('')
    const [showRevProp, setShowRevProp] = useState(false)
    const [showRevEdit, setShowRevEdit] = useState(false)
    const [revEditText, setRevEditText] = useState('')
    const [revBusy, setRevBusy] = useState('')
    const [showSubmission, setShowSubmission] = useState(false)

    // Open a submitted DD-checklist file via a freshly-minted signed URL.
    async function openFile(path) {
      try {
        const r = await callApi('automation_SPECIALIST_ddcdownload', { onboarding_id: id, path })
        if (r?.url) window.open(r.url, '_blank', 'noopener')
      } catch (err) { console.error(err) }
    }

    // Stage 3 rollup bullet: green = complete, red = problem, grey = waiting.
    const progressBullet = (label, state, pill) => {
      const c = state === 'green' ? '#1b9254' : state === 'red' ? '#e74c3c' : 'var(--vfo-muted)'
      const grey = state === 'grey'
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: grey ? 'transparent' : c, border: `1px solid ${grey ? '#bac9e1' : c}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: grey ? 'var(--vfo-tint)' : `${c}26`, border: grey ? '1px solid var(--vfo-border-chip)' : `1px solid ${c}44`, color: grey ? 'var(--vfo-muted)' : c }}>{pill}</span>
        </div>
      )
    }

    async function keepRevShare() {
      setRevBusy('keep')
      try { await callApi('automation_SPECIALIST_revsharefinalize', { onboarding_id: id }); window.dispatchEvent(new Event('vfo:notifications-changed')); await loadDetail() }
      catch (err) { console.error(err) }
      finally { setRevBusy('') }
    }
    async function submitRevEdit() {
      if (!revEditText.trim()) return
      setRevBusy('edit')
      try { await callApi('automation_SPECIALIST_revsharefinalize', { onboarding_id: id, final_text: revEditText.trim() }); window.dispatchEvent(new Event('vfo:notifications-changed')); setShowRevEdit(false); await loadDetail() }
      catch (err) { console.error(err) }
      finally { setRevBusy('') }
    }

    async function approveDdc() {
      setDdcBusy('approve')
      try {
        await callApi('automation_SPECIALIST_ddcapprove', { onboarding_id: id })
        await loadDetail()
      } catch (err) { console.error(err) }
      finally { setDdcBusy('') }
    }
    async function sendEdits() {
      if (!editsReason.trim()) return
      setDdcBusy('edits')
      try {
        await callApi('automation_SPECIALIST_ddcedits', { onboarding_id: id, reason: editsReason.trim() })
        setShowEdits(false); setEditsReason('')
        await loadDetail()
      } catch (err) { console.error(err) }
      finally { setDdcBusy('') }
    }

    return (
      <>
        {/* Background-check payment flow (begins when both execs approve) */}
        <AutoStep done={step3Sent} date={ob.bg_step3_email_sent_at} label={<>Stage 3 email sent to specialist (choose Core $350 / Max $950)<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Stage 3 email" context={emailCtx} templates={[
            { name: 'SPECIALIST_step3', when: 'Step 3 email' },
            { name: 'SPECIALIST_step3_proceed', when: 'Step 3 proceed / receipt email' },
          ]} /></span></>} />
        <StallRows stall="bg_choice" />

        {/* Appears once the specialist asks questions, and STAYS as a paper trail:
            action buttons while unresolved, then the outcome pill once resolved. */}
        {fqRequested && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: fqResolved ? '#1b9254' : '#e06717', border: `1px solid ${fqResolved ? '#1b9254' : '#e06717'}` }} />
            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Answer the specialist's background check questions</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
              {fqResolved ? (
                ob.further_questions_resolution === 'Stop'
                  ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', fontWeight: 600 }}>Stopped</span>
                  : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Questions answered</span>
              ) : (
                <>
                  <ActionButton label={fqPending === 'Proceed' ? 'Sending…' : 'Questions answered'} onClick={() => resolveQuestions('Proceed')} color="#1b9254" disabled={!!fqPending} />
                  <ActionButton label={fqPending === 'Stop' ? 'Sending…' : 'Stop'} onClick={() => resolveQuestions('Stop')} color="#e74c3c" disabled={!!fqPending} />
                </>
              )}
            </span>
          </div>
        )}

        {/* Specialist background check choice (Core/Max) — "Questions asked" pill if they asked first. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: bgChosen ? '#1b9254' : 'transparent', border: `1px solid ${bgChosen ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Specialist background check choice</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
            {bgChosen ? (
              <>
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600 }}>{ob.background_check_type}</span>
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Done</span>
              </>
            ) : (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not completed</span>
            )}
          </span>
        </div>

        {/* Card is receipt-only — no confirmation email is ever sent for it. */}
        {(confirmSent || ob.bg_payment_method_type !== 'card') && (
          <AutoStep done={confirmSent} label="Payment confirmation email sent" date={ob.bg_confirmation_email_sent_at} />
        )}
        <AutoStep done={bgPaid} pending={ob.bg_payment_status === 'processing'} label="Payment cleared — receipt, next steps, and DD checklist sent" date={ob.bg_payment_completed_at} />

        {/* ── Background Check ── */}
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
        <SectionLabel>Background Check<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Background Check" context={emailCtx} templates={[
            { name: 'SPECIALIST_bg_confirmation|card', when: 'No longer sent automatically — card gets the invoice/receipt instead' },
            { name: 'SPECIALIST_bg_confirmation|ach', when: 'If paid by bank transfer (ACH) — the only method that gets a confirmation' },
            { name: 'SPECIALIST_bg_receipt', when: 'Automatic — background-check receipt' },
            { name: 'SPECIALIST_bg_passed', when: 'When the background check passes' },
          ]} /></span></SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: bgInitiated ? '#1b9254' : 'transparent', border: `1px solid ${bgInitiated ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Background check sent{ob.background_check_type ? ` to ${ob.background_check_type === 'Max' ? 'Scherzer International' : 'Checkr'}` : ''}</span>
          <span style={{ marginLeft: 'auto' }}>
            {bgInitiated
              ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Done</span>
              : <ActionButton label="Mark as sent" onClick={() => saveProgress(3, 'bg_initiated', 'completed')} color="#1b9254" />}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: bgResult ? (bgDone ? '#1b9254' : '#e74c3c') : 'transparent', border: `1px solid ${bgResult ? (bgDone ? '#1b9254' : '#e74c3c') : 'var(--vfo-border-mid)'}` }} />
          <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Background check results</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!bgResult ? (
              <>
                <ActionButton label="Passed" onClick={async () => { await saveProgress(3, 'bg_results_received', 'passed'); await loadDetail() }} color="#1b9254" />
                <ActionButton label="Failed" onClick={() => { saveProgress(3, 'bg_results_received', 'failed'); stopOnboarding() }} color="#e74c3c" />
              </>
            ) : bgDone ? (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Passed</span>
            ) : (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', fontWeight: 600 }}>Failed</span>
            )}
          </span>
        </div>
        {bgFailed && (
          <div style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'rgba(231,76,60,0.06)', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 600 }}>✗ Background check failed — onboarding stopped</span>
          </div>
        )}

        {/* ── Due Diligence Checklist ── */}
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
        <SectionLabel>Due Diligence Checklist<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Due Diligence Checklist" context={emailCtx} templates={[
            { name: 'SPECIALIST_ddc_approved', when: 'If approved' },
            { name: 'SPECIALIST_ddc_edits', when: 'If edits are requested' },
            { name: 'SPECIALIST_ddc_reminder', when: 'Automatic reminder if the checklist is not submitted (2 business days)' },
          ]} /></span></SectionLabel>

        <AutoStep done={ddcEmailed} label="Due diligence checklist emailed to client (Along with Final Revenue Share Proposal)" date={ob.ddc_email_sent_at} />
        <StallRows stall="ddc" />

        {/* Help requested — same paper-trail format as the Core/Max questions step */}
        {helpRequested && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: helpResolved ? '#1b9254' : '#e06717', border: `1px solid ${helpResolved ? '#1b9254' : '#e06717'}` }} />
            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>Answer the specialist's checklist questions</span>
            <span style={{ marginLeft: 'auto' }}>
              {helpResolved
                ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Help received</span>
                : <ActionButton label="Help received" onClick={() => saveProgress(3, 'ddc_help_resolved', 'completed')} color="#1b9254" />}
            </span>
          </div>
        )}

        {/* Checklist progress — grouped by the form's sections + question order.
            Collapsed: a section→question checklist. Expanded ("View answers"):
            each filled question's text + file downloads shown inline, in order. */}
        <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--vfo-tint-deep)', background: 'var(--vfo-tint)', margin: '8px 0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: '600' }}>Checklist progress</span>
            <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{ddFilled}/{ddTotal} answered</span>
          </div>
          {ddFilled > 0 && (
            <div style={{ marginBottom: '6px', paddingBottom: '8px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <span onClick={() => setShowSubmission(s => !s)} style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, cursor: 'pointer' }}>{showSubmission ? '▼ Hide answers' : '▶ View answers'}</span>
            </div>
          )}
          {ddcLayout.map(([section, items]) => (
            <div key={section} style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{section}</div>
              {items.map((it, idx) => {
                if (it.subheading) return (
                  <div key={`sh-${idx}`} style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', margin: '5px 0 2px 14px' }}>{it.subheading}</div>
                )
                const filled = ddItemFilled(it)
                const text = ddItemText(it)
                const files = ddItemFiles(it)
                return (
                  <div key={it.label} style={{ marginLeft: it.indent ? '14px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: filled ? '#1b9254' : 'transparent', border: `1px solid ${filled ? '#1b9254' : '#bac9e1'}`, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: filled ? 'var(--vfo-muted)' : '#6c7a96' }}>{it.label}</span>
                      {filled && <span style={{ fontSize: '11px', color: 'var(--vfo-ink)', fontWeight: 600, marginLeft: 'auto' }}>Entered</span>}
                    </div>
                    {showSubmission && filled && (
                      <div style={{ margin: '2px 0 8px 14px' }}>
                        {text && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: files.length ? '4px' : 0 }}>{text}</div>}
                        {files.map((f, i) => (
                          <div key={i} style={{ fontSize: '12px', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span onClick={() => openFile(f.path)} title={f.name} style={{ color: '#0095ff', cursor: 'pointer', textDecoration: 'underline', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
                            {f.size ? <span style={{ color: 'var(--vfo-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>· {Math.max(1, Math.round(f.size / 1024))} KB</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <AutoStep done={ddcEverSubmitted} label="Due diligence checklist submitted" date={ob.ddc_submitted_at} />

        {/* Review paper trail — every approve/deny round, oldest first */}
        {reviewLog.filter(e => e.type === 'denied' || e.type === 'approved').map((e, i) => (
          e.type === 'approved' ? (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: '#1b9254', border: '1px solid #1b9254' }} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', fontWeight: 600 }}>Due Diligence Checklist approved</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600 }}>Approved</span>
            </div>
          ) : (
            <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: '#e74c3c', border: '1px solid #e74c3c' }} />
                <span style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 600 }}>Due Diligence Checklist denied</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', fontWeight: 600 }}>Denied</span>
              </div>
              {e.reason && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: '4px 0 0 14px', padding: '6px 10px', background: 'var(--vfo-tint)', borderRadius: '6px', border: '1px solid var(--vfo-border-chip)' }}>{e.reason}</div>}
            </div>
          )
        ))}

        {/* Current review action — only while a submission is awaiting review */}
        {ddcReview === 'pending_review' && (
          <div style={{ padding: '6px 0 0' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', flex: 1 }}>Due Diligence Checklist approved?</span>
              <ActionButton label={ddcBusy === 'approve' ? 'Sending…' : 'Approved'} onClick={approveDdc} color="#1b9254" disabled={!!ddcBusy} />
              <ActionButton label="Denied" onClick={() => setShowEdits(s => !s)} color="#e74c3c" disabled={!!ddcBusy} />
            </div>
            {showEdits && (
              <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.3)', background: 'var(--vfo-tint)' }}>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>Reason — included in the email the specialist receives</div>
                <textarea value={editsReason} onChange={e => setEditsReason(e.target.value)} placeholder="Explain what needs to be changed or added…" rows={4} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ marginTop: '8px' }}>
                  <ActionButton label={ddcBusy === 'edits' ? 'Sending…' : 'Send to specialist'} onClick={sendEdits} color="#e74c3c" disabled={!!ddcBusy || !editsReason.trim()} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Final revenue share proposal ── */}
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
        <SectionLabel>Final revenue share proposal<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Final revenue share proposal" context={emailCtx} templates={[
            { name: 'SPECIALIST_revshare_complete', when: 'Revenue-share proposal complete' },
            { name: 'SPECIALIST_revfinal_reminder', when: 'Automatic reminder if the final proposal is unanswered (2 business days)' },
          ]} /></span></SectionLabel>

        <AutoStep done={revEmailed} label="Revenue share proposal emailed to client (Along with DD Checklist)" date={ob.bg_receipt_email_sent_at} />
        <StallRows stall="rev_share_final" />
        <AutoStep done={!!revResponse} label="Specialist response to revenue share proposal" detail={revResponse === 'Approved' ? 'Happy' : revResponse === 'Further Questions' ? 'Further questions' : ''} date={ob.rev_share_final_response_at} />
        <AutoStep done={revFinalDone} label="Final revenue share proposal" detail={revFinalDetail} date={revFinalizedAt} />

        {revResponse === 'Further Questions' && !revFinalized && (
          <div style={{ padding: '8px 0 4px 14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <ActionButton label={revBusy === 'keep' ? 'Saving…' : 'Confirm revenue share proposal'} onClick={keepRevShare} color="#1b9254" disabled={!!revBusy} />
              <ActionButton label="Edit revenue share proposal" onClick={() => { setRevEditText(revFinalText); setShowRevEdit(s => !s) }} color="#0095ff" disabled={!!revBusy} />
            </div>
            {showRevEdit && (
              <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.3)', background: 'var(--vfo-tint)' }}>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>Edit the revenue share proposal — submitting locks it in as final.</div>
                <textarea value={revEditText} onChange={e => setRevEditText(e.target.value)} rows={5} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ marginTop: '8px' }}>
                  <ActionButton label={revBusy === 'edit' ? 'Saving…' : 'Submit & make final'} onClick={submitRevEdit} color="#1b9254" disabled={!!revBusy || !revEditText.trim()} />
                </div>
              </div>
            )}
          </div>
        )}

        {revFinalDone && revFinalText && (
          <div style={{ padding: '4px 0 0 14px' }}>
            <span onClick={() => setShowRevProp(s => !s)} style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, cursor: 'pointer' }}>{showRevProp ? '▼ Hide final proposal' : '▶ View final proposal'}</span>
            {showRevProp && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: '6px', padding: '8px 10px', background: 'var(--vfo-tint)', borderRadius: '6px', border: '1px solid var(--vfo-border-chip)' }}>{revFinalText}</div>}
          </div>
        )}

        {/* ── Stage 3 progress ── */}
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
        <SectionLabel>Stage 3 progress</SectionLabel>
        {progressBullet('Background check', bgDone ? 'green' : bgFailed ? 'red' : 'grey', bgDone ? 'Passed' : bgFailed ? 'Failed' : 'Waiting')}
        {progressBullet('Due Diligence Checklist', ddcApproved ? 'green' : ddcEditsRequested ? 'red' : 'grey', ddcApproved ? 'Approved' : ddcEditsRequested ? 'Denied' : 'Waiting')}
        {progressBullet('Final Revenue Share Proposal', revFinalDone ? 'green' : 'grey', revFinalDone ? 'Final' : 'Waiting')}

      </>
    )
  }

  function Stage4Content() {
    // Final executive approval — same account-scoped two-round voting as Stage 2,
    // gated on the Stage 4 reviewer notes (Tracy always, Tim only for tax specialists).
    const myExec = EXEC_BY_EMAIL[(session?.email || '').toLowerCase()] || null
    // Stage 4 (final approval) opens on Tracy's notes alone — Tim's tax-risk
    // notes were already provided before the first executive vote (Stage 2).
    const votingOpen = !!getTaskStatus(4, 'tracy_general_notes')
    const r1BothVoted = hasVoted(4, 'Anton Anderson', 1) && hasVoted(4, 'Paul Latham', 1)
    const r1AnyFurther = r1BothVoted && (getVote(4, 'Anton Anderson', 1) === 'Further Questions' || getVote(4, 'Paul Latham', 1) === 'Further Questions')
    const r1BothApproved = r1BothVoted && getVote(4, 'Anton Anderson', 1) === 'Approved' && getVote(4, 'Paul Latham', 1) === 'Approved'
    const r2BothVoted = hasVoted(4, 'Anton Anderson', 2) && hasVoted(4, 'Paul Latham', 2)
    const r2BothApproved = r2BothVoted && getVote(4, 'Anton Anderson', 2) === 'Approved' && getVote(4, 'Paul Latham', 2) === 'Approved'
    const r2BothDenied = r2BothVoted && getVote(4, 'Anton Anderson', 2) === 'Denied' && getVote(4, 'Paul Latham', 2) === 'Denied'
    const denied4 = r2BothDenied
    const approvedBanner = { fontSize: '12px', color: '#1b9254', fontWeight: 600, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(27,146,84,0.3)', background: 'rgba(27,146,84,0.06)', marginBottom: '8px' }
    return (
      <>
        <ReviewerNotesSection stage={4} />
        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />

        <SectionLabel>Final executive approval</SectionLabel>
        {!votingOpen ? (
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-chip)', background: 'var(--vfo-tint)', marginBottom: '12px' }}>
            Voting opens once Tracy's notes are complete.
          </div>
        ) : (
          <>
            <Stage4DetailsDropdown />
            <ExecVoteRow stage={4} round={1} options={['Approved', 'Further Questions']} myExec={myExec} />
            {r1BothApproved && <div style={approvedBanner}>✓ Both executives approved.</div>}
            {r1AnyFurther && (
              <>
                <div style={{ fontSize: '12px', color: '#e06717', fontWeight: 600, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(251,137,90,0.3)', background: 'rgba(251,137,90,0.06)', margin: '12px 0' }}>An executive raised further questions — a second decision is needed after discussion.</div>
                <SectionLabel>Executive decision (after discussion)</SectionLabel>
                <ExecVoteRow stage={4} round={2} options={['Approved', 'Denied']} myExec={myExec} />
                {r2BothApproved && <div style={approvedBanner}>✓ Both executives approved.</div>}
              </>
            )}
          </>
        )}
        {denied4 && <div style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 600, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'rgba(231,76,60,0.06)', margin: '12px 0' }}>Both executives denied — decline email drafted, process stopped.</div>}

        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />

        <SectionLabel>Specialist Onboarding Agreement &amp; Set up Licensing fee subscription</SectionLabel>
        <AutoStep done={!!getTaskStatus(4, 'agreement_sent')} date={ob.agreement_sent_at} label={<>Engagement agreement created and sent for signing<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Onboarding agreement" context={emailCtx} templates={[
            { name: 'SPECIALIST_agreement_sent', when: 'Agreement signing link' },
            { name: 'SPECIALIST_ceo_countersign', when: 'Automatic — asks the CEO to countersign' },
            { name: 'SPECIALIST_signature_reminder', when: 'Automatic reminder if unsigned (2 business days)' },
          ]} /></span></>} />
        <StallRows stall="agreement_sign" />
        <AutoStep done={!!getTaskStatus(4, 'agreement_signed_specialist')} label="Engagement agreement signed" date={ob.agreement_signed_by_specialist_at} />
        <AutoStep done={!!getTaskStatus(4, 'agreement_signed_ceo')} label="Engagement agreement signed by CEO" date={ob.agreement_signed_by_ceo_at} />
        <AutoStep done={!!getTaskStatus(4, 'payment_link_sent')} date={ob.lic_payment_link_sent_at} label={<>Payment link sent (ACH or Card choice)<span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Licensing fee" context={emailCtx} templates={[
            { name: 'SPECIALIST_lic_payment', when: 'Automatic — monthly license payment link' },
            { name: 'SPECIALIST_lic_confirmation|card', when: 'No longer sent automatically — card gets the invoice/receipt instead' },
            { name: 'SPECIALIST_lic_confirmation|ach', when: 'If paid by bank transfer (ACH) — the only method that gets a confirmation' },
            { name: 'SPECIALIST_lic_invoicereceipt', when: 'Automatic — license invoice + receipt (monthly)' },
            { name: 'SPECIALIST_licpayment_reminder', when: 'Automatic reminder if the license payment is not made (2 business days)' },
          ]} /></span></>} />
        <StallRows stall="lic_payment" />
        <AutoStep done={!!getTaskStatus(4, 'payment_made')} label="Payment collected" date={ob.lic_payment_completed_at} />
        {/* Card is receipt-only — the confirmation progress task is never stamped for it. */}
        {(!!getTaskStatus(4, 'confirmation_email_sent') || ob.lic_payment_method_type !== 'card') && (
          <AutoStep done={!!getTaskStatus(4, 'confirmation_email_sent')} label="Confirmation email sent" date={ob.lic_confirmation_email_sent_at} />
        )}
        <AutoStep done={!!getTaskStatus(4, 'invoice_receipt_sent')} label="Invoice and receipt created and emailed to client" date={ob.lic_invoice_receipt_email_sent_at} />
      </>
    )
  }
 
  function TeamMembersInput({ currentNotes, onSave }) {
    const [names, setNames] = useState(currentNotes)
    const [saved, setSaved] = useState(false)

    async function handleSave() {
      await onSave(names)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }

    return (
      <div style={{ padding: '10px 0 10px 26px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '6px' }}>Team member names</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea value={names} onChange={e => { setNames(e.target.value); setSaved(false) }} placeholder="Enter team member names..." rows={2} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <ActionButton label={saved ? '✓ Saved' : 'Save'} onClick={handleSave} color={saved ? '#1b9254' : '#0095ff'} disabled={saved} />
          </div>
        </div>
      </div>
    )
  }

  function SkoolInviteStep() {
    const sent = !!getTaskStatus(5, 'skool_invite')
    const sentLink = progress['5-skool_invite']?.notes || ''
    const [open, setOpen] = useState(false)
    const [link, setLink] = useState('')
    const [sending, setSending] = useState(false)

    async function send() {
      const v = link.trim()
      if (!v || sending) return
      setSending(true)
      try {
        await callApi('automation_SPECIALIST_skoolinvite', { onboarding_id: id, skool_link: v })
        await loadDetail()
        setOpen(false)
        setLink('')
      } catch (err) { console.error(err) }
      finally { setSending(false) }
    }

    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--vfo-ink)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sent ? '#1b9254' : 'transparent', border: `1px solid ${sent ? '#1b9254' : 'var(--vfo-border-mid)'}`, flexShrink: 0 }} />
            {sent ? 'Invite to VFO Skool sent' : 'Send invite to VFO Skool'}
          </span>
          {!open && (
            sent
              ? (!isStopped && <ActionButton label="Send again" onClick={() => { setLink(sentLink); setOpen(true) }} color="#1b9254" />)
              : <ActionButton label="Attach link and send email" onClick={() => setOpen(true)} color="#1b9254" />
          )}
        </div>
        {sent && !open && sentLink && (
          <div style={{ marginTop: '4px' }}><a href={sentLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#0095ff', wordBreak: 'break-all' }}>{sentLink}</a></div>
        )}
        {open && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="Paste the VFO Skool invite link..." style={{ ...inputStyle, flex: 1 }} />
            <ActionButton label={sending ? 'Sending...' : 'Send'} onClick={send} color="#1b9254" disabled={!link.trim() || sending} />
            <ActionButton label="Cancel" onClick={() => { setOpen(false); setLink('') }} color="#e74c3c" disabled={sending} />
          </div>
        )}
      </div>
    )
  }

  function Stage5Content() {
    const teamAdded = !!getTaskStatus(5, 'team_members_added')
    return (
      <>
        <SectionLabel>VFO Skool</SectionLabel>
        <SkoolInviteStep />
        <CheckItem done={!!getTaskStatus(5, 'intro_post')} label="Introduction post made" onClick={() => saveProgress(5, 'intro_post', 'Completed')} />
        <CheckItem done={teamAdded} toggle label="Additional team members added (optional)" onClick={() => saveProgress(5, 'team_members_added', teamAdded ? 'unchecked' : 'Completed')} />
        {teamAdded && (
          <TeamMembersInput currentNotes={progress['5-team_members_added']?.notes || ''} onSave={(notes) => saveProgress(5, 'team_members_added', 'Completed', notes)} />
        )}

        <div style={{ borderTop: '1px solid var(--vfo-border)', margin: '16px 0' }} />
 
        <SectionLabel>VFO Showroom<span style={{ marginLeft: '8px', textTransform: 'none' }}><StepEmailsChip pipeline="SPECIALIST_ONBOARDING" title="Skool & login" context={emailCtx} templates={[
            { name: 'SPECIALIST_skool_invite', when: 'Skool community invite' },
            { name: 'SPECIALIST_login_setup', when: 'Portal login setup email' },
          ]} /></span></SectionLabel>
        {!getTaskStatus(5, 'added_to_showroom') ? (
          <>
            <button onClick={createSpecialistAndShowroom} disabled={isStopped || saving['5-added_to_showroom']} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: (isStopped || saving['5-added_to_showroom']) ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' }}>{saving['5-added_to_showroom'] ? 'Creating…' : 'Add to Showroom & Send Specialist Login'}</button>
            <p style={{ fontSize: '11px', color: 'var(--vfo-muted)', textAlign: 'center', marginTop: '8px', marginBottom: 0 }}>Creates their Showroom profile from the SIF, copies their Due Diligence documents into their portal vault, and emails them a login-setup link.</p>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1b9254', border: '1px solid #1b9254', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>Specialist created — Showroom profile added, login email sent</span>
            </div>
            <div style={{ marginTop: '6px' }}>
              <ShowroomCheck taskKey="headshot_added" label="Headshot (white background) added" />
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0, fontFamily: 'Inter, sans-serif' }}>← Back to list</button>
 
      <TrackHero
        eyebrow="Specialist Onboarding"
        title={ob.specialist_name}
        meta={
          <>
            {isStopped && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(231,76,60,0.15)', color: '#e74c3c', fontWeight: 600, border: '1px solid rgba(231,76,60,0.3)' }}>Stopped</span>}
            {isCompleted && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Completed</span>}
            {!isStopped && !isCompleted && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>Stage {ob.current_stage} · {STAGE_NAMES[ob.current_stage]}</span>}
            <span>{ob.specialist_email || 'No email'} · Started {formatDate(ob.created_at)}</span>
          </>
        }
        steps={[1, 2, 3, 4, 5].map(s => ({ label: STAGE_NAMES[s], state: getStageState(s) }))}
        action={!isCompleted && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{isStopped ? 'Stopped' : 'Live'}</span>
            <div onClick={() => { if (!togglingStatus) toggleStatus() }}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: isStopped ? '#e74c3c' : '#1b9254', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: isStopped ? '2px' : '22px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />
 
      <StageHeader stage={1} title="Stage 1 — Preliminary Meeting" />
      <StageHeader stage={2} title="Stage 2 — Detail Meetings" />
      <StageHeader stage={3} title="Stage 3 — Due Diligence" />
      <StageHeader stage={4} title="Stage 4 — Contract & Details" />
      <StageHeader stage={5} title="Stage 5 — Going Live" />
    </div>
  )
}