import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Dev only, for the phone preview (src/dev/PhonePreview.jsx):
// 1. print its link under Vite's own URLs, so every `npm run dev` hands it out
//    whatever port it landed on;
// 2. hand its remembered test sign-ins from one browser to another (Jake's Chrome,
//    where his passwords live, to the Claude app's browser pane) through this
//    server's MEMORY - never a file, gone when the server stops, admin never, and
//    readable only by this server's own pages on localhost.
const SIGNIN_ROLES = new Set(['member', 'client', 'specialist', 'tax_planner'])

function sendJson(res, body) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function phonePreview() {
  let signIns = {}
  return {
    name: 'vfo-phone-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__phone-preview/signins', (req, res) => {
        const host = req.headers.host || ''
        const origin = req.headers.origin
        const site = req.headers['sec-fetch-site']
        const ownPage = ['localhost', '127.0.0.1'].includes(host.split(':')[0])
          && (!origin || origin === `http://${host}`)
          && (!site || site === 'same-origin')
          && req.headers['x-vfo-phone-preview'] === '1'
        if (!ownPage) { res.statusCode = 403; res.end(); return }
        if (req.method === 'DELETE') { signIns = {}; sendJson(res, signIns); return }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk; if (body.length > 64000) req.destroy() })
        req.on('end', () => {
          try {
            for (const [role, v] of Object.entries(JSON.parse(body || '{}'))) {
              if (!SIGNIN_ROLES.has(role) || v?.session?.role !== role || typeof v.session.token !== 'string' || typeof v.saved_at !== 'number') continue
              if (!signIns[role] || signIns[role].saved_at < v.saved_at) signIns[role] = { session: v.session, saved_at: v.saved_at }
            }
            sendJson(res, signIns)
          } catch { res.statusCode = 400; res.end() }
        })
      })
      const printUrls = server.printUrls
      server.printUrls = () => {
        printUrls()
        const local = server.resolvedUrls?.local?.[0]
        if (local) server.config.logger.info(`  \x1b[32m➜\x1b[0m  \x1b[1mPhone preview\x1b[0m: \x1b[36m${local}phone-preview\x1b[0m`)
        const api = server.config.env.VITE_API_URL
        if (api) server.config.logger.info(`  \x1b[32m➜\x1b[0m  \x1b[1mBackend\x1b[0m:       \x1b[36m${api.split('/').pop()}\x1b[0m`)
      }
    },
  }
}

// The commit this build came from, for the test site's Staging tab. Vite reads
// VITE_* from the process, so this reaches the dev server and every build alike.
try {
  process.env.VITE_BUILD_SHA = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch {
  process.env.VITE_BUILD_SHA = ''
}

// `npm run dev` only (the dev server, test site): talk to your OWN copy of the
// backend, vfo-admin-api-<name>, when this computer sets VFO_TEST_BACKEND=<name>
// (TEAM_RULES §4). Never a build, so the test website and live always use the
// shared vfo-admin-api. VFO_TEST_BACKEND=shared, or unset, keeps the shared one.
function ownTestBackend(command, mode) {
  const name = (process.env.VFO_TEST_BACKEND || '').trim().toLowerCase()
  if (command !== 'serve' || mode !== 'staging' || !name || name === 'shared') return
  if (!/^[a-z]+$/.test(name)) throw new Error(`VFO_TEST_BACKEND must be a first name like "jake", not "${name}"`)
  const shared = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL || ''
  if (!/\/functions\/v1\/vfo-admin-api$/.test(shared)) throw new Error(`Can't find the shared test backend in .env.${mode}`)
  process.env.VITE_API_URL = `${shared}-${name}`
}

export default defineConfig(({ command, mode }) => (ownTestBackend(command, mode), {
  plugins: [react(), phonePreview()],
  base: '/',
  // Dev-only: keep the dependency scanner on the app entry — public/store/ is a
  // self-contained static page whose bare "three" import resolves via its own importmap.
  optimizeDeps: { entries: ['index.html'] },
  // React, the router and Sentry change far less often than the app, so they get
  // their own long-lived file the browser keeps across deploys and portals.
  build: {
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom', '@sentry/react'] },
      },
    },
  },
  server: {
    historyApiFallback: true
  }
}))