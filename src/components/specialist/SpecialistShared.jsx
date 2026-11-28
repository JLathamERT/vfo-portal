import { useEffect, useState, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { SharedDocsSkeleton, VaultRowsSkeleton } from '../shared/Skeleton'
import ListTable, { ListName } from '../shared/ListTable'
import { BackLink } from '../shared/ProfileKit'

// Specialist "Shared with Me": the clients who have >=1 document shared to THIS
// specialist → pick a client → that client's shared documents → open in-portal
// via a short-lived signed URL. View-only; nothing is downloaded server-side.
export default function SpecialistShared({ onUnreadChange }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState(null)       // selected client, or null = list
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [opening, setOpening] = useState(null)     // share_id currently opening

  // View-only lists, so a re-visit draws the last copy at once (no skeleton) and
  // refreshes behind it; a background refresh failure keeps what is on screen.
  async function loadClients(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const d = await callApi('specialist_shared_clients', {})
      setClients(d.clients || [])
      setLastSeen('specialistshared:clients', d)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e.message || 'Could not load shared documents')
    }
    setLoading(false)
  }
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistshared:clients')
    if (snap) { setClients(snap.clients || []); setLoading(false) }
    loadClients(!!snap)
  }, [])

  async function openClient(c) {
    const key = `specialistshared:docs:${c.client_id}`
    const snap = getLastSeen(key)
    setActive(c); setError('')
    if (snap) { setDocs(snap.docs || []); setDocsLoading(false) }
    else { setDocs([]); setDocsLoading(true) }
    try {
      const d = await callApi('specialist_shared_docs', { client_id: c.client_id })
      setDocs(d.docs || [])
      setLastSeen(key, d)
    } catch (e) {
      if (snap) console.error(e)
      else setError(e.message || 'Could not load documents')
    }
    setDocsLoading(false)
  }

  function backToClients() { setActive(null); loadClients(clients.length > 0) }

  async function openDoc(doc) {
    setOpening(doc.share_id); setError('')
    try {
      const d = await callApi('specialist_shared_download', { share_id: doc.share_id })
      if (d.url) window.open(d.url, '_blank', 'noopener')
      // Mark viewed locally + refresh the tab badge.
      setDocs(prev => {
        const next = prev.map(x => x.share_id === doc.share_id ? { ...x, viewed: true } : x)
        // Keep the remembered copy in step, so a re-visit does not flash "New".
        if (active) setLastSeen(`specialistshared:docs:${active.client_id}`, { docs: next })
        return next
      })
      if (onUnreadChange) onUnreadChange()
    } catch (e) { setError(e.message || 'Could not open document') }
    setOpening(null)
  }

  const card = { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '12px', padding: '22px' }
  const newBadge = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '1px 7px', borderRadius: '999px', background: '#e74c3c', color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px' }

  return (
    <div>
      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '14px' }}>{error}</div>}
      <div style={card}>
        {active ? (
          <>
            <BackLink onClick={backToClients}>All clients</BackLink>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{active.name || `Client #${active.client_id}`}{active.member_name ? ` (${active.member_name})` : ''}</div>
            <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>Documents shared with you. Click View — they open securely in your browser.</p>
            {docsLoading ? <VaultRowsSkeleton rows={2} icon={false} /> : (
              <ListTable
                columns={[
                  { key: 'name', label: 'Document', width: 'minmax(0, 1fr)', get: d => d.name, render: d => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <ListName>{d.name}</ListName>
                      {!d.viewed && <span style={newBadge}>NEW</span>}
                    </span>
                  ) },
                  { key: 'kind', label: 'Type', width: '90px', get: d => d.kind, render: d => <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{d.kind}</span> },
                  { key: 'view', label: '', width: '84px', align: 'right', stop: true, render: d => (
                    <button onClick={() => openDoc(d)} disabled={opening === d.share_id} style={{ fontSize: '12px', padding: '4px 14px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, cursor: opening === d.share_id ? 'default' : 'pointer' }}>{opening === d.share_id ? 'Opening…' : 'View'}</button>
                  ) },
                ]}
                rows={docs}
                rowKey={d => d.share_id}
                onRowClick={d => { if (opening !== d.share_id) openDoc(d) }}
                empty="No documents shared."
              />
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>Shared with Me</div>
            <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>Client documents your VFO team has shared with you to review.</p>
            {loading ? <SharedDocsSkeleton /> : (
              <ListTable
                columns={[
                  { key: 'name', label: 'Client', width: 'minmax(0, 1fr)', get: c => c.name || `Client #${c.client_id}`, render: c => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <ListName sub={c.member_name || undefined}>{c.name || `Client #${c.client_id}`}</ListName>
                      {c.unread > 0 && <span style={newBadge}>{c.unread} NEW</span>}
                    </span>
                  ) },
                  { key: 'docs', label: 'Documents', width: '90px', align: 'right', type: 'number', get: c => c.doc_count, render: c => <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{c.doc_count} doc{c.doc_count === 1 ? '' : 's'}</span> },
                ]}
                rows={clients}
                rowKey={c => c.client_id}
                onRowClick={c => openClient(c)}
                empty="No documents have been shared with you yet."
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
