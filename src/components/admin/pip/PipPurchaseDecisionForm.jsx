import { useState } from 'react'
import { callApi } from '../../../lib/api'
import { formInput, tintBox } from '../../shared/ProfileKit'
import { btnPrimary, btnState } from '../../shared/buttonStyles'

const DECISION_OPTIONS = [
  'No',
  'Tax Planning (if not purchased already)',
  'Additional PIP meeting(s)',
]

function PipPurchaseDecisionForm({ task, priorityTrackId, clientId, engagementYear, existingData, onSubmitted }) {
  const existing = existingData || {}
  const isViewMode = !!existingData

  const [decision, setDecision] = useState(existing.decision || '')
  const [additionalCount, setAdditionalCount] = useState(existing.additionalCount || '')
  const [grossServiceValue, setGrossServiceValue] = useState(existing.grossServiceValue || '')
  const [memberContribution, setMemberContribution] = useState(existing.memberContribution || '')
  const netInvoiceValue = ((parseFloat(grossServiceValue) || 0) - (parseFloat(memberContribution) || 0)).toFixed(2)
  const [memberShare, setMemberShare] = useState(existing.memberShare || '')
  const [vfosShare, setVfosShare] = useState(existing.vfosShare || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const inputStyle = formInput
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
  const sectionStyle = tintBox
  const readOnlyInput = { ...inputStyle, opacity: 0.6, pointerEvents: 'none' }

  const showPricing = decision === 'Tax Planning (if not purchased already)' || decision === 'Additional PIP meeting(s)'

  const isAdditionalPip = decision === 'Additional PIP meeting(s)'

  async function handleSubmit() {
    if (!decision) { setSubmitError('Please select a decision'); return }
    if (isAdditionalPip) {
      const c = parseInt(additionalCount, 10)
      if (!Number.isFinite(c) || c < 1 || c > 50) { setSubmitError('Enter number of additional PIP meetings (1-50)'); return }
    }
    if (showPricing) {
      if (!grossServiceValue) { setSubmitError('Please enter gross service value'); return }
      const splitTotal = (parseFloat(memberShare) || 0) + (parseFloat(vfosShare) || 0)
      const netVal = parseFloat(netInvoiceValue) || 0
      if (Math.abs(splitTotal - netVal) > 0.01) {
        setSubmitError(`Revenue split ($${splitTotal.toFixed(2)}) must equal Net Invoice Value ($${netVal.toFixed(2)})`)
        return
      }
    }
    setSubmitError('')
    setSubmitting(true)
    const formData = { decision }
    if (isAdditionalPip) formData.additionalCount = additionalCount
    if (showPricing) {
      formData.grossServiceValue = grossServiceValue
      formData.memberContribution = memberContribution
      formData.netInvoiceValue = netInvoiceValue.toString()
      formData.memberShare = memberShare
      formData.vfosShare = vfosShare
    }
    try {
      const today = new Date().toISOString().split('T')[0]
      await callApi('msm_save_priority_task', {
        priority_track_id: priorityTrackId,
        task_id: task.id,
        status: `Completed - ${decision}`,
        completed_date: today,
        notes: JSON.stringify(formData),
      })
      await callApi('msm_update_pip_meeting', {
        priority_track_id: priorityTrackId,
        pip_completed_date: today,
      })
      if (showPricing) {
        await callApi('msm_save_pip_purchase', {
          priority_track_id: priorityTrackId,
          purchase_kind: isAdditionalPip ? 'additional_pip' : 'tax_planning',
          purchase_pip_count: isAdditionalPip ? parseInt(additionalCount, 10) : null,
          gross_service_value: grossServiceValue,
          member_contribution: memberContribution,
          purchase_amount: netInvoiceValue,
          member_share: memberShare,
          vfos_share: vfosShare,
        })
      }
      if (isAdditionalPip && clientId && engagementYear) {
        await callApi('msm_add_pip_meetings_for_year', {
          client_id: clientId,
          engagement_year: engagementYear,
          count: parseInt(additionalCount, 10),
          paid: false,
          source_track_id: priorityTrackId,
        })
      }
      if (showPricing) {
        // Kick off the payment chain (creates Stripe customer + drafts payment email)
        await callApi('automation_PIP_stripecustomer', { priority_track_id: priorityTrackId })
      }
      if (onSubmitted) onSubmitted(`Completed - ${decision}`, formData, today)
    } catch (err) {
      console.error(err)
      setSubmitError(err?.message || 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ marginLeft: '18px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', marginTop: '4px', marginBottom: '8px' }}>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Client decision</label>
        {isViewMode
          ? <div style={{ ...inputStyle, opacity: 0.6 }}>{decision}</div>
          : <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
              <option value="">-- Select --</option>
              {DECISION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        }
      </div>

      {isAdditionalPip && (
        <div style={sectionStyle}>
          <label style={labelStyle}>How many PIP meetings?</label>
          {isViewMode
            ? <div style={readOnlyInput}>{additionalCount || '—'}</div>
            : <input type="number" min="1" max="50" value={additionalCount} onChange={e => setAdditionalCount(e.target.value)} placeholder="e.g. 2" style={inputStyle} />
          }
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '6px', fontStyle: 'italic' }}>These meetings will be added to Year {engagementYear ?? '?'} but locked until payment + revenue share are recorded.</div>
        </div>
      )}

      {showPricing && (
        <>
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Pricing</div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Gross service value</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={grossServiceValue} onChange={e => setGrossServiceValue(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Member contribution <span style={{ textTransform: 'none', opacity: 0.6 }}>(if applicable)</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={memberContribution} onChange={e => setMemberContribution(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Net invoice value</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                <input value={isViewMode ? (existing.netInvoiceValue || '0.00') : netInvoiceValue} readOnly style={{ ...readOnlyInput, paddingLeft: '28px', background: 'rgba(27,146,84,0.08)', borderColor: 'rgba(27,146,84,0.2)' }} />
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Revenue split</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>Member share</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={memberShare} onChange={e => setMemberShare(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={labelStyle}>VFOS share</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} placeholder="0.00" style={{ ...(isViewMode ? readOnlyInput : inputStyle), paddingLeft: '28px' }} readOnly={isViewMode} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {decision && !isViewMode && (
        <>
          {submitError && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>{submitError}</div>}
          <button onClick={handleSubmit} disabled={submitting} style={{ ...btnState(btnPrimary, submitting), width: '100%', padding: '12px', fontSize: '15px' }}>
            {submitting ? 'Submitting...' : 'Submit Outcome - Meeting Complete'}
          </button>
        </>
      )}
    </div>
  )
}

export default PipPurchaseDecisionForm
