// Display-only names for tax phases and steps whose STORED names are still
// matched exactly by code in both repos (program_client_phases.name,
// program_client_tasks.name). The ROI Meeting became the TPOM (Tax Plan
// Orientation Meeting) on 2026-10-01; the stored names stay, only what is shown
// changes. Never compare against these values — compare against the key.
export const TAX_DISPLAY_NAMES = {
  'Tax 3 - ROI Meeting': 'Tax 3 - TPOM',
  'ROI Meeting booked - Send Confirmation Email': 'TPOM booked - Send Confirmation Email',
  'ROI Presentation': 'TPOM Presentation',
}

export const taxDisplayName = (name) => TAX_DISPLAY_NAMES[name] || name
