import { useEffect, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { fileToLogoPng, logoUrl } from './logoPng'
import { Skeleton, SkeletonText } from './skeletons/primitives'

// The Branding card (editing): the member's logo (shown on their clients' ROI
// presentations), the "show my logo" switch and the agreement-name choice.
// Rendered on the member's Edit Profile page (mode "member") and on the admin
// member's Edit Profile tab (mode "admin"); the read-only views live in
// shared/MemberProfileDetails. Reads through member_profile_load and writes ONLY
// through member_branding_save - never the admin profile save, which
// deliberately ignores these columns.

function Switch({ on, disabled, onClick, label }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} role="switch" aria-checked={on} aria-label={label} style={{
      width: '54px', height: '30px', borderRadius: '999px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
      background: on ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : '#cdd8ea', opacity: disabled ? 0.55 : 1,
      padding: '3px', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .15s',
    }}>
      <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--vfo-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

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
export default function MemberBrandingCard({ memberNumber, mode = 'member', styles, reloadKey = 0 }) {
  const { sectionStyle, cardTitle } = styles
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

  if (loadError) {
    return <div style={sectionStyle}><div style={cardTitle}>Branding</div><div style={{ fontSize: '13px', color: '#d93025' }}>{loadError}</div></div>
  }
  if (!row) {
    return (
      <div style={sectionStyle}>
        <div style={cardTitle}>Branding</div>
        <SkeletonText lines={2} />
        <div style={{ display: 'flex', gap: '12px', margin: '14px 0' }}>
          <Skeleton width="50%" height={96} style={{ borderRadius: '10px' }} />
          <Skeleton width="50%" height={96} style={{ borderRadius: '10px' }} />
        </div>
        <Skeleton width={120} height={34} style={{ borderRadius: '8px' }} />
      </div>
    )
  }

  const savedSrc = logoUrl(row.logo_image)
  const shownSrc = pending?.dataUrl || savedSrc
  const hasLogo = !!row.logo_image
  const companyName = (row.trading_name || '').trim()
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)' }
  const rowTitle = { fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }
  const rowHint = { fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.45 }
  const btn = { padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }
  const primaryBtn = { ...btn, background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', boxShadow: '0 2px 8px rgba(18,94,204,0.28)' }
  const plainBtn = { ...btn, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-ink)' }

  return (
    <div style={sectionStyle}>
      <div style={cardTitle}>Branding</div>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.55, marginBottom: '14px', maxWidth: '760px' }}>
        {admin
          ? "This member's logo appears on their clients' ROI presentations, beside the tax planning team's logo and VFO Services. It sits on a small white badge, so a normal full-colour logo works on every slide."
          : "Your logo appears on your clients' ROI presentations, beside the tax planning team's logo and VFO Services. It sits on a small white badge, so use your normal full-colour logo (not an all-white version)."}
      </div>

      <LogoPreview src={shownSrc} />
      {pending && <div style={{ fontSize: '12.5px', color: '#b08d26', fontWeight: 500, marginTop: '8px' }}>Preview of the new logo. Save it to use it.</div>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '14px 0 6px' }}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={pickFile} style={{ display: 'none' }} />
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
      <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginBottom: '8px' }}>PNG or JPG. Empty space around the logo is trimmed automatically.</div>

      <div style={rowStyle}>
        <div>
          <div style={rowTitle}>{admin ? 'Show logo on ROI presentations' : 'Show my logo on ROI presentations'}</div>
          <div style={rowHint}>{hasLogo ? 'When off, that spot on each slide is left blank.' : 'Upload a logo first.'}</div>
        </div>
        <Switch on={!!row.logo_enabled} disabled={busy || (!hasLogo && !row.logo_enabled)} label="Show logo on ROI presentations"
          onClick={() => save({ logo_enabled: !row.logo_enabled }, row.logo_enabled ? 'Logo hidden from presentations.' : 'Logo will show on presentations.')} />
      </div>

      <div style={{ ...rowStyle, display: 'block' }}>
        <div style={rowTitle}>{admin ? 'Name in tax planning agreements' : 'How to name me in tax planning agreements'}</div>
        <div style={rowHint}>
          {nameSentence(row, admin)}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {NAME_MODES.map(([mode, label]) => {
            const active = row.contract_name_mode === mode
            const blocked = mode === 'company' && !companyName
            return (
              <button key={mode} type="button" disabled={busy || blocked}
                title={blocked ? 'Add a company name first' : undefined}
                onClick={() => { if (!active) save({ contract_name_mode: mode }, 'Saved.') }}
                style={{ padding: '8px 18px', borderRadius: '6px', border: `1px solid ${active ? '#0095ff' : 'var(--vfo-border-mid)'}`, background: active ? 'rgba(0,149,255,0.15)' : 'transparent', color: active ? '#0095ff' : 'var(--vfo-muted)', fontSize: '13px', fontWeight: active ? 600 : 400, cursor: busy || blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.5 : 1 }}>
                {label}
              </button>
            )
          })}
        </div>
        {!companyName && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '8px' }}>{admin ? 'Company name is not set on this member.' : 'To use Company name, add your company name above and save it first.'}</div>}
      </div>

      {msg && <div style={{ fontSize: '13px', marginTop: '6px', color: msgType === 'success' ? '#1b9254' : '#d93025' }}>{msg}</div>}
    </div>
  )
}
