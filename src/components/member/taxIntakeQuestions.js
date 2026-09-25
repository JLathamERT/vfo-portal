// MIRROR of the backend definition in
// `supabase/functions/vfo-admin-api/utils/tax-intake-questions.ts` (vfo-edge-functions).
// The two files must move together: this side renders and pre-validates, the
// server re-validates, and both produce every message from the SAME two
// templates below so FE and BE can never disagree (#306/#314).

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

// The exact Q18 option that triggers the inline fit warning. It is a legal
// answer — the form still submits — but the member is told on the spot.
export const TAX_INTAKE_Q18_POOR_FIT =
  "Under $100k (The client is currently not a good fit for VFO Tax Planning. Please reach out to Tracy Miller if you have any questions)";

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

export const TAX_INTAKE_QUESTIONS = [
  { id: "q1", label: "Who is completing this form?", type: "derived", required: false, options: [TAX_INTAKE_Q1_ADVISOR, TAX_INTAKE_Q1_ACCOUNTANT, TAX_INTAKE_Q1_CLIENT] },
  { id: "q2", label: "Client First Name", type: "text", required: true },
  { id: "q3", label: "Client Last Name", type: "text", required: true },
  { id: "q4", label: "Client Email", type: "text", required: true },
  { id: "q5", label: "Client Phone Number", type: "text", required: true },
  { id: "q6", label: "Client State of Residence", type: "select", required: true, options: TAX_INTAKE_STATES },
  { id: "q7", label: "Associated VFO Member", type: "text", required: false, hidden: true },
  { id: "q8", label: "Introducer Email", type: "text", required: false, hidden: true },
  { id: "q9", label: "Introducer Firm Name", type: "text", required: false, hidden: true },
  { id: "q10", label: "Filing Status", type: "radio", required: true, options: ["Married Filing Jointly", "Head of Household", "Single", "Married Filing Separately"] },
  { id: "q11", label: "If married & filing jointly, spouse's name & email", type: "text", required: false },
  { id: "q12", label: "Does client have children? If so, how many?", type: "text", required: true },
  { id: "q13", label: "Accredited Investor?", type: "radio", required: true, options: ["Yes", "No", "Not Verified"], note: "Non Accredited Investors will have limited options" },
  { id: "q14", label: "Household W-2 Income", type: "money", required: true },
  { id: "q15", label: "Household Capital Gains", type: "money", required: true },
  { id: "q16", label: "Dividends/interest or other income (if applicable)", type: "money", required: true },
  { id: "q17", label: "Estimated Net-Worth", type: "radio", required: true, options: ["Under $1m", "$1m – $2.5m", "$2.5m – $5m", "$5m – $10m", "$10m – $25m", "$25m+", "Unknown"] },
  { id: "q18", label: "Federal income taxes paid last year", type: "radio", required: true, options: [TAX_INTAKE_Q18_POOR_FIT, "Combined $100K across previous three years", "$100k - $250k", "$250k - $500k", "$500k+"] },
  { id: "q19", label: "Potential events or sales creating a tax liability of $100k+ in the next three years?", type: "text", required: false },
  { id: "q20", label: "Does client own a business?", type: "radio", required: true, options: ["Yes", "No"] },
  { id: "q21", label: "Entity type", type: "radio", required: false, options: ["Sole Proprietorship (Schedule C) or Single Member LLC", "S-corp", "C-corp", "Partnership", "Multiple Entity Types", "Other"] },
  { id: "q22", label: "Estimated annual gross business revenue (all operating businesses combined)", type: "money", required: false },
  { id: "q23", label: "Estimated annual net business profit (all operating businesses combined)", type: "money", required: false },
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
    optionNotes: { [TAX_INTAKE_Q38_RAPID]: "Best for more sophisticated or time-limited clients" },
  },
];

export const TAX_INTAKE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The two message templates. Used on BOTH sides, so FE and BE messages are
// byte-identical without a hand-maintained list.
export const taxIntakeRequiredMessage = (label) => `${label} is required`;
export const taxIntakeEmailMessage = (label) => `${label} must be a valid email address`;

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
    if (q.type === "derived") continue;
    if (q.required && !q.hidden && !val) {
      errors.push(taxIntakeRequiredMessage(q.label));
      continue;
    }
    if (q.id === "q4" && val && !TAX_INTAKE_EMAIL_RE.test(val)) {
      errors.push(taxIntakeEmailMessage(q.label));
    }
  }
  return errors;
}

// The answers object as it is stored: only the 37 known keys, trimmed, money
// fields stripped of `$`. Anything else a caller sends is dropped — the jsonb
// column is never a free-form bag.
export function normalizeTaxIntakeAnswers(answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  const out = {};
  for (const q of TAX_INTAKE_QUESTIONS) {
    // A derived answer is never taken from the caller — the server assigns it.
    if (q.type === "derived") { out[q.id] = ""; continue; }
    const raw = a[q.id];
    out[q.id] = q.type === "money" ? normalizeTaxIntakeMoney(raw) : String(raw ?? "").trim();
  }
  return out;
}
