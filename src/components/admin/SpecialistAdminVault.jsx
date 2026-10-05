import VaultSections from '../shared/VaultSections'
import { ertAdminSection } from '../shared/ertVaultSection'
import { getSession } from '../../lib/api'
import VaultDropLink from '../shared/VaultDropLink'
import { showroomVaultSection } from '../shared/showroomVaultSection'

// Admin view of a specialist's vault (both sections), shown on the Vault tab of
// the Search Specialists detail. Same layout as every other vault; admins can
// view, add, and remove documents in either section.
const SPECIALIST_ADMIN_VAULT_ACTIONS = {
  list: 'specialist_vault_admin_list',
  uploadUrl: 'specialist_vault_admin_upload_url',
  download: 'specialist_vault_admin_download',
  delete: 'specialist_vault_admin_delete',
}

const SPECIALIST_ADMIN_SECTIONS = [
  { key: 'sensitive', title: 'Tax Documents', hint: 'Tax / confidential documents in this specialist’s vault.' },
  { key: 'general', title: 'General Documentation', hint: 'Documents in this specialist’s portal vault (Due Diligence files + anything they’ve added). You can add or remove documents here.' },
]

export default function SpecialistAdminVault({ expertId, recipientName, recipientFirst }) {
  if (!expertId) return null
  const sections = [
    ...SPECIALIST_ADMIN_SECTIONS.map(s => ({ ...s, requestDocs: { entityType: 'specialist', entityKey: expertId, recipientName, recipientFirst } })),
    // No Request-documentation card here: an outside upload must never land in the public section.
    showroomVaultSection(),
    ertAdminSection('specialist', expertId, 'specialist', !!getSession()?.is_ert_manager),
  ]
  return (
    <>
      <VaultDropLink entityType="specialist" entityKey={expertId} />
      <VaultSections actions={SPECIALIST_ADMIN_VAULT_ACTIONS} params={{ expert_id: expertId }} sections={sections} moveContext={{ entity: 'specialist', key: expertId }} />
    </>
  )
}
