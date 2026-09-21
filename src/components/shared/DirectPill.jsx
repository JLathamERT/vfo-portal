// The one "Direct" marker (client_tax_plans.tax_route = 'direct': the member
// runs the case and is its Planning Facilitator). Rendered on the member and
// admin client lists, Client Overview and the tax plan hero, so it must look
// the same everywhere: orange, so it never reads as a status or a program.
export default function DirectPill({ size = 'md', style = {} }) {
  const sm = size === 'sm'
  return (
    <span title="Direct: the member runs this case and is the Planning Facilitator"
      style={{ display: 'inline-block', fontSize: sm ? '10px' : '10.5px', fontWeight: 700, letterSpacing: '0.3px', lineHeight: sm ? '16px' : '18px', padding: sm ? '0 8px' : '0 9px', borderRadius: '999px', whiteSpace: 'nowrap', background: 'rgba(224,103,23,0.12)', color: '#e06717', border: '1px solid rgba(224,103,23,0.28)', ...style }}>
      Direct
    </span>
  )
}
