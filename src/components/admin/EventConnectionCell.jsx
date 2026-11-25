import { useState } from 'react'
import { callApi } from '../../lib/api'
import { MemberNameLink } from '../shared/personLinks'
import Tag from '../shared/Tag'
import { btnOutline, btnPrimary, btnSecondary, btnState, BTN_SMALL } from '../shared/buttonStyles'
import { formatDate } from '../../lib/dates'

// Events > Purchases: who a buyer is to us. A portal buyer is a member. A public buyer
// is answered here (events_allocate_order): this member, a member's guest, or
// connected to nobody. It can be answered again.
const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })

export default function EventConnectionCell({ row, members, onDone }) {
  const isPublic = row.kind === 'paid' && row.source === 'public'
  const answered = !!row.link_type
  const suggestions = row.suggestions || []
  const [editing, setEditing] = useState(!answered)
  const [link, setLink] = useState(() => row.link_type || ({ member: 'member', invited: 'guest_of', none: 'none' })[row.claimed_link] || 'none')
  const [picked, setPicked] = useState(() => row.member_number ? { member_number: row.member_number, name: row.member_name } : suggestions[0] ? { member_number: suggestions[0].member_number, name: suggestions[0].name } : null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!isPublic) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--vfo-success-text)', fontWeight: 600, flexWrap: 'wrap' }}><span style={dot('#1b9254')} />Member: <MemberNameLink memberNumber={row.member_number} style={{ color: 'var(--vfo-link)', fontWeight: 600 }}>{row.member_name}</MemberNameLink></span>
  }
  const claim = row.claimed_link === 'member' ? `Says they are a member${row.claimed_member_name ? ` (${row.claimed_member_name})` : ''}`
    : row.claimed_link === 'invited' ? `Says ${row.claimed_member_name} invited them`
    : row.claimed_link === 'none' ? 'Says they are not a member' : ''

  if (answered && !editing) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12.5px', alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: row.link_type === 'none' ? 'var(--vfo-muted)' : 'var(--vfo-success-text)', fontWeight: 600, flexWrap: 'wrap' }}>
          <span style={dot(row.link_type === 'none' ? '#97a3ba' : '#1b9254')} />
          {row.link_type === 'none' ? 'Not connected to a member' : <>{row.link_type === 'member' ? 'Member:' : 'Guest of'} <MemberNameLink memberNumber={row.member_number} style={{ color: 'var(--vfo-link)', fontWeight: 600 }}>{row.member_name}</MemberNameLink></>}
        </span>
        {row.allocated_by && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginLeft: '14px' }}>by {row.allocated_by}{row.allocated_at ? `, ${formatDate(row.allocated_at)}` : ''}</span>}
        {row.comp_flag && <span style={{ marginLeft: '14px' }}><Tag color="#d97706">{row.comp_flag === 'member' ? 'Comes free: may be owed a refund' : "Free member's guest: may be owed a refund"}</Tag></span>}
        <button type="button" onClick={() => setEditing(true)} style={{ ...btnOutline, ...BTN_SMALL, marginLeft: '14px', marginTop: '2px' }}>Change</button>
      </span>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = q.length >= 2 ? members.filter(m => m.name.toLowerCase().includes(q) || m.member_number.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)).slice(0, 8) : []
  const list = q.length < 2 ? suggestions.map(s => ({ member_number: s.member_number, name: s.name, why: s.reasons.join(', ') })) : matches.map(m => ({ member_number: m.member_number, name: m.name, why: m.email }))
  const needsMember = link !== 'none'

  async function save() {
    setBusy(true); setErr('')
    try {
      await callApi('events_allocate_order', { order_id: row.order_id, link, ...(needsMember ? { member_number: picked.member_number } : {}) }, 1)
      await onDone(link === 'none' ? `${row.name} is not connected to a member.` : link === 'member' ? `${row.name} is member ${picked.name}.` : `${row.name} is a guest of ${picked.name}.`)
      setEditing(false)
    } catch (e) { setErr(e?.message || 'Could not save') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative', minWidth: 0 }}>
      {!answered && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#125ecc', fontSize: '11.5px', fontWeight: 700 }}><span style={dot('#125ecc')} />Needs allocating</div>}
      {claim && <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{claim}</span>}
      <select value={link} onChange={e => setLink(e.target.value)} style={{ padding: '6px 9px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '12.5px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
        <option value="member">Is a member</option>
        <option value="guest_of">Is a member's guest</option>
        <option value="none">Not connected to a member</option>
      </select>
      {needsMember && (picked && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{picked.name} <span style={{ color: 'var(--vfo-muted)', fontWeight: 400 }}>#{picked.member_number}</span></span>
          <button type="button" onClick={() => setOpen(true)} style={{ ...btnOutline, ...BTN_SMALL }}>Choose another</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input type="search" autoComplete="off" autoFocus={open} placeholder="Search member names..." value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '12.5px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }} />
          {list.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', borderRadius: '10px', boxShadow: '0 10px 28px rgba(0,41,115,0.18)', overflow: 'hidden' }}>
              {q.length < 2 && <div style={{ padding: '7px 10px 4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)' }}>Suggested</div>}
              {list.map(m => (
                <button key={m.member_number} type="button" onClick={() => { setPicked({ member_number: m.member_number, name: m.name }); setOpen(false); setQuery('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderTop: '1px solid var(--vfo-border-soft)', background: 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{m.name}</span> <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>#{m.member_number}</span>
                  {m.why && <span style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}>{m.why}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" disabled={busy || (needsMember && !picked)} onClick={save} style={btnState({ ...btnPrimary, ...BTN_SMALL }, busy || (needsMember && !picked))}>{busy ? 'Saving...' : 'Save'}</button>
        {answered && <button type="button" disabled={busy} onClick={() => setEditing(false)} style={{ ...btnSecondary, ...BTN_SMALL }}>Cancel</button>}
      </div>
      {err && <div style={{ fontSize: '11.5px', color: '#b91c1c' }}>{err}</div>}
    </div>
  )
}
