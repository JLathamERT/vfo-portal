// Backlog 7a: the thumbs-up pill on a request. Outline + muted when you haven't
// liked it, filled blue when you have; the number hides at zero. It sits inside
// a clickable row and a draggable card, so no click, press or drag reaches them.
// Without `onToggle` it is a read-only count (the Archive).
const stop = (e) => e.stopPropagation()

function ThumbIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M7 10v11" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

export default function LikeButton({ count = 0, liked = false, disabled = false, disabledTitle, busy = false, onToggle }) {
  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', whiteSpace: 'nowrap',
    padding: '3px 9px', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, fontFamily: 'Inter, sans-serif',
    fontVariantNumeric: 'tabular-nums',
    background: liked ? 'var(--vfo-tint)' : 'transparent',
    border: `1px solid ${liked ? 'var(--vfo-primary)' : 'var(--vfo-border-mid)'}`,
    color: liked ? 'var(--vfo-primary)' : 'var(--vfo-muted)',
  }
  if (!onToggle) {
    if (!count) return null
    return (
      <span title={`${count} ${count === 1 ? 'like' : 'likes'}`} style={pill}>
        <ThumbIcon filled={false} />{count}
      </span>
    )
  }
  const off = disabled || busy
  return (
    <button type="button" draggable={false} data-no-drag aria-pressed={liked}
      title={disabled ? disabledTitle : liked ? 'Unlike' : 'Like'}
      aria-label={`${liked ? 'Unlike' : 'Like'}${count ? ` (${count})` : ''}`}
      disabled={off}
      onClick={(e) => { e.stopPropagation(); if (!off) onToggle() }}
      onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }}
      style={{ ...pill, cursor: disabled ? 'not-allowed' : busy ? 'progress' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      <ThumbIcon filled={liked} />{count > 0 && count}
    </button>
  )
}
