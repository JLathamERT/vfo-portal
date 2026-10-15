import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { EmailTemplatesSkeleton } from '../shared/Skeleton'

// Notification Editor — the notifications sibling of Email Templates. Every
// in-portal bell notification (and every sweep reminder email's timing) is a
// row in notification_rules; this panel edits WHO receives it, WHEN a
// sweep-driven one fires (days), and whether it fires at all. Leaving
// recipients empty means "system default" (the routing the code ships with).

const AREA_ORDER = [
  'MAP 1',
  'Tax',
  'PIP Meetings',
  'Regular Priorities (MAP 4)',
  'Advisor Onboarding',
  'Accountant Onboarding',
  'Specialist Onboarding',
  'Partnership Fast Track',
  'Growth Plan',
  'VFO Specialist Revenue',
  'Uploads',
  'Payment Failure Alerts',
]

// Dynamic tokens resolve per-event on the backend (utils/notify.ts). 'admin'
// and 'all' are the shared-bell routing values the notifications table uses.
const SPECIAL_RECIPIENTS = [
  { value: 'admin', label: 'All Admins', hint: 'the shared admin bell (every admin sees it)' },
  { value: 'ASSIGNED_PF', label: 'Assigned PF', hint: "resolves to the client's assigned PF at send time" },
  { value: 'TEAM_MEMBER', label: 'Team Member', hint: "resolves to the onboarding's team member at send time" },
  { value: 'ASSIGNED_ADMIN', label: 'Assigned Admin', hint: 'resolves to the growth plan’s assigned admin at send time' },
]
const TOKEN_LABELS = Object.fromEntries(SPECIAL_RECIPIENTS.map(s => [s.value, s.label]))
TOKEN_LABELS['all'] = 'Everyone'
// Audience placeholders used by reminder-email rules (recipients not editable).
const AUDIENCE_LABELS = { CLIENT: 'The client', ADVISOR: 'The advisor', ACCOUNTANT: 'The accountant', SPECIALIST: 'The specialist', MEMBER: 'The member' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function recipientLabel(value, adminsByEmail) {
  if (TOKEN_LABELS[value]) return TOKEN_LABELS[value]
  if (AUDIENCE_LABELS[value]) return AUDIENCE_LABELS[value]
  const admin = adminsByEmail[value]
  return admin ? `${admin.name} (${value})` : value
}

function TypeBadge({ rule }) {
  if (rule.kind === 'email') {
    return <span style={{ fontSize: '9px', fontWeight: 700, color: '#9333ea', background: 'rgba(147,51,234,0.12)', border: '1px solid rgba(147,51,234,0.35)', padding: '2px 7px', borderRadius: '999px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>REMINDER EMAIL</span>
  }
  if (rule.action_required) {
    return <span style={{ fontSize: '9px', fontWeight: 700, color: '#e06717', background: 'rgba(224,103,23,0.12)', border: '1px solid rgba(224,103,23,0.35)', padding: '2px 7px', borderRadius: '999px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>ACTION REQUIRED</span>
  }
  return <span style={{ fontSize: '9px', fontWeight: 700, color: '#0095ff', background: 'rgba(0,149,255,0.12)', border: '1px solid rgba(0,149,255,0.35)', padding: '2px 7px', borderRadius: '999px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>FYI</span>
}

function RuleCard({ rule, admins, adminsByEmail, onSaved }) {
  const [expanded, setExpanded] = useState(false)
  const isOverridden = Array.isArray(rule.recipients) && rule.recipients.length > 0
  const [recipients, setRecipients] = useState(isOverridden ? rule.recipients : (rule.default_recipients || []))
  const [delay, setDelay] = useState(rule.delay_days ?? rule.default_delay_days ?? '')
  const [enabled, setEnabled] = useState(rule.enabled !== false)
  const [customEmail, setCustomEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  const editableRecipients = rule.kind !== 'email'
  const hasDelay = rule.default_delay_days != null
  const effective = isOverridden ? rule.recipients : (rule.default_recipients || [])

  function addRecipient(v) {
    const val = (v || '').trim()
    if (!val || recipients.includes(val)) return
    setRecipients([...recipients, val])
  }
  function addCustom() {
    const e = customEmail.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) { setErr('Enter a valid email'); return }
    setErr('')
    addRecipient(e)
    setCustomEmail('')
  }

  async function save(resetToDefault = false) {
    setSaving(true); setErr(''); setSavedMsg('')
    try {
      const payload = { key: rule.key, enabled }
      if (editableRecipients) {
        payload.recipients = resetToDefault ? null : recipients
      }
      if (hasDelay) {
        payload.delay_days = resetToDefault || delay === '' ? null : Number(delay)
      }
      const data = await callApi('notification_rules_save', payload)
      const saved = data.rule || {}
      rule.recipients = saved.recipients ?? null
      rule.delay_days = saved.delay_days ?? null
      rule.enabled = saved.enabled !== false
      if (resetToDefault) {
        setRecipients(rule.default_recipients || [])
        setDelay(rule.default_delay_days ?? '')
      }
      setSavedMsg(resetToDefault ? 'Reset to default' : 'Saved')
      setTimeout(() => setSavedMsg(''), 2500)
      onSaved()
    } catch (e) { setErr(e.message || String(e)) }
    finally { setSaving(false) }
  }

  const disabled = rule.enabled === false
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '10px', marginBottom: '8px', overflow: 'hidden', opacity: disabled ? 0.55 : 1 }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', cursor: 'pointer', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
          <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rule.label}</span>
          <TypeBadge rule={rule} />
          {disabled && <span style={{ fontSize: '9px', fontWeight: 700, color: '#d93025', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>OFF</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '38%' }}>
          {(rule.delay_days ?? rule.default_delay_days) != null && `${rule.delay_days ?? rule.default_delay_days} bus. day${Number(rule.delay_days ?? rule.default_delay_days) === 1 ? '' : 's'} · `}
          {effective.map(r => recipientLabel(r, adminsByEmail).split(' (')[0]).join(', ')}
          {isOverridden && <span style={{ color: '#e06717', fontWeight: 700 }}> · edited</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', margin: '12px 0' }}>{rule.description}</p>

          {editableRecipients ? (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#0095ff', display: 'block', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.4px' }}>
                RECIPIENTS {isOverridden ? '(custom)' : '(system default)'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {recipients.length === 0 && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>None — saving like this restores the system default</span>}
                {recipients.map(r => (
                  <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: TOKEN_LABELS[r] ? 'rgba(147,51,234,0.12)' : 'rgba(0,149,255,0.12)', color: TOKEN_LABELS[r] ? '#9333ea' : '#0095ff', border: TOKEN_LABELS[r] ? '1px solid rgba(147,51,234,0.4)' : '1px solid rgba(0,149,255,0.4)' }}>
                    {recipientLabel(r, adminsByEmail)}
                    <button onClick={() => setRecipients(recipients.filter(x => x !== r))} title="Remove"
                      style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, opacity: 0.8 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value="" onChange={e => { if (e.target.value) addRecipient(e.target.value) }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                  <option value="">Add recipient…</option>
                  <optgroup label="Special">
                    {SPECIAL_RECIPIENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </optgroup>
                  <optgroup label="Admins">
                    {admins.map(a => <option key={a.email} value={a.email}>{a.name} ({a.email})</option>)}
                  </optgroup>
                </select>
                <input value={customEmail} placeholder="or any email…"
                  onChange={e => { setCustomEmail(e.target.value); setErr('') }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif', width: '190px' }} />
                <button onClick={addCustom} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.1)', color: '#0095ff' }}>Add</button>
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--vfo-faint)', marginTop: '6px' }}>
                Default: {(rule.default_recipients || []).map(r => recipientLabel(r, adminsByEmail)).join(', ') || 'none'}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--vfo-muted)' }}>
              Goes to: <strong style={{ color: 'var(--vfo-ink)' }}>{(rule.default_recipients || []).map(r => recipientLabel(r, adminsByEmail)).join(', ')}</strong> — the audience is fixed for reminder emails; edit its wording in Email Templates.
            </div>
          )}

          <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            {hasDelay && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--vfo-ink)' }}>
                Fires after
                <input type="number" min="0" max="365" step="0.5" value={delay}
                  onChange={e => setDelay(e.target.value)}
                  style={{ width: '64px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px' }} />
                business day(s) <span style={{ color: 'var(--vfo-faint)', fontSize: '11px' }}>(default {rule.default_delay_days})</span>
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => save(false)} disabled={saving}
              style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: saving ? 'default' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => save(true)} disabled={saving}
              style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: saving ? 'default' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontWeight: 600 }}>
              Reset to default
            </button>
            {savedMsg && <span style={{ fontSize: '12px', color: 'var(--vfo-success-text)', fontWeight: 600 }}>{savedMsg}</span>}
            {err && <span style={{ fontSize: '12px', color: '#d93025', fontWeight: 600 }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function NotificationEditorPanel() {
  const [rules, setRules] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState(() => new Set())
  const [, forceRender] = useState(0)

  function toggleSection(key) {
    setOpenSections(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await callApi('notification_rules_load')
      setRules(data.rules || [])
      setAdmins(data.admins || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (loading) return <EmailTemplatesSkeleton />

  const adminsByEmail = Object.fromEntries(admins.map(a => [a.email, a]))
  const byArea = {}
  rules.forEach(r => { (byArea[r.area] = byArea[r.area] || []).push(r) })
  const areas = [
    ...AREA_ORDER.filter(a => byArea[a]),
    ...Object.keys(byArea).filter(a => !AREA_ORDER.includes(a)).sort(),
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '24px', color: 'var(--vfo-ink)', margin: '0 0 8px 0' }}>Notification Editor</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Every in-portal bell notification, grouped by pipeline. Expand a notification to change who receives it, how many days a
        follow-up waits before firing, or to switch it off. FYI notifications have a Done button in the bell; ACTION REQUIRED ones
        only clear when the task is completed. REMINDER EMAIL rows control the timing of automated reminder emails (their wording
        lives in Email Templates). "Edited" rows are shown with an orange marker; Reset to default restores the built-in routing.
      </p>

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {areas.map(area => {
        const rows = byArea[area]
        const open = openSections.has(area)
        const editedCount = rows.filter(r => (Array.isArray(r.recipients) && r.recipients.length) || r.delay_days != null || r.enabled === false).length
        return (
          <div key={area} style={{ marginBottom: '10px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: '0 2px 8px rgba(20,45,95,0.04)' }}>
            <div onClick={() => toggleSection(area)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', background: open ? '#eef4fd' : 'var(--vfo-input)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', color: '#0095ff', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{area}</span>
                {editedCount > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: '#e06717' }}>{editedCount} edited</span>}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{rows.length}</span>
            </div>
            {open && (
              <div style={{ padding: '14px 18px 8px' }}>
                {rows.map(rule => (
                  <RuleCard key={rule.key} rule={rule} admins={admins} adminsByEmail={adminsByEmail} onSaved={() => forceRender(x => x + 1)} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
