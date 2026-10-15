import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import SandboxModeToggle from './SandboxModeToggle'
import { TableSkeleton } from '../shared/Skeleton'

// Automation & Config -> Growth Credits. Sandbox toggle for the GROWTH_CREDITS
// Stripe pipeline, the fixed purchase packages (server-enforced), and a service
// management table (name / description / category / team member / scheduling
// link / credit cost / active / remove). The allocated team member is who the
// redemption bell goes to and who is CC'd on the member's confirmation email.
// Remove is a hard delete and is refused server-side once a service has
// redemption history — Inactive is the retire-it path.

const PACKAGES = [
  { credits: 1, price: '$100', savings: null },
  { credits: 10, price: '$950', savings: 'Save 5%' },
  { credits: 20, price: '$1,800', savings: 'Save 10%' },
  { credits: 50, price: '$4,000', savings: 'Save 20%' },
]

const NAVY = '#002973'
const BLUE = '#125ecc'

// Sentinel option value — never a real category, so it cannot collide with one.
const ADD_NEW_CATEGORY = '__add_new_category__'

// A recurring service deducts its credit cost again every month/year until the
// member cancels; one_time is the historical (and default) behaviour.
const FREQUENCIES = [
  { value: 'one_time', label: '1 time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

// Category picker: the categories already in use, plus an escape hatch that
// swaps the select for a free-text box. Clearing that box and leaving it (or
// hitting the cancel affordance) returns to the list, so a mis-click is
// recoverable. An empty value means "no category" and is sent as null.
function CategoryField({ value, onChange, categories, input, disabled }) {
  const [typing, setTyping] = useState(false)

  if (typing) {
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          autoFocus
          style={input}
          placeholder="New category"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { if (!value.trim()) setTyping(false) }}
        />
        <button
          type="button"
          title="Back to the category list"
          onClick={() => { onChange(''); setTyping(false) }}
          style={{ flexShrink: 0, padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-muted)', fontSize: '12px', lineHeight: 1, cursor: 'pointer' }}>
          &times;
        </button>
      </div>
    )
  }

  return (
    <select
      style={input}
      value={value}
      disabled={disabled}
      onChange={e => {
        if (e.target.value === ADD_NEW_CATEGORY) { onChange(''); setTyping(true) }
        else onChange(e.target.value)
      }}>
      <option value="">— none —</option>
      {categories.map(c => <option key={c} value={c}>{c}</option>)}
      {value && !categories.includes(value) && <option value={value}>{value}</option>}
      <option value={ADD_NEW_CATEGORY}>+ Add new category…</option>
    </select>
  )
}

export default function GrowthCreditsPanel() {
  const [services, setServices] = useState([])
  const [admins, setAdmins] = useState([])
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [adding, setAdding] = useState({ name: '', description: '', category: '', billing_interval: 'one_time', credit_cost: '', allocated_admin_email: '', scheduling_link: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('gc_load_services', { include_inactive: true })
      if (res?.error) { setError(res.error); return }
      setServices(res.services || [])
      setAdmins(res.admins || [])
      setSandboxConfig(res.sandbox_config || { sandbox_mode: false })
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 4000) }

  async function saveService(svc, patch) {
    setBusy(true)
    try {
      // `in` rather than ??: clearing a field to null is a real edit, and ??
      // would quietly restore the old value instead. Anything the patch omits
      // travels at its current server value, so no sibling field is wiped.
      const pick = (key) => (key in patch ? patch[key] : svc[key])
      await callApi('gc_manage_service', {
        service_id: svc.id,
        name: pick('name'),
        description: pick('description'),
        category: pick('category'),
        billing_interval: pick('billing_interval') || 'one_time',
        credit_cost: pick('credit_cost'),
        active: pick('active'),
        allocated_admin_email: pick('allocated_admin_email') || null,
        scheduling_link: pick('scheduling_link') || null,
      })
      flash('Service updated.')
      await load()
    } catch (e) {
      flash('Error: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeService(svc) {
    setBusy(true)
    try {
      await callApi('gc_manage_service', { service_id: svc.id, mode: 'delete' })
      flash('Service removed.')
      await load()
    } catch (e) {
      // The backend returns a plain-English 400 when redemption history blocks
      // the delete; callApi surfaces it as the thrown message.
      flash('Error: ' + e.message)
    } finally {
      setBusy(false)
      setConfirmRemove(null)
    }
  }

  async function addService() {
    if (!adding.name || !adding.credit_cost) { flash('Name and credit cost are required.'); return }
    setBusy(true)
    try {
      await callApi('gc_manage_service', {
        name: adding.name,
        description: adding.description.trim() || null,
        category: adding.category.trim() || null,
        billing_interval: adding.billing_interval,
        credit_cost: parseInt(adding.credit_cost, 10),
        allocated_admin_email: adding.allocated_admin_email || null,
        scheduling_link: adding.scheduling_link || null,
      })
      setAdding({ name: '', description: '', category: '', billing_interval: 'one_time', credit_cost: '', allocated_admin_email: '', scheduling_link: '' })
      flash('Service added.')
      await load()
    } catch (e) {
      flash('Error: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const wrap = { padding: '24px', maxWidth: '1340px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '22px', marginBottom: '20px' }
  const cardTitle = { fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 16px', paddingBottom: '8px', borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }
  const input = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', width: '100%', boxSizing: 'border-box' }
  // Same tokens as `input`, but drag-to-grow vertically for long copy.
  const descBox = { ...input, fontSize: '11.5px', lineHeight: 1.45, resize: 'vertical', minHeight: '40px' }
  const cols = '1.5fr 0.8fr 1fr 1.05fr 96px 84px 56px 70px 82px'

  // Every category already in use, for the pickers. Sourced from the loaded
  // rows (the panel always loads include_inactive, so nothing is missed) —
  // a save that introduces a new one is followed by load(), which feeds it back.
  const categories = [...new Set((services || []).map(s => String(s.category || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))

  return (
    <div style={wrap}>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '10.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 4px' }}>Automation & Config</p>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Growth Credits</h2>
        </div>
        {sandboxConfig && (
          <SandboxModeToggle
            pipeline="GROWTH_CREDITS"
            label="Growth Credits"
            sandboxConfig={sandboxConfig}
            onChange={setSandboxConfig}
            note="This toggles the Stripe mode used for Growth Credit purchases only."
          />
        )}
      </div>

      {status && <div style={{ background: 'var(--vfo-accent-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-accent-text)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', marginBottom: '14px' }}>{status}</div>}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      <div style={card}>
        <div style={cardTitle}>Packages</div>
        <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 14px' }}>Purchase packages are fixed and enforced server-side (a member cannot alter the price).</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {PACKAGES.map(p => (
            <div key={p.credits} style={{ flex: 1, minWidth: '160px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-tint)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--vfo-ink)' }}>{p.credits}</div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--vfo-muted)', marginTop: '2px' }}>{p.credits === 1 ? 'credit' : 'credits'}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: BLUE, marginTop: '8px' }}>{p.price}</div>
              {p.savings && <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--vfo-muted)', marginTop: '2px' }}>{p.savings}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Services</div>
        {loading && <TableSkeleton cols={[2, 1, 1, 1, 1, 1, 1, 1]} rows={3} />}
        {!loading && !error && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '10px', padding: '8px 4px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <span>Name / Description</span><span>Category</span><span>Team Member</span><span>Scheduling Link</span><span>Frequency</span><span style={{ textAlign: 'right' }}>Credit Cost</span><span style={{ textAlign: 'center' }}>Active</span><span /><span />
            </div>
            {services.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px', color: 'var(--vfo-faint)', fontSize: '13px' }}>No services yet.</div>
            )}
            {services.map(svc => (
              <ServiceRow key={svc.id} svc={svc} cols={cols} input={input} descBox={descBox} busy={busy} admins={admins} categories={categories} onSave={saveService} onRemove={setConfirmRemove} />
            ))}

            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginBottom: '10px' }}>Add a service</div>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '10px', alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input style={input} placeholder="Name" value={adding.name} onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} />
                  <textarea rows={2} style={descBox} placeholder="Description (optional)" value={adding.description} onChange={e => setAdding(a => ({ ...a, description: e.target.value }))} />
                </div>
                <CategoryField value={adding.category} onChange={v => setAdding(a => ({ ...a, category: v }))} categories={categories} input={input} />
                <select style={input} value={adding.allocated_admin_email} onChange={e => setAdding(a => ({ ...a, allocated_admin_email: e.target.value }))}>
                  <option value="">— none —</option>
                  {admins.map(a => <option key={a.email} value={a.email}>{a.name || a.email}</option>)}
                </select>
                <input style={input} placeholder="Scheduling link (optional)" value={adding.scheduling_link} onChange={e => setAdding(a => ({ ...a, scheduling_link: e.target.value }))} />
                <select style={input} value={adding.billing_interval} onChange={e => setAdding(a => ({ ...a, billing_interval: e.target.value }))}>
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <input style={{ ...input, textAlign: 'right' }} type="number" placeholder="0" value={adding.credit_cost} onChange={e => setAdding(a => ({ ...a, credit_cost: e.target.value }))} />
                <span />
                <span />
                <button onClick={addService} disabled={busy} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: `linear-gradient(135deg, ${BLUE} 0%, #0a85e8 100%)`, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmRemove && (
        <div onClick={() => { if (!busy) setConfirmRemove(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,14,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: '0 18px 50px rgba(9,14,26,0.35)', padding: '26px 28px', maxWidth: '440px', width: '100%' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Remove service</div>
            <p style={{ fontSize: '14px', color: 'var(--vfo-ink)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Permanently remove <strong>{confirmRemove.name}</strong> from the marketplace? A service anyone has already redeemed cannot be removed — set it Inactive instead, which hides it from members while keeping the history intact.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setConfirmRemove(null)} disabled={busy}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
              <button onClick={() => removeService(confirmRemove)} disabled={busy}
                style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#d93025', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceRow({ svc, cols, input, descBox, busy, admins, categories, onSave, onRemove }) {
  const [name, setName] = useState(svc.name || '')
  const [desc, setDesc] = useState(svc.description || '')
  const [cat, setCat] = useState(svc.category || '')
  const [cost, setCost] = useState(String(svc.credit_cost ?? ''))
  const [owner, setOwner] = useState(svc.allocated_admin_email || '')
  const [link, setLink] = useState(svc.scheduling_link || '')
  const [billing, setBilling] = useState(svc.billing_interval || 'one_time')
  const dirty = (svc.name || '') !== name
    || (svc.description || '') !== desc
    || (svc.category || '') !== cat
    || (svc.billing_interval || 'one_time') !== billing
    || String(svc.credit_cost ?? '') !== cost
    || (svc.allocated_admin_email || '') !== owner
    || (svc.scheduling_link || '') !== link

  // Every editable field rides the one Save, so they always travel together
  // and no unsaved sibling gets clobbered by the round trip.
  function save() {
    onSave(svc, {
      name: name.trim(),
      description: desc.trim() || null,
      category: cat.trim() || null,
      billing_interval: billing,
      credit_cost: parseInt(cost, 10),
      allocated_admin_email: owner || null,
      scheduling_link: link.trim() || null,
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '10px', padding: '12px 4px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'start', fontSize: '13px', color: 'var(--vfo-ink)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <input style={{ ...input, fontWeight: 600 }} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <textarea rows={2} style={descBox} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <CategoryField value={cat} onChange={setCat} categories={categories} input={input} />
      <select style={input} value={owner} onChange={e => setOwner(e.target.value)}>
        <option value="">— none —</option>
        {(admins || []).map(a => <option key={a.email} value={a.email}>{a.name || a.email}</option>)}
        {owner && !(admins || []).some(a => a.email === owner) && <option value={owner}>{owner}</option>}
      </select>
      <input style={input} placeholder="Scheduling link" value={link} onChange={e => setLink(e.target.value)} />
      <select style={input} value={billing} onChange={e => setBilling(e.target.value)}>
        {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <input style={{ ...input, textAlign: 'right', maxWidth: '90px', justifySelf: 'end' }} type="number" value={cost} onChange={e => setCost(e.target.value)} />
      <button
        type="button"
        role="switch"
        aria-checked={!!svc.active}
        title={svc.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
        onClick={() => onSave(svc, { active: !svc.active })}
        disabled={busy}
        style={{ justifySelf: 'center', marginTop: '5px', position: 'relative', width: '44px', height: '24px', padding: 0, flexShrink: 0, borderRadius: '999px', border: '1px solid', borderColor: svc.active ? 'rgba(22,163,74,0.45)' : 'var(--vfo-border-strong)', background: svc.active ? '#16a34a' : 'var(--vfo-tint)', cursor: busy ? 'default' : 'pointer', transition: 'background 0.18s ease, border-color 0.18s ease' }}>
        <span style={{ position: 'absolute', top: '2px', left: '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(9,14,26,0.35)', transform: svc.active ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.18s ease' }} />
      </button>
      <button
        onClick={save}
        disabled={busy || !dirty || cost === '' || !name.trim()}
        style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${dirty ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`, background: 'var(--vfo-card)', color: dirty ? 'var(--vfo-accent-text)' : 'var(--vfo-faint)', fontSize: '12.5px', fontWeight: 600, cursor: (busy || !dirty) ? 'default' : 'pointer' }}>
        Save
      </button>
      <button
        onClick={() => onRemove(svc)}
        disabled={busy}
        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: '#d93025', fontSize: '12.5px', cursor: busy ? 'default' : 'pointer' }}>
        Remove
      </button>
    </div>
  )
}
