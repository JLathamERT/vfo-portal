import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadCachedAction } from '../../lib/api'

// Phase note @mentions (2026-11-13). Typing "@" lists the team: admins on every
// phase, active tax planners + team members on Tax Priorities notes only (the
// server decides from tab_name). Picking inserts "@Full Name"; the save sends
// the picked emails whose "@Full Name" is still in the text (mentionEmails), and
// the server re-checks each against the directory and bells the new ones.

const MAX_ROWS = 8
const MAX_QUERY = 40
const TYPE_LABEL = { admin: 'Admin', tax_planner: 'Tax Planner', team_member: 'Team Member' }
const MENU_WIDTH = 260

export function mentionDirectoryTab(tabName) {
  return tabName === 'Tax Priorities' ? 'Tax Priorities' : ''
}

export function loadMentionDirectory(tabName) {
  return loadCachedAction('mention_directory_load', { tab_name: mentionDirectoryTab(tabName) }).then(r => r?.people || [])
}

export function mentionEmails(text, picked) {
  const t = text || ''
  return [...new Set((picked || []).filter(p => t.includes('@' + p.name)).map(p => p.email))]
}

export function pickedFromNote(note) {
  return (note?.client_note_mentions || []).map(m => ({ name: m.recipient_name, email: m.recipient_email, type: m.recipient_type }))
}

// The note text with each tagged "@Name" highlighted (admin + planner portals).
// The member portal renders note_text plainly and never gets mention data.
export function NoteText({ note }) {
  const names = [...new Set((note?.client_note_mentions || []).map(m => m.recipient_name).filter(Boolean))]
  const text = note?.note_text || ''
  if (!names.length) return text
  const escaped = names.sort((a, b) => b.length - a.length).map(n => '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g'))
  return parts.map((part, i) => i % 2 === 1
    ? <span key={i} style={{ color: '#0095ff', background: 'rgba(0,149,255,0.12)', borderRadius: '4px', padding: '0 2px', fontWeight: 600 }}>{part}</span>
    : part)
}

const MIRROR_PROPS = ['boxSizing', 'width', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize']

// Viewport position just under the caret, from a hidden copy of the textarea.
function caretPoint(ta, pos) {
  const cs = window.getComputedStyle(ta)
  const div = document.createElement('div')
  MIRROR_PROPS.forEach(p => { div.style[p] = cs[p] })
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', top: '0', left: '-9999px', height: 'auto' })
  div.textContent = ta.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = ta.value.slice(pos) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
  const top = span.offsetTop + (parseFloat(cs.borderTopWidth) || 0)
  const left = span.offsetLeft + (parseFloat(cs.borderLeftWidth) || 0)
  document.body.removeChild(div)
  const r = ta.getBoundingClientRect()
  return { top: r.top + top - ta.scrollTop, left: r.left + left - ta.scrollLeft, lineHeight }
}

// The "@query" the caret is in, or null.
function activeQuery(text, caret) {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/[\s(]/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.length > MAX_QUERY || /[\n@]/.test(query)) return null
  return { at, query }
}

function rankPeople(people, query) {
  const q = query.trim().toLowerCase()
  if (!q) return people.slice(0, MAX_ROWS)
  const starts = [], contains = []
  for (const p of people) {
    const n = p.name.toLowerCase()
    if (n.startsWith(q)) starts.push(p)
    else if (n.includes(q)) contains.push(p)
  }
  return [...starts, ...contains].slice(0, MAX_ROWS)
}

// A drop-in for the notes <textarea>: same value / onChange / style, plus
// `tabName` (who can be tagged) and `picked` / `onPickedChange` (who was).
export function MentionTextarea({ value, onChange, tabName, picked, onPickedChange, style, ...rest }) {
  const taRef = useRef(null)
  const menuRef = useRef(null)
  const [people, setPeople] = useState(null)
  const [open, setOpen] = useState(null) // { at, query, top, left }
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    loadMentionDirectory(tabName).then(list => { if (alive) setPeople(list) }).catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [tabName])

  const matches = useMemo(() => (open && people) ? rankPeople(people, open.query) : [], [open, people])

  function refresh(text, caret) {
    const hit = activeQuery(text, caret)
    if (!hit || !taRef.current) { setOpen(null); return }
    const pt = caretPoint(taRef.current, hit.at)
    if (!open || open.at !== hit.at || open.query !== hit.query) setActive(0)
    setOpen({ ...hit, top: pt.top + pt.lineHeight, left: pt.left, lineTop: pt.top })
  }

  function handleChange(e) {
    onChange(e)
    refresh(e.target.value, e.target.selectionStart)
  }

  function pick(person) {
    const ta = taRef.current
    if (!ta || !open) return
    const caret = ta.selectionStart
    const insert = '@' + person.name + ' '
    const next = value.slice(0, open.at) + insert + value.slice(caret)
    onChange({ target: { value: next } })
    if (!(picked || []).some(p => p.email === person.email)) onPickedChange([...(picked || []), person])
    setOpen(null)
    const pos = open.at + insert.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos) })
  }

  function handleKeyDown(e) {
    if (open && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[Math.min(active, matches.length - 1)]); return }
    }
    if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(null) }
  }

  // Close on a page scroll or resize (the menu is fixed to the viewport), but
  // not on a scroll inside the menu itself.
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (menuRef.current && e?.target && menuRef.current.contains(e.target)) return; setOpen(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])

  useEffect(() => {
    const el = menuRef.current?.querySelector('[data-active="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active])

  let menu = null
  if (open && matches.length) {
    const vw = window.innerWidth, vh = window.innerHeight
    const left = Math.max(8, Math.min(open.left, vw - MENU_WIDTH - 8))
    const estHeight = matches.length * 44 + 8
    const flip = open.top + estHeight > vh - 8 && open.lineTop - estHeight > 8
    const pos = flip ? { bottom: vh - open.lineTop + 4 } : { top: open.top + 4 }
    menu = createPortal(
      <div ref={menuRef} role="listbox" aria-label="Tag a team member"
        style={{ position: 'fixed', left, ...pos, width: MENU_WIDTH, maxWidth: 'calc(100vw - 16px)', maxHeight: 360, overflowY: 'auto', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '10px', boxShadow: '0 12px 30px rgba(20,45,95,0.18)', zIndex: 1000, padding: '4px 0', fontFamily: 'Inter, sans-serif' }}>
        {matches.map((p, i) => (
          <div key={p.email} role="option" aria-selected={i === active} data-active={i === active}
            onMouseDown={e => { e.preventDefault(); pick(p) }}
            onMouseEnter={() => setActive(i)}
            style={{ padding: '7px 12px', cursor: 'pointer', background: i === active ? 'var(--vfo-tint)' : 'transparent', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <span style={{ fontSize: '10.5px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{TYPE_LABEL[p.type] || ''}</span>
          </div>
        ))}
      </div>,
      document.body,
    )
  }

  return (
    <>
      <textarea ref={taRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        onClick={e => refresh(e.target.value, e.target.selectionStart)}
        onBlur={() => setOpen(null)}
        style={style} {...rest} />
      {menu}
    </>
  )
}
