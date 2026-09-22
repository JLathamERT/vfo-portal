import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { callApi, getSession } from '../../lib/api'
import { AdvisorOnboardingListSkeleton, AdvisorOnboardingDetailSkeleton } from '../shared/Skeleton'
import { TrackHero, PhaseBadge, ListHeader } from '../shared/TrackKit'
import NewModelSaleModal from './NewModelSaleModal'

// The Team Member Responsible step offers only the people who run preliminary
// meetings; the New Model Sale modal keeps the wider SALES_TEAM_NAMES list. A
// row already holding another name keeps showing it (the option is appended).
const ONBOARDING_TEAM_MEMBER_NAMES = ['Ian Welham', 'Vanessa Smith', 'Rachael Hopson', 'Jake Latham']
import OnboardingExtraMeetingCard from './OnboardingExtraMeetingCard'
import StepEmailsChip from '../shared/StepEmailsChip'
import { MemberNameLink } from '../shared/personLinks'
import { formatDate as formatFullDate } from '../../lib/dates'

const STAGE_NAMES = ['', 'Preliminary Meeting', 'PC Admin', 'Add New Advisor']

// Read-only per-step email previews (see StepEmailsChip).
const ADVISOR_PIPELINE = 'ADVISOR_ONBOARDING'
const ADVISOR_MEETING_REMINDER_EMAILS = [
  { name: 'ADVISOR_meeting_reminder', when: 'Automatic — sent 1 business day before the meeting (CONFIRM / CANCEL / RESCHEDULE buttons)' },
  { name: 'ADVISOR_meeting_reminder_60m', when: 'Automatic — 60 minutes before, if confirmed' },
  { name: 'ADVISOR_meeting_reminder_10m', when: 'Automatic — 10 minutes before, if confirmed' },
]
const ADVISOR_DEPOSIT_EMAILS = [
  { name: 'ADVISOR_deposit_payment_link', when: 'Deposit payment link (ACH or Card choice)' },
  { name: 'ADVISOR_deposit_received', when: 'Automatic — sent when the deposit is paid' },
  { name: 'ADVISOR_deposit_reminder', when: 'Automatic reminder if unpaid (2 business days)' },
  { name: 'ADVISOR_deposit_refund', when: 'Refund — deposit refunded with your reason' },
]
const ADVISOR_DECISION_EMAILS = [
  { name: 'ADVISOR_undecided', when: 'If Undecided — decision email with buttons' },
  { name: 'ADVISOR_undecided_reminder', when: 'Automatic reminder if no response (2 business days); auto-declines after 14 days' },
  { name: 'ADVISOR_decline', when: 'If No — decline email (also sent on 14-day auto-decline)' },
]
const ADVISOR_AGREEMENT_EMAILS = [
  { name: 'ADVISOR_agreement_sent', when: 'Automatic — agreement signing link (sent on Yes)' },
  { name: 'ADVISOR_signing_reminder', when: 'Automatic reminder if unsigned (2 business days)' },
]
const ADVISOR_CEO_EMAILS = [
  { name: 'ADVISOR_ceo_countersign', when: 'Automatic — asks the CEO to countersign' },
]
const ADVISOR_PAYMENT_LINK_EMAILS = [
  { name: 'ADVISOR_payment_link', when: 'Automatic — onboarding payment link' },
  { name: 'ADVISOR_payment_reminder', when: 'Automatic reminder if unpaid (2 business days)' },
]
const ADVISOR_CONFIRMATION_EMAILS = [
  { name: 'ADVISOR_payment_confirmation|card', when: 'No longer sent automatically — card gets the invoice/receipt instead' },
  { name: 'ADVISOR_payment_confirmation|ach', when: 'If paid by bank transfer (ACH) — the only method that gets a confirmation' },
]
const ADVISOR_INVOICE_EMAILS = [
  { name: 'ADVISOR_invoice_receipt', when: 'Automatic — invoice + receipt' },
]
const ADVISOR_LOGIN_EMAILS = [
  { name: 'ADVISOR_login_setup', when: 'Portal login setup email' },
]

// The two per-program implementation prices. `col` is the stored column,
// `body` the request field — only the committed one is ever sent.
const IMPL_FIELDS = {
  vfo_ft: { label: 'VFO FT', col: 'implementation_value_vfo_ft', body: 'vfo_ft_value' },
  pft: { label: 'PFT', col: 'implementation_value_pft', body: 'pft_value' },
}

// Rows written before the outcome was split into deposit/no-deposit carry the
// bare 'Completed' — it means "no deposit", so it displays and gates as that.
const LEGACY_PRELIM_STATUS = 'Completed'
const PRELIM_NO_DEPOSIT = 'Completed - No Deposit'
const PRELIM_SEND_DEPOSIT = 'Completed - Send Deposit'
const MEETING_TIMEZONES = [
  ['ET', 'Eastern (ET)'],
  ['CT', 'Central (CT)'],
  ['MT', 'Mountain (MT)'],
  ['PT', 'Pacific (PT)'],
  ['AKT', 'Alaska (AKT)'],
  ['HT', 'Hawaii (HT)'],
]

export default function AdvisorOnboarding() {
  const [view, setView] = useState('list')
  const [onboardings, setOnboardings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showStopped, setShowStopped] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const session = getSession()

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  useEffect(() => { loadList() }, [])

  // Deep-link from a notification: /admin?...&onboarding=<id> opens that record.
  useEffect(() => {
    const openId = searchParams.get('onboarding')
    if (openId) { setSelectedId(parseInt(openId, 10)); setView('detail') }
  }, [searchParams])

  async function loadList() {
    setLoading(true)
    try {
      const data = await callApi('load_advisor_onboardings')
      setOnboardings(data.onboardings || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function createNew() {
    if (!newFirst.trim() || !newLast.trim()) return
    setCreating(true)
    try {
      await callApi('create_advisor_onboarding', {
        first_name: newFirst.trim(),
        last_name: newLast.trim(),
        email: newEmail.trim() || null,
        created_by: session?.name || 'Admin',
      })
      setNewFirst(''); setNewLast(''); setNewEmail(''); setShowNew(false)
      await loadList()
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
  }

  if (view === 'detail' && selectedId) {
    return <OnboardingDetail id={selectedId} onBack={() => {
      setView('list'); setSelectedId(null); loadList()
      // Clear a consumed/stale deep-link param so a deleted id can't re-open.
      if (searchParams.get('onboarding')) { const n = new URLSearchParams(searchParams); n.delete('onboarding'); n.delete('_n'); setSearchParams(n, { replace: true }) }
    }} />
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <ListHeader
        title="Advisor Onboarding"
        count={onboardings.length}
        action={<button onClick={() => setShowNew(!showNew)} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ New Onboarding</button>}
      />

      {showNew && (
        <div style={{ ...sectionStyle, marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Start New Advisor Onboarding</div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>First Name *</label>
              <input value={newFirst} onChange={e => setNewFirst(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Last Name *</label>
              <input value={newLast} onChange={e => setNewLast(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Work Email *</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Work email address" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createNew} disabled={creating || !newFirst.trim() || !newLast.trim() || !newEmail.trim()} style={{ padding: '8px 20px', borderRadius: '8px', background: creating ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '13px', cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setShowNew(false); setNewFirst(''); setNewLast(''); setNewEmail('') }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <AdvisorOnboardingListSkeleton />
      ) : onboardings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--vfo-muted)' }}>No onboarding records yet. Click "+ New Onboarding" to start.</div>
      ) : (() => {
        // status is the single source of truth for stopped now (backfilled, and
        // written by every stop-meaning branch). The old inline derivation missed
        // 'Auto-Declined', so 14-day implicit-No rows rendered as in-progress.
        const classify = ob => {
          if (ob.member_created_at) return 'completed'
          if (ob.status === 'stopped') return 'stopped'
          return 'in_progress'
        }
        const inProgress = onboardings.filter(o => classify(o) === 'in_progress')
        const completed = onboardings.filter(o => classify(o) === 'completed')
        const stopped = onboardings.filter(o => classify(o) === 'stopped')

        const renderRow = (ob, variant) => {
          const stage = ob.member_created_at ? 3 : ob.prelim_meeting_decision ? 2 : 1
          const isDone = variant === 'completed'
          const isStopped = variant === 'stopped'
          const stageColor = isStopped ? '#e74c3c' : isDone ? '#1b9254' : '#0095ff'
          const labelText = isDone ? 'Done' : isStopped ? 'Stopped' : STAGE_NAMES[stage]
          const bg = isStopped ? 'rgba(231,76,60,0.15)' : isDone ? 'rgba(27,146,84,0.15)' : 'rgba(0,149,255,0.15)'
          const border = isStopped ? 'rgba(231,76,60,0.3)' : isDone ? 'rgba(27,146,84,0.3)' : 'rgba(0,149,255,0.3)'
          return (
            <div key={ob.id} onClick={() => { setSelectedId(ob.id); setView('detail'); const n = new URLSearchParams(searchParams); n.set('onboarding', String(ob.id)); setSearchParams(n, { replace: true }) }} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px', marginBottom: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,149,255,0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vfo-border)'}>
              <div>
                <div style={{ fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: '500', marginBottom: '4px' }}><MemberNameLink memberNumber={ob.member_number}>{ob.first_name} {ob.last_name}</MemberNameLink>{ob.member_number ? <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontFamily: 'monospace', marginLeft: '8px' }}>#{ob.member_number}</span> : null}</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{ob.email || 'No email'} · Started {formatFullDate(ob.created_at)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: bg, color: stageColor, border: `1px solid ${border}` }}>
                  {labelText}
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
            {inProgress.map(ob => renderRow(ob, 'in_progress'))}

            {completed.length > 0 && (
              <>
                <SectionHeader title="Completed" count={completed.length} open={showCompleted} onToggle={() => setShowCompleted(v => !v)} color="#1b9254" />
                {showCompleted && completed.map(ob => renderRow(ob, 'completed'))}
              </>
            )}

            {stopped.length > 0 && (
              <>
                <SectionHeader title="Stopped" count={stopped.length} open={showStopped} onToggle={() => setShowStopped(v => !v)} color="#e74c3c" />
                {showStopped && stopped.map(ob => renderRow(ob, 'stopped'))}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function OnboardingDetail({ id, onBack }) {
  const navigate = useNavigate()
  const [ob, setOb] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingDecision, setPendingDecision] = useState(null)
  const [creatingMember, setCreatingMember] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [expanded, setExpanded] = useState({ 1: true, 2: true, 3: true })
  const [implBuf, setImplBuf] = useState({ vfo_ft: '', pft: '' })
  const [implFocus, setImplFocus] = useState(null)
  const [reminderForm, setReminderForm] = useState({ open: false, reschedule: false, date: '', time: '', tz: 'ET' })
  const [reminderBusy, setReminderBusy] = useState(false)
  const [depositBuf, setDepositBuf] = useState('')
  const [depositBusy, setDepositBusy] = useState(false)
  const [refundDraft, setRefundDraft] = useState({ open: false, reason: '', sending: false })

  useEffect(() => { loadDetail() }, [id])

  // Buffer the typed dollars locally and only save on blur / Enter (same idiom
  // as StepDate) — re-seed whenever a stored value changes underneath us.
  useEffect(() => {
    const seed = v => (v == null || v === '' ? '' : String(Number(v)))
    setImplBuf({ vfo_ft: seed(ob?.implementation_value_vfo_ft), pft: seed(ob?.implementation_value_pft) })
  }, [ob?.implementation_value_vfo_ft, ob?.implementation_value_pft])

  async function loadDetail() {
    setLoading(true)
    try {
      const data = await callApi('load_advisor_onboarding', { onboarding_id: id })
      if (!data?.onboarding) { onBack(); return }   // deleted/missing → back to list
      setOb(data.onboarding)
      // Default a fully-done stage to collapsed, computed ONCE per loaded
      // onboarding so later manual toggles and live setOb updates aren't
      // overwritten. Mirrors stage1State/stage2State/stage3State below.
      const row = data.onboarding
      const dec = row.prelim_meeting_decision
      const fin = row.final_decision || (dec === 'Yes' ? 'Yes' : dec === 'No' ? 'No' : null)
      const yes = fin === 'Yes'
      const no = fin === 'No'
      const s1 = !row.prelim_meeting_status ? 'pending' : !row.prelim_meeting_decision ? 'active' : 'done'
      const s2 = !dec ? 'pending' : (no && row.decline_email_sent_at) ? 'done' : (yes && row.invoice_sent_at) ? 'done' : 'active'
      const s3 = row.member_created_at ? 'done' : (yes && row.invoice_sent_at) ? 'active' : 'pending'
      setExpanded({ 1: s1 !== 'done', 2: s2 !== 'done', 3: s3 !== 'done' })
    } catch (err) {
      // A stale deep-link to a deleted onboarding 404s — bounce to the list
      // instead of getting stuck on an error.
      if (String(err?.message || err).toLowerCase().includes('not found')) { onBack(); return }
      console.error(err)
    }
    finally { setLoading(false) }
  }

  async function savePrelimMeeting(status) {
    setSaving(true)
    try {
      const res = await callApi('save_advisor_prelim_meeting', { onboarding_id: id, status: status || null })
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setSaving(false) }
  }

  async function saveTeamMember(name) {
    setSaving(true)
    try {
      const res = await callApi('save_advisor_team_member', { onboarding_id: id, team_member: name || null })
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setSaving(false) }
  }

  function openReminderForm(reschedule) {
    setReminderForm({
      open: true,
      reschedule,
      date: ob?.meeting_date || '',
      time: String(ob?.meeting_time || '').slice(0, 5),
      tz: ob?.meeting_timezone || 'ET',
    })
  }

  async function sendMeetingReminder(body) {
    setReminderBusy(true)
    try {
      const res = await callApi('automation_ADVISOR_meetingreminder', { onboarding_id: id, ...body })
      if (res?.error) { alert('Error: ' + res.error); return }
      if (res?.onboarding) setOb(res.onboarding)
      setReminderForm({ open: false, reschedule: false, date: '', time: '', tz: 'ET' })
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setReminderBusy(false) }
  }

  function submitMeetingReminder() {
    if (!reminderForm.date || !reminderForm.time) return
    if (!window.confirm('This reminder will be sent to the prospective advisor 1 business day before the meeting.')) return
    sendMeetingReminder({
      mode: 'schedule',
      meeting_date: reminderForm.date,
      meeting_time: reminderForm.time,
      meeting_tz: reminderForm.tz || 'ET',
      reschedule: !!reminderForm.reschedule,
    })
  }

  // Only the field being committed goes in the body — an absent field is left
  // untouched, so the two inputs never clobber each other.
  async function saveImplementationValue(patch) {
    setSaving(true)
    try {
      const res = await callApi('save_advisor_implementation_value', { onboarding_id: id, ...patch })
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setSaving(false) }
  }

  function commitImplementationValue(key) {
    const f = IMPL_FIELDS[key]
    setImplFocus(null)
    const rawStored = ob?.[f.col]
    const stored = rawStored == null || rawStored === '' ? null : Number(rawStored)
    const typed = (implBuf[key] || '').trim()
    const revert = v => setImplBuf(p => ({ ...p, [key]: v }))
    if (typed === '') {
      if (stored != null) saveImplementationValue({ [f.body]: null })
      return
    }
    const n = Math.round(parseFloat(typed) * 100) / 100
    if (!Number.isFinite(n) || n <= 0) { revert(stored != null ? String(stored) : ''); return }
    if (stored != null && n === stored) { revert(String(stored)); return }
    saveImplementationValue({ [f.body]: n })
  }

  async function sendDepositEmail(amount) {
    setDepositBusy(true)
    try {
      const res = await callApi('automation_ADVISOR_depositemail', { onboarding_id: id, amount })
      if (res?.error) { alert('Error: ' + res.error); return }
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setDepositBusy(false) }
  }

  async function sendDepositRefund(reason) {
    if (!window.confirm('Refund the deposit via Stripe and send the refund email?\n\nThis refunds the deposit PaymentIntent in full, stops this onboarding and emails the advisor including your reason(s). Cannot be undone.')) return
    setRefundDraft(d => ({ ...d, sending: true }))
    try {
      const res = await callApi('automation_ADVISOR_depositrefund', { onboarding_id: id, reason })
      if (res?.error) { alert('Error: ' + res.error); setRefundDraft(d => ({ ...d, sending: false })); return }
      if (res?.onboarding) setOb(res.onboarding)
      setRefundDraft({ open: false, reason: '', sending: false })
    } catch (err) {
      console.error(err); alert('Error: ' + err.message)
      setRefundDraft(d => ({ ...d, sending: false }))
    }
  }

  async function saveDecision(decision) {
    setPendingDecision(decision)
    try {
      const res = await callApi('automation_ADVISOR_decision', { onboarding_id: id, decision })
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setPendingDecision(null) }
  }

  // Inline edit of a manual step's completion date (matches the tracking tracks).
  async function saveStepDate(field, date) {
    setSaving(true)
    try {
      const res = await callApi('save_onboarding_step_date', { pipeline: 'ADVISOR', onboarding_id: id, field, date })
      if (res?.onboarding) setOb(res.onboarding)
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setSaving(false) }
  }

  async function toggleStatus() {
    const newStatus = ob?.status === 'stopped' ? 'active' : 'stopped'
    setTogglingStatus(true)
    try {
      const res = await callApi('advisor_update_status', { onboarding_id: id, status: newStatus })
      if (res?.onboarding) setOb(res.onboarding)
      else setOb(p => (p ? { ...p, status: newStatus } : p))
    } catch (err) { console.error(err) }
    finally { setTogglingStatus(false) }
  }

  async function createAdvisor(saleFields) {
    setCreatingMember(true)
    try {
      const res = await callApi('automation_ADVISOR_createmember', { onboarding_id: id, ...(saleFields || {}) })
      if (res?.error) { alert('Error: ' + res.error); return }
      setShowSaleModal(false)
      await loadDetail()
    } catch (err) { console.error(err); alert('Error: ' + err.message) }
    finally { setCreatingMember(false) }
  }

  if (loading) return <AdvisorOnboardingDetailSkeleton onBack={onBack} />
  if (!ob) return (
    <div style={{ padding: '40px', color: 'var(--vfo-muted)', textAlign: 'center' }}>
      <p>This onboarding no longer exists.</p>
      <button onClick={onBack} style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: '#0095ff', fontSize: '13px', cursor: 'pointer' }}>← Back to list</button>
    </div>
  )

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Backend tokens: [Advisor Name] = full name, [Advisor First] = first name.
  const emailCtx = (() => {
    const ctx = {}
    const full = `${ob.first_name || ''} ${ob.last_name || ''}`.trim()
    if (full) ctx['Advisor Name'] = full
    const first = (ob.first_name || '').trim() || full.split(/\s+/)[0]
    if (first) ctx['Advisor First'] = first
    return ctx
  })()

  const decision = ob.prelim_meeting_decision
  const finalDec = ob.final_decision || (decision === 'Yes' ? 'Yes' : decision === 'No' ? 'No' : null)
  const yesPath = finalDec === 'Yes'
  const noPath = finalDec === 'No'
  const undecidedPending = decision === 'Undecided' && !ob.final_decision

  // The implementation values become the per-program prices on the agreement
  // and the charge, so the decision can't be sent until both are set.
  const bothValuesSet = Number(ob.implementation_value_vfo_ft) > 0 && Number(ob.implementation_value_pft) > 0
  const decisionBlocked = !ob.onboarding_team_member || !bothValuesSet

  // Stage 1 runs strictly in order now: team member, then the meeting reminder,
  // then the meeting outcome, then the value and the decision. A step that is
  // already done is never locked, so legacy rows keep rendering what they hold.
  const prelimStatus = ob.prelim_meeting_status
  const depositSent = !!ob.deposit_email_sent_at
  const reminderDone = !!(ob.meeting_reminder_scheduled_at || ob.meeting_reminder_skipped_at)
  const reminderDate = ob.meeting_reminder_scheduled_at || ob.meeting_reminder_skipped_at
  const prelimSettled = prelimStatus === PRELIM_NO_DEPOSIT || prelimStatus === LEGACY_PRELIM_STATUS
    || prelimStatus === 'Request no meeting'
    || (prelimStatus === PRELIM_SEND_DEPOSIT && depositSent)
  const prelimLockHint = prelimStatus === PRELIM_SEND_DEPOSIT && !depositSent
    ? 'Send the deposit link first'
    : 'Complete the Preliminary Meeting step first'
  const prelimSelectValue = prelimStatus === LEGACY_PRELIM_STATUS ? PRELIM_NO_DEPOSIT : (prelimStatus || '')

  const tdInput = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }
  const tdGreen = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: reminderBusy ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600 }
  const tdCancel = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: reminderBusy ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
  const meetingLabel = [ob.meeting_date, String(ob.meeting_time || '').slice(0, 5), ob.meeting_timezone].filter(Boolean).join(' ')
  const reminderSendable = !!reminderForm.date && !!reminderForm.time

  const reminderControl = reminderForm.open ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="date" value={reminderForm.date} onChange={e => setReminderForm(f => ({ ...f, date: e.target.value }))} style={tdInput} />
      <input type="time" value={reminderForm.time} onChange={e => setReminderForm(f => ({ ...f, time: e.target.value }))} style={tdInput} />
      <select value={reminderForm.tz} onChange={e => setReminderForm(f => ({ ...f, tz: e.target.value }))} style={{ ...tdInput, background: 'var(--vfo-card)' }}>
        {MEETING_TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button disabled={reminderBusy || !reminderSendable} onClick={submitMeetingReminder} style={{ ...tdGreen, opacity: (reminderBusy || !reminderSendable) ? 0.6 : 1 }}>{reminderBusy ? 'Sending...' : 'Send'}</button>
      <button disabled={reminderBusy} onClick={() => setReminderForm(f => ({ ...f, open: false }))} style={tdCancel}>Cancel</button>
    </div>
  ) : ob.meeting_reminder_scheduled_at ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={pillStyle('#1b9254')}>Reminder scheduled — {meetingLabel}</span>
      <button disabled={reminderBusy} onClick={() => openReminderForm(true)} style={tdCancel} title="Pick a new date/time and re-schedule the reminder.">Reschedule</button>
    </div>
  ) : ob.meeting_reminder_skipped_at ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={neutralPillStyle}>Reminder skipped</span>
      <button disabled={reminderBusy} onClick={() => openReminderForm(false)} style={tdCancel} title="Pick a new date/time and re-schedule the reminder.">Schedule reminder</button>
    </div>
  ) : (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <button disabled={reminderBusy} onClick={() => openReminderForm(false)} style={tdGreen}>Send reminder (with date)</button>
      <button disabled={reminderBusy} onClick={() => sendMeetingReminder({ mode: 'skip' })} style={tdCancel}>Skip reminder</button>
    </div>
  )

  const responseTag = ob.meeting_response === 'confirm' ? 'Confirmed'
    : ob.meeting_response === 'cancel' ? 'Cancelled'
      : ob.meeting_response === 'reschedule' ? 'Reschedule requested' : null

  const reminderCascade = ob.meeting_reminder_scheduled_at ? (
    <div style={{ marginLeft: '18px', marginBottom: '4px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
      <AutoRow label="Reminder email sent (1 business day before)" done={!!ob.meeting_reminder_sent_at} date={ob.meeting_reminder_sent_at} />
      {!ob.meeting_reminder_sent_at && ob.meeting_reminder_due_at && (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', padding: '4px 0 0 14px' }}>{new Date(ob.meeting_reminder_due_at) <= new Date() ? 'Sends on the next sweep run (within 5 minutes) — the 1-business-day mark has already passed' : `Sends ${formatStampFull(ob.meeting_reminder_due_at)} (1 business day before the meeting)`}</div>
      )}
      <AutoRow label="Prospective advisor responded" done={!!ob.meeting_response} date={ob.meeting_response_at} tag={responseTag} />
      <AutoRow label="60-minute reminder sent" done={!!ob.meeting_reminder_60m_sent_at} date={ob.meeting_reminder_60m_sent_at} />
      <AutoRow label="10-minute reminder sent" done={!!ob.meeting_reminder_10m_sent_at} date={ob.meeting_reminder_10m_sent_at} />
    </div>
  ) : null

  // Membership deposit: only ever offered on the "send deposit" outcome, and the
  // amount is typed once — the row turns into a chip the moment the link goes out.
  const depositStatus = ob.deposit_status
  const depositRefunded = depositStatus === 'refunded'
  const depositAmount = Number(ob.deposit_amount) || 0
  const depositTyped = parseFloat(depositBuf)
  const depositSendable = Number.isFinite(depositTyped) && depositTyped >= 500 && depositTyped <= 4000
  // A refunded or already-swept-through deposit has nothing left to give back.
  const depositRefundable = depositStatus === 'succeeded' && !ob.deposit_refund_id
    && ob.payment_status !== 'succeeded' && ob.payment_status !== 'processing'
  const refundSending = !!refundDraft.sending
  const refundReason = refundDraft.reason || ''
  const trRed = { padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: refundSending ? 'not-allowed' : 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)', color: '#e74c3c', fontWeight: 600 }
  const advisorFullName = `${ob.first_name || ''} ${ob.last_name || ''}`.trim()
  const advisorFirstName = (ob.first_name || '').trim() || advisorFullName.split(/\s+/)[0] || ''

  const depositControl = !depositSent ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>$</span>
      <input
        value={depositBuf}
        inputMode="decimal"
        placeholder="0.00"
        disabled={depositBusy}
        onChange={e => setDepositBuf(sanitizeMoney(e.target.value))}
        onKeyDown={e => { if (e.key === 'Enter' && depositSendable && !depositBusy) sendDepositEmail(Math.round(depositTyped * 100) / 100) }}
        title="Deposit amount — the advisor gets an ACH or Card payment link for this"
        style={{ ...selectStyle, minWidth: '100px', width: '100px', textAlign: 'right' }}
      />
      <button disabled={depositBusy || !depositSendable} onClick={() => sendDepositEmail(Math.round(depositTyped * 100) / 100)} style={{ ...tdGreen, cursor: (depositBusy || !depositSendable) ? 'not-allowed' : 'pointer', opacity: (depositBusy || !depositSendable) ? 0.6 : 1 }}>{depositBusy ? 'Sending...' : 'Send'}</button>
    </div>
  ) : depositRefunded ? (
    <span style={pillStyle('#1b9254')}>Refunded ${fmtMoney(ob.deposit_refund_amount)}</span>
  ) : depositStatus === 'succeeded' ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={pillStyle('#1b9254')}>Deposit paid — ${fmtMoney(depositAmount)}</span>
      {depositRefundable && !refundDraft.open && <button disabled={refundSending} onClick={() => setRefundDraft({ open: true, reason: '', sending: false })} style={trRed}>Refund</button>}
    </div>
  ) : depositStatus === 'processing' ? (
    <span style={pillStyle('#e06717')}>Deposit pending (ACH clearing) — ${fmtMoney(depositAmount)}</span>
  ) : depositStatus === 'failed' ? (
    <span style={pillStyle('#e74c3c')}>Deposit failed</span>
  ) : (
    <span style={pillStyle('#0095ff')}>Deposit link sent — ${fmtMoney(depositAmount)}</span>
  )

  const depositRefundCard = refundDraft.open ? (
    <div style={{ marginLeft: '18px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
        Subject: Elite Resource Team - Membership Deposit refunded — {advisorFullName || '[Advisor Name]'}
      </div>
      <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
        <p style={{ margin: '0 0 12px' }}>Dear {advisorFirstName || '[Advisor First]'},</p>
        <textarea
          value={refundReason}
          onChange={e => setRefundDraft(d => ({ ...d, reason: e.target.value }))}
          placeholder="Type the reason we are not moving forward here - written as if speaking directly to the advisor."
          disabled={refundSending}
          style={{ width: '100%', minHeight: '90px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
        />
        <p style={{ margin: '0 0 12px' }}>We have refunded your ERT Membership Deposit of ${fmtMoney(depositAmount)}. You should see the funds back in your account within the next few days.</p>
        <p style={{ margin: '0 0 12px' }}>If you have any questions, just let us know.</p>
        <p style={{ margin: '0 0 12px' }}>Thank you for your time.</p>
        <p style={{ margin: 0 }}>Regards,</p>
      </div>
      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button disabled={refundSending} onClick={() => setRefundDraft({ open: false, reason: '', sending: false })} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: refundSending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
        <button disabled={refundSending || !refundReason.trim()} onClick={() => sendDepositRefund(refundReason.trim())} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: (refundSending || !refundReason.trim()) ? 'not-allowed' : 'pointer', border: '1px solid rgba(231,76,60,0.4)', background: refundReason.trim() ? 'rgba(231,76,60,0.18)' : 'rgba(231,76,60,0.06)', color: '#e74c3c', fontWeight: '600' }} title={!refundReason.trim() ? 'Enter the reason(s) first' : ''}>{refundSending ? 'Sending...' : 'Send Refund'}</button>
      </div>
    </div>
  ) : null

  const depositCascade = depositSent ? (
    <div style={{ marginLeft: '18px', marginBottom: '4px', padding: '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
      <AutoRow label="Deposit payment link sent (ACH or Card choice)" done={!!ob.deposit_email_sent_at} date={ob.deposit_email_sent_at} />
      <StallRows ob={ob} setOb={setOb} stall="deposit" />
      <AutoRow label="Deposit collected" done={depositStatus === 'succeeded' || depositRefunded} pending={depositStatus === 'processing'} date={ob.deposit_completed_at} tag={ob.deposit_method_type ? ob.deposit_method_type.toUpperCase() : null} />
      <AutoRow label="Deposit confirmation emailed" done={!!ob.deposit_confirmation_email_sent_at} date={ob.deposit_confirmation_email_sent_at} />
      {depositRefunded && (
        <>
          <AutoRow label="Deposit refunded" done={true} date={ob.deposit_refund_date} />
          <AutoRow label="Refund email drafted" done={!!ob.deposit_refund_email_sent_at} date={ob.deposit_refund_email_sent_at} />
        </>
      )}
    </div>
  ) : null

  // Rendered as a plain call, not a nested component, so the inputs keep their
  // identity across renders and every buffer/handler stays in this scope.
  const implField = (key) => {
    const f = IMPL_FIELDS[key]
    const stored = Number(ob[f.col])
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</span>
        <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>$</span>
        <input
          value={implFocus === key ? implBuf[key] : (stored > 0 ? fmtMoney(stored) : implBuf[key])}
          inputMode="decimal"
          placeholder="0.00"
          disabled={saving}
          onChange={e => { const v = sanitizeMoney(e.target.value); setImplBuf(p => ({ ...p, [key]: v })) }}
          onFocus={() => setImplFocus(key)}
          onBlur={() => commitImplementationValue(key)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          title={`${f.label} implementation value — type the dollar amount, saves when you click away`}
          style={{ ...selectStyle, minWidth: '100px', width: '100px', textAlign: 'right' }}
        />
      </span>
    )
  }

  // Stage state: done if every "interesting" milestone on the active branch is set.
  function stage1State() {
    if (!ob.prelim_meeting_status) return 'pending'
    if (!ob.prelim_meeting_decision) return 'active'
    return 'done'
  }
  function stage2State() {
    if (!decision) return 'pending'
    if (noPath && ob.decline_email_sent_at) return 'done'
    if (yesPath && ob.invoice_sent_at) return 'done'
    return 'active'
  }
  function stage3State() {
    if (ob.member_created_at) return 'done'
    if (yesPath && ob.invoice_sent_at) return 'active'
    return 'pending'
  }

  const stage3Locked = !(yesPath && ob.invoice_sent_at)

  // Extra-meeting card, injected into the Yes step list at the point it
  // interrupted (extra_meeting_stage) so the meeting squeezes between rows.
  const emStage = ob.extra_meeting_stage
  const emRequested = !!ob.extra_meeting_requested_at
  const emCard = <OnboardingExtraMeetingCard ob={ob} pipeline="advisor" onComplete={loadDetail} compact />

  // payment_amount is the TOTAL engagement value; a paid deposit comes off it and
  // the balance is charged to the saved method, so the payment link only appears
  // when there is no deposit or the balance charge fell back to one.
  const depositOnFile = ob.deposit_status === 'succeeded' || ob.deposit_status === 'processing'
  const depositPaid = depositOnFile ? (Number(ob.deposit_amount) || 0) : 0
  const balance = Math.max(Number(ob.payment_amount || 0) - depositPaid, 0)
  const priced = !!ob.agreement_signed_by_ceo_at
  const depositCoversAll = priced && ob.deposit_status === 'succeeded' && depositPaid > 0 && Number(ob.payment_amount) > 0 && balance === 0
  const showPaymentLinkRow = depositCoversAll ? false : (depositPaid === 0 || !!ob.payment_link_sent_at)
  const balanceStatus = ob.balance_charge_status

  const yesRows = (withTags) => (
    <>
      {depositPaid > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', padding: '4px 0 6px 14px' }}>
          Deposit of ${fmtMoney(depositPaid)} {ob.deposit_status === 'processing' ? 'pending (ACH clearing)' : `received ${formatDate(ob.deposit_completed_at)}`}{!priced ? ' · balance calculated at countersign' : balance > 0 ? ` · balance due $${fmtMoney(balance)}` : ' · nothing further due'}
        </div>
      )}
      <AutoRow label="Engagement agreement created and sent for signing" done={!!ob.agreement_sent_at} date={ob.agreement_sent_at} emails={ADVISOR_AGREEMENT_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
      <StallRows ob={ob} setOb={setOb} stall="signing" />
      {emRequested && emStage === 'signing' && emCard}
      <AutoRow label="Engagement agreement signed" done={!!ob.agreement_signed_by_advisor_at} date={ob.agreement_signed_by_advisor_at} tag={withTags ? [ob.selected_vfo_ft && 'VFO FT', ob.selected_pft && 'PFT', ob.selected_corporate && 'CM'] : undefined} />
      <AutoRow label="Engagement agreement signed by CEO" done={!!ob.agreement_signed_by_ceo_at} date={ob.agreement_signed_by_ceo_at} emails={ADVISOR_CEO_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
      {showPaymentLinkRow && (
        <>
          <AutoRow label="Payment link sent (ACH or Card choice)" done={!!ob.payment_link_sent_at} date={ob.payment_link_sent_at} emails={ADVISOR_PAYMENT_LINK_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
          <StallRows ob={ob} setOb={setOb} stall="payment" />
        </>
      )}
      {emRequested && emStage === 'payment' && emCard}
      {/* The ACH confirmation email no longer gets its own row — preview it here. */}
      {!depositCoversAll && (
        <AutoRow label={depositPaid > 0 ? 'Remaining payment collected after deposit' : 'Payment collected'} done={ob.payment_status === 'succeeded'} pending={ob.payment_status === 'processing'} date={ob.payment_completed_at} tag={withTags ? (ob.payment_method_type ? ob.payment_method_type.toUpperCase() : null) : undefined} emails={ADVISOR_CONFIRMATION_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
      )}
      {!depositCoversAll && depositPaid > 0 && balanceStatus === 'awaiting_deposit' && (
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', padding: '2px 0 4px 14px' }}>Waiting for the deposit to clear before charging the balance</div>
      )}
      {!depositCoversAll && depositPaid > 0 && (balanceStatus === 'declined' || balanceStatus === 'failed') && (
        <div style={{ fontSize: '11px', color: '#e74c3c', padding: '2px 0 4px 14px' }}>Balance charge failed — a payment link has been sent</div>
      )}
      {depositCoversAll && (
        <AutoRow label="Deposit covered the full onboarding payment" done={ob.payment_status === 'succeeded'} date={ob.payment_completed_at} />
      )}
      <AutoRow label="Invoice and receipt created and emailed to client" done={!!ob.invoice_sent_at} date={ob.invoice_sent_at} emails={ADVISOR_INVOICE_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
    </>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>
      <TrackHero
        eyebrow="Advisor Onboarding"
        title={`${ob.first_name} ${ob.last_name}`}
        meta={
          <>
            <span>{ob.email || 'No email'} · Started {formatFullDate(ob.created_at) || ''}</span>
            {ob.member_number && <button onClick={() => navigate(`/admin?member=${encodeURIComponent(ob.member_number)}&_n=${Date.now()}`)} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: 0, whiteSpace: 'nowrap' }}>Open member profile →</button>}
          </>
        }
        steps={[
          { label: 'Preliminary Meeting', state: stage1State() },
          { label: 'PC Admin', state: stage2State() },
          { label: 'Add New Advisor', state: stage3State() },
        ]}
        action={!ob.member_created_at && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{ob.status === 'stopped' ? 'Stopped' : 'Live'}</span>
            <div onClick={() => { if (!togglingStatus) toggleStatus() }}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: ob.status === 'stopped' ? '#e74c3c' : '#1b9254', cursor: 'pointer', position: 'relative', opacity: togglingStatus ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: ob.status === 'stopped' ? '2px' : '22px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />

      <StageBlock stage={1} title="Preliminary Meeting" state={stage1State()} expanded={expanded[1]} onToggle={() => setExpanded(p => ({ ...p, 1: !p[1] }))}>
        <Row label="Team Member Responsible" done={!!ob.onboarding_team_member} date={ob.onboarding_team_member_at} onDateChange={d => saveStepDate('onboarding_team_member_at', d)} saving={saving}>
          <select value={ob.onboarding_team_member || ''} onChange={e => saveTeamMember(e.target.value)} disabled={saving} style={{ ...selectStyle, color: 'var(--vfo-ink)' }}>
            <option value="">-- Select --</option>
            {ONBOARDING_TEAM_MEMBER_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            {ob.onboarding_team_member && !ONBOARDING_TEAM_MEMBER_NAMES.includes(ob.onboarding_team_member) && <option value={ob.onboarding_team_member}>{ob.onboarding_team_member}</option>}
          </select>
        </Row>
        <Row label="Meeting Reminder Setup" done={reminderDone} date={reminderDate} emails={ADVISOR_MEETING_REMINDER_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx}
          locked={!reminderDone && !ob.onboarding_team_member} lockedHint="Select the Team Member Responsible first">
          {reminderControl}
        </Row>
        {reminderCascade}
        <Row label="Preliminary Meeting" done={!!prelimStatus} date={ob.prelim_meeting_status_at} onDateChange={d => saveStepDate('prelim_meeting_status_at', d)} saving={saving}
          locked={!prelimStatus && !reminderDone} lockedHint="Send or skip the meeting reminder first">
          <select value={prelimSelectValue} onChange={e => savePrelimMeeting(e.target.value)} disabled={saving || depositSent} title={depositSent ? 'A deposit link has already been sent' : undefined} style={{ ...selectStyle, color: 'var(--vfo-ink)' }}>
            <option value="">-- Select --</option>
            <option value={PRELIM_SEND_DEPOSIT}>{PRELIM_SEND_DEPOSIT}</option>
            <option value={PRELIM_NO_DEPOSIT}>{PRELIM_NO_DEPOSIT}</option>
            <option value="No Show">No Show</option>
            {/* "Request no meeting" is written only by the PFT accountant fast track
                (pft/ft-response.ts); advisors never take that path, so the option is
                accountant-only. Kept as a fallback so a legacy row holding it renders. */}
            {prelimStatus === 'Request no meeting' && <option value="Request no meeting">Requested no meeting</option>}
          </select>
        </Row>
        {prelimStatus === PRELIM_SEND_DEPOSIT && (
          <>
            <Row label="Deposit" done={depositSent} date={depositRefunded ? ob.deposit_refund_date : ob.deposit_email_sent_at} emails={ADVISOR_DEPOSIT_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx}>
              {depositControl}
            </Row>
            {!depositSent && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', padding: '4px 0 0 18px' }}>Minimum $500, maximum $4,000</div>}
            {depositRefundCard}
            {depositCascade}
          </>
        )}
        <Row label="Implementation value (including deposit)" done={bothValuesSet} date={ob.implementation_value_at} onDateChange={d => saveStepDate('implementation_value_at', d)} saving={saving}
          locked={!bothValuesSet && !prelimSettled} lockedHint={prelimLockHint}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {implField('vfo_ft')}
            {implField('pft')}
          </span>
        </Row>
        <Row label="Preliminary Meeting Decision" done={!!decision} date={ob.prelim_meeting_decision_at} emails={ADVISOR_DECISION_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} onDateChange={d => saveStepDate('prelim_meeting_decision_at', d)} saving={saving}
          locked={!decision && !prelimSettled} lockedHint={prelimStatus === 'No Show' ? 'Preliminary meeting was a no-show' : prelimLockHint}>
          {decision ? (
            <span style={pillStyle(decision === 'Yes' ? '#1b9254' : decision === 'No' ? '#e74c3c' : '#e06717')}>{decision}</span>
          ) : (
            <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', opacity: decisionBlocked ? 0.4 : 1 }}>
              <button onClick={() => saveDecision('Yes')} disabled={!!pendingDecision || decisionBlocked} style={{ ...pendingBtn('#1b9254', pendingDecision, 'Yes'), cursor: decisionBlocked ? 'not-allowed' : 'pointer' }}>{pendingDecision === 'Yes' ? 'Sending…' : 'Yes'}</button>
              <button onClick={() => saveDecision('Undecided')} disabled={!!pendingDecision || decisionBlocked} style={{ ...pendingBtn('#e06717', pendingDecision, 'Undecided'), cursor: decisionBlocked ? 'not-allowed' : 'pointer' }}>{pendingDecision === 'Undecided' ? 'Sending…' : 'Undecided'}</button>
              <button onClick={() => saveDecision('No')} disabled={!!pendingDecision || decisionBlocked} style={{ ...pendingBtn('#e74c3c', pendingDecision, 'No'), cursor: decisionBlocked ? 'not-allowed' : 'pointer' }}>{pendingDecision === 'No' ? 'Sending…' : 'No'}</button>
            </div>
            {decisionBlocked && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', marginTop: '4px' }}>{!ob.onboarding_team_member && !bothValuesSet ? 'Select a team member and enter both implementation values above to enable the decision.' : !ob.onboarding_team_member ? 'Select a team member above to enable the decision.' : 'Enter both implementation values above to enable the decision.'}</div>}
            </>
          )}
        </Row>
      </StageBlock>

      <StageBlock stage={2} title="PC Admin" state={stage2State()} expanded={expanded[2]} onToggle={() => setExpanded(p => ({ ...p, 2: !p[2] }))}>
        {!decision && <div style={{ padding: '12px', color: 'var(--vfo-muted)', fontSize: '13px' }}>Waiting for Stage 1 decision.</div>}

        {decision === 'Yes' && yesRows(true)}

        {decision === 'Undecided' && (
          <>
            <AutoRow label="Decision email sent" done={!!ob.decision_email_sent_at} date={ob.decision_email_sent_at} />
            <StallRows ob={ob} setOb={setOb} stall="decision" />
            <AutoRow label="Client response received" done={!!ob.final_decision} date={ob.final_decision_at} />
            {undecidedPending && <div style={{ marginLeft: '14px', paddingLeft: '12px', borderLeft: '1px solid var(--vfo-tint-deep)', fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>Awaiting client click on Yes / No button in their email…</div>}
            {finalDec && (
              <div style={{ marginLeft: '14px', paddingLeft: '12px', marginTop: '4px', marginBottom: '4px', borderLeft: '1px solid var(--vfo-tint-deep)' }}>
                <div style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', display: 'inline-block', marginBottom: '8px',
                  background: finalDec === 'Yes' ? 'rgba(27,146,84,0.15)' : finalDec === 'ExtraMeeting' ? 'rgba(224,103,23,0.15)' : 'rgba(231,76,60,0.15)',
                  color: finalDec === 'Yes' ? '#1b9254' : finalDec === 'ExtraMeeting' ? '#e06717' : '#e74c3c',
                  border: `1px solid ${finalDec === 'Yes' ? 'rgba(27,146,84,0.3)' : finalDec === 'ExtraMeeting' ? 'rgba(224,103,23,0.3)' : 'rgba(231,76,60,0.3)'}`
                }}>
                  {finalDec === 'Yes' ? 'Yes — proceeding' : finalDec === 'ExtraMeeting' ? 'Extra meeting requested' : 'No — declined'}
                </div>
                {finalDec === 'ExtraMeeting' && emCard}
                {finalDec === 'No' && <AutoRow label="Decline email sent" done={!!ob.decline_email_sent_at} date={ob.decline_email_sent_at} />}
                {finalDec === 'Yes' && (
                  <>
                    {emRequested && emStage === 'decision' && emCard}
                    {yesRows(false)}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {decision === 'No' && (
          <AutoRow label="Decline email sent to advisor" done={!!ob.decline_email_sent_at} date={ob.decline_email_sent_at} />
        )}
      </StageBlock>

      <StageBlock stage={3} title="Add New Advisor" state={stage3State()} expanded={expanded[3]} onToggle={() => setExpanded(p => ({ ...p, 3: !p[3] }))} dimmed={stage3Locked}>
        {stage3Locked ? (
          <div style={{ padding: '12px', color: 'var(--vfo-muted)', fontSize: '13px' }}>
            Available once the invoice/receipt has been sent in Stage 2.
          </div>
        ) : ob.member_created_at ? (
          <>
            <AutoRow label="Advisor created" done={true} date={ob.member_created_at} emails={ADVISOR_LOGIN_EMAILS} pipeline={ADVISOR_PIPELINE} emailCtx={emailCtx} />
            <div style={{ marginLeft: '14px', paddingLeft: '12px', marginTop: '6px', borderLeft: '1px solid var(--vfo-tint-deep)', fontSize: '12px', color: 'var(--vfo-muted)' }}>
              Member number: <span style={{ color: 'var(--vfo-ink)', fontFamily: 'monospace' }}>{ob.member_number}</span> &middot; Implementation &middot; New Model &middot; Money Mapping
            </div>
          </>
        ) : (
          <div style={{ padding: '4px 0' }}>
            <button onClick={() => setShowSaleModal(true)} disabled={creatingMember} style={{ padding: '10px 24px', borderRadius: '8px', background: creatingMember ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: creatingMember ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {creatingMember ? 'Creating & sending...' : 'Create Advisor & Send Setup Link'}
            </button>
          </div>
        )}
      </StageBlock>

      {showSaleModal && (
        <NewModelSaleModal
          ob={ob}
          kind="advisor"
          submitting={creatingMember}
          onClose={() => setShowSaleModal(false)}
          onConfirm={createAdvisor}
        />
      )}
    </div>
  )
}

function StageBlock({ stage, title, state, expanded, onToggle, dimmed, children }) {
  const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
  const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
  return (
    <div style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden', opacity: dimmed ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <PhaseBadge number={stage} state={state} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
          {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress</span>}
          {state === 'pending' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
          <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>
      {expanded && <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>{children}</div>}
    </div>
  )
}

// A bare 'YYYY-MM-DD' is split as a string — new Date() would read it as UTC
// and show the previous day west of Greenwich. A timestamptz goes through Date
// so it lands on the day the viewer actually saw.
function formatDate(d) {
  if (!d) return ''
  const s = String(d)
  if (!s.includes('T')) {
    const parts = s.split('-')
    return `${parts[1]}/${parts[2]}`
  }
  const dt = new Date(s)
  if (isNaN(dt.getTime())) return ''
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

// Keep only digits and a single decimal point, capped at 2 decimals, so the
// dollar field can't hold anything that isn't a dollar amount.
function sanitizeMoney(raw) {
  let s = String(raw ?? '').replace(/[^0-9.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
  const cap = s.indexOf('.')
  if (cap !== -1) s = s.slice(0, cap + 3)
  return s
}

function fmtMoney(n) {
  const num = Number(n) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 })
}

const dateTextStyle = { fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0, display: 'inline-block', width: '38px' }

// Prerequisite lock, drawn the same way the tax priorities tab draws it so every
// locked step in the portal reads as one thing.
function LockedIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ opacity: 0.75, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="#e74c3c" strokeWidth="1.6" fill="none" />
      <line x1="3.9" y1="12.1" x2="12.1" y2="3.9" stroke="#e74c3c" strokeWidth="1.6" />
    </svg>
  )
}

const lockedHintStyle = { fontSize: '11px', color: 'var(--vfo-muted)', fontWeight: 500 }

// Full local date + time, for a scheduled send that hasn't happened yet.
function formatStampFull(d) {
  if (!d) return ''
  const dt = new Date(String(d))
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Row({ label, done, date, children, emails, pipeline, emailCtx, onDateChange, saving, locked, lockedHint }) {
  return (
    <div title={locked ? lockedHint : undefined} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? '#1b9254' : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? '#1b9254' : 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1 }}>{label}{emails && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline={pipeline} title={label} templates={emails} context={emailCtx} /></span>}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {locked ? <><LockedIcon /><span style={lockedHintStyle}>{lockedHint}</span></> : children}
        <span style={dateTextStyle}>{done && date ? formatDate(date) : ''}</span>
      </span>
    </div>
  )
}

function AutoRow({ label, done, date, tag, emails, pipeline, emailCtx, pending = false }) {
  const tags = tag == null ? [] : Array.isArray(tag) ? tag.filter(Boolean) : [tag]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? '#1b9254' : pending ? '#e06717' : 'transparent', flexShrink: 0, border: `1px solid ${done ? '#1b9254' : pending ? '#e06717' : 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', flex: 1 }}>{label}{emails && <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline={pipeline} title={label} templates={emails} context={emailCtx} /></span>}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {done && tags.length > 0 && tags.map((t, i) => (
          <span key={i} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>{t}</span>
        ))}
        {!done && pending
          ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.15)', border: '1px solid rgba(224,103,23,0.3)', color: '#e06717' }}>Pending — ACH clearing</span>
          : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: done ? 'rgba(27,146,84,0.15)' : 'var(--vfo-tint)', border: done ? '1px solid rgba(27,146,84,0.3)' : '1px solid var(--vfo-border-chip)', color: done ? '#1b9254' : 'var(--vfo-muted)' }}>{done ? 'Done' : 'Not completed'}</span>}
        <span style={dateTextStyle}>{done && date ? formatDate(date) : ''}</span>
      </span>
    </div>
  )
}

// The sweep's two chase rows for one stalled step: the 48h client reminder and
// the 96h escalation to the team member responsible. Each row only exists once
// the sweep has stamped its column, so nothing shows on a step that never
// stalled.
function StallRows({ ob, setOb, stall }) {
  const [busy, setBusy] = useState(false)
  const reminderAt = ob[`${stall}_reminder_sent_at`]
  const notifiedAt = ob[`${stall}_pf_notified_at`]
  const ackKey = `${stall}_pf_ack_at`
  const ackAt = ob[ackKey]
  if (!reminderAt && !notifiedAt) return null

  async function toggleAck(ack) {
    const prev = ackAt || null
    setBusy(true)
    setOb(p => ({ ...p, [ackKey]: ack ? new Date().toISOString() : null }))
    try {
      const res = await callApi('automation_stall_ack', { pipeline: 'advisor', id: ob.id, stall, ack })
      setOb(p => ({ ...p, [ackKey]: ack ? (res?.ack_at || new Date().toISOString()) : null }))
    } catch (err) {
      console.error(err)
      setOb(p => ({ ...p, [ackKey]: prev }))
      alert('Error: ' + err.message)
    }
    finally { setBusy(false) }
  }

  return (
    <>
      {reminderAt && <AutoRow label="2-business-day reminder email sent to advisor" done={true} date={reminderAt} />}
      {notifiedAt && (
        <>
          <AutoRow label="4-business-day mark passed — team member responsible notified to follow up" done={true} date={notifiedAt} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '14px', padding: '5px 0 5px 12px', borderLeft: '1px solid var(--vfo-tint-deep)', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={!!ackAt} disabled={busy} onChange={e => toggleAck(e.target.checked)} style={{ margin: 0, flexShrink: 0, cursor: busy ? 'not-allowed' : 'pointer' }} />
            <span style={{ fontSize: '12px', color: 'var(--vfo-ink)', flex: 1 }}>Reached out?</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={dateTextStyle}>{ackAt ? formatDate(ackAt) : ''}</span>
            </span>
          </div>
        </>
      )}
    </>
  )
}

const selectStyle = { padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '12px', minWidth: '150px', fontFamily: 'Inter, sans-serif' }
function pillStyle(color) { return { fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${color}22`, color, border: `1px solid ${color}44` } }
const neutralPillStyle = { fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-chip)' }
function branchBtn(color) { return { padding: '4px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: `1px solid ${color}66`, background: `${color}22`, color } }
function pendingBtn(color, pendingValue, myValue) {
  const base = branchBtn(color)
  if (!pendingValue) return base
  if (pendingValue === myValue) {
    // The clicked button — show as "in-flight" with stronger color + wait cursor
    return { ...base, background: `${color}44`, fontWeight: '600' }
  }
  // The other buttons — dim them
  return { ...base, opacity: 0.3, cursor: 'not-allowed' }
}
