---
description: Start a VFO chat — runs the session starter (docs/prompts/SESSION_STARTER.md)
argument-hint: <what you want done, and/or a CONTINUING block>
---
Find this chat's vfo-react worktree (a working directory under `C:\vfo-react\.claude\worktrees\`). Read `docs/prompts/SESSION_STARTER.md` there IN FULL and follow it exactly. If this chat has no vfo-react worktree, read `origin/main`'s copy instead: `git -C C:\vfo-react fetch origin`, then `git -C C:\vfo-react show origin/main:docs/prompts/SESSION_STARTER.md`.

The text for its YOUR TASK section is everything below this line (empty = ask the person what they want done):

$ARGUMENTS
