import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import OnePagePlanView from './OnePagePlanView'

// Portal licensing L4 (2026-10-16, decisions 41 + 49): the read-only ONE PAGE PLAN
// card on the member client Profile tab - for the client's OWNING member and for a
// member the client is MIRRORED to (the CIQ item Client Mirroring left owed).
// member_mirrored_ciq_plan_load (mirrorReadGate: owner / mirrored member) decides:
// nothing renders while ciq_licence is off for the client's owner, or on any error.
export default function MirroredOnePagePlanCard({ clientId, sectionStyle, cardTitle }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    let cancelled = false
    callApi('member_mirrored_ciq_plan_load', { client_id: clientId })
      .then(d => { if (!cancelled) setState(d?.enabled ? d : { enabled: false }) })
      .catch(e => { console.error(e); if (!cancelled) setState({ enabled: false }) })
    return () => { cancelled = true }
  }, [clientId])

  if (!state?.enabled) return null
  return (
    <div style={sectionStyle}>
      <div style={cardTitle}>One Page Plan</div>
      <OnePagePlanView plans={state.plans || []} title=""emptyText="No One Page Plan has been completed for this client yet." />
    </div>
  )
}
