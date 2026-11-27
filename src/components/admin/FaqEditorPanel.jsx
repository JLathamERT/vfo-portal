import { useEffect, useRef, useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import { isWistiaLink, wistiaEmbedUrl } from '../shared/wistia'
import { Skeleton } from '../shared/Skeleton'
import { btnPrimary, btnSecondary, btnDanger, btnOutline, btnStep, BTN_SMALL, btnState } from '../shared/buttonStyles'
import { formLabel, formInput } from '../shared/ProfileKit'
import { listSearchStyle } from '../shared/ListTable'

// The FAQ Editor tab — open to every admin (2026-11-25). Laid out like Growth
// Credits and Events (2026-11-27): a header card, then one sub-tab per portal.
// Each portal has its own Help (?) button and its own FAQs and categories
// (faq_items / faq_categories `audience`): Member Portal feeds the member
// portal's button, Client Portal the client portal's. The two editors are the
// same screen. Every row is a question, with an answer, a Wistia video, a PDF
// document, or any mix. Categories are optional headings the Help panel groups
// questions under; removing one leaves its FAQs in place, uncategorised.
// The backend (faq_manage) is the real rule keeper; the checks here just keep
// the obvious mistakes off the wire.

const NAVY = '#002973'
const BLUE = '#125ecc'
// `tiers`: which tiers of the portal an FAQ can be shown in (faq_items.portal_tiers,
// 2026-11-27). A new FAQ starts with all of them; untick to narrow it.
const PORTALS = [
  { key: 'member', label: 'Member Portal', people: 'members', tiers: [{ key: 'tier1', label: 'Tier 1' }, { key: 'tier2', label: 'Tier 2' }, { key: 'tier3', label: 'Tier 3' }] },
  { key: 'client', label: 'Client Portal', people: 'clients', tiers: [{ key: 'basic', label: 'Basic' }, { key: 'premium', label: 'Premium' }] },
]
const PORTAL_KEY = 'faqEditorPortal'

const emptyForm = (tiers) => ({ question: '', answer: '', video_url: '', category_id: '', active: true, document_path: '', document_name: '', portal_tiers: tiers.map(t => t.key) })
const UNCATEGORISED_LABEL = 'Uncategorised'

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '22px', marginBottom: '20px' }
const cardTitle = { fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 14px', paddingBottom: '8px', borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }
const note = { fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 14px', lineHeight: 1.5 }
const small = (style, disabled) => btnState({ ...style, ...BTN_SMALL }, disabled)
const flag = (color) => ({ fontSize: '11px', color, fontWeight: 600, marginLeft: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' })

async function uploadPdf(file) {
  const d = await callApi('faq_document_upload_url', { filename: file.name })
  if (!d.signed_url) throw new Error(d.error || 'Could not start upload')
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file)
  const put = await fetch(d.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
  if (!put.ok) throw new Error('Upload failed')
  return { document_path: d.path, document_name: d.document_name || file.name }
}

export default function FaqEditorPanel() {
  const [portal, setPortal] = useState(() => (sessionStorage.getItem(PORTAL_KEY) === 'client' ? 'client' : 'member'))
  function pick(key) { setPortal(key); sessionStorage.setItem(PORTAL_KEY, key) }
  const pill = (on) => ({ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (on ? 'transparent' : 'var(--vfo-border-strong)'), background: on ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: on ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })
  const current = PORTALS.find(p => p.key === portal)

  return (
    <div style={{ padding: '24px', maxWidth: '1340px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={card}>
        <p style={{ fontSize: '10.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 4px' }}>Admin</p>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>FAQ Editor</h2>
        <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Each portal has its own Help panel (the blue ? button bottom-right) and its own FAQs. A question is required; add an answer, a Wistia video, a PDF document, or any mix.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {PORTALS.map(p => <button key={p.key} type="button" onClick={() => pick(p.key)} style={pill(portal === p.key)}>{p.label}</button>)}
      </div>

      <FaqPortalEditor key={portal} audience={portal} people={current.people} portalLabel={current.label} tiers={current.tiers} />
    </div>
  )
}

function FaqPortalEditor({ audience, people, portalLabel, tiers }) {
  const EMPTY = emptyForm(tiers)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [pendingFile, setPendingFile] = useState(null)   // a PDF chosen but not yet uploaded
  const [editingId, setEditingId] = useState(null)   // null = the "Add" form
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [previewId, setPreviewId] = useState(null)   // FAQ id whose video is expanded
  const [docPreviewId, setDocPreviewId] = useState(null)   // FAQ id whose document is expanded
  const [newCategory, setNewCategory] = useState('')
  const [catEditId, setCatEditId] = useState(null)
  const [catEditName, setCatEditName] = useState('')
  const [catError, setCatError] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [search, setSearch] = useState('')
  const fileRef = useRef(null)
  const formRef = useRef(null)
  const myEmail = (getSession()?.email || '').toLowerCase()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await callApi('faq_load', { audience })
      setItems(data.items || [])
      setCategories(data.categories || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({
      question: item.question || '', answer: item.answer || '', video_url: item.video_url || '',
      category_id: item.category_id == null ? '' : String(item.category_id), active: item.active !== false,
      document_path: item.document_path || '', document_name: item.document_name || '',
      portal_tiers: Array.isArray(item.portal_tiers) && item.portal_tiers.length ? item.portal_tiers : tiers.map(t => t.key),
    })
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setError('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setError('')
  }

  function validate() {
    if (!form.question.trim()) return 'Question is required'
    if (!form.portal_tiers.length) return 'Choose at least one place to show it'
    const hasDoc = !!form.document_path || !!pendingFile
    if (!form.answer.trim() && !form.video_url.trim() && !hasDoc) return 'Enter an answer, a video, a document, or any mix'
    if (form.video_url.trim() && !isWistiaLink(form.video_url)) return 'Video must be a Wistia link (for example https://elitert.wistia.com/medias/abc123defg)'
    if (pendingFile && !/\.pdf$/i.test(pendingFile.name)) return 'The document must be a PDF'
    return ''
  }

  async function save() {
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    try {
      let doc = { document_path: form.document_path, document_name: form.document_name }
      if (pendingFile) doc = await uploadPdf(pendingFile)
      await callApi('faq_manage', {
        mode: 'save', id: editingId || undefined, audience,
        question: form.question, answer: form.answer, video_url: form.video_url,
        category_id: form.category_id || null, active: form.active, portal_tiers: form.portal_tiers,
        document_path: doc.document_path || null, document_name: doc.document_name || null,
      })
      cancelEdit()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Re-sends the row as-is with one field flipped — the backend save is a full
  // replace, so every column rides along.
  function rowPayload(item, patch) {
    return {
      mode: 'save', id: item.id, audience, question: item.question, answer: item.answer || '', video_url: item.video_url || '',
      category_id: item.category_id ?? null, active: item.active, portal_tiers: item.portal_tiers,
      document_path: item.document_path || null, document_name: item.document_name || null,
      ...patch,
    }
  }

  async function toggleActive(item) {
    setBusyId(item.id)
    setError('')
    try {
      await callApi('faq_manage', rowPayload(item, { active: !item.active }))
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete this FAQ?\n\n"${item.question}"`)) return
    setBusyId(item.id)
    setError('')
    try {
      await callApi('faq_manage', { mode: 'delete', id: item.id })
      if (editingId === item.id) cancelEdit()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function move(index, dir) {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setItems(next)
    setError('')
    try {
      await callApi('faq_manage', { mode: 'reorder', ids: next.map(i => i.id) })
    } catch (e) {
      setError(e.message)
      await load()
    }
  }

  // ── Categories ──────────────────────────────────────────────────────────
  async function addCategory() {
    const name = newCategory.trim()
    if (!name) { setCatError('Enter a category name'); return }
    setCatBusy(true)
    setCatError('')
    try {
      await callApi('faq_manage', { mode: 'category_save', audience, name })
      setNewCategory('')
      await load()
    } catch (e) {
      setCatError(e.message)
    } finally {
      setCatBusy(false)
    }
  }

  async function renameCategory(cat) {
    const name = catEditName.trim()
    if (!name) { setCatError('Enter a category name'); return }
    if (name === cat.name) { setCatEditId(null); return }
    setCatBusy(true)
    setCatError('')
    try {
      await callApi('faq_manage', { mode: 'category_save', id: cat.id, name })
      setCatEditId(null)
      await load()
    } catch (e) {
      setCatError(e.message)
    } finally {
      setCatBusy(false)
    }
  }

  async function deleteCategory(cat) {
    const n = items.filter(i => i.category_id === cat.id).length
    const extra = n ? `\n\n${n} FAQ${n === 1 ? '' : 's'} in it will be kept and become uncategorised.` : ''
    if (!window.confirm(`Delete the category "${cat.name}"?${extra}`)) return
    setCatBusy(true)
    setCatError('')
    try {
      await callApi('faq_manage', { mode: 'category_delete', id: cat.id })
      if (form.category_id === String(cat.id)) setForm(f => ({ ...f, category_id: '' }))
      await load()
    } catch (e) {
      setCatError(e.message)
    } finally {
      setCatBusy(false)
    }
  }

  async function moveCategory(index, dir) {
    const next = [...categories]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setCategories(next)
    setCatError('')
    try {
      await callApi('faq_manage', { mode: 'category_reorder', ids: next.map(c => c.id) })
    } catch (e) {
      setCatError(e.message)
      await load()
    }
  }

  const categoryName = (id) => (id == null ? null : (categories.find(c => c.id === id)?.name || null))
  // Where an FAQ shows, in the portal's own tier order.
  const shownIn = (item) => {
    const on = tiers.filter(t => (item.portal_tiers || []).includes(t.key))
    return on.length === tiers.length ? 'All tiers' : on.map(t => t.label).join(', ') || 'Nowhere'
  }
  // Search: question, answer, category or document name. The arrows reorder the
  // whole list, so they rest while a search narrows it.
  const q = search.trim().toLowerCase()
  const shown = q
    ? items.filter(i => [i.question, i.answer, categoryName(i.category_id), i.document_name].some(v => (v || '').toLowerCase().includes(q)))
    : items
  const previewUrl = form.video_url.trim() && isWistiaLink(form.video_url) ? wistiaEmbedUrl(form.video_url) : null
  const field = { marginBottom: '14px' }
  const errorText = { color: '#d93025', fontSize: '13px', marginTop: '12px', marginBottom: 0 }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 1.6fr)', gap: '20px', alignItems: 'start' }}>
        <div style={card}>
          <div style={cardTitle}>Categories</div>
          <p style={note}>The {portalLabel} Help panel groups FAQs under these headings, in this order. Deleting a category keeps its FAQs; they just become uncategorised.</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCategory() }} placeholder="New category, e.g. Getting started" style={{ ...formInput, flex: 1 }} />
            <button type="button" onClick={addCategory} disabled={catBusy} style={btnState(btnPrimary, catBusy)}>Add</button>
          </div>
          {loading && <Skeleton width="60%" height={30} style={{ borderRadius: '8px' }} />}
          {!loading && categories.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', margin: 0 }}>No categories yet. Every FAQ shows in one list until you add some.</p>}
          {categories.map((cat, index) => {
            const count = items.filter(i => i.category_id === cat.id).length
            const editing = catEditId === cat.id
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button type="button" onClick={() => moveCategory(index, -1)} disabled={index === 0 || catBusy} title="Move up" style={btnState(btnStep, index === 0 || catBusy)}>▲</button>
                  <button type="button" onClick={() => moveCategory(index, 1)} disabled={index === categories.length - 1 || catBusy} title="Move down" style={btnState(btnStep, index === categories.length - 1 || catBusy)}>▼</button>
                </div>
                {editing ? (
                  <input autoFocus value={catEditName} onChange={e => setCatEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameCategory(cat); if (e.key === 'Escape') setCatEditId(null) }} style={{ ...formInput, flex: 1, padding: '6px 10px' }} />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }}>
                    {cat.name}
                    <span style={{ fontSize: '12px', color: 'var(--vfo-faint)', fontWeight: 400, marginLeft: '8px' }}>{count} FAQ{count === 1 ? '' : 's'}</span>
                  </span>
                )}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {editing ? (
                    <>
                      <button type="button" onClick={() => renameCategory(cat)} disabled={catBusy} style={small(btnPrimary, catBusy)}>Save</button>
                      <button type="button" onClick={() => setCatEditId(null)} disabled={catBusy} style={small(btnSecondary, catBusy)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); setCatError('') }} disabled={catBusy} style={small(btnOutline, catBusy)}>Rename</button>
                  )}
                  <button type="button" onClick={() => deleteCategory(cat)} disabled={catBusy} style={small(btnDanger, catBusy)}>Delete</button>
                </div>
              </div>
            )
          })}
          {catError && <p style={errorText}>{catError}</p>}
        </div>

        <div ref={formRef} style={{ ...card, scrollMarginTop: '90px' }}>
          <div style={cardTitle}>{editingId ? 'Edit FAQ' : 'Add FAQ'}</div>
          <div style={field}>
            <label style={formLabel}>Question *</label>
            <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder={audience === 'client' ? 'e.g. How do I upload a document?' : 'e.g. How do I add a client?'} style={formInput} />
          </div>
          <div style={field}>
            <label style={formLabel}>Category</label>
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={formInput}>
              <option value="">{UNCATEGORISED_LABEL}</option>
              {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={formLabel}>Show in *</label>
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', paddingTop: '2px' }}>
              {tiers.map(t => {
                const on = form.portal_tiers.includes(t.key)
                return (
                  <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13.5px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} style={{ accentColor: BLUE, cursor: 'pointer' }}
                      onChange={() => setForm(f => ({ ...f, portal_tiers: on ? f.portal_tiers.filter(k => k !== t.key) : tiers.map(x => x.key).filter(k => k === t.key || f.portal_tiers.includes(k)) }))} />
                    {t.label}
                  </label>
                )
              })}
            </div>
          </div>
          <div style={field}>
            <label style={formLabel}>Answer</label>
            <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={5} placeholder="Plain text. Blank lines start a new paragraph." style={{ ...formInput, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={field}>
            <label style={formLabel}>Wistia video link</label>
            <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://elitert.wistia.com/medias/abc123defg" style={formInput} />
            {form.video_url.trim() && !isWistiaLink(form.video_url) && (
              <div style={{ fontSize: '12px', color: '#d93025', marginTop: '6px' }}>That does not look like a Wistia link.</div>
            )}
            {form.video_url.trim() && isWistiaLink(form.video_url) && !previewUrl && (
              <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '6px' }}>Share link: the video is looked up when you save and can be previewed in the list below.</div>
            )}
            {previewUrl && (
              <div style={{ marginTop: '12px', maxWidth: '420px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)' }}>
                <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                  <iframe src={previewUrl} title="Video preview" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
                </div>
              </div>
            )}
          </div>
          <div style={field}>
            <label style={formLabel}>Document (PDF)</label>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => setPendingFile(e.target.files?.[0] || null)} style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }} />
            {pendingFile && (
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '6px' }}>
                {pendingFile.name} will be uploaded when you save{form.document_path ? ' and will replace the current document' : ''}.
              </div>
            )}
            {!pendingFile && form.document_path && (
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>Current document: <strong>{form.document_name || 'document.pdf'}</strong></span>
                <button type="button" onClick={() => setForm({ ...form, document_path: '', document_name: '' })} style={small(btnDanger)}>Remove document</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ accentColor: BLUE, cursor: 'pointer' }} />
              Visible to {people}
            </label>
            <div style={{ flex: 1 }} />
            {editingId && <button type="button" onClick={cancelEdit} disabled={saving} style={btnState(btnSecondary, saving)}>Cancel</button>}
            <button type="button" onClick={save} disabled={saving} style={btnState(btnPrimary, saving)}>
              {saving ? (pendingFile ? 'Uploading...' : 'Saving...') : editingId ? 'Save changes' : 'Add FAQ'}
            </button>
          </div>
          {error && <p style={errorText}>{error}</p>}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={cardTitle}>Current FAQs</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{loading ? '' : <>{items.length} item{items.length === 1 ? '' : 's'} · {items.filter(i => i.active).length} visible</>}</div>
        </div>
        <p style={note}>{people[0].toUpperCase() + people.slice(1)} see them in this order within each category. Use the arrows to reorder{q ? ' (clear the search first)' : ''}.</p>
        <input type="search" name="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search questions, answers or categories..." style={{ ...listSearchStyle, width: '100%', marginBottom: '6px' }} />
        {q && !loading && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '4px 0 2px' }}>{shown.length} of {items.length} match</div>}
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}><Skeleton width={26} height={20} style={{ borderRadius: '5px' }} /><Skeleton width={26} height={20} style={{ borderRadius: '5px' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><Skeleton width={i % 2 ? '40%' : '55%'} height={14} style={{ marginBottom: '8px' }} /><Skeleton width={110} height={11} style={{ marginBottom: '8px' }} /><Skeleton width="85%" height={12} /></div>
            <Skeleton width={170} height={24} style={{ borderRadius: '7px', flexShrink: 0 }} />
          </div>
        ))}
        {!loading && items.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: 0 }}>No FAQs yet. Add the first one above.</p>}
        {!loading && items.length > 0 && shown.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', margin: '10px 0 0' }}>No FAQs match your search.</p>}
        {shown.map(item => {
          const index = items.indexOf(item)
          const busy = busyId === item.id
          const noMove = busy || !!q
          const embed = item.video_url ? wistiaEmbedUrl(item.video_url) : null
          const cat = categoryName(item.category_id)
          return (
            <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--vfo-border-soft)', opacity: item.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || noMove} title={q ? 'Clear the search to reorder' : 'Move up'} style={btnState(btnStep, index === 0 || noMove)}>▲</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1 || noMove} title={q ? 'Clear the search to reorder' : 'Move down'} style={btnState(btnStep, index === items.length - 1 || noMove)}>▼</button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '4px' }}>
                    {item.question}
                    {!item.active && <span style={flag('var(--vfo-faint)')}>Hidden</span>}
                    {embed && <span style={flag('#0a85e8')}>Video</span>}
                    {item.document_url && <span style={flag('#1b9254')}>Document</span>}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                    <span style={{ color: cat ? 'var(--vfo-accent-text)' : 'var(--vfo-faint)' }}>{cat || UNCATEGORISED_LABEL}</span>
                    <span style={{ color: 'var(--vfo-muted)' }}> · {shownIn(item)}</span>
                  </div>
                  {item.answer && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.answer}</div>}
                  {embed && (
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" onClick={() => setPreviewId(previewId === item.id ? null : item.id)} style={small(btnOutline)}>
                        {previewId === item.id ? 'Hide video' : 'Preview video'}
                      </button>
                      {previewId === item.id && (
                        <div style={{ marginTop: '10px', maxWidth: '420px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)' }}>
                          <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                            <iframe src={embed} title={item.question} allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {item.document_url && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setDocPreviewId(docPreviewId === item.id ? null : item.id)} style={small(btnOutline)}>
                        {docPreviewId === item.id ? 'Hide document' : 'Preview document'}
                      </button>
                      <a href={item.document_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--vfo-link)' }}>{item.document_name || 'document.pdf'} ↗</a>
                      {docPreviewId === item.id && (
                        <div style={{ width: '100%', marginTop: '6px', maxWidth: '520px', height: '320px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)' }}>
                          <iframe src={item.document_url} title={item.document_name || item.question} style={{ width: '100%', height: '100%', border: 0 }} />
                        </div>
                      )}
                    </div>
                  )}
                  {(item.updated_by || item.created_by) && (
                    <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '6px' }}>
                      Last edited by {(item.updated_by || item.created_by || '').toLowerCase() === myEmail ? 'you' : (item.updated_by || item.created_by)}
                      {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => startEdit(item)} disabled={busy} style={small(btnOutline, busy)}>Edit</button>
                  <button type="button" onClick={() => toggleActive(item)} disabled={busy} style={small(btnSecondary, busy)}>{item.active ? 'Hide' : 'Show'}</button>
                  <button type="button" onClick={() => remove(item)} disabled={busy} style={small(btnDanger, busy)}>Delete</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
