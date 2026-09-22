import { useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate } from '../../lib/dates'

// Shared outcome card for the advisor/accountant "extra meeting" flow (clones
// MAP 1's PFExtraMeetingForm styling). Renders the request's detail lines plus,
// while pending, the stage-appropriate control:
//  - decision stage: Yes/No dropdown + Submit Decision (resolves final_decision)
//  - signing/payment stage: a single Mark-completed button
// Once completed it collapses to the detail lines with the Meeting-held date.
const STAGE_TEXT = { decision: 'Decision stage', signing: 'Signing stage', payment: 'Payment stage' }

function emDate(d) {
  if (!d) return null
  return formatDate(d)
}

export default function OnboardingExtraMeetingCard({ ob, pipeline, onComplete, compact }) {
  const [choice, setChoice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const action = pipeline === 'accountant' ? 'automation_ACCOUNTANT_extrameeting' : 'automation_ADVISOR_extrameeting'
  const stage = ob.extra_meeting_stage
  const pending = !!ob.extra_meeting_requested_at && !ob.extra_meeting_completed_at

  async function submit(outcome) {
    if (submitting || !outcome) return
    setSubmitting(true)
    try {
      await callApi(action, { onboarding_id: ob.id, outcome })
      if (onComplete) onComplete()
    } catch (err) {
      console.error('Extra meeting submit error:', err)
      alert('Error: ' + (err?.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', width: '100%' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '4px', display: 'block' }
  const greenBtn = { marginTop: '12px', padding: '8px 24px', borderRadius: '6px', fontSize: '12px', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, fontFamily: 'Inter, sans-serif' }

  const detailRow = (label, value) => (
    <div style={{ display: 'flex', padding: '2px 0', alignItems: 'baseline' }}>
      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', width: '96px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', color: value ? 'var(--vfo-ink-2)' : 'var(--vfo-faint)' }}>{value || '—'}</span>
    </div>
  )

  return (
    <div style={{ padding: compact ? '10px 12px' : '12px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.2)', marginTop: '8px', marginBottom: '8px' }}>
      {!compact && <div style={{ fontSize: '12px', fontWeight: 600, color: '#0095ff', marginBottom: '10px' }}>Extra Meeting</div>}
      {detailRow('Requested', emDate(ob.extra_meeting_requested_at))}
      {detailRow('Requested at', STAGE_TEXT[stage] || '—')}
      {detailRow('Meeting held', emDate(ob.extra_meeting_completed_at))}

      {pending && stage === 'decision' && (
        <div style={{ marginTop: '10px' }}>
          <label style={labelStyle}>Client Decision After Meeting</label>
          <select value={choice} onChange={e => setChoice(e.target.value)} disabled={submitting} style={inputStyle}>
            <option value="">-- Select --</option>
            <option value="Yes">Yes — Moving Forward</option>
            <option value="No">No — Not Moving Forward</option>
          </select>
          <div>
            <button onClick={() => submit(choice)} disabled={submitting || !choice}
              style={{ ...greenBtn, cursor: (submitting || !choice) ? 'not-allowed' : 'pointer', opacity: (submitting || !choice) ? 0.5 : 1 }}>
              {submitting ? 'Saving...' : 'Submit Decision'}
            </button>
          </div>
        </div>
      )}

      {pending && (stage === 'signing' || stage === 'payment') && (
        <div>
          <button onClick={() => submit('Completed')} disabled={submitting}
            style={{ ...greenBtn, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1 }}>
            {submitting ? 'Saving...' : 'Mark meeting completed'}
          </button>
        </div>
      )}
    </div>
  )
}
