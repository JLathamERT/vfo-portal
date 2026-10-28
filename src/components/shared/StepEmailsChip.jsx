import { useEffect, useState } from 'react'
import { loadCachedAction, getSession } from '../../lib/api'
import { TEMPLATE_META, ROLE_LABELS } from './templateMeta'

const MEMBER_TWIN_SUFFIX = ' (member signing/paying on clients behalf)'
const TOKEN_RE = /\[([^\[\]<>]{1,60})\]/g

function tokenSpan(inner) {
  return `<span style="display:inline-block;padding:0 5px;border-radius:5px;background:var(--vfo-tint-deep);color:var(--vfo-heading);font-size:11px;">[${inner}]</span>`
}

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[\s_]+/g, '')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildNormContext(context) {
  const map = new Map()
  if (context && typeof context === 'object') {
    Object.keys(context).forEach(k => {
      const v = context[k]
      if (v === null || v === undefined) return
      const s = String(v)
      if (s === '') return
      map.set(normKey(k), s)
    })
  }
  return map
}

function renderTokens(html, normCtx) {
  const parts = String(html || '').split(/(<[^>]+>)/g)
  return parts
    .map(seg => {
      if (!seg) return seg
      if (seg.charAt(0) === '<') return seg
      return seg.replace(TOKEN_RE, (_m, inner) => {
        if (normCtx && normCtx.size) {
          const hit = normCtx.get(normKey(inner))
          if (hit) return escapeHtml(hit)
        }
        return tokenSpan(inner)
      })
    })
    .join('')
}

function metaLabel(pipeline, name) {
  const hit = (TEMPLATE_META[pipeline] || []).find(([n]) => n === name)
  return hit ? hit[1] : ''
}

function friendlyRecip(v) {
  return ROLE_LABELS[v] || v
}

function recipLine(row) {
  const seg = []
  const fmt = list => (Array.isArray(list) ? list : []).map(friendlyRecip).join(', ')
  const to = fmt(row.to_list); if (to) seg.push('To: ' + to)
  const cc = fmt(row.cc_list); if (cc) seg.push('Cc: ' + cc)
  const bcc = fmt(row.bcc_list); if (bcc) seg.push('Bcc: ' + bcc)
  return seg.join(' · ')
}

const cardStyle = {
  background: 'var(--vfo-tint)',
  border: '1px solid var(--vfo-tint-deep)',
  borderRadius: '10px',
  padding: '14px 16px',
  marginBottom: '8px',
  fontFamily: 'Inter, sans-serif',
}

function EmailCard({ headerLabel, name, row, normCtx }) {
  if (!row) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{headerLabel}</div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '6px' }}>Template not found: {name}</div>
      </div>
    )
  }
  const recips = recipLine(row)
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{headerLabel}</div>
      {recips && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{recips}</div>}
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--vfo-muted)', marginTop: '10px' }}>Subject</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-heading)' }} dangerouslySetInnerHTML={{ __html: renderTokens(row.subject, normCtx) }} />
      <div style={{ maxHeight: '280px', overflowY: 'auto', fontSize: '12px', color: '#44557a', lineHeight: '1.55', marginTop: '8px' }} dangerouslySetInnerHTML={{ __html: renderTokens(row.body, normCtx) }} />
    </div>
  )
}

// Tiny inline "Emails (N)" tag that opens a centered mini-window listing every
// email a step can send. Mount it directly next to the step/label text.
// A client's My Progress tab (portal licensing L8) never lists the team's emails.
export default function StepEmailsChip(props) {
  if (getSession()?.role === 'client') return null
  return <StepEmailsChipInner {...props} />
}

function StepEmailsChipInner({ pipeline, templates, label = 'Emails', context, title = 'Emails for this step' }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open || rows || status === 'loading') return
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const data = await loadCachedAction('load_email_previews', { pipeline })
        if (cancelled) return
        setRows(Array.isArray(data?.templates) ? data.templates : [])
        setStatus('ready')
      } catch {
        try {
          const data = await loadCachedAction('automation_load_email_templates')
          if (cancelled) return
          const all = Array.isArray(data?.templates) ? data.templates : []
          setRows(all.filter(t => t.pipeline === pipeline && t.active !== false))
          setStatus('ready')
        } catch {
          if (cancelled) return
          setRows([])
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const list = Array.isArray(templates) ? templates : []
  const n = list.length
  const collapsedText = n > 1 ? `${label} (${n})` : label

  const byName = new Map()
  ;(rows || []).forEach(t => { byName.set(t.template_name, t) })

  const normCtx = buildNormContext(context)

  const cards = []
  list.forEach((entry, i) => {
    const name = entry.name
    const base = entry.when || metaLabel(pipeline, name) || name
    cards.push({ key: `${name}-${i}`, headerLabel: base, name, row: byName.get(name) })
    const twinName = name + MEMBER_TWIN_SUFFIX
    const twinRow = byName.get(twinName)
    if (twinRow) {
      cards.push({ key: `${twinName}-${i}`, headerLabel: base + " — member paying on client's behalf", name: twinName, row: twinRow })
    }
  })

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        style={{
          color: 'var(--vfo-muted)',
          background: 'transparent',
          border: '1px solid var(--vfo-border-soft)',
          fontSize: '9px',
          padding: '1px 7px',
          borderRadius: '999px',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          whiteSpace: 'nowrap',
          opacity: 0.8,
          verticalAlign: 'middle',
        }}
      >
        {collapsedText}
      </button>
      {open && (
        <div
          onClick={e => { e.stopPropagation(); setOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,40,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter, sans-serif' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: '0 18px 50px rgba(10,18,40,0.35)', maxWidth: '760px', width: '100%', maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{title}{cards.length > 1 ? ` (${cards.length})` : ''}</span>
              <button type="button" onClick={() => setOpen(false)} style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '11px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 18px' }}>
              {status === 'loading' && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Loading emails...</div>}
              {status === 'error' && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>Email previews unavailable for your login.</div>}
              {status === 'ready' && cards.map(c => (
                <EmailCard key={c.key} headerLabel={c.headerLabel} name={c.name} row={c.row} normCtx={normCtx} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
