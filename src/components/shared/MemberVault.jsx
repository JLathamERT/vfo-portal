import VaultSections, { DEFAULT_VAULT_SECTIONS } from './VaultSections'
import { ertReadOnlySection, ertAdminSection } from './ertVaultSection'
import { getSession } from '../../lib/api'
import VaultDropLink from './VaultDropLink'

// The member vault now mirrors the client vault: Tax Documents + General
// sections, signed-URL uploads. `memberNumber` scopes every request (the member
// portal passes the session member; the admin member view passes the selected
// member's number). `admin` renders the ERT/VFOS section as manageable; the
// member portal renders it read-only.
const MEMBER_VAULT_ACTIONS = {
  list: 'vault_list',
  uploadUrl: 'vault_upload_url',
  download: 'vault_download',
  delete: 'vault_delete',
}

export default function MemberVault({ memberNumber, admin = false, recipientName, recipientFirst }) {
  const sections = [
    ...(admin
      ? DEFAULT_VAULT_SECTIONS.map(s => ({ ...s, requestDocs: { entityType: 'member', entityKey: memberNumber, recipientName, recipientFirst } }))
      : DEFAULT_VAULT_SECTIONS),
    admin ? ertAdminSection('member', memberNumber, 'member', !!getSession()?.is_ert_manager) : ertReadOnlySection(),
  ]
  // moveContext only on the ADMIN view — the member portal never gets drag.
  return (
    <>
      {admin && <VaultDropLink entityType="member" entityKey={memberNumber} />}
      <VaultSections actions={MEMBER_VAULT_ACTIONS} params={{ member_number: memberNumber }} sections={sections} moveContext={admin ? { entity: 'member', key: memberNumber } : null} />
    </>
  )
}
