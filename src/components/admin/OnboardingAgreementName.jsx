import { useState } from 'react'
import { callApi } from '../../lib/api'
import { cleanText } from '../../lib/formatters'
import { btnOutline, btnState, BTN_SMALL } from '../shared/buttonStyles'

// "Name on agreement" in the Preliminary Meeting Decision step (Advisor + Accountant
// Onboarding): whether the engagement agreement prints the personal or the company
// name. Needed before Yes or Undecided, and changeable until the agreement is sent
// (save_onboarding_agreement_name). Everything else keeps the personal name. The company
// box shows only while none is on file; what is typed there is saved as the company name
// and becomes the new member's.
export default function OnboardingAgreementName({ ob, pipeline, selectStyle, onSaved, onPending }) {
  const [draft, setDraft] = useState(ob.agreement_name_mode || '')
  const [company, setCompany] = useState('')
  const [saving, setSaving] = useState(false)
  const personal = `${ob.first_name || ''} ${ob.last_name || ''}`.trim()
  const onFile = cleanText(ob.sale_company_name)

  if (ob.prelim_meeting_decision === 'No' || ob.final_decision === 'No') return null
  if (ob.agreement_sent_at) {
    if (!ob.agreement_name_mode) return null
    return <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Name on agreement: {ob.agreement_name_mode === 'company' && onFile ? onFile : personal}</span>
  }

  async function save(mode, companyName) {
    setSaving(true)
    try {
      const res = await callApi('save_onboarding_agreement_name', {
        pipeline, onboarding_id: ob.id, agreement_name_mode: mode,
        ...(companyName ? { company_name: companyName } : {}),
      })
      if (res?.onboarding) { onSaved(res.onboarding); onPending(false) }
    } catch (err) {
      console.error(err); alert('Error: ' + err.message)
      setDraft(ob.agreement_name_mode || '')
      onPending(false)
    } finally { setSaving(false) }
  }

  function pick(mode) {
    if (!mode) return
    setDraft(mode)
    if (mode === 'personal' || onFile) save(mode)
    else onPending(true)
  }

  const typed = cleanText(company)
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Name on agreement</span>
      <select value={draft} onChange={e => pick(e.target.value)} disabled={saving} style={{ ...selectStyle, color: 'var(--vfo-ink)' }}>
        <option value="">-- Select --</option>
        <option value="personal">Personal name - {personal}</option>
        <option value="company">Company name{onFile ? ` - ${onFile}` : ''}</option>
      </select>
      {draft === 'company' && !onFile && (
        <>
          <input value={company} onChange={e => setCompany(e.target.value)} disabled={saving} maxLength={120} placeholder="Type the company name"
            style={{ ...selectStyle, color: 'var(--vfo-ink)', cursor: 'text', minWidth: '200px' }} />
          <button onClick={() => save('company', typed)} disabled={saving || !typed} style={btnState({ ...btnOutline, ...BTN_SMALL }, saving || !typed)}>{saving ? 'Saving...' : 'Save'}</button>
        </>
      )}
    </div>
  )
}
