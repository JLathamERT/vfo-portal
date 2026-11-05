# VFO ACCESS — where every login and key lives

> **This file never holds a password, key or token — only WHERE each one is.** Not in this repo, not in a commit, not in a chat ([TEAM_RULES.md](TEAM_RULES.md) §2). A secret pasted anywhere in git stays in its history forever, and every Claude chat can read every file in these folders.

## The three places

1. **Your own login** — every service that has team seats gets each person their own invite, never a shared login. Losing a person then means removing one seat, not changing a shared password.
2. **Jake's Bitwarden vault** (organization *VFO*) — logins that only exist once and are shared, plus test-account passwords. Paxton isn't in the vault (Jake 2026-11-04): Jake tells him the ones he needs out loud on a call, never in writing.
3. **Supabase → Edge Functions → Secrets** (project `ejpsprsmhpufwogbmxjv`) — the backend's API keys. Nobody needs these values on their own computer; the names and what reads each are in [integrations/env-vars.md](integrations/env-vars.md). The scheduled jobs' copy of the default secret key is the Vault secret `cron_api_key`, one on each project, typed in by Jake. If that key is ever rotated, update the secret straight away: a wrong value makes every job answer 401 with nothing showing as failed (GOTCHAS #737).

## Services

| Service | Used for | How a new person gets in | Bitwarden item |
|---|---|---|---|
| GitHub (`JLathamERT/vfo-portal`, `JLathamERT/vfo-edge-functions`) | code, PRs, tags, the live website (GitHub Pages) | collaborator invite on both repos | — |
| Supabase (project "VFO Showroom") | database, backend functions, secrets, SQL | organization invite as Developer | — |
| VFO portal (https://vfoportal.com/) | the admin portal itself | own admin login (TEAM table email) | — |
| Stripe — ERT account | membership, Growth Credits, onboarding payments | team member invite | to add |
| Stripe — VFO Services account | MAP 1, Tax, PFT, specialist payments | team member invite | to add |
| BoldSign | agreements and signatures | to decide | to add |
| Gmail (the account the portal drafts emails from: `aipc@vfo-services.com`) | email drafts and sends | to decide | to add |
| Google Drive / Sheets | client folders, invoice + receipt PDFs | to decide | to add |
| Sentry | frontend error reports | team invite | — |
| html2pdf | PDF rendering | to decide | to add |
| Test accounts (the test site's planner, team member, member and client logins) | testing, on the test site only | — | to add |
| **STAGING** — GitHub `JLathamERT/vfo-portal-staging` (public) | the staging website, published by `npm run deploy:staging` to its `gh-pages`; GitHub Pages serves it at https://staging.vfoportal.com/ (GoDaddy CNAME `staging` → `jlathamert.github.io`) | collaborator invite | — |
| **STAGING** — Supabase project "VFO Staging" (`yxolcioazczlhruprmrb`) | the staging backend, database and secrets | same organization as live | — |
| **STAGING** — portal login at https://staging.vfoportal.com/admin | the staging admin portal | a superadmin adds you in staging's Admin Editor (no set-up email) | — |
| **STAGING** — Google user `staging@vfo-services.com` ("VFO Staging") | staging's mailbox (every staging email lands here) and its Drive; recovery address Jake's ERT email | Google Workspace admin (Jena) | VFO Staging Google |
| **STAGING** — Google Cloud project "VFO Staging" + OAuth client "VFO Staging portal" | the client ID / secret / refresh token in staging's `GMAIL_*` secrets | signed in as `staging@` | VFO Staging Google app |

"to decide" / "to add" — filled in when the vault is set up; update this table in the same PR.

## Deploy keys

The deploy button's keys sit in GitHub secrets, which nobody can read back: not here, not in Bitwarden, not on a laptop. Every chat checks these dates at start and warns 30 days ahead ([prompts/SESSION_STARTER.md](prompts/SESSION_STARTER.md)).

| Key | GitHub secret, in which repo | What it can do | Expires | When it runs out |
|---|---|---|---|---|
| Supabase token `github-deploy-staging` | `SUPABASE_TOKEN_STAGING`, `vfo-edge-functions` | Edge Functions read-write on VFO Staging only (refused on live and on SQL, tested 2026-11-04) | 2027-11-01 | The test site's backend stops updating. Live is not affected |
| GitHub token `deploy-staging-website` | `STAGING_SITE_TOKEN`, `vfo-portal` | Contents read-write on `vfo-portal-staging` only | 2027-11-01 | The test site's website stops updating. Live is not affected |
| Supabase token `github-deploy-live` | `SUPABASE_TOKEN_LIVE`, `vfo-edge-functions` | Edge Functions read-write on VFO Showroom only | 2027-11-01 | The backend button can't release |

**To replace one (Jake, one step at a time):** make the new key with the same name and access at https://supabase.com/dashboard/account/tokens (use Generate token, not the legacy one) or https://github.com/settings/personal-access-tokens/new, expiring as late as allowed (a year at most). Then run `gh secret set <secret name> --repo JLathamERT/<repo>` and paste it at the prompt. Update the date above in a PR, and delete the old key.
