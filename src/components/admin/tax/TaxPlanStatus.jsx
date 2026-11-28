import { useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import { formatDate } from '../../../lib/dates'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { statusPillStyle } from '../../shared/statusColors'
import { btnPrimary, btnSecondary, btnDanger, btnState } from '../../shared/buttonStyles'
import BacklogModal, { errorText, fieldLabel, inputStyle } from '../backlog/BacklogModal'

// Tax plan status (2026-11-23): live | paused | stopped | completed, plus status_kind
// 'next_tax_year' on a stopped plan. 'completed' is set by hand on a finished plan
// whose last steps were never ticked; a plan with every step done stays 'live'. The server half is actions/tax/plan-status.ts
// and utils/tax-plan-open.ts. Plan of record: docs/plans/tax-plan-status.

export const planIsLive = (plan) => !plan?.status || plan.status === 'live'
export const planIsNextYear = (plan) => plan?.status === 'stopped' && plan?.status_kind === 'next_tax_year'

// Next tax year sits between Paused's orange and Stopped's red (Jake, 2026-11-23).
export const NEXT_YEAR_HEX = '#e2542c'

// One tag per plan. `state` = 'not started' | 'in progress' | 'completed', the
// plan's own step count; it only speaks while the plan is live.
export function planTag(plan, state) {
  if (planIsNextYear(plan)) return { label: plan.next_tax_year ? `Next tax year: ${plan.next_tax_year}` : 'Next tax year', hex: NEXT_YEAR_HEX }
  if (plan?.status === 'stopped') return { label: 'Stopped', hex: '#e74c3c' }
  if (plan?.status === 'paused') return { label: 'Paused', hex: '#e06717' }
  if (plan?.status === 'completed' || state === 'completed') return { label: 'Completed', hex: '#1b9254' }
  if (state === 'in progress') return { label: 'In progress', hex: '#0a85e8' }
  return { label: 'Not started', hex: null }
}

export function PlanStatusTag({ plan, state, style }) {
  const t = planTag(plan, state)
  return <span style={{ ...statusPillStyle(t.hex), ...style }}>{t.label}</span>
}

const logTag = (row) => {
  if (row.to_status === 'paused') return { label: 'Paused', hex: '#e06717' }
  if (row.to_status === 'stopped') return row.to_kind === 'next_tax_year' ? { label: `Next tax year: ${row.next_tax_year || ''}`, hex: NEXT_YEAR_HEX } : { label: 'Stopped', hex: '#e74c3c' }
  if (row.to_status === 'completed') return { label: 'Completed', hex: '#1b9254' }
  return { label: row.from_status === 'paused' ? 'Resumed' : row.from_kind === 'next_tax_year' ? 'Continued' : 'Reopened', hex: '#0a85e8' }
}

// One status change, with the email that went out on it: a card in the style of the
// "Questions for the client" bar. A change with no email is the one line.
function LogRow({ row, action }) {
  const tag = logTag(row)
  // The whole email, with the part written for this client in bold.
  const at = row.email_body && row.email_message ? row.email_body.indexOf(row.email_message) : -1
  const before = at >= 0 ? row.email_body.slice(0, at) : ''
  const after = at >= 0 ? row.email_body.slice(at + row.email_message.length) : ''
  const message = <strong style={{ fontWeight: 600 }}>{row.email_message}</strong>
  const line = [
    `${formatDate(row.created_at)}${row.changed_by ? ` by ${row.changed_by}` : ''}`,
    row.check_back_on ? `Check back ${formatDate(row.check_back_on)}` : '',
    row.to_status === 'live' || row.to_status === 'completed' ? ''
      : row.email_sent ? `Email sent to ${row.email_to || 'the client'}`
      : row.email_skip_reason ? `No email sent: ${row.email_skip_reason}` : 'No email sent',
  ].filter(Boolean).join(' · ')
  return (
    <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '10px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 200px' }}>{line}</span>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: `${tag.hex}26`, color: tag.hex, fontWeight: 600, border: `1px solid ${tag.hex}4d`, whiteSpace: 'nowrap' }}>{tag.label}</span>
      </div>
      {row.email_sent && row.email_message && (
        <div style={{ marginTop: '6px' }}>
          {row.email_subject && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '6px', overflowWrap: 'anywhere' }}>{row.email_subject}</div>}
          <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{before}{message}{after}</div>
        </div>
      )}
      {action && <div style={{ marginTop: '10px' }}>{action}</div>}
    </div>
  )
}

// The Status bar at the top of a plan, same shape as the plan's other bars and
// always there. `info` = tax_plan_status_load (admins and the Direct member, who
// get the selector and the history); everyone else gets the tag alone.
const STATUS_PILLS = [
  { to: 'live', label: 'In progress', hex: '#125ecc' },
  { to: 'paused', label: 'Paused', hex: '#e06717' },
  { to: 'next_tax_year', label: 'Next tax year', hex: NEXT_YEAR_HEX },
  { to: 'stopped', label: 'Stopped', hex: '#e74c3c' },
  { to: 'completed', label: 'Completed', hex: '#1b9254' },
]
const BAR_TINT = { paused: '224,103,23', next_tax_year: '226,84,44', stopped: '231,76,60', completed: '27,146,84' }

export function PlanStatusBanner({ plan, state, info, canChange, onPick }) {
  const isPhone = useIsPhone()
  const [open, setOpen] = useState(false)
  // Every step ticked reads Completed too, though nothing was set by hand.
  const now = planIsNextYear(plan) ? 'next_tax_year' : !planIsLive(plan) ? plan.status : state === 'completed' ? 'completed' : 'live'
  const rgb = BAR_TINT[now]
  const offered = choicesFor(plan).map(c => c.to)
  const log = info?.log || []
  const last = log[0] && log[0].to_status === plan.status && (log[0].to_kind || null) === (plan.status_kind || null) ? log[0] : null
  const summary = now === 'paused' ? (plan.pause_check_back_on ? `Check back ${formatDate(plan.pause_check_back_on)}` : '')
    : now === 'next_tax_year' ? (plan.next_tax_year ? `Moving to ${plan.next_tax_year}` : '')
    : (now === 'stopped' || now === 'completed') && last ? formatDate(last.created_at) : ''
  const dateButton = now === 'paused' || now === 'next_tax_year'
    ? <button style={btnSecondary} onClick={() => onPick(now)}>{now === 'paused' ? 'Change check-back date' : 'Change the year'}</button>
    : null
  const chevron = <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
  const pill = (p) => {
    const on = now === p.to
    const off = !on && !offered.includes(p.to)
    return { padding: isPhone ? '8px 10px' : '4px 12px', borderRadius: '999px', border: 'none', fontSize: '11.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
      cursor: on ? 'default' : off ? 'not-allowed' : 'pointer', background: on ? p.hex : 'transparent', color: on ? '#fff' : off ? 'var(--vfo-faint)' : 'var(--vfo-ink)' }
  }
  return (
    <div style={{ background: rgb ? `linear-gradient(rgba(${rgb},0.1), rgba(${rgb},0.1)), var(--vfo-card)` : 'var(--vfo-plan-tool-bg)', border: `1px solid ${rgb ? `rgba(${rgb},0.45)` : 'var(--vfo-plan-tool-border)'}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={canChange ? () => setOpen(o => !o) : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: isPhone ? '12px 18px' : '5px 18px', minHeight: isPhone ? undefined : '43px', boxSizing: 'border-box', flexWrap: 'wrap', cursor: canChange ? 'pointer' : 'default' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</span>
        {canChange && isPhone && chevron}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', ...(isPhone ? { width: '100%' } : null) }}>
          {summary && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{summary}</span>}
          {!canChange && !planIsLive(plan) && plan.status !== 'completed' && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>This plan is on hold, so its steps are closed.</span>}
          {canChange
            ? (
              <div role="radiogroup" aria-label="Plan status" onClick={e => e.stopPropagation()} style={{ ...(isPhone ? { display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', borderRadius: '18px' } : { display: 'inline-flex', borderRadius: '999px' }), border: '1px solid var(--vfo-border-strong)', padding: '2px', background: 'var(--vfo-card)' }}>
                {STATUS_PILLS.map(p => (
                  <button key={p.to} type="button" role="radio" aria-checked={now === p.to} disabled={now !== p.to && !offered.includes(p.to)}
                    title={now !== p.to && !offered.includes(p.to) ? (planIsLive(plan) ? 'Every step is done' : 'Put the plan back in progress first') : undefined}
                    onClick={() => { if (now !== p.to) onPick(p.to) }} style={pill(p)}>{p.label}</button>
                ))}
              </div>
            )
            : <PlanStatusTag plan={plan} state={state} />}
          {canChange && !isPhone && chevron}
        </div>
      </div>
      {open && canChange && (
        <div style={{ padding: '0 18px 16px', fontFamily: 'Inter, sans-serif' }}>
          {!planIsLive(plan) && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: 1.5, marginBottom: '8px' }}>Its steps, payments and emailed buttons are locked. Notes stay open.</div>}
          {!info && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Loading…</div>}
          {info && log.length === 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>No status changes yet.</div>}
          {log.map(r => <LogRow key={r.id} row={r} action={r === last ? dateButton : null} />)}
          {info && !last && dateButton && <div style={{ marginTop: '10px' }}>{dateButton}</div>}
        </div>
      )}
    </div>
  )
}

const plain = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDay(d) }

const COMPLETE_CHOICE = { to: 'completed', label: 'Mark completed', hint: 'The work is finished. No email goes out, and the client can start a new plan.' }

// The choices a plan offers, by where it is now.
function choicesFor(plan) {
  if (plan.status === 'paused') return [
    { to: 'live', label: 'Resume', hint: 'Back in progress. Reminders start again after 2 business days.' },
    { to: 'paused', label: 'Pause until a new date', hint: 'Keep it paused with another check-back date.' },
    { to: 'stopped', label: 'Stop', hint: 'Tax planning is over for this client.' },
    { to: 'next_tax_year', label: 'Move to next tax year', hint: 'Stop for now and keep them on the next year list.' },
    COMPLETE_CHOICE,
  ]
  if (plan.status === 'completed') return [
    { to: 'live', label: 'Put back in progress', hint: 'Its steps unlock.' },
  ]
  if (planIsNextYear(plan)) return [
    { to: 'live', label: 'Continue this plan', hint: `Reopens it${plan.next_tax_year ? ` as the ${plan.next_tax_year} tax plan` : ''}, with everything already paid.` },
    { to: 'next_tax_year', label: 'Change the year', hint: 'Keep them on the list for a different tax year.' },
    { to: 'stopped', label: 'Stop', hint: 'They are no longer coming back.' },
    COMPLETE_CHOICE,
  ]
  if (plan.status === 'stopped') return [
    { to: 'live', label: 'Reopen', hint: 'Back in progress. Reminders start again after 2 business days.' },
    { to: 'next_tax_year', label: 'Move to next tax year', hint: 'Keep them on the next year list.' },
    COMPLETE_CHOICE,
  ]
  return [
    { to: 'paused', label: 'Pause', hint: 'On hold for now. The PF is reminded on a date you pick.' },
    { to: 'stopped', label: 'Stop', hint: 'Tax planning is over for this client.' },
    { to: 'next_tax_year', label: 'Move to next tax year', hint: 'Stop for now and keep them on the next year list.' },
    COMPLETE_CHOICE,
  ]
}

export function ChangeStatusModal({ plan, client, act = (n) => n, initialTo = '', lost = false, onClose, onSaved }) {
  const [info, setInfo] = useState(null)
  const [to, setTo] = useState(initialTo)
  const [sendEmail, setSendEmail] = useState(true)
  const [message, setMessage] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [checkBack, setCheckBack] = useState('')
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(Math.max(thisYear + 1, (plan.tax_year || 0) + 1)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [askLost, setAskLost] = useState(false)
  const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : ''

  useEffect(() => {
    let on = true
    callApi(act('tax_plan_status_load'), { tax_plan_id: plan.id })
      .then(res => { if (on) setInfo(res) })
      .catch(err => { if (on) setError(err.message || 'Could not load this plan') })
    return () => { on = false }
  }, [plan.id])

  const current = info?.plan || plan
  const choices = choicesFor(current)
  // Opened from the Status bar with the status already picked: no list to pick from.
  // `lost` = the client is being set to Lost, which stops this plan with the same email.
  const picked = lost ? { label: 'Set to Lost', hint: 'This stops every automatic payment for the client. Remaining Holistic (MAP 1) and Tax Planning payments are cancelled and their plans are stopped. Payments already collected are not touched, and setting them back to Active restarts nothing.' }
    : initialTo ? choices.find(c => c.to === initialTo) : null
  const emails = to === 'paused' || to === 'stopped' || to === 'next_tax_year'
  const closing = to === 'stopped' || to === 'next_tax_year'
  const email = emails ? info?.emails?.[to] : null
  const emailBody = email?.body ? plain(email.body).replace(/\[Tax Year\]/g, year) : ''
  const [before, after] = emailBody.split('[MESSAGE]')
  const subject = email?.subject ? email.subject.replace(/\[Tax Year\]/g, year) : ''

  const blocked = to !== 'live' || !info ? ''
    : info.refunded ? "This plan was refunded, so it can't be reopened. Start a new plan instead."
    : String(info.client_status || '').toLowerCase() === 'lost' ? 'This client is set to Lost. Set them back to Active first.'
    : info.other_open ? `This client has another open plan (${info.other_open.label}). Stop that one first.`
    : ''
  const missing = !to ? 'Choose a status'
    : to === 'paused' && !checkBack ? 'Pick the check-back date'
    : emails && sendEmail && !message.trim() ? 'Write the message'
    : emails && !sendEmail && !skipReason.trim() ? 'Say why no email is going'
    : ''
  const cannot = !info || saving || !!missing || !!blocked || (emails && sendEmail && !!email?.error)
  const saveLabel = saving ? 'Saving…'
    : to === 'live' ? (current.status === 'paused' ? 'Resume plan' : current.status === 'completed' ? 'Put back in progress' : planIsNextYear(current) ? 'Continue this plan' : 'Reopen plan')
    : to === 'completed' ? 'Mark completed'
    : `${lost ? 'Set to Lost' : to === 'paused' ? 'Pause' : to === 'stopped' ? 'Stop' : to === 'next_tax_year' ? `Move to ${year}` : 'Save'}${to ? (sendEmail ? ' and send email' : ' without email') : ''}`

  async function save() {
    if (cannot) return
    setSaving(true); setError('')
    try {
      const res = await callApi(act('tax_plan_status_set'), {
        tax_plan_id: plan.id, to,
        send_email: emails && sendEmail,
        message: message.trim(),
        skip_reason: skipReason.trim(),
        check_back_on: to === 'paused' ? checkBack : undefined,
        next_tax_year: to === 'next_tax_year' ? Number(year) : undefined,
      })
      if (res.held_payment_email === 'failed') alert('The plan is back in progress, but the payment email that was waiting could not be sent.')
      onSaved(res.plan)
      if (res.ask_lost && !lost) { setAskLost(true); setSaving(false); return }
      onClose()
    } catch (err) {
      setError(err.message || 'The status was not changed')
      setSaving(false)
    }
  }

  async function setLost() {
    setSaving(true); setError('')
    try {
      await callApi('msm_update_client', { client_id: client.id, status: 'lost' })
      onSaved(null, { lost: true })
      onClose()
    } catch (err) {
      setError(err.message || 'The client was not set to Lost')
      setSaving(false)
    }
  }

  if (askLost) return (
    <BacklogModal title="Set the client to Lost too?" onClose={onClose} width={460}
      footer={<>
        <button style={btnSecondary} onClick={onClose}>No, leave as is</button>
        <button style={btnState(btnDanger, saving)} disabled={saving} onClick={setLost}>{saving ? 'Saving…' : 'Set to Lost'}</button>
      </>}>
      <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
        The plan is stopped and nothing else is open for {clientName || 'this client'}. Lost also stops every automatic payment for them.
      </div>
      {error && <div style={errorText}>{error}</div>}
    </BacklogModal>
  )

  const choiceStyle = (on) => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    background: on ? 'var(--vfo-accent-tint)' : 'var(--vfo-card)', border: on ? '2px solid var(--vfo-primary)' : '2px solid var(--vfo-border-soft)',
  })

  return (
    <BacklogModal title={`${picked ? picked.label : 'Change status'}${clientName ? ` - ${clientName}` : ''}`} onClose={() => { if (!saving) onClose() }} width={620}
      footer={<>
        <button style={btnState(btnSecondary, saving)} disabled={saving} onClick={onClose}>Cancel</button>
        <button style={btnState(to === 'stopped' ? btnDanger : btnPrimary, cannot)} disabled={cannot} title={missing || blocked || undefined} onClick={save}>{saveLabel}</button>
      </>}>
      {!info && !error && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading…</div>}
      {info && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {picked ? <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.5 }}>{picked.hint}</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {choices.map(c => (
              <button key={c.to} type="button" aria-pressed={to === c.to} onClick={() => { setTo(c.to); setError('') }} style={choiceStyle(to === c.to)}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{c.label}</span>
                <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{c.hint}</span>
              </button>
            ))}
          </div>}

          {blocked && <div style={{ ...errorText, marginTop: 0 }}>{blocked}</div>}

          {to === 'paused' && (
            <div>
              <label style={fieldLabel} htmlFor="plan-check-back">Check back on</label>
              <input id="plan-check-back" type="date" min={tomorrow()} value={checkBack} onChange={e => setCheckBack(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }} />
              <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '4px' }}>The PF gets a bell that day.</div>
            </div>
          )}

          {to === 'next_tax_year' && (
            <div>
              <label style={fieldLabel} htmlFor="plan-next-year">Tax year they are moving to</label>
              <select id="plan-next-year" value={year} onChange={e => setYear(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }}>
                {[thisYear, thisYear + 1, thisYear + 2, thisYear + 3].filter(y => !plan.tax_year || y > plan.tax_year).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {closing && (info.warnings || []).length > 0 && (
            <div style={{ marginTop: picked ? '-10px' : 0 }}>
              {info.warnings.map(w => <div key={w} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.6 }}>{w}</div>)}
            </div>
          )}

          {to === 'live' && info.payment_email_held && !blocked && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.6 }}>They signed the agreement while the plan was closed. Their payment email goes out when you save.</div>
          )}

          {to === 'completed' && (info.completed_warnings || []).length > 0 && (
            <div style={{ marginTop: picked ? '-10px' : 0 }}>
              {info.completed_warnings.map(w => <div key={w} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.6 }}>{w}</div>)}
            </div>
          )}

          {emails && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                Send the client an email
              </label>

              {sendEmail && email?.error && <div style={errorText}>{email.error}</div>}
              {sendEmail && email && !email.error && (
                <div style={{ marginTop: '10px', border: '1px solid var(--vfo-border-soft)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--vfo-tint)', padding: '10px 14px', fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                    <div>To: {(email.to || []).join(', ') || 'no address on file'}</div>
                    {(email.cc || []).length > 0 && <div>Cc: {email.cc.join(', ')}</div>}
                    <div style={{ color: 'var(--vfo-ink)', fontWeight: 600 }}>{subject}</div>
                  </div>
                  <div style={{ padding: '14px', fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
                    <div style={{ whiteSpace: 'pre-line' }}>{(before || '').trim()}</div>
                    <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={5000} placeholder="Write your message here" aria-label="Your message"
                      style={{ ...inputStyle, margin: '12px 0', resize: 'vertical', lineHeight: 1.6 }} />
                    <div style={{ whiteSpace: 'pre-line' }}>{(after || '').trim()}</div>
                  </div>
                </div>
              )}

              {!sendEmail && (
                <div style={{ marginTop: '10px' }}>
                  <label style={fieldLabel} htmlFor="plan-skip-reason">Why is no email going?</label>
                  <input id="plan-skip-reason" type="text" autoComplete="off" maxLength={500} value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="Already told them on a call" style={inputStyle} />
                </div>
              )}
            </div>
          )}
          {error && <div style={{ ...errorText, marginTop: 0 }}>{error}</div>}
        </div>
      )}
      {!info && error && <div style={{ ...errorText, marginTop: 0 }}>{error}</div>}
    </BacklogModal>
  )
}
