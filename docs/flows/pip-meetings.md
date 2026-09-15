# PIP Meetings flow

The PIP Meetings purchase + payment + revshare chain. Added 2026-05-27 in 6 phases. Parallels MAP1's payment chain but with key simplifications: no BoldSign agreement, always 1-time payment (no quarterly), purchase initiated from a meeting's Phase 3 form rather than a separate decision step.

PIP Meetings live in the existing `client_priority_tracks` table (`track_type='pip'`) so they share the priority-track UI machinery with Regular Priorities and Tax Priorities. The purchase + payment state is denormalized onto the same row.

## Trigger graph

```
Admin clicks "+ Add Year"
  └─► msm_add_pip_meetings_for_year (inserts N tracks, pip_paid=true if from button / false if from Phase 3 form)

Admin opens a meeting and submits Phase 3 "Purchase Additional Services (optional)"
  ├─► msm_save_priority_task (records the decision on priority_progress)
  ├─► msm_update_pip_meeting (sets pip_completed_date)
  ├─► msm_save_pip_purchase (writes pip_purchase_kind, pip_purchase_*, pip_purchase_member_share/vfos_share/etc.)
  ├─► msm_add_pip_meetings_for_year (only on Additional PIP decision; paid=false, source_track_id=X)
  └─► automation_PIP_stripecustomer
        └─► automation_PIP_paymentemail (chain via service-role)

Client clicks /pip-pay?token=... → picks ACH or Card
  └─► automation_PIP_loadpayment + automation_PIP_stripecheckout (creates Checkout Session)

Stripe webhook (checkout.session.completed, metadata.pipeline='PIP')
  ├─► writes pip_payment_status / payment_method_type / acct_last4 / card_processing_fee / payment_intent_id / pip_payment_completed_at
  ├─► CARD path (already cleared) → chains, NO confirmation email:
  │     ├─► automation_PIP_invoicereceipt
  │     └─► automation_PIP_revshare
  └─► ACH path (days in flight) → chains automation_PIP_confirmationemail NOW,
        then automation_PIP_invoicereceipt + automation_PIP_revshare on
        payment_intent.succeeded once the funds settle

automation_PIP_revshare
  ├─► Revenue Share members: Stripe Connect transfer to members.stripe_account_id
  ├─► Money Mapping members: no transfer; VFO holds internally
  ├─► Member suspended/paused (2026-08-24): NO transfer, NO member email,
  │     pip_rev_share_status='Held - Member …' + one internal notice draft
  ├─► drafts member confirmation Gmail
  └─► If pip_purchase_kind='additional_pip': UPDATE client_priority_tracks SET pip_paid=true WHERE pip_purchased_from_track_id=<source>
        (also runs on the HELD branch — the client paid, so their meetings open)
```

## Tables touched

| Table | R/W | Columns |
|---|---|---|
| `client_priority_tracks` | R/W | `track_type='pip'` rows + ~30 PIP-specific columns: `pip_engagement_year`, `pip_scheduled_date`, `pip_scheduled_time`, `pip_scheduled_timezone`, `pip_completed_date`, `pip_paid`, `pip_purchase_kind`, `pip_purchase_pip_count`, `pip_purchase_gross`, `pip_purchase_member_contribution`, `pip_purchase_amount`, `pip_purchase_member_share`, `pip_purchase_vfos_share`, `pip_stripe_customer_id`, `pip_checkout_token`, `pip_payment_intent_id`, `pip_payment_status`, `pip_payment_method_type`, `pip_acct_last4`, `pip_card_processing_fee`, `pip_payment_completed_at`, `pip_payment_email_sent_at`, `pip_confirmation_email_sent_at`, `pip_invoice_number`, `pip_receipt_number`, `pip_invoice_drive_id`, `pip_receipt_drive_id`, `pip_invoice_receipt_email_sent_at`, `pip_rev_share_status`, `pip_rev_share_transfer_id`, `pip_rev_share_amount`, `pip_rev_share_completed_at`, `pip_rev_member_email_sent_at`, `pip_purchased_from_track_id` (FK back to source meeting; nullable; ON DELETE no-action) |
| `priority_progress` | R/W | Standard task progress for the 3 PIP phases + Purchase Additional Services decision (decision stored as `'Completed - <decision>'` in `status`; form data stringified into `notes`) |
| `program_client_phases` | R only | 3 phase rows seeded for `program_id=1, track_type='pip'`: Arrange PIP Meeting / PIP Meeting with client / Post PIP Meeting admin |
| `program_client_tasks` | R only | 9 task rows (1 in Arrange, 6 in Meeting-with-client, 2 in Post-Admin) |
| `clients` | R only | first_name, last_name, email, member_number, assigned_pf |
| `members` | R only | first_name, last_name, email, **member_number**, revenue_decision, stripe_account_id, **`suspended` / `paused` / `membership_arrears`** (added 2026-08-24 — the standing hold, see Step 9; `membership_arrears` replaced `membership_suspended` 2026-09-15) |
| `email_templates` | R only | 4 PIP templates (pipeline='PIP'): `PIP_meeting_confirmation`, `PIP_payment`, `PIP_confirmation`, `PIP_invoicereceipt_email` — plus, on a hold only, `MEMBERS`/`MEMBER_revshare_held` (id 230, the internal notice) |
| `pipeline_sandbox_config` | R only | Reuses `pipeline='MAP 1'` row (PIP rides on Holistic Planning's sandbox toggle) |
| `document_numbers` | R/W | Shared global counter — `INV-PIP-{clientRef}-{seq:0004}` / `REC-PIP-{clientRef}-{seq:0004}` |

## Step-by-step

### Step 1 — Add Year (admin-initiated)

[PipMeetingsTab.jsx](src/components/admin/pip/PipMeetingsTab.jsx) — admin clicks `+ Add Year` button → modal asks count → calls `msm_add_pip_meetings_for_year` with `paid=true`. Inserts N tracks with `track_type='pip'`, `pip_engagement_year=N` (auto-incremented from MAX+1), `pip_paid=true`. No purchase data yet.

### Step 2 — Schedule + meet (Phases 1-2)

Admin opens a meeting → 3 phases:
- **Arrange PIP Meeting**: "Date Scheduled for PIP Meeting" task (status_options='pip_meeting_date') writes `pip_scheduled_date` via `msm_update_pip_meeting`. List label flips to "PIP meeting scheduled for MM/DD/YYYY". Plus the "Send confirmation email to client" task — admin picks **date + time + timezone** (ET/CT/MT/PT/AKT/HT, mirrors the tax HLM step) and drafts a Gmail via `msm_pip_meeting_confirmation_email` (template `PIP_meeting_confirmation`; pre-fills from `pip_scheduled_date`/`_time`/`_timezone`; the `[Scheduled Meeting Date]` line folds in "at &lt;time&gt; &lt;tz&gt;" when a time is given). **RESCHEDULE (2026-08-16, v747) — frontend-only:** the sent step offers **Reschedule**, reopening the same form and re-sending the same template. It needed no `reschedule` flag because the handler **already** pre-fills from those three columns and diffs them, and PIP has **no reminder ladder to re-arm** (there is no PIP reminder cron at all — see Failure modes). Contrast the PFT and specialist sites, which do need the flag (#404).
- **PIP Meeting with client**: "PIP Meeting presentation" dropdown (Completed / No show — selecting an option auto-stamps today's completed date, shown as read-only text, not an editable date field) + 5 discussion checkboxes (status_options='pip_checklist'). All save via standard `msm_save_priority_task`.
- **Post PIP Meeting admin**: "Purchase Additional Services (optional)" enter-details form → see Step 3.

### Step 3 — Purchase Additional Services form ([PipPurchaseDecisionForm.jsx](src/components/admin/pip/PipPurchaseDecisionForm.jsx))

Decision dropdown with 3 options:
- **No** — single-click submit; no further form fields; no payment chain
- **Tax Planning (if not purchased already)** — shows Pricing + Revenue Split sections (mirrors MAP1's PIPDecisionForm); on submit fires payment chain
- **Additional PIP meeting(s)** — first asks "How many PIP meetings paid for?", then same Pricing + Revenue Split sections; on submit fires payment chain AND inserts N locked meetings (`pip_paid=false`, `pip_purchased_from_track_id=<this track>`)

Validations: gross required, member share + VFOS share must sum to net invoice value within $0.01.

Submit chain (auth context, sequential awaits):
1. `msm_save_priority_task` — records decision on priority_progress, stringifies form to `notes`
2. `msm_update_pip_meeting` — sets `pip_completed_date=today`
3. `msm_save_pip_purchase` — writes pip_purchase_* columns (NULL pricing if "No" branch)
4. `msm_add_pip_meetings_for_year` — only on Additional PIP, with `paid=false` + `source_track_id`
5. `automation_PIP_stripecustomer` — only on Tax Planning / Additional PIP (NOT "No")

After the form locks itself into view mode (collapsed by default; click row to expand).

### Step 4 — Stripe customer + payment email

`automation_PIP_stripecustomer` (PUBLIC): creates Stripe customer with `metadata.pipeline='PIP'`, `metadata.priority_track_id`, generates 64-char hex `pip_checkout_token`, writes both columns, sets `pip_payment_status='pending'`. Chains to `automation_PIP_paymentemail` via service-role HTTP.

`automation_PIP_paymentemail` (PUBLIC): loads template `PIP_payment`, substitutes `[Client Name]`, `[Client First]`, `[Purchase Description]` ("Tax Planning" or "N additional PIP meetings"), `[PAYMENT_LINK]` (HTML button to `/pip-pay?token=...`), `[Payment Amount]`. Drafts Gmail to client. Writes `pip_payment_email_sent_at`. AI PC Admin sub-step #1 flips green when this lands.

### Step 5 — Client clicks /pip-pay link

[PipPayPage.jsx](src/pages/PipPayPage.jsx) — clone of MAP1's PayPage. On mount: `automation_PIP_loadpayment` returns `client_name`, `service_level` (= purchase description), `payment_amount`. UI shows ACH / Card cards with fee math identical to MAP1 (card grossed up with 2.9% + $0.30). User clicks one → `automation_PIP_stripecheckout` creates Checkout Session with `payment_method_types=[card|us_bank_account]`, `mode=payment`, metadata `pipeline='PIP'`, `payment_kind='purchase'`, `priority_track_id`, `checkout_token`. Returns Stripe URL; page redirects.

### Step 6 — Stripe webhook routes by metadata

[router/webhooks.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/router/webhooks.ts) — on `checkout.session.completed`:

1. MAP1 lookup by `stripe_customer_id` (existing)
2. Tax lookup as fallback (existing)
3. Advisor lookup as fallback (existing)
4. **PIP lookup as final fallback** — `client_priority_tracks WHERE pip_stripe_customer_id=<customer> AND track_type='pip'`. Skips if `pip_payment_status='succeeded'` already.

Writes columns: `pip_payment_status` (`'succeeded'` for card / `'processing'` for ACH), `pip_payment_method_type`, `pip_acct_last4`, `pip_card_processing_fee` (card only — derived from PI `amount_received - baseAmount`), `pip_payment_intent_id`, `pip_payment_completed_at` (card only; ACH waits for pi.succeeded).

**One email at purchase time, selected by method** (the system-wide purchase-email policy — card = invoice/receipt only, ACH = confirmation now + docs at settle):

- **Card path** (already cleared) chains 2 handlers immediately via service-role HTTP — `automation_PIP_invoicereceipt` + `automation_PIP_revshare`. **No confirmation email at all**: the invoice/receipt lands in the same moment and says everything the confirmation would.
- **ACH path** chains `automation_PIP_confirmationemail` immediately (it exists to break the multi-day silence before settlement), then `automation_PIP_invoicereceipt` + `automation_PIP_revshare` on `payment_intent.succeeded` (gated by `pi?.metadata?.pipeline === "PIP"`) once the funds clear.

The card branch never reaches `payment_intent.succeeded` (its status is already `succeeded`), so that block is an ACH-settlement path plus an idempotent safety net.

### Step 7 — Confirmation email *(ACH only)*

`automation_PIP_confirmationemail` (PUBLIC): loads template `PIP_confirmation`, substitutes `[CARD_FEE_TEXT]` and `[PROCESSING_TIME]` ("Please allow 2-4 business days…"). Drafts Gmail. Writes `pip_confirmation_email_sent_at`. Idempotent.

**Only the ACH path chains it.** The gate is at the webhook CALL SITE (`isCardP`), not inside the handler — unlike MAP 1 / Tax, this handler owns nothing but the email, so there are no side effects to preserve for card. A card purchase therefore leaves `pip_confirmation_email_sent_at` NULL forever; the admin panels render that step as "skipped", not pending.

### Step 8 — Invoice & receipt

`automation_PIP_invoicereceipt` (PUBLIC): generates `INV-PIP-{clientRef}-{seq:0004}` and `REC-PIP-{clientRef}-{seq:0004}` from shared `document_numbers` counter. Renders HTML via `utils/pip-html-templates.ts` (`generatePipInvoiceHTML` + `generatePipReceiptHTML`) — clones MAP1's layout but with **Purchase Details** box (no Service Level), single-row Payment Schedule (always 1 of 1), no Next Payment box, single ✓ Paid checkmark on the Total Charged row (card) or Payment 1 row (ACH). PDFs via html2pdf.app, uploaded to client's Drive folder, attached to a Gmail draft via template `PIP_invoicereceipt_email`. Writes `pip_invoice_number`, `pip_receipt_number`, `pip_invoice_drive_id`, `pip_receipt_drive_id`, `pip_invoice_receipt_email_sent_at`. Idempotent.

### Step 9 — Revenue share + unlock

`automation_PIP_revshare` (PUBLIC). **The branch chain was made EXHAUSTIVE 2026-08-24** (#303 shape — it used to initialise `revPaidValue` to the terminal `'N/A — No Share Due'` with the transfer behind a condition); the ORDER below is the code order and is load-bearing:

1. Reads `member.revenue_decision`
2. **Money Mapping** → no transfer. `revPaidValue='Money Mapping'`, `pip_rev_share_status='Completed - Money Mapping'`.
3. **No share due (share ≤ 0)** → `revPaidValue='N/A — No Share Due'`.
4. **MEMBER SUSPENDED / PAUSED — the standing hold (2026-08-24)** *(v: 2026-08-24)*. `memberHoldReason` (`utils/member-payout-hold.ts`) reads `suspended` → `"suspended"`, else `paused` → `"paused"`, else `membership_arrears` → `"arrears"` (2026-09-15). `pip_rev_share_status` = **`'Held - Member Suspended'`** / **`'Held - Member Paused'`** / **`'Held - Member In Arrears'`** — **non-terminal**: no transfer, **no member email** (the send below is gated on Yes / Money Mapping / N/A, so `pip_rev_member_email_sent_at` stays NULL), and the update deliberately **omits both `pip_rev_share_transfer_id` and `pip_rev_share_completed_at`** so nothing downstream reads the leg as finished. Sits ABOVE the no-account branch so a suspended member never lands on the `Pending` failure bell. One internal Gmail **draft** per hold episode (`MEMBERS`/`MEMBER_revshare_held`, To Paul, Cc Anton/Tray/Tracy, `Revenue type: PIP`), deduped on the status read **before** this run's writes.
5. **Revenue Share + no `stripe_account_id`** → `revPaidValue='Failed'` → `pip_rev_share_status='Pending'` + the Jake failure bell.
6. **Revenue Share + share > 0 + `stripe_account_id` set** → Stripe Connect transfer of `pip_purchase_member_share`. `revPaidValue='Yes'`, `pip_rev_share_status='Completed - Revenue Share'`, records `pip_rev_share_transfer_id`. A missing `STRIPE_KEY` env var also → `Failed`/`Pending`.

Writes `pip_rev_share_amount` always; `pip_rev_share_completed_at` on every non-held outcome. Drafts inline-HTML member confirmation Gmail (Revenue Share / Money Mapping / no-share banner styling matches MAP1's pattern) and writes `pip_rev_member_email_sent_at` — **neither on a held leg**.

**Unlock**: if `pip_purchase_kind='additional_pip'` AND (Yes OR Money Mapping **OR held**), `UPDATE client_priority_tracks SET pip_paid=true WHERE pip_purchased_from_track_id=<source track> AND pip_paid=false`. This is what unlocks the newly-purchased child meetings so the admin can click into them. **The held case was added deliberately (2026-08-24): the CLIENT has paid, so the meetings they bought must open even while the member's own share is parked.** (Contrast a `Pending` failure, which still leaves them locked.)

**Releasing a held leg — two paths.** (a) The **02:00 MAP 1 revshare sweep** gained a final pass that re-fires `automation_PIP_revshare` for every `track_type='pip'` row whose `pip_rev_share_status` is one of the two held values — held ONLY, so `Pending` failures stay manual. (b) Clearing the member's flags (profile save, or the membership sweep's auto-unsuspend) fires `releaseHeldMemberPayouts`, which chains `{action:"automation_PIP_revshare", priority_track_id}` immediately. Both are safe to re-fire on a member who is still flagged: the handler re-checks standing and re-holds idempotently. See [07-server-chains.md § Member reinstatement](../architecture/07-server-chains.md).

**Idempotency note:** the "already done" skip at the top of the handler matches only `pip_rev_share_status` starting with `Completed`, so a **held row is deliberately NOT resolved** and every re-fire runs the engine again.

**No Tracy's-sheet verification** — PIP revshare uses the values stored directly on the track row from the form (member_share / vfos_share already split by admin at purchase time). Different from MAP1, which verifies against Tracy's Sheets first.

## Differences from MAP1

| Aspect | MAP1 | PIP |
|---|---|---|
| Entry point | C81 → C13 PIP Follow Up decision | Phase 3 "Purchase Additional Services" form |
| BoldSign agreement | Yes (C16/C17/C18) | None |
| Payment plan | Quarterly OR one-time | Always one-time |
| Schedule rows in invoice | 1-4 | 1 |
| Card-fee math | Same (gross-up: `(base + 0.30) / (1 - 0.029)`) | Same |
| `payment_intent_data.setup_future_usage` | `off_session` (for quarterly P2-P4 auto-charge) | NOT set (1-time only) |
| Webhook metadata discriminant | `metadata.pipeline='MAP 1'` (implicit) | `metadata.pipeline='PIP'` + `metadata.payment_kind='purchase'` |
| Tracy's-sheet verification | Required before revshare succeeds | Not used (form-supplied splits trusted) |
| Sandbox config | `pipeline='MAP 1'` | Reuses `pipeline='MAP 1'` (no separate row needed) |
| Tracy intro email | Yes (after first payment) | None |
| Reminder cron | MAP1 sweep (3 stalls × 2-business-day reminder + 4-business-day PF bell, #396) | None — PIP purchases are admin-driven, no client-side waits worth chasing. **(Since 2026-08-24 PIP does get ONE cron touch: the 02:00 MAP 1 revshare sweep's final pass re-fires held member legs — a payout backstop, not a reminder ladder.)** |

## Failure modes

1. **Stripe Connect transfer fails** (`insufficient_capabilities_for_transfer`, or member has no `stripe_account_id`) → `pip_rev_share_status='Pending'`. Locked child meetings stay locked. Admin can manually re-fire `automation_PIP_revshare` after fixing the Connect setup. **`Pending` is still MANUAL-ONLY** — the 2026-08-24 nightly backstop re-fires the two `Held - Member …` statuses and nothing else.
   **1a — Member suspended / paused at payout time (2026-08-24)** → `pip_rev_share_status='Held - Member …'`, no transfer, no member email, no completion stamp — but the child meetings DO unlock and one internal notice draft goes to Paul. It self-releases: nightly via the 02:00 sweep's held pass, or instantly when the member's flags are cleared.
2. **ACH cleared but pi.succeeded missed** → track stays at `pip_payment_status='processing'`. No reminder cron for PIP; recovery is manual (re-fire `automation_PIP_invoicereceipt` + `automation_PIP_revshare` via service-role — the ACH confirmation already went out at checkout time).
3. **Webhook fires for a PIP purchase before Phase 4 was deployed** → tracks stay at `pip_payment_status='pending'`. Recover by manually UPDATEing payment columns + firing `automation_PIP_invoicereceipt` + `automation_PIP_revshare` (plus `automation_PIP_confirmationemail` only if the purchase was ACH).
4. **Idempotency** — all four chain handlers (confirmation, invoicereceipt, revshare) are guarded by their respective `*_sent_at` or `_status` column. Re-firing the chain on an already-completed track is a no-op. **The revshare guard matches `Completed…` only**, so a `Pending` or `Held - Member …` row re-runs by design.

## Frontend surfaces

| Surface | File |
|---|---|
| PIP Meetings tab (per-client list view) | [PipMeetingsTab.jsx](src/components/admin/pip/PipMeetingsTab.jsx) — shows year-grouped meetings, "Add Year" button, "PIP meeting scheduled for…" / "PIP meeting completed on…" labels, locked-meeting visual styling |
| Purchase decision form | [PipPurchaseDecisionForm.jsx](src/components/admin/pip/PipPurchaseDecisionForm.jsx) — decision dropdown + per-branch pricing form |
| Payment landing page | [PipPayPage.jsx](src/pages/PipPayPage.jsx) — `/pip-pay?token=` — clone of MAP1 PayPage |
| Automation panel | [PipAutomationPanel.jsx](src/components/admin/PipAutomationPanel.jsx) — admin pipeline view; one row per PIP track with purchase data |
| Skeletons | [Skeleton.jsx](src/components/shared/Skeleton.jsx) — `PipMeetingsListSkeleton`, `PipMeetingDetailSkeleton` |

## Backend handlers

| Action | File | Visibility |
|---|---|---|
| `msm_load_pip_phases` | `actions/msm/load-pip-phases.ts` | AUTH |
| `msm_add_pip_meetings_for_year` | `actions/msm/add-pip-meetings-for-year.ts` | AUTH |
| `msm_update_pip_meeting` | `actions/msm/update-pip-meeting.ts` | AUTH |
| `msm_save_pip_purchase` | `actions/msm/save-pip-purchase.ts` | AUTH |
| `msm_pip_meeting_confirmation_email` | `actions/msm/pip-meeting-confirmation-email.ts` | AUTH |
| `automation_PIP_stripecustomer` | `actions/msm/pip-stripe-customer.ts` | PUBLIC |
| `automation_PIP_paymentemail` | `actions/msm/pip-payment-email.ts` | PUBLIC |
| `automation_PIP_loadpayment` | `actions/msm/pip-load-payment.ts` | PUBLIC (token) |
| `automation_PIP_stripecheckout` | `actions/msm/pip-stripe-checkout.ts` | PUBLIC (token) |
| `automation_PIP_confirmationemail` | `actions/msm/pip-confirmation-email.ts` | PUBLIC (chain) |
| `automation_PIP_invoicereceipt` | `actions/msm/pip-invoice-receipt.ts` | PUBLIC (chain) |
| `automation_PIP_revshare` | `actions/msm/pip-revshare.ts` | PUBLIC (chain) |
| `automation_load_pip_pipelines` | `actions/msm/automation-load-pip-pipelines.ts` | AUTH |

Plus existing `msm_save_priority_task` was extended to persist `notes` (used to roundtrip form data through `priority_progress.notes`).

## Open questions / not yet built

- **No reminder cron** for stalled PIP payments. If a client never clicks `/pip-pay`, the link does not auto-resend. Could be added later if needed (would mirror MAP1's `_revshare_sweep` reminder ladder). **Still true as of 2026-08-24** — the held-payout pass added to the 02:00 MAP 1 sweep that day is a payout backstop for `Held - Member …` rows only; it sends nothing and chases nobody.
- **No deep-link to a specific PIP meeting** via URL. `PipMeetingDetailSkeleton` exists but is currently unreachable (the parent only enters detail view by user click, which has all data in memory).
- **Auto-complete trigger** for `pip_completed_date` — wired but currently only set on Phase 3 submit. There's no specific "meeting held" task that triggers it from Phase 2.
