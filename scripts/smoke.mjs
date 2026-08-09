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
  // Two tracking screens with different shapes, because Batch 7B's partner card
  // and custody log are status-dependent: 103 is `arrived` (agent on site, no
  // ETA) and 109 is `certified` (terminal, full custody chain).
  '/track/PKP-2026-000103',
  '/track/PKP-2026-000109',
  '/profile',
  '/compliance',
  // The offer flow. These take an ?id= and are status-guarded — since Batch 7A
  // the guard is `status === 'offered'` exactly, and PKP-2026-000104 is the one
  // seeded pickup at that stage. Content-asserted below precisely so a silent
  // regression to redirecting shows up as a failure rather than a green 307.
  '/offer?id=PKP-2026-000104',
  '/offer-breakdown?id=PKP-2026-000104',
  // Batch 8. 105 is the one pickup at `collected`, so it carries the receipt
  // and the only `pending` payout; 106 onward are settled, which is the other
  // half of the payment screen.
  '/receipt/PKP-2026-000105',
  '/payment/PKP-2026-000105',
  '/payment/PKP-2026-000106',
  '/wallet',
  '/certificates/PKP-2026-000109',
  // ⚠ Do NOT add '/handover?id=…' here. That page calls acceptOffer() during
  // render, so a plain GET advances the pickup to `collected` — it would mutate
  // the demo data on every run and break the two offer routes above, which need
  // a pickup still at `offered`. See the Batch 6.5 notes.
  //
  // The payment screen is safe to fetch by contrast, and deliberately so:
  // settling is a POST form action, never something a render does. That is the
  // difference this batch was careful about.
]

// Batch 8 — the three PDF documents, fetched as bytes rather than HTML.
//
// `%PDF-` in the body is the load-bearing assertion: it is only there if the
// route rendered a real document with @react-pdf/renderer, wrote it to a
// private bucket and streamed it back. The equivalent of 7B's `token=` check —
// it proves the whole path, not that a component rendered.
const DOCUMENT_ROUTES = [
  '/api/documents/certificate/PKP-2026-000109',
  '/api/documents/receipt/PKP-2026-000105',
  // 106 is settled, so it has an invoice. 105 is still pending and has none —
  // asserted below as a rejection.
  '/api/documents/invoice/PKP-2026-000106',
]

// Document routes that must NOT return a PDF: no such document for this vendor.
const DOCUMENT_REJECTS = [
  // Pending payout → no invoice raised yet.
  '/api/documents/invoice/PKP-2026-000105',
  // `requested` → nothing collected, so no receipt.
  '/api/documents/receipt/PKP-2026-000101',
  // A pickup id that doesn't exist at all.
  '/api/documents/certificate/PKP-2026-999999',
]

// Routes whose STATUS GUARD must reject. Asserting a guard rejects is as much
// a part of proving it works as asserting it admits: since Batch 7A the offer
// screens are reachable at `offered` and nowhere else, so these two bouncing is
// the other half of that guarantee.
//
// ⚠ Asserted on ABSENT CONTENT, not on a 3xx + Location. Both offer routes have
// a `loading.tsx`, so Next flushes the shell before the guard runs and the
// redirect travels inside the RSC stream — the response is a 200 with no
// Location header even though the redirect is working. A status check here
// would fail on a correct app. Absent content is the signal that survives
// streaming.
const APP_REJECTS = {
  // scheduled — before the offer stage
  '/offer?id=PKP-2026-000102': ['Estimated Offer', 'Why this price?'],
  // collected — past it
  '/offer?id=PKP-2026-000105': ['Estimated Offer', 'Why this price?'],
  // Batch 8: nothing is collected at `requested`, so there is no receipt to
  // show. The screen must render its empty state, not receipt fields.
  '/receipt/PKP-2026-000101': ['Receipt number', 'Agreed payout'],
}

// Content that must appear on a logged-in route. A redirect returns no body, so
// asserting on text is also what proves the route RENDERED rather than bounced.
const APP_CONTENT = {
  '/offer?id=PKP-2026-000104': ['Estimated Offer', 'Why this price?'],
  '/offer-breakdown?id=PKP-2026-000104': ['Estimated Value', 'Why this valuation?'],
  // Batch 7B. `token=` on the img src is the part worth asserting: it only
  // appears if createSignedUrl actually minted a URL for a stored object, so it
  // proves the private-bucket read path end to end rather than just proving the
  // component rendered an empty photo row.
  '/track/PKP-2026-000103': [
    'Collection partner',
    'Ravi Kumar',
    'On site now',
    'Chain of custody',
    'Agent arrived',
    'View location',
    'token=',
  ],
  '/track/PKP-2026-000109': ['Chain of custody', 'Certified', 'Collected', 'token='],
  // Batch 8. The ₹ figures here are the D6 relaxation made visible — if the
  // "no value to the vendor" default ever gets re-applied wholesale, these fail
  // rather than the screens quietly going blank.
  '/receipt/PKP-2026-000105': [
    'Pickup receipt',
    'Receipt number',
    'RCP-2026-000105',
    'Agreed payout',
    '₹',
    'This is not your EPR certificate',
    'Download receipt',
  ],
  // Pending payout: the method picker must be there, and so must the honest
  // note that nothing real is moving.
  '/payment/PKP-2026-000105': [
    'Your payout',
    'Payable to you',
    'How should we pay you?',
    'UPI',
    'Bank transfer',
    'simulation',
  ],
  // Settled payout: confirmation, not a form.
  '/payment/PKP-2026-000106': ['You were paid', 'Paid to you', 'Payout sent', 'Download invoice'],
  '/wallet': ['Balance', 'Activity', 'Pickup payout', '₹'],
  // The certificate number is derived, not stored — asserting it proves the
  // screen and the PDF are computing it the same way.
  '/certificates/PKP-2026-000109': [
    'EPR Certificate',
    'Certificate no.',
    'CERT-2026-PKP-2026-000109-',
    'Download PDF',
  ],
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

  /**
   * Fetches one route and prints a verdict. `expectBounce` inverts the check to
   * "must redirect to /login"; `mustNotContain` proves a status guard REJECTED,
   * which a 3xx check cannot do on a streamed route (see APP_REJECTS).
   */
  async function probe(
    route,
    { expectBounce = false, mustContain = [], mustNotContain = [], anon = false } = {},
  ) {
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
    const leaked = mustNotContain.filter((s) => body.includes(s))

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
    else if (leaked.length) verdict = `GUARD LEAKED: ${leaked.join(' | ')}`
    else if (mustNotContain.length) verdict = 'guarded (correct)'
    else if (missing.length) verdict = `MISSING: ${missing.join(' | ')}`
    else if (badNav) verdict = `${navCount} TAB BARS (expected 1)`
    else verdict = 'ok'

    if (!['ok', 'blocked (correct)', 'guarded (correct)'].includes(verdict)) failures++
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

  // The other half of the status guard: these ids are NOT at `offered`, so the
  // offer screen must turn them away. In --blocked mode the role gate gets there
  // first and the expectation is a /login bounce instead.
  console.log('\n  — status guards (must reject) —')
  for (const [route, forbidden] of Object.entries(APP_REJECTS)) {
    await probe(route, {
      expectBounce: blocked,
      mustNotContain: blocked ? [] : forbidden,
    })
  }

  /**
   * Fetches a document route and checks it is a real PDF.
   *
   * Deliberately separate from probe(): these answer with bytes and a
   * Content-Type, not HTML, so the tab-bar and error-page heuristics don't
   * apply. `expectPdf: false` asserts the opposite — a 404/401, and above all
   * NOT a PDF, which is how "not yours / doesn't exist" is proven.
   */
  async function probeDocument(route, { expectPdf = true, expectBounce = false } = {}) {
    let status, type = '', head = '', note = ''
    try {
      const r = await fetch(`${BASE}${route}`, { headers: { Cookie }, redirect: 'manual' })
      status = r.status
      type = r.headers.get('content-type') ?? ''
      note = r.headers.get('location') ? `→ ${r.headers.get('location')}` : ''
      if (status === 200) {
        head = Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString('latin1')
      }
    } catch (e) {
      console.error(`  ERR   ${route}`, e.message)
      failures++
      return
    }

    const isPdf = type.includes('application/pdf') && head === '%PDF-'

    let verdict
    if (expectBounce) {
      verdict = note.includes('/login') ? 'blocked (correct)' : 'LEAKED THROUGH'
    } else if (expectPdf) {
      verdict = isPdf ? 'ok (real PDF)' : `NOT A PDF (${status}, ${type || 'no type'})`
    } else if (isPdf) {
      verdict = 'LEAKED A DOCUMENT'
    } else if (status === 404 || status === 401) {
      verdict = 'refused (correct)'
    } else {
      verdict = `UNEXPECTED ${status}`
    }

    if (!['ok (real PDF)', 'refused (correct)', 'blocked (correct)'].includes(verdict)) failures++
    console.log(`  ${String(status).padEnd(3)} ${route.padEnd(46)} ${verdict} ${note}`)
  }

  // ⚠ Documented exception to this script's read-only rule. The FIRST fetch of
  // a document renders the PDF, uploads it and writes the storage path to
  // `pdf_url`. That is idempotent caching of a value derived from the row — not
  // a lifecycle transition — so unlike /handover it cannot advance a pickup,
  // break another route, or change what any screen shows. Worth the write: it
  // is the only way to prove the render → upload → stream path end to end.
  console.log('\n  — documents (must be real PDFs) —')
  for (const route of DOCUMENT_ROUTES) {
    await probeDocument(route, { expectBounce: blocked })
  }

  console.log('\n  — documents (must refuse) —')
  for (const route of DOCUMENT_REJECTS) {
    await probeDocument(route, { expectPdf: false, expectBounce: blocked })
  }

  // Fetched WITHOUT the session cookie — that is the state they're built for,
  // and a logged-in hit on /login legitimately redirects to /dashboard, which
  // would make a content check meaningless. A rejected session that also
  // couldn't load /login would have nowhere to go, so these must always render.
  console.log('\n  — public auth routes (logged out) —')
  for (const route of PUBLIC_ROUTES) {
    await probe(route, { anon: true, mustContain: CONTENT[route] ?? [] })
  }

  const total =
    ROUTES.length +
    Object.keys(APP_REJECTS).length +
    DOCUMENT_ROUTES.length +
    DOCUMENT_REJECTS.length +
    PUBLIC_ROUTES.length
  console.log(
    failures === 0
      ? `\nAll ${total} routes behaved as expected.\n`
      : `\n${failures} of ${total} routes failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
