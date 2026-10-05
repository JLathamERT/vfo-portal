import VaultSections, { DEFAULT_VAULT_SECTIONS } from '../shared/VaultSections'
import { ertReadOnlySection } from '../shared/ertVaultSection'
import { showroomVaultSection } from '../shared/showroomVaultSection'

// The specialist vault now mirrors the client vault: a General section (which
// also holds the Due Diligence files copied in on go-live) plus a Tax Documents
// section the specialist can add to after logging in, and a read-only ERT/VFOS
// Documentation section their VFO team manages. Showroom Documents (2026-10-05)
// is the one section other people can see — from this specialist's showroom card.
const SPECIALIST_VAULT_ACTIONS = {
  list: 'specialist_vault_list',
  uploadUrl: 'specialist_vault_upload_url',
  download: 'specialist_vault_download',
  delete: 'specialist_vault_delete',
}

export default function SpecialistVault() {
  return <VaultSections actions={SPECIALIST_VAULT_ACTIONS} sections={[...DEFAULT_VAULT_SECTIONS, showroomVaultSection('Documents anyone can open from your showroom card under "Vault" — e.g. licenses, case studies, sample materials.'), ertReadOnlySection()]} />
}
