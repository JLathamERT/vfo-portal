import VfoWordmark from './VfoWordmark'
import NotificationBell from '../NotificationBell'

// The ONE portal top bar (2026-10-20): every portal page and the client page draw
// this, so the bar and its buttons are identical wherever you are. The page's nav
// bar goes in `children` and sticks WITH the bar, so neither scrolls away.
// The buttons deliberately carry no fontFamily - the portal pages never set one,
// and a different font on one page is what made the right-hand group shift.
// actions: [{ key, label, onClick, tone?: 'gold', active?: bool }]
export default function PortalHeader({ name, onTitleClick, actions = [], showBell = true, children = null }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Above the nav bar inside this block, so the bell's dropdown paints over it. */}
      <div style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', position: 'relative', zIndex: 2, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={17} light onClick={onTitleClick} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showBell && <NotificationBell />}
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || ''}</span>
          {actions.map(a => (
            <button key={a.key} onClick={a.onClick}
              style={a.tone === 'gold'
                ? { padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,205,150,0.5)', background: 'transparent', color: '#ffd9a0', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }
                : { padding: '6px 16px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.32)', background: a.active ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {children && <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>}
    </div>
  )
}
