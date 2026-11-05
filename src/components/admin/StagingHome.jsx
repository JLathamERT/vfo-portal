import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'

// The admin home page on the test site, in place of the live KPI cards (Jake
// 2026-11-05). Loaded only in a staging build.

const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '20px 24px', marginBottom: '16px' }
const titleStyle = { fontSize: '16px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '8px' }
const listStyle = { fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55, margin: 0, paddingLeft: '20px' }
const textStyle = { fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55, margin: '0 0 10px' }

function Section({ title, points }) {
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      <ul style={listStyle}>
        {points.map(point => <li key={point} style={{ marginBottom: '6px' }}>{point}</li>)}
      </ul>
    </div>
  )
}

export default function StagingHome() {
  const [logins, setLogins] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    callApi('staging_status_load')
      .then(data => {
        if (data.error) throw new Error(data.error)
        setLogins(data.my_test_logins || [])
      })
      .catch(e => setError(e.message))
  }, [])

  return (
    <div style={{ maxWidth: '720px', margin: '40px auto 40px', textAlign: 'left' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 16px' }}>Things to know when testing</h2>

      <div style={cardStyle}>
        <div style={titleStyle}>Your test logins</div>
        <p style={textStyle}>You have one of each, and your admin password opens them all. If you change it, they all change with it. Each email box can log in once per portal, so tax planner and team member start with TP and TM, and the clients have a tag. Those addresses are only logins: their emails still come to you.</p>
        {error && <div style={{ color: '#e74c3c', fontSize: '14px' }}>{error}</div>}
        {logins.map(login => (
          <div key={login.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '4px 12px', flexWrap: 'wrap', fontSize: '14px', padding: '6px 0', borderTop: '1px solid var(--vfo-border-soft)' }}>
            <a href={login.path} style={{ color: '#0a85e8', textDecoration: 'none', fontWeight: 600 }}>{login.label}</a>
            <span style={{ color: 'var(--vfo-ink)', overflowWrap: 'anywhere' }}>{login.email}</span>
          </div>
        ))}
      </div>

      <Section title="Emails" points={[
        'Every email about your test people comes to you, whoever it is written to. Nothing reaches a real person.',
        'A box at the top of each one says who it would have gone to on live. The subject starts with [TEST].',
        'The scheduled reminders run here too, so an email can arrive without you pressing anything.',
      ]} />

      <Section title="Notifications" points={[
        'Notifications for all your test accounts arrive in your admin account, with a line saying who they were meant for.',
        'Your member, tax planner and team member bells stay empty, and client and specialist logins have no bell.',
        "A notification that is not about anyone's test people goes to all admins.",
      ]} />

      <Section title="If test emails land in spam" points={[
        'Open one in Spam and note the From address.',
        'In Gmail, go to Settings, then Filters and Blocked Addresses, and create a filter for that address.',
        'Tick Never send it to Spam and save. You only do this once.',
      ]} />

      <Section title="Payments and agreements" points={[
        'Everything uses Stripe and BoldSign test accounts, so no real money moves.',
        'Pay by card with 4242 4242 4242 4242, any future expiry date and any CVC.',
        'Every test member, group and specialist is paid out through one shared test Stripe account.',
      ]} />

      <Section title="Starting again" points={[
        'Open the Staging tab, to the right of More, and use Reset my test data. It wipes your test work and leaves everyone else\'s alone.',
        'Your member number and logins stay the same, but you have to sign in again as your member and clients.',
      ]} />

      <Section title="What is different here" points={[
        'Use fake data only. Never upload a real client\'s document or enter real details.',
        'This site has its own database and cannot touch live, so nothing you change here reaches live.',
        'Settings such as email templates and switches are copied from live. Refresh in the Staging tab can overwrite a change you made here.',
        'You can\'t add a member by hand, because each admin gets their own automatically. Onboarding still creates members, so you can test that.',
        'New admins get a full set of test logins the moment they are added.',
        'Merged code updates this site automatically, so its behaviour can change between tests. The Staging tab shows what is running.',
      ]} />
    </div>
  )
}
