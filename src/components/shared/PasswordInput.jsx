import { forwardRef, useEffect, useRef, useState } from 'react'

// A passcode box: hidden as dots by default, with an eye button that shows what is
// typed and hides it again. Takes every <input> prop; `style` styles the box itself.
// Submitting the form hides it again, so the browser's password manager still sees
// a password field.
const PasswordInput = forwardRef(function PasswordInput({ style, ...props }, ref) {
  const [shown, setShown] = useState(false)
  const inputRef = useRef(null)

  function setRefs(el) {
    inputRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return
    const hide = () => setShown(false)
    form.addEventListener('submit', hide)
    return () => form.removeEventListener('submit', hide)
  }, [])

  // Swapping the input's type drops the caret to the start in some browsers.
  function toggle() {
    const el = inputRef.current
    const start = el?.selectionStart
    const end = el?.selectionEnd
    setShown(s => !s)
    requestAnimationFrame(() => {
      if (el && document.activeElement === el && start != null) el.setSelectionRange(start, end)
    })
  }

  const label = shown ? 'Hide passcode' : 'Show passcode'
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input ref={setRefs} {...props} type={shown ? 'text' : 'password'} className="vfo-password" style={{ ...style, width: '100%', boxSizing: 'border-box', paddingRight: '44px' }} />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={toggle}
        aria-label={label}
        aria-pressed={shown}
        title={label}
        style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: '42px', padding: 0, border: 'none', background: 'none', color: 'var(--vfo-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {shown ? (
            <>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M6.06 6.06A18.45 18.45 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.94-2.06" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  )
})

export default PasswordInput
