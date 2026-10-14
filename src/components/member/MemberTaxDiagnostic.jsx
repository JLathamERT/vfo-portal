import { useState } from 'react'
import TaxIntakeForm from './TaxIntakeForm'

// The member portal's Tax Diagnostic tab (2026-10-14) — open to EVERY member, no
// feature switch. It is the MSM Tax Planning tab's "+ Add new tax client" flow
// on its own (TaxIntakeForm: who runs the case, then who fills the form), so
// every rule of that flow applies unchanged: the $500 deposit and its waiver,
// Direct only when eligible, the choice page, the unpaid-form rule. The backend
// routes it reaches (tax_intake_submit / tax_intake_send_link) no longer read
// the tax_intake switch; the Holistic existing-client route still does and is
// never offered here.
export default function MemberTaxDiagnostic({ member }) {
  const [formKey, setFormKey] = useState(0)
  const [doneMessage, setDoneMessage] = useState('')

  // Same wording as MemberClientsView.finishIntake (the MSM Tax Planning tab).
  function finish(res) {
    setDoneMessage(res?.link_sent_to
      ? `We have drafted the Tax Planning Form link for ${res.link_sent_to}. It will be sent shortly.`
      : res?.tax_plan_id
        ? 'Client created. We have emailed you a confirmation.'
        : 'Thank you — your Tax Planning Form has been received.')
  }

  function restart() {
    setDoneMessage('')
    setFormKey(k => k + 1)
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      {doneMessage ? (
        <div style={{ ...sectionStyle, borderColor: 'rgba(27,146,84,0.35)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1b9254', marginBottom: '8px' }}>Thank you</div>
          <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>{doneMessage}</div>
          <button type="button" onClick={restart}
            style={{ marginTop: '16px', padding: '8px 18px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Add another client
          </button>
        </div>
      ) : (
        <TaxIntakeForm key={formKey} member={member} onCancel={restart} onDone={finish} />
      )}
    </div>
  )
}
