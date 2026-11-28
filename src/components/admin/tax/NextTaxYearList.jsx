import { useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import ExportButton from '../../shared/ExportButton'
import { MemberNameLink } from '../../shared/personLinks'
import { taxDisplayName } from '../../shared/taxDisplayNames'
import ListTable, { ListName, ListText } from '../../shared/ListTable'
import { btnPrimary, btnSecondary } from '../../shared/buttonStyles'
import { statusPillStyle } from '../../shared/statusColors'
import EmailText from '../../shared/EmailText'
import { ChangeStatusModal, NEXT_YEAR_HEX } from './TaxPlanStatus'
import { StartPlanModal } from './TaxPlanCards'
import { formatDate } from '../../../lib/dates'

// Client Overview > Tax Planning > Next tax year (admin, 2026-11-23): everyone moved
// to next tax year, how to reach them, and both ways back: Continue the same plan or
// start a new one, the likely one as the main button. `rows` = Client Overview's own
// rows (searched, filtered and sorted there); tax_next_year_list adds the rest.
const small = { ...btnSecondary, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }
const smallMain = { ...btnPrimary, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }

export default function NextTaxYearList({ rows, total, onOpenTrack, onOpenProfile, onChanged }) {
  const [extra, setExtra] = useState(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [continuing, setContinuing] = useState(null) // { client, plan }
  const [starting, setStarting] = useState(null)     // { client, plan }

  useEffect(() => {
    let on = true
    callApi('tax_next_year_list', {})
      .then(res => { if (on) { setExtra(res.plans || {}); setError('') } })
      .catch(err => { if (on) setError(err.message || 'Could not load this list') })
    return () => { on = false }
  }, [tick])

  const of = (r) => extra?.[String(r.track.id)] || {}
  const done = () => { setContinuing(null); setStarting(null); setTick(t => t + 1); onChanged() }
  const clientOf = (c) => { const [first, ...rest] = String(c.name || '').split(' '); return { id: c.id, first_name: first, last_name: rest.join(' ') } }

  const columns = [
    { header: 'Client', value: r => r.client.name },
    { header: 'Client Ref', value: r => r.client.client_ref },
    { header: 'Member', value: r => r.client.member_name },
    { header: 'PF', value: r => r.client.assigned_pf },
    { header: 'Moving to', value: r => r.track.next_tax_year },
    { header: 'Plan year', value: r => r.track.tax_year },
    { header: 'Email', value: r => of(r).email },
    { header: 'Phone', value: r => of(r).phone },
    { header: 'Phase reached', value: r => taxDisplayName(r.track.reached_phase || '') },
    { header: 'Paid', value: r => of(r).paid },
    { header: 'Moved on', value: r => formatDate(of(r).moved_at) },
    { header: 'Moved by', value: r => of(r).moved_by },
    { header: 'Message', value: r => of(r).message || (of(r).no_email_reason ? `No email sent: ${of(r).no_email_reason}` : '') },
  ]

  const listColumns = [
    { key: 'name', label: 'Name', width: '1.1fr', get: r => r.client.name, render: r => {
      const c = r.client, t = r.track
      return (
        <ListName onClick={e => { e.stopPropagation(); onOpenProfile(c, t) }} title="Open client profile" sub={(
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {c.member_name
              ? <MemberNameLink memberNumber={c.member_number} style={{ alignSelf: 'flex-start' }}>{c.member_name}</MemberNameLink>
              : <span style={{ color: 'var(--vfo-faint)' }}>No member</span>}
            {c.assigned_pf && <span style={{ color: 'var(--vfo-faint)' }}>PF: {c.assigned_pf}</span>}
          </span>
        )}>{c.name}</ListName>
      )
    } },
    { key: 'moving', label: 'Moving to', width: '80px', get: r => r.track.next_tax_year, render: r => <span style={statusPillStyle(NEXT_YEAR_HEX)}>{r.track.next_tax_year || 'Next'}</span> },
    { key: 'contact', label: 'Contact', width: '1.2fr', render: r => {
      const x = of(r)
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, fontSize: '12px' }}>
          <span style={{ overflowWrap: 'anywhere' }}>{x.email ? <EmailText email={x.email} /> : <ListText />}</span>
          {x.phone && <span style={{ color: 'var(--vfo-muted)' }}>{x.phone}</span>}
        </span>
      )
    } },
    { key: 'reached', label: 'Reached', width: '90px', get: r => r.track.reached_phase ? taxDisplayName(r.track.reached_phase) : null, render: r => <ListText style={{ fontWeight: 600 }}>{r.track.reached_phase ? taxDisplayName(r.track.reached_phase) : ''}</ListText> },
    { key: 'paid', label: 'Paid', width: '110px', get: r => of(r).paid, render: r => {
      const x = of(r)
      return <span style={{ fontSize: '12px', color: x.refunded ? '#e74c3c' : x.paid ? 'var(--vfo-success-text)' : 'var(--vfo-faint)', fontWeight: 600 }}>{x.paid || '—'}</span>
    } },
    { key: 'moved', label: 'Message', width: '1.6fr', type: 'date', get: r => of(r).moved_at || null, render: r => {
      const x = of(r)
      return (
        <span style={{ display: 'block', fontSize: '12px', minWidth: 0 }}>
          <span title={x.message || undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', color: x.message || x.no_email_reason ? undefined : 'var(--vfo-faint)' }}>
            {x.message || (x.no_email_reason ? `No email sent: ${x.no_email_reason}` : '—')}
          </span>
          {x.moved_at && <span style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '2px' }}>{formatDate(x.moved_at)}{x.moved_by ? ` by ${x.moved_by}` : ''}</span>}
        </span>
      )
    } },
    { key: 'actions', label: '', width: '220px', stop: true, align: 'right', render: r => {
      const c = r.client, t = r.track, x = of(r)
      const year = t.next_tax_year || new Date().getFullYear() + 1
      const canContinue = !x.open_plan && !x.refunded
      const cont = canContinue && <button key="c" style={x.likely === 'continue' ? smallMain : small} onClick={() => setContinuing({ client: clientOf(c), plan: x.plan })}>Continue this plan</button>
      const start = !x.open_plan && <button key="s" style={x.likely === 'continue' && canContinue ? small : smallMain} onClick={() => setStarting({ client: clientOf(c), plan: x.plan })}>Start {year} plan</button>
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          {x.open_plan
            ? <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', textAlign: 'right' }}>Has an open {x.open_plan}</span>
            : x.plan && (x.likely === 'continue' ? [cont, start] : [start, cont])}
        </span>
      )
    } },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <ExportButton title="Next tax year" columns={columns} rows={extra ? rows : []} />
      </div>
      {error && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load the details: {error}</div>}
      <ListTable
        columns={listColumns}
        rows={rows}
        rowKey={r => r.track.id}
        onRowClick={r => onOpenTrack(r.client, r.track)}
        minWidth="1080px"
        empty={total === 0 ? 'Nobody has been moved to next tax year.' : 'No clients match the current filters.'}
      />
      {continuing && <ChangeStatusModal plan={continuing.plan} client={continuing.client} initialTo="live" onClose={() => setContinuing(null)} onSaved={done} />}
      {starting && <StartPlanModal clientId={starting.client.id} programId={starting.plan.program_id} previousPlan={starting.plan} onClose={() => setStarting(null)} onStarted={done} />}
    </div>
  )
}
