import { ProfileCard } from './ProfileKit'
import { btnDanger, btnOutline, btnSecondary, BTN_SMALL } from './buttonStyles'

// The vault look (2026-11-26, Jake): every vault - client, member, specialist, tax
// planner, admin or portal - draws its sections, files and upload area from here,
// so they all read the same as the profile boxes. VaultSections (the shared vault)
// and ClientVaultTab (the client's vault) keep their own behaviour.

const SECTION_ICONS = { sensitive: 'lock', general: 'clipboard', ert: 'shield', showroom: 'globe' }

// A vault section: a profile box with the section's icon, its title and the line
// that says what goes in it. `dropping` outlines it as a drag-to-move target; the
// drag handlers ride on the wrapper so the box itself stays the shared one.
export function VaultSectionCard({ sectionKey, title, hint, dropping = false, dropProps = {}, children }) {
  return (
    <div {...dropProps} style={{ borderRadius: '16px', marginBottom: '16px', outline: dropping ? '2px dashed #0095ff' : 'none', outlineOffset: '2px' }}>
      <ProfileCard icon={SECTION_ICONS[sectionKey] || 'note'} title={title} sub={hint}
        style={{ marginBottom: 0, ...(dropping ? { background: 'rgba(0,149,255,0.05)' } : {}) }}>
        {children}
      </ProfileCard>
    </div>
  )
}

// The file-type badge at the start of a file row (no emoji): PDF red, Word blue,
// Excel green, images purple, anything else grey. A locked file shows a padlock.
const TYPE_COLOURS = [
  [/^pdf$/, '#d93025'],
  [/^docx?$/, '#2b6cd4'],
  [/^(xlsx?|csv)$/, '#1b9254'],
  [/^(png|jpe?g|gif|webp|heic)$/, '#7c3aed'],
]
export function FileBadge({ name = '', locked = false }) {
  const ext = (String(name).includes('.') ? String(name).split('.').pop() : '').toLowerCase()
  const colour = locked ? '#8a94a6' : (TYPE_COLOURS.find(([re]) => re.test(ext))?.[1] || '#8a94a6')
  const label = /^(png|jpe?g|gif|webp|heic)$/.test(ext) ? 'IMG' : (ext.slice(0, 4).toUpperCase() || 'FILE')
  return (
    <span aria-hidden="true" style={{ width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${colour}1a`, color: colour, fontSize: label.length > 3 ? '9px' : '10px', fontWeight: 800, letterSpacing: '0.3px', fontFamily: 'Inter, sans-serif' }}>
      {locked
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        : label}
    </span>
  )
}

// One file's tile. `open` squares off the bottom corners while a panel (Share) is
// open beneath it; `dragging` fades it while it is being dragged.
export function fileTileStyle({ dragging = false, open = false, phone = false } = {}) {
  return {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: phone ? '10px 10px 10px 12px' : '10px 12px',
    background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)',
    borderRadius: open ? '12px 12px 0 0' : '12px',
    opacity: dragging ? 0.45 : 1,
  }
}

// The name with its size under it (a laptop keeps it to one line; the full name
// is in the tooltip). `note` follows the size ("Locked").
export function FileName({ name, size, note }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div title={name} style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{[size, note].filter(Boolean).join(' · ')}</div>
    </div>
  )
}

// The small house-style row buttons.
export const vaultViewBtn = { ...btnSecondary, ...BTN_SMALL, flexShrink: 0 }
export const vaultRemoveBtn = { ...btnDanger, ...BTN_SMALL, flexShrink: 0 }
export const vaultShareBtn = open => ({ ...btnOutline, ...BTN_SMALL, flexShrink: 0, ...(open ? { background: 'var(--vfo-accent-tint)' } : {}) })

// The add-documents area: a dashed tile with an upload icon.
export function UploadZone({ busy = false, accept, onFiles, label = 'Add documents' }) {
  return (
    <label
      onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'rgba(0,149,255,0.6)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--vfo-border-mid)' }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: busy ? 'wait' : 'pointer', marginTop: '10px', padding: '14px', borderRadius: '12px', border: '1.5px dashed var(--vfo-border-mid)', background: 'var(--vfo-card)', transition: 'border-color 120ms ease' }}>
      <input type="file" multiple accept={accept} disabled={busy} style={{ display: 'none' }} onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
      <span aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--vfo-accent-tint)', color: 'var(--vfo-accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
      </span>
      <span style={{ textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-accent-text)' }}>{busy ? 'Uploading…' : label}</span>
        {!busy && <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '1px' }}>PDF, Word, Excel or images</span>}
      </span>
    </label>
  )
}

// "No documents yet." inside a section.
export function VaultEmpty({ children = 'No documents yet.' }) {
  return <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', padding: '2px 0 4px' }}>{children}</div>
}
