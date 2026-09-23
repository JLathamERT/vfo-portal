# Members tables

The "member" entity in this system = an advisor or accountant (not the end client). They log into the Member Portal, manage their own clients, and run programs.

## `members`

The advisor/accountant roster. PK is `member_number` (text), not an integer — used as the foreign-key target across most tables.

| Column | Type | Notes |
|---|---|---|
| `member_number` | text | pk |
| `first_name` / `last_name` | text | |
| `member_type` | text | The product/service tier, e.g. `"Implementation"`, `"Catalyst"`, `"Fusion A"`, `"VFO Reconciliation (Free)"` — NOT advisor-vs-accountant (that's `member_category`). Drives portal/UI behavior. **The legal VALUES DIFFER BY CATEGORY and the two vocabularies are easy to mix up (gotcha #329):** plain `"Implementation"` is an **advisor** value, while accountants use the partnership-qualified **`"Implementation - VFO FT (Direct)"` / `"Implementation - VFO FT (Advisor)"`** (`ACCOUNTANT_TYPES`). `automation_ACCOUNTANT_createmember` hardcoded the advisor value until 2026-08-04 — inherited when the accountant pipeline was cloned from the advisor pipeline — and now branches on `accountant_onboarding.accountant_partnership`. |
| `member_category` | text | `'advisor'` \| `'accountant'` \| NULL (CHECK-constrained). Added 2026-05-29 (gotcha #48). The durable advisor-vs-accountant tag — replaces the old `ACCOUNTANT_TYPES`/`onboarding_id` heuristic. NULL = uncategorized (incl. corporate `<parent>-C<n>` members, which stay out of the integer numbering buckets). With `advisor_model` it forms the 4 numbering buckets used by `nextMemberNumber()`. Backfill: onboarding FKs → their category, the 20 legacy advisors → `advisor`. Drives the member-side Revenue-Decision hide + the admin AccountantsPanel/AdvisorsPanel filters. |
| `elite_status` | text | default `'Active'`. Status field. **Since v535 (2026-07-02), `Lost`/`Removed` also blocks `member_login` (403; the `member_logins` row is kept — flip back to Active to restore access, gotcha #171).** |
| `advisor_model` | text | `'Legacy Model'` or `'New Model'`. Added 2026-05-26 (Phase 5 advisor onboarding). All 19 pre-existing rows backfilled to `'Legacy Model'`. New rows from `automation_ADVISOR_createmember` get `'New Model'`; manual Add Advisor rows take whichever the admin picks (required, no default). Surfaced in the Search Advisors list as the 5th column. Second axis of the numbering buckets (with `member_category`). |
| `onboarding_id` | bigint | nullable FK → `advisor_onboarding(id)` `ON DELETE SET NULL`, partial index on non-null. Added 2026-05-26 (Phase 5). Set by `automation_ADVISOR_createmember`; remains NULL for legacy/manual advisors. Lets you trace a `members` row back to its onboarding record. |
| `accountant_onboarding_id` | bigint | nullable FK → `accountant_onboarding(id)` `ON DELETE SET NULL`. Added 2026-05-28 (Accountant Onboarding pipeline). Set by `automation_ACCOUNTANT_createmember`; remains NULL for advisors and manually-added accountants. Lets you trace a `members` row back to its accountant onboarding record. |
| `join_date` / `renewal_date` / `leave_date` | date | `members.renewal_date` is NOT what the profile shows: `member_profile_load` returns an additive `membership_renewal_date` derived from `member_payment_plans.renewal_date` (the active plan, else the newest `setup_pending` one) — display-only on Profile / Edit Profile, stripped by `member_profile_save` (2026-09-15). |
| `suspended` | boolean | default `false`. Status field — set ON only by the admin's MANUAL toggle. Automation switches it **OFF** in exactly one place: `utils/membership-arrears-payment.ts` `liftSuspensionOnArrearsClear`, the moment `membership_arrears` is cleared (card pay-now settle or sweep pass 4) — any suspension, whatever its reason (the portal records none), with FYI bell `MEMBERSHIP_arrears_suspension_lifted` to Jake (2026-09-23). **Gates payouts (2026-08-24)** — see *Standing flags gate money* below. |
| `membership_arrears` | boolean | not null default `false`. **Replaced `membership_suspended` on 2026-09-15** (migrations `20260915120000` add + backfill, `20260915130000` drop). Set ONLY by membership-billing automation on a missed/bounced pull (sweep charge pass + `payment_intent.payment_failed`); cleared by `utils/membership-arrears-payment.ts` `clearMembershipArrearsIfCaughtUp` — from the sweep's pass 4 (once per member) or the moment a card arrears payment clears at `/membership-pay` — only when no missed/declined row is left across ALL the member's active plans; the same clear lifts `suspended` (see above). **NOT a suspension**: displays show a separate amber *In Arrears* chip, never "Suspended" (#240's OR is gone), login is unaffected, and its only effect is to HOLD the member's revenue-share payouts (see below). `member_profile_save` strips it from the payload — the form must never write it. |
| `paused` | boolean | default `false`. Status field. **Also gates payouts as of 2026-08-24** — see below. |
| `revenue_decision` | text | Whether they share revenue (`'Revenue Share'` / `'Money Mapping'`). **Accountants DO have one as of 2026-08-12 / v730 (gotcha #375)** — the old accountant carve-out is gone: `add_member_full` defaults `'Revenue Share'` for everyone uniformly, `automation_ACCOUNTANT_createmember` writes `'Money Mapping'` (mirroring the advisor pipeline), and a one-off DML backfill filled every pre-existing accountant. The Add-Accountant form now requires the field exactly as Add-Advisor does. **Consumers must still treat NULL as `'Revenue Share'`** — that is what the revshare engines default to, and 8 non-accountant rows (3 advisor + 5 uncategorised) are still NULL. **As of 2026-08-24 this column is a FALLBACK on the Accounting panels, not the answer:** `isMoneyMappingLeg()` in `shareLegState.jsx` buckets a **settled** leg into the Member Revenue Share vs Member Money Mapping column by **what actually happened to that leg**, and reads `revenue_decision` only for an **unsettled** one — a member who switches decision must not have their past payouts silently refiled (see gotcha #395). |
| `stripe_account_id` | text | **Stripe Connect ID** — used by `automation_CONTRACT_revshare` for Transfers. **Not a "has been set up" signal** — it is stamped the moment the Connect account is created, so a UI that branches on its presence shows a false "connected" (#318); ask `member_connect_status` instead. **And as of 2026-08-27 it is not necessarily the member's OWN account** — see `stripe_account_linked_from` below before reading it as "this member's Stripe account". |
| `stripe_account_linked_from` | text | nullable, no FK. Added 2026-08-27 (migration `20260827140000_member_stripe_linked_from.sql`, gotcha **#454**). **When set, `stripe_account_id` on this row is BORROWED from the named `member_number`** — a Corporate Member with no Connect account of their own being paid into their LEAD member's account. **The link is made by COPYING the lead's `stripe_account_id` onto this row, and the copy IS the routing:** all four payout engines (`actions/pipeline/contract-revshare.ts`, `actions/tax/revshare.ts`, `actions/msm/pip-revshare.ts`, `utils/specialist-revenue-payout.ts`) read `stripe_account_id` directly as the Stripe transfer `destination` and **none of them changed**. This column is a **MARKER only** — nothing resolves through it. It gates exactly three surfaces, each of which would otherwise treat a borrowed account as the member's own: (1) `member_stripe_connect_request` **400s** (the setup email would hand this member an onboarding link into the LEAD's Stripe account); (2) `connect_setup_link` — the PUBLIC `/payout-setup?token=` page — returns its **generic 404** (the same hole reached via a durable token already in an inbox); (3) `member_payments_load` skips the transfers-**by-destination** listing and returns `payouts_linked_to` instead (it would show the lead's entire payout history and every sibling corporate member's). Written **only** by `member_stripe_link_lead` (`ADMIN_ONLY`), which resolves the lead SERVER-SIDE (see below), refuses to overwrite an account the member genuinely owns (`stripe_account_id` set with **no** marker), and on `unlink` clears both columns — refusing when there is no marker, so an unlink can never throw a real account id away. Deliberately as loose as `connected_member_number`, which carries the same lead relationship. |
| `connect_setup_email_sent_at` | timestamptz | nullable, no default. Added 2026-08-21 (migration `20260821120000_members_connect_setup_email_sent_at.sql`, gotcha #428). **The duplicate-send guard for `member_stripe_connect_request`**, whose template (`member_connect_setup`, id 159) is one of the `send_mode=true` rows — a second admin click used to mail the member for real. Set ⇒ the action refuses with `{already_sent_at, to_email}` and does nothing else, unless the caller passes `force: true` (which proceeds fully and re-stamps). Backfilled 2026-08-21 for 29 members from `connect_setup_tokens.created_at` (`entity_type='member'`); a member with no token row stays NULL and gets one un-confirmed send. |
| `primary_relationship` / `advisor_engagement` | text | |
| `connected_member_number` | text | fk → `members.member_number` (SET NULL). Self-referencing. **LEGACY as of 2026-07-31 — corporate-parent pointer ONLY** (gotcha #312). It used to be the system's single member-to-member link; the migration `20260731130000_member_connections.sql` backfilled all 240 one-way links into the new `member_connections` pair table and **CLEARED this column on every non-corporate row**, so **zero live rows carry a value**. The one surviving writer is the Add Advisor **corporate** flow (`add_member_full`, behind the "Connected Member \*" picker that appears only for a Corporate member type). `load_data` still returns it for that purpose. **Reading it to answer "who is this member connected to" is a bug** — use `member_connections`. |
| `connection_type` | text | The **INTRODUCER's** revenue-share tier for the introduction recorded in `introduced_by_member_number` — i.e. read it off the INTRODUCED member's row and pay it to the introducer. UI label: **"Introducer Benefit"**. Values: `'5% - Regular Advisor'`, `'10% - Accredited Introducer'`, `'10% - Accredited Mentor'`, `'20% - Accredited Introducer + Mentor'`. **Shown for every member category since 2026-07-31, accountants included** (it was hidden for `member_category='accountant'` between 2026-06-18 and then). A **connection** has no tier — this column belongs exclusively to the introduction slot (gotcha #312). |
| `introduced_by_member_number` | text | nullable. Added 2026-07-31 (migration `20260731120000_introduced_by_member_number.sql`, gotcha #312). fk → `members.member_number` (SET NULL). **Who introduced THIS member — one introducer per member, directional.** The tier the introducer earns is in `connection_type`. The migration moved the three rows that already carried a tier out of `connected_member_number` into this column (a typed old-style link WAS an introduction). No dedicated action: `member_profile_save` is a whole-row spread upsert, so the ordinary Save button persists it; it is surfaced per member by `load_data` (a new `members` column is invisible to the portal until it is whitelisted in that merge — gotcha #207). |
| `trading_name` | text | nullable. Added 2026-06-18. **"Company Name"** (UI label; the column name stays `trading_name`). Shown/editable on **accountant AND advisor** profiles (2026-07-14 — was accountant-only) — the Add-Accountant form + Edit Profile + profile details + the member's own portal. Auto-filled on onboarding create from the New-Model-Sale modal's `sale_company_name` (`advisor`/`accountant/create-member.ts`). Inserted by `add_member_full`, persisted by `member_profile_save` (passthrough upsert), returned by `load_data`. |
| `email` | text | **The ROUTING address — every outbound email to this member goes here**, and it is the only member address anything sends to. UI label since 2026-08-20: **"Work email (emails sent here)"** on Edit Profile / profile details, **"Work Email \*"** on the add + onboarding forms (`MembersPanel.jsx`, `AdvisorOnboarding.jsx`, `AccountantOnboarding.jsx`). Column name and every writer/reader unchanged — the relabel exists purely to make the split below unambiguous at the point of entry. |
| `personal_email` | text | nullable. Added 2026-08-20 (migration `20260820140000_members_personal_email.sql`). **Record-keeping only — nothing ever emails it.** Edited in the admin **Basic Info** form as *"Personal email (not emailed)"*, loaded by `member_profile_load` (a `select *`, so it needed no read change) and persisted by `member_profile_save`'s passthrough upsert (so it needed no write change either). **It is DELIBERATELY absent from `load-data.ts`'s whitelisted member payload and from every recipient resolver** — that blob is returned to every logged-in caller (gotcha #207 is normally the reason a new column is invisible; here the invisibility is the point). Adding it to that whitelist, or to any `to`/`cc` resolution, would leak a private address and start mailing it — both are the bug, not the fix. **Specialist twin added 2026-08-26:** `experts.personal_email` ([specialists.md](specialists.md)) is the same record-only, never-emailed field beside the same "Work email" relabel — **but the payload mechanics are INVERTED, so the same privacy took opposite work.** The `members` blob is an ADDITIVE whitelist (#207) and this column is private by simply never being listed; the `experts` blob is `select("*")` with SUBTRACTIVE per-caller redaction, where a new column is **public by default** and had to be explicitly stripped in **three** places. Never reason about one from the other. |
| `notes` | text | |
| `headshot_image` | text | nullable. Added 2026-07-10. **Member profile headshot** — stores just the filename; the image lives in the public `headshots` bucket (shared with `experts.headshot_image`), rendered as `<HEADSHOT_SUPABASE>/<encoded filename>`. Admin-managed only (mirrors specialists): uploaded via `upload_headshot` + cropped by `ImageCropModal`, persisted by `member_profile_save` (passthrough upsert). Surfaced on the admin `TrackHero` avatar + member-portal hero via `load_data` (must be whitelisted there — gotcha #207). |
| `bio` | text | nullable. Added 2026-07-10. Member biography (long-form), shown full-width on the admin + portal profile. Admin-edited via `member_profile_save`. |
| `website_url` | text | nullable. Added 2026-07-10. Member website; rendered as a clickable link (bare domains get `https://` prepended). Admin-edited via `member_profile_save`. Auto-filled on advisor/accountant onboarding create from the New-Model-Sale modal's `sale_website` (2026-07-14). |
| `assigned_msm` | text | Member-Servicing-Manager identifier. |
| `engagement_level` | text | nullable. Admin-set engagement rating shown/editable on the **Member Overview** tab: `highly_engaged` / `reasonably_engaged` / `somewhat_engaged` / `disengaged` (or null = not set). Saved via `member_save_engagement`. Added 2026-07-01. **ADMIN-ONLY IN `load_data` since 2026-09-09 (v820)** — `actions/data/load-data.ts` returns it as `isAdmin ? value : null`, the same treatment and the same reason as `notes` above: it is an internal rating OF the member sitting in a whitelisted blob returned to EVERY logged-in caller (#445, the additive-whitelist half). Its two readers are both admin surfaces — the Member Overview tab's editor and the member profile hero's engagement pill. |
| `vfo_certified_date` / `vfo_accredited_date` | date | |
| `ciq_enabled` | boolean | not null, **default `true` since 2026-09-22** (migration `20260922120000_ciq_enabled_default_on.sql`, which also switched all 607 existing members ON; it was `false` from 2026-06-18). No code changed with it — the column is NOT NULL, so every reader's `ciq_enabled || false` picks up a real `true`. **CIQ "can start new CIQs" gate** for this member (admin toggle "Allow Member to Start New CIQs"). Members always *view* their CIQs regardless; this only gates *starting* new ones (enforced frontend + in `ciq_create`/`ciq_add_client_and_create`). Repurposed 2026-06-18 — previously hid the whole CIQ tab. |
| `ciq_vfos_managed` | boolean | not null, default `true`. CIQ behavior toggle — when on, the One Page Plan shows "Powered by VFO Services". |
| `created_at` | timestamptz | default `now()` |

**Status fields:** `elite_status`, `suspended` (manual), `membership_arrears` (automation, 2026-09-15), `paused`, `ciq_enabled`.
**Automation fields:** `stripe_account_id` (revshare), `suspended` / `paused` / `membership_arrears` (**revenue-share payout hold, 2026-08-24 / arrears 2026-09-15**), `ciq_enabled` (CIQ start-new gate) / `ciq_vfos_managed` (CIQ "Powered by VFO Services" label).

### Standing flags gate money as of 2026-08-24 *(v: 2026-09-15)*

**`suspended`, `paused` and `membership_arrears` (until 2026-09-15 `membership_suspended`, which surfaces OR'd into "Suspended", #240) are read by the four revenue-share payout engines**, and since 2026-09-15 each is its OWN standing with its own held value and its own chip:

| Engine | Held value written |
|---|---|
| `actions/pipeline/contract-revshare.ts` (MAP 1) | `rec{N}_rev_paid` = `Held - Member Suspended` / `Held - Member Paused` / `Held - Member In Arrears` |
| `actions/tax/revshare.ts` | `{retainer\|implementation}_rev_paid` = same three |
| `actions/msm/pip-revshare.ts` | `pip_rev_share_status` = same three |
| `utils/specialist-revenue-payout.ts` | `specialist_revenue_lines.payout_status` = `held_member_suspended` / `held_member_paused` / `held_member_arrears` (snake_case — that table's own vocabulary; **the Title-Case trio must not leak into it**) |

**Precedence — `utils/member-payout-hold.ts` `memberHoldReason(member)`:** `suspended` ⇒ `"suspended"`; else `paused` ⇒ `"paused"`; else `membership_arrears` ⇒ `"arrears"`; else `null`. The label names the most serious reason; the release fires only when NO reason is left. **Arrears gets its own internal notice** — `MEMBERS` / `MEMBER_revshare_held_arrears` (quotes the arrears amount + months via `loadMembershipArrears`) — while suspended/paused share `MEMBER_revshare_held`. The **writer** rule of #240: automation never sets `suspended` ON (its one write is the arrears-clear lift to OFF, `liftSuspensionOnArrearsClear`, 2026-09-23), admin UIs must never write `membership_arrears`, and nothing automated touches `paused`; only this READER sees all three at once.

**Two triggers release the hold** (both call `utils/member-payout-release.ts`): `member_profile_save` when a save takes the hold reason non-null → null (it re-reads the row after the upsert — a partial-profile save cannot be judged from the payload), and `utils/membership-arrears-payment.ts clearMembershipArrearsIfCaughtUp` when clearing `membership_arrears` (and lifting any suspension) leaves no reason at all — called by the membership sweep's pass 4 and, the moment a CARD arrears payment clears at `/membership-pay`, by the webhook (an ACH one waits for pass 4). Any new consumer that must not pay a member out of good standing calls `memberHoldReason` — do not re-derive the OR. **Selecting the three columns is now load-bearing in a payout handler's `members` select** (a missing column reads as `undefined` ⇒ not held ⇒ the money moves).

**Touched by:** `load_data`, `add_member`, `add_member_full`, `save_member`, `delete_member`, `member_profile_load`, `member_profile_save` (incl. `introduced_by_member_number` + `connection_type` — a full passthrough spread; **and since 2026-08-24 the hold-release trigger above, whose response gains an additive `payout_release` key when it fires**), `upload_headshot` (profile headshot → `headshots` bucket), `automation_CONTRACT_revshare`, `automation_TAX_revshare`, `automation_PIP_revshare`, `specialist_revenue_payout`, `automation_MEMBERSHIP_sweep`; **and since 2026-08-27 `member_stripe_link_lead`** (the only writer of `stripe_account_linked_from`, and the only writer of `stripe_account_id` that does not come from Stripe account creation). Frontend: [MembersPanel.jsx](src/components/admin/MembersPanel.jsx), [MemberPortal.jsx](src/pages/MemberPortal.jsx), [corporateMember.js](src/components/shared/corporateMember.js) (shared corporate-lead helper), [MemberPaymentsTab.jsx](src/components/payments/MemberPaymentsTab.jsx) (the borrowed-account note in place of the payout table).

### A corporate member's LEAD is derived from the member-number PREFIX *(v: 2026-08-27)*

**There are 40 corporate members and the authoritative link to their lead is the PREFIX of their own `member_number`** — `58147-C1` belongs to `58147`, and the same holds for `-FC<n>` and `-FCL<n>`. Three `member_type` values are corporate: `Corporate Member`, `Free Corporate Member`, `Free Corporate Member (Legacy)`.

`connected_member_number` says the same thing and is **preferred when non-empty**, but the 2026-07-31 `member_connections` migration left it populated on only **3 of those 40 rows** (#312) — the prefix resolves for **100% of them**, live-verified 2026-08-27, and the 3 rows that carry both always agree. **So: try `connected_member_number`, fall back to the prefix; never rely on `connected_member_number` alone, and never treat a NULL there as "no lead".**

Both implementations of this derivation must stay in step, because they answer the same question on the same rows: the frontend's [corporateMember.js](src/components/shared/corporateMember.js) (`isCorporateMember` / `leadMemberNumberOf` / `findLeadMember`, which also tolerates the two key spellings — admin roster rows carry `plugin_member_number`, the `load_data` blob aliases it to `member_number`) and the backend's `resolveLeadNumber()` inside `actions/members/stripe-link-lead.ts`. The frontend one drives the display-only lead name in the profile identity line (admin **and** the member's own portal); the backend one decides **whose Stripe account the money goes to**, so it is the one that must never be relaxed.

**Roster size:** 556 rows as of 2026-06-18 — the 21 originals + **535 active advisors/accountants bulk-imported** from the legacy Google Sheets (gotcha #140; side-effect-free, OLD numbers preserved). **Member-number suffixes seen in live data** (all non-integer PKs, preserved verbatim, skipped by `nextMemberNumber()`): `-J<n>` legacy joint/secondary advisor · `-C<n>` Corporate Member · `-FC<n>` Free Corporate Member · `-FCL<n>` Free Corporate Member (Legacy) · `-TA<n>` accountant Team Member under a parent firm · `-NRA`/`-NRB` VFO Reconciliation (Free) sub-records · `-F<n>`/`-FF<n>` Free Catalyst/Fusion.

---

## `member_connections`

**Mutual, untyped, unlimited member-to-member connections.** Added 2026-07-31 (migration `20260731130000_member_connections.sql`, gotcha #312) as the second half of the Introductions-vs-Connections split: an *introduction* is directional and lives on `members.introduced_by_member_number`; a *connection* is symmetric and lives here. One row = one link between two members, stored **once**, in canonical order.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk, `generated always as identity` |
| `member_a` | text | not null, fk → `members.member_number` (**CASCADE**) |
| `member_b` | text | not null, fk → `members.member_number` (**CASCADE**) |
| `created_at` | timestamptz | not null, default `now()` |

**Constraints:** `member_connections_ordered` CHECK `member_a < member_b` — the canonical-order guarantee, so the same link can never be stored twice in opposite orders and "are these two connected" is ONE symmetric lookup; `member_connections_unique` UNIQUE `(member_a, member_b)` — what makes the add action idempotent (a `23505` is treated as success). **Every writer must sort the two member numbers before inserting or deleting.**

**RLS:** enabled + `"Deny all access" … using (false)` in the same migration (invariant #1 / gotcha #141). Anon-key REST probe verified `Content-Range: */0` on 2026-07-31.

**Seeded from the legacy column:** the migration backfilled every non-corporate `members.connected_member_number` link as a pair (**240 rows**) and then cleared that column, which is why `connected_member_number` is now corporate-parent-only.

**Touched by:** `member_connection_add` (`actions/members/connection-add.ts`) + `member_connection_remove` (`actions/members/connection-remove.ts`) — both AUTH / `ADMIN_ONLY_ACTIONS`, both normalize either argument order, both idempotent; `automation_ACCOUNTANT_createmember` (the PFT auto-link inserts a pair **after** the members row exists, best-effort, `23505` swallowed); `load_data` (returns the raw pairs as the **top-level `member_connections`** payload key). Frontend: [MembersPanel.jsx](src/components/admin/MembersPanel.jsx) (the details "Connections" card + the Edit-Profile Connections editor, which writes immediately and does **not** go through the Save button), [AdminPortal.jsx](src/pages/AdminPortal.jsx) (`memberConnections` state).

---

## `member_number_baselines`

Admin-controlled starting member numbers per (`member_category` × `advisor_model`) bucket. Added 2026-05-29 (gotcha #48). Read by the `nextMemberNumber()` helper (`utils/member-number.ts`) ONLY when a bucket has no existing integer-numbered members — the baseline becomes the first number assigned. An empty bucket with no baseline row is a hard-block: the helper returns an actionable error rather than guessing a start range.

| Column | Type | Notes |
|---|---|---|
| `member_category` | text | not null, `'advisor'` or `'accountant'` (CHECK). Part of PK. |
| `advisor_model` | text | not null, `'Legacy Model'` or `'New Model'` (CHECK). Part of PK. |
| `baseline` | bigint | not null. First number assigned when the bucket is empty. |

PK: (`member_category`, `advisor_model`). Seeded 2026-05-29: `advisor`/`New Model`=60000, `accountant`/`New Model`=30000, `accountant`/`Legacy Model`=90000. `advisor`/`Legacy Model` has 20 existing members so it self-derives (max+1) and needs no baseline row.

**Touched by:** the `nextMemberNumber()` helper, invoked from `add_member_full`, `automation_ADVISOR_createmember`, `automation_ACCOUNTANT_createmember`.

---

## `member_plugin_settings`

Per-member website-widget configuration. PK `plugin_member_number` is a separate identifier from `member_number` — though many tables FK to `plugin_member_number` (specifically `member_logins`, `gc_*`, `member_exclusions`).

| Column | Type | Notes |
|---|---|---|
| `plugin_member_number` | text | pk |
| `name` | text | **The display name for the whole portal** — admin header, members list, avatar initials and the member's own login greeting all read it, NOT `members.first_name`/`last_name`. It was written once at member creation and **never resynced**, so an admin renaming a member on the profile form left the old name on every one of those surfaces. **Fixed 2026-08-20:** `member_profile_save` now also updates this column to `"first last"` (whitespace-collapsed and trimmed) after the `members` upsert, whenever either name field is in the payload; an empty result is skipped rather than blanking the row. A one-time backfill the same day resynced the rows that had already diverged (2 of them — member numbers 30005 and 90417). To find any future drift: `select p.plugin_member_number, p.name, m.first_name, m.last_name from member_plugin_settings p join members m on m.member_number = p.plugin_member_number where p.name is distinct from trim(concat(m.first_name, ' ', m.last_name));` |
| `type` | text | |
| `manage_key` | text | not null. Used as URL-safe identifier in widget embed. |
| `primary_color` / `bg_color` / `text_color` / `accent_color` / `card_text_color` | text | Theme colors. Defaults: `'#d4af37'`, `'#0a1628'`, `'#ffffff'`, `'#1a2744'`, `'#ffffff'`. |
| `last_initial_only` | boolean | default `false`. Privacy toggle. |
| `display_mode` | text | default `'filter'` |
| `font` | text | default `'Playfair Display'` |
| `show_count` / `show_search` | boolean | default `true` |
| `website_enabled` | boolean | default `false`. Status field — gates whether the public widget is live AND whether the member-portal "Website Plugin" tab is shown (tab hidden + page un-rendered when `false`). **Admin-controlled only** — the member-side enable toggle was removed; the `MemberWebsitePlugin` enable toggle renders only when `isAdmin`, so only the admin Members panel can flip it. |
| `widget_font_size` | integer | default `14`. (Migration `change_widget_font_size_to_integer` indicates this was previously text.) |

**Touched by:** `load_data`, `save_member` (settings payload), `member_profile_save`. Frontend: [MemberWebsitePlugin.jsx](src/components/shared/MemberWebsitePlugin.jsx).

---

## `member_type_history`

Audit trail of `member_type` changes.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `member_number` | text | fk → `members.member_number` (CASCADE) |
| `old_type` / `new_type` | text | |
| `changed_at` | timestamptz | default `now()` |
| `changed_by` | text | |

**Touched by:** Any handler that changes `members.member_type` — `member_profile_save`, and since 2026-09-16 the **membership renewal sweep** (`actions/membership/sweep.ts` pass 1, `changed_by='membership-renewal-sweep'`) when the plan carried a `next_year_member_type` that differs from the current one. Also written by hand — the 2026-08-04 superadmin correction of member **30006** (the accountant `member_type` clone defect, gotcha #329) inserted an audit row alongside the `members` update; a manual data fix should do the same.

---

## `member_contacts`

**Additional Contacts for a MEMBER** — people on an advisor's / accountant's / strategic member's own team who ride along in Cc on the member's portal email. The member-side twin of `client_contacts` ([clients.md](clients.md)). Created 2026-09-16, migration `20260916120000_member_contacts.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk, `generated always as identity` |
| `member_number` | text | not null, fk → `members.member_number` **ON DELETE CASCADE**. Indexed (`member_contacts_member_idx`). |
| `first_name` / `last_name` | text | Both REQUIRED by `member_contact_add` (the column itself is nullable). |
| `email` | text | Regex-validated on write with the same shape as `dedupeEmails` — an additional contact is a future Cc recipient, so anything that would not survive that filter must never be stored. |
| `phone` | text | nullable, **display-only — nothing sends to it.** `client_contacts` has no equivalent; this table was asked for with one. |
| `cc_on_emails` | boolean | not null default `false`. **The only switch** — there is deliberately NO `use_in_greeting` twin. Requires a non-empty `email`, enforced by `member_contact_update` on the FINAL state. |
| `created_at` | timestamptz | default `now()`. The list is returned oldest-first. |

**RLS:** `enable row level security` + `create policy "Deny all access" … for all to public using (false)` in the **same migration** as the table (#141); anon probe returned `Content-Range: */0` and the security advisor stayed GREEN at the exact baseline.

**Touched by:** `member_profile_load` (returns `contacts[]`), `member_contact_add` / `member_contact_update` / `member_contact_delete` (all `ADMIN_ONLY_ACTIONS`), and — read-only, centrally — **`utils/email-recipients.ts resolveTemplateRecipients`**, which Cc's every `cc_on_emails=true` row whose member's address is already in To or Cc of the send (never Bcc). Frontend: `MemberAdditionalContacts` in `src/components/admin/MembersPanel.jsx`. Full mechanism → [flows/additional-contacts.md](../flows/additional-contacts.md).

---

## `member_exclusions`

Per-member list of `experts` they want excluded from their ecosystem (effectively a blocklist for the website widget / specialist matching).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | pk |
| `member_number` | text | fk → `member_plugin_settings.plugin_member_number` (CASCADE). Note: links to plugin number, not main `members.member_number`. |
| `expert_id` | bigint | fk → `experts.id` (CASCADE) |

**Touched by:** `load_data`, `load_exclusions`, `save_member`. Frontend: [MembersPanel.jsx:550](src/components/admin/MembersPanel.jsx).
