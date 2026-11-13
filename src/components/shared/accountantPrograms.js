// The two accountant programs (programs.name). Their clients are accountants:
// an "Accountants" tab, "+ Add Accountant", and a client_ref of <member>-PFTn or
// <member>-TRAn (utils/client-ref.ts in the edge repo is the server's copy).
// Program ids differ between live and the test site, so everything keys on the name.
export const PFT_PROGRAM = 'Partnership Fast Track'
export const TAILORED_PROGRAM = 'Tailored Route for Accountants'

export function isAccountantProgram(name) {
  return name === PFT_PROGRAM || name === TAILORED_PROGRAM
}

export function isAccountantRef(ref) {
  return /-(PFT|TRA)/.test(String(ref || ''))
}

// The MSM section (feature tab) key of each accountant program.
export const ACCOUNTANT_FEATURE_TAB = {
  [PFT_PROGRAM]: 'msm_program_partnership',
  [TAILORED_PROGRAM]: 'msm_program_tailored',
}
