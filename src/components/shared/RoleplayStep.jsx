import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'

// 90 Day Plan — the Proactive Facilitator Roleplay step (Holistic + Partnership
// Fast Track, end of "MSM 5 Activity"). MSM-driven, laid out like the tax
// meeting steps (TaxPrioritiesTab tax_hlm_confirm): a green action button, a
// date / time / timezone form with Send / Cancel, a green "Confirmation sent"
// chip with Reschedule. One sub-row per roleplay date; a No-show opens the next.
//
// The step's progress status is DERIVED server-side (actions/msm/roleplay-shared.ts
// syncRoleplayProgress): Pending / Outstanding / Completed. readOnly = the member's
// own plan (no buttons — every writer is admin-only server-side).

export const ROLEPLAY_SENTINEL = 'roleplay_booking'
export const isRoleplayTask = (task) => task?.status_options === ROLEPLAY_SENTINEL

const INTRO_BUTTONS = {
  1: [{ variant: 'holistic', label: 'Send intro email (Holistic)' }, { variant: 'tax', label: 'Send intro email (Tax Planning)' }],
  2: [{ variant: 'pft', label: 'Send intro email' }],
}
const FACILITATOR_FIRST = { 1: 'Evan', 2: 'Ian' }
const VARIANT_LABEL = { holistic: 'Holistic wording', tax: 'Tax Planning wording', pft: 'Partnership Fast Track' }
const TIMEZONES = [['ET', 'Eastern (ET)'], ['CT', 'Central (CT)'], ['MT', 'Mountain (MT)'], ['PT', 'Pacific (PT)'], ['AKT', 'Alaska (AKT)'], ['HT', 'Hawaii (HT)']]

const GREEN = '#1b9254'
const BLUE = '#0095ff'
const RED = '#e74c3c'

const chip = (hex, rgb) => ({ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: `rgba(${rgb},0.15)`, color: hex, fontWeight: 600, border: `1px solid rgba(${rgb},0.3)` })
const greenChip = chip(GREEN, '27,146,84')
const blueChip = chip(BLUE, '0,149,255')
const redChip = chip(RED, '231,76,60')
const neutralChip = { fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontWeight: 600, border: '1px solid var(--vfo-border-chip)' }
const tdInput = { padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '11px' }
const tdGreen = (busy) => ({ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: busy ? 'not-allowed' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: GREEN, fontWeight: 600, opacity: busy ? 0.6 : 1 })
const tdCancel = { padding: '4px 8px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }
const stampStyle = { fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'right', flexShrink: 0 }

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[2]}/${m[3]}/${m[1]}` : ''
}
function fmtStamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return isNaN(d) ? '' : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
function fmtTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '')
  if (!m) return hhmm || ''
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}
const whenLabel = (a) => `${fmtDate(a.scheduled_date)} ${fmtTime(a.scheduled_time)} ${a.scheduled_timezone || ''}`.trim()

export default function RoleplayStep({ task, enrollmentId, programId, inGroup, readOnly = false, onProgressChange }) {
  const [roleplay, setRoleplay] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null) // { attemptId?, date, time, tz }
  const [error, setError] = useState('')

  useEffect(() => { load() }, [enrollmentId, task.id])

  async function load() {
    try {
      const data = await callApi('training_roleplay_load', { enrollment_id: enrollmentId, task_id: task.id })
      setRoleplay(data.roleplay || null)
      setAttempts(data.attempts || [])
    } catch (err) { setError(err.message || 'Could not load the roleplay step') }
    finally { setLoaded(true) }
  }

  async function run(action, payload, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return false
    setBusy(true)
    setError('')
    try {
      await callApi(action, payload)
      await load()
      if (onProgressChange) onProgressChange()
      return true
    } catch (err) {
      setError(err.message || 'Something went wrong')
      return false
    } finally { setBusy(false) }
  }

  const sendIntro = (variant, label) => run(
    'training_roleplay_send_intro',
    { enrollment_id: enrollmentId, task_id: task.id, variant },
    `${label}?\n\nThis drafts the roleplay intro email to the member and ${FACILITATOR_FIRST[programId] || 'the Proactive Facilitator'} with the booking link, and ticks "Introduction to Proactive Facilitator" done.`,
  )

  async function sendConfirmation() {
    const ok = await run('training_roleplay_confirm', {
      enrollment_id: enrollmentId, task_id: task.id,
      date: form.date, time: form.time, tz: form.tz || 'ET',
      ...(form.attemptId ? { attempt_id: form.attemptId } : {}),
    })
    if (ok) setForm(null)
  }

  const setOutcome = (attemptId, outcome) => run('training_roleplay_set_outcome', { attempt_id: attemptId, outcome })

  const latest = attempts[attempts.length - 1] || null
  const introSent = !!roleplay?.intro_sent_at
  const stepColor = latest?.outcome === 'completed' ? GREEN : latest?.outcome === 'no_show' ? RED : (introSent || latest) ? BLUE : null
  const needsNewDate = introSent && (!latest || latest.outcome === 'no_show')
  const today = todayET()

  const dateForm = (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="date" value={form?.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={tdInput} />
      <input type="time" value={form?.time || ''} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={tdInput} />
      <select value={form?.tz || 'ET'} onChange={e => setForm(f => ({ ...f, tz: e.target.value }))} style={{ ...tdInput, background: 'var(--vfo-card)' }}>
        {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button disabled={busy || !form?.date || !form?.time} onClick={sendConfirmation} style={tdGreen(busy || !form?.date || !form?.time)}>{busy ? 'Sending...' : 'Send'}</button>
      <button disabled={busy} onClick={() => setForm(null)} style={tdCancel}>Cancel</button>
    </div>
  )

  const subRow = (key, label, right, stamp, dot) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', marginLeft: '18px', borderTop: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot || 'transparent', flexShrink: 0, border: `1px solid ${dot || 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '12.5px', color: 'var(--vfo-ink)', flex: 1, minWidth: '150px' }}>{label}</span>
      {right}
      <span style={stampStyle}>{stamp}</span>
    </div>
  )

  const attemptRows = attempts.flatMap((a, i) => {
    const isLatest = i === attempts.length - 1
    const label = i === 0 ? 'Roleplay date' : 'Rescheduled roleplay date'
    const editing = form?.attemptId === a.id
    const dateRight = editing ? dateForm : (
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={greenChip}>{a.confirmation_kind === 'rescheduled' ? 'Rescheduled' : 'Confirmation sent'} — {whenLabel(a)}</span>
        {!readOnly && isLatest && !a.outcome && (
          <button disabled={busy} onClick={() => setForm({ attemptId: a.id, date: a.scheduled_date, time: String(a.scheduled_time || '').slice(0, 5), tz: a.scheduled_timezone || 'ET' })} style={tdCancel} title="Pick a new date/time and send the rescheduled confirmation email.">Reschedule</button>
        )}
      </div>
    )
    const outcomeColor = a.outcome === 'completed' ? GREEN : a.outcome === 'no_show' ? RED : null
    const notYet = a.scheduled_date > today
    const outcomeRight = (readOnly || !isLatest) ? (
      a.outcome ? <span style={a.outcome === 'completed' ? greenChip : redChip}>{a.outcome === 'completed' ? 'Completed' : 'No-show'}</span>
        : <span style={neutralChip}>{notYet ? 'Scheduled' : 'Awaiting outcome'}</span>
    ) : (
      <select
        value={a.outcome || ''}
        disabled={busy || (notYet && !a.outcome)}
        title={notYet && !a.outcome ? 'Available from the roleplay date' : ''}
        onChange={e => setOutcome(a.id, e.target.value)}
        style={{ ...tdInput, background: 'var(--vfo-card)', minWidth: '120px', color: outcomeColor || 'var(--vfo-ink)', borderColor: outcomeColor ? `${outcomeColor}66` : 'var(--vfo-border-strong)' }}
      >
        <option value="">{notYet ? 'Scheduled' : '-- Outcome --'}</option>
        <option value="completed">Completed</option>
        <option value="no_show">No-show</option>
      </select>
    )
    return [
      subRow(`d${a.id}`, label, dateRight, fmtStamp(a.confirmation_sent_at), GREEN),
      subRow(`o${a.id}`, 'Outcome', outcomeRight, fmtStamp(a.outcome_at), outcomeColor),
    ]
  })

  let pendingRow = null
  if (needsNewDate) {
    const label = attempts.length === 0 ? 'Roleplay date' : 'Rescheduled roleplay date'
    const right = readOnly
      ? <span style={neutralChip}>Not booked yet</span>
      : (form && !form.attemptId) ? dateForm
        : <button disabled={busy} onClick={() => setForm({ date: '', time: '', tz: 'ET' })} style={tdGreen(busy)} title="Enter the roleplay date / time / timezone and send the member the confirmation email.">Send confirmation (with date)</button>
    pendingRow = subRow('pending', label, right, '', null)
  }

  const introRight = !loaded ? null : introSent ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={greenChip}>Intro email sent — {VARIANT_LABEL[roleplay.intro_variant] || ''}</span>
      {!readOnly && !latest && (INTRO_BUTTONS[programId] || []).map(b => (
        <button key={b.variant} disabled={busy} onClick={() => sendIntro(b.variant, b.label.replace('Send', 'Resend'))} style={tdCancel}>{b.label.replace('Send', 'Resend')}</button>
      ))}
    </div>
  ) : readOnly ? <span style={neutralChip}>Not started</span> : (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {(INTRO_BUTTONS[programId] || []).map(b => (
        <button key={b.variant} disabled={busy} onClick={() => sendIntro(b.variant, b.label)} style={tdGreen(busy)}>{busy ? 'Sending…' : b.label}</button>
      ))}
    </div>
  )

  return (
    <div style={{ padding: '8px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stepColor || 'transparent', flexShrink: 0, border: `1.5px solid ${stepColor || 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '14px', color: latest?.outcome === 'completed' ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1, minWidth: '150px' }}>{task.name}</span>
        {introRight}
        <span style={stampStyle}>{fmtStamp(roleplay?.intro_sent_at)}</span>
      </div>
      {(attempts.length > 0 || pendingRow) && (
        <div style={{ marginTop: '6px' }}>
          {attemptRows}
          {pendingRow}
        </div>
      )}
      {error && <div style={{ color: RED, fontWeight: 500, fontSize: '12px', marginTop: '6px', marginLeft: '18px' }}>{error}</div>}
    </div>
  )
}
