/**
 * Logged-in smoke test for the customer app.
 *
 *   npm run dev            # in another terminal
 *   npm run smoke          # every screen, as business@test
 *   npm run smoke -- agent@test demo1234
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
]

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
  const [email = 'business@test', password = 'businesstest'] = process.argv.slice(2)

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
  console.log(`\nSmoke test — ${BASE} as ${email}\n`)

  let failures = 0

  for (const route of ROUTES) {
    let status, body = '', note = ''
    try {
      const r = await fetch(`${BASE}${route}`, { headers: { Cookie }, redirect: 'manual' })
      status = r.status
      if (status === 200) body = await r.text()
      const location = r.headers.get('location')
      if (location) note = `→ ${location}`
    } catch (e) {
      console.error(`  ERR   ${route}  (is \`npm run dev\` running?)`, e.message)
      failures++
      continue
    }

    // A Next error page still returns 200, so status alone proves nothing.
    const errored = /__next_error__|Application error|Internal Server Error/.test(body)
    const redirectedToLogin = note.includes('/login')

    if (errored || redirectedToLogin || status >= 500) failures++

    const verdict = errored ? 'ERROR PAGE' : redirectedToLogin ? 'BOUNCED TO LOGIN' : 'ok'
    console.log(`  ${String(status).padEnd(3)} ${route.padEnd(20)} ${verdict} ${note}`)
  }

  console.log(
    failures === 0
      ? `\nAll ${ROUTES.length} routes rendered.\n`
      : `\n${failures} of ${ROUTES.length} routes failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
