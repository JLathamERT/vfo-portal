import { useEffect, useState } from 'react'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { btnDanger, btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import { departmentChipStyle } from './portalDepartments'
import { PROGRESS_LABELS, columnName, fmtDate, fmtDateTime, parseColumn, placeLabel } from './backlogModel'
import ScorePill from './ScorePill'
import { fieldLabel, inputStyle } from './BacklogModal'

// The request drawer: every field, the review, the assignee, the archive
// details and the history. Its Move to / Assign to selects do what dragging
// does, so a superadmin can move cards on a touch screen.
export default function BacklogDrawer({ request: r, people, assignees, canManage, me, busy, onClose, onEdit, onWithdraw, onApprove, onDeny, onReopen, onMove, onArchive, onRestore, onSaveWriteup }) {
  const phone = useIsPhone()
  const [moveTo, setMoveTo] = useState(r.progress || 'todo')
  const [assignTo, setAssignTo] = useState(r.assignee_admin_id ?? '')
  const [writeup, setWriteup] = useState(r.announcement || '')
  const [writeupState, setWriteupState] = useState('')
  useEffect(() => { setWriteup(r.announcement || ''); setWriteupState('') }, [r.id, r.announcement])
  useEffect(() => { setMoveTo(r.progress || 'todo'); setAssignTo(r.assignee_admin_id ?? '') }, [r.id, r.progress, r.assignee_admin_id])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const own = me && r.requester_admin_id === me.admin_id
  const pending = r.review_status === 'pending'
  const onBoard = r.review_status === 'approved' && !r.archived_at
  const isReady = onBoard && r.progress === 'ready_to_announce'
  const canEdit = !r.archived_at && r.review_status !== 'withdrawn' && (canManage || (own && pending))

  const moveAssignee = moveTo === 'ready_to_announce' ? (r.assignee_admin_id ?? null) : (assignTo === '' ? null : Number(assignTo))
  const moveValid = moveTo === 'todo' || moveTo === 'ready_to_announce' || moveAssignee != null
  const moveChanged = moveTo !== r.progress || (moveTo !== 'ready_to_announce' && moveAssignee !== (r.assignee_admin_id ?? null))

  const requestedFor = r.requested_assignee_admin_id != null ? (people[r.requested_assignee_admin_id] || 'a former admin') : null

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,20,48,0.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <aside role="dialog" aria-label="Portal request"
        style={{ width: phone ? '100%' : '480px', maxWidth: '100%', height: '100%', overflowY: 'auto', background: 'var(--vfo-page)', borderLeft: '1px solid var(--vfo-border-soft)', boxShadow: '-12px 0 40px rgba(0,20,60,0.2)', boxSizing: 'border-box' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'linear-gradient(120deg, #002973 0%, #0a3f9e 55%, #125ecc 100%)', color: '#ffffff', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.72 }}>{placeLabel(r, people)}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{r.title}</div>
              <div style={{ fontSize: '12.5px', opacity: 0.8, marginTop: '4px' }}>{r.requester_name} · Requested {fmtDate(r.requested_on)}{r.imported ? ' · Imported from sheet' : ''}</div>
            </div>
            <button onClick={onClose} aria-label="Close" title="Close"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#ffffff', borderRadius: '50%', width: '30px', height: '30px', fontSize: '17px', lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Card title="Description">
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {(r.departments || []).map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}
              <ScorePill label="Urgency" value={r.urgency} size="md" />
              <ScorePill label="Importance" value={r.importance} size="md" />
            </div>
            <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.request_text}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '14px' }}>
              <Field label="Assignee" value={r.assignee_admin_id != null ? (people[r.assignee_admin_id] || 'A former admin') : '–'} />
              {requestedFor && <Field label="Requested for" value={requestedFor} />}
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                <button style={btnSecondary} onClick={onEdit}>Edit</button>
                {own && pending && <button style={btnState(btnDanger, busy)} disabled={busy} onClick={onWithdraw}>Withdraw</button>}
              </div>
            )}
          </Card>

          {r.review_status !== 'withdrawn' && (
            <Card title="What it does (for the announcement)">
              {r.archived_at ? (
                <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.announcement || 'No write-up was saved.'}</div>
              ) : (
                <>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginBottom: '8px', lineHeight: 1.45 }}>
                    What the finished change does, in words ready to announce. Things change between the request and the work, so keep it current. Needed before Ready to announce.
                  </div>
                  <textarea aria-label="What it does" rows={5} value={writeup} onChange={(e) => { setWriteup(e.target.value); setWriteupState('') }}
                    placeholder="For example: Members can now..." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button style={btnState(btnPrimary, busy || writeup.trim() === (r.announcement || '').trim())}
                      disabled={busy || writeup.trim() === (r.announcement || '').trim()}
                      onClick={async () => { setWriteupState('saving'); try { await onSaveWriteup(writeup); setWriteupState('saved') } catch (e) { setWriteupState(e.message || 'Not saved') } }}>
                      {writeupState === 'saving' ? 'Saving…' : 'Save write-up'}
                    </button>
                    {writeupState === 'saved' && <span style={{ fontSize: '12px', color: 'var(--vfo-success-text)', fontWeight: 600 }}>Saved</span>}
                    {writeupState && writeupState !== 'saving' && writeupState !== 'saved' && <span style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 600 }}>{writeupState}</span>}
                  </div>
                </>
              )}
            </Card>
          )}

          <Card title="Review">
            <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>
              {pending && 'Waiting for Jake or Paxton to review.'}
              {r.review_status === 'withdrawn' && 'Withdrawn by the requester.'}
              {(r.review_status === 'approved' || r.review_status === 'denied') && (
                <>
                  {r.review_status === 'approved' ? 'Approved' : 'Denied'} by {people[r.reviewed_by_admin_id] || (r.imported ? 'the sheet' : 'a former admin')}
                  {r.reviewed_at ? `, ${fmtDateTime(r.reviewed_at)}` : ''}
                </>
              )}
            </div>
            {r.review_status === 'denied' && r.review_note && (
              <div style={{ marginTop: '8px', padding: '9px 11px', borderRadius: '8px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', fontSize: '13px', color: 'var(--vfo-ink)', overflowWrap: 'anywhere' }}>
                Reason: {r.review_note}
              </div>
            )}
            {canManage && pending && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                <button style={btnState(btnPrimary, busy)} disabled={busy} onClick={onApprove}>Approve</button>
                <button style={btnState(btnDanger, busy)} disabled={busy} onClick={onDeny}>Deny</button>
              </div>
            )}
            {canManage && r.review_status === 'denied' && (
              <button style={{ ...btnState(btnSecondary, busy), marginTop: '12px' }} disabled={busy} onClick={onReopen}>Reopen</button>
            )}
          </Card>

          {canManage && onBoard && (
            <Card title="Move">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={fieldLabel} htmlFor="backlog-move-to">Move to</label>
                  <select id="backlog-move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={inputStyle}>
                    {Object.entries(PROGRESS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel} htmlFor="backlog-assign">Assign to</label>
                  <select id="backlog-assign" value={moveTo === 'ready_to_announce' ? (r.assignee_admin_id ?? '') : assignTo}
                    disabled={moveTo === 'ready_to_announce'} onChange={(e) => setAssignTo(e.target.value)} style={inputStyle}>
                    <option value="">No one (Unassigned)</option>
                    {assignees.map((a) => <option key={a.admin_id} value={a.admin_id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              {!moveValid && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '8px' }}>Only To do can be unassigned.</div>}
              <button style={{ ...btnState(btnPrimary, busy || !moveValid || !moveChanged), marginTop: '12px' }} disabled={busy || !moveValid || !moveChanged}
                onClick={() => onMove(moveTo, moveAssignee)}>Move</button>
            </Card>
          )}

          {(isReady || r.archived_at) && (
            <Card title="Announcement">
              {r.archived_at ? (
                <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: 1.6 }}>
                  <div>Announced on <strong>{fmtDate(r.announced_on)}</strong></div>
                  {r.announce_note && <div style={{ overflowWrap: 'anywhere' }}>{r.announce_note}</div>}
                  <div style={{ color: 'var(--vfo-muted)' }}>Archived by {people[r.archived_by_admin_id] || 'a former admin'}, {fmtDateTime(r.archived_at)}</div>
                  {canManage && <button style={{ ...btnState(btnSecondary, busy), marginTop: '10px' }} disabled={busy} onClick={onRestore}>Restore</button>}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Ready to announce. Archive it once it has been announced.</div>
                  <button style={{ ...btnSecondary, marginTop: '10px' }} onClick={onArchive}>Archive</button>
                </>
              )}
            </Card>
          )}

          <Card title="History">
            <History request={r} people={people} />
          </Card>
        </div>
      </aside>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '14px 16px' }}>
      {title && <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>{title}</div>}
      {children}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-faint)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', marginTop: '2px' }}>{value}</div>
    </div>
  )
}

const EVENT_LABEL = {
  created: 'Submitted the request',
  edited: 'Edited',
  withdrawn: 'Withdrew the request',
  approved: 'Approved',
  denied: 'Denied',
  reopened: 'Reopened for review',
  moved: 'Moved',
  reordered: 'Reordered within the column',
  writeup: 'Updated the write-up',
  archived: 'Archived',
  restored: 'Restored from the archive',
  imported: 'Imported from sheet',
}

const FIELD_NAMES = { title: 'title', request_text: 'description', departments: 'departments', urgency: 'urgency', importance: 'importance', requested_assignee_admin_id: 'assign to' }

function describe(e, people) {
  const col = (v) => { const c = parseColumn(v); return columnName(c.progress, c.assignee, people) }
  if (e.kind === 'moved') return `Moved from ${col(e.from_value)} to ${col(e.to_value)}`
  if (e.kind === 'approved' && e.to_value) return `Approved into ${col(e.to_value)}`
  if (e.kind === 'edited' && e.note) return `Edited ${e.note.split(', ').map((f) => FIELD_NAMES[f] || f).join(', ')}`
  if (e.kind === 'archived') return `Archived, announced on ${fmtDate(e.to_value)}`
  if (e.kind === 'writeup' && e.note === 'cleared') return 'Cleared the write-up'
  return EVENT_LABEL[e.kind] || e.kind
}

function History({ request, people }) {
  const events = request.events || []
  if (events.length === 0) return <div style={{ fontSize: '13px', color: 'var(--vfo-faint)' }}>No history yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--vfo-primary)', marginTop: '5px' }} />
            {i < events.length - 1 && <span style={{ width: '2px', flex: 1, background: 'var(--vfo-border-soft)', marginTop: '3px' }} />}
          </div>
          <div style={{ paddingBottom: '12px', minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{describe(e, people)}</div>
            {e.note && !['edited', 'writeup'].includes(e.kind) && (
              <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '2px', overflowWrap: 'anywhere' }}>{e.kind === 'reopened' ? `Was denied: ${e.note}` : e.note}</div>
            )}
            {e.kind === 'reopened' && !e.note && e.from_value && (
              <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '2px', overflowWrap: 'anywhere' }}>Was denied: {e.from_value}</div>
            )}
            {e.kind === 'restored' && e.from_value && (
              <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Had been announced on {fmtDate(e.from_value)}</div>
            )}
            <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '2px' }}>
              {e.kind === 'imported' ? 'Sheet import' : (people[e.actor_admin_id] || 'A former admin')} · {fmtDateTime(e.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
