import { useEffect } from 'react'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { fmtDate, isTask, placeLabel } from './backlogModel'
import BacklogDetails from './BacklogDetails'

// The request drawer (Tasks board, Archive): the blue header, then the request's
// details stacked in one column (BacklogDetails, which the Requests tab's row
// dropdowns share). Its Move to / Assign to selects do what dragging does, so a
// superadmin can move cards on a touch screen.
export default function BacklogDrawer({ request: r, people, onClose, ...details }) {
  const phone = useIsPhone()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,20,48,0.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <aside role="dialog" aria-label={isTask(r) ? 'Task' : 'Portal request'}
        style={{ width: phone ? '100%' : '480px', maxWidth: '100%', height: '100%', overflowY: 'auto', background: 'var(--vfo-page)', borderLeft: '1px solid var(--vfo-border-soft)', boxShadow: '-12px 0 40px rgba(0,20,60,0.2)', boxSizing: 'border-box' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'linear-gradient(120deg, #002973 0%, #0a3f9e 55%, #125ecc 100%)', color: '#ffffff', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.72 }}>{isTask(r) ? 'Task · ' : ''}{placeLabel(r, people)}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{r.title}</div>
              <div style={{ fontSize: '12.5px', opacity: 0.8, marginTop: '4px' }}>{r.requester_name} · {isTask(r) ? 'Added' : 'Requested'} {fmtDate(r.requested_on)}{r.imported ? ' · Imported from sheet' : ''}</div>
            </div>
            <button onClick={onClose} aria-label="Close" title="Close"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#ffffff', borderRadius: '50%', width: '30px', height: '30px', fontSize: '17px', lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
          </div>
        </div>

        <BacklogDetails request={r} people={people} layout="stack" {...details} />
      </aside>
    </div>
  )
}
