---
description: Close a long VFO chat without shipping — gives the block that continues it in a new chat (docs/prompts/SESSION_HANDOFF.md)
argument-hint: <optional: anything the next chat must know>
---
Find this chat's vfo-react worktree (a working directory under `C:\vfo-react\.claude\worktrees\`). Read `docs/prompts/SESSION_HANDOFF.md` there IN FULL and do it now, exactly. If this chat has no vfo-react worktree, read `origin/main`'s copy instead: `git -C C:\vfo-react fetch origin`, then `git -C C:\vfo-react show origin/main:docs/prompts/SESSION_HANDOFF.md`.

Anything extra the person wants carried into the block:

$ARGUMENTS
