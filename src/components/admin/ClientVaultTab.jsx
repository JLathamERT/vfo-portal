import { useEffect, useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import { fileSizeError } from '../../lib/fileUpload'
import { VaultRowsSkeleton } from '../shared/Skeleton'
import RequestDocsButton from '../shared/RequestDocsButton'

// Deliberately duplicated from TaxPrioritiesTab's LockedIcon rather than shared:
// that file is under active end-to-end test and must not be touched, and a nine
// line SVG does not earn a shared module.
function LockedIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ opacity: 0.75, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="#e74c3c" strokeWidth="1.6" fill="none" />
      <line x1="3.9" y1="12.1" x2="12.1" y2="3.9" stroke="#e74c3c" strokeWidth="1.6" />
    </svg>
  )
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,image/*,application/pdf'
const fmtSize = (n) => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

// Admin Vault tab. Two sections:
//  - Sensitive (tax returns): every admin sees titles; canView admins can OPEN
//    them (the allowlist plus this client's own assigned PF), and the narrower
//    canManageTax admins (the allowlist only) can add/delete/SHARE. Both flags
//    come from the server on vault_tax_list — never re-derive either here.
//  - General Documentation: all admins can view/add/delete/share.
// Each manageable file can be SHARED with specialists (Feature A): the specialist
// then sees it in their portal's "Shared with Me" tab. Revoke any time.
//
// readOnly (the tax-planner portal) hides every write control. allowUpload is the
// one exception granted to planners / Team Members: they may ADD to the two
// client-owned sections, but still not delete, share or request documents. The
// ERT/VFOS section stays admin-managed even then (adminOnlyUpload).
//
// memberMode (the MEMBER portal's own client page) is a third, separate flag —
// not a loosening of readOnly (#386). A member may VIEW all three sections and
// ADD to General + Sensitive; Share, Delete, Request documentation and
// drag-to-move are withheld everywhere in that surface, with no exception, and
// the member-mode blurbs promise exactly that and nothing more. It routes every
// call through the three member_client_vault_* actions, which are confined
// server-side by denyIfNotOwnClient.
export default function ClientVaultTab({ clientId, sectionStyle, specialists = [], readOnly = false, allowUpload = false, memberMode = false, recipientName, recipientFirst }) {
  const [sensitive, setSensitive] = useState([])
  const [canView, setCanView] = useState(false)
  // Strictly narrower than canView: an assigned PF may OPEN this client's tax
  // returns but not add/remove/share them, so the write controls key on this.
  const [canManageTax, setCanManageTax] = useState(false)
  const [general, setGeneral] = useState([])
  const [ert, setErt] = useState([])
  // Default false so the pre-load render is unchanged; only a SETTLED rejection
  // flips these, never the in-flight state.
  const [taxDenied, setTaxDenied] = useState(false)
  const [genDenied, setGenDenied] = useState(false)
  const [ertDenied, setErtDenied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Asking for tax returns belongs to the Tax Priorities "Request Tax Returns"
  // step: that step mints the tracked /tax-upload token and is what stamps
  // tax_returns_received_at. While a live plan is still waiting on returns, the
  // generic vault request must not offer a second, untracked route to the same
  // documents. Read fresh (not loadCachedAction) so the block clears as soon as
  // the returns land rather than persisting for the whole app session.
  const [returnsPending, setReturnsPending] = useState(false)
  useEffect(() => {
    // Members never see the Request-documentation button, so they never need
    // this lookup — and it is one fewer portal round trip.
    if (readOnly || memberMode || !clientId) return
    let cancelled = false
    callApi('tax_load_plans', { client_id: clientId })
      .then(res => {
        if (cancelled) return
        setReturnsPending((res?.plans || []).some(p =>
          String(p?.status || '').toLowerCase() === 'live' && !p?.tax_returns_received_at))
      })
      // Fail-soft: a client with no tax plan, or a load that errors, is never
      // gated - the button must not break for non-tax clients.
      .catch(() => { if (!cancelled) setReturnsPending(false) })
    return () => { cancelled = true }
  }, [clientId, readOnly, memberMode])

  // Drag-to-move between sections (ERT managers only). dragItem holds the row
  // being dragged; dragOverKey highlights the section currently under the cursor.
  const [dragItem, setDragItem] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const [moving, setMoving] = useState(false)

  // Sharing — one open share panel at a time, keyed `${bucket}|${path}`.
  const [shareKey, setShareKey] = useState(null)
  const [shares, setShares] = useState([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)

  // Each section's load is settled INDEPENDENTLY so a section that was refused
  // can drop its own write controls. Sensitive already did this implicitly via
  // the server's can_view flag; General and ERT hardcoded canManage and so kept
  // offering "+ Add document" on a client the caller has no access to — the
  // button then failed server-side, reading as a broken app rather than a
  // permission boundary (#386, one section short).
  async function load() {
    setLoading(true); setError('')
    // Member mode fans ONE call into the same three pieces of state the three
    // admin calls populate below — deliberately not three round trips, because
    // the portal already suffers from sequential-call stacking.
    if (memberMode) {
      try {
        const d = await callApi('member_client_vault_list', { client_id: clientId })
        setSensitive(d.sensitive || []); setGeneral(d.general || []); setErt(d.ert || [])
        setTaxDenied(false); setGenDenied(false); setErtDenied(false)
      } catch (e) {
        // One call, so a refusal denies all three sections together.
        setSensitive([]); setGeneral([]); setErt([])
        setTaxDenied(true); setGenDenied(true); setErtDenied(true)
        setError(e.message || 'Could not load vault')
      }
      setLoading(false)
      return
    }
    const [tax, gen, ertRes] = await Promise.allSettled([
      callApi('vault_tax_list', { client_id: clientId }),
      callApi('vault_gen_list', { client_id: clientId }),
      callApi('admin_ert_list', { entity: 'client', key: clientId }),
    ])
    setSensitive(tax.status === 'fulfilled' ? (tax.value.files || []) : [])
    setCanView(tax.status === 'fulfilled' && !!tax.value.can_view)
    // Fails CLOSED on a pre-deploy backend that returns no can_manage: the flag
    // reads undefined -> false -> View only, never a button that 403s.
    setCanManageTax(tax.status === 'fulfilled' && !!tax.value.can_manage)
    setTaxDenied(tax.status === 'rejected')
    setGeneral(gen.status === 'fulfilled' ? (gen.value.files || []) : [])
    setGenDenied(gen.status === 'rejected')
    setErt(ertRes.status === 'fulfilled' ? (ertRes.value.ert || []) : [])
    setErtDenied(ertRes.status === 'rejected')
    const failed = [tax, gen, ertRes].find(r => r.status === 'rejected')
    setError(failed ? (failed.reason?.message || 'Could not load vault') : '')
    setLoading(false)
  }
  useEffect(() => { load() }, [clientId])

  // The ERT/VFOS section is routed through the unified admin_ert_* actions
  // ({ entity, key }); the sensitive/general sections use their { client_id }
  // handlers. paramsFor picks the right shape per section.
  // Member mode has ONE handler pair for all three sections, keyed by an
  // explicit `section` the server re-checks against a positive allowlist.
  const paramsFor = (sec) => memberMode
    ? { client_id: clientId, section: sec.key }
    : sec.key === 'ert' ? { entity: 'client', key: clientId } : { client_id: clientId }

  async function view(sec, path) {
    try { const d = await callApi(sec.actions.download, { ...paramsFor(sec), path }); if (d.url) window.open(d.url, '_blank', 'noopener') }
    catch (e) { setError(e.message || 'Could not open document') }
  }
  async function remove(sec, path) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    try { await callApi(sec.actions.delete, { ...paramsFor(sec), path }); load() }
    catch (e) { setError(e.message || 'Could not delete') }
  }
  async function handleFiles(sec, fileList) {
    const list = Array.from(fileList || [])
    if (!list.length) return
    setBusy(sec.key); setError('')
    for (const file of list) {
      const tooBig = fileSizeError(file)
      if (tooBig) { setError(tooBig); continue }
      try {
        const d = await callApi(sec.actions.upload, { ...paramsFor(sec), filename: file.name })
        if (!d.signed_url) throw new Error(d.error || 'Could not start upload')
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file)
        const put = await fetch(d.signed_url, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: fd })
        if (!put.ok) throw new Error('Upload failed')
        // Member Sensitive uploads: tell the server the file ARRIVED, so a member
        // dropping the returns greens "Request Tax Returns" exactly like the
        // client's link does (2026-09-25). Best-effort — never fails the upload.
        if (sec.actions.uploadNotify) {
          callApi(sec.actions.uploadNotify, { ...paramsFor(sec), file_name: file.name }).catch(() => {})
        }
      } catch (e) { setError(e.message || 'Upload failed') }
    }
    setBusy(''); load()
  }

  // ─── Drag to move between sections ───
  // A move is a cross-bucket copy + delete server-side, so it is confirmed on
  // the two directions that change who can see the file: OUT of Sensitive (a
  // privacy downgrade — General is visible to every admin and every in-group tax
  // planner) and INTO ERT (which the client can see in their own portal).
  const SECTION_LABELS = { sensitive: 'Sensitive Documents', general: 'General Documentation', ert: 'ERT/VFOS Documentation' }

  function moveWarning(from, to) {
    if (from === 'sensitive') return `"%s" will move out of Sensitive Documents into ${SECTION_LABELS[to]}, where every admin — and any tax planner working this client — can open it.`
    if (to === 'ert') return `"%s" will move into ERT/VFOS Documentation, which the client can see in their own portal.`
    return null
  }

  async function moveDoc(fromKey, toKey, file) {
    if (fromKey === toKey) return
    const warn = moveWarning(fromKey, toKey)
    if (warn && !window.confirm(warn.replace('%s', file.name) + '\n\nMove it?')) return
    setMoving(true); setError('')
    try {
      const d = await callApi('vault_move_document', {
        entity: 'client', key: clientId, from_section: fromKey, to_section: toKey, path: file.path,
      })
      if (d.warning) setError(d.warning)
    } catch (e) { setError(e.message || 'Could not move document') }
    setMoving(false); load()
  }

  // ─── Sharing ───
  async function fetchShares(bucket, path) {
    const d = await callApi('doc_shares_list', { bucket, object_path: path })
    setShares(d.shares || [])
  }
  async function toggleShare(bucket, path) {
    const key = `${bucket}|${path}`
    if (shareKey === key) { setShareKey(null); return }
    setShareKey(key); setShares([]); setSharesLoading(true); setError('')
    try { await fetchShares(bucket, path) }
    catch (e) { setError(e.message || 'Could not load shares') }
    setSharesLoading(false)
  }
  async function grant(bucket, path, expertId) {
    if (!expertId) return
    setShareBusy(true); setError('')
    try { await callApi('doc_share_grant', { bucket, object_path: path, client_id: clientId, expert_id: [Number(expertId)] }); await fetchShares(bucket, path) }
    catch (e) { setError(e.message || 'Could not share') }
    setShareBusy(false)
  }
  async function revoke(bucket, path, shareId) {
    setShareBusy(true); setError('')
    try { await callApi('doc_share_revoke', { share_id: shareId }); await fetchShares(bucket, path) }
    catch (e) { setError(e.message || 'Could not revoke') }
    setShareBusy(false)
  }

  // In the planner portal (readOnly + allowUpload) the two client-owned sections
  // are view-and-add, so their blurbs must not promise remove/share.
  const addOnly = readOnly && allowUpload
  // ERT add/delete is allowlisted to Jake + Tray server-side; the login returns
  // is_ert_manager so the UI can withhold controls that would 403. Sessions live
  // in sessionStorage, so an admin holding a pre-deploy session sees the flag as
  // undefined and gets View only until they log in again — fails CLOSED.
  const isErtManager = !!getSession()?.is_ert_manager
  // Drag-to-move is the same two people. Never in the planner portal (readOnly),
  // and never in the member portal (a member session can never carry the flag,
  // but this surface withholds the handle unconditionally rather than relying
  // on that).
  const canMove = isErtManager && !readOnly && !memberMode

  // Member portal view of one of the member's OWN clients. All three sections
  // are viewable; General + Sensitive are addable; ERT/VFOS is view-only. The
  // blurbs assert exactly this permission set and no more (#386).
  const MEMBER_SECTIONS = [
    {
      key: 'sensitive', title: 'Sensitive Documents', sub: '(tax returns)', files: sensitive,
      canManage: !taxDenied, canWrite: true, bucket: 'client-tax-returns', noShare: true,
      blurb: taxDenied
        ? 'Stored in a private vault. You do not have access to this client.'
        : 'Stored in a private vault. This is where tax returns and other confidential documents belong. You can view these documents and add new ones.',
      actions: { download: 'member_client_vault_download', upload: 'member_client_vault_upload_url', uploadNotify: 'member_client_vault_upload_notify' },
    },
    {
      key: 'general', title: 'General Documentation', sub: '', files: general,
      canManage: !genDenied, canWrite: true, bucket: 'client-documents', noShare: true,
      // A JSX node, not a string: the warning sentence has to be bold and the
      // blurb is rendered as a plain text child (never dangerouslySetInnerHTML).
      blurb: genDenied
        ? 'Everyday client documents. You do not have access to this client.'
        : (
          <>General documentation only. <strong>DO NOT UPLOAD TAX RETURNS OR SENSITIVE TAX DOCUMENTS HERE</strong> — those belong in the Sensitive Documents section above.</>
        ),
      actions: { download: 'member_client_vault_download', upload: 'member_client_vault_upload_url' },
    },
    {
      // canWrite false, and the upload action is deliberately absent — this
      // section is VFO-managed and the server refuses a member write to it.
      key: 'ert', title: 'ERT/VFOS Documentation', sub: '', files: ert,
      canManage: !ertDenied, canWrite: false, bucket: 'client-ert-docs', noShare: true,
      blurb: ertDenied
        ? 'VFO / ERT documentation for this client. You do not have access to this client.'
        : 'VFO / ERT internal documentation for this client. View only — the VFO team adds and manages these.',
      actions: { download: 'member_client_vault_download' },
    },
  ]

  const ADMIN_SECTIONS = [
    {
      // canManage = may OPEN (the View button + the unlocked row chrome);
      // canWrite = may CHANGE (Add / Delete / Share). Same seam the ERT section
      // below established, now load-bearing here too: an assigned PF is
      // canManage-yes / canWrite-no, and gating a write control on canManage
      // would render a button that 403s.
      key: 'sensitive', title: 'Sensitive Documents', sub: '(tax returns)', files: sensitive, canManage: canView, canWrite: canManageTax, bucket: 'client-tax-returns', canRequestDocs: true,
      blurb: taxDenied
        ? 'Stored in a private vault. You do not have access to this client.'
        : !canView
          ? 'Stored in a private vault. You can see what has been uploaded, but only authorized tax staff can open or share these documents.'
          : addOnly
          ? 'Stored in a private vault. You can view these documents and add new ones.'
          : !canManageTax
          ? 'Stored in a private vault. You can view these documents; only authorized tax staff can add, remove or share them.'
          : 'Stored in a private vault. You have access to view, add, remove and share these documents.',
      actions: { download: 'vault_tax_download', delete: 'vault_tax_delete', upload: 'vault_tax_admin_upload_url' },
    },
    {
      key: 'general', title: 'General Documentation', sub: '', files: general, canManage: !genDenied, bucket: 'client-documents', canRequestDocs: true,
      blurb: genDenied
        ? 'Everyday client documents. You do not have access to this client.'
        : addOnly
          ? 'Everyday client documents. You can view these documents and add new ones.'
          : 'Everyday client documents. All admins can view, add, remove and share these.',
      actions: { download: 'vault_gen_download', delete: 'vault_gen_delete', upload: 'vault_gen_upload_url' },
    },
    {
      // canWrite is SEPARATE from canManage on purpose: canManage still governs
      // the View button, and a non-ERT-manager admin keeps View. Only Add and
      // Delete are withdrawn. (2026-08-13 — constants/ert-access.ts server-side.)
      // This seam is now shared with the sensitive section above (2026-08-18),
      // so EVERY write affordance — Add, Delete, Share, drag-to-move — keys on
      // canWrite, and only View / the unlocked row chrome keys on canManage.
      key: 'ert', title: 'ERT/VFOS Documentation', sub: '', files: ert, canManage: !ertDenied, canWrite: isErtManager, bucket: 'client-ert-docs', noShare: true, adminOnlyUpload: true,
      blurb: ertDenied
        ? 'ERT / VFO documents for this client. You do not have access to this client.'
        : isErtManager
          ? 'ERT / VFO documents for this client. Only authorized VFO staff can add or remove; the client can only view them in their portal. Signed agreements land here automatically once paid.'
          : 'ERT / VFO documents for this client. You can view these; only authorized VFO staff can add or remove them. Signed agreements land here automatically once paid.',
      actions: { download: 'admin_ert_download', delete: 'admin_ert_delete', upload: 'admin_ert_upload_url' },
    },
  ]

  const SECTIONS = memberMode ? MEMBER_SECTIONS : ADMIN_SECTIONS

  const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--vfo-ink-2)', background: '#dce7fb', border: '1px solid var(--vfo-border-mid)', borderRadius: '999px', padding: '3px 6px 3px 11px' }

  return (
    <>
      {error && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
      {moving && <div style={{ color: '#0095ff', fontWeight: 500, fontSize: '13px', marginBottom: '12px' }}>Moving document…</div>}
      {canMove && !loading && (
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '12px' }}>
          Drag a document by its <span style={{ userSelect: 'none' }}>⠿</span> handle onto another section to move it there.
        </div>
      )}
      {SECTIONS.map(sec => (
        <div
          key={sec.key}
          style={dragOverKey === sec.key && dragItem?.section !== sec.key
            ? { ...sectionStyle, outline: '2px dashed #0095ff', outlineOffset: '-4px', background: 'rgba(0,149,255,0.05)' }
            : sectionStyle}
          onDragOver={canMove && dragItem && dragItem.section !== sec.key ? (e => { e.preventDefault(); setDragOverKey(sec.key) }) : undefined}
          onDragLeave={canMove ? (() => setDragOverKey(k => k === sec.key ? null : k)) : undefined}
          onDrop={canMove && dragItem ? (e => {
            e.preventDefault()
            const item = dragItem
            setDragOverKey(null); setDragItem(null)
            if (item && item.section !== sec.key) moveDoc(item.section, sec.key, item.file)
          }) : undefined}
        >
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{sec.title} {sec.sub && <span style={{ textTransform: 'none', fontSize: '12px' }}>{sec.sub}</span>}</div>
          <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{sec.blurb}</p>

          {sec.canRequestDocs && sec.canManage && !readOnly && !memberMode && (
            sec.key === 'sensitive' && returnsPending ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                <LockedIcon />
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontWeight: 500 }}>Please request tax returns from the Request Tax Returns step</span>
              </div>
            ) : (
              <RequestDocsButton entityType="client" entityKey={clientId} section={sec.key} recipientName={recipientName} recipientFirst={recipientFirst} />
            )
          )}

          {loading ? <VaultRowsSkeleton rows={2} /> : (
            <>
              {sec.files.length === 0 && <div style={{ color: 'var(--vfo-muted)', fontSize: '13px', marginBottom: '14px' }}>No documents uploaded yet.</div>}
              {sec.files.map(f => {
                const key = `${sec.bucket}|${f.path}`
                const open = shareKey === key
                const sharedIds = new Set(shares.map(s => String(s.expert_id)))
                return (
                  <div key={f.path} style={{ marginBottom: '8px' }}>
                    <div
                      draggable={canMove && sec.canWrite !== false}
                      onDragStart={canMove && sec.canWrite !== false ? (e => { e.dataTransfer.effectAllowed = 'move'; setDragItem({ section: sec.key, file: f }) }) : undefined}
                      onDragEnd={canMove ? (() => { setDragItem(null); setDragOverKey(null) }) : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-tint-deep)', borderRadius: open ? '8px 8px 0 0' : '8px', opacity: dragItem?.file?.path === f.path ? 0.45 : 1 }}
                    >
                      {canMove && sec.canWrite !== false && (
                        <span title="Drag to move this document to another section" style={{ fontSize: '14px', color: 'var(--vfo-muted)', cursor: 'grab', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                      )}
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>{sec.canManage ? '📄' : '🔒'}</span>
                      <span title={f.name} style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
                      {sec.canManage ? (
                        <>
                          <button onClick={() => view(sec, f.path)} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.12)', color: '#0095ff', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>View</button>
                          {!readOnly && !memberMode && !sec.noShare && sec.canWrite !== false && <button onClick={() => toggleShare(sec.bucket, f.path)} style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(18,94,204,0.4)', background: open ? 'rgba(18,94,204,0.22)' : 'rgba(18,94,204,0.1)', color: '#125ecc', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Share</button>}
                          {!readOnly && !memberMode && sec.canWrite !== false && <button onClick={() => remove(sec, f.path)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Delete</button>}
                        </>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', fontStyle: 'italic', flexShrink: 0 }}>locked</span>
                      )}
                    </div>
                    {open && (
                      <div style={{ padding: '12px 14px', background: '#f7faff', border: '1px solid var(--vfo-tint-deep)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontWeight: 600, marginBottom: '8px' }}>Shared with specialists</div>
                        {sharesLoading ? <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Loading…</div> : (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                              {shares.length === 0 && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>Not shared with anyone yet.</span>}
                              {shares.map(s => (
                                <span key={s.share_id} style={chipStyle}>
                                  {s.expert_name || `Specialist #${s.expert_id}`}
                                  {s.viewed && <span title="Opened by the specialist" style={{ color: '#1f9d55', fontWeight: 700 }}>✓</span>}
                                  <button onClick={() => revoke(sec.bucket, f.path, s.share_id)} disabled={shareBusy} title="Revoke access" style={{ border: 'none', background: 'transparent', color: '#e74c3c', cursor: shareBusy ? 'default' : 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>✕</button>
                                </span>
                              ))}
                            </div>
                            <select value="" disabled={shareBusy} onChange={e => grant(sec.bucket, f.path, e.target.value)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'var(--vfo-card)', color: 'var(--vfo-ink-2)', minWidth: '230px', cursor: 'pointer' }}>
                              <option value="">+ Share with a specialist…</option>
                              {specialists.filter(e => !sharedIds.has(String(e.id))).map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {sec.canManage && sec.canWrite !== false && (!readOnly || (allowUpload && !sec.adminOnlyUpload)) && (
                <label style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginTop: '14px', padding: '18px', borderRadius: '8px', border: '1px dashed var(--vfo-border-mid)', background: 'var(--vfo-tint)' }}>
                  <input type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={e => { handleFiles(sec, e.target.files); e.target.value = '' }} />
                  <span style={{ fontSize: '13px', color: 'var(--vfo-muted)' }}>{busy === sec.key ? 'Uploading…' : '+ Add document'}</span>
                </label>
              )}
            </>
          )}
        </div>
      ))}
    </>
  )
}
