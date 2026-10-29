// Confirm stage for public token decision pages. These links are opened by
// corporate email scanners, so nothing is submitted until the client clicks.
export default function DecisionConfirmCard({ title, message, buttonLabel, buttonColor, onConfirm }) {
  return (
    <div style={cardStyle}>
      <div className="vfo-statusicon" style={{ ...iconCircleStyle, background: buttonColor + '20' }}>
        <span style={{ fontSize: '32px', lineHeight: 1, fontWeight: 700, color: buttonColor }}>?</span>
      </div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={messageStyle}>{message}</p>
      <p style={footerStyle}>Your response has not been recorded yet. If you did not mean to open this link, you can simply close this page and nothing will be submitted.</p>
      <button type="button" className="vfo-tokenbtn" onClick={onConfirm} style={{ ...buttonStyle, background: buttonColor }}>{buttonLabel}</button>
    </div>
  )
}

const cardStyle = { textAlign: 'center', padding: '12px 0' }
const iconCircleStyle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const titleStyle = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const messageStyle = { fontSize: '15px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const footerStyle = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.6, marginTop: '16px' }
const buttonStyle = { marginTop: '24px', border: 'none', borderRadius: '8px', padding: '12px 28px', color: '#fff', fontWeight: 600, fontSize: '15px', fontFamily: 'inherit', cursor: 'pointer' }
