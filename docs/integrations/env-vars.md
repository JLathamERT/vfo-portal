# Environment variable inventory

Complete list of secrets and config-vars referenced by the edge functions, with which actions/integrations consume each. No `.env` files are committed; production values live in Supabase function secrets, local-dev values live in the gitignored `vfo-edge-functions/supabase/.env.local` (a populated copy of `.env.local.template`).

> **Integration helpers** (Phase 3 scaffolding) — `getStripeKey(isSandbox)` **and, since 2026-09-11, `getStripeKeyFor(account, isSandbox)`** in `vfo-admin-api/integrations/stripe/client.ts` (`getStripeKey` is now a thin wrapper that always resolves the PRIMARY `vfos` account, so unconverted callers are byte-equivalent), `getBoldSignKey(isSandbox)` in `vfo-admin-api/integrations/boldsign/client.ts`, `getGoogleAccessToken()` in `vfo-admin-api/integrations/google/oauth.ts`, `loadSandboxConfig(supabase, pipelineName)` in `vfo-admin-api/integrations/sandbox-config.ts`. Phase 4 handlers were extracted byte-equivalently — most still call `Deno.env.get(...)` and `fetch(...)` directly; only `gc_create_checkout` adopted the Stripe helper. Adopting the rest is optional polish, not a refactor requirement.

> **`verify_jwt` setting** — both functions have `verify_jwt = false` in `vfo-edge-functions/supabase/config.toml` AND in the live registry (matched). Public-token endpoints (`/decide`, `/pay`) require this so Kong gateway doesn't 401 their headerless requests. Application-level auth still happens via `middleware/auth.ts::authenticate()`. The config setting matches reality, so plain `supabase functions deploy` Just Works (no `--no-verify-jwt` needed).

## Edge-function env vars

Confirmed via `Deno.env.get(...)` audit of `vfo-admin-api/index.ts` and `boldsign-webhook/index.ts`.

### Supabase

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | both edge functions | Project URL — `https://ejpsprsmhpufwogbmxjv.supabase.co` on live, the staging project's own on staging. The `createClient` arg. Chain-call URLs and public storage links go through `projectUrl()` / `adminApiUrl()` (`constants/environment.ts`, 2026-11-02), which on live return the literal live URL so live's links stay byte-identical. |
| `SUPABASE_SERVICE_ROLE_KEY` | both edge functions | Service-role key for `createClient`. Bypasses RLS. Also presented as `Authorization: Bearer ...` on server-to-server chain calls, and every sweep compares the cron's Bearer with it. **On a project created in 2026 (staging) Supabase fills it with the NEW-style `sb_secret_…` key, not the legacy JWT** — a caller that sends the legacy JWT gets 401 (#715). |

### Environment — which copy of the portal this is (2026-11-02, `constants/environment.ts`)

Unset on live = today's behaviour byte for byte. The staging project sets them (plan: [plans/staging/README.md](../plans/staging/README.md)).

| Var | Read by | Purpose |
|---|---|---|
| `VFO_ENVIRONMENT` | `isStagingEnvironment()` / `isLiveOnlyEnvironment()` / `environmentSandbox()` | `staging` on the staging project. `live` on the live project since the switch day, 2026-11-04 = live-only, never sandbox (plan §4c). Unset would bring back the pipeline toggles and each row's stamp deciding sandbox (no member or specialist is a special case any more). Any project that is not live is ALWAYS sandbox, whatever this says. |
| `PORTAL_BASE_URL` | `PORTAL_BASE` (every emailed link, Stripe `success_url` / `cancel_url`) | `https://staging.vfoportal.com` on staging; unset = `https://vfoportal.com`. |
| `STAGING_EMAIL_TO` | `utils/staging-email-guard.ts` | The staging team inbox (`staging@vfo-services.com`): where a staging email goes when it names no tester (the guard sends the rest to the tester, `integrations/gmail.md`). Missing on a non-live project = no email leaves (fails closed). |
| `STAGING_TEST_CONNECT_ACCOUNT_ID` | `utils/staging-test-member.ts` | Staging only: the ONE sandbox Stripe Connect account every per-person test member (and the seed's Test Group) is paid out through. An account id, not a key. |
| `STAGING_EXPORT_KEY` | `actions/staging/settings-export.ts`, `actions/staging/refresh.ts` | The shared key for the Staging tab's Refresh settings. The same value on live and the test site, and never held anywhere else: to replace it, set a new one on both. Unset on live = the export refuses everything. Setting it bumps every function's version on that project (#485). |
| `STAGING_EXPORT_URL` | `actions/staging/refresh.ts` | Test site only, and only for testing: the endpoint Refresh reads. Unset = live's `vfo-admin-api`. |
| `SPECIALIST_DRIVE_ROOT_ID` | `SPECIALIST_DRIVE_ROOT` (specialist bg / licence receipts) | The Drive folder that holds "VFO Specialist Onboarding". Unset = live's own folder, **on live only** — a test copy never files into live's Drive. |

### Stripe

| Var | Required by | Notes |
|---|---|---|
**EIGHT vars since 2026-09-11 (`vfo-admin-api` v829) — two Stripe accounts × two modes × (secret key + webhook signing secret).** `vfos` = **VFO Services** (the original, still the default for everything); `ert` = **ERT** (Elite Resource Team LLC), which carries member membership fees, Growth Credit purchases and advisor/accountant onboarding money. Full rules: [stripe.md](stripe.md#two-stripe-accounts-2026-09-11). **TWO MORE were added later the same day (SpecRev ERT share leg): `ERT_CONNECT_ACCOUNT_ID` / `ERT_CONNECT_ACCOUNT_ID_SANDBOX`.** They sit **outside** the account × mode × (key + webhook secret) matrix above, because they are not credentials at all: each holds an `acct_…` **id** — ERT's **connected account on the VFO Services platform** — used only as a transfer `destination`. Do not confuse them with the `ERT_STRIPE_*` keys, which belong to ERT's separate *billing* account.

| Var | Account | Required by | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `vfos` | `automation_CONTRACT_stripecustomer`, `automation_CONTRACT_stripecheckout`, `automation_CONTRACT_revshare`, Stripe webhook handler, and **44 other files** across the primary-only pipelines (Tax, MAP 1, PIP, SpecRev, specialist, migration / Payment Continuation, `/update-card`) | Live mode |
| `STRIPE_SECRET_KEY_SANDBOX` | `vfos` | same | Test-mode key. Selected when the pipeline's `pipeline_sandbox_config.sandbox_mode=true`, or when the plan/onboarding row's own `sandbox` flag is set. |
| `STRIPE_WEBHOOK_SECRET` | `vfos` | Stripe webhook signature verification (`router/webhooks.ts::maybeHandleStripeWebhook`) — live secret | One of **four** candidates the verifier HMACs against. **Which one matched is recorded** — it is the only evidence of which Stripe account the event came from (gotcha **#485**). |
| `STRIPE_WEBHOOK_SECRET_SANDBOX` | `vfos` | same handler — sandbox secret | same |
| **`ERT_STRIPE_SECRET_KEY`** | `ert` | `membership_*` (`send-setup-link`, `setup-checkout`, `sweep`, `terminate`, `stripe-remap`), `automation_ADVISOR_*` / `automation_ACCOUNTANT_*` Stripe handlers, `gc_create_checkout`, Stripe webhook handler | **NEW 2026-09-11.** Live ERT secret key. Resolved by name via `stripeKeyEnvName('ert', false)`. |
| **`ERT_STRIPE_SECRET_KEY_SANDBOX`** | `ert` | same | **NEW 2026-09-11.** Test-mode ERT key. |
| **`ERT_STRIPE_WEBHOOK_SECRET`** | `ert` | same verifier — live ERT secret | **NEW 2026-09-11.** Stripe issues a separate signing secret per account per mode, so a webhook is signed by exactly one of the four. |
| **`ERT_STRIPE_WEBHOOK_SECRET_SANDBOX`** | `ert` | same verifier — sandbox ERT secret | **NEW 2026-09-11.** |
| **`ERT_CONNECT_ACCOUNT_ID`** | *(platform `vfos`)* | `utils/specialist-revenue-payout.ts` (the SpecRev ERT-share transfer loop) | **NEW 2026-09-11.** ERT's **connected-account id** (`acct_…`) on the VFO Services platform — the `destination` of the ERT-share transfer (the manual catch-up action that also used it was removed 2026-10-05). **An id, not a key**, and nothing to do with the `ERT_STRIPE_*` billing secrets. Name resolved by `ertConnectAccountEnvName(false)` in `constants/stripe-accounts.ts`. **Unset is not fatal but is not silent either**: the leg is stamped `ert_payout_status='failed'` and raises the `SPECREV_ert_transfer_failed` bell, and the nightly sweep retries once the secret is set |
| **`ERT_CONNECT_ACCOUNT_ID_SANDBOX`** | *(platform `vfos`)* | same | **NEW 2026-09-11.** Same, for sandbox — there is no sandbox copy of the real ERT account, so a **test connected account in the VFO Services sandbox stands in for ERT**. Resolved by `ertConnectAccountEnvName(true)` |
| **`VFOS_CONNECT_ACCOUNT_ID`** | *(platform `ert`)* | `utils/tier1-licence-transfer.ts` (the Tier 1 $25 VFO Portal licence transfer, ERT → VFO Services) | **NEW 2026-10-30 (portal licensing L6b).** VFO Services' **connected-account id** on the **ERT** platform — the reverse of `ERT_CONNECT_ACCOUNT_ID`. An id, never a key. Resolved by `vfosConnectAccountEnvName(false)`. **Not set yet** — the live link is owed ([stripe.md](stripe.md) *VFO Services is ALSO a connected account OF ERT*); rows wait as `awaiting_link`. |
| **`VFOS_CONNECT_ACCOUNT_ID_SANDBOX`** | *(platform `ert`)* | same | **NEW 2026-10-30.** Same, for sandbox — the ERT-sandbox stand-in `acct_1UWImVAEdlS0L4GN`. Its write bumped `vfo-admin-api` v1062 → v1063 and `boldsign-webhook` v46 → v47 with no code change. |

At least one webhook secret must be set or the verifier returns 500; **unset secrets are simply skipped**, so a partially-configured environment still verifies whatever it holds keys for. Env-var NAMES are never spelled inline where two accounts are possible — `stripeKeyEnvName(account, isSandbox)` and `stripeWebhookSecretEnvName(account, isSandbox)` in `vfo-admin-api/constants/stripe-accounts.ts` return the name and the caller reads the value.

> **Registry-version note (2026-09-11):** writing the four new secrets **bumped every edge function's registry version by 4 with no code change** — `vfo-admin-api` v824 → v828 and `boldsign-webhook` v40 → v44, both with an identical hash and timestamp — before the v829 deploy. A version jump with no deploy is what a secret write looks like; do not hunt for the phantom code change. **The same thing happened again** when `ERT_CONNECT_ACCOUNT_ID[_SANDBOX]` were written for the SpecRev ERT share leg — every function's version bumped again, still with no code change.

> **Note:** `automation_CONTRACT_stripewebhook` was removed in Phase 6 mechanical (was doubly-dead code). It no longer reads any env vars.

> **CORRECTION (2026-09-11):** the note that used to sit here — *"`gc_create_checkout` only reads `STRIPE_SECRET_KEY` — no sandbox path for GC purchases"* — is **stale and wrong**. `actions/gc/create-checkout.ts` reads the **`GROWTH_CREDITS`** row via `loadSandboxConfig(supabase, "GROWTH_CREDITS")` and calls `getStripeKeyFor(stripeAccount, isSandbox)`, so it is **both** sandbox-aware and account-aware. Its matrix row below is corrected to match.

### BoldSign

| Var | Required by | Notes |
|---|---|---|
| `BOLDSIGN_API_KEY` | `automation_CONTRACT_sendagreement`, `automation_CONTRACT_ceocountersign` | Live mode |
| `BOLDSIGN_API_KEY_SANDBOX` | same | Sandbox |

### Google (Gmail + Sheets + Drive)

A single OAuth refresh token covers all three Google APIs.

| Var | Required by | Notes |
|---|---|---|
| `GMAIL_CLIENT_ID` | every handler that creates a Gmail draft, reads Sheets, or uploads to Drive | OAuth client ID |
| `GMAIL_CLIENT_SECRET` | same | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | same | Long-lived refresh token. Single token. The code needs `gmail.compose` (drafts + send), `gmail.readonly` (the thread lookup in `utils/gmail-thread.ts`) and `drive`; it makes no Sheets call any more. Live's exact grant is not in the repo. Staging's (2026-11-02) is exactly those three, granted by `staging@vfo-services.com` through its own Google Cloud project "VFO Staging". |
| `GOOGLE_DRIVE_FOLDER_ID` | `automation_CONTRACT_invoicereceipt` only | Parent folder ID under which per-client subfolders are created |

> **Naming inconsistency:** the variable is `GMAIL_CLIENT_ID` etc. but it's actually the **Google** OAuth client used for Gmail + Sheets + Drive. Renaming would break the deployed function; documented as-is.

### PDF generation

| Var | Required by | Notes |
|---|---|---|
| `HTML2PDF_API_KEY` | every invoice/receipt/agreement handler, **via the helper** | API key for `https://api.html2pdf.app/v1/generate`. Third-party HTML→PDF service. **Read in exactly ONE place: `vfo-admin-api/utils/html2pdf.ts` `renderHtmlToPdf(html, label, extra?)`** (2026-09-10) — no handler calls the endpoint directly any more, and the grep that proves it is `grep -rn "api.html2pdf.app" --include=*.ts .` returning only that file. **Retry policy: 3 attempts, 1500 ms then 3000 ms with ±20% jitter, on 403 / 429 / 5xx and thrown fetch errors; every failed attempt logs `html2pdf <label>: attempt N/3 FAILED — status S`; other 4xx (400/401/404/413) do not retry.** Returns `ArrayBuffer \| null`, so each caller keeps its own failure handling. The 403 is a **concurrency** refusal, not an auth one — gotcha **#483**. Handlers that also pre-check the var themselves (`"HTML2PDF_API_KEY not configured"`) kept that guard. |

## Frontend env vars

Vite-style (`import.meta.env`):

| Var | Used by | Purpose |
|---|---|---|
| `VITE_API_URL` | 42 files (`grep -rl VITE_API_URL src`, 2026-11-02), [src/lib/api.js:1](src/lib/api.js) first | Override for the edge function URL. Falls back to hardcoded `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api`. Production behavior unchanged when unset. `npm run dev` and `npm run build:staging` set it to the test site through `.env.staging`; `npm run dev:live` leaves it unset. |
| `VITE_SUPABASE_URL` | [src/lib/environment.js](src/lib/environment.js) `SUPABASE_URL` / `HEADSHOTS_URL` | The project behind storage links (headshots, logos, the website-widget embed). Unset = live's. |
| `VITE_PORTAL_URL` | [src/lib/environment.js](src/lib/environment.js) `PORTAL_URL` | This website's own address, for links a screen shows or copies (the Tax Diagnostic public link). Unset = `https://vfoportal.com`. |
| `VITE_SUPABASE_ANON_KEY` | `scripts/finish-staging-build.mjs` only | Staging's PUBLIC anon key, swapped into the staging build's files in place of live's (see below). |

**The staging build (2026-11-02).** `npm run build:staging` = `vite build --mode staging`, which reads the committed [.env.staging](../../.env.staging) (public values only: API URL, project URL, portal URL, anon key), then `scripts/finish-staging-build.mjs`. `IS_STAGING` (`import.meta.env.MODE === 'staging'`) mounts the TEST banner; in the live build it folds to `false` and the banner is left out. `npm run build` / `npm run deploy` read none of these, so the live build is unchanged.

The hardcoded **anon key** is in [src/lib/api.js:2](src/lib/api.js) — not an env var. Rotating the anon key requires editing source + redeploying. The staging build swaps live's key for staging's in `dist` (the finishing script, which then refuses to publish if any file still names live's project, key or address).

The **Sentry DSN** (frontend error monitoring, added 2026-06-18) is likewise **hardcoded** in [src/main.jsx](src/main.jsx) — *not* an env var and *not* a secret. A DSN is a public, ingest-only key (it can only send error reports to the one project, never read), safe to ship like the anon key. There is therefore nothing to add to the secret inventory above. See [sentry.md](sentry.md).

## What's hardcoded that *could* be env vars

This list is observational, not prescriptive — these values currently live in source.

| Constant | File | Value |
|---|---|---|
| `SUPERADMIN_EMAILS` (read via `isSuperadminEmail`) | `vfo-admin-api/constants/superadmin.ts` | a list since 2026-11-01 — read the file |
| CEO email | several `actions/pipeline/*.ts` + `router/webhooks.ts` | `aanderson@elitert.com` |
| Tracy reconciliation email | `actions/pipeline/contract-revshare.ts` | `tnmiller@elitert.com` |
| Tracy invoice CC | `actions/pipeline/contract-invoice-receipt.ts` | `tracy@vfo-services.com` |
| BCC list | several `actions/pipeline/*.ts` | `aanderson@elitert.com`, `platham@elitert.com` |
| `From:` for sendagreement | `actions/pipeline/contract-send-agreement.ts` | `aipc@vfo-services.com` |
| `MASTER_SHEET_ID` | `actions/pipeline/contract-revshare.ts` | `1PvUEWwTH70OBHabdHPh2SS9U7isITOzHmSd11GoHGJ0` |
| BoldSign `BrandId` | `actions/pipeline/contract-send-agreement.ts` | `f6b2e092-73a4-438e-b786-ebd20e472732` |
| Pay-page URL prefix | `actions/pipeline/contract-payment-email.ts`, `contract-stripe-checkout.ts` | `https://vfoportal.com/pay?token=...` |
| Stripe success URL | `actions/pipeline/contract-stripe-checkout.ts` | `https://www.vfo-services.com/payment-successful/` |
| GC success/cancel URLs | `actions/gc/create-checkout.ts` | `https://vfoportal.com/?gc_success=1` and `/` |
| Frontend ANON_KEY | [src/lib/api.js:2](src/lib/api.js) | (committed JWT) |
| Sentry DSN | [src/main.jsx](src/main.jsx) | (committed public ingest-only key — see [sentry.md](sentry.md)) |

> **Removed in Phase 6 mechanical:** the hardcoded debug Gmail draft ID `r-8771745882155742140` (formerly in `automation_CONTRACT_invoicereceipt`) — was a leftover dev-debug fetch that always failed for any non-debug invocation. Deleted along with the surrounding debug `console.log`s.

## Action → env vars matrix

Quick "what does this action need?" lookup:

| Action / handler | Env vars required |
|---|---|
| `admin_login`, `member_login`, `login`, plus all CRUD reads | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe webhook handler (`router/webhooks.ts::maybeHandleStripeWebhook`) | Any of `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_SANDBOX`, `ERT_STRIPE_WEBHOOK_SECRET`, `ERT_STRIPE_WEBHOOK_SECRET_SANDBOX` (**at least one** must be set; unset ones are skipped), plus whichever secret key the matched account + the row's stamp resolve to — `STRIPE_SECRET_KEY` / `_SANDBOX` and/or `ERT_STRIPE_SECRET_KEY` / `_SANDBOX`, `SUPABASE_*` |
| `automation_PCADMIN_finaldecision` (No path only) | `GMAIL_*`, `SUPABASE_*` |
| `automation_PCADMIN_pricing`, `automation_PCADMIN_extrameeting` (Yes path) | `SUPABASE_*` (then chains) |
| `automation_PCADMIN_extrameeting` (No path) | `GMAIL_*`, `SUPABASE_*` |
| `automation_PIP1_reconfirmationemail` | `GMAIL_*`, `SUPABASE_*` |
| `automation_PIPFU_decision` (Undecided/No path) | `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_sendagreement` | `BOLDSIGN_API_KEY` (or sandbox), `HTML2PDF_API_KEY`, `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_ceocountersign` | `BOLDSIGN_API_KEY` (or sandbox), `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_stripecustomer` | `STRIPE_SECRET_KEY` (or sandbox), `SUPABASE_*` |
| `automation_CONTRACT_paymentemail` | `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_loadpayment` | `SUPABASE_*` |
| `automation_CONTRACT_stripecheckout` | `STRIPE_SECRET_KEY` (or sandbox), `SUPABASE_*` |
| `automation_CONTRACT_confirmationemail` | `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_invoicereceipt` | `HTML2PDF_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID`, `GMAIL_*`, `SUPABASE_*` |
| `automation_CONTRACT_revshare` | `STRIPE_SECRET_KEY` (or sandbox), `GMAIL_*` (Sheets+Gmail), `SUPABASE_*` |
| `gc_create_checkout` | **CORRECTED 2026-09-11:** `STRIPE_SECRET_KEY` / `STRIPE_SECRET_KEY_SANDBOX` **or** `ERT_STRIPE_SECRET_KEY` / `ERT_STRIPE_SECRET_KEY_SANDBOX`, `SUPABASE_*`. Both axes come from the **`GROWTH_CREDITS`** `pipeline_sandbox_config` row (`sandbox_mode` + `stripe_account`) via `loadSandboxConfig` → `getStripeKeyFor`. The earlier "no sandbox path" claim was stale. |
| `membership_send_setup_link`, `membership_setup_checkout`, `automation_MEMBERSHIP_sweep`, `membership_terminate` | `STRIPE_SECRET_KEY` / `_SANDBOX` **or** `ERT_STRIPE_SECRET_KEY` / `_SANDBOX`, `GMAIL_*` (the two emailers), `SUPABASE_*`. **Account source differs by handler:** `send_setup_link` uses the **config** when it mints a customer and the **plan's stamp** when one already exists; the other three always use `member_payment_plans.stripe_account` (mode from `plan.sandbox`). |
| `membership_stripe_remap` | **`ERT_STRIPE_SECRET_KEY` / `ERT_STRIPE_SECRET_KEY_SANDBOX` ONLY** (mode from `plan.sandbox`), `SUPABASE_*`. **No Gmail, no bell, no charge** — it probes ERT and rewrites two columns. A missing ERT key for the plan's mode is reported per row as `error`, never a 500. |
| `automation_ADVISOR_depositemail` / `automation_ACCOUNTANT_depositemail`, `automation_<P>_stripecustomer` | `STRIPE_SECRET_KEY` / `_SANDBOX` **or** `ERT_*`, `GMAIL_*` (deposit-email only), `SUPABASE_*`. Both **reuse the row's stamp when `stripe_customer_id` exists, else the pipeline config**, and write the stamp on the minting pass. |
| `automation_<P>_stripecheckout`, `automation_<P>_chargebalance`, `automation_<P>_depositrefund` | `STRIPE_SECRET_KEY` / `_SANDBOX` **or** `ERT_*`, `SUPABASE_*`. Always `advisor_onboarding` / `accountant_onboarding` `.stripe_account`; mode from the pipeline config. |
| `specialist_revenue_payout`, `specialist_revenue_payout_sweep`, `specialist_revenue_retry_payout` (all run `utils/specialist-revenue-payout.ts`) | `STRIPE_SECRET_KEY` / `_SANDBOX` (**`vfos` only** — the specialist is charged and both legs are paid on the platform account), **`ERT_CONNECT_ACCOUNT_ID` / `_SANDBOX`** for the ERT leg's `destination`, `GMAIL_*` (member-leg emails only — the ERT leg sends none), `SUPABASE_*` |
| `manual_connect_payment_send` (Accounting → Manually sent Stripe Connect Payment, 2026-10-05) | `STRIPE_SECRET_KEY` / `_SANDBOX` (**`vfos` only** — sandbox from the "MAP 1" `pipeline_sandbox_config` row or `isTestSandboxMember`, the environment's answer; never an `ERT_*` key), `GMAIL_*` (the confirmation email, sent after the transfer — a missing token only marks `email_status`), `SUPABASE_*`. `manual_connect_payment_recipients` / `_history` need `SUPABASE_*` only. |
| `boldsign-webhook` (standalone) | `SUPABASE_*` only — chains into admin-api which carries the rest |

## Cross-references

- Per-integration deep-dives:
  - [stripe.md](stripe.md)
  - [boldsign.md](boldsign.md)
  - [gmail.md](gmail.md)
  - [google-sheets.md](google-sheets.md)
  - [google-drive.md](google-drive.md)
  - [supabase.md](supabase.md)
  - [sentry.md](sentry.md) (frontend error monitoring; DSN hardcoded, not a secret)
- Edge function structure: [../architecture/03-edge-functions.md](../architecture/03-edge-functions.md)
- Sandbox-mode mechanics: [../tables/pipeline.md#pipeline_sandbox_config](../tables/pipeline.md)
