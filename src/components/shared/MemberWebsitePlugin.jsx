import { useState, useEffect, useRef } from 'react'
import { callApi } from '../../lib/api'
import { useIsPhone } from '../../lib/useMediaQuery'
import { SUPABASE_URL } from '../../lib/environment'
import { ChoiceButtons, formInput, ProfileCard, SaveBar, SettingRow, Switch } from './ProfileKit'
import { btnPrimary, btnSecondary, BTN_SMALL } from './buttonStyles'

const PRESET_FONTS = ['Playfair Display','Lora','Merriweather','Raleway','Montserrat','Open Sans','Poppins','Cormorant Garamond','Libre Baskerville','Source Serif Pro']

export default function MemberWebsitePlugin({ member, onDataChange, readOnly = false, isAdmin = false }) {
  const [appearanceTab, setAppearanceTab] = useState('appearance')
  const [settings, setSettings] = useState({
    bg_color: member.bg_color || '#0a1628',
    text_color: member.text_color || '#ffffff',
    accent_color: member.accent_color || '#1a2744',
    card_text_color: member.card_text_color || '#ffffff',
    primary_color: member.primary_color || '#d4af37',
    font: member.font || 'Playfair Display',
    last_initial_only: member.last_initial_only || false,
    show_count: member.show_count !== false,
    show_search: member.show_search !== false,
    display_mode: member.display_mode || 'filter',
    widget_font_size: member.widget_font_size || 14,
    website_enabled: member.website_enabled || false,
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [fontSearch, setFontSearch] = useState('')
  const [fontResults, setFontResults] = useState([])
  const fontSearchTimer = useRef(null)
  const isPhone = useIsPhone()

  function update(key, val) { setSettings(p => ({ ...p, [key]: val })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      await callApi('save_member', { member_number: member.plugin_member_number, settings })
      if (onDataChange) await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
    finally { setSaving(false) }
  }

  function copyCode() {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleFontSearch(q) {
    setFontSearch(q)
    setFontResults([])
    if (q.length < 2) return
    clearTimeout(fontSearchTimer.current)
    fontSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('https://fonts.google.com/metadata/fonts')
        const text = await res.text()
        const clean = text.replace(/^\)\]\}'\n?/, '')
        const data = JSON.parse(clean)
        const matches = data.familyMetadataList
          .filter(f => f.family.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 8)
          .map(f => f.family)
        setFontResults(matches)
      } catch (e) { setFontResults([]) }
    }, 300)
  }

  function selectFont(font) {
    update('font', font)
    setFontSearch('')
    setFontResults([])
  }

  const embedCode = `<div id="vfo-showroom"></div>\n<script src="${SUPABASE_URL}/storage/v1/object/public/vfo-widget/vfo-widget.js?v=26" data-vfo-key="${member.manage_key}"><\/script>`

  const subTabStyle = (active) => ({
    padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px'
  })
  // The profile look (2026-11-26): titled boxes, each setting a tile.
  const hexInput = { ...formInput, width: '96px', padding: '7px 10px', fontSize: '13px' }
  const rows = { display: 'grid', gap: '8px' }

  if (!member.website_enabled && !isAdmin) {
    return (
      <ProfileCard icon="globe" title="Website plugin not enabled">
        <div style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>Contact your administrator to enable website customization for your account.</div>
      </ProfileCard>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '20px', paddingBottom: '8px' }}>
        <button style={subTabStyle(appearanceTab === 'appearance')} onClick={() => setAppearanceTab('appearance')}>Appearance</button>
        <button style={subTabStyle(appearanceTab === 'plugin')} onClick={() => setAppearanceTab('plugin')}>Plugin Settings</button>
        <button style={subTabStyle(appearanceTab === 'preview')} onClick={() => setAppearanceTab('preview')}>Preview</button>
      </div>

      {appearanceTab === 'appearance' && (
        <>
          <ProfileCard icon="palette" title="Colors" sub="The showroom widget's colours on your website.">
            <div style={rows}>
              {[
                ['bg_color', 'Background Color', 'Page background'],
                ['text_color', 'Heading Text Color', 'Title, subtitle, search, filters, group headings'],
                ['accent_color', 'Card Background', 'Card and modal background'],
                ['card_text_color', 'Card Text Color', 'Names and bios on cards and modal'],
                ['primary_color', 'Accent Color', 'Active buttons, tags, hover effects, underlines'],
              ].map(([key, label, desc]) => (
                <SettingRow key={key} title={label} hint={desc} style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <input type="color" value={settings[key]} onChange={e => update(key, e.target.value)} aria-label={label}
                      style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', padding: 0, cursor: 'pointer', background: 'transparent' }} />
                    <input value={settings[key]} onChange={e => update(key, e.target.value)} style={hexInput} />
                  </div>
                </SettingRow>
              ))}
            </div>
            {/* Colour preview card */}
            <div style={{ marginTop: '14px', padding: '16px', background: settings.bg_color, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ fontSize: '11px', color: settings.text_color, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '8px' }}>Preview</div>
              <div style={{ background: settings.accent_color, border: `1px solid ${settings.primary_color}4d`, borderRadius: '8px', padding: '10px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: settings.card_text_color, fontFamily: `'${settings.font}', serif` }}>
                  {settings.last_initial_only ? 'Bill L.' : 'Bill Lloyd'}
                </div>
                <div style={{ fontSize: '12px', color: settings.primary_color, marginTop: '4px' }}>Tax Planning</div>
              </div>
            </div>
          </ProfileCard>

          <ProfileCard icon="text" title="Font" sub="Pick one of these, or search Google Fonts.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {PRESET_FONTS.map(font => (
                <button key={font} type="button" onClick={() => update('font', font)}
                  style={{ ...(settings.font === font ? btnPrimary : btnSecondary), ...BTN_SMALL, padding: '6px 12px', fontSize: '12.5px' }}>
                  {font}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input type="search" name="search" autoComplete="off" value={fontSearch} onChange={e => handleFontSearch(e.target.value)}
                placeholder="Search Google Fonts..." style={formInput} />
              {fontResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', zIndex: 10, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
                  {fontResults.map(font => (
                    <div key={font} onClick={() => selectFont(font)}
                      style={{ padding: '10px 14px', cursor: 'pointer', color: 'var(--vfo-ink)', fontSize: '13px', borderBottom: '1px solid var(--vfo-border-soft)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {font}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: '12px', padding: '16px', background: 'var(--vfo-input)', borderRadius: '12px', border: '1px solid var(--vfo-border-soft)', textAlign: 'center' }}>
              <span style={{ fontSize: '20px', color: 'var(--vfo-ink)', fontFamily: `'${settings.font}', serif` }}>The quick brown fox jumps over the lazy dog</span>
            </div>
          </ProfileCard>

          <ProfileCard icon="settings" title="Display Options">
            <div style={rows}>
              {[
                ['last_initial_only', 'Last Name Initial Only', 'Show "Bill L." instead of "Bill Lloyd"'],
                ['show_count', 'Show Specialist Count', 'Display "60 SPECIALISTS" text'],
                ['show_search', 'Show Search Bar', 'Display the search specialists input'],
              ].map(([key, label, desc]) => (
                <SettingRow key={key} title={label} hint={desc} style={{ padding: '10px 12px' }}>
                  <Switch on={!!settings[key]} onClick={() => update(key, !settings[key])} label={label} />
                </SettingRow>
              ))}
              <SettingRow title="Font Size" hint={`Base font size for the widget (${settings.widget_font_size}px)`} style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>14</span>
                  <input type="range" min={14} max={22} value={settings.widget_font_size} onChange={e => update('widget_font_size', parseInt(e.target.value))} style={{ width: isPhone ? '100px' : '140px', accentColor: '#125ecc', cursor: 'pointer' }} />
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>22</span>
                </div>
              </SettingRow>
              <SettingRow title="Display Mode" hint="How specialists are organized" style={{ padding: '10px 12px' }}>
                <div style={{ flexShrink: 0 }}>
                  <ChoiceButtons options={[['filter', isPhone ? 'Filters' : 'Filter Buttons'], ['grouped', 'Grouped']]} value={settings.display_mode} onChange={v => update('display_mode', v)} />
                </div>
              </SettingRow>
            </div>
          </ProfileCard>
        </>
      )}

      {appearanceTab === 'plugin' && (
        <>
          {isAdmin && (
            <ProfileCard icon="globe" title="Website Plugin">
              <SettingRow title="Enable Website Plugin" hint="Allow this member to use their showroom widget" style={{ padding: '10px 12px' }}>
                <Switch on={!!settings.website_enabled} onClick={() => update('website_enabled', !settings.website_enabled)} label="Enable Website Plugin" />
              </SettingRow>
            </ProfileCard>
          )}
          <ProfileCard icon="link" title="Embed Code" sub="Copy this code and paste it into an HTML widget on your website."
            action={<button type="button" onClick={copyCode} style={{ ...(copied ? btnPrimary : btnSecondary), ...BTN_SMALL, padding: '6px 14px', fontSize: '12.5px' }}>{copied ? 'Copied' : 'Copy Code'}</button>}>
            <pre style={{ background: '#16264a', padding: isPhone ? '12px' : '16px', borderRadius: '12px', color: '#cdd9ea', fontSize: isPhone ? '12px' : '13px', overflowX: 'auto', whiteSpace: 'pre-wrap', ...(isPhone ? { wordBreak: 'break-all' } : {}), fontFamily: 'monospace', margin: 0, textAlign: 'left' }}>{embedCode}</pre>
          </ProfileCard>
        </>
      )}

      {appearanceTab === 'preview' && (
        <ProfileCard icon="image" title="Live Preview" sub={dirty ? 'Save your changes first to see them in the preview.' : 'How the widget looks on your website.'}>
          <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--vfo-border-soft)' }}>
            <iframe
              key={dirty ? 'stale' : Date.now()}
              srcDoc={`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; background: ${settings.bg_color}; }</style>
</head><body>
<div id="vfo-showroom"></div>
<script src="${SUPABASE_URL}/storage/v1/object/public/vfo-widget/vfo-widget.js?v=26" data-vfo-key="${member.manage_key}"><\/script>
</body></html>`}
              style={{ width: '100%', height: '700px', border: 'none', display: 'block' }}
              title="Widget Preview"
            />
          </div>
        </ProfileCard>
      )}

      {appearanceTab !== 'preview' && (
        <SaveBar dirty={dirty} saving={saving} onSave={save} status={status} statusType={statusType} />
      )}
    </div>
  )
}
