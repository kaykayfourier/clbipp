/**
 * Logged-in smoke test for the customer app.
 *
 *   npm run dev            # in another terminal
 *   npm run smoke          # every screen, as business@test
 *   npm run smoke -- agent@test demo1234 --blocked
 *
 * `--blocked` inverts every expectation: the run passes only if EVERY app route
 * bounces to /login. That is how the Batch 6 role gate is verified — a
 * non-customer session must not reach the customer app at all, so for those
 * accounts "bounced to login" is the pass condition, not the failure.
 *
 * Why this exists: `npm run build` type-checks but never renders a page with a
 * real session, so a server component that throws at request time (a bad Prisma
 * include, a Decimal crossing the client boundary, a missing await) builds
 * green and 500s in the browser. This logs in against the real Supabase project,
 * forges the @supabase/ssr session cookie, and fetches every route — which is
 * the check that actually catches those.
 *
 * Read-only: it never POSTs to the app, so it can't mutate the demo data.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

// Routes worth checking on every batch. Add new screens here as they land.
const ROUTES = [
  '/dashboard',
  '/addresses',
  '/addresses/new',
  '/book',
  '/request-pickup',
  '/track',
  '/profile',
  '/compliance',
  // The offer flow. These take an ?id= and are status-guarded, so before the
  // Batch 6.5 seed fix they redirected for every seeded pickup and could not be
  // demoed at all. They are content-asserted below precisely so a silent
  // regression to redirecting shows up as a failure rather than a green 307.
  '/offer?id=PKP-2026-000102',
  '/offer-breakdown?id=PKP-2026-000102',
  // ⚠ Do NOT add '/handover?id=…' here. That page calls acceptOffer() during
  // render, so a plain GET advances the pickup to `collected` — it would mutate
  // the demo data on every run and break the two offer routes above, which need
  // a pickup still at `scheduled`. See the Batch 6.5 notes.
]

// Content that must appear on a logged-in route. A redirect returns no body, so
// asserting on text is also what proves the route RENDERED rather than bounced.
const APP_CONTENT = {
  '/offer?id=PKP-2026-000102': ['Estimated Offer', 'Why this price?'],
  '/offer-breakdown?id=PKP-2026-000102': ['Estimated Value', 'Why this valuation?'],
}

// Public auth screens. Checked separately because the role gate must NOT touch
// them — if `--blocked` bounced these too, a rejected agent would have no way
// back to a login form. /verify needs its email param or it redirects to /login
// by design (see the page's comment).
const PUBLIC_ROUTES = ['/login', '/signup', '/verify?email=demo%40example.com']

// Substrings that must appear on a rendered page. Status alone proves a route
// answered, not that it rendered the right thing (Batch 5 precedent).
const CONTENT = {
  '/login': ['Email me a login code', 'Send code', 'Log in'],
  '/verify?email=demo%40example.com': ['6-digit code', 'demo@example.com'],
  '/signup': ['Individual', 'Fleet / company'],
}

// Note the `KEY =value` spacing and quoted values in .env.local — Next's dotenv
// tolerates both, a naive split does not (same trap as packages/database/prisma/env.ts).
function loadEnv(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
}

/**
 * @supabase/ssr stores the whole session as `base64-` + base64(JSON), split
 * across `.0`, `.1` … cookies once it exceeds the per-cookie size limit.
 */
function sessionCookie(session, projectRef) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const CHUNK = 3180
  const name = `sb-${projectRef}-auth-token`

  if (raw.length <= CHUNK) return `${name}=${raw}`

  const parts = []
  for (let i = 0, n = 0; i < raw.length; i += CHUNK, n++) {
    parts.push(`${name}.${n}=${raw.slice(i, i + CHUNK)}`)
  }
  return parts.join('; ')
}

async function main() {
  const args = process.argv.slice(2)
  const blocked = args.includes('--blocked')
  const [email = 'business@test', password = 'businesstest'] = args.filter(
    (a) => !a.startsWith('--'),
  )

  const env = loadEnv(path.join(ROOT, 'apps/customer/.env.local'))
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await res.json()

  if (!session.access_token) {
    console.error(`Login failed for ${email}:`, session.error_description ?? session)
    process.exit(1)
  }

  const Cookie = sessionCookie(session, projectRef)
  console.log(
    `\nSmoke test — ${BASE} as ${email}` +
      (blocked ? '  [--blocked: app routes MUST bounce to /login]' : '') +
      '\n',
  )

  let failures = 0

  /** Fetches one route and prints a verdict. `expectBounce` inverts the check. */
  async function probe(route, { expectBounce = false, mustContain = [], anon = false } = {}) {
    let status, body = '', note = ''
    try {
      const r = await fetch(`${BASE}${route}`, {
        headers: anon ? {} : { Cookie },
        redirect: 'manual',
      })
      status = r.status
      if (status === 200) body = await r.text()
      const location = r.headers.get('location')
      if (location) note = `→ ${location}`
    } catch (e) {
      console.error(`  ERR   ${route}  (is \`npm run dev\` running?)`, e.message)
      failures++
      return
    }

    // A Next error page still returns 200, so status alone proves nothing.
    const errored = /__next_error__|Application error|Internal Server Error/.test(body)
    const redirectedToLogin = note.includes('/login')
    const missing = mustContain.filter((s) => !body.includes(s))

    // Exactly one bottom tab bar. AppShell renders its own unless `hideNav` is
    // passed, and (app)/layout.tsx renders one for every authenticated screen —
    // so a page that forgets `hideNav` stacks two. Cheap to assert, and it can
    // only regress by someone adding an AppShell without the flag.
    const navCount = (body.match(/aria-label="Main navigation"/g) ?? []).length
    const badNav = status === 200 && !anon && navCount !== 1

    let verdict
    if (errored || status >= 500) verdict = 'ERROR PAGE'
    else if (expectBounce) verdict = redirectedToLogin ? 'blocked (correct)' : 'LEAKED THROUGH'
    else if (redirectedToLogin) verdict = 'BOUNCED TO LOGIN'
    else if (missing.length) verdict = `MISSING: ${missing.join(' | ')}`
    else if (badNav) verdict = `${navCount} TAB BARS (expected 1)`
    else verdict = 'ok'

    if (verdict !== 'ok' && verdict !== 'blocked (correct)') failures++
    console.log(`  ${String(status).padEnd(3)} ${route.padEnd(34)} ${verdict} ${note}`)
  }

  console.log('  — app routes —')
  for (const route of ROUTES) {
    // In --blocked mode the pass condition is a bounce to /login, so there is no
    // body to assert against.
    await probe(route, {
      expectBounce: blocked,
      mustContain: blocked ? [] : (APP_CONTENT[route] ?? []),
    })
  }

  // Fetched WITHOUT the session cookie — that is the state they're built for,
  // and a logged-in hit on /login legitimately redirects to /dashboard, which
  // would make a content check meaningless. A rejected session that also
  // couldn't load /login would have nowhere to go, so these must always render.
  console.log('\n  — public auth routes (logged out) —')
  for (const route of PUBLIC_ROUTES) {
    await probe(route, { anon: true, mustContain: CONTENT[route] ?? [] })
  }

  const total = ROUTES.length + PUBLIC_ROUTES.length
  console.log(
    failures === 0
      ? `\nAll ${total} routes behaved as expected.\n`
      : `\n${failures} of ${total} routes failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
