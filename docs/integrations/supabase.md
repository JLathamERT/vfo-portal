# Supabase integration

Supabase hosts the Postgres database, the two edge functions, and **20 storage buckets** (derive: `select id, public from storage.buckets;` — an older "two" here was long stale). The frontend talks to the edge function (not directly to the DB). The edge function uses the **service-role key**, which bypasses RLS — so all access control is application-level.

Project: `ejpsprsmhpufwogbmxjv` ("VFO Showroom"), region `us-east-2`, Postgres 17.

## Env vars

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | edge functions | `https://ejpsprsmhpufwogbmxjv.supabase.co`. Auto-injected by `supabase functions serve`/deploy — do NOT set in `.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | edge functions | Service-role JWT — used by both edge functions in `createClient(...)`. Bypasses RLS. Auto-injected (same as above). |
| (frontend) anon key | hardcoded in [src/lib/api.js:2](src/lib/api.js) | Sent as `Authorization: Bearer <anon>` on every regular admin/member portal request. Both functions have `verify_jwt: false` (config + registry), so Kong does not enforce this header. Public-token pages (`/decide`, `/pay`) omit the header entirely. |

The frontend never has access to the service-role key.

## Edge function deployment

| Function | Slug | `verify_jwt` (config + registry) | Source |
|---|---|---|---|
| Admin / dispatcher (modularized) | `vfo-admin-api` | `false` (matched) | `vfo-edge-functions/supabase/functions/vfo-admin-api/` (123-line `index.ts` + ~474 modular handler files under `actions/`) |
| BoldSign webhook | `boldsign-webhook` | `false` (registry); `true` (config — pre-existing mismatch, untouched) | `vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts` (95 lines) |

> Live versions increment per deploy; see Supabase Dashboard → Edge Functions for the current version of each function.

The `vfo-admin-api` config was changed from `verify_jwt = true` to `false` in commit `b9e9471` (post-v195 fix) so future deploys don't need `--no-verify-jwt`. The `boldsign-webhook` config block was NOT touched (per refactor safety rule "never touch boldsign-webhook"); if you ever redeploy that function, either pass `--no-verify-jwt` or flip the config block first. Both functions implement their own auth at the application layer (see [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md)).

### Deploy command

From `vfo-edge-functions` (or any worktree):

```powershell
cd C:\vfo-edge-functions   # or the worktree at .claude\worktrees\refactor-modularize\
supabase functions deploy vfo-admin-api
```

The deploy bundles every `.ts` and `.json` under `supabase/functions/vfo-admin-api/` (~150 files, ~173kB compressed) and uploads to project `ejpsprsmhpufwogbmxjv`. Function secrets (Stripe live + sandbox, BoldSign live + sandbox, Gmail OAuth, Drive folder, html2pdf) live on the Supabase project — they're NOT included in the bundle and they survive redeploys. Rollback via Supabase Dashboard → Edge Functions → `vfo-admin-api` → version history → revert.

Function URLs:
- `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/vfo-admin-api`
- `https://ejpsprsmhpufwogbmxjv.supabase.co/functions/v1/boldsign-webhook`

## Database

51 public-schema tables. Full inventory in [../tables/](../tables/).

### RLS

Migration `enable_rls_all_tables` (2026-04-28) enables RLS on every public-schema table. Migration `add_missing_deny_policies` (2026-04-28) adds explicit deny policies. Effective access:

- **Anon** (frontend's hardcoded key): blocked from all reads/writes (RLS deny).
- **Service role** (edge function): bypasses all RLS — full access.

Therefore: every authorization decision is enforced in the edge-function dispatcher, not the database. See [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md) for the role gates.

> **Out-of-scope for this map:** running `get_advisors` to verify RLS gaps. Migration names suggest comprehensive coverage but the `add_missing_deny_policies` migration title implies prior gaps existed.

### Migration history (15 migrations as of 2026-05-05)

```
20260427195314  create_ciq_tables
20260428202625  enable_rls_all_tables
20260428202652  lock_down_headshots_storage
20260428202920  hash_passcodes_and_cleanup_sessions
20260428203323  add_missing_deny_policies
20260428213351  auto_cleanup_expired_sessions
20260428222553  add_cascade_deletes_to_foreign_keys
20260429145002  create_member_program_notes
20260430163224  create_specialist_onboarding
20260501135928  add_widget_font_size
20260501140804  change_widget_font_size_to_integer
20260501191728  create_automation_pipeline_tables
20260504192141  create_notifications_table
20260504205804  add_extra_meeting_flag
20260505141059  create_agreement_templates_table
```

> **This list is a 2026-05-05 snapshot and is no longer complete** — many migrations have been applied since (MAP 1 reminder ladder, unique-client-id, advisor/accountant onboarding, PIP, etc.). Run the Supabase MCP `list_migrations` for the authoritative current list. Notably for auth: the `hash_passcodes_and_cleanup_sessions` unsalted-SHA-256 scheme above was **superseded on 2026-05-29** by salted PBKDF2 (`passcode_hash`) via migrations `add_passcode_hash_columns`, `passcode_drop_not_null`, and `drop_legacy_passcode_column` (the unsalted `passcode` column no longer exists).

**CORRECTED 2026-08-13 — the following was false.** `vfo-edge-functions/supabase/migrations/` **does exist** and holds ~110 git-tracked migration files. Migrations are authored as committed files **and** applied live via the Supabase MCP (`apply_migration`); every MCP-applied migration MUST also be committed in the same session (#196), or a rebuilt environment silently lacks it.

### Auto-cleanup of expired sessions

Migration `auto_cleanup_expired_sessions` (2026-04-28) presumably installs a periodic cleanup of `admin_sessions` rows past `expires_at`. The migration content was not inspected. The edge function does an *explicit* delete on a single row when it finds it expired during auth (`vfo-admin-api/middleware/auth.ts::authenticate()`) — this is a runtime fallback regardless of any scheduled job.

## Storage

**20 buckets exist** (`select id, public from storage.buckets;`). The nine with per-bucket notes are tabled below; the other eleven are listed under it. The old "Seven" on this line was wrong even for the table beneath it.

| Bucket | Visibility | Used by | Notes |
|---|---|---|---|
| `headshots` | public | `upload_headshot` | Member/specialist/tax-planner headshots (500×500 JPEG via `ImageCropModal`, 1-year cache), served via direct public URL. Backfilled 2026-07-24 (gotcha #278). |
| `member-vault` | private | `vault_list` / `vault_upload_url` / `vault_download` / `vault_delete` | **General** section of the member vault, under `<member_number>/`. Signed-URL upload (was base64 `vault_upload`, still registered but unused). |
| `member-tax-returns` | private | same `vault_*` actions, `section='sensitive'` | **Tax Documents** section of the member vault (added this session, 50 MB). |
| `specialist-tax-returns` | private | `specialist_vault_*` / `specialist_vault_admin_*`, `section='sensitive'` | **Tax Documents** section of the specialist vault (added this session). General stays in `specialist-documents`. |
| `tax-agreements` | public | `actions/tax/decision.ts` (Undecided branch) | Holds the static **Tax Planning Engagement Agreement** PDF (`tax-planning.pdf`). Fetched no-auth at email-draft time and attached as a multipart MIME part to the client's Undecided email. |
| `map1-agreements` | public | `actions/pipeline/pipfu-decision.ts` (Undecided branch) | Holds the three MAP 1 service-level agreements: `proactive-lite.pdf`, `proactive-core.pdf`, `proactive-max.pdf`. All three are attached on Undecided emails by default; the Max PDF is suppressed when `form_data.maxNA === true` (admin ticked "N/A" for Max in the PIP Follow Up form). Created 2026-05-21. |
| `advisor-onboarding-agreements` | public | `actions/advisor/decision.ts` (Undecided branch) | Holds the static **Advisor Onboarding Agreement** PDF (`Advisor_Implementation_Agreement.pdf`, uploaded 2026-06-01). Fetched no-auth at email-draft time and attached via multipart/mixed. Graceful fallback to plain HTML email if the PDF is missing. Created 2026-05-26; filename rename + made `advisor_address` required field on 2026-05-28. **Regenerated 2026-06-15 without the effective date** (matching the `[EFFECTIVE_DATE]` removal from the advisor agreement template). |
| `accountant-onboarding-agreements` | public | `actions/accountant/decision.ts` (Undecided branch) | Holds **TWO** partnership-branched PDFs (uploaded 2026-06-01): `Accountant_Implementation_Agreement_Partnership.pdf` and `Accountant_Implementation_Agreement_No_Partnership.pdf`. The handler picks one by `ob.accountant_partnership` (=== `'Accountant Partnership'` → Partnership PDF, else No-Partnership — same dropdown the Yes-path send-agreement uses to pick the BoldSign template). Same fetch-and-attach pattern + graceful fallback as advisor. Created 2026-05-28; branched 2026-06-01 (v349, gotcha #58). **Both regenerated 2026-06-15 without the effective date** (matching the `[EFFECTIVE_DATE]` removal from the accountant agreement templates). |
| `specialist-onboarding-assets` | public | `actions/onboarding/prelim-email.ts` (Stage 1 email) | Holds `onboarding-process.png` (inline image embedded in the Stage 1 + Stage 2 emails via `<img>`), `VFO-Specialist-Agreement.pdf` + `revenue_share_examples.pdf` (both attached to the Stage 1 yes/continue email). Created 2026-06-02 (gotcha #59). |

**The other eleven buckets, not tabled above** (verified against `storage.buckets` 2026-08-14):

| Bucket | Visibility | What it holds |
|---|---|---|
| `client-documents` | private | **General Documentation** section of the CLIENT vault (`vault_gen_*`) |
| `client-tax-returns` | private | **Sensitive Documents** section of the client vault (`vault_tax_*`, incl. `vault_tax_admin_upload_url`) |
| `client-ert-docs` | private | **ERT/VFOS Documentation** — admin-write / owner-read, `admin_ert_*`, locked to two admins (#387) |
| `member-ert-docs` | private | ERT/VFOS section of the MEMBER vault |
| `specialist-ert-docs` | private | ERT/VFOS section of the SPECIALIST vault |
| `specialist-documents` | private | **General** section of the specialist vault (Tax Documents live in `specialist-tax-returns` above) |
| `specialist-dd-materials` | private | Due Diligence Checklist materials in specialist onboarding |
| `tax-planner-documents` | private | Tax-planner-facing documents |
| `faq-documents` | private | FAQ PDF documents (2026-09-15) — written only via `faq_document_upload_url` signed upload urls, read only via the 1-hour signed urls `faq_load` mints; 20 MB cap |
| `presentation-templates` | private | `ROI-template-master*.pptx` — read by `tax_generate_presentation`; **TWELVE objects as of 2026-09-09** (derive the list — `supabase storage ls ss:///presentation-templates/ --experimental`; the three slashes, the trailing slash and `--experimental` are all required) — live read is **`ROI-template-master-v8.pptx`** (since v821, 31 tokens / 51 sites — the *"VFO Tax Specialists"* header widened with `wrap="none"` so it cannot wrap, and every fee row's label and value merged into ONE shape, which moved the handler's `SHIFT_EXPECTED_*` counts to 9 / 10; #480), with v7 (the v820 wording-only version whose header wrapped, rollback for v820 only) / v6 (31 tokens, the pre-v820 rollback) / v5 (22 tokens) / v4 / v3 / v2 / v1 and **FOUR** dated hot-swap backups (two from 2026-08-17, plus `…-v5-pre-trim-2026-08-19.pptx` and `…-v5-pre-agenda-2026-08-19.pptx`) retained as rollbacks. A token-free deck change (styling, **and speaker notes — but `notesSlide23.xml` now carries `{{PLANNER_NOTES}}`, so an edit there is a hot swap only while that token's `<a:r>` run stays byte-intact**) ships by replacing the same object **after uploading a dated pre-edit backup**, a token/slide-count change needs a NEW versioned name + lockstep deploy, uploaded FIRST (#336/#342). **v4 has NO content delta** — it is byte-identical to `ROI-template-master-v3-pre-shift-2026-08-17.pptx`; the new name exists because restoring slide 24's `{{INVEST_YEARS}}` header is a token-SITE addition *relative to the live v3 object*. **v5 took the versioned path for the plainest possible reason: a token in a wholly new PART** (the first outside `ppt/slides/`); its two same-day follow-ups were hot swaps on that object. **v6 is the least ambiguous versioned case yet — it both ADDS token sites (nine) and RETIRES one (`{{FEE_HALF}}`), on five slides and two notes parts**, so a hot swap was never on the table; uploaded before the v795 deploy, v5 retained. `supabase storage cp` cannot overwrite an existing key — use the Dashboard or the Storage API upsert (#409) |
| `map1-assets` | public | Static MAP 1 email/page assets |
| `vfo-widget` | public | The out-of-repo public website widget bundle (reads specialists via anon — see #201) |

### `headshots`

Member / specialist / tax-planner headshot images. RLS-locked by migration `lock_down_headshots_storage` (2026-04-28).

| Action | Where | Path scheme |
|---|---|---|
| Upload | `upload_headshot` (`vfo-admin-api/actions/specialists/upload-headshot.ts`) | `<filename>` (no folder structure) |

Public read: yes — the frontend builds URLs like `https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/<filename>` ([MemberPortal.jsx:10](src/pages/MemberPortal.jsx)). The bucket is configured as public despite the "lock_down" migration name; the migration likely restricts only WRITE not READ.

Filename is stored on `experts.headshot_image` as the bare filename (no path). The frontend URL-encodes when building the public URL.

**Image pipeline + caching (2026-07-24, gotcha #278).** Uploads route through `ImageCropModal` (fixed 500×500 JPEG q0.85, white-flattened, ~25kB — was PNG ~300kB) and save under a `.jpg` filename. `upload_headshot` sets `cacheControl: "31536000"` on `.upload()` so objects serve `Cache-Control: public, max-age=31536000` (as of v652; safe because every upload gets a fresh timestamped filename). Every headshot `<img>` on showroom/list grids is `loading="lazy" decoding="async"`. All 111 legacy objects were **backfilled in place 2026-07-24** (re-encoded ≤500px JPEG q82: 24.7MB→2.2MB, avg 20kB; 110 `image/jpeg` + 1 kept-`image/png` `20260629234146_Shay Novak.png` for real transparency). Some `.png` object names now hold JPEG bytes — Content-Type is authoritative, so never "fix" the extensions (DB `headshot_image` values reference them). The bucket shares the `supabase.co` host with the REST API; a bypass upload of large originals or a new eager (non-lazy) grid re-saturates that host and starves API calls (the portal-wide slow-load root cause fixed this session).

### `member-vault`

Per-member private file storage. Each member's files live under `<plugin_member_number>/<filename>`. Accessed only via signed URLs (1-hour expiry).

| Action | Where | Behavior |
|---|---|---|
| `vault_list` | `vfo-admin-api/actions/vault/list.ts` | Lists both sections (`member-vault` general + `member-tax-returns` sensitive) under `<member_number>/`; returns `{ sensitive, general }` (paths, no inline URL) |
| `vault_upload_url` | `vfo-admin-api/actions/vault/upload-url.ts` | Mints a signed upload URL; `section`→bucket via `memberBucketFor`; token-prefixed path |
| `vault_download` | `vfo-admin-api/actions/vault/download.ts` | 300s signed URL for one file (path prefix-checked against `member_number`) |
| `vault_delete` | `vfo-admin-api/actions/vault/delete.ts` | Deletes one file by `path` + `section` (prefix-checked) |
| `vault_upload` | `vfo-admin-api/actions/vault/upload.ts` | Legacy base64 upload to `member-vault` — still registered, no longer called by the UI |

`config.toml` sets `file_size_limit = "50MiB"` for storage globally.

### `tax-agreements` / `map1-agreements`

Both are **public buckets** holding **static PDF agreements** that an automation handler fetches at email-draft time (no Supabase auth needed) and attaches as a multipart/mixed MIME part to a Gmail draft. URL pattern: `https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/<bucket>/<filename>.pdf`.

No write path from any handler — PDFs are uploaded manually via Supabase Studio. To swap an agreement, replace the file in the bucket and the next email draft picks up the new version automatically.

## CORS

The admin-api maintains a hardcoded allowlist:

```
ALLOWED_ORIGINS = [
  "https://jlathamert.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
]
```

Set on every response. Adding a new frontend host (e.g., a custom domain) requires editing the function and redeploying.

## Migration practices

- **CORRECTED 2026-08-13:** the `vfo-edge-functions` repo **does** have a `supabase/migrations/` directory (~110 tracked files). The 15-migration list above is a 2026-05-05 snapshot, retained for history only. The 2026-08-13 FOURTH session added **8 DML-only migrations, zero DDL**.
- The `vfo-react` repo has no migrations of its own.
- New schema changes must be tracked via the remote migration registry (visible via the MCP `list_migrations` call).

> **Local-dev migration baseline:** the `refactor/vfo-admin-api-modularize` worktree at `vfo-edge-functions/.claude/worktrees/refactor-modularize/` populates `supabase/migrations/` with a baseline `pg_dump` of the live `public` schema (`20260507000000_baseline_remote_schema.sql`, 82 schema objects). This is for **localhost-only testing** during refactor work — the migration was never deployed to production. The refactor itself completed and was deployed as v196 on 2026-05-08; see [03-edge-functions.md](../architecture/03-edge-functions.md) for the new file layout.

## Frontend storage usage (browser)

The frontend uses **`sessionStorage` only**, never `localStorage`. Keys:

| Key | Set by | Cleared by |
|---|---|---|
| `vfo_session` | login pages | `clearSession()` (sign-out, 401) |
| `adminActiveTab`, `adminMembersSection`, `adminSpecialistsSection`, `adminAutomationSection`, `adminSelectedMember`, `adminMemberFeatureTab` | AdminPortal | login pages reset some; `sessionStorage.clear()` on ClientDetail signout |
| `memberActiveTab` | MemberPortal | MemberLogin resets |

`sessionStorage` clears on tab close. There is no "remember me" — every tab close = login again.

## Frontend `Authorization` header

Set on `callApi` requests as `Bearer <hardcoded anon key>` — see [04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md). Public-token pages (`/decide`, `/pay`) omit the header entirely; the function accepts the unauthenticated POST because `verify_jwt: false`.

## Cross-references

- Auth model: [../architecture/04-auth-and-sessions.md](../architecture/04-auth-and-sessions.md)
- Edge functions: [../architecture/03-edge-functions.md](../architecture/03-edge-functions.md)
- Action catalog: [../architecture/05-api-action-catalog.md](../architecture/05-api-action-catalog.md)
- Tables index: [../tables/README.md](../tables/README.md)
