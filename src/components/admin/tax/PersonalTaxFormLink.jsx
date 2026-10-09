import { useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'

// ONE tax plan's personal Tax Planning Form link (/tax-diagnostic?client=<token>) —
// the existing-client route: no $500 deposit, the answers land on THIS plan (#593).
// Admin-only (tax_personal_link_get is ADMIN_ONLY_ACTIONS). The link is fetched when
// the box mounts (which creates the plan's token the first time; a copied link never
// changes), so the Copy click writes to the clipboard at once — the browser only
// allows that inside the click itself. The URL is never shown, only copied.
const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '20px 24px', marginBottom: '20px' }

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
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', marginBottom: '4px' }}>Personal Tax Planning Form link</div>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>
          For this tax plan — no $500 deposit and no duplicate client. Never send an existing client the public diagnostic link.
        </div>
        {error && (
          <div style={{ fontSize: '12px', marginTop: '6px', color: '#d93025' }}>
            {error}{' '}
            {!url && <button onClick={() => setAttempt(a => a + 1)} style={{ background: 'none', border: 'none', color: '#0095ff', fontSize: '12px', cursor: 'pointer', padding: 0 }}>Try again</button>}
          </div>
        )}
      </div>
      <button onClick={copy} disabled={!ready}
        style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.6, whiteSpace: 'nowrap' }}>
        {loading ? 'Loading link…' : copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  )
}
