import { useEffect, useState, useLayoutEffect } from 'react'
import { callApi, getSession, getLastSeen, setLastSeen } from '../../lib/api'
import { fileSizeError } from '../../lib/fileUpload'
import { VaultRowsSkeleton } from './Skeleton'
import RequestDocsButton from './RequestDocsButton'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,image/*,application/pdf'

// The standard two-section vault layout, shared by the client, specialist and
// member vaults so they all look identical. Callers can override `sections`
// (e.g. the admin specialist view uses more descriptive hints).
export const DEFAULT_VAULT_SECTIONS = [
  { key: 'sensitive', title: 'Tax Documents', hint: 'Tax returns and other confidential documents. Stored in a private, encrypted vault.' },
  { key: 'general', title: 'General Documentation', hint: 'Any other documents you would like to share with your VFO team.' },
]

// Reusable document vault. `actions` supplies the four callApi action names
// ({ list, uploadUrl, download, delete }) plus an optional `uploadNotify`
// action fired best-effort after each successful upload (the signed-URL PUT
// bypasses the server, so a bell notification needs this explicit call);
// `params` is merged into every request (e.g. { member_number } for the
// member vault, {} for session-scoped vaults).
//
// A section may override the shared behaviour:
//   • readOnly: true  → renders View only (no Remove button, no upload). Used
//     for the ERT/VFOS Documentation section on the owner (portal) side.
//   • actions / params → per-section overrides for that one section's
//     download/uploadUrl/delete calls (the ERT section on the ADMIN side routes
//     through the admin_ert_* actions with { entity, key } instead of the shared
//     member_number/expert_id params). The section's file LIST always comes from
//     the shared actions.list response keyed by section (which returns `ert`).
//   • requestDocs: { entityType, entityKey, recipientName, recipientFirst } →
//     renders the admin-only "Request documentation" compose card in the section
//     header. Only the admin surfaces pass it; portals leave it undefined.
//   • moveContext: { entity, key } → enables drag-to-move between sections for
//     ERT-manager admins (Jake / Tray). ONLY the admin surfaces pass it; the
//     member / client / specialist portals leave it undefined, and the session
//     flag is a second independent guard, so a portal session can never drag.
export default function VaultSections({ actions, params = {}, sections = DEFAULT_VAULT_SECTIONS, moveContext = null }) {
  const [data, setData] = useState(() => Object.fromEntries(sections.map(s => [s.key, []])))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dragItem, setDragItem] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const [moving, setMoving] = useState(false)
  const paramsKey = JSON.stringify(params)
  const canMove = !!moveContext && !!getSession()?.is_ert_manager

  const SECTION_LABELS = { sensitive: 'Tax Documents', general: 'General Documentation', ert: 'ERT/VFOS Documentation' }

  function moveWarning(from, to) {
    if (from === 'sensitive') return `"%s" will move out of Tax Documents into ${SECTION_LABELS[to] || to}.`
    if (to === 'ert') return `"%s" will move into ERT/VFOS Documentation, which this person can see in their own portal.`
    return null
  }

  async function moveDoc(fromKey, toKey, file) {
    if (fromKey === toKey) return
    const warn = moveWarning(fromKey, toKey)
    if (warn && !window.confirm(warn.replace('%s', file.name) + '\n\nMove it?')) return
    setMoving(true); setError('')
    try {
      const d = await callApi('vault_move_document', {
        entity: moveContext.entity, key: moveContext.key,
        from_section: fromKey, to_section: toKey, path: file.path,
      })
      if (d.warning) setError(d.warning)
    } catch (e) { setError(e.message || 'Could not move document') }
    setMoving(false); load()
  }

  const actionFor = (sec, op) => (sec.actions && sec.actions[op]) || actions[op]
  const paramsFor = (sec) => sec.params || params

  const snapKey = `vault:${actions.list}:${paramsKey}`

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const d = await callApi(actions.list, { ...params })
      setData(Object.fromEntries(sections.map(s => [s.key, d[s.key] || []])))
      setLastSeen(snapKey, d)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e.message || 'Could not load the vault')
    }
    setLoading(false)
  }
  // Re-opened vault: draw the last file lists at once, refresh behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) {
      setData(Object.fromEntries(sections.map(s => [s.key, snap[s.key] || []])))
      setLoading(false)
    }
    load(!!snap)
  }, [actions.list, paramsKey])

  async function handleFiles(sec, fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(sec.key); setError('')
    for (const file of files) {
      const tooBig = fileSizeError(file)
      if (tooBig) { setError(tooBig); continue }
      try {
        const d = await callApi(actionFor(sec, 'uploadUrl'), { ...paramsFor(sec), section: sec.key, filename: file.name })
        if (!d.signed_url) throw new Error(d.error || 'Could not start upload')
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file)
        const put = await fetch(d.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
        if (!put.ok) throw new Error('Upload failed')
        const notify = actionFor(sec, 'uploadNotify')
        if (notify) {
          callApi(notify, { ...paramsFor(sec), section: sec.key, file_name: file.name }).catch(() => {})
        }
      } catch (e) { setError(e.message || 'Upload failed') }
    }
    setBusy(''); load()
  }

  async function view(sec, path) {
    try {
      const d = await callApi(actionFor(sec, 'download'), { ...paramsFor(sec), section: sec.key, path })
      if (d.url) window.open(d.url, '_blank', 'noopener')
    } catch (e) { setError(e.message || 'Could not open document') }
  }

  async function remove(sec, path) {
    if (!window.confirm('Remove this document?')) return
    try { await callApi(actionFor(sec, 'delete'), { ...paramsFor(sec), section: sec.key, path }); load() }
    catch (e) { setError(e.message || 'Could not remove') }
  }

  const fmtSize = (n) => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

  return (
    <div>
      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '14px' }}>{error}</div>}
      {moving && <div style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px', marginBottom: '14px' }}>Moving document…</div>}
      {canMove && !loading && (
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '14px' }}>
          Drag a document by its <span style={{ userSelect: 'none' }}>⠿</span> handle onto another section to move it there.
        </div>
      )}
      {sections.map(sec => (
        <div
          key={sec.key}
          style={{ background: dragOverKey === sec.key && dragItem?.section !== sec.key ? 'rgba(0,149,255,0.06)' : 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '12px', padding: '22px', marginBottom: '20px', outline: dragOverKey === sec.key && dragItem?.section !== sec.key ? '2px dashed #0095ff' : 'none', outlineOffset: '-4px' }}
          onDragOver={canMove && dragItem && dragItem.section !== sec.key ? (e => { e.preventDefault(); setDragOverKey(sec.key) }) : undefined}
          onDragLeave={canMove ? (() => setDragOverKey(k => k === sec.key ? null : k)) : undefined}
          onDrop={canMove && dragItem ? (e => {
            e.preventDefault()
            const item = dragItem
            setDragOverKey(null); setDragItem(null)
            if (item && item.section !== sec.key) moveDoc(item.section, sec.key, item.file)
          }) : undefined}
        >
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{sec.title}</div>
          <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{sec.hint}</p>

          {sec.requestDocs && (
            <RequestDocsButton
              entityType={sec.requestDocs.entityType}
              entityKey={sec.requestDocs.entityKey}
              section={sec.key}
              recipientName={sec.requestDocs.recipientName}
              recipientFirst={sec.requestDocs.recipientFirst}
            />
          )}

          {loading ? (
            <VaultRowsSkeleton rows={2} />
          ) : (
            <>
              {(data[sec.key] || []).length === 0 && <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginBottom: '12px' }}>No documents yet.</div>}
              {(data[sec.key] || []).map(f => (
                <div
                  key={f.path}
                  draggable={canMove}
                  onDragStart={canMove ? (e => { e.dataTransfer.effectAllowed = 'move'; setDragItem({ section: sec.key, file: f }) }) : undefined}
                  onDragEnd={canMove ? (() => { setDragItem(null); setDragOverKey(null) }) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', marginBottom: '8px', opacity: dragItem?.file?.path === f.path ? 0.45 : 1 }}
                >
                  {canMove && (
                    <span title="Drag to move this document to another section" style={{ fontSize: '14px', color: 'var(--vfo-muted)', cursor: 'grab', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                  )}
                  <span style={{ flexShrink: 0 }}>📄</span>
                  <span title={f.name} style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
                  <button onClick={() => view(sec, f.path)} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>View</button>
                  {!sec.readOnly && (
                    <button onClick={() => remove(sec, f.path)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                  )}
                </div>
              ))}
              {!sec.readOnly && (
                <label style={{ display: 'block', textAlign: 'center', cursor: busy === sec.key ? 'wait' : 'pointer', marginTop: '10px', padding: '16px', borderRadius: '8px', border: '1px dashed var(--vfo-border-mid)', background: 'var(--vfo-tint)' }}>
                  <input type="file" multiple accept={ACCEPT} disabled={busy === sec.key} style={{ display: 'none' }} onChange={e => { handleFiles(sec, e.target.files); e.target.value = '' }} />
                  <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{busy === sec.key ? 'Uploading…' : '+ Add document'}</span>
                </label>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
