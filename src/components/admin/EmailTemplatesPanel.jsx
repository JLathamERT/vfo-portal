import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { EmailTemplatesSkeleton } from '../shared/Skeleton'
import { TEMPLATE_META, ROLE_LABELS } from '../shared/templateMeta'

// Program sections — same six that have automation tabs. The standalone Tax
// Planning program shares the TAX templates with Holistic Tax Priorities, so
// both sections list the same rows (editing one affects both).
const SECTIONS = [
  { key: 'map1', label: 'Holistic Planning - MAP 1', pipeline: 'MAP 1' },
  { key: 'tax_holistic', label: 'Holistic Planning - Tax Priorities', pipeline: 'TAX', sharedNote: true },
  { key: 'tax_standalone', label: 'Tax Planning', pipeline: 'TAX', sharedNote: true },
  { key: 'pip', label: 'Holistic Planning - PIP Meetings', pipeline: 'PIP' },
  { key: 'regular', label: 'Holistic Planning - Regular Priorities', pipeline: 'REGULAR' },
  { key: 'advisor', label: 'Advisor Onboarding', pipeline: 'ADVISOR_ONBOARDING' },
  { key: 'accountant', label: 'Accountant Onboarding', pipeline: 'ACCOUNTANT_ONBOARDING' },
  { key: 'specialist', label: 'Specialist Onboarding', pipeline: 'SPECIALIST_ONBOARDING' },
  { key: 'specialist_continuation', label: 'Specialist License Fee Continuation', pipeline: 'SPECIALIST_LICENSE_CONTINUATION' },
  { key: 'specialist_bg_check', label: 'Specialist Background Check Requests', pipeline: 'SPECIALIST_BG_CHECK' },
  { key: 'specialist_revenue', label: 'VFO Specialist Revenue', pipeline: 'VFO_SPECIALIST_REVENUE' },
  { key: 'client_continuation', label: 'Client Payment Continuation', pipeline: 'CLIENT_PAYMENT_CONTINUATION' },
  { key: 'member_membership', label: 'Member Membership Fees', pipeline: 'MEMBER_MEMBERSHIP_FEES' },
  { key: 'pft', label: 'Partnership Fast Track', pipeline: 'PARTNERSHIP_FAST_TRACK' },
  { key: 'growth_credits', label: 'Growth Credits', pipeline: 'GROWTH_CREDITS' },
  // Miscellaneous — standalone, non-pipeline emails grouped together (each row
  // is an explicit [pipeline, template_name] ref rather than a whole pipeline).
  { key: 'misc', label: 'Miscellaneous', items: [
    ['TEAM', 'new_model_sale'],
    ['PAYMENTS', 'card_update'],
    ['LOGIN_SETUP', 'MANUAL_login_setup'],
    ['LOGIN_SETUP', 'password_reset'],
    ['MEMBER_PAYOUT', 'member_connect_setup'],
    ['SPECIALIST_PAYOUT', 'specialist_connect_setup'],
    ['STRATEGIC', 'strategic_group_connect_setup'],
    ['STRATEGIC', 'strategic_partner_revshare'],
    ['VAULT', 'VAULT_request_documentation'],
    ['MEMBERS', 'MEMBER_revshare_held'],
    ['MEMBERS', 'MEMBER_revshare_held_arrears'],
  ] },
]

// Resolve [label, recipients] for a (pipeline, template_name) pair.
function metaFor(pipeline, name) {
  const hit = (TEMPLATE_META[pipeline] || []).find(([n]) => n === name)
  return hit ? { label: hit[1], recip: hit[2] } : { label: name, recip: '' }
}

const ROLE_TOKENS = Object.keys(ROLE_LABELS)
const isRoleToken = v => ROLE_TOKENS.includes(v)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Commit an email that's still typed in the box (not yet "Add"-ed) into the list.
function withPending(emails, pending) {
  const e = (pending || '').trim().toLowerCase()
  if (e && EMAIL_RE.test(e) && !emails.includes(e)) return [...emails, e]
  return emails
}

const inputStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }

// Chip editor for a recipient list that can hold role tokens (Client, Member,
// Assigned PF, …) AND raw email addresses. Role chips render solid with their
// friendly label; emails render outlined. Unused roles appear as one-click
// "+ Role" suggestion chips.
function RecipientEditor({ title, accent, entries, onChange, input, setInput }) {
  const [warn, setWarn] = useState('')
  function add() {
    const e = input.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) { setWarn('Enter a valid email (roles are added with the + chips)'); return }
    if (entries.includes(e)) { setInput(''); setWarn(''); return }
    onChange([...entries, e]); setInput(''); setWarn('')
  }
  const unusedRoles = ROLE_TOKENS.filter(t => !entries.includes(t))
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '11px', color: accent, display: 'block', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.4px' }}>{title}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {entries.length === 0 && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>None</span>}
        {entries.map(e => isRoleToken(e) ? (
          <span key={e} title={e} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: accent, color: '#fff' }}>
            {ROLE_LABELS[e]}
            <button onClick={() => onChange(entries.filter(x => x !== e))} title="Remove"
              style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, opacity: 0.85 }}>×</button>
          </span>
        ) : (
          <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: `${accent}1f`, color: accent, border: `1px solid ${accent}66` }}>
            {e}
            <button onClick={() => onChange(entries.filter(x => x !== e))} title="Remove"
              style={{ border: 'none', background: 'transparent', color: accent, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, opacity: 0.8 }}>×</button>
          </span>
        ))}
      </div>
      {unusedRoles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '7px' }}>
          {unusedRoles.map(t => (
            <button key={t} onClick={() => onChange([...entries, t])} title={`Add ${ROLE_LABELS[t]}`}
              style={{ fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', cursor: 'pointer', background: 'var(--vfo-input)', color: 'var(--vfo-muted)', border: '1px dashed var(--vfo-border-strong)' }}>
              + {ROLE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px' }}>
        <input value={input} placeholder="name@elitert.com"
          onChange={e => { setInput(e.target.value); setWarn('') }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={() => { if (input.trim()) add() }}
          style={{ ...inputStyle, maxWidth: '280px' }} />
        <button onClick={add} style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${accent}66`, background: `${accent}1a`, color: accent, whiteSpace: 'nowrap' }}>Add</button>
      </div>
      {warn && <div style={{ fontSize: '11px', color: '#d93025', fontWeight: 600, marginTop: '4px' }}>{warn}</div>}
    </div>
  )
}

// The per-email Draft / Send switch. Draft = the email only lands in Jake's
// Gmail Drafts for manual review; Send = it goes out automatically.
function SendToggle({ sendMode, busy, onSet }) {
  const seg = (active, color) => ({
    padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
    border: 'none', letterSpacing: '0.3px',
    background: active ? color : 'transparent',
    color: active ? '#fff' : 'var(--vfo-muted)',
    opacity: busy ? 0.55 : 1,
  })
  return (
    <div onClick={e => e.stopPropagation()} title="Draft = lands in Gmail Drafts for review. Send = goes out automatically."
      style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--vfo-border-strong)', flexShrink: 0 }}>
      <button disabled={busy} onClick={() => { if (sendMode) onSet(false) }} style={seg(!sendMode, '#64748b')}>Draft</button>
      <button disabled={busy} onClick={() => { if (!sendMode) onSet(true) }} style={seg(sendMode, '#1b9254')}>Send</button>
    </div>
  )
}

function TemplateCard({ tmpl, label, onSendModeChange }) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(tmpl.subject || '')
  const [bodyText, setBodyText] = useState(tmpl.body || '')
  const [to, setTo] = useState(Array.isArray(tmpl.to_list) ? tmpl.to_list : [])
  const [cc, setCc] = useState(Array.isArray(tmpl.cc_list) ? tmpl.cc_list : [])
  const [bcc, setBcc] = useState(Array.isArray(tmpl.bcc_list) ? tmpl.bcc_list : [])
  const [toInput, setToInput] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [bccInput, setBccInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [err, setErr] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  async function save() {
    setSaving(true); setErr(''); setSavedMsg('')
    try {
      // Flush any email still typed in a box but not yet "Add"-ed.
      const finalTo = withPending(to, toInput)
      const finalCc = withPending(cc, ccInput)
      const finalBcc = withPending(bcc, bccInput)
      setTo(finalTo); setCc(finalCc); setBcc(finalBcc); setToInput(''); setCcInput(''); setBccInput('')
      await callApi('automation_save_email_template', { id: tmpl.id, subject, body: bodyText, to_list: finalTo, cc_list: finalCc, bcc_list: finalBcc })
      tmpl.subject = subject; tmpl.body = bodyText; tmpl.to_list = finalTo; tmpl.cc_list = finalCc; tmpl.bcc_list = finalBcc
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2500)
    } catch (e) { setErr(e.message || String(e)) }
    finally { setSaving(false) }
  }

  async function setSendMode(next) {
    setToggleBusy(true); setErr('')
    try {
      await callApi('automation_save_email_template', { id: tmpl.id, send_mode: next })
      onSendModeChange([tmpl.id], next)
    } catch (e) { setErr(e.message || String(e)) }
    finally { setToggleBusy(false) }
  }

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '10px', marginBottom: '8px', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
          <span title={tmpl.template_name} style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 500 }}>{label}</span>
          {(cc.length > 0 || bcc.length > 0) && (
            <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', flexShrink: 0 }}>
              {cc.length > 0 && `${cc.length} cc`}{cc.length > 0 && bcc.length > 0 && ' · '}{bcc.length > 0 && `${bcc.length} bcc`}
            </span>
          )}
        </div>
        <SendToggle sendMode={tmpl.send_mode === true} busy={toggleBusy} onSet={setSendMode} />
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ marginTop: '14px' }}>
            <RecipientEditor title="TO — who this email is sent to" accent="#125ecc" entries={to} onChange={setTo} input={toInput} setInput={setToInput} />
            <RecipientEditor title="CC" accent="#0095ff" entries={cc} onChange={setCc} input={ccInput} setInput={setCcInput} />
            <RecipientEditor title="BCC" accent="#9333ea" entries={bcc} onChange={setBcc} input={bccInput} setInput={setBccInput} />
            <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>
              Role chips resolve per email when it fires (e.g. Client = that client's address); roles that don't apply are skipped. If TO ends up empty, the system falls back to the email's built-in recipient. Remember to press Save.
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--vfo-border-soft)', margin: '4px 0 12px' }} />

          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px' }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px' }}>Body (HTML)</label>
            <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={10} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '4px' }}>Preview</label>
            <div style={{ padding: '16px', background: 'var(--vfo-card)', borderRadius: '6px', color: '#333', fontSize: '14px', fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: bodyText }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={save} disabled={saving} style={{ padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: saving ? 'default' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            {savedMsg && <span style={{ fontSize: '12px', color: '#1b9254', fontWeight: 600 }}>{savedMsg}</span>}
            {err && <span style={{ fontSize: '12px', color: '#d93025', fontWeight: 600 }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState('')

  function toggleSection(key) {
    setOpenSections(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    try {
      const data = await callApi('automation_load_email_templates')
      setTemplates(data.templates || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  // Flip send_mode on a set of ids in local state (server already updated).
  function applySendMode(ids, mode) {
    const idSet = new Set(ids)
    setTemplates(prev => prev.map(t => idSet.has(t.id) ? { ...t, send_mode: mode } : t))
  }

  async function bulkSetSendMode(section, rows, mode) {
    const ids = rows.map(([t]) => t.id)
    if (ids.length === 0) return
    if (mode && !window.confirm(`Set all ${ids.length} emails in "${section.label}" to SEND mode?\n\nThey will go out automatically instead of appearing in Gmail Drafts for review.`)) return
    setBulkBusy(section.key); setError('')
    try {
      await callApi('automation_save_email_template', { ids, send_mode: mode })
      applySendMode(ids, mode)
    } catch (e) { setError(e.message || String(e)) }
    finally { setBulkBusy('') }
  }

  if (loading) return <EmailTemplatesSkeleton />

  // index templates by pipeline + template_name
  const byPipeline = {}
  templates.forEach(t => {
    if (!byPipeline[t.pipeline]) byPipeline[t.pipeline] = {}
    byPipeline[t.pipeline][t.template_name] = t
  })

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '24px', color: 'var(--vfo-ink)', margin: '0 0 8px 0' }}>Email Templates</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Emails are listed in the order they fire. Each email has a <strong>Draft / Send</strong> switch: Draft means it lands in Gmail Drafts for review before you send it yourself; Send means it goes out automatically. Use a section&rsquo;s &ldquo;All draft / All send&rdquo; buttons to set the whole group, then flip individual emails the other way if needed. Expand an email to edit <strong>who receives it</strong> (TO / CC / BCC — mix role chips like Client, Member, Assigned PF with real email addresses) plus its subject and body.
      </p>

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {SECTIONS.map(section => {
        // Each section is either a whole pipeline, or an explicit list of
        // [pipeline, template_name] refs (Miscellaneous). Build rows of [tmpl, meta].
        let rows
        if (section.items) {
          rows = section.items
            .map(([pipeline, name]) => { const t = byPipeline[pipeline]?.[name]; return t ? [t, metaFor(pipeline, name)] : null })
            .filter(Boolean)
        } else {
          const meta = TEMPLATE_META[section.pipeline] || []
          const inPipeline = byPipeline[section.pipeline] || {}
          const known = new Set(meta.map(([name]) => name))
          const orderedKnown = meta.filter(([name]) => inPipeline[name]).map(([name]) => [inPipeline[name], metaFor(section.pipeline, name)])
          const extras = Object.keys(inPipeline).filter(name => !known.has(name)).map(name => [inPipeline[name], { label: name, recip: '' }])
          rows = [...orderedKnown, ...extras]
        }
        const open = openSections.has(section.key)
        const sendCount = rows.filter(([t]) => t.send_mode === true).length
        const busy = bulkBusy === section.key

        return (
          <div key={section.key} style={{ marginBottom: '10px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: '0 2px 8px rgba(20,45,95,0.04)' }}>
            <div onClick={() => toggleSection(section.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', background: open ? '#eef4fd' : 'var(--vfo-input)', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: '#0095ff', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{section.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{rows.length}</span>
                {sendCount > 0 && (
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'rgba(27,146,84,0.12)', border: '1px solid rgba(27,146,84,0.4)', color: '#1b9254' }}>
                    {sendCount === rows.length ? 'all sending' : `${sendCount} sending`}
                  </span>
                )}
              </div>
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button disabled={busy} onClick={() => bulkSetSendMode(section, rows, false)}
                  style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-muted)', opacity: busy ? 0.6 : 1 }}>
                  All draft
                </button>
                <button disabled={busy} onClick={() => bulkSetSendMode(section, rows, true)}
                  style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', opacity: busy ? 0.6 : 1 }}>
                  All send
                </button>
              </div>
            </div>
            {open && (
              <div style={{ padding: '14px 18px 8px' }}>
                {section.sharedNote && (
                  <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginBottom: '12px', fontStyle: 'italic' }}>
                    Tax Priorities and Tax Planning share these templates — edits (and Draft/Send switches) apply to both.
                  </div>
                )}
                {rows.length === 0
                  ? <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', padding: '8px 0' }}>No templates.</div>
                  : rows.map(([t, m]) => (
                      <TemplateCard key={`${section.key}-${t.template_name}`} tmpl={t} label={m.label} onSendModeChange={applySendMode} />
                    ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
