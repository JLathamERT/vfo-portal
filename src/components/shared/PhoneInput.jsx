import { formatPhoneTyping } from '../../lib/formatters'

// Every phone box in the portal (2026-10-19): shapes the digits into (234) 234-2343
// as they are typed (src/lib/formatters.js). Drop-in for <input value onChange>;
// onChange receives the formatted string, not an event.
export default function PhoneInput({ value, onChange, style, placeholder = '(555) 555-5555', ...rest }) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value || ''}
      placeholder={placeholder}
      onChange={e => onChange(formatPhoneTyping(e.target.value, value || ''))}
      style={style}
      {...rest}
    />
  )
}
