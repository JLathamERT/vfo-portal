# Tables

Public-schema tables in Supabase project `ejpsprsmhpufwogbmxjv` (VFO Showroom), indexed by group below. **The "52" this line used to assert is stale and was not re-counted at the 2026-07-31 audit** — many sessions have added tables since (most recently `member_connections`); **verify the real count with MCP `list_tables`, never from this line.**

Read-only schema mapping — column lists, types, defaults, FKs, and which actions/files touch each table. No commentary about whether the design is "good," only about what exists.

## Index

| Doc | Tables | One-liner |
|---|---|---|
| [auth.md](auth.md) | `admin_sessions`, `allowed_admins`, `member_logins`, `client_logins`, `specialist_logins`, `login_attempts` | Session tokens + login credentials for all four portals + the login brute-force throttle ledger |
| [members.md](members.md) | `members`, `member_connections`, `member_plugin_settings`, `member_type_history`, `member_contacts`, `member_exclusions` | The advisor/accountant member roster + the mutual member-connection pairs (2026-07-31) + per-member website widget config |
| [clients.md](clients.md) | `clients`, `client_contacts`, `client_notes`, `client_enrollments`, `client_progress`, `client_priority_tracks`, `priority_progress` | The advisor's clients (downstream of members) + program/priority progress |
| [ciq.md](ciq.md) | `client_ciqs`, `ciq_answers`, `ciq_priorities`, `ciq_priority_snapshots`, `ciq_assignments` | Client Intake Questionnaire data + ranked priority decisions + snapshots |
| [tax.md](tax.md) | `client_tax_plans`, `client_tax_progress`, `client_tax_specialists`, `client_tax_fee_amendments` | Tax engagement plan + per-specialist progress |
| [programs.md](programs.md) | `programs`, `program_client_phases`, `program_client_tasks`, `program_training_phases`, `program_training_tasks`, `member_program_enabled`, `member_program_notes`, `member_enrollments`, `member_training_progress`, `member_meetings`, `portal_feature_flags` | Program template (phases/tasks) + per-enrollment progress + the portal feature-flag release switches (2026-09-18) |
| [specialists.md](specialists.md) | `experts`, `vfo_ecosystem_assignments`, `specialist_onboarding`, `specialist_onboarding_meetings`, `specialist_onboarding_progress`, `specialist_onboarding_votes`, `specialist_bg_requests` | Specialist roster, ecosystem tags, onboarding workflow, admin-sent background-check payment requests |
| [coaching.md](coaching.md) | `coaching_meetings`, `coaching_renewals` | Member-coaching meetings and renewal log |
| [marketplace-gc.md](marketplace-gc.md) | `gc_balances`, `gc_redemptions`, `gc_services`, `gc_transactions` | "Gift credit" marketplace — credits balance, services catalog, ledger |
| [pipeline.md](pipeline.md) | `pipelines`, `pipeline_map1`, `advisor_onboarding` / `accountant_onboarding` (the 2026-09-04 meeting + deposit + balance column families only), `pipeline_sandbox_config`, `card_update_tokens`, `vault_upload_tokens` | The automation pipeline registry + the **central MAP1 row** (`pipeline_map1`) driving the contract/payment chain + the Phase D admin card-update token + (2026-07-30) the durable vault "Request documentation" upload token. **NOTE:** `advisor_onboarding` / `accountant_onboarding` have **no column-by-column table doc** — despite the long-standing claim on this line, `pipeline.md` never documented them. Their columns are described per-handler in [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md) (the Advisor / Accountant onboarding sections) and in the gotcha registry. Newest advisor columns: `implementation_value_vfo_ft` / `implementation_value_pft` / `implementation_value_at` (migration `20260730100000`, gotcha #307), and — on **both** tables — `status` (`'active'` \| `'stopped'`, NOT NULL DEFAULT `'active'`; migration `20260826181000_advisor_accountant_onboarding_status.sql`, see [../flows/partnership-fast-track.md](../flows/partnership-fast-track.md)). |
| [documents.md](documents.md) | `agreement_templates`, `email_templates`, `document_numbers` | BoldSign agreement templates, automation email copy, sequential invoice/receipt numbers |
| [notifications.md](notifications.md) | `notifications` | In-portal notification feed |
| [faq.md](faq.md) | `faq_items` | Member Help button content — question + answer / Wistia video, admin-ordered (2026-09-14) |

## Conventions used in column tables

- `pk` — primary key
- `fk → table.col` — foreign key (delete rule shown when not the default)
- `not null` — explicit `NOT NULL`; columns marked nullable have no `not null` annotation
- `default ...` — column default
- "Status field" — value drives state-machine transitions in the application
- "Automation field" — read or written by an `automation_*` action

## CHECK constraints (whole DB)

Six non-null CHECK constraints exist (the first three verified against `pg_catalog`; the next two added by migration `20260730120000_vault_request_docs.sql` and the last by `20260731130000_member_connections.sql`, neither re-verified against the catalog at their audits):

- `ciq_priorities.decision IN ('drop', 'park', 'prioritize')`
- `client_ciqs.status IN ('draft', 'completed')`
- `card_update_tokens.person_type IN ('client', 'member', 'specialist')` (Phase D)
- `vault_upload_tokens.entity_type IN ('client', 'member', 'specialist')` (2026-07-30 — **widen this together with `resolveVaultPerson` and `VAULT_REQUEST_BUCKETS`**, gotcha #310)
- `vault_upload_tokens.section IN ('sensitive', 'general')` (2026-07-30 — the ERT/VFOS third vault section is deliberately not addressable, #204)
- `member_connections.member_a < member_b` (`member_connections_ordered`, 2026-07-31 — the canonical-pair guarantee; **every writer must sort the two member numbers first**, #312)

Every other status/decision column is **convention-only** — values like `'Yes'/'No'`, `'pending'/'live'/'paid'`, etc. are not constrained at the DB level; the admin-api enforces them.

## FK delete-rule summary

- Most FKs are `ON DELETE CASCADE` from a parent (client/member/onboarding/ciq/enrollment) — deleting a parent removes all dependent rows.
- `clients.enrollment_id → member_enrollments.id` is `SET NULL`.
- `client_tax_progress.tax_specialist_id` is `SET NULL`.
- `members.connected_member_number → members.member_number` is `SET NULL` (legacy corporate-parent pointer since 2026-07-31, #312).
- `members.introduced_by_member_number → members.member_number` is `SET NULL` (2026-07-31) — deleting an introducer un-introduces their members rather than deleting them.
- `member_connections.member_a` / `member_b → members.member_number` are both `ON DELETE CASCADE` (2026-07-31) — deleting a member drops every pair naming them, on either side.
- `client_progress.task_id`, `client_tax_progress.task_id`, `priority_progress.task_id`, `member_training_progress.task_id`, `program_*_tasks.phase_id`, `program_*_phases.program_id`, `member_enrollments.program_id`, `member_program_enabled.program_id`, `gc_redemptions.service_id` are all `NO ACTION` (deleting a parent task/phase/program/service errors).
- `pipeline_map1.client_id → clients.id` is `NO ACTION` — deleting a client will fail if a pipeline row exists, or orphan it. **Worth verifying behavior in practice.**
- `notifications.client_id → clients.id` is `NO ACTION`.

## RLS / access posture (2026-06-18 security remediation)

All application data is reached through `vfo-admin-api` with the service-role key (which bypasses RLS); auth is enforced application-side. The intended baseline is therefore **RLS-on, no public policies (service-role only)** on every table. This session closed the gaps where that wasn't true:

- **RLS enabled (C1)** on `card_update_tokens`, `document_numbers`, `member_number_baselines`, and `pft_engagement` — they had been reachable by the public anon key via PostgREST.
- **Over-permissive policies replaced with deny-all (C1)** on `pipeline_map1`, `email_templates`, `pipelines`, and `pipeline_sandbox_config` — their `{public} USING(true)` "Allow all for authenticated" policies became `"Deny all access" USING(false)`, matching the service-role-only pattern.
- `login_attempts` (new — see [auth.md](auth.md)) ships RLS-on / deny-all from creation.
- `portal_feature_flags` (2026-09-18 — see [programs.md](programs.md)) ships RLS-on / deny-all in its own migration; advisor GREEN at the strong check, anon `*/0`.
- **`storage.objects` (M7a):** the `"Allow public reads from headshots"` policy was dropped — the `headshots` bucket is no longer listable (public object-URL access is unchanged).
- **Functions (M7b):** `cleanup_expired_sessions()` and `trigger_cleanup_on_login()` now set `search_path=''` and have EXECUTE revoked from `public`/`anon`/`authenticated` (service_role retains it; the login-fired cleanup trigger still works).
