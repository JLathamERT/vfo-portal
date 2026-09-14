# Specialists tables

"Specialists" (also called "experts" in the schema) are the third-party domain experts that members can refer their clients to. The `experts` table is large (~30 columns) because each row holds full marketing copy for the public website widget. The onboarding workflow is its own state machine in `specialist_onboarding`.

## `experts`

The specialist roster. Most columns are display/marketing text (the "D&B" prefix = Details & Benefits — the public-facing copy).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `name` | text | not null |
| `email` | text | **The WORK email — the ROUTING address every specialist email is sent to**, and the only expert address anything sends to; every send-site reads it through a narrow `select`, never off a wide payload. Auto-filled on go-live by `automation_SPECIALIST_createspecialist` (2026-06-19). UI label since 2026-08-26: **"Work email (emails sent here)"** on the Edit-Specialist form and the read-only profile card, **"Work Email \*"** on `SpecialistOnboarding.jsx`. Column name and every writer/reader unchanged — the relabel exists purely to make the split below unambiguous at the point of entry. **Stripped from all three non-admin payloads** (see *Non-admin `experts` payloads are SUBTRACTIVE* below) and **not in the anon column grant**. |
| `personal_email` | text | nullable. Added 2026-08-26 (migration `20260826120000_experts_personal_email.sql`). **Record-keeping only — nothing ever emails it.** The specialist twin of `members.personal_email` ([members.md](members.md)), same rule, opposite payload mechanics. Edited side-by-side with the work email as *"Personal email (not emailed)"* and shown as a "Personal email" row on the read-only card; it rides the existing `SHARED_KEYS` block in `SpecialistsPanel.jsx` and `save_specialist`'s passthrough, so **no handler changed to save or load it**. **Deliberately NOT added to the narrow anon/authenticated column grant** (`20260709160000_experts_anon_column_grants.sql` — a new column is not covered by that grant, which is exactly the point) **and stripped from all three non-admin payloads below.** Adding it to a grant, to any payload, or to any `to`/`cc` resolver would leak a private address and start mailing it — all three are the bug, not the fix. |
| `photo_url` / `headshot_image` | text | Two image fields — likely one is hosted URL and the other a Supabase-storage object key. |
| `short_bio` / `long_bio` | text | |
| `branding` | text | |
| `details_and_benefits` | text | |
| `sort_order` | integer | default `0`, nullable. Display order. Renormalized to 1-based alphabetical position by `name` on every `save_specialist` insert. Edits do not touch this column. The `save_specialist_order` admin reorder API still exists but is overridden on the next insert. |
| `background_check` | text | |
| `D&B_strategy_expertise` | text | |
| `D&B_cutoff_date` | text | (Stored as text, not date) |
| `D&B_client_requirements` | text | |
| `D&B_investment_cost` | text | |
| `D&B_ideal_client` | text | |
| `D&B_summary_benefits` | text | |
| `D&B_getting_started` | text | |
| `D&B_professional_process` | text | |
| `D&B_competitive_advantage` | text | |
| `D&B_audit_risk_general` | text | |
| `D&B_audit_risk_history` | text | |
| `D&B_audit_risk_worst_case` | text | |
| `D&B_audit_risk_precautions` | text | |
| `D&B_revenue_share` | text | |
| `D&B_tax_risk_mindset` | text | **Removed from the portal 2026-07-16** — no longer shown, written, or cleared anywhere in the UI; the column value is left as-is (last SIF/legacy write). |
| `D&B_tax_risk_notes` | text | Now per-entry (stored in `ecosystem_content`); the flat column mirrors the first Tax Planning entry. Edit-form only (hidden on the read-only profile). |
| `top_of_t` | boolean | not null, default `false`. Promotion flag for "top of the table" placement. |
| `vfo_accredited` | boolean | **(2026-07-16)** not null, default `false`. "VFO Accredited Professional Specialist" flag. When true the specialist is HIDDEN from every Showroom surface (member/client/specialist portals, admin Showroom tab, admin per-member preview) AND the public widget, but STILL appears in admin Specialist Search (with a blue tag) and stays selectable in the Holistic-Regular / Holistic-Tax / standalone-Tax specialist pickers. Hide is enforced in `MemberShowroom.jsx` + `widget/vfo-widget.js` + **(2026-08-09)** `public/store/data.js` (the `/store/` 3D bookstore — the third anon consumer; see gotcha #345) — NOT in `load_data`, which feeds the pickers. **Anon-readable** — the only new column added to the anon grant so the widget can filter it (migration `20260716000000_experts_vfo_accredited`). See gotcha #231. |
| `ecosystem_content` | jsonb | **(2026-07-13; reshaped 2026-07-16)** Ordered ARRAY of content entries — one per write-up, and the SAME ecosystem may repeat: `[ { ecosystem, short_bio, "D&B_..." (incl. the per-entry tax questionnaire: `D&B_tax_risk_notes` + 4 `D&B_audit_risk_*`) }, … ]`. Read via `entriesFor()` which also accepts the legacy object shape (`{ "<eco>": {content} }`) and NULL (oldest rows = flat columns as the first entry), and seeds legacy flat tax into the first Tax Planning entry. Entry 0 is primary — its non-tax `D&B_*` (and the first Tax entry's tax answers) mirror the flat top-level columns (agreements/BoldSign read those). The flat `short_bio` holds the COMBINED distinct entry bios joined `\| ` (showroom/widget/list read it). **The Tax 5 specialist picker (2026-08-17) labels each option `"<tax_bio> - <name>"`, where `tax_bio` = this array's Tax Planning entries' `short_bio` joined `" / "`, falling back to the flat `short_bio` on legacy rows** — display-only, so stored names and notes keys are untouched (#382/#392). Admin-only (not in the anon grant). See gotchas #220 + **#232**. |

**Note:** Column names containing `&` (`D&B_*`) require quoting in SQL.

**Note (per-ecosystem model, 2026-07-13; multi-entry 2026-07-16):** `short_bio` + the non-tax `D&B_*` fields are edited **per entry** (stored in the `ecosystem_content` array, flat `D&B_*` = the primary/first entry). A specialist may have **multiple entries in the same ecosystem** (added via the Edit form's "Select ecosystem to add" dropdown; toggled by numbered chips in the profile). The flat `short_bio` = the **combined** distinct entry bios (`\| `-joined) so the showroom/widget show every specialty. The **Tax** questionnaire (`D&B_tax_risk_notes` + the 4 `D&B_audit_risk_*`) is now **per Tax Planning entry** (as of later 2026-07-16 — was previously one shared set): each Tax Planning entry has its own Tax Risk Notes + Audit Risk Questionnaire, seeded from the legacy flat columns on first load and mirrored back to the flat columns (first Tax entry) on save. `D&B_tax_risk_mindset` was **removed from the portal entirely**. Tax Risk Notes is edit-form-only. Pure frontend — `save_specialist`/`load_data` pass the whole `expert` object through, so no handler code changed. See gotchas #220 + #232.

**Note (2026-06-10):** `experts` is the specialist **directory**. On go-live the `D&B_*` columns are populated **from the SIF** by `automation_SPECIALIST_createspecialist` (question-to-question mapping; the 4 `D&B_audit_risk_*` only when `sif_data.is_tax_specialist='Yes'` — see [../flows/specialist-onboarding.md](../flows/specialist-onboarding.md)). **Also auto-filled on go-live (2026-06-10):** `short_bio` ← `sif_data.strategy_expertise`, `long_bio` ← the DD-checklist Professional Bio (`specialist_onboarding.ddc_data.bio`), `D&B_revenue_share` ← the finalized rev-share (`rev_share_final_text` || the Stage-2 `rev_share_prepared` progress notes). All three remain editable in the Edit-Specialist form. `experts.id` has **no sequence default** — the create-specialist handler assigns `max(id)+1` (and a deleted id is recycled by the next go-live — gotcha #109). `background_check` ← `specialist_onboarding.background_check_type` (Core/Max). Specialist logins live in the new `specialist_logins` table below (specialists are **not** `members`).

**Non-admin `experts` payloads are SUBTRACTIVE — the exact INVERSE of the members payload (2026-08-26).** Every caller-facing `experts` blob is built as **`select("*")` followed by per-caller redaction**: the admin branch returns the rows untouched, and each non-admin branch filters to `status='Active'` and destructures the private columns away (`const { email, personal_email, ...rest } = e`). **So a new `experts` column is PUBLIC by default** — the opposite of `members`, where `load-data.ts` re-assembles an ADDITIVE whitelist and a new column stays invisible until someone lists it (gotcha **#207**). There are exactly **THREE strip sites**, and **every new private `experts` column must be added to ALL THREE or it silently leaks to every non-admin caller**:

1. `actions/data/load-data.ts` — the non-admin branch of the main portal loader (member/client sessions).
2. `actions/data/specialist-showroom-load.ts` — the specialist-portal Showroom tab.
3. `actions/data/client-showroom-load.ts` — the client-portal Showroom tab.

The second line of defence is the **anon/authenticated column grant** (`20260709160000_experts_anon_column_grants.sql` + the `vfo_accredited` add-on), which is a narrow positive `grant select (…)` list — that one IS additive, so a new column is private there without any action. `save_specialist` is a whole-object passthrough and needs no change either way; only the read paths do.

**Touched by:** `load_data` (returned as `data.experts`), `save_specialist`, `save_specialist_order`, `delete_specialist`, `upload_headshot`, and (2026-06-10) `automation_SPECIALIST_createspecialist` (insert on go-live). Frontend: [SpecialistsPanel.jsx](src/components/admin/SpecialistsPanel.jsx).

---

## `vfo_ecosystem_assignments`

Many-to-many tag table — which `experts` belong to which "ecosystem" (a free-form tag, e.g., `"Estate Planning"`).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `expert_id` | bigint | fk → `experts.id` (CASCADE) |
| `ecosystem_id` | bigint | (No FK — just a numeric tag id, source is application-level) |
| `name` | text | not null. Display name of ecosystem. |

**Touched by:** `load_data` (returned as `data.ecosystems`). Joined into `ecoMap` in [AdminPortal.jsx:94](src/pages/AdminPortal.jsx). **Second reader added 2026-08-17:** `tax_planner_portal_experts` (`actions/tax-planners/portal-experts.ts`) filters `experts` down to `status='Active'` ∩ this table's `name='Tax Planning'` for the Tax 5 "+ Add Specialist" picker, returning `{id, name, tax_bio}` only — so the picker offers the Tax Planning ecosystem, never the whole roster. **No unique constraint on `(expert_id, name)`** — duplicate rows can exist and once made a specialist's strategy render twice; `SpecialistsPanel.jsx` dedupes every ecosystem list read from `ecoMap` with `[...new Set(...)]` (gotcha #220).

---

## `specialist_onboarding`

Multi-stage onboarding workflow. Stages 1..N are application-defined; each stage has its own task list (in `specialist_onboarding_progress`), meeting log, and vote tally.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `specialist_name` | text | not null |
| `specialist_email` | text | |
| `current_stage` | integer | not null, default `1`. Status field — drives which stage's UI is active. |
| `status` | text | not null, default `'active'`. Status field. |
| `background_check_type` | text | |
| `created_by` | text | |
| `created_at` / `updated_at` | timestamptz | default `now()` |
| `sif_token` | text | unique partial index. Token for the public `/specialist-sif` page; set by `automation_SPECIALIST_prelimemail` on the Stage 1 continue email (2026-06-02). |
| `sif_data` | jsonb | Submitted Specialist Information Form payload (written by `automation_SPECIALIST_submitsif`). |
| `sif_submitted_at` | timestamptz | When the SIF was submitted; drives the Stage 1 "SIF form completed" AI PC Admin step. (The SIF `sif_data` jsonb now also carries `is_tax_specialist` Yes/No + 4 tax-risk answers.) |
| **Background-check payment** (2026-06-03) | | `bg_step3_email_sent_at`, `bg_checkout_token` (uniq idx), `bg_stripe_customer_id`, `bg_payment_intent_id`, `bg_payment_status` (`pending`/`processing`/`succeeded`/`failed`), `bg_payment_method_type`, `bg_acct_last4`, `bg_card_processing_fee`, `bg_payment_completed_at`, `bg_confirmation_email_sent_at` (**ACH only** since 2026-07-26 — a card background check is receipt-only and leaves this NULL), `bg_invoice_number`, `bg_invoice_drive_id`, `bg_receipt_number`, `bg_receipt_drive_id`, `bg_receipt_email_sent_at`. `background_check_type` ('Core'/'Max') set on payment success. |
| **Further questions** (2026-06-03) | | `further_questions_token` (uniq idx), `further_questions_requested_at`, `further_questions_resolved_at`, `further_questions_resolution` ('Proceed'/'Stop'). |
| **Reminder timer guards** (2026-06-03) | | `sif_email_sent_at` + `sif_reminder_sent_at` + `sif_pf_notified_at`; `bg_choice_reminder_sent_at` + `bg_choice_pf_notified_at`; `vote_r1_opened_at`/`vote_r1_reminder_sent_at`/`vote_r1_pf_notified_at`; `vote_r2_opened_at`/`vote_r2_reminder_sent_at`/`vote_r2_pf_notified_at`. Consumed by `automation_SPECIALIST_sweep`. |
| **Due Diligence Checklist** (2026-06-04) | | `ddc_token` (uniq idx), `ddc_data` (jsonb — text answers + file refs `{path,name,size,type}`), `ddc_email_sent_at`, `ddc_submitted_at`, `ddc_help_requested_at`, `ddc_reminder_sent_at`, `ddc_pf_notified_at`, `ddc_review_status` (`pending_review`/`approved`/`edits_requested`), `ddc_edits_reason`, `ddc_approved_at`, `ddc_edits_email_sent_at`, `ddc_review_log` (jsonb array `{type:'submitted'\|'approved'\|'denied', reason?, at}` — approve/deny paper trail, gotcha #71). Files in the **private** `specialist-dd-materials` bucket (gotcha #69). |
| **Final rev-share proposal** (2026-06-04) | | `rev_share_final_token` (uniq idx), `rev_share_final_response` ('Approved'/'Further Questions'), `rev_share_final_response_at`, `rev_share_final_text` (Tracy's edited final — the original stays in `specialist_onboarding_progress` `rev_share_prepared`, gotcha #70). |
| **Stage-4 agreement** (2026-06-05) | | `lic_boldsign_document_id`, `agreement_sent_at`, `agreement_signed_by_specialist_at`, `agreement_signed_by_ceo_at`, `rev_share_agreement_text` (snapshot of the rev-share text rendered into the agreement). |
| **Stage-4 license payment / Stripe subscription** (2026-06-05) | | `lic_checkout_token`, `lic_stripe_customer_id` (reuses `bg_stripe_customer_id`), `lic_subscription_id`, `lic_payment_status` (null/`scheduled`/`processing`/`succeeded`/`failed`/`canceled` — bare `text`, no CHECK; **`scheduled` added 2026-08-24** = a CONTINUATION subscription exists under a deferred billing anchor with **zero money moved**, #437), `lic_payment_method_type`, `lic_acct_last4`, `lic_card_processing_fee`, `lic_payment_completed_at`, `lic_payment_link_sent_at`, `lic_confirmation_email_sent_at` (**ACH only** since 2026-07-26 — a card licence is receipt-only and the handler returns without stamping this, so a manual resend stays possible), `lic_invoice_number`, `lic_receipt_number`, `lic_invoice_drive_id`, `lic_receipt_drive_id`, `lic_invoice_receipt_email_sent_at`, `lic_last_invoice_id` (+`_paid_at`) — per-invoice idempotency for the monthly subscription. **Phase D** added `lic_default_payment_method_id` (text) — the admin-updated Stripe PM id the monthly license subscription prefers, set via the `/update-card` page (see `card_update_tokens` in [pipeline.md](pipeline.md)). |
| **License Fee Continuation** (2026-08-24, v780) | | `license_continuation` (boolean) marks a row as a CONTINUATION — an EXISTING, already-live specialist moved onto the portal's $99/mo ACH licence, **not** an onboarding: the row is minimal (`current_stage=4`, `status='active'`, no tracker/votes/meetings) and is excluded from the onboarding list and tracker. It gates the ACH-only checkout branch, the Stage 4->5 advance, the two Tracy go-live bells and sweep tier 7b. **NEW: `lic_charge_day` (integer, 1-15)** — the admin-chosen day of month the specialist is billed on; null on every onboarding licence row, which keeps charging at checkout time. Migration `20260824210000_specialist_license_continuation_charge_day.sql`. Full flow: [../flows/specialist-license-continuation.md](../flows/specialist-license-continuation.md). |
| **Continuation bank verification** (2026-09-14) | | Three nullable `timestamptz` side columns for the micro-deposit (manual bank entry) wait, migration `20260914120000_lic_continuation_bank_verification.sql`, **plus `lic_setup_intent_id` (text, migration `20260914130000_lic_setup_intent_id.sql`)** — the SetupIntent the row is awaiting verification on, written alongside the stamp at checkout. It exists because **in subscription mode Stripe exposes the micro-deposit SetupIntent on neither the session nor the subscription** (proven live 2026-09-14, v837/onboarding 28: `pending_setup_intent`, `session.setup_intent` and `default_payment_method` all null), so the webhook finds it via `GET /v1/setup_intents?customer=` and stores the id; `setup_intent.*` events then resolve by **object** rather than by customer, which would also match the specialist's card-update SetupIntents (#473). **`lic_bank_verification_pending_at`** — set by `checkout.session.completed` when the subscription's `pending_setup_intent` is `requires_action`, cleared by `setup_intent.succeeded` and by the `setup_failed`/`canceled` branch. **`lic_payment_status` is deliberately NOT given a new value** for this state (**#475**); it keeps saying `scheduled`. **`lic_verify_email_sent_at`** — idempotency stamp for `SPECIALIST_lic_continuation_verify_bank`, kept **separate from `lic_confirmation_email_sent_at`** so the real confirmation can still go out after verification succeeds. **`lic_bank_verification_pf_notified_at`** — sweep tier 7c's once-only guard. All three are continuation-only in practice; nothing on the onboarding licence path writes them. |
| **Stage-4 reminder guards** (2026-06-05) | | `agreement_sign_reminder_sent_at`/`_pf_notified_at`, `lic_payment_reminder_sent_at`/`_pf_notified_at`, `rev_share_final_reminder_sent_at`/`_pf_notified_at` (sweep guards for the DD/rev-share/signature/payment stalls — 2-business-day reminder / 4-business-day PF bell as of 2026-08-14, #396). |
| **"Reached out?" acknowledgements** (2026-08-12, v734) | | `sif_pf_ack_at`, `vote_r1_pf_ack_at`, `vote_r2_pf_ack_at`, `bg_choice_pf_ack_at`, `ddc_pf_ack_at`, `rev_share_final_pf_ack_at`, `agreement_sign_pf_ack_at`, `lic_payment_pf_ack_at` — **eight, one per stall ladder above** (the widest set of any pipeline). Records that a human chased the tier-2 escalation (4 business days by default); **ONLY writer `automation_stall_ack`** (`pipeline:'specialist'`, `stall` = the prefix), un-ticking writes NULL. Nothing reads them — no sweep, no bell, no gate. The tier-1 / tier-2 rows in each AI PC Admin block now render only when their own `_reminder_sent_at`/`_pf_notified_at` is stamped. **No backfill statement was written for this table** — all eight start NULL on every row. **The tier-2 recipient is hardcoded "Tracy" in the row label** (pre-existing sweep behaviour, unlike the other pipelines' "assigned PF"/"team member responsible"). Gotcha **#381**. |
| **Stage-5 go-live: login-setup + expert link** (2026-06-10) | | `login_setup_token` (text, unique partial idx), `login_setup_token_expires_at` (timestamptz), `login_setup_email_sent_at` (timestamptz), `login_setup_completed_at` (timestamptz); `expert_id` (bigint, FK → `experts(id)` ON DELETE SET NULL — the directory row created on go-live), `expert_created_at` (timestamptz). Login setup writes to **`specialist_logins`** (not `member_logins`). Migration `specialist_login_and_expert_link`. |

**Status fields:** `current_stage` (auto-advances to 3 on Stage-2 exec approval; → 4 when **all three** Stage-3 items complete — Background Passed + DD Approved + rev-share finalized, via `maybeAdvanceStage3`; **→ 5 on the first license `invoice.paid`**, 2026-06-05), `status` (`stopped` on both-Denied at either stage; **`completed` when the Stage-5 `headshot_added` checkbox is ticked** — gated in `save-progress.ts`; the `bios_added` checkbox was **removed 2026-06-10** now that bios auto-fill on go-live). Stage-4 final-approval reviewer notes + 2-round votes reuse the `tracy_general_notes` progress key (stage 4) and `specialist_onboarding_votes` (stage 4); **`tim_tax_risk_notes` is Stage-2 only — not used at stage 4** (2026-06-10). That task_key is a HISTORICAL string and must not be renamed; as of 2026-07-27 the prompts behind both it and `tracy_general_notes` are addressed to **Tracy** (Tim Gacsy left — gotcha #291), which is why the auto-clear on save matches the exact notification TITLE rather than recipient+link. Both-Approved auto-sends the agreement. The 7 Stage-4 status steps (`agreement_sent`/`agreement_signed_specialist`/`agreement_signed_ceo`/`payment_link_sent`/`payment_made`/`confirmation_email_sent`/`invoice_receipt_sent`) + the completion-email idempotency markers (`<item>_complete_emailed`) are freeform `specialist_onboarding_progress` task_keys (no columns), now driven by the Stage-4 sign/pay chain. **2026-08-12: the Stage-4 rows' DISPLAY LABELS were relabelled to the canonical six** ("Agreement sent" → *"Engagement agreement created and sent for signing"*, "Agreement signed by specialist" → *"Engagement agreement signed"*, "Agreement signed by CEO" → *"Engagement agreement signed by CEO"*, "Payment link sent" → *"Payment link sent (ACH or Card choice)"*, plus *"Payment collected"* / *"Invoice and receipt created and emailed to client"*) to match MAP 1 / Tax / Advisor / Accountant. **The task_keys above did NOT change and must not** — they are historical strings. This was safe only because the Stage-4 email chips are keyed on their own separate titles ("Onboarding agreement", "Licensing fee"), not on the row labels, unlike MAP 1 where `STEP_EMAIL_TPLS` IS keyed by label string (gotcha **#382**). **Stage-5 task_keys** (2026-06-10, freeform progress): `skool_invite`, `intro_post`, `team_members_added`, `added_to_showroom`, `headshot_added` (`bios_added` retired 2026-06-10 — bios auto-fill on go-live).

**Touched by:** `load_onboardings`, `create_onboarding`, `load_onboarding`, `update_onboarding`, the Stage 1–2 automation handlers, `automation_SPECIALIST_execvote`, `_step3email`, `_bgconfirmation`, `_bgreceipt`, `_questionsrequest`/`_questionsresolve`, `_sweep`, the webhook background-check branch, and (2026-06-04) the DD Checklist + rev-share-final handlers `_loadddc`/`_saveddc`/`_ddcuploadurl`/`_submitddc`/`_ddchelp`/`_ddcapprove`/`_ddcedits`/`_ddcdownload`/`_revsharefinal`/`_revsharefinalize` (the old `_revsharedecide` was removed), and (2026-06-10) the Stage-5 go-live handlers `_skoolinvite`/`_createspecialist` (writes `expert_id`/`expert_created_at`) + the login-setup chain `_loginsetupemail`/`_loadloginsetup`/`_submitloginsetup` (write `login_setup_*`). Frontend: [SpecialistOnboarding.jsx](src/components/admin/SpecialistOnboarding.jsx) + [SpecialistAutomationPanel.jsx](src/components/admin/SpecialistAutomationPanel.jsx). See [../flows/specialist-onboarding.md](../flows/specialist-onboarding.md).

---

## `specialist_onboarding_progress`

Per-task progress within a stage of an onboarding.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `onboarding_id` | integer | not null. fk → `specialist_onboarding.id` (CASCADE). |
| `stage` | integer | not null |
| `task_key` | text | not null |
| `status` | text | not null, default `'pending'`. Status field. Values seen: `'pending'`, `'completed'`, `'unchecked'` (Stage 2 checklist toggle-off sentinel — treated as not-done by the frontend `getTaskStatus`; gotcha #62). |
| `completed_by` | text | |
| `completed_at` | timestamptz | |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `save_onboarding_progress` (incl. the Stage 2 checklist toggle; the reviewer-notes keys `tracy_general_notes`/`tim_tax_risk_notes`, whose save fires/clears the reviewer-notes notifications; and `rev_share_prepared` whose save opens exec voting — gotchas #64–#66). Also written by `automation_SPECIALIST_bgreceipt` (`bg_email_sent`/`payment_received`) and `_deniedemail` (`denied_email_sent`).

---

## `specialist_onboarding_meetings`

Meetings logged against an onboarding.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `onboarding_id` | integer | not null. fk → `specialist_onboarding.id` (CASCADE). |
| `meeting_date` | date | |
| `items_discussed` | text[] | array, default `'{}'` |
| `notes` | text | |
| `outcome` | text | |
| `created_by` | text | |
| `created_at` | timestamptz | default `now()` |
| `rev_proposal_text` | text | Per-meeting revenue-share proposal sent in the Stage 2 email (only when "Discuss revenue share (detail)" was covered that meeting). 2026-06-02. |
| `rev_proposal_token` | text | unique partial index. Token for the `/specialist-revshare-decide` Approve/Propose-edit buttons; minted by `save_onboarding_meeting` when a proposal is attached. |
| `rev_proposal_email_sent_at` | timestamptz | Stamped by `automation_SPECIALIST_stage2email` when the proposal email is drafted. |
| `rev_proposal_response` | text | `'Approved'` or `'Propose an edit'` — set by `automation_SPECIALIST_revsharedecide`. |
| `rev_proposal_response_at` | timestamptz | |
| `rev_proposal_reminder_sent_at` / `rev_proposal_pf_notified_at` | timestamptz | 2026-06-03. Idempotency guards for the rev-share-unanswered reminder stall in `automation_SPECIALIST_sweep` — **2-business-day reminder / 4-business-day PF bell as of 2026-08-14** (the tiers used to be calendar 48h/96h; #396). |

**Touched by:** `save_onboarding_meeting`, `automation_SPECIALIST_stage2email`, `automation_SPECIALIST_revsharedecide`, `automation_SPECIALIST_sweep`.

---

## `specialist_onboarding_votes`

Per-stage vote log. Each voter casts one vote per stage.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `onboarding_id` | integer | not null. fk → `specialist_onboarding.id` (CASCADE). |
| `stage` | integer | not null |
| `voter_name` | text | not null. Stage 2 = `'Anton Anderson'` / `'Paul Latham'`. |
| `vote` | text | not null. Stage 2 round 1: `'Approved'`/`'Further Questions'`; round 2: `'Approved'`/`'Denied'`. |
| `vote_round` | integer | not null, default `1` (2026-06-03). Distinguishes the two Stage-2 exec-approval rounds. |
| `notes` | text | |
| `voted_at` | timestamptz | default `now()` |

**Unique constraint** is now `(onboarding_id, stage, voter_name, vote_round)` (was 3-col). Stage-2 exec votes are written by `automation_SPECIALIST_execvote` (account-scoped; values redacted in `load.ts` until both vote — gotcha #64); `save_onboarding_vote` still serves stage-4 votes (defaults `vote_round=1`).

**Touched by:** `save_onboarding_vote`.

---

## `specialist_logins` (2026-06-10)

Portal credentials for the **specialist** login type (the 4th role, alongside member/advisor/accountant). Specialists are **not** `members` — they have no `member_logins` row; go-live writes here instead.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `email` | text | not null. **Unique on `lower(email)`**. |
| `name` | text | |
| `passcode_hash` | text | Set by `automation_SPECIALIST_submitloginsetup` from the `/member-setup` page. |
| `expert_id` | bigint | fk → `experts.id` (CASCADE). Links the login to its directory row. |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `automation_SPECIALIST_submitloginsetup` (insert), specialist-portal auth (`auth.callerSpecialistId`). Migration `specialist_login_and_expert_link`.

---

## Buckets

- **`specialist-dd-materials`** (private) — DD checklist uploads (gotcha #69).
- **`specialist-onboarding-assets`** (public) — onboarding email assets/PDFs.
- **`specialist-documents`** (private, 2026-06-10) — the go-live specialist **Vault**, namespaced `<expert_id>/<rand>_<filename>`. The create-specialist step copies the DD files here; served by `specialist_vault_*` (specialist) + `specialist_vault_admin_*` (admin) handlers.
