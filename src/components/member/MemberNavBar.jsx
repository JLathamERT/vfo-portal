import { useEffect, useState, useRef } from 'react'
import { callApi, loadCachedData, loadCachedAction, getLastSeen } from '../../lib/api'

// The member portal's tab bar, moved out of MemberPortal.jsx on 2026-10-20 so the
// member's client page draws the very same bar. MemberPortal switches its own tab;
// the client page stores the pick in memberActiveTab and navigates to /member.

export const PROGRAM_KEYS = { 'VFO Holistic Planning': 'msm_holistic', 'Partnership Fast Track': 'msm_partnership', 'VFO Tax Planning': 'msm_tax', 'Advanced Coaching': 'msm_coaching', 'Standard Coaching': 'msm_standard' }
// Canonical program order — matches the admin MSM Home program-toggle list.
const PROGRAM_ORDER = ['VFO Holistic Planning', 'Partnership Fast Track', 'VFO Tax Planning', 'Advanced Coaching', 'Standard Coaching']
const TAX_PROGRAM_NAME = 'VFO Tax Planning'

export const MEMBER_TAB_LABELS = {
  profile: 'Profile', msm_home: 'MSM Home',
  msm_holistic: 'Holistic Planning', msm_partnership: 'Partnership Fast Track',
  msm_tax: 'Tax Planning', msm_coaching: 'Advanced Coaching', msm_standard: 'Standard Coaching',
  specialists: 'Specialists', showroom: 'Showroom', website: 'Website Plugin',
  ciq: 'CIQ', growthplan: 'Growth Plan', gc: 'GC Marketplace', vault: 'Vault'
}

// ANY member may start a tax client once Jake flips portal_feature_flags.tax_intake;
// until then VFO Tax Planning follows the rule every other program shares: a
// member_program_enabled row.
export function orderMemberPrograms(allPrograms, enabledPrograms, features) {
  const taxIntakeEnabled = features?.tax_intake === true
  return (allPrograms || [])
    .filter(p => (enabledPrograms || []).some(e => e.program_id === p.id) || (taxIntakeEnabled && p.name === TAX_PROGRAM_NAME))
    .sort((a, b) => {
      const ia = PROGRAM_ORDER.indexOf(a.name), ib = PROGRAM_ORDER.indexOf(b.name)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
}

// For a page outside MemberPortal: the same inputs MemberPortal loads, drawn at
// once from its last-seen snapshot and refreshed behind it.
export function useMemberNavData(session, enabled = true) {
  const memberNumber = session?.member_number
  const [nav, setNav] = useState(() => {
    const snap = enabled && memberNumber ? getLastSeen(`memberportal:${memberNumber}`) : null
    return snap ? fromLoads(snap.data, snap.progData, snap.enabledData, memberNumber) : { programs: [], websiteEnabled: false }
  })
  useEffect(() => {
    if (!enabled || !memberNumber) return
    let live = true
    Promise.all([
      loadCachedData(),
      loadCachedAction('msm_load_programs'),
      callApi('msm_load_enabled_programs', { member_number: memberNumber }),
    ]).then(([data, progData, enabledData]) => { if (live) setNav(fromLoads(data, progData, enabledData, memberNumber)) })
      .catch(err => console.error(err))
    return () => { live = false }
  }, [enabled, memberNumber])
  return nav
}
function fromLoads(data, progData, enabledData, memberNumber) {
  const me = (data?.members || []).find(m => m.member_number === memberNumber)
  return {
    programs: orderMemberPrograms(progData?.programs, enabledData?.enabled, enabledData?.features),
    websiteEnabled: !!me?.website_enabled,
  }
}

// onLabelClick (optional): clicking the tab's own label navigates too, so the
// first option is reachable without opening the menu (Profile uses it).
function NavDropdown({ label, isActive, options, activeTab, onSelect, onLabelClick }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function handleMouseEnter() { clearTimeout(closeTimer.current); setOpen(true) }
  function handleMouseLeave() { setOpen(false) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button onClick={onLabelClick ? () => { onLabelClick(); setOpen(false) } : undefined} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: isActive ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: isActive ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: isActive ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '200px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: activeTab === opt.key ? 'rgba(0,149,255,0.15)' : 'transparent', border: 'none', color: activeTab === opt.key ? '#0095ff' : 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = activeTab === opt.key ? 'rgba(0,149,255,0.15)' : 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MemberNavBar({ activeTab, onSelect, programs = [], websiteEnabled = false }) {
  const tabBtn = (key, label) => (
    <button key={key} onClick={() => onSelect(key)} style={{ padding: '14px 20px', background: 'transparent', border: 'none', borderBottom: activeTab === key ? '2px solid var(--vfo-accent-text)' : '2px solid transparent', color: activeTab === key ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '14px', fontWeight: activeTab === key ? '600' : '400', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)' }}>
      <NavDropdown
        label="Profile"
        isActive={activeTab === 'profile' || activeTab === 'profile_edit'}
        activeTab={activeTab}
        options={[{ key: 'profile', label: 'Profile' }, { key: 'profile_edit', label: 'Edit Profile' }]}
        onSelect={onSelect}
        onLabelClick={() => onSelect('profile')}
      />
      <NavDropdown
        label="MSM"
        isActive={activeTab === 'msm_home' || !!activeTab?.startsWith('msm_')}
        activeTab={activeTab}
        options={[
          { key: 'msm_home', label: 'MSM Home' },
          ...programs.map(p => ({ key: PROGRAM_KEYS[p.name], label: p.name })).filter(o => o.key)
        ]}
        onSelect={onSelect}
      />
      {tabBtn('client_overview', 'Client Overview')}
      {/* Every member, no switch (2026-10-14) — see MemberTaxDiagnostic. */}
      {tabBtn('tax_diagnostic', 'Tax Diagnostic')}
      {['specialists', 'showroom', 'website', 'growthplan', 'ciq', 'gc', 'vault'].filter(tab => tab !== 'website' || websiteEnabled).map(tab => tabBtn(tab, MEMBER_TAB_LABELS[tab]))}
    </div>
  )
}
