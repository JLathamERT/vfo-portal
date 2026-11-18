// MIRROR of the backend definition in
// `supabase/functions/vfo-admin-api/utils/tax-intake-questions.ts` (vfo-edge-functions).
// The two files must move together: this side renders and pre-validates, the
// server re-validates, and both produce every message from the SAME two
// templates below so FE and BE can never disagree (#306/#314).

import { formatPersonName, formatPhone, nameHasTwoPeople, TWO_PEOPLE_CONTACT_MESSAGE } from "../../lib/formatters";

// US states + DC, then Canadian provinces/territories. Q6 is a plain select.
export const TAX_INTAKE_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
  "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
  "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island",
  "Quebec", "Saskatchewan", "Yukon",
];

// The Q18 / Q40 options that trigger the inline fit warning (each question's
// `poorFitOption`). Legal answers — the form still submits — but the member is
// told on the spot. Until 2026-10-20 the warning text was part of the Q18 option
// itself; the server maps that old text to the short option.
export const TAX_INTAKE_Q18_POOR_FIT = "Under $100k";
export const TAX_INTAKE_Q40_POOR_FIT = "Under $400k";
export const TAX_INTAKE_POOR_FIT_WARNING =
  "The client is currently not a good fit for VFO Tax Planning. However, you may still want to work with individual VFO Tax Planning Specialists directly. For more information, please contact Tracy Miller or a Member Success Manager.";

// The three Q1 answers. Q1 is type "derived" (2026-09-17, unit 1b): the SERVER
// fills it — from the member's own type on the member route, "Client" on the
// emailed client-link route — so neither side renders or validates it, and a q1
// sent in the body is accepted and ignored. It stays in this list so the
// read-only Tax Planning Form card still labels the stored answer.
export const TAX_INTAKE_Q1_ADVISOR = "Advisor for Client";
export const TAX_INTAKE_Q1_ACCOUNTANT = "Accountant for Client";
export const TAX_INTAKE_Q1_CLIENT = "Client";

// Q38 (2026-09-25, Rapid Route). The FIRST option is the default the form
// pre-selects (TaxIntakeForm seeds it). Not required: a blank reads as
// Traditional everywhere. The server stamps client_tax_plans.rapid_route from it.
export const TAX_INTAKE_Q38_TRADITIONAL = "Traditional 6-Step Process";
export const TAX_INTAKE_Q38_RAPID = "Rapid Route - Step 3: Orientation Meeting replaced with customized video";

// Q41 (2026-11-18, international tax planning). Yes = the case begins with Matt
// Miller: the $500 deposit is always taken (no 2-qualifying-client waiver) and
// its $250 share goes to him instead of the tax planning group. Picking Yes shows
// the question's `alertText` in orange (`alertOption`).
export const TAX_INTAKE_Q41_YES = "Yes";
export const TAX_INTAKE_Q41_ALERT =
  "Because your situation involves international tax planning, your case will begin with Matt Miller, our VFO Specialist and International Tax Advisor. Matt will review your situation from both an international and U.S. tax perspective. If U.S. taxable income is identified, he will bring in one of our VFO Tax Planning Teams to evaluate additional planning opportunities.";

export function isInternationalTaxCase(answers) {
  return String(answers?.q41 ?? "").trim() === TAX_INTAKE_Q41_YES;
}

// FE only: shown on the member's own portal form when their deposit is normally
// waived and they answer Yes to q41.
export const TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE =
  "International tax cases always take the $500 deposit, even though your deposit is usually waived.";
// The public diagnostic page cannot know (and must not reveal) whether the named
// member's deposit is waived, so a member filling it in sees this hedged wording.
export const TAX_INTAKE_INTERNATIONAL_DEPOSIT_NOTE_PUBLIC =
  "International tax cases always take the $500 deposit, even if your deposit is usually waived.";

// Q42 (2026-11-18): the people Cc'd on every email to the client, built one Add
// click at a time (type "contact_list": first name, last name and email each), stored
// as a JSON array string.
export const TAX_INTAKE_CC_MAX = 10;

export const TAX_INTAKE_QUESTIONS = [
  { id: "q1", label: "Who is completing this form?", type: "derived", required: false, options: [TAX_INTAKE_Q1_ADVISOR, TAX_INTAKE_Q1_ACCOUNTANT, TAX_INTAKE_Q1_CLIENT] },
  { id: "q2", label: "Client First Name", type: "text", required: true, format: "name" },
  { id: "q3", label: "Client Last Name", type: "text", required: true, format: "name" },
  { id: "q4", label: "Client Email", type: "text", required: true },
  { id: "q5", label: "Client Phone Number", type: "text", required: true, format: "phone" },
  { id: "q42", label: "Is there anyone your client would like copied on all emails, as well as the client?", selfLabel: "Is there anyone you would like copied on all emails, as well as you?", type: "contact_list", required: false, note: "Enter their first name, last name and email, then press Add. Add as many people as you like." },
  { id: "q6", label: "Client State of Residence", type: "select", required: true, options: TAX_INTAKE_STATES },
  { id: "q41", label: "Is the client a U.S. individual or business with foreign income, operations, ownership, or cross-border activities?", selfLabel: "Are you a U.S. individual or business with foreign income, operations, ownership, or cross-border activities?", type: "radio", required: true, options: [TAX_INTAKE_Q41_YES, "No"], alertOption: TAX_INTAKE_Q41_YES, alertText: TAX_INTAKE_Q41_ALERT },
  { id: "q7", label: "Associated VFO Member", type: "text", required: false, hidden: true },
  { id: "q8", label: "Introducer Email", type: "text", required: false, hidden: true },
  { id: "q9", label: "Introducer Firm Name", type: "text", required: false, hidden: true },
  { id: "q10", label: "Filing Status", type: "radio", required: true, options: ["Married Filing Jointly", "Head of Household", "Single", "Married Filing Separately"] },
  { id: "q11", label: "If married & filing jointly, spouse's name & email", type: "text", required: false },
  { id: "q12", label: "Does client have children? If so, how many?", type: "text", required: true },
  { id: "q13", label: "Accredited Investor?", type: "radio", required: true, options: ["Yes", "No", "Not Verified"], note: "Non Accredited Investors will have limited options" },
  { id: "q40", label: "Household Adjusted Gross Income (AGI)", type: "radio", required: true, note: "From the client's most recent tax return (Form 1040)", options: [TAX_INTAKE_Q40_POOR_FIT, "$400k – $800k", "$800k – $1.5m", "$1.5m+"], poorFitOption: TAX_INTAKE_Q40_POOR_FIT },
  // Retired 2026-10-20 (replaced by q40): never asked, shown on a read-only card
  // only when an older form answered it.
  { id: "q14", label: "Household W-2 Income", type: "money", required: false, retired: true },
  { id: "q15", label: "Household Capital Gains", type: "money", required: true },
  { id: "q16", label: "Dividends/interest or other income (if applicable)", type: "money", required: true },
  { id: "q17", label: "Estimated Net-Worth", type: "radio", required: true, options: ["Under $1m", "$1m – $2.5m", "$2.5m – $5m", "$5m – $10m", "$10m – $25m", "$25m+", "Unknown"] },
  { id: "q18", label: "Federal income taxes paid last year", type: "radio", required: true, options: [TAX_INTAKE_Q18_POOR_FIT, "Combined $100K across previous three years", "$100k - $250k", "$250k - $500k", "$500k+"], poorFitOption: TAX_INTAKE_Q18_POOR_FIT },
  { id: "q19", label: "Potential events or sales creating a tax liability of $100k+ in the next three years?", type: "text", required: false },
  { id: "q20", label: "Does client own a business?", type: "radio", required: true, options: ["Yes", "No"] },
  { id: "q21", label: "Entity type", type: "radio", required: false, parentId: "q20", parentValue: "Yes", options: ["Sole Proprietorship (Schedule C) or Single Member LLC", "S-corp", "C-corp", "Partnership", "Multiple Entity Types", "Other"] },
  { id: "q22", label: "Estimated annual gross business revenue (all operating businesses combined)", type: "money", required: false, parentId: "q20", parentValue: "Yes" },
  { id: "q23", label: "Estimated annual net business profit (all operating businesses combined)", type: "money", required: false, parentId: "q20", parentValue: "Yes" },
  { id: "q24", label: "Roth conversion planning included if appropriate?", type: "radio", required: true, options: ["Yes", "No", "Unsure"] },
  { id: "q25", label: "Pre-tax retirement account balances (optional)", type: "money", required: false },
  { id: "q26", label: "Real estate values not including primary residence (optional)", type: "money", required: false },
  { id: "q27", label: "Brokerage balances (optional)", type: "money", required: false },
  { id: "q28", label: "Available cash or cash equivalents (optional)", type: "money", required: false },
  { id: "q29", label: "Interested in recovering federal income taxes paid in prior years?", type: "radio", required: false, options: ["Yes", "No", "Unsure"] },
  { id: "q30", label: "Client's primary focus", type: "radio", required: true, options: ["Prior Tax Years", "Future Tax Years"] },
  { id: "q31", label: "Primary tax focus relating to", type: "radio", required: true, options: ["One-time Taxable Transaction", "Continuing Taxable Planning Required"] },
  { id: "q32", label: "Professionals the client would typically run financial decisions by", type: "text", required: true },
  { id: "q33", label: "Rate that professional", type: "radio", required: true, options: ["Great", "Average", "Poor", "N/A"] },
  { id: "q34", label: "Specific tax strategies to include or exclude", type: "textarea", required: true },
  { id: "q35", label: "Tax risk mindset", type: "radio", required: true, options: ["Very Conservative", "Moderately Conservative", "Average Risk Mindset", "Moderately Aggressive", "Very Aggressive"] },
  {
    id: "q36",
    label: "Unusual income or life changes",
    type: "textarea",
    required: true,
    note: "Such as job change, large bonus, equity/RSU exercise, business windfall, property sale, inheritance, lawsuit/settlement, major charitable gift, move to a new state, marriage/divorce, new dependents.",
  },
  { id: "q37", label: "One time or large transaction details", type: "textarea", required: false, note: "If applicable, please include any details on a one time or large transaction in the current year, including what's being sold or monetized, the expected proceeds, the cost basis, and the timing." },
  {
    id: "q38",
    label: "Client would prefer",
    type: "radio",
    required: false,
    options: [TAX_INTAKE_Q38_TRADITIONAL, TAX_INTAKE_Q38_RAPID],
    optionNotes: { [TAX_INTAKE_Q38_RAPID]: "Appropriate for more sophisticated or time-limited clients" },
  },
  {
    id: "q39",
    label: "On a personal level, is there anything else important that isn't captured in the sections above that would help us know the client better?",
    selfLabel: "On a personal level, is there anything else important that isn't captured in the sections above that would help us know you better?",
    type: "textarea",
    required: false,
  },
];

// A follow-up question (parentId) is asked only while its parent holds
// parentValue — q21-q23 exist only for a client who owns a business (q20 Yes).
// A hidden follow-up is never required and is stored blank.
export function taxIntakeQuestionShown(q, answers) {
  if (!q.parentId) return true
  return String(answers?.[q.parentId] ?? "").trim() === q.parentValue
}

// Display numbers for a rendered list: a follow-up takes its parent's number
// plus a letter (17a, 17b, 17c) and does not advance the count, so every
// question after it keeps counting from the parent. `keepAnswered` also keeps a
// hidden follow-up that still holds a stored answer (read-only views), and a
// retired question only when an older form answered it.
export function numberTaxIntakeQuestions(questions, answers, offset = 0, keepAnswered = false) {
  const byId = Object.fromEntries(TAX_INTAKE_QUESTIONS.map(q => [q.id, q]))
  const out = []
  let n = offset
  let letter = 0
  for (const listed of questions) {
    const def = byId[listed.id] || listed
    if (def.retired && !(keepAnswered && String(answers?.[def.id] ?? "").trim() !== "")) continue
    if (def.parentId) {
      const kept = taxIntakeQuestionShown(def, answers) || (keepAnswered && String(answers?.[def.id] ?? "").trim() !== "")
      if (!kept) continue
      letter += 1
      out.push({ q: listed, num: `${n}${String.fromCharCode(96 + letter)}` })
      continue
    }
    n += 1
    letter = 0
    out.push({ q: listed, num: String(n) })
  }
  return out
}

// Editing a submitted form (tax_intake_edit, 2026-10-26): who completed it, the
// client's name / email / phone / state and the member + introducer fields are
// never edited; every other live question is. Mirrored from the server file,
// which refuses the same list.
// q41 / q42 (2026-11-18) are locked too: q41 decided the deposit and where its
// share goes, and q42's people are client contacts once the case exists.
export const TAX_INTAKE_EDIT_LOCKED = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q41", "q42"];

export function taxIntakeQuestionEditable(q) {
  return q.type !== "derived" && !q.hidden && !q.retired && !TAX_INTAKE_EDIT_LOCKED.includes(q.id);
}

// FE only (2026-10-26): a money box shows commas as it is typed — digits and
// one decimal point kept, "1200000" -> "1,200,000". The server strips the
// commas again (normalizeTaxIntakeMoney), so the stored answer is unchanged.
export function formatTaxIntakeMoneyInput(v) {
  const s = String(v ?? "").replace(/[^\d.]/g, "")
  const dot = s.indexOf(".")
  const whole = (dot === -1 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, "")
  const cents = dot === -1 ? "" : "." + s.slice(dot + 1).replace(/\./g, "").slice(0, 2)
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + cents
}

export const TAX_INTAKE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The two message templates. Used on BOTH sides, so FE and BE messages are
// byte-identical without a hand-maintained list.
export const taxIntakeRequiredMessage = (label) => `${label} is required`;
export const taxIntakeEmailMessage = (label) => `${label} must be a valid email address`;
// q42's messages, the same on both sides. The two-people one is the add-client
// contact form's own (src/lib/formatters.js).
export const TAX_INTAKE_CONTACT_NAME_MESSAGE = "Each person copied on emails needs a first and last name";
export const TAX_INTAKE_CONTACT_EMAIL_MESSAGE = "Each person copied on emails needs an email address";
export const taxIntakeContactBadEmailMessage = (email) => `"${email}" is not a valid email address`;
export const TAX_INTAKE_CONTACT_MAX_MESSAGE = `At most ${TAX_INTAKE_CC_MAX} people can be copied on emails`;

// A contact_list answer (q42) back into its people: names tidied exactly as the
// client's own (formatPersonName), emails trimmed and lower-cased, de-duplicated
// by email, order kept. Takes the stored JSON string or an array.
export function parseTaxIntakeContactList(v) {
  let items = [];
  if (Array.isArray(v)) items = v;
  else {
    const s = String(v ?? "").trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) items = parsed;
      } catch { items = []; }
    }
  }
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const o = it && typeof it === "object" ? it : {};
    const c = {
      first_name: formatPersonName(o.first_name),
      last_name: formatPersonName(o.last_name),
      email: String(o.email ?? "").trim().toLowerCase(),
    };
    if (!c.first_name && !c.last_name && !c.email) continue;
    const key = c.email || `${c.first_name} ${c.last_name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// What is wrong with one person, or null. The add-client contact form's rules,
// plus the email, which a Cc cannot do without.
export function taxIntakeContactProblem(c) {
  if (!c.first_name || !c.last_name) return TAX_INTAKE_CONTACT_NAME_MESSAGE;
  if (nameHasTwoPeople(c.first_name) || nameHasTwoPeople(c.last_name)) return TWO_PEOPLE_CONTACT_MESSAGE;
  if (!c.email) return TAX_INTAKE_CONTACT_EMAIL_MESSAGE;
  if (!TAX_INTAKE_EMAIL_RE.test(c.email)) return taxIntakeContactBadEmailMessage(c.email);
  return null;
}

// The read-only views (cards): "Mary Smith (mary@x.com), John Doe (john@x.com)".
export function formatTaxIntakeContactList(v) {
  return parseTaxIntakeContactList(v)
    .map((c) => `${`${c.first_name} ${c.last_name}`.trim()}${c.email ? ` (${c.email})` : ""}`)
    .join(", ");
}

// Strips the money-input decoration a member may type ("$1,200" -> "1200") so a
// money answer is stored as the digits the admin card reads back.
export function normalizeTaxIntakeMoney(v) {
  return String(v ?? "").replace(/[$,\s]/g, "").trim();
}

// Returns every validation message for these answers, in question order. Empty
// array = valid. Hidden questions are never required (they are session-filled).
export function validateTaxIntakeAnswers(answers) {
  const errors = [];
  const a = answers && typeof answers === "object" ? answers : {};
  for (const q of TAX_INTAKE_QUESTIONS) {
    const raw = a[q.id];
    const val = String(raw ?? "").trim();
    if (q.type === "derived" || q.retired) continue;
    if (!taxIntakeQuestionShown(q, a)) continue;
    if (q.required && !q.hidden && !val) {
      errors.push(taxIntakeRequiredMessage(q.label));
      continue;
    }
    if (q.id === "q4" && val && !TAX_INTAKE_EMAIL_RE.test(val)) {
      errors.push(taxIntakeEmailMessage(q.label));
    }
    if (q.type === "contact_list") {
      const list = parseTaxIntakeContactList(raw);
      const problem = list.map(taxIntakeContactProblem).find((p) => p);
      if (problem) errors.push(problem);
      else if (list.length > TAX_INTAKE_CC_MAX) errors.push(TAX_INTAKE_CONTACT_MAX_MESSAGE);
    }
  }
  return errors;
}

// The answers object as it is stored: only the known question keys, trimmed, money
// fields stripped of `$`. Anything else a caller sends is dropped — the jsonb
// column is never a free-form bag.
export function normalizeTaxIntakeAnswers(answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  const out = {};
  for (const q of TAX_INTAKE_QUESTIONS) {
    // A derived answer is never taken from the caller — the server assigns it.
    if (q.type === "derived" || q.retired) { out[q.id] = ""; continue; }
    if (!taxIntakeQuestionShown(q, a)) { out[q.id] = ""; continue; }
    const raw = a[q.id];
    if (q.type === "contact_list") {
      // Only complete, valid people; never the client's own address.
      const own = String(a.q4 ?? "").trim().toLowerCase();
      const list = parseTaxIntakeContactList(raw)
        .filter((c) => c.email !== own && !taxIntakeContactProblem(c))
        .slice(0, TAX_INTAKE_CC_MAX);
      out[q.id] = list.length ? JSON.stringify(list) : "";
      continue;
    }
    // format: "name" / "phone" answers tidied as the server does (src/lib/formatters.js).
    out[q.id] = q.type === "money" ? normalizeTaxIntakeMoney(raw)
      : q.format === "name" ? formatPersonName(raw)
      : q.format === "phone" ? formatPhone(raw)
      : String(raw ?? "").trim();
  }
  return out;
}
