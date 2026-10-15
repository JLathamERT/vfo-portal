import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fileSizeError } from '../lib/fileUpload'
import TokenShell from '../components/shared/TokenShell'

// "Questions for the client" (2026-10-15): the page a client reaches from the
// "A question about your tax plan" email. A copy of TaxUploadPage (Jake: same look,
// same behaviour) with the question shown at the top: files save the moment they
// upload, a written answer is sent on its own, and the link stays open for more.
// Token-gated: the question row found by the token is the whole credential.
const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,image/*,application/pdf'

// Mint a one-time signed upload url (token-gated), then PUT the bytes straight
// to the private client-tax-returns bucket, then record the file on the question.
async function uploadFile(token, file) {
  const tooBig = fileSizeError(file)
  if (tooBig) throw new Error(tooBig)
  const r1 = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tax_question_upload_url', token, filename: file.name }),
  })
  const d1 = await r1.json()
  if (!r1.ok || !d1.success || !d1.signed_url) throw new Error(d1.error || 'Could not start upload')
  const fd = new FormData()
  fd.append('cacheControl', '3600')
  fd.append('', file)
  const put = await fetch(d1.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
  if (!put.ok) throw new Error('Upload failed — please try again')
  // The PUT goes straight to storage, so the server only learns about the file
  // (and tells the tax team) from this call.
  const r2 = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tax_question_upload_notify', token, path: d1.path, file_name: file.name }),
  })
  const d2 = await r2.json().catch(() => ({}))
  if (!r2.ok || !d2.success) throw new Error(d2.error || 'Upload failed — please try again')
  return { path: d1.path, name: file.name, size: file.size }
}

export default function TaxQuestionPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [question, setQuestion] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [uploaded, setUploaded] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [noteSent, setNoteSent] = useState(false)
  // Separate from `error` so a send failure surfaces next to the Send button
  // rather than up by the dropzone, off the bottom of the client's screen.
  const [noteError, setNoteError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tax_question_load', token }),
    })
      .then(async r => {
        const d = await r.json()
        if (r.ok && d.success) setQuestion(d.question || '')
        else setInvalid(true)
      })
      .catch(() => {})
  }, [token])

  async function handleFiles(fileList) {
    if (!token) { setError('This link is invalid or missing its token.'); return }
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true); setError('')
    for (const file of files) {
      try {
        const ref = await uploadFile(token, file)
        setUploaded(u => [...u, ref])
      } catch (e) { setError(e.message || 'Upload failed') }
    }
    setBusy(false)
  }

  async function sendNote() {
    const text = note.trim()
    if (!token || !text) return
    setSending(true); setNoteError('')
    try {
      const r = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tax_question_answer', token, text }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not send your explanation')
      setNote(''); setNoteSent(true)
    } catch (e) { setNoteError(e.message || 'Could not send your explanation') }
    setSending(false)
  }

  const card = { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '12px', padding: '28px' }

  return (
    <TokenShell maxWidth={600}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px', color: 'var(--vfo-heading)' }}>Answer Your Tax Team's Question</h1>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '22px' }}>
        Your documents are stored securely in a private, encrypted vault — only authorized VFO tax staff can open them.
      </p>

      {!token || invalid ? (
        <div style={{ ...card, color: '#e74c3c' }}>This link is invalid or missing its token. Please use the link from your email.</div>
      ) : (
        <>
          {question && (
            <div style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Our question</div>
              <p style={{ color: 'var(--vfo-ink)', fontSize: '14px', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>{question}</p>
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
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{busy ? 'Uploading…' : 'Drop files here or click to choose'}</div>
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
                </div>
              ))}
              <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginTop: '12px' }}>
                Thank you — your documents have been received. You can close this page or add more files at any time using the same link.
              </p>
            </div>
          )}

          <div style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--vfo-border-chip)' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Or write an explanation</div>
            <p style={{ color: 'var(--vfo-muted)', fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px' }}>
              If what we asked for isn't a document, just tell us here — your message goes straight to your tax team.
            </p>
            <textarea
              rows={5}
              value={note}
              onChange={e => { setNote(e.target.value); setNoteSent(false); setNoteError('') }}
              disabled={sending}
              placeholder="Type your explanation or additional details here..."
              style={{
                ...card, padding: '14px 16px', width: '100%', boxSizing: 'border-box', resize: 'vertical',
                fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.55, color: 'var(--vfo-ink)',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
              <button
                onClick={sendNote}
                disabled={sending || !note.trim()}
                style={{
                  padding: '10px 22px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: (sending || !note.trim()) ? 'not-allowed' : 'pointer',
                  border: '1px solid rgba(0,149,255,0.4)',
                  background: (sending || !note.trim()) ? 'rgba(0,149,255,0.06)' : 'rgba(0,149,255,0.18)',
                  color: '#0095ff',
                }}
              >{sending ? 'Sending…' : 'Send'}</button>
              {noteSent && <span style={{ color: '#1b9254', fontSize: '13px', fontWeight: 500 }}>Explanation sent — thank you.</span>}
              {noteError && <span style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px' }}>{noteError}</span>}
            </div>
          </div>
        </>
      )}
    </TokenShell>
  )
}
