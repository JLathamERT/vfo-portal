import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// GitHub Pages has no SPA rewrite: a request for a client-side route is a real
// HTTP 404 rescued only by the JS in public/404.html. Humans never notice;
// scanners, spam filters and link checkers stop at the 404 and read it as
// cloaking. Writing dist/<route>/index.html makes each route a genuine 200.
// Every path emailed to a client or partner belongs in this list.
const ROUTES = [
  'accountant-decide',
  'accountant-pay',
  'advisor-decide',
  'advisor-pay',
  'client-setup',
  'connect-card',
  'decide',
  'forgot-password',
  'map4-form',
  'member-setup',
  'membership-meeting',
  'membership-pay',
  'onboarding-meeting',
  'pay',
  'payout-setup',
  'pft-decide',
  'pft-discovery',
  'pft-ft-decide',
  'pip-pay',
  'set-password',
  'specialist-ddc',
  'specialist-ddc-help',
  'specialist-pay',
  'specialist-questions',
  'specialist-revenue-pay',
  'specialist-revshare-final',
  'specialist-sif',
  'tax-decide',
  'tax-diagnostic',
  'tax-implement-decide',
  'tax-intake',
  'tax-pay',
  'tax-postreview-decide',
  'tax-upload',
  'update-card',
  'vault-upload',
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const source = join(dist, 'index.html')

if (!existsSync(source)) {
  console.error('emit-route-pages: dist/index.html missing - run vite build first')
  process.exit(1)
}

for (const route of ROUTES) {
  const dir = join(dist, route)
  mkdirSync(dir, { recursive: true })
  copyFileSync(source, join(dir, 'index.html'))
}

console.log(`emit-route-pages: wrote ${ROUTES.length} route pages`)
