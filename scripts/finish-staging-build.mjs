import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The last step of `npm run build:staging` (docs/plans/staging/README.md, S4).
// Vite's --mode staging already points the app at staging (.env.staging). This
// finishes what Vite does not touch - the files copied as-is from public/ - and
// then PROVES the result before anything can publish it:
//   - CNAME = staging.vfoportal.com; robots.txt blocks everything; no sitemap;
//   - every page gets noindex and a "[TEST] " title;
//   - /store and the static pages use staging's project, key and address;
//   - REFUSES (exit 1, so gh-pages never runs) if dist is not a staging build, or
//     if any file still names live's project, live's anon key or vfoportal.com's
//     address.

const LIVE_PROJECT_URL = 'https://ejpsprsmhpufwogbmxjv.supabase.co'
const LIVE_REF = 'ejpsprsmhpufwogbmxjv'
const LIVE_PORTAL_URL = 'https://vfoportal.com'
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.txt', '.xml', '.json', '.svg', '.webmanifest'])

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function fail(msg) {
  console.error(`finish-staging-build: ${msg}`)
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(join(root, '.env.staging'), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
)
const STAGING_PROJECT_URL = env.VITE_SUPABASE_URL
const STAGING_PORTAL_URL = env.VITE_PORTAL_URL
const STAGING_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
if (!STAGING_PROJECT_URL || !STAGING_PORTAL_URL || !STAGING_ANON_KEY) fail('.env.staging is missing VITE_SUPABASE_URL, VITE_PORTAL_URL or VITE_SUPABASE_ANON_KEY')
if (STAGING_PROJECT_URL.includes(LIVE_REF)) fail('.env.staging points at the LIVE project')

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

if (!existsSync(join(dist, 'index.html'))) fail('dist/index.html missing - run vite build --mode staging first')
const files = walk(dist)
const text = files.filter(f => TEXT.has(extname(f).toLowerCase()))
if (!text.some(f => f.includes(`${join('dist', 'assets')}`) && readFileSync(f, 'utf8').includes(STAGING_PROJECT_URL))) {
  fail('dist is not a staging build (no asset calls the staging project) - use npm run build:staging')
}

// Live's anon key, read from the source /store page rather than repeated here.
const liveAnonKey = /const ANON_KEY = '([^']+)'/.exec(readFileSync(join(root, 'public', 'store', 'data.js'), 'utf8'))?.[1]
if (!liveAnonKey) fail('could not read live\'s anon key from public/store/data.js')

writeFileSync(join(dist, 'CNAME'), new URL(STAGING_PORTAL_URL).host + '\n')
writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
rmSync(join(dist, 'sitemap.xml'), { force: true })

let rewritten = 0
for (const f of walk(dist).filter(f => TEXT.has(extname(f).toLowerCase()))) {
  const before = readFileSync(f, 'utf8')
  let after = before
    .split(LIVE_PROJECT_URL).join(STAGING_PROJECT_URL)
    .split(liveAnonKey).join(STAGING_ANON_KEY)
    .split(LIVE_PORTAL_URL).join(STAGING_PORTAL_URL)
  if (extname(f).toLowerCase() === '.html') {
    if (!/<meta name="robots"/i.test(after)) after = after.replace(/<head([^>]*)>/i, '<head$1>\n    <meta name="robots" content="noindex, nofollow">')
    after = after.replace(/<title>(?!\[TEST\] )/i, '<title>[TEST] ')
  }
  if (after !== before) { writeFileSync(f, after); rewritten++ }
}

// The proof: nothing left that reaches or claims to be live, and every page is noindex.
const problems = []
for (const f of walk(dist).filter(f => TEXT.has(extname(f).toLowerCase()))) {
  const body = readFileSync(f, 'utf8')
  const rel = relative(dist, f)
  if (body.includes(LIVE_REF)) problems.push(`${rel}: names the live project`)
  if (body.includes(liveAnonKey)) problems.push(`${rel}: holds live's anon key`)
  if (body.includes(LIVE_PORTAL_URL)) problems.push(`${rel}: links to ${LIVE_PORTAL_URL}`)
  if (extname(f).toLowerCase() === '.html' && /<head/i.test(body) && !/<meta name="robots" content="noindex/i.test(body)) problems.push(`${rel}: no noindex`)
}
if (readFileSync(join(dist, 'CNAME'), 'utf8').trim() !== new URL(STAGING_PORTAL_URL).host) problems.push('CNAME is not the staging address')
if (problems.length) fail(`NOT SAFE TO PUBLISH:\n  ${problems.join('\n  ')}`)

console.log(`finish-staging-build: ${rewritten} files pointed at staging; ${files.length} files checked - nothing names live`)
