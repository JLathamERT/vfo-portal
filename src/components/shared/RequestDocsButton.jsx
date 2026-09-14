import { useState } from 'react'
import { callApi } from '../../lib/api'

// Admin-only "Request documentation" action for a vault section. Opens an inline
// compose card that previews the email exactly as the recipient will see it —
// the textarea sits where the typed request lands in the template — and drafts a
// Gmail with a secure /vault-upload link. Self-contained so it can drop into any
// vault surface (client, member, specialist).
export default function RequestDocsButton({ entityType, entityKey, section, recipientName, recipientFirst }) {
  const [composeOpen, setComposeOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const fullName = recipientName || '[Recipient Name]'
  const firstName = recipientFirst || '[Recipient First]'

  async function send() {
    setSending(true)
    try {
      const res = await callApi('vault_request_docs', {
        entity_type: entityType,
        entity_key: entityKey,
        section,
        requested_info: text,
      })
      if (res?.error) { alert('Error: ' + res.error); setSending(false); return }
      setComposeOpen(false); setText(''); setSent(true)
      setTimeout(() => setSent(false), 8000)
    } catch (err) {
      alert('Failed to send email: ' + (err?.message || 'unknown error'))
    }
    setSending(false)
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button
          disabled={sending}
          onClick={() => { setSent(false); setComposeOpen(o => !o) }}
          title="Drafts a Gmail asking this person for documentation, with a secure upload link."
          style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600 }}
        >Request documentation</button>
        {sent && <span style={{ fontSize: '11px', color: '#1b9254', fontWeight: 600 }}>Request email drafted</span>}
      </div>

      {composeOpen && (
        <div style={{ marginTop: '10px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Subject: Documentation requested - {fullName}
          </div>
          <div style={{ fontSize: '13px', color: '#44557a', lineHeight: '1.6' }}>
            <p style={{ margin: '0 0 12px' }}>Dear {firstName},</p>
            <p style={{ margin: '0 0 12px' }}>As part of our work together, we are requesting the following documentation:</p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="List the documentation you need from them."
              disabled={sending}
              style={{ width: '100%', minHeight: '90px', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.06)', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: '1.55', boxSizing: 'border-box', resize: 'vertical', marginBottom: '12px' }}
            />
            <p style={{ margin: '0 0 12px' }}>Please use the secure button below to upload the requested documents:</p>
            <div style={{ margin: '0 0 12px' }}>
              <span style={{ display: 'inline-block', padding: '10px 18px', borderRadius: '6px', background: '#0095ff', color: '#fff', fontSize: '13px', fontWeight: 600, pointerEvents: 'none' }}>Upload Documents</span>
            </div>
            <p style={{ margin: '0 0 12px' }}>If you have any questions, please <strong>reply all</strong> to this email.</p>
            <p style={{ margin: 0 }}>Thank you,</p>
          </div>
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button disabled={sending} onClick={() => setComposeOpen(false)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: sending ? 'not-allowed' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)' }}>Cancel</button>
            <button disabled={sending || !text.trim()} onClick={send} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: (sending || !text.trim()) ? 'not-allowed' : 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: (sending || !text.trim()) ? 'rgba(0,149,255,0.06)' : 'rgba(0,149,255,0.18)', color: '#0095ff', fontWeight: '600' }}>{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
