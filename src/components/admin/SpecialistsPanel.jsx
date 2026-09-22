import { Fragment, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { callApi } from '../../lib/api'
import { fileSizeError } from '../../lib/fileUpload'
import MemberShowroom from '../member/MemberShowroom'
import SpecialistOnboarding from './SpecialistOnboarding'
import SpecialistAdminVault from './SpecialistAdminVault'
import SpecialistPaymentsTab from '../payments/SpecialistPaymentsTab'
import SendSetupEmailButton from './SendSetupEmailButton'
import SpecialistKpiPanel from './SpecialistKpiPanel'
import ListFilterButton, { matchesFilter, sortByJoin, SortSelect } from './ListFilterButton'
import ImageCropModal from './ImageCropModal'
import { formatDate } from '../../lib/dates'

const ECOSYSTEMS = ['Tax Planning', 'Business Advisory', 'Legal Services', 'Risk Mitigation', 'Wealth Management', 'Member Services']
// "Member Services" is internal-only and mutually exclusive with the five public
// ecosystems: a specialist is either Member Services OR (some of) the public five.
const MEMBER_SERVICES = 'Member Services'
// The Tax section (shared, one set per person) only surfaces under this ecosystem.
const TAX_ECOSYSTEM = 'Tax Planning'
const STATUS_COLORS = { Active: '#1b9254', Lost: '#e74c3c', Removed: 'var(--vfo-muted)' }
const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
const HEADSHOT_BASE = 'https://biz-diagnostic.com/Uploads/ExpertPhotos/'

// A specialist can serve more than one VFO ecosystem, and their short_bio +
// (non-tax) Details & Benefits differ per ecosystem. Those per-ecosystem fields
// live in a single map on the experts row:
//   ecosystem_content = { "<ecosystem>": { short_bio, "D&B_...": ... }, ... }
// The top-level short_bio + D&B_* columns mirror the PRIMARY (first) ecosystem
// so the public widget/showroom + agreement flows are unchanged. Everything else
// (identity, long bio, payout, background check) is shared across ecosystems —
// INCLUDING the Tax section (risk mindset/notes + audit questionnaire), which is
// one set per person, not per ecosystem.
//   SHARED_KEYS  — one value per profile (identity only).
//   CONTENT_KEYS — short_bio + non-tax D&B + the TAX_KEYS, one value per ENTRY
//                  (the tax questionnaire is now per Tax Planning entry).
const ECO_DB_KEYS = ['D&B_strategy_expertise', 'D&B_cutoff_date', 'D&B_client_requirements', 'D&B_investment_cost', 'D&B_ideal_client', 'D&B_summary_benefits', 'D&B_getting_started', 'D&B_professional_process', 'D&B_competitive_advantage', 'D&B_revenue_share']
// Tax Risk Mindset was removed from the portal entirely (2026-07-16); its flat
// column is left untouched. TAX_KEYS = the per-entry tax fields still in use:
// notes (edit-form only) + the 4 Audit Risk Questionnaire answers.
const TAX_KEYS = ['D&B_tax_risk_notes', 'D&B_audit_risk_general', 'D&B_audit_risk_history', 'D&B_audit_risk_worst_case', 'D&B_audit_risk_precautions']
const NONTAX_CONTENT_KEYS = ['short_bio', ...ECO_DB_KEYS]
const CONTENT_KEYS = [...NONTAX_CONTENT_KEYS, ...TAX_KEYS]
// personal_email is record-only: it loads/saves through the shared block but is
// never emailed and is stripped from every non-admin payload (see load-data.ts).
const SHARED_KEYS = ['name', 'email', 'personal_email', 'status', 'leave_date', 'join_date', 'revenue_decision', 'long_bio', 'background_check', 'top_of_t', 'vfo_accredited']
// Boolean shared flags (default false, coerced on load/blank).
const BOOL_KEYS = ['top_of_t', 'vfo_accredited']
const uniqueEcos = arr => [...new Set(arr || [])]

function blankShared() {
  const s = {}
  SHARED_KEYS.forEach(k => { s[k] = BOOL_KEYS.includes(k) ? false : k === 'status' ? 'Active' : '' })
  return s
}
function blankContent() {
  const c = {}
  CONTENT_KEYS.forEach(k => { c[k] = '' })
  return c
}
function pickShared(e) {
  const s = {}
  SHARED_KEYS.forEach(k => {
    if (k === 'leave_date' || k === 'join_date') s[k] = e[k] ? String(e[k]).split('T')[0] : ''
    else if (BOOL_KEYS.includes(k)) s[k] = e[k] || false
    else s[k] = e[k] || (k === 'status' ? 'Active' : '')
  })
  return s
}
function pickContent(item) {
  const c = {}
  CONTENT_KEYS.forEach(k => { if (item[k] != null) c[k] = item[k] })
  return c
}
// Reconstruct the ORDERED list of ecosystem entries for a profile. A specialist
// can have MULTIPLE entries in the SAME ecosystem (e.g. three Tax Planning
// write-ups), so content is an ordered array — each entry carries its own
// ecosystem + short_bio + non-tax D&B_* block:
//   ecosystem_content = [ { ecosystem, short_bio, "D&B_..." }, ... ]
// Back-compat: a legacy OBJECT ({ "<eco>": {content} }) becomes one entry per
// assigned ecosystem; a NULL (oldest rows) becomes the flat columns as the first
// ecosystem's content. The tax questionnaire used to be a single shared set in
// the flat columns — `seedTaxFromFlat` migrates it into the FIRST Tax Planning
// entry that has no tax data yet, so it now displays per-entry.
function seedTaxFromFlat(entries, e) {
  const flatHasTax = TAX_KEYS.some(k => (e[k] || '').toString().trim() !== '')
  if (!flatHasTax) return entries
  const idx = entries.findIndex(en => en.eco === TAX_ECOSYSTEM && TAX_KEYS.every(k => !(en.content[k] || '').toString().trim()))
  if (idx === -1) return entries
  const seeded = { ...entries[idx].content }
  TAX_KEYS.forEach(k => { seeded[k] = e[k] || '' })
  return entries.map((en, i) => i === idx ? { ...en, content: seeded } : en)
}
function entriesFor(e, ecosNames) {
  const stored = e && e.ecosystem_content
  let entries
  if (Array.isArray(stored)) {
    entries = stored
      .filter(item => item && item.ecosystem)
      .map(item => ({ eco: item.ecosystem, content: { ...blankContent(), ...pickContent(item) } }))
  } else {
    const names = uniqueEcos(ecosNames)
    if (stored && typeof stored === 'object') {
      entries = names.map(eco => ({ eco, content: { ...blankContent(), ...(stored[eco] || {}) } }))
    } else {
      const legacy = {}
      NONTAX_CONTENT_KEYS.forEach(k => { legacy[k] = e[k] || '' })
      entries = names.map((eco, i) => ({ eco, content: i === 0 ? { ...blankContent(), ...legacy } : blankContent() }))
    }
  }
  return seedTaxFromFlat(entries, e)
}
// Chip/section label for an entry: bare ecosystem name, or "<eco> #n" when the
// profile has more than one entry in that same ecosystem.
function entryLabel(entries, idx) {
  const eco = entries[idx].eco
  const same = entries.filter(en => en.eco === eco)
  if (same.length <= 1) return eco
  const n = entries.slice(0, idx + 1).filter(en => en.eco === eco).length
  return `${eco} #${n}`
}

export default function SpecialistsPanel({ allExperts, ecoMap, onDataChange, section }) {
  if (section === 'specialist_onboarding') return <SpecialistOnboarding />
  if (section === 'specialist_kpis') return <SpecialistKpiPanel experts={allExperts} ecoMap={ecoMap} />
  if (section === 'specialist_showroom') return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
      <MemberShowroom experts={allExperts} exclusions={[]} ecoMap={ecoMap} showMemberServices showRevenueShare />
    </div>
  )
  const activeTab = section === 'add_specialist' ? 'add' : 'edit'
  const [addStatus, setAddStatus] = useState('')
  const [addStatusType, setAddStatusType] = useState('success')
  const [editStatus, setEditStatus] = useState('')
  const [editStatusType, setEditStatusType] = useState('success')
  const [editingId, setEditingId] = useState(null)
  const [cropState, setCropState] = useState(null) // { which, src } while the zoom/crop editor is open
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectMsg, setConnectMsg] = useState('')

  // Add form state — shared identity + selected ecosystems + per-ecosystem content.
  const [addShared, setAddShared] = useState(blankShared())
  const [addEntries, setAddEntries] = useState([]) // [ { eco, content:{ short_bio, D&B_* } }, ... ] — repeats of an ecosystem allowed
  const [addFile, setAddFile] = useState(null)
  const [addPreview, setAddPreview] = useState(null)

  // Edit form state
  const [editShared, setEditShared] = useState(blankShared())
  const [editEntries, setEditEntries] = useState([])
  const [editFile, setEditFile] = useState(null)
  const [editPreview, setEditPreview] = useState(null)
  const [editSearch, setEditSearch] = useState('')
  const [specFilter, setSpecFilter] = useState({ status: ['Active'] })
  const [specSort, setSpecSort] = useState('default')
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [specialistTab, setSpecialistTab] = useState('profile')
  const [profileDropOpen, setProfileDropOpen] = useState(false)
  const [searchParams] = useSearchParams()

  // Filter the specialist list by status and by ecosystem. Ecosystems are
  // multi-valued per specialist (sourced from ecoMap), so `get` returns the
  // array and matchesFilter does an any-of match.
  const specFilterGroups = [
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: e => e.status || 'Active' },
    { key: 'ecosystem', label: 'Ecosystem', options: ECOSYSTEMS, get: e => ecoMap[e.id] || [] },
  ]

  // Deep-link from the Stage 5 onboarding links: /admin?...&expert=<id> opens
  // that specialist's detail in the Search Specialists view.
  useEffect(() => {
    const eid = searchParams.get('expert')
    if (eid && allExperts) {
      const exp = allExperts.find(x => String(x.id) === String(eid))
      if (exp) { handleEditSelect(exp); setSpecialistTab('edit') }
    }
  }, [searchParams, allExperts])

  function showStatus(which, type, msg) {
    if (which === 'add') { setAddStatusType(type); setAddStatus(msg); setTimeout(() => setAddStatus(''), 4000) }
    if (which === 'edit') { setEditStatusType(type); setEditStatus(msg); setTimeout(() => setEditStatus(''), 4000) }
  }

  function clearAddForm() {
    setAddShared(blankShared())
    setAddEntries([])
    setAddFile(null); setAddPreview(null)
  }

  function handleEditSelect(expert) {
    const ecos = uniqueEcos(ecoMap[expert.id])
    setEditingId(expert.id)
    setEditShared(pickShared(expert))
    setEditEntries(entriesFor(expert, ecos))
    setEditFile(null)
    setEditPreview(expert.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image) : null)
    setSelectedExpert(expert)
    window.scrollTo(0, 0)
  }

  function handleFileChange(which, e) {
    const file = e.target.files[0]
    if (!file) return
    const tooBig = fileSizeError(file)
    if (tooBig) { window.alert(tooBig); e.target.value = ''; return }
    // Open the zoom/crop editor instead of using the raw file — the cropped square
    // JPEG it returns becomes the upload.
    const reader = new FileReader()
    reader.onload = ev => setCropState({ which, src: ev.target.result })
    reader.readAsDataURL(file)
    e.target.value = '' // let the same file be re-picked later
  }

  function applyCrop(dataUrl) {
    const which = cropState?.which || 'add'
    // data URL -> File so the existing base64 upload path is unchanged.
    const bstr = atob(dataUrl.split(',')[1])
    let n = bstr.length
    const u8 = new Uint8Array(n)
    while (n--) u8[n] = bstr.charCodeAt(n)
    const file = new File([u8], 'headshot.jpg', { type: 'image/jpeg' })
    if (which === 'add') { setAddFile(file); setAddPreview(dataUrl) }
    else { setEditFile(file); setEditPreview(dataUrl) }
    setCropState(null)
  }

  const sharedSetter = which => which === 'add' ? setAddShared : setEditShared
  const entriesSetter = which => which === 'add' ? setAddEntries : setEditEntries

  function setEntryField(which, idx, key, value) {
    entriesSetter(which)(prev => prev.map((en, i) => i === idx ? { ...en, content: { ...en.content, [key]: value } } : en))
  }
  // Add an ecosystem entry. Member Services stays mutually exclusive with the
  // five public ecosystems (either a SINGLE Member Services entry, OR any number
  // of public entries — public ecosystems may repeat, e.g. three Tax Planning).
  function addEntry(which, eco) {
    entriesSetter(which)(prev => {
      if (eco === MEMBER_SERVICES && prev.length > 0) return prev
      if (eco !== MEMBER_SERVICES && prev.some(en => en.eco === MEMBER_SERVICES)) return prev
      return [...prev, { eco, content: blankContent() }]
    })
  }
  function removeEntry(which, idx) {
    entriesSetter(which)(prev => prev.filter((_, i) => i !== idx))
  }
  function moveEntry(which, idx, dir) {
    entriesSetter(which)(prev => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp
      return next
    })
  }

  async function submitSpecialist(which) {
    const shared = which === 'add' ? addShared : editShared
    const entries = which === 'add' ? addEntries : editEntries
    const file = which === 'add' ? addFile : editFile
    if (!shared.name) { showStatus(which, 'error', 'Name is required.'); return }
    if (entries.length === 0) { showStatus(which, 'error', 'Add at least one VFO ecosystem.'); return }
    try {
      let headshotFilename = ''
      if (file) {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        headshotFilename = ts + '_' + shared.name.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.jpg'
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        await callApi('upload_headshot', { filename: headshotFilename, file_base64: base64, content_type: file.type })
      }

      // Ordered per-entry content array (entry 0 is primary). Each entry carries
      // its own ecosystem so the same ecosystem can appear more than once.
      const ecosystem_content = entries.map(en => ({ ecosystem: en.eco, ...blankContent(), ...en.content }))
      const primary = { ...blankContent(), ...entries[0].content }
      // Assignments (showroom categories + filtering) get the DISTINCT ecosystems.
      const ecosystems = uniqueEcos(entries.map(en => en.eco))
      // The flat short_bio is read by the showroom card/modal + widget + admin
      // list; hold ALL entries' distinct short bios so a multi-ecosystem
      // specialist shows every specialty, not just the primary one.
      const combinedShortBio = uniqueEcos(entries.map(en => (en.content.short_bio || '').trim()).filter(Boolean)).join(' | ')

      // Shared identity + the PRIMARY entry's content mirrored into the top-level
      // columns (agreements/BoldSign read the flat D&B_*); flat short_bio holds
      // the combined bios. Dates: '' -> null; Active clears the leave date.
      const expertData = { ...shared, ...primary, ecosystem_content }
      expertData.short_bio = combinedShortBio
      // Tax is now per-entry; mirror the FIRST Tax Planning entry's questionnaire
      // into the flat columns (the SIF go-live path + any legacy reader use them).
      const firstTax = entries.find(en => en.eco === TAX_ECOSYSTEM)
      TAX_KEYS.forEach(k => { expertData[k] = firstTax ? (firstTax.content[k] || '') : '' })
      expertData.leave_date = (expertData.status === 'Active' || !expertData.leave_date) ? null : expertData.leave_date
      expertData.join_date = expertData.join_date || null
      if (headshotFilename) expertData.headshot_image = headshotFilename
      if (which === 'add') {
        const maxId = allExperts.reduce((m, e) => e.id > m ? e.id : m, 0)
        expertData.id = maxId + 1
      }
      await callApi('save_specialist', { expert: expertData, ecosystems, editing_id: which === 'edit' ? editingId : null })
      await onDataChange()
      showStatus(which, 'success', which === 'add' ? 'Specialist added!' : 'Changes saved!')
      if (which === 'add') clearAddForm()
    } catch (err) {
      showStatus(which, 'error', err.message)
    }
  }

  async function handleSpecialistConnect() {
    if (!editingId) return
    setConnectBusy(true); setConnectMsg('')
    try {
      const res = await callApi('specialist_stripe_connect_request', { expert_id: editingId })
      if (res?.error) { setConnectMsg(res.error); return }
      setConnectMsg(`Setup email sent to ${res.to_email}${res.sandbox ? ' (sandbox)' : ''}. Connect account: ${res.stripe_account_id}`)
      await onDataChange()
    } catch (e) {
      setConnectMsg(e?.message || 'Failed to start Connect setup')
    } finally {
      setConnectBusy(false)
    }
  }

  async function deleteSpecialist() {
    if (!editingId) return
    if (!window.confirm(`Delete ${selectedExpert?.name || 'this specialist'} permanently? This cannot be undone.`)) return
    const deletedName = selectedExpert?.name || 'Specialist'
    try {
      await callApi('delete_specialist', { expert_id: editingId })
      await onDataChange()
      // Close the detail view and return to the list, then surface the result
      // there (the Settings tab unmounts, so the message must show on the list).
      setSelectedExpert(null)
      setEditingId(null)
      setSpecialistTab('profile')
      showStatus('edit', 'success', `${deletedName} deleted.`)
    } catch (err) {
      showStatus('edit', 'error', err.message)
    }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const fieldStyle = { marginBottom: '16px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  function SpecialistForm({ which, statusMsg, statusType: sType }) {
    const shared = which === 'add' ? addShared : editShared
    const setShared = sharedSetter(which)
    const entries = which === 'add' ? addEntries : editEntries
    const preview = which === 'add' ? addPreview : editPreview
    const multi = entries.length > 1
    const hasMS = entries.some(en => en.eco === MEMBER_SERVICES)
    // Member Services is a single exclusive entry; the public five may repeat.
    const availableEcos = ECOSYSTEMS.filter(eco => eco === MEMBER_SERVICES ? entries.length === 0 : !hasMS)
    const sectionHeader = { fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '18px', borderBottom: '1px solid var(--vfo-border)', paddingBottom: '12px' }

    const dbTextField = (idx, c, key, label, rows) => (
      <div style={fieldStyle}>
        <label style={labelStyle}>{label}</label>
        {rows === 1
          ? <input value={c[key]} onChange={e => setEntryField(which, idx, key, e.target.value)} style={inputStyle} />
          : <textarea value={c[key]} onChange={e => setEntryField(which, idx, key, e.target.value)} rows={rows} style={{ ...inputStyle, resize: 'vertical' }} />}
      </div>
    )

    // The Short Bio + Details & Benefits write-up for ONE entry. The Tax block
    // (shared data) only renders under the Tax Planning ecosystem.
    const entryBody = (idx, en) => {
      const c = en.content || blankContent()
      return (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Short Bio</label>
            <input value={c.short_bio} onChange={e => setEntryField(which, idx, 'short_bio', e.target.value)} placeholder="One-line specialty description" style={inputStyle} />
          </div>

          <div style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: '600', marginBottom: '20px', borderBottom: '1px solid var(--vfo-border)', paddingBottom: '12px' }}>Details & Benefits</div>
            {dbTextField(idx, c, 'D&B_strategy_expertise', 'Strategy / Expertise', 3)}
            {dbTextField(idx, c, 'D&B_cutoff_date', 'Cut-off Date for Strategy', 1)}
            {dbTextField(idx, c, 'D&B_client_requirements', 'Client Requirements', 3)}
            {dbTextField(idx, c, 'D&B_investment_cost', 'Amount of Investment or Cost', 3)}
            {dbTextField(idx, c, 'D&B_ideal_client', 'Ideal Client Description', 3)}
            {dbTextField(idx, c, 'D&B_summary_benefits', 'Summary of Benefits', 3)}
            {dbTextField(idx, c, 'D&B_getting_started', 'Getting Started with a Client', 3)}
            {dbTextField(idx, c, 'D&B_professional_process', 'Steps of Professional Process', 3)}
            {dbTextField(idx, c, 'D&B_competitive_advantage', 'What Makes You Better Than the Competition', 3)}
            {dbTextField(idx, c, 'D&B_revenue_share', 'Revenue Share', 4)}
            <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontWeight: '600', marginBottom: '12px' }}>Acknowledgement, Agreement and Release</div>
              <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: '1.6', margin: 0 }}>Member acknowledges that ERT, and their related companies and legal partnerships maintain a relationship with Specialist in various fields of service and specialities, including, without limitation, in the financial, tax, accounting, and legal service industries. Member further acknowledges that (i) each of the Specialist is separate and independent from, and unrelated to, ERT, and their related companies and legal partnerships, and separate and independent from, and unrelated to, the associates, shareholders, managers, members, officers, directors, employees, contractors, agents, controlling persons, related parties, assigns and partners of ERT and/or of their related companies and legal partnerships; and (ii) that the services provided by the Specialists are not provided by ERT, and/or by their related companies or legal partnerships, and/or by the ERT Related Parties. Member acknowledges and agrees that it is their sole and absolute responsibility to seek his, her and/or their own independent legal, tax, compliance, accounting and financial advice, as applicable to such parties, from competent service providers and advisors of their own independent choosing, including, without limitation, to determine whether an Specialist is someone who is or will provide adequate and appropriate advice for and to the Advisor, Accountant and/or Client given the unique facts and circumstances and the particular risk profile of the service recipients.</p>
            </div>
          </div>

          {en.eco === TAX_ECOSYSTEM && (
            <div style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: '600', marginBottom: '20px', borderBottom: '1px solid var(--vfo-border)', paddingBottom: '12px' }}>Tax Planning Audit Risk Questionnaire</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Tax Risk Notes</label>
                <textarea value={c['D&B_tax_risk_notes']} onChange={e => setEntryField(which, idx, 'D&B_tax_risk_notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {[
                ['D&B_audit_risk_general', '1. What are the general risks of this strategy?'],
                ['D&B_audit_risk_history', '2. What has been the history of these risks coming to fruition?'],
                ['D&B_audit_risk_worst_case', '3. What are potential worst-case scenarios?'],
                ['D&B_audit_risk_precautions', '4. What precautions are in place to prevent or minimize the risks?'],
              ].map(([key, label], i, arr) => (
                <div key={key} style={i === arr.length - 1 ? { marginBottom: 0 } : fieldStyle}>
                  <label style={labelStyle}>{label}</label>
                  <textarea value={c[key]} onChange={e => setEntryField(which, idx, key, e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              ))}
            </div>
          )}
        </>
      )
    }

    return (
      <div>
        {/* ---- Shared identity (same across every ecosystem) ---- */}
        <div style={sectionStyle}>
        <div style={sectionHeader}>Profile &amp; Identity</div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Headshot</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              onClick={() => { if (preview) setCropState({ which, src: preview }) }}
              title={preview ? 'Click to adjust / zoom' : ''}
              style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: preview ? 'pointer' : 'default', flexShrink: 0 }}>
              {preview ? <img src={preview} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { if (which === 'edit') { const exp = allExperts.find(x => x.id === editingId); if (exp) e.target.src = HEADSHOT_BASE + exp.headshot_image } }} /> : <span style={{ color: 'var(--vfo-muted)', fontSize: '24px' }}>?</span>}
            </div>
            <div>
              <label style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-tint)', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer' }}>
                Choose Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(which, e)} />
              </label>
              {preview && (
                <button type="button" onClick={() => setCropState({ which, src: preview })}
                  style={{ marginLeft: '8px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #125ecc', background: 'var(--vfo-card)', color: '#125ecc', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  Adjust / Zoom
                </button>
              )}
              <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '6px' }}>JPG or PNG, recommended 400×400px. Click the photo to adjust &amp; zoom.</p>
            </div>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Background Check</label>
          <select value={shared.background_check} onChange={e => setShared(p => ({ ...p, background_check: e.target.value }))} style={{ ...inputStyle, background: 'var(--vfo-card)', width: '200px' }}>
            <option value="">-- None --</option>
            <option value="Lite">Lite</option>
            <option value="Core">Core</option>
            <option value="Max">Max</option>
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>VFO Ecosystems <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vfo-faint)' }}>— add one per strategy; you can add the same ecosystem more than once</span></label>
          <select value="" onChange={e => { if (e.target.value) addEntry(which, e.target.value) }} disabled={availableEcos.length === 0}
            style={{ ...inputStyle, background: 'var(--vfo-card)', width: '320px', maxWidth: '100%', opacity: availableEcos.length === 0 ? 0.5 : 1 }}>
            <option value="">{availableEcos.length === 0 ? '-- No more ecosystems to add --' : '-- Select ecosystem to add --'}</option>
            {availableEcos.map(eco => <option key={eco} value={eco}>{eco}</option>)}
          </select>
          {entries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {entries.map((en, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', border: '1px solid rgba(0,149,255,0.25)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontSize: '12px', fontWeight: 600 }}>
                  {entryLabel(entries, i)}
                  <span onClick={() => removeEntry(which, i)} title="Remove" style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.7 }}>×</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>VFO Accredited Professional Specialist</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div onClick={() => setShared(p => ({ ...p, vfo_accredited: !p.vfo_accredited }))}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: shared.vfo_accredited ? '#002973' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '2px', left: shared.vfo_accredited ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{shared.vfo_accredited ? 'Yes' : 'No'}</span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '6px', lineHeight: 1.5 }}>Hidden from every Showroom — member, client, specialist, admin preview, and the public website widget. Still appears in Specialist Search and stays selectable in Holistic (Regular &amp; Tax) and Tax Planning specialist pickers.</div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input value={shared.name} onChange={e => setShared(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={labelStyle}>Work email (emails sent here)</label>
            <input value={shared.email || ''} onChange={e => setShared(p => ({ ...p, email: e.target.value }))} placeholder="specialist@example.com" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={labelStyle}>Personal email (not emailed)</label>
            <input value={shared.personal_email || ''} onChange={e => setShared(p => ({ ...p, personal_email: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select value={shared.status || 'Active'} onChange={e => setShared(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
              {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {(shared.status === 'Lost' || shared.status === 'Removed') && (
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Leave Date</label>
              <input type="date" value={shared.leave_date || ''} onChange={e => setShared(p => ({ ...p, leave_date: e.target.value }))} style={inputStyle} />
            </div>
          )}
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Join Date</label>
          <input type="date" value={shared.join_date || ''} onChange={e => setShared(p => ({ ...p, join_date: e.target.value }))} style={{ ...inputStyle, width: '200px' }} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Revenue Decision</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Revenue Share', 'Money Mapping'].map(v => (
              <button key={v} type="button" onClick={() => setShared(p => ({ ...p, revenue_decision: v }))}
                style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${shared.revenue_decision === v ? '#125ecc' : 'var(--vfo-border-mid)'}`, background: shared.revenue_decision === v ? 'rgba(18,94,204,0.12)' : '#fff', color: shared.revenue_decision === v ? '#125ecc' : 'var(--vfo-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Top of the T</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div onClick={() => setShared(p => ({ ...p, top_of_t: !p.top_of_t }))}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: shared.top_of_t ? '#125ecc' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '2px', left: shared.top_of_t ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{shared.top_of_t ? 'Yes' : 'No'}</span>
          </div>
        </div>
        {which === 'edit' && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Stripe Connect (payouts)</label>
            {selectedExpert?.stripe_account_id
              ? <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '8px' }}>Connected · <span style={{ fontFamily: 'monospace', color: 'var(--vfo-muted)' }}>{selectedExpert.stripe_account_id}</span></div>
              : <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>No payout account yet.</div>}
            <button type="button" onClick={handleSpecialistConnect} disabled={connectBusy}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #125ecc', background: 'var(--vfo-card)', color: '#125ecc', fontSize: '13px', fontWeight: 600, cursor: connectBusy ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {connectBusy ? 'Working…' : (selectedExpert?.stripe_account_id ? 'Resend Setup Link' : 'Set Up Payment Details')}
            </button>
            {connectMsg && <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '8px' }}>{connectMsg}</p>}
          </div>
        )}
        <div style={{ ...fieldStyle, marginBottom: 0 }}>
          <label style={labelStyle}>Long Bio</label>
          <textarea value={shared.long_bio} onChange={e => setShared(p => ({ ...p, long_bio: e.target.value }))} placeholder="Detailed biography..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        </div>{/* end Profile & Identity card */}

        {/* ---- Per-ecosystem content (short bio, D&B, tax) — one write-up per ecosystem ---- */}
        <div style={sectionStyle}>
        <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span>Bio &amp; Details</span>
          {multi && <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--vfo-muted)', textTransform: 'none', letterSpacing: 0 }}>One write-up per entry — fill each below</span>}
        </div>

        {entries.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>Add a VFO ecosystem above to enter this person's bio &amp; details.</div>
        )}

        {entries.map((en, idx) => (
          <div key={idx} style={{ border: '1px solid var(--vfo-border-strong)', borderRadius: '14px', padding: '20px', marginBottom: '18px', background: 'var(--vfo-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ display: 'inline-block', fontSize: '13px', fontWeight: 700, color: '#0095ff', background: 'rgba(0,149,255,0.12)', border: '1px solid rgba(0,149,255,0.25)', borderRadius: '999px', padding: '4px 14px' }}>{entryLabel(entries, idx)}</span>
                {idx === 0 && <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>primary — mirrored to the showroom card</span>}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => moveEntry(which, idx, -1)} disabled={idx === 0} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-muted)', fontSize: '13px', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                <button type="button" onClick={() => moveEntry(which, idx, 1)} disabled={idx === entries.length - 1} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-muted)', fontSize: '13px', cursor: idx === entries.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === entries.length - 1 ? 0.4 : 1 }}>↓</button>
                <button type="button" onClick={() => removeEntry(which, idx)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontSize: '13px', cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
            {entryBody(idx, en)}
          </div>
        ))}

        </div>{/* end Bio & Details card */}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}
      {/* Section title */}
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '24px' }}>
        {activeTab === 'add' ? 'Add Specialist' : 'Search Specialists'}
      </div>

      {/* Add tab */}
      {activeTab === 'add' && (
        <div>
          {SpecialistForm({ which: 'add', statusMsg: addStatus, statusType: addStatusType })}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => submitSpecialist('add')}
              style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
              Add Specialist
            </button>
            <button onClick={clearAddForm}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>
              Clear Form
            </button>
            {addStatus && <span style={{ alignSelf: 'center', color: addStatusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', fontWeight: 600 }}>{addStatus}</span>}
          </div>
        </div>
      )}

      {/* Search/Edit tab */}
      {activeTab === 'edit' && !selectedExpert && (
        <>
          {editStatus && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: editStatusType === 'success' ? 'rgba(27,146,84,0.1)' : 'rgba(231,76,60,0.1)', color: editStatusType === 'success' ? '#1b9254' : '#e74c3c', border: `1px solid ${editStatusType === 'success' ? 'rgba(27,146,84,0.3)' : 'rgba(231,76,60,0.3)'}` }}>{editStatus}</div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name..." style={inputStyle} onChange={e => setEditSearch(e.target.value.toLowerCase())} value={editSearch} />
            <ListFilterButton groups={specFilterGroups} value={specFilter} onChange={setSpecFilter} />
            <SortSelect value={specSort} onChange={setSpecSort} />
          </div>
          <div>
            {sortByJoin((editSearch ? allExperts.filter(e => e.name.toLowerCase().includes(editSearch)) : allExperts).filter(e => matchesFilter(e, specFilterGroups, specFilter)), specSort).map(expert => (
              <div key={expert.id}
                onClick={() => handleEditSelect(expert)}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 14px', marginBottom: '4px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-border)', flexShrink: 0 }}>
                  {expert.headshot_image && <img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{expert.name}</span>
                    {expert.vfo_accredited && (
                      <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,41,115,0.10)', color: '#002973', border: '1px solid rgba(0,41,115,0.28)', whiteSpace: 'nowrap', flexShrink: 0 }}>VFO Accredited Professional Specialist</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(ecoMap[expert.id] || []).length > 1 ? (ecoMap[expert.id] || []).join(' · ') : (expert.short_bio || '—')}</div>
                </div>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)', flexShrink: 0 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[expert.status] || '#1b9254', flexShrink: 0 }} />{expert.status || 'Active'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'edit' && selectedExpert && (
        <div>
          <button onClick={() => { setSelectedExpert(null); setEditingId(null); setSpecialistTab('profile') }} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--vfo-border)', position: 'relative', zIndex: 50 }}>
            <div style={{ position: 'relative' }} onMouseEnter={() => setProfileDropOpen(true)} onMouseLeave={() => setProfileDropOpen(false)}>
              <button style={{ padding: '8px 16px', border: 'none', background: 'none', borderBottom: '2px solid #125ecc', color: '#125ecc', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Profile<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
              </button>
              {profileDropOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '150px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
                  {[['profile','Profile'],['edit','Edit Profile'],['vault','Vault'],['payments','Payments'],['settings','Settings']].map(([k, l]) => (
                    <button key={k} onClick={() => { setSpecialistTab(k); setProfileDropOpen(false) }} style={{ display: 'block', width: '100%', padding: '8px 16px', background: specialistTab === k ? 'var(--vfo-tint)' : 'transparent', border: 'none', color: specialistTab === k ? '#125ecc' : 'var(--vfo-ink)', fontWeight: specialistTab === k ? 600 : 400, fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'} onMouseLeave={e => e.currentTarget.style.background = specialistTab === k ? 'var(--vfo-tint)' : 'transparent'}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {specialistTab === 'profile' && (
            <SpecialistProfileView expert={selectedExpert} ecos={ecoMap[selectedExpert.id] || []} connectBusy={connectBusy} connectMsg={connectMsg} onConnect={handleSpecialistConnect} />
          )}

          {specialistTab === 'payments' && (
            <SpecialistPaymentsTab expertId={selectedExpert.id} />
          )}

          {specialistTab === 'edit' && (
            <div>
              {SpecialistForm({ which: 'edit', statusMsg: editStatus, statusType: editStatusType })}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => submitSpecialist('edit')}
                  style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                  Save Changes
                </button>
                <button onClick={() => { setSelectedExpert(null); setEditingId(null); setSpecialistTab('profile') }}
                  style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>
                  Cancel
                </button>
                {editStatus && <span style={{ alignSelf: 'center', color: editStatusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', fontWeight: 600 }}>{editStatus}</span>}
              </div>
            </div>
          )}

          {specialistTab === 'settings' && (
            <>
              <div style={sectionStyle}>
                <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Specialist Login</div>
                <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{selectedExpert.email ? <>Send a setup email to <strong>{selectedExpert.email}</strong> so they can set their own portal passcode.</> : <>Add an email in Edit Profile first, then send the setup email.</>}</p>
                <SendSetupEmailButton loginType="specialist" subjectId={selectedExpert.id} hint="Drafts a Gmail with a secure link. The specialist sets their own passcode." />
              </div>
              <div style={{ ...sectionStyle, border: '1px solid rgba(231,76,60,0.3)' }}>
                <div style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Danger Zone</div>
                <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>Permanently delete this specialist. This cannot be undone.</p>
                <button onClick={deleteSpecialist} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontWeight: 500, fontSize: '14px', cursor: 'pointer' }}>Delete Specialist</button>
              </div>
            </>
          )}

          {specialistTab === 'vault' && (
            <div style={sectionStyle}>
              <SpecialistAdminVault expertId={selectedExpert.id} recipientName={selectedExpert.name} recipientFirst={(selectedExpert.name || '').trim().split(/\s+/)[0]} />
            </div>
          )}
        </div>
      )}


    </div>
  )
}

// Read-only presentation of a specialist profile. Shared identity (header,
// account & payout, biography, tax) shows once; when the person serves more than
// one ecosystem, a toggle switches the short bio + Details & Benefits between
// each ecosystem's write-up.
function SpecialistProfileView({ expert, ecos: ecosProp, connectBusy = false, connectMsg = '', onConnect = () => {} }) {
  const entries = entriesFor(expert, uniqueEcos(ecosProp))
  const [active, setActive] = useState(0)
  const activeIdx = Math.min(active, Math.max(0, entries.length - 1))
  const en = entries[activeIdx] || { eco: '', content: blankContent() }
  const activeEco = en.eco || ''
  const c = en.content || blankContent()
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const dbHeading = { fontSize: '14px', fontWeight: 800, letterSpacing: '0.4px', color: 'var(--vfo-heading)', textTransform: 'uppercase' }
  const chip = { fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }
  const activeChip = { ...chip, background: 'rgba(18,94,204,0.12)', color: '#125ecc', border: '1px solid rgba(18,94,204,0.25)', cursor: 'pointer' }
  const idleChip = { ...chip, background: 'transparent', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-mid)', cursor: 'pointer' }
  // Accredited specialists carry a badge in the profile header only.
  const accredited = !!expert.vfo_accredited
  const accBadge = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, padding: '4px 12px', borderRadius: '999px', background: 'rgba(0,41,115,0.10)', color: '#002973', border: '1px solid rgba(0,41,115,0.30)' }
  const longField = (label, value) => value ? (
    <div style={{ marginBottom: '18px' }}>
      <div style={dbHeading}>{label}</div>
      <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6, marginTop: '7px', whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  ) : null

  const dbFields = [
    ['Strategy / Expertise', c['D&B_strategy_expertise']],
    ['Cut-off Date for Strategy', c['D&B_cutoff_date']],
    ['Client Requirements', c['D&B_client_requirements']],
    ['Amount of Investment or Cost', c['D&B_investment_cost']],
    ['Ideal Client Description', c['D&B_ideal_client']],
    ['Summary of Benefits', c['D&B_summary_benefits']],
    ['Getting Started with a Client', c['D&B_getting_started']],
    ['Steps of Professional Process', c['D&B_professional_process']],
    ['What Makes Them Better Than the Competition', c['D&B_competitive_advantage']],
  ]
  const hasDb = dbFields.some(([, v]) => v)
  // The profile shows only the Audit Risk Questionnaire (mindset removed; notes
  // are edit-only), so gate the section on the 4 audit answers of the active entry.
  const hasAudit = ['D&B_audit_risk_general', 'D&B_audit_risk_history', 'D&B_audit_risk_worst_case', 'D&B_audit_risk_precautions'].some(k => (c[k] || '').toString().trim() !== '')
  const multi = entries.length > 1
  const suffix = multi ? ` — ${entryLabel(entries, activeIdx)}` : ''
  const alwaysField = (label, value) => (
    <div style={{ marginBottom: '18px' }}>
      <div style={dbHeading}>{label}</div>
      <div style={{ fontSize: '13.5px', color: value ? 'var(--vfo-ink)' : 'var(--vfo-faint)', lineHeight: 1.6, marginTop: '7px', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  )
  const alwaysFieldSmall = (label, value) => (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px', color: 'var(--vfo-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13.5px', color: value ? 'var(--vfo-ink)' : 'var(--vfo-faint)', lineHeight: 1.6, marginTop: '6px', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  )

  return (
    <div>
      {/* Profile header */}
      <div style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {expert.headshot_image
              ? <img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = HEADSHOT_BASE + expert.headshot_image }} />
              : <span style={{ color: 'var(--vfo-faint)', fontSize: '24px', fontWeight: 700 }}>{(expert.name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span>}
          </div>
          <div style={{ minWidth: '200px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1.15 }}>{expert.name}</span>
              {accredited && <span style={accBadge}>VFO Accredited Professional Specialist</span>}
            </div>
            {c.short_bio && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>{c.short_bio}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--vfo-muted)' }}>
              {expert.top_of_t && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e06717', flexShrink: 0 }} />Top of the T</span>}
              {expert.top_of_t && expert.background_check && <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>}
              {expert.background_check && <span>Background check: {expert.background_check}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Short facts row — beside each other so long text sections below can
          run full width (a long bio used to strand a short sidebar and leave
          half the page empty). */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: '280px', display: 'flex' }}>
          <div style={{ ...sectionStyle, flex: 1 }}>
            <div style={cardTitle}>Account &amp; Payout</div>
            {[
              ['Work email', expert.email || '—'],
              ['Personal email', expert.personal_email || '—'],
              ['Status', expert.status || 'Active'],
              ...(expert.leave_date ? [['Leave date', formatDate(expert.leave_date)]] : []),
              ['Join date', expert.join_date ? formatDate(expert.join_date) : '—'],
              ['Revenue decision', expert.revenue_decision || '—'],
              ['Stripe Connect', expert.stripe_account_id ? 'Connected' : 'Not set up'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '7px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                <span style={fieldLabel}>{label}</span>
                <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
              </div>
            ))}
            {expert.stripe_account_id && <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', fontFamily: 'monospace', marginTop: '8px', wordBreak: 'break-all' }}>{expert.stripe_account_id}</div>}
            {!expert.stripe_account_id && (
              <div style={{ marginTop: '16px' }}>
                <button type="button" onClick={onConnect} disabled={connectBusy}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #125ecc', background: 'var(--vfo-card)', color: '#125ecc', fontSize: '13px', fontWeight: 600, cursor: connectBusy ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {connectBusy ? 'Working…' : 'Send Stripe Connect setup email'}
                </button>
                {connectMsg && <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '8px' }}>{connectMsg}</p>}
              </div>
            )}
          </div>
        </div>
        {entries.length > 0 && (
          <div style={{ flex: '1 1 320px', minWidth: '280px' }}>
            <div style={sectionStyle}>
              <div style={cardTitle}>VFO Ecosystem</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {entries.map((e, i) => multi
                  ? <span key={i} onClick={() => setActive(i)} style={i === activeIdx ? activeChip : idleChip}>{entryLabel(entries, i)}</span>
                  : <span key={i} style={chip}>{entryLabel(entries, i)}</span>)}
              </div>
              {multi && <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '10px' }}>Click an entry to see its bio &amp; details.</div>}
            </div>
          </div>
        )}
      </div>

      {/* Long-form content — full width. */}
      {expert.long_bio && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Biography</div>
          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{expert.long_bio}</div>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={cardTitle}>Details &amp; Benefits{suffix}</div>
        {hasDb
          ? dbFields.map(([label, value]) => <Fragment key={label}>{longField(label, value)}</Fragment>)
          : <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>No details entered yet — use Edit Specialist to add them.</div>}
      </div>

      {/* Tax Planning Audit Risk Questionnaire — per-entry; only under a Tax
          Planning entry, and only when at least one answer is filled. */}
      {activeEco === TAX_ECOSYSTEM && hasAudit && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Tax Planning Audit Risk Questionnaire{suffix}</div>
          {alwaysField('1. General risks of this strategy', c['D&B_audit_risk_general'])}
          {alwaysField('2. History of these risks coming to fruition', c['D&B_audit_risk_history'])}
          {alwaysField('3. Potential worst-case scenarios', c['D&B_audit_risk_worst_case'])}
          {alwaysField('4. Precautions to prevent or minimize the risks', c['D&B_audit_risk_precautions'])}
        </div>
      )}

      {c['D&B_revenue_share'] && (
        <div style={sectionStyle}>
          <div style={cardTitle}>Revenue Share{suffix}</div>
          <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c['D&B_revenue_share']}</div>
        </div>
      )}
    </div>
  )
}
