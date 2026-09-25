// Display-only names for tax phases and steps whose STORED names are still
// matched exactly by code in both repos (program_client_phases.name,
// program_client_tasks.name). The ROI Meeting became the TPOM (Tax Plan
// Orientation Meeting) on 2026-10-01; the stored names stay, only what is shown
// changes. Never compare against these values — compare against the key.
export const TAX_DISPLAY_NAMES = {
  'Tax 3 - ROI Meeting': 'Tax 3 - TPOM',
  'ROI Meeting booked - Send Confirmation Email': 'TPOM booked - Send Confirmation Email',
  'ROI Presentation': 'TPOM Presentation',
  // 2026-09-25 (DIRECT unit 3b): named to pair with the "Generate detailed tax
  // plan presentation" row the book-ends added in Tax 4.
  'Generate and download presentation': 'Generate TPOM Presentation',
  // 2026-09-25: both amend steps read "Amend fee" (Tax 4's stored name already
  // is). The Tax 5b stored name stays a lookup key in both repos
  // (AMEND_IMPLEMENTATION_FEE_TASK_NAME, save-task.ts, tax-decision1.ts).
  'Amend implementation fee': 'Amend fee',
}

export const taxDisplayName = (name) => TAX_DISPLAY_NAMES[name] || name
