# VFOS IAG Inter-Company Transfer

**The sixth + New Payment method of VFO Specialist Revenue** (Accounting → Specialists → VFO Specialist Revenue, Jake 2026-11-25). VFO bills the IAG specialist, but nothing is paid on a pay page: the request goes into **IAG's own portal**, where a superadmin accepts it (IAG's Stripe balance pays VFO Services) or denies it. Money that arrives is split exactly like any other SpecRev payment.

The IAG half lives in IAG's repos (`iag-edge-functions`, `iag-portal`, `docs/flows/intercompany-transfers.md` there). *(v: 2026-11-25)*

## The path

| Step | Where | What happens |
|---|---|---|
| Send | `specialist_revenue_send_request`, `payment_method: 'inter_company'` | The specialist is forced to `INTER_COMPANY_EXPERT_ID` (`constants/iag-portal.ts`, whatever the body says). Row `requested` + method `inter_company` + a fresh `intercompany_key`, lines, then IAG is told (`intercompany_receive`). IAG refusing or not answering = the row is deleted and nothing is sent. Then the email, fail-soft |
| Email | `SPECREV_inter_company_request` | To IAG's two people, literal addresses on the template; the button opens `<IAG portal>/inter-company-transfers?request=<IAG id>`. Reminder `SPECREV_inter_company_reminder` at 2 business days, the Tracy bell at 4, both from the payout sweep's existing ladder |
| Check | `specialist_revenue_intercompany_check` (PUBLIC, signed) | IAG asks, after claiming the request and before any money: still open, for this amount? |
| Accept | `specialist_revenue_intercompany_result` (PUBLIC, signed) | **Live: the money is proved on OUR Stripe first** — the `py_` payment on VFO Services, its amount, its `source_transfer` = the transfer IAG named, not reversed. Then `received`, the memo is stamped on the payment, and the invoice and receipt (`SPECREV_inter_company_invoice_receipt`) and the payout engine run in the background |
| Deny | same action | `payment_status = 'denied'` (terminal) + reason + bell `SPECREV_inter_company_denied`. No money, no shares |
| Delete | `specialist_revenue_delete_request` on an unanswered one | IAG is asked to cancel first (`intercompany_withdraw`); refused once IAG has started paying, 502 when IAG cannot be reached |

`payment_status`: `requested` → `received` | `denied`. Columns: `intercompany_key` (the id both portals share, unique), `_ref` (IAG's row id), `_answered_at` / `_by`, `_deny_reason`, `_transfer_id`, `_payment_id` (unique on live rows: one arrival never settles two requests). Migration `20261125200000_specrev_inter_company.sql`.

## The signed connection

`utils/intercompany.ts`, **with a twin in the IAG backend: change both together.** A call is `{ action, payload, t, sig }`, `sig` = HMAC-SHA256 over `action.t.payload`, refused after five minutes. Two secrets, one per money mode, on BOTH projects: `INTERCOMPANY_SECRET` (live) and `INTERCOMPANY_SECRET_SANDBOX` (test). **The secret that verifies a call IS its mode**, and every lookup is filtered by that mode. The two VFO actions are in no gate list: the signature is the whole credential.

IAG has no test site. The test site talks to IAG's live backend in sandbox mode: the request carries the tester's own backend URL (checked against VFO's test project), a test connected account stands in for VFO Services, and the proof on our Stripe is skipped because that account is not ours.

## Why it cannot pay twice or pay a dead request

- IAG's claim is a conditional update; a cancel only works before it, and the check only after it.
- IAG's transfer carries a per-attempt idempotency key and a `transfer_group`; an attempt that never answered is settled by asking Stripe for that group, never by sending again.
- Our booking is a conditional update off `requested`; a repeated result answers `already`.
- VFO never books on IAG's word alone (live). A mismatch raises the action-required bell `SPECREV_inter_company_failed`, pays nobody, and clears itself when IAG's retry is booked.

## Traps

- **VFO Services must be a connected account of IAG** (Stripe OAuth, the recipe in [../integrations/stripe.md](../integrations/stripe.md) with IAG as the platform). **Linked live 2026-11-25**, `read_write`: Stripe offers a platform nothing smaller, so IAG's Stripe can read and act on the VFO Services account. Removing it (VFO Services' Stripe dashboard) stops every transfer. The id is IAG's secret `VFOS_CONNECT_ACCOUNT_ID`.
- The transfer draws on IAG's **available Stripe balance**. Too low = Stripe refuses, the request goes back to waiting.
- A transfer reversed on IAG's Stripe is **not** seen here; IAG's bell says to tell VFO.
- Request numbers are never shown to a person in this feature (Jake 2026-11-25): bells name the amount, the recipients and the day.
- The screen's statuses: **Requested from IAG**, **Payment received**, **Denied by IAG** (`specialistRevenueShared.jsx`).
