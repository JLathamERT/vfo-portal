import { answerBox } from '../../shared/TrackKit'
// The onboarding list's Phase on the PFT and Tailored Route client pages
// (pft_load_engagement sends stage_label + phase_tone, worked out by the backend's
// accountantOnboardingPhase). Same dots and colours as OnboardingListTable:
// Complete green with the member number, Ready to Create blue, Stopped red; an
// in-progress phase keeps the light blue chip.
const DOT_TONES = {
  complete: { dot: '#1b9254', text: 'var(--vfo-success-text)' },
  ready: { dot: '#125ecc', text: '#125ecc' },
  stopped: { dot: '#b23c30', text: '#b23c30' },
}

export default function OnboardingPhaseChip({ onboarding }) {
  const tone = DOT_TONES[onboarding.phase_tone]
  const label = onboarding.phase_tone === 'complete' && onboarding.member_number
    ? `Complete · #${onboarding.member_number}`
    : onboarding.stage_label
  if (!tone) {
    return <span style={answerBox('#0095ff')}>{label}</span>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: tone.text, fontWeight: 600 }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}
