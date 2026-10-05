// The specialist vault's "Showroom Documents" section (2026-10-05) — the one
// section every showroom viewer (admin, member, client, specialist portals) can
// open from the specialist's showroom card. Everything else in the vault stays
// private. publicNotice drives VaultSections' banner + confirm + the
// acknowledge_public flag the server requires on uploads and moves into it.
export const SHOWROOM_PUBLIC_NOTICE = 'Everything in this section is visible to anyone who views this specialist in the showroom (members, clients and other specialists).'

export function showroomVaultSection(hint) {
  return {
    key: 'showroom',
    title: 'Showroom Documents',
    hint: hint || 'Documents shown on the showroom card under "Vault" — e.g. licenses, case studies, sample materials.',
    publicNotice: SHOWROOM_PUBLIC_NOTICE,
  }
}
