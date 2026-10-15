function MeetingCompleteButton({ phase, progress, onComplete, completedPhases }) {
  const state = completedPhases[phase.id]
  const tasks = (phase.program_client_tasks || []).filter(t => t.status_options && t.status_options !== 'auto')
  const allDone = tasks.every(t => progress[t.id]?.status)

  if (allDone && state !== 'done') return null

  return (
    <button
      onClick={() => onComplete(phase)}
      disabled={state === 'saving'}
      style={{
        padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: state === 'saving' ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
        background: state === 'done' ? 'rgba(27,146,84,0.15)' : 'rgba(0,149,255,0.15)',
        border: `1px solid ${state === 'done' ? 'rgba(27,146,84,0.4)' : 'rgba(0,149,255,0.4)'}`,
        color: state === 'done' ? 'var(--vfo-success-text)' : '#0095ff',
      }}>
      {state === 'saving' ? 'Saving...' : state === 'done' ? '✓ Meeting Completed' : '✓ Meeting Completed'}
    </button>
  )
}

export default MeetingCompleteButton