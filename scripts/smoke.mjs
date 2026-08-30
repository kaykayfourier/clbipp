/**
 * Logged-in smoke test. Runs against either app in the monorepo.
 *
 *   npm run dev                  # customer, :3000, in another terminal
 *   npm run dev:agent            # agent,    :3001, in another terminal
 *   npm run dev:admin            # admin,    :3002, in another terminal
 *
 *   npm run smoke                            # customer, as business@test
 *   npm run smoke -- --app=agent             # agent, as agent@test
 *   npm run smoke -- --app=admin             # admin, as admin@test
 *
 * The role gate, in every direction. All SIX of these must bounce — three apps
 * means six wrong-role pairings, and a gate only ever tested one way is
 * indistinguishable from a gate that blocks everyone:
 *
 *   npm run smoke -- --app=agent --blocked business@test businesstest
 *   npm run smoke -- --app=admin --blocked business@test businesstest
 *   npm run smoke -- --app=admin --blocked agent@test demo1234
 *   npm run smoke -- --app=agent --blocked admin@test demo1234
 *   npm run smoke -- --blocked agent@test demo1234
 *   npm run smoke -- --blocked admin@test demo1234
 *
 * `--app=` selects which app to point at (default `customer`); it swaps the
 * base URL, the .env.local read for Supabase credentials, the default account
 * and the route tables. The document, export and public-tracking sections are
 * customer-only and are skipped for other apps — those routes do not exist
 * there yet, and asserting on absent features passes vacuously.
 *
 * `--blocked` inverts every expectation: the run passes only if EVERY app route
 * bounces to /login. That is how the role gate is verified — a session with the
 * wrong role must not reach the app at all, so for those accounts "bounced to
 * login" is the pass condition, not the failure. It is what proves the boundary
 * runs in BOTH directions: an agent barred from the customer app, and a vendor
 * barred from the agent app.
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
// Set in main() once --app has been read. SMOKE_BASE_URL still wins, which is
// how a deployed preview gets smoke-tested.
let BASE = 'http://localhost:3000'

// ─── Customer app ────────────────────────────────────────────────────────────
// Everything from here to the AGENT block below is the customer app's, exactly
// as it was before apps/agent existed. The names are unprefixed for that
// reason — moving them would make the diff of adding a second app look like a
// rewrite of the first.

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
  // Batch 5b. 104 is the one pickup at `offered` with its offer NOT yet
  // accepted — the "awaiting the vendor" half of the D7 seam. The accepted half
  // has no seeded pickup on purpose (see the note on APP_REJECTS below).
  '/track/PKP-2026-000104',
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
  // Batch 10 — the P2 screens.
  '/invoices',
  '/invoices/PKP-2026-000106',
  '/history',
  // Repeat booking. 109 is certified and carries real booking photos, which is
  // exactly why it's the one used here — see the assertion below.
  '/book?from=PKP-2026-000109',
  // Batch 11. business@test HAS a profile row, so the pass condition is that
  // the form does NOT render — see ONBOARDING_ISOLATION below.
  '/onboarding',
  // Batch 12. This route was excluded from Batch 6.5 to Batch 11 because the
  // page called acceptOffer() during its own render, so a plain GET advanced the
  // pickup to `collected` — it mutated the demo data on every run and broke the
  // two offer routes above, which need a pickup still at `offered`.
  //
  // The accept is now `acceptOfferAndConfirm`, a POST form action, and this page
  // is a pure read — so it is finally safe to fetch, and being in this list is
  // what stops it regressing. 105 is already `collected`, so the confirmation is
  // the correct thing to render for it. The pickup that must NOT be advanced by
  // a GET is asserted separately in APP_REJECTS.
  '/handover?id=PKP-2026-000105',
  // The payment screen is safe to fetch for the same reason: settling is a POST
  // form action, never something a render does.
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

// Batch 9 — the compliance CSV export, fetched as a file rather than HTML.
//
// `CERT-2026-PKP-2026-000109-PORTABLE` in the body is the load-bearing
// assertion, the equivalent of 7B's `token=` and 8's `%PDF-`: the certificate
// number is DERIVED, never stored, so it is only in the file if the route ran
// the real ownership-scoped query and serialised the row through
// certificateNumber(). The header row proves the column contract separately.
const EXPORT_ROUTES = {
  '/api/exports/compliance': [
    'certificate_number,pickup_id,certified_on',
    'CERT-2026-PKP-2026-000109-PORTABLE',
    '/t/',
  ],
  // The year filter the screen passes through. 2026 holds the seeded
  // certificate; 1999 must come back as headers and nothing else — a filter
  // that silently returns everything is worse than one that returns nothing.
  '/api/exports/compliance?year=2026': ['CERT-2026-PKP-2026-000109-PORTABLE'],
}
const EXPORT_EMPTY = '/api/exports/compliance?year=1999'

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
  // Batch 12 — half of the assertion that the accept is no longer a GET. 104 is
  // still at `offered` and nobody has accepted it, so /handover must show no
  // confirmation. Paired with OFFER_SURVIVED_GET below, which is the half that
  // proves nothing was WRITTEN — this one alone would still pass if the page
  // advanced the pickup and then redirected.
  //
  // ⚠ Batch 5b added the SECOND string, and it is not decorative. /handover now
  // has two headings: 'Handover Confirmed' once the agent has collected, and
  // 'Offer Accepted' while the pickup is still at `offered` with a stamped
  // `acceptedAt`. Asserting only the first would pass vacuously the moment the
  // acceptance guard broke, because the page would render the OTHER heading —
  // the Batch 10 vacuous-assertion lesson, one heading later.
  '/handover?id=PKP-2026-000104': ['Handover Confirmed', 'Offer Accepted'],
}

// The other half, and the load-bearing one. Re-fetched AFTER the /handover probe
// above, deliberately: '/offer?id=PKP-2026-000104' is also asserted in
// APP_CONTENT, but ROUTES runs before APP_REJECTS, so that earlier pass says
// nothing about the state afterwards. This route renders only while the pickup
// is still at `offered` — so if a GET to /handover ever advances it again (the
// Batch 6.5 bug), the pickup lands on `collected`, the guard turns this away,
// and the run fails here.
const OFFER_SURVIVED_GET = {
  '/offer?id=PKP-2026-000104': ['Estimated Offer', 'Why this price?'],
}

// Content that must appear on a logged-in route. A redirect returns no body, so
// asserting on text is also what proves the route RENDERED rather than bounced.
const APP_CONTENT = {
  // Batch 9 (B4). The impact card is certificate-derived, so these three assert
  // the whole chain: a stored co2_avoided_kg, a material folded out of the
  // materialSummary JSON, and the wallet cache formatted by formatPaise.
  '/dashboard': ['CO₂e avoided', 'From your issued certificates', 'Nickel', 'Wallet', '₹'],
  // The export button was dead until Batch 9 — asserting the href is what stops
  // it silently reverting to a <Button> with no handler.
  '/compliance': ['Compliance log', 'Export for CPCB return', '/api/exports/compliance'],
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
  // Batch 5b — the "awaiting the vendor" half of the split `offered` stage.
  // Both strings come from the NOT-accepted branch; the accepted branch says
  // 'Offer accepted' and 'View acceptance' instead, so a guard that inverted
  // would fail here rather than render a plausible-looking screen.
  '/track/PKP-2026-000104': ['Your offer is ready', 'View offer'],
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
  // ── Batch 10 ──────────────────────────────────────────────────────────────
  // The invoice number is DERIVED from the pickup serial by the seed and by
  // `invoiceNumber()` independently, so asserting it here proves the list ran
  // the real scoped query rather than rendering an empty state.
  '/invoices': ['Invoices', 'INV-2026-000106', '₹', 'Paid'],
  // Rendered from the same `getInvoiceDoc` the PDF template consumes — these
  // assert the shared mapper actually produced lines and totals.
  '/invoices/PKP-2026-000106': [
    'INV-2026-000106',
    'Items',
    'Subtotal',
    'Total',
    'Download invoice',
    '₹',
  ],
  '/history': ['Pickup history', 'Book this again', 'PKP-2026-000109', 'Completed'],
  // Repeat booking. Asserted as two separate substrings on purpose: React
  // splits `Copied from {id}` into separate text nodes with `<!-- -->` markers
  // between them, so the concatenated sentence never appears in the HTML.
  // "Copied from" proves the prefill branch ran; the id proves it read THIS
  // pickup.
  '/book?from=PKP-2026-000109': ['Copied from', 'PKP-2026-000109', 'Portable'],
  // Batch 12. 105 is `industrial`, 6 + 3 units and 240 + 120 kg across its two
  // BatteryItem lines. Asserting the summed figures is the point: the old query
  // read the schema-v1 `battery_type` / `approx_quantity` columns, which nothing
  // has written since Batch 5, so this card used to render a blank type and the
  // literal string "null units". Numbers that can only come from the item rows
  // are what proves it is reading the live shape.
  '/handover?id=PKP-2026-000105': [
    'Handover Confirmed',
    'PKP-2026-000105',
    'Industrial',
    '9 units',
    '360 kg',
  ],
}

// The half of repeat booking that actually matters. PKP-2026-000109 carries
// real booking photos in the private bucket, and `draftFromPickup` deliberately
// copies none of them — a photo is evidence of one specific consignment.
// `token=` is the tell: it appears in the HTML only if a signed URL was minted
// for a stored object, so its ABSENCE here proves no old photo rode along.
const BOOK_PREFILL_ISOLATION = {
  '/book?from=PKP-2026-000109': ['token='],
}

// ── Batch 11 — /onboarding ───────────────────────────────────────────────────
// The screen that finishes an OAuth account by writing its profiles row. Every
// seeded account already HAS one, so what is assertable here is the guard, not
// the form: the middleware must redirect an onboarded session to /dashboard
// before the account-type selector can render.
//
// That matters because the form posts an INSERT. A user who can re-open it
// after onboarding is a user posting a second insert over a row that exists.
//
// ⚠ The profile-LESS case — the state Google actually produces — cannot be
// reached from here: this script authenticates as a seeded user, and creating a
// profile-less auth user would leave one behind on every run. It is covered by
// packages/auth/src/middleware.test.ts instead, and end to end by the throwaway
// verification script.
// ⚠ Every string here is asserted to genuinely APPEAR for a profile-less
// session by the batch's verification script. A `mustNotContain` on copy that
// exists nowhere passes vacuously — the Batch 10 lesson, and the reason these
// three were checked against the real page rather than written from the source.
const ONBOARDING_ISOLATION = {
  '/onboarding': ['SIGNED IN AS', 'what kind of account is this', 'Not you? Sign out'],
}

// ── /t/<publicToken> — the public tracking page (Batch 10) ───────────────────
// Never smoke-tested before this batch, because `publicToken` defaulted to
// gen_random_uuid() and changed on every reseed. The seed now derives it from
// the pickup serial (`demoPublicToken` in reset-demo.ts), so these URLs are
// stable.
//
// Fetched ANONYMOUSLY — that is the whole point of the route, and it is also
// why they are not in ROUTES: under `--blocked` every app route must bounce to
// /login and these must not.
//
// Each asserts BOTH halves: that the page rendered, and that the deliberate
// isolation held. The `mustNotContain` list is the load-bearing one — the
// equivalent of 7B's `token=` and 8's `%PDF-`. `token=` appearing here would
// mean a signed photo URL was minted for an anonymous bearer of a forwardable
// link, and `Collection partner` would mean an agent's personal phone number
// was handed to a stranger.
const PUBLIC_TRACK_ROUTES = {
  // arrived — the richest case: this pickup HAS custody photos and an assigned
  // agent on the authenticated screen, so it is the one where a leak would show.
  '/t/00000000-0000-4000-8000-000000000103': {
    mustContain: ['PKP-2026-000103', 'Lifecycle', 'Chain of custody', 'Agent arrived', 'View location'],
    mustNotContain: ['token=', 'Collection partner', 'Ravi Kumar'],
  },
  '/t/00000000-0000-4000-8000-000000000109': {
    mustContain: ['PKP-2026-000109', 'Recovery summary', 'certified'],
    mustNotContain: ['token=', 'Collection partner', 'View certificate'],
  },
  '/t/00000000-0000-4000-8000-000000000110': {
    mustContain: ['PKP-2026-000110', 'Cancelled', 'cancelled'],
    mustNotContain: ['token=', 'Collection partner'],
  },
}

/** A well-formed but unknown token must 404, not 500 and not leak a page. */
const PUBLIC_TRACK_UNKNOWN = '/t/00000000-0000-4000-8000-000000000999'

// Public auth screens. Checked separately because the role gate must NOT touch
// them — if `--blocked` bounced these too, a rejected agent would have no way
// back to a login form. /verify needs its email param or it redirects to /login
// by design (see the page's comment).
const PUBLIC_ROUTES = ['/login', '/signup', '/verify?email=demo%40example.com']

// Substrings that must appear on a rendered page. Status alone proves a route
// answered, not that it rendered the right thing (Batch 5 precedent).
const CONTENT = {
  // 'Continue with Google' is Batch 11. It must be on BOTH screens: with OAuth
  // there is no difference between signing in and signing up, and a user who
  // only ever sees it on one of them will look for it on the other.
  '/login': ['Email me a login code', 'Send code', 'Log in', 'Continue with Google'],
  '/verify?email=demo%40example.com': ['6-digit code', 'demo@example.com'],
  '/signup': ['Individual', 'Fleet / company', 'Continue with Google'],
}

// Batch 11. /onboarding needs a SESSION but not a role — it is where a
// profile-less OAuth user lands. It is deliberately NOT in the middleware's
// publicPaths, and this is the assertion that keeps it that way: a future
// redirect loop must not be "fixed" by making the profile-writing form
// reachable logged out.
const ONBOARDING_ANON = '/onboarding'

// ═══ Agent app (Batch 0b) ════════════════════════════════════════════════════
//
// Every route here is still a STUB — a heading and no data access — so these
// currently prove routing, the layout and the role gate, not screen content.
// Content assertions get added per batch as the real screens land, the same way
// the customer tables above grew.
//
// All four ids below are REAL seeded rows as of Batch 0a — the placeholders are
// gone. Every one is assigned to agent@test, so these routes exercise the
// agent-scoped read, not just the router.
//
// ⚠ They are a contract with `packages/database/prisma/reset-demo.ts`. The item
// and batch ids are minted by `demoItemId()` / `CUSTODY_BATCH_ID` there; change
// either and this file must change with it.
const AGENT_PICKUP = 'PKP-2026-000102' // seeded `scheduled` — the day-view job,
//                                        3 items, mixed lead-acid + li-ion
const AGENT_ARRIVED = 'PKP-2026-000103' // seeded `arrived`, also mixed
// demoItemId('PKP-2026-000102', 0) — first item on the scheduled job. 102 has NO
// safety checklist, so every intake route under it is REJECTED by the gate; that
// is what it is used for below, not for rendering.
const AGENT_ITEM = '00000000-0000-4000-8000-000000102001'
// demoItemId('PKP-2026-000103', …) — the ADMIT side. 103 is seeded WITH a passing
// checklist, so these are the item ids the built intake screens actually render
// for. Item 1 is li-ion NMC (declared portable, healthy) and item 3 is lead-acid
// (declared automotive, dead) — the two sides of the D1 branch, on one job.
//
// ⚠ Batch 3 moved the item-confirm routes here from 102. Once /items/[itemId]
// gained the gate, a route under 102 could only ever redirect, so pointing the
// render assertions at it would have tested nothing.
const AGENT_ARRIVED_ITEM = '00000000-0000-4000-8000-000000103001'
const AGENT_ARRIVED_ITEM_LEAD = '00000000-0000-4000-8000-000000103003'
// The one seeded CustodyBatch (CB-2026-000301), holding the four pickups past
// `collected`. The pickup AT `collected` is deliberately not in it — that is
// the derived "pending drop-off" state (D5).
const AGENT_BATCH = '00000000-0000-4000-8000-000000000301'
// The `offered` demo pickup — seeded WITH a passing safety checklist and with an
// Offer row, so /job/<id>/offer is the one id that renders the offer screen
// rather than bouncing off the gate.
const AGENT_OFFERED = 'PKP-2026-000104'
// The one pickup at `collected` with a NULL custodyBatchId — the derived
// "pending drop-off" state (D5). /dropoff/confirm is meaningless without a
// selection, so this is what it is given.
const AGENT_COLLECTED = 'PKP-2026-000105'

const AGENT_ROUTES = [
  // A. Entry & day view
  '/',
  // B. Job → arrival
  `/job/${AGENT_PICKUP}`,
  `/job/${AGENT_PICKUP}/safety`,
  // Batch 2 — the safety gate's ADMIT path. 103 is seeded WITH a passing
  // checklist and 102 deliberately without, so these two routes and the pair
  // below are the gate asserted in both directions. A gate only ever asserted
  // to reject is indistinguishable from a gate that rejects everything.
  `/job/${AGENT_ARRIVED}/safety`,
  `/job/${AGENT_ARRIVED}/items`,
  // C. Intake & assessment. The screens Batch 3 built RENDER on 103, the pickup
  // past the safety gate.
  `/job/${AGENT_ARRIVED}/items/${AGENT_ARRIVED_ITEM}`,
  `/job/${AGENT_ARRIVED}/items/${AGENT_ARRIVED_ITEM_LEAD}`,
  `/job/${AGENT_ARRIVED}/scan`,
  // …and the SAME three screens on 102, which has no checklist, are the gate's
  // reject half. They must stay in this list: AGENT_ITEMS_GATE only runs against
  // routes that are actually fetched, and a rejection asserted nowhere is not
  // asserted. Batch 3 extended the gate from /items alone to all three.
  `/job/${AGENT_PICKUP}/items`,
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}`,
  `/job/${AGENT_PICKUP}/scan`,
  // D. Quote. ⚠ These five were described here as "still stubs — ungated" until
  // 2026-08-24. Batch 5a built them AND put them behind the safety gate, so
  // every one now redirects under 102 — and because they carried no assertions,
  // a 307 scored a bare "ok" and these five routes were checking nothing at all.
  // They are the gate's REJECT half now, asserted by content in AGENT_ITEMS_GATE.
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/damage`,
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/computing`,
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result`,
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result/breakdown`,
  `/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result/why`,
  // The offer screen inherited the gate too (it is downstream of intake), so
  // 102 is its reject half...
  `/job/${AGENT_PICKUP}/offer`,
  // ...and 104, which is `offered` and has a checklist, is the render half.
  `/job/${AGENT_OFFERED}/offer`,
  // E. Collect & hand off
  `/job/${AGENT_ARRIVED}/collect`,
  `/job/${AGENT_ARRIVED}/receipt`,
  '/dropoff',
  // Needs a selection — it is the confirm step for a batch, and redirects to
  // /dropoff without one. Fetching it bare asserted nothing.
  `/dropoff/confirm?pickups=${AGENT_COLLECTED}`,
  `/dropoff/${AGENT_BATCH}`,
  // F. Track, history, profile
  '/pickups',
  `/pickups/${AGENT_ARRIVED}`,
  `/pickups/${AGENT_ARRIVED}/map`,
  '/history',
  '/profile',
]

// Proves the stub actually rendered rather than the layout alone. Replace each
// entry with real screen content as its batch lands — a stub heading is a weak
// assertion and is meant to be temporary.
const AGENT_APP_CONTENT = {
  // Batch 1 — real screens now. The seeded pickup id is the load-bearing
  // assertion on both: it only renders if the agent-scoped Prisma read ran and
  // returned this agent's own rows, so a broken query fails here rather than
  // passing on a layout that rendered an empty list.
  '/': ['Assigned today', 'Collected today', 'Earned today', AGENT_PICKUP],
  [`/job/${AGENT_PICKUP}`]: [
    'Open in Google Maps',
    'Arrived on site',
    'Your fee for this job',
    'Declared load',
  ],
  // ── Batch 8 — real screens. Every string below is chosen the same way the
  // Batch 3 ones were: it can only render if the agent-scoped Prisma read ran
  // AND returned this agent's own rows, so a broken query fails here instead of
  // passing on a layout that rendered an empty list.
  //
  // 📌 The seeded ids are the load-bearing part. A heading like 'My pickups' is
  // in the static JSX and would keep passing with the database unplugged.
  '/pickups': [
    'My pickups',
    // The two-group split. 'Needs you' always renders; 'Handed over — in
    // recovery' only renders when this agent has a job past collection, which
    // on a fresh seed they do.
    'Needs you',
    'Handed over — in recovery',
    // The derived pending-drop-off card (D5). The seed has exactly one pickup
    // at `collected` with no custody batch, so this must say "1 load".
    '1 load to drop off',
    AGENT_PICKUP,
  ],
  // The lifecycle timeline. 103 is `arrived`, so it is pre-collection: the
  // Handed-over lock must NOT be on it (asserted absent in AGENT_PICKUP_REJECTS
  // below), and the custody log must carry the agent-perspective attribution.
  [`/pickups/${AGENT_ARRIVED}`]: [
    'Lifecycle',
    'Chain of custody',
    // 🔴 The roleLabels prop, asserted. The shared CustodyLog defaults to the
    // CUSTOMER's copy ('Recorded by the collection partner'), which is exactly
    // backwards on this app. If someone drops the prop, this flips to that
    // string and this line catches it.
    'Recorded by you',
    'Your fee',
    'See the collection point',
    // Stage labels come from STAGE_LABELS, never a local copy.
    'Agent arrived',
  ],
  [`/pickups/${AGENT_ARRIVED}/map`]: [
    'Open in Google Maps',
    // The seeded warehouse address — proves the address relation was read
    // through this agent's own pickup, not just that the shell rendered.
    'Okhla Industrial Area',
    'Sharma Logistics',
  ],
  '/history': [
    'History',
    'Every job you have been assigned',
    // Filter chips are derived from the rows PRESENT, so these two only render
    // because this agent genuinely has jobs in both buckets.
    'Still open',
    'Handed over',
    AGENT_PICKUP,
  ],
  '/profile': [
    'Profile',
    // Seeded agent identity — the Prisma read, not the layout.
    'Ravi Kumar',
    'Delhi NCR — South',
    'Tata Ace · DL 1LR 4471',
    'Jobs collected',
    'Weight collected',
    // 🔴 The agent's own ledger (Batch 8 seeds `agent_fee` rows). '₹' only
    // renders here if walletTxn.aggregate returned something; the D3 line is
    // what stops this screen ever being mistaken for the vendor's payout.
    'Earnings',
    'Balance',
    '₹',
    'what you earn for the job, not what the vendor is paid',
    // Read-only safety training (D6).
    'Safety training',
    'Trained',
    'Log out',
  ],
  // Batch 2 — real screen. 102 has NO seeded checklist, so this is the blank
  // checklist. The lithium question is the load-bearing string: it only renders
  // if the declared categories were read off this agent's own pickup, and the
  // HR-named items below it are what the batch's "Done when" list requires be
  // present. 102 declares automotive + industrial, so the toggle defaults to
  // Yes and the lithium block renders with it.
  [`/job/${AGENT_PICKUP}/safety`]: [
    'Safety checklist',
    'Does this load contain lithium-ion?',
    'Terminals taped or capped',
    'No puncturing, crushing or dismantling on site',
    'Fire-safe crate in use',
    'Chemistries kept separate',
    'PPE worn',
    'Li-ion packs at low state of charge',
    // 102 declares a `leaking` line, so the condition-derived item applies too.
    'Damaged units separately contained',
  ],
  // 103 IS seeded with a passing checklist — so this renders the completed
  // state, not the form. Asserting on the completed banner is what proves the
  // stored row was read back rather than the screen just rendering blank.
  [`/job/${AGENT_ARRIVED}/safety`]: ['Safety checklist completed', 'Continue to intake'],
  // The gate's ADMIT half: 103 has a passing checklist, so intake renders.
  //
  // Batch 3 — the real item list. Every string here is the positive twin of one
  // asserted ABSENT on 102 in AGENT_ITEMS_GATE. 'kg weighed' and '0 of 3
  // confirmed' are the running total, which only renders off this agent's own
  // Prisma read: a broken query fails here rather than passing on an empty
  // layout. 'Quote unlocks once' is the blocked state — 103's items are seeded
  // unconfirmed (the agent half is only filled from `collected` onward), so a
  // fresh seed must NOT offer the quote.
  [`/job/${AGENT_ARRIVED}/items`]: [
    'Lines on this job',
    'kg weighed',
    '0 of 3 confirmed',
    'Quote unlocks once',
    'Assess this line',
  ],
  // Batch 3 — the per-item confirm. The declared half proves the item was read
  // scoped to this pickup; the chemistry catalogue and the branch copy prove the
  // D1 fork is on the screen. Item 1 is declared portable/healthy.
  [`/job/${AGENT_ARRIVED}/items/${AGENT_ARRIVED_ITEM}`]: [
    'Customer declared',
    'Chemistry — read it off the label',
    'Li-ion NMC',
    'Lead-acid',
    'Weighed on site',
    'Condition you found',
    'Save this line',
  ],
  // The third line on 103 is declared automotive + DEAD, so the same screen must
  // additionally show the photo-evidence requirement. This is the only route
  // that asserts it, and it is the reason a second item id is in the table.
  [`/job/${AGENT_ARRIVED}/items/${AGENT_ARRIVED_ITEM_LEAD}`]: [
    'Customer declared',
    'Automotive',
    'required for this condition',
  ],
  [`/job/${AGENT_ARRIVED}/scan`]: ['QR scanning is not in this build'],
  // The offer roll-up, on the one pickup that has an Offer. 'Offer presented'
  // is the `acceptedAt === null` half of the split `offered` stage (Batch 5b) —
  // it can only render off the real Prisma read, unlike the bare 'Offer' title
  // this used to assert, which was the AppShell heading and would have passed
  // on an empty screen.
  [`/job/${AGENT_OFFERED}/offer`]: ['Offer presented', '₹'],
  // Batch 7a. The vendor name and the running totals come from the batch read;
  // the agent-attested wording is the honesty requirement in step 5 of the
  // task sheet, asserted so it cannot quietly disappear.
  [`/dropoff/confirm?pickups=${AGENT_COLLECTED}`]: [
    'Confirm hand-off',
    'Receiving staff',
    'Agent-attested only',
  ],
}

// 🔴 Batch 2 — THE SAFETY GATE, asserted by URL.
//
// 102 has no passing safety checklist, so /items must NOT render for it. This is
// the "Done when" item that says the block is verified by URL and not by the
// button being hidden — the UI is not the security boundary.
//
// ⚠ Asserted on ABSENT CONTENT, not on a 3xx + Location, following the
// APP_REJECTS precedent above. The stub redirects cleanly today, but the moment
// Batch 3 gives this route a `loading.tsx`, Next flushes the shell before the
// gate runs and the redirect travels inside the RSC stream as a 200 with no
// Location header. A status check would then fail on a correctly gated app.
//
// This also fails if `requireSafetyChecklist` is deleted from items/page.tsx
// during Ali's Batch 3 rewrite, which is the main thing it is here to catch.
//
// ✅ BATCH 3 MAINTENANCE DONE (2026-08-23). The two strings used to be `'Items'`
// and `'Batch 3 · Ali'`, both from the stub this batch deleted — the second no
// longer exists anywhere in the repo, so it had become a vacuous assertion. Each
// string below is now text that ONLY the built screens render, and every one of
// them is asserted POSITIVELY on the 103 routes in AGENT_APP_CONTENT. That
// pairing is the whole design: the same string must appear on the admitted job
// and be absent on the rejected one, so neither half can pass by accident.
//
// 📌 KEEP THAT PAIRING. If you change the copy on the items screen, change it in
// both places — a string that no longer renders anywhere passes here forever.
const AGENT_ITEMS_GATE = {
  // The item LIST. `confirmed` / `of` come from the running total, which cannot
  // render without the Prisma read behind the gate.
  [`/job/${AGENT_PICKUP}/items`]: ['Lines on this job', 'kg weighed'],
  // The per-item CONFIRM screen — gated for the first time in Batch 3. The item
  // id is 102's own, so this is a genuine gate rejection and not a 404.
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}`]: [
    'Customer declared',
    'Chemistry — read it off the label',
  ],
  // The scan screen inherited the gate too.
  [`/job/${AGENT_PICKUP}/scan`]: ['QR scanning is not in this build'],
  // Batch 5a's six screens, gated 2026-08-24. Each string is one that only the
  // real screen renders, so a gate that stopped rejecting would surface here as
  // a leak rather than as a silently-passing redirect.
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/damage`]: ['Leakage', 'Thermal'],
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/computing`]: ['Computing'],
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result`]: ['Back to items'],
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result/breakdown`]: ['Revenue'],
  [`/job/${AGENT_PICKUP}/items/${AGENT_ITEM}/result/why`]: ['Audit footer', 'Market snapshot'],
  // 🔴 The offer screen is a money surface: if the gate ever stopped rejecting,
  // the thing that leaks is a total in ₹ on a job with no safety checklist.
  [`/job/${AGENT_PICKUP}/offer`]: ['Present offer to vendor', 'Total offer'],
}

// 🔴 Batch 8 — the strings that must NOT be on these screens.
//
// Every entry here is the ABSENT twin of something asserted PRESENT in
// AGENT_APP_CONTENT above. That pairing is the whole design, and it is the
// Batch 5b lesson applied one screen later: a positive assertion on its own can
// pass vacuously when the failure mode renders a DIFFERENT string rather than
// nothing at all.
const AGENT_BATCH8_REJECTS = {
  [`/pickups/${AGENT_ARRIVED}`]: [
    // 🔴 The reason 'Recorded by you' above is not enough on its own. Drop the
    // `roleLabels` prop and CustodyLog falls back to the CUSTOMER's map — which
    // still renders 'Recorded by you' (for the vendor's own `requested` event)
    // while mislabelling every agent action as somebody else's. The positive
    // assertion would sail through; this is the one that catches it.
    'Recorded by the collection partner',
    // 103 is `arrived` — pre-collection. The "your part is done" lock must not
    // appear on a job the agent has not even quoted yet.
    'your part is done',
    // D5/W4: the wireframe's invented parallel timeline. None of these are
    // lifecycle stages and no screen may re-declare the stage list.
    'Refurb',
    'In transit',
  ],
  '/profile': [
    // The task sheet is explicit: delete these unless they work. Nothing writes
    // WalletTxnKind.redemption and there is no notification pipeline in this
    // build, so both would be buttons that do nothing.
    'Cash out',
    'Notifications',
    // The vendor-visibility rule's inverse has a limit: the agent sees their
    // OWN money, never the business's economics. These belong to the admin app,
    // and the wireframe's 'Avg recovery rate' row is stale on both sides.
    'recovery rate',
    'Avg margin',
  ],
}

const AGENT_PUBLIC_ROUTES = ['/login']

const AGENT_CONTENT = {
  '/login': ['Field Agent', 'Log in', 'Email', 'Password'],
}

// D6 made assertable. Agents do not self-sign-up, and the agent login must not
// grow the customer login's other three doors. Each string below is one that
// genuinely appears on apps/customer's /login — so a copy-paste from there
// fails this run rather than quietly shipping a signup route the plan rules
// out. 'Agent ID' is the wireframe's W7 defect, kept here for the same reason.
const AGENT_LOGIN_ISOLATION = {
  '/login': ['Create account', 'Send code', 'Email me a login code', 'Continue with Google', 'Agent ID'],
}

// ═══ Admin console (Batch 0) ═════════════════════════════════════════════════
//
// Every route here is still a STUB — a heading and no data access — so these
// currently prove routing, the console shell and the role gate, not screen
// content. Content assertions get tightened per batch as the real screens land,
// exactly the way the customer and agent tables above grew.
//
// 🔴 Trap 9, and the reason every single route below carries an assertion: a
// route that 307s scores a bare "ok". Five agent routes asserted nothing at all
// for two batches because of it. The admin table starts with full coverage so
// that can't repeat here.
//
// The assertion each stub carries is its <h1> text, and that string is chosen
// to SURVIVE the real build — B04's real screen is still headed "Pickups". So
// replacing a stub does not require touching this file, but deleting or
// renaming a heading does, and that is the point.
//
// ⚠ Contract with packages/database/prisma/reset-demo.ts, same as the agent
// table: the ids below are real seeded rows.
const ADMIN_REQUESTED = 'PKP-2026-000101' // seeded `requested`, no agent — the
//                                            dispatch board's own demo row
const ADMIN_PICKUP = 'PKP-2026-000102' // seeded `scheduled`, 3 mixed items
// Real seeded rows since Admin Batch 1 (2026-08-26) — the Batch 0 placeholders
// are gone. Both ids are PINNED in reset-demo.ts so a reseed cannot move them.
//
// 401 is the first manifest generated: the DISPATCHED li-ion one. It is the
// manifest fixture 4 turns on — PKP-2026-000113 has an item on it and another
// item on a `draft` manifest, so 🔴 confirming this manifest must NOT advance
// that pickup (AD6). Batch 7 is where that gets tested for real.
const ADMIN_MANIFEST = '00000000-0000-4000-8000-000000000401'
// Seeded `received`, i.e. the one manifest state where the Batch 7 reconcile
// form is on screen. ⚠ Like verify-seed's fixtures, this is a FRESH-SEED fact:
// reconciling it in a demo legitimately removes that form and fails the two
// assertions below. Reseed before reading such a failure as a bug (trap 30's
// sibling — the board being empty and the form being gone are both correct
// outcomes of the app having been used).
const ADMIN_MANIFEST_RECEIVED = '00000000-0000-4000-8000-000000000404'
// PKP-2026-000113's li-ion item. Its OTHER item is flat-rate lead-acid and has
// no trace at all — which is the point of the fixture, and why no admin table
// may be keyed on trace_id.
const ADMIN_TRACE = 'TRC-2026-1130'

const ADMIN_ROUTES = [
  // B · Operations
  '/',
  '/dispatch',
  `/dispatch/${ADMIN_REQUESTED}`,
  '/pickups',
  `/pickups/${ADMIN_PICKUP}`,
  '/lifecycle',
  // C · Chain of custody
  '/inventory',
  '/manifests',
  '/manifests/new',
  `/manifests/${ADMIN_MANIFEST}`,
  `/manifests/${ADMIN_MANIFEST_RECEIVED}`,
  // D · Engine
  '/config',
  '/market',
  '/quotes',
  `/trace/${ADMIN_TRACE}`,
  '/exceptions',
  // E · Network
  '/suppliers',
  '/agents',
  '/facilities',
  // F · Reports
  '/compliance',
  '/analytics',
  '/audit',
]

// The console chrome, asserted on the dashboard. This is what proves
// ConsoleShell actually rendered rather than the page returning bare markup —
// and, because the sidebar is only reachable with a session, that the shell's
// own getCurrentProfile() read succeeded under the admin's RLS.
//
// 'Chain of custody' is deliberately in here: it is one of the three sidebar
// groups the wireframe does NOT have (W1/W2/W9 add dispatch, pickups and
// manifests), so asserting it stops a future edit quietly reverting the nav to
// the wireframe's twelve items and stranding the P0 screens.
//
// ⚠ 'Account menu for' is the UserMenu TRIGGER's aria-label, not the 'Sign out'
// item itself. The item is inside a dropdown that only mounts once the menu is
// opened, so it is genuinely not in the server HTML and asserting on it fails —
// which it did, first run. This asserts the control W14 asked for is present
// and labelled; that it actually ends the session is in
// docs/MANUAL_TEST_QUEUE.md, because a fetch-based smoke cannot click.
const ADMIN_SHELL = ['Console', 'Operations', 'Chain of custody', 'Engine', 'Network', 'Reports', 'Dispatch', 'Account menu for']

const ADMIN_APP_CONTENT = {
  '/': ['Overview', ...ADMIN_SHELL],
  // Built in Batch 3. The extra strings are chosen to survive a DEMO, not just
  // a build: 'Waiting' is a KPI label that renders even when the board is empty
  // (assign every request and an assertion on a row would start failing), and
  // the two detail assertions are panels that render at EVERY status — the
  // picker itself is only there while the pickup is still `requested`, and
  // PKP-2026-000101 stops being `requested` the first time anyone dispatches it.
  '/dispatch': ['Dispatch board', 'Waiting', 'Oldest request'],
  [`/dispatch/${ADMIN_REQUESTED}`]: [
    'Dispatch request',
    ADMIN_REQUESTED,
    'Declared items',
    'Recent status events',
  ],
  '/pickups': ['Pickups'],
  // ⚠ 'Pickup detail' was asserted here from Batch 0 until Admin Batch 7 and had
  // been RED ever since Batch 5 replaced the stub: C's real screen uses the
  // pickup id itself as its <h1>, which is a better heading, and the stub's
  // wording simply stopped existing. Trap 28 in the opposite direction — the
  // stub's string outlived the stub.
  //
  // 🔴 The id alone is NOT a sufficient assertion: it comes from the URL and a
  // page could echo it without reading anything. 'Sharma Logistics Pvt Ltd' and
  // 'Ravi Kumar' are the vendor and agent names, reachable only through joins,
  // so they prove the row was actually loaded.
  [`/pickups/${ADMIN_PICKUP}`]: [
    ADMIN_PICKUP,
    'Sharma Logistics Pvt Ltd',
    'Ravi Kumar',
    'Chain of custody',
  ],
  // Built in Batch 6. Every string below is chosen to survive a DEMO as well as
  // a build, which on this screen is load-bearing: on a FRESH SEED the board has
  // nothing to advance at all (CB-2026-000301 holds no pickup at `collected`,
  // deliberately — the one collected pickup stays out of it so that "pending
  // drop-off" is a real state). So an assertion on a batch row would pass only
  // between a hub drop-off and an advance. These four are the section headings
  // and stat labels, which render at every data state including empty.
  '/lifecycle': [
    'Lifecycle control',
    'Unit: one custody batch',
    'Pending drop-off',
    'Awaiting certification',
    // Batch 7. The override panel is the only part of this screen that renders
    // at EVERY data state — it is a form, not a table, so it survives both a
    // fresh seed and a fully-worked-through demo.
    'Manual override',
    'Unit: one pickup, one step',
    'Apply override',
  ],
  '/inventory': ['Inventory'],
  // The four ManifestStatus stat tiles always render, even at zero — unlike the
  // per-status tables below them, which are omitted when empty.
  '/manifests': ['Dispatch manifests', 'Draft', 'Dispatched', 'Received', 'Reconciled'],
  // ⚠ Deliberately NOT asserting on the picker. On a fresh seed every tested
  // item is already on a seeded manifest, so this route renders its "No
  // shippable stock" empty state and the builder is not in the HTML at all.
  // Both states carry these two.
  '/manifests/new': ['New manifest', 'Build a shipment'],
  // …401 is the DISPATCHED li-ion manifest and it is pinned in reset-demo.ts.
  // 'Items on this manifest' is the table heading, which renders at every
  // manifest status; the manifest number proves the row was actually read.
  [`/manifests/${ADMIN_MANIFEST}`]: [
    'Manifest detail',
    'MFT-2026-000401',
    'Items on this manifest',
    'Meridian Metals Recovery',
    // 🔴 Batch 7's AD6 readiness panel. This string is only reachable after the
    // page has resolved itemIds → pickups → EVERY item of each of those pickups
    // → the manifest index, which is the whole coverage computation — exactly
    // what trap 28 asks a content assertion to prove. It renders while the
    // manifest is `dispatched` or `received`; reconciling …401 in a demo
    // removes it, same caveat as ADMIN_MANIFEST_RECEIVED above.
    'What this will move',
  ],
  // Batch 7's reconcile form. `Nickel (kg)` comes from RECOVERY_METALS, so it
  // also proves the metal allowlist reached the page.
  [`/manifests/${ADMIN_MANIFEST_RECEIVED}`]: [
    'Manifest detail',
    'MFT-2026-000404',
    'Reconcile',
    'Nickel (kg)',
    'what actually came back',
  ],
  // Batch 11. 🔴 'Engine config' ALONE IS NOT ENOUGH, and that is not a
  // hypothetical: the Batch 0 stub was written to keep that exact <h1> so the
  // assertion would survive until the screen was built — which meant smoke
  // scored this route green for two batches while /config rendered "not built
  // yet". A content assertion has to name something only the REAL screen can
  // produce (trap 9, and the sharpest instance of it in the sprint).
  //
  // 'v2026-08-26-r1' is the seeded EngineConfig.version, so it proves the row
  // was actually read; 'Tier 3' proves the AD8 read-only panel rendered; and
  // 'NMC622' proves the engine-vocabulary chemistry table was built from the
  // config JSON rather than hard-coded.
  '/config': [
    'Engine config',
    'v2026-08-26-r1',
    'Tier 3 — not configurable',
    'NMC622',
    'Publish history',
  ],
  '/market': ['Market feed'],
  '/quotes': ['Quote queue'],
  [`/trace/${ADMIN_TRACE}`]: ['Traceability'],
  // Batch 14. 🔴 Trap 28 — assert on strings only a real read could produce.
  // `soh_below_gate` is seed fixture 6's machine-readable cause, the pickup id
  // comes from a two-level join (exception → item → pickup), and "no trace" is
  // the FLAT-RATE row a trace_id-keyed table would have dropped (W2/AD1).
  '/exceptions': [
    'Exception queue',
    'soh_below_gate',
    'PKP-2026-000106',
    'no trace',
    'Resolve',
  ],
  '/suppliers': ['Suppliers'],
  '/agents': ['Agent roster'],
  // '&' renders as &amp; — assert the two halves, never the raw ampersand.
  '/facilities': ['Facilities', 'recyclers'],
  '/compliance': ['Compliance'],
  '/analytics': ['Analytics'],
  // Batch 14. The three dotted action strings are read back out of
  // `admin_audits` and rendered verbatim, so they prove the query ran — a stub
  // could render the heading, but not `exception.resolve` next to an actor.
  '/audit': [
    'Audit log',
    'config.publish',
    'manifest.dispatch',
    'exception.resolve',
    'entries',
  ],
}

const ADMIN_PUBLIC_ROUTES = ['/login']

const ADMIN_CONTENT = {
  '/login': ['Admin Console', 'Sign in', 'Email', 'Password'],
}

// AD2 made assertable, the same way AGENT_LOGIN_ISOLATION asserts D6.
//
// Admins do not self-sign-up, and this login must not grow the customer
// login's other doors — a signup route into the console would hand whoever
// used it every price in the business. Each string below genuinely appears on
// apps/customer's /login, so a copy-paste from there fails this run rather
// than shipping the door.
//
// 'ops' is here for a different reason: it is wireframe defect W10. UserRole is
// customer | agent | admin, `ops` is not being added (AD2), and the wireframe
// renders 'ADMIN · OPS' in its sidebar footer. Asserting its absence is what
// stops that string being copied back in and implying a role tier that does not
// exist.
const ADMIN_LOGIN_ISOLATION = {
  '/login': ['Create account', 'Send code', 'Email me a login code', 'Continue with Google', 'ops'],
}

// ═══ App selection ═══════════════════════════════════════════════════════════
// `--app=<name>`. Only the shared shape lives here; the customer-only sections
// (documents, exports, public /t/ tracking, the onboarding probes) are gated on
// `app === 'customer'` in main() rather than being stubbed out per app —
// asserting on a feature that does not exist passes vacuously, which is the
// Batch 10 lesson.
const APPS = {
  customer: {
    port: 3000,
    envFile: 'apps/customer/.env.local',
    defaultUser: ['business@test', 'businesstest'],
    routes: ROUTES,
    appContent: APP_CONTENT,
    appIsolation: (route) => BOOK_PREFILL_ISOLATION[route] ?? ONBOARDING_ISOLATION[route] ?? [],
    publicRoutes: PUBLIC_ROUTES,
    content: CONTENT,
    publicIsolation: {},
  },
  admin: {
    port: 3002,
    // Same Supabase project again — one database, one auth pool, three apps
    // separated by profiles.role at the proxy. Under AD3 this app has no RLS
    // policies of its own: it reads through Prisma and the service role, so
    // the role gate below and the in-code checks inside each server action are
    // the entire access boundary. That makes the three --blocked runs load
    // bearing here in a way they are not for the other two apps.
    envFile: 'apps/admin/.env.local',
    defaultUser: ['admin@test', 'demo1234'],
    routes: ADMIN_ROUTES,
    appContent: ADMIN_APP_CONTENT,
    // No isolation table yet — nothing in the console is withheld from an
    // admin (AD12), so there is nothing to assert absent on a logged-in route.
    // The absent-doors assertions live on /login, in ADMIN_LOGIN_ISOLATION.
    appIsolation: () => [],
    publicRoutes: ADMIN_PUBLIC_ROUTES,
    content: ADMIN_CONTENT,
    publicIsolation: ADMIN_LOGIN_ISOLATION,
  },
  agent: {
    port: 3001,
    // The agent app reads the same Supabase project as the customer app — one
    // database, one auth pool. The apps are separated by profiles.role at the
    // proxy, not by project.
    envFile: 'apps/agent/.env.local',
    defaultUser: ['agent@test', 'demo1234'],
    routes: AGENT_ROUTES,
    appContent: AGENT_APP_CONTENT,
    appIsolation: (route) => AGENT_ITEMS_GATE[route] ?? AGENT_BATCH8_REJECTS[route] ?? [],
    publicRoutes: AGENT_PUBLIC_ROUTES,
    content: AGENT_CONTENT,
    publicIsolation: AGENT_LOGIN_ISOLATION,
  },
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

  const appName = args.find((a) => a.startsWith('--app='))?.slice('--app='.length) ?? 'customer'
  const cfg = APPS[appName]
  if (!cfg) {
    console.error(`Unknown --app=${appName}. Known: ${Object.keys(APPS).join(', ')}`)
    process.exit(1)
  }
  // Only the customer app has documents, exports and public /t/ tracking. This
  // gates those sections rather than giving the agent app empty tables for
  // them: an assertion over an empty table passes without checking anything.
  const isCustomer = appName === 'customer'

  BASE = process.env.SMOKE_BASE_URL ?? `http://localhost:${cfg.port}`

  const [email = cfg.defaultUser[0], password = cfg.defaultUser[1]] = args.filter(
    (a) => !a.startsWith('--'),
  )

  const env = loadEnv(path.join(ROOT, cfg.envFile))
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
    `\nSmoke test — ${appName} app — ${BASE} as ${email}` +
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
    // `missing` is checked BEFORE the guarded-verdict shortcut. It used to come
    // after, which silently skipped every mustContain whenever mustNotContain
    // was also set — fine while the only user was APP_REJECTS (no mustContain),
    // wrong for the Batch 10 /t routes, which have to prove BOTH that the page
    // rendered AND that the isolation held. A rejected guard still reports
    // "guarded (correct)" because its mustContain list is empty.
    else if (missing.length) verdict = `MISSING: ${missing.join(' | ')}`
    else if (mustNotContain.length)
      // Distinguish "rejected, nothing rendered" from "rendered AND withheld
      // the things it must withhold" — the /t routes and the repeat-booking
      // prefill are the second kind, and reporting both as plain "guarded"
      // would hide that their content assertions ran at all.
      verdict = mustContain.length ? 'ok + isolation held' : 'guarded (correct)'
    else if (badNav) verdict = `${navCount} TAB BARS (expected 1)`
    else verdict = 'ok'

    const PASSING = ['ok', 'blocked (correct)', 'guarded (correct)', 'ok + isolation held']
    if (!PASSING.includes(verdict)) failures++
    console.log(`  ${String(status).padEnd(3)} ${route.padEnd(34)} ${verdict} ${note}`)
  }

  console.log('  — app routes —')
  for (const route of cfg.routes) {
    // In --blocked mode the pass condition is a bounce to /login, so there is no
    // body to assert against.
    await probe(route, {
      expectBounce: blocked,
      mustContain: blocked ? [] : (cfg.appContent[route] ?? []),
      mustNotContain: blocked ? [] : cfg.appIsolation(route),
    })
  }

  // Agent documents — custody PDF
  if (appName === 'agent') {
    console.log('\n  — agent documents (must be real PDFs) —')
    await probeDocument(`/api/documents/custody/${AGENT_BATCH}`, { expectBounce: blocked })
  }

  // The other half of the status guard: these ids are NOT at `offered`, so the
  // offer screen must turn them away. In --blocked mode the role gate gets there
  // first and the expectation is a /login bounce instead.
  // Customer-only from here. The agent app has no status-guarded ?id= screens
  // yet (its guards arrive with Batch 5b), no documents, no CSV export and no
  // public bearer-token page.
  if (isCustomer) {
    console.log('\n  — status guards (must reject) —')
    for (const [route, forbidden] of Object.entries(APP_REJECTS)) {
      await probe(route, {
        expectBounce: blocked,
        mustNotContain: blocked ? [] : forbidden,
      })
    }

    // Batch 12. Must come after the loop above — see OFFER_SURVIVED_GET.
    console.log('\n  — the offer survived being GET-ed at /handover —')
    for (const [route, expected] of Object.entries(OFFER_SURVIVED_GET)) {
      await probe(route, {
        expectBounce: blocked,
        mustContain: blocked ? [] : expected,
      })
    }
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
  if (isCustomer) {
    console.log('\n  — documents (must be real PDFs) —')
    for (const route of DOCUMENT_ROUTES) {
      await probeDocument(route, { expectBounce: blocked })
    }

    console.log('\n  — documents (must refuse) —')
    for (const route of DOCUMENT_REJECTS) {
      await probeDocument(route, { expectPdf: false, expectBounce: blocked })
    }
  }

  /**
   * Batch 9. Fetches the CSV export and checks it is a real, correctly-typed
   * file. Separate from probe() for the same reason probeDocument() is: it
   * answers with a file and a Content-Type, so the tab-bar and error-page
   * heuristics don't apply.
   *
   * Unlike the PDF route this writes nothing — the CSV is built per request and
   * never cached, so the whole export section is genuinely read-only.
   */
  async function probeExport(route, { mustContain = [], expectEmpty = false } = {}) {
    let status, type = '', body = '', note = ''
    try {
      const r = await fetch(`${BASE}${route}`, { headers: { Cookie }, redirect: 'manual' })
      status = r.status
      type = r.headers.get('content-type') ?? ''
      note = r.headers.get('location') ? `→ ${r.headers.get('location')}` : ''
      if (status === 200) body = await r.text()
    } catch (e) {
      console.error(`  ERR   ${route}`, e.message)
      failures++
      return
    }

    const isCsv = type.includes('text/csv')
    // Header row only. Split on newlines and drop trailing blanks, because
    // papaparse does not terminate the last row.
    const dataRows = body.split('\n').filter((line) => line.trim().length > 0).length - 1
    const missing = mustContain.filter((s) => !body.includes(s))

    let verdict
    if (blocked) {
      verdict = note.includes('/login') ? 'blocked (correct)' : 'LEAKED THROUGH'
    } else if (!isCsv) {
      verdict = `NOT A CSV (${status}, ${type || 'no type'})`
    } else if (expectEmpty) {
      // A year filter that matches nothing must return the header and no rows.
      // Returning everything would be a filter that quietly does nothing, which
      // on a compliance return is the worst kind of wrong.
      verdict = dataRows === 0 ? 'empty (correct)' : `FILTER IGNORED (${dataRows} rows)`
    } else if (missing.length) {
      verdict = `MISSING: ${missing.join(' | ')}`
    } else {
      verdict = `ok (${dataRows} row${dataRows === 1 ? '' : 's'})`
    }

    if (!/^(ok|empty \(correct\)|blocked \(correct\))/.test(verdict)) failures++
    console.log(`  ${String(status).padEnd(3)} ${route.padEnd(46)} ${verdict} ${note}`)
  }

  if (isCustomer) {
    console.log('\n  — compliance export —')
    for (const [route, expected] of Object.entries(EXPORT_ROUTES)) {
      await probeExport(route, { mustContain: expected })
    }
    await probeExport(EXPORT_EMPTY, { expectEmpty: true })
  }

  // Fetched WITHOUT the session cookie — that is the state they're built for,
  // and a logged-in hit on /login legitimately redirects to /dashboard, which
  // would make a content check meaningless. A rejected session that also
  // couldn't load /login would have nowhere to go, so these must always render.
  console.log('\n  — public auth routes (logged out) —')
  for (const route of cfg.publicRoutes) {
    await probe(route, {
      anon: true,
      mustContain: cfg.content[route] ?? [],
      mustNotContain: cfg.publicIsolation[route] ?? [],
    })
  }

  if (isCustomer) {
    // The other half of the /onboarding guard: a session is required. `anon`
    // with `expectBounce` is the pass condition here, unlike the /t routes.
    await probe(ONBOARDING_ANON, { anon: true, expectBounce: true })

    // Batch 10. Anonymous by definition — these must render with NO session, in
    // both normal and --blocked mode, so they are never given `expectBounce`.
    console.log('\n  — public tracking links (logged out, isolation asserted) —')
    for (const [route, expected] of Object.entries(PUBLIC_TRACK_ROUTES)) {
      await probe(route, { anon: true, ...expected })
    }

    // A well-formed token that matches no pickup. Checked with a bare fetch
    // rather than probe(), because the pass condition is a STATUS (404) and
    // probe() reads no body on a non-200 — it would report "ok" for a 500.
    const r = await fetch(`${BASE}${PUBLIC_TRACK_UNKNOWN}`, { redirect: 'manual' })
    const ok = r.status === 404
    if (!ok) failures++
    console.log(
      `  ${String(r.status).padEnd(3)} ${PUBLIC_TRACK_UNKNOWN.padEnd(34)} ` +
        (ok ? 'not found (correct)' : 'EXPECTED 404'),
    )
  }

  const total =
    cfg.routes.length +
    cfg.publicRoutes.length +
    // The agent custody PDF probe runs above but was never added here, so an
    // agent run executed 29 probes and printed "All 28". The exit code was
    // always right — probeDocument shares `failures` — but the total is what
    // gets read as proof the document section ran at all.
    (appName === 'agent' ? 1 : 0) +
    (isCustomer
      ? Object.keys(APP_REJECTS).length +
        Object.keys(OFFER_SURVIVED_GET).length +
        DOCUMENT_ROUTES.length +
        DOCUMENT_REJECTS.length +
        Object.keys(EXPORT_ROUTES).length +
        1 + // EXPORT_EMPTY
        1 + // ONBOARDING_ANON
        Object.keys(PUBLIC_TRACK_ROUTES).length +
        1 // PUBLIC_TRACK_UNKNOWN
      : 0)
  console.log(
    failures === 0
      ? `\nAll ${total} routes behaved as expected.\n`
      : `\n${failures} of ${total} routes failed.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
