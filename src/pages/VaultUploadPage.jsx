import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fileSizeError } from '../lib/fileUpload'
import TokenShell from '../components/shared/TokenShell'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,image/*,application/pdf'

// Mint a one-time signed upload url (token-gated), then PUT the bytes straight
// into the vault section the request was raised against — or, on a vault's
// permanent link, the section the uploader picked. Mirrors /tax-upload.
async function uploadFile(token, file, section) {
  const tooBig = fileSizeError(file)
  if (tooBig) throw new Error(tooBig)
  const r1 = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vault_request_upload_url', token, filename: file.name, section }),
  })
  const d1 = await r1.json()
  if (!r1.ok || !d1.success || !d1.signed_url) throw new Error(d1.error || 'Could not start upload')
  const fd = new FormData()
  fd.append('cacheControl', '3600')
  fd.append('', file)
  const put = await fetch(d1.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
  if (!put.ok) throw new Error('Upload failed — please try again')
  // Best-effort admin bell — the PUT goes straight to storage, so the server
  // only learns about the completed upload from this call.
  fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vault_request_upload_notify', token, file_name: file.name, section }),
  }).catch(() => {})
  return { path: d1.path, name: file.name, size: file.size, section }
}

export default function VaultUploadPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [uploaded, setUploaded] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  // What the link is (vault_request_upload_context): a vault's permanent link
  // asks where the files go; a Request-documentation link already knows.
  const [ctx, setCtx] = useState(null)
  const [ctxError, setCtxError] = useState('')
  const [section, setSection] = useState('')

  useEffect(() => {
    if (!token) return
    let alive = true
    fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vault_request_upload_context', token }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return
        if (!ok || !d.success) { setCtxError(d.error || 'This upload link is invalid.'); return }
        setCtx(d)
        if (!d.needs_section) setSection(d.sections?.[0]?.key || '')
      })
      .catch(() => { if (alive) setCtxError('Could not load this upload link — please refresh.') })
    return () => { alive = false }
  }, [token])

  const sectionLabel = (key) => ctx?.sections?.find(s => s.key === key)?.label || ''

  async function handleFiles(fileList) {
    if (!token) { setError('This link is invalid or missing its token.'); return }
    if (ctx?.needs_section && !section) { setError('Please choose where these documents should go first.'); return }
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true); setError('')
    for (const file of files) {
      try {
        const ref = await uploadFile(token, file, section || undefined)
        setUploaded(u => [...u, ref])
      } catch (e) { setError(e.message || 'Upload failed') }
    }
    setBusy(false)
  }

  const card = { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '12px', padding: '28px' }

  return (
    <TokenShell maxWidth={600}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: 'var(--vfo-heading)' }}>Secure Document Upload</h1>
      {/* The intro, the section question and the drop zone all depend on what the
          link is, so nothing below the title renders until the context is in. */}
      {ctx && (
        <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '22px' }}>
          {ctx.drop_link
            ? 'Use this page to securely upload your documents.'
            : 'Use this page to securely upload the documents that were requested from you.'} Everything you add is stored in a private, encrypted vault — only your authorized VFO team can open it.
        </p>
      )}

      {!token || ctxError ? (
        <div style={{ ...card, color: '#e74c3c', marginTop: '16px' }}>{ctxError || 'This upload link is invalid or missing its token. Please use the link from your email.'}</div>
      ) : !ctx ? (
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', padding: '12px 0' }}>Loading…</div>
      ) : (
        <>
          {ctx.needs_section && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Where should these documents go?</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {ctx.sections.map(s => {
                  const on = section === s.key
                  return (
                    <button key={s.key} type="button" onClick={() => { setSection(s.key); setError('') }}
                      style={{ flex: '1 1 200px', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, textAlign: 'left',
                        border: `1px solid ${on ? '#0095ff' : 'var(--vfo-border-mid)'}`, background: on ? 'rgba(0,149,255,0.08)' : 'var(--vfo-card)', color: 'var(--vfo-ink)' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', marginRight: '10px', verticalAlign: '-2px', boxSizing: 'border-box', border: on ? '4px solid #0095ff' : '1.5px solid var(--vfo-border-strong)' }} />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <label
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
            style={{
              ...card, display: 'block', textAlign: 'center', cursor: 'pointer',
              borderStyle: 'dashed', borderColor: drag ? '#0095ff' : 'var(--vfo-border-mid)',
              background: drag ? 'rgba(0,149,255,0.08)' : 'var(--vfo-tint)',
            }}
          >
            <input type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{busy ? 'Uploading…' : ctx.needs_section && !section ? 'Choose where these documents should go above, then drop files here' : 'Drop files here or click to choose'}</div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>PDF, Word, Excel or images</div>
          </label>

          {error && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginTop: '12px' }}>{error}</div>}

          {uploaded.length > 0 && (
            <div style={{ marginTop: '22px' }}>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Uploaded ({uploaded.length})</div>
              {uploaded.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(27,146,84,0.1)', border: '1px solid rgba(27,146,84,0.25)', borderRadius: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#1b9254' }}>✓</span>
                  <span style={{ fontSize: '13px' }}>{f.name}</span>
                  {ctx.needs_section && f.section && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginLeft: 'auto' }}>{sectionLabel(f.section)}</span>}
                </div>
              ))}
              <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '12px' }}>
                Thank you — your documents have been received. You can close this page or add more files at any time using the same link.
              </p>
            </div>
          )}
        </>
      )}
    </TokenShell>
  )
}
