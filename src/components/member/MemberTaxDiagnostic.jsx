import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import TaxIntakeForm from './TaxIntakeForm'
import { DiagnosticCard } from '../admin/TaxDiagnosticsPanel'

// The member portal's Tax Diagnostic tab (2026-10-14) — open to EVERY member, no
// feature switch. Two views:
//   - Start a Tax Diagnostic: the MSM Tax Planning tab's "+ Add Client"
//     flow on its own (TaxIntakeForm: who runs the case — only while tax_direct
//     is on — then who fills the form), so every rule of that flow applies
//     unchanged. The backend routes it reaches (tax_intake_submit /
//     tax_intake_send_link) no longer read the tax_intake switch; the Holistic
//     existing-client route still does and is never offered here.
//   - Submitted Diagnostics: the member's own portal forms
//     (member_tax_diagnostic_list), drawn with the admin Tax Diagnostics card in
//     memberMode — read-only, newest first.
// Laid out like Client Overview (2026-10-14, Jake): its eyebrow + heading and
// its pill buttons, opening on Submitted Diagnostics.
const VIEWS = [
  { key: 'submitted', label: 'Submitted Diagnostics' },
  { key: 'start', label: 'Start a Tax Diagnostic' },
]

export default function MemberTaxDiagnostic({ member }) {
  const [view, setView] = useState('submitted')
  const [formKey, setFormKey] = useState(0)
  const [doneMessage, setDoneMessage] = useState('')
  const [forms, setForms] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [openKey, setOpenKey] = useState(null)

  async function loadForms() {
    try {
      const res = await callApi('member_tax_diagnostic_list')
      setForms(res.forms || [])
      setLoadError('')
    } catch (err) {
      setLoadError(err?.message || 'Could not load your diagnostics')
    }
  }
  useEffect(() => { loadForms() }, [])

  // Same wording as MemberClientsView.finishIntake (the MSM Tax Planning tab).
  function finish(res) {
    setDoneMessage(res?.link_sent_to
      ? `We have drafted the Tax Planning Form link for ${res.link_sent_to}. It will be sent shortly.`
      : res?.tax_plan_id
        ? 'Client created. We have emailed you a confirmation.'
        : 'Thank you — your Tax Planning Form has been received.')
    loadForms()
  }

  function restart() {
    setDoneMessage('')
    setFormKey(k => k + 1)
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const card = { ...sectionStyle, marginBottom: '20px' }

  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>VFO Tax Planning</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '4px 0 0' }}>Tax Diagnostic</h2>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {VIEWS.map(v => (
          <button key={v.key} type="button" onClick={() => { setView(v.key); if (v.key === 'submitted') loadForms() }}
            style={{ padding: '7px 16px', borderRadius: '999px', border: '1px solid ' + (view === v.key ? '#125ecc' : 'var(--vfo-border-strong)'), background: view === v.key ? '#125ecc' : 'var(--vfo-input)', color: view === v.key ? '#fff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
            {v.label}{v.key === 'submitted' && forms ? ` (${forms.length})` : ''}
          </button>
        ))}
        {view === 'submitted' && (
          <button type="button" onClick={loadForms}
            style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--vfo-accent-text)', background: 'rgba(18,94,204,0.08)', color: 'var(--vfo-accent-text)', fontFamily: 'Inter, sans-serif' }}>
            Refresh
          </button>
        )}
      </div>

      {/* The form keeps its usual width (900px, as on the MSM Tax Planning tab). */}
      {view === 'start' && <div style={{ maxWidth: '900px' }}>{doneMessage ? (
        <div style={{ ...sectionStyle, borderColor: 'rgba(27,146,84,0.35)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-success-text)', marginBottom: '8px' }}>Thank you</div>
          <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>{doneMessage}</div>
          <button type="button" onClick={restart}
            style={{ marginTop: '16px', padding: '8px 18px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#125ecc', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Add another client
          </button>
        </div>
      ) : (
        <TaxIntakeForm key={formKey} member={member} onCancel={restart} onDone={finish} pageHeading />
      )}</div>}

      {view === 'submitted' && (
        <>
          {loadError && <div style={{ ...card, color: '#d93025', fontSize: '13px' }}>{loadError}</div>}
          {!forms && !loadError && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading...</div>}
          {forms && forms.length === 0 && (
            <div style={{ ...card, fontSize: '13px', color: 'var(--vfo-muted)' }}>No Tax Diagnostics submitted yet.</div>
          )}
          {(forms || []).map(d => (
            <DiagnosticCard key={d.key} d={d} members={[]} card={card} memberMode
              open={openKey === d.key} onToggle={() => setOpenKey(openKey === d.key ? null : d.key)} onChanged={loadForms} />
          ))}
        </>
      )}
    </div>
  )
}
