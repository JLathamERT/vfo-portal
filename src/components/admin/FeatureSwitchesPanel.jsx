import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'

// The Feature Switches tab (2026-09-28) — superadmin (Jake) only, under More ▾.
// The backend (feature_switches_load / feature_switches_save,
// SUPERADMIN_ONLY_ACTIONS) is the real gate; this panel only renders for
// is_superadmin.
//
// Since 2026-10-19 the tab shows CARDS, not raw switches (Jake): a card can hold
// several portal_feature_flags keys that only make sense together, and its
// control writes the same position to every one of them (one
// feature_switches_save per key). If the keys ever disagree (an SQL flip) the card
// reads MIXED until a position is chosen. The keys themselves are unchanged —
// every backend read still names its own key.
//
// Positions: Off for all · Test member only (59524) · On for all (test member
// included). A card whose keys are not all member-scoped has only Off / On.
// The COPY below is the contract Jake reads before flipping — when a feature
// behind a switch changes, change its card in the same commit. Keep `on` / `off`
// short; the full behaviour goes under `details`.

const CARDS = [
  {
    id: 'client_portal',
    keys: ['portal_licensing', 'client_basic_portal', 'ciq_licence', 'tpom_additional_benefits'],
    title: 'VFO Client Portal',
    on: [
      ['Tax agreement + TPOM presentation', 'both gain the "Additional Benefits" wording (12 months free portal membership, discounted future tax planning), and the agreement names the client\'s collaborating team.'],
      ['Basic portal, $0 a month', 'members can send any client portal access. The client sees the Showroom and can ask for specialist introductions.'],
      ['Premium portal, $25 a month', 'adds the Client Vault, the client\'s One Page Plan and, while its own switch is on, My Progress. Members turn it on per client and pay monthly by card or bank.'],
      ['Tax clients', 'a paid tax retainer gives the client the Premium portal free for 12 months, with a login email. $300 of the retainer goes to VFO Portal before the revenue share; a refund takes the portal away.'],
    ],
    off: 'The old tax agreement and TPOM presentation. Members cannot send portal access, there are no licences and no $25 charges, and every client keeps Showroom + Vault as today.',
    note: 'Keyed on the client\'s member. Applies to agreements sent, decks generated and retainers paid after the switch — nothing already sent or paid changes.',
    // Inside this card but flipped on their own (portal licensing L8, decision 73).
    subSwitches: [
      {
        key: 'client_case_progress',
        title: 'My Progress tab',
        on: 'A Premium client gets a "My Progress" tab in their portal: the case progress their member sees on the client page — every program, step and status (MAP 1, Regular Priorities, Tax Priorities and PIP Meetings for a Holistic client; Tax Planning for a Tax Planning client), completed and stopped plans included. Read-only, every amount blanked, no notes.',
        off: 'No My Progress tab. The client portal is exactly as the switch above leaves it.',
        note: 'Its own switch, keyed on the client\'s member. Only Premium clients see the tab, so the switch above must be on too.',
      },
    ],
    details: [
      ['Tax agreement + TPOM presentation', [
        'Tax agreement: the collaborating-team sentence at the end of the opening paragraph ("In this case your collaborating team are [Tax Planning Group] and [Member\'s company or name] and VFO Services.").',
        'Tax agreement: the "Additional Benefits" section after the Double Guarantee — Free VFO Portal Membership for 12 months (VFO Showroom, Client Vault, 12 Months of Proactivity, Connectivity Feature), Discounted Future Tax Planning Fees (15%, or 25% when concluded before Q4) and the Q4 new-engagement sentence.',
        'The sample agreement PDF on the Undecided quote email and the Rapid Route email uses the new wording.',
        'Every newly generated TPOM presentation has the "Additional Benefits" slide straight after "Our Double-Guarantee" (32 slides two-year / 30 single-year; 31 / 29 without it). Decks already generated are not changed.',
      ]],
      ['Basic portal ($0 a month)', [
        'A "Send portal access" button at the bottom of the Profile tab on the member\'s view of each client ("Resend portal access" once sent). It creates the client\'s login if they have none and emails the client "[Member] has set up your VFO client portal" (Draft until switched to Send in the Email Editor, Client Portal section). Access cannot be taken away again.',
        'A $0 Basic licence is recorded the first time access is sent, so a price can be added later.',
        'A client without the Premium portal sees the Showroom only — no Vault tab, and the Vault is refused if reached another way. When a Premium portal ends they drop back to Showroom only.',
        'A "Request an introduction" button on each Showroom specialist (Basic and Premium): emails the member (Tracy Bcc\'d, Draft) and rings a bell for Tracy. Once per specialist.',
      ]],
      ['Premium portal ($25 a month)', [
        'On the member\'s client Profile tab, in the Client Portal card: "Premium portal - $25/month" — Turn on (card or bank sign-in; the first time through a Stripe page that saves it, later clients reuse it), Turn off (stays on to the end of the paid month, then Basic again) and Keep it on. Needs portal access sent first. A client with an active tax licence reads "Included with ...\'s tax planning until ..." and is not charged.',
        'A Premium client gets a "My One Page Plan" tab in their portal: their One Page Plan from the CIQ, read-only, with earlier versions under History — never the questionnaire answers.',
        'Change / Update payment method: card or bank, with a warning that it moves ALL of the member\'s Premium portals; each is re-priced ($26.06 card / $25.00 bank).',
        'Every paid month: an invoice + receipt PDF to the member (Cc Tracy, Bcc Paul and Anton), filed in their ERT/VFOS Documentation vault; a bank payment also gets a "payment started" email. Card adds 2.9% + $0.30. In Stripe a new subscription reads "VFO Portal - Premium portal - <client>", on VFO Services.',
        'A failed payment: one email to the member at once (with an Update payment method button) and ONE reminder 2 business days later — no bells. The client is on Basic until it is paid.',
        'When the client pays a tax retainer, a paid $25 month runs to its end and the $25 then stops (no further charge, nothing refunded); the tax year starts that day. A $25 with a failed or still-clearing payment stops at once and the tax year starts straight away. The member is emailed either way.',
        'Starting a CIQ records a $0 Basic licence for the client. The admin CIQ setting for the member reads "Member drives CIQ (training complete)"; while this is On for all, new members start with it off.',
        'All five Premium portal emails are To the member, Cc Tracy, Bcc Paul and Anton, and are Drafts until switched to Send in the Email Editor (Client Portal section).',
      ]],
      ['Tax clients', [
        'A 12-month Premium portal licence for every tax client whose retainer is paid (card, ACH when it settles, check when it clears). Every paid retainer buys a full 12 months: a second one while a licence is running starts when the running one ends.',
        'A client portal login is created on that payment, with a separate "Your VFO client portal is ready" email (Draft) — "Set up my portal login", or "Sign in to my portal" if they already have one.',
        'The client portal gets a Home screen ("Welcome back") showing the licence expiry date.',
        '$300 of every paid retainer goes to VFO Portal before the revenue share is split, shown on the revenue-share emails and split screens (it stays in the VFO Services balance until the VFO Portal Stripe account exists).',
        'Any refund of the tax retainer, full or partial, revokes the licence.',
      ]],
    ],
  },
  {
    id: 'mirrored_clients',
    keys: ['mirrored_clients'],
    title: 'Client Mirroring',
    on: [
      [null, 'A member can share a client with another member (e.g. a connected advisor or accountant). The other member sees the case view-only — never fees, payments or revenue shares — and gets an email and a bell.'],
    ],
    off: 'No sharing. Existing shares are hidden, and come back if it is switched on again.',
    note: 'Keyed on the client\'s owning member.',
    details: [
      [null, [
        'A "Client Mirroring" card on the Profile tab of each of the member\'s clients (and the admin client Profile tab): the member\'s Connections with a one-click Mirror, plus "Mirror to a member" to search every active member.',
        'A client can be mirrored to several members. The member or an admin can stop mirroring at any time; a member a client is mirrored to can leave.',
        'Mirroring emails that member (Draft until switched to Send in the Email Editor, Client Portal section) and rings their bell.',
        'The other member sees MAP 1 / Holistic, Tax Planning (with the form answers), PIP and Regular priorities, the shared notes, the Client Vault (view and download) and the Additional Contacts — and can change nothing. Revenue share is not affected.',
      ]],
    ],
  },
  {
    id: 'member_tiers',
    keys: ['member_tiers'],
    title: 'Member portal tiers',
    on: [
      [null, 'Tier 1 members (VFO Associates, Financial Collaborators, Team Members, VFO Reconciliation (Free), Survey #1-3, FAC Historic, Free Legacy TBM) see only Profile, Client Overview and Showroom.'],
      [null, 'On Client Overview they view their own clients and the clients mirrored to them, add clients, Send portal access and mirror their clients to other members. They cannot edit a client, upload to its Vault, give it the $25 Premium portal or use CIQ on it (a client mirrored to them keeps its read-only CIQ).'],
      [null, 'Every other tab (MSM / 90 Day Plan, CIQ, Vault, Tax Diagnostic, Specialists, Growth Plan, GC Marketplace, Website Plugin) is hidden, and refused if reached another way.'],
    ],
    off: 'Every member sees the full portal, as today.',
    note: 'Keyed on the member. The tier comes from the member type alone - every other type (Catalyst, Fusion, VFO FT, Corporate, Accelerator, Plus, Implementation, and every strategic-partner type such as Action Coach and Tax Plan IQ) is Tier 2 and unchanged. Nothing is charged or deleted. To test: Test member only, then set the test member\'s type (VFO Reconciliation (Free) = Tier 1; Catalyst = Tier 2).',
  },
  {
    id: 'tier1_onboarding',
    keys: ['tier1_onboarding'],
    title: 'VFO Associate & Financial Collaborator onboarding',
    // An onboarding has no member yet: the backend reads "Test member only" as
    // "only onboardings whose email is on TEST_ONBOARDING_EMAILS".
    testConfirm: 'OFF for everyone except new onboardings whose email is on the test list (Jake\'s own address).',
    on: [
      [null, 'A new VFO Associate onboarding goes through Stages 1-3 like a VFO FT accountant: the VFO Associate Agreement (Direct or Connected), signing, the CEO countersign, then the first month paid by card or bank before Create & Send Setup Link.'],
      [null, 'New Onboarding in Advisor Onboarding can start a Financial Collaborator, on the same path with the Financial Collaborator Agreement.'],
      [null, 'Once created they pay monthly in Membership Fees: $145 a month ($120 membership + $25 VFO Portal licence), or the $25 VFO Portal licence alone for a connected VFO Associate, which the connected advisor can pay instead. Month to month, ended with 30 days\' notice.'],
    ],
    off: 'Today\'s screens: a VFO Associate onboarding skips Stages 1-2 and there is no Financial Collaborator option. Onboardings already on the new path carry on.',
    note: 'Keyed on the onboarding, not a member: an onboarding is put on the new path when it is created and keeps it. Test member only = only new onboardings whose email is on the test list (Jake\'s own address); those onboardings and the members they become run in sandbox. Existing VFO Associate and Financial Collaborator members are not billed or changed.',
    details: [
      ['The onboarding', [
        'Stage 1: Team Member, Meeting Reminder, Preliminary Meeting, then for a VFO Associate Direct or Advisor Partnership, CC Connected Advisor and "VFO Portal licence paid by" (Accountant or Connected Advisor, connected only), then the decision. No deposit and no implementation value.',
        'Stage 2: the agreement is sent, signed and countersigned by the CEO.',
        'The first month is paid on the onboarding at the payment link (card or bank), with an invoice and receipt showing Membership Fee $120.00 and VFO Portal Licence $25.00 (connected: VFO Portal Licence $25.00 only). When the connected advisor pays, the link and the documents go to the advisor with the accountant Cc\'d.',
        'Create & Send Setup Link stays locked until that payment is booked (a bank payment: until it clears). Create gives the member number, the type VFO Associate (Direct), VFO Associate (Advisor) or Financial Collaborator, the VFO Portal login, and the team email.',
      ]],
      ['Membership Fees', [
        'Create makes the monthly plan with month 1 already paid. Month 2 is charged one month after month 1, on the same card or bank, on the same day each month (the last day of a shorter month).',
        'A card adds 2.9% + $0.30 ($149.64 / $26.06); a bank adds nothing. Every charge marks the $25 VFO Portal licence in Stripe and on the payment row.',
        'The plan shows "End membership (30 days\' notice)" instead of Pause and Terminate: payments due before the end date are still collected, later ones are cancelled, no termination fee, and the member gets an End of Membership Confirmation email.',
        'No renewal notice, no next year\'s terms: after twelve months it carries on at the same price with no email. A missed month uses the usual arrears handling.',
      ]],
      ['Emails', [
        'The VFO Associate / Financial Collaborator versions of the onboarding and Membership Fees emails, and the two team emails, are listed in the Email Editor and are Drafts until switched to Send.',
      ]],
    ],
  },
  {
    id: 'tax_intake',
    keys: ['tax_intake'],
    title: 'Members add clients',
    on: [
      [null, 'Client Overview gets "+ Add Client" — the admin new-client form (name, email, phone, an additional contact). It creates a client profile in no program, ready for portal access later.'],
      [null, 'Every member gets VFO Tax Planning under MSM with "+ Add Client" — the same new-client form as the Tax Diagnostic tab (fill it in, or send the client a link).'],
    ],
    off: 'No "+ Add Client" on Client Overview. VFO Tax Planning shows under MSM only for members enrolled in it, without "+ Add Client". Members add new tax clients from the Tax Diagnostic tab either way.',
  },
  {
    id: 'tax_direct',
    keys: ['tax_direct'],
    title: 'Direct to Tax Planning',
    on: [
      [null, 'A member with 2 or more qualifying tax clients can choose to run a new tax case themselves — they are the PF, the split is 45/45/10, and the PF bells go to them.'],
    ],
    off: 'VFO Services runs every new tax case. Existing Direct cases carry on unchanged.',
    note: 'Chosen on the tax client form ("Who runs this case?"), from the Tax Diagnostic tab or MSM.',
  },
]

// Switches that are permanently ON and must not be flipped from this tab (Jake):
// hidden here only. The flag row stays ON and every backend read is unchanged;
// feature_switches_load still returns it, and SQL can still flip it.
// tax_diagnostic (2026-10-16) = the public vfoportal.com/tax-diagnostic page + its
// deposit links; tax_reminders (the tax reminder chases) and single_client_profile
// (every program on one client page) since 2026-10-19.
const HIDDEN_SWITCHES = ['tax_diagnostic', 'tax_reminders', 'single_client_profile']

const POSITIONS = [
  { mode: 'off', label: 'Off for all' },
  { mode: 'test', label: 'Test member only' },
  { mode: 'on', label: 'On for all' },
]

const MODE_PILL = {
  off: { label: 'OFF', color: '#e74c3c' },
  test: { label: 'TEST MEMBER ONLY', color: '#e67e22' },
  on: { label: 'ON FOR ALL', color: '#27ae60' },
  mixed: { label: 'MIXED', color: '#7f8c8d' },
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
  const [busyCard, setBusyCard] = useState(null)
  const [openDetails, setOpenDetails] = useState({})

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

  // Every card on screen: the CARDS whose keys the backend knows, then any other
  // visible switch on its own (a switch added later without a card still shows).
  const byKey = Object.fromEntries(switches.map(s => [s.key, s]))
  const carded = new Set(CARDS.flatMap(c => [...c.keys, ...(c.subSwitches || []).map(s => s.key)]))
  const cards = [
    ...CARDS.map(c => ({ ...c, rows: c.keys.map(k => byKey[k]).filter(Boolean) })).filter(c => c.rows.length > 0),
    ...switches.filter(s => !carded.has(s.key) && !HIDDEN_SWITCHES.includes(s.key))
      .map(s => ({ id: s.key, keys: [s.key], title: s.key, on: [], off: '', rows: [s] })),
  ]

  async function setMode(card, mode, current) {
    if (mode === current || busyCard) return
    const what = mode === 'on'
      ? 'ON for EVERY member, starting immediately.'
      : mode === 'test'
        ? (card.testConfirm || `OFF for everyone except the test member (${testMember}).`)
        : 'OFF for everyone, including the test member.'
    if (!window.confirm(`"${card.title}"\n\nThis turns it ${what}\n\nContinue?`)) return
    setBusyCard(card.id)
    try {
      for (const row of card.rows) {
        if (row.mode === mode) continue
        const res = await callApi('feature_switches_save', { key: row.key, mode })
        if (res.error) throw new Error(res.error)
        setSwitches(prev => prev.map(s => s.key === row.key ? { ...s, mode: res.mode, updated_at: res.updated_at, updated_by: res.updated_by } : s))
      }
    } catch (e) {
      alert('Could not change the switch: ' + e.message + '\n\nThe card will reload to show where each part stands.')
      load()
    } finally {
      setBusyCard(null)
    }
  }

  // The three positions + status line for one set of rows (a card, or a sub-switch
  // inside a card, which flips only its own row).
  function renderControl(card) {
    const modes = [...new Set(card.rows.map(r => r.mode))]
    const current = modes.length === 1 ? modes[0] : 'mixed'
    const positions = card.rows.every(r => r.member_scoped) ? POSITIONS : POSITIONS.filter(p => p.mode !== 'test')
    const busy = busyCard === card.id
    const missing = card.rows.filter(r => !r.exists)
    const last = card.rows.filter(r => r.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', overflow: 'hidden' }}>
          {positions.map(p => {
            const active = current === p.mode
            return (
              <button
                key={p.mode}
                onClick={() => setMode(card, p.mode, current)}
                disabled={busy || missing.length > 0}
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
        {current === 'mixed' && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Its parts are set differently — choose a position to line them up.</span>}
        {missing.length > 0 && <span style={{ fontSize: '12px', color: '#e74c3c' }}>No database row yet for {missing.map(r => r.key).join(', ')} — it reads as off.</span>}
        {last && (
          <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
            Last changed {fmtWhen(last.updated_at)}{last.updated_by ? ` by ${last.updated_by}` : ''}
          </span>
        )}
      </div>
    )
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

      {!loading && cards.map(card => {
        const modes = [...new Set(card.rows.map(r => r.mode))]
        const current = modes.length === 1 ? modes[0] : 'mixed'
        const pill = MODE_PILL[current] || MODE_PILL.off
        const detailsOpen = !!openDetails[card.id]
        const subs = (card.subSwitches || [])
          .map(s => ({ ...s, id: `${card.id}:${s.key}`, title: `${card.title} - ${s.title}`, label: s.title, rows: [byKey[s.key]].filter(Boolean) }))
          .filter(s => s.rows.length > 0)
        return (
          <div key={card.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{card.title}</div>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: pill.color, borderRadius: '999px', padding: '4px 12px' }}>{pill.label}</span>
            </div>

            {card.on.length > 0 && (
              <>
                <div style={labelStyle}>Switched on</div>
                <ul style={listStyle}>
                  {card.on.map(([head, text], i) => <li key={i}>{head && <strong>{head}: </strong>}{text}</li>)}
                </ul>
              </>
            )}

            {card.off && (
              <>
                <div style={labelStyle}>Switched off</div>
                <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{card.off}</div>
              </>
            )}

            {card.note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '10px' }}>{card.note}</div>}

            {card.details && card.details.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <button type="button" onClick={() => setOpenDetails(o => ({ ...o, [card.id]: !o[card.id] }))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {detailsOpen ? 'Hide details ▴' : 'Details ▾'}
                </button>
                {detailsOpen && card.details.map(([head, items], i) => (
                  <div key={i}>
                    {head && <div style={labelStyle}>{head}</div>}
                    <ul style={{ ...listStyle, fontSize: '13px', color: 'var(--vfo-muted)', marginTop: head ? 0 : '8px' }}>
                      {items.map((t, j) => <li key={j}>{t}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {renderControl(card)}

            {subs.map(sub => {
              const subMode = sub.rows[0].mode
              const subPill = MODE_PILL[subMode] || MODE_PILL.off
              return (
                <div key={sub.id} style={{ borderTop: '1px solid var(--vfo-border-soft)', marginTop: '20px', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{sub.label}</div>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: subPill.color, borderRadius: '999px', padding: '4px 12px' }}>{subPill.label}</span>
                  </div>
                  <div style={labelStyle}>Switched on</div>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{sub.on}</div>
                  <div style={labelStyle}>Switched off</div>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', lineHeight: 1.55 }}>{sub.off}</div>
                  {sub.note && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '10px' }}>{sub.note}</div>}
                  {renderControl(sub)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
