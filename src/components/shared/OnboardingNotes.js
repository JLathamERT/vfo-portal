// Phase notes on the Advisor / Accountant / Specialist onboarding trackers
// (onboarding_phase_notes, admin only; Issue #661 part 5). One load per record;
// `phaseProps(phaseName)` gives a PhaseCard its Notes button count and panel data.
import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'

export function useOnboardingNotes(pipeline, onboardingId) {
  const [notes, setNotes] = useState([])
  useEffect(() => {
    if (!onboardingId) return
    let live = true
    callApi('onboarding_notes_load', { pipeline, onboarding_id: onboardingId })
      .then(d => { if (live) setNotes(d.notes || []) })
      .catch(err => console.error(err))
    return () => { live = false }
  }, [pipeline, onboardingId])

  function forPhase(phaseName) {
    const list = notes.filter(n => n.phase_name === phaseName)
    return {
      count: list.length,
      notes: list,
      onNotesChange: (next) => setNotes(all => [...next, ...all.filter(n => n.phase_name !== phaseName)]),
      api: {
        add: async (text) => (await callApi('onboarding_note_add', { pipeline, onboarding_id: onboardingId, phase_name: phaseName, note_text: text })).note,
        update: async (id, text) => (await callApi('onboarding_note_update', { note_id: id, note_text: text })).note,
        remove: async (id) => { await callApi('onboarding_note_delete', { note_id: id }) },
      },
    }
  }
  return forPhase
}
