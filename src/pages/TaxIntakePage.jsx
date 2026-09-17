import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import TaxIntakeForm from '../components/member/TaxIntakeForm'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

// PUBLIC page — the client's own Tax Planning Form, reached from the
// "Complete the Tax Planning Form" button in TAX_intake_link. No session and no
// login: the `token` in the URL is the whole credential (#310), and it is the
// only thing this page ever sends that selects anything.
//
// Raw fetch rather than lib/api.js, like every other token page (the api helper
// attaches the portal session and its retry policy, neither of which applies
// here).
export default function TaxIntakePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const paid = searchParams.get('paid') === '1'

  const [status, setStatus] = useState('loading')
  const [intake, setIntake] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('This link is not valid.'); setStatus('error'); return }
    let live = true
    ;(async () => {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tax_intake_link_load', token }),
        })
        const data = await res.json()
        if (!live) return
        if (!res.ok) {
          setError(data?.error || 'This link is not valid.')
          setStatus('error')
          return
        }
        if (data.status === 'completed' || data.status === 'paid' || data.status === 'waived') {
          setStatus('already')
          return
        }
        setIntake(data)
        // Back from Stripe: the webhook creates the case, so there is nothing
        // for this page to do but say thank you.
        setStatus(paid ? 'thanks' : 'form')
      } catch (err) {
        if (!live) return
        setError('Unable to connect. Please try again later.')
        setStatus('error')
      }
    })()
    return () => { live = false }
  }, [token, paid])

  async function submitAnswers(answers) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tax_intake_link_submit', token, answers }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Something went wrong — please try again.')
    return data
  }

  if (status === 'loading') {
    return <TokenShell maxWidth={520}><Message icon="⏳" color="#0095ff" title="One moment" message="Loading your Tax Planning Form..." /></TokenShell>
  }
  if (status === 'error') {
    return <TokenShell maxWidth={520}><Message icon="⚠️" color="#d93025" title="We could not open this form" message={error} /></TokenShell>
  }
  if (status === 'already') {
    return <TokenShell maxWidth={520}><Message icon="✅" color="#1b9254" title="Already submitted" message="This form has already been submitted. There is nothing more for you to do — your VFO member will be in touch." /></TokenShell>
  }
  if (status === 'thanks') {
    return <TokenShell maxWidth={520}><Message icon="✅" color="#1b9254" title="Thank you" message="Thank you. Your Tax Planning Form has been received." /></TokenShell>
  }

  return (
    <TokenShell maxWidth={900}>
      <TaxIntakeForm
        publicMode
        publicIntake={intake}
        onPublicSubmit={submitAnswers}
        onDone={() => setStatus('thanks')}
      />
    </TokenShell>
  )
}

function Message({ icon, color, title, message }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '20' }}>
        <span style={{ fontSize: '32px', lineHeight: 1 }}>{icon}</span>
      </div>
      <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>{title}</h1>
      <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--vfo-muted)', margin: 0 }}>{message}</p>
    </div>
  )
}
