import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrackHero, HeroAvatar } from '../shared/TrackKit'
import { formatDate } from '../../lib/dates'
import { onboardingTypeLabel } from './onboardingOrder'

// The Advisor / Accountant Onboarding record header (2026-11-19), in the client
// page's style: initials avatar, name, one dot-separated detail line, and a Tier 1
// record's fee note on its own orange line. Under it, a second card in MAP 1's
// style: the onboarding's progress over its stages and the step bar.
export default function OnboardingHero({ ob, pipeline, feeNote, steps, action }) {
  const navigate = useNavigate()
  const name = `${ob.first_name || ''} ${ob.last_name || ''}`.trim()
  const type = onboardingTypeLabel(ob, pipeline)
  const sep = <span style={{ color: 'var(--vfo-border-mid)' }}>·</span>
  const parts = [
    ob.member_number && (
      <span key="num" title="Open member profile" onClick={() => navigate(`/admin?member=${encodeURIComponent(ob.member_number)}&_n=${Date.now()}`)}
        style={{ fontFamily: 'monospace', color: '#0095ff', cursor: 'pointer' }}>{ob.member_number}</span>
    ),
    <span key="email">{ob.email || 'No email'}</span>,
    <span key="started">Started {formatDate(ob.created_at) || '—'}</span>,
  ].filter(Boolean)

  const stagesDone = (steps || []).filter(s => s.state === 'done').length
  return (
    <>
      <TrackHero
        eyebrow={pipeline === 'advisor' ? 'Advisors' : 'Accountants'}
        title={name}
        avatar={<HeroAvatar src={null} name={name} />}
        meta={
          <>
            {parts.map((p, i) => <Fragment key={i}>{i > 0 && sep}{p}</Fragment>)}
            {feeNote && <span style={{ flexBasis: '100%', fontSize: '12.5px', fontWeight: 600, color: '#e06717' }}>{feeNote}</span>}
          </>
        }
        action={action}
      />
      {/* The process card, as MAP 1's: progress over the stages + the step bar. */}
      {steps && steps.length > 0 && (
        <TrackHero
          eyebrow={type || (pipeline === 'advisor' ? 'Advisor' : 'Accountant')}
          title={pipeline === 'advisor' ? 'Advisor Onboarding' : 'Accountant Onboarding'}
          completed={stagesDone}
          total={steps.length}
          unitLabel="stages completed"
          steps={steps}
        />
      )}
    </>
  )
}
