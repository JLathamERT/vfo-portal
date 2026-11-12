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
cd C:\vfo-edge-functions   # or the session's worktree
# 1. Docker Desktop must be running.
# 2. Delete any local lockfile `deno check` left behind (gotcha #74/#112):
Remove-Item supabase\functions\vfo-admin-api\deno.lock -ErrorAction SilentlyContinue
# 3. Bundle locally:
supabase functions deploy vfo-admin-api --project-ref ejpsprsmhpufwogbmxjv --use-docker
```

**Since 2026-10-02 `--use-docker` is mandatory for `vfo-admin-api` (gotcha #574).** A plain deploy and `--use-api` both upload the raw source graph to Supabase's server-side bundler, which caps it at **5 MB** — the function crossed that on 2026-10-02 (~684 files, ~4.57 MB) and both fail with `413 Function source code exceeds the maximum deployment size (5 MB)`. Local bundling has a 20 MB cap on the bundled output (~2.04 MB). Splitting the function would remove the dependency on Docker but is medium-to-high risk (the frontend, the Stripe webhook endpoint, pg_cron jobs and HTTP chains all call `vfo-admin-api` by name) and has not been done. `boldsign-webhook` is unaffected.

The deploy bundles every `.ts` and `.json` under `supabase/functions/vfo-admin-api/` and uploads to project `ejpsprsmhpufwogbmxjv`. Function secrets (Stripe live + sandbox, BoldSign live + sandbox, Gmail OAuth, Drive folder, html2pdf) live on the Supabase project — they're NOT included in the bundle and they survive redeploys. Rollback via Supabase Dashboard → Edge Functions → `vfo-admin-api` → version history → revert.

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
| `headshots` | public | `upload_headshot`, `member_self_profile_save`, `member_branding_save`, `tax_planning_group_logo_save`; read by `tax_generate_presentation` | Member/specialist/tax-planner headshots (500×500 JPEG via `ImageCropModal`, 1-year cache), served via direct public URL. Backfilled 2026-07-24 (gotcha #278). **Also holds the ROI-deck logos (2026-09-24):** `logo_member_<num>_<ts>.png` (`members.logo_image`) and `logo_group_<id>_<ts>.png` (`tax_planning_groups.logo_image`) — see the `headshots` section below. |
| `member-vault` | private | `vault_list` / `vault_upload_url` / `vault_download` / `vault_delete` | **General** section of the member vault, under `<member_number>/`. Signed-URL upload (was base64 `vault_upload`, still registered but unused). |
| `member-tax-returns` | private | same `vault_*` actions, `section='sensitive'` | **Tax Documents** section of the member vault (added this session, 50 MB). |
| `specialist-tax-returns` | private | `specialist_vault_*` / `specialist_vault_admin_*`, `section='sensitive'` | **Tax Documents** section of the specialist vault (added this session). General stays in `specialist-documents`. |
| `specialist-showroom-docs` | private | `specialist_vault_*` / `specialist_vault_admin_*` / `vault_move_document`, `section='showroom'` (each write 400s without `acknowledge_public: true`); `automation_SPECIALIST_createspecialist` (go-live copy of the `licenses` / `case_studies` / `sample_materials` DDC slots); read by `showroom_vault_list` / `showroom_vault_download` | **Showroom Documents** section of the specialist vault (2026-10-05, migration `20261005140000_specialist_showroom_docs_bucket.sql`, no size limit), `<expert_id>/<16hex>_<name>`. The ONE vault section members and admins can open from the showroom — through the showroom card's **Vault** dropdown (not clients, specialists or tax planners: both read actions are absent from their allowlists, 403), 300 s signed URLs, Active specialists only. Private like its siblings: no anon reads. Never a `/vault-upload` target (`VAULT_REQUEST_BUCKETS` omits it). Constants in `utils/specialist-showroom-docs.ts`. |
| `tax-agreements` | public | `actions/tax/decision.ts` (Undecided branch) | Holds the four static **Tax Planning Engagement Agreement** sample PDFs — `tax-planning.pdf`, `tax-planning-member.pdf`, `tax-planning-3pay.pdf`, `tax-planning-member-3pay.pdf` — rendered from `agreement_templates` rows 25–28 — **plus, since 2026-09-28, their `-pre-benefits` twins** (`tax-planning-pre-benefits.pdf`, `tax-planning-member-pre-benefits.pdf`, `tax-planning-3pay-pre-benefits.pdf`, `tax-planning-member-3pay-pre-benefits.pdf`, from rows 29–32). **All eight re-made 2026-10-14** with `agreement_pdf_draft` after the Step 4 / Step 6 wording change (raw templates, placeholders visible) and uploaded by Jake; verified from the public URLs (4 pages each, new wording, right variant per file). A wording change to rows 25–32 is not finished until these eight are re-made ([integrations/boldsign.md](boldsign.md)). *(v: 2026-10-14)* Fetched no-auth at email-draft time and attached as a multipart MIME part to the client's Undecided email and the Rapid Route email; `samplePdfCandidates()` in `decision.ts` picks the `-pre-benefits` set while the `portal_licensing` feature switch is off for the client's member, the original four while on, and never mixes the two. |
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
| `presentation-templates` | private | The deck masters, read BY NAME (#342): **`ROI-template-master-v12.pptx`** (TPOM, `tax_generate_presentation`), **`ROI-rapid-master-v1.pptx`** (the same action on a Rapid Route plan) and **`ROI-bookends-master-v5.pptx`** (`tax_generate_bookends`), plus ONE rollback each: `ROI-template-master-v11.pptx` and `ROI-bookends-master-v4.pptx` (the Rapid master has none). Everything older — v1–v10, book-ends v1–v3 and the dated hot-swap backups — was deleted 2026-11-12 on Jake's word (CHANGELOG 2026-11-12). Built by `scripts/roi-presentation/` in the edge repo (`make_v12.py`, `make_rapid_v1.py`, `make_bookends_v5.py`; that folder's README). Derive the list, never count it here: `supabase storage ls ss:///presentation-templates/ --experimental` (the three slashes, the trailing slash and `--experimental` are all required). A change to a token, a part the handler names, the slide list or a shape the surgeries measure ships as a NEW versioned name uploaded BEFORE the deploy that names it; a token-free change can replace the same object after a dated backup — `supabase storage cp` cannot overwrite (409 `KeyAlreadyExists`), so use `storage rm` then `storage cp` (the object is absent for seconds and a generate then fails cleanly), the Dashboard, or the Storage API upsert (#409) |
| `map1-assets` | public | Static MAP 1 email/page assets |
| `vfo-widget` | public | The out-of-repo public website widget bundle (reads specialists via anon — see #201) |

### `headshots`

Member / specialist / tax-planner headshot images. RLS-locked by migration `lock_down_headshots_storage` (2026-04-28).

| Action | Where | Path scheme |
|---|---|---|
| Upload | `upload_headshot` (`vfo-admin-api/actions/specialists/upload-headshot.ts`) | `<filename>` (no folder structure) |
| Upload (member's own headshot) | `member_self_profile_save` (`actions/members/self-profile-save.ts`) | `<ts>_member_<num>.jpg` (JPEG from the crop modal, ≤ 1.5 MB) |
| Upload / remove (member logo) | `member_branding_save` (`actions/members/branding-save.ts`) | `logo_member_<num>_<ts>.png` → `members.logo_image`; best-effort deletes the replaced `logo_member_` file |
| Upload / remove (group logo) | `tax_planning_group_logo_save` (`actions/tax-planners/group-logo-save.ts`) | `logo_group_<id>_<ts>.png` → `tax_planning_groups.logo_image`; best-effort deletes the replaced `logo_group_` file |
| Read (logos) | `tax_generate_presentation` (service role) | swaps the two logos into the ROI deck — [flows/tax-planning.md](../flows/tax-planning.md) |

**Logos (2026-09-24).** Server-named PNGs, all `cacheControl: "31536000"`, validated by `utils/logo-png.ts` (PNG magic, IHDR exactly **1200×400**, ≤ **1 MB**) on upload AND again when the deck reads them. The browser produces them (`src/components/shared/logoPng.js`, white rounded badge baked in; PNG/JPG/WebP accepted, SVG deliberately not). The delete-on-replace only ever touches its own prefix, so a headshot sharing the bucket is never removed.

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

The admin-api maintains a hardcoded allowlist (`constants/allowed-origins.ts`):

```
ALLOWED_ORIGINS = [
  "https://vfoportal.com",
  "https://www.vfoportal.com",
  "https://jlathamert.github.io",
  "http://localhost:5173" … "http://localhost:5176",
  ...(isLiveProject() ? [] : ["https://staging.vfoportal.com"]),
]
```

Set on every response. Adding a new frontend host requires editing the function and redeploying. **The staging website is accepted by the staging backend only** — live never lists it (2026-11-02). The dev server talks to the test site, so a dev server on a port above 5176 gets refused by CORS: stop a leftover one (`scripts/dev-servers.ps1`).

## The staging project (2026-11-02)

A second project, **"VFO Staging"** (`yxolcioazczlhruprmrb`, us-east-2, $10/month), runs the same `vfo-admin-api` for staging.vfoportal.com. Plan of record and every setup step: [plans/staging/README.md](../plans/staging/README.md).
- **Structure:** a schema-only copy of live, fingerprint-identical. The settings tables (email templates, switches, sandbox config, …) are copied from live. There are no real people, and its `allowed_admins` starts empty. Sequences start at 100000.
- **Deploys:** every checkout's CLI link (`supabase/.temp/project-ref`) is LIVE, so every staging command names `--project-ref yxolcioazczlhruprmrb`. Deploying still needs the person's "deploy".
- **Crons:** the same 19 jobs, installed from `supabase/cron/staging-install.sql`. Each reads its key at run time from staging's Vault (`cron_api_key` = staging's `sb_secret_…` key, #715), never inline. **Live's have the same shape since 2026-11-04**, from `live-install.sql`, with `live-check.sql` to prove them and `live-rollback.sql` as the way back while the Vault backup exists (#737).
- **Until S6/S7:** every live migration, template change or switch flip is applied to staging too, and staging is redeployed from main after each live release.

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
