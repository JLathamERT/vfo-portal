import { useState, useMemo } from 'react'
import { KpiHero, SplitDonut, BreakdownRows, BreakdownCard } from './KpiKit'
import { MemberNameLink } from '../shared/personLinks'

// ── Member-type families ──────────────────────────────────────────────
// A "family" is a headline product grouped with its constituent member_types.
// Matching is EXACT (a reverse type->family map below), never substring, so e.g.
// "Implementation - VFO FT (Direct)" lands in its own family and is NOT swept
// into "VFO FT". Any member_type not listed here falls into a synthetic
// "Other" family so every member is always counted somewhere.
// Display order is the array order below (advisor + accountant KPI pages render
// families in this exact sequence — see familyData, which preserves source order
// for the curated advisor/accountant sets).
const ADVISOR_FAMILIES = [
  { key: 'implementation', label: 'Implementation', types: ['Implementation'] },
  { key: 'catalyst', label: 'Catalyst', types: ['Free Catalyst', 'Catalyst', 'Catalyst A'] },
  { key: 'accelerator', label: 'Accelerator', types: ['Accelerator', 'Accelerator A', 'Legacy Accelerator'] },
  { key: 'fusion', label: 'Fusion', types: ['Free Fusion', 'Fusion', 'Fusion A', 'Fusion A - I/M', 'Legacy Fusion'] },
  { key: 'corporate', label: 'Corporate Members', types: ['Corporate Member', 'Free Corporate Member', 'Free Corporate Member (Legacy)'] },
  { key: 'tbm', label: 'Legacy TBM', types: ['Free Legacy TBM'] },
  { key: 'financial', label: 'Financial Collaborator', types: ['Financial Collaborator'] },
]

const ACCOUNTANT_FAMILIES = [
  { key: 'impl_ft', label: 'Implementation — VFO FT', types: ['Implementation - VFO FT (Direct)', 'Implementation - VFO FT (Advisor)'] },
  { key: 'vfo_ft', label: 'VFO FT', types: ['VFO FT (Direct)', 'VFO FT (Advisor)'] },
  { key: 'plus', label: 'Plus', types: ['Plus (Direct)', 'Plus (Advisor)'] },
  { key: 'advanced', label: 'Advanced', types: ['Advanced (Direct)', 'Advanced (Advisor)'] },
  { key: 'vfo_associate', label: 'VFO Associate', types: ['VFO Associate (Direct)', 'VFO Associate (Advisor)'] },
  { key: 'survey', label: 'Survey', types: ['Survey #1', 'Survey #2', 'Survey #3'] },
  { key: 'fac', label: 'FAC Historic', types: ['FAC Historic'] },
]

// ── Separate (excluded) buckets ───────────────────────────────────────
// Per product decision, these member types are shown as a STANDALONE count and
// deliberately kept OUT of the category's Active/Total/status counts AND the
// breakdown (advisor: VFO Reconciliation; accountant: Team Member).
const SEPARATE_BUCKETS = {
  advisor: { label: 'VFO Reconciliation', types: ['VFO Reconciliation (Free)'] },
  accountant: { label: 'Team Member', types: ['Team Member'] },
}

// ── Status lenses ─────────────────────────────────────────────────────
// `suspended` and `paused` are boolean flags that sit ON TOP of an Active
// member, so they are SUBSETS of Active — selecting them re-scopes to the
// active members carrying that flag (they render as hollow-dot chips, not bar
// segments, because they'd double-count Active in the stacked bar).
const LENSES = [
  { key: 'active', label: 'Active', color: '#1b9254', desc: 'of total' },
  { key: 'suspended', label: 'Suspended', color: '#c98a14', desc: 'of active', sub: true },
  { key: 'paused', label: 'Paused', color: '#e06717', desc: 'of active', sub: true },
  { key: 'arrears', label: 'In Arrears', color: '#b45309', desc: 'of active', sub: true },
  { key: 'lost', label: 'Lost', color: '#e74c3c', desc: 'of total' },
  { key: 'removed', label: 'Removed', color: '#9fb1d6', desc: 'of total' },
  { key: 'all', label: 'Total', color: '#125ecc', desc: 'incl. lost & removed' },
]

const statusOf = (m) => m.elite_status || 'Active'
const isActive = (m) => statusOf(m) === 'Active'

const LENS_PREDICATE = {
  all: () => true,
  active: isActive,
  suspended: (m) => isActive(m) && !!m.suspended,
  paused: (m) => isActive(m) && !!m.paused,
  // Membership fees in arrears — set/cleared by the membership sweep, not a suspension.
  arrears: (m) => isActive(m) && !!m.membership_arrears,
  lost: (m) => statusOf(m) === 'Lost',
  removed: (m) => statusOf(m) === 'Removed',
}

// Colors match the member-profile Suspended/Paused toggles: suspended = red,
// paused = orange; arrears = amber, the held-payout colour Accounting uses.
const STANDING = {
  suspended: { label: 'Suspended', color: '#e74c3c' },
  paused: { label: 'Paused', color: '#e06717' },
  arrears: { label: 'In Arrears', color: '#b45309' },
}

export default function MemberKpiPanel({ allMembers, category }) {
  const [lens, setLens] = useState('active')
  const [subTab, setSubTab] = useState('kpis')          // 'kpis' | 'standing'
  const [standing, setStanding] = useState('suspended') // 'suspended' | 'paused' | 'arrears'

  const isAdvisorPage = category === 'advisor'
  const isStrategic = category === 'strategic_member'
  const title = isAdvisorPage ? 'Advisor KPIs' : isStrategic ? 'Strategic Member KPIs' : 'Accountant KPIs'
  const breakdownLabel = isStrategic ? 'Breakdown by group' : 'Breakdown by member type'
  const noun = isAdvisorPage ? 'advisors' : isStrategic ? 'strategic members' : 'accountants'
  const nounTitle = noun.charAt(0).toUpperCase() + noun.slice(1)

  // The separate/excluded bucket for this page (advisor + accountant only).
  const separate = isAdvisorPage ? SEPARATE_BUCKETS.advisor : (!isStrategic ? SEPARATE_BUCKETS.accountant : null)
  const separateSet = useMemo(() => new Set(separate?.types || []), [separate])

  // The full category population (before the separate bucket is carved out).
  const rawPool = useMemo(() => (
    isAdvisorPage
      ? allMembers.filter((m) => m.member_category !== 'accountant' && m.member_category !== 'strategic_member')
      : allMembers.filter((m) => m.member_category === category)
  ), [allMembers, isAdvisorPage, category])

  // The excluded members — surfaced as their own count, never mixed into the
  // Active/Total/status counts or the breakdown below.
  const separateMembers = useMemo(() => rawPool.filter((m) => separateSet.has(m.member_type)), [rawPool, separateSet])
  const separateCounts = useMemo(() => ({
    all: separateMembers.length,
    active: separateMembers.filter(isActive).length,
  }), [separateMembers])

  // The counted pool: everything except the separate bucket. All KPI counts,
  // the breakdown, and the Suspended/Paused list read off this.
  const pool = useMemo(() => rawPool.filter((m) => !separateSet.has(m.member_type)), [rawPool, separateSet])

  // Family set. Advisors/accountants have curated family groupings; strategic
  // members are grouped by their Strategic Group (member_type) — one single-type
  // family per group, built dynamically from the pool.
  const families = useMemo(() => {
    if (isAdvisorPage) return ADVISOR_FAMILIES
    if (!isStrategic) return ACCOUNTANT_FAMILIES
    const groups = [...new Set(pool.map((m) => m.member_type).filter(Boolean))].sort()
    return groups.map((g) => ({ key: g, label: g, types: [g] }))
  }, [isAdvisorPage, isStrategic, pool])

  // Exact type -> family reverse map (rebuilt when the family set changes).
  const typeToFamily = useMemo(() => {
    const map = {}
    families.forEach((f) => f.types.forEach((t) => { map[t] = f.key }))
    return map
  }, [families])

  // Headline status counts — always computed off the FULL pool so the lens
  // stays stable regardless of which lens is active.
  const statusCounts = useMemo(() => ({
    all: pool.length,
    active: pool.filter(LENS_PREDICATE.active).length,
    suspended: pool.filter(LENS_PREDICATE.suspended).length,
    paused: pool.filter(LENS_PREDICATE.paused).length,
    arrears: pool.filter(LENS_PREDICATE.arrears).length,
    lost: pool.filter(LENS_PREDICATE.lost).length,
    removed: pool.filter(LENS_PREDICATE.removed).length,
  }), [pool])

  // Everything below the hero re-scopes to the selected status.
  const scoped = useMemo(() => pool.filter(LENS_PREDICATE[lens]), [pool, lens])

  const model = useMemo(() => {
    const legacy = scoped.filter((m) => m.advisor_model === 'Legacy Model').length
    const newModel = scoped.filter((m) => m.advisor_model === 'New Model').length
    return { legacy, newModel, unknown: scoped.length - legacy - newModel }
  }, [scoped])

  // Aggregate the scoped pool into families + sub-types.
  const familyData = useMemo(() => {
    const counts = {}   // famKey -> total
    const subs = {}     // famKey -> { memberType -> count }
    scoped.forEach((m) => {
      const key = typeToFamily[m.member_type] || 'other'
      counts[key] = (counts[key] || 0) + 1
      if (!subs[key]) subs[key] = {}
      const t = m.member_type || ''
      subs[key][t] = (subs[key][t] || 0) + 1
    })
    const ordered = [...families, { key: 'other', label: 'Other', types: [] }]
    const orderIndex = {}
    ordered.forEach((f, i) => { orderIndex[f.key] = i })
    return ordered
      .filter((f) => counts[f.key] > 0)
      .map((f) => ({
        key: f.key,
        label: f.label,
        count: counts[f.key],
        sub: Object.entries(subs[f.key]).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      }))
      // Advisor/accountant: render in the curated source-array order (the manual
      // KPI layout). Strategic groups are built dynamically, so they keep the
      // count-desc ordering ("other" always sorts last there).
      .sort((a, b) => {
        if (!isStrategic) return orderIndex[a.key] - orderIndex[b.key]
        if (a.key === 'other') return 1
        if (b.key === 'other') return -1
        return b.count - a.count
      })
  }, [scoped, typeToFamily, families, isStrategic])

  const activeLens = LENSES.find((l) => l.key === lens)

  // The Suspended, Paused & Arrears sub-tab is offered on advisor + accountant pages only.
  const showStandingTab = !isStrategic
  const standingLists = useMemo(() => ({
    suspended: pool.filter(LENS_PREDICATE.suspended),
    paused: pool.filter(LENS_PREDICATE.paused),
    arrears: pool.filter(LENS_PREDICATE.arrears),
  }), [pool])

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '24px' }}>
      {showStandingTab && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <SubTabButton active={subTab === 'kpis'} onClick={() => setSubTab('kpis')}>KPIs</SubTabButton>
          <SubTabButton active={subTab === 'standing'} onClick={() => setSubTab('standing')}>
            Suspended, Paused &amp; Arrears {nounTitle}
          </SubTabButton>
        </div>
      )}

      {showStandingTab && subTab === 'standing' ? (
        <StandingView
          nounTitle={nounTitle}
          standing={standing}
          setStanding={setStanding}
          lists={standingLists}
        />
      ) : (
        <>
          <KpiHero
            title={title}
            subtitle={`${statusCounts.all} ${noun} total · ${scoped.length} in view`}
            lenses={LENSES}
            counts={statusCounts}
            lens={lens}
            setLens={setLens}
            unitLabel="members"
          />

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Left — the primary breakdown: large and wide. */}
            <div style={{ flex: '3 1 560px', minWidth: '300px' }}>
              <BreakdownCard
                title={breakdownLabel}
                count={scoped.length}
                activeLens={lens !== 'all' ? activeLens : null}
                onClearLens={() => setLens('all')}
              >
                {familyData.length === 0 ? (
                  <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '14px' }}>
                    No {noun} match the <strong>{activeLens.label}</strong> status.
                  </div>
                ) : (
                  <BreakdownRows rows={familyData} denom={scoped.length} />
                )}
              </BreakdownCard>
            </div>

            {/* Right — Legacy vs New Model (narrower, taller) with the separate
                VFO Reconciliation / Team Member bucket as a smaller card below. */}
            {!isStrategic && (
              <div style={{ flex: '1 1 240px', minWidth: '230px', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <SplitDonut
                  stack
                  title="Legacy vs New Model"
                  total={scoped.length}
                  segments={[
                    { label: 'New Model', n: model.newModel, color: '#0a85e8' },
                    { label: 'Legacy Model', n: model.legacy, color: '#8a9bbd' },
                    ...(model.unknown > 0 ? [{ label: 'Unspecified', n: model.unknown, color: '#b9c6dd' }] : []),
                  ]}
                />
                {separate && separateCounts.all > 0 && (
                  <SeparateCountCard label={separate.label} counts={separateCounts} />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Sub-tab pill button (KPIs / Suspended & Paused).
function SubTabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap',
        background: active ? 'var(--vfo-primary)' : 'var(--vfo-card)',
        color: active ? '#ffffff' : 'var(--vfo-muted)',
        border: `1px solid ${active ? 'var(--vfo-primary)' : 'var(--vfo-border-soft)'}`,
      }}
    >
      {children}
    </button>
  )
}

// Standalone card for the excluded bucket (VFO Reconciliation / Team Member) —
// its own count, explicitly flagged as not part of the totals above. Sits under
// the Legacy vs New Model donut and mirrors its card styling (a bit smaller).
function SeparateCountCard({ label, counts }) {
  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px dashed var(--vfo-border-chip)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '16px 22px 18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '30px', fontWeight: 800, color: 'var(--vfo-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{counts.all}</span>
        <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>{counts.active} active</span>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '10px', lineHeight: 1.45 }}>
        Shown separately — not included in the counts above.
      </div>
    </div>
  )
}

// Suspended & Paused list view: two toggle buttons pick which standing is shown,
// then a flat, read-only list of the matching members.
function StandingView({ nounTitle, standing, setStanding, lists }) {
  const rows = lists[standing]
  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {['suspended', 'paused', 'arrears'].map((k) => {
          const sel = standing === k
          return (
            <button
              key={k}
              onClick={() => setStanding(k)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '9px 18px', borderRadius: '999px',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13.5px', fontWeight: 700,
                background: sel ? STANDING[k].color : 'var(--vfo-card)',
                color: sel ? '#ffffff' : 'var(--vfo-muted)',
                border: `1px solid ${sel ? STANDING[k].color : 'var(--vfo-border-soft)'}`,
              }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: sel ? '#ffffff' : STANDING[k].color }} />
              {STANDING[k].label} {nounTitle}
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{lists[k].length}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No {STANDING[standing].label.toLowerCase()} {nounTitle.toLowerCase()}.
        </div>
      ) : (
        <div>
          {rows
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((m) => (
              <div key={m.plugin_member_number}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', marginBottom: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(20,45,95,0.04)' }}>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '70px', flexShrink: 0, fontFamily: 'monospace' }}>{m.plugin_member_number}</span>
                <span style={{ flex: 1, minWidth: '160px' }}>
                  <MemberNameLink memberNumber={m.plugin_member_number} style={{ fontSize: '14px', fontWeight: 600 }}>{m.name}</MemberNameLink>
                </span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', width: '200px', flexShrink: 0 }}>{m.member_type || '—'}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '12px', flexShrink: 0 }}>
                  {m.suspended && <span style={{ fontSize: '12px', fontWeight: 700, color: STANDING.suspended.color }}>Suspended</span>}
                  {m.paused && <span style={{ fontSize: '12px', fontWeight: 700, color: STANDING.paused.color }}>Paused</span>}
                  {m.membership_arrears && <span style={{ fontSize: '12px', fontWeight: 700, color: STANDING.arrears.color }}>In Arrears</span>}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
