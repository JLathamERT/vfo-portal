import { useState } from 'react'
import { HEADSHOTS_URL } from '../../lib/environment'
import { useIsPhone } from '../../lib/useMediaQuery'
import { ProfileCard, SaveBar, Switch } from './ProfileKit'
import { btnSecondary, BTN_SMALL } from './buttonStyles'
import { listSearchStyle } from './ListTable'

// The Specialists tab (2026-11-26): which specialists show in a member's Showroom
// and Website Plugin. One component for the admin's view of a member and the
// member's own tab; each side passes its own save (save_member for the admin,
// member_save_exclusions for the member). Member Services specialists are
// internal-only - never in a client's showroom or the plugin - so they are listed
// apart, always on, and any exclusions already held for them are kept untouched.
export default function SpecialistPicker({ allExperts, excluded = [], ecoMap = {}, intro, onSave }) {
  const isPhone = useIsPhone()
  const isMemberService = id => (ecoMap[id] || []).includes('Member Services')
  const regularExperts = allExperts.filter(e => !isMemberService(e.id))
  const memberServiceExperts = allExperts.filter(e => isMemberService(e.id))
  const [enabled, setEnabled] = useState(() => Object.fromEntries(regularExperts.map(e => [e.id, !excluded.includes(e.id)])))
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  const enabledCount = regularExperts.filter(e => enabled[e.id]).length
  const q = search.trim().toLowerCase()
  const shown = q ? regularExperts.filter(e => e.name.toLowerCase().includes(q)) : regularExperts

  function toggle(id) { setEnabled(p => ({ ...p, [id]: !p[id] })); setDirty(true) }
  function setAll(on) { setEnabled(Object.fromEntries(regularExperts.map(e => [e.id, on]))); setDirty(true) }

  async function save() {
    const newExcluded = regularExperts.filter(e => !enabled[e.id]).map(e => e.id)
      .concat(excluded.filter(id => isMemberService(id)))
    setSaving(true)
    try {
      await onSave(newExcluded)
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setSaving(false) }
  }

  const tile = { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', minWidth: 0 }
  const photo = e => (
    <span style={{ width: '38px', height: '38px', borderRadius: '50%', overflow: 'hidden', background: 'var(--vfo-border)', flexShrink: 0 }}>
      {e.headshot_image && <img src={HEADSHOTS_URL + encodeURIComponent(e.headshot_image)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </span>
  )
  const words = e => (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{e.name}</span>
      {e.short_bio && <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px', lineHeight: 1.4 }}>{e.short_bio}</span>}
    </span>
  )
  const grid = { display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }

  return (
    <div>
      <ProfileCard icon="users" title="Specialists" sub={intro}
        action={<span style={{ fontSize: '13px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}><strong style={{ color: 'var(--vfo-ink)' }}>{enabledCount}</strong> of {regularExperts.length} on</span>}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="search" name="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search specialists..." style={{ ...listSearchStyle, minWidth: isPhone ? '100%' : '240px' }} />
          <button type="button" onClick={() => setAll(true)} style={{ ...btnSecondary, ...BTN_SMALL, padding: '7px 12px', fontSize: '12.5px' }}>Enable All</button>
          <button type="button" onClick={() => setAll(false)} style={{ ...btnSecondary, ...BTN_SMALL, padding: '7px 12px', fontSize: '12.5px' }}>Disable All</button>
        </div>
        {shown.length === 0
          ? <div style={{ color: 'var(--vfo-muted)', fontSize: '13px' }}>No specialists match your search.</div>
          : (
            <div style={grid}>
              {shown.map(e => (
                <div key={e.id} onClick={() => toggle(e.id)} style={{ ...tile, cursor: 'pointer', opacity: enabled[e.id] ? 1 : 0.7 }}>
                  {photo(e)}
                  {words(e)}
                  <span onClick={ev => ev.stopPropagation()}>
                    <Switch on={!!enabled[e.id]} onClick={() => toggle(e.id)} label={`${e.name} ${enabled[e.id] ? 'on' : 'off'}`} />
                  </span>
                </div>
              ))}
            </div>
          )}
      </ProfileCard>

      {memberServiceExperts.length > 0 && (
        <ProfileCard icon="shield" title="Member Services" sub="Visible only to the member. These never appear in a client's showroom or the website plugin, so there is nothing to switch.">
          <div style={grid}>
            {memberServiceExperts.map(e => (
              <div key={e.id} style={tile}>
                {photo(e)}
                {words(e)}
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--vfo-success-text)', whiteSpace: 'nowrap' }}>Always on</span>
              </div>
            ))}
          </div>
        </ProfileCard>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} status={status} statusType={statusType} />
    </div>
  )
}
