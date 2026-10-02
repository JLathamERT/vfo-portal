<!-- CANONICAL COPY of the VFO session wrap-up prompt. The owner pastes this file's
     contents once when the work is SHIPPING (not at the end of every chat). Edit here, then re-copy. Last updated: 2026-08-17 (c). -->

# SESSION WRAP-UP — HUB UPDATE + STALENESS AUDIT + COMMIT (run once at session end)

Does the hub update, doc audit, verification gate, commit, push, and save-point tag in ONE pass, ordered so the tag is stamped LAST and never goes stale.

**RUN THIS ONLY WHEN THE WORK IS SHIPPING.** This is the ship ritual, not the end-of-chat ritual — it belongs to the CHANGE, not the conversation, and one shipping unit may span several chats. If the work is unfinished and I am simply closing a long chat, this is the wrong prompt: produce the handoff from `docs/prompts/SESSION_HANDOFF.md` instead, which ships nothing and leaves the branch, worktrees and commits untouched. If you are unsure which I want, ask in one line before doing either.

## PART 1 — HUB UPDATE + STALENESS AUDIT (docs first, BEFORE committing)

### 1A. Update the hub — `docs/SESSION_REFERENCE.md` FIRST (next session's starter depends on it)

The hub is a LEAN always-loaded file with hard rules. Follow all of them:

1. **Declare every edit.** For each fact you change, say which it is against the existing line: **ADD** (fact that did not exist) / **UPDATE** (existing line, new value) / **DELETE** (line no longer true or no longer earns its place) / **NOOP** (checked, still correct, unchanged). No blind appends — if you cannot name which of the four an edit is, you do not understand the change yet.
2. **Superseded facts move out immediately.** When a value changes, the old value goes to `docs/CHANGELOG.md` in the same pass — it never lingers in the hub as a `Prior: ...` tail, a parenthetical, or a struck line. The hub holds CURRENT state only.
3. **Stamp freshness.** Every fact you touched or re-verified gets a fresh `(v: YYYY-MM-DD)` stamp. A stamp means "confirmed on this date", so only stamp what you actually checked this session.
4. **Narrative goes straight to CHANGELOG.** The story of **the whole change** — every chat that worked this branch, not just this one — is written DIRECTLY to `docs/CHANGELOG.md`, newest-first: what was built, why, what broke, what was decided. If the change spanned handoffs, reconstruct the earlier chats from the branch's commits and the handoff blocks' DECIDED / GOTCHA lines; one change gets ONE entry, because it becomes one squashed commit on `main`. **The hub never holds narrative**, not even for the current session. Do not write it in the hub and migrate it later.
5. **Reconcile OWED / WATCH / PARKED.** Discharge every item this session settled (delete it, and note the discharge in CHANGELOG). Add every item this session created. An OWED list that only grows is a broken list. **Two sources feed this that are easy to miss because they came from chats that no longer exist:**
   - **Every `UNTESTED` line from every handoff block on this branch.** At ship time an untested thing has exactly two legal endings: it is tested now, or it becomes a hub OWED line. It may NOT quietly vanish because the chat that flagged it is gone — that is the single most losable field in the handoff, precisely because the shipping chat never saw the gap itself. Re-read the handoff blocks (or the branch's WIP commit messages) before writing this section, and if a CHANGELOG line reads like fuller coverage than was actually tested ("click-tested end to end"), qualify it with which route or path was NOT exercised.
   - **Any gate that was run against an EARLIER deploy than the one shipping.** A smoke gate green against v749 is not a smoke gate for v750; a `deno check` from before the last three commits is not a current one. Re-run it, or record it as owed by name and version. "The user ran it earlier" is not a green gate, and a skipped gate sitting behind a clean-looking verification list is worse than an openly outstanding one.
6. **Re-run the DERIVE block and reconcile expectations.** Run the hub's `DERIVE-AT-START` commands again and confirm the hub's expected values still match — action count, advisor (security) baseline, route-page count, deno check baseline count + kinds, live versions. If the session legitimately changed one, UPDATE the expectation. If it changed one you did not intend to change, STOP and investigate before committing.
7. **Count the hub's lines. `wc -l docs/SESSION_REFERENCE.md` > 250 is a FAILURE.** Cut before committing — remove, compress, or push detail down into the referenced doc; do not "temporarily" exceed. Any net line growth at all must be justified in ONE sentence in the doc commit body (e.g. "hub +4: new 07-server-chains DOC MAP row + Tax payout invariant").
8. **Confirm the SECURITY INVARIANTS box is unchanged.** If it changed, say so explicitly and explain why — an invariant change is a headline, never a quiet edit.

Also confirm, as part of the hub pass: live `vfo-admin-api` + `boldsign-webhook` VERSION NUMBERS (authoritative — Supabase Dashboard / `list_edge_functions`; record the VERSION, never a guessed tag); new live state (crons, buckets, columns, pipelines, routes, skeleton variants). Do NOT hard-code "current tag: live-N" — the real tag is created post-merge in Part 4; keep the derive-it-from-git note instead.

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
If this session changed how sessions should START, HAND OFF or END — a new required startup command, a new gate, a changed hub rule, a renamed doc a prompt points at — update `docs/prompts/SESSION_STARTER.md`, `docs/prompts/SESSION_HANDOFF.md` and/or `docs/prompts/SESSION_WRAPUP.md` (bump the last-updated date in the header comment) and **tell me explicitly to re-copy the changed prompt**, since I paste them by hand.

## PART 2 — VERIFICATION GATE
- git rev-parse --abbrev-ref HEAD — NOT main
- git status — only intended files; NO stray edits to main-checkout files
- Backend changed? deno check (baseline count+kinds must match the hub) + action-count parity — **the count must match the hub's DERIVE block expectation**
- DB / policy / function changed? Run get_advisors (type security) → must be GREEN (only the intentional deny-all INFO + pg_net WARN allowed). A new rls_disabled_in_public / sensitive_columns_exposed (ERROR) or rls_policy_always_true (WARN) = a table regressed to anon-reachable → STOP and fix. (SECURITY INVARIANTS)
- Frontend changed? Visual smoke on affected pages; DevTools Network targets the right backend
- Pipeline smoke gate (scripts/smoke-pipelines.ps1, all 5 PASS) after any vfo-admin-api deploy OR after editing shared routing/dispatch/webhook/auth/shared-utils. Skip for frontend/doc-only. **It must be green against the version being SHIPPED** — if the branch deployed more than once, a run against the earlier version does not count; re-run it or put it in OWED by name and version (Part 1A rule 5).
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

## PART 4 — PUSH → DEPLOY → TAG (tag is LAST so it can't be stale)

### 4A. Push: git push -u origin <branch>  (push does NOT deploy)

### 4B. Post-push report: commit SHA(s) · PR-creation URL(s) · production untouched · "merge with Squash and merge (one chat = one commit on main)" · then the MANDATORY deploy question:
  > DEPLOY NEEDED — merged/pushed ≠ live. To ship:
  > - Frontend changed? → npm run deploy in vfo-react
  > - Backend changed?  → supabase functions deploy vfo-admin-api --project-ref ejpsprsmhpufwogbmxjv --use-docker  (Docker Desktop running, deno.lock deleted first — gotcha #574)
  > Want me to run [the relevant one(s)] now? (yes / no)
  (If a repo needs no deploy — e.g. already deployed this session, or doc-only — say so explicitly.)

### 4C. [I merge the PR(s); you deploy ONLY if I explicitly say "deploy".]

### 4D. STAMP THE SAVE POINT — LAST, only after merge + deploy confirmed good:
- Backend deployed? tag the merged main commit: backend-good-YYYY-MM-DD-v<Supabase version>; push it.
- Frontend deployed? tag the merged main commit: live-N-<short> (N = current max +1 via git tag -l); push it.
- Confirm rollback: "If anything's wrong later, say: restore to <previous tag>."
- **Then go BACK to the hub and re-stamp the three lines you could not know in Part 1A** — the live function versions and the two deploy-tag lines in `DERIVE AT SESSION START`. They were written before this deploy existed, so following this prompt correctly still leaves them dated today with yesterday's values, which falsifies the one drift signal a new session reads first (#408). Commit that as a one-line docs follow-up; every OTHER derive expectation (action count, route pages, crons, advisor baseline) is knowable in Part 1 and needs no revisit.
- No deploy this session? Skip 4D — including the re-stamp, since nothing moved.

## SAFETY GUARDRAILS
- Never git add -A/. (stage by path) - Never --amend a pushed commit (new commit instead)
- Never push --force to main (feature branches only, with approval) - Never --no-verify w/o approval
- Never commit .env.local/secrets/large binaries/unrelated node_modules/supabase/.temp/cli-latest
- Don't push tags except the Part-4D save-point tag - Don't deploy after push unless I say "deploy"
- Never end the flow without explicitly asking about deploy
If a pre-commit hook fails: fix the root cause, re-stage, NEW commit (don't --amend).
