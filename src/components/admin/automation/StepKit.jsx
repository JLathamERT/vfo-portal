// Shared presentation kit for the admin automation panels (MAP 1, Tax, PIP,
import { readable } from '../../shared/readableColor'
// Advisor, Accountant). Each pipeline step renders as a StepCard with a
// status pill + status-colored rail, and a body of labeled sub-blocks
// (WHAT WE DID / INFO ENTERED / SENT / CLIENT REPLY) so every step makes
// clear what was triggered, what info was entered, what was sent, and how the
// client / counterparty replied. Presentation only — no behavior.

// ---- status vocabulary --------------------------------------------------
// Order matters for the rail colors; pick the status per step in the panel.
export const STATUS = {
  pending:  { label: 'Pending',         color: 'var(--vfo-muted)' },
  active:   { label: 'In progress',     color: '#e06717' },
  sent:     { label: 'Sent',            color: '#0d9488' },
  awaiting: { label: 'Awaiting client', color: '#0095ff' },
  done:     { label: 'Done',            color: '#1b9254' },
  declined: { label: 'Declined',        color: '#e74c3c' },
  skipped:  { label: 'Skipped',         color: 'var(--vfo-muted)' },
}

const DECISION_COLORS = {
  Yes: '#1b9254', Proceed: '#1b9254', Continue: '#1b9254', Confirmed: '#1b9254',
  No: '#e74c3c', Decline: '#e74c3c', Declined: '#e74c3c', Stop: '#e74c3c', Refund: '#e74c3c',
  Undecided: '#e06717', ExtraMeeting: '#0095ff',
}

// ---- formatting helpers -------------------------------------------------
export function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  if (isNaN(n)) return null
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(v) {
  if (!v) return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  return String(v)
}

// ---- atoms --------------------------------------------------------------
export function StatusPill({ status, label }) {
  const s = STATUS[status] || STATUS.pending
  const filled = status === 'done' || status === 'declined'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
      background: filled ? s.color : `${s.color}16`,
      color: filled ? '#ffffff' : s.color,
      border: filled ? '1px solid transparent' : `1px solid ${s.color}38`,
    }}>{label || s.label}</span>
  )
}

export function Badge({ text, color }) {
  if (text === null || text === undefined || text === '') return null
  const c = color || DECISION_COLORS[text] || 'var(--vfo-muted)'
  return (
    <span style={{
      fontSize: '11px', padding: '3px 10px', borderRadius: '999px', fontWeight: 600,
      background: `${c}15`, color: readable(c), border: `1px solid ${c}30`,
    }}>{text}</span>
  )
}

// A single label/value row. Hidden when `hide` or (value empty AND not showEmpty).
export function Detail({ l, v, hide, showEmpty, mono }) {
  if (hide) return null
  if ((v === null || v === undefined || v === '') && !showEmpty) return null
  return (
    <div style={{ display: 'flex', padding: '2px 0', alignItems: 'baseline' }}>
      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '180px', flexShrink: 0 }}>{l}</span>
      <span style={{
        fontSize: '12px', color: (v || v === 0) ? 'var(--vfo-ink-2)' : 'var(--vfo-faint)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        wordBreak: 'break-word',
      }}>{(v || v === 0) ? v : '—'}</span>
    </div>
  )
}

// A labeled sub-block (WHAT WE DID / INFO ENTERED / SENT / CLIENT REPLY).
// Renders nothing when it has no children.
export function SubBlock({ label, children, hide }) {
  if (hide) return null
  const kids = Array.isArray(children) ? children.filter(Boolean) : children
  if (!kids || (Array.isArray(kids) && kids.length === 0)) return null
  return (
    <div style={{ marginTop: '8px' }}>
      {label && (
        <div style={{
          fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
          color: 'var(--vfo-faint)', marginBottom: '3px',
        }}>{label}</div>
      )}
      <div style={{ paddingLeft: '2px' }}>{kids}</div>
    </div>
  )
}

// Muted "nothing yet" line for a step that hasn't been reached.
export function Pending({ text = 'Not started yet' }) {
  return <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>{text}</span>
}

// ---- panel hero -----------------------------------------------------------
// Designed header card for an automation panel: gradient accent strip,
// eyebrow + navy title, right-side action slot (sandbox toggle, selects),
// and the panel's stat counters as a divided row. Presentation only.
export function PanelHero({ eyebrow = 'Automation Pipeline', title, action, stats }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '20px', overflow: 'hidden' }}>
      <div style={{ height: '4px', background: 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)' }} />
      <div style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '5px' }}>{eyebrow}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1.15 }}>{title}</div>
          </div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>{action}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--vfo-tint)' }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ padding: '2px 22px 2px 0', marginRight: '22px', borderRight: i < stats.length - 1 ? '1px solid var(--vfo-tint)' : 'none' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', color: s.color || 'var(--vfo-heading)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--vfo-muted)', letterSpacing: '1px', marginTop: '4px', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Designed empty state for a panel with no rows yet.
export function EmptyState({ title, hint }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--vfo-tint)', borderRadius: '14px', border: '1px solid var(--vfo-border-chip)' }}>
      <div style={{ color: 'var(--vfo-ink)', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{title}</div>
      {hint && <div style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>{hint}</div>}
    </div>
  )
}

// White card wrapper for the pipeline tables (horizontal scroll inside).
export function TableCard({ children }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  )
}

// ---- the step card ------------------------------------------------------
export function StepCard({ title, status = 'pending', children }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <div style={{
      position: 'relative',
      background: 'var(--vfo-card)',
      border: '1px solid var(--vfo-tint)',
      borderLeft: `4px solid ${s.color}`,
      borderRadius: '12px',
      padding: '13px 16px',
      marginBottom: '10px',
      boxShadow: '0 2px 8px rgba(20,45,95,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <span style={{
            width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
            background: status === 'pending' ? 'transparent' : s.color,
            border: `2px solid ${s.color}`,
          }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)', letterSpacing: '0.2px' }}>{title}</span>
        </div>
        <StatusPill status={status} />
      </div>
      <div style={{ paddingLeft: '18px' }}>{children}</div>
    </div>
  )
}
