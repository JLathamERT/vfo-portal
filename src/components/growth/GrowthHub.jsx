import { TrackHero } from '../shared/TrackKit'
import { HubGrid, HubCard, HubBanner } from '../shared/HubKit'
import { getGrowthConfig } from './constants'
import { formatDate } from '../../lib/dates'

// Growth Plan hub — the CIQ-style "chooser" landing shown once a plan exists.
// A polished completed banner plus a grid of boxes that jump to each step. This
// is the intentional home base the sub-views return to via the menu bar.
export default function GrowthHub({ memberName, bundle, onNavigate, variant }) {
  const cfg = getGrowthConfig(variant)
  const score = bundle.score
  const fw = bundle.four_ways || null
  const composite = score?.composite_score
  const assignedName = fw?.assigned_admin_name || fw?.assigned_admin_email || score?.assigned_admin_name || ''
  const memberTypeLabel = (cfg.memberTypeOptions.find(o => o.value === fw?.member_type) || {}).label || ''
  // Everything past Get Started is locked until an MSM is assigned.
  const hasMsm = !!(fw?.assigned_admin_email || score?.assigned_admin_email)

  const boxes = [
    { key: 'gp_start', title: 'Get Started', sub: 'Assign the MSM for this plan', accent: '#002973', status: assignedName ? `MSM: ${assignedName}` : 'MSM not set' },
    { key: 'gp_fourways', title: '4 Ways to Grow a Business', sub: 'Big-picture growth focus', accent: '#125ecc', status: memberTypeLabel || null },
    { key: 'gp_score', title: 'Scoring Growth', sub: 'View or update the growth score', accent: '#0a85e8', status: composite != null ? `Score ${composite}` : 'Not scored yet' },
    { key: 'gp_prioritize', title: 'Prioritize Growth Actions', sub: 'Prioritize identified actions', accent: '#e06717', status: null },
    { key: 'gp_onepage', title: 'One Page Growth Plan', sub: 'View the planning summary', accent: '#1b9254', status: score ? 'Ready' : null },
    { key: 'gp_history', title: 'Growth History', sub: 'Previous versions & changes', accent: '#5a6b85', status: null },
  ]

  return (
    <div>
      <TrackHero eyebrow="Growth Plan" title={memberName ? `${memberName} — Growth Plan` : 'Growth Plan'} />

      {score ? (
        <HubBanner complete title="Growth Plan scored" meta={<>Completed {formatDate(score.completed_at || score.created_at)}{composite != null && <> · Overall score <strong style={{ color: 'var(--vfo-ink-2)' }}>{composite}</strong></>}</>} />
      ) : (
        <HubBanner complete={false} title="Not yet scored" meta={<>Begin with <strong style={{ color: 'var(--vfo-ink-2)' }}>Get Started</strong> to assign an MSM, then work through to Scoring Growth.</>} />
      )}

      <HubGrid>
        {boxes.map(b => {
          const locked = b.key !== 'gp_start' && !hasMsm
          return <HubCard key={b.key} title={b.title} sub={locked ? 'Assign an MSM on Get Started first' : b.sub} accent={b.accent} status={locked ? null : b.status} onClick={() => onNavigate(b.key)} disabled={locked} />
        })}
      </HubGrid>
    </div>
  )
}
