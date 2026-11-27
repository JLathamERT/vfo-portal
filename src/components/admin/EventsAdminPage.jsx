import { useLayoutEffect, useState } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { eventDatesText } from '../../lib/events'
import { PORTAL_URL } from '../../lib/environment'
import CopyLink from '../shared/CopyLink'
import { SearchFilterSkeleton, TableSkeleton } from '../shared/Skeleton'
import MemberEvents from '../member/MemberEvents'
import EventAttendeesTable, { EVENT_GRID, EVENT_MIN_WIDTH } from './EventAttendeesTable'
import EventPurchasesTable from './EventPurchasesTable'
import EventCheckIn from './EventCheckIn'
import SubTabs, { MiniTabs } from '../shared/SubTabs'
import { PageHeading } from '../shared/ProfileKit'

// More > Events (2026-11-25), open to every admin. The page and its sub-tab pills are
// format-identical to the Growth Credits page (GrowthCreditsRedemptionsPage.jsx).
// Sub-tabs: Attendees (one row per person coming, and the export), Purchases (one row
// per payment: the money, who a public buyer is, refunds), Check-in and Member preview
// (what a paying or a complimentary member sees on their Events tab).

const PUBLIC_PAGE = `${PORTAL_URL}/events`
const SUBTABS = [
  { key: 'attendees', label: 'Attendees' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'preview', label: 'Member preview' },
]

export default function EventsAdminPage() {
  const [section, setSection] = useState('attendees')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [previewAs, setPreviewAs] = useState('paying')

  useLayoutEffect(() => {
    const snap = getLastSeen('eventsadmin')
    if (snap) setData(snap)
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    try {
      const res = await callApi('events_admin_load')
      setData(res)
      setLastSeen('eventsadmin', res)
      setError('')
    } catch (e) { if (quiet === true) console.error(e); else setError(e?.message || 'Failed to load the event') }
  }
  function done(msg) {
    if (msg) { setFlash(msg); setTimeout(() => setFlash(''), 6000) }
    return load(true)
  }

  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '22px', marginBottom: '18px' }
  const event = data?.event

  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <PageHeading eyebrow="More" title="Events" sub={<>
        {event && <div>{event.name} · {eventDatesText(event)}{event.location ? ` · ${event.location}` : ''}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
          <span>Public page:</span>
          <CopyLink url={PUBLIC_PAGE} label={PUBLIC_PAGE.replace('https://', '')} />
          <a href={PUBLIC_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vfo-link)', fontWeight: 600, textDecoration: 'none' }}>Open</a>
        </div>
      </>} />

      <SubTabs tabs={SUBTABS} active={section} onChange={setSection} />

      {flash && <div role="status" style={{ background: 'var(--vfo-accent-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-accent-text)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', marginBottom: '14px' }}>{flash}</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {!data && !error && <><SearchFilterSkeleton boxes={[84, 150]} /><TableSkeleton cols={EVENT_GRID} rows={6} minWidth={EVENT_MIN_WIDTH} pad="11px 18px" twoLine /></>}
      {data && !event && <div style={{ ...card, textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '13px' }}>No event has been set up yet.</div>}

      {event && section === 'attendees' && <EventAttendeesTable data={data} onOpenPurchases={() => setSection('purchases')} />}
      {event && section === 'purchases' && <EventPurchasesTable data={data} onDone={done} />}
      {event && section === 'checkin' && <EventCheckIn rows={data.rows} onDone={done} />}
      {event && section === 'preview' && (
        <>
          <MiniTabs tabs={[{ key: 'paying', label: 'Member who pays' }, { key: 'complimentary', label: 'Member who comes free' }]} active={previewAs} onChange={setPreviewAs} style={{ gap: '8px', marginBottom: '18px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginLeft: '6px' }}>What a member sees, on made-up details. Nothing here can be saved or bought.</span>
          </MiniTabs>
          <div style={{ maxWidth: '980px', margin: '0 auto' }}>
            <MemberEvents key={previewAs} preview={previewAs} previewEvent={event} />
          </div>
        </>
      )}
    </div>
  )
}
