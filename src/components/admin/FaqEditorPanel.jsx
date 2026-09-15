import { useEffect, useRef, useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import { isWistiaLink, wistiaEmbedUrl } from '../shared/wistia'

// The FAQ Editor tab — grantable per admin (allowed_tabs 'faq_editor'). Backs
// the member portal's Help button: every row here is a question, with an
// answer, a Wistia video, a PDF document, or any mix. Categories are optional
// headings the Help panel groups questions under; they can be added and
// removed at any time — removing one leaves its FAQs in place, uncategorised.
// The backend (faq_manage) is the real rule keeper; the checks in this panel
// just keep the obvious mistakes off the wire.

const EMPTY = { question: '', answer: '', video_url: '', category_id: '', active: true, document_path: '', document_name: '' }
const UNCATEGORISED_LABEL = 'Uncategorised'

async function uploadPdf(file) {
  const d = await callApi('faq_document_upload_url', { filename: file.name })
  if (!d.signed_url) throw new Error(d.error || 'Could not start upload')
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file)
  const put = await fetch(d.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
  if (!put.ok) throw new Error('Upload failed')
  return { document_path: d.path, document_name: d.document_name || file.name }
}

export default function FaqEditorPanel() {
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
  const fileRef = useRef(null)
  const myEmail = (getSession()?.email || '').toLowerCase()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await callApi('faq_load')
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
    })
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        mode: 'save', id: editingId || undefined,
        question: form.question, answer: form.answer, video_url: form.video_url,
        category_id: form.category_id || null, active: form.active,
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
      mode: 'save', id: item.id, question: item.question, answer: item.answer || '', video_url: item.video_url || '',
      category_id: item.category_id ?? null, active: item.active,
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
      await callApi('faq_manage', { mode: 'category_save', name })
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
    const note = n ? `\n\n${n} FAQ${n === 1 ? '' : 's'} in it will be kept and become uncategorised.` : ''
    if (!window.confirm(`Delete the category "${cat.name}"?${note}`)) return
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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-faint)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px', display: 'block' }
  const smallBtn = (color, border) => ({ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color, fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })
  const chip = (color) => ({ fontSize: '11px', color, fontWeight: 600, marginLeft: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' })
  const primaryBtn = (disabled) => ({ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1, fontFamily: 'Inter, sans-serif' })

  const previewUrl = form.video_url.trim() && isWistiaLink(form.video_url) ? wistiaEmbedUrl(form.video_url) : null

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 6px' }}>FAQ Editor</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Everything here appears in the Help panel (the blue button bottom-right) on the member side of the portal, grouped under the categories below. A question is required; add an answer, a Wistia video, a PDF document, or any mix.
      </p>

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Categories</div>
        <p style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '0 0 12px' }}>Members see FAQs grouped under these headings, in this order. Deleting a category keeps its FAQs — they just become uncategorised.</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCategory() }} placeholder="New category, e.g. Getting started" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={addCategory} disabled={catBusy} style={{ ...primaryBtn(catBusy), whiteSpace: 'nowrap' }}>Add category</button>
        </div>
        {categories.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', margin: 0 }}>No categories yet — every FAQ shows in one list until you add some.</p>}
        {categories.map((cat, index) => {
          const count = items.filter(i => i.category_id === cat.id).length
          const editing = catEditId === cat.id
          return (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                <button onClick={() => moveCategory(index, -1)} disabled={index === 0 || catBusy} title="Move up" style={{ ...smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)'), padding: '1px 8px', opacity: index === 0 ? 0.35 : 1 }}>▲</button>
                <button onClick={() => moveCategory(index, 1)} disabled={index === categories.length - 1 || catBusy} title="Move down" style={{ ...smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)'), padding: '1px 8px', opacity: index === categories.length - 1 ? 0.35 : 1 }}>▼</button>
              </div>
              {editing ? (
                <input autoFocus value={catEditName} onChange={e => setCatEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameCategory(cat); if (e.key === 'Escape') setCatEditId(null) }} style={{ ...inputStyle, flex: 1, padding: '6px 10px' }} />
              ) : (
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }}>
                  {cat.name}
                  <span style={{ fontSize: '12px', color: 'var(--vfo-faint)', fontWeight: 400, marginLeft: '8px' }}>{count} FAQ{count === 1 ? '' : 's'}</span>
                </span>
              )}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {editing ? (
                  <>
                    <button onClick={() => renameCategory(cat)} disabled={catBusy} style={smallBtn('#125ecc', 'rgba(18,94,204,0.35)')}>Save</button>
                    <button onClick={() => setCatEditId(null)} disabled={catBusy} style={smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)')}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); setCatError('') }} disabled={catBusy} style={smallBtn('#125ecc', 'rgba(18,94,204,0.35)')}>Rename</button>
                )}
                <button onClick={() => deleteCategory(cat)} disabled={catBusy} style={smallBtn('#e74c3c', 'rgba(231,76,60,0.3)')}>Delete</button>
              </div>
            </div>
          )
        })}
        {catError && <p style={{ color: '#d93025', fontSize: '13px', marginTop: '12px', marginBottom: 0 }}>{catError}</p>}
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          {editingId ? 'Edit FAQ' : 'Add FAQ'}
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Question (required)</label>
          <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="e.g. How do I add a client?" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Category</label>
          <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={inputStyle}>
            <option value="">{UNCATEGORISED_LABEL}</option>
            {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Answer</label>
          <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={5} placeholder="Plain text. Blank lines start a new paragraph." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Wistia video link</label>
          <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://elitert.wistia.com/medias/abc123defg" style={inputStyle} />
          {form.video_url.trim() && !isWistiaLink(form.video_url) && (
            <div style={{ fontSize: '12px', color: '#d93025', marginTop: '6px' }}>That does not look like a Wistia link.</div>
          )}
          {form.video_url.trim() && isWistiaLink(form.video_url) && !previewUrl && (
            <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '6px' }}>Share link — the video will be looked up when you save and can be previewed in the list below.</div>
          )}
          {previewUrl && (
            <div style={{ marginTop: '12px', maxWidth: '420px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--vfo-border)' }}>
              <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                <iframe src={previewUrl} title="Video preview" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Document (PDF)</label>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => setPendingFile(e.target.files?.[0] || null)} style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }} />
          {pendingFile && (
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '6px' }}>
              {pendingFile.name} will be uploaded when you save{form.document_path ? ' and will replace the current document' : ''}.
            </div>
          )}
          {!pendingFile && form.document_path && (
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Current document: <strong>{form.document_name || 'document.pdf'}</strong></span>
              <button onClick={() => setForm({ ...form, document_path: '', document_name: '' })} style={smallBtn('#e74c3c', 'rgba(231,76,60,0.3)')}>Remove document</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ accentColor: '#125ecc', cursor: 'pointer' }} />
            Visible to members
          </label>
          <div style={{ flex: 1 }} />
          {editingId && (
            <button onClick={cancelEdit} disabled={saving} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Cancel</button>
          )}
          <button onClick={save} disabled={saving} style={primaryBtn(saving)}>
            {saving ? (pendingFile ? 'Uploading…' : 'Saving…') : editingId ? 'Save changes' : 'Add FAQ'}
          </button>
        </div>
        {error && <p style={{ color: '#d93025', fontSize: '13px', marginTop: '12px', marginBottom: 0 }}>{error}</p>}
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Current FAQs</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{items.length} item{items.length === 1 ? '' : 's'} · {items.filter(i => i.active).length} visible</div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '0 0 12px' }}>Members see them in this order within each category. Use the arrows to reorder.</p>
        {loading && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Loading…</p>}
        {!loading && items.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No FAQs yet — add the first one above.</p>}
        {items.map((item, index) => {
          const busy = busyId === item.id
          const embed = item.video_url ? wistiaEmbedUrl(item.video_url) : null
          const cat = categoryName(item.category_id)
          return (
            <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--vfo-tint)', opacity: item.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button onClick={() => move(index, -1)} disabled={index === 0 || busy} title="Move up" style={{ ...smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)'), padding: '2px 8px', opacity: index === 0 ? 0.35 : 1 }}>▲</button>
                  <button onClick={() => move(index, 1)} disabled={index === items.length - 1 || busy} title="Move down" style={{ ...smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)'), padding: '2px 8px', opacity: index === items.length - 1 ? 0.35 : 1 }}>▼</button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '4px' }}>
                    {item.question}
                    {!item.active && <span style={chip('var(--vfo-faint)')}>Hidden</span>}
                    {embed && <span style={chip('#0a85e8')}>Video</span>}
                    {item.document_url && <span style={chip('#1b9254')}>Document</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: cat ? '#125ecc' : 'var(--vfo-faint)', fontWeight: 600, marginBottom: '4px' }}>{cat || UNCATEGORISED_LABEL}</div>
                  {item.answer && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.answer}</div>}
                  {embed && (
                    <div style={{ marginTop: '6px' }}>
                      <button onClick={() => setPreviewId(previewId === item.id ? null : item.id)} style={smallBtn('#0095ff', 'rgba(0,149,255,0.4)')}>
                        {previewId === item.id ? 'Hide video' : '▶ Preview video'}
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
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => setDocPreviewId(docPreviewId === item.id ? null : item.id)} style={smallBtn('#1b9254', 'rgba(27,146,84,0.4)')}>
                        {docPreviewId === item.id ? 'Hide document' : 'Preview document'}
                      </button>
                      <a href={item.document_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{item.document_name || 'document.pdf'} ↗</a>
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
                      {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleDateString()}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => startEdit(item)} disabled={busy} style={smallBtn('#125ecc', 'rgba(18,94,204,0.35)')}>Edit</button>
                  <button onClick={() => toggleActive(item)} disabled={busy} style={smallBtn('var(--vfo-muted)', 'var(--vfo-border-mid)')}>{item.active ? 'Hide' : 'Show'}</button>
                  <button onClick={() => remove(item)} disabled={busy} style={smallBtn('#e74c3c', 'rgba(231,76,60,0.3)')}>Delete</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
