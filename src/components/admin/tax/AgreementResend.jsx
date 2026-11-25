import { useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import { btnStep, btnState } from '../../shared/buttonStyles'

// Shown under "Engagement agreement created and sent for signing" when the agreement
// out for signature can no longer be signed (BoldSign says it expired, was declined or
// was withdrawn). Re-send makes a new one with the same terms and emails it.
const WORDS = { expired: 'Agreement expired', declined: 'Agreement declined', revoked: 'Agreement withdrawn' }

export default function AgreementResend({ plan, onSent }) {
  const [ended, setEnded] = useState(null)
  const [busy, setBusy] = useState(false)

  const waiting = plan?.agreement_sent === 'Yes' && !!plan?.boldsign_doc_id && plan?.client_signed !== 'Yes'
  useEffect(() => {
    setEnded(null)
    if (!waiting) return
    let on = true
    callApi('tax_agreement_status_load', { tax_plan_id: plan.id })
      .then(res => { if (on) setEnded(res?.ended || null) })
      .catch(err => console.error('tax_agreement_status_load failed', err))
    return () => { on = false }
  }, [plan?.id, plan?.boldsign_doc_id, waiting])

  if (!waiting || !ended) return null

  async function resend() {
    if (busy) return
    if (!window.confirm('Send a new agreement?\n\nA new copy with the same fees is emailed for signing, and the old one stays closed.')) return
    setBusy(true)
    try {
      const res = await callApi('automation_TAX_sendagreement', { tax_plan_id: plan.id, resend: true })
      if (!res?.signing_link) alert('The agreement was sent, but its signing link could not be read, so the email has no signing button. Please tell the portal team.')
      setEnded(null)
      await onSent?.()
    } catch (err) {
      alert('Re-send failed: ' + (err?.message || 'unknown error'))
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'transparent', flexShrink: 0, border: '1px solid var(--vfo-border-mid)' }} />
      <span className="vfo-substepname" style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{WORDS[ended]}</span>
      <button type="button" disabled={busy} onClick={resend} style={{ ...btnState(btnStep, busy), marginLeft: 'auto' }}>
        {busy ? 'Sending…' : 'Re-send agreement'}
      </button>
    </div>
  )
}
