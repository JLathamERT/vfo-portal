import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'

// The Feature Switches tab (2026-09-28) — superadmin (Jake) only, under More ▾.
// Each card is one portal_feature_flags row: what switching it ON adds, what
// stays while it is OFF, and a three-position control. The backend
// (feature_switches_load / feature_switches_save, SUPERADMIN_ONLY_ACTIONS) is the
// real gate; this panel only renders for is_superadmin.
//
// Positions: Off for all · Test member only (59524) · On for all (test member
// included). A public-page switch (memberScoped false) has only Off / On.
// The COPY below is the contract Jake reads before flipping — when a feature
// behind a switch changes, change its card in the same commit.

const SWITCH_COPY = {
  portal_licensing: {
    title: 'New tax agreement + client portal licensing',
    on: [
      'Tax agreement: the collaborating-team sentence at the end of the opening paragraph ("In this case your collaborating team are [Tax Planning Group] and [Member\'s company or name] and VFO Services.")',
      'Tax agreement: the "Additional Benefits" section after the Double Guarantee — Free VFO Portal Membership for 12 months (VFO Showroom, Client Vault, 12 Months of Proactivity, Connectivity Feature), Discounted Future Tax Planning Fees (15%, or 25% when concluded before Q4) and the Q4 new-engagement sentence.',
      'The sample agreement PDF attached to the Undecided quote email and the Rapid Route email switches to the new wording.',
      'A 12-month client portal licence for every tax client whose retainer is paid (card, ACH when it settles, check when it clears) while this is on. A second tax year while one is running extends it and costs only the extra days.',
      'A client portal login created automatically on that payment, and a separate "Your VFO client portal is ready" email to the client (Draft) with a "Set up my portal login" button, or "Sign in to my portal" if they already have a login.',
      'The client portal gets a Home screen ("Welcome back") that shows the licence expiry date.',
      '$300 of the retainer goes to VFO Portal before the revenue share is split, so every share is calculated on the retainer less $300. Shown on the revenue-share emails and the split screens (the money stays in the VFO Services balance until the VFO Portal Stripe account exists).',
      'Any refund of the tax retainer, full or partial, revokes the licence.',
    ],
    off: 'The tax agreement as it was before 24 Sept 2026 (no collaborating-team sentence, no Additional Benefits section) and its sample PDFs. No licence, no automatic client login, no login email, no Home screen, and revenue shares split the whole retainer.',
    note: 'Applies to agreements sent and retainers paid after the switch. Agreements already sent or signed, and retainers already paid, are never changed.',
  },
  client_basic_portal: {
    title: 'Basic client portal: members send portal access',
    on: [
      'A "Send portal access" button at the bottom of the Profile tab on the member\'s view of each of their clients ("Resend portal access" once sent). The member chooses when; there is no way to take access away again.',
      'Clicking it creates the client\'s portal login if they have none and emails the client "[Member] has set up your VFO client portal" with a "Set up my portal login" button (or "Sign in to my portal" if they already have a login). The email is a Draft until it is switched to Send in the Email Editor (Client Portal section).',
      'A $0 Basic licence is recorded for the client the first time access is sent, so a price can be added later. The client never sees a cost.',
      'The Basic portal: a client of this member WITHOUT an active tax client portal licence sees the Showroom only — no Vault tab, and the Vault is refused if they try to reach it another way. A client whose tax licence is active keeps Showroom + Vault; when it expires or is refunded they drop to Showroom only.',
      'A "Request an introduction" button on each specialist in the client\'s Showroom (Basic and Standard alike). One click emails the member "[Client] has asked for an introduction to [Specialist]" (Tracy Bcc\'d; Draft until switched to Send in the Email Editor) and rings a bell for Tracy. Once per specialist: the button then reads "Introduction requested MM/DD/YYYY".',
    ],
    off: 'No Send portal access button for members, and no portal access emails. Clients who already have a login keep it, and the client portal shows exactly what it shows today (Showroom + Vault for every client).',
    note: 'Keyed on the client\'s member. A tax licence only exists while "New tax agreement + client portal licensing" is on for that member, so with that switch off every client of the member is Basic (Showroom only).',
  },
  mirrored_clients: {
    title: 'Client Mirroring: mirror a client to another member',
    on: [
      'A "Client Mirroring" card on the Profile tab of each of the member\'s clients (and on the admin client Profile tab). The member\'s Connections are listed with a one-click Mirror, and "Mirror to a member" searches every active member by name or member number.',
      'A client can be mirrored to several members. The member or an admin can stop mirroring at any time; a member a client is mirrored to can leave.',
      'Mirroring emails that member (a Draft until it is switched to Send in the Email Editor, Client Portal section) and rings their portal bell.',
      'That member sees the client\'s case on their own portal, view-only: MAP 1 / Holistic, Tax Planning (with the intake answers), PIP and Regular priorities, the shared notes, the Client Vault (view and download) and the Additional Contacts. They can change nothing and never see fees, payments or revenue shares. Nothing about revenue share changes.',
    ],
    off: 'No Client Mirroring card and no client can be mirrored. Any member a client is already mirrored to stops seeing it at once (the record is kept, so switching back on restores it).',
    note: 'Keyed on the client\'s OWNING member - the other member\'s own switch position does not matter. The new Client Overview tab for members is not behind this switch.',
  },
  ciq_licence: {
    title: 'CIQ licence: $25/month Standard portal for a client (BEING BUILT)',
    on: [
      'A client of this member with the Standard portal (today: an active tax client portal licence) gets a "My One Page Plan" tab in their client portal: their One Page Plan from the CIQ, read-only - Immediate, Parked and Completed priorities, plus earlier versions under History. Never the questionnaire answers.',
      'The member\'s own client Profile tab, and the Profile tab of a member the client is mirrored to (Client Mirroring), show the same read-only One Page Plan card.',
      'The client portal Home line reads "Your VFO client portal membership is active." when the Standard portal comes from a monthly licence rather than a tax licence.',
      'The member\'s client Profile tab, in the Client Portal card: "Standard portal - $25/month" - Turn on (card or bank sign-in; the first time through a Stripe page that saves it, later clients reuse it), Turn off (stays on to the end of the paid month, then Basic again) and Keep it on. Needs portal access sent first. A client with an active tax licence reads "Covered by the tax licence until ..." and cannot be charged.',
      'Every paid month: an invoice + receipt PDF emailed to the member (Bcc Tracy, Paul, Anton) and filed in their ERT/VFOS Documentation vault; a bank payment also gets a "payment started" email. Both emails are Drafts until switched to Send in the Email Editor (Client Portal section). Card adds the usual 2.9% + $0.30 card fee (shown on the invoice and receipt); bank has no fee. In Stripe the charge reads "VFO Portal - CIQ licence - <client>", on VFO Services.',
      'Starting a CIQ for a client records a $0 CIQ licence for them (the free option), so a price can be added later.',
      'STILL BEING BUILT (not live yet): the failed-payment email + bell and update-payment-method link, a tax licence stopping an open $25 automatically, and the MSM "Member drives CIQ" switch for new members.',
    ],
    off: 'Exactly as today: no My One Page Plan tab, no One Page Plan card on member client profiles, no upgrade control, no $25 charge.',
    note: 'Keyed on the client\'s OWNING member. Will also need "Basic client portal" on for that member (the Basic / Standard split only exists while it is on).',
  },
  tpom_additional_benefits: {
    title: 'TPOM presentation: Additional Benefits slide',
    on: [
      'Every newly generated TPOM presentation includes the "Additional Benefits" slide straight after "Our Double-Guarantee" (32 slides two-year / 30 single-year).',
    ],
    off: 'The slide is left out (31 slides two-year / 29 single-year). Every other slide is the latest version either way.',
    note: 'Decks already generated are not changed — regenerate a deck to pick up the switch.',
  },
  tax_reminders: {
    title: 'Tax reminder chases',
    on: [
      'Additional information: a reminder to the client (Cc the PF, the member, the tax planner and team member, Tracy, Tray and any additional contacts on the client) 2 business days after the "Additional information required" email, repeating every 2 business days until they upload or reply.',
      'Planner review: a reminder to the tax planner and team member (Cc Tracy, Tray and the PF) 2 business days after the planner is allocated, repeating every 2 business days until "Tax planner review complete" is answered (paused while waiting on the client for more information).',
      'Both are Draft emails and only go out Mon-Fri in ET business hours.',
    ],
    off: 'Neither reminder is sent; the one-off planner bells work as before.',
    note: 'The planner chase covers plans allocated after 28 Sept 2026 only. The number of days is set in the Notification Editor.',
  },
  tax_intake: {
    title: 'Tax Planning tab + existing-client tax form',
    on: [
      'The Tax Planning tab shows for every member, with the "+ Add new tax client" button.',
      'The Tax Planning Form for an EXISTING client (the Holistic route) from that tab, and the Holistic tax-form email to the member after a MAP 1 first payment.',
    ],
    off: 'The Tax Planning tab shows only for members with the program enabled, with no Add button, and no Holistic form or email. Adding a NEW tax client is not affected: since 14 Oct 2026 every member does that from the Tax Diagnostic tab, and its form, deposit and client links work whatever this switch says.',
  },
  tax_direct: {
    title: 'Direct to Tax Planning',
    on: [
      'A member with 2 qualifying tax clients can choose "Direct" when adding a tax client and run the case themselves — the member is the PF, the split is 45/45/10, and the PF bells go to the member.',
    ],
    off: 'Every new tax case is run by VFO Services. Existing Direct cases carry on unchanged.',
    note: 'Direct is chosen on the intake form, so members can only reach it while "Members add their own tax clients" is on for them too.',
  },
  tax_diagnostic: {
    title: 'Public VFO Tax Diagnostic page',
    on: [
      'vfoportal.com/tax-diagnostic is open to the public; submissions land in the Tax Diagnostics queue for the team to confirm.',
      'Deposit links sent from a confirmed diagnostic can be paid.',
    ],
    off: 'The public page is closed, and deposit links from diagnostics stop working.',
    note: 'A public page has no member, so this switch is On or Off for everyone — there is no test-member position.',
  },
}

const POSITIONS = [
  { mode: 'off', label: 'Off for all' },
  { mode: 'test', label: 'Test member only' },
  { mode: 'on', label: 'On for all' },
]

const MODE_PILL = {
  off: { label: 'OFF', color: '#e74c3c' },
  test: { label: 'TEST MEMBER ONLY', color: '#e67e22' },
  on: { label: 'ON FOR ALL', color: '#27ae60' },
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export default function FeatureSwitchesPanel() {
  const [switches, setSwitches] = useState([])
  const [testMember, setTestMember] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await callApi('feature_switches_load')
      if (data.error) throw new Error(data.error)
      setSwitches(data.switches || [])
      setTestMember(data.test_member || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function setMode(sw, mode) {
    if (mode === sw.mode || busyKey) return
    const title = SWITCH_COPY[sw.key]?.title || sw.key
    const what = mode === 'on'
      ? 'ON for EVERY member, starting immediately.'
      : mode === 'test'
        ? `OFF for everyone except the test member (${testMember}).`
        : 'OFF for everyone, including the test member.'
    if (!window.confirm(`"${title}"\n\nThis turns it ${what}\n\nContinue?`)) return
    setBusyKey(sw.key)
    try {
      const res = await callApi('feature_switches_save', { key: sw.key, mode })
      if (res.error) throw new Error(res.error)
      setSwitches(prev => prev.map(s => s.key === sw.key ? { ...s, mode: res.mode, updated_at: res.updated_at, updated_by: res.updated_by } : s))
    } catch (e) {
      alert('Could not change the switch: ' + e.message)
    } finally {
      setBusyKey(null)
    }
  }

  const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-faint)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '14px 0 6px', fontWeight: 600 }
  const listStyle = { margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 6px' }}>Feature Switches</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        Features that are built but held back from real members. While a switch is off the portal behaves exactly as it did before the feature. "Test member only" turns it on for the test member ({testMember || '59524'}) alone, so it can be tried on the real portal. A change takes effect immediately — no deploy.
      </p>

      {loading && <div style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Loading…</div>}
      {error && <div style={{ color: '#e74c3c', fontSize: '14px', marginBottom: '16px' }}>{error}</div>}

      {!loading && switches.map(sw => {
        const copy = SWITCH_COPY[sw.key] || { title: sw.key, on: [], off: '' }
        const pill = MODE_PILL[sw.mode] || MODE_PILL.off
        const positions = sw.member_scoped ? POSITIONS : POSITIONS.filter(p => p.mode !== 'test')
        const busy = busyKey === sw.key
        return (
          <div key={sw.key} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{copy.title}</div>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: pill.color, borderRadius: '999px', padding: '4px 12px' }}>{pill.label}</span>
            </div>

            <div style={labelStyle}>What switching it on adds</div>
            <ul style={listStyle}>
              {copy.on.map((t, i) => <li key={i}>{t}</li>)}
            </ul>

            {copy.coming && copy.coming.length > 0 && (
              <>
                <div style={labelStyle}>Also rides on this switch once built (not in the portal yet)</div>
                <ul style={{ ...listStyle, color: 'var(--vfo-muted)' }}>
                  {copy.coming.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </>
            )}

            <div style={labelStyle}>While it is off</div>
            <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{copy.off}</div>

            {copy.note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '10px' }}>{copy.note}</div>}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', overflow: 'hidden' }}>
                {positions.map(p => {
                  const active = sw.mode === p.mode
                  return (
                    <button
                      key={p.mode}
                      onClick={() => setMode(sw, p.mode)}
                      disabled={busy || !sw.exists}
                      style={{
                        padding: '8px 16px', border: 'none', borderRight: '1px solid var(--vfo-border-strong)',
                        background: active ? MODE_PILL[p.mode].color : 'transparent',
                        color: active ? '#fff' : 'var(--vfo-ink)', fontWeight: active ? 700 : 500, fontSize: '13px',
                        cursor: busy || active ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif',
                      }}
                    >{p.label}</button>
                  )
                })}
              </div>
              {busy && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Saving…</span>}
              {!sw.exists && <span style={{ fontSize: '12px', color: '#e74c3c' }}>This switch has no row in the database yet — it reads as off.</span>}
              {sw.updated_at && (
                <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
                  Last changed {fmtWhen(sw.updated_at)}{sw.updated_by ? ` by ${sw.updated_by}` : ''}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
