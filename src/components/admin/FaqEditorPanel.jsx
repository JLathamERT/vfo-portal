import { useEffect, useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import { isWistiaLink, wistiaEmbedUrl } from '../shared/wistia'

// The FAQ Editor tab — grantable per admin (allowed_tabs 'faq_editor'). Backs
// the member portal's Help button: every row here is a question, with an
// answer, a Wistia video, or both. The backend (faq_manage) is the real rule
// keeper; the checks in this panel just keep the obvious mistakes off the wire.

const EMPTY = { question: '', answer: '', video_url: '', active: true }

export default function FaqEditorPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)   // null = the "Add" form
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const myEmail = (getSession()?.email || '').toLowerCase()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await callApi('faq_load')
      setItems(data.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({ question: item.question || '', answer: item.answer || '', video_url: item.video_url || '', active: item.active !== false })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setError('')
  }

  function validate() {
    if (!form.question.trim()) return 'Question is required'
    if (!form.answer.trim() && !form.video_url.trim()) return 'Enter an answer, a video, or both'
    if (form.video_url.trim() && !isWistiaLink(form.video_url)) return 'Video must be a Wistia link (for example https://elitert.wistia.com/medias/abc123defg)'
    return ''
  }

  async function save() {
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    try {
      await callApi('faq_manage', { mode: 'save', id: editingId || undefined, ...form })
      cancelEdit()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item) {
    setBusyId(item.id)
    setError('')
    try {
      await callApi('faq_manage', { mode: 'save', id: item.id, question: item.question, answer: item.answer || '', video_url: item.video_url || '', active: !item.active })
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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-faint)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px', display: 'block' }
  const smallBtn = (color, border) => ({ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color, fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })

  const previewUrl = form.video_url.trim() && isWistiaLink(form.video_url) ? wistiaEmbedUrl(form.video_url) : null

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 6px' }}>FAQ Editor</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Everything here appears in the Help panel (the blue button bottom-right) on the member side of the portal. A question is required; add an answer, a Wistia video, or both. Items with a video also appear in the Videos list.
      </p>

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          {editingId ? 'Edit FAQ' : 'Add FAQ'}
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Question (required)</label>
          <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="e.g. How do I add a client?" style={inputStyle} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ accentColor: '#125ecc', cursor: 'pointer' }} />
            Visible to members
          </label>
          <div style={{ flex: 1 }} />
          {editingId && (
            <button onClick={cancelEdit} disabled={saving} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Cancel</button>
          )}
          <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'Inter, sans-serif' }}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add FAQ'}
          </button>
        </div>
        {error && <p style={{ color: '#d93025', fontSize: '13px', marginTop: '12px', marginBottom: 0 }}>{error}</p>}
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Current FAQs</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{items.length} item{items.length === 1 ? '' : 's'} · {items.filter(i => i.active).length} visible</div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '0 0 12px' }}>Members see them in this order. Use the arrows to reorder.</p>
        {loading && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Loading…</p>}
        {!loading && items.length === 0 && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No FAQs yet — add the first one above.</p>}
        {items.map((item, index) => {
          const busy = busyId === item.id
          const embed = item.video_url ? wistiaEmbedUrl(item.video_url) : null
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
                    {!item.active && <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', fontWeight: 600, marginLeft: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hidden</span>}
                    {embed && <span style={{ fontSize: '11px', color: '#0a85e8', fontWeight: 600, marginLeft: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Video</span>}
                  </div>
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
