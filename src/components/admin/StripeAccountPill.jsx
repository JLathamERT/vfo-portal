// Which Stripe account NEW customers/sessions for this pipeline are minted on.
// Read-only on purpose: pipeline_sandbox_config.stripe_account is flipped by SQL,
// never from the UI. Rendered only when the loader actually shipped the column.
export default function StripeAccountPill({ sandboxConfig }) {
  if (sandboxConfig?.stripe_account === undefined) return null
  return (
    <span
      title="Which Stripe account new customers for this pipeline are created on. Changed by SQL, not here."
      style={{
        padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
        background: 'var(--vfo-tint)', color: 'var(--vfo-muted)',
        border: '1px solid var(--vfo-border-soft)', letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
      }}
    >
      Stripe: {sandboxConfig.stripe_account === 'ert' ? 'ERT' : 'VFO Services'}
    </span>
  )
}
