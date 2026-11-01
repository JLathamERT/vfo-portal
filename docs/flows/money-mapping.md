# Money Mapping balances — end-to-end flow

> Built 2026-10-30 / 31 (edge `claude/money-mapping-system-517bd1`, react
> `claude/money-mapping-system-1b6a4e`; `vfo-admin-api` v1070 → v1075, all from the branch).
> Narrative: [../CHANGELOG.md](../CHANGELOG.md) 2026-10-31. Table + RPC:
> [../tables/membership-fees.md](../tables/membership-fees.md) *money_mapping_ledger*. How a plan
> spends the balance: [membership-fees.md](membership-fees.md) *Paying a membership from Money
> Mapping*. *(v: 2026-10-31)*

A member whose `members.revenue_decision` is **Money Mapping** is never paid their revenue share:
MAP 1, Tax, PIP and SpecRev mark the member leg `'Money Mapping'` and VFO Services keeps the money
(the payout engines were deliberately left untouched). Since 2026-10-30 those legs become a
**balance** the member can spend on their ERT membership fees. The money spent is ERT's, so it is
moved from VFO Services to ERT.

## Jake's decisions (2026-10-30 / 31)

- The switch lives on the membership PLAN (`pay_with_mm`); **no feature switch**. Anyone with a
  balance can use it.
- The money spent goes to **ERT** (the membership is ERT's).
- A plan may **start with no card** when the balance covers the first payment.
- Members get emails saying **how each payment was made** (Money Mapping, card / bank, or both).
- **No member-portal view** of the balance yet.
- Admin adjustments **add or deduct only, never below $0** (a negative-balance version was built
  then reverted).
- **No refunds** of Money Mapping once shares are allocated.
- **Never ask a member to reply for a link** — the normal setup reminders do it.
- **Test Member emails always land in Drafts.**

## 1. Earning — `syncMoneyMappingEarnings` (`utils/money-mapping.ts`)

**Trigger:** the start of sweep pass 3 (`automation_MEMBERSHIP_sweep`, cron jobid 16
`membership-sweep-daily`), every `money_mapping_load`, and `startPlanOnMoneyMappingIfCovered`.
Never throws; returns `{ added, error? }`.

Reads every settled Money Mapping leg and inserts one `earned` row per leg not yet in the ledger
(`upsert … onConflict source_key, ignoreDuplicates` — a concurrent sweep + page load simply skips a
leg the other wrote). The amount is the payout engine's own formula, frozen at the first sync (a fee
changed later never re-prices money already credited):

| Source | Leg read | Amount (same math as) | `source_key` |
|---|---|---|---|
| MAP 1 | `pipeline_map1.rec{i}_rev_paid = 'Money Mapping'` | `member_share` split evenly over the installments, cumulative rounding (`contract-revshare.ts` cumShare) | `map1:<id>:p<i>` |
| Tax | `client_tax_plans.{retainer,implementation}_rev_paid = 'Money Mapping'` | `(member_share / total_fee) × revshareBaseFor(...)`, `member_share / 2` with no total (`tax/revshare.ts`) | `tax:<plan>:<kind>` |
| PIP | `client_priority_tracks.pip_rev_share_status = 'Completed - Money Mapping'` | `pip_rev_share_amount` | `pip:<track>` |
| SpecRev | `specialist_revenue_lines.payout_status = 'money_mapping'`, `recipient_type='member'` | `member_share` | `specrev:<line>` |

The owner is the client's `member_number` (MAP 1 falls back to the `client_ref` prefix). **Left out:**
Test Member 59524 legs and sandbox SpecRev requests — the Test Member's balance comes only from
adjustments.

## 2. The admin page — Accounting → Members → Money Mapping

`src/components/admin/MoneyMappingAccountingPanel.jsx` (section key `mm_accounting`, AdminNavBar +
`ACCOUNTING_SECTIONS` in AdminPortal). Balances only: Member, Earned, Adjusted, Spent, Balance; no
KPI tiles, no membership column; soft-tint type chips; each member's statement (newest first, with
the balance after each row and the ERT transfer status); **Adjust** (Add / Deduct, a reason required,
deduct capped at the balance in the UI) and **Add a member** (a first positive adjustment).

- `money_mapping_load` (`actions/money-mapping/ledger.ts`) — syncs first, then returns every member
  with a ledger row (`earned`, `adjusted`, `spent`, `balance`, `entries`, `is_test`,
  `revenue_decision`, their live plan's `pay_with_mm`), `totals` (Test Member left out), the
  member list for Add a member, and `sync_error`.
- `money_mapping_adjust` — body `{ member_number, mode, amount, reason }`. `mode: 'add'` writes the
  signed amount (the UI sends Deduct as a negative add); refused if it would take the balance below
  $0. The handler also accepts `mode: 'set_total'` (write the difference that makes the balance equal
  `amount`, ≥ 0 — for money earned before the portal) but **the page does not use it**. Reason
  stripped of `<>` / newlines, ≤ 300 chars; `created_by` = the admin's NAME (`gcActorFor`, #577).

Gate for both (and `membership_mm_set`): **AUTH + `ADMIN_ONLY_ACTIONS` + `TAB_ACTIONS.accounting`**
— the accounting grant is the whole boundary (#338); a member session is refused.

## 3. Spending — on a membership plan

`money_mapping_apply_to_row` (SQL, SECURITY INVOKER, service_role only) is the ONLY spender: one
transaction locks the row and the member, spends `least(balance, amount_due)` and writes both the
negative `membership` ledger row and the schedule row (`amount_due` down, `mm_applied` up, `paid` by
`money_mapping` when nothing is left). Callers: sweep pass 3 and the create click, both through
`payRowsFromMoneyMapping` (`utils/money-mapping-membership.ts`), oldest row first; a `null` (DB error)
stops the plan for the night. A row paid in full gets its receipt by an HTTP chain to the PUBLIC
service-role `automation_MEMBERSHIP_invoicereceipt` with `mm_row_ids` (never a direct call). Full
plan-side behaviour: [membership-fees.md](membership-fees.md).

## 4. Moving the money to ERT — sweep pass 3d

`sendMoneyMappingErtTransfers` (`utils/money-mapping-transfer.ts`, the only writer of
`ert_transfer_*`): every `membership` ledger row with `ert_transfer_status` NULL or `failed` → a
Stripe transfer **from the VFO Services platform balance to ERT, a connected account of VFO
Services** (secret `ERT_CONNECT_ACCOUNT_ID[_SANDBOX]`, the SpecRev ERT-share route; key
`getStripeKeyFor(STRIPE_ACCOUNT_PRIMARY, sandbox)`). No `source_transaction` (it is platform balance,
not a charge). Rules copied from `utils/tier1-licence-transfer.ts` (#489):

1. Probe `capabilities.transfers` once per destination (`connectTransfersActive`); not active, or the
   secret / key missing → `failed`.
2. Look up `transfer_group = mm-ert-<ledger id>` first; a prior un-reversed transfer → stamp `sent`
   from it, send nothing.
3. Send with `Idempotency-Key: mm-ert-<id>`, rotated (`-r<failed_at ms>`) only once the row is
   `failed`. Description *Money Mapping - ERT Membership - (<member#>) <period>*, metadata
   `pipeline=MEMBER_MEMBERSHIP`, `payment_kind=money_mapping_membership`, `member_number`,
   `ledger_id`, `plan_id`, `schedule_row_id`; the ERT-side payment memo is stamped after
   (`stampErtDestinationPayment`).
4. 2xx → `sent` (+ `_id`, `_sent_at`); a 4xx error body → `failed` (+ `_failed_at`); 5xx / 409 /
   idempotency error / network drop → status left alone (same key next time). A transfer that WAS
   sent but whose ledger write failed is belled to be marked by hand.

Callers: **sweep pass 3d** (isolated try/catch so it never stops pass 4; money, so not business-hours
gated; limit 200) and the create click (limit 50). Any failure → one bell
`MONEY_MAPPING_ert_transfer_failed` (Jake, action required, title *Money Mapping transfer to ERT
FAILED*, link `/admin?tab=accounting`), cleared by a pass that sends some and fails none. **No email,
ever.** **Proven in sandbox only** (OWED: the first live one).

## Tables touched

| Table | Read | Write |
|---|---|---|
| `money_mapping_ledger` | load, balances, sync seen-set, transfer pass | sync (`earned`), adjust (`adjustment`), RPC (`membership`), transfer pass (`ert_transfer_*`) |
| `pipeline_map1`, `client_tax_plans`, `client_priority_tracks`, `specialist_revenue_lines` (+ `specialist_revenue_requests`), `clients` | sync | — |
| `member_payment_plans` | load (`pay_with_mm`), RPC | `membership_mm_set`, `membership_plan_save` (`pay_with_mm`) |
| `member_payment_schedule` | sweep, receipt | RPC (`amount_due`, `mm_applied`, `status`, `payment_method_type`) |
| `members` | load (names, `revenue_decision`), adjust (exists) | — |
| `notifications` | — | the transfer bell, the sweep's SKIPPED bell |

## Failure modes / open questions

- **A DB error while applying the balance** → the plan is skipped for the night with a bell; nothing
  is charged (better than charging a member who has a balance).
- **The sync fails** → logged, `sync_error` on the page; the sweep carries on with the balance as it
  was.
- **Refunds:** none once shares are allocated (decision). A refunded membership row does NOT give
  Money Mapping back and does NOT reverse its ERT transfer — by hand if ever needed.
- **No member view** of the balance (decision; the receipts state it after each payment).
- **Tested 2026-11-01** (#705): ACH part payments, annual and transfer plans, a renewal, the reminder
  ladder for an active MM plan with no method. **Not exercised yet:** the ERT transfer in LIVE Stripe;
  the first real member.
- **Records:** a charge Money Mapping paid part of says so in the Stripe description ("Money Mapping
  paid $X of $Y") and metadata `money_mapping_applied`; the invoice's *Payment Method* reads "Money
  Mapping balance first[, then …]"; `/membership-pay` on an active MM plan with no method says *Set Up
  Your Payment Method* with the balance.
