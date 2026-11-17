# SDP - Advanced Tax Strategy Governance (ATSG)

> Built 2026-11-17 (Jake). Code: `vfo-edge-functions` `supabase/functions/vfo-admin-api/actions/sdp-atsg/*`, website `src/components/sdp-atsg/SdpAtsgPanel.jsx` + `src/pages/SdpAtsgPayPage.jsx`. Migrations `20261117120000_sdp_atsg.sql` (tables, column, agreement, bells, job) and `20261117120100_sdp_atsg_emails.sql` (the 10 emails). Verify against the code before relying on a detail here (#399).

## What it is

A one-off track for the tax planning partner **SDP Personalized Planning**. SDP's own planners and team members add **their own clients** under one of our members and run them through:

1. **ATSG Advisory Retainer** — one yearly figure, billed annually (1 payment), quarterly (4) or monthly (12). The last payment takes any cents left over. **One year, then done** (no renewal).
2. **Engagement agreement** — the client signs in BoldSign, then SDP's CEO countersigns (`ATSG_CEO` in `shared.ts`), then the client is emailed the payment link.
3. **Payments** — the first on the client's link; later ones charged automatically by the daily sweep on the saved card or bank.
4. **Strategy Impact Fees** — any number of one-off fees (amount, meeting date, strategy name), each with its own pay link. Locked until retainer payment 1 is paid.

**Entirely separate from our own clients by design (Jake):** its own tables (`sdp_atsg_*`), its own invoice / receipt numbering (`INV-` / `REC-<client_ref>-NNNN` on the payment row — never `document_numbers`), its own held shares (on the payment row — never `member_held_shares`). Nothing here reads or writes `clients`, `client_tax_plans` or any program. Client refs are `<member>-SDP001`, `-SDP002`...

## Who can use it

| Caller | How | Scope |
|---|---|---|
| A **tax planner or team member** | the planner portal tab *SDP - Advanced Tax Strategy Governance*, shown when `sdp_atsg_access_load` says so | only when their group (`tax_planners.member_type` → `tax_planning_groups.name`) has `atsg_enabled`; only that group's cases (`loadCaseFor`) |
| An **admin** | More > **SDP ATSG**, granted per admin in the Admin Editor (tab key `sdp_atsg`, `TAB_ACTIONS.sdp_atsg`) | every case |
| The **client** | `/sdp-atsg-pay?token=` (PUBLIC, token only) | the token row's own case or fee |

Every handler calls `resolveAtsgCaller` (admin, or a planner of an `atsg_enabled` group, else 403) and `loadCaseFor` (a planner reaches only their group's cases) — the allowlists alone are not the fence (#257). The authed actions are in `ADMIN_ONLY_ACTIONS` (never a member's) and `TAX_PLANNER_ALLOWED_ACTIONS`. Live: `atsg_enabled` is on for SDP Personalized Planning only; on the test site every test group has it (`utils/staging-test-member.ts`).

## The money

- Every payment lands on the **VFO Services** Stripe account (`STRIPE_ACCOUNT_PRIMARY`; sandbox per `atsgSandbox`).
- **Split, locked:** 47.5% SDP (the group's Connect account) / 47.5% the member / 5% VFO Services, on the payment **before** any card fee (`splitAmounts`). The card fee (2.9% + $0.30 grossed up, `cardChargeCentsFor`) stays with VFO Services. ACH has no fee. The split is stamped on the row at the payout (`sdp_share` / `member_share` / `vfos_share`, #659).
- Transfers carry `source_transaction` (the client's charge); Stripe refuses a `transfer_group` beside it when the charge already has one, so `transfer_group` is set only when there is no charge to tie to (#759).
- **The member's share is held, never paid,** when the member is suspended / paused / in arrears (`held_suspended` / `held_paused` / `held_arrears`, with the usual held notice), or has no working payout account (`awaiting_connect`: the usual payout-setup request email, unless one already went, plus Jake's bell). The daily sweep pays it once the hold clears. SDP's share is held the same way if SDP's account stops working.

## Step by step

| Step | Action / trigger | What happens |
|---|---|---|
| Add client | `sdp_atsg_case_create` | A case row, status `new`. Member picked from `sdp_atsg_members_load`. |
| Retainer | `sdp_atsg_save_retainer` | `retainer_amount` + `frequency`; editable until the agreement is sent. |
| Preview | `sdp_atsg_agreement_preview` | The PDF exactly as it would be sent. |
| Send agreement | `sdp_atsg_send_agreement` (claims `agreement_sent_at` first) | Renders `agreement_templates` pipeline `SDP_ATSG` with html2pdf (Letter, margin 0, #535), sends through BoldSign with the client first and the CEO second (EnableSigningOrder), emails `SDP_ATSG_agreementsent` with the embedded signing link. BoldSign sends no emails of its own. Status `agreement_sent`. |
| Client signs | BoldSign `Signed` → `boldsign-webhook` → `automation_SDP_ATSG_boldsign_event` | Status `client_signed`; `SDP_ATSG_ceocountersign` to the CEO with his embedded link; bell. |
| CEO signs | BoldSign `Completed` → same | Status `awaiting_payment`; Stripe customer + the case's durable `pay_token`; the retainer rows; `SDP_ATSG_paymentemail`; bell. |
| Declined / Expired / Revoked | BoldSign event → same | The case goes back to `new` (agreement fields cleared) with `agreement_declined_at` + `agreement_declined_event`; the case screen shows the event as a chip and a notice above the pricing form; bell. |
| First payment | `/sdp-atsg-pay` → `sdp_atsg_pay_checkout` (Stripe Checkout, card or ACH) → Stripe webhook | Card: row `paid` at once. ACH: `processing` + `SDP_ATSG_ach_confirmation`, `paid` when it clears. A quarterly / monthly retainer saves the method and sets the year's due dates. Status `active`. |
| Settle (every paid row) | `automation_SDP_ATSG_settle` (chained in the background) | Invoice + receipt PDFs (one invoice per retainer, re-issued with each payment; a fee has its own), saved to Drive `SDP ATSG/<client - ref>/`, emailed in `SDP_ATSG_invoicereceipt`; the two transfers; the two revenue-share emails (`SDP_ATSG_revshare|sdp`, `SDP_ATSG_revshare|member`). |
| Later payments | `automation_SDP_ATSG_sweep`, daily 13:20 UTC (`sdp-atsg-sweep-daily`) | Charges every due retainer row off-session on the saved method. A decline: the row goes `missed`, `SDP_ATSG_payment_failed` to the client (once per row), Jake's bell. Missed rows are collected again alongside the next row that falls due, oldest first, stopping at the first refusal. Then retries anything paid but not settled (10+ minutes after `paid_at`), then marks a case whose retainer rows are all paid `completed`. |
| Pay what was missed | the failure email's link (the case `pay_token`) | Collects every missed row in one Checkout and saves the new method. The page shows an amber notice naming the missed payments and their due dates, and "- missed" on each line. |
| Update payment method | `sdp_atsg_send_update_link` → `SDP_ATSG_update_method` → `/sdp-atsg-pay?token=…&update=1` | Stripe Checkout in setup mode: saves the new card or bank, charges nothing. |
| Strategy Impact Fee | `sdp_atsg_impact_fee_create` | A `requested` row with its own `pay_token`; `SDP_ATSG_impactfee_request` to the client. The strategy name joins `sdp_atsg_strategies` for good. No Resend or Cancel (Jake). |
| Stop | `sdp_atsg_stop` (the Live / Stopped switch; one way) | Every scheduled / requested / missed / declined row `canceled`; the case `stopped`; its pay links close; the sweep skips it. Payments already made stay. |
| Payout setup | `sdp_atsg_member_payout_request` | The usual payout-setup request, for this case's member only (#490). |

## Statuses

- `sdp_atsg_cases.status`: `new` → `agreement_sent` → `client_signed` → `awaiting_payment` → `active` → `completed`, or `stopped` from any point.
- `sdp_atsg_payments.status`: `scheduled` | `requested` (an impact fee) | `processing` (ACH) | `paid` | `missed` (a later retainer row that failed) | `declined` (a first payment or fee that failed) | `canceled`.
- Payout statuses: `paid` | `awaiting_connect` | `held_suspended` | `held_paused` | `held_arrears` | `failed` (retried by the sweep with a fresh idempotency key, #489).

## Emails and bells

- **10 emails**, pipeline `SDP_ATSG`, all Send mode, in their own section of the Email Templates tab. Client emails go To the client, Cc the member and SDP (the group contact + whoever opened the case). Each subject ends with the person's name (`withSubjectName`, #679). "SDP Personalized Planning" is fixed text, never a placeholder.
- **7 bells**, Jake only, in their own colour (fuchsia `#c026d3`): client signed, CEO countersigned, agreement declined / expired / revoked, payment received, payment failed, transfer failed, member share held. A failure / held / transfer bell's title ends with the payment's label, so a second event on the same case is not de-duplicated away while the first is unread (#758).

## Testing it on the test site

- Run the sweep exactly as the job does: `do $$ begin execute (select command from cron.job where jobname='sdp-atsg-sweep-daily'); end $$;` — the request leaves only when that statement commits, so read `net._http_response` in a LATER call (#760).
- A card that saves but declines every charge: Stripe's `4000 0000 0000 0341`, entered through the update-payment-method link.
- Agreement Declined / Expired / Revoked only arrive if the BoldSign webhook subscribes to them (#757).
- The test site's reset clears SDP data with the rest: a test team's reset deletes its group's cases (`clearStagingTeamWork`), a test member's reset its cases (`MEMBER_KEYED_LOOSE`), and the full wipe all three tables (`STAGING_WIPE_TABLES`).
