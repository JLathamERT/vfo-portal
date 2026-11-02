# vfo-react

Frontend for VFO Services Portal — admin and member portals + public-token landing pages (`/decide`, `/pay`).

Vite + React 18 + react-router-dom v6, deployed as a static site to GitHub Pages at https://vfoportal.com/.

The backend is a separate repo: [`vfo-edge-functions`](https://github.com/JLathamERT/vfo-edge-functions).

## Quick links

- **Live portal:** https://vfoportal.com/
- **Architecture docs:** [`docs/`](docs/) — system map, frontend shell, edge functions, action catalog, auth, integrations, tables, flows
- **Backend docs:** [`docs/architecture/03-edge-functions.md`](docs/architecture/03-edge-functions.md)

## Local development

```powershell
npm install
npm run dev
```

Opens at http://localhost:5173/.

By default, local dev hits the **production** Supabase function. To point at a locally-running edge function:

```powershell
$env:VITE_API_URL = "http://127.0.0.1:54321/functions/v1/vfo-admin-api"
npm run dev
```

`VITE_API_URL` is honored by every file that calls the backend (42, `grep -rl VITE_API_URL src`). When the env var is unset, each falls back to the hardcoded production URL — production behavior unchanged.

## Deploy

```powershell
npm run deploy
```

Runs `vite build && gh-pages -d dist`. Pushes the built bundle to the `gh-pages` branch; GitHub Pages serves it at the URL above. No CI/CD — deploys are manual.

**Staging** (the team's test copy, https://staging.vfoportal.com/):
- `npm run build:staging` = `vite build --mode staging` (values from `.env.staging`), the route pages, then `scripts/finish-staging-build.mjs`. That script points the copied files at staging, adds `noindex` and the `[TEST] ` title, and REFUSES if anything still names live.
- `npm run deploy:staging` = that build, then `gh-pages` to `JLathamERT/vfo-portal-staging`. It needs the same explicit "deploy" as live.

## Repo layout

```
src/
├── App.jsx              Route table (8 routes)
├── lib/api.js           Single client to vfo-admin-api (callApi + session helpers)
├── pages/               Top-level page components (1 per route)
├── components/
│   ├── admin/           Admin-side panels and per-feature tabs
│   ├── member/          Member-side panels and per-feature tabs
│   └── shared/          Components used by both (CIQ, Vault, Plugin, etc.)
└── ...

docs/                    Architecture documentation
├── README.md            Doc index
├── architecture/        System map, frontend shell, edge functions, auth, action catalog, file orchestration
├── flows/               End-to-end feature flows
├── integrations/        Per-integration deep-dives (Stripe, BoldSign, Gmail, Drive, Sheets, Supabase, env-vars)
└── tables/              DB schema documentation by domain
```

## Auth model

Custom session-token scheme (NOT Supabase Auth). Identity in `allowed_admins` (admin) and `member_logins` (member); active sessions in `admin_sessions`. Tokens are 32-byte hex, 8-hour TTL. Frontend stores the active session in `sessionStorage.vfo_session`.

Public-token pages (`/decide`, `/pay`) bypass session entirely and authenticate via URL token (`pipeline_map1.c15_token` / `pipeline_map1.checkout_token`). See [`docs/architecture/04-auth-and-sessions.md`](docs/architecture/04-auth-and-sessions.md).

## What's NOT in the repo

- No tests (no test runner, no `__tests__`)
- No TypeScript (only the backend has it)
- No CI/CD
- No backend code (lives in `vfo-edge-functions`)
- No DB migrations (managed remotely on the Supabase project)

See [`docs/architecture/01-system-map.md`](docs/architecture/01-system-map.md) for the full picture.
