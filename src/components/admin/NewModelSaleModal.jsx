import { useState, useEffect } from 'react'
import { loadCachedData } from '../../lib/api'
import { isTier1Onboarding, isConnectedAssociate, tier1AdvisorPays } from './onboardingOrder'

// ── Team-member name list for the three dropdowns (closer / setter / introduced-by).
// One shared list for all three. Edit this array (then redeploy) to add/remove names.
// NOTE: this is the DROPDOWN names only — the email RECIPIENTS are managed separately
// in Email Templates → "Team Notification (Advisor & Accountant)".
export const SALES_TEAM_NAMES = [
  'Rachael Hopson',
  'Ian Welham',
  'Anton Anderson',
  'Paul Latham',
  'Seth Hartford',
  'Evan Anderson',
  'Bridger Silvester',
  'Vanessa Smith',
]

// MSM (Member Success Manager) names for the "MSM" dropdown. The email renders
// only the first name of the selection. Edit this array (then redeploy) to change.
export const MSM_NAMES = [
  'Sarah Freitas',
  'Rachael Hopson',
  'Ian Welham',
]

function buildPlans(ob, isAcct) {
  const labels = []
  if (isAcct) {
    const p = ob.accountant_partnership === 'Accountant Partnership'
    if (ob.selected_vfo_ft) labels.push(p ? 'VFO Fast Track (Partnership)' : 'VFO Fast Track')
    if (ob.selected_corporate) labels.push('Corporate Membership')
  } else {
    if (ob.selected_vfo_ft) labels.push('VFO Fast Track')
    if (ob.selected_pft) labels.push('Partnership Fast Track')
    if (ob.selected_corporate) labels.push('Corporate Membership')
  }
  if (!labels.length) return 'n/a'
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels[0]}, ${labels[1]} and ${labels[2]}`
}

function formatLong(d) {
  if (!d) return 'n/a'
  const date = new Date(d)
  if (isNaN(date.getTime())) return 'n/a'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }

// Modal that opens on the Stage-3 "Create Advisor/Accountant" click. Collects the
// New-Model-Sale form fields, then on confirm hands them to onConfirm() which fires
// the existing create-member action (now also drafting the team notification email).
export default function NewModelSaleModal({ ob, kind, submitting, onClose, onConfirm }) {
  const isAcct = kind === 'accountant'
  // A VFO Associate / Financial Collaborator (portal licensing L6b) is a monthly
  // membership; the summary matches the team email the server drafts for it.
  const tier1 = isTier1Onboarding(ob, isAcct ? 'accountant' : 'advisor')
  const connected = tier1 && isAcct && isConnectedAssociate(ob)
  const [companyName, setCompanyName] = useState('')
  const [website, setWebsite] = useState('')
  const [msm, setMsm] = useState('n/a')
  const [closer, setCloser] = useState('n/a')
  const [setter, setSetter] = useState('n/a')
  const [introducedBy, setIntroducedBy] = useState('n/a')
  const [members, setMembers] = useState([])
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    loadCachedData()
      .then(d => setMembers((d?.members || []).filter(m => m.member_category === 'advisor' || m.member_category === 'accountant')))
      .catch(() => {})
  }, [])

  const memberName = `${ob.first_name || ''} ${ob.last_name || ''}`.trim() || 'n/a'
  const agreementName = tier1
    ? (!isAcct ? 'Financial Collaborator Agreement' : connected ? 'VFO Associate Agreement (Connected)' : 'VFO Associate Agreement (Direct)')
    : isAcct
    ? (ob.accountant_partnership === 'Accountant Partnership' ? 'Accountant Implementation Agreement (Advisor)' : 'Accountant Implementation Agreement (Direct)')
    : 'Advisor Implementation Agreement'
  const selectedPlans = !tier1 ? buildPlans(ob, isAcct)
    : connected
      ? `$25 a month VFO Portal licence${tier1AdvisorPays(ob, 'accountant') && ob.cc_advisor_name ? ` - paid by ${ob.cc_advisor_name}` : ''}`
      : '$145 a month, month to month ($120 ERT membership + $25 VFO Portal licence)'
  const paymentPlan = tier1 ? 'First month paid'
    : (ob.payment_amount != null && Number(ob.payment_amount) > 0)
    ? `1 payment of $${Number(ob.payment_amount).toLocaleString('en-US')}`
    : 'n/a'

  const q = query.trim().toLowerCase()
  const results = q
    ? members.filter(m =>
        (m.name || `${m.first_name || ''} ${m.last_name || ''}`).toLowerCase().includes(q) ||
        String(m.member_number || m.plugin_member_number || '').toLowerCase().includes(q)
      ).slice(0, 8)
    : []

  function pickMember(m) {
    setSelectedMember({
      number: m.member_number || m.plugin_member_number || '',
      name: (m.name || `${m.first_name || ''} ${m.last_name || ''}`).trim(),
    })
    setQuery(''); setShowResults(false)
  }

  function confirm() {
    onConfirm({
      sale_company_name: companyName.trim() || null,
      sale_website: website.trim() || null,
      sale_msm: msm,
      sale_closer: closer,
      sale_setter: setter,
      sale_introduced_by: introducedBy,
      sale_introduced_member_number: selectedMember?.number || null,
      sale_introduced_member_name: selectedMember?.name || null,
    })
  }

  const Dropdown = ({ label, value, setValue }) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => setValue(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="n/a">n/a</option>
        {SALES_TEAM_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )

  return (
    <div onClick={() => { if (!submitting) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 12px 40px rgba(20,45,95,0.25)', padding: '24px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '4px' }}>{tier1 ? (isAcct ? 'New VFO Associate' : 'New Financial Collaborator') : 'New Model Sale'}</div>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>
          Fill in the details below. On confirm, the {isAcct ? 'accountant' : 'advisor'} is created and the team notification email is drafted.
        </div>

        <div style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', fontSize: '12.5px', color: 'var(--vfo-ink)', lineHeight: 1.7 }}>
          <div><strong>{memberName}</strong>{ob.member_number ? <span style={{ color: 'var(--vfo-muted)', fontFamily: 'monospace', marginLeft: '8px' }}>#{ob.member_number}</span> : null}</div>
          <div style={{ color: 'var(--vfo-muted)' }}>{agreementName} — {selectedPlans}</div>
          <div style={{ color: 'var(--vfo-muted)' }}>{paymentPlan} · Invoice {ob.invoice_number || 'n/a'}{tier1 ? ' · Membership Fees from month 2' : <> · 6-month transition {formatLong(ob.renewal_date)}</>}</div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Company name <span style={{ color: '#9aa7bd', fontWeight: 400 }}>(optional)</span></label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Leave blank to omit" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Website <span style={{ color: '#9aa7bd', fontWeight: 400 }}>(optional)</span></label>
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Leave blank to omit" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>MSM</label>
          <select value={msm} onChange={e => setMsm(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="n/a">n/a</option>
            {MSM_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <Dropdown label="Person responsible for closing" value={closer} setValue={setCloser} />
        <Dropdown label="Setter responsible" value={setter} setValue={setSetter} />
        <Dropdown label="Introduced by team member" value={introducedBy} setValue={setIntroducedBy} />

        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={labelStyle}>Member introduction (search advisors &amp; accountants)</label>
          {selectedMember ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', border: '1px solid rgba(0,149,255,0.3)', fontSize: '13px', color: 'var(--vfo-ink)' }}>
              {selectedMember.name}{selectedMember.number ? <span style={{ fontFamily: 'monospace', color: 'var(--vfo-muted)' }}>#{selectedMember.number}</span> : null}
              <button onClick={() => setSelectedMember(null)} title="Clear" style={{ border: 'none', background: 'transparent', color: 'var(--vfo-muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ) : (
            <>
              <input type="search" name="search" autoComplete="off" value={query} placeholder="Type a name or number — leave blank for n/a"
                onChange={e => { setQuery(e.target.value); setShowResults(true) }}
                onFocus={() => setShowResults(true)}
                style={{ ...inputStyle }} />
              {showResults && results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', boxShadow: '0 6px 20px rgba(20,45,95,0.15)', maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                  {results.map(m => (
                    <div key={m.member_number || m.plugin_member_number}
                      onClick={() => pickMember(m)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-page)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
                      {m.name || `${m.first_name || ''} ${m.last_name || ''}`}
                      <span style={{ color: 'var(--vfo-muted)', fontFamily: 'monospace', fontSize: '11px', marginLeft: '6px' }}>#{m.member_number || m.plugin_member_number} · {m.member_category}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>Cancel</button>
          <button onClick={confirm} disabled={submitting} style={{ padding: '10px 24px', borderRadius: '8px', background: submitting ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {submitting ? 'Creating…' : `Create ${isAcct ? 'Accountant' : 'Advisor'} & Notify Team`}
          </button>
        </div>
      </div>
    </div>
  )
}
