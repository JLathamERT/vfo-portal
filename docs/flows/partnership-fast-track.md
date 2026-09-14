# Partnership Fast Track (PFT) — end-to-end flow

Built 2026-06-05/06 (branch `claude/objective-hopper-26d8a3`). Backend live **v415**; frontend **not yet deployed**; nothing committed.

## What it is
The Partnership Fast Track program recruits **accountants**. Each accountant is a `clients` row enrolled in
the "Partnership Fast Track" program (program_id=2) under a Testing/real member, shown in the admin under
**Accountants → member → Accountants tab → accountant → "PFT Engagement Process" tab**
(`components/admin/pft/PFTEngagementTrack.jsx`). At the end the accountant is handed off to the separate
**Accountant Onboarding** pipeline.

## Data model
- **Track structure** is DB-driven: `program_client_phases` + `program_client_tasks` with
  `track_type='partnership_fast_track'` (program-level rows shared by all PFT accountants). The component
  renders special UI by matching each task's **exact name**. Per-accountant task status lives in
  `client_progress` (`client_id`, `task_id`, `status`, `completed_date`, `notes`).
- **Per-accountant extras**: NEW table `pft_engagement` (one row per client) — `discovery_token`,
  `discovery_data` (jsonb), `discovery_submitted_at`, `discovery_email_sent_at`, `discovery_reminder_sent_at`,
  `discovery_pf_notified_at`, `ft_response_token`, `ft_email_sent_at`, `ft_response`
  (`confirm`|`another_meeting`), `ft_response_at`, `ft_reminder_sent_at`, `ft_pf_notified_at`,
  `accountant_onboarding_id`. **Undecided-decision columns** (2026-07-13): `decision_token`,
  `decision_email_sent_at`, `decision_task_id`, `decision_response` (`vfo_ft`|`vfo_associate`|`no`),
  `decision_response_at`, `decision_reminder_sent_at`, `decision_pf_notified_at`, and (2026-09-14) `decision_options`
  (`ft_no` | `ft_associate_no` | NULL = legacy = all three) — WHICH paths the Undecided email offered.
- **Emails**: `email_templates` pipeline `PARTNERSHIP_FAST_TRACK` (incl. `PFT_decision_undecided`; derive the set with
  `select id, template_name, to_list, cc_list from email_templates where pipeline='PARTNERSHIP_FAST_TRACK' order by id`
  — never trust a count written here, #402). **Sandbox**:
  `pipeline_sandbox_config` row `PARTNERSHIP_FAST_TRACK` (`sandbox_mode=true`, `sandbox_email=jlatham@elitert.com`) —
  all PFT emails are **Gmail drafts**. Flip to live before real accountants.

## Phases
1. **Initial Contact** — **Who is completing the tracking for this accountant?** (`VFOS` / `Member`, first step) · Call arranged · Call outcome · **Meeting 1 confirmation email** (send-with-date + two declines). The tracking-owner step gates the other three: they render greyed + non-clickable until it is set, `VFOS` keeps them inert (phase = 1 step) and `Member` re-enables them (phase = 4 steps). Mirrored in the Client Overview engine (`overview-pft.ts`, `applicable:false`) — gotcha #218. _(The old **Preliminary Setup / Relationship type** phase was removed 2026-07-13.)_
2. **Accountant Meeting 1** — Initial high level discussion · Right accountant? (3 Yes/No + auto conclusion) ·
   **Meeting 2 confirmation email (+ discovery form)** (send-with-date + two declines).
3. **Accountant Meeting 2** — presentation · **"Does the Accountant need a third meeting?"** (Yes/No gate,
   both green) · then EITHER **Meeting 3 confirmation email** (gate=Yes) OR **Accountant decision confirmation
   email** (gate=No). Nothing past the gate is interactive until it's answered.
4. **Accountant Meeting 3** (only when gate=Yes) — presentation · **Accountant decision confirmation email**.
5. **VFO-Associate New Member Setup** / **VFO-FT Accountant New Member Setup** — task-less; rendered as 2
   dynamic progress indicators. Before the decision: both show greyed. After a decision: only the matching
   section shows.

## Email recipients — who is actually on a PFT email

**Read the HANDLER, not the template row (#324/#413).** Every PFT send builds a ctx and hands it to
`resolveTemplateRecipients`; a role token in `to_list`/`cc_list` that the ctx does not supply is dropped
**silently**, with no error and no empty-recipient guard tripping (the `to` list is always non-empty here).

The four ctx-building call sites are `pft/decision-email.ts` (shared ctx), `pft/meeting-email.ts`, and
`pft/sweep.ts`'s `sendDiscoveryReminder` + `sendFtReminder`. Each supplies `RECIPIENT` / `CLIENT` (the
accountant's `clients.email`), `ASSIGNED_PF` (via `getPfEmail`), and — **as of 2026-08-20 (v766)** —
**`MEMBER`**, resolved by the new `memberEmailForClient` helper in `pft/_shared.ts`
(`clients.member_number` → `members.email`; returns `null` for a client with no member and **swallows
lookup errors**, since a failed lookup must never break a send).

**Before that fix the connected member was never CC'd on any PFT email, ever.** The templates that carry
`MEMBER` in `cc_list` — every meeting-confirm, meeting-declined, decision and reminder row in the pipeline —
had listed it since they were seeded, but no handler resolved it, so it was dropped on every send for the
pipeline's whole life with nothing to notice. Do not read the template rows as a statement of current
behaviour for any pipeline you have not checked this way. Gotcha **#424**.

**`PFT_decision_undecided` (id 193) is the deliberate exception and must stay one.** It carries **no `MEMBER`
token at all** — its `to_list` is empty and its `cc_list` is two literal staff addresses — so
`undecided-email.ts` and `sweep.ts`'s `sendUndecidedReminder` were left untouched. Adding `MEMBER` to their
ctx would do nothing; adding the token to the template would change who gets the client's own decision
email and needs a decision, not a patch.

## Meeting confirmation emails (Meeting 1/2/3)
One warm template `PFT_meeting_confirm` for all three, parameterised by `automation_PFT_meetingemail`:
- `[PRIOR_MEETING]` (your recent call / our first meeting / our second meeting), `[NEXT_MEETING]`
  (our first/second/third Partnership Fast Track meeting), `[NEXT_MEETING_TITLE]` (Meeting 1/2/3, subject),
  `[FORM_SECTION]` (discovery-form button — Meeting 2 only), `[CLOSING]` ("on \<date> at \<time> \<tz>" for
  the with-date button, else "in due course").
- Buttons → `automation_PFT_meetingemail` with `decision` = `confirm_date` / `confirm_no_date` / `declined` / `us_declined`.
  Statuses written to `client_progress`: "Confirmation email sent" / "Email sent - date not yet arranged" /
  "Meeting declined" / "Declined by Member" (Meeting 1) / "Declined by ERT/VFOS" (Meeting 2/3). `declined` =
  the client declines us (`PFT_meeting_declined`). **`us_declined` = WE decline them** (2026-07-20, gotcha #247):
  requires a typed `decline_reason` (injected as `[DECLINE_REASON]`), opens an inline reason+preview card cloned
  from the Tax 3 decline card; Meeting 1 uses `PFT_meeting1_member_declined` (button "Send Email - Member
  Declined", "chat with us…"), Meetings 2/3 use `PFT_meeting_ert_declined` (button "Send Email - ERT/VFOS
  Declined", "meet with us…"). **As of 2026-09-14 the step shows TWO rows: one green **"Send email (with date)"** (date required, matching the
  Tax high-level meeting step) and the red client/we-decline pair.** *Send Email - Date Not Confirmed* (`confirm_no_date`) and
  the Complete-NO-EMAIL row are hidden behind `SHOW_CONFIRM_NO_DATE` / `SHOW_NO_EMAIL_BACKFILL` (`false`) in
  `PFTEngagementTrack.jsx` — code kept, backend unchanged, existing *Email sent - date not yet arranged* rows still
  render. `[FORM_SECTION]` (discovery) attaches only on confirm decisions.
- **RESCHEDULE (2026-08-16, v746) — and the `reschedule` body flag is load-bearing (#404).** A sent Meeting 1/2/3 step offers **Reschedule**, reopening the same form pre-filled (the slot is parsed back out of the status/notes text token by token, best-effort) and re-sending the SAME `PFT_meeting_confirm` template. Only the two **confirm** statuses can be rescheduled — a decline has no next meeting. The frontend passes **`reschedule: true`**, and `actions/pft/meeting-email.ts` uses it to **keep the same `discovery_token` while skipping the `discovery_email_sent_at` / `discovery_pf_notified_at` writes**. That matters because those two columns are the **discovery reminder ladder's clock** in `actions/pft/sweep.ts`: re-stamping them on a resend would restart the chase from zero for a form the client has had all along, silently. (A genuine first send, or a resend that mints a new token, still arms the ladder.)
- **Automation & Config → Partnership Fast Track** (2026-07-20, gotcha #247): `PFTAutomationPanel` (loader
  `automation_load_pft_pipelines`) is the read-only pipeline view of every client with PFT email activity — meeting
  sends, discovery/decision/FT button-clicks, and the onboarding handoff — and holds the ONLY UI for the
  `PARTNERSHIP_FAST_TRACK` sandbox toggle. Its Meeting 1 card shows only when the Initial-Contact tracking-owner
  step = `Member`.
- **Admin backfill — "Complete - NO EMAIL"** (2026-07-17, gotcha #243; **HIDDEN since 2026-09-14** — flag above): a solid-green button marks the
  meeting step complete (status `Complete`) via `msm_save_client_task` with NO email — for bringing
  old-system accountants up to date. Frontend-only; PFT-only (lives in `PFTEngagementTrack.jsx`'s `MeetingStep`).

## Discovery form (Meeting 2)
- Meeting 2's confirm email contains a **Complete the discovery form** button →
  `<portal>/pft-discovery?token=<discovery_token>` (`PftDiscoveryPage.jsx`, SIF-style; all fields required
  **except "How long have you owned your firm?"**). Loads/saves via `automation_PFT_loaddiscovery` /
  `automation_PFT_submitdiscovery` (store into `pft_engagement.discovery_data`).
- Admin sees a **"View discovery form"** collapsible under the Meeting 2 step once submitted.
- On submit → notify the **assigned PF**. If not completed after **4 business days** (sweep) → notify PF.

## Decision step + handoff
The tracker's **Accountant decision confirmation email** step shows four buttons: **Email confirming VFO FT**,
**Email confirming VFO Associate**, **Undecided email**, **Email confirming No**. The first two + "No" call
`automation_PFT_decisionemail` (`choice` = `vfo_ft` | `vfo_associate` | `no`); **Undecided email** calls
`automation_PFT_undecided` (see next section — defers the choice to the client) **after an inline chooser (2026-09-14):
*"Which options should the accountant see?"* → **VFO FT or No** (`options=ft_no`) / **VFO FT, VFO Associate or No**
(`options=ft_associate_no`) / Cancel.**

**Admin backfill — "Complete - NO EMAIL:"** (2026-07-17, gotcha #243; **HIDDEN since 2026-09-14** behind `SHOW_NO_EMAIL_BACKFILL=false`): a second row (VFO FT / VFO Associate /
No, solid-green) writes the REAL outcome status (`VFO FT confirmed` / `VFO Associate confirmed` / `No confirmed`)
via `msm_save_client_task` so the matching Phase-6 track reveals, but sends NO email AND does **not** create the
`accountant_onboarding` handoff record (that only happens in `automation_PFT_decisionemail` above) — so the AI
PC Admin history line "Accountant Onboarding record created" stays correctly un-done. For migrating existing
accountants without spamming them. Frontend-only; PFT-only (`PFTEngagementTrack.jsx`'s `DecisionStep`).

`automation_PFT_decisionemail`:
- **vfo_ft** — drafts `PFT_decision_vfo_ft` with **two recipient buttons** ("I Don't Need Another Meeting -
  Confirm Onboarding" / "I'd Like Another Meeting" → `/pft-ft-decide?token=&decision=confirm|another_meeting`;
  that page shows a confirmation card and records nothing until the recipient clicks it — gotcha #290).
  **Immediately creates** the `accountant_onboarding` handoff (`selected_vfo_ft`, `accountant_type='VFO FT'`),
  links it on `pft_engagement.accountant_onboarding_id`, stamps `ft_response_token` + `ft_email_sent_at`.
- **vfo_associate** — (2026-07-13) now **mirrors vfo_ft**: drafts `PFT_decision_vfo_associate` with the SAME
  two recipient buttons (confirm / another meeting → the shared `/pft-ft-decide` + `ft-response.ts` flow),
  immediately creates the handoff (`selected_pft`, `accountant_type='VFO Associate'`), links it, stamps
  `ft_response_token` + `ft_email_sent_at`. The former immediate `PFT_associate_confirmed` bell is dropped —
  the confirm/another-meeting bell fires on the client's click instead (worded per `accountant_type`).
- **no** — drafts `PFT_decision_no`; sets client `status='lost'`. (2026-09-14: the subject now substitutes `[FULL_NAME]` —
  it previously rendered the literal token — and the body follows the house decline pattern.) **Ordering note (2026-08-03, gotcha #320):** `savePftProgress` now calls `activateClientIfPending` (which flips `pending`→`active`), but that call happens BEFORE this `'lost'` write returns — and because the auto-activate is conditional on `.eq("status","pending")`, the `'lost'` write lands last and correctly wins. A client declined here does NOT end up "active".

## Undecided decision — client self-selects (2026-07-13)
Mirrors the MAP 1 `/decide` undecided flow. Admin clicks **Undecided email** →
`automation_PFT_undecided` (AUTH, body `options` = `ft_no` | `ft_associate_no`, 400 otherwise — **2026-09-14**): drafts
`PFT_decision_undecided` to the **client** with the chosen buttons (VFO FT / [VFO Associate] / No →
`/pft-decide?token=<decision_token>&choice=vfo_ft|vfo_associate|no`) and the matching bullet list via the **`[OPTIONS]`**
token (`undecidedOptionsHtml()` — the template no longer hardcodes the `<ul>`), stamps `decision_token` +
`decision_email_sent_at` + `decision_task_id` + **`decision_options`**, and marks the step
**"Undecided - awaiting client"** (an amber pending status that the tracker treats as "no final decision" so
both Phase-6 sections stay visible-but-pending). Client clicks → `PftDecidePage.jsx` (`/pft-decide`), which
**shows a confirmation card and records nothing until the client clicks it** (2026-07-27, gotcha #290 — note
this page's param is `choice`, not `decision`; the confirm card renders `vfo_ft`/`vfo_associate` as
"VFO Fast Track"/"VFO Associate") →
`automation_PFT_undecided_response` (PUBLIC, idempotent on `decision_response`) **refuses a `choice` the stored
`decision_options` never offered** (400 *"That option was not offered on this decision link"* — the hidden button is
not the guard; NULL reads as all three), records the choice, then
**delegates in-process to `automation_PFT_decisionemail`** with that choice, so the exact same per-choice work
runs (onboarding + confirmation email + progress + lost-on-no). Rolls `decision_response` back to null if the
delegate fails so the link can be retried. The sweep's 2-business-day re-send reads `decision_options` too
(`sendUndecidedReminder` selects it — #448) so the reminder offers the same set. The AI PC Admin row names the variant.

An **AI PC Admin** history block (rendered under the decision step, styled like the Tax 5 AI PC Admin cascade)
derives the full timeline from `pft_engagement`: undecided email sent → client's path choice → onboarding
created → confirmation email sent → client's another-meeting response (plus reminder / PF-notified rows).

**2026-08-12 (v734) — the reminder / PF-notified rows changed in two ways that matter here.** (1) They are now **conditional on their own column being stamped** (`<stall>_reminder_sent_at` / `<stall>_pf_notified_at`); they previously rendered **always**, which showed a chase history on engagements that never stalled. (2) `PFTEngagementTrack.jsx` **dropped its extra `!decResp` / `!ftResp` guards**, so the rows now **survive the client's response** instead of disappearing the moment the accountant replies — the whole point of a paper trail is that it outlives the thing it was chasing. The PF-notified row (the 4-business-day tier) additionally carries an indented **"Reached out?"** checkbox saving through `automation_stall_ack` (`pipeline:'pft'`, `stall` ∈ `discovery` / `ft` / `decision` → `<stall>_pf_ack_at`), hidden in `readOnly`. Every row also shows a non-editable MM/DD date. **No live PFT data existed to click-test**, so these paths were verified by diff + build only. Gotcha **#381**.

**2026-08-19 (v760) — the `discovery` checkbox that sentence described did not actually exist until now.** `<stall> ∈ discovery / ft / decision` was true of the *backend* whitelist from day one, but `DiscoveryViewer` rendered neither the 4-business-day escalation row nor its **"Reached out?"** box, so the discovery stall had no surface at all — the doc above was describing the intended set, not the built one. It now renders the same `autoStep` + `StallAckRow` pair the decision/FT stalls carry, gated on `discovery_pf_notified_at`, in **both** of `DiscoveryViewer`'s branches (form awaiting completion, and form submitted), hidden in `readOnly`. Render + persist were click-tested this time. Two live consequences: ticking it now also **clears that step's unread bells** and `pft/sweep.ts` **stops re-minting** the discovery PF bell (`.is("discovery_pf_ack_at", null)`) — but `automation_PFT_meetingemail` still **nulls `discovery_pf_notified_at`** on a non-`reschedule` send, which erases the row the checkbox hangs on. That null-out is flagged, not fixed.

Phase 6 indicators (matching section only): **"Sent to Accountant Onboarding"** (green once
`accountant_onboarding_id` exists) + **"Accountant onboarding progress"** (live stage from
`pft_load_engagement` + a **View onboarding →** deep-link to that record).

## VFO Fast Track / VFO Associate recipient response
`automation_PFT_ftresponse` (PUBLIC, token, idempotent on `ft_response`) — shared by BOTH the VFO FT and (as
of 2026-07-13) the VFO Associate confirmation email; the notification wording is derived from the linked
`accountant_onboarding.accountant_type`:
- **confirm** → notify **PF only** (`notifyPf`; Rachael dropped 2026-07-14); auto-set the linked Accountant
  Onboarding **Preliminary Meeting = "Request no meeting"** (only if still null).
- **another_meeting** → notify **PF only** (`PFT_ft_another_meeting`, FYI). **That is the whole effect** (audited
  2026-09-14): the onboarding row already exists from the decision email and is untouched, its Preliminary Meeting is
  NOT auto-set (only `confirm` writes *Request no meeting*), both FT ladders stop, and nothing chases the team afterwards —
  flagged, not built.
If unanswered: **2-business-day** reminder email to the accountant — `PFT_decision_vfo_ft_reminder` (106) for a VFO FT
onboarding, **`PFT_decision_vfo_associate_reminder` (266, 2026-09-14)** when the linked `accountant_onboarding.accountant_type`
is *VFO Associate* (falls back to 106 if 266 is missing/inactive) — then the **4-business-day** PF notice (both via the
sweep — see Cron).

## Notifications (who gets what)
PF routing via `actions/pft/_shared.ts` `PF_EMAILS` (Evan `eanderson@`, Bridger `bsilvester@`, Ian
`iwelham@`) → falls back to all-admins if the client has no Assigned PF (set in the Profile tab) or the name
isn't mapped. As of 2026-07-14 `notifyPfAndRachael` was renamed **`notifyPf`** and no longer CCs Rachael (the
`RACHAEL_EMAIL` export was removed) — so FT-response (either button), VFO-Associate pick, discovery-complete,
and the discovery + FT stall bells (4 business days) **all notify the assigned PF only**. All notification links deep-link to the
specific record (`?onboarding=<id>` for the handoff record, `/admin/client/<id>?tab=pft` for the PFT track).

On handoff into Accountant Onboarding (FT confirm / VFO-Associate pick, in both `decision-email.ts` and the
`ft-response.ts` fallback insert), the client's `assigned_pf` is copied into the new
`accountant_onboarding.onboarding_team_member` (+ `onboarding_team_member_at`), so the onboarding's downstream
Team-Member-Responsible notifications route to that PF from the start.

## Cron
`pft-sweep-daily` 08:00 UTC → `automation_PFT_sweep` (PUBLIC, service-role): discovery 2-business-day reminder
email + 4-business-day PF notice; FT 2-business-day reminder email + 4-business-day PF notice;
**undecided-decision 2-business-day reminder email
(re-sends `PFT_decision_undecided`) + 4-business-day PF notice** (rules `PFT_undecided_reminder_email` /
`PFT_undecided_stall_bell`, guards `decision_reminder_sent_at` / `decision_pf_notified_at`). No auto-decline.

**All six tiers count BUSINESS DAYS as of 2026-08-14.** The configured `notification_rules.delay_days` are
unchanged as numbers (2 and 4); the sweep resolves each cutoff through `businessDelayCutoffIso()` in
[`utils/notify.ts`](C:/vfo-edge-functions/supabase/functions/vfo-admin-api/utils/notify.ts), a backward walk
over weekdays only (Mon–Fri UTC, **no holiday calendar**) — so an accountant who goes quiet on a Thursday is
reminded the following Monday rather than over the weekend. The three PF bell bodies interpolate their own
delay and now read *"N business day(s) have passed since …"*. PFT has no auto-decline, so it has no calendar
survivor of the advisor/accountant 14-day kind.

## Stopping an onboarding — `advisor_onboarding.status` / `accountant_onboarding.status` *(2026-08-26, v793)*

Both tables gained `status` — `'active'` | `'stopped'`, **NOT NULL DEFAULT `'active'`**, bare `text`, no CHECK (#431), migration `20260826181000_advisor_accountant_onboarding_status.sql`. The value set deliberately mirrors `specialist_onboarding.status`, which has carried `'active' | 'stopped' | 'completed'` since that pipeline was built — but **`'completed'` is NOT written here**: advisor/accountant completion is already expressed by `member_created_at`, and the frontend classifies on that first.

**Two effects, and only two.** (1) **Display** — the onboarding list files the row under its existing **Stopped** section (the list classify now reads `ob.status`; before this it tested `final_decision === 'No'` only), and the detail header shows a **Live/Stopped toggle**, hidden once `member_created_at` is set. (2) **Sweep silencing** — every reminder ladder in `actions/advisor/sweep.ts` and `actions/accountant/sweep.ts` (decision, signing, payment; email tier + PF-bell tier = 6) **and the 14-day auto-decline query** filter `.eq("status","active")`. `NOT NULL DEFAULT` is load-bearing for the same `.eq`-vs-`.neq` reason as MAP 1 (#437). **As of 2026-09-04 the same filter also silences the deposit stall ladder (the sweeps' 4th tier) and all three tiers of the preliminary-meeting countdown in the shared `onboarding/meeting-reminder-sweep.ts`** — which is why a `No Show` recorded before the meeting time leaves the 60- and 10-minute tiers permanently unfired (**#472**).

**No money path reads this column** — once a payment link has been sent, Stripe collects the onboarding fee independently of onboarding status.

**Writers:** the new `advisor_update_status` / `accountant_update_status` actions (ADMIN_ONLY, not tab-gated), plus auto-stop on: `client-decision.ts` (**No**), `decision.ts` (prelim **No**; `'Undecided'` stays active — the decision cascade runs off it), `extra-meeting.ts` (**No**), `prelim-meeting.ts` (**No Show**), the sweep's **14-day auto-decline**, which writes `status:'stopped'` alongside `final_decision:'Auto-Declined'`, and — **added 2026-09-04** — `deposit-refund.ts`, because refunding the Membership Deposit ends the onboarding.

**Backfill — and the live bug it fixed.** `final_decision IN ('No','Auto-Declined') OR prelim_meeting_decision='No' OR prelim_meeting_status='No Show'` → **exactly ONE row flipped: `accountant_onboarding` id 24 (Jon Bell)**. `'Auto-Declined'` is the sweep's 14-day implicit No, and **the frontend classify had only ever tested for `'No'`**, so every auto-declined row had been rendering as *in progress* — Jon Bell was the live instance. Two exclusions are deliberate: **`'ExtraMeeting'`** parks `final_decision` while a meeting is pending and the engagement is still live; **`prelim_meeting_status='Request no meeting'`** is the PFT fast-track path (`actions/pft/ft-response.ts`) and means the onboarding proceeds *without* a preliminary meeting, not that it stopped.

**Correcting a mis-picked "No Show" does NOT un-stop the row** — reopening is the header toggle's job, so a genuine stop is never silently undone by an unrelated edit to that dropdown.

## Accountant Onboarding handoff differences

> **The Advisor / Accountant onboarding pipeline itself now has its own file: [advisor-accountant-onboarding.md](advisor-accountant-onboarding.md)** — Stage 1's locked cascade, the preliminary-meeting reminder ladder and its 5-minute cron, the refundable Membership Deposit, the countersign money fork and the balance charge, the refund step and the deposit-aware invoice/receipt. This file keeps PFT itself and the two things that straddle the boundary: the handoff below, and *Stopping an onboarding* above.

- New `accountant_onboarding.accountant_type` (`'VFO FT'` | `'VFO Associate'`). "+ New Onboarding" requires it.
- **VFO Associate** skips Stages 1 & 2 (no agreement/payment) — `AccountantOnboarding.jsx` hides them and
  unlocks Stage 3; `create-member.ts` bypasses the `invoice_sent_at` gate for associates.
- Stage-1 Preliminary Meeting gained the status **"Request no meeting"** (auto-set by FT confirm). **The STORED literal is unchanged by the 2026-09-04 vocabulary rework** — `actions/pft/ft-response.ts` writes exactly this string, so only the UI label moved, to *"Requested no meeting"*. The other three outcomes are now `Completed - Send Deposit` / `Completed - No Deposit` / `No Show`; legacy `Completed` rows read as *No Deposit* and were not backfilled. See [advisor-accountant-onboarding.md](advisor-accountant-onboarding.md).

## Backend files (`actions/pft/`)
`_shared.ts` (PF_EMAILS, notify helpers, `ftButtons` + `undecidedButtons(base, options)` + `undecidedOptionsHtml` + `undecidedChoices`, template/sandbox/progress
helpers), `meeting-email.ts`, `decision-email.ts`, `ft-response.ts`, `undecided-email.ts`,
`undecided-response.ts`, `discovery.ts`, `sweep.ts`, `load-engagement.ts`.
Dispatched: `automation_PFT_meetingemail`/`_decisionemail`/**`_undecided`** + `pft_load_engagement` (AUTH);
`automation_PFT_ftresponse`/**`_undecided_response`**/`_sweep`/`_loaddiscovery`/`_submitdiscovery` (PUBLIC).

## Frontend
`components/admin/pft/PFTEngagementTrack.jsx` (track UI + `PFTTrackSkeleton` + the `DecisionStep` 4-button step
+ `DecisionHistory`/AI PC Admin cascade), `pages/PftFtDecidePage.jsx` (`/pft-ft-decide`),
`pages/PftDecidePage.jsx` (`/pft-decide` — the undecided 3-button client page), `pages/PftDiscoveryPage.jsx`
(`/pft-discovery`). Nav: ClientDetail "Back to Accountants" restore + Phase-6 deep-link into Accountant Onboarding.
