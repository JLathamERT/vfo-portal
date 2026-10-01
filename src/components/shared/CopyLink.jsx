import { useState } from 'react'

// A link shown as a pill with one-click copy (hover shows "Copy link"). `label`
// replaces the visible text when the url is too long to show whole; the full
// url is always what gets copied.
export default function CopyLink({ url, label }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <button type="button" onClick={copy} title={copied ? 'Copied' : 'Copy link'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', margin: '0 2px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', maxWidth: '100%',
        border: `1px solid ${copied ? 'rgba(27,146,84,0.45)' : 'var(--vfo-border-strong)'}`, background: copied ? 'rgba(27,146,84,0.10)' : 'var(--vfo-card)',
        color: copied ? '#1b9254' : 'var(--vfo-ink)', fontSize: '12.5px', fontWeight: 600 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label || url}</span>
      {copied
        ? <span style={{ fontSize: '11.5px', flexShrink: 0 }}>Copied</span>
        : (
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ color: 'var(--vfo-muted)', flexShrink: 0 }}>
            <rect x="5" y="5" width="9" height="9" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 5V3.8A1.8 1.8 0 0 0 9.2 2H3.8A1.8 1.8 0 0 0 2 3.8v5.4A1.8 1.8 0 0 0 3.8 11H5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
    </button>
  )
}
