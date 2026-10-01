import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import CopyLink from './CopyLink'

// Top of every ADMIN vault page: the vault's permanent public drop link
// (vault_drop_link_get, admin-only). Anyone holding it can add files to this
// vault — choosing Tax Documents or General on the page — and nothing else.
export default function VaultDropLink({ entityType, entityKey }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!entityType || entityKey == null || entityKey === '') return
    let alive = true
    setUrl(''); setError('')
    callApi('vault_drop_link_get', { entity_type: entityType, entity_key: String(entityKey) })
      .then(d => { if (alive) setUrl(d?.url || '') })
      .catch(e => { if (alive) setError(e?.message || 'Could not load the upload link') })
    return () => { alive = false }
  }, [entityType, entityKey])

  const short = url ? `${url.split('?')[0].replace(/^https?:\/\//, '')}?token=${url.split('token=')[1]?.slice(0, 8) || ''}…` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.5 }}>
      <span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>Upload link:</span>
      {url
        ? <CopyLink url={url} label={short} />
        : <span>{error ? <span style={{ color: '#d93025' }}>{error}</span> : 'Loading…'}</span>}
      <span>Permanent. Anyone with it can add files to this vault; they cannot see or remove anything.</span>
    </div>
  )
}
