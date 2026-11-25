// The figures above an Events list (the Growth Credits accounting tiles' look).
export default function EventTiles({ tiles }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
      {tiles.map(c => (
        <div key={c.label} style={{ flex: 1, minWidth: '160px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)' }}>{c.value}</div>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginTop: '6px' }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}
