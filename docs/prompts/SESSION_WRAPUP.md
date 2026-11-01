<!-- CANONICAL COPY of the VFO session wrap-up prompt. Run it with `/wrapup` (the command file in both repos reads THIS file), or paste it,
     once when the work is SHIPPING (not at the end of every chat). Edit here only, in a worktree, through a PR. Last updated: 2026-11-01 (phase 2: the smoke gate = every check PASS, run by a superadmin; two-person workflow: releases only from up-to-date main in the MAIN folders, ONE PR per repo — no post-release hub re-stamp, clash-safe live-N tags, CHANGELOG entries say who did the work, one step at a time after "deploy", the dev server stopped by port; 2026-10-31: the deploy re-runs the HEAD..origin/main = 0 check first, #702; 2026-10-28: frontend gate checks phone + desktop width). -->

# SESSION WRAP-UP — HUB UPDATE + STALENESS AUDIT + COMMIT (run once at session end)

Does the hub update, doc audit, verification gate, commit, push and PR in ONE pass — then, on the person's word, the release from main and the save-point tag. Everything that writes a file happens BEFORE the PR, so one change = one PR per repo; nothing after the merge needs another.

**RUN THIS ONLY WHEN THE WORK IS SHIPPING.** This is the ship ritual, not the end-of-chat ritual — it belongs to the CHANGE, not the conversation, and one shipping unit may span several chats. If the work is unfinished and I am simply closing a long chat, this is the wrong prompt: produce the handoff from `docs/prompts/SESSION_HANDOFF.md` (`/handoff`) instead, which ships nothing and leaves the branch, worktrees and commits untouched. If you are unsure which I want, ask in one line before doing either.

## PART 1 — HUB UPDATE + STALENESS AUDIT (docs first, BEFORE committing)

### 1A. Update the hub — `docs/SESSION_REFERENCE.md` FIRST (next session's starter depends on it)

The hub is a LEAN always-loaded file with hard rules. Follow all of them:

1. **Declare every edit.** For each fact you change, say which it is against the existing line: **ADD** (fact that did not exist) / **UPDATE** (existing line, new value) / **DELETE** (line no longer true or no longer earns its place) / **NOOP** (checked, still correct, unchanged). No blind appends — if you cannot name which of the four an edit is, you do not understand the change yet.
2. **Superseded facts move out immediately.** When a value changes, the old value goes to `docs/CHANGELOG.md` in the same pass — it never lingers in the hub as a `Prior: ...` tail, a parenthetical, or a struck line. The hub holds CURRENT state only.
3. **Stamp freshness.** Every fact you touched or re-verified gets a fresh `(v: YYYY-MM-DD)` stamp. A stamp means "confirmed on this date", so only stamp what you actually checked this session.
4. **Narrative goes straight to CHANGELOG.** The story of **the whole change** — every chat that worked this branch, not just this one — is written DIRECTLY to `docs/CHANGELOG.md`, newest-first: what was built, why, what broke, what was decided. If the change spanned handoffs, reconstruct the earlier chats from the branch's commits and the handoff blocks' DECIDED / GOTCHA lines; one change gets ONE entry, because it becomes one squashed commit on `main`. **The entry's heading ends with who did the work** — `— by Jake`, or `— by Jake, Paxton`: the person running this wrap-up plus every name on the branch's handoff `By:` lines (first names from the TEAM table in `docs/TEAM_RULES.md`). **The hub never holds narrative**, not even for the current session. Do not write it in the hub and migrate it later.
5. **Reconcile OWED / WATCH / PARKED.** Discharge every item this session settled (delete it, and note the discharge in CHANGELOG). Add every item this session created. An OWED list that only grows is a broken list. **Two sources feed this that are easy to miss because they came from chats that no longer exist:**
   - **Every `UNTESTED` line from every handoff block on this branch.** At ship time an untested thing has exactly two legal endings: it is tested now, or it becomes a hub OWED line. It may NOT quietly vanish because the chat that flagged it is gone — that is the single most losable field in the handoff, precisely because the shipping chat never saw the gap itself. Re-read the handoff blocks (or the branch's WIP commit messages) before writing this section, and if a CHANGELOG line reads like fuller coverage than was actually tested ("click-tested end to end"), qualify it with which route or path was NOT exercised.
   - **Any gate that was run against an EARLIER deploy than the one shipping.** A smoke gate green against v749 is not a smoke gate for v750; a `deno check` from before the last three commits is not a current one. Re-run it, or record it as owed by name and version. "The user ran it earlier" is not a green gate, and a skipped gate sitting behind a clean-looking verification list is worse than an openly outstanding one.
6. **Re-run the DERIVE block and reconcile expectations.** Run the hub's `DERIVE-AT-START` commands again and confirm the hub's expected values still match — action count, advisor (security) baseline, route-page count, deno check baseline count + kinds. Live function versions and the latest tags are deliberately NOT stamped in the hub (the release has not happened yet when you write it, and a tag name carries its version) — never add them back. If the session legitimately changed one, UPDATE the expectation. If it changed one you did not intend to change, STOP and investigate before committing.
7. **Count the hub's lines. `wc -l docs/SESSION_REFERENCE.md` > 250 is a FAILURE.** Cut before committing — remove, compress, or push detail down into the referenced doc; do not "temporarily" exceed. Any net line growth at all must be justified in ONE sentence in the doc commit body (e.g. "hub +4: new 07-server-chains DOC MAP row + Tax payout invariant").
8. **Confirm the SECURITY INVARIANTS box is unchanged.** If it changed, say so explicitly and explain why — an invariant change is a headline, never a quiet edit.

Also confirm, as part of the hub pass: new live state (crons, buckets, columns, pipelines, routes, skeleton variants). Any test deploys this branch made go in the CHANGELOG entry by VERSION (`list_edge_functions` is authoritative), never as a guessed tag. Do NOT write "current tag: live-N" or a live version anywhere in the hub — Part 4 creates them after the merge, and git + MCP derive them.

### 1B. Gotchas — append, then PRUNE the curated list
- New session-learned gotchas → append to the END of `docs/GOTCHAS.md` (the permanent registry; increment from the current max #N — **NEVER renumber**).
- If it's an always-applies invariant, ALSO add a one-line entry (with its number) to the curated ALWAYS-APPLIES list in the hub.
- **Then run a prune pass over that curated list.** Any entry that no longer earns always-loaded status — superseded, area deleted, now enforced by code, or narrow enough to only matter in one flow — gets DEMOTED: removed from the hub, kept in `docs/GOTCHAS.md` (the registry is permanent; only the curated surface is pruned). Declare each demotion.

### 1C. Ripple — update every OTHER doc surface THE BRANCH touched

**Scope is the BRANCH, not this chat.** A change can span several chats via `SESSION_HANDOFF.md`, and this chat only witnessed the last slice of it. Start this section by running, in BOTH repos:

```
git fetch origin && git diff --stat origin/main...HEAD && git log --oneline origin/main..HEAD
```

That file list — every file the whole branch changed, across every chat that worked on it — is the input to this audit, not your own memory of this conversation. Read the diff of anything you did not personally change before deciding it needs no doc update; "an earlier chat probably handled it" is not a check. Also fold in any doc debt the handoff blocks carried forward (their OWED and GOTCHA lines) — a GOTCHA recorded three chats ago is still un-written until someone writes it.

Surfaces: `docs/CHANGELOG.md` · `docs/GOTCHAS.md` · `docs/README.md` · `architecture/*` (including `architecture/07-server-chains.md`) · `flows/*` · `integrations/*` · `tables/*` · `docs/NOTIFICATION_AUDIT.md` · `glossary.md` · `vfo-react/README.md` · `vfo-edge-functions/.refactor-resume.md` · inline comments/headers in any file you touched.

What counts as drift: file paths/line refs moved · action names added/removed · action count · response shapes · DB tables/columns/status fields · env vars · webhook (Stripe/BoldSign) semantics · auth/role-gate behavior (ADMIN_ONLY_ACTIONS / MEMBER_SCOPED_ACTIONS) · chain semantics (Authorization forwarding, service-role chains — these belong in `07-server-chains.md`) · verify_jwt/Kong · frontend↔backend contract (VITE_API_URL, ANON_KEY, base path) · version numbers · deferred items resolved · "What's NOT in the system" claims · new gotchas.

Rules: surgical edits for moved refs; section rewrites for structural changes; **a new end-to-end flow gets a new `docs/flows/<x>.md` AND a new DOC MAP row in the hub** (a doc nobody is told to read does not exist). Describe CURRENT state only — no dual-track. If a doc is genuinely unaffected, skip it — otherwise update it NOW. There is NO "follow-up session" option for doc updates.

### 1D. Prompt maintenance
If this session changed how sessions should START, HAND OFF or END — a new required startup command, a new gate, a changed hub rule, a renamed doc a prompt points at — update `docs/prompts/SESSION_STARTER.md`, `docs/prompts/SESSION_HANDOFF.md`, `docs/prompts/SESSION_WRAPUP.md` and/or `docs/TEAM_RULES.md` (bump the last-updated date in the header comment). `/start`, `/handoff` and `/wrapup` read these files live, so nobody re-copies anything once the PR merges — but say in the summary which prompt or rule changed, so both people know. The `CLAUDE.md` and `.claude/commands/*.md` files are IDENTICAL in both repos: change them in both or in neither.

## PART 2 — VERIFICATION GATE
- git rev-parse --abbrev-ref HEAD — NOT main
- git status — only intended files; NO stray edits to main-checkout files
- Backend changed? deno check (baseline count+kinds must match the hub) + action-count parity — **the count must match the hub's DERIVE block expectation**
- DB / policy / function changed? Run get_advisors (type security) → must be GREEN (only the intentional deny-all INFO + pg_net WARN allowed). A new rls_disabled_in_public / sensitive_columns_exposed (ERROR) or rls_policy_always_true (WARN) = a table regressed to anon-reachable → STOP and fix. (SECURITY INVARIANTS)
- Frontend changed? Visual smoke on affected pages at phone width (390) AND desktop width (1280 — the browser pane's own "desktop" is a phone, #687); the desktop is byte-identical unless the change says otherwise; DevTools Network targets the right backend
- Pipeline smoke gate (scripts/smoke-pipelines.ps1, every check PASS — run by a superadmin with their own portal email, TEAM_RULES §4) after any vfo-admin-api deploy OR after editing shared routing/dispatch/webhook/auth/shared-utils. Skip for frontend/doc-only. **It must be green against the version being SHIPPED** — if the branch deployed more than once, a run against the earlier version does not count; re-run it or put it in OWED by name and version (Part 1A rule 5). The release in Part 4C gets its own run.
- Hub line count ≤ 250 (Part 1A rule 7) — a failing count blocks the commit

## PART 3 — SUMMARIES + COMMIT

### 3A. Three concise summaries — covering the BRANCH, not just this chat: Code changes · Doc updates · Remaining risks/open questions

### 3B. Inspection (read-only): in each changed worktree — git rev-parse --abbrev-ref HEAD; git status --short; git diff --stat; git log --oneline -5

### 3C. Pre-commit report — tell me:
- Branch (confirm NOT main)
- Uncommitted/untracked — flag anything unintended (.env.local, tmp.json, node_modules, .claude/, IDE/OS files, accidental package-lock, supabase/.temp/cli-latest)
- Files to exclude · push-to-current-or-fresh (current is fine if feature/claude/docs branch; STOP if main) · merge-safe green light (clean tree after staging, no stray edits, doc audit passed, verification gate passed, no debug logs/commented code)

### 3D. Stage by PATH (never git add -A) + commit — TWO commits, code first then docs (never mixed):
Template per commit (write BOM-free / use a bash heredoc):
  <scope>: <one-line, imperative, <70 chars>
  - <what changed and why>  - <non-obvious risk/scope note>
  Verification: deno check <N>; action count <N>; smoke <...>; visual <...>
  Files NOT touched: supabase/functions/boldsign-webhook/* (+ other intentional non-touches)
  Co-Authored-By: Claude <noreply@anthropic.com>   (or the session's model name — do not hard-code an old one)
The DOC commit body must also carry the hub's line count and, if it grew, the one-sentence justification from Part 1A rule 7.
DO NOT create/push any tag here — the tag is stamped LAST in Part 4.

## PART 4 — PUSH → PR → RELEASE FROM MAIN → TAG

Nothing in this part writes a file, so it never needs a second PR. Each step waits for the person (TEAM_RULES §4: one step at a time).

### 4A. Push: git push -u origin <branch>  (push does NOT deploy)

### 4B. Post-push report, then STOP
Commit SHA(s) · one PR-creation URL per repo that changed · production untouched · "merge with Squash and merge (one change = one commit on main)" · which repos need a RELEASE once merged (backend changed → `vfo-admin-api`; frontend changed → the website; doc-only → none, say so) · then one line: **"When the PR(s) are merged, say 'merged, deploy' — or just 'merged' to hold the release."** Give no deploy command and no smoke command here.

### 4C. RELEASE — only after the person says the PR(s) are merged AND says "deploy"
Releases run from the MAIN folders (`C:\vfo-edge-functions`, `C:\vfo-react`), never from this chat's worktree: after a squash merge only `origin/main` is exactly what shipped, and a release from the main folder leaves no `/.claude/worktrees/` in the live `entrypoint_path` (TEAM_RULES §4). For each repo being released, in ONE invocation that `cd`s explicitly (#419):
1. **Bring the main folder to origin/main and prove it:** `git fetch origin && git merge --ff-only origin/main`, then `git rev-parse HEAD` must equal `git rev-parse origin/main`, and this PR's squash commit must show in `git log -3 --oneline`. Not merged yet, or `--ff-only` refused → STOP and say so (#702: deploying anything behind origin/main rolls back merged work).
2. **Backend — check what is live first:** MCP `list_edge_functions` → `vfo-admin-api` → `entrypoint_path`. A worktree path that is not this chat's branch is the other person's test build → STOP and ask before releasing over it.
3. **Deploy:**
   - **Backend:** in `C:\vfo-edge-functions`, Docker Desktop running, `deno.lock` deleted if present, then `supabase functions deploy vfo-admin-api --project-ref ejpsprsmhpufwogbmxjv --use-docker` (#574). Confirm with `list_edge_functions` that the version went up and `entrypoint_path` is the main folder.
   - **Frontend:** in `C:\vfo-react` — if `package.json` / `package-lock.json` changed in this merge, run `npm ci` first (a dev server running off the main folder's `node_modules` must be stopped first; `scripts/dev-servers.ps1` lists them). Then `npm run deploy`, and prove the live site changed (TEAM_RULES §10) before going on.
   - **A migration / Storage file / cron** in this change: confirm it is applied live (it should already be, from the work; #196).
4. **Then one step at a time:** backend released → give the person the smoke command with THEIR portal email (TEAM_RULES §4) and stop; after "pass" → the live test steps, only if the change needs any, and stop.

### 4D. TAG — only after the person confirms the release is good
- **Backend released:** in `C:\vfo-edge-functions`, tag `origin/main`'s commit `backend-good-YYYY-MM-DD-v<the version step 3 confirmed>`; push that tag.
- **Frontend released:** in `C:\vfo-react`, `git fetch --tags`; N = highest `live-*` + 1 (`git tag -l 'live-*' --sort=v:refname`); tag `origin/main`'s commit `live-N-<short>`; push it. Refused because the tag exists = the other person just took N: fetch again, use the next number. Never delete or move someone else's tag.
- Say the rollback line: "If anything is wrong later, say: restore to <previous tag>."
- **No hub edit after the release** — the hub derives versions and tags, so nothing written in Part 1 needs a re-stamp and there is no follow-up PR.
- No release this time (doc-only, or the person held it)? Skip 4C and 4D and say plainly what is merged but NOT live.

## PART 5 — CLEAN UP
1. Stop this chat's dev server by its port: `scripts/dev-servers.ps1 -Stop <port>` (vfo-react), then run it again with no switches and confirm that port is gone. Never stop one this chat did not start.
2. After the person confirms the merge — in BOTH repos: sync main first (`git fetch origin && git checkout main && git merge --ff-only origin/main` in the main folder), then `git worktree remove .claude/worktrees/<chat-branch>` and optionally `git branch -d <chat-branch>` (already merged, safe to delete).
3. Verify cleanup with `git worktree list` in both repos.

## SAFETY GUARDRAILS
- Never git add -A/. (stage by path) - Never --amend a pushed commit (new commit instead)
- Never push --force to main (feature branches only, with approval) - Never --no-verify w/o approval
- Never commit .env.local/secrets/large binaries/unrelated node_modules/supabase/.temp/cli-latest
- Don't push tags except the Part-4D save-point tag - Don't deploy unless the person says "deploy"
- Never end the flow without saying plainly which repos are merged but not yet released
If a pre-commit hook fails: fix the root cause, re-stage, NEW commit (don't --amend).
