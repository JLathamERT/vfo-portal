import { useEffect, useRef, useState } from 'react'

const MIN_LETTERS = 3

// Type-ahead over member NAMES (like a country picker), shared by /tax-diagnostic and
// the public /events page: `search` posts the typed letters and answers
// { ok, data: { names, error } }. Asks the server only once
// MIN_LETTERS letters are typed; the server caps and rate-limits it too.
export default function MemberNamePicker({ value, inputStyle, onPick, onClear, search }) {
  const [q, setQ] = useState('')
  const [names, setNames] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    const letters = (q.match(/\p{L}/gu) || []).length
    if (letters < MIN_LETTERS) { setNames([]); setSearchError(''); return }
    const mine = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { ok, data } = await search(q)
        if (mine !== seq.current) return
        if (!ok) { setNames([]); setSearchError(data?.error || 'Search is unavailable — please try again.'); return }
        setSearchError('')
        setNames(Array.isArray(data?.names) ? data.names : [])
      } catch {
        if (mine === seq.current) { setNames([]); setSearchError('Search is unavailable — please try again.') }
      } finally {
        if (mine === seq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ padding: '8px 14px', borderRadius: '999px', background: 'rgba(18,94,204,0.10)', color: '#125ecc', fontSize: '13px', fontWeight: 600 }}>
          {value}
        </span>
        <button type="button" onClick={() => { onClear(); setQ(''); setOpen(true) }}
          style={{ padding: '6px 14px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>
          Change
        </button>
      </div>
    )
  }

  const letters = (q.match(/\p{L}/gu) || []).length
  const optionStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'transparent', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
  return (
    <div style={{ position: 'relative' }}>
      <input type="text" value={q} autoComplete="off" placeholder="Type at least 3 letters of the name"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={inputStyle} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '10px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
          {letters < MIN_LETTERS && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>Keep typing — at least {MIN_LETTERS} letters.</div>
          )}
          {letters >= MIN_LETTERS && searching && names.length === 0 && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>Searching...</div>
          )}
          {letters >= MIN_LETTERS && !searching && !searchError && names.length === 0 && (
            <div style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--vfo-muted)' }}>No member found with that name.</div>
          )}
          {searchError && <div style={{ padding: '9px 14px', fontSize: '12px', color: '#d93025' }}>{searchError}</div>}
          {names.map(n => (
            <button key={n} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onPick(n); setOpen(false) }} style={optionStyle}>{n}</button>
          ))}
        </div>
      )}
    </div>
  )
}
