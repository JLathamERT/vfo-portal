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
import ListTable, { ListName, ListPill, ListText, listSearchStyle, LIST_PAGE_MAX_WIDTH } from '../shared/ListTable'
import ImageCropModal from './ImageCropModal'
import { formatDate } from '../../lib/dates'
import ExportButton from '../shared/ExportButton'
import { splitName, exportDate } from '../../lib/exportXlsx'
import { formatPersonName } from '../../lib/formatters'
import { HEADSHOTS_URL } from '../../lib/environment'

// `default: false` columns start unticked in the Export window.
const specialistExportColumns = (ecoMap) => [
  { header: 'First Name', value: e => splitName(e.name)[0] },
  { header: 'Last Name', value: e => splitName(e.name)[1] },
  { header: 'Status', value: e => e.status || 'Active' },
  { header: 'Email', value: e => e.email || '' },
  { header: 'Full Name', value: e => e.name || '', default: false },
  { header: 'Ecosystems', value: e => (ecoMap[e.id] || []).join(', '), default: false },
  { header: 'Background Check', value: e => e.background_check || '', default: false },
  { header: 'VFO Accredited', value: e => e.vfo_accredited ? 'Yes' : '', default: false },
  { header: 'Personal Email', value: e => e.personal_email || '', default: false },
  { header: 'Join Date', value: e => exportDate(e.join_date), default: false },
  { header: 'Leave Date', value: e => exportDate(e.leave_date), default: false },
]

const ECOSYSTEMS = ['Tax Planning', 'Business Advisory', 'Legal Services', 'Risk Mitigation', 'Wealth Management', 'Member Services']
// "Member Services" is internal-only and mutually exclusive with the five public
// ecosystems: a specialist is either Member Services OR (some of) the public five.
const MEMBER_SERVICES = 'Member Services'
// The Tax section (shared, one set per person) only surfaces under this ecosystem.
const TAX_ECOSYSTEM = 'Tax Planning'
import { STATUS_COLORS } from '../shared/statusColors'
import { HeroAvatar, ListHeader } from '../shared/TrackKit'
import StripeAccountField from '../shared/StripeAccountField'
import { BackLink, cardBox, ChoiceButtons, DotText, Field, FieldGrid, FormGrid, formInput, formLabel, PageHeading, ProfileCard, ProfileHero, SaveBar, SettingRow, subLabel, Switch } from '../shared/ProfileKit'
import { BTN_SMALL, btnDanger, btnOutline, btnPrimary, btnSecondary, btnState } from '../shared/buttonStyles'
const HEADSHOT_SUPABASE = HEADSHOTS_URL
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

// first_name / last_name are FORM-ONLY (2026-11-26): experts stores one `name`,
// so the save joins them and never sends these two keys.
function blankShared() {
  const s = { first_name: '', last_name: '' }
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
  const [first, last] = splitName(e.name)
  s.first_name = first
  s.last_name = last
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

export default function SpecialistsPanel({ allExperts, ecoMap, onDataChange, section, onBackToOrigin }) {
  if (section === 'specialist_onboarding') return <SpecialistOnboarding />
  if (section === 'specialist_kpis') return <SpecialistKpiPanel experts={allExperts} ecoMap={ecoMap} />
  if (section === 'specialist_showroom') return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
      <MemberShowroom experts={allExperts} exclusions={[]} ecoMap={ecoMap} showMemberServices showRevenueShare showVault showAccredited />
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
  // The open specialist follows a refreshed list, so the profile shows what was saved.
  useEffect(() => {
    if (!selectedExpert) return
    const fresh = allExperts.find(e => e.id === selectedExpert.id)
    if (fresh && fresh !== selectedExpert) setSelectedExpert(fresh)
  }, [allExperts])
  const [searchParams] = useSearchParams()
  const [profileOrigin, setProfileOrigin] = useState(null)

  // Filter the specialist list by status and by ecosystem. Ecosystems are
  // multi-valued per specialist (sourced from ecoMap), so `get` returns the
  // array and matchesFilter does an any-of match.
  const specFilterGroups = [
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: e => e.status || 'Active' },
    { key: 'ecosystem', label: 'Ecosystem', options: ECOSYSTEMS, get: e => ecoMap[e.id] || [] },
  ]
  // The search list as searched + sorted; the rows add the filters, the Export
  // window takes the filters itself (pre-set to these).
  const searchedExperts = sortByJoin(editSearch ? (allExperts || []).filter(e => e.name.toLowerCase().includes(editSearch)) : (allExperts || []), specSort)
  const visibleExperts = searchedExperts.filter(e => matchesFilter(e, specFilterGroups, specFilter))

  // Deep-link: /admin?...&expert=<id> opens that specialist's detail in the Search
  // Specialists view — on Edit for the Stage 5 onboarding links, on the read-only
  // Profile when the link says view=profile (SpecialistNameLink, Accounting).
  // Consumed ONCE per link (keyed on its _n stamp): AdminPortal strips the URL with
  // replaceState, but react-router's searchParams keeps the old value, so without this
  // every later visit to this tab would re-open the same specialist.
  useEffect(() => {
    const eid = searchParams.get('expert')
    if (eid && allExperts) {
      const exp = allExperts.find(x => String(x.id) === String(eid))
      const stamp = `${eid}:${searchParams.get('_n') || ''}`
      let consumed = false
      try { consumed = sessionStorage.getItem('specialistDeepLinkConsumed') === stamp } catch { /* private mode */ }
      if (exp && !consumed) {
        try { sessionStorage.setItem('specialistDeepLinkConsumed', stamp) } catch { /* private mode */ }
        handleEditSelect(exp)
        setSpecialistTab(searchParams.get('view') === 'profile' ? 'profile' : 'edit')
        setProfileOrigin(searchParams.get('origin') || null)
      }
    }
  }, [searchParams, allExperts])

  // "Back to list" returns to the tab the deep link came from (AdminPortal decides
  // which tabs it honours); a specialist picked from this list has no origin.
  function backToList() {
    setSelectedExpert(null); setEditingId(null); setSpecialistTab('profile')
    const origin = profileOrigin
    setProfileOrigin(null)
    if (origin && onBackToOrigin) onBackToOrigin(origin)
  }

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
    const name = [shared.first_name, shared.last_name].map(v => formatPersonName(v || '')).filter(Boolean).join(' ')
    if (!formatPersonName(shared.first_name || '') || !formatPersonName(shared.last_name || '')) { showStatus(which, 'error', 'First and last name are required.'); return }
    if (entries.length === 0) { showStatus(which, 'error', 'Add at least one VFO ecosystem.'); return }
    try {
      let headshotFilename = ''
      if (file) {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        headshotFilename = ts + '_' + name.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.jpg'
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
      const { first_name: _first, last_name: _last, ...sharedCols } = shared
      const expertData = { ...sharedCols, name, ...primary, ecosystem_content }
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
      // Saved: straight back to the profile itself, showing what was saved
      // (2026-11-27); the refreshed list then swaps in the stored row.
      if (which === 'edit') {
        setSelectedExpert(e => (e ? { ...e, ...expertData } : e))
        setSpecialistTab('profile'); window.scrollTo(0, 0)
      }
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

  const inputStyle = formInput
  const labelStyle = formLabel
  const fieldStyle = { marginBottom: '16px' }
  const sectionStyle = { ...cardBox, marginBottom: '20px' }

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
        {/* ---- The edit boxes mirror the profile (2026-11-26): header, Specialist
            Details, Revenue Details, Biography, then VFO Ecosystem. ---- */}
        <ProfileCard icon="camera" title={'Photo, Name & Status'}>
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
              <label style={{ ...btnPrimary, display: 'inline-block' }}>
                Choose Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(which, e)} />
              </label>
              {preview && (
                <button type="button" onClick={() => setCropState({ which, src: preview })}
                  style={{ ...btnSecondary, marginLeft: '8px' }}>
                  Adjust / Zoom
                </button>
              )}
              <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '6px' }}>JPG or PNG, recommended 400×400px. Click the photo to adjust &amp; zoom.</p>
            </div>
          </div>
        </div>
        <FormGrid min={220} style={{ marginBottom: '16px' }}>
          <div><label style={labelStyle}>First Name *</label><input value={shared.first_name || ''} onChange={e => setShared(p => ({ ...p, first_name: e.target.value }))} onBlur={e => setShared(p => ({ ...p, first_name: formatPersonName(e.target.value) }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Last Name *</label><input value={shared.last_name || ''} onChange={e => setShared(p => ({ ...p, last_name: e.target.value }))} onBlur={e => setShared(p => ({ ...p, last_name: formatPersonName(e.target.value) }))} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={shared.status || 'Active'} onChange={e => setShared(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
              {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Background Check</label>
            <select value={shared.background_check} onChange={e => setShared(p => ({ ...p, background_check: e.target.value }))} style={inputStyle}>
              <option value="">-- None --</option>
              <option value="Lite">Lite</option>
              <option value="Core">Core</option>
              <option value="Max">Max</option>
            </select>
          </div>
        </FormGrid>
        <div style={{ display: 'grid', gap: '10px' }}>
          <SettingRow title="Top of the T">
            <Switch on={!!shared.top_of_t} label="Top of the T" onClick={() => setShared(p => ({ ...p, top_of_t: !p.top_of_t }))} />
          </SettingRow>
          <SettingRow title="VFO Accredited Professional Specialist" hint="Hidden from every Showroom — member, client, specialist, admin preview, and the public website widget. Still appears in Specialist Search and stays selectable in Holistic (Regular & Tax) and Tax Planning specialist pickers.">
            <Switch on={!!shared.vfo_accredited} color="#002973" label="VFO Accredited Professional Specialist" onClick={() => setShared(p => ({ ...p, vfo_accredited: !p.vfo_accredited }))} />
          </SettingRow>
        </div>
        </ProfileCard>

        <ProfileCard icon="id" title="Specialist Details">
        <FormGrid min={260}>
          <div><label style={labelStyle}>Work email (emails sent here)</label><input value={shared.email || ''} onChange={e => setShared(p => ({ ...p, email: e.target.value }))} placeholder="specialist@example.com" style={inputStyle} /></div>
          <div><label style={labelStyle}>Personal email (not emailed)</label><input value={shared.personal_email || ''} onChange={e => setShared(p => ({ ...p, personal_email: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Join Date</label><input type="date" value={shared.join_date || ''} onChange={e => setShared(p => ({ ...p, join_date: e.target.value }))} style={inputStyle} /></div>
          {(shared.status === 'Lost' || shared.status === 'Removed') && (
            <div><label style={labelStyle}>Leave Date</label><input type="date" value={shared.leave_date || ''} onChange={e => setShared(p => ({ ...p, leave_date: e.target.value }))} style={inputStyle} /></div>
          )}
        </FormGrid>
        </ProfileCard>

        <ProfileCard icon="dollar" tone="green" title="Revenue Details">
        <div style={fieldStyle}>
          <label style={labelStyle}>Revenue Decision</label>
          <ChoiceButtons options={[['Revenue Share', 'Revenue Share'], ['Money Mapping', 'Money Mapping']]} value={shared.revenue_decision} onChange={v => setShared(p => ({ ...p, revenue_decision: v }))} />
        </div>
        {which === 'edit' && (
          <div style={{ ...fieldStyle, marginBottom: 0 }}>
            <label style={labelStyle}>Stripe Connect (payouts)</label>
            {selectedExpert?.stripe_account_id
              ? <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', marginBottom: '8px' }}>Connected · <span style={{ fontFamily: 'monospace', color: 'var(--vfo-muted)' }}>{selectedExpert.stripe_account_id}</span></div>
              : <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '8px' }}>No payout account yet.</div>}
            <button type="button" onClick={handleSpecialistConnect} disabled={connectBusy}
              style={{ ...btnState(btnOutline, connectBusy), cursor: connectBusy ? 'wait' : 'pointer' }}>
              {connectBusy ? 'Working…' : (selectedExpert?.stripe_account_id ? 'Resend Setup Link' : 'Set Up Payment Details')}
            </button>
            {connectMsg && <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '8px' }}>{connectMsg}</p>}
          </div>
        )}
        </ProfileCard>

        <ProfileCard icon="text" title="Biography">
          <textarea value={shared.long_bio} onChange={e => setShared(p => ({ ...p, long_bio: e.target.value }))} placeholder="Detailed biography..." rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
        </ProfileCard>

        {/* ---- Per-ecosystem content (short bio, D&B, tax) — one write-up per ecosystem ---- */}
        <ProfileCard icon="layers" title="VFO Ecosystem" sub={multi ? 'One write-up per entry — fill each below' : 'Each entry has its own short bio and Details & Benefits.'}>
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

        {entries.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>Add a VFO ecosystem above to enter this person's bio &amp; details.</div>
        )}

        {entries.map((en, idx) => (
          <div key={idx} style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', padding: '18px', marginBottom: '14px', background: 'var(--vfo-input)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ display: 'inline-block', fontSize: '13px', fontWeight: 700, color: '#0095ff', background: 'rgba(0,149,255,0.12)', border: '1px solid rgba(0,149,255,0.25)', borderRadius: '999px', padding: '4px 14px' }}>{entryLabel(entries, idx)}</span>
                {idx === 0 && <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>primary — mirrored to the showroom card</span>}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => moveEntry(which, idx, -1)} disabled={idx === 0} style={btnState({ ...btnSecondary, ...BTN_SMALL }, idx === 0)}>↑</button>
                <button type="button" onClick={() => moveEntry(which, idx, 1)} disabled={idx === entries.length - 1} style={btnState({ ...btnSecondary, ...BTN_SMALL }, idx === entries.length - 1)}>↓</button>
                <button type="button" onClick={() => removeEntry(which, idx)} style={{ ...btnDanger, ...BTN_SMALL }}>Remove</button>
              </div>
            </div>
            {entryBody(idx, en)}
          </div>
        ))}

        </ProfileCard>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: activeTab === 'edit' && !selectedExpert ? LIST_PAGE_MAX_WIDTH : '900px', margin: '0 auto', padding: '24px' }}>
      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}
      {/* Section title: the Advisors list's header on the list, PageHeading on Add */}
      {activeTab === 'add' && <PageHeading eyebrow="Specialists" title="Add Specialist" />}
      {activeTab === 'edit' && !selectedExpert && (
        <ListHeader title="Specialists" count={searchedExperts.length} action={<ExportButton title="Specialists" columns={specialistExportColumns(ecoMap)} rows={searchedExperts} filterGroups={specFilterGroups} filterValue={specFilter} />} />
      )}

      {/* Add tab */}
      {activeTab === 'add' && (
        <div>
          {SpecialistForm({ which: 'add', statusMsg: addStatus, statusType: addStatusType })}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => submitSpecialist('add')}
              style={btnPrimary}>
              Add Specialist
            </button>
            <button onClick={clearAddForm}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>
              Clear Form
            </button>
            {addStatus && <span style={{ alignSelf: 'center', color: addStatusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 600 }}>{addStatus}</span>}
          </div>
        </div>
      )}

      {/* Search/Edit tab */}
      {activeTab === 'edit' && !selectedExpert && (
        <>
          {editStatus && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: editStatusType === 'success' ? 'rgba(27,146,84,0.1)' : 'rgba(231,76,60,0.1)', color: editStatusType === 'success' ? 'var(--vfo-success-text)' : '#e74c3c', border: `1px solid ${editStatusType === 'success' ? 'rgba(27,146,84,0.3)' : 'rgba(231,76,60,0.3)'}` }}>{editStatus}</div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name..." style={listSearchStyle} onChange={e => setEditSearch(e.target.value.toLowerCase())} value={editSearch} />
            <ListFilterButton groups={specFilterGroups} value={specFilter} onChange={setSpecFilter} />
            <SortSelect value={specSort} onChange={setSpecSort} />
          </div>
          <ListTable
            rows={visibleExperts}
            rowKey={e => e.id}
            resetSortOn={specSort}
            minWidth="760px"
            empty={editSearch ? 'No specialists match your search.' : 'No specialists match the current filters.'}
            onRowClick={e => { setProfileOrigin(null); handleEditSelect(e) }}
            columns={[
              { key: 'name', label: 'Name', width: '2fr', get: e => e.name, render: e => (
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-border)', flexShrink: 0 }}>
                    {e.headshot_image && <img src={HEADSHOT_SUPABASE + encodeURIComponent(e.headshot_image)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </span>
                  <ListName>{e.name}</ListName>
                </span>
              ) },
              { key: 'area', label: 'Ecosystem', width: '2fr', render: e => {
                const eco = ecoMap[e.id] || []
                const text = eco.length ? eco.join(' · ') : e.short_bio
                return <ListText style={{ color: text ? 'var(--vfo-muted)' : undefined, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</ListText>
              } },
              { key: 'accredited', label: 'Accredited', width: '120px', get: e => (e.vfo_accredited ? 'Yes' : ''), render: e => e.vfo_accredited ? <ListPill color="#002973">VFO Accredited</ListPill> : <ListText /> },
              { key: 'status', label: 'Status', width: '110px', get: e => e.status || 'Active', render: e => <ListPill color={STATUS_COLORS[e.status || 'Active'] || '#8a94a6'}>{e.status || 'Active'}</ListPill> },
            ]}
          />
        </>
      )}

      {activeTab === 'edit' && selectedExpert && (
        <div>
          <BackLink onClick={backToList}>Back to list</BackLink>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--vfo-border)', position: 'relative', zIndex: 50 }}>
            <div style={{ position: 'relative' }} onMouseEnter={() => setProfileDropOpen(true)} onMouseLeave={() => setProfileDropOpen(false)}>
              <button style={{ padding: '8px 16px', border: 'none', background: 'none', borderBottom: '2px solid var(--vfo-accent-text)', color: 'var(--vfo-accent-text)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Profile<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
              </button>
              {profileDropOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '150px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
                  {[['profile','Profile'],['edit','Edit Profile'],['vault','Vault'],['payments','Payments'],['settings','Settings']].map(([k, l]) => (
                    <button key={k} onClick={() => { setSpecialistTab(k); setProfileDropOpen(false) }} style={{ display: 'block', width: '100%', padding: '8px 16px', background: specialistTab === k ? 'var(--vfo-tint)' : 'transparent', border: 'none', color: specialistTab === k ? 'var(--vfo-accent-text)' : 'var(--vfo-ink)', fontWeight: specialistTab === k ? 600 : 400, fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'} onMouseLeave={e => e.currentTarget.style.background = specialistTab === k ? 'var(--vfo-tint)' : 'transparent'}>{l}</button>
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
              {/* The sticky save bar, as on the member's Edit Profile. */}
              <SaveBar onSave={() => submitSpecialist('edit')} status={editStatus} statusType={editStatusType}>
                <button onClick={() => { setSelectedExpert(null); setEditingId(null); setSpecialistTab('profile') }} style={{ ...btnSecondary, padding: '10px 20px', fontSize: '14px' }}>
                  Cancel
                </button>
              </SaveBar>
            </div>
          )}

          {specialistTab === 'settings' && (
            <>
              <ProfileCard icon="lock" title="Specialist Login">
                <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', margin: '0 0 16px' }}>{selectedExpert.email ? <>Send a setup email to <strong>{selectedExpert.email}</strong> so they can set their own portal passcode.</> : <>Add an email in Edit Profile first, then send the setup email.</>}</p>
                <SendSetupEmailButton loginType="specialist" subjectId={selectedExpert.id} hint="Drafts a Gmail with a secure link. The specialist sets their own passcode." />
              </ProfileCard>
              <ProfileCard icon="alert" tone="red" title="Danger Zone" sub="Permanently delete this specialist. This cannot be undone." style={{ border: '1px solid rgba(231,76,60,0.3)' }}>
                <button onClick={deleteSpecialist} style={btnDanger}>Delete Specialist</button>
              </ProfileCard>
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
  // The Stripe Account tile's live status: the same Stripe check the member
  // profile runs (specialist_connect_status), refreshed on demand.
  const acctId = (expert.stripe_account_id || '').trim()
  const [connectStatus, setConnectStatus] = useState(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [connectRefresh, setConnectRefresh] = useState(0)
  useEffect(() => {
    if (!acctId) { setConnectStatus(null); setConnectLoading(false); return }
    let alive = true
    setConnectLoading(true)
    callApi('specialist_connect_status', { expert_id: expert.id })
      .then(res => { if (alive) setConnectStatus(res || { status: 'unavailable' }) })
      .catch(() => { if (alive) setConnectStatus({ status: 'unavailable' }) })
      .finally(() => { if (alive) setConnectLoading(false) })
    return () => { alive = false }
  }, [expert.id, acctId, connectRefresh])
  const sectionStyle = cardBox
  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const dbHeading = { fontSize: '14px', fontWeight: 800, letterSpacing: '0.4px', color: 'var(--vfo-heading)', textTransform: 'uppercase' }
  const chip = { fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.25)' }
  const activeChip = { ...chip, background: 'rgba(18,94,204,0.12)', color: 'var(--vfo-accent-text)', border: '1px solid rgba(18,94,204,0.25)', cursor: 'pointer' }
  const idleChip = { ...chip, background: 'transparent', color: 'var(--vfo-muted)', border: '1px solid var(--vfo-border-mid)', cursor: 'pointer' }
  // Accredited specialists carry a badge in the profile header only.
  const accredited = !!expert.vfo_accredited
  const accBadge = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, padding: '4px 12px', borderRadius: '999px', background: 'rgba(0,41,115,0.10)', color: '#002973', border: '1px solid rgba(0,41,115,0.30)' }
  // A long answer in a soft tile: its label over plain text.
  const longTile = { background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px' }
  const longField = (label, value) => value ? (
    <div style={longTile}>
      <div style={subLabel}>{label}</div>
      <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.6, marginTop: '6px', whiteSpace: 'pre-wrap' }}>{value}</div>
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
    <div style={longTile}>
      <div style={subLabel}>{label}</div>
      <div style={{ fontSize: '13.5px', color: value ? 'var(--vfo-ink)' : 'var(--vfo-faint)', lineHeight: 1.6, marginTop: '6px', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  )
  const alwaysFieldSmall = (label, value) => (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px', color: 'var(--vfo-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '13.5px', color: value ? 'var(--vfo-ink)' : 'var(--vfo-faint)', lineHeight: 1.6, marginTop: '6px', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
    </div>
  )

  const headshot = expert.headshot_image
    ? <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-tint)' }}><img src={HEADSHOT_SUPABASE + encodeURIComponent(expert.headshot_image)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = HEADSHOT_BASE + expert.headshot_image }} /></div>
    : <HeroAvatar src={null} name={expert.name} size={72} />

  return (
    <div>
      <ProfileHero
        eyebrow="Specialist"
        name={expert.name}
        avatar={headshot}
        meta={(accredited || c.short_bio) ? <>
          {accredited && <span style={accBadge}>VFO Accredited Professional Specialist</span>}
          {c.short_bio && <span>{c.short_bio}</span>}
        </> : null}
        facts={[
          { label: 'Status', value: <DotText color={STATUS_COLORS[expert.status] || '#1b9254'}>{expert.status || 'Active'}</DotText> },
          { label: 'Top of the T', value: expert.top_of_t ? <DotText color="#e06717">Yes</DotText> : null },
          { label: 'Background check', value: expert.background_check || null },
        ]}
      />

      {/* Specialist Details, then Revenue Details, then the long write-ups. */}
      <ProfileCard icon="id" title="Specialist Details">
        <FieldGrid min={360} phoneCols={1}>
          <Field label="Work email" nowrap pair>{expert.email}</Field>
          <Field label="Personal email" nowrap pair>{expert.personal_email}</Field>
          <Field label="Join date">{expert.join_date ? formatDate(expert.join_date) : null}</Field>
          {expert.leave_date && <Field label="Leave date">{formatDate(expert.leave_date)}</Field>}
        </FieldGrid>
      </ProfileCard>

      <ProfileCard icon="dollar" tone="green" title="Revenue Details">
        <FieldGrid min={360} phoneCols={1}>
          <Field label="Revenue decision">{expert.revenue_decision}</Field>
          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            {acctId ? (
              <StripeAccountField acctId={acctId} loading={connectLoading} connectStatus={connectStatus} onRefresh={() => setConnectRefresh(n => n + 1)} />
            ) : (
              <Field label="Stripe Connect">
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={onConnect} disabled={connectBusy} style={{ ...btnState(btnOutline, connectBusy), cursor: connectBusy ? 'wait' : 'pointer' }}>
                    {connectBusy ? 'Working…' : 'Send Stripe Connect setup email'}
                  </button>
                </div>
                {connectMsg && <p style={{ fontSize: '12px', fontWeight: 500, margin: '8px 0 0', color: 'var(--vfo-muted)' }}>{connectMsg}</p>}
              </Field>
            )}
          </div>
        </FieldGrid>
      </ProfileCard>

      {expert.long_bio && (
        <ProfileCard icon="text" title="Biography">
          <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.75, whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{expert.long_bio}</div>
        </ProfileCard>
      )}

      {entries.length > 0 && (
        <ProfileCard icon="layers" title="VFO Ecosystem" sub={multi ? 'Pick an entry to see its bio and details.' : null}>
          {multi
            ? <ChoiceButtons options={entries.map((e, i) => [i, entryLabel(entries, i)])} value={activeIdx} onChange={setActive} />
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{entries.map((e, i) => <span key={i} style={chip}>{entryLabel(entries, i)}</span>)}</div>}
        </ProfileCard>
      )}

      <ProfileCard icon="clipboard" title={`Details & Benefits${suffix}`}>
        {hasDb
          ? dbFields.map(([label, value]) => <Fragment key={label}>{longField(label, value)}</Fragment>)
          : <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>No details entered yet — use Edit Specialist to add them.</div>}
      </ProfileCard>

      {/* Tax Planning Audit Risk Questionnaire — per-entry; only under a Tax
          Planning entry, and only when at least one answer is filled. */}
      {activeEco === TAX_ECOSYSTEM && hasAudit && (
        <ProfileCard icon="shield" tone="gold" title={`Tax Planning Audit Risk Questionnaire${suffix}`}>
          {alwaysField('1. General risks of this strategy', c['D&B_audit_risk_general'])}
          {alwaysField('2. History of these risks coming to fruition', c['D&B_audit_risk_history'])}
          {alwaysField('3. Potential worst-case scenarios', c['D&B_audit_risk_worst_case'])}
          {alwaysField('4. Precautions to prevent or minimize the risks', c['D&B_audit_risk_precautions'])}
        </ProfileCard>
      )}

      {c['D&B_revenue_share'] && (
        <ProfileCard icon="dollar" tone="green" title={`Revenue Share${suffix}`}>
          <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c['D&B_revenue_share']}</div>
        </ProfileCard>
      )}
    </div>
  )
}
