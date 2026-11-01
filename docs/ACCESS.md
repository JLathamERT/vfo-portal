# VFO ACCESS — where every login and key lives

> **This file never holds a password, key or token — only WHERE each one is.** Not in this repo, not in a commit, not in a chat ([TEAM_RULES.md](TEAM_RULES.md) §2). A secret pasted anywhere in git stays in its history forever, and every Claude chat can read every file in these folders.

## The three places

1. **Your own login** — every service that has team seats gets each person their own invite, never a shared login. Losing a person then means removing one seat, not changing a shared password.
2. **The team Bitwarden vault** (organization *VFO*) — logins that only exist once and are shared, plus test-account passwords. Install the Bitwarden browser extension; it can sit beside a personal password manager.
3. **Supabase → Edge Functions → Secrets** (project `ejpsprsmhpufwogbmxjv`) — the backend's API keys. Nobody needs these values on their own computer; the names and what reads each are in [integrations/env-vars.md](integrations/env-vars.md).

## Services

| Service | Used for | How a new person gets in | Bitwarden item |
|---|---|---|---|
| GitHub (`JLathamERT/vfo-portal`, `JLathamERT/vfo-edge-functions`) | code, PRs, tags, the live website (GitHub Pages) | collaborator invite on both repos | — |
| Supabase (project "VFO Showroom") | database, backend functions, secrets, SQL | organization invite as Developer | — |
| VFO portal (https://vfoportal.com/) | the admin portal itself | own admin login (TEAM table email) | — |
| Stripe — ERT account | membership, Growth Credits, onboarding payments | team member invite | to add |
| Stripe — VFO Services account | MAP 1, Tax, PFT, specialist payments | team member invite | to add |
| BoldSign | agreements and signatures | to decide | to add |
| Gmail (the account the portal drafts emails from) | email drafts and sends | to decide | to add |
| Google Drive / Sheets | client folders, invoice + receipt PDFs | to decide | to add |
| Sentry | frontend error reports | team invite | — |
| html2pdf | PDF rendering | to decide | to add |
| Test accounts (tax-planner test logins, test member / client logins) | testing | — | to add |

"to decide" / "to add" — filled in when the vault is set up; update this table in the same PR.
