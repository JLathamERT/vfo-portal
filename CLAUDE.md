# VFO portal — read this first

This folder is one half of the VFO portal; the same `CLAUDE.md` sits in both repos.

- **vfo-react** — the website and ALL the docs (`docs/`) · `C:\vfo-react` · github.com/JLathamERT/vfo-portal
- **vfo-edge-functions** — the backend · `C:\vfo-edge-functions` · github.com/JLathamERT/vfo-edge-functions

**Before any work, read `docs/TEAM_RULES.md` in full** from this chat's vfo-react worktree (a working directory under `C:\vfo-react\.claude\worktrees\`). If this chat has no vfo-react worktree, read `origin/main`'s copy: `git -C C:\vfo-react fetch origin`, then `git -C C:\vfo-react show origin/main:docs/TEAM_RULES.md`. It holds every standing rule, and the TEAM table tells you who you are working with.

Commands:
- `/start <what you want done>` — start a chat (runs `docs/prompts/SESSION_STARTER.md`)
- `/handoff` — the chat is long and the work is not finished: get the block that continues it in a new chat
- `/wrapup` — the work is ready to ship

Never, without the person's explicit word in this chat: deploy (`supabase functions deploy`, `npm run deploy`), merge, push, push a tag, or touch `boldsign-webhook`. Never edit the main folders `C:\vfo-react\` or `C:\vfo-edge-functions\` — only `.claude\worktrees\<name>\`. Never put a password, key or token in a file, a commit or the chat.
