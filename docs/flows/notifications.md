# Notifications flow

The portal's bell-icon notification feed. A small, simple flow: handlers insert rows; the bell polls and displays; click marks read; admin actions clear them in bulk.

> **2026-07-10 additions (see [tables/notifications.md](../tables/notifications.md) for full detail):** the bell now has a **View all** link to a full-page Notifications view (`NotificationsPage.jsx`, `/admin?tab=notifications`, every admin) with **Current** (unread) / **Archive** (read) scopes, All/Action/FYI/**Reminders** kind filters, pagination, and bulk clear (`load_notifications_page` / `mark_notifications_read`). Read rows are hard-deleted after 90 days by the daily `automation_NOTIFICATIONS_purge` cron (jobid 15) — so the old "rows accumulate forever / hard LIMIT 20" caveats below are bounded now. Admins can also self-schedule **personal reminders** (`personal_reminders` table; delivered every 5 minutes by `automation_REMINDER_sweep`, cron jobid 14, via a DIRECT insert — the one documented exception to the notifyByRule rule; pipeline `REMINDER`, violet styling). Gotchas #212–#213.

> Pipelines that emit notifications: `MAP 1`, `TAX`, `ADVISOR_ONBOARDING`, `ACCOUNTANT_ONBOARDING`, `PIP`. Each pipeline uses a distinct `link` value pointing back at the relevant admin section so a click lands the admin on the right page (e.g. accountant onboarding notifications link to `/admin?tab=accountants&section=accountant_onboarding&onboarding=<id>`, opening that record directly). **CORRECTED 2026-08-13 — the list above is incomplete:** `VAULT` (two rules), `REMINDER`, `SPECIALIST` and `MIGRATION` also emit.
>
> **Advisor/Accountant onboarding route to the chosen "Team Member Responsible," not the shared `admin` bell** (2026-06-15). Each onboarding now carries an `onboarding_team_member` name (Stage-1 dropdown). `constants/onboarding-team.ts::teamMemberRecipient(name)` maps that name → the person's `@elitert.com` login email (the bell filters on `session.email`), falling back to `'admin'` when unset/unmapped. See the dedicated subsection below.

> **EVERY sweep reminder / stall ladder counts BUSINESS DAYS (2026-08-14).** A tier's configured
> `notification_rules.delay_days` is unchanged as a number, but the sweeps now walk backward over weekdays
> only (Mon–Fri UTC, **no holiday calendar**) via `businessDelayCutoffIso(days)` in
> [`utils/notify.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/notify.ts); forward
> horizons (countdowns / look-aheads) use its sibling `businessDayHorizonDateOnly(fromDateOnly, days)`. So
> "2 days" now means **2 business days** — a step that stalls on a Friday is chased the following week, not
> over the weekend. The old calendar helper `delayCutoffIso` still exists but has **zero callers**; a new
> ladder that reaches for it is a bug. Converted sweeps: `pipeline/contract-revshare-sweep` (MAP 1, 6 tiers),
> `pipeline/contract-check-reminder-sweep` (uncleared-check bells + the Payment Continuation setup-link
> ladder, plus its forward payment look-ahead), `advisor/sweep` and `accountant/sweep` (6 tiers each),
> `onboarding/sweep` (14 tiers through a shared wrapper), `pft/sweep` (6), `specialist-revenue/payout-sweep`
> (5, including the bank-verification bell), `regular/map4-followup-sweep` (3 chained tiers) and
> `tax/revshare-sweep` (Tax 3 / Tax 4 / Tax 5). `growth/overdue-sweep` has no delay offset to convert, so it
> instead **early-returns on Saturday and Sunday UTC ticks**. Bell bodies interpolate their own delay and
> now read *"N business day(s) have passed"*.
>
> **Deliberate CALENDAR survivors — the unit is NOT global, and these must stay calendar:** the advisor +
> accountant **14-day auto-decline** (an owner decision, and a business action rather than a notification),
> the **Tax 4 "meeting has passed" nudge**, the **membership 30-day renewal notice** and membership charging
> generally (that sweep was not touched), the **`chargescheduled` sweep** (charges land on their real due
> dates, weekends included — owner decision), the **notifications purge**, **personal reminders**, and every
> **token / session expiry window**. ACH settlement prose ("2-4 business days") was already correct and is
> unrelated to this rule.

> **TAX notification links carry program context** (added this session). All 12 tax notification `link`s append `&program=${plan.program_id}` to the `/admin/client/<id>?tab=tax` deep-link. Without it, a client enrolled in BOTH VFO Holistic (program 1) and VFO Tax Planning (program 4) opened their DEFAULT enrollment (Holistic) instead of the program the notification was about. `ClientDetail.jsx` reads `?program=` and passes it to `msm_load_client_home`, which resolves the matching enrollment before falling back to `clients.enrollment_id`. MAP1/PFT/Advisor/Accountant links are unaffected (single default program).

## Data model

Single table: [`notifications`](../tables/notifications.md). Key columns:
- `recipient` (text): routing key — typically `'admin'`, an email, or `'all'`.
- `client_id`, `pipeline`, `title`, `message`, `link`.
- `read` (boolean, default `false`).

## Frontend display

[NotificationBell.jsx](src/components/NotificationBell.jsx) is mounted in [AdminPortal.jsx:203](src/pages/AdminPortal.jsx) (admin only — not in MemberPortal).

```
useEffect(() => {
  loadNotifications()
  setInterval(loadNotifications, 30000)   // poll every 30s
}, [])
```

The bell renders a count badge + dropdown of titles. Click an item → navigates to `notification.link` (typically `/admin/client/<id>?tab=map1`). "Mark all read" iterates over all visible notifications and calls `mark_notification_read` for each in parallel.

## Step 1 — Load (filtered, server-side)

**Handler:** `load_notifications` ([NotificationBell.jsx:28](src/components/NotificationBell.jsx) → [admin-api:4364-4374](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)).

Returns up to 20 unread notifications matching the caller. Filter: `recipient = session.email OR recipient = 'admin' OR recipient = 'all'`. Sorted by `created_at DESC`.

```sql
SELECT * FROM notifications
WHERE (recipient = '<session.email>' OR recipient = 'admin' OR recipient = 'all')
  AND read = false
ORDER BY created_at DESC
LIMIT 20
```

> **Note:** for member sessions, `recipient = session.email` would match notifications addressed to the member's email. But no observed handler inserts notifications with a member's email as recipient — current notification inserts all use `recipient='admin'` (see Step 2). Members likely see an empty bell. The bell is also not mounted in MemberPortal anyway.

## Step 2 — Insertion points

> **Stale-claim correction (2026-06-09):** the line below — "the only handler that inserts is `automation_PCADMIN_finaldecision`" — is **wrong**. Many handlers across MAP 1 / TAX / Advisor / Accountant / PFT / Specialist insert notifications. For the **complete TAX inventory** (every insert + clear across Tax 3/4/5, recipient, dismissible, how cleared, plus the email-only nag ladders), see [tax-planning.md § Notification inventory (TAX pipeline)](tax-planning.md#notification-inventory-tax-pipeline--audit-2026-06-09). The MAP 1 example below is retained as an illustration only.

The original MAP 1 insertion example, `automation_PCADMIN_finaldecision` ([admin-api:705-738](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). Two cases:

- Decision = `Yes` (with chosen service level):
  ```
  recipient: 'admin'
  client_id: <id>
  pipeline:  'MAP 1'
  title:     "<Client name> chose <Service level>"
  message:   "<Client name> selected <Service level> Membership — complete the pricing form"
  link:      "/admin/client/<id>?tab=map1"
  ```
- Decision = `ExtraMeeting`:
  ```
  recipient: 'admin'
  client_id: <id>
  pipeline:  'MAP 1'
  title:     "<Client name> requested extra meeting"
  message:   "<Client name> wants an additional meeting before deciding"
  link:      "/admin/client/<id>?tab=map1"
  ```

Beyond this MAP1 example, the TAX / Advisor / Accountant / PFT pipelines also insert notifications. Recipient routing varies: TAX routes per-person via `utils/tax-notify.ts`; **Advisor/Accountant onboarding route to the chosen Team Member** (see subsection below); the rest use `recipient='admin'` (plus, for the Tax 4 reminder below, specific staff emails). Status changes elsewhere in the system (CIQ, MSM, contracts) do **not** generate notifications.

### Tax 4 meeting-passed reminder (action-required, in-app)

**Rule `TAX_tax4_decision_needed` — the three-recipient "Client decision 1 needed — \<client\>" bell — is DORMANT since 2026-08-11 (#170).** Its call site is gone; the rule row stays enabled for rollback + Editor visibility, and its clear stays in `actions/tax/postreview-decision.ts` (`.ilike("title","Client decision 1 needed%")`) because unread rows of that shape survive in production. Per gotcha #178, removing the call site — not deleting the rule — is what stopped the bell. The planner FYI `TAX_planner_post_meeting` went dormant in the same change.

What fires now, on the same trigger: the `tax-revshare-sweep-daily` cron (02:30 UTC) raises **ONE persistent action-required in-app notification to the ALLOCATED PLANNER ALONE** — rule **`TAX_planner_tax4_steps_needed`** — when `tax4_meeting_date < today` and a planner is allocated:

```
recipient: <allocated planner email>          (one row)
pipeline:  'TAX'
title:     "Complete the tax plan review steps for <client>"
message:   asks for BOTH steps the meeting produces —
           "Detailed tax plan presentation" AND "Client decision 1"
link:      "/tax-planner/client/<id>?program=<program_id||1>"   (gotcha #292)
dismissible: false
```

Fired once per plan (same guard column, `client_tax_plans.tax4_meeting_reminder_last_sent_at`, which `automation_TAX_highlevelmeeting_confirm` nulls on every re-confirm), and **skipped outright when both steps are already done** — an already-satisfied action-required bell would be unretirable. **Cleared** when BOTH halves land, whichever is second: `save-task.ts` (the presentation dropdown) and `postreview-decision.ts` (Client decision 1, every branch) both call `clearTax4StepBellsWhenBothDone`.

### TAX pipeline — no shared `admin` bell (rerouted 2026-06-09; recipients re-cut 2026-07-27)

Every TAX notification routes to a specific person via [`utils/tax-notify.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-notify.ts) — none use `recipient:'admin'`. Tax 3 / Setup-phase → **assigned PF** (`taxPfRecipients`, **Tracy** fallback — `TAX_OWNERS` is `[TRACY_EMAIL]` alone since Tim Gacsy left); Tax 4/5 client-decision FYIs → **assigned PF + the allocated tax planner** (`taxDecisionRecipients`, Tracy fallback, planner row link-overridden into the planner portal); the Tax 4 meeting-passed bell → **the allocated planner alone** since #170 (its own trigger is the CALENDAR meeting date, not a business-day ladder; the old PF + planner + Tracy tier is dormant); the Tax 4/5 stall "reach out" escalations (default **4 business days**) → **assigned PF**. Gotchas #291 (the four-layer departed-staffer checklist) + #292 (the per-recipient `links` map). Full per-notification inventory: [tax-planning.md § Notification inventory](tax-planning.md#notification-inventory-tax-pipeline--audit-2026-06-09).

### Advisor / Accountant onboarding — route to the "Team Member Responsible" (2026-06-15)

Each `advisor_onboarding` / `accountant_onboarding` row carries an `onboarding_team_member` name (Stage-1 dropdown). [`constants/onboarding-team.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/constants/onboarding-team.ts) `teamMemberRecipient(name)` maps it to that person's login email, or `'admin'` when unset/unmapped. The mapped names mirror the frontend's `SALES_TEAM_NAMES` and the two must move together — read the map rather than a count written here (#402); Vanessa Smith was added 2026-09-03. A name present only in the frontend array is selectable and then routes silently to the shared `admin` bell, with nothing on screen to say so (#466). Which onboarding notifications use it:

| Insert point | Recipient | Notes |
|---|---|---|
| Client clicked **Yes** (`*/client-decision.ts`) | **team member** | "<name> clicked Yes on the advisor/accountant-onboarding email" |
| Client clicked **No** (`*/client-decision.ts`) | **team member** | "<name> clicked No on the …-onboarding email" — rerouted alongside the Yes click (2026-06-15) |
| Client clicked **Request Additional Meeting** (`*/client-decision.ts`, `decision='ExtraMeeting'`) | **team member** | **action-required** (`dismissible:false`), rules `ADVISOR_extra_meeting_requested` / `ACCOUNTANT_extra_meeting_requested` (recipient token `TEAM_MEMBER`; added 2026-07-14). Title "Extra meeting requested…"; link deep-links to the onboarding record. **Cleared** by the extra-meeting outcome handler (see the extra-meeting subsection below). |
| Stall escalations (`*/sweep.ts`, `addAdvisorNotif`/`addAccountantNotif`) | **team member** | the three stall notices (Undecided / agreement / payment), default **4 business days** each — formerly `admin` |
| **NEW** "Ready to create" action-required (`*/invoice-receipt.ts`) | **team member** | `dismissible:false`; `title: "Ready to create <name> — onboarding complete"`. Fired when payment + invoice/receipt are done so the Stage-3 "Create Advisor/Accountant" button is available. **Cleared** by `*/create-member.ts` (`.like("title","Ready to create%")`) once the member is created. |
| CEO-countersign FYI (`*/ceo-countersign.ts`) | `admin` (unchanged) | not rerouted this session |

(The sweep's 14-day implicit-No auto-decline updates the row + chains the decline email but inserts **no** notification. **Its 14 days stay CALENDAR days** — a deliberate survivor of the 2026-08-14 business-day conversion, because it is an owner decision about how long a prospect gets, not a chase cadence. A `final_decision='ExtraMeeting'` parked at the decision stage suppresses both that auto-decline and the decision-stall reminders.)

### Advisor / Accountant onboarding — extra-meeting mechanism (2026-07-14)

Mirrors MAP 1's extra-meeting flow, on BOTH onboarding pipelines. The original Undecided decision email and all three sweep reminder emails carry a blue **"Request Additional Meeting"** button (the `/advisor-decide` | `/accountant-decide` token URL with `decision=ExtraMeeting`; the sweeps mint a `decision_token` via `ensureDecisionToken()` for straight-Yes rows that never had one, omitting the button if minting fails). Flow: client clicks the button → `automation_ADVISOR_clientdecision` / `automation_ACCOUNTANT_clientdecision` derives the stage from row state (`payment_link_sent_at`→`'payment'`, else `agreement_sent_at`→`'signing'`, else `'decision'`), stamps `extra_meeting_requested_at` / `extra_meeting_stage` (nulls `extra_meeting_completed_at` on repeat requests), and at the decision stage also parks `final_decision='ExtraMeeting'` → fires the action-required `TEAM_MEMBER` bell (above). The admin books/holds the meeting, then records the outcome via `automation_ADVISOR_extrameeting` / `automation_ACCOUNTANT_extrameeting`; every outcome path clears the bell (by pipeline + `dismissible=false` + `read=false` + `link LIKE '%onboarding=<id>%'` — onboarding notifications have no `client_id`).

### Cross-pipeline: Tracy "client has paid" FYI (repurposed 2026-06-30; sheet check removed 2026-07-01)

[`utils/revshare-tracy-notify.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/revshare-tracy-notify.ts) `notifyTracyClientPaid()` — an FYI (dismissable, deduped once per payment) to **Tracy** (`tnmiller@`) that a client has paid and the case is cleared to proceed, fired once per payment from MAP 1 (`contract-revshare.ts`, with the client's chosen priorities) and Tax (`revshare.ts`), **independent of any rev-share sheet**. The old `notifyTracyRevShareNeeded()` ("enter the split into the VFO Services - Private Info sheet", fired on the Tracy-sheet `pending` branch) was repurposed to this — the Tracy Revenue-Master cross-check that produced the `pending` branch was removed (gotcha #164). No auto-clear.

### Cross-pipeline: vault-drop FYI — Tracy + the client's assigned PF (2026-08-13, v738; recipients widened 2026-08-19, v760; **TRIGGERS widened to member drops 2026-08-27, v796**)

[`utils/vault-planner-notify.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/vault-planner-notify.ts) `notifyPlannerVaultDrop()` — rule **`VAULT_planner_document_added`**, pipeline **`VAULT`**, `dismissible: true`, link `/admin/client/<client_id>?tab=vault`.

> **The rule now serves TWO callers, and its own prose is out of date (2026-08-27, v796).** The member client Vault tab's minter fires the **same key** through a sibling helper, **`notifyMemberVaultDrop`** in `actions/vault/member-client-vault-shared.ts` — a sibling rather than a branch inside `notifyPlannerVaultDrop`, because that one resolves a TAX PLANNER session first and would **silently no-op** for a member caller. Everything else matches: same title shape (*"«Member» dropped a document in «Client»'s vault"*), same Tracy + assigned-PF recipients via `taxPfLoginEmail`, same `dynamic: { ASSIGNED_PF }`, same mint-time firing, same whole-body try/catch. **OWED, no code involved:** the `notification_rules` row's **label, description and trigger_note still say "planner"** (*"Planner added a document to a client vault (Tracy)"*) — a one-row text update. Per **#411** the bell TITLE and the rule KEY are deliberately left alone: this is an FYI with no title-prefix clear site, and the key is what the Editor keys enable/recipients on.

**Recipients (changed 2026-08-19; the PF is conditionally dropped since 2026-09-09):** `TRACY_EMAIL` **plus the client's assigned PF**. Tracy owns the vault, but the person running the engagement is the PF, and relaying every drop by hand was the whole friction. The PF address is resolved **server-side from the `clients` row** — `assigned_pf` now rides along on the name lookup the function already did (one row, one round-trip, never from `body`) and goes through **`taxPfLoginEmail`**, the PORTAL LOGIN address, *not* the `utils/pf-emails.ts` correspondence map the email templates use. An absent or unmapped PF resolves to `null` and the list falls back to **Tracy alone** — exactly the pre-change behaviour, never a throw. The list is `Set`-deduped so a PF who is also the vault owner is not bell-ed twice. Per **#324/#413** the handler also passes `dynamic: { ASSIGNED_PF: pfEmail }`, because a rule-level `ASSIGNED_PF` recipient override does nothing unless this handler supplies the value — and is dropped silently if it does not. Fired from **both** planner-reachable signed-upload-url minters: `actions/vault/tax-admin-upload-url.ts` (Sensitive Documents) and `actions/vault/gen-upload-url.ts` (General Documentation).

> **`suppressPf` — one person, one file, one bell (2026-09-09, v820)** *(v: 2026-09-09)*. `notifyPlannerVaultDrop` takes a sixth parameter `suppressPf` (default **false**), and when it is true the assigned PF is dropped from THIS bell — `pfEmail` resolves to `null`, so the recipients are Tracy alone and `dynamic.ASSIGNED_PF` is null. Its only caller-supplied value is the return of **`utils/assess-vault-stamp.ts maybeStampAssessVaultUpload`**, which now returns `Promise<boolean>` — true iff it actually raised that PF's **action-required** *"Tax Assessment PDF added for «client»"* ask about the SAME file. On an ICG (vault-assess group) drop while the assess form is still outstanding the PF therefore gets **ONE** bell, the action-required one, instead of that plus a dismissible FYI beside it (user decision). **Tracy is never suppressed** — she does not receive the action-required bell, so this stays her only signal that a file landed. Every other case (a later ICG drop, a drop once the assess form is in, any non-ICG planner, any member drop through `notifyMemberVaultDrop`) passes false and is byte-identical to before. **This required reordering the two minters: the stamp now runs BEFORE the notify** in both `gen-upload-url.ts` and `tax-admin-upload-url.ts`, where it used to run after; they are independent (one reads/writes tax-plan rows, the other only notifies) and each has its own try/catch, and a throw in the stamp returns false, i.e. "send the ordinary FYI". Gotcha **#481**.

Title: `<Planner Full Name> dropped a document in <Client First Last>'s vault`. Message adds the filename and the section label.

**Three properties differ from every other bell in this doc and are the reason it has its own section:**

1. **It fires at signed-URL MINT time, not on the upload.** The browser PUTs the file straight to storage, so the minter is the only backend touchpoint — a PUT that then fails leaves one slightly early bell. Accepted deliberately for an FYI; the alternative is no signal at all.
2. **No dedupe.** Every document drop is its own bell (contrast the Tracy "client has paid" and Jake failure FYIs, which dedupe).
3. **Admin uploads are excluded in CODE, not by a rule setting.** `resolveCallerPlanner` gates on `isPlannerSession()`, so an admin who also holds a planner login resolves to `null` and fires nothing — mirroring however `middleware/auth.ts` decides the caller's role. **Updated 2026-08-20 (v772):** that decision is now `admin_sessions.login_type`-first — a session minted at the admin portal is silent and one minted at the planner portal fires, *even for the same email*; the old `allowed_admins`-before-`tax_planner_logins` email probe remains only as the fallback for legacy NULL-`login_type` sessions. Gotcha #425.

FYI only: **no clear site, and its title is NOT load-bearing** — it sits outside the tax-track title-prefix clearing chain described above. Live-tested three ways on v738: Team Member → General fires, Tax Planner → Sensitive fires, admin → silent. Gotcha **#393**.

### Cross-pipeline: Jake payment/transfer-failure alerts (2026-06-09)

[`utils/notify-jake-failure.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/notify-jake-failure.ts) `notifyJakeFailure()` — an alert (deduped) to **`jlatham@elitert.com`** on every detectable money-movement failure, IN ADDITION to any existing notification: revshare Connect-transfer failed (MAP 1/Tax/PIP), MAP 1 quarterly off-session charge failed, Tax implementation charge failed, Specialist bg + license payment failed (`router/webhooks.ts`). **Expanded 2026-06-15** to also cover ACH first-payment bounces (`checkout.session.async_payment_failed`, all pipelines), failed first-payment PaymentIntents (broadened beyond Specialist), Specialist license lapse/cancel (`customer.subscription.updated`/`deleted`), chargebacks (`charge.dispute.*`), refunds + failed refunds (`charge.refunded` / `refund.*`), and rev-share clawbacks (`transfer.reversed`). Gained an `actionRequired` flag (non-dismissible) + `clearJakeFailure`/`clearJakeFailuresContaining` auto-clear — action-required + auto-clear for rev-share/license/disputes, dismissible FYI for the rest.

**Third "share held" sibling: `SPECREV_member_share_held` (2026-08-24)** *(v: 2026-08-24)*. `utils/specialist-revenue-payout.ts` now raises an action-required bell through the same helper when a Specialist Revenue **member** line has no Stripe payout account — the SpecRev twin of `MAP1_member_share_held` and `TAX_member_share_held`. Its title comes from the shared `memberShareHeldTitle("Specialist Revenue", name, member#)` and is built from the values **frozen on the line**, not the live `members` row, so it reconstructs byte-identically and self-clears (#122) even if the member is renamed between the hold and the transfer. Two clear sites: the successful transfer, and the `$0`-line close (a zero line never reaches the transfer, so that is its only chance). **What is NOT a bell:** the member suspended/paused revenue-share hold shipped the same day notifies **by internal Gmail DRAFT only** (`MEMBERS`/`MEMBER_revshare_held` → Paul, Cc Anton/Tray/Tracy), deduped once per hold episode. It raises no notification row at all, and the held member is deliberately told nothing. **Fourth sibling: `SPECREV_ert_transfer_failed` (2026-09-11)** *(v: 2026-09-11)*. The same engine raises it through the same `notifyJakeFailure` helper when the line's **ERT** leg — the new `ert_share`, forwarded from the VFO Services platform balance to ERT's connected account — fails to transfer, or when `ERT_CONNECT_ACCOUNT_ID[_SANDBOX]` is unset. It is deliberately modelled one-for-one on `SPECREV_transfer_failed`, because it is the same kind of event on the other leg of the same row: one title per request (`Specialist revenue ERT transfer FAILED — request #N`), retried by the nightly sweep, and auto-cleared via `clearJakeFailure` only when a run sends at least one ERT leg and fails none. It has a **third trigger** besides a Stripe failure and a missing secret: a destination whose **transfers capability is not yet active**, detected by a `connectTransfersActive` probe that runs *before* any Stripe call (gotcha #489). Unlike the member leg, **nothing is ever emailed on the ERT leg**: ERT is a sister company, not a payout recipient being onboarded. **Proven in live 2026-09-11:** raised once for request 37 line 86 and auto-cleared on the successful retry.

**The Tax + MAP 1 held bell is now GATED on `connect_setup_email_sent_at`, and it CLEARS the FAILED bell (2026-09-09, v820)** *(v: 2026-09-09)*. `tax/revshare.ts` and `contract-revshare.ts` no longer branch on a bare `!member.stripe_account_id`: they probe `capabilities.transfers === 'active'` (`utils/connect-payout-readiness.ts`), and a half-built account now parks the leg at **`AWAITING_CONNECT`** exactly like an absent one instead of failing it (**#159/#479**). The bell follows the ASK, not the money. If **no** setup link has been sent (`members.connect_setup_email_sent_at` is null) the action-required `TAX_member_share_held` / `MAP1_member_share_held` bell is raised as before, with its MESSAGE branching on which case it is (*"has not finished onboarding"* vs *"no Stripe payout account"*) and its **TITLE untouched**, because the title is the clear contract (#365/#411). If a link **has** been sent there is nothing an admin can do, so the engine raises nothing and instead **`clearJakeFailure()`s BOTH** the held title and the older `Revenue share transfer FAILED — <client>` title, retiring bells an earlier run had minted — which is what silenced bells 1729 and 1784 on plan 91. The money is unaffected either way: the leg stays non-terminal and both nightly sweeps keep retrying it. **PIP is deliberately unchanged** (its `Pending` is not swept — see [architecture/07-server-chains.md](../architecture/07-server-chains.md)).

## Step 3 — Mark read (single)

**Handler:** `mark_notification_read({notification_id})` ([NotificationBell.jsx:41](src/components/NotificationBell.jsx) → [admin-api:4569-4578](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)). UPDATEs `notifications.read=true` for one id.

## Step 4 — Bulk clear (per-client, by handlers)

Two handlers clear all unread notifications for a `client_id` after the admin completes a follow-up:

| Handler | Where | Effect |
|---|---|---|
| `automation_PCADMIN_pricing` | [actions/pipeline/pcadmin-pricing.ts:33-38](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/pcadmin-pricing.ts) | `UPDATE notifications SET read=true WHERE client_id=<id> AND dismissible=false AND read=false` |
| `automation_PCADMIN_extrameeting` | [actions/pipeline/pcadmin-extra-meeting.ts:163-168](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/pipeline/pcadmin-extra-meeting.ts) | same |

**CORRECTED 2026-08-18 — both clears carry `dismissible=false`** (the row above previously showed them as clearing by `client_id` alone). Only action-required rows are swept; a PF's dismissible FYIs for that client survive for them to clear themselves. Neither clear is pipeline-scoped, so an action-required TAX/PFT bell for the same client is swept too — a known blunt edge, not a fix made here.

This avoids leaving the "client chose Yes" notification in the bell after the admin actually completes the pricing form.

> **The "Reached out?" stall checkbox now clears its step's bells too (2026-08-18).** `automation_stall_ack` ([actions/automation/stall-ack.ts](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/automation/stall-ack.ts)) used to only stamp a `*_pf_ack_at` column that nothing read. Checking the box (`ack !== false`) now ALSO marks read every unread bell belonging to that step — the reach-out stall bell, plus the step's "requested extra meeting" bell where one exists — **regardless of `dismissible`**, across all seven pipelines (MAP 1 / TAX / advisor / accountant / specialist / PFT / regular). Scoping: client pipelines by `pipeline + client_id + read=false + title suffix` (TAX additionally by the link's `&program=<id>`, REGULAR additionally by the priority name quoted in the message, because one client can hold several plans/tracks minting identical titles); onboarding pipelines by `pipeline + read=false + link LIKE '%onboarding=<id>' + title suffix`, since those bells carry `client_id NULL`. Extra-meeting coupling is narrow, and the four mint sites do **not** share one wording — MAP 1 / advisor / accountant end in `requested extra meeting`, TAX ends in `requested extra meeting (tax)` ([final-decision.ts:159](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/actions/tax/final-decision.ts)) — so each is listed as its own literal. MAP 1 `c14` and TAX `tax_decision` own theirs outright; advisor/accountant mint ONE bell serving all three steps, so it clears only when the row's `extra_meeting_stage` equals the stall being acked. The TAX extra-meeting bell's other clear site, `actions/tax/extra-meeting.ts:46-51` (fired when the admin records the meeting outcome), reads EVERY unread TAX row for the client — far blunter; the stall-ack clear is narrower and the two are idempotent together. The clears are **fail-soft** (logged, swallowed — the ack write must never fail because a clear did), and **unchecking is one-way**: it nulls the ack column and restores nothing. Every sweep that mints a stall bell now also filters `.is("<stall>_pf_ack_at", null)`, so a checked box is a genuine satisfied-on-fire guard rather than something the next nightly tick undoes. The matched title fragments are copied byte-for-byte from the insert sites — **these stall titles are now load-bearing strings** on the same terms as the tax hand-off prefixes above.

> **The narrower, and now more common, form is a TITLE-PREFIX clear.** An action-required row (`dismissible=false`) is refused by `mark_notification_read` (#179), so its completing handler must write `read=true` itself — and where several such bells can coexist for one client, the write is scoped by **pipeline + `client_id` + `dismissible=false` + `read=false` + `title ILIKE '<prefix>%'`** rather than by client alone. The **tax-track hand-off chain** is the largest instance: **eleven fixed prefixes** cleared from `allocate-planner`, `save-task`, `ready-for-tax3`, `deposit-refund`, `save-assess-form`, `presentation-schedule`, `presentation-sweep`, `highlevel-meeting-confirm` and `postreview-decision` (the two vault fire sites share one prefix; the Tax 4 extension of #170 added three more; the #400 vault hand-off added an eleventh, the only one not registered in `tax-review-bell.ts`) — which makes those titles load-bearing strings — reword one without moving its clear and the bell becomes permanent. **The authoritative prefix → clear-site map lives in [`utils/tax-review-bell.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/tax-review-bell.ts)'s header**, which also owns the clear helpers every one of those handlers calls. Two consequences worth internalising: **a bell whose instruction is already satisfied is never minted** (nothing would clear it), and **a rule row's `action_required` column does not create or remove this behaviour** — only the call site's `dismissible:false` does. See [tax-planning.md § In-app notification CLEARS](tax-planning.md#in-app-notification-clears-targeted-update-readtrue) and gotcha **#357**.

## Tables touched

- **Read:** `notifications`.
- **Written:** `notifications` (insert + read flag updates).

## Downstream chains

**None.** Notifications are purely informational.

## Auth

- `load_notifications` is in `ADMIN_ONLY_ACTIONS` ([admin-api:2249](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/index.ts)) — only admins can read.
- `mark_notification_read` is in `ADMIN_ONLY_ACTIONS` — only admins can mark.
- The handler that *inserts* (`automation_PCADMIN_finaldecision`) is public-token-authed (no session required), so the insertion is gated by knowing a valid `c15_token`.

## Failure modes

1. **Polling load on expired session** — every 30s the bell calls `load_notifications`. If the admin's session expired since the page loaded, the next poll returns 401 → triggers global redirect → admin gets bumped to login mid-session. Documented in [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md).
2. **Mark all read race** — the "Mark all read" UI iterates with `Promise.all(notifications.map(n => callApi('mark_notification_read', ...)))`. With 20 items that's 20 parallel HTTP requests. If any one fails, the bell still clears in UI but the row stays unread server-side. Refresh would re-surface it.
3. **No dedup** — multiple `Yes` decisions for the same client (e.g., admin re-runs the flow, or test data) insert duplicate notifications. The bell shows them all.
4. **Hardcoded LIMIT 20** — if more than 20 unread notifications accumulate (which would imply admin neglect), the oldest are silently dropped from view. They still exist in the table; admin must mark some read to surface the rest.

## Open questions

1. **Member notifications** — the schema and `load_notifications` filter both contemplate per-email recipients, but no insertion path uses that. Was member-side notification a planned feature?
2. ~~**Cleanup** — read notifications are never deleted. The table will grow indefinitely. No retention policy observed.~~ **ANSWERED (2026-07-10):** read rows are hard-deleted after 90 days by the daily `automation_NOTIFICATIONS_purge` cron (`notifications-purge-daily`, jobid 15, 10:30 UTC). See the banner at the top of this file.

## Not here: per-client email Cc

**In-app bell recipients and email recipients are different mechanisms and this doc covers only the first.** Since 2026-08-20 a client's **Additional Contacts** (`client_contacts.cc_on_emails`) add a **per-client leg to EMAIL recipient resolution** — `loadAdditionalContacts` → `resolveTemplateRecipients`'s `extraCc` parameter — and can be folded into the `[Client First]` body salutation. **No bell recipient is affected**: a contact never receives a notification, never appears in `notification_rules.default_recipients`, and never clears an action-required bell. Login-setup / password-reset emails and the planner-facing assess reminders are deliberately excluded; the `send_mode=true` vault documentation request is wired and **real-sends**. Full mechanism → [additional-contacts.md](additional-contacts.md).

## Cross-references

- Notifications table: [../tables/notifications.md](../tables/notifications.md)
- The two handlers that insert/clear: [contract-and-payment.md](contract-and-payment.md#step-3a--client-clicks-decision-button-on-decide-undecided-path-only)
- Action catalog: [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
