import { useState, useLayoutEffect, useMemo } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { TableSkeleton } from '../shared/Skeleton'
import { MemberNameLink } from '../shared/personLinks'

// Accounting > Members > Money Mapping (2026-10-30). Every member who has earned
// Money Mapping on the portal (credited automatically from their Money Mapping
// revenue-share legs), plus anyone added by hand for money earned before the
// portal. Each member's statement, and an admin adjustment (add or deduct).
// The page is only about each member's balance; what it is spent on (membership
// fees today) shows in the statement.

const MM_COLOR = '#ca8a04'

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// Same soft tinted chip as the Growth Credits ledger (gcTypeChip).
const TYPE_META = {
  earned: ['Earned', '27,146,84', '#1b9254'],
  adjustment: ['Adjustment', '0,149,255', '#0095ff'],
  membership: ['Membership', '124,58,237', '#7c3aed'],
}

function TypeChip({ type, amount }) {
  const [label, rgb, hex] = type === 'adjustment' && amount < 0 ? ['Deducted', '224,103,23', '#e06717']
    : type === 'adjustment' ? ['Added', '0,149,255', '#0095ff']
      : TYPE_META[type] || [type, '100,116,139', '#64748b']
  return <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '999px', background: `rgba(${rgb},0.15)`, color: hex, fontWeight: 600, border: `1px solid rgba(${rgb},0.3)`, whiteSpace: 'nowrap' }}>{label}</span>
}

const tableWrap = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '22px' }
const headRow = { display: 'grid', gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }
const bodyRow = { display: 'grid', gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }
const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '5px' }
const primaryBtn = busy => ({ padding: '8px 16px', borderRadius: '8px', border: 'none', background: busy ? '#c7d2e4' : 'linear-gradient(90deg, #002855 0%, #0a85e8 100%)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' })
const ghostBtn = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }

const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`

export default function MoneyMappingAccountingPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMember, setOpenMember] = useState(null)
  const [adjustFor, setAdjustFor] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [notice, setNotice] = useState(null)

  // Re-open draws the last figures at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('mmaccounting:')
    if (snap) { setData(snap); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('money_mapping_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setData(res)
      setLastSeen('mmaccounting:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = { padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const members = data?.members || []
  const cols = '1.5fr 120px 120px 120px 130px'

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · Members</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Money Mapping</h2>
        </div>
        {!loading && data && (
          <button type="button" style={primaryBtn(false)} onClick={() => { setShowAdd(v => !v); setNotice(null) }}>
            {showAdd ? 'Close' : '+ Add a member'}
          </button>
        )}
      </div>

      {loading && (
        <TableSkeleton cols={[1.5, 1, 1, 1, 1.1]} rows={5} />
      )}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && data && (
        <>
          {data.sync_error && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>
              New earnings could not be checked just now ({data.sync_error}). The balances below are as last recorded.
            </div>
          )}
          {notice && (
            <div style={{ background: notice.tone === 'error' ? '#fef2f2' : 'rgba(22,163,74,0.08)', border: `1px solid ${notice.tone === 'error' ? '#fecaca' : 'rgba(22,163,74,0.35)'}`, color: notice.tone === 'error' ? '#b91c1c' : 'var(--vfo-success-text-2)', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>
              {notice.text}
            </div>
          )}

          {showAdd && (
            <AddMemberForm
              allMembers={data.all_members || []}
              listed={new Set(members.map(m => m.member_number))}
              onDone={text => { setShowAdd(false); setNotice({ tone: 'success', text }); load(true) }}
            />
          )}

          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '4px 2px 10px' }}>Member Balances</div>
          <div style={tableWrap}>
            <div style={{ ...headRow, gridTemplateColumns: cols }}>
              <span>Member</span>
              <span style={{ textAlign: 'right' }}>Earned</span>
              <span style={{ textAlign: 'right' }}>Adjusted</span>
              <span style={{ textAlign: 'right' }}>Spent</span>
              <span style={{ textAlign: 'right' }}>Balance</span>
            </div>
            {members.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No Money Mapping balances yet.</div>
            )}
            {members.map(m => {
              const isOpen = openMember === m.member_number
              return (
                <div key={m.member_number}>
                  <div onClick={() => setOpenMember(isOpen ? null : m.member_number)}
                    style={{ ...bodyRow, gridTemplateColumns: cols, cursor: 'pointer', background: isOpen ? 'var(--vfo-input)' : 'var(--vfo-card)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '10px' }}>{isOpen ? '▾' : '▸'}</span>
                      <MemberNameLink memberNumber={m.member_number} style={{ fontWeight: 600 }}>{m.name}</MemberNameLink>
                      <span style={{ fontSize: '11.5px', color: 'var(--vfo-faint)' }}>{m.member_number}</span>
                      {m.is_test && <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#e06717' }}>TEST</span>}
                    </span>
                    <span style={{ textAlign: 'right' }}>{money(m.earned)}</span>
                    <span style={{ textAlign: 'right', color: m.adjusted ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{m.adjusted ? signed(m.adjusted) : '—'}</span>
                    <span style={{ textAlign: 'right', color: m.spent ? MM_COLOR : 'var(--vfo-faint)' }}>{m.spent ? money(m.spent) : '—'}</span>
                    <span style={{ textAlign: 'right', fontWeight: 800 }}>{money(m.balance)}</span>
                  </div>
                  {isOpen && (
                    <Statement
                      member={m}
                      adjusting={adjustFor === m.member_number}
                      onAdjust={() => { setAdjustFor(adjustFor === m.member_number ? null : m.member_number); setNotice(null) }}
                      onAdjusted={text => { setAdjustFor(null); setNotice({ tone: 'success', text }); load(true) }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '-10px 2px 0' }}>
            Earned = every Money Mapping revenue share on the portal (MAP 1, Tax, PIP, Specialist Revenue), credited automatically. Spent = what has been paid from the balance.
          </div>
        </>
      )}
    </div>
  )
}

function Statement({ member, adjusting, onAdjust, onAdjusted }) {
  const cols = '110px 120px 1.6fr 110px 110px'
  return (
    <div style={{ background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', padding: '12px 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)' }}>Statement</div>
        <button type="button" style={ghostBtn} onClick={onAdjust}>{adjusting ? 'Close' : 'Adjust balance'}</button>
      </div>
      {adjusting && <AdjustForm member={member} onDone={onAdjusted} />}
      <div style={{ ...tableWrap, marginBottom: 0 }}>
        <div style={{ ...headRow, gridTemplateColumns: cols }}>
          <span>Date</span><span>Type</span><span>Description</span>
          <span style={{ textAlign: 'right' }}>Amount</span><span style={{ textAlign: 'right' }}>Balance</span>
        </div>
        {member.entries.map(e => (
          <div key={e.id} style={{ ...bodyRow, gridTemplateColumns: cols }}>
            <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(e.date)}</span>
            <span><TypeChip type={e.entry_type} amount={e.amount} /></span>
            <span style={{ color: 'var(--vfo-ink-2)' }}>
              {e.description || '—'}
              {(e.created_by && e.entry_type === 'adjustment') ? <span style={{ color: 'var(--vfo-faint)' }}> · {e.created_by}</span> : null}
              {e.entry_type === 'membership' && (
                <span style={{ display: 'block', fontSize: '11px', color: e.ert_transfer_status === 'failed' ? '#d93025' : 'var(--vfo-faint)' }}>
                  {e.ert_transfer_status === 'sent' ? 'Moved to ERT' : e.ert_transfer_status === 'failed' ? 'Move to ERT failed — retried nightly' : 'Moving to ERT tonight'}
                  {e.sandbox ? ' · Sandbox' : ''}
                </span>
              )}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: e.amount < 0 ? '#d93025' : 'var(--vfo-success-text-2)' }}>{signed(e.amount)}</span>
            <span style={{ textAlign: 'right', fontWeight: 600 }}>{money(e.balance_after)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdjustForm({ member, onDone }) {
  const [direction, setDirection] = useState('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const amt = Number(String(amount).replace(/[,$\s]/g, ''))

  async function submit() {
    setErr('')
    if (!(amt > 0)) { setErr('Enter an amount.'); return }
    if (!reason.trim()) { setErr('Enter a reason.'); return }
    if (direction === 'deduct' && amt > member.balance) { setErr(`You can deduct at most ${money(member.balance)}.`); return }
    setBusy(true)
    try {
      const res = await callApi('money_mapping_adjust', { member_number: member.member_number, mode: 'add', amount: direction === 'deduct' ? -amt : amt, reason: reason.trim() })
      if (!res?.ok) { setErr(res?.error || 'Could not save.'); return }
      onDone(`${member.name}'s balance is now ${money(res.balance)}.`)
    } catch (e) {
      setErr(e?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const after = amt > 0 ? Math.round((member.balance + (direction === 'deduct' ? -amt : amt)) * 100) / 100 : null
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: '12px' }}>
        <div>
          <div style={label}>Amount</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={direction} onChange={e => setDirection(e.target.value)} style={{ ...input, width: '96px' }}>
              <option value="add">Add</option>
              <option value="deduct">Deduct</option>
            </select>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="$0.00" inputMode="decimal" style={input} />
          </div>
        </div>
        <div>
          <div style={label}>Reason</div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. earned before the portal" style={input} />
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '8px' }}>
        Current balance {money(member.balance)}.{after != null && after >= 0 ? ` New balance ${money(after)}.` : ''}
      </div>
      {err && <div style={{ color: '#d93025', fontSize: '12.5px', marginTop: '8px' }}>{err}</div>}
      <div style={{ marginTop: '12px' }}>
        <button type="button" disabled={busy} style={primaryBtn(busy)} onClick={submit}>{busy ? 'Saving…' : 'Save adjustment'}</button>
      </div>
    </div>
  )
}

function AddMemberForm({ allMembers, listed, onDone }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Earned before the portal')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || picked) return []
    return allMembers
      .filter(m => !listed.has(m.member_number) && (m.name.toLowerCase().includes(q) || String(m.member_number).includes(q)))
      .slice(0, 8)
  }, [query, picked, allMembers, listed])
  const amt = Number(String(amount).replace(/[,$\s]/g, ''))

  async function submit() {
    setErr('')
    if (!picked) { setErr('Pick a member.'); return }
    if (!(amt > 0)) { setErr('Enter their starting balance.'); return }
    if (!reason.trim()) { setErr('Enter a reason.'); return }
    setBusy(true)
    try {
      const res = await callApi('money_mapping_adjust', { member_number: picked.member_number, mode: 'add', amount: amt, reason: reason.trim() })
      if (!res?.ok) { setErr(res?.error || 'Could not save.'); return }
      onDone(`${picked.name} added with a balance of ${money(res.balance)}.`)
    } catch (e) {
      setErr(e?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '16px 18px', marginBottom: '22px' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '4px' }}>Add a member</div>
      <div style={{ fontSize: '12.5px', color: 'var(--vfo-faint)', marginBottom: '12px' }}>For someone who earned Money Mapping before the portal and has not earned any on it yet.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr minmax(140px, 180px) 1.3fr', gap: '12px' }}>
        <div style={{ position: 'relative' }}>
          <div style={label}>Member</div>
          {picked ? (
            <div style={{ ...input, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: 1 }}>{picked.name} <span style={{ color: 'var(--vfo-faint)' }}>({picked.member_number})</span></span>
              <button type="button" onClick={() => { setPicked(null); setQuery('') }} style={{ border: 'none', background: 'none', color: 'var(--vfo-muted)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
            </div>
          ) : (
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or number" style={input} />
          )}
          {matches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '8px', boxShadow: 'var(--vfo-shadow-card)', marginTop: '4px', maxHeight: '240px', overflowY: 'auto' }}>
              {matches.map(m => (
                <div key={m.member_number} onClick={() => setPicked(m)}
                  style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                  {m.name} <span style={{ color: 'var(--vfo-faint)' }}>({m.member_number})</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={label}>Starting balance</div>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="$0.00" inputMode="decimal" style={input} />
        </div>
        <div>
          <div style={label}>Reason</div>
          <input value={reason} onChange={e => setReason(e.target.value)} style={input} />
        </div>
      </div>
      {err && <div style={{ color: '#d93025', fontSize: '12.5px', marginTop: '8px' }}>{err}</div>}
      <div style={{ marginTop: '12px' }}>
        <button type="button" disabled={busy} style={primaryBtn(busy)} onClick={submit}>{busy ? 'Saving…' : 'Add member'}</button>
      </div>
    </div>
  )
}
