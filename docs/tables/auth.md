# Auth tables

Session tokens and login credentials for all portals. The frontend never talks to Supabase Auth — instead it calls `vfo-admin-api` actions `admin_login` / `member_login` / `client_login` / `specialist_login` / `tax_planner_login` (the 6th, added 2026-07-22), which return a token stored in `sessionStorage` and presented on every subsequent request.

## `admin_sessions`

Stores live admin tokens. Cleaned up by the `auto_cleanup_expired_sessions` migration trigger.

| Column | Type | Notes |
|---|---|---|
| `token` | text | not null. Bearer token presented in API call body. |
| `email` | text | not null. Admin's email; joined to `allowed_admins`. |
| `expires_at` | timestamptz | not null. |
| `created_at` | timestamptz | default `now()`. |
| `login_type` | text | **Added 2026-08-20** (migration `20260820210000_add_login_type_to_admin_sessions.sql`). Nullable, CHECK `admin\|member\|client\|specialist\|tax_planner`. **The portal the session was actually minted from** — stamped by all six login actions. `middleware/auth.ts` resolves the caller's role from this column *first* (re-verified against the matching `*_logins` table; 401 rather than fall-through when that identity row is gone), so an email holding two portal identities acts as the one it logged in with. The old `allowed_admins → client → specialist → tax_planner → member` email probe survives only as the fallback for legacy NULL rows, which age out within the 8h TTL. See [../architecture/04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md) and gotcha #425. |

**Touched by:** `admin_login`, `member_login`, `login`, `client_login`, `specialist_login`, `tax_planner_login` (all six stamp `login_type`), every authenticated `vfo-admin-api` action (token validation), `update_my_passcode`.

> Despite the name, this one table holds tokens for **all six** login types — not just admins.

---

## `allowed_admins`

The admin allow-list. Passcodes are stored as a salted PBKDF2 hash in `passcode_hash` (the unsalted-SHA-256 `passcode` column was dropped 2026-05-29 — see GOTCHAS.md gotcha #47).

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `email` | text | not null |
| `name` | text | |
| `passcode_hash` | text | Salted PBKDF2-HMAC-SHA256, format `pbkdf2$sha256$<iter>$<salt>$<hash>`. (Replaced the dropped unsalted `passcode` column.) |
| `role` | text | default `'admin'`. Values seen in code: `'admin'`, `'superadmin'` (gates Admin Editor button). |
| `allowed_tabs` | text[] | not null, default `'{}'`. Added 2026-07-01. Which of the 3 "other" tabs a NON-superadmin admin may access: any of `'accounting'`, `'automation'`, `'member_overview'`. Enforced server-side (`TAB_ACTIONS`/`tabForAction` in `role-gates.ts` + gate in `middleware/auth.ts`), returned by `admin-login` → session, set by `admin_update_tabs` (Admin Editor). Superadmin ignores it (full access). See gotcha #167. |
| `member_number` | text | Optional link to `members.member_number` (admin-as-member case). |
| `created_at` | timestamptz | default `now()` |

**Status fields:** `role` controls UI gating in `AdminPortal.jsx` (`is_superadmin` checked from session); `allowed_tabs` gates the 3 "other" tabs for non-superadmin admins (gotcha #167).

**Touched by:** `admin_login`, `load_admins`, `create_admin`, `delete_admin`, `update_my_passcode`.

---

## `member_logins`

Per-member portal logins (separate from `allowed_admins`).

| Column | Type | Notes |
|---|---|---|
| `id` | integer | pk |
| `email` | text | not null |
| `name` | text | not null |
| `passcode_hash` | text | Salted PBKDF2-HMAC-SHA256, format `pbkdf2$sha256$<iter>$<salt>$<hash>`. (Replaced the dropped unsalted `passcode` column.) |
| `member_number` | text | not null. fk → `member_plugin_settings.plugin_member_number` (cascade). |
| `created_at` | timestamptz | default `now()` |

**Touched by:** `member_login`, `login` (unified), `load_member_login`, `load_my_login`, `create_member_login`, `update_member_login`.

---

## `client_logins`

The third login type (after admin/member) — per-client portal logins for the end customer. RLS enabled, **service-role only** (no policies; all access goes through edge-function handlers). The caller role `'client'` is fenced to `CLIENT_ALLOWED_ACTIONS`.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | serial pk |
| `email` | text | **UNIQUE** |
| `name` | text | |
| `passcode_hash` | text | Salted PBKDF2. |
| `client_id` | integer | fk → `clients.id` (CASCADE). |
| `created_at` | timestamptz | default `now()` |

**Touched by:** written by `submit_client_setup`; read by `client_login`.

---

## `specialist_logins`

The fourth login type (after admin/member/client) — per-specialist portal logins, each linked to an `experts` row. RLS enabled, **no policies** (service-role mediated; all access goes through edge-function handlers). The caller role `'specialist'` is fenced to `SPECIALIST_ALLOWED_ACTIONS`. Shares the `admin_sessions` token table with the other three login types. Migration: `specialist_login_and_expert_link`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | identity pk |
| `email` | text | not null. **Unique index on `lower(email)`.** |
| `name` | text | not null |
| `passcode_hash` | text | not null. Salted PBKDF2. |
| `expert_id` | bigint | not null. fk → `experts(id)` ON DELETE CASCADE. |
| `created_at` | timestamptz | default `now()` |

**Touched by:** written by `automation_SPECIALIST_submitloginsetup`; read by `specialist_login`.

---

## `tax_planner_logins`

The **fifth login type** (after admin/member/client/specialist) — per-planner portal logins, each linked to a `tax_planners` row. Added 2026-07-22 with the NEW Tax Planner portal (5th portal). RLS enabled, **deny-all** (service-role mediated). The caller role `'tax_planner'` is fenced to `TAX_PLANNER_ALLOWED_ACTIONS` + per-handler group-scope guards (gotcha #257). Shares the `admin_sessions` token table. **Full schema in [tax.md](tax.md#tax_planner_logins-added-2026-07-22)** (it lives with the tax-domain tables). Columns: `id` (bigint identity pk), `name`, `email` (not null, unique `lower(email)`), `tax_planner_id` (not null, unique, fk → `tax_planners.id` CASCADE), `passcode_hash` (salted PBKDF2), `created_at`. Migration `20260722100000_tax_planner_logins.sql`.

**Touched by:** written by `submit_login_setup` (`login_type='tax_planner'`) + `tax_planner_update_login`; read by `tax_planner_login`.

---

## `login_attempts`

Brute-force throttle ledger for all six login handlers (H1, added 2026-06-18; `tax_planner_login` added 2026-07-22) **plus, since 2026-08-10, the self-service `request_password_reset` under its own `reset:` identifier prefix**. One row per **failed** login attempt (or, for the reset path, per **request**); rows are pruned opportunistically once older than 1h (the rolling window is only 15 min). RLS enabled, **deny-all** (no policies → service-role only; only the edge function via `utils/login-throttle.ts` touches it). Migration adds indexes on `(identifier, created_at)` and `(ip, created_at)` for the windowed count queries.

| Column | Type | Notes |
|---|---|---|
| `id` | identity pk | |
| `identifier` | text | The normalized (lowercased/trimmed) login email the attempt was made against. **Since 2026-08-10 this column is a NAMESPACE, not just an email:** `request_password_reset` writes **`reset:<email>`** so self-service reset traffic is counted separately from sign-in failures (and cannot lock the same person out of signing in). Rows there are recorded on **every request**, not only on failure — the cap is 5 requests / 15 min. Any future non-login consumer of this table must take its own prefix. See gotcha **#355**. |
| `ip` | text | Source IP (first `x-forwarded-for` entry), nullable. |
| `created_at` | timestamptz | default `now()`. The window column. |

**Throttle rule:** a login is blocked (handler returns **429**) when ≥5 failures for the `identifier` OR ≥20 failures for the `ip` occurred in the last 15 minutes. `checkLoginThrottle` runs before the credential check; `recordLoginFailure` inserts on each 401; `clearLoginFailures` deletes the identifier's rows on a successful login.

**Touched by:** `admin_login`, `member_login`, `client_login`, `specialist_login`, `tax_planner_login`, `login` (all via `utils/login-throttle.ts`).

---

## `public_rate_hits` (added 2026-09-23)

Rolling-window hit log for **public (no-session) actions** — today only the VFO Tax Diagnostic's. Migration `20260923180000_tax_diagnostics.sql`; RLS enabled, **deny-all** in the same migration. **Deliberately NOT `login_attempts`**: that table's per-IP count is the login throttle, so public-form traffic there would lock a member out of logging in. Written and read only by `utils/public-rate-limit.ts hitRateLimit`, which counts the bucket + IP hash over the window, **fails closed** (a failed count or insert is treated as blocked), records a hit only when under the cap, and prunes rows older than a day on about 5% of calls.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | pk. |
| `bucket` | text | not null. `diag_search` (60 per IP per 5 min), `diag_search_all` (600 per 5 min, one global key), `diag_submit` (5 per IP per hour, recorded last — only for a submission about to land). |
| `ip_hash` | text | not null. HMAC-SHA256 (keyed by the service-role secret) of the IP the PLATFORM saw: `cf-connecting-ip`, then `x-real-ip`, then the LAST `x-forwarded-for` entry. Never the raw address. |
| `created_at` | timestamptz | not null, default `now()`. The window column. |

**Index:** `public_rate_hits_lookup_idx` (`bucket, ip_hash, created_at`).

**Touched by:** `tax_diagnostic_member_search`, `tax_diagnostic_submit` (both via `utils/public-rate-limit.ts`).

---

## Token flow

1. Client calls `admin_login` / `member_login` with `{email, passcode}`.
2. Edge function fetches the row by email, verifies the passcode against the salted `passcode_hash` (PBKDF2) via `verifyPasscode()`, inserts a row into `admin_sessions` with a generated token + **8h** expiry, returns the token.
3. Frontend stashes `{token, email, name, role, ...}` in `sessionStorage` under key `vfo_session` ([api.js:5](src/lib/api.js)).
4. Every subsequent `callApi(action, payload)` includes `token` in the request body.
5. Edge function does its own session check on each action. On 401, `callApi` clears the session and hard-redirects to `/` ([api.js:17-21](src/lib/api.js)).
