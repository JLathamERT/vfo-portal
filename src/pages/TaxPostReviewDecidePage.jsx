import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import DecisionConfirmCard from '../components/shared/DecisionConfirmCard'

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

export default function TaxPostReviewDecidePage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('confirm')
  const [error, setError] = useState('')
  const [decision, setDecision] = useState(() => searchParams.get('decision') || '')

  useEffect(() => {
    const token = searchParams.get('token')
    const dec = searchParams.get('decision')
    if (!token || !dec) {
      setError('Invalid link — missing required parameters.')
      setStatus('error')
      return
    }
    setDecision(dec)
    setStatus('confirm')
  }, [])

  function handleConfirm() {
    setStatus('processing')
    processDecision()
  }

  async function processDecision() {
    const token = searchParams.get('token')
    const dec = searchParams.get('decision')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'automation_TAX_postreviewclientdecision',
          token,
          decision: dec,
        }),
      })
      const data = await res.json()
      if (data.existing_decision) {
        setDecision(data.existing_decision)
        setStatus('already_submitted')
        return
      }
      if (data.window_expired) {
        setStatus('window_expired')
        setError(data.error || '')
        return
      }
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        setStatus('error')
        return
      }
      // The decision IS recorded (HTTP 200) but the Stripe refund did not go
      // through. Never promise a confirmation email the refund handler will not
      // send — show the "received, we'll process it" state instead.
      if (data.refund_failed) {
        setStatus('refund_pending')
        return
      }
      setStatus('success')
    } catch (err) {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
    }
  }

  if (status === 'confirm') {
    const confirm = getConfirm(decision)
    return (
      <TokenShell maxWidth={520}>
        <DecisionConfirmCard {...confirm} onConfirm={handleConfirm} />
      </TokenShell>
    )
  }

  const view = getView(status, decision, error)
  return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div style={{ ...iconCircleStyle, background: view.color + '20' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>{view.icon}</span>
        </div>
        <h1 style={titleStyle}>{view.title}</h1>
        <p style={messageStyle}>{view.message}</p>
      </div>
    </TokenShell>
  )
}

function getConfirm(decision) {
  if (decision === 'Refund') {
    return {
      title: 'Please confirm your decision',
      message: "You're about to request a refund of your retainer. A member of our team will contact you to confirm before anything is refunded.",
      buttonLabel: 'Confirm — request a refund',
      buttonColor: '#ef4444',
    }
  }
  return {
    title: 'Please confirm your decision',
    message: "You're about to confirm that you would like to continue with your Tax Planning Engagement.",
    buttonLabel: 'Confirm — continue my engagement',
    buttonColor: '#16a34a',
  }
}

function getView(status, decision, error) {
  if (status === 'processing') {
    return { icon: '⏳', color: '#0095ff', title: 'Processing your response…', message: 'Please wait, do not close this page.' }
  }
  if (status === 'already_submitted') {
    return { icon: 'ℹ️', color: '#0095ff', title: 'Already Received', message: "We've already received your response — no further action is needed. Thank you!" }
  }
  if (status === 'window_expired') {
    return { icon: '⏰', color: '#e06717', title: 'Window Closed', message: error || 'The refund window has closed. Your engagement has been locked in. Please contact us if you have questions.' }
  }
  // Decision recorded, automatic refund failed. Amber like the window_expired
  // state — this is neither a clean success nor an error the client caused, and
  // the copy deliberately promises no confirmation email.
  if (status === 'refund_pending') {
    return { icon: '⏳', color: '#e06717', title: 'Refund Request Received', message: 'Your refund request has been received. Our team will review and process it, and will be in touch.' }
  }
  if (status === 'error') {
    return { icon: '⚠️', color: '#ef4444', title: 'Something Went Wrong', message: error || 'An unexpected error occurred. Please contact us.' }
  }
  if (decision === 'Refund') {
    // A request only (2026-10-23): the team confirms it with the client before
    // anything is refunded, so this page promises neither a refund nor an email.
    return { icon: '✓', color: '#16a34a', title: 'Refund Requested', message: 'Thank you — we have received your refund request. A member of our team will contact you to confirm it before any refund is made.' }
  }
  return { icon: '✓', color: '#16a34a', title: 'Thank You — Moving Forward', message: "We're delighted to continue with your Tax Planning Engagement. Our team will be in touch with next steps shortly." }
}

const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const messageStyle = { fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
