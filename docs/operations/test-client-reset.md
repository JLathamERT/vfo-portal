# Test-Client Reset — Authoritative Per-Pipeline Map

> **Why this doc exists:** every chat fumbles test-client resets because each automation
> pipeline stores progress in **two separate places** and clearing only one leaves the
> other showing stale data. No amount of cache-clearing fixes it — it's a real, untouched
> DB row, not a caching bug. This is the verified, copy-paste reference.
>
> Verified 2026-06-01 against the live schema (`ejpsprsmhpufwogbmxjv`) and handler code.
> Run all SQL via Supabase MCP (`execute_sql`). **After any reset: logout → login** (see
> [Cache](#cache) — a hard-refresh is unreliable).

## The two stores

- **TRACKER store** — the human checklist statuses shown in the client-detail phase view
  ("Yes" / "Completed - Yes" on tasks).
- **AUTOMATION store** — the payment/email/decision state the automation chain reads & writes.

During normal operation handlers write both, so they stay in sync and nobody notices they
are separate. On a manual reset you must clear **both**.

## Map

| Pipeline | TRACKER store (key columns) | written by | AUTOMATION store | Two-store? |
|---|---|---|---|---|
| **MAP 1** (program_id=1) | `client_progress` — `client_id` + `task_id` (join `program_client_tasks` for C-codes C8/C13/C14…) | `actions/msm/save-client-task.ts` | `pipeline_map1` | **Yes** |
| **Tax** (program_id=4) | `client_tax_progress` — `tax_plan_id` + `task_id` + `tax_specialist_id` | `actions/tax/save-task.ts` | `client_tax_plans` | **Yes** |
| **PIP Meetings** | `priority_progress` — `priority_track_id` + `task_id` | `actions/msm/save-priority-task.ts`, `pip-meeting-confirmation-email.ts` | `client_priority_tracks` (`pip_*` cols; PIP rows are `track_type='pip'`) | **Yes** |
| **Advisor Onboarding** | — none — (stages are columns on the row) | — | `advisor_onboarding` | **No — single table** |
| **Accountant Onboarding** | — none — (stages are columns on the row) | — | `accountant_onboarding` | **No — single table** |

> **⚠️ PIP gotcha:** `priority_progress` is **shared** with the regular (non-PIP) MSM
> priority tracker. Both PIP meetings and ordinary priority tracks are rows in
> `client_priority_tracks`. When resetting PIP, target only the PIP `priority_track_id`s
> (`track_type='pip'`) — don't blanket-wipe a client's whole `priority_progress`.

> **Advisor / Accountant are single-table.** Their stage statuses (prelim meeting,
> partnership, decision, signing, payment, member-created) are columns ON the onboarding
> row — there is **no** second progress table. Don't hunt for one.

## Full-reset extras (verify per case)

- **`document_numbers`** — invoice/receipt sequence rows. Cols: `id, type, number (UNIQUE),
  client_id, advisor_onboarding_id, accountant_onboarding_id`. MAP1/Tax/PIP rows are keyed
  by `client_id` + `type` string (there is **no** tax_plan_id / pip FK); advisor/accountant
  by their `*_onboarding_id` FK. Leave behind → the handler's "existing invoice" lookup can
  re-serve an old number or reuse a sequence.
  **You cannot unlink them: the `document_numbers_exactly_one_owner` CHECK requires exactly ONE
  owner FK to be non-null, so "NULL the FK, keep the ledger row" is not available for an
  onboarding — DELETE the number rows. That is safe: `allocateDocNumber` derives its candidate by
  COUNTING rows and retries past collisions, and the issued number embeds the owner id
  (`INV-ADV21-0050`), so a deleted test row can never be re-issued to a different owner (#474).**
- **`notifications`** — admin notifications generated during the flow, by `client_id` + `pipeline`.
- **`members` (+ `member_logins`)** — only for onboarding pipelines that reached Stage 3
  member creation. `member_logins` is keyed by email. FK note: `members.onboarding_id` /
  `members.accountant_onboarding_id` + `document_numbers` `RESTRICT`-reference the onboarding
  tables — NULL those FKs before deleting an onboarding row.
- **External (not DB — cannot be reset by SQL):** BoldSign documents and Stripe
  customers / PaymentIntents persist outside the database.

## Cache

All tracker/automation reads sit behind the `api.js` module-level promise cache
(`loadCachedData` for `load_data`; `loadCachedAction('msm_load_client_track' |
'msm_load_priority_progress' | …)`). After **any** DB reset, **logout → login** is the
reliable flush — a plain hard-refresh often is NOT, because the SPA re-serves the cached
promise.

## Copy-paste SQL templates

Replace `<CLIENT_ID>`, `<TAX_PLAN_ID>`, `<ONBOARDING_ID>` as needed.

### MAP 1
```sql
DELETE FROM pipeline_map1   WHERE client_id = <CLIENT_ID>;  -- AUTOMATION (delete row; UNIQUE(client_id) + PIP1 reconfirmation re-INSERTs it as the flow entry point — do NOT null)
DELETE FROM client_progress WHERE client_id = <CLIENT_ID>;  -- TRACKER
```

### Tax
```sql
DELETE FROM client_tax_progress WHERE tax_plan_id = <TAX_PLAN_ID>;  -- TRACKER
-- AUTOMATION: wipe the client_tax_plans flow fields (keep the row; status is NOT NULL — set it back to 'live').
UPDATE client_tax_plans SET
  agreement_sent=NULL, boldsign_doc_id=NULL, client_signed=NULL, ceo_signed=NULL,
  tax_decision=NULL, tax_final_decision=NULL, ready_for_tax3_decision=NULL,
  retainer_amount=NULL, retainer_status=NULL, stripe_customer_id=NULL,
  post_review_client_decision=NULL, implementation_final_decision=NULL,
  post_review_client_decision_at=NULL, post_review_client_decision_ip=NULL, post_review_client_decision_ua=NULL,
  post_review_refund_confirmed_at=NULL, post_review_refund_confirmed_by=NULL,  -- 2026-10-23 refund-request columns
  status='live'
  /* …and the rest of the flow fields; see the session reset script for the full column list… */
WHERE id = <TAX_PLAN_ID>;
```

### PIP Meetings
```sql
-- TRACKER: clear progress for this client's PIP meeting tracks only (track_type='pip').
DELETE FROM priority_progress
 WHERE priority_track_id IN (
   SELECT id FROM client_priority_tracks WHERE client_id = <CLIENT_ID> AND track_type = 'pip'
 );
-- AUTOMATION: either delete the PIP meeting rows…
DELETE FROM client_priority_tracks WHERE client_id = <CLIENT_ID> AND track_type = 'pip';
-- …or, to re-test a purchase on an existing meeting, NULL the pip_* purchase/payment cols instead.
```

### Advisor Onboarding (single table)
```sql
-- NULL the flow fields on advisor_onboarding (keep first_name/last_name/email; NOT-NULL:
-- payment_amount default 4000, status default 'active', engagement_term_months default 6).
UPDATE advisor_onboarding SET
  prelim_meeting_decision=NULL, final_decision=NULL,
  boldsign_document_id=NULL, agreement_sent_at=NULL,
  agreement_signed_by_advisor_at=NULL, agreement_signed_by_ceo_at=NULL,
  selected_vfo_ft=NULL, selected_pft=NULL, selected_corporate=NULL,
  payment_status=NULL, stripe_customer_id=NULL, member_number=NULL, member_created_at=NULL,
  decision_email_sent_at=NULL, login_setup_email_sent_at=NULL,
  payment_amount=4000, status='active', engagement_term_months=6,
  -- 2026-09-04 meeting + deposit + balance families (35 columns; derive the list from
  -- information_schema rather than trusting this comment):
  prelim_meeting_status=NULL,
  meeting_date=NULL, meeting_time=NULL, meeting_timezone=NULL, meeting_at=NULL,
  meeting_reminder_due_at=NULL, meeting_reminder_token=NULL,
  meeting_reminder_scheduled_at=NULL, meeting_reminder_skipped_at=NULL,
  meeting_reminder_sent_at=NULL, meeting_reminder_60m_sent_at=NULL,
  meeting_reminder_10m_sent_at=NULL, meeting_response=NULL, meeting_response_at=NULL,
  deposit_amount=NULL, deposit_checkout_token=NULL, deposit_email_sent_at=NULL,
  deposit_status=NULL, deposit_payment_intent_id=NULL, deposit_method_type=NULL,
  deposit_acct_last4=NULL, deposit_card_fee=NULL, deposit_completed_at=NULL,
  deposit_confirmation_email_sent_at=NULL, deposit_reminder_sent_at=NULL,
  deposit_pf_notified_at=NULL, deposit_pf_ack_at=NULL,
  deposit_refund_id=NULL, deposit_refund_amount=NULL, deposit_refund_date=NULL,
  deposit_refund_status=NULL, deposit_refund_email_sent_at=NULL,
  balance_charge_status=NULL, balance_payment_intent_id=NULL,
  balance_card_fee=NULL, balance_charge_date=NULL
  /* …plus the remaining timestamp/reminder/login-setup fields… */
WHERE id = <ONBOARDING_ID>;
-- The accountant twin takes the identical block — the tables are clones.
-- If a member was created, NULL members.onboarding_id (+ delete member_logins by email) first.
```

### Accountant Onboarding (single table)
```sql
-- Same shape as advisor, plus accountant_partnership; column is agreement_signed_by_accountant_at.
UPDATE accountant_onboarding SET
  accountant_partnership=NULL, prelim_meeting_decision=NULL, final_decision=NULL,
  boldsign_document_id=NULL, agreement_sent_at=NULL,
  agreement_signed_by_accountant_at=NULL, agreement_signed_by_ceo_at=NULL,
  selected_vfo_ft=NULL, selected_corporate=NULL,
  payment_status=NULL, stripe_customer_id=NULL, member_number=NULL, member_created_at=NULL,
  decision_email_sent_at=NULL, login_setup_email_sent_at=NULL,
  payment_amount=4000, status='active', engagement_term_months=6
  /* …plus the remaining timestamp/reminder/login-setup fields… */
WHERE id = <ONBOARDING_ID>;
-- The Undecided email has a one-send guard (decision_email_sent_at) — NULL it (above) to re-test.
```

> The full column-by-column UPDATE used during the 2026-06-01 verification session lives in
> that chat's transcript; the snippets above list the high-signal fields. When in doubt,
> `SELECT column_name FROM information_schema.columns WHERE table_name='<t>'` and NULL every
> flow field, restoring NOT-NULL columns to their defaults.
