# VFO Staging — the team's test mode (two-person workflow, Phase 5)

Written 2026-10-31 (Jake + Claude, planning chat — branches `claude/phase-5-staging-portal-db3a8b` (react) / `claude/phase-5-staging-portal-2ba513` (edge)). **Status (2026-11-03): S1-S4 DONE** — part 1 shipped 2026-11-02 (CHANGELOG 2026-11-02 (d)); the rest of S4 (the §4b sandbox move, one test member per person, tester email + bell routing, the full test parts A and B PASS) ships as CHANGELOG 2026-11-03 (c). Staging is live at https://staging.vfoportal.com/ on project `yxolcioazczlhruprmrb`. **2026-11-04: S6 shipped, S7 and the switch day done (below).** Left: S5. Every decision in §9 is Jake's and is asked before anything is built. Hub OWED item (AG), Phase 5. **Must exist before Paxton starts (~2026-11-11).**

---

## 1. What staging is

- **A second, complete copy of the portal**: its own Supabase project (database, `vfo-admin-api`, `boldsign-webhook`, storage, crons, secrets) and its own copy of the website at its own address.
- **Fake data only.** Never a copy of a real client, member, specialist, planner, login, password or document.
- **It cannot reach live money, live email or live records**, because it holds no live key at all. That is by construction, not by care.
- **Settings come from live** (email templates, notification rules, feature switches, programs, agreement PDFs…) when a superadmin presses *Refresh settings* (Reset never copies them).
- **It runs main's code**, and every database change lands here first, then live.
- **A TEST banner sits on every page**, and every email and bell it makes goes to the tester it is about (else the team inbox / all admins).

## 2. What the code survey found — and the design rule each finding forces

| # | Finding (verified 2026-10-31) | So staging must… |
|---|---|---|
| F1 | Live's Stripe webhook accepts SANDBOX events (the four-secret verifier, `router/webhooks.ts` ~612). It finds the row to change by metadata ids: `plan_id`, `row_id`, `onboarding_id`, `request_id`, `member_number`. Growth Credits fulfilment (`webhooks.ts` ~707) matches on `member_number` alone, with no mode check. | **…be the ONLY system linked to the Stripe sandboxes.** Under D4 the existing ones move to staging and live keeps only live (§4b). If both were linked, a staging test purchase for member N would credit the REAL member N on live. |
| F2 | The code picks live or sandbox keys from `pipeline_sandbox_config` plus each row's own `sandbox` stamp. Mode guards skip a test-mode event on a row stamped live. A missing config row means live. | **…run every pipeline in sandbox mode** (all 8 config rows `true`, every fake row stamped `sandbox=true`) and hold ONLY sandbox keys. The live-named secrets (`STRIPE_SECRET_KEY`, `ERT_STRIPE_SECRET_KEY`, `BOLDSIGN_API_KEY`, the live webhook secrets) stay EMPTY. A path that asks for a live key then stops with "not configured" and goes nowhere. |
| F3 | One Google grant (`GMAIL_*`) drafts Gmail AND writes Drive. Drafts land in that mailbox. Three files hardcode a live Drive folder (`onboarding/bg-receipt.ts:156`, `onboarding/license-invoice-receipt.ts:110`, `specialist-bg/invoice-receipt.ts:13`). | **…have its own Google account** (mailbox and Drive). The hardcoded folder becomes a setting, with today's value as the default. |
| F4 | Sandbox mode already reroutes template emails to `sandbox_email` (`utils/email-recipients.ts:63`). Some senders bypass it: the agreement PDF draft tool, and senders with hardcoded internal addresses. Every Gmail write goes through one function, `gmailPostWithRetry` (`utils/delivery-failure-alert.ts:63`). | **…have a staging-only guard at that one function.** Every To/Cc/Bcc becomes the team inbox, the subject gets `[TEST] `, and the email opens with who it would have gone to. It fails closed: if no inbox is set, no email leaves. |
| F4b | `boldsign-webhook` has no signature check and finds rows by BoldSign's own document id. BoldSign never emails signers (`DisableEmails=true`). | **…get BoldSign sandbox events at its own `boldsign-webhook`.** Document ids never collide, so a stray event on either side matches nothing. Deploying `boldsign-webhook` to staging still needs Jake's word each time (CLAUDE.md). |
| F5 | Six chain calls and seven PDF links hardcode the live project URL (e.g. `tax/decision.ts:307`, `tax/pricing.ts:142`, `pipeline/pcadmin-pricing.ts:56`). `https://vfoportal.com` appears as `PORTAL_BASE` (`utils/gmail-draft.ts:105`, about 45 importers), as four renamed copies, and about 25 times inline (email links, Stripe `cancel_url`). | **…read both from one setting each** (`SUPABASE_URL`, already set by Supabase; a new `PORTAL_BASE_URL`). Unset means today's value byte for byte, so live does not change. |
| F6 | CORS allows only vfoportal.com, www, jlathamert.github.io and localhost 5173-5176 (`constants/allowed-origins.ts:9`). | **…add the staging origin.** |
| F7 | Website: `VITE_API_URL` already repoints every API call (41 places). Some things don't follow it: the headshot/logo base in 8 files, the static `/store` page (`public/store/data.js`, its own live URL and key), and Sentry (`environment: 'production'` hardcoded, `main.jsx:30`). | **…have one `VITE_SUPABASE_URL` for storage links, a Sentry environment taken from the build, and `/store` pointed at staging.** |
| F8 | GitHub Pages serves one custom domain per repo, and the site must sit at a domain root (`base: '/'`). There is no CI on either repo. | **…be hosted from a second repo** (`vfo-portal-staging`) at `staging.vfoportal.com`, which needs one DNS record. |
| F9 | The committed migrations cannot rebuild the database. Live's migration history versions don't match the files, data backfills name real clients, `20260905100400` schedules a cron against the LIVE URL, and three cron jobs have no file at all. | **…start from a schema-only dump of live**, taken once. From then on every migration is applied to staging first, then live, and a drift check compares the two. |
| F10 | Storage splits cleanly. **Templates/assets the code reads by name:** `tax-agreements`, `map1-agreements`, `advisor-onboarding-agreements`, `accountant-onboarding-agreements`, `map1-assets`, `presentation-templates` (ROI deck masters), `specialist-onboarding-assets`, `faq-documents`, `vfo-widget`. **People's documents:** `client-*`, `member-*`, `specialist-showroom-docs`, `headshots`. | **…copy only the template buckets.** People buckets are never copied; staging's are created empty. |
| F11 | The code hardcodes fixture ids: `TEST_SANDBOX_MEMBER_NUMBERS = ["59524"]` and expert `6137` (`constants/test-sandbox.ts`). Feature switches target member numbers. | **Superseded 2026-11-03 (Jake):** staging's environment makes every record test-mode (§4c), and until 2026-11-04 Accounting / Payments / Money Mapping hid 59524 and 6137 always, so staging has neither. It has one test set per person instead (§6). |

Docs found stale during the survey: `integrations/env-vars.md` and `architecture/01-system-map.md` say 3 files read `VITE_API_URL` (it is 41), and `integrations/supabase.md`'s CORS list is out of date. These are fixed in S7.

## 3. The shape

```
LIVE     vfoportal.com ──► ejpsprsmhpufwogbmxjv (LIVE keys only after the §4b switch; refuses any test event)
STAGING  staging.vfoportal.com ──► <staging project>  (sandbox keys ONLY)
                                     ├─ Stripe: the EXISTING VFO Services + ERT sandboxes, webhooks moved → staging only
                                     ├─ BoldSign sandbox, webhook moved → staging boldsign-webhook
                                     ├─ Google: the staging account (its own mailbox + Drive folder)
                                     └─ every email → the team inbox, "[TEST] " + "would have gone to: …"
SETTINGS live ──(read-only export, shared key, allowlisted tables + template buckets)──► staging   on Refresh
CODE     merge to main ──► staging (automatic)  ···  release ──► live (as today)
DB       migration ──► staging ──(tested)──► live at release
```

## 4. Build phases

| Phase | What | Who | Checkpoint |
|---|---|---|---|
| **S1** Accounts | Staging Supabase project (Claude via MCP once the cost is OK'd). Then Jake, one dashboard step per message: the staging Google account (`staging@vfo-services.com`), the `vfo-portal-staging` repo, the GoDaddy DNS record, then each non-Stripe staging secret typed into the dashboard (never in chat). The Stripe/BoldSign sandbox move waits for S4 (§4b). | Jake + Claude | Every staging secret name present (names listed, never values). |
| **S2** Backend isolation (edge code) | Env-driven `PORTAL_BASE_URL`; the 6 chain + 7 PDF literals → `SUPABASE_URL`; Drive folder → setting; the staging email guard; the CORS origin; `staging_*` actions that refuse unless `VFO_ENVIRONMENT=staging` AND `SUPABASE_URL` is not the live ref. **Unset = today's behaviour** on live. | Claude | `deno check` 0; action count +N exactly; a census proving every changed literal resolves to the same string with the env unset. |
| **S3** Staging backend up | Schema dump → staging; extensions; buckets plus template assets; the 19 crons pointed at staging (key in staging's vault, never in a file); settings copied; the 8 `pipeline_sandbox_config` rows set to sandbox + team inbox; main's `vfo-admin-api` deployed to staging. | Claude (+ Jake's word for `boldsign-webhook`) | `smoke-pipelines.ps1 -Target staging` passes in full; advisor GREEN on staging. |
| **S4 HEADLINE** Website on staging | `VITE_SUPABASE_URL`, the TEST banner, Sentry environment, `noindex`, `/store`, `npm run deploy:staging`. A minimal fake member + client. **Then the §4b sandbox switch**, right before the test. | Claude + Jake (§4b steps) | **Jake logs in at staging.vfoportal.com, sees the banner and fake data, pays with a Stripe test card, and the receipt email lands in the team inbox with "would have gone to …".** |
| **S5** Fake data + Reset | The seed (§6); a superadmin-only **Staging** tab with *Reset test data* (typed confirmation), *Refresh settings from live*, and what is running (build, last reset, by whom). The live side gets `staging_settings_export`, which is read-only and allowlisted (live deploy = Jake's "deploy"). | Claude | Reset twice in a row lands the same rows (**PASS 2026-11-05**); a switch flipped on live shows on staging after Refresh; a person table is never in the export (probe). The last two wait for the live release. **As built: §4g.** |
| **S6** Keep in step | A merge that changes backend code redeploys staging's backend, and one that changes the website redeploys staging's website (Jake 2026-11-03, per D13); a drift-check SQL file, run on both projects as a required wrap-up step, compares tables, columns, functions, policies and crons; the smoke script gains `-Target staging`. | Claude | A docs-only merge redeploys neither, a backend merge redeploys only the backend, and the drift check reads 0 differences. **Built and tested on staging 2026-11-04** (CHANGELOG): a push changing no backend code redeployed no backend, a docs-only push republished no website, and the drift check caught a throwaway table; the same checks on real merges come with the first merge. |
| **S7** Switch the rules | TEAM_RULES §1/§4/§8, CLAUDE.md, the starter (dev server → staging), the wrap-up (migrations staging first, deploy staging, then live), ACCESS.md, the hub, integrations docs, the stale docs from §2. Paxton's staging login. | Claude, Jake reviews | Paxton's first `/start` runs against staging. **Rules switched 2026-11-04** (CHANGELOG); the checkpoint comes with Paxton's first chat. |

### 4b. The sandbox switch — live becomes live-only (D4, Jake 2026-10-31)

The existing Stripe sandboxes (VFO Services + ERT) and the BoldSign sandbox **move from live to staging**. Afterwards live holds no sandbox key at all and refuses any test event (the signature check fails). Staging holds only sandbox keys. The two can never mix in either direction.

**What is tied to the sandbox on live today** (census 2026-10-31). Only **4 rows**, all test data:
- Test Member 59524's client **422** with its tax plan **300**.
- 59524's CIQ licence subscription row **8**, an ACTIVE sandbox subscription that fires a monthly invoice event.
- 59524's `member_portal_billing` row.
- The sandbox SpecRev house-account row ("VFO Services sandbox").

All 8 `pipeline_sandbox_config` rows are already `false`.

**Done in one sitting at S4, right before the headline test.** Not earlier: until staging works, live is still the only place to test.

1. Jake: in each Stripe sandbox, cancel every ACTIVE subscription. That covers row 8's and any left over from the test clients deleted 2026-10-29. Otherwise their monthly events would land on staging.
2. **Dropped 2026-11-03 (Jake): nothing is deleted on live.** Team members still use Test Member 59524 and its clients there. Its sandbox rows (CIQ licence row 8, the billing row) stay, and go quiet once step 1 cancels the subscriptions.
3. Jake: in each Stripe sandbox, change the webhook endpoint URL from live's to staging's. Do the same for the BoldSign sandbox webhook.
4. Jake: copy the sandbox keys, webhook secrets and stand-in connected-account ids into staging's secrets. Then delete them from LIVE's secrets: `STRIPE_SECRET_KEY_SANDBOX`, `ERT_STRIPE_SECRET_KEY_SANDBOX`, `STRIPE_WEBHOOK_SECRET_SANDBOX`, `ERT_STRIPE_WEBHOOK_SECRET_SANDBOX`, `ERT_CONNECT_ACCOUNT_ID_SANDBOX`, `VFOS_CONNECT_ACCOUNT_ID_SANDBOX`, `BOLDSIGN_API_KEY_SANDBOX`. This secret write bumps live's version with no code change (#485). Smoke live afterwards.

**DONE 2026-11-03 (Jake + Claude), as built:**
1. Cancelled every subscription in both Stripe sandboxes. VFO Services sandbox: 5 (three Premium client licences for 59524, two Test Specialist $99 licences); live's CIQ licence row 8 then read `ended`, and no other live row matched. ERT sandbox: none.
2. Nothing deleted on live (above).
3. Webhooks:
   - The VFO Services sandbox endpoint "empowering-spark" now points at `https://yxolcioazczlhruprmrb.supabase.co/functions/v1/vfo-admin-api`. Proven: a resent event reached staging, passed the signature check and got 200.
   - The ERT sandbox endpoint now points at the same address. Proven 2026-11-03 by the full test's part A (a Growth Credits card payment on the ERT sandbox, PASS).
   - **BoldSign:** live's portal webhook "VFO Portal" is set to environment **Both** and that field cannot be edited. So staging got its OWN Sandbox-only webhook "VFO Staging (sandbox)" (events Signed + Completed, as live) to staging's `boldsign-webhook`, deployed for the first time on Jake's "deploy". Its code equals live v48 apart from three TypeScript type notes; BoldSign's verification ping got 200. A sandbox signing event also still reaches live through "Both", where the document id matches no live row, so nothing changes. "VFO Tax Planning Automation" and "VFO Holistic Automation" go to the old system's Google Apps Script and are left alone.
4. The 7 sandbox settings are on staging. The six Stripe ones carry exactly live's values (digests equal). BoldSign's old sandbox key could not be re-shown, so staging has its OWN new BoldSign sandbox key "VFO Staging SANDBOX" (in Bitwarden). All 7 were then removed from live with `supabase secrets unset` on Jake's "yes remove". Live went v1088 → v1089 with the code unchanged (same `ezbr_sha256`), and the live smoke test passed.
   - Census first: live's only sandbox rows are CIQ row 8 (ended), 59524's saved card, the SpecRev sandbox house account, and 59524's Growth Credits monthly service, which deducts credits and never calls Stripe. None needs a key.
   - The old BoldSign key "VFOHolistic SANDBOX Automation" is left in BoldSign, because the old system may use it.

**Belt and braces:** staging's id sequences start at 100000, so a stray old sandbox event carrying a small `row_id` / `plan_id` can never match a staging row.

**What live gives up:** Test Member 59524 can no longer take a test payment on live. That is D18 (a) — all testing on staging. Turning a pipeline's sandbox toggle ON on live would then break that pipeline ("not configured"), so S7 hides those toggles on live (small frontend change) and the hub's STANDING 59524 entry is rewritten. The 59524 member row stays on live (Jake 2026-11-03, §4c).

### 4c. No testing on live at all (Jake 2026-10-31)

Jake: *"i want to turn off any form of testing in the live portal and the ability to do any sandbox stuff so the switches should go and just make it not possible. as well as just general testing like testing onboarding and using jlatham@elitert.com email or testing test member always takes you to sandbox etc. i just want testing to live in this new place"*

**The rule in code: the ENVIRONMENT decides sandbox, nothing else.**
- A new secret `VFO_ENVIRONMENT` is `staging` on staging and `live` on live.
- On `live`, every sandbox question answers NO. On `staging`, every one answers YES.
- No toggle, test member, test specialist or row stamp can change that. (Unset = today's behaviour, only for the hours between deploy and the switch.)
- It is enforced in the shared helpers, not in 69 handler files: `integrations/sandbox-config.ts` (`loadSandboxConfig`, `…ForClient`, `…ForMember`) and `constants/test-sandbox.ts`. That keeps the diff small and the proof a census.
- On live it is ALSO physically impossible, because live holds no sandbox key after §4b.

**What goes (census 2026-10-31)**

| Live today | After |
|---|---|
| Sandbox toggles: 10 automation panels (8 with `SandboxModeToggle`, MAP 1 and Tax with their own), action `save_sandbox_config` | Removed from the screens 2026-11-04. The read-only "Stripe: ..." pill stays as `StripeAccountPill`, and MAP 1 and Tax gained it (Specialist Revenue's loader does not ship the account). The action refuses on every environment (staging is always sandbox, live never). |
| Test Member 59524 forced to sandbox (`TEST_SANDBOX_MEMBER_NUMBERS`, used via the helpers in 69 files); Test Specialist 6137 (`TEST_SANDBOX_EXPERT_IDS`) | The force is gone; the environment rule replaces it. |
| Feature Switches' *Test member only* position. **7 switches sit there now:** `ciq_licence`, `client_basic_portal`, `client_case_progress`, `mirrored_clients`, `portal_licensing`, `tax_intake`, `tpom_additional_benefits` | Two positions only: **Off / On for all**. **Corrected 2026-11-04:** all 7 went On for all on 2026-11-02, so no value changes (Jake: "do not change the feature switches leave them as is"). The screen is not edited either: the backend already hides the Test position and refuses it once `VFO_ENVIRONMENT=live`. Reworking how switches work is a later question. The portal-licensing switch rule (plan §1, "seeded Test member only") changes to "ships Off on live, tested On on staging". |
| The Tax Intake form's test-fill for 59524 (`TaxIntakeForm.jsx`) | Shown on staging builds only. |
| Test DATA on live: member 59524 and all its clients (422 `59524-001`, 423 `59524-PFT1`, 424 `59524-PFT2`, 440 `59524-PFT3` and their Partnership Fast Track rows; Jake 2026-11-04: "if those pft clients are under test member they can go too"), Test Specialist 6137, the 2 tax-planner test logins, onboarding test rows, test-looking clients | **WIPED from live, straight after the switch day** (Jake 2026-11-04: *"the old test records will be wiped i want the live portal clean"*, reversing his 2026-11-03 decision to keep them because team members were using them). With `VFO_ENVIRONMENT=live`, nothing forces 59524 to sandbox, so until the wipe a payment on it would be REAL money. **Before deleting:** Jake approves the exact list, including any money rows, and the team is told; a backup is confirmed; `smoke-pipelines.ps1` moves off 59524; the accounting screens' `isTestMember` filters and `constants/test-sandbox.ts` go with the records. Destructive SQL is asked first (TEAM_RULES §1). **DONE 2026-11-04** (CHANGELOG 2026-11-04 (d)): also Test Group, planners 9 and 16 (Jake removed their allocation on real plans 150, 156, 103) and test onboardings 40, 42, 43. The document numbers stay (GOTCHAS #732), and the nine test-looking clients under real members stay (Jake). |
| The habit of testing on live: running onboarding with your own email, test members, test clients | A NEW TEAM_RULES §2 line: **never test on live** — no test records, no own-email applicants, no sandbox; all testing on staging. |

**What stays (not testing):** Jake's operational alerts. These are 54 notification rules plus the bells/Bcc in code (e.g. the CEO countersign bells, and the Bcc on templates 183 / 200) that name `jlatham@elitert.com` as the person who acts on them.

**When:** on the switch day, together with §4b, after staging has passed its S4 test. Until then live is the only place to test. Steps:
1. The code ships in a normal release, inert (`VFO_ENVIRONMENT` unset = today).
2. Jake sets `VFO_ENVIRONMENT=live` on live and deletes the 7 sandbox secrets.
3. Wipe live's test records (Jake 2026-11-04, the row above), as its own chat straight after the switch day.
4. The website deploy removes the toggles and the *Test member only* position.
5. **Its own chat, after the wipe (Jake 2026-11-04), with a check straight after, not part of the switch day:** live's 19 crons are re-installed reading their key from live's Vault (the same shape as `supabase/cron/staging-install.sql`), so the secret API key no longer sits written into `cron.job` (found 2026-11-01). **Done 2026-11-04 with `supabase/cron/live-install.sql`:** all 19 read the Vault, none holds the key, and 18 of 19 had returned 200 on schedule by 2026-11-05 15:10 UTC. The Friday digest first runs 2026-11-06 (CHANGELOG 2026-11-05, GOTCHAS #737).
6. Smoke live.

**As run 2026-11-04:** no backend code changed, and the sandbox secrets were already gone (§4b). The website release came first, then `VFO_ENVIRONMENT=live` on live, then smoke. Jake chose to wipe straight after, with no gap to manage (roadmap step 3).

**Target:** S1-S4 by ~2026-11-05 and S5-S7 by ~2026-11-10. The headline is S4, the first moment anyone can click staging.

### 4d. S2 as built (2026-11-01, edge branch `claude/phase-5-staging-portal-2ba513`, shipped 2026-11-02)

- **`constants/environment.ts`** is the one place that knows which copy this is. Any project that is not live counts as staging, so a missing or wrong secret can never make a test copy act like live. `VFO_ENVIRONMENT=live` on live turns on live-only (§4c). Unset on live = today, byte for byte.
- **Sandbox.** `loadSandboxConfig` / `…ForClient` / `…ForMember`, `isTestSandboxMember` and the new `isTestSandboxExpert` ask the environment first. **Found while building:** 95 handler lines read `pipeline_sandbox_config` directly, not through the helpers. They follow the rows, and `save_sandbox_config` now refuses to change a row wherever the environment decides. Behind that sit the keys: live holds no sandbox key after §4b, and staging holds no live key. The Stripe webhook only tries the signing secrets of the environment's own mode.
- **Feature switches.** Where the environment decides, the *Test member only* position is gone: `member_numbers` is ignored, the load reports `member_scoped=false` (the screen already hides the Test button for that), and save refuses `test`.
- **Links.**
  - `PORTAL_BASE` (44 links in 42 files) comes from `PORTAL_BASE_URL`.
  - The 6 chain calls and 7 PDF links use this project's own URL. On live that is the literal live URL, so they stay byte-identical.
  - The specialist Drive root comes from `SPECIALIST_DRIVE_ROOT_ID`, with live's folder as the default on live only.
  - CORS accepts `staging.vfoportal.com` on staging only.
- **Email guard** (`utils/staging-email-guard.ts`, inside `gmailPostWithRetry`).
  - To / Cc / Bcc / Reply-To become `STAGING_EMAIL_TO`, and the subject gets `[TEST] `.
  - A box at the top of the email names the real recipients.
  - It refuses when there is no inbox, when it cannot read a message, and for any other Gmail call.
  - On staging the sandbox reroute keeps the real recipients, so the box can show them. `draftOnly` is ignored there, so each template's Draft/Send setting works as on live and a Send-mode email really arrives.
- **Proof.**
  - `deno check` 0, and no new action.
  - `scripts/probe-staging-environment.ps1` runs 99 checks in 4 environments: today, live-only, staging, and staging with no inbox. On live every changed value equals today's.
- **Staging secrets this needs (names only):** `VFO_ENVIRONMENT=staging`, `PORTAL_BASE_URL`, `STAGING_EMAIL_TO`, `SPECIALIST_DRIVE_ROOT_ID`, `GOOGLE_DRIVE_FOLDER_ID`, `GMAIL_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN`, and `HTML2PDF_API_KEY`. The sandbox keys follow at S4.
- **Left for S4 / the switch day:**
  - The website: the toggles, the Feature Switches wording, and the test-fill.
  - The accounting screens' test-member filters.
  - The client-login email's "vfoportal.com" wording.

### 4e. S3 progress (2026-11-01)

- **Structure copied, no data.** `supabase db dump --linked` (schema only, read-only on live) went into a scratch folder and was checked: no URL, email or person in it. It was then applied to staging with `supabase db push` from a scratch folder linked to staging alone. Staging's migration history holds that one baseline, `20261101230000_live_schema_baseline`.
- **Identical to live on every count:** 109 tables / 2,005 columns, 343 constraints, 259 indexes, 104 policies, RLS flags, 6 functions, 1 trigger, 7 extensions (pg_cron + pg_net now on), table, column, function and sequence grants, and default privileges. The security advisor shows the same 5 INFO + 1 WARN as live. Every table has 0 rows.
- **Gotcha — a dump onto a fresh project is NOT the same permissions.** A new project's default privileges grant everything to `anon` / `authenticated`, and `pg_dump` does not revoke them. Staging came up with `experts` fully readable (live allows 8 safe columns only) and all 6 functions executable by `anon`, including `money_mapping_apply_to_row`. Both were fixed on staging to match live, and the grant fingerprints now match. Any later rebuild must re-check grants, not just objects.
- **All 98 staging sequences start at 100000** (§4b belt and braces).
- **Storage (done).**
  - All 22 buckets exist with live's exact settings (public flag, size limit, file types). `supabase seed buckets` sets a NULL limit to 50 MiB, so the NULLs were reset by SQL.
  - The template files are in: tax / MAP 1 / advisor / accountant agreements, map1-assets, specialist-onboarding-assets, faq-documents, vfo-widget, and only the two deck masters the code reads (`ROI-template-master-v11.pptx`, `ROI-bookends-master-v4.pptx`). That makes 48 files, each the same name and size as live; the CLI upload marked the decks `application/zip`, so they were re-uploaded with the pptx type.
  - People buckets are empty. The files were copied down with `supabase storage cp` from a scratch folder linked to live (read only) — Windows note: give it RELATIVE paths, and an upload path relative to `--workdir`.
- **Settings (done).**
  - 15 tables copied row for row and proven identical by content hash: `email_templates`, `agreement_templates`, `notification_rules`, `portal_feature_flags`, `pipeline_sandbox_config`, `pipelines`, `programs` plus its 4 phase / task tables, `faq_categories`, `faq_items`, `gc_services`, `member_number_baselines`.
  - Taken with `supabase db dump --data-only -s public -x <the other 94 tables>`, checked to hold only those 15, and loaded as a seed.
  - The dump's 59 `setval` lines were stripped, so every staging sequence stays at 100000 while the settings keep live's ids.
  - **Not copied:** `allowed_admins` (it holds passcode hashes; staff logins are made in S5) and every person table.
- **Sandbox rows (done):** all 8 are sandbox / Stripe test / BoldSign test, `sandbox_email = staging@vfo-services.com`, and each keeps live's Stripe account.
- **Crons.** Staging's are in `supabase/cron/staging-install.sql` (edge repo): same names, schedules and actions as live, pointed at staging, with the key read at run time from staging's Vault (`cron_api_key`). Live's read theirs the same way since 2026-11-04 (`live-install.sql`). Live has that Vault secret now too, so what stops `staging-install.sql` on live is its first check: it refuses if any job there calls live. It was installed after the first staging deploy.
- **DNS (done 2026-11-02).** Jake added the GoDaddy CNAME `staging` → `jlathamert.github.io`; Google's public DNS already returns it. It is the only DNS record staging needs.
- **Plain settings (done 2026-11-02, Jake's "yes").** Claude set `VFO_ENVIRONMENT=staging`, `PORTAL_BASE_URL=https://staging.vfoportal.com` and `STAGING_EMAIL_TO=staging@vfo-services.com` on staging with `supabase secrets set --project-ref yxolcioazczlhruprmrb`; each listed digest equals the SHA-256 of its value. They are settings, not passwords.
- **Still to do in S3:**
  - The rest of the staging secrets (Gmail + Drive wait for the staging@ account; `HTML2PDF_API_KEY`) and the Vault `cron_api_key` — typed in by Jake.
  - The first `vfo-admin-api` deploy to staging (needs the person's word).
  - Install the crons.
  - Advisor + smoke `-Target staging`.
- **The scheduled jobs' key.** Each sweep compares its `Authorization` header with the function's own `SUPABASE_SERVICE_ROLE_KEY`, so staging's Vault `cron_api_key` must be exactly that value. On 2026-11-02 Jake added the legacy `service_role` JWT (checked without reading it out: role `service_role`, ref `yxolcioazczlhruprmrb`), and also `HTML2PDF_API_KEY`, whose digest equals live's.
  - **That was the wrong key: every cron run got 401.** Staging is a new project, so Supabase gives its functions the NEW-style keys under the old names. Proof by digest: the function's `SUPABASE_ANON_KEY` digest equals staging's `sb_publishable_` key, not the legacy anon JWT, and its `SUPABASE_SERVICE_ROLE_KEY` digest (`4949cda3…`) is not the Vault entry's (`f33644b6…`).
  - **Fix:** the Vault `cron_api_key` holds staging's **default secret key** (`sb_secret_…`, Project Settings → API Keys). Check: its SHA-256 in SQL must equal the function's `SUPABASE_SERVICE_ROLE_KEY` digest in `supabase secrets list`. **Done 2026-11-02 15:20 UTC:** Jake swapped it and the digest matches. The 15:25 runs (reminder + onboarding-meeting sweeps) both returned 200.
  - `vfo-admin-api` has `verify_jwt = false`, so a non-JWT bearer is fine at the gateway. Its own chained calls use the same env value, so they match.
  - Anything else that sends staging's service key (smoke `-Target staging` in S6, any hand test) must use the `sb_secret_` key, never the legacy JWT. Live's functions hold the `sb_secret_` key too, proved by digest on 2026-11-04, so live's Vault holds that key (GOTCHAS #737).

### 4f. S4 website code (2026-11-02, react branch, shipped with part 1; on staging since 2026-11-02)

- **`src/lib/environment.js`** is the one place the website knows which copy it is: `IS_STAGING` (`vite --mode staging`), `SUPABASE_URL`, `HEADSHOTS_URL`, `PORTAL_URL`. Unset = live's values.
- **`.env.staging`** (committed through a `.gitignore` exception) holds the staging build's PUBLIC values only: API URL, project URL, portal URL and staging's anon key (which ships to every browser, like live's in `public/store/data.js`).
- **Pointed at the setting:** the headshot / logo base in 7 files, the website-widget embed code (`MemberWebsitePlugin.jsx`), and the Tax Diagnostic public link (`TaxDiagnosticsPanel.jsx`). The 41 API URLs already follow `VITE_API_URL`.
- **TEST banner:** `components/shared/StagingBanner.jsx`, mounted by `main.jsx` only when `IS_STAGING`, with no off switch. It is a thin orange line across the top plus a "Test Site · Test Data · Stripe Test Mode" label bottom-left (wording Jake's, 2026-11-02), and never takes a click. Sentry reports staging as `environment=staging`.
- **`npm run build:staging`** = `vite build --mode staging`, the route pages, then `scripts/finish-staging-build.mjs`. That script:
  - sets `CNAME` = staging.vfoportal.com, makes `robots.txt` block everything, and drops the sitemap;
  - gives every page `noindex` and a `[TEST] ` title;
  - points `/store` and the static pages at staging;
  - **refuses (exit 1) if any file still names live's project, live's anon key or `https://vfoportal.com`**, or if dist is not a staging build.
- **`npm run deploy:staging`** = that build, then `gh-pages` to `JLathamERT/vfo-portal-staging`. It needs the person's "deploy", and GitHub Pages must be switched on in that repo (branch `gh-pages`).
- **Proof (2026-11-02):**
  - Staging build: 152 files checked, nothing names live. The Vite assets held no live address even before the finishing step.
  - Live build (`npm run build`): no banner, no staging address, `CNAME` vfoportal.com, sitemap kept, no `noindex`, Sentry `production`. The headshot base resolves to the same live URL as before.
- **FIRST STAGING DEPLOY (2026-11-02, Jake's "deploy").**
  - **Backend:** `vfo-admin-api` from the edge worktree (main 2e86067 + S2, uncommitted) went to staging with `supabase functions deploy vfo-admin-api --project-ref yxolcioazczlhruprmrb --use-docker`, which made staging v1. Live stayed v1082, checked before and after; that worktree's own link points at live, so `--project-ref` is always explicit.
  - **Backend checks:** `deno check` 0 and probe 99/99 beforehand. CORS echoes `https://staging.vfoportal.com`, and a sweep with no key gets 401.
  - **Crons:** `staging-install.sql` was run on staging. 19 jobs, all active, all calling staging, none with a key written in.
  - **Website:** `npm run deploy:staging` (finishing check passed, 152 files) pushed branch `gh-pages` to `vfo-portal-staging`. GitHub Pages is then switched on in that repo's Settings → Pages (branch `gh-pages`, root, custom domain staging.vfoportal.com). There is no `gh` CLI on Jake's machine, so that is a dashboard step.
  - **Site checked (2026-11-02, after Jake switched on Pages, DNS check passed, Enforce HTTPS ticked):**
    - `https://staging.vfoportal.com` returns 200 with title `[TEST] VFO Portal …`, and `/admin` returns 200. Plain http gets a 301 to https.
    - Every page carries `noindex`, and `robots.txt` blocks everything.
    - The app script calls staging only (no live ref) and contains the TEST banner.
  - **First cron runs (14:10–15:05 UTC):** 30 runs, all reached staging but got 401 "Service-role authorization required". The Vault held the wrong key; see the scheduled jobs' key in §4e.
- **Label wording (2026-11-02, Jake's "deploy"):** changed to "Test Site · Test Data · Stripe Test Mode" and republished; the live site's script carries it.
- **Jake's staging login (2026-11-02, Jake's pick "1"):** staging's `allowed_admins` was empty (§4e), so his first login failed. As a stop-gap until staging email works, his live row (id 1, with its salted passcode hash) was copied to staging, so his live password works there. Once staging email works he sets his own staging password (D8), and Paxton's staging login is made the same way.
- **Staging Google account connected (2026-11-02):**
  - **Account:** Jena made `staging@vfo-services.com`, a real user named "VFO Staging" (an alias of aipc@ was ruled out because staging must never hold live's mailbox or Drive). Its recovery address is Jake's ERT email.
  - **Drive:** folder "VFO Staging Files", with "Clients" inside it. Claude set `SPECIALIST_DRIVE_ROOT_ID` and `GOOGLE_DRIVE_FOLDER_ID` to those two folders (digests verified). The portal makes "VFO Specialist Onboarding" and the client folders itself.
  - **Google app:** staging has its own Google Cloud project "VFO Staging" (Gmail API + Drive API, Internal consent screen) and a web client "VFO Staging portal" whose redirect is the OAuth Playground. It does not use live's Google app.
  - **Secrets:** Jake added `GMAIL_CLIENT_ID` / `_SECRET` and the Playground refresh token `GMAIL_REFRESH_TOKEN`, all also in Bitwarden. Scopes: `gmail.compose` (drafts + send), `gmail.readonly` (thread lookup, `utils/gmail-thread.ts`) and `drive`. The code makes no Sheets calls any more.
  - **Proof:** the weekly arrears digest, run by hand on staging, returned 200 `{"ok":true,"count":0}`, so the token refresh and draft creation work. The template's `send_mode` is false, so it is a DRAFT in staging@'s Gmail.
  - **CLI note:** `npx supabase` now fetches CLI v3.0.0, which refuses `[inbucket]` in `supabase/config.toml` (rename to `[local_smtp]`). Use the installed v2.78.1 (`supabase`) until the config is updated. Paxton's fresh install will get v3.
  - **Admin logins:** `create_admin` takes a passcode typed by a superadmin and sends no email, so D8's "set-up link" does not exist yet. Paxton's staging login = Jake adds him in staging's Admin Editor.
- **Keeping in step, 2026-11-02 (Team Notification Emails release, v1083):**
  - That chat applied migration `team_notification_recipients` to staging too. Column fingerprint equals live's; staging holds 1 recipient row, live 16 real people.
  - Live's Cc/Bcc were cleared on templates 159, 182 and 183 (the payout set-up emails), and staging still had them. Copied to staging; the `email_templates` fingerprint equals live's again (`5ba934f0…`).
  - `cc_list` / `bcc_list` / `to_list` are **jsonb arrays**: write `'[]'::jsonb`, never `'{}'` (that is an object). A first attempt wrote `'{}'` and was corrected within a minute; no staging email could send at the time.
- **SECOND STAGING DEPLOY (2026-11-02 evening, Jake's "deploy"): staging brought up to today's live releases.**
  - **Code:** both worktrees moved to latest main (edge 333e6cd = #336 Team Notification Emails + #337 Client Portal go-live; react 6f423ac5 = #575-#578) with a tagged stash and the app's sync. This chat's work re-applied with no conflicts.
  - **Checks:** `deno check` 0, the staging probe passes all 4 scenarios, and the staging build's finishing check passed (152 files, nothing names live).
  - **Database:** today's 4 migrations were already on staging (that chat applied them), and the `email_templates` fingerprint equals live's (`f5fa9020…`). Live had turned 7 feature switches on for everyone today (ciq_licence, client_basic_portal, client_case_progress, mirrored_clients, portal_licensing, tax_intake, tpom_additional_benefits). They were copied to staging, and the `portal_feature_flags` fingerprint now equals live's.
  - **Backend:** went from staging v5 to **v6** (22:29 UTC); live stayed **v1085** before and after. Staging answers CORS for staging.vfoportal.com, and a sweep with no key gets 401.
  - **Gotcha:** `deno check` leaves `supabase/functions/vfo-admin-api/deno.lock` (gitignored, lockfile v5). The Docker bundler's older Deno then refuses the deploy ("Unsupported lockfile version '5'"). Delete that file before `functions deploy --use-docker`.
  - **Website:** `npm run deploy:staging` published.
  - **Verified:**
    - At 22:31 UTC staging.vfoportal.com served the new build (`index-Bcwr9LPG.js`): it calls staging only and carries the TEST label.
    - The 22:30 cron runs on v6 both returned 200.
    - Live's site still served its own build.
- **Found:** staging's copy of `vfo-widget/vfo-widget.js` (copied from live in S3) still calls live's project. Members only embed it on their own sites, so nothing on staging loads it. **Fixed 2026-11-04:** staging's bucket now holds a copy with staging's address and anon key, made from `widget/vfo-widget.js` (edge repo, `widget/README.md` says how). S5's *Refresh settings* must keep that rewrite, never copy live's file over it.

### 4g. S5 as built (2026-11-05, branches `claude/admin-staging-tab-8139bd` (edge) / `claude/admin-staging-tab-e71b02` (react))

The **Staging** tab sits to the right of More in the admin portal, on the test site only: its code is loaded only in a staging build, so live's bundle has none of it. The admin home page there shows **Things to know when testing** (`StagingHome.jsx`) in place of the KPI cards.

| Control | Who | What it does |
|---|---|---|
| What is running | Any admin | Website commit, backend version, the person's test member, last reset, last reset of everyone, last settings refresh. The record is `status.json` in the private bucket `staging-status`, which only the test site has, so live needs no new table. |
| Reset my test data (`staging_reset_mine`, typed `RESET`) | Any admin | Only the person's own set, found from their login and never from the request. Cancels their Stripe sandbox licence subscriptions, empties their member and client vault folders, deletes their test member and everything under it, re-makes it with the same number, clears their bells, and ends their member, client, planner and specialist sessions. Their specialist, planner, team member and group keep their ids, because another tester's plan may name them: their work and vault folders are cleared and their details go back to how they started. |
| Reset everyone (`staging_reset_all`, typed `RESET EVERYONE`) | Superadmin | Refuses (409) if any table is on neither list in `constants/staging-tables.ts`, then wipes every test table and every people bucket and re-makes each admin's set, existing numbers first. |
| Refresh settings from live (`staging_refresh_settings`) | Superadmin | **Check what would change** writes nothing; **Apply these changes** adds and updates, never deletes, and lists what exists only on the test site. A switch that differs is named, like `tax_direct: On here, Off on live`, so a switch left On for a feature being built can be stopped before applying. |

**Every admin's set (Jake 2026-11-05), made by `create_admin` and removed by `delete_admin`.** All are opened by the person's admin password, including after it changes (`stagingOwnerPasscodeOk`), and all their mail comes to them (`stagingOwnerOfTestAddress` in the email guard).

| Login | Email (Jake's) |
|---|---|
| Admin, member, specialist | `jlatham@elitert.com` (separate login tables, so they can share) |
| Tax planner | `tpjlatham@elitert.com` (planners share one login table) |
| Team member | `tmjlatham@elitert.com` |
| Clients | `jlatham+holistic@`, `+tax@`, `+pft@` `elitert.com` (`client_logins.email` is unique) |

The TP, TM and group addresses are not real mailboxes. The planner and team member sit in the person's own group, `Jake Test Group 10001` (contact `groupjlatham@elitert.com`), because a team member sees their whole group's work. This replaces the shared Test Group and its two planners.

**Bells (Jake 2026-11-05: all or nothing).** All of a tester's bells show in their admin account only. On the test site the member and planner bells load nothing and say so, because a member login shares the admin's email and would otherwise list the same bells, including ones meant for Tracy.

**`staging_settings_export` (on live, `PUBLIC_HANDLERS`).** It takes no input. It refuses everything while `STAGING_EXPORT_KEY` is unset, and otherwise answers 404 unless the header `x-staging-export-key` holds the exact key (compared by hash, in constant time), limited to 30 calls an hour per IP. It returns the 14 tables of `STAGING_SETTINGS_TABLES` and signed links (10 minutes) to the top-level files of 8 template buckets; from `presentation-templates`, only the 2 masters in use. It never returns `allowed_admins`, `pipeline_sandbox_config`, a person table or `vfo-widget`. The one row it writes is the throttle's own. The test site re-checks every table and file against the same allowlist and refuses a link to any other host. `scripts/probe-staging-export.ps1` (edge repo) proves the refusals.

**FAQ ids.** `faq_categories.id` and `faq_items.id` are GENERATED ALWAYS, so a new row can't keep live's id (#735). Refresh matches those two tables by id, then by name or question, and maps `category_id` to the test site's id.

**What Reset doesn't reach:** cron and Vault (it uses only supabase-js on `public` and the Storage API), id sequences (never restarted, so a late sandbox event can't match a new row), the test site's Google Drive (generated decks stay there) and Stripe's sandbox history.

**Not built:** D9 (Reset copying live's admin list). Admins are added by hand in the Admin Editor.

## 5. Safety built in (each one refused twice)

- `staging_*` actions check `VFO_ENVIRONMENT=staging` (a staging-only secret) AND that `SUPABASE_URL` is not `ejpsprsmhpufwogbmxjv`. If either fails they refuse, so a reset deployed to live by mistake does nothing.
- The email guard fails closed: on staging with no `STAGING_EMAIL_TO`, nothing is drafted or sent.
- `staging_settings_export` on live is read-only. It returns only the allowlisted tables and signed links to the template buckets, refuses anything without the exact shared key (constant-time compare, rate-limited), and never returns a person row. Probe-scripted like the other public refusals.
- No live key in staging's secrets, and no staging key on live except the one shared export key.
- The TEST banner is compiled into every staging build and has no off switch.

## 6. Fake data (seed v1)

Enough to open every portal and start every program from step 1. Mid-stage scenarios get added as tests need them.

**As built 2026-11-03** — `supabase/staging/seed-test-data.sql` (edge repo). It refuses anywhere but staging, only creates, and is safe to re-run (a second run added nothing).
- **No Test Member 59524, Test Client or Test Specialist 6137 on staging** (Jake 2026-11-03). On staging every record is test-mode, so a special member number does nothing. The money screens hid 59524 and 6137 at the time, so a test on them would have vanished; those filters and records are gone since 2026-11-04.
- **Shared (this file only, for building a new test site):** the Test Group tax-planning group with a fake Tax Planner and a fake Team Member. Since 2026-11-05 Reset and `create_admin` give each person their own instead (§4g).
- **One test set per person** (per D11), named after the person ("Jake Member", "Paxton Member") and numbered from **10001**: Jake = **10001**, Paxton = **10002**, the next person 10003. These numbers are below live's lowest member number (11111) and below every automatic-numbering start (30000 / 60000 / 90000), so these numbers can never clash with a real member.
- **Each set holds:**
  - a Catalyst member (Tier 2, the full portal) enrolled in Holistic (1), Partnership Fast Track (2) and VFO Tax Planning (4), with those program tabs on;
  - one client per program at step 1: `<number>-001` Holistic, `<number>-002` Tax, `<number>-PFT1` PFT;
  - one advisor onboarding and one accountant onboarding (`VFO FT`) at step 1.
  - There are no plan, payment or agreement rows: each test starts from the real screens. Starting a tax plan grants the Premium client portal itself, and a specialist is made through specialist onboarding.
- **BUILT 2026-11-03: a test member made automatically for each person** (Jake: *"1 per person … auto allocated with the same stripe connect sandbox account"*). On staging only, `create_admin` makes the person's set (the next free 10001+, the same shape as above, `utils/staging-test-member.ts`): a member login on the admin's own email and passcode hash, one client per program whose email and client login are the admin's TAGGED email (`jlatham+holistic@` / `+tax@` / `+pft@` — `client_logins.email` is unique, #723), two onboardings, and the payout account `STAGING_TEST_CONNECT_ACCOUNT_ID` (one shared sandbox Connect account; the seed gives the Test Group the same one, so the $250 team share and planner shares really pay). `delete_admin` removes the set first. The admin password also opens that member and client logins. Add Member (`add_member` / `add_member_full`) answers 403 on staging and the Members tab shows a note instead of its forms; Add Client and onboarding's own create-member step still work. The seed made Jake 10001 and Paxton 10002.
- **BUILT 2026-11-03: staging emails and bells go to the TESTER** (Jake: *"the emails are sent to the testers email themself"*; *"i dont want someone to … select [Paxton] as the proactive facilitator and he get lots of test notifications"*). Emails: `stagingTesterFor` in the one guard — the owner of the test member a recipient is or belongs to, else the owner of a test member or client the email names, else the clicker, else the team inbox — and every staging draft is SENT at creation ([integrations/gmail.md](../../integrations/gmail.md)). Bells: `stagingBellRoute` inside `notifyByRule` — the clicker, else the test client's owner, else a named test member's owner, else live recipients who have a staging login, else all admins; title unchanged, message prefixed `TEST - meant for: …`, shown teal with a TEST chip, and action bells get a staging-only **Clear (test)** ([flows/notifications.md](../../flows/notifications.md)). The [TEST] subject and the orange "would have gone to" box stay.
- **Full test (2026-11-03, Jake, on staging): PASS.** Part A: Jake Member bought Growth Credits by card (ERT sandbox) — a Growth Credits purchase sends no email, bells only. Part B: Jake Tax Client (10001-002, plan 100000) through VFO Tax Planning — Start Tax Plan, a pasted deposit id, returns on file, Test Planner allocated, review Proceed (the $250 team share transferred), risk profile, Skip TPOM retainer first, decision Yes, the agreement signed by client and CEO in BoldSign sandbox, the payment email, a $2,000 card retainer (4242), `INV-10001-002-0001` / `REC-10001-002-0001` in the staging Drive and emailed; every email reached jlatham@elitert.com with the orange box, every bell was teal in Jake's bell only. **Not exercised:** an ACH or check retainer, Tax 4 onward (the retainer revenue share pays only after the client's Client decision 1 click), MAP 1 / PFT / onboarding / SpecRev on staging, and the six recipient-keyed bell clears (specialist onboarding, the Tray FYI).
- Names are obviously fake ("Jake Tax Client"). Emails are `staging+<tag>@vfo-services.com`: Google delivers anything after the `+` to the staging@ inbox, which Jake and Paxton share.
- Fake people's logins share ONE staging test password (a staging secret, also in Bitwarden — never in a file). Staff logins are kept across resets (per D8).

## 7. Costs

- Supabase: **$10 / month** for the new project (org "Elite Resource Team", Pro — quoted by the Supabase cost tool 2026-10-31).
- Google: one Workspace seat if the staging account is a Workspace user (D3).
- Stripe sandboxes, BoldSign sandbox, GitHub Pages and DNS: free.

## 8. Rule changes once it works (S7, per D18-D19) — DONE 2026-11-04

- **TEAM_RULES §4:** test deploys of a branch go ONLY to staging. Live gets releases from main and nothing else. The "until the staging project exists" exception is deleted.
- **TEAM_RULES §8:** "there is one project and it is production" becomes two projects. Test SQL runs on staging; live SQL is for real-data fixes only. `apply_migration` runs on staging first and on live at release.
- **The starter:** the dev server talks to staging by default.
- **The wrap-up:** merge, then main deploys to staging (automatic), smoke staging, then the live release as today.
- `docs/ACCESS.md` gains the staging rows (project, inbox, Stripe sandboxes, test password).

## 9. Decisions — Jake

Asked in the planning chat 2026-10-31. Jake: **"dont start yet"**. He sets up the accounts on 2026-11-01. Jake's words are quoted where given.

| # | Decision | Answer |
|---|---|---|
| D1 | New Supabase project "VFO Staging", same org, us-east-2, $10/month | "ok i will set up tomorrow". **CREATED 2026-11-01** by Claude on Jake's "yes" to the $10/month: project ref `yxolcioazczlhruprmrb`, `https://yxolcioazczlhruprmrb.supabase.co` |
| D2 | `staging.vfoportal.com` from a new repo `vfo-portal-staging` + one DNS record | DNS is at **GoDaddy** |
| D3 | A new Google account = the mailbox staging drafts from (and its Drive) + the inbox every staging email goes to | "ok we can set up a new google account". Live drafts land in **aipc@vfo-services.com**, so the staging account is a **vfo-services.com** user (e.g. `staging@vfo-services.com`), in the same company Google as the portal's existing connection |
| D4 | Stripe sandboxes | **Jake's call, replacing new sandboxes:** "unlink live from those sandboxes and make sandboxes and staging linked and live linked to live". The EXISTING VFO Services + ERT sandboxes move to staging, and live becomes live-only — see **§4b** |
| D5 | BoldSign sandbox | "ok we can do it". Under D4 it becomes the same move: the BoldSign sandbox webhook goes to staging only, and live keeps only its live key |
| D6 | html2pdf: share live's key | "ok" |
| D7 | Jake + Paxton now; the whole team after Paxton's first ~two weeks | "roughly yes" |
| D8 | Own staging admin password (set-up link to the team inbox), kept across resets; fake logins share one staging test password (staging secret + Bitwarden) | "ok" |
| D9 | When the team joins, Reset copies live's admin list (emails + tabs, never passwords) | "ok". **Not built in S5 (§4g):** admins are added by hand. |
| D10-D17, D19 | Sharing the backend, per-person data lanes, migrations on shared staging, deploy-on-merge, the settings list, crons, the banner, staging emails, live's 59524 | Not answered ("bored of reploy to these decisons") — **Claude's recommendation (chat 2026-10-31) stands as the default**. Each is shown as built at its checkpoint for Jake to change. **D13 (a Supabase token in GitHub can reach live) was re-asked 2026-11-03: Jake chose two limited tokens, one per project, Edge Functions only** ([two-person-workflow plan](../two-person-workflow/README.md) §3). |
| D18 | (a) branch test deploys → staging only; (b) a staging deploy needs no "deploy" word, live still does; (c) the dev server → staging by default, `npm run dev:live` kept | "a) ok b) ok c) ok" |

**Who does what in S1.** Claude does everything that is code, database or a deploy to staging, and creates the Supabase project through the MCP once Jake says go. Jake does everything that is an account, a sign-in, a dashboard or a secret value: the Google account, the Stripe sandboxes and webhooks, the BoldSign webhook, the GoDaddy record, the `vfo-portal-staging` repo, and typing each staging secret into the Supabase dashboard. One step per message.
