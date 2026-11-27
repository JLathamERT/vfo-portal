# Member Activity log (added 2026-11-27)

An admin's record of when a member signs in and the key things they do in the portal. No email, no bell, no money, no chain. Read-only for admins; written only by the member's own session.

## What an admin sees

- **Profile ▾ → Activity** on an advisor, accountant or strategic member ([MemberActivityTab.jsx](../../src/components/admin/MemberActivityTab.jsx), wired in `MembersPanel.jsx`). The Profile dropdown remembers its sub-tab across a reload.
- A `ListTable` newest first: **When** (local date and time) · **Activity** · **Detail** (the client's name, a file name, a program and phase, or a Marketplace service and its credits). A grouped edit adds "N saves, 2:05 PM to 2:31 PM" under the detail.
- A search box (activity or detail text) and an **Activity** filter (the labels present).
- An empty log reads "No activity yet. Sign-ins and portal actions show here from now on."

## What is logged

| Activity | Written when (action) | Detail |
|---|---|---|
| Logged in | `member_login` succeeds (`logMemberLogin`) | — |
| Added a client | `member_add_client`, `ciq_add_client_and_create` | client name |
| Gave a client portal access | `member_client_portal_access_send` | client name |
| Started Premium portal access for a client | `member_ciq_licence_start` (the member is sent on to pay) | client name |
| Completed a Tax Diagnostic | `tax_intake_submit` | client name |
| Sent a Tax Diagnostic to a client | `tax_intake_send_link` | client name |
| Edited the Growth Plan | `growth_plan_save_actions`, `growth_plan_add_action`, `growth_plan_delete_action`, `growth_plan_save_accountability` (members only while accountability mode is on) | — |
| Started a CIQ | `ciq_create`, `ciq_add_client_and_create` | client name |
| Edited a CIQ | `ciq_save`, `ciq_save_priorities`, `ciq_save_priority_snapshot`, `ciq_set_accountability` | client name |
| Completed a CIQ / Completed CIQ priorities | `ciq_complete` / `ciq_complete_priorities` | client name |
| Added a program note | `member_client_note_add` | client name - program - phase |
| Edited profile | `member_self_profile_save`, `member_branding_save` | — |
| Uploaded to the member vault | `vault_upload_url` (the signed URL is minted; the upload itself goes straight to Storage) | file name |
| Uploaded to a client vault | `member_client_vault_upload_url` (same) | client name - file name |
| Bought Growth Credits | read from `gc_transactions` (`type='purchased'` with a Stripe session; admin-added credits carry none) | N credits |
| Selected a Marketplace service | read from `gc_transactions` (`type='redeemed'`, `actor_role='member'`) | service (N credits) |

**Grouping.** Edited a CIQ (per CIQ), Edited the Growth Plan and Edited profile update the open row for the same thing while its last save is under 30 minutes old (`updated_at` moves, `save_count` grows) instead of adding a row per save.

**Not logged.** An admin's work on the member's records (only `callerRole === 'member'` sessions). Starting a Growth Plan: members cannot — admins build it (`growth_plan_save_four_ways` is ADMIN_ONLY). Anything a client does in the client portal.

## Backend

- [utils/member-activity.ts](../../../vfo-edge-functions/supabase/functions/vfo-admin-api/utils/member-activity.ts) — `ACTIVITY_LABELS`, the action → row map, `logMemberLogin`, `logMemberActivity`. Both run through `inBackground` (`EdgeRuntime.waitUntil` where available), never throw, and skip a reply that carries `error`. `logMemberActivity` is called from `index.ts` right after every authed handler, beside `refreshAfterAction`; it clones the response before it is returned.
- `member_activity_load` (`actions/members/activity-load.ts`) — `ADMIN_ONLY_ACTIONS` plus an in-handler `callerRole === 'admin'` check. Body `member_number`. Merges the log rows (up to 500) with the member's Stripe purchases and own Marketplace picks from `gc_transactions`, newest first, capped at 500.

## Data

`member_activity_log` — [tables/members.md](../tables/members.md). RLS deny-all; nothing but the two writers above and the loader touches it. History starts at release; only the Growth Credits rows reach back.
