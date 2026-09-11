import { useState } from 'react'
import { callApi } from '../../lib/api'

// Clickable SANDBOX / LIVE badge + confirm modal, shared by the automation panels
// that previously rendered a non-interactive badge (PIP, Advisor, Accountant).
// Flips sandbox_mode + stripe_test_mode + boldsign_test_mode together via
// save_sandbox_config for the given `pipeline` row, then reports the new config
// back through onChange so the parent's local state stays in sync.
export default function SandboxModeToggle({ pipeline, label, sandboxConfig, onChange, note }) {
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  if (!sandboxConfig) return null

  const sandbox = !!sandboxConfig.sandbox_mode
  const palette = sandbox
    ? { bg: 'rgba(251,137,90,0.15)', border: 'rgba(251,137,90,0.4)', text: '#e06717', txt: 'SANDBOX MODE' }
    : { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', txt: 'LIVE MODE' }
  const name = label || pipeline
  const switchingTo = sandbox ? 'LIVE' : 'SANDBOX'
  const goingLive = switchingTo === 'LIVE'

  // Which Stripe account NEW customers/sessions for this pipeline are minted on.
  // Read-only on purpose: pipeline_sandbox_config.stripe_account is flipped by SQL,
  // never from the UI. Rendered only when the loader actually shipped the column —
  // a loader with an explicit column list (specialist_revenue_load) and the
  // `{ sandbox_mode: false }` fallbacks a couple of panels use would otherwise
  // print a confident "VFO Services" it has no evidence for.
  const hasAccount = sandboxConfig.stripe_account !== undefined
  const accountLabel = sandboxConfig.stripe_account === 'ert' ? 'ERT' : 'VFO Services'

  async function toggle() {
    const next = !sandbox
    setSaving(true)
    setErr('')
    try {
      await callApi('save_sandbox_config', {
        pipeline,
        sandbox_mode: next,
        stripe_test_mode: next,
        boldsign_test_mode: next,
      })
      onChange?.({ ...sandboxConfig, sandbox_mode: next, stripe_test_mode: next, boldsign_test_mode: next })
      setShowModal(false)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setErr(''); setShowModal(true) }}
        title="Click to toggle"
        style={{
          padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
          background: palette.bg, color: palette.text,
          border: `1px solid ${palette.border}`, letterSpacing: '0.5px',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {palette.txt}
      </button>

      {hasAccount && (
        <span
          title="Which Stripe account new customers for this pipeline are created on. Changed by SQL, not here."
          style={{
            padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
            background: 'var(--vfo-tint)', color: 'var(--vfo-muted)',
            border: '1px solid var(--vfo-border-soft)', letterSpacing: '0.5px',
            whiteSpace: 'nowrap',
          }}
        >
          Stripe: {accountLabel}
        </span>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,60,0.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          fontFamily: '"Inter", sans-serif',
        }}>
          <div style={{
            background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '90%', boxShadow: '0 24px 64px rgba(10,25,60,0.25)',
          }}>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)', margin: '0 0 12px' }}>
              Switch {name} to {switchingTo} mode?
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
              {goingLive
                ? `This switches ${name} to LIVE Stripe + BoldSign keys. Real emails go to real clients/members/PFs and real cards are charged.`
                : `This switches ${name} back to sandbox: emails route to the sandbox address and Stripe/BoldSign use test keys.`}
            </p>
            {note && <p style={{ fontSize: '13px', color: '#e06717', fontWeight: 500, lineHeight: 1.5, margin: '0 0 16px' }}>{note}</p>}
            {err && <p style={{ fontSize: '13px', color: '#d93025', fontWeight: 500, margin: '0 0 16px' }}>{err}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--vfo-border-strong)', background: 'transparent',
                  color: 'var(--vfo-muted)', fontSize: '14px', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={toggle}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: goingLive ? '#ef4444' : '#e06717', color: '#fff', fontSize: '14px', fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : `Switch to ${switchingTo}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
