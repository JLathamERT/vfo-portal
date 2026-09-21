import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getSession } from '../lib/api'
 
// The "View all" link opens /admin?tab=notifications, a page only the admin
// portal has. Portals that mount the bell without one hide the link.
const VIEW_ALL_HIDDEN_ROLES = ['tax_planner', 'member']

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
 
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])
 
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Let an admin action that changes notifications (e.g. saving reviewer notes,
  // which clears a non-dismissible request) refresh the bell immediately rather
  // than waiting for the next 30s poll.
  useEffect(() => {
    function onChanged() { loadNotifications() }
    window.addEventListener('vfo:notifications-changed', onChanged)
    return () => window.removeEventListener('vfo:notifications-changed', onChanged)
  }, [])
 
  async function loadNotifications() {
    try {
      const data = await callApi('load_notifications')
      setNotifications(data.notifications || [])
    } catch (err) { console.error('Notification load error:', err) }
  }
 
  async function handleClick(notif) {
    setOpen(false)
    // A click IS the action for FYI (dismissible) notifications — mark it read.
    // Action-required (non-dismissible) ones only clear when the action completes.
    // The mark must COMPLETE before navigating: the destination page mounts its
    // own bell whose load otherwise races this write and resurrects the row.
    if (notif.dismissible !== false) {
      setNotifications(prev => prev.filter(x => x.id !== notif.id))
      try {
        await callApi('mark_notification_read', { notification_id: notif.id })
      } catch (err) { console.error('mark read error:', err) }
    }
    if (notif.link) {
      // Append a changing nonce so navigating to the SAME link still re-triggers
      // the destination's location.search-based deep-link effect every time
      // (without it, a second click on the same target is a no-op).
      const sep = notif.link.includes('?') ? '&' : '?'
      navigate(`${notif.link}${sep}_n=${Date.now()}`)
    }
  }
 
  async function markAllRead() {
    setLoading(true)
    try {
      // Action-required (non-dismissible) rows are excluded — they only clear
      // when the underlying task completes (the backend refuses them too).
      const dismissibles = notifications.filter(n => n.dismissible !== false)
      await Promise.all(dismissibles.map(n => callApi('mark_notification_read', { notification_id: n.id })))
      setNotifications(prev => prev.filter(n => n.dismissible === false))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
 
  const count = notifications.length
  const actionCount = notifications.filter(n => n.dismissible === false).length
  // Action-required rows surface first; within each group keep the API's
  // newest-first ordering.
  const sorted = [...notifications].sort((a, b) => {
    const aAct = a.dismissible === false ? 0 : 1
    const bAct = b.dismissible === false ? 0 : 1
    return aAct - bAct
  })

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        style={{
          position: 'relative', background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px',
            background: actionCount > 0 ? '#e06717' : '#fb895a', color: '#fff', fontSize: '10px', fontWeight: '700',
            borderRadius: '50%', width: '17px', height: '17px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(20,45,95,0.35)'
          }}>{count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '8px',
          background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)',
          borderRadius: '10px', width: '480px', maxWidth: 'calc(100vw - 32px)', maxHeight: '420px', overflowY: 'auto',
          zIndex: 300, boxShadow: '0 8px 32px rgba(20,45,95,0.25)'
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--vfo-tint-deep)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--vfo-ink)' }}>
              Notifications
              {actionCount > 0 && (
                <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, color: '#e06717' }}>
                  {actionCount} need{actionCount === 1 ? 's' : ''} action
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!VIEW_ALL_HIDDEN_ROLES.includes(getSession()?.role) && (
                <button
                  onClick={() => { setOpen(false); navigate(`/admin?tab=notifications&_n=${Date.now()}`) }}
                  style={{ background: 'transparent', border: 'none', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  View all
                </button>
              )}
              {count > 0 && (
                <button onClick={markAllRead} disabled={loading}
                  style={{ background: 'transparent', border: 'none', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  Mark all read
                </button>
              )}
            </span>
          </div>

          {count === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '13px' }}>
              No new notifications
            </div>
          ) : (
            sorted.map(n => {
              const isDismissible = n.dismissible !== false
              const isReminder = n.pipeline === 'REMINDER'
              const handleDone = async (e) => {
                e.stopPropagation()
                try {
                  await callApi('mark_notification_read', { notification_id: n.id })
                  setNotifications(prev => prev.filter(x => x.id !== n.id))
                } catch (err) { console.error('mark read error:', err) }
              }
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '8px 12px 8px 9px', borderBottom: '1px solid var(--vfo-tint)',
                    borderLeft: !isDismissible ? '3px solid #e06717' : isReminder ? '3px solid #7c3aed' : '3px solid transparent',
                    background: !isDismissible ? 'rgba(224,103,23,0.06)' : isReminder ? 'rgba(124,58,237,0.05)' : 'transparent',
                    cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                  onMouseLeave={e => e.currentTarget.style.background = !isDismissible ? 'rgba(224,103,23,0.06)' : isReminder ? 'rgba(124,58,237,0.05)' : 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12.5px', color: 'var(--vfo-ink)', fontWeight: 600, marginBottom: '3px', lineHeight: '1.35'
                    }}>{n.title}</div>
                    {n.message && (
                      <div style={{
                        fontSize: '11.5px', color: 'var(--vfo-muted)', lineHeight: '1.45',
                        marginBottom: '5px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'
                      }}>{n.message}</div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {!isDismissible && (
                        <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: '#e06717', letterSpacing: '0.4px' }}>ACTION</span>
                      )}
                      {isReminder && (
                        <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: '#7c3aed', letterSpacing: '0.4px' }}>REMINDER</span>
                      )}
                      {n.pipeline && !isReminder && <span style={{ fontSize: '10px', color: '#0095ff', fontWeight: 600, padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,149,255,0.15)' }}>{n.pipeline}</span>}
                      <span style={{ fontSize: '10px', color: 'var(--vfo-faint)' }}>{n.created_at?.split('T')[0]}</span>
                    </div>
                  </div>
                  {isDismissible && (
                    <button
                      onClick={handleDone}
                      style={{
                        padding: '3px 9px', borderRadius: '4px', fontSize: '10.5px',
                        border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)',
                        color: '#1b9254', fontWeight: 600, cursor: 'pointer', flexShrink: 0
                      }}
                    >Done</button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}