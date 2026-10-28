import { useState, useEffect, useRef } from 'react'
import { callApi } from '../../lib/api'
import { useIsPhone } from '../../lib/useMediaQuery'

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
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [fontSearch, setFontSearch] = useState('')
  const [fontResults, setFontResults] = useState([])
  const fontSearchTimer = useRef(null)
  const isPhone = useIsPhone()

  function update(key, val) { setSettings(p => ({ ...p, [key]: val })); setDirty(true) }

  async function save() {
    try {
      await callApi('save_member', { member_number: member.plugin_member_number, settings })
      if (onDataChange) await onDataChange()
      setDirty(false)
      setStatusType('success'); setStatus('Changes saved!')
      setTimeout(() => setStatus(''), 4000)
    } catch (err) { setStatusType('error'); setStatus(err.message) }
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

  const embedCode = `<div id="vfo-showroom"></div>\n<script src="https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/vfo-widget/vfo-widget.js?v=26" data-vfo-key="${member.manage_key}"><\/script>`

  const subTabStyle = (active) => ({
    padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px'
  })
  // Phone: the shared card padding (24px inside the page gutter doubled up), and
  // the smaller buttons - Display Mode's "Filter Buttons" broke onto two lines.
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: isPhone ? 'var(--vfo-card-pad)' : '24px', marginBottom: isPhone ? '14px' : '20px' }
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }
  const inputStyle = { width: '90px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }

  if (!member.website_enabled && !isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '22px', color: 'var(--vfo-heading)', marginBottom: '12px' }}>Website plugin not enabled</p>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>Contact your administrator to enable website customization for your account.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        <button style={subTabStyle(appearanceTab === 'appearance')} onClick={() => setAppearanceTab('appearance')}>Appearance</button>
        <button style={subTabStyle(appearanceTab === 'plugin')} onClick={() => setAppearanceTab('plugin')}>Plugin Settings</button>
        <button style={subTabStyle(appearanceTab === 'preview')} onClick={() => setAppearanceTab('preview')}>Preview</button>
      </div>

      {appearanceTab === 'appearance' && (
        <>
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Colors</div>
            {[
              ['bg_color', 'Background Color', 'Page background'],
              ['text_color', 'Heading Text Color', 'Title, subtitle, search, filters, group headings'],
              ['accent_color', 'Card Background', 'Card and modal background'],
              ['card_text_color', 'Card Text Color', 'Names and bios on cards and modal'],
              ['primary_color', 'Accent Color', 'Active buttons, tags, hover effects, underlines'],
            ].map(([key, label, desc]) => (
              <div key={key} style={rowStyle}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="color" value={settings[key]} onChange={e => update(key, e.target.value)}
                    style={{ width: '36px', height: '36px', borderRadius: '6px', border: 'none', cursor: 'pointer' }} />
                  <input value={settings[key]} onChange={e => update(key, e.target.value)} style={inputStyle} />
                </div>
              </div>
            ))}
            {/* Color preview card */}
            <div style={{ marginTop: '20px', padding: '16px', background: settings.bg_color, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginRight: '8px' }}>PREVIEW</div>
              <div style={{ background: settings.accent_color, border: `1px solid ${settings.primary_color}4d`, borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: settings.card_text_color, fontFamily: `'${settings.font}', serif` }}>
                    {settings.last_initial_only ? 'Bill L.' : 'Bill Lloyd'}
                  </div>
                  <div style={{ fontSize: '12px', color: settings.primary_color, marginTop: '4px' }}>Tax Planning</div>
                </div>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Font</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {PRESET_FONTS.map(font => (
                <button key={font} onClick={() => update('font', font)}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${settings.font === font ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`, background: settings.font === font ? 'rgba(18,94,204,0.08)' : 'transparent', color: settings.font === font ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>
                  {font}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input type="search" name="search" autoComplete="off" value={fontSearch} onChange={e => handleFontSearch(e.target.value)}
                placeholder="Search Google Fonts..."
                style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
              {fontResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(20,45,95,0.14)' }}>
                  {fontResults.map(font => (
                    <div key={font} onClick={() => selectFont(font)}
                      style={{ padding: '10px 14px', cursor: 'pointer', color: 'var(--vfo-muted)', fontSize: '13px', borderBottom: '1px solid var(--vfo-tint)' }}
                      onMouseEnter={e => e.target.style.background = 'var(--vfo-tint)'}
                      onMouseLeave={e => e.target.style.background = 'none'}>
                      {font}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: '12px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)', textAlign: 'center' }}>
              <span style={{ fontSize: '20px', color: 'var(--vfo-ink)', fontFamily: `'${settings.font}', serif` }}>The quick brown fox jumps over the lazy dog</span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Display Options</div>
            {[
              ['last_initial_only', 'Last Name Initial Only', 'Show "Bill L." instead of "Bill Lloyd"'],
              ['show_count', 'Show Specialist Count', 'Display "60 SPECIALISTS" text'],
              ['show_search', 'Show Search Bar', 'Display the search specialists input'],
            ].map(([key, label, desc]) => (
              <div key={key} style={rowStyle}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{desc}</div>
                </div>
                <div onClick={() => update(key, !settings[key])}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', background: settings[key] ? '#125ecc' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', left: settings[key] ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
                </div>
              </div>
            ))}
            <div style={rowStyle}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Font Size</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Base font size for the widget ({settings.widget_font_size}px)</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>14</span>
                <input type="range" min={14} max={22} value={settings.widget_font_size} onChange={e => update('widget_font_size', parseInt(e.target.value))} style={{ width: isPhone ? '110px' : '140px', accentColor: '#125ecc', cursor: 'pointer' }} />
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>22</span>
              </div>
            </div>
            <div style={rowStyle}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Display Mode</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>How specialists are organized</div>
              </div>
              <div style={{ display: 'flex', gap: isPhone ? '6px' : '8px', flexShrink: 0 }}>
                {[['filter', 'Filter Buttons', 'Filters'], ['grouped', 'Grouped', 'Grouped']].map(([val, label, phoneLabel]) => (
                  <button key={val} onClick={() => update('display_mode', val)}
                    style={{ padding: isPhone ? '5px 11px' : '6px 14px', borderRadius: '6px', border: `1px solid ${settings.display_mode === val ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`, background: settings.display_mode === val ? 'rgba(18,94,204,0.08)' : 'transparent', color: settings.display_mode === val ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: isPhone ? '12.5px' : '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {isPhone ? phoneLabel : label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {appearanceTab === 'plugin' && (
        <div style={sectionStyle}>
          {isAdmin && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Website Plugin</div>
              <div style={rowStyle}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>Enable Website Plugin</div>
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Allow this member to use their showroom widget</div>
                </div>
                <div onClick={() => update('website_enabled', !settings.website_enabled)}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', background: settings.website_enabled ? '#125ecc' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', left: settings.website_enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
                </div>
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Embed Code</div>
            <p style={{ color: '#5a8ab5', fontSize: '14px', marginBottom: '12px', textAlign: 'left' }}>Copy this code and paste it into an HTML widget on your website.</p>
            <pre style={{ background: '#16264a', padding: isPhone ? '12px' : '16px', borderRadius: '8px', color: '#cdd9ea', fontSize: isPhone ? '12px' : '13px', overflowX: 'auto', whiteSpace: 'pre-wrap', ...(isPhone ? { wordBreak: 'break-all' } : {}), fontFamily: 'monospace', margin: '0 0 12px', textAlign: 'left' }}>{embedCode}</pre>
            <button onClick={(e) => { navigator.clipboard.writeText(embedCode); const btn = e.currentTarget; btn.textContent = '✓ Copied!'; btn.style.background = 'rgba(39,174,96,0.15)'; setTimeout(() => { btn.textContent = 'Copy Code'; btn.style.background = 'transparent'; }, 2000) }}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(39,174,96,0.3)', background: 'transparent', color: '#27ae60', fontSize: '13px', cursor: 'pointer' }}>
              Copy Code
            </button>
          </div>
        </div>
      )}

      {appearanceTab === 'preview' && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Live Preview</div>
          {dirty && <div style={{ fontSize: '13px', color: '#b08d26', marginBottom: '12px' }}>Save your changes first to see them in the preview.</div>}
          <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--vfo-border)' }}>
            <iframe
              key={dirty ? 'stale' : Date.now()}
              srcDoc={`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; background: ${settings.bg_color}; }</style>
</head><body>
<div id="vfo-showroom"></div>
<script src="https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/vfo-widget/vfo-widget.js?v=26" data-vfo-key="${member.manage_key}"><\/script>
</body></html>`}
              style={{ width: '100%', height: '700px', border: 'none', borderRadius: '10px' }}
              title="Widget Preview"
            />
          </div>
        </div>
      )}

      {appearanceTab !== 'preview' && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--vfo-page)', borderTop: '1px solid var(--vfo-border)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {dirty && <span style={{ fontSize: '13px', color: '#b08d26' }}>You have unsaved changes</span>}
          <button onClick={save} style={{ padding: isPhone ? '8px 20px' : '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: isPhone ? '13px' : '14px', cursor: 'pointer' }}>Save Changes</button>
          {status && <span style={{ color: statusType === 'success' ? '#27ae60' : '#d93025', fontSize: '13px' }}>{status}</span>}
        </div>
      )}
    </div>
  )
}