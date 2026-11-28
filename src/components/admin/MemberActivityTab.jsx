import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import ListTable, { ListText, listSearchStyle } from '../shared/ListTable'
import ListFilterButton, { matchesFilter } from './ListFilterButton'
import { ListHeader } from '../shared/TrackKit'
import { TableSkeleton } from '../shared/Skeleton'
import { formatDateTime } from '../../lib/dates'

// Member Profile > Activity (admin view): when the member signed in and the key
// things they did in the portal, newest first (member_activity_load). Only the
// member's own actions; edits that save often (a CIQ, the Growth Plan, the
// profile) show as one line per 30 minutes with the number of saves.

const timeText = ts => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function MemberActivityTab({ member }) {
  const memberNumber = member?.plugin_member_number
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({})

  useEffect(() => {
    if (!memberNumber) return
    let alive = true
    setLoading(true); setError('')
    callApi('member_activity_load', { member_number: memberNumber })
      .then(res => { if (alive) setRows(res.rows || []) })
      .catch(err => { if (alive) setError(err?.message || 'Could not load activity') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [memberNumber])

  const labels = [...new Set(rows.map(r => r.label))].sort()
  const groups = [{ key: 'label', label: 'Activity', options: labels, get: r => r.label }]
  const q = search.trim().toLowerCase()
  const shown = rows
    .filter(r => !q || r.label.toLowerCase().includes(q) || (r.detail || '').toLowerCase().includes(q))
    .filter(r => matchesFilter(r, groups, filter))

  if (loading) return <TableSkeleton cols={[1.2, 1.2, 1.6]} rows={6} />

  return (
    <div>
      <ListHeader title="Activity" count={shown.length} />
      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search activity or client..." style={listSearchStyle} onChange={e => setSearch(e.target.value)} value={search} />
        {labels.length > 0 && <ListFilterButton groups={groups} value={filter} onChange={setFilter} />}
      </div>
      <ListTable
        rows={shown}
        rowKey={r => r.id}
        minWidth="640px"
        empty={rows.length ? 'No activity matches the current filters.' : 'No activity yet. Sign-ins and portal actions show here from now on.'}
        columns={[
          { key: 'at', label: 'When', width: '170px', type: 'date', get: r => r.at, render: r => <ListText>{formatDateTime(r.at)}</ListText> },
          { key: 'label', label: 'Activity', width: '1.2fr', get: r => r.label, render: r => <ListText style={{ fontWeight: 600 }}>{r.label}</ListText> },
          { key: 'detail', label: 'Detail', width: '1.6fr', render: r => (
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <ListText>{r.detail}</ListText>
              {r.save_count > 1 && (
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>
                  {r.save_count} saves{r.started_at ? `, ${timeText(r.started_at)} to ${timeText(r.at)}` : ''}
                </span>
              )}
            </span>
          ) },
        ]}
      />
    </div>
  )
}
