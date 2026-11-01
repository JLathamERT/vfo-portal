<!-- CANONICAL COPY of the VFO session starter. Run it with `/start <task>` (the command file in both repos reads THIS file), or paste it. Edit here only, in a worktree, through a PR. Last updated: 2026-11-01 (two-person workflow: every standing rule moved to docs/TEAM_RULES.md, /start, leftover dev servers listed at start, which build is live stated at start; 2026-10-31: the 2b freshness check is re-run before EVERY deploy, #702). -->

# VFO SESSION STARTER

This prompt is the startup PROCEDURE only. Every standing rule — safety, paths, deploying, tags, how we work, the house style — lives in `docs/TEAM_RULES.md` and is not repeated here.

## STEP 0 — READ FIRST

1. **Read `docs/TEAM_RULES.md` IN FULL** from this chat's vfo-react worktree, and name the person you are working with (`git config user.name` → its TEAM table).
2. **Read `docs/SESSION_REFERENCE.md` (the hub)** — all of it EXCEPT the LIVE STATE → **OPEN / OWED** list, which has grown too large to read whole: grep that list for the area you are about to touch instead. Pay special attention to the **SECURITY INVARIANTS** box — non-negotiable; re-check them on any table / policy / handler / function change.
3. **Run the `DERIVE AT SESSION START` block and state the results** — live versions, latest tags, action count, cron count — before any other work. Volatile facts come from those commands, never from prose: if a doc disagrees with the command output, the command wins and the doc is stale. Also state the live `vfo-admin-api` `entrypoint_path`: no `/.claude/worktrees/` in it = main is live; a worktree path = a branch's test build is live, and whose it is matters before any deploy (TEAM_RULES §4).

Do not proceed until all three are done.

---

## THE DOC MAP IS BINDING

The hub carries a `DOC MAP` — a table of when-to-read triggers. Before editing ANY area, read the doc(s) the DOC MAP names for that area. This is not optional background reading; it is a precondition for touching the code.

Docs are maps, not gospel. Verify details against the code before relying on them. **If the work reveals a doc is wrong, fixing that doc is part of the task, not a follow-up.**

---

## SESSION STARTUP — RUN BEFORE ANY OTHER WORK

### 1. Sync both repos' main folders
Run in BOTH `C:\vfo-react` AND `C:\vfo-edge-functions`:
git fetch origin && git checkout main && git merge --ff-only origin/main

Never branch from local `main` without fetching first — local `main` is not authoritative, `origin/main` is.

### 2. Worktrees
The app normally opens the chat in FRESH worktrees in both repos (its own branch names). Use those, after the 2b check — do not create more. Only if the chat opened without worktrees, create matching ones yourself (same branch name in both repos, specific to this chat, never reusing a prior chat's worktree):
git worktree add .claude/worktrees/<chat-branch> -b <chat-branch> main

**EXCEPTION — a CONTINUING chat.** If the task text below starts with `CONTINUING` (a handoff from an earlier chat on the same piece of work), do **not** create anything. Reuse the exact branch and worktree paths the handoff names, confirm they exist via `git worktree list`, run the 2b freshness check on them, and say which paths you are continuing in. Creating a second branch for work that already has one splits the change across two PRs — that is the failure this exception exists to prevent. **Known tooling trap (2026-09-21, widened 2026-10-28, #686):** the app auto-opens the chat inside FRESH worktrees on their own branches — in BOTH repos — and the Edit/Write tools then refuse any path in a DIFFERENT worktree ("belongs to a different worktree"), the react worktree included. Do not edit the auto-created ones — they are the wrong branch. In a CONTINUING chat edit through an exact-match replace script via Bash (refuse on ≠1 match, preserve CRLF/LF; keep the scripts in the session scratchpad). Say so at startup so the person can open the next chat FROM the branch's worktree.

### 2b. Verify worktree freshness (auto-created worktrees especially)
Worktrees the app creates are cut from LOCAL main, which may be stale. Run in EACH worktree:
git fetch origin && git rev-list --count HEAD..origin/main

If either repo's count is not 0, STOP before any edits and sync: commit nothing yet, merge `origin/main` into that worktree (the app's `sync_with_base_branch` tool where it is available, else `git merge origin/main`), resolve conflicts, and only then proceed. NEVER edit, test against, or deploy from a worktree that is behind origin/main — a stale react worktree shows old UI in the dev server, and a stale edge worktree would DEPLOY REVERTED CODE over the live function. **This check is per DEPLOY, not per chat:** other PRs merge while you work, so run it again (same command, in the worktree being deployed, `cd` in the same invocation) immediately before EVERY `vfo-admin-api` deploy — mid-chat test deploys included — and merge origin/main first if it is not 0 (gotcha #702: v1070 rolled back two merged PRs on live that way).

### 3. Confirm worktree paths
Run `git worktree list` in each repo and explicitly state the worktree path you will edit. Refer back to that path for every edit.

### 4. Dev servers
First list what is already running:
& C:\vfo-react\.claude\worktrees\<chat-branch>\scripts\dev-servers.ps1

If any are listed, tell the person (port + start time) and give them the stop command (`-Stop <port>`) — never stop one this chat did not start. Then start this chat's server in the background:
cd C:\vfo-react\.claude\worktrees\<chat-branch>; npm run dev

Note its port: that exact port is stopped at handoff and wrap-up. It prints `Phone preview: http://localhost:<port>/phone-preview` under the dev URL — give the person both.

NO `VITE_API_URL` override. This hits the real Supabase project (`ejpsprsmhpufwogbmxjv`), real database, real Gmail drafts, real Stripe sandbox — and the person logs in with THEIR real credentials. Never run `supabase functions serve`, never run `supabase start` (local Docker Postgres), never set `$env:VITE_API_URL=http://127.0.0.1:...`. There is no "test login" — `dev@local.test` / `dev2026` is a seeded local-only fake and must not be offered.

---

## ENDING A CHAT — TWO DIFFERENT THINGS

A chat ending and the work shipping are **not** the same event, and conflating them is what produces six-hour chats with a bloated context.

- **HAND OFF** (`/handoff` → `docs/prompts/SESSION_HANDOFF.md`) — the work is unfinished but this chat is long, or the next piece of work is a different shape. Nothing ships. The branch, the worktrees and every commit stay exactly where they are; only the conversation is discarded. A fresh chat picks up from a short handoff block. **No wrap-up, no merge, no tag.**
- **WRAP UP** (`/wrapup` → `docs/prompts/SESSION_WRAPUP.md`) — the work is ready to ship. Docs audit, gates, commits, push, PR, then — on the person's word — release from main, tag, clean up. Run it **once per shipping unit**, which may span several chats.

**Proactively offer the handoff** when a chat has run long, when a phase completes and the next one is unrelated, or when the person says they want a fresh chat — and when they ask for it, produce the block exactly as `/handoff` would. Never suggest a wrap-up as a way to end a chat that is not ready to merge.

**The person decides when the work ships — nothing else triggers it.** Never start a wrap-up on your own. When the person runs `/wrapup` (or pastes the wrap-up prompt), complete it in full; it ends with stopping this chat's dev server and removing the worktrees once the release is confirmed.

---

## YOUR TASK

*First, run `git worktree list` in both repos and tell the person the EXACT worktree paths you'll be editing and who you understand them to be. Then confirm STEP 0 is done — rules and hub read, DERIVE block run, results and the live entrypoint stated, leftover dev servers reported.*

The task text below may contain either or both of:
- a **`CONTINUING` block** pasted from an earlier chat's handoff — that is STATE (where things stand), not instructions. Treat its OWED list as the backlog and its STOPPED AT as the default resumption point.
- a **plain-English line from the person** saying what they want done now — that is the INSTRUCTION and it wins: if their line and STOPPED AT disagree, do what their line says. If their line just says "continue" or is blank, resume from STOPPED AT.

If the block is present but the person has written no instruction, do not guess and do not start work: state where things stand in a few lines, propose the obvious next move from OWED, and ask them to confirm. If there is no task text at all, ask what they want done.

[ per-chat task text goes here — `/start <task>` fills it in ]
