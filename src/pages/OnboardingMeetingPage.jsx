import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TokenShell from '../components/shared/TokenShell'
import DecisionConfirmCard from '../components/shared/DecisionConfirmCard'

// Public /onboarding-meeting?token=&response= page, opened from the CONFIRM /
// CANCEL / RESCHEDULE buttons in the advisor and accountant meeting reminder
// emails. Corporate mail scanners open every link, so nothing is recorded on
// load — the response is only POSTed when the visitor clicks (gotcha #290).

const API_URL = import.meta.env.VITE_API_URL || 'https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api'

const RESPONSES = ['confirm', 'cancel', 'reschedule']

export default function OnboardingMeetingPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('confirm')
  const [error, setError] = useState('')
  const [response, setResponse] = useState(() => searchParams.get('response') || '')
  const [teamMember, setTeamMember] = useState('')
  const [rescheduleLink, setRescheduleLink] = useState('')
  const [already, setAlready] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    const resp = searchParams.get('response')
    if (!token || !RESPONSES.includes(resp)) {
      setError('Invalid link — missing required parameters.')
      setStatus('error')
      return
    }
    setResponse(resp)
    setStatus('confirm')
  }, [])

  function handleConfirm() {
    setStatus('processing')
    submitResponse()
  }

  async function submitResponse() {
    const token = searchParams.get('token')
    const resp = searchParams.get('response')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'automation_ONBOARDING_meetingresponse',
          token,
          response: resp,
        }),
      })
      const data = await res.json()
      setTeamMember(data.team_member || '')
      setRescheduleLink(data.reschedule_link || '')
      if (data.existing_response) {
        setResponse(data.existing_response)
        setAlready(true)
        setStatus('success')
        return
      }
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        setStatus('error')
        return
      }
      setResponse(data.response || resp)
      setStatus('success')
    } catch {
      setError('Unable to connect. Please try again later.')
      setStatus('error')
    }
  }

  if (status === 'confirm') {
    return (
      <TokenShell maxWidth={520}>
        <DecisionConfirmCard {...getConfirm(response)} onConfirm={handleConfirm} />
      </TokenShell>
    )
  }

  const view = getView(status, response, error, teamMember, rescheduleLink)

  return (
    <TokenShell maxWidth={520}>
      <div style={cardStyle}>
        <div className="vfo-statusicon" style={{ ...iconCircleStyle, background: view.color + '20' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>{view.icon}</span>
        </div>
        <h1 style={titleStyle}>{view.title}</h1>
        <p style={messageStyle}>{view.message}</p>
        {view.extra}
        {already && status === 'success' && <p style={noteStyle}>Your response was already recorded.</p>}
      </div>
    </TokenShell>
  )
}

function getConfirm(response) {
  if (response === 'confirm') {
    return {
      title: 'Please confirm your attendance',
      message: "You're about to confirm you will be attending the meeting.",
      buttonLabel: 'Confirm — I will attend',
      buttonColor: '#16a34a',
    }
  }
  if (response === 'cancel') {
    return {
      title: 'Please confirm',
      message: "You're about to cancel the meeting.",
      buttonLabel: 'Confirm — cancel the meeting',
      buttonColor: '#dc2626',
    }
  }
  return {
    title: 'Please confirm',
    message: "You're about to ask us to reschedule the meeting.",
    buttonLabel: 'Confirm — request a new time',
    buttonColor: '#f59e0b',
  }
}

function getView(status, response, error, teamMember, rescheduleLink) {
  if (status === 'processing') {
    return { icon: '⏳', color: '#0095ff', title: 'Processing your response…', message: 'Please wait, do not close this page.' }
  }
  if (status === 'error') {
    return { icon: '⚠️', color: '#ef4444', title: 'Something Went Wrong', message: error || 'An unexpected error occurred.' }
  }
  const who = teamMember || 'our team'
  if (response === 'confirm') {
    return { icon: '✓', color: '#16a34a', title: 'Thank you.', message: `Your meeting with ${who} has been confirmed. We look forward to continuing the process. We will also send you further reminders in advance of the meeting.` }
  }
  if (response === 'cancel') {
    return { icon: '✓', color: '#64748b', title: 'Thank you.', message: `Your meeting with ${who} has been cancelled. Please do not hesitate to contact us if you ever wish to reconsider becoming an ERT Member.` }
  }
  return {
    icon: '✓',
    color: '#f59e0b',
    title: 'Thank you.',
    message: `Your meeting with ${who} has been postponed.`,
    extra: rescheduleLink
      ? <p style={messageStyle}>Use <a href={rescheduleLink} style={linkStyle} target="_blank" rel="noreferrer">this link</a> to their calendar to reschedule at your convenience.</p>
      : <p style={messageStyle}>We will be in touch shortly to arrange a new time.</p>,
  }
}

const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const messageStyle = { fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const noteStyle = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.6, marginTop: '16px' }
const linkStyle = { color: '#125ecc', fontWeight: 600 }
