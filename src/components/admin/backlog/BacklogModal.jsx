import { useEffect } from 'react'

// The Portal Backlog's centred dialog: New request, Deny, Archive.
export default function BacklogModal({ title, onClose, children, footer, width = 520 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(8,20,48,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div role="dialog" aria-label={title}
        style={{ width: '100%', maxWidth: `${width}px`, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,20,60,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--vfo-ink)' }}>{title}</span>
          <button onClick={onClose} aria-label="Close" title="Close"
            style={{ background: 'transparent', border: 'none', fontSize: '20px', lineHeight: 1, color: 'var(--vfo-muted)', cursor: 'pointer', padding: '2px 6px' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', padding: '12px 20px 16px', borderTop: '1px solid var(--vfo-border-soft)' }}>{footer}</div>}
      </div>
    </div>
  )
}

export const fieldLabel = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }
export const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }
export const errorText = { fontSize: '12.5px', color: '#e74c3c', fontWeight: 600, marginTop: '10px' }
