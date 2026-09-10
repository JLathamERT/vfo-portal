# Environment variable inventory

Complete list of secrets and config-vars referenced by the edge functions, with which actions/integrations consume each. No `.env` files are committed; production values live in Supabase function secrets, local-dev values live in the gitignored `vfo-edge-functions/supabase/.env.local` (a populated copy of `.env.local.template`).

> **Integration helpers** (Phase 3 scaffolding) — `getStripeKey(isSandbox)` in `vfo-admin-api/integrations/stripe/client.ts`, `getBoldSignKey(isSandbox)` in `vfo-admin-api/integrations/boldsign/client.ts`, `getGoogleAccessToken()` in `vfo-admin-api/integrations/google/oauth.ts`, `loadSandboxConfig(supabase, pipelineName)` in `vfo-admin-api/integrations/sandbox-config.ts`. Phase 4 handlers were extracted byte-equivalently — most still call `Deno.env.get(...)` and `fetch(...)` directly; only `gc_create_checkout` adopted the Stripe helper. Adopting the rest is optional polish, not a refactor requirement.

> **`verify_jwt` setting** — both functions have `verify_jwt = false` in `vfo-edge-functions/supabase/config.toml` AND in the live registry (matched). Public-token endpoints (`/decide`, `/pay`) require this so Kong gateway doesn't 401 their headerless requests. Application-level auth still happens via `middleware/auth.ts::authenticate()`. The config setting matches reality, so plain `supabase functions deploy` Just Works (no `--no-verify-jwt` needed).

## Edge-function env vars

Confirmed via `Deno.env.get(...)` audit of `vfo-admin-api/index.ts` and `boldsign-webhook/index.ts`.

### Supabase

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | both edge functions | Project URL — `https://ejpsprsmhpufwogbmxjv.supabase.co`. Used to construct chain-call URLs and as the `createClient` arg. |
| `SUPABASE_SERVICE_ROLE_KEY` | both edge functions | Service-role JWT for `createClient`. Bypasses RLS. Also presented as `Authorization: Bearer ...` on server-to-server chain calls. |

### Stripe

| Var | Required by | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `automation_CONTRACT_stripecustomer`, `automation_CONTRACT_stripecheckout`, `automation_CONTRACT_revshare`, Stripe webhook handler, `gc_create_checkout` | Live mode |
| `STRIPE_SECRET_KEY_SANDBOX` | same as above except `gc_create_checkout` | Test-mode key. Selected when `pipeline_sandbox_config.sandbox_mode=true` for `MAP 1`. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification (`router/webhooks.ts::maybeHandleStripeWebhook`) — live secret | Stripe issues separate signing secrets per mode. The handler tries this first when verifying. |
| `STRIPE_WEBHOOK_SECRET_SANDBOX` | Same handler — sandbox/test-mode secret | Handler also tries this; either secret can validate an incoming webhook so live and sandbox Stripe accounts can deliver to the same function URL. |

> **Note:** `automation_CONTRACT_stripewebhook` was removed in Phase 6 mechanical (was doubly-dead code). It no longer reads any env vars.

> **Note:** `gc_create_checkout` only reads `STRIPE_SECRET_KEY` — no sandbox path for GC purchases.

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
| `GMAIL_REFRESH_TOKEN` | same | Long-lived refresh token. Single token; granted scopes must cover `gmail.compose`, `spreadsheets.readonly`, and `drive` (or sub-scope). Scope detail not in repo. |
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
| `VITE_API_URL` | [src/lib/api.js:1](src/lib/api.js), [src/pages/PayPage.jsx:4](src/pages/PayPage.jsx), [src/pages/DecidePage.jsx:4](src/pages/DecidePage.jsx) | Override for the edge function URL. Falls back to hardcoded `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api`. Production behavior unchanged when unset. |

> **Resolved inconsistency.** Previously only DecidePage honored `VITE_API_URL`; api.js and PayPage hardcoded the prod URL. As of `test/frontend-vs-local-function` branch (commit `3bf0963`), all three honor the env var.

The hardcoded **anon key** is in [src/lib/api.js:2](src/lib/api.js) — not an env var. Rotating the anon key requires editing source + redeploying.

The **Sentry DSN** (frontend error monitoring, added 2026-06-18) is likewise **hardcoded** in [src/main.jsx](src/main.jsx) — *not* an env var and *not* a secret. A DSN is a public, ingest-only key (it can only send error reports to the one project, never read), safe to ship like the anon key. There is therefore nothing to add to the secret inventory above. See [sentry.md](sentry.md).

## What's hardcoded that *could* be env vars

This list is observational, not prescriptive — these values currently live in source.

| Constant | File | Value |
|---|---|---|
| `SUPERADMIN_EMAIL` | `vfo-admin-api/constants/superadmin.ts` | `jlatham@elitert.com` |
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
| Stripe webhook handler (`router/webhooks.ts::maybeHandleStripeWebhook`) | `STRIPE_WEBHOOK_SECRET` and/or `STRIPE_WEBHOOK_SECRET_SANDBOX` (at least one must be set), `STRIPE_SECRET_KEY` (or sandbox), `SUPABASE_*` |
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
| `gc_create_checkout` | `STRIPE_SECRET_KEY` (no sandbox), `SUPABASE_*` |
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
