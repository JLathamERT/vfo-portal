# Orchestration files

The "biggest brains" of the codebase — files that own a feature area or coordinate many actions. Sized by where logic concentrates, not LOC alone. Read this file to know *where to look first* for any given feature.

> Read-only summary: this doc states what each file does, not what it should do.

## Tier 1 — System edges (every request goes through these)

| File | Size | Owns |
|---|---|---|
| `vfo-admin-api/index.ts` (slim orchestrator) | ~120 lines | **Request entry point.** OPTIONS, CORS closure, method gate, calls `router/webhooks.ts` (Stripe + BoldSign by shape), a 2MB body-size cap (413) + 400-on-bad-JSON guard + `x-forwarded-for` client-IP extraction, inline login dispatches (each rate-limited via `login-throttle.ts`), then `PUBLIC_HANDLERS` → auth gate → `AUTH_HANDLERS`. See [03-edge-functions.md](03-edge-functions.md). |
| `vfo-admin-api/router/dispatch.ts` | ~700 lines | The two action-dispatch tables: `PUBLIC_HANDLERS` (**132 entries**) + `AUTH_HANDLERS` (**323 entries**) = 455 dispatched, +6 logins in `index.ts` = the **461** live count. _(Counts re-verified 2026-08-04 by counting `(c) =>` inside each table block; they had gone stale by 6 since the 2026-07-30 re-count — re-count, never trust this line. The PUBLIC side gained `vault_tax_upload_context` on 2026-08-04, gotcha #331.)_ Each entry adapts a handler from `actions/<group>/<file>.ts` to a uniform ctx-based signature. (2026-06-16: 6 Tax actions moved PUBLIC→AUTH; +3 Phase D card-change regs — `payments_send_card_update` AUTH/superadmin, `payments_loadcardupdate` + `payments_cardupdate_checkout` PUBLIC.) |
| `vfo-admin-api/router/webhooks.ts` | ~900 lines | Two webhook handlers: `maybeHandleStripeWebhook` (header-shape detection, HMAC verify, GC + MAP1 + Tax + Advisor + PIP + Accountant cascade with chains to confirmation/invoicereceipt at each level; Specialist-license `invoice.*` subscription blocks; the failure-event fan-out to Jake; and the **Phase D setup-mode branch** — `checkout.session.completed` where `mode=setup` + `metadata.payment_kind=card_update` reads the SetupIntent and saves the new method as the engagement default, the system's only SetupIntent handling) and `maybeHandleBoldSignWebhook` (body-shape detection, MAP1 → Tax → Advisor → Accountant cascade — chains in Tax/Advisor/Accountant branches). |
| `vfo-admin-api/middleware/auth.ts` | ~130 lines | The token gate. `authenticate(action, body, supabase, json)` validates `body.token` against `admin_sessions`, then applies (in order) the client + specialist deny-by-default gates, the `SUPERADMIN_ONLY_ACTIONS` gate (NEW 2026-06-16 — Jake-only, 14 actions: 12 Automation-panel + the global Payments page `all_payments_load` + the Phase D card-change send `payments_send_card_update`), `ADMIN_ONLY_ACTIONS`, and `MEMBER_SCOPED_ACTIONS` from `constants/role-gates.ts`. |
| `vfo-admin-api/actions/<group>/*.ts` | ~300 files | One file per action handler. Groups: `auth/`, `data/`, `client-notes/`, `member-program-notes/`, `email-templates/`, `notifications/`, `admins/`, `member-logins/`, `vault/`, `members/`, `specialists/`, `gc/`, `coaching/`, `tax/` (~28 files), `ciq/`, `onboarding/`, `msm/` (~45 files incl. PIP), `pipeline/` (17 files), `regular/`, `pft/`, `advisor/` (22 files incl. `save-team-member.ts`), `accountant/` (23 files incl. `save-partnership.ts` + `save-team-member.ts`), `payments/` (Payments-tab read aggregators `{member,client,specialist}-payments-load.ts` + `all-payments-load.ts` + shared `normalize.ts`, plus the **Phase D** admin card/bank-change trio `card-update-send.ts` / `card-update-load.ts` / `card-update-checkout.ts` over shared `card-update-shared.ts`, added 2026-06-16). |
| `vfo-admin-api/utils/`, `constants/`, `types/`, `integrations/` | **49 files in `utils/`** + constants + types + integrations (v: 2026-08-17 — `ls` it, never trust this number) | Shared helpers: `cors.ts`, `crypto.ts`, `format-date.ts`, `html-templates.ts`, `json.ts`, `pf-emails.ts`, `member-number.ts` (category-relative `nextMemberNumber`), `new-model-sale-email.ts` (`sendNewModelSaleEmail` — internal "New Model Sale" team draft on advisor/accountant create), `client-ownership.ts` (C2 `denyIfNotOwnClient` / `denyIfNotOwnEnrollment` member→resource guards, added 2026-06-18), `login-throttle.ts` (H1 `checkLoginThrottle` / `recordLoginFailure` / `clearLoginFailures` over the `login_attempts` table, added 2026-06-18), `tax-plan-steps.ts` (the shared tax step machine — `buildTaxPlanSteps` / `taxPlanStepsComplete`, extracted verbatim from `actions/clients/overview-tax.ts` on 2026-08-17 so the planner portal reuses it rather than mirroring it), role-gate arrays, `constants/onboarding-team.ts` (`teamMemberRecipient` — onboarding team-member name → @elitert login for notification routing), `JsonResponder` / `AuthContext` / ctx types, integration scaffolding for Stripe/BoldSign/Google. |
| `vfo-edge-functions/supabase/functions/boldsign-webhook/index.ts` | ~220 lines | Standalone BoldSign webhook receiver. Updates `pipeline_map1` / `client_tax_plans` / `advisor_onboarding` / `accountant_onboarding` by 4-level cascade. Chains `automation_*_ceocountersign` + `automation_*_stripecustomer` for tax, advisor, and accountant branches. MUST deploy with `--no-verify-jwt`. |
| [src/lib/api.js](src/lib/api.js) | 113 lines | The **only** module that talks to the edge function. Exports: `callApi`, `getSession`, `setSession`, `clearSession`, plus a module-level promise cache (`loadCachedData`, `loadCachedAction`, `clearCachedData`, `clearActionCache`) for idempotent read actions. `callApi` enforces a **two-tier** fetch timeout via `AbortController` (`timeoutFor(action)`): **60s (`SLOW_WRITE_TIMEOUT_MS`) for `automation_*` WRITE actions**, **20s (`REQUEST_TIMEOUT_MS`) for reads and everything else** — the long tier exists because an aborted write does NOT stop the edge function, so a false timeout on a long automation chain invites a manual resubmit that double-sends (gotcha #319). Reads matching `^load_\|_load(_\|$)` (or the explicit `vault_list`) auto-retry once on timeout, writes never retry on timeout to avoid double-writes (#30, unchanged). **⚠️ The long tier is selected by the action NAME, so a long-running write that is not called `automation_*` gets the 20 s tier regardless of how much work it does** — `membership_stripe_remap` proved it on 2026-09-11 (37 rows × 2-3 Stripe probes timed out the first Dry run; the handler finished anyway and the re-run was safe only because every outcome is idempotent). Check the tier when you add a bulk action (gotcha **#487**). Honors `import.meta.env.VITE_API_URL` for local-dev (production fallback unchanged). **⚠️ A `401` bounces the user to the login page; a `403` does NOT — the rejected promise falls through to each caller's own catch-to-empty-state (gotcha #426). `api.js` itself is unchanged — the fix landed in the shells: **`MemberPortal` / `AdminPortal` / `ClientPortal` / `SpecialistPortal` now hold a `loadError` state and render a red startup-failure banner** ("We couldn't load your portal" + the server message), so a denial on the bootstrap load is no longer a silent blank tab. Any *other* surface still fails silently. When a surface is blank and the data provably exists, check `function_edge_logs` for 403s before suspecting the query or the fixture.** |
| [src/App.jsx](src/App.jsx) | 26 lines | Route table. 8 routes + catch-all. |

## Tier 2 — Top-level pages (one mounts at a time per route)

| File | Size | Routes that mount it | Owns |
|---|---|---|---|
| [src/pages/AdminPortal.jsx](src/pages/AdminPortal.jsx) | 281 lines | `/admin` | Admin shell: 3-dropdown nav, `load_data` bootstrap, panel routing, NotificationBell, modal overlays for AdminEditor + AdminSettings. State persisted in `sessionStorage`. |
| [src/pages/MemberPortal.jsx](src/pages/MemberPortal.jsx) | 349 lines (incl. inline subcomponents) | `/member` | Member shell: dynamic tab list driven by `member_program_enabled` + 3 inline subcomponents (`MemberSpecialists`, `MemberProfile`, `MemberSettings`). Hardcoded program-name → tab-key map at line 59. |
| [src/pages/ClientDetail.jsx](src/pages/ClientDetail.jsx) | 384 lines | `/admin/client/:clientId` & `/member/client/:clientId` | **Dual-mode page.** The `isMember = pathname.startsWith('/member')` flag at line 55 cascades as `readOnly`. Tab set branches on `program?.name` (PFT vs Tax vs MAP1+Regular+Tax). Inline `ClientHome` (status + PF + notes) and `ClientDetails` (edit + contacts). |
| [src/pages/AdminLogin.jsx](src/pages/AdminLogin.jsx), [src/pages/MemberLogin.jsx](src/pages/MemberLogin.jsx) | ~46 each | `/admin/login`, `/member/login` | Tiny login forms. See [04-auth-and-sessions.md](04-auth-and-sessions.md). |
| [src/pages/DecidePage.jsx](src/pages/DecidePage.jsx) | 166 lines | `/decide?token=...` | Token-link page for `automation_PCADMIN_finaldecision`. Raw `fetch` (no session). |
| [src/pages/PayPage.jsx](src/pages/PayPage.jsx) | 289 lines | `/pay?token=...` | Token-link page → loads payment data → user picks ACH/Card → Stripe Checkout redirect. |
| [src/pages/RolePicker.jsx](src/pages/RolePicker.jsx) | 15 lines | `/` | Two buttons. |

## Tier 3 — Feature panels (mounted by a Tier-2 page)

These are the components where most of the per-feature logic and `callApi` calls concentrate. Listed here in approximate descending complexity.

### Largest by feature surface

| File | Size | Mounted by | Owns |
|---|---|---|---|
| [src/components/shared/MemberCIQ.jsx](src/components/shared/MemberCIQ.jsx) | ~115KB | MemberPortal `ciq` tab | Whole CIQ flow — settings, list, draft, save answers, complete, priorities, snapshots, + One Page Plan "Update Progress" (per-priority status + Completed section). ~15 distinct callApi actions. Used by both admin (via MembersPanel → "CIQ" feature tab) and member (via the CIQ portal tab); the `isAdmin` prop differentiates. Members always see the tab; `ciq_enabled` gates only *starting* new CIQs. |
| [src/components/admin/MSMTracking.jsx](src/components/admin/MSMTracking.jsx) | 90KB | _Not mounted from AdminPortal directly._ Imported by [MembersPanel.jsx](src/components/admin/MembersPanel.jsx) as the per-member feature tab "MSM Tracking." | The admin-side per-member view of programs/enrollments/training-progress/clients/coaching/tax. |
| [src/components/admin/tax/TaxPrioritiesTab.jsx](src/components/admin/tax/TaxPrioritiesTab.jsx) | ~248KB | ClientDetail `tax` tab | Tax engagement UI: load plan, add specialist, save tasks, archive. Calls `tax_*` actions. **Owns the `stepGate` prerequisite-lock system for the whole tax track** (#390) and the `TASK_DISPLAY_LABELS` display-only rename map (#392). |
| [src/components/admin/MembersPanel.jsx](src/components/admin/MembersPanel.jsx) | 63KB | AdminPortal `members` tab | The largest admin panel. Routes between Add Advisor / Search Advisors / per-member feature tabs (Profile, MSM Tracking, GC, Specialists, Settings, etc.). Internally fans out to ~30 callApi actions. |
| [src/components/member/MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx) | 56KB | MemberPortal `msm_*` tabs | Member-side mirror of MSMTracking. Loads program/training/clients/coaching/renewals. Includes `member_load_pipeline` to read the MAP1 pipeline row inline. |
| [src/components/admin/SpecialistOnboarding.jsx](src/components/admin/SpecialistOnboarding.jsx) | 55KB | AdminPortal `specialists` (`specialist_onboarding` section) | Multi-stage onboarding workflow: stages 1..N, votes, meetings, progress, status updates. ~7 callApi actions, all `*_onboarding*`. |
| [src/components/admin/map1/ClientTrackViewV2.jsx](src/components/admin/map1/ClientTrackViewV2.jsx) | 42KB | ClientDetail `map1` tab | The MAP1 phase tracker — renders the c-task list, surfaces inline forms (PIPDecisionForm, PFPricingForm, PFExtraMeetingForm), reads the `pipeline_map1` row for current stage. **Triggers `automation_PIP1_reconfirmationemail`** at line 85 when the c81 task is completed with a decision. |
| [src/components/admin/regular/RegularPrioritiesTab.jsx](src/components/admin/regular/RegularPrioritiesTab.jsx) | 32KB | ClientDetail `regular` tab | "Regular priorities" UI — `client_priority_tracks` + `priority_progress`. |
| [src/components/admin/SpecialistsPanel.jsx](src/components/admin/SpecialistsPanel.jsx) | 30KB | AdminPortal `specialists` tab | Specialist roster CRUD + `experts.D&B_*` editor + headshot upload. |
| [src/components/admin/pft/PFTEngagementTrack.jsx](src/components/admin/pft/PFTEngagementTrack.jsx) | 28KB | ClientDetail `pft` tab | Partnership Fast Track engagement tracker. |
| [src/components/admin/map1/PIPDecisionForm.jsx](src/components/admin/map1/PIPDecisionForm.jsx) | 25KB | ClientTrackViewV2 (inline) | The c13 decision form — Yes/Undecided/No, priorities, pricing fields. **Triggers `automation_PIPFU_decision`** at line 107. Owns ~30 lines of validation rules (priority count, fee splits, etc.). |
| [src/components/admin/AutomationPanel.jsx](src/components/admin/AutomationPanel.jsx) | 20KB | AdminPortal `automation` (`map1_pipeline` section) | **Read-only** observer of `pipeline_map1`. Renders the stage table + expanded row view with 8 step cards. The stage detection at line 30 is the canonical view of "where is this client in the pipeline." |

### Smaller but role-critical

| File | Size | Owns |
|---|---|---|
| [src/components/NotificationBell.jsx](src/components/NotificationBell.jsx) | 4.8KB | Top-bar bell icon. Polls `load_notifications` every 30s. Only background-poller in the app. |
| [src/components/admin/EmailTemplatesPanel.jsx](src/components/admin/EmailTemplatesPanel.jsx) | 9KB | Admin-only editor for `email_templates`. |
| [src/components/admin/AdminEditor.jsx](src/components/admin/AdminEditor.jsx) | 4.2KB | Superadmin-only editor for `allowed_admins`. |
| [src/components/admin/AdminSettings.jsx](src/components/admin/AdminSettings.jsx) | 3KB | `update_my_passcode` only. |
| [src/components/member/MemberGCMarketplace.jsx](src/components/member/MemberGCMarketplace.jsx) | 13.5KB | Member GC marketplace UI — balance, services list, buy credits (Stripe Checkout), redeem. |
| [src/components/shared/MemberWebsitePlugin.jsx](src/components/shared/MemberWebsitePlugin.jsx) | 17.8KB | Per-member website widget configurator (`member_plugin_settings`). |
| [src/components/shared/MemberVault.jsx](src/components/shared/MemberVault.jsx) | 4.1KB | Supabase storage CRUD for `member-vault` bucket. |
| [src/components/shared/PhaseNotes.jsx](src/components/shared/PhaseNotes.jsx) | 5.7KB | Per-phase notes UI — used inside MAP1, regular, tax, PFT tabs. Calls `add/update/delete_client_note`. |
| [src/components/shared/AddGeneralNote.jsx](src/components/shared/AddGeneralNote.jsx) | 2.3KB | Same actions as PhaseNotes but scoped to `phase_name='General'`. |
| [src/components/admin/map1/PFPricingForm.jsx](src/components/admin/map1/PFPricingForm.jsx) | 4.5KB | Inline pricing entry form — triggers `automation_PCADMIN_pricing`. |
| [src/components/admin/map1/PFExtraMeetingForm.jsx](src/components/admin/map1/PFExtraMeetingForm.jsx) | 6KB | Inline extra-meeting outcome form — triggers `automation_PCADMIN_extrameeting`. |
| [src/components/admin/map1/MeetingCompleteButton.jsx](src/components/admin/map1/MeetingCompleteButton.jsx) | 1KB | Tiny per-phase "Meeting Completed" button surfaced when all phase tasks have a status. |

## Where each automation_* action is triggered from the frontend

| Action | Triggered by | File:line |
|---|---|---|
| `automation_PCADMIN_finaldecision` | Direct fetch (no session) from email-button landing page | [DecidePage.jsx:33](src/pages/DecidePage.jsx) |
| `automation_PIP1_reconfirmationemail` | Admin completes c81 task with a decision | [ClientTrackViewV2.jsx:85](src/components/admin/map1/ClientTrackViewV2.jsx) |
| `automation_PIPFU_decision` | Admin submits the c13 decision form | [PIPDecisionForm.jsx:107](src/components/admin/map1/PIPDecisionForm.jsx) |
| `automation_PCADMIN_pricing` | Admin submits PF pricing form | [PFPricingForm.jsx:19](src/components/admin/map1/PFPricingForm.jsx) |
| `automation_PCADMIN_extrameeting` | Admin submits extra-meeting outcome form | [PFExtraMeetingForm.jsx:21](src/components/admin/map1/PFExtraMeetingForm.jsx) |
| `automation_CONTRACT_sendagreement` | **NOT directly triggered from frontend.** Server-to-server chain from `automation_PIPFU_decision` (Yes+pricing), `automation_PCADMIN_pricing`, `automation_PCADMIN_extrameeting` (Yes). | (server side only) |
| `automation_CONTRACT_ceocountersign` | Server chain from standalone `boldsign-webhook` (client-signed event) | (server side only) |
| `automation_CONTRACT_stripecustomer` | Server chain from standalone `boldsign-webhook` (Completed event) | (server side only) |
| `automation_CONTRACT_paymentemail` | Server chain from `automation_CONTRACT_stripecustomer` | (server side only) |
| `automation_CONTRACT_loadpayment` | Direct fetch (no session) from `/pay` page mount | [PayPage.jsx:19](src/pages/PayPage.jsx) |
| `automation_CONTRACT_stripecheckout` | Direct fetch (no session) when client picks ACH/Card | [PayPage.jsx:39](src/pages/PayPage.jsx) |
| `automation_CONTRACT_confirmationemail` | Server chain from Stripe webhook (`checkout.session.completed`) — chained on BOTH methods, but the client email is drafted for ACH + check only (gotcha #287) | (server side only) |
| `automation_CONTRACT_invoicereceipt` | Server chain from Stripe webhook (`checkout.session.completed` for card; `payment_intent.succeeded` for ACH and quarterly 2-4) | (server side only) |
| `automation_CONTRACT_revshare` | **NOT triggered from frontend** and **NOT chained from any webhook in the source observed.** Mechanism for invocation is unclear — flagged as an open question. |
| `automation_CONTRACT_stripewebhook` | **REMOVED in Phase 6 mechanical** — was doubly-dead (real Stripe events caught by signature header; synthetic-action assignment was unreachable from dispatch). The function returns 401/400 for explicit calls. | — |
| `automation_load_pipelines` | AdminPortal Automation tab mount | [AutomationPanel.jsx:290](src/components/admin/AutomationPanel.jsx) |
| `automation_load_pipeline_data` | AdminPortal Automation tab pipeline switch | [AutomationPanel.jsx:299](src/components/admin/AutomationPanel.jsx) |
| `automation_load_email_templates` | AdminPortal → Automation → Email Templates | [EmailTemplatesPanel.jsx:18](src/components/admin/EmailTemplatesPanel.jsx) |
| `automation_save_email_template` | EmailTemplatesPanel save | [EmailTemplatesPanel.jsx:40](src/components/admin/EmailTemplatesPanel.jsx) |
| `member_load_pipeline` | Member viewing a client's MAP1 status | [MemberMSMTracking.jsx:484](src/components/member/MemberMSMTracking.jsx) |

## How `automation_CONTRACT_revshare` is invoked

Two auto-trigger paths, no manual surface:

1. **Push chain from Stripe webhook** — `router/webhooks.ts` chains `_revshare` immediately after `_invoicereceipt` in all three Stripe chain sites (MAP1 card P1, quarterly N succeeded, ACH cleared). As of 2026-07-01 (gotcha #164) it **pays on clear** — the Tracy Revenue-Master cross-check was removed, so there is no more `pending` branch; amounts come from the PF input form on the row.
2. **Daily sweep via `automation_CONTRACT_revshare_sweep`** — a `pg_cron` job (02:00 UTC) calls the sweep, which enumerates every `pipeline_map1` row where `rec{N}_number` is set but `rev_paid` is not yet `Yes`/`Money Mapping`/`N/A`, and re-invokes `_revshare` for each. Also retries previously-`Failed` transfers so misconfigured Connect accounts auto-recover. Cron SQL lives at `vfo-edge-functions/supabase/cron/revshare-sweep.sql` (manual-apply with real service-role key — placeholder in committed file).

See [flows/contract-and-payment.md](../flows/contract-and-payment.md#step-13--revenue-share) Step 13.

## Hardcoded program-name dependencies (frontend)

The frontend hardcodes the program names from the `programs` table in several places. Adding a new row to `programs` will not surface a new tab without editing these (full list for the MSM program set in gotcha #246):

| File:line | Hardcoded names |
|---|---|
| [MemberPortal.jsx](src/pages/MemberPortal.jsx) `PROGRAM_KEYS` + inline NavDropdown map + `PROGRAM_ORDER` | `'VFO Holistic Planning'`, `'Partnership Fast Track'`, `'VFO Tax Planning'`, `'Advanced Coaching'`, `'Standard Coaching'` |
| [MSMTracking.jsx](src/components/admin/MSMTracking.jsx) `PROGRAMS` + [MembersPanel.jsx](src/components/admin/MembersPanel.jsx) `DEFAULT_MSM_OPTIONS` | (same 5) |
| [MemberMSMTracking.jsx](src/components/member/MemberMSMTracking.jsx) `PROGRAMS` | (same 5) |
| [ClientDetail.jsx:133-143](src/pages/ClientDetail.jsx) | `'Partnership Fast Track'`, `'VFO Tax Planning'` (rest fall through to the MAP1+Regular+Tax bucket) |

Hardcoded PF (Planning Facilitator) names also appear in:
- `vfo-admin-api/utils/pf-emails.ts` — `getPfEmail()` map
- [ClientDetail.jsx:227-228](src/pages/ClientDetail.jsx) — `<select>` options for assigning PF (only `Evan Anderson` and `Bridger Silvester` — note the email-map has 3 names but the dropdown has 2)
- [ClientDetail.jsx:11](src/pages/ClientDetail.jsx) — `TEAM_MEMBERS` const includes 5 names (`Sarah Freitas`, `Rachael`, `Bridger Silvester`, `Tracy Miller`, `Evan Anderson`) but only PF assignment flows through it.

> **Inconsistency:** [ClientDetail.jsx:227-228](src/pages/ClientDetail.jsx) lists 2 PF options, but `getPfEmail()` maps 3 names (`Lindsay Morris` is in the map but not selectable). A client could in theory have an `assigned_pf='Lindsay Morris'` value if set programmatically, but the frontend dropdown won't surface that as an option.

## Cross-references

- Action catalog: [05-api-action-catalog.md](05-api-action-catalog.md)
- Frontend shell: [02-frontend-shell.md](02-frontend-shell.md)
- Edge functions: [03-edge-functions.md](03-edge-functions.md)
- Auth: [04-auth-and-sessions.md](04-auth-and-sessions.md)
