import { btnPrimary, btnSecondary, btnDanger } from '../../shared/buttonStyles'
import BacklogCard from './BacklogCard'
import { bySortKey } from './backlogModel'

// The Requests tab: New requests (oldest first) with Approve / Deny for a
// superadmin, then the Ready to announce pool with its Archive button. A
// denied request goes straight to the archive view.
const byRequested = (a, b) => (String(a.requested_on || '9999').localeCompare(String(b.requested_on || '9999'))) || (a.id - b.id)

export default function BacklogRequestsTab({ requests, people, canManage, busyId, onOpen, onApprove, onDeny, onArchive }) {
  const pending = requests.filter((r) => r.review_status === 'pending').sort(byRequested)
  const ready = requests.filter((r) => r.review_status === 'approved' && !r.archived_at && r.progress === 'ready_to_announce').sort(bySortKey)

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <Section title="New requests" count={pending.length}>
        {pending.length === 0 ? <Empty>No requests waiting for review.</Empty> : (
          <div style={grid}>
            {pending.map((r) => (
              <BacklogCard key={r.id} request={r} people={people} onOpen={onOpen}
                footer={canManage ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px', opacity: busyId === r.id ? 0.6 : 1 }} disabled={busyId === r.id} onClick={() => onApprove(r)}>Approve</button>
                    <button style={{ ...btnDanger, padding: '5px 12px', fontSize: '12px' }} disabled={busyId === r.id} onClick={() => onDeny(r)}>Deny</button>
                  </div>
                ) : null} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Ready to announce" count={ready.length}>
        {ready.length === 0 ? <Empty>Nothing is ready to announce.</Empty> : (
          <div style={grid}>
            {ready.map((r) => (
              <BacklogCard key={r.id} request={r} people={people} onOpen={onOpen} showDoneBy
                footer={<button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px' }} onClick={() => onArchive(r)}>Archive</button>} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{title}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ padding: '14px 0', color: 'var(--vfo-faint)', fontSize: '13.5px' }}>{children}</div>
}
