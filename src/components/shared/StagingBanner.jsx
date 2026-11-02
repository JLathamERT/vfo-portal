// The TEST banner on every page of the staging build (docs/plans/staging/README.md).
// main.jsx mounts it only when IS_STAGING, so the live build never contains it, and
// it has no off switch. It never takes a click: a thin orange line across the top
// plus a label in the bottom-left corner, so no header, button or phone layout is
// covered.
export default function StagingBanner() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'none', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#ea580c' }} />
      <div style={{ position: 'absolute', left: '10px', bottom: '10px', background: '#fff7ed', color: '#7c2d12', border: '2px solid #ea580c', borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', boxShadow: '0 4px 14px rgba(124,45,18,0.25)', whiteSpace: 'nowrap' }}>
        Test Site · Test Data · Stripe Test Mode
      </div>
    </div>
  )
}
