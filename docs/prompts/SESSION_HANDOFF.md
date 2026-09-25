<!-- CANONICAL COPY of the VFO mid-session handoff prompt. Paste this at the END of a chat
     that is getting long but is NOT ready to ship. Edit here, then re-copy. Last updated: 2026-09-25. -->

# MID-SESSION HANDOFF — close this chat without shipping

The work is not finished and nothing is merging. I am closing this chat only to start a fresh one with a clean context. **Ship nothing:** no wrap-up, no doc audit, no merge, no deploy, no tag, and do not remove the worktrees or delete the branch — the next chat continues in them.

Do these three things, in order.

## 1. Leave the tree in a state the next chat can pick up

- Commit work-in-progress on the current branch so nothing lives only in this conversation. A WIP commit is fine and expected here — subject line `wip: <what is half-done>`, and say in the body what is incomplete. Stage by path as always; never `git add -A`.
- If something genuinely should not be committed yet, say so explicitly in the handoff instead of committing it, and name the files.
- Do **not** push unless I ask — the branch is local and that is fine.
- Stop the dev server if this chat started one.

## 2. Give me the handoff block

Output it as ONE fenced code block I can copy in a single click, nothing else inside the fence. Keep it under about 20 lines — this is a pointer, not a summary of the conversation. Facts only; no reasoning, no recap of what we discussed.

```
CONTINUING — <one line: what this piece of work is>

Branch (both repos): <branch name>
React worktree:  C:\vfo-react\.claude\worktrees\<name>
Edge worktree:   C:\vfo-edge-functions\.claude\worktrees\<name>
Last commit:     <sha> <subject>          Uncommitted: <none | list the files>

DONE:      <bullet or two — what is finished and verified>
STOPPED AT: <where the work paused - the precise resumption point, concretely>
OWED:      <EVERY remaining job, one per line — see the rule below. "none" only if truly none>
UNTESTED:  <anything built but not click-tested, or explicitly deferred>
DECIDED:   <decisions the next chat must NOT re-open, with the reason in a few words>
GOTCHA:    <anything discovered this chat that is not yet written in the docs>

WHAT I WANT NEXT:
<leave this line EMPTY — Jake types it in the new chat>
```

Rules for the block:
- **STOPPED AT is one concrete resumption point**, not a phase name — "add the reschedule button to PFTEngagementTrack.jsx meeting 2" beats "continue phase D".
- **OWED is the checklist STOPPED AT is not.** STOPPED AT is where the work paused; OWED is everything else still outstanding, and it is the field most easily under-filled — a job you do not write here is a job that gets lost. Walk these five categories explicitly and write a line for each that applies, or state that it does not: (1) **gates not yet run** — smoke gate, `deno check`, `npm run build`, security advisor; (2) **code committed but NOT deployed** — say which change and that it must fold into the eventual deploy, never a version number; (3) **the other repo** — a frontend or backend half not yet built, tested or deployed; (4) **docs owed** — hub, CHANGELOG, GOTCHAS entries named in GOTCHA above, flow docs; (5) **anything I asked for this chat that has not been delivered.** If the DONE line says something is "NOT deployed" or "not started", it belongs in OWED too — DONE records what is finished, so a negative in DONE is a job that still needs a home here.
- **DECIDED exists to stop re-litigation.** If I ruled something out, record it and why, or the next chat will helpfully propose it again.
- **GOTCHA is the one that gets lost.** Anything you learned the hard way this chat that is not yet in `GOTCHAS.md` goes here, or it dies with this conversation.
- Deploy state is NOT carried in this block — the next chat derives it from the hub's DERIVE block. Never write a version number or tag here.

## 3. Tell me exactly what to paste next

One line: paste `SESSION_STARTER.md`, then this block as the task text, and type what I want into the empty `WHAT I WANT NEXT:` line. The starter's CONTINUING exception makes the new chat reuse this branch and these worktrees instead of creating new ones, and its STANDING PREFERENCES section already carries the never-deploy-unasked rules — I do not retype those.

---

**When the work is finally ready to ship** — possibly several chats later — that chat runs `SESSION_WRAPUP.md` once, for the whole change. The WIP commits made along the way are squashed by the "Squash and merge" that ends it, so a handoff leaves no trace on `main`.
