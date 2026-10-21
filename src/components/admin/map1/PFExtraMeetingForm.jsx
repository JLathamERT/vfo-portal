import { useState, useEffect } from 'react'
import { callApi } from '../../../lib/api'
import { hasStrategicSplit, computeStrategicShares } from '../../../lib/strategicSplits'

function PFExtraMeetingForm({ clientId, pipelineId, onComplete, memberCategory, memberType, memberPays }) {
  // MAP 1 is always Holistic Planning. Strategic members get the auto-split
  // (Member Contribution removed → net = gross).
  const isStrategic = memberCategory === 'strategic_member' && hasStrategicSplit(memberType)
  // Member signing + paying on behalf: all to VFOS, locked (server matches -
  // utils/member-pays-split.ts).
  const locked = isStrategic || memberPays
  const [decision, setDecision] = useState('')
  const [serviceLevel, setServiceLevel] = useState('')
  const [grossFee, setGrossFee] = useState('')
  const [memberContribution, setMemberContribution] = useState('')
  const netInvoice = ((parseFloat(grossFee) || 0) - (isStrategic ? 0 : (parseFloat(memberContribution) || 0))).toFixed(2)
  const [memberShare, setMemberShare] = useState('')
  const [vfosShare, setVfosShare] = useState('')
  const [strategicPartnerShare, setStrategicPartnerShare] = useState('')
  const [paymentPlan, setPaymentPlan] = useState('')
  const [pipMeetingCount, setPipMeetingCount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (memberPays) { setMemberShare('0.00'); setVfosShare(netInvoice); setStrategicPartnerShare('') }
  }, [memberPays, netInvoice])

  useEffect(() => {
    if (!isStrategic || memberPays) return
    const shares = computeStrategicShares(memberType, 'holistic', grossFee)
    if (shares) {
      setMemberShare(shares.member.toFixed(2))
      setVfosShare(shares.vfos.toFixed(2))
      setStrategicPartnerShare(shares.strategic.toFixed(2))
    } else {
      setMemberShare(''); setVfosShare(''); setStrategicPartnerShare('')
    }
  }, [isStrategic, memberType, grossFee, memberPays])

  async function handleSubmit() {
    if (!decision) return
    if (decision === 'Yes' && (!serviceLevel || !grossFee || !paymentPlan)) return
    setSubmitting(true)
    try {
      await callApi('automation_PCADMIN_extrameeting', {
        pipeline_id: pipelineId,
        client_id: clientId,
        decision,
        service_level: decision === 'Yes' ? serviceLevel : null,
        gross_fee: decision === 'Yes' ? grossFee : null,
        member_contribution: decision === 'Yes' ? (isStrategic ? '0' : memberContribution) : null,
        net_invoice: decision === 'Yes' ? netInvoice : null,
        member_share: decision === 'Yes' ? memberShare : null,
        vfos_share: decision === 'Yes' ? vfosShare : null,
        strategic_partner_share: decision === 'Yes' && isStrategic && !memberPays ? strategicPartnerShare : null,
        payment_plan: decision === 'Yes' ? paymentPlan : null,
        pip_meeting_count: decision === 'Yes' && serviceLevel === 'Max' ? pipMeetingCount : null,
      })
      if (onComplete) onComplete()
    } catch (err) { console.error('Extra meeting submit error:', err) }
    finally { setSubmitting(false) }
  }

  const inputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', width: '100%' }
  const labelStyle = { fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '4px', display: 'block' }

  const canSubmit = decision === 'No' || (decision === 'Yes' && serviceLevel && grossFee && paymentPlan && (serviceLevel !== 'Max' || pipMeetingCount))

  return (
    <div style={{ padding: '12px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.2)', marginTop: '8px', marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#0095ff', marginBottom: '12px' }}>Extra Meeting Outcome</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Client Decision After Meeting</label>
          <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            <option value="Yes">Yes — Moving Forward</option>
            <option value="No">No — Not Moving Forward</option>
          </select>
        </div>

        {decision === 'Yes' && (
          <>
            <div>
              <label style={labelStyle}>Service Level</label>
              <select value={serviceLevel} onChange={e => setServiceLevel(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                <option value="">-- Select --</option>
                <option value="Lite">Lite</option>
                <option value="Core">Core</option>
                <option value="Max">Max</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Gross Service Value ($)</label>
              <input value={grossFee} onChange={e => setGrossFee(e.target.value)} style={inputStyle} placeholder="e.g. 5400" />
            </div>
            {!isStrategic && (
              <div>
                <label style={labelStyle}>Member Contribution ($)</label>
                <input value={memberContribution} onChange={e => setMemberContribution(e.target.value)} style={inputStyle} placeholder="e.g. 0" />
              </div>
            )}
            <div>
              <label style={labelStyle}>Net Invoice Value ($)</label>
              <input value={netInvoice} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
            </div>
            <div>
              <label style={labelStyle}>Payment Plan</label>
              <select value={paymentPlan} onChange={e => setPaymentPlan(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                <option value="">-- Select --</option>
                <option value="1 Time Payment">1 Time Payment</option>
                <option value="Quarterly">Quarterly</option>
              </select>
            </div>
            {memberPays && (
              <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, marginTop: '2px' }}>
                Member paying on behalf — all to VFOS, set automatically.
              </div>
            )}
            {isStrategic && !memberPays && (
              <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, marginTop: '2px' }}>
                Strategic member ({memberType}) — split auto-calculated from the gross.
              </div>
            )}
            {isStrategic && !memberPays && (
              <div>
                <label style={labelStyle}>Strategic Partner Share ($)</label>
                <input value={strategicPartnerShare} readOnly style={{ ...inputStyle, opacity: 0.6 }} placeholder="0.00" />
              </div>
            )}
            <div>
              <label style={labelStyle}>Member Share ($)</label>
              <input value={memberShare} onChange={e => setMemberShare(e.target.value)} readOnly={locked} style={{ ...inputStyle, ...(locked ? { opacity: 0.6 } : {}) }} placeholder="e.g. 1200" />
            </div>
            <div>
              <label style={labelStyle}>VFOs Share ($)</label>
              <input value={vfosShare} onChange={e => setVfosShare(e.target.value)} readOnly={locked} style={{ ...inputStyle, ...(locked ? { opacity: 0.6 } : {}) }} placeholder="e.g. 4200" />
            </div>
            {serviceLevel === 'Max' && (
              <div>
                <label style={labelStyle}>PIP Meeting Count</label>
                <input value={pipMeetingCount} onChange={e => setPipMeetingCount(e.target.value)} style={inputStyle} placeholder="e.g. 4" />
              </div>
            )}
          </>
        )}
      </div>
      <button onClick={handleSubmit} disabled={submitting || !canSubmit}
        style={{ marginTop: '12px', padding: '8px 24px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
        {submitting ? 'Saving...' : 'Submit Decision'}
      </button>
    </div>
  )
}

export default PFExtraMeetingForm