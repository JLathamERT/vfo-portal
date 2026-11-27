import { useEffect, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { fileToLogoPng, logoUrl } from './logoPng'
import { BrandingBodySkeleton } from './Skeleton'
import { ChoiceButtons, ProfileCard, SettingRow, Switch } from './ProfileKit'
import { btnPrimary, btnSecondary, btnState } from './buttonStyles'

// The Branding card (editing): the member's logo (shown on their clients' ROI
// presentations), the "show my logo" switch and the agreement-name choice.
// Rendered on the member's Edit Profile page (mode "member") and on the admin
// member's Edit Profile tab (mode "admin"); the read-only views live in
// shared/MemberProfileDetails. Reads through member_profile_load and writes ONLY
// through member_branding_save - never the admin profile save, which
// deliberately ignores these columns.

// The logo exactly as the deck shows it, on a white slide and on a blue slide.
// Also used by the group logo on Tax Planning Partners. The stored PNG already
// carries its white badge (logoPng.js), so it is shown as-is - no extra frame.
export function LogoPreview({ src }) {
  const strip = { flex: '1 1 200px', minWidth: '200px', height: '96px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const img = (onBlue) => src
    ? <img src={src} alt="Logo" style={{ width: '168px', height: '56px', objectFit: 'contain', display: 'block' }} />
    : <span style={{ fontSize: '11px', color: onBlue ? 'rgba(255,255,255,0.75)' : '#9aa4b2' }}>No logo</span>
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ ...strip, background: '#fff', border: '1px solid var(--vfo-border-soft)' }}>{img(false)}</div>
      <div style={{ ...strip, background: 'linear-gradient(135deg, #2f6fe0 0%, #1f47a8 100%)' }}>{img(true)}</div>
    </div>
  )
}

// members.contract_name_mode. NULL = never chosen, which the agreement treats
// exactly like 'none' (actions/tax/send-agreement.ts).
const NAME_MODES = [['company', 'Company name'], ['personal', 'Real name'], ['none', 'Neither']]

function realName(row) {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim()
}

function nameSentence(row, admin) {
  const mode = row.contract_name_mode
  const company = (row.trading_name || '').trim()
  if (mode === 'company' && company) return <>The agreement names the collaborating team as the tax planning team, <b>{company}</b> and VFO Services.</>
  if (mode === 'personal') return <>The agreement names the collaborating team as the tax planning team, <b>{realName(row) || 'the member'}</b> and VFO Services.</>
  if (mode === 'company') return <>Company name is chosen but no company name is set, so {admin ? 'the member is' : 'you are'} left out.</>
  if (mode === 'none') return <>{admin ? 'The member is' : 'You are'} left out: the agreement names the tax planning team and VFO Services.</>
  return <>Not chosen yet, so {admin ? 'the member is' : 'you are'} left out of the agreement until one is picked.</>
}

// reloadKey: bump it after the surrounding Edit Profile page saves, so the
// company-name check here reads the name that was just saved.
export default function MemberBrandingCard({ memberNumber, mode = 'member', reloadKey = 0 }) {
  const admin = mode === 'admin'
  const [row, setRow] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const fileRef = useRef(null)

  useEffect(() => {
    let alive = true
    setRow(null); setLoadError(''); setPending(null); setMsg('')
    callApi('member_profile_load', { member_number: memberNumber })
      .then(d => { if (alive) setRow(d?.profile || {}) })
      .catch(err => { if (alive) setLoadError(err?.message || 'Branding could not be loaded') })
    return () => { alive = false }
  }, [memberNumber, reloadKey])

  function say(text, type = 'success') { setMsg(text); setMsgType(type) }

  async function save(patch, okText) {
    setBusy(true); setMsg('')
    try {
      const res = await callApi('member_branding_save', { member_number: memberNumber, ...patch })
      setRow(r => ({ ...r, ...(res?.branding || {}) }))
      if (okText) say(okText)
      return true
    } catch (err) {
      say(err?.message || 'Something went wrong', 'error')
      return false
    } finally { setBusy(false) }
  }

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg('')
    try { setPending(await fileToLogoPng(file)) }
    catch (err) { say(err?.message || 'That file could not be used', 'error') }
  }

  async function saveLogo() {
    if (!pending) return
    if (await save({ logo_base64: pending.base64 }, 'Logo saved.')) setPending(null)
  }

  async function removeLogo() {
    if (!window.confirm(admin ? "Remove this member's logo?" : 'Remove your logo?')) return
    await save({ remove_logo: true }, 'Logo removed.')
  }

  const intro = admin
    ? "This member's logo appears on their clients' ROI presentations, beside the tax planning team's logo and VFO Services. It sits on a small white badge, so a normal full-colour logo works on every slide."
    : "Your logo appears on your clients' ROI presentations, beside the tax planning team's logo and VFO Services. It sits on a small white badge, so use your normal full-colour logo (not an all-white version)."

  if (loadError) {
    return <ProfileCard icon="image" title="Branding"><div style={{ fontSize: '13px', color: '#d93025' }}>{loadError}</div></ProfileCard>
  }
  if (!row) {
    return <ProfileCard icon="image" title="Branding" sub={intro}><BrandingBodySkeleton /></ProfileCard>
  }

  const savedSrc = logoUrl(row.logo_image)
  const shownSrc = pending?.dataUrl || savedSrc
  const hasLogo = !!row.logo_image
  const companyName = (row.trading_name || '').trim()
  const primaryBtn = btnState(btnPrimary, busy)
  const plainBtn = btnState(btnSecondary, busy)

  return (
    <ProfileCard icon="image" title="Branding" sub={intro}>
      <LogoPreview src={shownSrc} />
      {pending && <div style={{ fontSize: '12.5px', color: 'var(--vfo-gold-text)', fontWeight: 600, marginTop: '8px' }}>Preview of the new logo. Save it to use it.</div>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '14px 0 6px' }}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} style={{ display: 'none' }} />
        {pending ? (
          <>
            <button type="button" disabled={busy} onClick={saveLogo} style={primaryBtn}>{busy ? 'Saving…' : 'Save logo'}</button>
            <button type="button" disabled={busy} onClick={() => { setPending(null); setMsg('') }} style={plainBtn}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={primaryBtn}>{hasLogo ? 'Replace logo' : 'Upload logo'}</button>
            {hasLogo && <button type="button" disabled={busy} onClick={removeLogo} style={plainBtn}>Remove logo</button>}
          </>
        )}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginBottom: '14px' }}>PNG, JPG or WebP. Empty space around the logo is trimmed automatically.</div>

      <div style={{ display: 'grid', gap: '10px' }}>
        <SettingRow title={admin ? 'Show logo on ROI presentations' : 'Show my logo on ROI presentations'}
          hint={hasLogo ? 'When off, that spot on each slide is left blank.' : 'Upload a logo first.'}>
          <Switch on={!!row.logo_enabled} disabled={busy || (!hasLogo && !row.logo_enabled)} label="Show logo on ROI presentations"
            onClick={() => save({ logo_enabled: !row.logo_enabled }, row.logo_enabled ? 'Logo hidden from presentations.' : 'Logo will show on presentations.')} />
        </SettingRow>

        <SettingRow title={admin ? 'Name in tax planning agreements' : 'How to name me in tax planning agreements'}
          hint={<>
            {nameSentence(row, admin)}
            <div style={{ marginTop: '10px' }}>
              <ChoiceButtons options={NAME_MODES.map(([m, label]) => [m, label, m === 'company' && !companyName ? 'Add a company name first' : undefined])}
                value={row.contract_name_mode} disabled={busy} blocked={m => m === 'company' && !companyName}
                onChange={m => save({ contract_name_mode: m }, 'Saved.')} />
            </div>
            {!companyName && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '8px' }}>{admin ? 'Company name is not set on this member.' : 'To use Company name, add your company name above and save it first.'}</div>}
          </>} />
      </div>

      {msg && <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '10px', color: msgType === 'success' ? 'var(--vfo-success-text)' : '#d93025' }}>{msg}</div>}
    </ProfileCard>
  )
}
