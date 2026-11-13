import { useState } from 'react'
import { callApi } from '../../lib/api'
import { getSession } from '../../lib/api'
import { SaveVisibilityButtons } from './NoteVisibility'
import { MentionTextarea, mentionEmails } from './MentionTextarea'

// `memberMode` (the member's Profile tab, Jake 2026-11-12): the same box, but the
// note always goes to the team (member_client_note_add signs it with the
// member's name and saves it shared), so one green save button replaces the
// internal / shared pair.
// `stacked` (a phone): the open box drops onto its own full-width row under the
// card title, and the buttons wrap under the text box, instead of squeezing in
// beside the title. The card title row must allow wrapping for this.
function AddGeneralNote({ clientId, notes, onNotesChange, programName, memberMode = false, stacked = false }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState([])
  const session = getSession()

  async function save(visibility) {
    if (!text.trim()) return
    setSaving(true)
    setError('')
    try {
      const base = { client_id: clientId, phase_name: 'General', tab_name: 'General Note', program_name: programName, note_text: text.trim() }
      const result = memberMode
        ? await callApi('member_client_note_add', base)
        : await callApi('add_client_note', { ...base, created_by: session?.name || 'Admin', visibility, mentions: mentionEmails(base.note_text, picked) })
      onNotesChange([memberMode ? result.note : withMentions(result.note, base.note_text, picked), ...notes])
      setText('')
      setPicked([])
      setOpen(false)
    } catch (err) { console.error(err); if (memberMode) setError(err.message || 'Your note was not saved. Try again.') }
    finally { setSaving(false) }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: '4px 12px', borderRadius: '6px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ Add Note</button>
  }

  const off = saving || !text.trim()
  const boxStyle = { flex: stacked ? '1 1 100%' : 1, minWidth: 0, boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }
  // The box sits in a card title (upper-case, letter-spaced); its own lines read as body text.
  const plain = { textTransform: 'none', letterSpacing: 0, fontWeight: 400 }
  return (
    <div style={stacked
      ? { display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 100%', marginTop: '10px' }
      : { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginLeft: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: stacked ? 'wrap' : 'nowrap' }}>
        {memberMode
          ? <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a note for the VFO team..." rows={2} maxLength={5000} style={boxStyle} />
          : <MentionTextarea value={text} onChange={e => setText(e.target.value)} tabName="General Note" picked={picked} onPickedChange={setPicked} placeholder="Add a general note... Type @ to tag someone" rows={2} style={boxStyle} />}
        {memberMode
          ? <button onClick={() => save('shared')} disabled={off}
              style={{ padding: '6px 12px', borderRadius: '8px', background: off ? 'rgba(27,146,84,0.4)' : 'linear-gradient(135deg, #1b9254 0%, #23b268 100%)', border: 'none', boxShadow: off ? 'none' : '0 2px 8px rgba(27,146,84,0.28)', color: '#fff', fontSize: '11px', cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
              {saving ? 'Saving...' : 'Save note'}
            </button>
          : <SaveVisibilityButtons onSave={save} saving={saving} disabled={!text.trim()} size="sm" hint={false} />}
        <button onClick={() => { setOpen(false); setText(''); setError('') }} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '12px', cursor: 'pointer' }}>✕</button>
      </div>
      {memberMode && <span style={{ ...plain, fontSize: '10.5px', color: 'var(--vfo-faint)' }}>Your note is visible to the VFO team.</span>}
      {error && <div style={{ ...plain, color: '#e74c3c', fontWeight: 500, fontSize: '12px' }}>{error}</div>}
    </div>
  )
}

// The saved row comes back without its mentions; add the ones sent so the
// highlight shows at once.
function withMentions(note, text, picked) {
  const emails = new Set(mentionEmails(text, picked))
  return { ...note, client_note_mentions: picked.filter(p => emails.has(p.email)).map(p => ({ recipient_email: p.email, recipient_name: p.name, recipient_type: p.type })) }
}

export default AddGeneralNote
