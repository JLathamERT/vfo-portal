# Member Membership Fees — end-to-end flow

> Built 2026-07-13 (`claude/member-membership-fees`, backend v585–v591). Advisor + accountant
> members pay their annual membership through the portal: admin sets terms, the member pays
> their first payment at a public link, and a daily sweep runs every charge after that.
> Admin surface: **Accounting → Members → Advisor Membership Fees / Accountant Membership Fees**
> (`src/components/admin/MembershipFeesPanel.jsx`; actions also under `TAB_ACTIONS.accounting`).
> **Gating SPLIT 2026-08-04 (v700), then COLLAPSED to FULL PARITY 2026-08-07 (v707).** The 08-04
> split relaxed the two `AdminPortal.jsx` mounts from `session.is_superadmin` to
> `canSeeTab('accounting')` and put every money control behind a new `isSuperadmin` prop, so an
> accounting-tab admin saw read-only cards, the schedule, the pause history and the **Renewal
> meeting** section and nothing that spends money (#333). **That split is GONE.** On 2026-08-07 the
> user decided the `accounting` grant is the WHOLE boundary — *"they should see all sections and
> be able to do anything they want within those sections like i can"*. Both mounts now pass
> **`isSuperadmin={canSeeTab('accounting')}`**, so the prop still exists (and still guards every
> money control in the panel) but is fed the TAB GRANT rather than the superadmin flag: a granted
> admin gets Set Up Payments / create, setup + update links, the auto-renew toggle, next-year
> terms, Pause, Terminate, cancel and resend/reminder. Correspondingly **every `membership_*`
> handler dropped its in-handler `auth.isSuperadmin` 403** — `TAB_ACTIONS.accounting` is now the
> only gate on the whole family. Gotcha **#338** (and #333, whose "TWO deliberate exceptions"
> framing is superseded by this).
> Sandbox: `pipeline_sandbox_config` row `MEMBER_MEMBERSHIP`
> (badge on both panels — **SANDBOX as of 2026-07-13**). Gotchas #215–#217.

---

## Which Stripe account a plan bills on *(2026-09-11, v829)*

Membership fees are one of the three money flows now billed on the **ERT** Stripe account (Elite Resource Team LLC); the other two are Growth Credit purchases and advisor/accountant onboarding. Full rules: [../integrations/stripe.md](../integrations/stripe.md#two-stripe-accounts-2026-09-11). Two of them apply here, and they answer different questions.

**CONFIG MINTS.** `pipeline_sandbox_config` row **`MEMBER_MEMBERSHIP`** gained **`stripe_account`** (`'vfos'` default, `CHECK IN ('vfos','ert')`). It decides which account a **NEW** Stripe customer is minted on — nothing else. It is flipped **by SQL, never from the UI**; `SandboxModeToggle.jsx` shows a read-only `Stripe: VFO Services` / `Stripe: ERT` pill beside the LIVE/SANDBOX button.

> **LIVE ON ERT since 2026-09-11 ~16:10Z.** The row was flipped by SQL to **`stripe_account='ert'` with `sandbox_mode=false`**, so every NEW membership customer mints on ERT. The flip itself moved nothing already minted — that is what splitting the two rules buys — and the existing plans were then moved separately, later the same day: **`membership_stripe_remap` HAS BEEN RUN, 37 of 37 plans moved, 0 left on `vfos`** (below). **Membership fees now bill entirely on ERT.** The first ORGANIC ERT sweep pull is **Charles West 59046, `$1,500`, due 2026-09-12 at 12:00Z**, then Timothy Feitosa 58156 (`$1,042`) and Jeffery Hill 59123 (`$667`) on 2026-09-15.

**THE PLAN'S STAMP GOVERNS.** `member_payment_plans.stripe_account` is nullable; **NULL = legacy = `vfos`**. Every later Stripe call for that plan resolves its key as `getStripeKeyFor(normalizeStripeAccount(plan.stripe_account), !!plan.sandbox)` — **the plan's own `sandbox` flag for the mode, the plan's own stamp for the account, never the config for either.**

| Handler | Account source |
|---|---|
| `membership_send_setup_link` (`send-setup-link.ts`) | **The only handler that reads the config** — and only when it actually mints a customer: `reusableCustomerId ? normalizeStripeAccount(plan.stripe_account) : cfg.stripeAccount`. **`stripe_account` is written ONLY on the minting pass** (`if (mintedCustomer) planUpdate.stripe_account = stripeAccount`). A `setup_pending` plan re-minted after a mode flip therefore also follows the config, and picks up its stamp in the same write. |
| `membership_setup_checkout` (`setup-checkout.ts`) | `plan.stripe_account` |
| `automation_MEMBERSHIP_sweep` (`sweep.ts`) | `plan.stripe_account`, per plan inside the charge loop |
| `membership_terminate` (`terminate.ts`) | `plan.stripe_account` |
| `membership_stripe_remap` (`stripe-remap.ts`) | **ERT only** — it exists to move a plan there |

**No charge path ever re-stamps a plan.** A Stripe customer id is valid on exactly one account, so re-stamping would strand it. The one writer permitted to is the remap below.

On the webhook side the three membership guards (setup, ACH settle, late failure) now trip on **account as well as mode** — see [stripe-webhook.md](stripe-webhook.md).

---

## `membership_stripe_remap` — moving existing plans to ERT *(2026-09-11, v829; customer-only rows v830)* — **RUN, 37/37 MOVED**

**Decision (Jake, 2026-09-11): existing membership plans move by copy + remap, not by attrition.**

> **DONE 2026-09-11.** Stripe copied **37 customers** (within the hour), and one Apply moved **all 37 plans**: **13 `moved` pm→pm** onto ERT `pm_1UEY…` ids and **24 `moved` as `customer-only: copied`**. DB after: every plan holding a Stripe customer reads `stripe_account='ert'`, **0 on `vfos`**; the 13 active plans carry ERT payment-method ids; the 24 `setup_pending` plans are unchanged but for the stamp. The payment-method ids in Stripe's file matched the DB **13/13** before Apply, and the **mint** arm never fired — the copy carried all 24 customers across.

**What Stripe does first.** Stripe's self-serve **"Copy PAN data across Stripe accounts"** migration copies a customer and its saved payment methods from VFO Services to ERT. It **PRESERVES the customer id** (old == new) and **MINTS NEW payment-method ids**, then delivers a mapping CSV to the recipient Dashboard's **Documents** area. **What it actually delivers has SIX columns, not the four this action parses:**

```
customer_id_old,v2_account_id_old,source_id_old,customer_id_new,v2_account_id_new,source_id_new
```

**Drop the two `v2_account_id_*` columns** to get the shape the panel requires (`customer_id_old,source_id_old,customer_id_new,source_id_new`). A customer with **no saved payment method** comes back with **blank source columns** — already the customer-only row shape below — so **one converted file covers both row shapes at once**, which is how all 37 went in a single Apply.

It copies **cards and US ACH** but **no charges, subscriptions or invoices**. **No member contact is required** — nobody re-enters a card. Two operator facts that cost time (gotcha **#486**): the sender-side **"Copy to account"** control is hidden from an Administrator and needs the **Data Migration Specialist** role; and the *Upload file* option wants a **HEADER-LESS single column of customer ids**, rejecting a header row as "Customer not found". The recipient must answer **"Do you have ACH mandates for these customers?"** — Jake answered **Yes**, an explicitly accepted risk on the one active ACH plan whose mandate was collected under VFO Services' name.

**The Dry run can outlive the browser's patience.** 37 rows × 2-3 Stripe probes exceeded `api.js`'s **20 s** timeout on the first attempt (the 60 s tier is reserved for `automation_*` writes, and this action is not one — #319/#487); the server finished regardless, the second Dry run returned `37 would_move`, and Apply returned `37 moved`. Because `api.js` does not retry writes and every outcome is idempotent (`already_ert`, plus the guarded `where`), a timeout here is a re-click, not a double-apply — gotcha **#487**. **Read the DB, not the browser, after a timeout.**

So the only things a plan has to learn are its **new `default_payment_method_id`** and the fact that it now bills on ERT. That is exactly what this action writes, and nothing else.

**Action.** `membership_stripe_remap` — **AUTH**, in **`SUPERADMIN_ONLY_ACTIONS`**, and in **NO `TAB_ACTIONS` list at all** (per **#338**: the accounting grant is the whole boundary for that tab, so nothing superadmin-only may live there). Action count **494 → 495**. File `actions/membership/stripe-remap.ts`.

**Body:** `{ mappings: [{ customer_id_old, source_id_old, customer_id_new, source_id_new }], dry_run }`. **Max 200 mappings per call** (`MAX_MAPPINGS`); a bigger CSV is split by the caller.

**Per row, in order.** A list select (not `maybeSingle`) on `stripe_customer_id`, because two plans can legitimately share one Stripe customer (a renewed member re-planned) and `maybeSingle` would error the whole row instead of moving both. Then, per plan:

1. **Already on ERT** → `already_ert`. Not an error — the whole CSV can safely be re-submitted after a partial run.
2. **`plan.default_payment_method_id !== source_id_old`** → `pm_mismatch`. The CSV row describes some other saved method on that customer; moving the plan onto it would silently change what gets billed.
3. **Probe ERT before writing anything.** `GET /v1/payment_methods/<source_id_new>` on the ERT key for the plan's mode → `ert_pm_not_found` on a non-ok or a throw. Then **the copied method must hang off the SAME customer** (`pm.customer === plan.stripe_customer_id`) → `ert_pm_wrong_customer` otherwise: a method that landed on a different ERT customer would charge the wrong person. Then `GET /v1/customers/<customer_id_new>` → `ert_customer_not_found`. *A plan stamped `ert` whose method does not exist there is a plan whose next sweep pull silently declines — which is why every probe happens before any write.*
4. **`dry_run`** → `would_move` (every check and every Stripe probe ran; nothing was written).
5. **Write.** Sets the ERT customer's `invoice_settings[default_payment_method]` first — **cosmetic, logged, never fatal**, since every portal charge passes `payment_method` explicitly. Then a **guarded** update whose `WHERE` still requires `stripe_account is null or = 'vfos'`, setting `stripe_account='ert'`, `default_payment_method_id=source_id_new`, `updated_at`. An empty result means something moved the plan between the read and the write → `race_lost`, nothing changed.

**Refused up front:** a blank `customer_id_old` or `source_id_new` → `error`; **`customer_id_old !== customer_id_new`** → `customer_id_changed`, because Stripe preserves the id and a file that says otherwise is not the shape this action relies on.

**Outcomes (12):** `moved` · `would_move` · `already_ert` · `no_plan` · `not_pending` · `customer_id_changed` · `pm_mismatch` · `ert_pm_not_found` · `ert_pm_wrong_customer` · `ert_customer_not_found` · `race_lost` · `error`. Rows are independent — one bad mapping is reported and skipped, never aborting the rest. Every row logs one line; the call logs a `DONE dry_run=… mappings=… rows=… moved=… would_move=… skipped=…` summary and returns `{ success, dry_run, summary, results }`.

**NEVER touched:** `stripe_customer_id` (preserved by Stripe, so rewriting it could only corrupt it — one exception below), `sandbox`, `payment_method_type`, `acct_last4`, `setup_token`, and **every `member_payment_schedule` row**. **No email, no bell, no charge.**

**Customer-only rows (second row shape, same action, commit `ca02a21`).** A mapping row whose `source_id_old` AND `source_id_new` are both blank (`cus_x,,cus_x,`) moves a **`setup_pending`** plan — a member who was emailed a `/membership-pay` link and has not used it — with **no re-send**: the plan has nothing saved and nothing booked, so it only has to end up stamped `'ert'` with a customer the existing link can pay against (`setup-checkout.ts` keys the account off the row stamp). The action refuses it as **`not_pending`** when the plan is not `setup_pending` or already has a `default_payment_method_id` (those belong in the normal row shape). It probes `GET /v1/customers/{id}` on ERT: **200 and not `deleted`** means Stripe's copy carried the customer over and that same id is kept; **404** means it was not copied, so a fresh ERT customer is minted exactly as `send-setup-link.ts` does (email from `members`, `name`, `metadata[member_number|plan_id|pipeline]`) and **that is the one case where `stripe_customer_id` is rewritten** — safe because nothing references the old one. Any other HTTP status refuses (`ert_customer_not_found`) rather than risk a duplicate customer on a Stripe blip. `dry_run` resolves the member email first (a missing email surfaces in the rehearsal, not the real run) and reports `would_move` with `customer-only: copied` / `would mint`; the real run reports `moved` with `customer-only: copied` / `minted cus_…`. Census at build time: **13 `active` plans with a saved method (Stripe's CSV) + 24 `setup_pending` plans (customer-only rows, all 24 members have an email)** — **and that is exactly what the real run moved: 13 + 24 = 37, every one of the 24 reported `customer-only: copied`, so the mint arm is still unexercised.** The 24 already-sent `/membership-pay` links keep working untouched: `setup_token` is not in the update, and `setup-checkout.ts` picks its account from the row stamp.

**Frontend.** A **collapsed, superadmin-only "Move plans to ERT Stripe"** section at the bottom of `MembershipFeesPanel.jsx` (`StripeRemapSection`). It is gated on **`getSession()?.is_superadmin`** and deliberately **NOT** on the `isSuperadmin` prop — at that mount the prop is `canSeeTab('accounting')` (#338), which would hand the tool to every accounting-tab admin. Paste the CSV; `parseRemapCsv` requires the **exact** four-column header and a matching field count on every line, naming the offending line number otherwise. **Dry run is required before Apply, on the exact same text:** `canApply = dryOkFor === text`, and any keystroke clears `dryOkFor`, so Apply can never run against text the server has not previewed. A dry run only unlocks Apply when `would_move > 0`, and a completed Apply clears the unlock so the next one needs a fresh dry run. Rows are sent in **batches of 200** and the merged summary + per-row outcome table is rendered with a colour-coded pill.

## Business rules (user-confirmed)

- **Terms**: annual membership value + optional FIRST-YEAR credit note; paid monthly or annually.
  Every charge is a **whole dollar** (round half up — $8,000/12 → $667; small yearly drift accepted).
- **First payment happens at the setup link** (`/membership-pay?token=`). Card or ACH.
  **Card fee**: Legacy Model members pay face value on both rails (no fee — this system only);
  New Model members' card payments gross up 2.9% + $0.30 (decided by the plan's `advisor_model`
  snapshot; untagged members = Legacy). Corporate/untagged members are always advisors.
- **Charge day** = the day of the first payment when it's the 1st–15th (pay the 8th → the 8th
  forever). Paying after the 15th skips the next month, then bills the 1st (pay Jul 19 → Sep 1…).
  **EXCEPTION — a monthly TRANSFER may carry an admin-entered charge day (1–15), and then that day
  wins and nothing is derived from the pay date at all.** See "Transfers with a fixed charge day"
  below; the column is `charge_day` either way.
- **Renewal is always a 15th**: pay days 1–14 → the last 15th strictly before
  first-payment + 12 months (pay Jul 8 → renews Jun 15 next year); pay day 15 **or**
  after the 15th → the 15th exactly 12 months out (pay Jul 15 → Jul 15; Jul 19 → Jul 15).
  12 pulls per membership year. (Day-15 rule changed 2026-07-17 — the old "strictly before"
  formula made a day-15 payer's 12th pull EQUAL the renewal date, permanently blocking the
  renewal guard; gotcha #235.)
  Auto-renews at the full annual value — or at admin-set **next-year terms**
  (`next_year_amount` − `next_year_credit_note`, editable on any active plan, consumed at renewal) —
  unless auto-renew is toggled off.
- **Transfers** (members moving off the old billing mid-year): keep their existing renewal 15th
  (admin inputs it) — **the renewal date never moves**. **A MONTHLY transfer has TWO shapes, and
  `member_payment_plans.charge_day` is the switch between them:** with a day (1–15) the link is
  **save-only** and the year is scheduled on that day — see *"Transfers with a fixed charge day"*
  below, which is what every new monthly transfer gets; **without** a day it uses the pay-at-the-link
  model described in the rest of this bullet, which is still live for any plan saved before
  2026-08-21 that has not been re-saved. **Reworked 2026-07-31 (v688–v691):** the
  admin enters exactly ONE number, **"Payments already made this year"** (`prior_payments_made`,
  0–11, now **REQUIRED** on monthly transfers), and the server derives the rest —
  `remaining_payments = 12 − prior` (a real column, written server-side only), `slots` = the link
  plus every charge date before renewal, and `pullsAtLink = 1 + max(0, remaining − slots)`.
  **Behind** (fewer charge dates left than payments owed) → the shortfall is collected **as
  catch-up inside the FIRST payment at the link**, folded into **ONE** ledger row at the combined
  amount (never several same-date rows — gotcha **#315**), labelled *"August 2026 (includes
  1-month catch-up)"*. **Ahead** (free weeks paid on the old platform) → fewer scheduled rows;
  the schedule simply stops early and nothing is billed for months already covered. The credit
  note spreads across `remaining`, not across the calendar. One helper,
  `transferLinkPulls(plan, basisDate)` in `actions/membership/shared.ts`, is the **single source**
  for all four surfaces — `setup-load` (what the page shows), `setup-checkout` (what Stripe
  charges), `activate` (what the ledger records) and `send-setup-link` (what the email quotes).
  **But it is a function of its BASIS DATE, and the four surfaces do not pass the same one**
  (gotcha **#349**): the admin preview uses the browser's today, `send-setup-link` uses the day
  the email is drafted, and the three pay-time surfaces use the **actual pay date**. `remaining`
  is frozen at plan save; `slots` shrinks as the fixed renewal approaches, so `pullsAtLink` only
  ever **grows** with delay. Nothing is mischarged — `/membership-pay` and Checkout both
  recompute live — but **the emailed figure is stale the moment it is sent**. Since 2026-08-10 the
  admin preview states "Based on payment today", names the **cliff date** and the amount after it
  (`catchUpCliff` in `MembershipFeesPanel.jsx`), and reports **"last charge <date>"** rather than
  "until renewal" (an *ahead* transfer stops billing weeks before the renewal). The monthly
  template warns that a later setup means a larger first payment; it still quotes a hard number.
  **A charge date landing EXACTLY on the renewal 15th is dropped** by the `untilExclusive` cap and
  that drop is load-bearing, not an off-by-one — see gotcha **#350** and #235.
  A **legacy pending transfer** saved before the column existed has NULL `remaining_payments` and
  falls back to `remaining = slots`, i.e. exactly the old behaviour. **Annual transfers** pay
  nothing now — the link is save-method-only; the first charge is the full annual at renewal, and
  `prior_payments_made` stays optional for them. **Since 2026-08-10 (v714) they get their OWN
  email**, `MEMBERSHIP_transfer_setup_link|annual` (**id 215**), because the shared monthly copy
  told them a payment was collected at setup and fell back to "12 payments remaining" — both
  false for annual, which has exactly ONE payment left (gotcha **#351**). `send-setup-link.ts`
  selects it on `transfer && frequency === 'annual'`, and the button on any `saveOnly` link now
  reads *"Save Your Payment Method"*. Fully-credited $0 plans are also save-only
  ($0 rows show "Covered by credit" and are waived when due) — they still take the MONTHLY
  template and render "$0.00 per month", knowingly left as-is (accurate, odd, unreachable today).
- **Transfers with a fixed charge day (added 2026-08-21, v776) — the model every new monthly
  transfer uses.** A transferring member has been paying on the same day for years (Tray holds the
  list); deriving their day from whenever they clicked the setup link re-anchored it, charged them
  at the link for a month the old platform had already collected, and could skip a month entirely.
  So `membership_plan_save` now takes a **REQUIRED** `charge_day` (**1–15**) on monthly transfers —
  a 400 (*"Charge day must be a whole number between 1 and 15"*) when present and invalid, and the
  admin form blocks save without it. **Three consequences, all of them the point:**
  **(a) the setup link collects NOTHING** — it is `mode=setup`, save-the-method only, exactly like
  an annual transfer; **(b) the whole year-1 ledger is `scheduled` on that day**, generated at
  activation; **(c) a BEHIND member's catch-up folds into the FIRST SCHEDULED CHARGE** rather than
  into a payment at the link — one combined row at `perPull × k` / `creditPer × k` so
  `monthsCoveredByRow` still reads *k months* (#316), never several rows on one date (#315).
  **`transferDaySchedule(plan, basisDate)` in `actions/membership/shared.ts` is the single source**
  for all of it and every surface calls it — `setup-load`, `setup-checkout`, `activate`,
  `send-setup-link`, plus a deliberate FE mirror in `MembershipFeesPanel.jsx` beside the existing
  `transferSlots`/`catchUpCliff` mirrors (they move together). It is a function of its **basis
  date** like `transferLinkPulls` (#349): page and checkout pass today, `activate` passes the save
  date, `send-setup-link` passes the draft date — so a member who saves late simply has fewer slots
  and a bigger first charge, recomputed live and never mischarged. **It returns `null` for anything
  that is not a monthly transfer with a valid 1–15 day, and that null IS the legacy switch** — see
  gotcha **#429**, because a missing day silently selects the pay-at-the-link behaviour above with
  nothing on screen to say so. Days stop at 15 so the month never clamps; slots are day-D
  occurrences **strictly after** the basis (saving *on* day D bills from the next one) and
  **strictly before** the renewal (#235/#350). **AHEAD** stops early; **zero slots** (a day-15
  member whose renewal is the next 15th) collapses the year onto the save date, collected by the
  next nightly sweep. `transferLinkPulls` and `buildActivatedSchedule` were not touched — the
  legacy path is byte-identical by construction. **Year 2 needs no special handling:** the sweep's
  renewal pass already reads `plan.charge_day`, so it lands on the chosen day automatically.
- **Membership sandbox follows the panel's own toggle.** The `MEMBER_MEMBERSHIP` sandbox row is
  **member-keyed**, so the `constants/test-sandbox.ts` force-sandbox override for test member
  **59524** (#251) — which is client-pipeline only (TAX / MAP 1 / PIP) — **does NOT apply here**.
  Testing a membership plan means setting the panel's SANDBOX badge by hand. **While that toggle is
  ON, EVERY live setup/update link in the pipeline 400s with *"link is out of date"*** — the v619
  mode guards compare each plan's stamped `sandbox` against the pipeline toggle, and every real plan
  is `sandbox=false`, so flipping the toggle inverts the comparison for all of them at once. This
  bit a real member on 2026-08-21 (Gary Watts opened his link mid-test). Nothing breaks and no link
  needs re-issuing — but **flip it back in the same sitting, and never leave it on across a
  link-emailing action.** Gotcha **#430**.
- **Missed payment**: row → `missed` (red), member gets the friendly `MEMBERSHIP_payment_failed`
  email (no suspension mention — fix your method at the link; next month doubles to catch up),
  `members.membership_suspended` flips on automatically (auto-clears when caught up; login NOT blocked; SEPARATE from the admin's manual `suspended` toggle — displays OR the two, gotcha #240; **since 2026-08-24 it also HOLDS the member's revenue-share payouts across all four engines** — see [tables/members.md](../tables/members.md)),
  admin gets the `MEMBERSHIP_charge_failed` bell. The catch-up is automatic: the next due month
  and ALL arrears go out as ONE combined off-session charge.
- **Termination**: "Terminate member" (replaces cancel on active plans) → admin enters a fee →
  charged to the saved method immediately (whole dollars; New Model card gross-up), remaining
  scheduled rows voided, plan `terminated`. $0 fee just terminates. A failed fee charge still
  terminates and leaves a `declined` termination row visible for follow-up.
- **Update payment method**: an active plan's same `/membership-pay` link becomes a save-only
  "Update Your Payment Method" page (the failed-email button target). **Links on ACTIVE plans
  expire 30 days after last being emailed** (`setup_link_expires_at`, re-stamped by every
  emailer of the link + by activation; expired/NULL → "ask VFO Services for a fresh one"); the
  admin's "Send payment update link" button on active plan cards re-sends via the same
  `membership_send_setup_link` action using the `MEMBERSHIP_update_link` template (id 195,
  Draft mode; gotcha #241). Setup links for unpaid plans do not expire.

## Flow

1. **Plan creation** — `membership_plan_save` (`actions/membership/plan-save.ts`): validates,
   snapshots member name/model, computes the whole-dollar `per_pull_amount`, stores transfer
   renewal (must be a 15th). NO schedule yet — the ledger depends on the day they actually pay.
   **Since 2026-08-21 (v776) it also writes `charge_day`** — REQUIRED on monthly transfers, and
   written **unconditionally** as `isTransfer && monthly ? day : null`, so an edit to annual or away
   from transfer CLEARS it rather than stranding a stale day (the same discipline
   `remaining_payments` uses). **That makes plan-save a second writer of a column activation used
   to own** — `activate.ts` now defers to it instead of re-deriving (gotcha **#429**).
   Editable while `setup_pending`; a live plan only offers next-year terms / auto-renew / terminate.
2. **Setup link** — `membership_send_setup_link`: find-or-create Stripe customer (mode-matched via
   `plan.sandbox`), mints `setup_token`, drafts one of **FOUR** templates (pipeline
   `MEMBER_MEMBERSHIP_FEES`, Draft/Send toggle): `MEMBERSHIP_setup_link` (new plan),
   `MEMBERSHIP_transfer_setup_link` (monthly transfer with NO charge day — the legacy pay-at-link
   copy), `MEMBERSHIP_transfer_setup_link|annual` (annual transfer — id 215, added 2026-08-10,
   gotcha #351), or **`MEMBERSHIP_transfer_setup_link|monthly-saveonly`** (id **229**, added
   2026-08-21 — a monthly transfer WITH a charge day). The save-only variant exists for the same
   reason the annual one does (#351): the monthly copy's *"collected when you complete your setup"*
   sentences are all false for it. Its four extra tokens — `[Charge Day]` (ordinal),
   `[Last Charge Date]`, `[First Charge Amount]` (`per_pull × catchUpMonths`) and `[Catch Up Note]`
   (empty unless behind) — all come from the shared helper; the email must never re-derive the
   schedule. **A missing template row degrades gracefully:** 200 + `email_skipped`, and the link
   still works.
   Since 2026-07-15 the Set Up Payments form auto-chains this client-side right after a
   successful CREATE (`plan_save` returns `plan_id`; an email failure never rolls back the
   plan — it surfaces as an amber notice pointing at the card's "Send setup link" resend
   button, which remains the retry path; edits don't auto-send).
3. **/membership-pay** (`src/pages/MembershipPayPage.jsx`, PUBLIC token) — `membership_setup_load`
   + `membership_setup_checkout`: mode=payment Checkout charging the first pull with
   `setup_future_usage=off_session` (save-only variants use mode=setup). Metadata on session AND
   intent: `pipeline=MEMBER_MEMBERSHIP`, `payment_kind`, `plan_id` (gotcha #216).
   **`saveOnly` now has FOUR triggers** (both handlers, and mirrored at BOTH FE sites — the
   `emailCtx` builder and `OutstandingLinkRow`): an already-active plan, a $0 fully-credited plan,
   an annual transfer, and **a monthly transfer with a charge day**. `setup-load` returns eight
   **additive** fields for the last case (`charge_day`, `charge_day_ordinal`, `per_pull_amount`,
   `payments_remaining`, `first_charge_date`, `last_charge_date`, `first_charge_amount`,
   `first_charge_months`). **The PAGE deliberately renders NONE of them.** A day plan's page shows
   *"Nothing is charged today … your membership payments then continue automatically on the {N}th
   of each month, just as they do now"* and suppresses every amount, cadence and breakdown on both
   OptionCards — same precedent as the update-method page. A schedule box and a catch-up note were
   built and then **removed on purpose**: any figure on a page reached by clicking "set up payment"
   reads as a charge happening today, which is the exact misconception the feature exists to
   prevent. The admin preview and the email carry the figures instead. The card **fee-rate badge**
   is kept — it describes the rail, not a charge.
4. **Webhook activation** (`router/webhooks.ts` isolated blocks → `actions/membership/activate.ts`):
   on `checkout.session.completed` saves the PM as the customer/plan default and generates the
   year's ledger — row 1 = the link payment (card `paid`, ACH `processing` until
   `checkout.session.async_payment_succeeded`/`_failed`), locks `charge_day` + `renewal_date`.
   Already-active plans only refresh the method fields (the update-method path).
   **A day-carrying monthly transfer keeps the ADMIN's day** (`chargeDayOut`: annual → 15,
   day plan → the entered day, else the legacy `chargeDayFor(basisDate)`) and its ledger is built by
   `buildTransferDayRows` — normally with `linkPulls = 0`, so **every row is `scheduled` and there
   is no paid row at all**. The one exception is a **stale link**: a Checkout session minted before
   the plan had a charge day can still complete as `mode=payment` afterwards, and that money must be
   recorded — so row 1 becomes the paid link row at the pay date and the remaining months land on
   day-D slots after it, with no fallback row permitted to collide with it. `router/webhooks.ts`
   itself was NOT changed: the `mode=setup` path already passes `payDateIso` null, and the
   first-signup confirmation email is gated on the `membership_first_payment` kind, so **a save-only
   completion cannot fire a confirmation email.**
5. **Daily sweep** — `automation_MEMBERSHIP_sweep` (PUBLIC service-role, cron jobid 16 @12:00 UTC,
   `supabase/cron/membership-sweep.sql`), **five** passes in order — **pass 0 = renewal notices,
   added 2026-08-04 / v700, runs FIRST so a plan is always warned before it is rolled over
   (see "Renewal notice + meeting" below)** — then: **renewals** (generate the next
   year at next-year terms, advance `renewal_date` +12 months, guard = any row on/after renewal),
   **waive** due $0 rows, **charges** (one off-session PI per plan = due + missed rows;
   LOGICAL/date-less sorted row-set idempotency keys `membership-pull-<plan>-<rowids>`, gotcha
   #228 class; a charge that succeeds but whose ledger write fails alerts Jake loudly; sync
   card decline → missed/email/suspend/bell), **auto-unsuspend** caught-up members.
   **Pass 4 now also RELEASES HELD REVENUE SHARES (2026-08-24)** *(v: 2026-08-24)* — after
   clearing `membership_suspended` for a caught-up plan it **re-reads the member row** and, only
   when `memberHoldReason` finds **no reason left** (the admin's own `suspended`/`paused` toggles
   hold independently — #240), calls `releaseHeldMemberPayouts(member_number)`, which HTTP-chains
   `automation_CONTRACT_revshare` / `automation_TAX_revshare` / `automation_PIP_revshare` /
   `specialist_revenue_payout` for every leg parked by the standing hold. The summary gains
   **`payouts_released`** (count of legs re-fired). A failed re-read logs and SKIPS the release
   rather than guessing; the unsuspend itself is never blocked by it. Chain bodies + the both-linkage
   client resolution: [07-server-chains.md § Member reinstatement](../architecture/07-server-chains.md).
   Off-session PI settlement has a webhook block (`payment_intent.succeeded/_failed` routed by
   membership metadata) covering ACH pulls + termination fees — and since v617 the
   `payment_intent.payment_failed` branch mirrors the sweep's failure arm for late ACH bounces
   of monthly pulls (suspend + bell + email via the shared
   `utils/membership-payment-failure.ts` helper; gotcha #236).
6. **Reconciliation UI** — the Members section renders the ledger per member (green paid rows with
   payment id + method, red missed with the Stripe decline reason, waived, per-membership-year
   selector once renewals accumulate, totals row). Outstanding lists overdue/missed by member,
   with a per-row "Send reminder email" button (`membership_send_reminder`, added Phase 4
   2026-07-15) that re-sends the failed-payment email on demand for the member's full arrears.
   **A 4th pill, "Outstanding Payment Links" (added 2026-07-31),** lists every `setup_pending`
   plan whose setup link has actually been emailed — expandable cards with Setup link /
   Transferred / Sandbox badges, the amount due at the link (or "Save-only"), the plan details,
   and **Resend payment setup link** + **Edit plan** buttons. **Deliberately unlike the tax and
   holistic Outstanding tabs, sandbox rows are SHOWN here** (orange Sandbox badge) rather than
   hidden — this panel is where sandbox test runs are watched. Keep that exception if the
   "outstanding" pills are ever unified.

## Data

`member_payment_plans` + `member_payment_schedule` — see [tables/membership-fees.md](../tables/membership-fees.md).

## Failure modes

- ACH first payment bounces → row 1 `declined` + Jake bell + member email, **NO suspend** (the
  member only just set up; the next sweep's combined charge picks the amount up). The side
  effects live in BOTH `checkout.session.async_payment_failed` AND the
  `payment_intent.payment_failed` block, each gated on rows-actually-flipped — Stripe doesn't
  order the two events and in live testing the PI event won the race (gotcha #238, v620).
- Off-session pull fails **synchronously (card)** → sweep marks the newly-due row `missed`,
  drafts the friendly email once per row (`reminder_sent_at` guard), suspends, bells.
- Off-session pull bounces **late (ACH)** → `payment_intent.payment_failed` flips the charge's
  rows `declined` AND (v617) suspends + bells + drafts the same email via the shared helper —
  previously this path was totally silent (gotcha #236). No auto-retry of the failing method
  either way — the catch-up rides next month's charge; the member fixes the method via their link.
- The failed-payment email's `[Failed Amount]` token = the failed charge's total (may span
  months); `[Amount]` = the regular per-pull ("your usual"). Different tokens — keep both.
- Charge succeeds but the ledger write fails → Jake gets a "charge SUCCEEDED / write FAILED"
  bell (the date-less idempotency key protects the next-night re-select within Stripe's window).
- Any activation DB failure after the member completed checkout (guard count / ledger insert /
  plan update / method refresh), or a payment method that couldn't be read back from Stripe →
  Jake bell (`activate.ts` + the webhook block; Stripe returned 200 and will not retry).
  **The alert wording was corrected 2026-07-31:** the title is now *"Membership payment received
  but NOT recorded — <name>"* (payment path) / *"Membership setup saved but plan NOT activated"*
  (save-only) and the body opens *"The member's first payment WENT THROUGH at Stripe — the money
  landed — but it is not recorded on the ledger"*. The old *"Membership activation FAILED"* was
  read as a **failed charge** during live testing, which is the opposite of what happened and the
  wrong instinct at the worst moment. **This is the alert that fired for gotcha #315** — the
  arrears catch-up written as several same-date rows, bounced by the schedule's
  `(plan_id, due_date)` unique guard *after* Stripe had taken the money.
- Termination fee declines (sync) or bounces late (ACH) → plan still terminates; the
  `termination_fee` row sits `declined` AND Jake gets a "termination fee declined/failed" bell
  (both paths, v619/620). No member email, no suspend. The fee row shares its `due_date` with a
  same-day membership row legitimately — schedule uniqueness is per `kind='membership'` only
  (partial unique index, migration `20260717190000`; gotcha #239).
- The sweep skips plans without a saved method (nothing to charge yet); an ACTIVE plan missing
  its method is alerted at activation time (see above) rather than nightly.
- **Mode guards (v619)** — every membership surface refuses/flags a sandbox↔live mismatch:
  the three webhook blocks assert `event.livemode` vs `plan.sandbox` (skip + mismatch bell);
  the sweep's charge pass skips + bells mismatched plans (deduped, nightly-safe); `terminate`
  returns a clear 400 for a fee charge; the public `/membership-pay` handlers 400 a stale-mode
  link ("out of date — ask VFO Services for a new one"). All verified live in testing.
- Membership charges appear on the **global Payments page** (Membership chip; face-value
  amounts; paid/processing/missed/declined + termination fees; `all-payments-load.ts`).

## Invoices, receipts & the confirmation email (added 2026-07-24, v653)

Membership was the last money pipeline with no success-side email. Seven templates now exist,
all Draft, all **To** member / **Cc** `tvaldes@elitert.com` / **Bcc** `platham@elitert.com` +
`aanderson@elitert.com`. Full invariants in gotchas **#280** (document engine) and **#281**
(the card-fee rule).

| Moment | Confirmation | Invoice | Receipt |
|---|---|---|---|
| First sign-up, **card** | **— (never)** | instant | instant |
| First sign-up, **ACH** | instant | on clearing | on clearing |
| Mid-year transfer | ACH only | catch-up invoice | yes |
| Monthly pulls 2–12 | — | — | every month |
| Renewal (year 2+) | — | new-year invoice | yes |
| Annual payers | ACH sign-up only | once a year | once a year |
| A charge fails | — | — | — (the `MEMBERSHIP_payment_failed` email instead) |

- The confirmation (`MEMBERSHIP_confirmation|ach`) fires **once**, at genuine first sign-up —
  never at renewal. `activateMembershipPlan` returns `activated|refreshed|failed`, and
  `refreshed` (the member re-used the link to swap their card) must not re-confirm.
- **The webhook re-reads the plan before drafting it (2026-08-21, v775 — gotcha #427).** `activateMembershipPlan` rewrites `start_date` to the pay date and writes the ledger under that new date, but the caller still held the row it loaded *before* activation. `draftMembershipConfirmationEmail` counts the year's rows with `.eq("year_start", plan.start_date)`, so the stale date matched **zero** rows and a transfer plan rendered *"Payment 2 of 1"* (`firstOrdinal = prior + 1`, `ordinalTotal = prior + 0`) — seen live on Manos 58114, plan 49. The fix is caller-side: re-read `member_payment_plans` by id after activation and pass the fresh row, falling back to the stale one if the re-read fails (a garbled draft beats no draft; it is Draft-mode and human-reviewed). **The `year_start` filter itself is correct and must not be "fixed"** — it is the #316 row-money derivation. Only `plan.transfer` plans can hit the miscount; a non-transfer plan keeps `1 of 12`. Money was never affected — the ledger and the charge were always right.
- **ACH only, by design** (`mmMethod === "ach"` gate in `router/webhooks.ts`): a card first
  payment is receipt-only, because the invoice/receipt below lands in the same moment and says
  everything the confirmation would. The `MEMBERSHIP_confirmation|card` template still exists
  but is no longer sent automatically.
- `automation_MEMBERSHIP_invoicereceipt` decides invoice-vs-receipt **from the ledger**: rows
  sharing a `year_start` are one membership year, the earliest `due_date` in that group is the
  opener that earns an invoice. Idempotent on `docs_emailed_at`, so a redelivered Stripe event
  cannot double-send. Chained from three webhook points (card first payment, ACH settle,
  off-session pull); `membership_termination_fee` is deliberately excluded.
- **PDF renders retry (2026-09-10, gotcha #483).** Both renders go through
  `utils/html2pdf.ts renderHtmlToPdf` — **3 attempts, 1500 ms / 3000 ms with jitter**, because the
  12:00Z sweep charges several plans in one second and html2pdf.app answers concurrent renders
  with a **403**. A render that still fails after all three returns 500 **with the accounting
  numbers already reserved and nothing stamped on the ledger row** — repair by writing the
  reserved `invoice_number` / `receipt_number` onto the row FIRST (so the re-run reuses them
  instead of minting `-0002`), leaving `docs_emailed_at` NULL, then re-firing the action through
  jobid 16's own stored cron command; full recipe in **#483**.
- Both PDFs are filed in the **`member-ert-docs` ERT vault** keyed by `member_number` — the
  admin-managed, member-read-only section, the same place signed agreements land. NOT Google
  Drive (unlike MAP 1). Paths recorded on the ledger row; a vault failure logs and never loses
  the already-sent email.
- The **card fee is mentioned only when charged** (New Model + card). Legacy and every ACH payer
  see no fee wording anywhere — rows, footnote, breakdown box, email sentence and the schedule
  line's fee clause all omit. The figure shown is read from
  `member_payment_schedule.card_processing_fee`, stamped at settle time from Stripe's
  `amount_received` (the same convention as every other pipeline) — not re-derived. On a $1,500
  pull that is **$45.11**, charged as $1,545.11, netting ERT exactly $1,500 (gotcha #281).
- **EVERY member-facing COUNT IS IN MONTHS, NOT LEDGER ROWS (2026-07-31, v691, gotcha #316).**
  A catch-up row spans several months, so `rowsThisYear.length` stopped meaning "payments
  remaining" — it made the invoice say 6 where the setup email said 7 and ended the membership
  year at "Payment 11" of 12. Every count now routes through
  `monthsCoveredByRow(row, grossMonthly)` = `max(1, round((amount_due + credit_applied) /
  grossMonthly))`, where `grossMonthly = roundDollar(annual_amount / 12)` — derived from the
  **row's own money**, so it survives the credit spread (net alone is short by the credit;
  **net + credit = one gross month**). That covers the invoice's *"Payments remaining (including
  those collected today)"*, each schedule-line ordinal, the receipt's payment label, and the
  `[Remaining Payments]` / `[X]` / `[Y]` tokens. **A multi-month row labels as a RANGE** —
  *"Payments 6-7"* — so the year's numbering still reaches 12. An ordinary row always evaluates
  to 1, so every non-catch-up document is byte-identical to the pre-v691 output.
- **Ordinals on a transfer year still carry no "of N" denominator on the schedule lines**, but the
  email's `[Y]` now genuinely totals 12: with `remaining_payments` derived as
  `12 − prior_payments_made`, `paymentsMade + remainingCount = 12`. The old FE "13 payments"
  mismatch warning was **deleted** with the same change — the two halves can no longer disagree.
- `member_payment_plans.prior_payments_made` is admin-entered on the transfer form, because the
  system holds no record of payments collected on the old platform. It is **REQUIRED on monthly
  transfers** as of v691 (`plan-save.ts` 400s with *"Enter how many payments they already made
  this year (0-11)"*); still optional on annual transfers. `remaining_payments` is derived from
  it server-side and any client-supplied value is ignored.
- **The card fee on a catch-up payment is stamped against the FULL base.** `router/webhooks.ts`
  reads the checkout session's `pull_count` metadata (stamped on both the session and
  `payment_intent_data`) and multiplies `per_pull_amount` by it before differencing Stripe's
  `amount_received` — otherwise the entire extra pull would be stamped as `card_processing_fee`,
  and the documents **prefer the stamped fee** over any re-derivation (#281). The same multiplier
  fixes the ACH confirmation email's amount.

## Renewal notice + renewal meeting (added 2026-08-04, v700–v701)

**Until this shipped, membership renewal was completely silent.** The sweep rolled a plan into its
next membership year the moment `renewal_date` arrived — new ledger, next-year terms applied,
charges resuming — with **no advance email of any kind**, and every plan carries `auto_renew`
default `true`. A member's first signal that they had been renewed for another year was the charge.
That gap is what this closes.

**Pass 0 — the 30-day notice.** Window: `status='active'` + `auto_renew` + `renewal_date` in
`(today, today+30]` — **strictly future**, so a plan that actually reaches its 15th is renewed by
pass 1 rather than noticed. The "already noticed" filter is
`renewal_notice_for <> renewal_date` **evaluated in JS**, because PostgREST cannot compare two
columns and NULL has to read as not-noticed. Per plan, in a `try/catch` so one bad plan never kills
the sweep: load the member (skip + log when they have no email), load the template, mint-or-reuse
`renewal_meeting_token` and **persist it BEFORE drafting**, draft `MEMBERSHIP_renewal_notice`
(id 212, **Draft mode**), then — **and only if the draft succeeded** — stamp
`renewal_notice_for = renewal_date`. A failure therefore retries tomorrow rather than being lost,
and a plan can never be double-noticed for one renewal.

**`[Renewal Terms]` is the renewal pass's own arithmetic, written twice.**
`(next_year_amount ?? annual_amount) − (next_year_credit_note ?? 0)`, rendered as
*"$X/year, billed monthly|annually"*. **The two copies must move together** — an earlier draft of
this pass quoted a different figure than pass 1 would charge, which was caught in review before
deploy. Quoting a renewal price the system then does not charge is the worst failure this feature
has available to it.

There is **no per-plan Stripe-mode guard** on this pass, matching renewals/waive/unsuspend: it
touches no Stripe object. Email sandboxing is handled the one way it is everywhere else —
`resolveTemplateRecipients` redirects the whole send to `sandbox_email` while `MEMBER_MEMBERSHIP`
is in sandbox mode.

**The meeting request.** The notice carries a **"Request a Meeting"** button to the PUBLIC
`/membership-meeting?token=` page (`src/pages/MembershipMeetingPage.jsx`, #290 show-then-confirm
via `DecisionConfirmCard`, raw `fetch` like `MembershipPayPage`). Confirming calls the PUBLIC
`membership_renewal_meeting_request` — **`renewal_meeting_token` is the whole credential and the
response is a bare `{ success }` that must never be widened** (#331 shape) — which is **idempotent
per `(plan_id, renewal_date_for)` open row**, so a re-opened email renders the "already received"
state instead of queueing a second meeting. It inserts a `membership_renewal_meetings` row and
fires the **action-required** bell `MEMBERSHIP_renewal_meeting_requested` (default recipient
`rhopson@elitert.com`) linked straight to that member's Membership Fees card.

**Recording the outcome.** The panel's **Renewal meeting** section shows the open request, then
*"Meeting complete"* → *"What was the outcome of the meeting?"* → **Continue membership** /
**Cancel membership** (danger styling + a `window.confirm`).
`membership_renewal_meeting_outcome` stamps `completed_at` / `outcome` / `recorded_by`;
**`cancel` also flips `auto_renew=false` and drafts `MEMBERSHIP_cancel_confirmation` (id 213)**
best-effort. **Both outcomes clear the bell** — nothing else does. This action is deliberately
**accounting-tab, not superadmin**: it records a conversation, it moves no money. (As of the
2026-08-07 full-parity pass that is no longer distinctive — the whole `membership_*` family is
accounting-tab-gated with no in-handler superadmin check, #338.)

**Operational cost to know about:** both templates are **Draft mode**, so a human has to send each
renewal notice out of Gmail Drafts. And the emailed button is a live `vfoportal.com` URL — **the
notice is only useful once the frontend is deployed** (gotcha #333).

**Still open, deliberately unbuilt: a plan with `auto_renew` OFF still lapses DARK.** It stays
`status='active'`, no notice pass touches it (the window filters on `auto_renew`), no bell fires,
and the schedule simply runs out. Nobody is told — not the member, not an admin. Closing that
needs its own decision about what "lapsed" should mean; it was named this session and left alone.

## Pause Membership Payments (added 2026-08-04, v702–v703)

**A pause means exactly three things and nothing else:** the member skips N months of charging,
every remaining payment moves N months later, and the membership year ends N months later.
**The plan stays `status='active'` throughout** — a pause is purely a schedule-shape change plus a
`renewal_date` shift, so nothing keyed off `plan.status` (the charge pass, the notice pass,
terminate/cancel eligibility) has to learn a new state. `membership_pause` **was superadmin-only
in-handler** (same shape as `terminate`) until 2026-08-07, when both handlers dropped that check
under the full-parity decision — the `accounting` tab grant is now the whole gate (#338); months
are 1–12.

**Mechanics, in the order they matter.** Scheduled `kind='membership'` rows shift +N months in
**DESCENDING `due_date` order**, so the partial unique `(plan_id, due_date) WHERE
kind='membership'` never sees a transient collision (#315). `period_label` is regenerated **only
when it still equals `periodLabel(old due)`** — an annotated label like *"August 2026 (includes
1-month catch-up)"* or an annual *"Membership year 2026–2027"* is preserved verbatim.
`year_end` extends +N across **all** rows of the affected `year_start` group while **`year_start`
is never touched** (#280). `renewal_date` advances +N pinned to the 15th, which is precisely what
keeps **#235** — every row of a year strictly before its renewal — true after the shift.

**The vacated slots get `kind='pause'` markers** (`status='waived'`, `amount_due` 0):
*"Paused — August 2026"* per month, or ONE combined row *"Paused — Aug 2026 – Oct 2026 (3 mo)"*;
a single-month window renders *"Paused — Aug 2026 (1 mo)"* (the range-label edge case, fixed in
v703). When there are **no scheduled rows left to move** — an annual plan mid-year, or a monthly
year already fully collected — the marker anchors at the OLD renewal date, `rows_shifted` is 0 and
`resume_due_date` is NULL: that pause only extends the year.

**Why the markers are safe is the entire design (gotcha #332).** Every money consumer filters
`kind='membership'` — the nightly charge pass, the renewal guard, the $0-waive pass, the
invoice/receipt engine (4 sites), terminate/cancel voids, `send-reminder`, `all-payments-load`, the
webhooks and the confirmation email were each checked reader-by-reader. So markers can never be
charged, never look like a generated year 2, and never enter a month count (#316). **The corollary
is a standing rule: any NEW reader of `member_payment_schedule` must filter `kind` or consciously
decide what `'pause'` means to it.**

**`renewal_notice_for` is deliberately left stale** by a pause, so the notice pass re-arms and the
member is warned again for the new renewal date.

**Preview is the same code path with no writes.** The panel's inline pause form auto-calls
`membership_pause` with `preview: true` (request-token guarded against races) and renders
*"Payments continue on &lt;date&gt;"* — or *"No upcoming payments this year — only the renewal date
moves"* — plus *"Renewal date moves X → Y"* and *"(N upcoming payments will each move N months
later)"*. Committing goes through the panel's `run()` helper behind a `window.confirm`. A
partial-failure error message states exactly what was and was not applied.

**In the ledger UI**, a `kind='pause'` row renders as `period_label` / date / — / — /
`StatusPill "Paused"` (amber `#b45309`, tinted band) / —. Every aggregate — totals, the paid
counter, payable, missed and the Outstanding section — already excluded them naturally. `bucketByYear`
was **rewritten to group by `year_start`** (falling back to the legacy 12-month windows only when
`year_start` is NULL), with the label's end derived from the group's last `due_date` floored at
start + 11 months — otherwise a paused year's rows spill out of a fixed 12-month bucket. An amber
**"Payments paused"** header pill shows when any pause marker is due today or later; it is
**distinct from the pre-existing `members.paused` "Paused" pill** and the two can appear together.

**Pauses stack.** A second pause re-runs the same shift against the already-shifted schedule and
writes a second audit row — verified live with a 3-month pause followed by a 2-month one.

## NOT built yet (next work)

- **A plan with `auto_renew` OFF lapses DARK** (named 2026-08-04, deliberately unbuilt). It keeps
  `status='active'`, the renewal-notice pass skips it (the window filters on `auto_renew`), no bell
  fires and the schedule just runs out — the member is never told and neither is an admin. The
  advance-notice pass closed the *warning* gap for auto-renewing plans only; this one is still open
  and needs a decision about what "lapsed" should mean before it can be built (gotcha #333).
- Per-row itemization of the card gross-up in the ledger UI (the charge is grossed up; the
  ledger shows face value — the invoice/receipt PDFs DO itemize it).
- From the 2026-07-17 audit, still open (everything else — H4/M1/M2/M4, Outstanding dead-end
  button, timestamptz dates, M3 suspended-flag separation, M8 link expiry+resend — was FIXED
  across v619/620/621): combined-pull charges aren't grouped/gross-up-explained in the
  ledger UI; a `terminated` plan blocks creating a new plan for the same member — only
  `canceled` frees the slot, and the FE surfaces this as a bare "duplicate key value violates
  unique constraint `member_payment_plans_one_live_idx`" with no hint of the cause (gotcha
  #283); transfer credit spread is estimated at plan-save, not pay time.
- **Go-live steps** (order matters — the flip trap is #1: every charge site reads the plan's
  snapshotted `sandbox`, so an ACTIVE plan set up under sandbox keeps charging the SANDBOX
  account forever after the flip, green-but-fake):
  1. Frontend deploy (ships `/membership-pay` — REQUIRED before real setup links go out).
  2. BEFORE flipping, inventory `member_payment_plans` where `sandbox=true`: `active` ones must
     be terminated/canceled and recreated live (no re-stamp path exists); `setup_pending` ones
     self-heal only when "Send setup link" is re-clicked AFTER the flip (old emailed links stay
     sandbox-stamped — resend them).
  3. Flip `MEMBER_MEMBERSHIP` sandbox→live.
  4. Subscribe the EXACT event names on the LIVE endpoint: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `payment_intent.succeeded`, `payment_intent.payment_failed` (NOT "payment_intent.failed").
  5. Flip the FOUR `MEMBER_MEMBERSHIP_FEES` templates Draft→Send (incl. `MEMBERSHIP_update_link`) (standing directive 2026-07-17:
     nothing flips in the short term). **`MEMBERSHIP_transfer_setup_link|monthly-saveonly` (id 229)
     is NOT one of them** — it was seeded Draft deliberately in 2026-08-21 so a human reads every
     behind member's larger-first-charge warning before it goes out. Flipping it needs its own
     decision, and #428's rule applies (a `send_mode` flip is a UI edit too).
  6. Verify `advisor_model` tags on fee-paying members (card gross-up depends on the snapshot).
  7. Smoke one real setup link end-to-end and confirm the customer/charge lands in the LIVE
     Stripe dashboard.
