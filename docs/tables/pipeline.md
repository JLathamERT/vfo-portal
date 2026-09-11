# Pipeline tables

The automation core. `pipelines` is a registry of available pipeline tables; `pipeline_map1` is currently the only one (MAP 1 = "Member Advisor Program — Pipeline 1"). Every column starting with `c##_` represents a step in the workflow; the row's column values *are* the state machine.

## `pipelines`

Registry of pipeline kinds. The frontend [AutomationPanel.jsx:290](src/components/admin/AutomationPanel.jsx) uses `automation_load_pipelines` to enumerate, then `automation_load_pipeline_data` to read rows from the `table_name` column dynamically.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `name` | text | not null. Display name (e.g., `"MAP 1"`). |
| `description` | text | |
| `table_name` | text | not null. Physical table to query (`pipeline_map1`). |
| `active` | boolean | default `true` |
| `created_at` | timestamptz | default `now()` |

**Current rows:** 1 — `(1, "MAP 1", "Member Advisor Program - Pipeline 1", "pipeline_map1", true)`.

**Touched by:** `automation_load_pipelines`, `automation_load_pipeline_data`.

---

## `pipeline_map1`

The single most important automation table. One row per client journey through MAP1. **143 columns as of 2026-08-14** (an older "~80" here was long stale) — derive it rather than trusting the number: `select count(*) from information_schema.columns where table_name='pipeline_map1';`. Column families:

> **DB invariant**: `UNIQUE (client_id)` since 2026-05-21. The constraint prevents the historical drift where stale handler-INSERT branches silently created duplicate rows for the same client (which then broke downstream `.maybeSingle()` lookups). Any code path that tries to insert a second row for an existing client_id now hard-fails with Postgres `23505 unique_violation`.

### Identity / routing
| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `client_id` | integer | fk → `clients.id` (NO ACTION). UNIQUE (see invariant above). |
| `client_ref` | text | Human-friendly ref (e.g., `"VFO-ABC-123"`). Mirrored from `clients.client_ref`. |
| `pf` | text | Assigned PF (Planning Facilitator). Used in step routing. |
| `tax_planner` | text | Optional tax planner assignment. |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |
| `sandbox` | boolean | default `false`. When `true`, automations route via sandbox keys (see `pipeline_sandbox_config`). |
| `status` | text | **2026-08-26 (v793), migration `20260826180000_pipeline_map1_status.sql`.** `'live'` \| `'stopped'`. **NOT NULL DEFAULT `'live'`** — deliberately, so the sweep filters can use `.eq("status","live")`: PostgREST `.neq` silently drops NULL rows, which would make every legacy row invisible to the ladders (#437 family). Bare text, **no CHECK** (#431). **Stopping does exactly TWO things and no more:** (1) *display* — the MAP 1 track header renders a Live/Stopped toggle and `overview-map1.ts` reports the track closed (`track_status` is now this column, was hard-NULL; `closedReason` = `"Client declined"` when a No is recorded, else `"Stopped"` — the specific reason wins); (2) *sweep silencing* — the **six** reminder-ladder queries in `actions/pipeline/contract-revshare-sweep.ts` (c14 decision, c17 signing, pay1 payment; client-email tier + PF-bell tier each) skip the row. **MONEY IS DELIBERATELY UNAFFECTED.** The rev-share candidate loop, the strategic-partner retry, the PIP held-release (all in that same handler), `contract-chargescheduled-sweep.ts` and `contract-check-reminder-sweep.ts` are **unfiltered** — a signed client who owes money keeps being charged and chased after a stop. **Writers:** `map1_update_status` (the header toggle, ADMIN_ONLY) + auto-stop on a No from `pcadmin-final-decision.ts`, `pcadmin-extra-meeting.ts` and `pipfu-decision.ts` (c13 No; `'Undecided'` and `'ExtraMeeting'` deliberately stay live). **Backfill:** `c13_decision='No' OR c15_final_decision='No'` → **0 rows matched**. `overview-map1.ts`'s third `declined` leg (a manual `client_progress` task) was deliberately NOT backfilled — it lives in another table keyed by program task ids and a wrong guess would silence a live engagement; the 2 clients affected (102 Dan Niemerg, 136 Francisco Hervella) have no `pipeline_map1` row at all, so nothing was owed. |

### Stage C8 — Initial PCADMIN decision
| Column | Type | Status / Automation |
|---|---|---|
| `c81_decision` | text | Status field. Values include `"go"`, `"reschedule"`, `"undecided"`. |
| `c81_email_sent` | text | default `'No'`. **Automation field** — flipped to `'Yes'` after `automation_PCADMIN_finaldecision` sends email. |
| `followup_meeting_date` | date | |
| `undecided_reason` | text | |

### Stage C13/C14/C15 — PIP follow-up & decision
| Column | Type | Notes |
|---|---|---|
| `c13_decision` | text | Status field. |
| `member_paying_on_behalf` | boolean | default `false`. Set from the PIP Follow-Up decision form's "Is the member paying on behalf of the client?" question. When `true`, the MAP 1 contract/payment chain swaps to the member as signer + payer and uses the `payer_type='member'` agreement templates. |
| `current_priorities` / `parked_priorities` / `meeting_notes` | text | Free-form |
| `c14_email_sent` | text | default `'No'`. Flipped to `'Yes'` by `automation_PIPFU_decision` after drafting the Undecided/No email. |
| `c14_email_sent_at` | timestamptz | **Reminder-ladder timer base.** Written `now()` by `automation_PIPFU_decision` **only on the Undecided branch** (not No). Drives the 2-business-day client reminder + 4-business-day PF notification fired by `automation_CONTRACT_revshare_sweep`. **The ladder counts BUSINESS days (Mon–Fri UTC) as of 2026-08-14** — `notification_rules.delay_days` is unchanged, only the unit is; see `utils/notify.ts businessDelayCutoffIso`. |
| `c14_reminder_sent_at` | timestamptz | Idempotency guard for the 2-business-day Undecided-email reminder. Set once by the sweep; row excluded from the reminder block thereafter. |
| `c14_pf_notified_at` | timestamptz | Idempotency guard for the 4-business-day PF "client hasn't clicked a decision button" admin notification. |
| `c14_pf_ack_at` | timestamptz | **2026-08-12 (v734).** Manual "Reached out?" acknowledgement on the C14 stall — the admin ticking the checkbox under the escalation row (the 4-business-day PF notification) in the AI PC Admin block. ONLY writer: `automation_stall_ack` (`pipeline:'map1'`, `stall:'c14'`); un-ticking writes NULL. Purely a paper trail — no sweep, bell or gate reads it, and `pcAdminStepCounts()` deliberately does not count the row (gotcha **#381**). |
| `c15_token` | text | One-time token embedded in the `/decide?token=...` link emailed to client. |
| `c15_final_decision` | text | Status field. Set when client lands on `/decide` and submits via `automation_PCADMIN_finaldecision`. |
| `c15_final_decision_at` | timestamptz | **2026-08-12 (v734).** When the client submitted the decision — added so the AI PC Admin "Client response received" row can show a date. Written `now()` by `automation_PCADMIN_finaldecision` alongside `c15_final_decision`. **Blank on every historic row** (no backfill is possible — the moment was never recorded). `overview-map1.ts` is NOT yet wired to it (gotcha **#384**). |
| `c15_service_level` | text | One of `Lite` / `Core` / `Max` (chosen on `/decide`). |
| `c15_via_extra_meeting` | boolean | default `false`. Flag set by `automation_PCADMIN_extrameeting`. |

### Pricing block (PCADMIN)
Set by `automation_PCADMIN_pricing` ([PFPricingForm.jsx:19](src/components/admin/map1/PFPricingForm.jsx)).
| Column | Type | Notes |
|---|---|---|
| `lite_membership` / `core_membership` / `max_membership` | text | Pricing snapshot for each tier. |
| `extra_cc` | text | **DORMANT since 2026-08-20 — nothing reads it, nothing writes it.** Historical comma-separated extra CC emails from the PIP decision form. `pipfu-decision.ts` wrote it and — the bug that started the replacement — **its own Undecided/No email never read it back**; portal-wide only 5 of ~114 sender files ever did. Superseded by Additional Contacts ([flows/additional-contacts.md](../flows/additional-contacts.md)); `utils/extra-cc.ts` was deleted. Kept so past submissions stay auditable (AutomationPanel still displays it read-only — history, not routing). Legacy values backfilled into `client_contacts` with Cc on / greeting off. |
| `service_level` | text | Final service tier locked in. |
| `pip_meeting_count` | text | Number of PIP meetings included. |
| `gross_fee` | text | Full engagement fee **before** any member contribution. **This is the basis every `*_share` column is denominated in** — shares are dollars of THIS number, not of `net_invoice` and not of an installment (#252). Falls back to `net_invoice` when unset. |
| `member_contribution` | text | A **DISCOUNT funded by the member**, not a payment by them: the client is invoiced `gross_fee − member_contribution`. **It is the entire reason `gross_fee` and `net_invoice` can differ, and therefore the only thing that makes the three revenue legs prorate differently** — see `member_share` below and gotchas **#304** / **#394**. Only two production rows have ever carried one (ids **110** and **120**), which is precisely why display bugs in this area survive for months. |
| `net_invoice` | text | Client-owed total after member contribution. **The installments the client actually pays are slices of THIS**, while the shares are dollars of `gross_fee` — never mix the two bases (#394). |
| `member_share` / `vfos_share` | text | Revenue split for downstream `automation_CONTRACT_revshare`. Dollars of the **TOTAL** engagement (`gross_fee`), stored as text — distinguish `"0"` (an explicit zero share) from null/blank (never set). **The three legs are NOT prorated the same way and a display surface must copy `contract-revshare.ts` rather than re-derive one (#394):** **member** pays its entered share **IN FULL**, split across installments by cumulative difference and **never scaled by net/gross** (the entered share is already net of `member_contribution`, so scaling it again shrinks it twice — #304); **strategic** is genuinely gross-prorated (`share / gross_fee × installment`); and **`vfos_share` is never transferred anywhere**, so the VFO figure is the **RESIDUAL** of the net installment (`installment − member − strategic`), not a proration of this column — which is why a member contribution leaves **more** with VFO, not less. Consumers: the payout engine, `actions/payments/normalize.ts` (Payments tab) and `Map1PricingSplitCard.jsx` (admin card); the latter two were fixed to match the engine on 2026-08-14 / v740. |
| `strategic_partner_share` | text | Dollar amount of the **Strategic Partner** leg, paid to `strategic_member_groups.stripe_account_id` when the client's member is a strategic member. Written by the native MAP 1 pricing forms (`PFPricingForm` / `PFExtraMeetingForm` / `PIPDecisionForm`, auto-computed read-only from `src/lib/strategicSplits.js`) and — **since 2026-08-05** — by the Payment Continuation backfill (`migration_backfill_map1`), which accepts an optional `pricing.strategic_partner_share` (400 if provided and not `> 0`) and computes it off the **net invoice** (the continuation form has no `gross_fee` / `member_contribution` inputs, so net IS the gross). **NULL is written EXPLICITLY when absent**, so a non-strategic overwrite of a previously-strategic row cannot leave a live share behind with no pre-settle stamps. **A NULL here is silent, not safe:** `automation_CONTRACT_revshare` gates the strategic leg on a share `> 0` and the sweep's strategic retry filters `='Failed'`, so a missing share produces no bell, no error status and no log — the partner is simply never paid (gotcha **#335**). |
| `payment_plan` | text | `"OneTime"` or `"Quarterly"`. |

### Stage C16 / C17 / C18 — BoldSign agreement
| Column | Type | Status / Automation |
|---|---|---|
| `c16_sent` | text | default `'No'`. Set to `'Yes'` after `automation_CONTRACT_sendagreement` succeeds. |
| `boldsign_doc_id` | text | **BoldSign integration field.** ID of the document created by `automation_CONTRACT_sendagreement`. Indexed lookup target for `boldsign-webhook`. |
| `c17_client_signed` | text | Status field. `'Yes'` when client signs (set by webhook or admin-api duplicate handler). |
| `c17_followup_sent_date` | date | **Reminder-ladder timer base.** Written by `automation_CONTRACT_sendagreement` at agreement-send time. Drives the 2-business-day signing reminder + 4-business-day PF notification fired by `automation_CONTRACT_revshare_sweep`. |
| `c17_reminder_sent_at` | timestamptz | Idempotency guard for the 2-business-day "agreement still not signed" client reminder. |
| `c17_pf_notified_at` | timestamptz | Idempotency guard for the 4-business-day PF "client hasn't signed the agreement" admin notification. |
| `c17_pf_ack_at` | timestamptz | **2026-08-12 (v734).** Manual "Reached out?" acknowledgement on the C17 signing stall. ONLY writer: `automation_stall_ack` (`pipeline:'map1'`, `stall:'c17'`). Backfilled `now()` where the 96h notice had fired AND `c17_client_signed='Yes'` (**2 rows checked, 3 left unchecked**) — see gotcha **#381**. |
| `c18_ceo_signed` | text | Status field. `'Yes'` when CEO countersigns. |

> **Neither `c17_client_signed` nor `c18_ceo_signed` has a companion timestamp, and that is a known gap, not an oversight to fix locally.** `boldsign-webhook` writes both as bare `'Yes'` strings for MAP 1 (and for Tax), while its advisor/accountant branches DO stamp `agreement_signed_by_*_at` — so the AI PC Admin "Engagement agreement signed" / "signed by CEO" rows are permanently dateless here. Adding the columns requires editing the explicit-approval `boldsign-webhook`; **raised 2026-08-12 and deliberately parked by the user.** Gotcha **#384**.

### Payment block — Stripe
| Column | Type | Status / Automation |
|---|---|---|
| `stripe_customer_id` | text | **Stripe integration field.** Created by `automation_CONTRACT_stripecustomer`. |
| `checkout_token` | text | One-time token used in `/pay?token=...` link. **As of v612 `migration_backfill_map1` MINTS this** (via `token32()`) on insert OR when an existing migrated row has none — never overwriting — because a NULL `checkout_token` silently disabled the charge-failure client email on hand-migrated rows. |
| `legacy_source` | text | **Migration marker.** `'old-system'` on rows written by the Payment Continuation tool (`migration_backfill_map1`). This is the signature the v612 collision guard trusts: a backfill update against a row NOT signed `'old-system'` returns HTTP 409 unless `force:true` (gotcha #230). |
| `legacy_migrated_at` | timestamptz | **Migration marker.** Set when the row was hand-migrated; the Payments tab prefers the admin-entered `pay{N}_date` over charge timestamps for these rows (stale `pay{N}_paid_at` otherwise show every installment as the migration date). |
| `payment_method_type` | text | `"card"` / `"ach"` / `"check"`. `check` set by `automation_CONTRACT_paidbycheck`; card/ach set by the Stripe webhook handler. |
| `card_processing_fee` | text | Computed when `payment_method_type='card'`. NULL for check/ach. 0 for card when `card_fee_waived=true`. |
| `card_fee_waived` | boolean | **2026-07-15.** Payment-continuation setup-link clients pay no card fee — suppresses the 2.9%+$0.30 gross-up in the chargescheduled sweep, the card_update webhook fee recompute, and the Payments-tab display. ONLY writer: `migration_backfill_map1` (`stripe_mode='setup_link'`). |
| `pay1_email_sent_at` | timestamptz | **Reminder-ladder timer base.** Written `now()` by `automation_CONTRACT_paymentemail` after the Gmail draft of the `/pay?token=...` link is queued. Drives the 2-business-day payment reminder + 4-business-day PF notification fired by `automation_CONTRACT_revshare_sweep`. |
| `pay1_reminder_sent_at` | timestamptz | Idempotency guard for the 2-business-day "payment link still not paid" client reminder. |
| `pay1_pf_notified_at` | timestamptz | Idempotency guard for the 4-business-day PF "client hasn't paid the first payment" admin notification. |
| `pay1_pf_ack_at` | timestamptz | **2026-08-12 (v734).** Manual "Reached out?" acknowledgement on the payment-1 stall. ONLY writer: `automation_stall_ack` (`pipeline:'map1'`, `stall:'pay1'`). Backfilled `now()` where the 96h notice had fired AND `pay1_status='succeeded'` (**0 rows matched**). Gotcha **#381**. |
| `pay2_reminder_sent` / `pay3_reminder_sent` / `pay4_reminder_sent` | boolean | default `false`. Written `true` by `automation_CONTRACT_checkreminder_sweep` after successful Gmail draft. Only meaningful for check clients. (Separate from the `pay1_*` reminder ladder — these are pre-due-date nudges fired by a different sweep, on a **7-business-day** lookahead horizon as of 2026-08-14 (`businessDayHorizonDateOnly`); the `payN_date` due dates themselves are ordinary calendar dates.) |
| `stripe_bank_token` | text | |
| `bank_token` | text | |
| `acct_last4` | text | Last-4 captured from Stripe PaymentIntent expansion. NULL for check. |
| `default_payment_method_id` | text | **Phase D (admin card-update).** Stripe PM id the quarterly sweep (`automation_CONTRACT_*` P2–P4 charge path) prefers when set by the admin-initiated payment-method change. Written via the `/update-card` page (see `card_update_tokens`). |
| `pay1_method` … `pay4_method` | text | **Phase D.** Per-installment payment method (`'card'` / `'ach'`) frozen at the moment of a card-update, so the Payments tab shows each installment's actual method after a mid-plan change rather than the current one. |
| `pay1_last4` … `pay4_last4` | text | **Phase D.** Per-installment last-4 frozen at a card-update — same purpose as the `*_method` columns, for per-installment-accurate Payments-tab display. |
| `pay1_status` … `pay4_status` | text | Status fields. **Seven values + NULL**, bare text with no CHECK constraint (#431), so every enumerating predicate has to be taught a new value by hand. NULL = scheduled, never attempted (the quarterly dates are stamped when payment 1 settles). Stripe path: `"succeeded"` / `"processing"` (ACH in-flight) / `"declined"` / `"auth_required"`. Check path: `"check_pending"` (admin clicked Paid via check, waiting for bank to clear) → `"succeeded"` (admin clicked Check cleared P{N}). **`"cancelled"` (2026-08-26, v789)** — closed by the superadmin "Cancel all remaining payments" button (`payments_cancel_remaining`); **P2–P4 only, payment 1 is deliberately never cancellable**. It means CLOSED, not failed: the 03:00 charge sweep, both check-reminder passes, `contract-checkcleared.ts`, the card-update eligibility test, the Payment Continuation page/email/roll-up and `overview-map1.ts` all treat it as terminal. **Do NOT feed it to `normalize.ts`'s `normStatus`** — that helper's FAILED set holds Stripe's own `canceled`/`cancelled` spelling for a different event, so the row builders branch on the raw column first. See [flows/contract-and-payment.md](../flows/contract-and-payment.md) Step 10¾. |
| `pay1_bank_verification_pending_at` | timestamptz | **2026-09-08 (v816), migration `20260908120000_ach_bank_verification_pending_columns.sql`.** Payment 1 only. **SET** by the `checkout.session.completed` MAP 1 branch when the expanded PaymentIntent comes back `status='requires_action'` on a non-card — the client typed their account and routing numbers instead of signing in to their bank, so Stripe is holding the payment for micro-deposit verification and **no debit has been attempted**. **CLEARED (NULL)** by `payment_intent.processing` (bank verified, debit moving) and again, belt-and-braces, by the `payment_intent.succeeded` settle. The completed branch writes the column on **every** pass (an explicit NULL on the card and verified-ACH paths), never leaving it untouched. **Deliberately a side-column and NOT a fourth `pay1_status` value** — the status keeps saying `'processing'` throughout, so every guard that ENUMERATES `pay1_status` (the settle branch, the late-ACH failure branches, the charge sweep, the open-installment resolver, the frontend status maps) needed **no** change (**#371**). **Two readers:** `contract-confirmation-email.ts` picks the `CONTRACT_confirmationemail\|ach_verify` template and re-words the `MAP1_client_paid` bell off it. No backfill — NULL already means "not awaiting verification" for every pre-existing row. See [flows/stripe-webhook.md](../flows/stripe-webhook.md) Branches A2 / C / D and **#475**. |
| `pay1_cancelled_at` … `pay4_cancelled_at` | timestamptz | **2026-08-26 (v789), migration `20260826150000_cancel_remaining_stamps.sql`.** When the matching `pay{N}_status` was set to `'cancelled'` by `payments_cancel_remaining`. **Audit only — nothing reads them for behaviour**; they exist so an operator can tell a slot VFO cancelled from one that was never scheduled. ONLY writer: that handler. **`pay1_cancelled_at` was created for symmetry and is never written** (payment 1 is not cancellable). |
| `pay1_date` … `pay4_date` | date | Set by Stripe webhook for card/ach (today + 91/182/273 for P2-4), or by `automation_CONTRACT_paidbycheck` for check P1 (same +91/182/273 schedule). |

### Stage C24+ — Confirmation & receipts
| Column | Type | Notes |
|---|---|---|
| `confirmation_status` | text | Payment-1 only. `'Confirmation Needed'` on payment → `'Sent'` once the client confirmation email is drafted (ACH / check), OR **`'Skipped - Card (Receipt Only)'`** for a card payment 1 — since 2026-07-26 a card gets the invoice/receipt and no confirmation. The skip value is terminal-equivalent to `'Sent'` for the handler's idempotency guard but leaves `confirmation_email_sent_at` NULL so a manual resend stays possible. Constant: `constants/confirmation-status.ts CONFIRMATION_CARD_SKIP` (edge) / `src/lib/confirmationStatus.js` (react). |
| `invoice_number` | text | Sequential — pulled from `document_numbers`. |
| `invoice_drive_id` | text | Google Drive file ID for stored PDF (write target during `automation_CONTRACT_confirmationemail`). |
| `invoice_email_sent` | boolean | default `false` |
| `rec1_number` … `rec4_number` | text | Receipt numbers per payment. |
| `rec1_status` … `rec4_status` | text | Receipt lifecycle. Written `"Sent"` by `automation_CONTRACT_invoicereceipt` after the Gmail draft is created. NULL before invoicereceipt has run (AutomationPanel renders NULL as "pending" via fallback). Same on card / ACH / check paths. |
| `rec1_drive_id` … `rec4_drive_id` | text | Google Drive IDs. **A duplicate invoicereceipt run OVERWRITES this with the second upload's id, orphaning the first PDF in Drive** (one such orphan is known — gotcha #328). |
| `rec1_email_sent` … `rec4_email_sent` | boolean | default `false`. Written `true` by `automation_CONTRACT_invoicereceipt` after the Gmail draft succeeds. **This is the receipt IDEMPOTENCY LATCH — and until 2026-08-04 nothing read it.** The `payment_intent.succeeded` webhook's MAP 1 **P2-4** branch now checks `rec{N}_email_sent` before chaining the receipt, because Stripe redelivers a webhook whose 200 we were too slow to return and the router has no event-id dedupe (gotcha **#327**). **The P1 ACH branch still does not check it.** Note that a populated `rec{N}_number` is NOT equivalent — the handler reuses an existing number, so it is set on a duplicate run too (**#328**). |
| `member_contrib_status` | text | |
| `c24_email_sent` | boolean | default `false` |

### Revenue share (per receipt)
Written by `automation_CONTRACT_revshare`.
| Column | Type | Notes |
|---|---|---|
| `rec1_rev_share` … `rec4_rev_share` | text | Computed share amount. |
| `rec1_rev_paid` … `rec4_rev_paid` | text | **Per-installment status of the MEMBER leg** (the strategic leg has its own `rec{N}_strat_paid` below). Written by `automation_CONTRACT_revshare`; paid via Stripe Transfers (**the Sheets writeback is gone — #164**). **Three TERMINAL values** — `Yes` / `Money Mapping` / `N/A — No Share Due` — are the whole resolved set: the handler's `isResolved` skip, the completion stamp `rec{N}_rev_completed_at` and the 02:00 sweep's candidate filter all key off exactly those. Everything else is **non-terminal and re-attempted nightly**: `Failed`, `Awaiting Connect Setup` (#303) and — **added 2026-08-24** — **`Held - Member Suspended` / `Held - Member Paused`**, the member-standing hold (`utils/member-payout-hold.ts`; no transfer, no member email, no completion stamp, released on reinstatement). Bare text with **no CHECK constraint** (#431), so every enumerating predicate has to be taught a new value by hand. |
| `rec1_rev_email_sent` … `rec4_rev_email_sent` | boolean | default `false` |
| `rec1_strat_paid` … `rec4_strat_paid` | text | **Per-installment status of the STRATEGIC leg** — a separate ladder from `rec{N}_rev_paid` (which is the member's leg only). Same vocabulary: `Yes` / `N/A — No Share Due` / `Failed`. Written by `automation_CONTRACT_revshare` when `strategic_partner_share > 0`; the daily sweep's strategic retry re-attempts **only `'Failed'`**, and the main loop treats `'N/A — No Share Due'` as resolved. **Also written up-front by `migration_backfill_map1` (2026-08-05):** every installment marked already-paid on the old system is stamped `'N/A — No Share Due'` at backfill time, because that money was collected elsewhere and the sweep must not transfer the partner a cut of it (gotchas **#277** / **#335**). **Known gap:** a `force` overwrite of an ORGANIC (never-migrated) row leaves the *unpaid* installments' stale values in place, so a stale `'Yes'` would suppress a legitimate future payout — same shape as the pre-existing `rec{N}_rev_paid` behaviour, and an open decision. Read by `Map1PricingSplitCard.jsx` for the strategic row's per-installment note (it was hardcoded to the member's `rec{N}_rev_paid` until 2026-08-05, which is why migrated strategic rows showed nothing there). |
| `rec1_strat_completed_at` … `rec4_strat_completed_at` | timestamptz | Set alongside `rec{N}_strat_paid` when the strategic leg resolves — including the backfill's pre-settle stamps. |

**Touched by (admin-api actions, all in `vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts`):**
`automation_PCADMIN_finaldecision`, `automation_PCADMIN_pricing`, `automation_PCADMIN_extrameeting`, `automation_PIP1_reconfirmationemail`, `automation_PIPFU_decision`, `automation_CONTRACT_sendagreement`, `automation_CONTRACT_ceocountersign`, `automation_CONTRACT_stripecustomer`, `automation_CONTRACT_paymentemail`, `automation_CONTRACT_loadpayment`, `automation_CONTRACT_stripecheckout`, `automation_CONTRACT_stripewebhook`, `automation_CONTRACT_confirmationemail`, `automation_CONTRACT_invoicereceipt`, `automation_CONTRACT_revshare`, `automation_load_pipeline_data`, `member_load_pipeline`, `boldsign-webhook`.

**Touched by (frontend):** [AutomationPanel.jsx](src/components/admin/AutomationPanel.jsx), [ClientTrackViewV2.jsx](src/components/admin/map1/ClientTrackViewV2.jsx), [PIPDecisionForm.jsx](src/components/admin/map1/PIPDecisionForm.jsx), [PFPricingForm.jsx](src/components/admin/map1/PFPricingForm.jsx), [PFExtraMeetingForm.jsx](src/components/admin/map1/PFExtraMeetingForm.jsx), [DecidePage.jsx](src/pages/DecidePage.jsx), [PayPage.jsx](src/pages/PayPage.jsx).

---

## `advisor_onboarding` / `accountant_onboarding` — the meeting + deposit column families *(2026-09-04, migration `20260905100000`)*

The two tables are clones of one another. This section documents only the **35 columns per table** added by the
2026-09-04 rework; the older onboarding columns are described where they are used
([../flows/advisor-accountant-onboarding.md](../flows/advisor-accountant-onboarding.md), which is the flow of
record). Derive the full list rather than trusting any count here (#402):
`select column_name, data_type from information_schema.columns where table_name='advisor_onboarding' order by ordinal_position;`

**`stripe_account` (1, each table)** *(2026-09-11, migration `20260911120000_second_stripe_account.sql`)* — additive nullable `text`, named CHECK
`<table>_stripe_account_check IN ('vfos','ert')`. **Which Stripe account this onboarding's customer and session were minted
on. NULL = legacy = `'vfos'` (VFO Services).** Paired with the pipeline's `sandbox_mode` it selects the secret key for **every**
later Stripe call on the row — `getStripeKeyFor(normalizeStripeAccount(ob.stripe_account), isSandbox)` in `stripe-checkout.ts`,
`charge-balance.ts` and `deposit-refund.ts`, and in the webhook's four PaymentIntent expansions. **`pipeline_sandbox_config.stripe_account`
decides only where a NEW customer is MINTED; this column governs everything afterwards**, because a Stripe customer id is valid on
exactly one account. **Written on the minting pass only:** `deposit-email.ts` and `stripe-customer.ts` reuse the existing stamp when
`stripe_customer_id` is already set and otherwise take the config, stamping in the same write. **NEVER re-stamped** — neither onboarding
table has a remap action (membership is the only family that does). **These two pipelines are the only ones that genuinely run on BOTH
accounts**, so the webhook cannot identify their rows by Stripe customer id alone: every advisor/accountant lookup passes the event's
account through `withStripeAccount(query, account)`, where `'vfos'` expands to `stripe_account.is.null,stripe_account.eq.vfos`.
**Backfill: `'vfos'` onto every row with a non-NULL `stripe_customer_id` — 2 advisors, 3 accountants.** Gotcha **#485**; flow:
[../flows/advisor-accountant-onboarding.md](../flows/advisor-accountant-onboarding.md).

**Preliminary-meeting reminder (12).** `meeting_date` (date) / `meeting_time` (text) / `meeting_timezone`
(text) — what the admin typed; `meeting_at` (timestamptz) — that wall clock resolved to an instant;
`meeting_reminder_due_at` (timestamptz) — **the same wall clock one BUSINESS day earlier**
(`utils/onboarding-meeting.ts reminderDueAt`); `meeting_reminder_token` (text) — the credential for
`/onboarding-meeting`; `meeting_reminder_scheduled_at` / `meeting_reminder_skipped_at` — the step's two
mutually-exclusive done-stamps; `meeting_reminder_sent_at` / `meeting_reminder_60m_sent_at` /
`meeting_reminder_10m_sent_at` — the three sweep-tier guards, each stamped **only after a successful send**;
`meeting_response` (text) + `meeting_response_at`.

**`meeting_response` vocabulary:** `'confirm'` | `'cancel'` | `'reschedule'` (bare `text`, no CHECK — #431).
The 60- and 10-minute tiers fire **only** on `'confirm'`. **A reschedule NULLs the three `*_sent_at` stamps AND
`meeting_response` / `meeting_response_at`** — a countdown ladder re-arms, the inverse of #404 (**#472**).

**Deposit (18).** `deposit_amount` (numeric, **$500-$4,000**, enforced in the handler not the DB),
`deposit_checkout_token`, `deposit_email_sent_at`, `deposit_status` (text), `deposit_payment_intent_id`,
`deposit_method_type`, `deposit_acct_last4`, `deposit_card_fee` (numeric), `deposit_completed_at`,
`deposit_confirmation_email_sent_at`, `deposit_reminder_sent_at` / `deposit_pf_notified_at` /
**`deposit_pf_ack_at`** (the sweep's 4th stall ladder + its manual ack, whitelisted in
`actions/automation/stall-ack.ts`), and the refund block `deposit_refund_id` / `_amount` / `_date` /
`_status` / `_email_sent_at`.

**`deposit_status` vocabulary:** NULL (no deposit) | `'processing'` (ACH in flight) | `'succeeded'` |
`'failed'` | `'refunded'`. Bare `text`, no CHECK.

**Balance (4).** `balance_charge_status` (text), `balance_payment_intent_id`, `balance_card_fee` (numeric),
`balance_charge_date` (date).

**`balance_charge_status` vocabulary:** NULL | `'awaiting_deposit'` (the agreement was countersigned while an
ACH deposit was still clearing — released by the deposit's own `payment_intent.succeeded` branch) |
`'processing'` | `'succeeded'` | `'failed'`. Bare `text`, no CHECK.

> **TRAP — `payment_amount` carries a column `DEFAULT 4000`.** It means the TOTAL engagement value and is
> written for real at CEO countersign. Before that, the default is indistinguishable from a written value, so
> **every derived balance figure must be gated on `agreement_signed_by_ceo_at`**, which is what the frontend
> now does. Gotcha **#469**. And `agreement_signed_by_ceo_at` itself is stamped **once-only** since 2026-09-08,
> because BoldSign redelivers `Completed` (**#470**).

`status` (`'active'` | `'stopped'`) is unchanged and documented in
[../flows/partnership-fast-track.md](../flows/partnership-fast-track.md); as of 2026-09-04 it also silences all
three meeting-reminder tiers and the deposit stall ladder.

---

## `pipeline_sandbox_config`

Per-pipeline sandbox/live toggle. Read at the top of every automation handler to decide whether to use `STRIPE_SECRET_KEY` vs `STRIPE_SECRET_KEY_SANDBOX` and `BOLDSIGN_API_KEY` vs `BOLDSIGN_API_KEY_SANDBOX`. **Since 2026-09-11 it also names the Stripe ACCOUNT — see `stripe_account` below.**

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `pipeline` | text | not null. Pipeline name key (e.g., `"map1"`). |
| `sandbox_mode` | boolean | default `true`. Master toggle. |
| `sandbox_email` | text | Email override — when set, automation emails go here instead of the real client. |
| `stripe_test_mode` | boolean | default `true` |
| `boldsign_test_mode` | boolean | default `true` |
| `stripe_account` | text | **NEW 2026-09-11** (`20260911120000_second_stripe_account.sql`). **NOT NULL, default `'vfos'`**, named CHECK `pipeline_sandbox_config_stripe_account_check IN ('vfos','ert')` — the only one of the five new columns that is `not null`, because a config row must always answer the question. **CONFIG MINTS: it decides which Stripe account a NEW customer or checkout session for that pipeline is created on, and NOTHING else.** Existing rows keep their own `stripe_account` stamp (on `member_payment_plans` / `advisor_onboarding` / `accountant_onboarding` / `gc_transactions`) and never move. Moving a pipeline to ERT is therefore **one row edit** that affects nothing already minted. Surfaced to handlers as `SandboxConfig.stripeAccount` (already normalized) by `integrations/sandbox-config.ts`. **Flipped by SQL, deliberately NOT by the UI** — `SandboxModeToggle.jsx` renders a read-only `Stripe: VFO Services` / `Stripe: ERT` pill, **evidence-gated on `sandboxConfig.stripe_account !== undefined`** so a loader that did not ship the column prints nothing rather than a confident wrong answer. `specialist_revenue_load` uses an explicit column list and so shows **no pill** — accepted. **Posture as of 2026-09-11 ~16:10Z — the column is now SPLIT 4/4: `MEMBER_MEMBERSHIP`, `GROWTH_CREDITS`, `ADVISOR_ONBOARDING` and `ACCOUNTANT_ONBOARDING` are `'ert'`; `MAP 1`, `TAX`, `PARTNERSHIP_FAST_TRACK` and `SPECIALIST_ONBOARDING` are `'vfos'`. All eight are `sandbox_mode=false`.** Remember what the flip did and did not do: **every NEW customer on those four pipelines mints on ERT, and every EXISTING row keeps its own stamp and still charges on VFO Services.** Gotcha **#485**. |
| `created_at` | timestamptz | default `now()` |

`integrations/sandbox-config.ts` `SandboxConfig` also gained an **`error`** field (2026-09-11): the PostgREST error from the config read, NULL on success **and** on a simply-missing row (which is not an error). Every pre-existing caller ignores it; callers that used to inline the read and 500 on `cfgErr` check it, **so a transient DB failure can never be read as "sandbox is off" and mint a LIVE customer.**

**Touched by:** read by every `automation_*` handler. Frontend reads/writes via `automation_load_pipelines` payload.

---

## `card_update_tokens` (Phase D)

A person-keyed one-time token backing the admin-initiated payment-method-change `/update-card` page. An admin generates a token for a specific person; the link lets that person re-enter card/bank details, which write the relevant `default_payment_method_id` (and freeze the per-installment `pay*_method`/`pay*_last4` on `pipeline_map1`). Cross-domain — `person_type` distinguishes which table the new PM id lands on (MAP1 `pipeline_map1`, tax `client_tax_plans`, specialist `specialist_onboarding`).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | identity pk |
| `token` | text | **UNIQUE.** Embedded in the `/update-card?token=…` link. |
| `person_type` | text | **CHECK IN (`'client'`, `'member'`, `'specialist'`)** — the only non-null CHECK added in Phase D. Selects the target table/flow. |
| `person_ref` | text | The person identifier — client id / member_number / expert id, interpreted per `person_type`. |
| `created_by` | text | Admin email that generated the token. |
| `created_at` | timestamptz | default `now()` |
| `expires_at` | timestamptz | Link expiry. |

**Index:** `idx_card_update_tokens_token` ON `token`.

**Email:** the link is delivered by the `card_update` email (`email_templates` id 156, pipeline `PAYMENTS`; placeholders `[First Name]` / `[UPDATE_LINK]`).

---

## `vault_upload_tokens` (vault "Request documentation", added 2026-07-30)

A **durable** per-`(entity_type, entity_key, section)` token backing the public `/vault-upload?token=` page. An admin clicks "Request documentation" on the Sensitive or General section of a client / member / specialist vault; the handler mints the row on the first request and **reuses it on every resend**, so every email ever sent against that section keeps working. Cross-domain in the same way `card_update_tokens` is — `entity_type` decides which table names the person AND which storage bucket receives the upload. Created by migration `20260730120000_vault_request_docs.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | identity pk |
| `token` | text | not null, **UNIQUE**. Minted with `token32()`. Embedded in the `/vault-upload?token=…` link. **This row is the entire credential** for the two PUBLIC actions — there is no session, no gate and no body-supplied destination (gotcha #310). |
| `entity_type` | text | not null, **CHECK IN (`'client'`, `'member'`, `'specialist'`)**. Selects the person lookup (`clients.id` / `members.member_number` / `experts.id`) via the exported `resolveVaultPerson`, and the bucket family. |
| `entity_key` | text | not null. The person identifier, interpreted per `entity_type` — and **also the storage path prefix** (`<entity_key>/<rand16>_<filename>`), which is what confines one person's uploads away from another's. |
| `section` | text | not null, **CHECK IN (`'sensitive'`, `'general'`)**. Selects the bucket within the family via `VAULT_REQUEST_BUCKETS`: client → `client-tax-returns` / `client-documents`, member → `member-tax-returns` / `member-vault`, specialist → `specialist-tax-returns` / `specialist-documents`. The ERT/VFOS third vault section is deliberately NOT addressable (#204). |
| `created_at` | timestamptz | not null, default `now()` |
| `last_requested_at` | timestamptz | nullable. Stamped every time the request email is drafted — including resends against the reused token. |
| `last_upload_at` | timestamptz | nullable. Stamped best-effort by `vault_request_upload_notify` after a successful upload; a failure here is logged, never fatal. |

**Constraints:** `UNIQUE(token)` + **`UNIQUE(entity_type, entity_key, section)`** — the second is the durability guarantee (one token per section, forever). **RLS: deny-all** (`enable row level security` + `create policy "Deny all access" … USING (false)`) in the SAME migration per invariant #1 / gotcha #141; verified with an anon-key REST probe returning `Content-Range: */0`. All access is service-role through the edge function.

**Note — no expiry column, and therefore no revoke.** Unlike `card_update_tokens` (`expires_at`) and `migration_setup_tokens` (single-use `used_at`), these tokens never expire and are never consumed. That is deliberate — a recipient who finds last month's email can still answer — but it means the only way to invalidate an outstanding link is to delete or rotate the row, which kills **every** link previously sent for that section.

**Touched by:** written by `vault_request_docs` (insert-or-reuse + `last_requested_at`) and `vault_request_upload_notify` (`last_upload_at`); read by `vault_request_upload_url` and `vault_request_upload_notify` (both **PUBLIC**). **Not** related to `clients.tax_upload_token` / `/tax-upload`, which remain a separate system.

**Email:** the link is delivered by the `VAULT_request_documentation` email (`email_templates`, pipeline `VAULT` — the only `VAULT`-pipeline row; `to ["RECIPIENT"]`, `cc` = `MEMBER` + Tracy + Tray, **`send_mode=true` as of 2026-08-03 — it AUTO-SENDS**, for all three entity types, with no admin review (gotcha #325); placeholders `[Recipient Name]` / `[Recipient First]` / `[REQUESTED_INFO]` / `[UPLOAD_BUTTON]`). Arrival raises the `VAULT_requested_doc_uploaded` bell to Tray.
