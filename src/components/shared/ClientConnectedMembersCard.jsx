import { useEffect, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate } from '../../lib/dates'

// Portal licensing L5: the CLIENT MIRRORING card on a client (member Profile tab
// and the admin client Profile tab). member_client_connections_load decides what
// renders: nothing while mirrored_clients is off for the client's owner; for the
// owner / an admin, every connection (Remove), the owner's normal partners (one-
// click Connect) and a search for any other active member; for a connected member,
// only "you are connected" + Leave. Every rule is enforced by the handlers - this
// card only draws them.
export default function ClientConnectedMembersCard({ clientId, sectionStyle, cardTitle, onLeft }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)

  async function load() {
    try {
      const d = await callApi('member_client_connections_load', { client_id: clientId })
      setState(d?.enabled ? d : { enabled: false })
    } catch (e) {
      console.error(e)
      setState({ enabled: false })
    }
  }

  useEffect(() => { load() }, [clientId])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2 || !state?.enabled || state.viewer === 'connected') { setResults([]); return }
    const seq = ++searchSeq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const d = await callApi('member_connect_candidates', { client_id: clientId, q: term })
        if (seq === searchSeq.current) setResults(d?.members || [])
      } catch (e) {
        if (seq === searchSeq.current) setError(e.message || 'Search failed.')
      }
      if (seq === searchSeq.current) setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q, clientId, state?.enabled, state?.viewer])

  async function connect(memberNumber) {
    setBusy(`add:${memberNumber}`); setError(null)
    try {
      const d = await callApi('member_client_connection_add', { client_id: clientId, member_number: memberNumber })
      if (d?.ok) { setQ(''); setResults([]); await load() }
      else setError(d?.error || 'Could not mirror to that member.')
    } catch (e) {
      setError(e.message || 'Could not mirror to that member.')
    }
    setBusy(null)
  }

  async function remove(memberNumber, leaving) {
    setBusy(`remove:${memberNumber}`); setError(null)
    try {
      const d = await callApi('member_client_connection_remove', { client_id: clientId, member_number: memberNumber })
      if (d?.ok) {
        setConfirmRemove(null)
        if (leaving) onLeft?.()
        else await load()
      } else setError(d?.error || 'Could not stop mirroring.')
    } catch (e) {
      setError(e.message || 'Could not stop mirroring.')
    }
    setBusy(null)
  }

  if (!state?.enabled) return null

  const primaryBtn = { padding: '7px 16px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }
  const ghostBtn = { padding: '7px 14px', borderRadius: '8px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-strong)', color: 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }
  const dangerBtn = { ...ghostBtn, color: '#c0392b', borderColor: 'rgba(231,76,60,0.35)' }
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }
  const muted = { fontSize: '12px', color: 'var(--vfo-muted)' }
  const chip = (oneOff) => ({ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: oneOff ? 'rgba(18,94,204,0.08)' : 'rgba(27,146,84,0.1)', color: oneOff ? 'var(--vfo-accent-text)' : 'var(--vfo-success-text)', marginLeft: '8px' })

  const removeControls = (c, leaving) => confirmRemove === c.member_number ? (
    <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <span style={muted}>{leaving ? 'Stop seeing this client?' : 'Stop mirroring?'}</span>
      <button style={dangerBtn} disabled={!!busy} onClick={() => remove(c.member_number, leaving)}>{busy === `remove:${c.member_number}` ? 'Removing…' : 'Yes'}</button>
      <button style={ghostBtn} disabled={!!busy} onClick={() => setConfirmRemove(null)}>No</button>
    </span>
  ) : (
    <button style={dangerBtn} disabled={!!busy} onClick={() => setConfirmRemove(c.member_number)}>{leaving ? 'Leave' : 'Stop mirroring'}</button>
  )

  if (state.viewer === 'connected') {
    const mine = state.connections?.[0]
    return (
      <div style={sectionStyle}>
        <div style={cardTitle}>Client Mirroring</div>
        <div style={row}>
          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>
            {state.owner?.name || 'This client\'s member'} has mirrored this client to you{mine?.connected_at ? ` since ${formatDate(mine.connected_at)}` : ''}. You can view this client's case, but not change it.
          </span>
          {mine && removeControls(mine, true)}
        </div>
        {error && <p style={{ fontSize: '13px', marginTop: '12px', marginBottom: 0, color: '#d93025' }}>{error}</p>}
      </div>
    )
  }

  const connections = state.connections || []
  const partners = state.partners || []

  return (
    <div style={sectionStyle}>
      <div style={cardTitle}>Client Mirroring</div>
      <p style={{ ...muted, margin: '0 0 8px' }}>Mirroring lets another member view this client's case on their own portal. They cannot change anything and never see fees or payments.</p>

      {connections.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>This client is not mirrored to any member.</div>}
      {connections.map(c => (
        <div key={c.member_number} style={row}>
          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>
            <span style={{ fontWeight: 600 }}>{c.name}</span>
            <span style={chip(c.source === 'one_off')}>{c.source === 'one_off' ? 'One-off connection' : 'Existing connection'}</span>
            <span style={{ ...muted, marginLeft: '10px' }}>Mirrored {formatDate(c.connected_at)}{c.connected_by_name ? ` by ${c.connected_by_name}` : ''}</span>
          </span>
          {removeControls(c, false)}
        </div>
      ))}

      {partners.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ ...muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', fontSize: '10.5px', marginBottom: '4px' }}>{state.viewer === 'admin' ? `${state.owner?.name || 'The member'}'s connections` : 'Your connections'}</div>
          {partners.map(p => (
            <div key={p.member_number} style={row}>
              <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{p.name}</span>
              <button style={primaryBtn} disabled={!!busy} onClick={() => connect(p.member_number)}>{busy === `add:${p.member_number}` ? 'Mirroring…' : 'Mirror'}</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <div style={{ ...muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', fontSize: '10.5px', marginBottom: '6px' }}>{connections.length ? 'Mirror to another member' : 'Mirror to a member'}</div>
        <input type="search" name="connect-member-search" autoComplete="off" placeholder="Search by name or member number…" value={q} onChange={e => { setQ(e.target.value); setError(null) }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }} />
        {q.trim().length >= 2 && (
          <div style={{ marginTop: '4px' }}>
            {searching && results.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>Searching…</div>}
            {!searching && results.length === 0 && <div style={{ ...muted, padding: '8px 0' }}>No active members match.</div>}
            {results.map(m => (
              <div key={m.member_number} style={row}>
                <span style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ ...muted, marginLeft: '8px' }}>#{m.member_number}</span>
                  {m.partner && <span style={chip(false)}>Existing connection</span>}
                </span>
                <button style={primaryBtn} disabled={!!busy} onClick={() => connect(m.member_number)}>{busy === `add:${m.member_number}` ? 'Mirroring…' : 'Mirror'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ fontSize: '13px', marginTop: '12px', marginBottom: 0, color: '#d93025' }}>{error}</p>}
    </div>
  )
}
