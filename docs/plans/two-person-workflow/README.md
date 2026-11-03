# Two-person workflow — plan of record (the team roadmap)

> **What this is:** the one plan for moving the VFO portal from one developer (Jake) to two (Jake + Paxton) on separate computers, with one live system that nobody can break by accident and no testing on live. **Paxton starts about 2026-11-11.**
>
> **This file is the source of truth for where the plan stands — not anyone's Claude memory** (a chat on the other person's computer can't see that). Every chat working on any piece of it reads this file first, and the PR that ships a step updates that step's row here (TEAM_RULES §6). Decisions are added to §5 with the date and who made them.
>
> Created 2026-11-03 from the 2026-10-31 planning chat ("VFO PORTAL - 10/31 #1 (Paxton)") and the chats since, when the plan was found to exist only in Jake's Claude memory. Last updated: 2026-11-03.

## 1. Where it stands

| # | Piece | Status | Proof / where |
|---|---|---|---|
| 1 | **Prompts + rules** — `TEAM_RULES.md`, `ACCESS.md`, `CLAUDE.md` in both repos, `/start` `/handoff` `/wrapup`, the dev-server script, one PR per repo, deploy → smoke → test one step at a time | **SHIPPED 2026-11-01** | react #572, edge #333 (docs and prompts only) |
| 2 | **Superadmin list + bigger smoke test** — `constants/superadmin.ts` (Jake + Paxton), the smoke script picks whoever runs it, 23 read-only checks | **SHIPPED 2026-11-01** | edge #334, react #573 · `vfo-admin-api` v1080 · `live-284-superadmin-list` |
| 5 | **Staging / test mode** — a full second copy of the portal with fake data only. Its own plan: [plans/staging/README.md](../staging/README.md) | **Part 1 SHIPPED 2026-11-02** (S1-S3 + the S4 website) · **S4 rest BUILT + TESTED 2026-11-03, NOT SHIPPED** · S5, S6, S7, switch day: not started | §2 below |
| 3 | **Deploy button** — live releases through GitHub, not from a laptop | **NOT STARTED** — build together with staging S6 | §3 below |
| 4 | **OWED list → GitHub Issues** + a hub small enough to read in full | **NOT STARTED** — may follow after Paxton starts | §3 below |
| 6 | **Paxton's getting-started document** | **NOT STARTED** — on purpose last, so it describes the finished setup; must be done before he starts | §3 below |
| — | **Jake's setup tasks for Paxton** (accounts, access, contract, computer) — not a chat | **PARTLY DONE** | §4 below |

The numbers are the 2026-10-31 phase numbers. Staging (5) was moved ahead of 3 and 4 because it has the deadline.

### Order from here

1. **Ship staging S4** — chat "VFO PORTAL - 11/3 #2 (Paxton)": deploy its last bell fix to staging, `/wrapup`, merge, release, smoke, tag. Its wrap-up also puts the new staging step (Part 4E) into `SESSION_WRAPUP.md` on main.
2. **Deploy button + staging S6, one chat.** Ask D13 (§3) first.
3. **Staging S7** — switch the team rules to "test on staging".
4. **Paxton's getting-started document.**
5. **Staging S5** (Reset / Refresh) and **OWED → Issues** — can follow after Paxton starts if time runs short.
6. **The switch day** (staging plan §4c) — after S7, once Jake decides what the team may still do with Test Member 59524 on live (staging plan, open point).

## 2. Staging (phase 5) in one table

Full detail, decisions D1-D19 and the setup record: [plans/staging/README.md](../staging/README.md).

| Stage | What | Status |
|---|---|---|
| S1 | Accounts: Supabase project `yxolcioazczlhruprmrb` ("VFO Staging"), `staging@vfo-services.com`, repo `vfo-portal-staging`, DNS `staging.vfoportal.com` | Done 2026-11-02 |
| S2 | Backend isolation: `constants/environment.ts`, the staging email guard, URLs and Drive folders from settings | Shipped 2026-11-02 (v1086) |
| S3 | Staging backend up: schema, buckets, settings, the 19 crons | Done 2026-11-02 |
| S4 | Website on staging + the sandbox move + test data + the first full test | Website shipped 2026-11-02 (`live-288-staging-part1`). **2026-11-03:** sandbox move done (live holds no sandbox keys, smoke PASS on v1089; both Stripe sandboxes and BoldSign's sandbox report to staging); one test member per person (Jake 10001, Paxton 10002, made automatically with each admin login); client logins on the tester's tagged email; every staging email and bell goes to the tester; full test parts A and B PASS. **Not shipped:** edge branch `claude/phase-5-staging-cont-24f1db` (worktree `goofy-nightingale-0ac23f`) and react branch `claude/phase-5-staging-cont-358083` hold it, partly uncommitted, nothing pushed. Staging runs that branch's build. |
| S5 | A superadmin-only Staging tab: *Reset test data*, *Refresh settings from live*, what is running. Also staging's `vfo-widget.js` still calls live. | Not started |
| S6 | Keep in step: main → staging on every merge (D13), a drift check between the two databases, `smoke -Target staging` | Not started — with the deploy button |
| S7 | Switch the rules: TEAM_RULES, CLAUDE.md, the starter and wrap-up so testing happens on staging only | Not started |
| Switch day | Live becomes live-only (`VFO_ENVIRONMENT=live`, the sandbox toggles and "Test member only" removed). Test Member 59524 and live's other test records are **kept** (Jake 2026-11-03: team members still use them). | Not started |

**Until S6 exists**, staging is kept in step by hand (TEAM_RULES §4): every live migration, template change or switch flip is made on staging the same day, and after each live release staging is brought up to main and redeployed on the person's "deploy".

## 3. The phases still to build

### Phase 3 — the deploy button

**Why:** Jake and Paxton work on separate computers, and a backend deploy replaces the whole function: if Paxton releases a branch that lacks Jake's merged work, Jake's work silently disappears from live. Two Claude chats on two computers can't see each other, so the fix has to live in the one place both share: GitHub.

**Decided (Jake, 2026-10-31):**
- A GitHub Actions workflow is the only way live gets released.
- It deploys **only main**, **one at a time** (a second press waits its turn), **numbers and pushes its own tags** (`backend-good-…` and `live-N`, so two tags can never clash) and **records who pressed it and when**.
- Claude presses it with the GitHub CLI (`gh`) when the person says "deploy", watches it finish, then hands over the smoke command. It feels the same as today.
- Neither laptop needs the deploy keys or Docker Desktop for a release.
- The same workflow deploys main to staging on every merge (staging S6), so both are built in one chat.

**Open before building:**
- **D13** — a Supabase access token stored in GitHub's secrets can reach live as well as staging. Ask Jake before building.
- `gh` is not installed on Jake's computer yet (or Paxton's). Without it, someone presses the button on github.com.
- `boldsign-webhook` never deploys from the button unless the person says so explicitly (CLAUDE.md).
- Test deploys of a branch to staging stay a laptop deploy with `--project-ref` until S7 says otherwise.

**Done when:** "deploy" in a chat releases main (backend and website) through the button, both tags appear, a second press while one runs waits, and a merge to main redeploys staging by itself.

### Phase 4 — OWED list → GitHub Issues

**Why:** the hub's OWED list (about 280 KB) is edited by every chat, so two people's PRs clash on it every time, and it is too big for a chat to read at start.

**Decided (2026-10-31):** GitHub Issues — both people see a new item instantly, each item can be assigned, and the PR that fixes it closes it (`Fixes #N`). The hub keeps rules and current state only. Moving the list includes a clean-up pass, since many items are long done.

**Done when:** the hub has no OWED lines, every open item is an Issue, and the starter, handoff and wrap-up read and write Issues instead.

### Phase 6 — Paxton's getting-started document

**Decided (Jake, 2026-11-01):** its own chat, written with Jake, **last** (so it describes the finished setup) but **before Paxton starts**. Sources: [TEAM_RULES.md](../../TEAM_RULES.md), [ACCESS.md](../../ACCESS.md), this plan.

**It covers:** his accounts and access, Bitwarden, his computer and tools, setting his git name and adding it to the TEAM table, how chats work (`/start`, `/handoff`, `/wrapup`, "deploy", the smoke test), and staging (his test member 10002, the `staging@` inbox, his staging password).

**Done when:** Jake has sent it to Paxton.

## 4. Jake's setup tasks for Paxton (not a chat)

| Task | Status |
|---|---|
| Work email `pcalareso@vfo-services.com` | Exists (made by Jena) |
| Live portal admin login + superadmin | Done 2026-11-01 — passcode still to pass on via Bitwarden |
| Staging admin login + his test member 10002 | Done 2026-11-03 — password to pass on via Bitwarden; he also gets the `staging@` inbox login |
| GitHub collaborator on both repos (`vfo-portal`, `vfo-edge-functions`) | Jake to confirm |
| Supabase: Developer, with SQL access | Jake to confirm |
| Stripe (ERT + VFO Services: View Only + Sandbox Administrator), BoldSign, Gmail, Sentry, Google Drive / Sheets | Jake to confirm (Jena handling Stripe) |
| Bitwarden shared vault, entries named in `ACCESS.md` | Started 2026-11-01 — Jake to confirm |
| Contract: confidentiality, IP assignment, data handling | Jake to confirm |
| Computer: a company Windows laptop (not school-managed), same folder paths, Node, Deno, Supabase CLI 2.78.1 (not v3, #716), Docker Desktop, `gh`, Claude Code; `git config --global user.name` / `user.email`, and that name in the TEAM table | Jake to confirm |

## 5. Decisions

Settled — build on these, don't reopen them.

**2026-10-31 (Jake):**
- Shared rules live in the repo, not in Claude memory; the starter loads them.
- Live releases only from up-to-date main after the merge; "branch B wipes branch A" must be impossible.
- The permanent clash fix is the GitHub deploy button (§3). `live-N` tag clashes must be impossible.
- OWED moves to GitHub Issues; the hub keeps rules only.
- Passwords in a Bitwarden shared vault (free for 2); `ACCESS.md` names the entries, never the values.
- Superadmin is an easy-to-edit list: Jake + Paxton. The smoke test grows (23 checks, shipped).
- Always use the house style. Deploy flow one step at a time. One PR per repo. CHANGELOG entries say who did the work.
- Staging is wanted: Jake's team-wide "test mode" (always sandbox, emails really arrive, no test clutter on live). Jake wants all testing things removed from live eventually.

**2026-11-01 (Jake):** Paxton starts about 2026-11-11 and staging must exist before then. Paxton's getting-started document is its own chat, last. The phase order became: staging, deploy button, OWED → Issues, Paxton's document.

**2026-11-03 (Jake):** the plan lives in this file. Staging decisions from 2026-11-03 (test members numbered 10001+, named "<First> Member"; live's test records are never deleted; all staging emails and bells go to the tester) are in the staging plan.

## 6. Watch

- **Unshipped work exists only on Jake's computer:** the S4 branches are not pushed (§2). Push them, or ship them, before anything else touches those worktrees.
- **Until the deploy button exists,** live releases run from the main folders after `git merge --ff-only origin/main` (SESSION_WRAPUP). A release from a chat's folder makes live's `entrypoint_path` name a worktree that doesn't exist on the other person's computer, and their Claude would stop.
- **Until S6 exists,** staging is kept in step by hand (§2).
