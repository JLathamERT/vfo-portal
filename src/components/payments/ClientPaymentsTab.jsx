import { useState, useEffect } from 'react'
import { callApi, getSession } from '../../lib/api'
import { Skeleton } from '../shared/Skeleton'
import PaymentsTable, { parseGroupKey, chargeSavedLabel, fmtMoney } from './PaymentsTable'
import PaymentsHeader from './PaymentsHeader'

// Read-only Payments tab for a client (admin view). Aggregates their MAP 1, Tax and
// PIP Meetings payments via client_payments_load. Member-paid-on-behalf rows are
// flagged inside PaymentsTable.
//
// ONE write lives here: the superadmin-only "Cancel all remaining payments" button
// PaymentsTable renders at the bottom of an expanded MAP 1 / Tax group. This is the
// ONLY tab that passes those props, so the Member / Specialist / global Payments
// tabs that share the same table stay strictly read-only. Membership and PIP are
// deliberately out of scope. Superadmin gate mirrors PaymentsHeader.jsx:14 — the
// server re-checks it (payments_cancel_remaining is in SUPERADMIN_ONLY_ACTIONS);
// this is only about what a non-superadmin is shown.
//
// A second superadmin write, the same way: "Charge saved card" on a FAILED Tax
// implementation / final retainer row the server marked chargeable (row.chargeSaved).
// It re-runs the existing charge on the card or bank the client has since saved
// (payments_charge_saved_card, also in SUPERADMIN_ONLY_ACTIONS).
export default function ClientPaymentsTab({ clientId, sectionStyle }) {
  const isSuper = getSession()?.is_superadmin
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelBusyKey, setCancelBusyKey] = useState(null)
  const [cancelMsg, setCancelMsg] = useState(null)   // { tone, text } — shared by both buttons
  const [chargeBusyKey, setChargeBusyKey] = useState(null)

  useEffect(() => { load() }, [clientId])

  async function chargeSaved(row) {
    const cs = row.chargeSaved
    if (!cs) return
    const what = `${chargeSavedLabel(cs).replace(/^Charge s/, 'S')} for ${fmtMoney(cs.amount)}`
    if (!window.confirm(`Charge the ${row.label}?\n\n${what}.\n\nThis takes the money now.`)) return
    setChargeBusyKey(row.key); setCancelMsg(null)
    try {
      const d = await callApi('payments_charge_saved_card', {
        client_id: clientId,
        row_id: cs.planId,
        slot: cs.slot,
      })
      setCancelMsg(d?.status === 'processing'
        ? { tone: 'success', text: `${row.label}: bank payment of ${fmtMoney(cs.amount)} started. It shows as Processing until it clears (a few business days).` }
        : { tone: 'success', text: `${row.label}: ${fmtMoney(cs.amount)} charged. The receipt follows automatically.` })
      await load()
    } catch (e) {
      // A fresh decline lands here too; the server has already belled and drafted
      // the usual /tax-pay email, so the reload shows the row as Failed again.
      setCancelMsg({ tone: 'warn', text: e?.message || 'Could not charge the saved card.' })
      await load()
    } finally {
      setChargeBusyKey(null)
    }
  }

  // groupKey is 'map1-<id>' / 'tax-<id>' — the row_id the server needs is in it.
  async function cancelGroup(groupKey, groupLabel) {
    const parsed = parseGroupKey(groupKey)
    if (!parsed) return
    if (!window.confirm(`Cancel all remaining payments for ${groupLabel}? This cannot be undone from the UI.`)) return
    setCancelBusyKey(groupKey); setCancelMsg(null)
    try {
      const d = await callApi('payments_cancel_remaining', {
        client_id: clientId,
        program: parsed.program,
        row_id: parsed.rowId,
      })
      const n = d?.count || 0
      setCancelMsg(n > 0
        ? { tone: 'success', text: `Cancelled ${n} remaining payment${n === 1 ? '' : 's'} for ${groupLabel}. Nothing further will be charged.` }
        // count 0 is the idempotent repeat click, or a group whose slots all moved
        // to a non-cancellable state between the page load and the click.
        : { tone: 'warn', text: `Nothing was cancelled for ${groupLabel} — no remaining payment was still open.` })
      await load()
    } catch (e) {
      setCancelMsg({ tone: 'warn', text: e?.message || 'Could not cancel the remaining payments.' })
    } finally {
      setCancelBusyKey(null)
    }
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await callApi('client_payments_load', { client_id: clientId })
      setData(d)
    } catch (e) {
      setError(e?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 16px', fontFamily: 'Inter, sans-serif' }

  if (loading) {
    return (
      <div style={sectionStyle}>
        <Skeleton width={140} height={22} />
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[0, 1, 2].map(i => <Skeleton key={i} width="100%" height={42} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={sectionStyle}>
        <h3 style={titleStyle}>Payments</h3>
        <div style={{ marginTop: '12px', padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>
          {error}
        </div>
      </div>
    )
  }

  const rows = data?.rows || []

  return (
    <div style={sectionStyle}>
      <PaymentsHeader personType="client" personRef={clientId} />
      {cancelMsg && (
        <div style={{
          marginBottom: '14px', padding: '10px 14px', borderRadius: '10px',
          fontSize: '12.5px', lineHeight: 1.45,
          background: cancelMsg.tone === 'success' ? 'rgba(34,197,94,0.10)' : '#fff7e6',
          border: cancelMsg.tone === 'success' ? '1px solid rgba(34,197,94,0.30)' : '1px solid #f3d9a6',
          color: cancelMsg.tone === 'success' ? '#0f7a3d' : '#8a5200',
        }}>
          {cancelMsg.text}
        </div>
      )}
      <PaymentsTable
        rows={rows}
        emptyText="No payments recorded for this client yet."
        cancellableGroups={isSuper ? ['map1', 'tax'] : null}
        onCancelGroup={isSuper ? cancelGroup : null}
        cancelBusyKey={cancelBusyKey}
        onChargeSaved={isSuper ? chargeSaved : null}
        chargeBusyKey={chargeBusyKey}
      />
    </div>
  )
}
