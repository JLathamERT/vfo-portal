// Tidy what people type into name / email / phone boxes (2026-10-19).
//
// CROSS-REPO CONTRACT: vfo-edge-functions utils/person-format.ts holds the same three
// rules (cleanText, formatPersonName, formatPhone) - the form tidies as you type /
// leave a box, the server tidies again on save. Keep the two copies identical.

/** Trim, and collapse any run of whitespace to one space. */
export function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

const ROMAN = /^(ii|iii|iv|vi|vii|viii|ix)$/

/**
 * Fix a name typed all lower case or ALL CAPS: every word capitalised, also after a
 * hyphen, apostrophe or full stop (mary-jane o'neil -> Mary-Jane O'Neil), "Mc" keeps
 * the next letter capital (mcnulty -> McNulty), ii / iii / iv -> II / III / IV. A
 * MIXED-case name is left exactly as typed (McNulty, DeVito, van der Berg).
 */
export function formatPersonName(v) {
  const s = cleanText(v)
  if (!s) return s
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s
  return s.toLowerCase().split(/([\s\-'’.])/).map(part => {
    if (!part || /^[\s\-'’.]$/.test(part)) return part
    if (ROMAN.test(part)) return part.toUpperCase()
    if (part.length > 2 && part.startsWith('mc')) return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3)
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join('')
}

/**
 * A US number in any shape -> (234) 234-2343 (a leading 1 / +1 dropped). A number
 * starting with + and another country code, or anything that is not 10 digits (an
 * extension, two numbers, a partial), is only trimmed.
 */
export function formatPhone(v) {
  const s = cleanText(v)
  if (!s) return s
  if (/^\+\s*[02-9]/.test(s)) return s
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return s
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// One person per name box (2026-10-19): "John and Sarah", "John & Sarah", "John+Sarah"
// are refused - the second person is an additional contact.
const TWO_PEOPLE = /&|\+|\band\b/i
export const TWO_PEOPLE_MESSAGE = 'Enter one person per name. Add a spouse or partner as an additional contact.'
export const TWO_PEOPLE_CONTACT_MESSAGE = 'Enter one person per additional contact. Add each person as their own contact.'

/** True when a name box holds two people ("and", "&" or "+"). */
export function nameHasTwoPeople(v) {
  return TWO_PEOPLE.test(cleanText(v))
}

// ---- Frontend only ----

/**
 * The phone box as it is typed (PhoneInput): digits shape themselves into
 * (234) 234-2343 and stop at ten; a leading 1 / +1 is dropped; a "+" with another
 * country code is left as typed. Deleting a bracket, space or dash also deletes
 * the digit before it, so the formatting never traps the cursor.
 */
export function formatPhoneTyping(value, prev = '') {
  const s = String(value ?? '')
  const t = s.trimStart()
  if (t.startsWith('+')) {
    const first = t.slice(1).replace(/\D/g, '')[0]
    if (first === undefined) return t
    if (first !== '1') return s
  }
  let d = s.replace(/\D/g, '')
  const before = String(prev ?? '')
  if (s.length < before.length && d === before.replace(/\D/g, '')) d = d.slice(0, -1)
  if (d.startsWith('1')) d = d.slice(1)
  d = d.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** True for a US number started but not finished (1-9 digits). */
export function phoneIncomplete(v) {
  const s = cleanText(v)
  if (!s || /^\+\s*[02-9]/.test(s)) return false
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length > 0 && d.length < 10
}
