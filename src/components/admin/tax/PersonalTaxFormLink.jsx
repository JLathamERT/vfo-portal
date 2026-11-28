import { useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import { btnPrimary, btnState } from '../../shared/buttonStyles'

// ONE tax plan's personal Tax Planning Form link (/tax-diagnostic?client=<token>) —
// the existing-client route: no $500 deposit, the answers land on THIS plan (#593).
// Admin-only (tax_personal_link_get is ADMIN_ONLY_ACTIONS). The link is fetched when
// the box mounts (which creates the plan's token the first time; a copied link never
// changes), so the Copy click writes to the clipboard at once — the browser only
// allows that inside the click itself. The URL is never shown, only copied.
// One header row like its neighbours (Tax Planning Route): same height, title and pill.
const cardStyle = { background: 'var(--vfo-plan-tool-bg)', border: '1px solid var(--vfo-plan-tool-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '5px 18px', minHeight: '45px', boxSizing: 'border-box', flexWrap: 'wrap' }
const NOTE = 'For this tax plan — no $500 deposit and no duplicate client. Never send an existing client the public diagnostic link.'

export default function PersonalTaxFormLink({ taxPlanId }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true); setError(null)
    callApi('tax_personal_link_get', { tax_plan_id: taxPlanId })
      .then(d => {
        if (!live) return
        if (!d?.ok || !d.url) throw new Error(d?.error || 'Could not get the link.')
        setUrl(d.url)
      })
      .catch(e => { if (live) setError(e.message || 'Could not get the link.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [taxPlanId, attempt])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Your browser blocked copying — please try again.')
    }
  }

  const ready = !!url && !loading
  return (
    <div style={cardStyle} title={NOTE}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Personal Tax Planning Form link</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {error
          ? (
            <span style={{ fontSize: '11px', color: '#d93025' }}>
              {error}{' '}
              {!url && <button type="button" onClick={() => setAttempt(a => a + 1)} style={{ background: 'none', border: 'none', color: '#0095ff', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Try again</button>}
            </span>
          )
          : <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>No $500 deposit, no duplicate client</span>}
        <button type="button" onClick={copy} disabled={!ready}
          style={btnState(btnPrimary, !(ready))}>
          {loading ? 'Loading link…' : copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
