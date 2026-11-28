import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { callApi, loadCachedAction, loadCachedData, getLastSeen, setLastSeen } from '../../lib/api'
import { makeTaxPlanRules, taxPlanProgressSummary } from './tax/taxPlanRules'
import { fileToLogoPng, logoUrl } from '../shared/logoPng'
import { fileSizeError } from '../../lib/fileUpload'
import VaultSections from '../shared/VaultSections'
import VaultDropLink from '../shared/VaultDropLink'
import ImageCropModal from './ImageCropModal'
import ListFilterButton, { matchesFilter, sortByJoin, SortSelect } from './ListFilterButton'
import ListTable, { ListName, ListPill, ListText, listSearchStyle, LIST_PAGE_MAX_WIDTH } from '../shared/ListTable'
import TaxPlannerKpiPanel from './TaxPlannerKpiPanel'
import { DirectoryListSkeleton, KpiPageSkeleton, StrategicPartnersSkeleton, TableSkeleton } from '../shared/Skeleton'
import { HeroAvatar, ListHeader } from '../shared/TrackKit'
import { BackLink, DotText, Field, FieldGrid, FormGrid, formInput, formLabel, PageHeading, ProfileCard, ProfileHero, SaveBar } from '../shared/ProfileKit'
import { btnDanger, btnPrimary, btnSecondary, btnState } from '../shared/buttonStyles'
import { FeatureTabDropdown } from './MembersPanel'
import SendSetupEmailButton from './SendSetupEmailButton'
import { useNavigate } from 'react-router-dom'
import { ClientNameLink, clientPagePath } from '../shared/personLinks'
import { formatDate } from '../../lib/dates'
import ExportButton from '../shared/ExportButton'
import { exportDate } from '../../lib/exportXlsx'

import { STATUS_COLORS, statusColor, statusPillStyle } from '../shared/statusColors'
import { planTag } from './tax/TaxPlanStatus'
import { HEADSHOTS_URL } from '../../lib/environment'
const HEADSHOT_SUPABASE = HEADSHOTS_URL

const PLANNER_EXPORT_COLUMNS = [
  { header: 'First Name', value: p => p.first_name || '' },
  { header: 'Last Name', value: p => p.last_name || '' },
  { header: 'Status', value: p => p.status || 'Active' },
  { header: 'Email', value: p => p.email || '' },
  { header: 'Partnership', value: p => p.member_type || '' },
  { header: 'Role', value: p => p.planner_role || 'Tax Planner', default: false },
  { header: 'Certifications', value: p => (Array.isArray(p.certifications) ? p.certifications : []).join(', '), default: false },
  { header: 'Website', value: p => p.website_url || '', default: false },
  { header: 'Join Date', value: p => exportDate(p.join_date), default: false },
  { header: 'Leave Date', value: p => exportDate(p.leave_date), default: false },
]
const fullName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(unnamed)'

// Rows predating the Team Member role carry no planner_role — they are planners.
const PLANNER_ROLES = ['Tax Planner', 'Team Member']
const roleOf = (p) => p?.planner_role || 'Tax Planner'

// "10 plans · 9 clients": the plan count alone read as a client count and never
// matched the Clients tab, which lists one row per client (a client with two plans
// is 2 plans, 1 client). client_count comes from tax_planners_load; until that
// field exists the label stays the plan count alone.
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
function allocationLabel(p) {
  const plans = Number(p?.allocation_count) || 0
  if (p?.client_count == null) return plural(plans, 'plan')
  return `${plural(plans, 'plan')} · ${plural(Number(p.client_count) || 0, 'client')}`
}

// Certifications (professional designations, e.g. "EA", "CPA") stored as a jsonb
// array on the planner. Defined at module scope so every nested component can use
// the display helper without prop threading (gotcha #193).
const certsOf = (p) => Array.isArray(p?.certifications) ? p.certifications.map(c => String(c || '').trim()).filter(Boolean) : []
// Planner name with certifications appended as a comma suffix: "Carson Grover, EA, CPA".
const plannerDisplayName = (p) => [fullName(p), ...certsOf(p)].join(', ')

function blankForm() {
  return { first_name: '', last_name: '', email: '', status: 'Active', planner_role: 'Tax Planner', member_type: '', join_date: '', leave_date: '', certifications: [] }
}
function pickForm(p) {
  return {
    first_name: p.first_name || '', last_name: p.last_name || '', email: p.email || '',
    status: p.status || 'Active',
    planner_role: roleOf(p),
    member_type: p.member_type || '',
    join_date: p.join_date ? String(p.join_date).split('T')[0] : '',
    leave_date: p.leave_date ? String(p.leave_date).split('T')[0] : '',
    certifications: certsOf(p),
  }
}

export default function TaxPlannersPanel({ section }) {
  const [planners, setPlanners] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [addForm, setAddForm] = useState(blankForm())
  const [addCertInput, setAddCertInput] = useState('')
  const [addFile, setAddFile] = useState(null)
  const [addPreview, setAddPreview] = useState(null)
  const [addStatus, setAddStatus] = useState('')
  const [addStatusType, setAddStatusType] = useState('success')
  const [addTab, setAddTab] = useState('planner') // 'planner' | 'group'

  const [editForm, setEditForm] = useState(blankForm())
  const [editCertInput, setEditCertInput] = useState('')
  const [editFile, setEditFile] = useState(null)
  const [editPreview, setEditPreview] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editStatusType, setEditStatusType] = useState('success')
  const [editingId, setEditingId] = useState(null)

  const [selectedPlanner, setSelectedPlanner] = useState(null)
  const [plannerTab, setPlannerTab] = useState('profile')

  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active'] })
  const [listSort, setListSort] = useState('default')

  const [cropState, setCropState] = useState(null) // { which, src }
  const [deleteMsg, setDeleteMsg] = useState('')

  function applyLoad(d) {
    const list = d.tax_planners || []
    setPlanners(list)
    setGroups(d.tax_planning_groups || [])
    setLoadError('')
    return list
  }
  async function load(quiet) {
    if (quiet !== true) setLoading(true)
    try {
      const d = await callApi('tax_planners_load')
      const list = applyLoad(d)
      setLastSeen('taxplanners:list', d)
      return list
    } catch (e) {
      if (quiet === true) { console.error(e); return null }
      setLoadError(e.message || 'Could not load tax planners.')
      return null
    } finally {
      setLoading(false)
    }
  }
  const groupNames = groups.map(g => g.name)
  useLayoutEffect(() => {
    // Re-opened panel: draw the last list (and reopen the planner) at once, refresh behind it.
    const snap = getLastSeen('taxplanners:list')
    const ret = takePlannerReturn()
    const reopen = list => {
      const planner = ret && (list || []).find(p => String(p.id) === String(ret.plannerId))
      if (planner) { handleSelect(planner); setPlannerTab(ret.tab) }
      return !!planner
    }
    let reopened = false
    if (snap) { reopened = reopen(applyLoad(snap)); setLoading(false) }
    load(!!snap).then(list => { if (!reopened) reopen(list) })
  }, [])

  function showStatus(which, type, msg) {
    if (which === 'add') { setAddStatusType(type); setAddStatus(msg); setTimeout(() => setAddStatus(''), 4000) }
    if (which === 'edit') { setEditStatusType(type); setEditStatus(msg); setTimeout(() => setEditStatus(''), 4000) }
  }

  function clearAddForm() {
    setAddForm(blankForm())
    setAddCertInput('')
    setAddFile(null); setAddPreview(null)
  }

  function handleSelect(planner) {
    setEditingId(planner.id)
    setEditForm(pickForm(planner))
    setEditCertInput('')
    setEditFile(null)
    setEditPreview(planner.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(planner.headshot_image) : null)
    setSelectedPlanner(planner)
    setPlannerTab('profile')
    setDeleteMsg('')
    window.scrollTo(0, 0)
  }

  function backToList() {
    setSelectedPlanner(null)
    setEditingId(null)
    setPlannerTab('profile')
    setDeleteMsg('')
  }

  function handleFileChange(which, e) {
    const file = e.target.files[0]
    if (!file) return
    const tooBig = fileSizeError(file)
    if (tooBig) { window.alert(tooBig); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = ev => setCropState({ which, src: ev.target.result })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function applyCrop(dataUrl) {
    const which = cropState?.which || 'add'
    const bstr = atob(dataUrl.split(',')[1])
    let n = bstr.length
    const u8 = new Uint8Array(n)
    while (n--) u8[n] = bstr.charCodeAt(n)
    const file = new File([u8], 'headshot.jpg', { type: 'image/jpeg' })
    if (which === 'add') { setAddFile(file); setAddPreview(dataUrl) }
    else { setEditFile(file); setEditPreview(dataUrl) }
    setCropState(null)
  }

  async function submit(which) {
    const form = which === 'add' ? addForm : editForm
    const file = which === 'add' ? addFile : editFile
    if (!form.first_name.trim() || !form.last_name.trim()) { showStatus(which, 'error', 'First and last name are required.'); return }
    if (form.planner_role === 'Team Member' && !form.member_type) { showStatus(which, 'error', 'Team members require a partnership'); return }
    try {
      let headshotFilename = ''
      if (file) {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        headshotFilename = ts + '_' + fullName(form).replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.jpg'
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        await callApi('upload_headshot', { filename: headshotFilename, file_base64: base64, content_type: file.type })
      }
      const planner = {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim(),
        status: form.status || 'Active',
        planner_role: form.planner_role || 'Tax Planner',
        member_type: form.member_type || '',
        certifications: Array.isArray(form.certifications) ? form.certifications : [],
        join_date: form.join_date || null,
        leave_date: (form.status === 'Active' || !form.leave_date) ? null : form.leave_date,
      }
      if (headshotFilename) planner.headshot_image = headshotFilename
      await callApi('save_tax_planner', { planner, editing_id: which === 'edit' ? editingId : null })
      if (which === 'add') {
        await load()
        clearAddForm()
        showStatus('add', 'success', 'Tax planner added!')
      } else {
        // Saved: straight back to the profile itself, showing what was saved
        // (2026-11-27); the quiet re-read then swaps in the stored row.
        setSelectedPlanner(p => (p ? { ...p, ...planner } : p))
        setPlannerTab('profile'); window.scrollTo(0, 0)
        showStatus('edit', 'success', 'Changes saved!')
        const list = await load(true)
        const updated = (list || []).find(p => p.id === editingId)
        if (updated) setSelectedPlanner(updated)
      }
    } catch (err) {
      showStatus(which, 'error', err.message)
    }
  }

  async function deletePlanner() {
    if (!editingId) return
    if (!window.confirm(`Delete ${fullName(selectedPlanner || {})} permanently? This cannot be undone.`)) return
    const deletedName = fullName(selectedPlanner || {})
    try {
      await callApi('delete_tax_planner', { planner_id: editingId })
      await load()
      backToList()
      showStatus('edit', 'success', `${deletedName} deleted.`)
    } catch (err) {
      setDeleteMsg(err.message || 'Could not delete this tax planner.')
    }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  const listFilterGroups = [
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: p => p.status || 'Active' },
    ...(groupNames.length ? [{ key: 'partnership', label: 'Partnership', options: groupNames, get: p => p.member_type || '(none)' }] : []),
  ]

  // The Edit / Add form — cloned from SpecialistForm's card structure. `full`
  // renders the complete profile form (edit); the Add view keeps only the
  // minimal identity fields (headshot, name, email, status).
  function plannerForm(which, full) {
    const form = which === 'add' ? addForm : editForm
    const setForm = which === 'add' ? setAddForm : setEditForm
    const preview = which === 'add' ? addPreview : editPreview
    const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

    // Certifications multi-add (professional designations). Cloned from
    // SpecialistForm's "VFO Ecosystems" removable-chip idiom (SpecialistsPanel.jsx
    // ~lines 468-477) but with a free-text input + Add button instead of a select.
    const certInput = which === 'add' ? addCertInput : editCertInput
    const setCertInput = which === 'add' ? setAddCertInput : setEditCertInput
    const certs = Array.isArray(form.certifications) ? form.certifications : []
    const addCert = () => {
      const v = certInput.trim()
      if (!v) return
      if (!certs.includes(v)) setForm(p => ({ ...p, certifications: [...(Array.isArray(p.certifications) ? p.certifications : []), v] }))
      setCertInput('')
    }
    const removeCert = (idx) => setForm(p => ({ ...p, certifications: (Array.isArray(p.certifications) ? p.certifications : []).filter((_, i) => i !== idx) }))

    // Split into titled boxes like the member's Edit Profile (2026-11-26).
    const fld = (label, node, wide) => (
      <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={formLabel}>{label}</label>{node}</div>
    )
    return (
      <div>
        <ProfileCard icon="camera" title="Photo & Name">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div
              onClick={() => { if (preview) setCropState({ which, src: preview }) }}
              title={preview ? 'Click to adjust / zoom' : ''}
              style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: preview ? 'pointer' : 'default', flexShrink: 0 }}>
              {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--vfo-muted)', fontSize: '24px' }}>?</span>}
            </div>
            <div>
              <label style={{ ...btnPrimary, display: 'inline-block' }}>
                Choose Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileChange(which, e)} />
              </label>
              {preview && (
                <button type="button" onClick={() => setCropState({ which, src: preview })} style={{ ...btnSecondary, marginLeft: '8px' }}>
                  Adjust / Zoom
                </button>
              )}
              <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', margin: '6px 0 0' }}>JPG or PNG, recommended 400×400px. Click the photo to adjust &amp; zoom.</p>
            </div>
          </div>
          <FormGrid min={200}>
            {fld('First Name *', <input value={form.first_name} onChange={e => upd('first_name', e.target.value)} style={formInput} />)}
            {fld('Last Name *', <input value={form.last_name} onChange={e => upd('last_name', e.target.value)} style={formInput} />)}
          </FormGrid>
        </ProfileCard>

        <ProfileCard icon="contacts" title="Contact">
          {fld('Email', <input value={form.email} onChange={e => upd('email', e.target.value)} type="email" placeholder="planner@example.com" style={formInput} />)}
        </ProfileCard>

        <ProfileCard icon="briefcase" title="Membership">
          <FormGrid min={200}>
            {fld('Status', (
              <select value={form.status} onChange={e => upd('status', e.target.value)} style={formInput}>
                {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ))}
            {full && fld('Join Date', <input type="date" value={form.join_date} onChange={e => upd('join_date', e.target.value)} style={formInput} />)}
            {full && (form.status === 'Lost' || form.status === 'Removed') && fld('Leave Date', <input type="date" value={form.leave_date} onChange={e => upd('leave_date', e.target.value)} style={formInput} />)}
            {fld('Member Type', (
              <select value={form.planner_role || 'Tax Planner'} onChange={e => upd('planner_role', e.target.value)} style={formInput}>
                {PLANNER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ))}
            {fld('Partnership', (
              <>
                <select value={form.member_type} onChange={e => upd('member_type', e.target.value)} style={formInput} disabled={groupNames.length === 0}>
                  <option value="">-- Select group --</option>
                  {groupNames.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {groupNames.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', margin: '6px 0 0' }}>No Tax Planning Groups yet. Add one under Add Tax Planner → Add Tax Planning Group.</p>}
              </>
            ))}
          </FormGrid>
        </ProfileCard>

        {form.planner_role !== 'Team Member' && (
          <ProfileCard icon="award" title="Certifications" sub="Professional designations shown after the name (e.g. EA, CPA).">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={certInput} onChange={e => setCertInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCert() } }} placeholder="e.g. EA" style={{ ...formInput, flex: 1 }} />
              <button type="button" onClick={addCert} style={btnPrimary}>Add</button>
            </div>
            {certs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {certs.map((c, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', border: '1px solid rgba(0,149,255,0.25)', background: 'rgba(0,149,255,0.12)', color: 'var(--vfo-accent-text)', fontSize: '12px', fontWeight: 600 }}>
                    {c}
                    <span onClick={() => removeCert(i)} title="Remove" style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.7 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </ProfileCard>
        )}
      </div>
    )
  }

  // ---- Section: Tax Planner KPIs ----
  if (section === 'tax_planner_kpis') {
    if (loading) return <KpiPageSkeleton title="Tax Planner KPIs" layout="single" chips={4} subTabs={[70, 170, 130, 140]} />
    return <TaxPlannerKpiPanel planners={planners} />
  }

  // ---- Section: Tax Planning Partners (group list + connect) ----
  if (section === 'tax_planning_partners') {
    if (loading) return <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}><StrategicPartnersSkeleton /></div>
    return <TaxPlanningPartnersPanel groups={groups} loadError={loadError} onSaved={load} />
  }

  // ---- Section: Add Tax Planner ----
  // Two-section add (mirrors Strategic Members' Add view): pill toggle between
  // the person form and the one-field group-creation form.
  if (section === 'add_tax_planner') {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}
        <AddTaxPlannerSection
          addTab={addTab}
          setAddTab={setAddTab}
          groupNames={groupNames}
          plannerForm={plannerForm}
          submit={submit}
          clearAddForm={clearAddForm}
          addStatus={addStatus}
          addStatusType={addStatusType}
          onGroupsChange={load}
        />
      </div>
    )
  }

  // ---- Section: Tax Planner Search (list + detail) ----
  return (
    <div style={{ maxWidth: selectedPlanner ? '900px' : LIST_PAGE_MAX_WIDTH, margin: '0 auto', padding: '24px' }}>
      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}

      {loading && <DirectoryListSkeleton numbered={false} chip />}
      {!loading && loadError && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>{loadError}</div>
      )}

      {!loading && !selectedPlanner && (() => {
        // Filter (name / email / member_type match — email is searchable but not
        // shown in the row) then sort, exactly once, so the header count and the
        // empty-state agree with what's rendered.
        const searchedPlanners = sortByJoin(
          planners.filter(p => !search || fullName(p).toLowerCase().includes(search) || (p.email || '').toLowerCase().includes(search) || (p.member_type || '').toLowerCase().includes(search) || roleOf(p).toLowerCase().includes(search)),
          listSort
        )
        const filteredPlanners = searchedPlanners.filter(p => matchesFilter(p, listFilterGroups, listFilter))
        return (
        <>
          {editStatus && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: editStatusType === 'success' ? 'rgba(27,146,84,0.1)' : 'rgba(231,76,60,0.1)', color: editStatusType === 'success' ? 'var(--vfo-success-text)' : '#e74c3c', border: `1px solid ${editStatusType === 'success' ? 'rgba(27,146,84,0.3)' : 'rgba(231,76,60,0.3)'}` }}>{editStatus}</div>
          )}
          <ListHeader title="Tax Planners" count={filteredPlanners.length} action={<ExportButton title="Tax Planners" columns={PLANNER_EXPORT_COLUMNS} rows={searchedPlanners} filterGroups={listFilterGroups} filterValue={listFilter} />} />
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name or type..." style={listSearchStyle} onChange={e => setSearch(e.target.value.toLowerCase())} value={search} />
            <ListFilterButton groups={listFilterGroups} value={listFilter} onChange={setListFilter} />
            <SortSelect value={listSort} onChange={setListSort} />
          </div>
          <ListTable
            rows={filteredPlanners}
            rowKey={p => p.id}
            resetSortOn={listSort}
            minWidth="700px"
            empty={loadError ? '' : 'No tax planners match your search.'}
            onRowClick={p => handleSelect(p)}
            columns={[
              { key: 'name', label: 'Name', width: '1.6fr', get: p => plannerDisplayName(p), render: p => <ListName>{plannerDisplayName(p)}</ListName> },
              { key: 'status', label: 'Status', width: '110px', get: p => p.status, render: p => p.status ? <ListPill color={statusColor(p.status, '#8a94a6')}>{p.status}</ListPill> : <ListText /> },
              { key: 'partnership', label: 'Partnership', width: '1.3fr', get: p => p.member_type, render: p => <ListText>{p.member_type}</ListText> },
              { key: 'allocations', label: 'Allocations', width: '1fr', get: p => (roleOf(p) === 'Team Member' ? 'Team Member' : allocationLabel(p)), render: p => <ListText>{roleOf(p) === 'Team Member' ? 'Team Member' : allocationLabel(p)}</ListText> },
            ]}
          />
        </>
        )
      })()}

      {!loading && selectedPlanner && (
        <div>
          <BackLink onClick={backToList}>Back to list</BackLink>

          <ProfileHero
            eyebrow="Tax Planner"
            name={plannerDisplayName(selectedPlanner)}
            avatar={<HeroAvatar src={selectedPlanner.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(selectedPlanner.headshot_image) : null} name={fullName(selectedPlanner)} size={72} />}
            facts={[
              { label: 'Status', value: <DotText color={STATUS_COLORS[selectedPlanner.status] || '#1b9254'}>{selectedPlanner.status || 'Active'}</DotText> },
              { label: 'Member Type', value: roleOf(selectedPlanner) },
              { label: 'Partnership', value: selectedPlanner.member_type || null },
              { label: 'Allocations', value: allocationLabel(selectedPlanner) },
            ]}
          />

          <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px', flexWrap: 'wrap', position: 'relative', zIndex: 50 }}>
            <FeatureTabDropdown
              label="Profile"
              isActive={['profile', 'edit', 'vault', 'payments', 'settings'].includes(plannerTab)}
              options={[{ key: 'profile', label: 'Profile' }, { key: 'edit', label: 'Edit Profile' }, { key: 'vault', label: 'Vault' }, { key: 'payments', label: 'Payments' }, { key: 'settings', label: 'Settings' }]}
              onSelect={setPlannerTab}
            />
            <button
              onClick={() => setPlannerTab('clients')}
              style={{ padding: '7px 16px', background: plannerTab === 'clients' ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: plannerTab === 'clients' ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: plannerTab === 'clients' ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' }}>
              Clients
            </button>
          </div>

          {plannerTab === 'profile' && (
            <TaxPlannerProfileView planner={selectedPlanner} />
          )}

          {plannerTab === 'edit' && (
            <div>
              {plannerForm('edit', true)}
              {/* The sticky save bar, as on the member's Edit Profile. */}
              <SaveBar onSave={() => submit('edit')} status={editStatus} statusType={editStatusType}>
                <button onClick={backToList} style={{ ...btnSecondary, padding: '10px 20px', fontSize: '14px' }}>
                  Cancel
                </button>
              </SaveBar>
            </div>
          )}

          {plannerTab === 'vault' && (
            <div style={sectionStyle}>
              <TaxPlannerAdminVault plannerId={selectedPlanner.id} />
            </div>
          )}

          {plannerTab === 'payments' && (
            <TaxPlannerPaymentsTab plannerId={selectedPlanner.id} />
          )}

          {plannerTab === 'clients' && (
            <TaxPlannerClientsTab plannerId={selectedPlanner.id} />
          )}

          {plannerTab === 'settings' && (
            <>
            <ProfileCard icon="lock" title="Tax Planner Login">
              <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', margin: '0 0 16px' }}>{selectedPlanner.email ? <>Send a setup email to <strong>{selectedPlanner.email}</strong> so they can set their own portal passcode.</> : <>Add an email in Edit Profile first, then send the setup email.</>}</p>
              {selectedPlanner.email && <SendSetupEmailButton loginType="tax_planner" subjectId={selectedPlanner.id} hint="Drafts a Gmail with a secure link. The tax planner sets their own passcode." />}
            </ProfileCard>
            <ProfileCard icon="alert" tone="red" title="Danger Zone" sub="Permanently delete this tax planner. This cannot be undone, and is blocked while they are allocated to any tax plan." style={{ border: '1px solid rgba(231,76,60,0.3)' }}>
              <button onClick={deletePlanner} style={btnDanger}>Delete Tax Planner</button>
              {deleteMsg && <p style={{ fontSize: '13px', color: '#d93025', fontWeight: 600, marginTop: '12px' }}>{deleteMsg}</p>}
            </ProfileCard>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Read-only presentation of a tax planner profile — a single "Tax Planner
// Details" facts card mirroring the strategic member profile's Member Details
// card (grid of label/value cells). Payout / Stripe Connect no longer lives on
// the planner — it moved to the planner's Tax Planning Group (Partners tab). The
// name + photo header and the tabs are rendered by the parent (TrackHero + tabs).
function TaxPlannerProfileView({ planner }) {
  const hasLeaveDate = planner.status === 'Lost' || planner.status === 'Removed' || !!planner.leave_date

  return (
    <ProfileCard icon="id" title="Tax Planner Details">
      <FieldGrid min={360}>
        <Field label="Email" nowrap>{planner.email}</Field>
        <Field label="Join Date">{planner.join_date ? formatDate(planner.join_date) : null}</Field>
        {hasLeaveDate && <Field label="Leave Date">{planner.leave_date ? formatDate(planner.leave_date) : null}</Field>}
      </FieldGrid>
    </ProfileCard>
  )
}

// Admin view of a tax planner's vault — single General Documentation section.
const TAX_PLANNER_VAULT_ACTIONS = {
  list: 'tax_planner_vault_list',
  uploadUrl: 'tax_planner_vault_upload_url',
  download: 'tax_planner_vault_download',
  delete: 'tax_planner_vault_delete',
}
const TAX_PLANNER_VAULT_SECTIONS = [
  { key: 'general', title: 'General Documentation', hint: 'Documents in this tax planner’s vault. You can add or remove documents here.' },
]
function TaxPlannerAdminVault({ plannerId }) {
  if (!plannerId) return null
  return (
    <>
      <VaultDropLink entityType="tax_planner" entityKey={plannerId} />
      <VaultSections actions={TAX_PLANNER_VAULT_ACTIONS} params={{ planner_id: plannerId }} sections={TAX_PLANNER_VAULT_SECTIONS} />
    </>
  )
}

// Read-only Payments tab: the planner's share of each tax plan they are allocated
// to, with the retainer and implementation halves each showing paid state + date.
function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (Number.isNaN(num)) return '—'
  const s = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `−$${s}` : `$${s}`
}
function HalfCell({ amount, paid, completedAt, receipt }) {
  const date = formatDate(completedAt)
  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{fmtMoney(amount)}</div>
      <div style={{ marginTop: '5px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', background: paid ? '#e7f5ee' : '#f2f4f7', color: paid ? '#1a7f5a' : 'var(--vfo-faint)', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: paid ? '#1a7f5a' : 'var(--vfo-faint)', flexShrink: 0 }} />
          {paid ? 'Paid' : 'Not paid'}
        </span>
      </div>
      {paid && date && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '5px' }}>{date}</div>}
      {receipt && <div style={{ fontSize: '11px', color: 'var(--vfo-placeholder)', marginTop: '4px', fontFamily: 'ui-monospace, monospace' }}>{receipt}</div>}
    </div>
  )
}
function TaxPlannerPaymentsTab({ plannerId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    let alive = true
    // Re-opened tab: draw the last rows at once, refresh behind them.
    const key = `taxplannerpayments:${plannerId}`
    const snap = getLastSeen(key)
    setError('')
    if (snap) { setRows(snap.rows || []); setLoading(false) } else setLoading(true)
    callApi('tax_planner_payments_load', { planner_id: plannerId })
      .then(d => { if (alive) { setRows(d.rows || []); setLastSeen(key, d) } })
      .catch(e => { if (!alive) return; if (snap) console.error(e); else setError(e?.message || 'Failed to load payments') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [plannerId])

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px' }
  const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 16px', fontFamily: 'Inter, sans-serif' }
  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a89a8', borderBottom: '1px solid var(--vfo-border)', whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: '13px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)', verticalAlign: 'top' }

  if (loading) {
    return <div style={cardStyle}><h3 style={titleStyle}>Payments</h3><TableSkeleton card={false} cols={4} rows={3} pad="12px" /></div>
  }
  if (error) {
    return <div style={cardStyle}><h3 style={titleStyle}>Payments</h3><div style={{ marginTop: '12px', padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>{error}</div></div>
  }

  const list = rows || []
  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>Payments</h3>
      {list.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13.5px', background: 'var(--vfo-tint)', border: '1px dashed var(--vfo-border-chip)', borderRadius: '12px' }}>
          This tax planner is not allocated to any tax plans yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif' }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={{ ...th, textAlign: 'right' }}>Share</th>
                <th style={th}>Retainer</th>
                <th style={th}>Implementation</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.plan_id} style={{ cursor: 'pointer' }}
                  onClick={() => { rememberPlannerReturn(plannerId); navigate(clientPagePath(r.client_id, { tab: 'tax', plan: r.plan_id }), { state: { from: PLANNER_RETURN_FROM } }) }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <td style={td}>
                    <div><ClientNameLink clientId={r.client_id} style={{ fontWeight: 600 }}
                      onOpen={() => rememberPlannerReturn(plannerId)} navState={{ from: PLANNER_RETURN_FROM }}>{r.client_name || `Client ${r.client_id}`}</ClientNameLink></div>
                    {r.total_fee != null && r.total_fee !== '' && <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '3px' }}>Total fee {fmtMoney(r.total_fee)}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>{fmtMoney(r.tax_planner_share)}</span>
                  </td>
                  <td style={td}>
                    <HalfCell amount={r.retainer_amount} paid={!!r.retainer_planner_paid} completedAt={r.retainer_planner_completed_at} receipt={r.retainer_receipt_number} />
                  </td>
                  <td style={td}>
                    <HalfCell amount={r.implementation_amount} paid={!!r.implementation_planner_paid} completedAt={r.implementation_planner_completed_at} receipt={r.implementation_receipt_number} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Read-only Clients tab: every client this planner touches, one row per client
// even when they hold plans under more than one program.
const PROGRAM_LABELS = { 1: 'Holistic', 4: 'VFO Tax Planning' }
const programLabel = (id) => PROGRAM_LABELS[Number(id) || 1] || 'Holistic'
// The plan's own tag (TaxPlanStatus planTag); the backend's is_complete, the shared
// step machine Client Overview runs, decides Completed.
const planState = (r) => planTag({ status: r.plan_status, status_kind: r.status_kind, next_tax_year: r.next_tax_year }, r.is_complete ? 'completed' : 'in progress')
// Back from a client opened off a planner's Clients tab: the client page's Back
// goes to location.state.from (the Tax Planners search), and this key tells the
// panel which planner + tab to reopen. Consumed once on the next mount; a stale
// key (over an hour old) is ignored.
const PLANNER_RETURN_KEY = 'adminTaxPlannerReturn'
const PLANNER_RETURN_FROM = '/admin?tab=taxplanners&section=tax_planner_search'
function rememberPlannerReturn(plannerId) {
  try { sessionStorage.setItem(PLANNER_RETURN_KEY, JSON.stringify({ plannerId, tab: 'clients', at: Date.now() })) } catch { /* private mode */ }
}
function takePlannerReturn() {
  try {
    const raw = sessionStorage.getItem(PLANNER_RETURN_KEY)
    sessionStorage.removeItem(PLANNER_RETURN_KEY)
    const r = raw ? JSON.parse(raw) : null
    return r && Date.now() - Number(r.at || 0) < 3600 * 1000 ? r : null
  } catch { return null }
}
async function withPlanProgress(d) {
  const clients = d.clients || []
  // Each plan's "<n>/6 - <pct>%" runs the plan page's own rules over the
  // inputs the load returns, with the same template the plan page loads.
  const phasesByProgram = {}
  await Promise.all([...new Set(clients.map(r => r.program_id || 1))].map(async pid => {
    try {
      const t = await loadCachedAction('msm_load_client_track', { program_id: pid, track_type: 'tax' })
      const phases = (t?.phases || []).map(p => ({ ...p, program_client_tasks: [...(p.program_client_tasks || [])].sort((a, b) => a.task_order - b.task_order) }))
      phasesByProgram[pid] = phases
    } catch { phasesByProgram[pid] = null }
  }))
  for (const r of clients) {
    const phases = phasesByProgram[r.program_id || 1]
    r.progressSummary = (r.plan && phases)
      ? taxPlanProgressSummary(makeTaxPlanRules({ plan: r.plan, livePlan: r.plan, phases, localProgress: r.progress || {}, taxSpecialists: r.specialists || [] }))
      : null
  }
  return clients
}
function TaxPlannerClientsTab({ plannerId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    let alive = true
    let fresh = false
    // Re-opened tab: draw the last rows at once, refresh behind them.
    const key = `taxplannerclients:${plannerId}`
    const snap = getLastSeen(key)
    setLoading(true); setError('')
    if (snap) withPlanProgress(snap).then(clients => { if (alive && !fresh) { setRows(clients); setLoading(false) } }).catch(e => console.error(e))
    callApi('tax_planner_clients_load', { planner_id: plannerId })
      .then(async d => {
        const clients = await withPlanProgress(d)
        fresh = true
        if (alive) { setRows(clients); setLastSeen(key, d) }
      })
      .catch(e => { if (!alive) return; if (snap) console.error(e); else setError(e?.message || 'Failed to load clients') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [plannerId])

  const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 12px', fontFamily: 'Inter, sans-serif' }
  const GRID = '1.4fr 120px 1.2fr 1fr 1.1fr 120px'

  if (loading) {
    return <div><h3 style={titleStyle}>Clients</h3><TableSkeleton cols={GRID} rows={3} minWidth="760px" /></div>
  }
  if (error) {
    return <div><h3 style={titleStyle}>Clients</h3><div style={{ padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>{error}</div></div>
  }

  const byClient = []
  const seen = new Map()
  for (const r of (rows || [])) {
    const key = String(r.client_id)
    let entry = seen.get(key)
    if (!entry) {
      entry = { ...r, programs: [] }
      seen.set(key, entry)
      byClient.push(entry)
    }
    const label = programLabel(r.program_id)
    if (!entry.programs.includes(label)) entry.programs.push(label)
    entry.planStates = [...(entry.planStates || []), { id: r.tax_plan_id, programId: r.program_id || 1, program: label, state: planState(r), summary: r.progressSummary }]
  }

  // The client's NAME opens their profile; the ROW opens their (first) plan, and
  // each status opens its own plan when the client has more than one (#632).
  const openPlan = (c, p) => {
    if (!p) return
    rememberPlannerReturn(plannerId)
    navigate(clientPagePath(c.client_id, { program: p.programId, tab: 'tax', plan: p.id }), { state: { from: PLANNER_RETURN_FROM } })
  }
  const columns = [
    { key: 'client', label: 'Client', width: '1.4fr', get: c => c.client_name, render: c => (
      <ClientNameLink clientId={c.client_id} program={c.program_id || 1} style={{ fontWeight: 600 }}
        onOpen={() => rememberPlannerReturn(plannerId)} navState={{ from: PLANNER_RETURN_FROM }}>{c.client_name || `Client ${c.client_id}`}</ClientNameLink>
    ) },
    { key: 'ref', label: 'Client Ref', width: '120px', get: c => c.client_ref, render: c => <ListText mono style={{ color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{c.client_ref}</ListText> },
    { key: 'member', label: 'Member', width: '1.2fr', get: c => c.member_name, render: c => <ListText style={{ fontSize: '13px' }}>{c.member_name}</ListText> },
    { key: 'program', label: 'Program', width: '1fr', get: c => c.programs.join(', '), render: c => <span style={{ color: 'var(--vfo-muted)' }}>{c.programs.join(', ')}</span> },
    { key: 'status', label: 'Status', width: '1.1fr', render: c => (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
        {(c.planStates || []).map(p => (
          <button key={p.id} type="button" title={`Open ${p.program} plan`}
            onClick={e => { e.stopPropagation(); openPlan(c, p) }}
            style={{ ...statusPillStyle(p.state.hex), height: '22px', boxSizing: 'border-box', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {p.state.label}
          </button>
        ))}
      </span>
    ) },
    { key: 'progress', label: 'Progress', width: '120px', render: c => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', whiteSpace: 'nowrap' }}>
        {(c.planStates || []).map(p => (
          <span key={p.id} title={p.summary ? `${p.summary.done} / ${p.summary.total} tasks completed` : 'Progress unavailable'}
            style={{ fontSize: '12.5px', lineHeight: '22px', fontWeight: 600, color: p.summary ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>
            {p.summary ? p.summary.label : '—'}
          </span>
        ))}
      </span>
    ) },
  ]

  return (
    <div>
      <h3 style={titleStyle}>Clients</h3>
      <ListTable columns={columns} rows={byClient} rowKey={c => c.client_id} minWidth="760px"
        onRowClick={c => openPlan(c, (c.planStates || [])[0])} empty="No clients assigned." />
    </div>
  )
}

// The Add view has two inner tabs (mirrors Strategic Members' AddStrategicSection):
// the person form + the one-field group-creation form.
function AddTaxPlannerSection({ addTab, setAddTab, groupNames, plannerForm, submit, clearAddForm, addStatus, addStatusType, onGroupsChange }) {
  const pill = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '6px' })
  return (
    <div>
      <PageHeading eyebrow="Tax Planners" title="Add Tax Planner" />
      <div style={{ display: 'flex', marginBottom: '18px' }}>
        <button style={pill(addTab === 'planner')} onClick={() => setAddTab('planner')}>Add Tax Planner</button>
        <button style={pill(addTab === 'group')} onClick={() => setAddTab('group')}>Add Tax Planning Group</button>
      </div>

      {addTab === 'planner' && (
        <div>
          {plannerForm('add', false)}
          <SaveBar onSave={() => submit('add')} label="Add Tax Planner" status={addStatus} statusType={addStatusType}>
            <button type="button" onClick={clearAddForm} style={btnSecondary}>Clear Form</button>
          </SaveBar>
        </div>
      )}

      {addTab === 'group' && <AddTaxPlanningGroupForm onGroupsChange={onGroupsChange} />}
    </div>
  )
}

function AddTaxPlanningGroupForm({ onGroupsChange }) {
  const [groupName, setGroupName] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(false)


  async function submit() {
    const name = groupName.trim()
    if (!name) { setStatusType('error'); setStatus('Tax Planning Group Name is required.'); return }
    setLoading(true)
    try {
      await callApi('save_tax_planning_group', { group: { name } })
      await onGroupsChange()
      setGroupName('')
      setStatusType('success'); setStatus(`Group "${name}" created. It's now a Partnership option.`)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setLoading(false) }
  }

  return (
    <ProfileCard icon="users" title="New Tax Planning Group" sub="Each group becomes a Partnership option when adding a tax planner.">
      <div style={{ maxWidth: '420px', marginBottom: '14px' }}>
        <label style={formLabel}>Tax Planning Group Name *</label>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Innovation Advisory Group" style={formInput} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={submit} disabled={loading} style={{ ...btnState(btnPrimary, loading), cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'Creating…' : 'Create Group'}</button>
        {status && <span style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 500 }}>{status}</span>}
      </div>
    </ProfileCard>
  )
}

// Tax Planning Partners — the "companies" a tax planner belongs to. Each group has
// a group-level Stripe Connect payout account (the planner's revenue share pays out
// to it). Cloned from StrategicPartnersPanel's list + PartnerCard idiom, with group
// name edit + delete added (backend save_tax_planning_group / delete_tax_planning_group).
function TaxPlanningPartnersPanel({ groups, loadError, onSaved }) {
  // The specialist directory for the "Linked specialist" picker (Tax 6 ownership).
  const [experts, setExperts] = useState([])
  useEffect(() => {
    loadCachedData()
      .then(d => setExperts((d?.experts || []).filter(e => e?.id && e?.name).map(e => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(err => console.error(err))
  }, [])
  if (loadError) return <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}><p style={{ color: '#d93025', fontSize: '13px' }}>{loadError}</p></div>
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '18px' }}>
        <PageHeading eyebrow="Tax Planners" title="Tax Planning Partners" style={{ marginBottom: 0 }} />
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '4px' }}>
          Each partner group is a Partnership option for tax planners. Set up the group's payout account here — the tax planner revenue share transfers to it automatically.
        </div>
      </div>
      {groups.length === 0 && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,149,255,0.07)', border: '1px solid rgba(0,149,255,0.22)', color: 'var(--vfo-ink)', fontSize: '13px' }}>
          No Tax Planning Groups yet. Add one under Add Tax Planner → Add Tax Planning Group.
        </div>
      )}
      {groups.map(g => <TaxPartnerCard key={g.id} group={g} onSaved={onSaved} experts={experts} />)}
    </div>
  )
}

// The group logo as the slides show it (the stored PNG carries its own white
// badge), on a small white strip and a small blue strip.
function GroupLogoPreview({ src }) {
  const strip = { width: '150px', height: '56px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  const img = (onBlue) => src
    ? <img src={src} alt="Logo" style={{ width: '120px', height: '40px', objectFit: 'contain', display: 'block' }} />
    : <span style={{ fontSize: '11px', color: onBlue ? 'rgba(255,255,255,0.75)' : '#9aa4b2' }}>No logo</span>
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      <div style={{ ...strip, background: '#fff', border: '1px solid var(--vfo-border-soft)' }}>{img(false)}</div>
      <div style={{ ...strip, background: 'linear-gradient(135deg, #2f6fe0 0%, #1f47a8 100%)' }}>{img(true)}</div>
    </div>
  )
}

function TaxPartnerCard({ group, onSaved, experts = [] }) {
  const [requesting, setRequesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name || '')
  const [contactEmail, setContactEmail] = useState(group.contact_email || '')
  const [busy, setBusy] = useState(false)
  const [deliversPdf, setDeliversPdf] = useState(!!group.delivers_assessment_pdf)
  const [pdfMsg, setPdfMsg] = useState({ text: '', ok: true })
  const [linkedId, setLinkedId] = useState(group.linked_expert_id ?? '')
  const [linkMsg, setLinkMsg] = useState({ text: '', ok: true })
  const [logoPending, setLogoPending] = useState(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoFileRef = useRef(null)
  const connected = (group.stripe_account_id || '').trim()

  // The group's logo, shown bottom-left on its clients' ROI presentations.
  async function pickLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg('')
    try { setLogoPending(await fileToLogoPng(file)) }
    catch (err) { setMsgType('error'); setMsg(err.message) }
  }

  async function saveLogo(patch, okText) {
    setLogoBusy(true); setMsg('')
    try {
      await callApi('tax_planning_group_logo_save', { group_id: group.id, ...patch })
      setLogoPending(null)
      setMsgType('success'); setMsg(okText)
      await onSaved()
    } catch (err) { setMsgType('error'); setMsg(err.message) }
    finally { setLogoBusy(false) }
  }

  async function setUp() {
    if (!contactEmail.trim()) { setMsgType('error'); setMsg('Enter a contact email first.'); return }
    setRequesting(true); setMsg('')
    try {
      const res = await callApi('tax_planning_group_stripe_connect_request', { group_id: group.id, contact_email: contactEmail.trim() })
      setMsgType('success')
      setMsg(`Setup email sent to ${res.to_email}${res.sandbox ? ' (sandbox)' : ''}. Account ${res.stripe_account_id} is ready.`)
      await onSaved()
    } catch (err) { setMsgType('error'); setMsg(err.message) }
    finally { setRequesting(false) }
  }

  async function saveName() {
    const n = name.trim()
    if (!n) { setMsgType('error'); setMsg('Group name is required.'); return }
    setBusy(true); setMsg('')
    try {
      await callApi('save_tax_planning_group', { group: { name: n }, editing_id: group.id })
      setEditing(false)
      await onSaved()
    } catch (err) { setMsgType('error'); setMsg(err.message) }
    finally { setBusy(false) }
  }

  // The vault-assess setting (#400): this group's planners hand over their own
  // Tax Assessment PDF through the client's vault instead of the assess form.
  // Updates this card only — a full onSaved() reload re-draws the list and would
  // wipe the confirmation message before it can be read.
  async function saveDeliversPdf(on) {
    setBusy(true); setPdfMsg({ text: '', ok: true })
    try {
      await callApi('save_tax_planning_group', { group: { name: group.name, delivers_assessment_pdf: on }, editing_id: group.id })
      setDeliversPdf(on)
      setPdfMsg({ ok: true, text: on ? 'Saved — planners in this group now hand over a Tax Assessment PDF.' : 'Saved — planners in this group now complete the assess form.' })
    } catch (err) { setPdfMsg({ ok: false, text: err.message }) }
    finally { setBusy(false) }
  }

  // Tax 6 ownership (2026-10-02): on this group's plans Tax 6 steps 1-3 under the
  // linked specialist are the Tax Team's; under any other specialist steps 3-4
  // are VFOS's (the member's on Direct); step 4 is VFOS's always (2026-10-20).
  // Card-local update, as saveDeliversPdf.
  async function saveLinked(value) {
    setBusy(true); setLinkMsg({ text: '', ok: true })
    try {
      await callApi('save_tax_planning_group', { group: { name: group.name, linked_expert_id: value === '' ? null : Number(value) }, editing_id: group.id })
      setLinkedId(value)
      const nm = experts.find(e => String(e.id) === String(value))?.name
      setLinkMsg({ ok: true, text: nm ? `Saved — Tax 6 steps 1-3 under ${nm} are Tax Team steps (step 4 is always VFOS).` : 'Saved — no linked specialist; Tax 6 steps 3-4 are VFOS steps under every specialist.' })
    } catch (err) { setLinkMsg({ ok: false, text: err.message }) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return
    setBusy(true); setMsg('')
    try {
      await callApi('delete_tax_planning_group', { group_id: group.id })
      await onSaved()
    } catch (err) { setMsgType('error'); setMsg(err.message) }
    finally { setBusy(false) }
  }

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', maxWidth: '340px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        {editing
          ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') saveName() }} />
              <button onClick={saveName} disabled={busy} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>Save</button>
              <button onClick={() => { setEditing(false); setName(group.name || '') }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          : <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{group.name}</div>}
        {connected
          ? <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-success-text)', background: 'rgba(27,146,84,0.12)', border: '1px solid rgba(27,146,84,0.3)', borderRadius: '999px', padding: '4px 12px' }}>Payout connected</span>
          : <span style={{ fontSize: '12px', fontWeight: 600, color: '#b26a00', background: 'rgba(224,103,23,0.10)', border: '1px solid rgba(224,103,23,0.3)', borderRadius: '999px', padding: '4px 12px' }}>No payout account</span>}
      </div>

      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Payout account</div>
      {connected && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>Stripe account: <code style={{ color: 'var(--vfo-ink)' }}>{connected}</code></div>}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Company contact email</label>
        <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="payments@company.com" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={setUp} disabled={requesting}
          style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: requesting ? 'not-allowed' : 'pointer', opacity: requesting ? 0.6 : 1 }}>
          {requesting ? 'Working…' : connected ? 'Resend Setup Email' : 'Set Up Payment Details'}
        </button>
        {!editing && <button onClick={() => setEditing(true)} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Edit Name</button>}
        <button onClick={remove} disabled={busy} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontSize: '13px', fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer' }}>Delete</button>
      </div>
      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>Assessment</div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: busy ? 'not-allowed' : 'pointer', maxWidth: '640px' }}>
        <input type="checkbox" checked={deliversPdf} disabled={busy} onChange={e => saveDeliversPdf(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'inherit' }} />
        <span>
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)' }}>Delivers its own Tax Assessment PDF</span>
          <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.5 }}>
            When on, this group's planners are asked to upload their Tax Assessment PDF into the client's vault instead of completing the assess form. Their first upload hands the step to the client's PF, who enters its numbers.
          </span>
        </span>
      </label>
      {pdfMsg.text && <p style={{ color: pdfMsg.ok ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', margin: '8px 0 0 26px' }}>{pdfMsg.text}</p>}
      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>Linked specialist</div>
      <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '10px', lineHeight: 1.5, maxWidth: '640px' }}>
        The VFO specialist who is part of this group. On this group's plans, Tax 6 steps 1-3 under this specialist are Tax Team steps. Under any other specialist, "Specialist confirms VFOS Gross Rev" is a VFOS step (the member's on a Direct plan). "PC confirms receipt of VFOS Gross Rev" is always a VFOS step.
      </div>
      <select value={linkedId === null ? '' : String(linkedId)} disabled={busy} onChange={e => saveLinked(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', minWidth: '260px', cursor: busy ? 'not-allowed' : 'pointer' }}>
        <option value="">None</option>
        {linkedId !== '' && linkedId != null && !experts.some(e => String(e.id) === String(linkedId)) && <option value={String(linkedId)}>Specialist #{linkedId}</option>}
        {experts.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
      </select>
      {linkMsg.text && <p style={{ color: linkMsg.ok ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', margin: '8px 0 0' }}>{linkMsg.text}</p>}
      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>Logo</div>
      <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>Shown on this group's clients' ROI presentations, on a small white badge. PNG, JPG or WebP; empty space around the logo is trimmed automatically.</div>
      <GroupLogoPreview src={logoPending?.dataUrl || logoUrl(group.logo_image)} />
      {logoPending && <div style={{ fontSize: '12.5px', color: '#b08d26', fontWeight: 500, marginTop: '8px' }}>Preview of the new logo. Save it to use it.</div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '12px 0 0' }}>
        <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} style={{ display: 'none' }} />
        {logoPending ? (
          <>
            <button onClick={() => saveLogo({ logo_base64: logoPending.base64 }, 'Logo saved.')} disabled={logoBusy} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: logoBusy ? 'wait' : 'pointer' }}>{logoBusy ? 'Saving…' : 'Save logo'}</button>
            <button onClick={() => setLogoPending(null)} disabled={logoBusy} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => logoFileRef.current?.click()} disabled={logoBusy} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{group.logo_image ? 'Replace logo' : 'Upload logo'}</button>
            {group.logo_image && <button onClick={() => { if (window.confirm(`Remove the logo for "${group.name}"?`)) saveLogo({ remove_logo: true }, 'Logo removed.') }} disabled={logoBusy} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Remove logo</button>}
          </>
        )}
      </div>
      {msg && <p style={{ color: msgType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{msg}</p>}
    </div>
  )
}
