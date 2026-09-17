# DIRECT to Tax Planning — build plan, decisions and status

Branch `claude/vfo-session-setup-96fda1` (both repos). Written 2026-09-17 at the end of the first chat so the next chat has the whole picture. **This file is the plan of record for the project; the hub carries only live state.** Companion files in this folder: `unit1-brief.md`, `unit1b-brief.md` (the implementer briefs, verbatim), `direct-tax-planning-sheet-dump.txt` (Paul's spreadsheet, cell dump) and `licensing-structure-sheet-dump.txt` (Paul's licensing rules, cell dump — a future whole-system plan, NOT all in scope).

## 1. What the project is

Members may run a tax client themselves ("Direct"): the member is the PF, the tax planning team's role does not change. Alongside it, the whole tax intake moves into the portal (a 37-question form + $500 deposit replaces the disconnected Unbounce form), the deposit is split 50/50 with the tax planning team, ROI decks carry three logos, an "Additional Benefits" slide is added, clients get a portal login on payment, and a new standard agreement layout applies to all tax planning.

## 2. Jake's decisions — do NOT re-open

| # | Decision | Date |
|---|---|---|
| 1 | Storage: SAME tables (`clients`, `client_tax_plans`) + one nullable `client_tax_plans.tax_route` (NULL = classic, `'direct'`), copying the `roi_skip_mode` pattern. No second table for Direct clients. | 09-16 |
| 2 | Direct eligibility = 2 DISTINCT clients with `retainer_status='succeeded'` AND client's own green click at Client decision 1 (`post_review_client_decision` in Proceed/Confirmed/Auto-Locked) AND admin pick Continue/Undecided AND not refunded. Computed rule ONLY, no admin override. Shown clearly on admin and member side. Direct is an OPTION, never forced. Helper: `utils/tax-direct-eligibility.ts qualifyingTaxClients`. | 09-16/17 |
| 3 | The $500 deposit is paid by the MEMBER (route A) or by the CLIENT via emailed link (route B, added 09-17). Waived on BOTH routes once the member has 2 qualifying clients. Refund email addressed to whoever paid. | 09-16/17 |
| 4 | Green/Red Light step is the SINGLE trigger for both deposit money movements: Proceed → $250 transfer to the planning group's Connect account; Refund → full $500 refund via the linked PaymentIntent. Applies to ALL VFO Tax Planning plans with a deposit PI, including the 9 existing hand-pasted ones (option A). On Direct the MEMBER clicks it. | 09-17 |
| 5 | Manual `pi_` paste on the Deposit Paid step is KEPT beside the portal path. | 09-17 |
| 6 | Any member can start a tax client: the Tax Planning tab is visible to ALL members; the first intake creates the program-4 enrollment. | 09-17 |
| 7 | Standard clients use the same form; the member just has no control afterwards. Holistic clients: after the MAP 1 first payment the MEMBER gets an email with a link to the same form; answers attach to the existing client; no deposit; Holistic is never Direct. | 09-16 |
| 8 | Question 1 (advisor/accountant/client) is REMOVED from the UI; the server derives it (member type, or "Client" on route B). Q7–Q9 (introducer) are prefilled and hidden. Answers are READ-ONLY afterwards — nothing pre-fills any tax step. | 09-17 |
| 9 | VFOS allocates the tax planning team; the confirmation email always says "The tax planning team will be allocated in due course." Allocation stays admins + Team Members (Tax Planners read-only, members never). | 09-17 |
| 10 | On Direct the member does EVERYTHING our team normally does; tax-team steps render DISABLED with the planner-style red circle-slash + hover warning; VFOS keeps CEO countersign + split edits. Direct pricing preset 45/45/10 (member/group/VFOS), thirds hidden. | 09-16 |
| 11 | $300 VFO Portal licence at Client decision 1 on EVERY tax client: taken from the retainer pool FIRST, split after; stays in the VFO Services balance short-term (no transfer); disbursement line on the revenue-share invoice; client gets 12 months free portal membership (login + visible expiry date shown when they log in, nothing billed) and the member may run CIQ on that client. Licence must be its OWN record (`client_portal_licenses`) — whichever of Holistic/Tax comes first wins, a later purchase EXTENDS pro-rata by days, a tax refund revokes it. | 09-16/17 |
| 12 | Client portal login + free-membership paragraph go in the INVOICE/RECEIPT email for card, ACH and check, all tax. Training video URL not yet available. | 09-16 |
| 13 | Logos on SLIDES ONLY: group bottom-left, member bottom-middle (member uploads on profile, toggle default OFF, blank when off), VFO bottom-right; title slide logos at the TOP. Additional Benefits slide on ALL decks. Book-ends (branded title + closing slide) for the hand-made detailed deck. | 09-16/17 |
| 14 | ONE contract layout for ALL tax planning (no separate Direct row): opening paragraph gains the collaborating-team sentence (group, member unless opted out / personal name fallback, VFO Services); Steps 1–3 name the member as introducer/presenter; Step 4 says "Meeting with Advanced Tax Planner"; new "Additional Benefits" section after Double Guarantee (slide wording, no check marks, no "$2,600" line, + the Q4 new-engagement sentence); title "Tax Planning Engagement Agreement (Direct)" approved earlier is MOOT since one layout serves all. All four existing agreement rows get re-seeded. | 09-17 |
| 15 | Reminders (planner review 2-day chase, additional-info chase) are IN scope; on Direct they name the member as PF. | 09-17 |
| 16 | Every outbound email ends with `VFO Services - Proactive Coordinator Team` (VFO_SIGNATURE), enforced in the delivery layer. | 09-17 |
| 17 | Every payment issues the house invoice + receipt PDF pair (numbered, Drive, attached) — never a Stripe receipt link. | 09-17 |
| 18 | Deposit memos: incoming "VFO Tax Planning Deposit - Client: X - Member: (n) Y"; transfer "Tax Planning Deposit Team Share ($250 of $500) - Client: (ref) X - Tax Planner: P — Group", also stamped on the group's destination payment. | 09-17 |

## 3. The four shipping units

| Unit | Scope | Status |
|---|---|---|
| **1 Intake + deposit** | 37-question form (routes A member / B client link / Holistic email), $500 Checkout, waiver, auto client+enrollment+plan, deposit invoice+receipt pair, confirmation emails, $250 team leg, linked refund, `tax_route` column, footer guard, security ride-along (5 tax writes closed to members), test-member fill button | BUILT; v861 live; migration 4 of 4 NOT applied; testing in progress — see §4 |
| **2 Direct execution** | Route choice Direct on the form when eligible, eligibility shown both sides, member runs every VFO-team step via NEW narrow handlers (`denyIfNotOwnClient` + route check), tax-team steps disabled, 45/45/10 preset, member as PF (NOTE: `clients.assigned_pf` is a NAME resolved by `utils/pf-emails.ts` — a member name resolves to "" silently; needs a member fallback or a flag column) | not started |
| **3 Branding + contract** | `tax_planning_groups.logo_image` + admin upload on the Tax Planning Partners card; `members.logo_image` + `logo_enabled` + `contract_name_enabled` via a NEW narrow member self-save action (none exists today); deck v9 master (logos as `<p:pic>` on all slides, top row on title, Additional Benefits slide baked in; only the member PNG bytes swapped at runtime, transparent PNG when off; re-derive SHIFT_EXPECTED constants, #480); book-ends generator; re-seed the 4 agreement rows with the new layout (sandbox BoldSign send per row to re-verify field_map pages, #439) | not started |
| **4 Licence + client portal + reminders** | `client_portal_licenses` table; $300 disbursement before the split at Client decision 1 (every split surface must show it, #465); invoice line; auto client login + portal email paragraph + expiry shown in the client portal; revoke on refund; CIQ on that client; the two reminders | not started |

Sequencing note: clients created between unit 1 and unit 4 get no licence/$300 — accepted.

## 4. Unit 1 — exact state at handoff (2026-09-17 evening)

**Live:** `vfo-admin-api` **v861** deployed from this worktree (v860 = unit 1 + memos; v861 = unit 1b client route). The deposit-documents change (`utils/tax-deposit-docs.ts`, finalize + intake-load edits, Deposit Paid step numbers) is **built and type-checked but NOT deployed** — needs v862 + migration 4.

**Migrations (files in `supabase/migrations/`):**
| File | Applied live? |
|---|---|
| `20260917120000_tax_intake.sql` — `tax_intake_requests` (RLS deny-all, anon `*/0`, advisor GREEN strong check), `client_tax_plans.tax_route` + `deposit_team_share_*`, `clients.tax_intake_requested_at`, rule `FAILURE_tax_deposit_team_share` | YES |
| `20260917120100_tax_intake_email_templates.sql` — templates 275 `TAX_new_case_confirmation`, 276 `TAX_intake_request\|holistic`, 181 re-addressed to MEMBER, six AI-PC footer blocks stripped (0 left) | YES |
| `20260917200000_tax_intake_client_route.sql` — `payer`, `intake_token`, `link_sent_at`, `link_opened_at`; templates 277 `TAX_intake_link`, 278 `TAX_new_case_confirmation\|client`, 279 `TAX_deposit_refund\|client` | YES |
| `20260917210000_tax_intake_deposit_docs.sql` — five `deposit_*` doc columns + strips `[RECEIPT_BUTTON]` from 275/278 | **NO — apply AFTER deploying v862** |

**Actions:** 507 → **514** (`tax_intake_eligibility`, `tax_intake_submit`, `tax_intake_holistic_submit` MEMBER_SCOPED; `tax_intake_load` in-handler per role + on TAX_PLANNER_ALLOWED; `tax_intake_send_link` MEMBER_SCOPED; `tax_intake_link_load` / `tax_intake_link_submit` PUBLIC, token = whole credential #310). Route pages 34 → **35** (`/tax-intake`). Security ride-along: `tax_start_plan`, `tax_save_task`, `tax_save_deposit_pi`, `tax_add_specialist`, `tax_remove_specialist` added to ADMIN_ONLY_ACTIONS (planners unaffected); five dead `msm_*` tax names removed (#256).

**Test matrix (Jake, dev server on the react worktree, Test Member 59524 sandbox-forced):**
| Step | Result |
|---|---|
| Smoke gate | 5/5 vs v860 AND 5/5 vs v861 |
| Route A: tab visible w/o enrollment, form, $500 Checkout paid, success card, client listed | PASSED (v860, before q1 removal) |
| Admin: Deposit Paid "Paid via portal", form card, confirmation email | Reached; the email carried the WRONG "View receipt" link → replaced by the invoice+receipt pair (undeployed) → RE-TEST after v862 |
| Green/Red Proceed → $250 chip; re-click no-op | NOT yet |
| Refund → member-addressed draft | NOT yet |
| Route A on v861 (chooser, q1 gone, stored Advisor for Client) | NOT yet |
| Route B: send link → draft → public page → pay → thank-you → admin card "Completed by the client" → `\|client` confirmation → `\|client` refund; token misuse (already submitted / 404 / 409); re-send reuses token | NOT yet |
| Waived member 59376 on A and B → no Checkout, `N/A — No Deposit` | NOT yet |
| Holistic `?intake_client=62` → thank-you; second submit refused | NOT yet |
| Footer: one standard footer on an old email | NOT yet |
| Test-member "Fill with test values" button (last item of the form; public page needs v862 for the flag) | NOT yet |
| curl refusals: member token on the 5 closed tax writes → 403; forged `client_id` on `tax_intake_load` → 403 | NOT yet (Fable runs) |
| The 9 existing hand-pasted deposit plans: first real Proceed forwards $250 | production consequence, unwatched |

**Fixtures created so far this session on the live DB (clean before wrap-up):** the route-A client + plan Jake created on 59524 (find via `tax_intake_requests`), its `member_enrollments` program-4 row for 59524, Gmail drafts on the sandbox inbox, sandbox Stripe session/PI. Client 62 holds 0 tax plans.

**Owed at wrap-up (docs):** hub OWED entry + DERIVE (versions, action 514, route pages 35, `send_mode=true` 49, new table in the storage/table lists), CHANGELOG entry, GOTCHAS (footer guard, deny-by-omission tax writes, #488 second leg on the deposit, house doc pair), `flows/tax-planning.md` (Step 0 deposit now portal-driven; intake form; Green/Red money), NEW `flows/tax-intake.md` + DOC MAP row, `tables/tax.md` (`tax_intake_requests`, new columns), `tables/documents.md` (templates 275–279, 181), `flows/notifications.md` + `NOTIFICATION_AUDIT.md` (rule `FAILURE_tax_deposit_team_share`, and a rule row for `FAILURE_tax_deposit_docs` is NOT seeded — code default Jake), `architecture/04-auth` (the gate changes), `architecture/05-api-action-catalog.md` (7 actions), `architecture/07-server-chains.md` (webhook branch, $250 leg, sweep pass, Holistic hook), `architecture/02-frontend-shell.md` (`/tax-intake`), `flows/additional-contacts.md`/`email-recipients` (footer guard). `scripts/emit-route-pages.mjs` changed for the new route.

## 5. Known gaps / decisions still owed
- Vault copy of the deposit PDFs: none (the retainer pair does not do one either).
- `FAILURE_tax_deposit_docs` bell has no `notification_rules` row (falls back to Jake).
- The `send_mode` for `TAX_intake_link` is Draft: a member's "Send link" only creates a Gmail draft until Jake flips it.
- Unit 2 must solve `assigned_pf` = member (see §3).
- Petrus hotfix leftovers (separate branch, shipped v859): `TAX_amended_invoice_not_sent` bell never fired live; its rule description is stale; 13 migrated plans carry planner leg `N/A — No Share Due` (Jake's call).

## 6. Key code map (unit 1)
Backend `supabase/functions/vfo-admin-api/`: `actions/tax/intake-*.ts` (7 handlers), `utils/tax-intake-questions.ts` (the 37 questions + validation, MIRRORED in `src/components/member/taxIntakeQuestions.js` — keep byte-equivalent), `utils/tax-direct-eligibility.ts`, `utils/tax-intake-finalize.ts` (client + enrollment + plan + Deposit Paid + docs + confirmation; latch `created_client_at`), `utils/tax-deposit-docs.ts`, `utils/tax-deposit-team-share.ts` ($250 leg, own columns, key `deposit-team-tax-<plan>`, probe before key), `utils/tax-intake-request-email.ts` (Holistic email, stamp `clients.tax_intake_requested_at`), `utils/tax-intake-link-email.ts`, `utils/email-signature.ts` (footer guard in `draftGmail` / `gmailDraftFetch` / `deliverRaw`), `constants/member-types.ts`; hooks in `actions/tax/save-task.ts` (Proceed → $250), `actions/tax/allocate-planner.ts` (release), `actions/tax/revshare-sweep.ts` (third pass), `actions/tax/deposit-refund.ts` (payer-aware), `actions/pipeline/contract-invoice-receipt.ts` (Holistic hook), `router/webhooks.ts` (two branches: `payment_kind=tax_intake_deposit` completed/expired). Frontend: `src/components/member/TaxIntakeForm.jsx` (chooser, form, link mini-form, publicMode, test fill), `src/pages/TaxIntakePage.jsx`, `MemberMSMTracking.jsx` / `MemberPortal.jsx` (tab always visible, return handling), `TaxPrioritiesTab.jsx` (form card, chips, doc numbers).
