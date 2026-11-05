# Two-person workflow — plan of record (the team roadmap)

> **What this is:** the one plan for moving the VFO portal from one developer (Jake) to two (Jake + Paxton) on separate computers, with one live system that nobody can break by accident and no testing on live. **Paxton starts about 2026-11-11.**
>
> **This file is the source of truth for where the plan stands — not anyone's Claude memory** (a chat on the other person's computer can't see that). Every chat working on any piece of it reads this file first, and the PR that ships a step updates that step's row here (TEAM_RULES §6). Decisions are added to §5 with the date and who made them.
>
> Created 2026-11-03 from the 2026-10-31 planning chat ("VFO PORTAL - 10/31 #1 (Paxton)") and the chats since, when the plan was found to exist only in Jake's Claude memory. Last updated: 2026-11-05.

## 1. Where it stands

| # | Piece | Status | Proof / where |
|---|---|---|---|
| 1 | **Prompts + rules** — `TEAM_RULES.md`, `ACCESS.md`, `CLAUDE.md` in both repos, `/start` `/handoff` `/wrapup`, the dev-server script, one PR per repo, deploy → smoke → test one step at a time | **SHIPPED 2026-11-01** | react #572, edge #333 (docs and prompts only) |
| 2 | **Superadmin list + bigger smoke test** — `constants/superadmin.ts` (Jake + Paxton), the smoke script picks whoever runs it, 23 read-only checks | **SHIPPED 2026-11-01** | edge #334, react #573 · `vfo-admin-api` v1080 · `live-284-superadmin-list` |
| 5 | **Staging / test mode** — a full second copy of the portal with fake data only. Its own plan: [plans/staging/README.md](../staging/README.md) | **S1-S4 SHIPPED** — part 1 2026-11-02 (S1-S3 + the S4 website), the rest of S4 2026-11-03 (CHANGELOG 2026-11-03 (c)) · S6 shipped 2026-11-04 · **S7 + switch day done 2026-11-04** · S5 not started | §2 below |
| 3 | **Deploy button** — live releases through GitHub, not from a laptop | **SHIPPED 2026-11-04** — backend and website released and tagged through it (`backend-good-2026-11-04-v1092`, `live-290-deploy-button`); both guard checks tested in new chats | §3 below |
| 4 | **OWED list → GitHub Issues** + a hub small enough to read in full | **NOT STARTED** — before Paxton starts (Jake 2026-11-04) | §3 below |
| 6 | **Paxton's getting-started document** | **NOT STARTED** — on purpose last, so it describes the finished setup; must be done before he starts | §3 below |
| — | **Jake's setup tasks for Paxton** (accounts, access) — not a chat | **PARTLY DONE** — walked through 2026-11-04; the rest waits for Stripe (Jena) and the Zoom | §4 below |

The numbers are the 2026-10-31 phase numbers. Staging (5) was moved ahead of 3 and 4 because it has the deadline.

### Order from here

**Everything below is done before Paxton starts, about 2026-11-11 (Jake, 2026-11-04).** One chat each:

1. **Paxton's accounts and access: a chat that walks Jake through §4**, one step at a time. It changes no code, so it runs at the same time as the chats below and doesn't hold them up.
2. **DONE 2026-11-04. Move testing fully to staging** (S7 + switch day, staging plan §4c), including staging's `vfo-widget.js`.
3. **DONE 2026-11-04. Wipe the old test records from live**, straight after 2. Once live is live-only, a payment on Test Member 59524 would be REAL money. First: Jake approves the exact list, the team is told, a backup is confirmed, and the smoke test moves off 59524. The code's test-member filters go too. Staging is not touched. Details: staging plan §4c.
4. **DONE 2026-11-04, last proof due 2026-11-06. Set up live's 19 automatic jobs again**, reading their key from the Vault (staging plan §4c item 5). All 19 read the Vault and none holds the key. 18 of 19 have returned 200 on schedule. The Friday arrears digest (`membership-arrears-digest-weekly`) first runs 2026-11-06 at 9:45 am ET, and its proof is Paul getting the email. What is left is in the hub's OPEN / OWED.
5. **The admin portal's Staging tab** (S5): Reset test data, Refresh settings from live, what is running. Must re-make each person's test member (`ensureStagingTestMember`) and clear its bells. The first thing to drop if time runs short: until it exists, Reset is by hand.
6. **Move the OWED list to GitHub Issues**, with the clean-up pass and a hub small enough to read in full (§3).
7. **Paxton's getting-started document**, last, so it describes the finished setup (§3). Needs 1-6.

Chats 2-6 run one at a time, in this order: each builds on the one before, and they edit the same docs.

## 2. Staging (phase 5) in one table

Full detail, decisions D1-D19 and the setup record: [plans/staging/README.md](../staging/README.md).

| Stage | What | Status |
|---|---|---|
| S1 | Accounts: Supabase project `yxolcioazczlhruprmrb` ("VFO Staging"), `staging@vfo-services.com`, repo `vfo-portal-staging`, DNS `staging.vfoportal.com` | Done 2026-11-02 |
| S2 | Backend isolation: `constants/environment.ts`, the staging email guard, URLs and Drive folders from settings | Shipped 2026-11-02 (v1086) |
| S3 | Staging backend up: schema, buckets, settings, the 19 crons | Done 2026-11-02 |
| S4 | Website on staging + the sandbox move + test data + the first full test | Website shipped 2026-11-02 (`live-288-staging-part1`). **2026-11-03:** sandbox move done (live holds no sandbox keys, smoke PASS on v1089; both Stripe sandboxes and BoldSign's sandbox report to staging); one test member per person (Jake 10001, Paxton 10002, made automatically with each admin login); client logins on the tester's tagged email; every staging email and bell goes to the tester (bells teal, "meant for: …", a staging-only Clear (test) on action bells); full test parts A and B PASS. **Shipped 2026-11-03** (CHANGELOG 2026-11-03 (c)); after the release staging is brought back to main (SESSION_WRAPUP Part 4E). |
| S5 | A superadmin-only Staging tab: *Reset test data*, *Refresh settings from live*, what is running. | Not started |
| S6 | Keep in step: a merge that changes backend code redeploys staging's backend, a merge that changes the website redeploys staging's website, a docs-only merge redeploys neither (Jake 2026-11-03); a drift check between the two databases, required at wrap-up; `smoke -Target staging` | Shipped 2026-11-04 |
| S7 | Switch the rules: TEAM_RULES, CLAUDE.md, the starter and wrap-up so testing happens on staging only | Done 2026-11-04 |
| Switch day | Live becomes live-only (`VFO_ENVIRONMENT=live`, the sandbox toggles and "Test member only" removed). Test Member 59524 and live's other test records are then **wiped** (Jake 2026-11-04, §5). | Done 2026-11-04, wipe included |

**Staging keeps itself up to main from the merge on.** Live migrations, template changes and switch flips are still made on staging by hand the same day (TEAM_RULES §4), and the drift check proves it.

## 3. The phases still to build

### Phase 3 — the deploy button

**Why:** Jake and Paxton work on separate computers, and a backend deploy replaces the whole function: if Paxton releases a branch that lacks Jake's merged work, Jake's work silently disappears from live. Two Claude chats on two computers can't see each other, so the fix has to live in the one place both share: GitHub.

**Decided (Jake, 2026-10-31):**
- A GitHub Actions workflow is the only way live gets released.
- It deploys **only main**, **one at a time** (a second press waits its turn), **numbers and pushes its own tags** (`backend-good-…` and `live-N`, so two tags can never clash) and **records who pressed it and when**.
- Claude presses it with the GitHub CLI (`gh`) when the person says "deploy", watches it finish, then hands over the smoke command. It feels the same as today.
- Neither laptop needs the deploy keys or Docker Desktop for a release.
- The same workflow deploys main to staging on every merge (staging S6), so both are built in one chat.

**D13 (Jake, 2026-11-03): two limited Supabase tokens, not one full-access token.** One reaches staging only and is used on every merge; one reaches live only and is used only by the button. Each carries Edge Functions read-write and nothing else, and both sit only in the private edge repo. Jake's account offers these scoped tokens (checked 2026-11-03). A leaked live token could still deploy code to live, and that code runs with full database access, so this reduces the risk without removing it.

**Design approved (Jake, 2026-11-03):**
- **Two presses.** The first releases the tip of main. The second, after the person says smoke passed, tags **the exact commit the first press released**, not whatever main is by then. The first press records that commit and the function version; the second reads them from the first press's run.
- **Only merges that change backend code redeploy staging's backend,** because a redeploy replaces any branch being tested there. Before trusting a test result, check staging is still running your build (`list_edge_functions` on staging: the version you deployed).
- **The drift check is a required wrap-up step.** It is a SQL file run through the Supabase connection on both projects, so it needs no database key on a laptop or in GitHub (this replaces the `scripts/staging-drift.ps1` first planned).
- **The website button can restore an old build,** and accepts `live-*` tags only.
- **A repo guard stops any chat, on either computer, running a backend deploy to live or one that names no project** (`supabase/.temp/project-ref` is tracked and points at live). It stays off until the button is proven, and has an off switch in case the button breaks. It stops chats, not a person typing in their own terminal.

**Free plan, no GitHub Pro (Jake, 2026-11-04).** GitHub's free plan can't limit a key to main on a private repo, so both Supabase keys are ordinary repo secrets and the only main-only check is the button's own. An edited copy of the button on a branch could drop that check and use the live key, so the guard gains a second job:
- **No chat can push a branch that changes anything under `.github/` without Jake's explicit word.** That covers `git push` and writing those files through `gh api`, and the same check covers the guard's own files. The guard makes Claude Code show a permission prompt, which a chat can't answer for itself. The docs say this prompt still appears in auto mode; the build proves it. If the guard can't tell what a push changes, it prompts.
- **This check goes on as soon as it is merged, before the live key is created,** and needs no off switch: it only asks, so it can't get in the way of fixing a broken button. The backend deploy block keeps the plan above: on once the button is proven, with its off switch.
- **The button checks it is on main before doing anything else,** and runs no script from the repo until that check passes.
- **Limits, accepted:** it stops mistakes by chats, not a person's own terminal or a chat deliberately editing the guard out; it exists only in folders made after it merges; and on Paxton's computer the prompt goes to Paxton, so `TEAM_RULES` says Paxton gets Jake's word before answering yes.

**Proving "same code" on the first press.** The fingerprint (`ezbr_sha256`) is expected to change, so a new fingerprint proves nothing either way. Git stores these files with Linux line breaks (`core.autocrlf` is on), and a laptop build keeps Windows ones: the deployed copy of v23 holds them in 39 of its files. So, in order:
1. **Before pressing:** `git diff` between the `backend-good-…` commit and the commit being released is empty for `supabase/functions/vfo-admin-api`.
2. **Before and after pressing:** `supabase functions download` of live's version, then a file-by-file comparison with line breaks ignored. Every file must match. Any other difference means stop and revert in the dashboard.
3. **Rehearsed first on staging:** the same comparison between staging's laptop build and its first GitHub build, before live is pressed.
4. **From then on:** git proves it, with no difference in the backend folder between the commits staging and live were built from. Fingerprints can't: staging and live came out different with all 777 files byte-identical (GOTCHAS #725).

**Rehearsed on staging, 2026-11-04.** Backend, v23 (laptop) against v24 (GitHub): 777 files, 738 identical, 39 differing only in line breaks, none really different. Website: the first GitHub build differed in one file, because the laptops ran Sentry 10.59.0 while `package-lock.json` said 10.58.0, so a GitHub build would have moved live back a version. The lockfile now says 10.59.0, and the GitHub build gives the same bundle names and all 151 files match, ignoring blank lines in the route pages. The staging key is refused on live and on SQL (403), though no deploy to live was attempted with it.

**Done on live, 2026-11-04.** Live before and after the press: 777 files, 738 identical, 39 differing only in line breaks, none really different; smoke PASS on v1092. CHANGELOG 2026-11-04 has the whole run.

**Open before building:**
- `gh` is installed and signed in on Jake's computer (2026-11-04), not yet on Paxton's. Without it, someone presses the button on github.com. Two-step sign-in went on for Jake's GitHub account the same day.
- `boldsign-webhook` never deploys from the button unless the person says so explicitly (CLAUDE.md).
- Test deploys of a branch to staging stay a laptop deploy with `--project-ref` (TEAM_RULES §4).

**Done when:** "deploy" in a chat releases main (backend and website) through the button, both tags appear on the released commits, a second press while one runs waits, a merge that changes backend code redeploys staging's backend by itself while a docs-only merge does not, and both guard checks are on and tested: a chat is blocked from deploying to live, and a push that changes `.github/` brings up the prompt.

### Phase 4 — OWED list → GitHub Issues

**Why:** the hub's OWED list (about 280 KB) is edited by every chat, so two people's PRs clash on it every time, and it is too big for a chat to read at start.

**Decided (2026-10-31):** GitHub Issues — both people see a new item instantly, each item can be assigned, and the PR that fixes it closes it (`Fixes #N`). The hub keeps rules and current state only. Moving the list includes a clean-up pass, since many items are long done.

**Done when:** the hub has no OWED lines, every open item is an Issue, and the starter, handoff and wrap-up read and write Issues instead.

### Phase 6 — Paxton's getting-started document

**Decided (Jake, 2026-11-01):** its own chat, written with Jake, **last** (so it describes the finished setup) but **before Paxton starts**. Sources: [TEAM_RULES.md](../../TEAM_RULES.md), [ACCESS.md](../../ACCESS.md), this plan.

**Before the Zoom (Jake, 2026-11-04), also in the document:** he has been invited to Supabase at `pcalareso@vfo-services.com` and needs to accept it; he sets up a GitHub account under that same email; and it asks about his current Claude Code account, and whether he has one.

**The Zoom with Jake (Jake, 2026-11-04), listed in the document as steps, never with a value in it (TEAM_RULES §2):** Paxton gives the username of that GitHub account and Jake invites him, with two-step sign-in on. Jake says the logins out loud, not in Zoom's chat and not on a recording: the live passcode, the staging password, the `staging@` inbox and the staging test password. Paxton then changes both portal passcodes in admin Settings, and signs in to `staging@` while still on the call, because Google may send a security check to Jake's ERT email.

**It covers:** his accounts and access, his computer and tools (same folder paths, Node, Deno, Supabase CLI 2.78.1 (not v3, #716), Docker Desktop, `gh`, Claude Code), setting his git name (`git config --global user.name` / `user.email`) and adding it to the TEAM table, how chats work (`/start`, `/handoff`, `/wrapup`, "deploy", the smoke test), and staging (his test member 10002, the `staging@` inbox, his staging password).

**Done when:** Jake has sent it to Paxton.

## 4. Jake's setup tasks for Paxton (not a chat)

| Task | Status |
|---|---|
| Work email `pcalareso@vfo-services.com` | Exists (made by Jena) |
| Live portal admin login + superadmin | Done 2026-11-01 — Jake tells him the passcode on the Zoom (§3, Phase 6) |
| Staging admin login + his test member 10002 | Done 2026-11-03 — Jake tells him the password on the Zoom, with the `staging@` inbox login and the staging test password |
| GitHub collaborator on `vfo-portal`, `vfo-edge-functions` and `vfo-portal-staging`, with two-step sign-in, since the live deploy key sits in the repo | On the Zoom, once he gives his username (§3, Phase 6) |
| Supabase: Developer, with SQL access | Invited by Jake 2026-11-04 (organization Elite Resource Team, which holds live and staging); he accepts it (§3, Phase 6) |
| Claude Code account | Ask whether he already has one (§3, Phase 6); who pays is still open |
| Stripe (ERT + VFO Services: View Only + Sandbox Administrator) | Jena handling |
| BoldSign, Gmail, Sentry, Google Drive / Sheets | Later, when he needs them |

## 5. Decisions

Settled — build on these, don't reopen them.

**2026-10-31 (Jake):**
- Shared rules live in the repo, not in Claude memory; the starter loads them.
- Live releases only from up-to-date main after the merge; "branch B wipes branch A" must be impossible.
- The permanent clash fix is the GitHub deploy button (§3). `live-N` tag clashes must be impossible.
- OWED moves to GitHub Issues; the hub keeps rules only.
- Passwords in a Bitwarden shared vault (free for 2), changed 2026-11-04 below; `ACCESS.md` names the entries, never the values.
- Superadmin is an easy-to-edit list: Jake + Paxton. The smoke test grows (23 checks, shipped).
- Always use the house style. Deploy flow one step at a time. One PR per repo. CHANGELOG entries say who did the work.
- Staging is wanted: Jake's team-wide "test mode" (always sandbox, emails really arrive, no test clutter on live). Jake wants all testing things removed from live eventually.

**2026-11-01 (Jake):** Paxton starts about 2026-11-11 and staging must exist before then. Paxton's getting-started document is its own chat, last. The phase order became: staging, deploy button, OWED → Issues, Paxton's document.

**2026-11-03 (Jake):** the plan lives in this file. Staging decisions from 2026-11-03 (test members numbered 10001+, named "<First> Member"; live's test records are never deleted, reversed 2026-11-04 below; all staging emails and bells go to the tester) are in the staging plan.

**2026-11-03 (Jake), on moving the testing:** "just moving all the testing to staging asap is fine. the team doesnt need the test member and tests right now it will just be a day or 2". So S7 + the switch day are the next chat after the deploy button.

**2026-11-04 (Jake), on what comes before Paxton starts:** everything in "Order from here" (§1), including the Staging tab ("before") and OWED → Issues, with a chat to walk him through Paxton's accounts and access. On the old test records: "no th eold test records will be wiped i want the live portal clean". This reverses the 2026-11-03 decision to keep them.

**2026-11-04 (Jake), on the switch:** "do not change the feature switches leave them as is"; reworking how they work may make sense later, now that features can be built on staging. "test memebr will be fully removed from live portal ... also all clients conected to test memebr". "we are switching and wipeing now. there is no risk they are all tests".

**2026-11-04 (Jake), on the wipe:** the test planners on real plans 150, 156 and 103: "just remove the allocation dont give it to anyone". The nine test-looking clients under real members stay. The SANDBOX counters show on the test site only. Test document numbers were put back after being deleted by mistake ("yes"), because new numbers count them (GOTCHAS #732).

**2026-11-04 (Jake), on GitHub Pro:** "No Pro, stay on the free plan. Keep the button's own main-only check. Extend the guard so no chat can push a branch that changes the button (.github/workflows) without my explicit word. Record this decision in the roadmap." Details in §3.

**2026-11-04 (Jake), on Paxton's setup tasks:** "skip contract and skip laptop (remove both from plan as a whole)". Neither is a setup task any more. The tools he needs on his computer moved to the getting-started document (§3).

**2026-11-04 (Jake), on proving the Friday job while out of office:** "i cant tell you to check on friday im ooo. set that to send mode and if it sends we will see it worked". The arrears digest went from Draft to Send on both copies. Whether it stays there is still his call (hub OWED).

**2026-11-04 (Jake), on the handover:** his GitHub username and the passwords wait for a Zoom, and that moves to the getting-started document (§3). "it doesnt sound like any bitwarden setup is needed": Paxton isn't added to the vault, and no password reaches him in writing. BoldSign, Gmail, Sentry and Google Drive wait until he needs them.

## 6. Watch

- **If the button breaks,** the laptop release from an up-to-date main folder is the fallback (TEAM_RULES §4). A release from a chat's folder makes live's `entrypoint_path` name a worktree that doesn't exist on the other person's computer, and their Claude would stop.
