import { useEffect, useState } from 'react'
import { callApi, loadCachedAction } from '../../lib/api'
import ClientTabDropdown from '../shared/ClientTabDropdown'
import ClientTrackViewV2 from '../admin/map1/ClientTrackViewV2'
import RegularPrioritiesTab from '../admin/regular/RegularPrioritiesTab'
import TaxPrioritiesTab from '../admin/tax/TaxPrioritiesTab'
import PipMeetingsTab from '../admin/pip/PipMeetingsTab'
import { PhaseListSkeleton } from '../shared/Skeleton'

// Portal licensing L8 (2026-10-28): the client portal's My Progress tab - the
// mirrored-member view of the member's own client screen (decisions 63-66): the
// same program strip and the same track tabs, read-only, money masked, no notes.
// Every read below goes to its client twin (src/lib/api.js routedAction), which the
// server fences to the session's client - the ids passed here are never trusted.
// Holistic shows only the sections the client has; Tax Planning shows its plans;
// Partnership Fast Track is never shown (not mirrored, decision 20).

const HOLISTIC = 'VFO Holistic Planning'
const TAX_PLANNING = 'VFO Tax Planning'
const SECTIONS = [['map1', 'MAP 1'], ['regular', 'Regular Priorities'], ['tax', 'Tax Priorities'], ['pip', 'PIP Meetings']]

const tabStyle = (active) => ({ padding: '7px 12px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })

export default function ClientProgressTab({ specialists = [] }) {
  const [state, setState] = useState(null)
  const [view, setView] = useState(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const home = await callApi('msm_load_client_home', {})
        const listed = Array.isArray(home.programs) ? home.programs : (home.program ? [home.program] : [])
        const holistic = listed.find(p => p.name === HOLISTIC)
        const [pipeline, progress, map1Track, tracks] = await Promise.all([
          callApi('member_load_pipeline', {}).catch(() => ({})),
          callApi('msm_load_client_progress', {}).catch(() => ({})),
          holistic ? loadCachedAction('msm_load_client_track', { program_id: holistic.id }).catch(() => ({})) : {},
          callApi('msm_load_priority_tracks', {}).catch(() => ({})),
        ])
        const allTracks = tracks?.tracks || []
        // MAP 1 = a pipeline row OR any MAP 1 step, except the "CIQ complete" stamp on
        // its own (ciq/complete.ts writes it for every client) - Client Overview's rule.
        const map1Tasks = (map1Track?.phases || []).flatMap(ph => ph.program_client_tasks || [])
        const map1TaskIds = new Set(map1Tasks.map(t => t.id))
        const ciqTaskId = map1Tasks.find(t => t.name === 'CIQ complete')?.id
        const map1Steps = (progress?.progress || []).filter(r => map1TaskIds.has(r.task_id) && r.task_id !== ciqTaskId)
        const has = {
          map1: !!pipeline?.row || map1Steps.length > 0,
          regular: allTracks.some(t => t.track_type !== 'pip'),
          // Always, exactly as the member's page (Jake, decision 76): an empty Tax
          // Priorities reads as the member's empty list.
          tax: true,
          pip: allTracks.some(t => t.track_type === 'pip'),
        }
        const programs = listed.flatMap(p => {
          if (p.name === HOLISTIC) {
            const sections = SECTIONS.filter(([key]) => has[key])
            return [{ ...p, sections: sections.length ? sections : [SECTIONS[0]] }]
          }
          if (p.name === TAX_PLANNING) return [{ ...p, sections: [['tax', 'Tax Planning']] }]
          return []
        })
        if (!live) return
        setState({ client: home.client, programs })
        if (programs.length) setView({ programId: programs[0].id, tab: programs[0].sections[0][0] })
      } catch (err) {
        if (live) setState({ error: err.message || 'Could not load your progress.' })
      }
    })()
    return () => { live = false }
  }, [])

  const wrap = children => <div style={{ maxWidth: '980px', margin: '0 auto', padding: '28px var(--vfo-gutter)' }}>{children}</div>
  if (!state) return wrap(<PhaseListSkeleton phases={6} rowsPerPhase={2} />)
  if (state.error) return wrap(<div style={{ textAlign: 'center', padding: '40px', color: '#d93025', fontSize: '14px' }}>{state.error}</div>)
  if (!state.programs.length || !view) {
    return wrap(<div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)', fontSize: '14px' }}>Your progress will appear here once your planning has started.</div>)
  }

  const { client, programs } = state
  const program = programs.find(p => p.id === view.programId) || programs[0]
  const common = { clientId: client.id, programId: program.id, client, readOnly: true, notes: [], onNotesChange: () => {} }
  const key = `${program.id}-${view.tab}`

  return wrap(
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px', gap: '4px', paddingBottom: '10px', flexWrap: 'wrap' }}>
        {programs.map(p => (
          p.name === HOLISTIC ? (
            <ClientTabDropdown key={p.id} label="Holistic Planning" isActive={program.id === p.id}
              options={p.sections.map(([k, label]) => ({ key: k, label }))}
              onSelect={k => setView({ programId: p.id, tab: k })} />
          ) : (
            <button key={p.id} style={tabStyle(program.id === p.id)} onClick={() => setView({ programId: p.id, tab: 'tax' })}>Tax Planning</button>
          )
        ))}
      </div>
      {view.tab === 'map1' && <ClientTrackViewV2 key={key} {...common} mirror />}
      {view.tab === 'regular' && <RegularPrioritiesTab key={key} {...common} specialists={specialists} />}
      {view.tab === 'tax' && <TaxPrioritiesTab key={key} {...common} programName={program.name} specialists={specialists} ecosystems={[]} mirror />}
      {view.tab === 'pip' && <PipMeetingsTab key={key} {...common} mirror />}
    </>
  )
}
