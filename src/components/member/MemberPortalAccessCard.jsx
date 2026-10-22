import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { formatDate } from '../../lib/dates'

// Portal licensing L2: the member's "Send portal access" on one of their clients.
// Rendered only when msm_load_client_home carries portal_access, i.e. while the
// client_basic_portal switch is on for this client's member. One click, no
// confirm and no success message (Jake): the button just becomes "Resend portal
// access". Only a refusal (no email, email taken) is shown. There is no revoke
// (decision 9).
//
// Portal licensing L4 (2026-10-16): when msm_load_client_home also carries
// ciq_licence (ciq_licence switch on), the card gains the "Standard portal -
// $25/month" line - turn on / turn off / keep it on, and (Phase 4) Change / Update
// payment method. Every rule is the server's (member_ciq_licence_*,
// member_portal_billing_update_card); the copy never claims a payment the row
// doesn't show (#567) - a return from Stripe shows "Updating…" while the card
// re-reads the server on its own.
// readOnly = the admin view (decision 6: admins see the state, never change it).
export default function MemberPortalAccessCard({ client, portalAccess, onSent, ciqLicence, sectionStyle, cardTitle, readOnly = false }) {
  const [access, setAccess] = useState(portalAccess)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lic, setLic] = useState(ciqLicence)
  const [licBusy, setLicBusy] = useState(false)
  const [licError, setLicError] = useState(null)
  const [showPay, setShowPay] = useState(false)
  const [payMethod, setPayMethod] = useState(null)

  const sentAt = access?.sent_at || null
  const hasLogin = !!access?.has_login
  // A Stripe return flag is read ONCE, then dropped from the URL (react-router's
  // history state kept), so a later refresh does not start the "Updating…" check again.
  const [returnFlags] = useState(() => {
    const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
    return { paid: p.get('ciq_licence') === 'done', updated: p.get('ciq_billing') === 'done' }
  })
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('ciq_licence') && !p.has('ciq_billing')) return
    p.delete('ciq_licence'); p.delete('ciq_billing')
    const qs = p.toString()
    window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? '?' + qs : ''))
  }, [])

  // Back from Stripe, the webhook lands a few seconds AFTER the page loads, so the
  // card checks again on its own (member_ciq_licence_status) instead of asking anyone
  // to refresh (Jake, 2026-10-16: "old people who use this won't understand"). Also
  // while a CARD payment is being confirmed (seconds); a bank payment clearing takes
  // days, so that one is just stated.
  const [mountedAt] = useState(() => Date.now())
  const [syncing, setSyncing] = useState(false)
  const [syncSlow, setSyncSlow] = useState(false)
  function settled(v) {
    if (!v) return true
    if (returnFlags.updated) {
      const moved = v.methods_moved_at ? Date.parse(v.methods_moved_at) : 0
      if (!(moved >= mountedAt - 5 * 60 * 1000)) return false
    }
    if (returnFlags.paid && v.state === 'basic') return false
    if (v.state === 'processing' && v.payment_method_type !== 'ach') return false
    return true
  }
  useEffect(() => {
    if (readOnly || settled(lic)) return
    setSyncing(true)
    let stopped = false
    let tries = 0
    let timer = null
    const tick = async () => {
      if (stopped) return
      tries++
      try {
        const d = await callApi('member_ciq_licence_status', { client_id: client.id })
        if (stopped) return
        if (d?.ok) {
          setLic(d.ciq_licence)
          if (settled(d.ciq_licence)) { setSyncing(false); return }
        }
      } catch { /* keep trying until the limit */ }
      if (tries >= 30) { setSyncing(false); setSyncSlow(true); return }
      timer = setTimeout(tick, 3000)
    }
    timer = setTimeout(tick, 1500)
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  async function send() {
    setBusy(true); setError(null)
    try {
      const d = await callApi('member_client_portal_access_send', { client_id: client.id })
      if (d.ok) {
        setAccess(d.portal_access)
        onSent?.(d.portal_access)
      } else {
        setError(d.error || 'Could not send portal access.')
      }
    } catch (e) {
      setError(e.message || 'Could not send portal access.')
    }
    setBusy(false)
  }

  async function licenceAction(action, extra = {}) {
    if (action === 'member_ciq_licence_stop' && !window.confirm(`Turn off the Standard portal for ${client.first_name || 'this client'}? It stays on until the end of the month you have paid for, then they go back to the Basic portal.`)) return
    setLicBusy(true); setLicError(null)
    try {
      const d = await callApi(action, { client_id: client.id, ...extra })
      if (d?.url) { window.location.href = d.url; return }
      if (d?.ok) setLic(d.ciq_licence)
      else setLicError(d?.error || 'Something went wrong.')
    } catch (e) {
      setLicError(e.message || 'Something went wrong.')
    }
    setLicBusy(false)
  }

  const btn = { padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }
  const ghost = { padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontWeight: 600, cursor: licBusy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }
  const first = client?.first_name || 'your client'
  const fullName = `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'your client'
  const your = readOnly ? "the member's" : 'your'
  const method = lic?.acct_last4 ? ` (${lic.payment_method_type === 'ach' ? 'bank' : 'card'} ending ${lic.acct_last4})` : ''
  const canChangeMethod = !readOnly && ['active', 'ending', 'past_due'].includes(lic?.state) && (lic?.subscription_count || 0) > 0

  return (
    <div style={sectionStyle}>
      <div style={cardTitle}>Client Portal</div>
      {readOnly ? (
        <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: 0 }}>
          {!client?.email ? 'This client has no email address.' : sentAt ? <>Portal access sent <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(sentAt)}</strong>{hasLogin ? ' - the client has a login.' : '.'}</> : 'The member has not sent portal access yet.'}
        </p>
      ) : !client?.email ? (
        <p style={{ fontSize: '13px', color: '#d93025', margin: 0 }}>This client has no email address. Add one to their profile first.</p>
      ) : (
        <button onClick={send} disabled={busy} style={btn}
          title={sentAt ? `Portal access sent ${formatDate(sentAt)}` : undefined}>
          {busy ? 'Sending…' : sentAt ? 'Resend portal access' : 'Send portal access'}
        </button>
      )}
      {error && <p style={{ fontSize: '13px', marginTop: '12px', marginBottom: 0, color: '#d93025' }}>{error}</p>}

      {lic && (
        <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '6px' }}>{lic.state === 'covered' || lic.state === 'handover' ? 'Standard portal' : 'Standard portal - $25/month'}</div>
          {syncing ? (
            <p style={{ fontSize: '13px', color: 'var(--vfo-ink)', margin: '0 0 12px', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span aria-hidden="true" style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--vfo-border-strong)', borderTopColor: '#125ecc', display: 'inline-block', animation: 'vfoSpin 0.8s linear infinite', flexShrink: 0 }} />
              <span><strong>Updating…</strong> This can take up to a minute. This page updates on its own - there is no need to refresh.</span>
              <style>{'@keyframes vfoSpin { to { transform: rotate(360deg) } }'}</style>
            </p>
          ) : (
          <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            {lic.state === 'covered' && <>Included with {fullName}'s tax planning until <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.covered_until)}</strong> - no charge. {readOnly ? 'The member' : 'You'} can turn on the $25/month Standard portal after that date if {readOnly ? 'they want' : 'you want'} {fullName} to keep it.</>}
            {lic.state === 'basic' && (readOnly
              ? <>{first} is on the Basic portal (Showroom only). The member has not turned on the $25/month Standard portal.</>
              : <>{first} is on the Basic portal (Showroom only). The Standard portal adds their One Page Plan and Client Vault. It is charged to you monthly; {first} never sees the cost.</>)}
            {lic.state === 'processing' && (lic.payment_method_type === 'ach'
              ? <>{readOnly ? "The member's" : 'Your'} bank payment is processing{method}. {first} gets the Standard portal once it clears, usually 3-5 business days.</>
              : <>{readOnly ? "The member's" : 'Your'} payment is being confirmed.</>)}
            {lic.state === 'active' && <>The Standard portal is on{lic.period_end ? <>. Renews <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.period_end)}</strong></> : ''}{method}.</>}
            {lic.state === 'ending' && <>The Standard portal is on until <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.period_end)}</strong>, then {first} goes back to the Basic portal.</>}
            {lic.state === 'handover' && <>The $25/month Standard portal runs to the end of the month already paid, <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.period_end)}</strong>, then stops - no further charge. From then it is included with {fullName}'s tax planning until <strong style={{ color: 'var(--vfo-ink)' }}>{formatDate(lic.covered_until)}</strong>.</>}
            {lic.state === 'past_due' && <>The last payment failed{method}. {first} is on the Basic portal until it goes through. Stripe is retrying{readOnly ? '.' : '; update your payment method to fix it now.'}</>}
          </p>
          )}
          {syncSlow && !readOnly && (
            <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>This is taking longer than usual. Please check back in a few minutes.</p>
          )}
          {!readOnly && !syncing && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {lic.state === 'basic' && (
                <button onClick={() => licenceAction('member_ciq_licence_start')} disabled={licBusy || !hasLogin} style={{ ...btn, opacity: hasLogin ? 1 : 0.55, cursor: licBusy || !hasLogin ? 'not-allowed' : 'pointer' }}
                  title={hasLogin ? undefined : 'Send portal access first'}>
                  {licBusy ? 'Working…' : 'Turn on Standard portal'}
                </button>
              )}
              {lic.state === 'past_due' && canChangeMethod && !showPay && (
                <button onClick={() => { setShowPay(true); setPayMethod(null) }} disabled={licBusy} style={btn}>Update payment method</button>
              )}
              {(lic.state === 'active' || lic.state === 'past_due') && (
                <button onClick={() => licenceAction('member_ciq_licence_stop')} disabled={licBusy} style={ghost}>{licBusy ? 'Working…' : 'Turn off'}</button>
              )}
              {lic.state === 'ending' && (
                <button onClick={() => licenceAction('member_ciq_licence_resume')} disabled={licBusy} style={ghost}>{licBusy ? 'Working…' : 'Keep it on'}</button>
              )}
              {lic.state !== 'past_due' && canChangeMethod && !showPay && (
                <button onClick={() => { setShowPay(true); setPayMethod(null) }} disabled={licBusy} style={ghost}>Change payment method</button>
              )}
            </div>
          )}
          {lic.state === 'basic' && !hasLogin && !readOnly && <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '8px 0 0' }}>Send portal access first, so {first} can log in.</p>}
          {showPay && canChangeMethod && (
            <PaymentMethodPanel lic={lic} payMethod={payMethod} setPayMethod={setPayMethod} busy={licBusy}
              onCancel={() => { setShowPay(false); setPayMethod(null); setLicError(null) }}
              onContinue={() => licenceAction('member_portal_billing_update_card', { method: payMethod })}
              btn={btn} ghost={ghost} />
          )}
          {licError && <p style={{ fontSize: '13px', marginTop: '10px', marginBottom: 0, color: '#d93025' }}>{licError}</p>}
        </div>
      )}
    </div>
  )
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`

// The member picks the method HERE, before Stripe, so the warning can say exactly
// what changes (Jake, 2026-10-16): a payment method change moves ALL of the
// member's Standard portal subscriptions, and each is re-priced to that method.
function PaymentMethodPanel({ lic, payMethod, setPayMethod, busy, onCancel, onContinue, btn, ghost }) {
  const count = lic.subscription_count || 0
  const subs = `${count} Standard portal subscription${count === 1 ? '' : 's'}`
  const current = lic.payment_method_type
  const option = (m, title, sub) => {
    const on = payMethod === m
    return (
      <button type="button" onClick={() => setPayMethod(m)} disabled={busy}
        style={{ flex: '1 1 180px', textAlign: 'left', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          border: `2px solid ${on ? '#0095ff' : 'var(--vfo-border)'}`, background: on ? 'rgba(0,149,255,0.06)' : 'var(--vfo-card)' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{title}{current === m ? ' (current)' : ''}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{sub}</div>
      </button>
    )
  }
  let warning = null
  if (payMethod) {
    const amt = payMethod === 'card' ? lic.amount_card : lic.amount_bank
    const switching = !!current && current !== payMethod
    const label = payMethod === 'card' ? 'a card' : 'a bank account'
    const overdue = lic.past_due_count || 0
    warning = (
      <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.45)', fontSize: '13px', lineHeight: 1.6, color: 'var(--vfo-ink)' }}>
        <strong>{switching ? `Switching to ${label} changes the payment method on ALL of your Standard portal subscriptions.` : 'This changes the payment method on ALL of your Standard portal subscriptions.'}</strong>
        {' '}It affects <strong>{subs}</strong>, and all of them will be charged <strong>{money(amt)} a month</strong> from now on{switching ? ' because of the payment method change' : ''}
        {payMethod === 'card' ? ' (the $25.00 licence plus the 2.9% + $0.30 card fee).' : ' (no card fee on a bank account).'}
        {overdue > 0 && (switching
          ? <> {overdue === 1 ? 'Your overdue payment is' : `Your ${overdue} overdue payments are`} cancelled and charged again today at {money(amt)}, so {overdue === 1 ? "that client's monthly date moves" : "those clients' monthly dates move"} to today.</>
          : <> {overdue === 1 ? 'Your overdue payment is' : `Your ${overdue} overdue payments are`} retried on the new {payMethod === 'card' ? 'card' : 'bank account'} straight away.</>)}
      </div>
    )
  }
  return (
    <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', border: '1px solid var(--vfo-border-soft)' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '10px' }}>Choose your new payment method</div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {option('ach', 'Bank account', `${money(lic.amount_bank)} a month - no fee. Sign in to your bank on the next page.`)}
        {option('card', 'Credit / debit card', `${money(lic.amount_card)} a month - includes the 2.9% + $0.30 card fee.`)}
      </div>
      {warning}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button onClick={onContinue} disabled={busy || !payMethod} style={{ ...btn, opacity: payMethod ? 1 : 0.55, cursor: busy || !payMethod ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Working…' : 'Continue to the secure Stripe page'}
        </button>
        <button onClick={onCancel} disabled={busy} style={ghost}>Cancel</button>
      </div>
    </div>
  )
}
