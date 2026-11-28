// Phase notes on the MSM training track (Issue #661 part 5): the member's own
// program notes (member_program_notes) with a phase_name. The program's Notes tab
// still lists every note; a phase's Notes button shows that phase's. A member
// loading these gets only the notes an admin shared (the backend filters).
import { useEffect, useState } from 'react'
import { callApi, getSession } from '../../lib/api'

export function useProgramPhaseNotes(memberNumber, programName) {
  const [notes, setNotes] = useState([])
  useEffect(() => {
    if (!memberNumber || !programName) return
    let live = true
    callApi('load_member_program_notes', { member_number: memberNumber, program_name: programName })
      .then(d => { if (live) setNotes((d.notes || []).filter(n => n.phase_name)) })
      .catch(err => console.error(err))
    return () => { live = false }
  }, [memberNumber, programName])

  function forPhase(phaseName) {
    const list = notes.filter(n => n.phase_name === phaseName)
    return {
      count: list.length,
      notes: list,
      onNotesChange: (next) => setNotes(all => [...next, ...all.filter(n => n.phase_name !== phaseName)]),
      api: {
        add: async (text, visibility) => (await callApi('add_member_program_note', { member_number: memberNumber, program_name: programName, phase_name: phaseName, note_text: text, created_by: getSession()?.name || 'Admin', visibility })).note,
        update: async (id, text, visibility) => (await callApi('update_member_program_note', { note_id: id, note_text: text, visibility })).note,
        remove: async (id) => { await callApi('delete_member_program_note', { note_id: id }) },
      },
    }
  }
  return forPhase
}
