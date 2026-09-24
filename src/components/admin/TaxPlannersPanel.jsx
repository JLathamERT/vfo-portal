import { useState, useEffect, useRef } from 'react'
import { callApi } from '../../lib/api'
import { fileToLogoPng, logoUrl } from '../shared/logoPng'
import { fileSizeError } from '../../lib/fileUpload'
import VaultSections from '../shared/VaultSections'
import ImageCropModal from './ImageCropModal'
import ListFilterButton, { matchesFilter, sortByJoin, SortSelect } from './ListFilterButton'
import TaxPlannerKpiPanel from './TaxPlannerKpiPanel'
import { DirectoryListSkeleton } from '../shared/Skeleton'
import { TrackHero, HeroAvatar, ListHeader } from '../shared/TrackKit'
import { FeatureTabDropdown } from './MembersPanel'
import SendSetupEmailButton from './SendSetupEmailButton'
import { ClientNameLink } from '../shared/personLinks'
import { formatDate } from '../../lib/dates'

const STATUS_COLORS = { Active: '#1b9254', Lost: '#e74c3c', Removed: 'var(--vfo-muted)' }
const HEADSHOT_SUPABASE = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'

const fullName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(unnamed)'

// Rows predating the Team Member role carry no planner_role — they are planners.
const PLANNER_ROLES = ['Tax Planner', 'Team Member']
const roleOf = (p) => p?.planner_role || 'Tax Planner'

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

  async function load() {
    setLoading(true)
    try {
      const d = await callApi('tax_planners_load')
      const list = d.tax_planners || []
      setPlanners(list)
      setGroups(d.tax_planning_groups || [])
      setLoadError('')
      return list
    } catch (e) {
      setLoadError(e.message || 'Could not load tax planners.')
      return null
    } finally {
      setLoading(false)
    }
  }
  const groupNames = groups.map(g => g.name)
  useEffect(() => { load() }, [])

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
      const list = await load()
      if (which === 'add') {
        clearAddForm()
        showStatus('add', 'success', 'Tax planner added!')
      } else {
        const updated = (list || []).find(p => p.id === editingId)
        if (updated) setSelectedPlanner(updated)
        showStatus('edit', 'success', 'Changes saved!')
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

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const fieldStyle = { marginBottom: '16px' }
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
    const sectionHeader = { fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '18px', borderBottom: '1px solid var(--vfo-border)', paddingBottom: '12px' }

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

    return (
      <div>
        {/* ---- Profile & Identity ---- */}
        <div style={sectionStyle}>
          <div style={sectionHeader}>Profile &amp; Identity</div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Headshot</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                onClick={() => { if (preview) setCropState({ which, src: preview }) }}
                title={preview ? 'Click to adjust / zoom' : ''}
                style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: preview ? 'pointer' : 'default', flexShrink: 0 }}>
                {preview ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--vfo-muted)', fontSize: '24px' }}>?</span>}
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

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={form.first_name} onChange={e => upd('first_name', e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={form.last_name} onChange={e => upd('last_name', e.target.value)} style={inputStyle} /></div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input value={form.email} onChange={e => upd('email', e.target.value)} type="email" placeholder="planner@example.com" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => upd('status', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                {['Active', 'Lost', 'Removed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {full && (form.status === 'Lost' || form.status === 'Removed') && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Leave Date</label>
                <input type="date" value={form.leave_date} onChange={e => upd('leave_date', e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>

          {full && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Join Date</label>
              <input type="date" value={form.join_date} onChange={e => upd('join_date', e.target.value)} style={{ ...inputStyle, width: '200px' }} />
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle}>Member Type</label>
            <select value={form.planner_role || 'Tax Planner'} onChange={e => upd('planner_role', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
              {PLANNER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Partnership</label>
            <select value={form.member_type} onChange={e => upd('member_type', e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }} disabled={groupNames.length === 0}>
              <option value="">-- Select group --</option>
              {groupNames.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {groupNames.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '6px' }}>No Tax Planning Groups yet. Add one under Add Tax Planner → Add Tax Planning Group.</p>}
          </div>

          {form.planner_role !== 'Team Member' && (
          <div style={{ ...fieldStyle, marginBottom: 0 }}>
            <label style={labelStyle}>Certifications <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vfo-faint)' }}>— professional designations shown after the name (e.g. EA, CPA)</span></label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={certInput} onChange={e => setCertInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCert() } }} placeholder="e.g. EA" style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={addCert} style={{ padding: '10px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>Add</button>
            </div>
            {certs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {certs.map((c, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', border: '1px solid rgba(0,149,255,0.25)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontSize: '12px', fontWeight: 600 }}>
                    {c}
                    <span onClick={() => removeCert(i)} title="Remove" style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.7 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          )}
        </div>{/* end Profile & Identity card */}
      </div>
    )
  }

  // ---- Section: Tax Planner KPIs ----
  if (section === 'tax_planner_kpis') {
    if (loading) return <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}><DirectoryListSkeleton /></div>
    return <TaxPlannerKpiPanel planners={planners} groups={groups} />
  }

  // ---- Section: Tax Planning Partners (group list + connect) ----
  if (section === 'tax_planning_partners') {
    if (loading) return <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}><DirectoryListSkeleton /></div>
    return <TaxPlanningPartnersPanel groups={groups} loadError={loadError} onSaved={load} />
  }

  // ---- Section: Add Tax Planner ----
  // Two-section add (mirrors Strategic Members' Add view): pill toggle between
  // the person form and the one-field group-creation form.
  if (section === 'add_tax_planner') {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {cropState && <ImageCropModal src={cropState.src} onApply={applyCrop} onCancel={() => setCropState(null)} />}

      {loading && <DirectoryListSkeleton />}
      {!loading && loadError && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>{loadError}</div>
      )}

      {!loading && !selectedPlanner && (() => {
        // Filter (name / email / member_type match — email is searchable but not
        // shown in the row) then sort, exactly once, so the header count and the
        // empty-state agree with what's rendered.
        const filteredPlanners = sortByJoin(
          planners
            .filter(p => !search || fullName(p).toLowerCase().includes(search) || (p.email || '').toLowerCase().includes(search) || (p.member_type || '').toLowerCase().includes(search) || roleOf(p).toLowerCase().includes(search))
            .filter(p => matchesFilter(p, listFilterGroups, listFilter)),
          listSort
        )
        return (
        <>
          {editStatus && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: editStatusType === 'success' ? 'rgba(27,146,84,0.1)' : 'rgba(231,76,60,0.1)', color: editStatusType === 'success' ? '#1b9254' : '#e74c3c', border: `1px solid ${editStatusType === 'success' ? 'rgba(27,146,84,0.3)' : 'rgba(231,76,60,0.3)'}` }}>{editStatus}</div>
          )}
          <ListHeader title="Tax Planners" count={filteredPlanners.length} />
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input type="search" name="search" autoComplete="off" placeholder="Search by name or type..." style={inputStyle} onChange={e => setSearch(e.target.value.toLowerCase())} value={search} />
            <ListFilterButton groups={listFilterGroups} value={listFilter} onChange={setListFilter} />
            <SortSelect value={listSort} onChange={setListSort} />
          </div>
          <div>
            {filteredPlanners.map(planner => {
              const plans = Number(planner.allocation_count) || 0
              return (
              <div key={planner.id}
                onClick={() => handleSelect(planner)}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', marginBottom: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(20,45,95,0.04)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,149,255,0.4)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vfo-border-soft)'}>
                <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, width: '220px', flexShrink: 0 }}>{plannerDisplayName(planner)}</span>
                <span style={{ width: '90px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: planner.status === 'Active' ? '#1b9254' : planner.status === 'Lost' ? '#e74c3c' : 'var(--vfo-faint)' }} />
                  {planner.status || '—'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '160px', flexShrink: 0 }}>{planner.member_type || '—'}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{roleOf(planner) === 'Team Member' ? 'Team Member' : `${plans} plan${plans === 1 ? '' : 's'}`}</span>
              </div>
              )
            })}
            {filteredPlanners.length === 0 && !loadError && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13.5px', background: 'var(--vfo-tint)', border: '1px dashed var(--vfo-border-chip)', borderRadius: '12px' }}>No tax planners match your search.</div>
            )}
          </div>
        </>
        )
      })()}

      {!loading && selectedPlanner && (
        <div>
          <button onClick={backToList} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to list</button>

          <TrackHero
            eyebrow="Tax Planner"
            title={plannerDisplayName(selectedPlanner)}
            avatar={<HeroAvatar src={selectedPlanner.headshot_image ? HEADSHOT_SUPABASE + encodeURIComponent(selectedPlanner.headshot_image) : null} name={fullName(selectedPlanner)} />}
            meta={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[selectedPlanner.status] || '#1b9254', flexShrink: 0 }} />
                {selectedPlanner.status || 'Active'}
              </span>
            }
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
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => submit('edit')}
                  style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                  Save Changes
                </button>
                <button onClick={backToList}
                  style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>
                  Cancel
                </button>
                {editStatus && <span style={{ alignSelf: 'center', color: editStatusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', fontWeight: 600 }}>{editStatus}</span>}
              </div>
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
            <div style={sectionStyle}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Tax Planner Login</div>
              <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{selectedPlanner.email ? <>Send a setup email to <strong>{selectedPlanner.email}</strong> so they can set their own portal passcode.</> : <>Add an email in Edit Profile first, then send the setup email.</>}</p>
              {selectedPlanner.email && <SendSetupEmailButton loginType="tax_planner" subjectId={selectedPlanner.id} hint="Drafts a Gmail with a secure link. The tax planner sets their own passcode." />}
            </div>
            <div style={{ ...sectionStyle, border: '1px solid rgba(231,76,60,0.3)' }}>
              <div style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Danger Zone</div>
              <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>Permanently delete this tax planner. This cannot be undone, and is blocked while they are allocated to any tax plan.</p>
              <button onClick={deletePlanner} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(231,76,60,0.4)', background: 'transparent', color: '#e74c3c', fontWeight: 500, fontSize: '14px', cursor: 'pointer' }}>Delete Tax Planner</button>
              {deleteMsg && <p style={{ fontSize: '13px', color: '#d93025', fontWeight: 600, marginTop: '12px' }}>{deleteMsg}</p>}
            </div>
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
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
  const fieldLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }
  const fieldValue = { fontSize: '15px', color: 'var(--vfo-ink)', fontWeight: 600, marginTop: '5px' }

  const allocations = Number(planner.allocation_count) || 0
  const hasLeaveDate = planner.status === 'Lost' || planner.status === 'Removed' || !!planner.leave_date

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: '300px', display: 'flex' }}>
          <div style={{ ...sectionStyle, flex: 1 }}>
            <div style={cardTitle}>Tax Planner Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px 24px' }}>
              <div><div style={fieldLabel}>Email</div><div style={{ ...fieldValue, wordBreak: 'break-word' }}>{planner.email || '—'}</div></div>
              <div><div style={fieldLabel}>Status</div><div style={fieldValue}>{planner.status || 'Active'}</div></div>
              <div><div style={fieldLabel}>Join Date</div><div style={fieldValue}>{planner.join_date ? formatDate(planner.join_date) : '—'}</div></div>
              {hasLeaveDate && <div><div style={fieldLabel}>Leave Date</div><div style={fieldValue}>{planner.leave_date ? formatDate(planner.leave_date) : '—'}</div></div>}
              <div><div style={fieldLabel}>Member Type</div><div style={fieldValue}>{roleOf(planner)}</div></div>
              <div><div style={fieldLabel}>Partnership</div><div style={fieldValue}>{planner.member_type || '—'}</div></div>
              <div><div style={fieldLabel}>Allocations</div><div style={fieldValue}>{allocations} tax plan{allocations === 1 ? '' : 's'}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  return <VaultSections actions={TAX_PLANNER_VAULT_ACTIONS} params={{ planner_id: plannerId }} sections={TAX_PLANNER_VAULT_SECTIONS} />
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
function fmtDate(d) {
  if (!d) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function HalfCell({ amount, paid, completedAt, receipt }) {
  const date = fmtDate(completedAt)
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
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    callApi('tax_planner_payments_load', { planner_id: plannerId })
      .then(d => { if (alive) setRows(d.rows || []) })
      .catch(e => { if (alive) setError(e?.message || 'Failed to load payments') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [plannerId])

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px' }
  const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 16px', fontFamily: 'Inter, sans-serif' }
  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a89a8', borderBottom: '1px solid var(--vfo-border)', whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: '13px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)', verticalAlign: 'top' }

  if (loading) {
    return <div style={cardStyle}><h3 style={titleStyle}>Payments</h3><div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading…</div></div>
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
                <tr key={r.plan_id}>
                  <td style={td}>
                    <div><ClientNameLink clientId={r.client_id} tab="tax" style={{ fontWeight: 600 }}>{r.client_name || `Client ${r.client_id}`}</ClientNameLink></div>
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
function TaxPlannerClientsTab({ plannerId }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    callApi('tax_planner_clients_load', { planner_id: plannerId })
      .then(d => { if (alive) setRows(d.clients || []) })
      .catch(e => { if (alive) setError(e?.message || 'Failed to load clients') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [plannerId])

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px' }
  const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 16px', fontFamily: 'Inter, sans-serif' }
  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a89a8', borderBottom: '1px solid var(--vfo-border)', whiteSpace: 'nowrap' }
  const td = { padding: '12px', fontSize: '13px', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)', verticalAlign: 'top' }

  if (loading) {
    return <div style={cardStyle}><h3 style={titleStyle}>Clients</h3><div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading…</div></div>
  }
  if (error) {
    return <div style={cardStyle}><h3 style={titleStyle}>Clients</h3><div style={{ marginTop: '12px', padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>{error}</div></div>
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
  }

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>Clients</h3>
      {byClient.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>No clients assigned.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif' }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={th}>Client Ref</th>
                <th style={th}>Member</th>
                <th style={th}>Program</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map(c => (
                <tr key={c.client_id}>
                  <td style={td}>
                    <ClientNameLink clientId={c.client_id} program={c.program_id || 1} tab="tax" style={{ fontWeight: 600 }}>{c.client_name || `Client ${c.client_id}`}</ClientNameLink>
                  </td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{c.client_ref || '—'}</td>
                  <td style={td}>{c.member_name || '—'}</td>
                  <td style={{ ...td, color: 'var(--vfo-muted)' }}>{c.programs.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// The Add view has two inner tabs (mirrors Strategic Members' AddStrategicSection):
// the person form + the one-field group-creation form.
function AddTaxPlannerSection({ addTab, setAddTab, groupNames, plannerForm, submit, clearAddForm, addStatus, addStatusType, onGroupsChange }) {
  const pill = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '6px' })
  return (
    <div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-ink)', marginBottom: '18px' }}>Add Tax Planner</div>
      <div style={{ display: 'flex', marginBottom: '18px' }}>
        <button style={pill(addTab === 'planner')} onClick={() => setAddTab('planner')}>Add Tax Planner</button>
        <button style={pill(addTab === 'group')} onClick={() => setAddTab('group')}>Add Tax Planning Group</button>
      </div>

      {addTab === 'planner' && (
        <div>
          {plannerForm('add', false)}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => submit('add')}
              style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
              Add Tax Planner
            </button>
            <button onClick={clearAddForm}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer' }}>
              Clear Form
            </button>
            {addStatus && <span style={{ alignSelf: 'center', color: addStatusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', fontWeight: 600 }}>{addStatus}</span>}
          </div>
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

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

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
    <div style={sectionStyle}>
      <div style={{ marginBottom: '16px', maxWidth: '420px' }}>
        <label style={labelStyle}>Tax Planning Group Name *</label>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Innovation Consulting Group" style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      </div>
      <button onClick={submit} disabled={loading} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Creating...' : 'Create Group'}
      </button>
      {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

// Tax Planning Partners — the "companies" a tax planner belongs to. Each group has
// a group-level Stripe Connect payout account (the planner's revenue share pays out
// to it). Cloned from StrategicPartnersPanel's list + PartnerCard idiom, with group
// name edit + delete added (backend save_tax_planning_group / delete_tax_planning_group).
function TaxPlanningPartnersPanel({ groups, loadError, onSaved }) {
  if (loadError) return <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}><p style={{ color: '#d93025', fontSize: '13px' }}>{loadError}</p></div>
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>Tax Planning Partners</div>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '4px' }}>
          Each partner group is a Partnership option for tax planners. Set up the group's payout account here — the tax planner revenue share transfers to it automatically.
        </div>
      </div>
      {groups.length === 0 && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,149,255,0.07)', border: '1px solid rgba(0,149,255,0.22)', color: 'var(--vfo-ink)', fontSize: '13px' }}>
          No Tax Planning Groups yet. Add one under Add Tax Planner → Add Tax Planning Group.
        </div>
      )}
      {groups.map(g => <TaxPartnerCard key={g.id} group={g} onSaved={onSaved} />)}
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

function TaxPartnerCard({ group, onSaved }) {
  const [requesting, setRequesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name || '')
  const [contactEmail, setContactEmail] = useState(group.contact_email || '')
  const [busy, setBusy] = useState(false)
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
          ? <span style={{ fontSize: '12px', fontWeight: 600, color: '#1b9254', background: 'rgba(27,146,84,0.12)', border: '1px solid rgba(27,146,84,0.3)', borderRadius: '999px', padding: '4px 12px' }}>Payout connected</span>
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
      <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>Logo</div>
      <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>Shown on this group's clients' ROI presentations, on a small white badge. PNG or JPG; empty space around the logo is trimmed automatically.</div>
      <GroupLogoPreview src={logoPending?.dataUrl || logoUrl(group.logo_image)} />
      {logoPending && <div style={{ fontSize: '12.5px', color: '#b08d26', fontWeight: 500, marginTop: '8px' }}>Preview of the new logo. Save it to use it.</div>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '12px 0 0' }}>
        <input ref={logoFileRef} type="file" accept="image/png,image/jpeg" onChange={pickLogo} style={{ display: 'none' }} />
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
      {msg && <p style={{ color: msgType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{msg}</p>}
    </div>
  )
}
