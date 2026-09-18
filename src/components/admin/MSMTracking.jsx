import { useState, useEffect, useRef } from 'react'
import DirectPill from '../shared/DirectPill'
import { useNavigate } from 'react-router-dom'
import { callApi, getSession, loadCachedAction } from '../../lib/api'
import { ClientsListSkeleton, TrainingTrackSkeleton, CoachingMeetingsSkeleton, CoachingRenewalSkeleton, AdminMsmHomeSkeleton, ProgramNotesSkeleton, AdminProgramViewSkeleton, SkeletonText, PhaseListSkeleton } from '../shared/Skeleton'
import { TrackHero, PhaseBadge } from '../shared/TrackKit'
import { countedTasks, countedDone, phaseState, isPositiveStatus, planStatusLabel } from '../shared/trainingStatus'
import { isTrackerTask } from '../shared/trackerSteps'
import { VisibilityBadge, noteTint, SaveVisibilityButtons } from '../shared/NoteVisibility'
import StepDate from '../shared/StepDate'

const PROGRAMS = [
  { key: 'holistic', name: 'VFO Holistic Planning' },
  { key: 'partnership', name: 'Partnership Fast Track' },
  { key: 'tax', name: 'VFO Tax Planning' },
  { key: 'coaching', name: 'Advanced Coaching' },
  { key: 'standard', name: 'Standard Coaching' },
]

const TEAM_MEMBERS = ['Sarah Freitas', 'Rachael Hopson', 'Ian Welham', 'Paul Latham']

// Group a phase's tasks so each section header owns the contiguous sub-steps beneath it,
// letting the UI enclose the group and keep following standalone tasks visually separate.
const groupTasks = (list) => {
  const tasks = list || []
  const nodes = []
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (t.task_type === 'section') {
      const subs = []
      while (i + 1 < tasks.length && tasks[i + 1].task_type === 'substep') { subs.push(tasks[i + 1]); i++ }
      nodes.push({ kind: 'group', section: t, subs })
    } else {
      nodes.push({ kind: 'task', task: t })
    }
  }
  return nodes
}

export default function MSMTracking({ member, activeSection, onDataChange, bypassEnableGate = false, allowedProgramKeys = null }) {
  const activeTab = activeSection === 'msm_meetings' ? 'home' : 'programs'
  const activeProgramKey = activeSection === 'msm_program_holistic' ? 'holistic'
    : activeSection === 'msm_program_partnership' ? 'partnership'
    : activeSection === 'msm_program_tax' ? 'tax'
    : activeSection === 'msm_program_coaching' ? 'coaching'
    : activeSection === 'msm_program_standard' ? 'standard'
    : null
  const [programs, setPrograms] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [meetings, setMeetings] = useState([])
  const [enabledPrograms, setEnabledPrograms] = useState([])
  const [activeProgram, setActiveProgram] = useState(activeProgramKey || 'holistic')
  const [loading, setLoading] = useState(true)
  // Assigned MSM is owned here so saving it updates the program-enable gate
  // instantly WITHOUT a global reload (which would flash the skeleton). `savedMsm`
  // is the last persisted value that drives the gate; `assignedMsm` is the live
  // dropdown value. Both reset when a different member is selected.
  const [assignedMsm, setAssignedMsm] = useState(member.assigned_msm || '')
  const [savedMsm, setSavedMsm] = useState(member.assigned_msm || '')
  useEffect(() => { setAssignedMsm(member.assigned_msm || ''); setSavedMsm(member.assigned_msm || '') }, [member.plugin_member_number])

  // Meeting log state
  const [vfo90Count, setVfo90Count] = useState(0)
  // Coaching-meeting counts keyed by program name. The coaching Meetings tab writes
  // to coaching_meetings (keyed on enrollment_id), NOT member_meetings, so the Home
  // summary tiles derive these counts from coaching_load_meetings per enrollment.
  const [coachingCounts, setCoachingCounts] = useState({})
  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingConductedBy, setMeetingConductedBy] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')
  const [meetingStatus, setMeetingStatus] = useState('')

  useEffect(() => { loadData() }, [member.plugin_member_number])

  // Coaching meetings are logged in the program's Meetings tab (a sibling subtree),
  // so refresh the Home summary counts whenever the admin lands on the Home tab —
  // no full reload (no skeleton flicker), just the two coaching_load_meetings reads.
  useEffect(() => {
    if (activeTab === 'home' && enrollments.length) loadCoachingCounts(enrollments)
  }, [activeSection])

  async function loadCoachingCounts(enrollList) {
    const counts = {}
    await Promise.all(['Advanced Coaching', 'Standard Coaching'].map(async name => {
      const enr = (enrollList || []).find(e => e.programs?.name === name)
      if (!enr) { counts[name] = 0; return }
      try {
        const md = await callApi('coaching_load_meetings', { enrollment_id: enr.id })
        counts[name] = (md.meetings || []).filter(m => m.status === 'completed').length
      } catch { counts[name] = 0 }
    }))
    setCoachingCounts(counts)
  }

  // Program-enable toggling updates local state only (no global reload → no skeleton
  // flash), mirroring the Assigned-MSM save. The backend add/remove is a single
  // member_program_enabled row, so the optimistic update is authoritative.
  function handleProgramToggled(programId, enabled) {
    setEnabledPrograms(prev => enabled
      ? [...prev.filter(e => e.program_id !== programId), { program_id: programId }]
      : prev.filter(e => e.program_id !== programId))
  }

  async function loadData() {
    setLoading(true)
    try {
      const [progData, enrollData, meetData, enabledData] = await Promise.all([
        loadCachedAction('msm_load_programs'),
        callApi('msm_load_enrollments', { member_number: member.plugin_member_number }),
        callApi('msm_load_meetings', { member_number: member.plugin_member_number }),
        callApi('msm_load_enabled_programs', { member_number: member.plugin_member_number }),
      ])
      setPrograms(progData.programs || [])
      setEnrollments(enrollData.enrollments || [])
      setMeetings(meetData.meetings || [])
      setEnabledPrograms(enabledData.enabled || [])

      // Count completed coaching meetings for the two coaching programs (Advanced +
      // Standard). Their meetings live in coaching_meetings keyed on enrollment_id.
      await loadCoachingCounts(enrollData.enrollments || [])

      // Calculate VFO 90 Day Plan count from completed phases
      const holisticProg = (progData.programs || []).find(p => p.name === 'VFO Holistic Planning')
      const holisticEnroll = (enrollData.enrollments || []).find(e => e.programs?.name === 'VFO Holistic Planning')
      if (holisticProg && holisticEnroll) {
        const [trackData, progressData] = await Promise.all([
          loadCachedAction('msm_load_training_track', { program_id: holisticProg.id }),
          callApi('msm_load_training_progress', { enrollment_id: holisticEnroll.id }),
        ])
        const phases = trackData.phases || []
        const prog = {}
        ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
        const completedPhases = phases.filter(phase => {
          if (phase.name.includes('Review')) return false
          return phaseState(phase.program_training_tasks, prog) === 'done'
        }).length
        setVfo90Count(completedPhases)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function logMeeting(visibility) {
    if (!meetingDate) { setMeetingStatus('Date is required.'); return }
    try {
      await callApi('msm_log_meeting', {
        member_number: member.plugin_member_number,
        meeting_date: meetingDate,
        meeting_type: 'MSM Meeting',
        conducted_by: meetingConductedBy,
        notes: meetingNotes,
        visibility,
      })
      setMeetingDate(''); setMeetingConductedBy(''); setMeetingNotes('')
      setShowLogMeeting(false); setMeetingStatus('')
      loadData()
    } catch (err) { setMeetingStatus(err.message) }
  }

  async function deleteMeeting(id) {
    try { await callApi('msm_delete_meeting', { meeting_id: id }); loadData() }
    catch (err) { console.error(err) }
  }

  function getEnrollment(programName) {
    return enrollments.find(e => e.programs?.name === programName) || null
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const tabStyle = (active) => ({
    padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px'
  })

  if (loading) {
    if (activeTab === 'home') return <AdminMsmHomeSkeleton />
    return <AdminProgramViewSkeleton />
  }

  const msmCount = meetings.filter(m => m.meeting_type === 'MSM Meeting').length
  const advancedCount = coachingCounts['Advanced Coaching'] || 0
  const standardCount = coachingCounts['Standard Coaching'] || 0
  const pft90Count = meetings.filter(m => m.meeting_type === 'PFT 90 Day Plan Meeting').length

  return (
    <div>
      

      {/* PROGRAMS TAB */}
      {activeTab === 'programs' && (
        <div>
          {PROGRAMS.map(p => {
            if (activeProgramKey !== p.key) return null
            const dbProgram = programs.find(prog => prog.name === p.name)
            if (!dbProgram) {
              return (
                <div key={p.key} style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>
                  Program "{p.name}" not found in database.
                </div>
              )
            }
            // Strategic Members have no MSM Home to toggle programs from, so their
            // two allowed programs (Holistic + Tax) bypass the enable gate.
            const isEnabled = bypassEnableGate || enabledPrograms.some(e => e.program_id === dbProgram.id)
            if (!isEnabled) {
              return (
                <div key={p.key} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--vfo-muted)' }}>
                  <div style={{ fontSize: '18px', color: 'var(--vfo-ink)', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>{p.name}</div>
                  <div style={{ fontSize: '14px', color: 'var(--vfo-muted)' }}>This program is not enabled for this member. Enable it from MSM Home.</div>
                </div>
              )
            }
            const enrollment = getEnrollment(p.name)
            if (!enrollment) {
              return <EnrollPanel key={p.key} member={member} program={dbProgram} onEnrolled={loadData} />
            }
            return <EnrolledPanel key={p.key} member={member} enrollment={enrollment} program={dbProgram} onDataChange={loadData} />
          })}
        </div>
      )}

      {/* MSM HOME TAB */}
      {activeTab === 'home' && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Side column — assignment + program toggles */}
          <div style={{ flex: '1 1 250px', minWidth: '250px', order: 2 }}>
            <MsmAssignment member={member} value={assignedMsm} onChange={setAssignedMsm} onSaved={setSavedMsm} />
            <ProgramToggles member={member} programs={programs} enabledPrograms={enabledPrograms} onToggle={handleProgramToggled} allowedProgramKeys={allowedProgramKeys} hasMsm={!!(savedMsm && savedMsm.trim())} />
          </div>

          {/* Main column — meetings */}
          <div style={{ flex: '2 1 400px', minWidth: '300px', order: 1 }}>

          {/* Meeting counts */}
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                ['MSM Meetings', msmCount],
                // Advanced (coaching) + PFT (partnership) counters only show when
                // that program is in scope — strategic members run Holistic + Tax
                // only, so both are hidden for them.
                ...((!allowedProgramKeys || allowedProgramKeys.includes('coaching')) ? [['Advanced Meetings', advancedCount]] : []),
                ...((!allowedProgramKeys || allowedProgramKeys.includes('standard')) ? [['Standard Meetings', standardCount]] : []),
                ['VFO 90 Day Plan', vfo90Count],
                ...((!allowedProgramKeys || allowedProgramKeys.includes('partnership')) ? [['PFT 90 Day Plan', pft90Count]] : []),
              ].map(([label, count]) => (
                <div key={label} style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border)', borderRadius: '12px' }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)' }}>{count}</div>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '3px', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setShowLogMeeting(!showLogMeeting)}
              style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer', marginBottom: showLogMeeting ? '16px' : '0' }}>
              + Log MSM Meeting
            </button>

            {showLogMeeting && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--vfo-tint)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Date *</label>
                    <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Conducted By</label>
                    <select value={meetingConductedBy} onChange={e => setMeetingConductedBy(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                      <option value="">-- Select --</option>
                      {TEAM_MEMBERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Notes</label>
                  <textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <SaveVisibilityButtons onSave={logMeeting} internalLabel="Log (internal note)" sharedLabel="Log & share note with member" hint="The meeting is always visible to the member — only the note text is internal or shared." />
                  <button onClick={() => setShowLogMeeting(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                </div>
                {meetingStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{meetingStatus}</p>}
              </div>
            )}
          </div>

          {/* Meeting history */}
          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
            {meetings.length === 0
              ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No meetings logged yet.</p>
              : meetings.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '14px', color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>{m.meeting_type}{m.notes && <VisibilityBadge visibility={m.visibility} />}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                      {new Date(m.meeting_date + 'T12:00:00').toLocaleDateString()}{m.conducted_by ? ` · ${m.conducted_by}` : ''}
                    </div>
                    {m.notes && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{m.notes}</div>}
                  </div>
                  <button onClick={() => deleteMeeting(m.id)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                    Delete
                  </button>
                </div>
              ))
            }
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EnrollPanel({ member, program, onEnrolled }) {
  const [dateEnrolled, setDateEnrolled] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function enroll() {
    try {
      await callApi('msm_enroll_member', {
        member_number: member.plugin_member_number,
        program_id: program.id,
        date_enrolled: dateEnrolled || new Date().toISOString().split('T')[0],
      })
      onEnrolled()
    } catch (err) { setStatus(err.message) }
  }

  return (
    <div style={sectionStyle}>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '14px', marginBottom: '20px' }}>
        {member.name} is not enrolled in {program.name}. Enroll them to start tracking progress.
      </p>
      <div style={{ marginBottom: '12px', maxWidth: '200px' }}>
        <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Date Joined</label>
        <input type="date" value={dateEnrolled} onChange={e => setDateEnrolled(e.target.value)} style={inputStyle} />
      </div>
      <button onClick={enroll} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
        Enroll in {program.name}
      </button>
      {status && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '12px' }}>{status}</p>}
    </div>
  )
}

function ProgramNotes({ memberNumber, programName }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const session = getSession()
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  useEffect(() => { loadNotes() }, [memberNumber, programName])

  async function loadNotes() {
    setLoading(true)
    try {
      const data = await callApi('load_member_program_notes', { member_number: memberNumber, program_name: programName })
      setNotes(data.notes || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function addNote(visibility) {
    if (!newText.trim()) return
    setSaving(true)
    try {
      const result = await callApi('add_member_program_note', { member_number: memberNumber, program_name: programName, note_text: newText.trim(), created_by: session?.name || 'Admin', visibility })
      setNotes([result.note, ...notes])
      setNewText('')
      setShowAdd(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function updateNote(noteId, visibility) {
    if (!editText.trim()) return
    try {
      const result = await callApi('update_member_program_note', { note_id: noteId, note_text: editText.trim(), visibility })
      setNotes(notes.map(n => n.id === noteId ? result.note : n))
      setEditingId(null)
    } catch (err) { console.error(err) }
  }

  async function deleteNote(noteId) {
    try {
      await callApi('delete_member_program_note', { note_id: noteId })
      setNotes(notes.filter(n => n.id !== noteId))
    } catch (err) { console.error(err) }
  }

  if (loading) return <ProgramNotesSkeleton />


  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Notes ({notes.length})</div>
        {!showAdd && <button onClick={() => setShowAdd(true)} style={{ padding: '4px 12px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ Add Note</button>}
      </div>
      {showAdd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Add a note..." rows={2} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            <SaveVisibilityButtons onSave={addNote} saving={saving} disabled={!newText.trim()} size="sm" />
            <button onClick={() => { setShowAdd(false); setNewText('') }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      {notes.length === 0 && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', padding: '8px 0' }}>No notes yet.</div>}
      {notes.map(note => (
        <div key={note.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
          {editingId === note.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <SaveVisibilityButtons onSave={(v) => updateNote(note.id, v)} disabled={!editText.trim()} size="sm" hint={false} />
                <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by}</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_at?.split('T')[0]}</span>
                <VisibilityBadge visibility={note.visibility} />
                <button onClick={() => { setEditingId(note.id); setEditText(note.note_text) }} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => deleteNote(note.id)} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function EnrolledPanel({ member, enrollment, program, onDataChange }) {
  const isCoaching = program.name === 'Advanced Coaching'
  const isStandard = program.name === 'Standard Coaching'
  // Standard Coaching is Advanced Coaching without the Renewal tab; every place
  // Advanced hides the training/status chrome, Standard hides it too.
  const isCoachingLike = isCoaching || isStandard
  const isTaxPlanning = program.name === 'VFO Tax Planning'
  const [activeTab, setActiveTab] = useState(() => {
    // Deep link from a notification (?sub=training) — consume once, then fall back to
    // the pft-return tab and finally Home.
    const deep = sessionStorage.getItem('msmInitialSubTab')
    if (deep) { sessionStorage.removeItem('msmInitialSubTab'); return deep }
    const ret = sessionStorage.getItem('pftReturnEnrolledTab')
    if (ret) { sessionStorage.removeItem('pftReturnEnrolledTab'); return ret }
    return 'home'
  })
  const didMountRef = useRef(false)
  const [livePlanStatus, setLivePlanStatus] = useState(null)
  useEffect(() => { if (didMountRef.current) { setActiveTab('home'); setLivePlanStatus(null) } else didMountRef.current = true }, [program.id])
  const [editingEnrollment, setEditingEnrollment] = useState(false)
  const [programStatus, setProgramStatus] = useState(enrollment.program_status || 'On Fast Track')
  const [saveStatus, setSaveStatus] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const tabStyle = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: '4px' })

  async function saveEnrollment() {
    try {
      await callApi('msm_update_enrollment', { enrollment_id: enrollment.id, program_status: programStatus })
      setSaveStatus('Saved!'); setTimeout(() => setSaveStatus(''), 3000)
      onDataChange()
    } catch (err) { setSaveStatus(err.message) }
  }

  const statusColors = { 'On Fast Track': '#1b9254', 'Paused Fast Track': '#e06717', 'Lost/Removed': '#e74c3c', 'Revert to Legacy': 'var(--vfo-muted)', 'Active': '#1b9254', 'Paused': '#e06717', 'Not Renewing': '#e74c3c' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>Program</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: '22px', color: 'var(--vfo-heading)' }}>{program.name}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Joined {enrollment.date_enrolled ? enrollment.date_enrolled.split('T')[0] : '—'}</span>
            {!isCoachingLike && enrollment.program_status && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[enrollment.program_status] || 'var(--vfo-faint)', flexShrink: 0 }} />{enrollment.program_status}</span></>}
            {!isCoachingLike && !isTaxPlanning && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><PlanStatusBadge enrollmentId={enrollment.id} programId={program.id} liveStatus={livePlanStatus} /></>}
          </div>
        </div>
        {!isCoachingLike && (
          <button onClick={() => setEditingEnrollment(!editingEnrollment)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>
            {editingEnrollment ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      <div style={{ display: editingEnrollment ? 'block' : 'none' }}>
        {editingEnrollment && (
          <div style={{ ...sectionStyle, padding: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Program Status</label>
                <select value={programStatus} onChange={e => setProgramStatus(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                  {(isCoaching ? ['Active', 'Paused', 'Not Renewing', 'Lost/Removed'] : ['On Fast Track', 'Paused Fast Track', 'Revert to Legacy', 'Lost/Removed']).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button onClick={saveEnrollment} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
            {saveStatus && <span style={{ color: saveStatus === 'Saved!' ? '#1b9254' : '#d93025', fontSize: '13px', marginLeft: '12px' }}>{saveStatus}</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', marginBottom: '24px' }}>
        <button style={tabStyle(activeTab === 'home')} onClick={() => setActiveTab('home')}>Home</button>
        {isStandard ? (
          <button style={tabStyle(activeTab === 'meetings')} onClick={() => setActiveTab('meetings')}>Meetings</button>
        ) : isCoaching ? (
          <>
            <button style={tabStyle(activeTab === 'meetings')} onClick={() => setActiveTab('meetings')}>Meetings</button>
            <button style={tabStyle(activeTab === 'renewal')} onClick={() => setActiveTab('renewal')}>Renewal</button>
          </>
        ) : program.name === 'VFO Tax Planning' ? (
          <>
            <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>Clients</button>
          </>
        ) : (
          <>
            <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>90 Day Plan</button>
            <button style={tabStyle(activeTab === 'clients')} onClick={() => setActiveTab('clients')}>{program.name === 'Partnership Fast Track' ? 'Accountants' : 'Clients'}</button>
          </>
        )}
      </div>

      {activeTab === 'home' && <ProgramNotes memberNumber={member.plugin_member_number} programName={program.name} />}

      {activeTab === 'training' && <TrainingTrack enrollment={enrollment} program={program} onPlanStatusChange={setLivePlanStatus} />}
      {activeTab === 'clients' && <ClientsPanel enrollment={enrollment} member={member} program={program} />}
      {activeTab === 'meetings' && <CoachingMeetings enrollment={enrollment} member={member} eyebrow={program.name} />}
      {activeTab === 'renewal' && <CoachingRenewal enrollment={enrollment} member={member} />}
    </div>
  )
}

// Admin training-track row for tasks that carry a video. Mirrors the member VideoTask:
// a folding "Watch Video" button (to the left of the status dropdown) that reveals the
// same Wistia/Loom iframe or YouTube player below the row.
function AdminVideoRow({ task, inGroup, isTouched, isPositive, statusColor, statusSelect, dateSpan }) {
  const [showVideo, setShowVideo] = useState(false)
  const playerRef = useRef(null)
  const containerId = `yt-player-admin-${task.id}`

  const url = task.video_url || ''
  // Wistia and Loom are plain iframe embeds; anything else is treated as a YouTube watch URL.
  const isEmbed = url.includes('wistia') || url.includes('loom')
  const videoId = isEmbed ? null : url.match(/v=([^&]+)/)?.[1]

  useEffect(() => {
    if (!showVideo || isEmbed || !videoId) return
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = () => initPlayer()
    } else {
      initPlayer()
    }
    return () => { if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null } }
  }, [showVideo])

  function initPlayer() {
    if (playerRef.current) return
    playerRef.current = new window.YT.Player(containerId, {
      videoId,
      width: '100%',
      height: '360',
      playerVars: { rel: 0, modestbranding: 1 },
      events: { onStateChange: () => {} },
    })
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isTouched ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isTouched ? statusColor : 'var(--vfo-border-mid)'}` }} />
        <div style={{ flex: 1, minWidth: '150px' }}>
          <span style={{ fontSize: '14px', color: isPositive ? 'var(--vfo-muted)' : 'var(--vfo-ink)' }}>{task.name}</span>
        </div>
        <button onClick={() => setShowVideo(!showVideo)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid rgba(0,149,255,0.4)`, background: showVideo ? 'rgba(231,76,60,0.15)' : 'rgba(0,149,255,0.15)', color: showVideo ? '#e74c3c' : '#0095ff' }}>
          {showVideo ? 'Hide Video' : '▶ Watch Video'}
        </button>
        {statusSelect}
        {dateSpan}
      </div>
      {showVideo && (
        <div style={{ borderRadius: '8px', overflow: 'hidden', marginLeft: '20px', marginTop: '12px' }}>
          {isEmbed ? (
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
              <iframe src={url} title={task.name} allow="autoplay; fullscreen" allowFullScreen frameBorder="0" scrolling="no" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          ) : (
            <div id={containerId} />
          )}
        </div>
      )}
    </div>
  )
}

function TrainingTrack({ enrollment, program, onPlanStatusChange }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})
  const [phaseCompletedBy, setPhaseCompletedBy] = useState({})

  useEffect(() => { loadTrack() }, [enrollment.id])

  // Feed the header's "90 Day Plan:" badge live as statuses change — computed from the same
  // phases+progress the track renders, so the heading tracks each click without a reload.
  useEffect(() => {
    if (loading || !onPlanStatusChange || !phases.length) return
    onPlanStatusChange(planStatusLabel(phases, progress))
  }, [phases, progress, loading])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        loadCachedAction('msm_load_training_track', { program_id: program.id }),
        callApi('msm_load_training_progress', { enrollment_id: enrollment.id }),
      ])
      const loadedPhases = trackData.phases || []
      setPhases(loadedPhases)
      const prog = {}
      const byPhase = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      loadedPhases.forEach(phase => {
        const firstWithBy = (phase.program_training_tasks || []).find(t => prog[t.id]?.completed_by)
        if (firstWithBy) byPhase[phase.id] = prog[firstWithBy.id].completed_by
        else byPhase[phase.id] = ''
      })
      setProgress(prog)
      setPhaseCompletedBy(byPhase)

      const expandState = {}
      loadedPhases.forEach(phase => {
        expandState[phase.id] = phaseState(phase.program_training_tasks, prog) !== 'done'
      })
      setExpanded(expandState)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function saveTask(taskId, status, completedDate, phaseId) {
    const completedBy = phaseCompletedBy[phaseId] || null
    const today = new Date().toISOString().split('T')[0]
    const date = completedDate || (status ? today : null)
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_training_task', { enrollment_id: enrollment.id, task_id: taskId, status, completed_date: date || null, completed_by: completedBy, notes: null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: date, completed_by: completedBy } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  function getPhaseState(phase) {
    return phaseState(phase.program_training_tasks, progress)
  }

  // Tracker steps have no status dropdown — the backend re-derives the step status
  // from the entry count on add/delete, so we patch progress here to keep the phase
  // and header (planStatusLabel) coloring live without a reload.
  function patchTrackerStatus(taskId, status) {
    setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status } }))
  }

  function formatDate(d) {
    if (!d) return ''
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  
  const statusColors = { Completed: '#1b9254', 'Training Completed': '#1b9254', '90 Day Plan Completed': '#1b9254', 'Have Watched': '#1b9254', 'Will Watch': '#1b9254', 'In Progress': '#e06717', Outstanding: '#e06717', 'N/A': 'var(--vfo-muted)', Pending: '#e74c3c', Stopped: '#e74c3c' }
  const inputStyle = { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }

  if (loading) return <TrainingTrackSkeleton />

  if (phases.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No training track defined for this program yet.</div>

  const totalTasks = phases.reduce((s, p) => s + countedTasks(p.program_training_tasks, progress).length, 0)
  const completedTasks = phases.reduce((s, p) => s + countedDone(p.program_training_tasks, progress), 0)

  return (
    <div>
      <TrackHero
        accent={false}
        completed={completedTasks}
        total={totalTasks}
        steps={phases.map(ph => ({ label: ph.name, state: getPhaseState(ph) }))}
      />

      {phases.map((phase, phaseIdx) => {
        const state = getPhaseState(phase)
        const isExpanded = expanded[phase.id]
        const tasks = phase.program_training_tasks || []
        const countable = countedTasks(tasks, progress)
        const doneTasks = countedDone(tasks, progress)
        const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
        const dotColor = state === 'done' ? '#1b9254' : state === 'active' ? '#0095ff' : 'transparent'
        const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
        const isReview = phase.name.includes('Review')

        const phaseNumber = phases.slice(0, phaseIdx).filter(p => !p.name.includes('Review')).length + 1
        return (
          <div key={phase.id} style={{ background: isReview ? 'var(--vfo-tint)' : 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: isReview ? '10px' : '10px', marginTop: isReview ? '-6px' : '0', marginLeft: isReview ? '20px' : '0', overflow: 'hidden', borderTopLeftRadius: isReview ? '0' : '12px', borderTopRightRadius: isReview ? '12px' : '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
              <div onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ display: 'flex', alignItems: 'center', gap: isReview ? '10px' : '12px', cursor: 'pointer', flex: 1 }}>
                {isReview
                  ? <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: `1.5px solid ${state === 'pending' ? 'var(--vfo-border-mid)' : dotColor}`, flexShrink: 0 }} />
                  : <PhaseBadge number={phaseNumber} state={state} />}
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}{isReview && <span style={{ fontSize: '10px', color: 'var(--vfo-muted)', marginLeft: '8px', textTransform: 'none', fontWeight: '400', letterSpacing: '0' }}>checkpoint</span>}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {state === 'done' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>}
                {state === 'active' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress · {doneTasks}/{countable.length}</span>}
                {state === 'pending' && !isReview && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>Not started</span>}
                <span onClick={() => setExpanded(p => ({ ...p, [phase.id]: !p[phase.id] }))} style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s', cursor: 'pointer' }}>▼</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${borderColor}`, padding: '12px 18px' }}>
                {(() => {
                  const renderRow = (task, inGroup) => {
                    const p = progress[task.id] || {}
                    const trackerMeta = isTrackerTask(task)
                    if (trackerMeta) {
                      return <AdminTrackerRow key={task.id} task={task} meta={trackerMeta} inGroup={inGroup} enrollmentId={enrollment.id} progress={p} onStatusChange={patchTrackerStatus} />
                    }
                    // isTouched drives the status-coloured dot/select (orange Outstanding, red
                    // Stopped); only a positive selection greys the task name out as done.
                    const isTouched = !!p.status
                    const isPositive = isPositiveStatus(p.status)
                    const statusColor = statusColors[p.status] || 'var(--vfo-muted)'
                    const statusSelect = (
                      <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, phase.id)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '130px', borderColor: isTouched ? `${statusColor}66` : 'var(--vfo-border-strong)', color: isTouched ? statusColor : 'var(--vfo-ink)' }}>
                        <option value="">-- Status --</option>
                        {(task.status_options || 'Completed|Outstanding|Stopped').split('|').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )
                    const dateSpan = (
                      <StepDate value={p.completed_date || ''} onChange={d => saveTask(task.id, p.status, d, phase.id)} disabled={saving[task.id]} />
                    )
                    if (task.video_url) {
                      return <AdminVideoRow key={task.id} task={task} inGroup={inGroup} isTouched={isTouched} isPositive={isPositive} statusColor={statusColor} statusSelect={statusSelect} dateSpan={dateSpan} />
                    }
                    return (
                      <div key={task.id} style={{ padding: '8px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isTouched ? statusColor : 'transparent', flexShrink: 0, border: `1.5px solid ${isTouched ? statusColor : 'var(--vfo-border-mid)'}` }} />
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <span style={{ fontSize: '14px', color: isPositive ? 'var(--vfo-muted)' : 'var(--vfo-ink)' }}>{task.name}</span>
                        </div>
                        {statusSelect}
                        {dateSpan}
                      </div>
                    )
                  }
                  return groupTasks(tasks).map(node => node.kind === 'group' ? (
                    <div key={`sec-${node.section.id}`} style={{ margin: '12px 0', padding: '4px 14px 6px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px' }}>
                      <div style={{ padding: '8px 0 4px' }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{node.section.name}</span>
                      </div>
                      {node.subs.map(t => renderRow(t, true))}
                    </div>
                  ) : renderRow(node.task, false))
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Admin view of a member-driven "90 Day Plan" tracker step. Replaces the status
// dropdown + StepDate with a SIF-style chip: a status pill and an expandable panel
// listing the member's submitted entries read-only, each with an admin-only Remove.
function AdminTrackerRow({ task, meta, inGroup, enrollmentId, progress, onStatusChange }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const fallbackCount = isPositiveStatus(progress?.status) ? meta.threshold : (progress?.status ? 1 : 0)
  const count = entries != null ? entries.length : fallbackCount
  const dotColor = count >= meta.threshold ? '#1b9254' : count >= 1 ? '#e06717' : 'transparent'
  const pillStyle = count >= meta.threshold
    ? { background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }
    : count >= 1
      ? { background: 'rgba(224,103,23,0.15)', color: '#e06717', fontWeight: 600, border: '1px solid rgba(224,103,23,0.3)' }
      : { background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }

  async function ensureLoaded() {
    if (loaded || loading) return
    setLoading(true)
    try {
      const data = await callApi('training_tracker_load', { enrollment_id: enrollmentId, task_id: task.id })
      setEntries(data.entries || [])
      setLoaded(true)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) ensureLoaded()
  }

  async function removeEntry(entryId) {
    if (!window.confirm('Remove this entry? This cannot be undone.')) return
    try {
      const data = await callApi('training_tracker_delete', { entry_id: entryId })
      setEntries(prev => (prev || []).filter(e => e.id !== entryId))
      if (onStatusChange) onStatusChange(task.id, data.status || '')
    } catch (err) { console.error(err) }
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: inGroup ? 'none' : '1px solid var(--vfo-tint)' }}>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0, border: `1.5px solid ${count >= 1 ? dotColor : 'var(--vfo-border-mid)'}` }} />
        <div style={{ flex: 1, minWidth: '150px' }}>
          <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{task.name}</span>
        </div>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', ...pillStyle }}>{count}/{meta.threshold}</span>
        <span style={{ color: 'var(--vfo-muted)', fontSize: '9px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {open && (
        <div style={{ marginLeft: '18px', marginTop: '12px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px', padding: '16px' }}>
          {loading && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>Loading...</div>}
          {(entries || []).map(en => (
            <AdminTrackerEntryCard key={en.id} entry={en} onRemove={() => removeEntry(en.id)} />
          ))}
          {loaded && (entries || []).length === 0 && <div style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>No {meta.nounPlural.toLowerCase()} added by the member yet.</div>}
        </div>
      )}
    </div>
  )
}

// Read-only rendering of one tracker entry in the SIF label/value style, with an
// admin-only Remove control.
function AdminTrackerEntryCard({ entry, onRemove }) {
  const dash = (v) => (v && String(v).trim() ? v : '—')
  const field = (label, value) => (
    <div style={{ marginBottom: '10px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0095ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{dash(value)}</div>
    </div>
  )
  const warm = entry.warm_cold
  return (
    <div style={{ padding: '10px 12px', marginBottom: '8px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{entry.first_name} {entry.last_name}</span>
          {entry.firm_name && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{entry.firm_name}</span>}
          {warm && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, background: warm === 'Warm' ? 'rgba(224,103,23,0.15)' : 'rgba(0,149,255,0.15)', color: warm === 'Warm' ? '#e06717' : '#0095ff' }}>{warm}</span>}
        </div>
        <button onClick={onRemove} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Remove</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 20px' }}>
        {field('Email', entry.email)}
        {field('Phone', entry.phone)}
        {field('Source', entry.source)}
      </div>
      {field('Notes', entry.notes)}
      {entry.created_at && <div style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Added {entry.created_at.split('T')[0]}</div>}
    </div>
  )
}

function ClientsPanel({ enrollment, member, program }) {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addStatus, setAddStatus] = useState('')
  const [showAdditional, setShowAdditional] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [existingSearch, setExistingSearch] = useState('')
  const [allMemberClients, setAllMemberClients] = useState([])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [contactsMap, setContactsMap] = useState({})

  const isPFT = program?.name?.includes('Partnership')

  useEffect(() => { loadClients() }, [enrollment.id])

  async function loadClients() {
    setLoading(true)
    try {
      const [data, contactData] = await Promise.all([
        callApi('msm_load_clients', { enrollment_id: enrollment.id }),
        callApi('load_member_contacts', { member_number: member.plugin_member_number }),
      ])
      setClients(data.clients || [])
      setContactsMap(contactData.contacts || {})
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function loadExistingClients() {
    setLoadingExisting(true)
    try {
      const data = await callApi('msm_load_member_clients', { member_number: member.plugin_member_number })
      const currentIds = clients.map(c => c.id)
      setAllMemberClients((data.clients || []).filter(c => !currentIds.includes(c.id) && !c.client_ref.includes('-PFT')))
    } catch (err) { console.error(err) }
    finally { setLoadingExisting(false) }
  }

  async function addClient() {
    if (!firstName || !lastName || !email) { setAddStatus('First name, last name, and email are required.'); return }
    try {
      const additional_contact = showAdditional && addFirstName && addLastName ? { first_name: addFirstName, last_name: addLastName, email: addEmail } : undefined
      await callApi('msm_add_client', { enrollment_id: enrollment.id, member_number: member.plugin_member_number, first_name: firstName, last_name: lastName, email, phone, additional_contact })
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setShowAdd(false); setAddMode(null); setAddStatus(''); setShowAdditional(false); setAddFirstName(''); setAddLastName(''); setAddEmail('')
      loadClients()
    } catch (err) { setAddStatus(err.message) }
  }

  async function linkExistingClient(clientId) {
    try {
      await callApi('msm_link_existing_client', { client_id: clientId, enrollment_id: enrollment.id })
      setShowAdd(false); setAddMode(null); setAddStatus('')
      loadClients()
    } catch (err) { setAddStatus(err.message) }
  }

  function handleShowAdd() {
    if (isPFT) {
      setShowAdd(true)
      setAddMode('new')
    } else {
      setShowAdd(!showAdd)
      setAddMode(null)
      setAddStatus('')
    }
  }

  function selectAddMode(mode) {
    setAddMode(mode)
    setAddStatus('')
    if (mode === 'existing') loadExistingClients()
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '16px' }
  const statusColors = { pending: '#e06717', active: '#1b9254', declined: '#e74c3c' }

  if (loading) return <ClientsListSkeleton />


  const filteredExisting = existingSearch
    ? allMemberClients.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(existingSearch.toLowerCase()) || c.client_ref.toLowerCase().includes(existingSearch.toLowerCase()))
    : allMemberClients

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', paddingLeft: '24px' }}>
          <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{clients.length}</div><div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '4px' }}>TOTAL</div></div>
          <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--vfo-heading)', lineHeight: 1 }}>{clients.filter(c => c.status === 'active').length}</div><div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.8px', color: 'var(--vfo-muted)', marginTop: '4px' }}>ACTIVE</div></div>
        </div>
        <button onClick={handleShowAdd} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>+ Add {isPFT ? 'Accountant' : 'Client'}</button>
      </div>

      {showAdd && !isPFT && !addMode && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Client</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => selectAddMode('existing')} style={{ flex: 1, padding: '20px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.08)', color: '#0095ff', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Add Existing Client</button>
            <button onClick={() => selectAddMode('new')} style={{ flex: 1, padding: '20px', borderRadius: '8px', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.08)', color: '#1b9254', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Add New Client</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => { setShowAdd(false); setAddMode(null) }} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {showAdd && addMode === 'existing' && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Existing Client</div>
          {loadingExisting
            ? <SkeletonText lines={3} />
            : allMemberClients.length === 0
              ? <div style={{ padding: '20px', color: 'var(--vfo-muted)', textAlign: 'center' }}>No other clients found for this member.</div>
              : <>
                  <input type="search" name="search" autoComplete="off" value={existingSearch} onChange={e => setExistingSearch(e.target.value)} placeholder="Search by name or ref..." style={{ ...inputStyle, marginBottom: '12px' }} />
                  {filteredExisting.map(c => (
                    <div key={c.id} onClick={() => linkExistingClient(c.id)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: '4px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: '8px', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-tint)'}>
                      <div>
                        <div style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{c.client_ref}{c.email ? ` · ${c.email}` : ''}</div>
                      </div>
                      <span style={{ color: '#0095ff', fontWeight: 600, fontSize: '12px' }}>Select →</span>
                    </div>
                  ))}
                </>
          }
          {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => setAddMode(null)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Back</button>
          </div>
        </div>
      )}

      {showAdd && addMode === 'new' && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add New {isPFT ? 'Accountant' : 'Client'}</div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>First Name *</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Last Name *</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '180px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Email *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '140px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
          </div>
          {!showAdditional && (
            <button onClick={() => setShowAdditional(true)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px dashed rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.06)', color: '#0095ff', fontWeight: 600, fontSize: '12px', cursor: 'pointer', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>+ Add additional contact (e.g. spouse)</button>
          )}
          {showAdditional && (
            <div style={{ padding: '16px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)', borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, fontStyle: 'italic' }}>Additional contact (not the primary client)</div>
                <button onClick={() => { setShowAdditional(false); setAddFirstName(''); setAddLastName(''); setAddEmail('') }} style={{ background: 'none', border: 'none', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Remove</button>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '120px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>First Name</label><input value={addFirstName} onChange={e => setAddFirstName(e.target.value)} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '120px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Last Name</label><input value={addLastName} onChange={e => setAddLastName(e.target.value)} style={inputStyle} /></div>
                <div style={{ flex: 1, minWidth: '160px' }}><label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Email</label><input value={addEmail} onChange={e => setAddEmail(e.target.value)} type="email" style={inputStyle} /></div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addClient} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Save</button>
            <button onClick={() => { isPFT ? setShowAdd(false) : setAddMode(null) }} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>{isPFT ? 'Cancel' : 'Back'}</button>
          </div>
          {addStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{addStatus}</p>}
        </div>
      )}

      {clients.length === 0 && !showAdd
        ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-muted)' }}>No {isPFT ? 'accountants' : 'clients'} added yet.</div>
        : clients.map(client => (
          <div key={client.id} style={{ ...sectionStyle, cursor: 'pointer' }}
            onClick={() => navigate(`/admin/client/${client.id}`, { state: { enrollment_id: enrollment.id, from: '/admin', backTo: program.name === 'Partnership Fast Track' ? 'pft_accountants' : undefined, memberNumber: member.plugin_member_number } })}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--vfo-card)'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--vfo-ink)' }}>{client.first_name} {client.last_name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{client.client_ref}</span>
                  {client.status && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[client.status] || 'var(--vfo-faint)', flexShrink: 0 }} />{client.status.charAt(0).toUpperCase() + client.status.slice(1)}</span>}
                  {client.pf_member_number && <DirectPill />}
                </div>
                {(client.email || client.phone) && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>{client.email}{client.email && client.phone ? ' · ' : ''}{client.phone}</div>}
                {contactsMap[client.id]?.length > 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px', fontStyle: 'italic' }}>with {contactsMap[client.id].map(c => `${c.first_name} ${c.last_name}`).join(', ')}</div>}
              </div>
              <span style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px' }}>View →</span>
            </div>
          </div>
        ))
      }
    </div>
  )
}

function ClientTrack({ client, program }) {
  const [phases, setPhases] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  useEffect(() => { loadTrack() }, [client.id])

  async function loadTrack() {
    setLoading(true)
    try {
      const [trackData, progressData] = await Promise.all([
        loadCachedAction('msm_load_client_track', { program_id: program.id }),
        callApi('msm_load_client_progress', { client_id: client.id }),
      ])
      setPhases(trackData.phases || [])
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setProgress(prog)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function saveTask(taskId, status, completedDate, completedBy, notes) {
    setSaving(p => ({ ...p, [taskId]: true }))
    try {
      await callApi('msm_save_client_task', { client_id: client.id, task_id: taskId, status, completed_date: completedDate || null, completed_by: completedBy || null, notes: notes || null })
      setProgress(p => ({ ...p, [taskId]: { ...p[taskId], task_id: taskId, status, completed_date: completedDate, completed_by: completedBy, notes } }))
    } catch (err) { console.error(err) }
    finally { setSaving(p => ({ ...p, [taskId]: false })) }
  }

  const inputStyle = { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }
  const STATUS_OPTIONS = ['', 'Completed', 'In Progress', 'Confirmed', 'Yes', 'No', 'N/A', 'Pending', 'Scheduled']
  const statusColors = { Completed: '#1b9254', Confirmed: '#1b9254', Yes: '#1b9254', 'In Progress': '#e06717', Scheduled: '#0095ff', No: '#e74c3c', 'N/A': 'var(--vfo-muted)', Pending: '#e06717' }

  if (loading) return <PhaseListSkeleton phases={3} rowsPerPhase={3} />
  if (phases.length === 0) return <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', padding: '16px' }}>No client track defined for this program yet.</div>

  return (
    <div>
      {phases.map(phase => (
        <div key={phase.id} style={{ marginBottom: '20px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>{phase.name}</div>
          {(phase.program_client_tasks || []).map(task => {
            const p = progress[task.id] || {}
            return (
              <div key={task.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--vfo-border-soft)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[p.status] || 'transparent', flexShrink: 0, border: '1px solid var(--vfo-border-mid)' }} />
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginRight: '6px' }}>{task.task_code}</span>
                  <span style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>{task.name}</span>
                </div>
                <select value={p.status || ''} onChange={e => saveTask(task.id, e.target.value, p.completed_date, p.completed_by, p.notes)} disabled={saving[task.id]} style={{ ...inputStyle, background: 'var(--vfo-card)', minWidth: '130px' }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || '-- Status --'}</option>)}
                </select>
                <input type="date" value={p.completed_date || ''} onChange={e => saveTask(task.id, p.status, e.target.value, p.completed_by, p.notes)} style={{ ...inputStyle, width: '140px' }} />
                <input value={p.notes || ''} onChange={e => saveTask(task.id, p.status, p.completed_date, p.completed_by, e.target.value)} placeholder="Notes" style={{ ...inputStyle, flex: 1, minWidth: '100px' }} onBlur={e => saveTask(task.id, p.status, p.completed_date, p.completed_by, e.target.value)} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MsmAssignment({ member, value, onChange, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function save() {
    setSaving(true)
    try {
      await callApi('msm_update_assigned_msm', { member_number: member.plugin_member_number, assigned_msm: value })
      setStatus('Saved!')
      setTimeout(() => setStatus(''), 3000)
      onSaved(value)
    } catch (err) { setStatus(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Assigned MSM</div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)', flex: 1, minWidth: '150px' }}>
          <option value="">-- Select MSM --</option>
          {TEAM_MEMBERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {status && <span style={{ color: '#1b9254', fontWeight: 500, fontSize: '13px' }}>{status}</span>}
      </div>
    </div>
  )
}

// `liveStatus` (when non-null) is the value computed by the mounted TrainingTrack as the
// admin clicks — it makes the header update without a reload. Until the training tab has
// been opened this session it's null, so the badge self-fetches its initial value.
function PlanStatusBadge({ enrollmentId, programId, liveStatus }) {
  const [fetchedStatus, setFetchedStatus] = useState('...')

  useEffect(() => { loadStatus() }, [enrollmentId])

  async function loadStatus() {
    try {
      const [trackData, progressData] = await Promise.all([
        loadCachedAction('msm_load_training_track', { program_id: programId }),
        callApi('msm_load_training_progress', { enrollment_id: enrollmentId }),
      ])
      const prog = {}
      ;(progressData.progress || []).forEach(p => { prog[p.task_id] = p })
      setFetchedStatus(planStatusLabel(trackData.phases || [], prog))
    } catch (err) { setFetchedStatus('—') }
  }

  const planStatus = liveStatus ?? fetchedStatus

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span>90 Day Plan:</span>
      <span style={{ fontWeight: 600, color: planStatus === 'Stopped' ? '#e74c3c' : 'var(--vfo-ink)' }}>{planStatus}</span>
    </span>
  )
}

function ProgramToggles({ member, programs, enabledPrograms, onToggle, allowedProgramKeys = null, hasMsm = false }) {
  const visiblePrograms = allowedProgramKeys ? PROGRAMS.filter(p => allowedProgramKeys.includes(p.key)) : PROGRAMS
  const [toggling, setToggling] = useState({})
  // A program can only be ENABLED once an MSM has been assigned to this member
  // (the Assigned MSM save above). Disabling is always allowed. `hasMsm` reflects
  // the last SAVED assignment, so enabling unlocks the instant the save lands.
  const [msmWarning, setMsmWarning] = useState(false)
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  async function toggle(programId, currentlyEnabled) {
    if (!currentlyEnabled && !hasMsm) { setMsmWarning(true); return }
    setMsmWarning(false)
    setToggling(t => ({ ...t, [programId]: true }))
    try {
      await callApi('msm_toggle_program', { member_number: member.plugin_member_number, program_id: programId, enabled: !currentlyEnabled })
      onToggle(programId, !currentlyEnabled)
    } catch (err) { console.error(err) }
    finally { setToggling(t => ({ ...t, [programId]: false })) }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Programs</div>
      {msmWarning && !hasMsm && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.35)', color: '#e74c3c', fontSize: '13px', fontWeight: 600 }}>
          Please Select an MSM
        </div>
      )}
      {visiblePrograms.map(p => {
        const dbProgram = programs.find(prog => prog.name === p.name)
        if (!dbProgram) return null
        const isEnabled = enabledPrograms.some(e => e.program_id === dbProgram.id)
        return (
          <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
            <span style={{ fontSize: '14px', color: isEnabled ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>{p.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{isEnabled ? 'Enabled' : 'Disabled'}</span>
              <div onClick={() => !toggling[dbProgram.id] && toggle(dbProgram.id, isEnabled)}
                style={{ width: '44px', height: '24px', borderRadius: '12px', background: isEnabled ? '#1b9254' : 'var(--vfo-border-strong)', cursor: 'pointer', position: 'relative', opacity: toggling[dbProgram.id] ? 0.5 : 1 }}>
                <div style={{ position: 'absolute', top: '2px', left: isEnabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CoachingMeetings({ enrollment, member, eyebrow = 'Advanced Coaching' }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingStatus, setMeetingStatus] = useState('completed')
  const [meetingNotes, setMeetingNotes] = useState('')
  const [logStatus, setLogStatus] = useState('')
  const [expandedMeeting, setExpandedMeeting] = useState(null)
  const [editingNotes, setEditingNotes] = useState({})

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  useEffect(() => { loadMeetings() }, [enrollment.id])

  async function loadMeetings() {
    setLoading(true)
    try {
      const data = await callApi('coaching_load_meetings', { enrollment_id: enrollment.id })
      setMeetings(data.meetings || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function logMeeting(visibility) {
    if (!meetingDate) { setLogStatus('Date is required.'); return }
    try {
      await callApi('coaching_log_meeting', { enrollment_id: enrollment.id, member_number: member.plugin_member_number, meeting_date: meetingDate, status: meetingStatus, notes: meetingNotes, visibility })
      setMeetingDate(''); setMeetingNotes(''); setMeetingStatus('completed'); setShowLog(false); setLogStatus('')
      loadMeetings()
    } catch (err) { setLogStatus(err.message) }
  }

  async function updateMeeting(id, updates) {
    try {
      await callApi('coaching_update_meeting', { meeting_id: id, ...updates })
      loadMeetings()
    } catch (err) { console.error(err) }
  }

  async function deleteMeeting(id) {
    try {
      await callApi('coaching_delete_meeting', { meeting_id: id })
      loadMeetings()
    } catch (err) { console.error(err) }
  }

  const statusColors = { completed: '#1b9254', scheduled: '#0095ff', 'no show': '#e74c3c' }
  const completedCount = meetings.filter(m => m.status === 'completed').length
  const scheduledCount = meetings.filter(m => m.status === 'scheduled').length
  const nextScheduled = meetings.filter(m => m.status === 'scheduled').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0]

  if (loading) return <CoachingMeetingsSkeleton />

  return (
    <div>
      <TrackHero
        eyebrow={eyebrow}
        title="Coaching Meetings"
        meta={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b9254', flexShrink: 0 }} />{completedCount} completed</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0095ff', flexShrink: 0 }} />{scheduledCount} scheduled</span>
          {nextScheduled && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span>Next meeting {nextScheduled.meeting_date.split('T')[0]}</span></>}
        </>}
        action={<button onClick={() => setShowLog(!showLog)} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Log Meeting</button>}
      />

      {showLog && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Date *</label>
              <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Status</label>
              <select value={meetingStatus} onChange={e => setMeetingStatus(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                <option value="completed">Completed</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Notes</label>
            <textarea value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <SaveVisibilityButtons onSave={logMeeting} internalLabel="Log (internal note)" sharedLabel="Log & share note with member" hint="The meeting is always visible to the member — only the note text is internal or shared." />
            <button onClick={() => setShowLog(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
          {logStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{logStatus}</p>}
        </div>
      )}

      {meetings.filter(m => m.status === 'scheduled').length > 0 && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Upcoming</div>
          {meetings.filter(m => m.status === 'scheduled').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date)).map(m => (
            <div key={m.id} style={{ borderBottom: '1px solid var(--vfo-tint)' }}>
              <div onClick={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{m.meeting_date.split('T')[0]}</span>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>Scheduled</span>
                </div>
                <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expandedMeeting === m.id ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </div>
              {expandedMeeting === m.id && (
                <div style={{ padding: '0 0 12px 0' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <textarea defaultValue={m.notes || ''} placeholder="Add notes..." rows={2} onBlur={e => { if (e.target.value !== (m.notes || '')) updateMeeting(m.id, { notes: e.target.value }) }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => updateMeeting(m.id, { status: 'completed' })} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: '#1b9254', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Mark Completed</button>
                    <input type="date" defaultValue={m.meeting_date.split('T')[0]} onChange={e => updateMeeting(m.id, { meeting_date: e.target.value })} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                    <button onClick={() => deleteMeeting(m.id)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Meeting History</div>
        {meetings.filter(m => m.status === 'completed').length === 0
          ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No meetings completed yet.</p>
          : meetings.filter(m => m.status === 'completed').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date)).map(m => (
            <div key={m.id} style={{ borderBottom: '1px solid var(--vfo-tint)' }}>
              <div onClick={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{m.meeting_date.split('T')[0]}</span>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: '#1b9254', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Completed</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {m.notes && <VisibilityBadge visibility={m.visibility} />}
                  {m.notes && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>has notes</span>}
                  <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: expandedMeeting === m.id ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>
              {expandedMeeting === m.id && (
                <div style={{ padding: '0 0 12px 40px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <textarea defaultValue={m.notes || ''} placeholder="Add notes..." rows={2} onBlur={e => { if (e.target.value !== (m.notes || '')) updateMeeting(m.id, { notes: e.target.value }) }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => deleteMeeting(m.id)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

function CoachingRenewal({ enrollment, member }) {
  const [renewals, setRenewals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [actionType, setActionType] = useState('renewed')
  const [actionDate, setActionDate] = useState('')
  const [nextRenewalDate, setNextRenewalDate] = useState('')
  const [renewalNotes, setRenewalNotes] = useState('')
  const [processStatus, setProcessStatus] = useState('')

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  useEffect(() => { loadRenewals() }, [enrollment.id])

  async function loadRenewals() {
    setLoading(true)
    try {
      const data = await callApi('coaching_load_renewals', { enrollment_id: enrollment.id })
      setRenewals(data.renewals || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function getAutoPeriod() {
    const joinYear = enrollment.date_enrolled ? new Date(enrollment.date_enrolled).getFullYear() : null
    if (!joinYear) return 'Year 1'
    const renewedCount = renewals.filter(r => r.action === 'renewed').length
    return 'Year ' + (renewedCount + 1)
  }

  function handleActionDateChange(date) {
    setActionDate(date)
    if (actionType === 'renewed' && date) {
      const d = new Date(date)
      d.setFullYear(d.getFullYear() + 1)
      setNextRenewalDate(d.toISOString().split('T')[0])
    }
  }

  function handleActionTypeChange(type) {
    setActionType(type)
    if (type === 'cancelled') {
      setNextRenewalDate('')
    } else if (type === 'renewed' && actionDate) {
      const d = new Date(actionDate)
      d.setFullYear(d.getFullYear() + 1)
      setNextRenewalDate(d.toISOString().split('T')[0])
    }
  }

  async function processRenewal(visibility) {
    if (!actionDate) { setProcessStatus('Date is required.'); return }
    const period = actionType === 'renewed' ? getAutoPeriod() : null
    try {
      await callApi('coaching_process_renewal', { enrollment_id: enrollment.id, member_number: member.plugin_member_number, action_type: actionType, action_date: actionDate, next_renewal_date: actionType === 'renewed' ? nextRenewalDate : null, period_label: period, notes: renewalNotes || null, visibility })
      setActionDate(''); setNextRenewalDate(''); setRenewalNotes(''); setShowLog(false); setProcessStatus(''); setActionType('renewed')
      loadRenewals()
    } catch (err) { setProcessStatus(err.message) }
  }

  const latestRenewal = renewals.length > 0 ? renewals[0] : null
  const latestAction = latestRenewal?.action
  const nextDate = latestRenewal?.next_renewal_date
  const joinDate = enrollment.date_enrolled?.split('T')[0]
  const currentPeriod = latestRenewal?.period_label || 'Year 1'
  const currentStatus = latestAction === 'cancelled' ? 'Cancelled' : 'Active'
  const statusColor = currentStatus === 'Active' ? '#1b9254' : '#e74c3c'

  let daysUntilRenewal = null
  let renewalUrgency = '#1b9254'
  if (nextDate) {
    const diff = Math.ceil((new Date(nextDate) - new Date()) / (1000 * 60 * 60 * 24))
    daysUntilRenewal = diff
    if (diff < 0) renewalUrgency = '#e74c3c'
    else if (diff <= 30) renewalUrgency = '#e74c3c'
    else if (diff <= 60) renewalUrgency = '#e06717'
  }

  const actionColors = { renewed: '#1b9254', cancelled: '#e74c3c' }

  if (loading) return <CoachingRenewalSkeleton />


  return (
    <div>
      <TrackHero
        eyebrow="Advanced Coaching"
        title="Membership Renewal"
        meta={<>
          <span>Joined {joinDate || '—'}</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--vfo-ink)' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, flexShrink: 0 }} />{currentStatus}</span>
          <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
          <span>{currentPeriod}</span>
          {nextDate && <><span style={{ color: 'var(--vfo-border-mid)' }}>·</span><span style={{ fontWeight: 600, color: renewalUrgency }}>{daysUntilRenewal !== null && daysUntilRenewal < 0 ? `Overdue ${Math.abs(daysUntilRenewal)} days` : `Ends ${nextDate.split('T')[0]}${daysUntilRenewal !== null ? ` (${daysUntilRenewal} days)` : ''}`}</span></>}
        </>}
        action={<button onClick={() => setShowLog(!showLog)} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Log Renewal</button>}
      />

      {showLog && (
        <div style={{ ...sectionStyle, marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Action *</label>
              <select value={actionType} onChange={e => handleActionTypeChange(e.target.value)} style={{ ...inputStyle, background: 'var(--vfo-card)' }}>
                <option value="renewed">Renewed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Date *</label>
              <input type="date" value={actionDate} onChange={e => handleActionDateChange(e.target.value)} style={inputStyle} />
            </div>
            {actionType === 'renewed' && (
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Next Renewal Date</label>
                <input type="date" value={nextRenewalDate} onChange={e => setNextRenewalDate(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>
          {actionType === 'renewed' && (
            <div style={{ fontSize: '13px', color: '#0095ff', fontWeight: 500, marginBottom: '12px' }}>This will be logged as {getAutoPeriod()}</div>
          )}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }}>Notes</label>
            <input value={renewalNotes} onChange={e => setRenewalNotes(e.target.value)} placeholder="Optional notes" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <SaveVisibilityButtons onSave={processRenewal} internalLabel="Log (internal note)" sharedLabel="Log & share note with member" hint="The renewal is always visible to the member — only the note text is internal or shared." />
            <button onClick={() => setShowLog(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          </div>
          {processStatus && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{processStatus}</p>}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Renewal History</div>
        {renewals.length === 0
          ? <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>No renewals recorded yet.</p>
          : renewals.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: `${actionColors[r.action] || 'var(--vfo-muted)'}22`, color: actionColors[r.action] || 'var(--vfo-muted)', border: `1px solid ${actionColors[r.action] || 'var(--vfo-muted)'}44`, textTransform: 'capitalize' }}>{r.action}</span>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)' }}>{r.action_date?.split('T')[0]}</span>
                  {r.period_label && <span style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600 }}>{r.period_label}</span>}
                  {r.notes && <VisibilityBadge visibility={r.visibility} />}
                </div>

                {r.notes && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{r.notes}</div>}
              </div>
              {r.created_by && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{r.created_by}</span>}
            </div>
          ))
        }
      </div>
    </div>
  )
}
