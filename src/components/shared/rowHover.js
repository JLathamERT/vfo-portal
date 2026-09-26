// Clickable table rows (Client Overview / Member Overview): a soft lift on hover
// so the whole row reads as one target. Spread onto the row element; the row
// needs its own onClick and `cursor: 'pointer'`. Controls inside the row
// (links, selects, buttons) must stopPropagation so they keep their own click.
export const clickableRowStyle = { cursor: 'pointer', position: 'relative', transition: 'box-shadow 120ms ease, background 120ms ease' }

export const rowHoverProps = {
  onMouseEnter: e => {
    e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,45,95,0.13)'
    e.currentTarget.style.zIndex = '1'
  },
  onMouseLeave: e => {
    e.currentTarget.style.boxShadow = 'none'
    e.currentTarget.style.zIndex = ''
  },
}
