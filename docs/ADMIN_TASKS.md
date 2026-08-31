# Admin Console — task sheet

**The executable sheet for the Admin sprint.** Files, numbered steps, a
done-when checklist, and the traps, per batch.

> **Read `docs/PLAN_ADMIN_APP.md` first** — §0 (the wireframe's twelve defects)
> and §1 (decisions **AD0–AD12**). The wireframe alone is not a spec.
>
> Build from `docs/CLBIPP_AdminWireframes_V1.html` **plus §0**, never the
> wireframe alone.

**Demo logins** — `admin@test` / `demo1234` · `agent@test` / `demo1234` ·
`business@test` / `businesstest`.

---

## ⚠ Traps — read once, then keep on screen

Every one of these has already cost this team an hour, in an earlier sprint.

1. 🔴 **`proxy.ts` must live at `apps/admin/src/proxy.ts`, never the project
   root.** Next's dev bundler silently never registers a root-level proxy when
   `src/app` is in use, and **an unregistered auth guard fails OPEN**. Verify:
   `npm run build` must print `ƒ Proxy (Middleware)` for the admin app.
2. 🔴 **Anything you add to `apps/admin/public/` must also be excluded in the
   `proxy.ts` matcher**, by filename, or the guard 307s it to `/login`. This
   silently made the customer app un-installable for weeks.
3. 🔴 **`@default(uuid())` does not apply to a service-role write.** Generate the
   id in the action for every uuid-keyed insert (`EngineConfig`,
   `ItemException`, `DispatchManifest`).
4. **`formatPaise` comes from `@clbipp/core/format` in a client component.** The
   package barrel re-exports `booking-actions` / `payment-actions`, so a value
   import from `@clbipp/core` pulls Prisma into the browser bundle.
5. **Integer paise everywhere.** Never a float, never rupees, never a local `/100`.
6. **A stale `.next` makes every dynamic route 404** while static ones return 200,
   with no Prisma query logged. `rm -rf apps/admin/.next`. Batch 17 runs build
   and dev back to back, so it *will* hit this.
7. **`npm run reset-demo` does not restore grants.** Re-apply `supabase/grants.sql`
   first, then `policies.sql`, `storage-policies.sql`, `realtime.sql`. Missing
   grants make the app *half-work* rather than fail.
8. **One shared Supabase project — announce before `reset-demo`.**
9. **A smoke route that 307s scores a bare "ok".** Five agent routes asserted
   nothing at all for two batches because of this. **Every admin route needs a
   content assertion**, not just a status code.
10. 🔴 **`offered` is TWO states**, separated only by `Offer.acceptedAt` —
    *awaiting the vendor* (null) and *accepted, awaiting the agent* (set). Any
    admin screen switching on `status === 'offered'` must read the timestamp too.
11. 🔴 **`cancelled` is re-enterable**, and a reactivated pickup **keeps its stale
    `agentId` and `agentFeePaise`**. Batch 3 is where this finally gets handled.
12. **`buildStages` is first-wins** — a timeline entry answers "when did this
    pickup *first* reach this stage".
13. **Never re-declare the stage list.** Use `LIFECYCLE_STAGES`, `STAGE_LABELS`,
    `isLifecycleStage`, `isStageBefore` from `@clbipp/ui`.
14. **Two chemistry enums.** Engine `Chemistry` (`NMC622`…) ≠ app `BatteryType`
    (`li_ion_nmc`…). Never merge them (W13).
15. **Admin is a desktop app.** Do **not** import `AppShell`, `PhoneFrame` or
    `hideNav` — those are mobile primitives for the other two apps (AD11).
16. **A push to `main` is a deploy, and there is now a third app.** Pre-push:
    `npm run build` + **three** smoke runs.
17. ✅ **RETESTED 2026-08-31 — this no longer reproduces.** The three
    `api/documents/[kind]/[id]` routes returned real PDFs against **both**
    `npm run dev` and a production build on Next 16.2.6 (customer smoke 46/46
    both ways). Smoking against a production build is still the better habit —
    it is what actually ships — but a dev 404 here is no longer expected, so
    treat one as a real failure rather than as this known trap.
18. **Add `apps/<app>/src/generated/` to `.gitignore` when you add an app.**
    *(Batch 0.)* The Prisma query engine `prebuild` copies **35 MB** of
    platform-specific binary in there, and the first `git add -A` commits it.
    The line for admin exists now; this is here for whoever adds a fourth app.
19. **A content assertion can only see the FIRST render.** *(Batch 0.)* Asserting
    `'Sign out'` failed because it lives inside a dropdown that mounts on click —
    `scripts/smoke.mjs` fetches HTML, it does not run a browser. Assert on the
    always-present trigger (its `aria-label`) and put the click itself in
    `docs/MANUAL_TEST_QUEUE.md`.
20. **Postgres `jsonb` does not preserve key order.** *(Batch 1.)* It stores keys
    sorted by length then bytewise, so a `JSON.stringify(row.config) ===
    JSON.stringify(SOURCE)` check on `EngineConfig.config` fails even when every
    value is identical. Compare by VALUE. This cost a false "the seed is broken"
    the first time `verify-seed` ran.
21. 🔴 **A `Json?` Prisma column cannot be written as bare `null`.** *(Batch 1.)*
    Prisma distinguishes SQL NULL (`Prisma.DbNull`) from the JSON value `null`
    (`Prisma.JsonNull`), and `null` is a type error. Omit the field, or pick one
    deliberately. `AdminAudit.before` / `.after` are the columns this hits.
22. **`profiles` has an EPR column already, and it is `epr_reg_id`.** *(Batch 1.)*
    §3/W11 say to add `eprRegNo`. Do not — see deviation 2 below.
23. 🔴 **A `'use server'` file may export ONLY async functions.** *(Batch 3.)*
    A shared `const` exported next to the action is a build error, not a lint
    warning. Constants the screens also need go in `src/lib/`, not `actions.ts`.
24. **Next's no-JS form POST is `multipart/form-data`.** *(Batch 3.)* A server
    action submitted as `application/x-www-form-urlencoded` is **silently
    ignored** — the route re-renders with a 200 and logs nothing, which reads
    exactly like a broken action. This is what makes a server action scriptable:
    post a `FormData` carrying the `$ACTION_ID_…` hidden field from the rendered
    page. See "How this batch was verified" below — Batches 6 and 7 need it too.
25. **A corrupted Turbopack cache 500s a handful of dynamic routes with NOTHING
    in the server log.** *(Batch 3.)* Seven agent routes failed that way
    mid-batch and were green again on a restarted dev server, code unchanged.
    Sibling of trap 6: if a route 500s and the log is silent, restart the dev
    server before believing the failure.
26. 🔴 **Not every server-action form carries `$ACTION_ID_…`.** *(Batch 4.)* A
    plain `<form action={fn}>` does. A **`useActionState`** form — like
    `/payment/[id]`'s `confirmPayout` — carries `$ACTION_REF_n`, `$ACTION_n:0`,
    `$ACTION_n:1` and `$ACTION_KEY` **instead**, and no `$ACTION_ID` anywhere.
    Batch 3's verification technique (grep for `$ACTION_ID`, post it) therefore
    finds nothing, and the POST **silently re-renders with a 200** — identical
    to trap 24's symptom, different cause. **Replay every hidden `<input>` on
    the rendered form verbatim** and override only the visible fields; that
    works for both shapes and needs no guessing.
27. **`formatPaise` rounds to whole rupees for display.** *(Batch 4.)* A
    1374450-paise payable renders **₹13,745**, not ₹13,744.50. A content
    assertion written from the paise value will not match the page.
28. 🔴 **A content assertion is only as good as the work the page had to do to
    produce the string.** *(Batch 6.)* `scripts/smoke.mjs` asserted
    `'Manifest detail'` on `/manifests/<id>` for three batches while pointing at
    an id that **matched no row** — the Batch 0 stub rendered that heading
    without querying anything, so the assertion passed and hid a malformed uuid
    in the seed. Trap 9 said "assert content, not a status code"; this is the
    next layer down. **When you replace a stub, assert on something only a real
    read could produce** — a document number, a name out of a joined row.
29. **`DispatchManifest.id` and `CustodyBatch.id` are plain `String`, not
    `@db.Uuid`.** *(Batch 6.)* Postgres will happily store a malformed uuid in
    them, and did. If you hand-build one of these ids, `padStart` it — do not
    count zeros by eye.
30. **A fresh seed gives Batches 6 and 7 nothing to act on, and that is
    correct.** *(Batch 6.)* `CB-2026-000301` holds no pickup at `collected`, and
    the one `collected` pickup deliberately has no custody batch so that
    "pending drop-off" (D5) is a real state. 🎯 **The demo starts in the AGENT
    app** with a hub drop-off. Do not read the empty board as a broken screen.
31. 🔴 **A helper that reads inside a `$transaction` MUST take the transaction
    client.** *(Batch 7.)* `loadItemManifestIndex()` used the module-level
    `prisma` — a different connection, which cannot see the transaction's own
    uncommitted UPDATE. Calling it after moving a manifest to `received` would
    have answered against the manifest's OLD status and advanced nothing, and
    **that failure looks exactly like AD6 working correctly**. It now takes an
    optional `Prisma.TransactionClient`. Check every shared read you call from
    inside a transaction for this.
32. 🔴 **React splits `{expr} literal` with an HTML comment, and a content
    assertion cannot see across it.** *(Batch 7.)* `{metal} (kg)` renders as
    `Nickel<!-- --> (kg)`, so `smoke.mjs`'s grep for `'Nickel (kg)'` never
    matched. Trap 19's cousin — the file greps HTML, it does not run a browser.
    Emit one text node (`` {`${metal} (kg)`} ``) or assert on a substring that
    does not straddle the boundary.
33. 🔴 **`{ set: null }` on a `Json?` column is stored VERBATIM as
    `{"set": null}`.** *(Batch 7.)* Prisma treats an object assigned to a Json
    field as the VALUE, not as an update operator, so the column reads as "set"
    forever after and every `row.jsonCol ? …` check sees a truthy object. This
    bit a database-restore script, not app code. Trap 21's third face: to write
    SQL NULL use `Prisma.DbNull`, or raw SQL.
34. ⚠ **A dev server already running on the port serves STALE code, silently.**
    *(Batch 7.)* `npm run dev:admin` exits with `EADDRINUSE` while the old
    server keeps answering, so a brand-new screen renders as its previous
    version and the failure reads exactly like a broken component. Sibling of
    traps 6 and 25: **`lsof -ti :3002` before believing a page did not change.**
35. ⚠ **Replaying every hidden field (trap 26) COLLIDES with overriding a field
    of the same name.** *(Batch 7.)* `FormData` allows duplicates and
    `formData.get()` returns the FIRST, so an appended override is silently
    ignored and the action runs against the page's own subject — which reads
    exactly like a bypass attempt being correctly blocked when it was never
    attempted. In a verification harness, **replace** the replayed field, don't
    append beside it.

---

## Batch 0 — Scaffold, auth gate, shell, stubs · **A** · P0

Everyone is blocked on this. Half a day, no more.

**Files**
```
apps/admin/package.json                  ← add tailwind, eslint, @clbipp/core, @clbipp/pdf, dev script
apps/admin/next.config.ts                ← transpilePackages += core, pdf, decision-engine
apps/admin/postcss.config.mjs            ← new (copy apps/agent)
apps/admin/eslint.config.mjs             ← new (copy apps/agent)
apps/admin/.env.local  .env.example      ← new (same Supabase project as the other two)
apps/admin/src/proxy.ts                  ← NEW — the auth gate
apps/admin/src/app/globals.css           ← new
apps/admin/src/app/layout.tsx            ← rewrite
apps/admin/src/app/login/page.tsx        ← NEW
apps/admin/src/app/login/actions.ts      ← NEW
apps/admin/src/app/(admin)/layout.tsx    ← NEW — the ONLY shared file; nobody edits it after today
apps/admin/src/components/shell/*        ← NEW — ConsoleShell, Sidebar, Topbar, UserMenu
apps/admin/src/app/(admin)/**/page.tsx   ← 19 one-line stubs
scripts/smoke.mjs                        ← --app=admin + the admin route table
package.json (root)                      ← "dev:admin"
```

**Steps**
1. Copy `apps/agent`'s build setup verbatim — Tailwind v4, PostCSS, ESLint,
   the Prisma-engine prebuild. Do not invent a new one.
2. `dev:admin` on **port 3002** (customer 3000, agent 3001). All three must run
   at once.
3. `src/proxy.ts` — `createAuthMiddleware({ publicPaths: ['/login','/auth'],
   homePath: '/', allowRoles: ['admin'], onboardingPath: undefined })`.
   `ops` is **not** a role (AD2). Comment the fail-open trap at the top, same as
   the agent app's.
4. `/login` — email + password, mirroring the agent app's. **No self-signup.**
5. `ConsoleShell` — sidebar (four groups, per the wireframe), topbar (greeting,
   search box, avatar), **and a working logout** (W14). Desktop-first; the kit's
   own file, not `packages/ui` (AD11).
6. **Create all 19 routes from §2 as one-line stubs.** This is the single most
   valuable thing in this batch — it is what lets B and C work without ever
   creating a file A also creates.
7. `scripts/smoke.mjs` — `--app=admin`, the admin route table, and **both**
   role-gate directions.

**Done when** — ✅ **all met, 2026-08-26. See "Batch 0 — as built" at the foot
of this file.**
- [x] `npm run dev`, `npm run dev:agent`, `npm run dev:admin` all run together.
- [x] `npm run build` prints **`ƒ Proxy (Middleware)`** for admin. *(trap 1)*
- [x] `npm run smoke -- --app=admin` is green with a **content assertion** on `/`. *(trap 9)*
      — in the event, on **all 22 routes**, not just `/`.
- [x] `npm run smoke -- --app=admin --blocked business@test businesstest` bounces.
- [x] `npm run smoke -- --app=admin --blocked agent@test demo1234` bounces.
- [x] `npm run smoke -- --blocked admin@test demo1234` — admin barred from the customer app.
- [x] `npm run smoke -- --app=agent --blocked admin@test demo1234` — **admin barred
      from the agent app.** This line was missing from the sheet: three apps make
      **six** wrong-role pairings, not five.
- [x] No `AppShell` / `PhoneFrame` import anywhere in `apps/admin`. *(trap 15)*

---

## Batch 1 — Schema + seed delta · **B** · P0

One migration: **`admin_app_v1`**. Read `docs/ai-prompts/database-create-migration.md` first.

**Files:** `packages/database/prisma/schema.prisma`, `prisma/migrations/*`,
`prisma/reset-demo.ts`.

**Steps**
1. Add `EngineConfig`, `AdminAudit`, `ItemException` and the three enums
   (`ExceptionKind`, `ExceptionResolution`, `MarginTier`) exactly as §3 specifies.
2. `Profile` **+** `eprRegNo String?`, `marginTier MarginTier?`.
3. `MarketPrices` **+** `fxRateUsdInr`, `source`, `note`, `createdBy`.
4. 🔴 **Add no `PickupStatus` value and no per-item status column** (AD4, AD6).
5. Seed all eight fixtures from §3. Fixtures **4** (a pickup split across two
   chemistries) and **8** (a reactivated pickup carrying a stale `agentId`) are
   the two that catch real bugs — do not skip them.
6. Seed the active `EngineConfig` **from `DEFAULT_CONFIG` itself**, imported, not
   retyped. Add a test asserting the seeded row deep-equals `DEFAULT_CONFIG` —
   same pattern as the Batch 9 CO₂e drift check.
7. RLS: **close** the three new tables (AD3). No policy for `authenticated`.

8. **Swap the two placeholder ids in `scripts/smoke.mjs`** — `ADMIN_MANIFEST`
   and `ADMIN_TRACE` — for the real fixtures 4 and 5 ids once they are seeded.
   Both carry a `TODO` there. Until then those two admin routes exercise the
   router and the shell only. *(Batch 0 contract 2.)*

**Done when** — ✅ **all met, 2026-08-26. See "Batch 1 — as built" at the foot
of this file.**
- [x] `npm run db:migrate` and `npm run reset-demo` both green.
      — in the event `prisma migrate deploy`, not `migrate dev`; see deviation 1.
- [x] The `EngineConfig` drift test passes. 🔴 **No existing test's expected price changed.**
- [x] `/dispatch` would have ≥3 unassigned rows; three recyclers exist with non-overlapping chemistries.
- [x] Grants re-applied after the reseed. *(trap 7)* — plus `policies.sql`,
      `storage-policies.sql`, `realtime.sql`, in that order.
- [x] **New: `npm run verify-seed` is green — 21 checks, every §3 fixture by
      number.** Added this batch; see deviation 6.

---

## Batch 2 — Console data kit · **C** · P0

Pure components in `apps/admin/src/components/console/`. **Static props, zero
DB, zero imports from `apps/admin/src/app`.** Can start before Batch 0 lands.

**Build:** `DataTable` (sortable, filterable, **paginated** — W14), `KpiTile`
(incl. the "exception" dark variant), `Toolbar` + `FilterChips`, `PageHead`,
`CapacityGauge`, `MiniBarChart`, `SplitBar` (pathway mix), `Drawer`,
`ConfirmDialog`, and **`EmptyState` / `LoadingState` / `ErrorState`** — the
wireframe has none of the three and every screen needs them.

**Rules**
- Reuse `Badge` / `Card` / `Button` from `@clbipp/ui` where they fit; build new
  only where a desktop table genuinely differs.
- Status chips render from `STAGE_LABELS`. **Never a hand-written label.** *(trap 13)*
- Money props are **paise integers**; format with `formatPaise` from
  `@clbipp/core/format` at the render site. *(traps 4, 5)*
- 🔴 **Nothing in this directory may be moved into `packages/ui`** (AD11/AD12).

**Done when** every component renders from a fixture file, the workspace lints
and builds, and `DataTable` paginates 100 fixture rows without a wrapper doing it.

---

## Batch 3 — 🔴 Dispatch board · **A** · P0

**This closes the hole the project has had since day one.** `requested →
scheduled` + `Pickup.agentId`. Until this ships, a booking made in the customer
app is invisible to the agent app and `npm run assign-job` is the only route.

**Files:** `(admin)/dispatch/page.tsx`, `dispatch/[id]/page.tsx`,
`dispatch/actions.ts`.

**Steps**
1. `/dispatch` — every `status: 'requested'` pickup: vendor, address, declared
   items, preferred date, age. Oldest first.
2. `/dispatch/[id]` — the request in full, plus an agent picker sourced inline
   from `profile.findMany({ where: { role: 'agent' } })` with each agent's live
   job count. **Do not wait on C's `/agents` screen.**
3. `assignPickup` server action — **copy `apps/agent/src/app/(agent)/job/[id]/actions.ts`
   verbatim as the pattern**: session identity (never a form field),
   `createAdminClient()`, an in-code `role === 'admin'` re-check, status and
   `status_events` written **together**, idempotent, **POST not GET**.
   - Guard the race with `updateMany({ where: { id, status: 'requested' } })` —
     a second submit updates zero rows rather than reassigning.
   - Writes `agentId`, `scheduledSlot`, `etaMinutes`, `status: 'scheduled'`, and
     a `status_events` row with `actorRole: 'admin'`.
   - Writes `AdminAudit` (`pickup.assign`).
4. 🔴 **Handle the reactivated-pickup loose end** *(trap 11)*: a
   `cancelled → requested` pickup still carries its old `agentId` and
   `agentFeePaise`. Show it on `/dispatch` with a **"previously assigned to X"**
   marker, and **clear both fields** on reassignment. Seed fixture 8 is this row.
5. Leave `npm run assign-job` in place as the CLI fallback; add a line to its
   header pointing at this screen.

**Done when** — ✅ **all met, 2026-08-27. See "Batch 3 — as built" at the foot
of this file.**
- [x] 🎯 A `requested` pickup appears on `/dispatch` → assign it → **it appears on the agent's day view as SCHEDULED** ("Head over and tap Arrived"), and `/job/[id]` opens for the newly assigned agent. That round trip has never worked from a screen before. *(Verified by POSTing the real server action over HTTP; the booking-form half is in `docs/MANUAL_TEST_QUEUE.md`.)*
- [x] The customer's `/track/[id]` shows the partner card, the ETA and a custody entry attributing the assignment.
- [x] Double-submitting the assign form does not reassign or write a second event — four further POSTs left exactly one `scheduled` event and one audit row.
- [x] A forged `pickupId` (one already past `requested`) is rejected. So is an `agentId` that is not an agent, and an out-of-range ETA.
- [x] The reactivated pickup shows its stale-agent marker, and **`agentFeePaise` 71400 → null** on reassign.

---

## Batch 4 — `raisePayment()` + agent-collect wiring · **B** · P0

Small, and it unblocks the "vendor gets paid" half of the demo (AD10, §0b).

**Files:** `packages/core/src/payment-actions.ts` (next to `settlePayment`),
`apps/agent/src/app/(agent)/job/[id]/collect/actions.ts`.

**Steps**
1. `raisePayment(tx, { pickupId, vendorId, amountPaise })` — creates the
   `Payment` row at `pending`. **Idempotent** (a pickup has at most one), and it
   takes a transaction client so the caller composes it.
2. Call it inside `confirmCollection`'s **existing** `$transaction`, using
   `pickup.offer.estimatedPrice` as the amount. Do not open a second transaction
   — the comment at the top of that file explains why it is one.
3. Tests in `packages/core`: idempotency, and the amount matching the offer.

> Crossing into Ali's lane by design (AD10). **Log it in `docs/LANE_OWNERSHIP.md`.**

**Done when** — ✅ **all met, 2026-08-29. See "Batch 4 — as built" at the foot
of this file.**
- [x] A pickup collected in the agent app shows a real payable amount at the customer's `/payment/[id]` — ₹13,745 on `PKP-2026-000104`, driven over real HTTP.
- [x] Settling it works — `paid`, a `payout` ledger row, `INV-2026-000104`, and the vendor's wallet up by exactly the offer.
- [x] Calling `confirmCollection` twice (four times, in fact) creates **one** `Payment` and **one** `WalletTxn`, and writes no second status event.
- [x] `npm run smoke -- --app=agent` still green (30), and so are customer (46) and admin (22).

---

## Batch 5 — Pickups list + detail · **C** · P0

The spine (AD1). The screen the wireframe forgot (W2).

**Files:** `(admin)/pickups/page.tsx`, `pickups/[id]/page.tsx`.

1. `/pickups` — all nine stages, filter chips per stage, search by pickup id /
   vendor / agent, paginated. `+cancelled` is a filter, not a hidden state.
2. `/pickups/[id]` — vendor, agent, address, **every** `BatteryItem` with both
   halves side by side (customer-declared vs agent-confirmed — *they are allowed
   to disagree; that is a finding, not a bug*), the offer, the timeline via
   `buildStages` from `@clbipp/ui`, the custody log, `ItemException` rows, and
   links to the receipt / invoice / certificate where they exist.
3. 🔴 The status pill must distinguish the **two `offered` states** off
   `Offer.acceptedAt`. *(trap 10)*
4. Read-only. Every write on this pickup belongs to A's batches.

5. 🔴 **Read `searchParams.q` and filter on it** — the topbar search box in
   `ConsoleShell` is a real `GET` form posting to `/pickups?q=…` (Batch 0
   contract 1). Until this lands the box navigates and shows an unfiltered list,
   which reads as broken rather than absent.

**Done when** both render off real seeded data with content assertions in smoke,
a pickup at every one of the ten statuses renders without throwing, the
two-halves display never overwrites either half, and **`/pickups?q=` filters**.

---

## Batch 6 — Custody batch → `tested`; manifest build + dispatch · **A** · P0

The first half of AD5, and the group the wireframe has no screens for (W9).

**Files:** `(admin)/lifecycle/page.tsx`, `(admin)/manifests/{page,new/page,[id]/page}.tsx`,
`(admin)/manifests/actions.ts`, `(admin)/lifecycle/actions.ts`.

**Steps**
1. `/lifecycle` — pickups grouped by stage, with the **per-stage unit** made
   explicit in the UI (AD5): `collected` groups by custody batch, `tested` /
   `processed` by manifest, `recovered` one at a time.
2. `advanceCustodyBatch(batchId)` — `collected → tested` for every pickup in one
   `CustodyBatch`. Idempotent; one `status_events` row **per pickup**, all with
   `actorRole: 'admin'`; one `AdminAudit`.
3. `/manifests` — list by `ManifestStatus`.
4. `/manifests/new` — pick a facility, see its stock as `BatteryItem` rows at
   `tested`, select items, pick a recycler.
   - 🔴 **AD7, enforced in the action and not only in the picker:** the recycler
     must be `isActive` and its `acceptedChemistries` must cover **every** item
     on the manifest. This is chemistry-wise segregation expressed as code.
   - Mint `manifestNo` with a new `manifestNumber()` added next to
     `custodyBatchNumber()` in `@clbipp/core/documents` (there is no manifest
     helper yet); **generate the uuid in the action** *(trap 3)*.
5. `dispatchManifest(id)` — `draft → dispatched`, stamps `dispatchedAt`, writes
   `AdminAudit`. A dispatched manifest is **immutable** — that is why `itemIds`
   is a Json snapshot rather than a join table (the schema comment says so).
6. 🔴 **Do not advance any pickup here.** Dispatch is "it left the building";
   `processed` is Batch 7, and it happens on *confirmation*.

**Done when** a seeded facility's tested stock can be built into a manifest and
dispatched; a recycler that does not accept a selected chemistry is rejected
**by the action** when the check is bypassed in the form; advancing a custody
batch twice writes one event per pickup, not two.

---

## Batch 7 — Manifest confirm → `processed` / `recovered`; `certified` · **A** · P0

The second half of AD5, and the end of the journey.

**Files:** `(admin)/manifests/[id]/page.tsx`, `manifests/actions.ts`,
`lifecycle/actions.ts`.

**Steps**
1. `confirmManifestReceived(id)` — `dispatched → received`, then advance the
   affected pickups `tested → processed`.
2. `reconcileManifest(id, recoveryData)` — `received → reconciled`, capture
   recovered mass per metal, then advance `processed → recovered`.
3. 🔴 **AD6 — the query that makes both of the above correct.** For each pickup
   touched by the manifest, advance it **only if every one of its
   `BatteryItem`s sits on a manifest at or past this state.** The obvious
   implementation ("advance the pickups on this manifest") is **wrong** — it
   would advance a pickup half of whose items are still at the hub. Seed fixture
   4 is the row that catches it.
4. `certifyPickup(pickupId)` — `recovered → certified`, per pickup, and it
   **mints the `Certificate` row and the PDF**: `totalWeightKg`,
   `materialSummary`, `co2AvoidedKg` from `@clbipp/core/impact` (🔴 **never write
   CO₂ arithmetic in a screen**), via B's `buildCertificatePayload` (Batch 8).
   Idempotent — a second call returns the existing certificate.
5. B06's **per-pickup manual override**: any single-step advance, with a
   **required typed reason**, writing `AdminAudit` (`lifecycle.override`). This
   is the exception path and the escape hatch named in risk R1.
6. Every advance validates **one step forward** against `LIFECYCLE_STAGES`
   *(trap 13)*. No skipping, no reversing.

**Done when**
- [ ] 🎯 **The whole journey runs from screens only, no CLI, no seed:** vendor books → admin dispatches → agent arrives, assesses, offers → vendor accepts → agent collects → **vendor is paid** → agent drops at hub → admin advances the batch → admin dispatches to a recycler → admin confirms and reconciles → admin certifies → **the vendor's `/compliance` shows a real EPR certificate they can download.**
- [ ] A pickup split across two recyclers does **not** advance until both manifests are confirmed. *(AD6)*
- [ ] `certifyPickup` twice yields one certificate.
- [ ] Every `status_events` row written in this batch has `actorRole: 'admin'`. 🔴 Never `'recycler'` — we are not one (AD5).

---

## Batch 8 — Certificate payload + shared CPCB/EPR export · **B** · P0

**Files:** `packages/core/src/certificate.ts` (new),
`packages/core/src/compliance-export.ts` (lifted from
`apps/customer/src/lib/compliance-export.ts`).

1. `buildCertificatePayload(pickupId)` — pure: total weight, per-metal material
   summary, CO₂e from `impact.ts`. Returns the payload; **does not write**. A
   calls it in Batch 7.
2. Lift `COLUMNS` and the row builder out of the customer app into
   `packages/core` so admin and customer share **one** CPCB format (this is
   where open question 8's answer lands — one file, both apps). Point the
   customer's `/api/exports/compliance` at it; its output must be byte-identical.
3. Add the admin-side aggregate: per-metal input vs recovered vs yield, and
   certified mass by period. 🔴 **No EPR-credit number** until open question 17
   is answered — report certified mass instead of inventing a conversion.

**Done when** the customer's existing export is byte-identical before and after
the lift, tests cover the payload builder, and `npm run smoke` is green for the
customer app *(against a production build — trap 17)*.

---

## Batches 9–16 — the oversight tier

Everything below sits **on top of a working demo**. The journey (0, 1, 2, 3, 4,
6, 7, 8, 17) is what must never be cut; these eight are what make the console an
oversight tool rather than a lifecycle remote control.

**At a glance** — the same table that used to stand alone here, kept because it
is the fastest way to see the shape. **The detail follows, one section each, in
the same format as Batches 0–8.**

| # | Batch | Owner | Tier | Depends on | The thing not to get wrong |
|---|---|---|---|---|---|
| 9 | Network — suppliers / agents / facilities + recyclers | C | P1 | 0, 1, 2 | Margin-tier override writes `Profile.marginTier` **and** an `AdminAudit`; it is a live pricing lever (`selection.ts` already honours it). |
| 10 | Inventory | C | P1 | 2, 6 | Stock is derived from `CustodyBatch` + item state, not a stored counter. Dwell alerts compute off `handedOffAt`. |
| 11 | Engine config + `getActiveConfig()` + the AD9 fix | B | P1 | 1 | 🔴 Tier 3 fields are **read-only** (AD8/W3). The quote route stops reading `body.config` (AD9) — **a pricing-surface change: say so in the commit message.** |
| 12 | Quote queue + traceability | C | P1 | 2 | 🔴 **Flat-rate items must appear** (W2/AD1) — pathway `—`, a `FLAT RATE` chip. Trace reads `BatteryItem.quoteData`. |
| 13 | Compliance | B | P1 | 8 | Reuse Batch 8's export — one CPCB format, one file. No EPR-credit figure (open question 17). |
| 14 | Exceptions + `/audit` | A | P2 | 1 | Every resolution writes `AdminAudit` with before/after and a reason. Resolutions are `retest` / `override` / `reject`. |
| 15 | Dashboard + analytics | C | P2 | most | Every tile is an aggregate of screens already built — build it **last**, not first. Margin % is fine here (AD12) and must never reach a vendor screen. |
| 16 | Market feed | B | P2 | 1, 11 | The override writes a **new `MarketPrices` snapshot row**, never an update in place. |

> **Cut order if Day 6 runs out (§5, pre-agreed):** 16 → 15 → 14 → 12. Nothing
> else in this tier is on the list, and nothing in the P0 spine ever is.

---

## Batch 9 — Network: suppliers, agents, facilities · **C** · P1

The three directory screens (E01–E03). Read-only but for **one** write, and that
one write is a live pricing lever — treat it with Batch 3's seriousness, not a
directory screen's.

**Files**
```
apps/admin/src/app/(admin)/suppliers/page.tsx     ← replace C's stub
apps/admin/src/app/(admin)/agents/page.tsx        ← replace C's stub
apps/admin/src/app/(admin)/facilities/page.tsx    ← replace C's stub
apps/admin/src/app/(admin)/suppliers/actions.ts   ← new — the margin override
```

**Steps**

1. `/suppliers` (E01) — `profile.findMany({ where: { role: 'customer' } })`.
   Columns: company / full name, `vendorType`, **`eprRegId`**, `kycStatus`,
   pickups YTD, certified mass, `marginTier`, wallet balance.
   - 🔴 **The column is `eprRegId`, not `eprRegNo`.** W11's EPR half is factually
     wrong and Batch 1 did not add a second column — see Batch 1 deviation 2. A
     screen written against `eprRegNo` will not compile, and one that "fixes" it
     by adding the column starts null for every real vendor.
   - Wallet balance and any ₹ via `formatPaise` from **`@clbipp/core/format`**
     *(traps 4, 5)*; it rounds to whole rupees *(trap 27)*.
2. Margin-tier override — a `<select>` over the `MarginTier` enum
   (`aggressive | standard | generous`) posting to `setMarginTier`.
3. `setMarginTier(profileId, tier, reason)` in `suppliers/actions.ts` —
   **copy `(admin)/dispatch/actions.ts`'s shape verbatim**, which is this app's
   reference lifecycle write:
   - `requireAdmin()` from `@/lib/admin-identity` first. Under AD3 that plus
     `src/proxy.ts` is the entire access boundary.
   - Validate `tier` against the enum server-side and re-read the target profile
     to confirm `role === 'customer'` — never trust the posted role.
   - 🔴 **A typed reason is REQUIRED.** `isReasonRequired('supplier.margin')`
     from `@clbipp/core/audit` returns `true`. Reject an empty one in the action.
   - `$transaction { profile.update, adminAudit.create }` — action
     `'supplier.margin'`, `subjectType: 'profile'`, `before: { marginTier: old }`,
     `after: { marginTier: new }`, both from `@clbipp/core/audit`, never a bare
     string literal.
   - 🔴 `before` / `after` are `Json?` — **`null` is a type error** *(trap 21)*.
     Omit the field or use `Prisma.DbNull` deliberately.
   - POST, not GET; `revalidatePath('/suppliers')`; redirect-after-POST with the
     error in the query string.
4. 🔴 **The lever is recorded but INERT until Batch 11.** `computePricingBand`
   ([`selection.ts:92`](../packages/decision-engine/src/decisionEngine/layers/selection.ts))
   already honours `config.supplier_margin_overrides[supplier_id]` — but nothing
   populates that map from `Profile.marginTier`. Batch 11's `getActiveConfig()`
   is what wires it. Say so in this screen's own comment, so nobody demos a
   margin change and believes it moved a price. **The commit that wires it is a
   price-moving commit and must say so.**
5. `/agents` (E02) — `role: 'agent'`: `fullName`, `agentZone`, `agentVehicle`,
   `safetyTrainedAt`, `agentRating`, and live load from **`liveJobCounts()` in
   `@/lib/job-load`**. 🔴 Import it; do not re-derive the count. `LIVE_JOB_STATUSES`
   (`scheduled | arrived | offered`) is the definition of "live", and a pickup at
   `requested` with a stale `agentId` is deliberately **not** counted.
   - ⚠ **Only one agent account is seeded** (`agent@test`, Ravi Kumar) — Batch 3
     note 4. The roster is a one-row table until B seeds a second, which needs a
     Supabase auth user and a `verify-seed` check.
6. `/facilities` (E03) — **two tables on one screen**, because E03 is "facilities
   we operate **+** CPCB-registered recyclers" and there is deliberately no
   `/recyclers` route in `nav.ts`:
   - `Facility`: name, location, `capacityKg`, `isActive`, current stock, open
     manifests.
   - `Recycler`: name, `cpcbRegNo`, `acceptedChemistries`, `capacityKg`,
     `isActive`, manifests received.
   - 🔴 `acceptedChemistries` is **`BatteryType[]`** (`li_ion_nmc`…), not the
     engine's `Chemistry` (`NMC622`…). Never merge the two *(trap 14, W13)*.
   - ⚠ **No recycler accepts `nimh` or `other`.** That is AD7's gate having
     something real to reject, not a gap — render it plainly rather than
     papering over it.
7. Everything else on all three screens is read-only. Every other write in the
   console belongs to A's batches.

**Done when**
- [ ] All three render off real seeded data, with a content assertion each in
      `scripts/smoke.mjs` — 🔴 not a bare status code *(trap 9)*.
- [ ] A margin-tier change writes **both** `Profile.marginTier` and an
      `AdminAudit` row carrying before, after and the reason; submitting it with
      an empty reason is rejected **by the action**, not only by the form.
- [ ] Double-submitting the override writes one audit row, not two.
- [ ] A forged `profileId` (an agent's, or an admin's) is rejected.
- [ ] `/agents` shows the same live-load number `/dispatch/[id]` does — because
      both call `liveJobCounts()`.
- [ ] The screen states, in the UI, that a margin tier does not price anything
      until Batch 11 lands. *(Delete that line in Batch 11.)*
- [ ] `docs/LANE_OWNERSHIP.md` notes that C wrote a lifecycle-shaped action
      (A's lane by the standing map) — do-it-and-note-it.

---

## Batch 10 — Inventory · **C** · P1

C01. What is physically sitting in our facilities right now, and how long it has
been there. **Every number on this screen is derived; nothing is stored.**

**Files**
```
apps/admin/src/app/(admin)/inventory/page.tsx    ← replace C's stub
apps/admin/src/lib/stock.ts                      ← new — the one definition of "in this facility"
```

**Steps**

1. 🔴 **Stock is derived, not counted.** There is no stock column, no counter,
   and none is being added. An item is *at* a facility when its pickup is in one
   of that facility's `CustodyBatch`es and the item is not yet on a manifest at
   `dispatched` or past it. `DispatchManifest.itemIds` is a **Json snapshot**
   (deliberately, so a dispatched manifest is immutable) — so this is a read of
   `itemIds` across the facility's manifests, not a join.
2. 🔴 **Put that rule in `@/lib/stock.ts` and have Batch 6's `/manifests/new`
   picker import it.** Both screens answer "what is in this facility"; if they
   answer differently, one of them is lying and the manifest one moves batteries.
   Refactoring A's `/manifests/new` to the shared helper is the cross-lane touch
   here — do it, and note it in `docs/LANE_OWNERSHIP.md`. If they must genuinely
   differ (the picker filters to `tested`; the screen shows everything at the
   hub), express that as an argument to one function, not two implementations.
3. Group by chemistry using **`BatteryType`** chips *(trap 14)*. 🔴 **Flat-rate
   lead-acid items must appear** — they have no `traceId`, and a table keyed on
   one silently drops roughly half the seeded data (W2/AD1).
4. Capacity gauge per facility — summed `confirmedWeightKg` (falling back to the
   customer-declared `weightKg × quantity` where the agent has not confirmed;
   🔴 **never overwrite either half**) against `Facility.capacityKg`. Both are
   Prisma `Decimal` — `.toNumber()` at the read boundary, and keep weights out of
   the paise rule: paise is for money, not mass.
5. Dwell alerts off `CustodyBatch.handedOffAt`. Thresholds are **literals in
   `@/lib/stock.ts` with a comment saying so** — they are not `EngineConfig`
   parameters and must not be added to one (AD8 is about pricing, not ops).
6. Custody-batch list: `batchNo`, agent, `itemCount`, `totalWeightKg`,
   `handedOffAt`, `receivingStaffName`, and the current stage of its pickups.
   ⚠ `receivingStaffName` is typed by the **agent**, not the hub — open question
   18. Label it honestly ("attested by the agent"), do not present it as a hub
   signature.
7. Empty / loading / error states from Batch 2's kit — a facility with no stock
   is the normal case mid-demo, not an error *(W14)*.

**Done when**
- [ ] `/inventory` renders with a content assertion in smoke, off real seeded
      custody batches.
- [ ] The stock figure for a facility **equals** the row count `/manifests/new`
      offers for that facility at `tested` — same helper, same answer.
- [ ] Dispatching a manifest (Batch 6) reduces the facility's stock on the next
      render, with no counter anywhere to update.
- [ ] A lead-acid item with no `traceId` appears in the chemistry breakdown.
- [ ] A facility with zero stock renders `EmptyState`, not a crash and not a
      blank card.

---

## Batch 11 — `getActiveConfig()` + `/config` + the AD9 fix · **B** · P1

D01, and 🔴 **the one place in this sprint where a bug moves money silently**
(risk R3). It also closes a live security defect (W3b/AD9).

**Files**
```
packages/core/src/engine-config.ts                    ← new — getActiveConfig() + the validator
packages/core/src/engine-config.test.ts               ← new
apps/admin/src/app/(admin)/config/page.tsx            ← replace B's stub
apps/admin/src/app/(admin)/config/actions.ts          ← new — publish
apps/agent/src/app/api/quote/route.ts                 ← 🔴 the AD9 fix
```

**Steps**

1. `getActiveConfig(): Promise<Config>` in `packages/core/src/engine-config.ts` —
   `engineConfig.findFirst({ where: { isActive: true } })`. It lives in
   `packages/core`, **not `apps/admin/src/lib`**, because the *agent* app's quote
   route is its most important caller.
   - 🔴 **Batch 1 contract 3 — two version strings, and this is where someone
     picks.** `EngineConfig.version` is `v2026-08-26-r1` (the row's publish
     identity); `config.config_version` inside the JSON is `v0.1.0-placeholder`
     (the engine's build stamp). They disagree on a fresh seed, deliberately.
     **Return `{ ...row.config, config_version: row.version }`** so a quote's
     audit trail names the *published* config. 🔴 **Do not fix this by editing
     `defaults.ts`** — that rewrites every existing quote's audit trail.
   - No active row: fall back to `DEFAULT_CONFIG` and log loudly. A quote that
     silently prices off a fallback is worse than one that says it did.
2. 🔴 **AD9 — the quote route stops trusting the client.**
   [`apps/agent/src/app/api/quote/route.ts`](../apps/agent/src/app/api/quote/route.ts)
   passes **`body.config`** straight into `computeQuote`. An agent's browser can
   POST `margin_tiers: { aggressive: 0 }` and reprice its own quote. Replace it
   with `await getActiveConfig()` and drop `config` from the request contract
   entirely — do not accept-and-ignore it.
   - 🔴 **This is a pricing-surface change and the commit message must say so**,
     even though AD8 makes it price-**neutral** today: the seeded `EngineConfig`
     is byte-identical to `DEFAULT_CONFIG`, which is exactly what
     `body.config` carried. Prove that claim, don't assert it (see done-when).
3. Merge the supplier lever: build `supplier_margin_overrides` from
   `Profile.marginTier` (Batch 9's column) — `{ [vendorId]: tier }` for every
   non-null one. 🔴 **This DOES move prices** for any vendor with a tier set, via
   `computePricingBand`'s `p_recommended`. Separate commit from step 2 if you can,
   so the price-neutral change and the price-moving one are not one diff.
4. `/config` UI, per AD8 / W3:
   - **Tier 1 + 2 editable** — processing / QA / refurb-labour / cell-replacement
     / hydromet rates, caps, chemistry composition, recovery efficiencies, margin
     tiers, hurdle rate, reuse + refurb rate cards, chemistry multipliers,
     logistics, overhead, refining %, yield loss, SoH restoration delta, flat
     repackaging fee.
   - 🔴 **Tier 3 read-only**, with a "changing this is a code change" note naming
     the files: damage weights `0.4 / 0.35 / 0.25` and bands `1.5 / 2.5` in
     `layers/damage.ts`, SoH gates `75 / 50` in `layers/sohGating.ts`. They are
     literals in the engine, not `Config` parameters — a screen cannot move them.
   - Chemistry rows use the engine's **`Chemistry`** (`NMC622 | NMC811 | LFP |
     LCO | NCA`), which is **not** the operational `BatteryType` *(trap 14, W13)*.
     This is the one screen in the console that legitimately uses the engine
     vocabulary.
5. `publishConfig` in `config/actions.ts` — **append-only**:
   - `requireAdmin()`, then validate (step 6) **server-side**, then
     `$transaction { engineConfig.updateMany({ where: { isActive: true }, data: { isActive: false } }), engineConfig.create({...}), adminAudit.create({...}) }`.
   - 🔴 **Generate the uuid in the action** — `@default(uuid())` does not apply to
     a service-role write *(trap 3)*.
   - `parentVersion` = the version just deactivated. `publishedBy` = `admin.id`.
   - Audit: `'config.publish'`, `subjectType: 'engine_config'`, and 🔴 **before /
     after carry the two version strings and the changed fields only** — the
     schema comment is explicit that it must not be two 4KB blobs.
   - 🔴 Nothing is updated in place. Exactly one row is `isActive`, enforced by
     this transaction and not by a partial index (Prisma cannot express one).
6. The validator, in `packages/core` so it is testable and runs server-side (the
   form is not the boundary — same posture as AD7):
   - margin tiers ordered `aggressive > standard > generous`, each in 0..1;
   - every `recovery_efficiency` in 0..1;
   - every percentage (`overhead_rate_pct`, `refining_rate_pct`, `yield_loss_pct`)
     in 0..1; every rate ≥ 0; `cycle_cap` / `age_cap` > 0;
   - each chemistry's composition fractions sum to ≤ 1.0;
   - 🔴 "damage weights sum to 1.00" is a **tier-3 assertion against the literals
     in `damage.ts`**, not a check on submitted input — there is no input to check.
7. Version string minted server-side: `v<YYYY-MM-DD>-r<n>`, `n` incrementing
   within the day; the column is `@unique`, so collide and you get a 500 — derive
   it from a count, don't guess.
8. **"Simulate — replay the last 142 quotes" is a stub with a `// TODO`** (§2's
   named cut). The TODO should say *why*: it is genuinely buildable off
   `BatteryItem.quoteData`, but 🔴 **`quoteData` is not seeded** (Batch 1 note 6),
   so there is nothing to replay yet.
9. The drift test stays green: the seeded row must remain equal to
   `DEFAULT_CONFIG` **by value** — 🔴 Postgres `jsonb` does not preserve key
   order, so a `JSON.stringify` comparison fails on identical data *(trap 20)*.

**Done when**
- [ ] 🎯 **A quote computed through `/api/quote` with `config` omitted from the
      body returns the identical numbers it returned with `body.config` before
      this batch** — same item, same market row. That is the proof step 2 is
      price-neutral, and it belongs in the commit message.
- [ ] POSTing `body.config` with `margin_tiers: { aggressive: 0 }` changes
      **nothing** about the returned band. The defect is closed.
- [ ] Publishing writes a new `EngineConfig` row, deactivates exactly one, and
      leaves exactly one `isActive` — asserted by querying, not by reading the UI.
- [ ] A config failing any validator rule is rejected **by the action** when the
      check is bypassed in the form.
- [ ] The audit row names both versions and the changed fields, and carries no
      bare `null` in `before` / `after` *(trap 21)*.
- [ ] Tier 3 renders and **cannot be submitted** — no input, no hidden field, no
      accepted key.
- [ ] The drift test and all engine tests still pass; `npm run test` green.
- [ ] 🔴 The commit message states the pricing-surface change explicitly, and
      names step 3 as the price-moving half.

---

## Batch 12 — Quote queue + traceability · **C** · P1

D03 + D04. The wireframe's flagship pair, and the two screens W2 gets most wrong.

**Files**
```
apps/admin/src/app/(admin)/quotes/page.tsx          ← replace C's stub
apps/admin/src/app/(admin)/trace/[traceId]/page.tsx ← replace C's stub
```

**Steps**

1. 🔴 **`/quotes` is keyed on `BatteryItem`, never on `trace_id`** (W2/AD1). A
   `trace_id`-keyed table drops every flat-rate item — roughly half the seeded
   data — silently and with no error. Flat-rate rows render pathway `—` and a
   **`FLAT RATE`** chip; they are not a missing row, they are the other half of
   the business.
2. Columns: item, pickup (linking `/pickups/[id]`), vendor, category, chemistry
   (`BatteryType` chips — *trap 14*), confirmed weight, `damageScore`, pathway,
   `unitPricePaise` / `linePricePaise`, `traceId` or `—`. Money through
   `formatPaise` from `@clbipp/core/format` *(traps 4, 5)*; it rounds to whole
   rupees, so write smoke assertions from the **rendered** string *(trap 27)*.
3. Filters and pagination from Batch 2's `DataTable` / `FilterChips`: pathway,
   chemistry, engine-vs-flat-rate, lifecycle stage. Status chips render from
   `STAGE_LABELS` — 🔴 never a hand-written label *(trap 13)*.
4. `/trace/[traceId]` — look up by `BatteryItem.traceId`.
   - 🔴 **The index is not unique.** A flat-rate item has no `traceId` at all and
     a re-quote reuses one; `pathway_decisions.trace_id` is the unique side of
     that join. Take the most recent and say so if there is more than one.
   - A miss renders the kit's `EmptyState`, not a throw — a hand-typed trace id
     is exactly as likely as a clicked one.
5. The screen shows: verdict and pathway, the P_min / P_recommended / P_max band
   and margin % (fine here — AD12; 🔴 **never on a vendor screen**), the
   `quoteData` `{ input, output }` breakdown, the item's pickup timeline via
   `buildStages` from `@clbipp/ui` *(traps 12, 13)*, and the immutable audit
   block (config version, market snapshot id, fx rate, engine version).
6. 🔴 **The breakdown has no data yet, and that is expected.** Batch 1 note 6:
   `quoteData` is **not seeded** — running the engine in the seed needs BMS
   fields no screen collects (the Batch 5a workaround). Note 7: `PathwayDecision`
   rows do not exist either, so `traceId` points at nothing on that side. So
   every seeded trace has pathway + prices and **no engine breakdown**. Render
   that section as an `EmptyState` reading "no engine run recorded for this item"
   — 🔴 do not crash, and do not fabricate one. Whether the demo needs seeded
   `quoteData` is a call for the team; if yes it is B's seed change plus a
   `verify-seed` check, not a screen change.
7. Read-only. Resolving a flag is Batch 14; re-pricing is not in this sprint.

**Done when**
- [ ] `/quotes` shows **both** a li-ion item with a `traceId` and a lead-acid one
      without, on the same page, with content assertions for both in smoke.
- [ ] `PKP-2026-000113`'s two items both appear — that is fixture 4, and it is
      the row a `trace_id`-keyed table loses.
- [ ] `/trace/TRC-2026-1130` renders verdict, prices and timeline, and an honest
      empty breakdown.
- [ ] An unknown trace id renders `EmptyState` with a 200, not a 500.
- [ ] No recovery-rate % and no margin figure has leaked into any customer-app
      screen — 🔴 nothing from `apps/admin` is imported by `apps/customer`, and
      nothing here moved into `packages/ui` (AD11/AD12).

---

## Batch 13 — Compliance · **B** · P1

F01. The reporting face of everything Batches 7 and 8 made real.

**Files**
```
apps/admin/src/app/(admin)/compliance/page.tsx              ← replace B's stub
apps/admin/src/app/api/exports/compliance/route.ts          ← new — the admin-scoped export
packages/core/src/compliance-export.ts                      ← Batch 8's lifted module; extend, don't fork
```

**Steps**

1. 🔴 **Reuse Batch 8's lifted `compliance-export.ts`. One CPCB format, one file,
   both apps.** Forking the column set is how the customer's return and the
   admin's stop agreeing, and the customer's output is asserted byte-identical.
2. The admin export differs from the customer's in **exactly one argument**: the
   customer's is scoped by `vendorId`, this one is not. Under AD3 there is no RLS
   behind it — **`requireAdmin()` is the gate on the route**, and it must be the
   first thing the handler does.
3. The screen: batteries handled and **certified mass** by period; per-metal
   input vs recovered vs yield (Batch 8 step 3's aggregate); recovery against
   target — 🔴 targets are literals/config in this module, **not schema** (W5);
   and a certificate feed off `Certificate`, which Batch 7 finally mints for real
   rather than `reset-demo.ts` writing them.
4. 🔴 **No EPR-credit number anywhere.** The wireframe's "EPR credits earned —
   31.8" is backed by nothing; the conversion is a regulatory rule we do not have
   (open question 17). Report certified mass and label it as such. Inventing the
   conversion is the one failure on this screen a regulator would catch.
5. CO₂e comes **only** from `@clbipp/core/impact` (`co2eAvoidedKg`,
   `aggregateMaterials`, `formatMaterials`) — 🔴 never CO₂ arithmetic in a screen
   or a route. ⚠ **Read that file's header before quoting a number**: the factors
   are placeholders with unverified citations and only their relative ordering is
   defensible (open question 7).
6. Year filter mirrors the customer's `?year=` — unparseable input is **ignored,
   not a 500**; a bad query string must not turn a download into an error.

**Done when**
- [ ] The customer's `/api/exports/compliance` output is **byte-identical**
      before and after this batch — the same assertion Batch 8 shipped, re-run.
- [ ] The admin export returns every vendor's rows; the customer's still returns
      only its own.
- [ ] The export route 307s a vendor session and an agent session to `/login`,
      and `requireAdmin()` rejects anything that gets past the proxy.
- [ ] `/compliance` renders with a content assertion in smoke, against a
      **production build** *(trap 17)*.
- [ ] 🔴 A grep of the built screen finds no credit figure and no invented
      conversion factor.

---

## Batch 14 — Exceptions + `/audit` · **A** · P2

D05 + F03. W4's screen finally has a table under it, and W7's audit trail finally
has a reader.

**Files**
```
apps/admin/src/app/(admin)/exceptions/page.tsx     ← replace A's stub
apps/admin/src/app/(admin)/exceptions/actions.ts   ← new — resolve
apps/admin/src/app/(admin)/audit/page.tsx          ← replace A's stub
```

**Steps**

1. `/exceptions` — 🔴 **"open" is `resolvedAt: null`.** There is no open/closed
   boolean and none is being added; the schema comment says so explicitly, and a
   second source of truth would drift out of step with the resolution fields.
   Columns: `kind` (`hold` / `review`), `cause` (machine-readable) and `detail`
   (the human sentence), the item, its pickup, the vendor, `openedAt` and age.
   The `@@index([resolvedAt])` does not sort open rows to the front (nulls sort
   last on a DESC index) — **filter, do not rely on ordering.**
2. `resolveException(id, resolution, notes)` — the `dispatch/actions.ts` shape
   again: `requireAdmin()` → validate `resolution` against the
   `ExceptionResolution` enum (`retest | override | reject`, exactly those three)
   → `$transaction { itemException.updateMany({ where: { id, resolvedAt: null }, data: {...} }), adminAudit.create(...) }`.
   - The guarded `updateMany` **is** the idempotency story — a second submit
     updates zero rows rather than re-resolving. Keep it.
   - Audit: `'exception.resolve'`, `subjectType: 'item_exception'`, before/after
     carrying the resolution fields only, from `@clbipp/core/audit`.
3. 🔴 **Resolving an exception changes NO pickup status and NO item pathway.** An
   `ItemException` is an engine flag and its resolution, per **battery item**; it
   is not a lifecycle stage (AD4) and there is no per-item status column (AD6). If
   a `reject` ought to stop a pickup advancing, that is **Batch 7's per-pickup
   manual override with a typed reason** (`lifecycle.override`), a different
   action in a different file. Wiring it here would put a lifecycle write behind
   a screen that does not own one.
4. `/audit` — `AdminAudit` newest first (the `createdAt DESC` index exists for
   this), filterable by action / `subjectType` / actor, paginated, with a
   before/after diff per row.
   - 🔴 The filter list comes from **`ADMIN_AUDIT_ACTIONS` in
     `@clbipp/core/audit`**, never a hand-written array — same reason writes go
     through the type: a typo-variant makes every `where: { action }` read
     under-count, silently.
   - Actor is a real FK with no `onDelete` (Prisma's `Restrict`) — an actor
     cannot vanish out of the trail. Leave that alone.
5. 🟠 **If `/audit` ever renders `StatusEvent` alongside `AdminAudit`, handle two
   spellings of one role** — seeded vendor events say `'customer'`;
   `reschedulePickup` in the customer app writes `'vendor'` (Batch 1's notes).
   Pick one and migrate, or handle both; do not half-do it. And 🔴 **never write
   `actorRole: 'recycler'` or `'hub'`** — every admin-written stage past the hub
   is an admin asserting on a party's behalf, and the trail has to say `'admin'`.
6. Fixture 6 seeds **two or three open** `ItemException` rows and no resolved
   one — so the resolved view is empty until you resolve something. `EmptyState`,
   not a blank panel.

**Done when**
- [x] An open exception resolves to each of `retest` / `override` / `reject`, and
      each writes an `AdminAudit` row with before, after and the notes.
- [x] Resolving the same exception twice updates zero rows the second time and
      writes one audit row in total.
- [x] 🔴 Resolving an exception leaves its item's pickup at the **same
      `PickupStatus`**, with **no** new `status_events` row. Assert this — it is
      the mistake this screen invites.
- [x] An invalid `resolution` string, and a resolution posted for an
      already-resolved id, are both rejected by the action.
- [x] `/audit` shows the dispatch assignments from Batch 3, the payment-free
      collections (correctly absent — an agent action writes no `AdminAudit`),
      and every write from Batches 6, 7, 9, 11 and 16.
- [x] Both routes carry content assertions in smoke.

### Batch 14 — as built (2026-08-31, A — Aamir)

**Three files, exactly the three the sheet names.** No new `src/lib/` helper and
no schema change.

```
apps/admin/src/app/(admin)/exceptions/page.tsx     replaced A's stub
apps/admin/src/app/(admin)/exceptions/actions.ts   new — resolveException
apps/admin/src/app/(admin)/audit/page.tsx          replaced A's stub
```

**Decisions worth knowing before touching either screen**

1. 🔴 **`resolveException` advances nothing, and the harness asserts the
   absence.** No `pickup.update`, no `statusEvent.create`, no
   `batteryItem.update`. `override` on this screen means *the engine's flag was
   wrong about this item*, never *advance this pickup*. The lifecycle escape
   hatch is still B06's `lifecycle.override`, in a different file, with a typed
   reason. This is step 3 of the sheet and it is the mistake the screen invites.

2. **The three resolutions come off the Prisma enum object, in both directions.**
   `Object.values(ExceptionResolution)` builds the `<select>` in the page and the
   validator in the action, so the form and the check cannot drift, and a fourth
   value added by a migration is honoured for free. Safe as a **value** import
   only because both files are server-only — in a client component it would drag
   the query engine into the bundle (trap 4's reasoning, applied to an enum).

3. **`notes` is optional and stored as SQL NULL when blank**, so "no note" and
   "a note that was blanked" stay distinguishable. `reason` is deliberately
   *not* written: `isReasonRequired('exception.resolve')` is `false`, and the
   typed reason belongs to the three escape hatches. The note lands in the audit
   row's `after` instead, which is where `/audit` renders it.

4. 🟠 **`/audit` does NOT merge `StatusEvent` into the trail** — sheet step 5,
   answered by declining it. `status_events` carries **two spellings of one
   role** (`'customer'` in the seed, `'vendor'` from `reschedulePickup`), and
   the instruction is "pick one and migrate, or handle both; do not half-do it".
   Migrating a column is a B-lane schema change on the last build day, so the
   screen renders `AdminAudit` only and carries a footer saying where a vendor's
   or agent's action actually lives. 🔴 **This is the batch's one deferral —
   see "Known, deliberately not done".**

5. **Both screens filter with `<Link>`s and a query string, not client state.**
   `/audit` paginates **server-side** (25/page) because `admin_audits` is
   append-only and only ever grows; C's `<DataTable>` is a client component that
   paginates in the browser, which is the wrong shape for it. Same call every
   A-lane screen in this app has made — logged in `docs/LANE_OWNERSHIP.md`.

6. **`/audit`'s action chips come from `ADMIN_AUDIT_ACTIONS`**, filtered to the
   ones that have actually fired (plus whatever the URL asks for, so a shared
   link never loses its own filter). 🔴 An unknown `?action=` is dropped through
   `isAdminAuditAction()` rather than passed to Prisma — otherwise a typo in a
   pasted URL renders an empty page that looks exactly like "nothing happened".
   ⚠ The row-level narrow is `isAdminAuditAction(row.action) ? row.action : null`,
   **not a boolean** — a boolean flag leaves `row.action` a bare `string`, which
   cannot index the label map. That was the batch's only type error.

7. **Chip counts are computed over the WHOLE table, not the active filter.** A
   chip reading "0" because another chip is on would be a lie about what is in
   the log.

### How this batch was verified

Same technique as Batches 3, 6 and 7: `npm run smoke` cannot POST (traps 24/26),
so `/exceptions` was driven **through the real HTTP path** — proxy, session
cookie, server action, database — by a throwaway harness logging in as
`admin@test`, replaying every hidden field and **replacing** the ones it
overrode (trap 35).

| Step | Outcome |
|---|---|
| `/exceptions` renders | 3 open exceptions, 3 resolve forms — one per open row |
| 🔴 **`resolution=ignore` posted past the `<select>`** | rejected **by the action** — *"…is not a resolution. It has to be one of retest, override, reject."*, and the row stayed open |
| unknown exception id | rejected — *"That exception does not exist."* |
| resolve `retest` · `override` · `reject` | all three applied; each wrote **exactly one** `AdminAudit` row with `before` (four nulls), `after` (resolution + resolver + timestamp + notes) and a real `actorId` |
| 🔴 **no pickup changed status** | **none** — asserted across every pickup in the table |
| 🔴 **no `status_events` row written** | **61 → 61** |
| `admin_audits` | **8 → 11**, exactly three added |
| 🔴 **re-submitting a resolved exception** | `already=1`; the **first** resolution and its notes still stand, and still **exactly one** audit row for it |
| `/audit?action=exception.resolve` | lists all three |
| `/audit?action=nope.nope` · `?page=999` | both render the log rather than throwing or showing a false empty |
| `/exceptions` open view, after | empty-stated — *"No open exceptions."* |
| `/exceptions?state=resolved` · `?state=all&kind=hold` | both filter correctly; `kind=hold` shows `damage_score_high` and excludes `bms_entropy_anomaly` |

⚠ **The shared database was then fully restored** — three exceptions reopened
(`resolution`, `resolvedBy`, `resolvedAt`, `notes` back to null) and the three
`exception.resolve` audit rows deleted. `admin_audits` back to 8.
**`npm run verify-seed`: 24/24.** No reseed was needed.

**Also green:** `npm run build` (all three apps, `ƒ Proxy (Middleware)` printed
for each) · `npm run smoke -- --app=admin` **23/23** · both admin role gates
(`--blocked business@test` and `--blocked agent@test`) **23/23**.

### 🟠 Known, deliberately not done

- 🟠 **`/audit` renders `AdminAudit` only** — decision 4 above. Merging
  `status_events` needs the `'customer'` / `'vendor'` role spelling settled
  first, which is a B-lane migration. **Not a gap in this batch; a prerequisite
  that is not this batch's to buy.** The screen says so in a footer rather than
  leaving the absence unexplained.
- 🟠 **No date-range filter and no CSV export on `/audit`.** Action, subject and
  actor cover every question the sprint has actually asked. A date range is the
  obvious next one.
- 🟠 **`notes` on a resolution is optional.** A bare `reject` with no note is
  legal. Requiring one would be a defensible tightening, but it is not what the
  sheet asked for and `isReasonRequired('exception.resolve')` is `false` —
  changing that is a `@clbipp/core/audit` edit, not a screen edit.
- 🟠 **`npm run lint` is STILL RED on the same two pre-existing errors** Batch 7
  reported, in files this batch never touched: `(admin)/market/page.tsx:31`
  (`react-hooks/purity` — `Date.now()` during render, **B's**) and
  `(admin)/pickups/[id]/page.tsx:266` (an `<a href="/dispatch">` where a
  `<Link>` belongs, **C's**). The three new files are lint-clean.
  🔴 **These should be green before Batch 17 deploys** — both are one-liners.

### ⚠ One correction to this sheet

Step 6 above says fixture 6 seeds "two or three open `ItemException` rows and no
resolved one". **It seeds three open AND one resolved** (`reset-demo.ts`'s
`seedExceptions`, and `verify-seed` asserts `≥1 RESOLVED`). So the resolved view
is **not** empty on a fresh seed — `/exceptions?state=resolved` shows
`PKP-2026-000108`'s override from day 16. The `EmptyState` instruction still
holds and is implemented; it just is not the state a fresh seed lands in.

---

## Batch 15 — Dashboard + analytics · **C** · P2

B01 + F02. 🔴 **Build this LAST.** Every tile is an aggregate of a screen that
already exists; built first, it becomes a set of numbers with nothing behind them.

**Files**
```
apps/admin/src/app/(admin)/page.tsx           ← replace A's Batch 0 placeholder dashboard
apps/admin/src/app/(admin)/analytics/page.tsx ← replace C's stub
```

**Steps**

1. 🔴 **If a number has no screen behind it, do not put it on the dashboard.**
   That rule is what keeps this batch a day's work instead of three.
2. `/` — five KPI tiles, each **linking to the screen it aggregates** (a KPI with
   no drill-through is decoration):
   - awaiting dispatch — `status: 'requested'` → `/dispatch`;
   - in flight — `scheduled | arrived | offered` → `/pickups`;
   - at the hub awaiting a manifest — Batch 10's `@/lib/stock.ts` → `/inventory`;
   - certified this month → `/compliance`;
   - **open exceptions** — the kit's dark "exception" `KpiTile` variant →
     `/exceptions`.
3. Plus: pathway split (`SplitBar` over `BatteryItem.pathway`, 🔴 with flat-rate
   as its own segment rather than dropped — W2/AD1), market state
   (`MarketPrices.updatedAt` freshness and fx — see Batch 16 step 2 for why
   freshness is an alarm), and the queue head (oldest `requested` rows).
4. `/analytics` — throughput by stage over time, margin trend, pathway mix YTD,
   top vendors by mass and value. Margin % is fine here (AD12) and 🔴 **must
   never reach a vendor screen**; the no-recovery-rate-% rule is absolute on the
   customer app and untouched by this.
5. Charts are Batch 2's `MiniBarChart` / `SplitBar` / `CapacityGauge`. 🔴 **No new
   chart library** (standing stack rule), and 🔴 nothing here moves into
   `packages/ui` (AD11) — it is a mobile kit two shipped apps import.
6. Money via `formatPaise` from `@clbipp/core/format` *(traps 4, 5)*, rounded to
   whole rupees, so smoke assertions come from the rendered string *(trap 27)*.
7. Admin is a **desktop** app — no `AppShell`, no `PhoneFrame`, no `hideNav`
   *(trap 15, AD11)*. The dashboard is the screen most likely to attract a
   copy-pasted mobile card.
8. ⚠ **Second on the cut list** (§5): keep the dashboard, drop `/analytics` if
   Day 6 is short. Build `/` first for that reason.

**Done when**
- [ ] Every tile's number is reproducible by opening the screen it links to and
      counting — checked for all five, by hand, once.
- [ ] Every tile links somewhere, and no tile shows a figure no other screen can
      explain.
- [ ] The pathway split accounts for **100% of items**, flat-rate included.
- [ ] `/` and `/analytics` both carry content assertions in smoke, and the
      ConsoleShell chrome assertion on `/` still passes.
- [ ] `npm run smoke` for the **customer** app still shows no margin, no recovery
      rate and no recovered value on any vendor screen.

---

## Batch 16 — Market feed · **B** · P2

D02. Small, and it is the second live pricing lever in the console.

> ⚠ **Half of this batch already shipped in Batch 1.** The plan's one-liner said
> "`market.ts` reads `fxRateUsdInr` instead of the hardcoded 83.2" — that is
> **done**: `getMarketData()` reads `row.fxRateUsdInr.toNumber()` today, and it
> moved no price because the column defaults to exactly 83.2 and the engine only
> echoes the rate into its audit output. What is left is the **screen** and the
> **override**. (Batch 1's as-built note 4 addresses "Batch 12" for this — it
> means this batch; the market feed is D02 / Batch 16.)

**Files**
```
apps/admin/src/app/(admin)/market/page.tsx     ← replace B's stub
apps/admin/src/app/(admin)/market/actions.ts   ← new — the override
```

**Steps**

1. Read the latest row: `marketPrices.findFirst({ orderBy: { updatedAt: 'desc' } })`
   — 🔴 **the same read `getMarketData()` does**, so the screen shows what the
   engine actually prices against, not a different row.
2. Render the six metal prices (₹/kg), `fxRateUsdInr`, `source`, `note`, the
   author (`createdBy` → `Profile`), `updatedAt`, and **freshness** against
   `Config.marketFreshnessMaxHours`. Freshness is an **operational alarm**: a
   stale snapshot makes `computeQuote` throw `StaleMarketDataError`, which the
   quote route turns into a 503 and an agent sees as a dead quote button.
   - ⚠ **But it cannot fire today, and the screen must not pretend otherwise.**
     `getMarketData()` stamps `snapshot_timestamp: new Date().toISOString()` at
     read time (the defect-1 fix), so the engine never sees an old row. Show the
     row's real `updatedAt` and label the freshness reading for what it is.
3. `overrideMarket(...)` — 🔴 **writes a NEW snapshot row. Never an update in
   place.** `marketPrices.create({ id: <generated in the action — trap 3>, Li, Co,
   Ni, Mn, Cu, Al, fxRateUsdInr, source: 'manual-override', note, createdBy: admin.id })`
   inside a `$transaction` with `adminAudit.create({ action: 'market.override', subjectType: 'market_prices', before: <the previous row's values>, after: <the new ones>, reason })`.
   - `requireAdmin()` first; POST not GET; `revalidatePath('/market')`.
   - 🔴 **A typed reason is REQUIRED** — `isReasonRequired('market.override')` is
     `true`. Reject an empty one **in the action**.
   - Append-only gives the screen a real history for free; there is nothing to
     migrate and no previous value to lose.
4. 🔴 **This moves prices — every quote computed after the write uses the new
   row.** Say so explicitly in the commit message. It is the standing rule and
   this is its clearest case: unlike Batch 11's config publish, there is no
   byte-identical-default argument to fall back on.
5. Validate server-side: every metal price > 0, `fxRateUsdInr` > 0, each within a
   sane band with the bound stated in a comment. The columns are Prisma
   `Decimal` — pass a string or a `Prisma.Decimal`, never a float that has
   already lost precision. ⚠ These are **rates, not money owed**, which is why
   they are Decimal and not integer paise; do not "fix" them to paise.
6. History table: previous snapshots newest first with each one's author, source
   and note. `@@index([updatedAt(sort: Desc)])` is the index that read uses.
7. ⚠ **First on the cut list** (§5). If Day 6 runs out, ship steps 1, 2 and 6 —
   `/market` read-only — and drop the override form. The screen still earns its
   place; the lever is what goes.

**Done when**
- [ ] `/market` renders the current row with a content assertion in smoke, and
      the fx rate shown is the one `getMarketData()` returns.
- [ ] An override writes a **new** row — the previous one is still readable, with
      its own author and timestamp — plus one `AdminAudit` row carrying before,
      after and the reason.
- [ ] An override submitted with an empty reason, a zero price, or a negative fx
      rate is rejected **by the action** when the form is bypassed.
- [ ] 🎯 A quote computed after the override reflects the new prices, and one
      computed before still shows the old snapshot id in its audit trail.
- [ ] 🔴 The commit message states the pricing-surface change.

---

## Batch 17 — Deploy · **B** · P0

Third Vercel project, off `main`, per `docs/DEPLOY.md`.

- [ ] `rm -rf apps/admin/.next` before the first local prod run. *(trap 6)*
- [ ] `npm run build` — all three apps.
- [ ] Three smoke runs, plus every role-gate direction (six in total).
- [ ] Env vars set on the admin project; **`ƒ Proxy (Middleware)` in the deploy log.** *(trap 1)*
- [ ] `docs/DEPLOY.md` gains an admin section; `PROJECT_STATE.md` and `CLAUDE.md` updated.
- [ ] The one manual pass — everything accumulated in `docs/MANUAL_TEST_QUEUE.md`.

---

## Verification commands

```bash
npm run dev          # customer, :3000
npm run dev:agent    # agent,    :3001
npm run dev:admin    # admin,    :3002   ← new

npm run smoke -- --app=admin

# The role gate, all SIX directions. Three apps = six wrong-role pairings.
npm run smoke -- --app=admin --blocked business@test businesstest   # vendor  ✗ admin
npm run smoke -- --app=admin --blocked agent@test demo1234          # agent   ✗ admin
npm run smoke -- --blocked admin@test demo1234                      # admin   ✗ customer
npm run smoke -- --app=agent --blocked admin@test demo1234          # admin   ✗ agent
npm run smoke -- --app=agent --blocked business@test businesstest   # vendor  ✗ agent
npm run smoke -- --blocked agent@test demo1234                      # agent   ✗ customer

npm run build && npm run test && npm run lint
```

---

## Batch N — as built

*Append a section here when a batch lands: what actually shipped, what deviated
from this sheet and why, and what the next batch must know. Same convention as
`FIELD_AGENT_TASKS.md` — that habit is why this sheet has a trap list.*

---

## Batch 0 — as built · 2026-08-26 · A (Aamir)

**Green.** `npm run build` (all three apps), `npm run lint`, `npm run smoke --
--app=admin` **22/22**, and **all six role-gate directions** bounce. Everyone is
unblocked: B can start Batch 1 and C can start Batch 2 without creating a single
file A also creates.

### What shipped

```
apps/admin/package.json                       dev :3002, prebuild, lint, full dep set
apps/admin/next.config.ts                     transpilePackages, security headers, engine tracing
apps/admin/postcss.config.mjs                 new
apps/admin/eslint.config.mjs                  new
apps/admin/scripts/copy-prisma-engine.mjs     new (agent's, retargeted)
apps/admin/.env.local  .env.example           new — same Supabase project as the other two
apps/admin/src/proxy.ts                       🔴 the auth gate — allowRoles: ['admin']
apps/admin/src/app/globals.css                shared tokens + a --console-* block
apps/admin/src/app/layout.tsx                 rewritten (fonts, no PWA metadata)
apps/admin/src/app/login/{page,actions,field}.tsx   new
apps/admin/src/app/(admin)/layout.tsx         🔴 THE ONE SHARED FILE — nobody edits it again
apps/admin/src/components/shell/*             ConsoleShell, Sidebar, Topbar, UserMenu, nav, icons, actions
apps/admin/src/app/(admin)/**/page.tsx        21 stubs
scripts/smoke.mjs                             --app=admin + route table + AD2 isolation
package.json (root)                           "dev:admin"
```

`apps/admin/src/app/page.tsx` (the old "built last" scaffold) was **deleted** —
`/` is now the `(admin)` group's dashboard stub.

### Done-when — all met

- [x] `npm run dev` · `dev:agent` · `dev:admin` run together on 3000/3001/3002.
- [x] `npm run build` prints **`ƒ Proxy (Middleware)`** for admin. *(trap 1)*
- [x] `npm run smoke -- --app=admin` green, with a content assertion on **every**
      route including `/`. *(trap 9)*
- [x] Vendor bounced from admin · agent bounced from admin · admin bounced from
      customer · **admin bounced from agent** (a sixth direction the sheet did
      not list — three apps make six wrong-role pairings, not five).
- [x] Vendor→agent and agent→customer re-run as regressions: still 30/30 and 46/46.
- [x] No `AppShell` / `PhoneFrame` / `hideNav` anywhere in `apps/admin`. *(trap 15)*

### Deviations from this sheet, and why

1. **Login lives at `src/app/login/`, not in an `(auth)` group.** The sheet says
   `src/app/login/page.tsx`, and §4 assigns A `src/app/login/**`, so it is taken
   literally. It sits outside `(admin)` and therefore outside `ConsoleShell`
   already — the agent app's `(auth)` group exists to escape a layout this app
   does not have.

2. **21 stubs, not 19.** §2's table is headed "19 screens" but lists **22 rows**
   (A01 + B01–B06 + C01–C04 + D01–D05 + E01–E03 + F01–F03). All 22 were built —
   21 under `(admin)` plus `/login`. **The heading is the error, not the table.**

3. **The sidebar has five groups and sixteen items, not the wireframe's four and
   twelve.** The wireframe's nav predates §0, which adds dispatch (W1), pickups
   (W2) and manifests (W9) — the P0 screens. Leaving the nav as drawn would have
   made the whole demo path unreachable from the chrome. `ADMIN_SHELL` in
   `scripts/smoke.mjs` asserts `'Chain of custody'` so a later "tidy-up" cannot
   quietly revert it.

4. 🟠 **The app keeps the shared token VALUES, not the wireframe's.** The admin
   wireframe defines a near-miss palette of its own (`--ink #0E120E` vs
   `#111111`, `--paper #F2EDE2` vs `#F8F5EE`, `--signal #C5F050` vs `#C8F53D`).
   Adopting it would have made every `Badge`/`Button`/`Card` this app imports
   from `@clbipp/ui` render off-brand, since those resolve `--color-*` from the
   shared names — and Batch 2 tells C to reuse those primitives. The wireframe's
   genuinely new surface, the dark rail, is carried as a separate `--console-*`
   block in `globals.css`. **C: build the kit against the shared tokens.**

5. **A local `field.tsx` for the login inputs**, not a console-kit input. Batch 2
   is a table/KPI/chart kit for logged-in screens; `/login` renders before any of
   it exists, and Batch 0 must not depend on another lane. Third copy of this
   component in the repo — noted as a cleanup, not scheduled.

### 🔴 Two things the next batches must know

1. **CONTRACT WITH BATCH 5 (C).** The topbar search box is a real `GET` form
   posting to **`/pickups?q=…`**. §2 adds no `/search` screen and B04 is already
   specified to search "by pickup id / vendor / agent", so it points there rather
   than inventing a twentieth screen. **Until `/pickups` reads `searchParams.q`
   it navigates and silently shows an unfiltered list — which reads as a broken
   feature rather than an absent one.** Added to Batch 5's done-when below.

2. **CONTRACT WITH BATCH 1 (B).** `scripts/smoke.mjs` has two placeholder ids —
   `ADMIN_MANIFEST` and `ADMIN_TRACE` — because no `DispatchManifest` or
   `trace_id` fixture exists yet. They exercise the router and the shell only.
   **Swap them for the real seeded ids when §3 fixtures 4 and 5 land**; both are
   marked with a `TODO` in that file.

### Notes for later, deliberately not done now

- `apps/admin/public/` is **empty**, and `src/proxy.ts`'s matcher excludes only
  `_next/*` and `favicon.ico`. Admin is not a PWA (AD11/R5), so there is nothing
  else to exclude — but **trap 2 still applies the moment anyone adds a file
  there.** The comment in `proxy.ts` says so.
- No Vercel project yet; `apps/admin/vercel.json` was already present and is
  unchanged. Batch 17 (B).
- The greeting in `Topbar` uses the **server's** clock, so on Vercel it is UTC,
  not IST. Fine for "Good morning"; the comment warns against deriving any
  reported date that way.

### Added to Batch 5's done-when *(by A, Batch 0)*

- [ ] `/pickups` reads `searchParams.q` and filters on it — the topbar search box
      in `ConsoleShell` posts there. See Batch 0 as-built, contract 1.

---

## Batch 1 — as built · 2026-08-26 · **A (Aamir), covering B's lane**

**Green.** `npm run build` (all three apps, all three proxies registered) ·
`npm run lint` · `npm run test` **220 passing** (core 153, auth 40, engine 27 —
was 214) · `npm run smoke` **22 / 30 / 46** on admin / agent / customer ·
**all six role-gate directions bounce** · `npm run verify-seed` **21/21**.

The migration is applied to the shared project and the demo data is reseeded.
Nothing is blocked: C can build Batch 2 and 5 against real rows, and Batch 3's
dispatch board has a board to render.

### What shipped

```
packages/database/prisma/schema.prisma                     3 models, 3 enums, 2 altered tables
packages/database/prisma/migrations/20260826182031_admin_app_v1/  the migration
packages/database/prisma/reset-demo.ts                     all 8 §3 fixtures + manifests + audit
packages/database/prisma/verify-seed.ts                    NEW — 21 fixture assertions
packages/database/package.json                             + @clbipp/decision-engine, verify-seed
packages/core/src/audit.ts                                 NEW — the closed audit vocabulary
packages/core/src/market.ts                                fx rate read from the row, not a constant
packages/core/src/market.test.ts                           mock updated + one real new assertion
packages/core/package.json                                 + "./audit" subpath
packages/decision-engine/src/decisionEngine/defaults.test.ts  NEW — the drift guard, 5 tests
supabase/policies.sql                                      the three new tables CLOSED
scripts/smoke.mjs                                          Batch 0's two placeholder ids swapped
package.json (root)                                        "verify-seed"
```

### Deviations from this sheet, and why

1. **`prisma migrate deploy`, not `migrate dev`.** `migrate dev` can decide the
   database has drifted and offer to RESET it — on the one shared Supabase
   project, with two other people working in it. The migration SQL was generated
   with `prisma migrate diff` (so it is exactly what Prisma would have written),
   hand-annotated with a header the way every other migration in this repo is,
   and applied with `deploy`, which never resets. **Use `deploy` for the rest of
   this sprint.** `npm run db:migrate` still points at `migrate dev`; left alone
   rather than changed under B's feet, but do not run it against the shared
   project without reading this first.

2. 🔴 **`Profile.eprRegNo` was NOT added, though §3 and W11 both call for it.**
   W11 says "`Profile` has no `eprRegNo`" and that is simply not true: `Profile`
   already has **`eprRegId`**, wired end to end — the fleet signup form,
   `/onboarding`, `validation.ts` (two schemas), `auth.ts`'s select list,
   `grants.sql`'s writable-column allowlist, and the vendor's own profile
   screen. It is seeded as `CPCB/EPR/PROD/2024/0091`. A second column would
   start null for every real vendor, so the Suppliers screen would render an
   empty column while the value sat one column over. **The Suppliers screen
   (D-group) reads `eprRegId`.** Approved by Aamir before the schema was
   touched. `Profile.marginTier` — W11's other half — was added as specified.

3. **The manifest history goes deeper than fixture 5 asks.** §3 wants one
   `dispatched` + one `draft`. Seven are seeded: those two plus `received` and
   `reconciled` manifests generated for the pickups already at
   processed / recovered / certified. Without them AD5's "a pickup only reaches
   `processed` via a confirmed manifest" is contradicted by the seed itself, and
   `/trace/[traceId]` would show a certified battery whose custody chain stops
   at the hub. Grouped by **(target status, recycler) across pickups**, which is
   what a real consolidated manifest looks like. Approved by Aamir up front.

4. **`AdminAudit` rows are seeded (8 of them), which §3 does not ask for.**
   `/audit` would otherwise be empty for the whole sprint. Every row points at a
   row this seed actually created — the config publish, each dispatched
   manifest, the one resolved exception — so the log is *consistent* with the
   seeded world rather than invented next to it.

5. **`packages/core/src/audit.ts` is new, and is not on any batch's file list.**
   `AdminAudit.action` is a `String` column (the values are dotted, so a Prisma
   enum is impossible). Eight bare string literals spread across Batches 3, 6, 7
   and 9 is how an audit log ends up with typo-variants that make every
   `where: { action }` read under-count. `ADMIN_AUDIT_ACTIONS`,
   `AdminAuditSubject` and `isReasonRequired()` live there now. 🔴 **Batches 3,
   6, 7 and 9: import from `@clbipp/core/audit`, never type the string.**

6. **`npm run verify-seed` is new.** `smoke` proves a route renders and `test`
   proves pure logic; neither can say the seeded fixtures still have the shape
   the next batch is built against. Fixture 4 is the row that catches a wrong
   AD6 implementation and fixture 8 is the row that catches dispatch ignoring a
   stale agent — a reseed silently dropping either would let a real bug through
   Batch 3 and Batch 7 with everything green. 21 assertions, read-only,
   non-zero exit. **Add a check when you add a fixture.**

7. **`packages/core/src/market.ts` now reads the FX rate from the row.** One
   line, and it is the point of W6's `fxRateUsdInr` column. 🔴 Price-neutral and
   verified so: the column defaults to **83.2**, the seed writes 83.2, and that
   is the exact constant the file hardcoded before — and the engine does no
   arithmetic with the rate at all, it only echoes it into the audit output.
   The old test asserted "fx is a positive number", which passed identically
   whether or not the column was read; there is now one that asserts the value.

8. **`packages/database` may import `@clbipp/decision-engine`.** New dependency,
   added so the seeded `EngineConfig` can be `DEFAULT_CONFIG` itself rather than
   a retyped copy (step 6). No cycle: decision-engine has no dependencies at
   all. ⚠ **`packages/database` still must not import `packages/core`** — that
   one *is* a cycle, which is why the CO₂e factors, the invoice number format,
   the safety-checklist keys and now the li-ion chemistry list are all still
   restated by hand in `reset-demo.ts`.

9. **The seeded recycler was renamed and narrowed.** It used to be a real Indian
   company's name carrying a CPCB registration number we made up. The three now
   seeded are deliberately not real firms. They also have **non-overlapping**
   `acceptedChemistries`, which is what lets AD7 fail — a single recycler that
   accepts everything makes that rule impossible to test. Nothing read the
   `recyclers` table before this batch, so the rename cost nothing.

### 🔴 What the next batches must know

1. **CONTRACT WITH BATCH 3 (A) — fixture 8 is waiting for you.**
   `PKP-2026-000114` sits at `requested` **with `agentId` and `agentFeePaise`
   still set**, because `reschedulePickup` voids `Offer.acceptedAt` and nothing
   else. Two things follow, and `verify-seed` asserts both:
   - `/dispatch` must not assume `status: 'requested'` implies `agentId: null`.
     Filtering on `agentId: null` **hides this row entirely** — the pickup
     becomes invisible to dispatch *and* stuck. Assign must **clear the stale
     agent and fee** before writing the new ones.
   - It shows up in the **agent app's day view today**, which queries
     `where: { agentId: user.id }` with no status floor
     (`apps/agent/src/app/(agent)/page.tsx`). `isActiveJob('requested', null)` is
     `true`, so it lands in the ACTIVE list reading "In recovery — nothing to
     do" — a job the agent can neither start nor get rid of. Not a new bug; the
     seed just made it visible for the first time.

2. **CONTRACT WITH BATCH 7 (A) — fixture 4 is the row that fails you.**
   `PKP-2026-000113` has two items: the li-ion one is on manifest **`…401`
   (`dispatched`)** and the lead-acid one is on **`…402` (`draft`)**.
   🔴 `confirmManifestReceived('…401')` **must not advance PKP-2026-000113** —
   half its load is still at the hub. Every other seeded pickup lets the naive
   "advance the pickups on this manifest" implementation pass. This one does
   not. Its lead-acid item also has **no `traceId`**, so a table keyed on
   `trace_id` drops it silently.

3. **CONTRACT WITH BATCH 11 (B) — 🔴 two version strings, and someone must pick.**
   `EngineConfig.version` is `"v2026-08-26-r1"` (the row's publish identity);
   `config.config_version` inside the JSON is `"v0.1.0-placeholder"` (the
   engine's own build stamp). They disagree on a fresh seed, deliberately —
   §3 says the row is byte-identical to `DEFAULT_CONFIG` and the drift test
   enforces it. The engine echoes `config_version` into every quote's audit
   output, so **`getActiveConfig()` has to decide which one a quote should name.**
   Recommended: return `{ ...row.config, config_version: row.version }`, so the
   audit trail names the *published* config. 🔴 **Do not fix this by editing
   `defaults.ts` — that moves every existing quote's audit trail.**

4. **CONTRACT WITH BATCH 12 (B) — the market feed screen has its columns now.**
   `fxRateUsdInr` (83.2), `source` (`'seed'`), `note`, `createdBy` (null — a
   seeded row has no human author). 🔴 An override must write `createdBy` **and**
   an `AdminAudit` row with `market.override`; `isReasonRequired()` says a reason
   is mandatory for it.

5. **Nine manifests' worth of ids are pinned.** `…401` through `…407`, numbered
   in generation order: dispatched (nickel, lead→forced `draft`, lfp), then
   received, then reconciled. `scripts/smoke.mjs` points `/manifests/[id]` at
   `…401`. Reordering `RECYCLERS` or `MANIFEST_STAGE` in the seed **renumbers
   them all** and breaks that assertion.

6. **Every li-ion item past `collected` now has a `traceId`**
   (`TRC-2026-<3-digit serial><item index>`), and **no flat-rate item has one**.
   `pathway: 'recycle'` is set on every confirmed item too. What is still NOT
   seeded is `quoteData` — running the engine in the seed needs BMS fields no
   screen collects (the Batch 5a workaround), so `/quotes` and `/trace` get
   pathway + prices but no engine breakdown. Left for whoever builds C's
   traceability screen to decide whether that is enough.

7. **`PathwayDecision` rows are still not seeded.** `BatteryItem.traceId` points
   at nothing on the `pathway_decisions` side. Seeding them needs
   `packId` / `inspectionId` / `factorConfigId` FKs into the old single-pack
   test harness, which has zero rows and no defined mapping onto
   Pickup → BatteryItem — the exact reason `BatteryItem.quoteData` exists as a
   workaround. Unchanged by this batch, and still the open question that
   workaround's TODO names.

### Notes for later, deliberately not done now

- 🟠 **`actorRole` has two spellings for one role.** Every seeded vendor event
  says `'customer'`; `reschedulePickup` in the customer app writes `'vendor'`.
  Fixture 8 reproduces the live behaviour rather than normalising it, so the
  seed looks like production. **Whoever builds the audit-log screen has to
  handle both**, or pick one and migrate. Worth a one-line fix in
  `handover/actions.ts` plus a data migration; not scheduled.
- **Nobody accepts `nimh` or `other`.** No recycler's `acceptedChemistries`
  covers them, and no seeded item uses them. That is the AD7 gate having
  something real to reject, not a gap — but a real item with either chemistry
  would be un-manifestable, which is a conversation for the company, not a bug.
- **Seeded manifest timestamps are indicative, not a reconstructed audit.** They
  are derived from the most recent pickup on the manifest walking the same
  one-stage-per-day clock the status-event loop uses. Do not read one as
  evidence of anything; a real manifest is stamped by the action that writes it.
- **`npm run db:migrate` still runs `migrate dev`.** See deviation 1. Changing
  it is B's call.

---

## Batch 3 — as built · 2026-08-27 · **A (Aamir)**

🔴 **The lifecycle hole is closed.** `requested → scheduled` + `Pickup.agentId`
is now written by a screen, with a session behind it and an audit row after it.
A pickup booked in the customer app reaches an agent's day view without anyone
running a CLI, for the first time in this project.

**Green.** `npm run build` (all three apps, all three proxies registered) ·
`npm run lint` · `npm run test` **220 passing** · `npm run smoke` **22 / 30 / 46**
on admin / agent / customer · **all six role-gate directions bounce** ·
`npm run verify-seed` **21/21** (before *and* after the live assignment test —
see "How this batch was verified").

### What shipped

```
apps/admin/src/app/(admin)/dispatch/page.tsx       B02 — the board
apps/admin/src/app/(admin)/dispatch/[id]/page.tsx  B03 — request + agent picker
apps/admin/src/app/(admin)/dispatch/actions.ts     🔴 assignPickup — THE transition
apps/admin/src/lib/admin-identity.ts               NEW — requireAdmin(), the write gate
apps/admin/src/lib/job-load.ts                     NEW — live job counts per agent
apps/admin/src/lib/ist.ts                          NEW — one timezone, stated
packages/database/prisma/assign-job.ts             header now points at the screen
scripts/smoke.mjs                                  content assertions for both routes
```

### Deviations from this sheet, and why

1. 🔴 **The write goes through Prisma `$transaction`, not `createAdminClient()`.**
   Step 3 says to copy the agent app's reference action verbatim, and all four of
   its rules are kept — session identity, an RLS-bypassing write path, an in-code
   re-check standing in for the missing policy, status and event written
   together. Only the *client* differs, and for three reasons: **AD3 names Prisma
   as this app's read AND write path**; `packages/database/prisma/assign-job.ts`
   — the CLI this screen replaces — already writes this exact transition through
   Prisma; and this action writes **three** tables (`pickups`, `status_events`,
   `admin_audits`), which supabase-js cannot do atomically. A half-written
   dispatch (status moved, audit missing) is exactly the drift rule 4 exists to
   prevent. The sheet's own step 3 asks for an `updateMany({ where: { id,
   status: 'requested' } })` race guard — which is Prisma's API, so the sheet
   assumed this too.

2. **The screens carry their own small presentation components** (`Panel`, `Th`,
   `Td`, `Stat`, `Banner`, `StatusChip`), local to the two page files. **Batch 2
   (C's console kit) is not built yet** and Batch 3 is the P0 that unblocks the
   demo, so it could not wait. The markup is deliberately plain: when
   `DataTable` / `KpiTile` / `Drawer` land, deleting these and swapping the
   imports is mechanical. 🔴 **Nothing was added to
   `apps/admin/src/components/console/`** — that directory is C's, and creating
   a file there is the one thing the lane split forbids.

3. **Three new files under `apps/admin/src/lib/`, which is on nobody's file
   list.** `admin-identity.ts` is this app's answer to the agent app's
   `src/lib/safety-gate.ts`: the one server-side gate every lifecycle-writing
   action calls. 🔴 **Batches 6, 7 and 9 must import `requireAdmin()` rather
   than re-deriving the check** — a second copy is how one of them ends up
   subtly weaker than the others. `job-load.ts` holds `LIVE_JOB_STATUSES` and
   the per-agent count (it cannot live in `actions.ts` — trap 23). `ist.ts` is
   below.

4. 🔴 **The console fixes its timezone at IST instead of inheriting the server
   clock.** A `<input type="datetime-local">` submits `2026-09-02T10:00` with no
   offset at all, and Vercel runs UTC — so a 10:00 slot would have been stored as
   15:30 IST and the agent would arrive five and a half hours late. `ist.ts`
   parses a submitted local time **as IST** and formats every rendered time in
   IST. Verified: a submitted `10:00` stored as `2026-09-02T04:30:00.000Z`.
   Correct for one country; if CLBIPP ever operates outside IST the honest fix is
   to send the browser's offset with the form, and that file is the only place to
   change.

5. **`/dispatch/[id]` renders at ANY status, not only `requested`.** Past
   `requested` it shows who the job went to and links on to `/pickups/[id]`.
   This is not politeness: `scripts/smoke.mjs` points that route at
   **PKP-2026-000101**, and the first time anyone dispatches that row in a demo,
   a screen that insisted on `requested` would 404 for every later smoke run.

6. **The new smoke assertions are chosen to survive a demo, not just a build.**
   `/dispatch` asserts `'Waiting'` and `'Oldest request'` — KPI labels that
   render even when the board is empty (assign every request and an assertion on
   a row starts failing). The detail route asserts `'Declared items'` and
   `'Recent status events'`, panels that render at every status, rather than the
   picker, which is only there while the pickup is still `requested`.

### How this batch was verified

`npm run smoke` cannot POST a form, so the action was exercised **through the
real HTTP path** — proxy, session cookie, server action, database — by a
throwaway script that logs in as `admin@test` the way `scripts/smoke.mjs` does,
reads the `$ACTION_ID_…` hidden field out of the rendered page, and posts a
`FormData` to the route. 🔴 **It must be `multipart/form-data`** (trap 24): the
first attempt used urlencoded, and Next silently re-rendered the page with a 200
and no action call, which looks identical to a broken action.

Results, against seed **fixture 8** (`PKP-2026-000114`, the reactivated pickup):

| Submit | Outcome |
|---|---|
| valid | `303 → ?assigned=1`; status `scheduled`, `agentFeePaise` **71400 → null**, slot stored `04:30Z` = 10:00 IST, ETA 45 |
| same again | `303 → ?error=That pickup is already scheduled…` |
| a pickup at `offered` | rejected, same shape |
| ETA 9999 | rejected |
| `agentId` = the admin's own uuid | `That account is an admin, not an agent.` |

After all five: **exactly one** new `status_events` row (`scheduled`, `admin`,
`actorId` set, *"Assigned to Ravi Kumar for collection."*) and **exactly one**
`admin_audits` row (`pickup.assign`, before `{requested, agentId, 71400}` →
after `{scheduled, agentId, null, slot, eta}`).

Cross-app, both read live: the agent app's day view showed
`PKP-2026-000114 · SCHEDULED · "Head over and tap Arrived"`, `/job/…` opened for
that agent, and the vendor's `/track/PKP-2026-000114` showed the partner card
(Ravi Kumar), the 45-minute ETA and the custody entry attributed to CLBIPP.

⚠ **The shared database was then restored** to fixture 8's seeded state (status,
`agentId`, `agentFeePaise`, `scheduledSlot`, `etaMinutes`, minus the two rows the
test wrote), and `npm run verify-seed` re-run: 21/21. Nobody else's work was
disturbed, and no reseed was needed.

### 🔴 What the next batches must know

1. **`requireAdmin()` is the write gate, and it is shared.** Batches 6, 7 and 9
   import it from `@/lib/admin-identity`. It returns
   `{ ok, admin | error }` — a string, never a throw, because an action that
   throws inside a POST loses the form. Under AD3 there is no RLS behind any of
   this: `src/proxy.ts` + this function is the entire boundary on a write.

2. **`actions.ts` is the reference shape for every admin lifecycle write.**
   requireAdmin → validate every field server-side (including re-reading the
   *other* party's row and checking its role) → read a `before` for the audit →
   `$transaction` { guarded `updateMany`, `statusEvent.create`, `adminAudit.create` }
   → `revalidatePath` → redirect-after-POST with the error in the query string.
   The guarded `updateMany` is the whole idempotency story; keep it.

3. 🔴 **The first demo dispatch consumes a seed fixture, and `verify-seed` will
   then fail — correctly.** Assigning `PKP-2026-000114` breaks *"fixture 8:
   status is `requested`"*, and dispatching all three waiting pickups breaks
   *"≥3 unassigned `requested` pickups"*. That is the check doing its job, not a
   regression: **reseed** (`npm run reset-demo`, then re-apply grants) before
   treating a `verify-seed` failure as a bug.

4. **Only ONE agent account exists** (`agent@test`, Ravi Kumar), so the picker
   shows one option and "reassign to a different agent" has never been run. The
   stale-agent clearing was proven on the fee, not on a change of person. A
   second seeded agent would make both the picker and E02 `/agents`
   demonstrable — **B's call, it needs a Supabase auth user in the seed**, and
   `verify-seed` would want a check for it.

5. **`revalidatePath('/pickups')` already fires on assignment**, so C's Batch 5
   list refreshes without doing anything. And `/dispatch/[id]` links to
   `/pickups/[id]` for anything past `requested` — that link lands on a stub
   until Batch 5 ships.

### Notes for later, deliberately not done now

- **The stale `Offer` row is left alone on reassignment.** Fixture 8 keeps the
  offer from its previous life with `acceptedAt` already voided by
  `reschedulePickup`; the agent app's `presentOffer` **upserts** on `pickup_id`,
  so the new agent's offer overwrites it cleanly. Checked, not changed — but a
  reassigned pickup does carry one dead offer until the new agent quotes it.
- **No bulk dispatch and no filters on the board.** Oldest-first, everything at
  `requested`, no pagination — three seeded rows and a demo-sized queue. C's
  `DataTable` brings sorting/filtering/pagination; `npm run assign-job` remains
  the "assign everything at once" tool.
- **No agent-availability logic.** The picker shows live load and zone as
  *information*; it does not stop an admin overloading one agent, and there is no
  calendar, no travel time and no double-booking check. Out of scope for a
  one-week build; worth naming to the company as a v2 question.
- **The board does not show the indicative quote.** The detail screen does
  (AD12 — admin sees everything). Adding it to the table is a one-liner if the
  demo wants it.
- **`assignPickup()` is exported alongside its form action** so a future bulk
  screen or a test can call it directly. Nothing calls it that way yet.

---

## Batch 4 — as built · 2026-08-29 · **A (Aamir), covering B's lane**

🔴 **The vendor now actually gets paid.** Before this, `Payment` rows existed
**only in the seed** — a pickup collected for real in the field agent app
produced a receipt and an agent fee and no payable at all, so the vendor's
"Choose how you get paid" button never appeared and `settlePayment`, fully
built since customer Batch 8, had nothing to settle. `raisePayment()` closes it.

**Green.** `npm run build` (all three apps, all three proxies) · `npm run lint`
(0 errors; the 2 pre-existing agent warnings are untouched) · `npm run test`
**229 passing** (was 220 — nine new) · `npm run smoke` **22 / 30 / 46** on
admin / agent / customer, all three against **production builds** (trap 17) ·
`npm run verify-seed` **21/21** after restoring the shared database.

### What shipped

```
packages/core/src/payment-actions.ts             🔴 raisePayment() — the payable
packages/core/src/payment-actions.test.ts        NEW — 9 tests, no DB
apps/agent/src/app/(agent)/job/[id]/collect/actions.ts
                                                 one call in the existing tx
                                                 + the transaction timeout fix
```

No migration. Nothing in `apps/admin`. Nothing in `packages/database`.

### Deviations from this sheet, and why

1. 🔴 **The sheet's step 2 was not the whole job — `confirmCollection`'s
   transaction timeout had to be raised too, and this is the one thing worth
   reading in this section.** That transaction ran on Prisma's **5 s default**
   and did **six** sequential round trips. Adding the payable makes it **eight**
   — and `settlePayment`, in the same package, carries a *measured* comment
   saying that exactly eight round trips against a remote Supabase Postgres took
   **5.3 s and rolled the whole thing back**. Shipping step 2 alone would have
   introduced "collection intermittently fails on a slow connection", which is
   strictly worse than the bug being fixed, and would have looked like a flaky
   demo rather than a timeout. The same `timeout: 20_000, maxWait: 10_000` is
   now on it, with a comment pointing at the measurement. **Raised, not split:**
   the five writes must land together, and splitting them to fit a timeout
   trades a visible error for a silently half-collected pickup.

2. **`raisePayment` guards on `findUnique`, not `upsert` or `createMany`.**
   `ensureInvoice` — five lines below it in the same file, and the closest
   sibling in shape — does exactly this: guard on a unique `pickupId`, return if
   present, create. `upsert` would bump `updatedAt` on an already-*paid*
   payment for no reason. `Payment.pickupId` is `@unique`, so the database is
   the real backstop either way, and `confirmCollection`'s own
   `updateMany({ where: { status: 'offered' } })` race guard means only one
   caller ever reaches this line.

3. **It rejects a negative or non-integer amount by throwing**, the way
   `nextBalance` refuses a negative balance rather than clamping. A float
   `amountPaise` means rupees leaked in somewhere; rounding it would destroy the
   evidence of where. **Zero is allowed** — a load where every item is rejected
   owes the vendor nothing, and that is an outcome, not a data bug. `NaN` is
   caught explicitly: `Number(formData.get(…))` on a missing field is `NaN`, and
   `NaN < 0` is `false`, so a bare range check would have let it through.

4. **`method` is left to the schema default (`upi`).** Nothing has been chosen
   at the moment a payable is raised — the vendor picks a destination on
   `/payment/[id]` and `settlePayment` overwrites it. Writing a method here
   would look like the vendor had already decided. The seed does the same.

### How this batch was verified

The same throwaway-script technique as Batch 3 — forge the `@supabase/ssr`
session cookie the way `scripts/smoke.mjs` does, replay the rendered form's
hidden fields, POST **`multipart/form-data`** (trap 24) — run against
**`PKP-2026-000104`**, the seeded `offered` fixture, with **26 assertions**, all
passing:

| Step | Result |
|---|---|
| vendor accepts the offer (`:3000`) | `303 → /handover`; `acceptedAt` stamped, status **still `offered`** (D7), still no payable |
| agent confirms collection (`:3001`) | `303 → /receipt`; status `collected`, **`Payment` created**: `pending`, **1374450 paise = the accepted offer**, right vendor, no `paidAt`, no `gatewayRef`, `method` default |
| **re-submit ×3** | **one** payment, **one** `agent_fee` ledger row, **no** second status event |
| vendor's `/track/[id]` | shows **"Choose how you get paid"** — the CTA that has never appeared off live data before |
| vendor's `/payment/[id]` | renders **₹13,745**, not "No payment yet" |
| vendor settles | `paid` · `payout` ledger row · **INV-2026-000104** · wallet 28608220 → **29982670**, up by exactly the offer |

🔴 **A new trap came out of this** — see trap 26 below. The
`useActionState` forms (`/payment/[id]`'s `confirmPayout`) do **not** carry a
`$ACTION_ID_…` field at all, so Batch 3's technique found nothing to post and
the settle step silently no-opped with a 200. Batches 6 and 7 will hit this the
moment they script a form that uses `useActionState`.

⚠ **The shared database was then restored** to fixture 4's seeded state — status
`offered`, `agentFeePaise` 137445, `acceptedAt` null, both wallet balances, and
the payment / receipt / invoice / ledger / status-event rows the test wrote —
and `npm run verify-seed` re-run: **21/21**. Nobody else's work was disturbed
and no reseed was needed.

### 🔴 What the next batches must know

1. **A collected pickup now has a `Payment`, and Batches 6/7 must not assume
   otherwise.** `/pickups/[id]` (Batch 5) and the certification screens can read
   `pickup.payment` for anything at `collected`+ and expect a row. Anything
   collected *before* today does not have one — see the note below.

2. **`raisePayment` takes a transaction client and opens nothing.** Any future
   caller composes it into the write that justifies the payable. That is the
   same shape as `creditWallet` and `ensureInvoice` and it is deliberate: a
   payable that lands while the collection rolls back is money owed for
   batteries nobody took.

3. **The eight-round-trip ceiling is real, and Batch 7 will cross it.**
   Certification mints a `Certificate` row **and** a PDF **and** a status event
   **and** an `AdminAudit` row. Set `timeout` / `maxWait` explicitly on that
   transaction from the start rather than discovering the 5 s default in a demo.

### Notes for later, deliberately not done now

- 🟠 **No backfill for pickups collected before today.** Every `collected`+ seed
  fixture already has a payment, so the only rows affected are ones written
  during development. Named here so nobody later reads it as a bug.
- 🟠 **`confirmCollection` never checks that the signature file exists.** It
  verifies only that the path is prefixed with the agent's own user id
  (`photoPathsBelongTo`). That is the ownership check and it is sound — but a
  "signed" collection can point at nothing in storage, which is how this
  batch's own verification drove the form without uploading anything. Worth a
  decision before the company sees a signed receipt; out of this batch's scope.
- 🟠 **A payable is raised even when the offer is ₹0.** Deliberate — the row is
  what lets the screen say "nothing owed" — but nobody has designed that screen,
  and today it would render a ₹0 payout with a Confirm button.
- **No `AdminAudit` row.** Correct: this is an *agent's* action, and the audit
  table is for admin assertions. The `status_events` row already attributes it.

---

## Batch 6 — as built · 2026-08-31 · **A (Aamir)**

🔴 **The second lifecycle hole is half closed.** Before this batch nothing in
any of the three apps wrote a stage past `collected`. `/lifecycle` now writes
`collected → tested` per custody batch, and `/manifests` builds and dispatches a
real `DispatchManifest`. **Batch 7 closes the rest** (`processed`, `recovered`,
`certified`).

### What shipped

| File | What it is |
|---|---|
| `apps/admin/src/lib/lifecycle-units.ts` | **new.** AD5's unit-of-advance logic in one place: `MANIFEST_PROGRESSION`, `isManifestAtOrPast`, `loadItemManifestIndex()`, 🔴 **`pickupCoverage()` — the AD6 query**, and `loadManifestBuildStock()`. 🔴 **Batch 7 imports this rather than re-deriving it.** |
| `(admin)/lifecycle/page.tsx` | B06. Four sections, one per advance, each labelled with the unit it actually belongs to. Renders AD6 coverage per pickup. |
| `(admin)/lifecycle/actions.ts` | **new.** `advanceCustodyBatch` + its form action. |
| `(admin)/manifests/page.tsx` | C02. Grouped by `ManifestStatus` in progression order. |
| `(admin)/manifests/new/page.tsx` | C03, server half — reads stock + recyclers, formats dates server-side. |
| `(admin)/manifests/new/ManifestBuilder.tsx` | **new.** C03's picker: a client component for live filtering, wrapping a **plain** server-action form. |
| `(admin)/manifests/[id]/page.tsx` | C04. Detail + the dispatch button. Batch 7 adds confirm/reconcile here. |
| `(admin)/manifests/actions.ts` | **new.** `createManifest`, `dispatchManifest`, both form actions. |
| `packages/core/src/documents.ts` | `manifestNumber()` + 3 tests. |
| `packages/core/src/audit.ts` | `"custody.advance"` added to the closed vocabulary. |
| `packages/database/prisma/verify-seed.ts` | mirrored list synced. |
| `packages/database/prisma/reset-demo.ts` | 🔴 malformed manifest uuid fixed. |
| `scripts/smoke.mjs` | four routes given real content assertions. |

### Deviations from this sheet, and why

1. **`/manifests/new` is a client component, not a no-JS server form.** Chosen
   by Aamir over the Batch 3-style GET-per-facility form. It filters stock by
   facility, shows running totals, and greys out recyclers that cannot take the
   selection — all without a page load. 🔴 **None of that is a control.** AD7 is
   enforced in `createManifest()`, and the verification below proves it by
   POSTing a greyed-out recycler straight past the picker.
   ⚠ It is a **plain `<form action={serverAction}>`, never `useActionState`** —
   trap 26. That is what keeps it scriptable.

2. **No `AdminAudit` row when a DRAFT is created.** A draft asserts nothing:
   nothing has moved, no party has been told anything, and it can be abandoned
   freely. The trail starts at `manifest.dispatch`, where the claim becomes
   real. §3's vocabulary has no `manifest.create` verb and this is why.
   🟠 If the company wants draft authorship recorded, that is a new verb in
   `audit.ts` plus one `create` — not a redesign.

3. **`"custody.advance"` added to `ADMIN_AUDIT_ACTIONS`.** Step 2 requires an
   audit row and §3's list had no verb for it, while `"custody_batch"` was
   already in `ADMIN_AUDIT_SUBJECTS`. See `docs/LANE_OWNERSHIP.md`.

4. **`loadManifestBuildStock()` is NARROWER than `computeFacilityStock()`, on
   purpose.** `/inventory` asks "what is physically on hand?" and a `draft`
   manifest removes nothing. `/manifests/new` asks "what may I ship?", and an
   item on someone's draft is spoken for — offering it twice would let two
   drafts claim one battery. Both files state their own rule. **Do not unify
   them.**

5. **AD7 is re-checked at DISPATCH, not only at creation.** A recycler can be
   deactivated, or have its `acceptedChemistries` edited on E03, between a draft
   being built and sent. Dispatch is the last moment anyone can stop the lorry.

### How this batch was verified

`npm run smoke` cannot POST, so both actions were driven **through the real HTTP
path** — proxy, session cookie, server action, database — by a throwaway script
that logs in as `admin@test`, reads the `$ACTION_ID_…` hidden field out of the
rendered page, and posts `multipart/form-data` (trap 24). Same technique as
Batch 3.

🔴 **A fresh seed gives this batch NOTHING to do, and that is correct.**
`CB-2026-000301` holds no pickup at `collected` (`DROPPED_OFF` puts everything
past `collected` in it), and the one `collected` pickup — `PKP-2026-000105` —
deliberately has **no** custody batch, because that is what makes "pending
drop-off" (D5) a real state. And every `tested` item is already on a seeded
manifest, so `/manifests/new` renders its empty state. **The demo path is: the
agent app does a hub drop-off first.** So verification began by creating a
`CustodyBatch` holding `PKP-2026-000105`, exactly what agent Batch 7a writes.

| Step | Outcome |
|---|---|
| `/lifecycle` before | batch row, `PKP-2026-000105` listed, Advance button present |
| advance | `303 → ?advanced=1`; status `collected → tested` |
| **double submit, same `$ACTION_ID`, no re-render** | `303 → ?error=Nothing in this batch is waiting at collected…` — **one** event, not two |
| unknown batch id | rejected |
| `/manifests/new` after | builder appears with both `lead_acid` items |
| 🔴 **AD7 bypass — POST Meridian (nmc/nca), which the picker greys out** | **rejected by the action**: *"…does not accept Lead-acid. A manifest may only name a recycler that accepts every chemistry on it."* |
| unknown recycler / no items | both rejected |
| valid create (Sunrise Lead) | `303 → /manifests/<id>?created=1`, `MFT-2026-df3c4c`, 360 kg, `draft` |
| duplicate create, same items | *"2 of those items are already on a manifest."* |
| dispatch | `303 → ?dispatched=1`; `dispatched`, `dispatchedAt` SET, `confirmedAt` null |
| dispatch again | *"…is already dispatched — only a draft can be dispatched."* |
| `/manifests/new` after dispatch | items withdrawn from the offer |

**Rows written, checked directly:**
- `PKP-2026-000105` events: `requested/customer → scheduled/agent → arrived/agent → offered/agent → collected/agent → **tested/admin**`.
- 🔴 **Zero rows with `actorRole` `'recycler'` or `'hub'`.** (AD5.)
- Exactly two `AdminAudit` rows: `custody.advance / custody_batch` and `manifest.dispatch / dispatch_manifest`, both `reason: null` (neither is reason-required), both with a real `actorId`.
- 🔴 **`PKP-2026-000105` was still `tested` after dispatch** — dispatch advances no pickup. That is the single most important assertion in this batch.

⚠ **The shared database was then restored** — the custody batch, the test
manifest, the `tested` status event and both audit rows removed, and
`PKP-2026-000105` set back to `collected`. `npm run verify-seed`: **21/21**.
No reseed was needed and nobody else's work was disturbed.

### 🔴 A defect this batch found, which is NOT its own

**`reset-demo.ts` was minting malformed manifest uuids.** `seedManifests()` built
ids as `` `00000000-0000-4000-8000-00000000${serial}` `` — an **eleven**
character final group. `DispatchManifest.id` is a plain `String` (no
`@db.Uuid`), so Postgres stored it without complaint.

**Why nothing caught it for three batches:** `scripts/smoke.mjs` has always
pointed `/manifests/[id]` at the *correct* twelve-character id, and the Batch 0
stub rendered `"Manifest detail"` **without querying anything**. The assertion
passed against an id that matched no row. 🔴 **This is trap 9 one level deeper:
a content assertion is only as good as the work the page had to do to produce
the string.** Batch 6 replaced the stub with a real read and it 404'd on the
first request.

**Fixed in the seed** (`padStart(12, "0")`), so a reseed now produces exactly
the id `smoke.mjs` already expects. ⚠ **The existing shared database still has
the old ids**, so `/manifests/<id>` is the one red line in
`npm run smoke -- --app=admin` until either a reseed **or** the one-off repair
script (updates 7 `dispatch_manifests` rows and the matching
`admin_audits.subject_id` values; nothing has a foreign key onto that column).

### 🔴 What the next batches must know

1. **`@/lib/lifecycle-units` is Batch 7's foundation — do not re-derive it.**
   `pickupCoverage(pickupId, items, index, floor)` **is** the AD6 gate.
   `confirmManifestReceived` passes `floor: 'received'`;
   `reconcileManifest` passes `floor: 'reconciled'`. It is pure given its
   inputs, so it is safe to call inside a `$transaction`. A pickup with zero
   items is never "covered" — that is deliberate.

2. **Seed fixture 4 is still armed and Batch 7 is what it is for.**
   `PKP-2026-000113`'s li-ion item is on `…401` (`dispatched`) and its lead-acid
   item on `…402` (`draft`). Confirming `…401` **must not advance it**. Batch 6
   only *renders* that split; Batch 7 has to *enforce* it.

3. **Both Batch 6 transactions set `timeout: 20_000, maxWait: 10_000`**, per
   Batch 4's eight-round-trip note. 🔴 **Batch 7's certification will cross that
   ceiling** — Certificate row + PDF + status event + audit row. Set them from
   the start.

4. **`/manifests/[id]` is where Batch 7's two buttons go.** The page already
   computes `pickups` (the distinct pickups the manifest touches) and renders
   the "what confirming this will do" panel. Replace that panel's Batch 7 note
   with the real forms; do not add a second route.

5. **A fresh seed cannot demo Batch 6 or 7 on its own** — see the verification
   note above. 🎯 **The end-to-end demo has to start in the agent app**, with a
   hub drop-off of `PKP-2026-000105`. Worth writing into the demo script.

6. **`dispatchManifest` writes no `statusEvent`, and that is correct.**
   `status_events` is keyed to a pickup and this write touches none — exactly
   the gap `AdminAudit` exists to fill (W7).

### Notes for later, deliberately not done now

- 🟠 **A partially-lost race in `advanceCustodyBatch` is not distinguishable.**
  If `updateMany` reports fewer rows than the pre-read found, events are still
  written for every id. It cannot arise today — the unit of advance is the whole
  batch, so two concurrent callers always advance the same set, never
  overlapping subsets. Documented in the action rather than defended against.
- 🟠 **`manifestNumber()` takes 6 hex characters of the uuid**, same as
  `custodyBatchNumber()`. `createManifest` retries up to three times on a P2002
  rather than widening the slice — widening would stop matching the seeded
  numbers.
- **No manifest editing.** A draft can be created and dispatched; it cannot have
  an item removed. Rebuild instead. `itemIds` being an immutable snapshot is the
  reason, and a demo-sized draft is cheap to rebuild.
- **No pagination or filtering** on `/manifests` or `/lifecycle`. Demo-sized
  data; C's `DataTable` is a client component and these are server-rendered
  reads next to server-action forms.
- 🟠 **Nobody accepts `nimh` or `other`.** Unchanged from Batch 1, but Batch 6
  made it reachable: such an item would be permanently un-manifestable, and the
  builder now says so out loud. A conversation for the company, not a bug.

---

## Batch 7 — as built · 2026-08-31 · **A (Aamir)**

🎯 **THE LIFECYCLE IS CLOSED.** `processed`, `recovered` and `certified` are all
written now, and the journey runs end to end from screens only: vendor books →
admin dispatches → agent arrives, assesses, offers → vendor accepts → agent
collects → vendor is paid → agent drops at hub → admin advances the batch →
admin builds and dispatches a manifest → **admin confirms and reconciles** →
**admin certifies** → **the vendor downloads a real EPR certificate PDF from
`/compliance`.** Verified in that order, through the real HTTP path — see below.

### What shipped

| File | What it is |
|---|---|
| `packages/database/prisma/migrations/20260831120000_manifest_recovery_data/` | **new.** One nullable `jsonb` column, `dispatch_manifests.recovery_data`. Applied to the shared project with `migrate deploy`. |
| `packages/database/prisma/schema.prisma` | `DispatchManifest.recoveryData Json?`. |
| `packages/core/src/audit.ts` | `"pickup.certify"` added to the closed vocabulary. |
| `packages/core/src/certificate.ts` | 🔴 **rewritten.** Prefers MEASURED recovery over the offer's estimate, pro-rates by mass share, reports `materialSource`. **Fixes a defect that would have blanked every certificate** — see below. |
| `packages/core/src/certificate.test.ts` | **new.** 12 tests over the arithmetic and the source precedence. |
| `apps/admin/src/lib/lifecycle-units.ts` | `loadItemManifestIndex(tx)` made transaction-aware · `RECOVERY_METALS` · `parseRecoveryData()` · `nextLifecycleStage()` / `isOneStepForward()` · 🔴 **`advanceCoveredPickups()` — the AD6 gate, applied.** |
| `(admin)/manifests/actions.ts` | `confirmManifestReceived`, `reconcileManifest`, both form actions. |
| `(admin)/manifests/[id]/page.tsx` | The confirm button, the reconcile form, the recovered-materials table, and 🔴 **the AD6 readiness panel** — "what this click will and will not move, and why". |
| `(admin)/lifecycle/actions.ts` | `certifyPickup`, `overrideLifecycle`, both form actions. |
| `(admin)/lifecycle/page.tsx` | Per-pickup **Certify** buttons and the **manual override** panel (risk R1's escape hatch). |
| `packages/database/prisma/reset-demo.ts` | `seededRecovery()` — reconciled manifests now carry recovery figures. |
| `packages/database/prisma/verify-seed.ts` | +3 checks (recovery figures present, absent before `reconciled`, mass conserved) and the audit vocabulary synced. **24 assertions now.** |
| `scripts/smoke.mjs` | Batch 7 assertions, a second pinned manifest, and a **stale assertion from Batch 0 finally fixed** — see below. |

### 🔴 A defect this batch found, which is NOT its own

**`buildCertificatePayload` would have minted every certificate with an empty
materials table.** It fed `Offer.materialBreakdown` — whose lines are
`{ material, weight_kg }` — straight into `aggregateMaterials()`, which reads
`{ material, recovered_kg }`. The keys do not match, so the fold returned `[]`
**and nothing threw**. Batch 7 is the first caller, so this had never run.

Fixed by mapping the key explicitly (and accepting either), pinned by two tests.
🔴 **Do not "simplify" that mapping back into one call.**

### Decisions taken, and why

1. 🔴 **`recovery_data` is a new column, not a field on the audit row.** Batch 7
   step 2 says "capture recovered mass per metal" and §3's schema delta never
   gave it a home. Approved by Aamir before the migration was written. The audit
   log is a *trail*; making it the queryable store for operational figures would
   have put `certifyPickup` in the business of parsing `admin_audits` by
   `subject_id`, and B's Batch 8 yield aggregate with it. One nullable jsonb
   column, no default, no backfill, no table rewrite.

2. 🔴 **A certificate prefers the MEASURED figure and says which it used.**
   `materialSource` is `measured` | `estimated` | `none`, recorded on the
   `pickup.certify` audit row and in the `status_events` note. A certificate is
   a compliance document; presenting an engine estimate as a measured recovery
   is the failure this distinction exists to prevent. The estimate is still the
   fallback for a load that was never reconciled — it is *labelled*, not hidden.

3. ⚠ **`certifyPickup` does NOT render the PDF, though step 4 says "and the
   PDF".** `apps/customer/src/lib/documents.ts` renders and uploads every
   document **lazily on first download** and caches the object path back into
   `pdfUrl`; the seed has always written `""` for exactly that reason. Eagerly
   rendering here would duplicate that pipeline in a second app, put a ~1 s
   `@react-pdf` render inside a lifecycle transaction, and break the property
   that a template change reaches old certificates by deleting a cached object
   rather than by a backfill. Writing `""` hands it to the pipeline that exists
   — and the verification below downloads a real 4,878-byte PDF to prove it.

4. **A manifest's recovery is PRO-RATED onto each pickup by mass share.** A
   recycler reports "this lorry-load yielded 41 kg of nickel", not per-consignor
   assay figures. Mass share is the only division the data supports; it is exact
   when a manifest holds one pickup (the common case) and an approximation
   otherwise. Stated in `prorate()`'s own comment. 🟠 If the company wants
   per-consignor figures, that is a richer `recoveryData` shape plus the
   reconcile form — one function, not a redesign.

5. 🔴 **The override refuses to reach `certified`.** Certification mints a row, a
   public token and a PDF a vendor files with the CPCB. An override that only
   moved the status would leave a pickup reading "certified" and a vendor whose
   compliance screen has nothing to download. It also cannot touch `cancelled`,
   which sits outside `LIFECYCLE_STAGES` and is re-enterable (trap 11).

6. **`reconcileManifest` refuses an empty reconciliation, and enforces mass
   conservation.** Empty figures would silently send every certificate from that
   load back to the estimate while looking measured; and a recycler cannot
   return more than it received. Both are checked in the action.

7. **No `reconciledAt` column.** The schema stamps `confirmedAt` at `received`
   and has nothing for `reconciled`. The `AdminAudit` row carries the timestamp,
   which is what that table is for (W7) — a column for it would be a migration
   for a value the trail already holds.

8. **`"pickup.certify"` added to `ADMIN_AUDIT_ACTIONS`**, same omission and same
   reasoning as `custody.advance` in Batch 6. Folding it into
   `lifecycle.override` would have forced a typed reason onto the normal path
   and made `/audit` unable to tell a routine certification from a correction.

### How this batch was verified

Same technique as Batches 3 and 6: `npm run smoke` cannot POST (traps 24/26), so
both screens were driven **through the real HTTP path** — proxy, session cookie,
server action, database — by a throwaway harness logging in as `admin@test`.

🔴 **The seed is armed for exactly this, and every AD6 assertion below is one a
naive implementation fails.** `MFT-2026-000401` carries items from two pickups,
and *both* of those pickups have their other item on a *different* manifest.

| Step | Outcome |
|---|---|
| `/manifests/…401` readiness panel | "What this will move — **0 of 2** pickups", two **Held (AD6)** badges |
| 🔴 **confirm `…401`** | `advanced=0&held=2`. **Advanced NOTHING.** `PKP-…106`'s lfp item is on `…403` (dispatched); `PKP-…113`'s lead-acid is on `…402` (draft) |
| confirm `…403` | `advanced=1` — `PKP-…106` now fully covered → `tested → processed`. `…113` still held |
| reconcile: empty figures | rejected — *"Enter the recovered mass for at least one metal…"* |
| 🔴 **reconcile: 9999 kg on a 7.8 kg load** | rejected — *"Recovered mass (9999.0 kg) exceeds what was shipped (7.8 kg)"* |
| reconcile: negative / non-numeric / zero | all dropped, then rejected as empty |
| 🔴 **reconcile: `kg:Plutonium` posted past the form** | ignored — `RECOVERY_METALS` is a server-side allowlist |
| reconcile `…404` | `advanced=0&held=1` — `PKP-…107`'s other item is on `…405`, still only `received` |
| reconcile `…405` | `advanced=1` — `PKP-…107` → `recovered` |
| 🔴 **reconcile an already-reconciled manifest, action id borrowed from another page** | rejected **by the action**: *"MFT-2026-000404 has already been reconciled."* |
| reconcile a draft · unknown id | both rejected |
| 🎯 **dispatch + confirm `…402`** | `PKP-…113` **finally** advances `tested → processed` — held through six prior writes, released the moment its second manifest arrived. **This is fixture 4's whole purpose.** |
| reconcile `…402` | `PKP-…113` → `recovered` |
| **certify `PKP-…107`** | certificate minted, `materialSource: measured` |
| 🔴 **certify it again** | `already=1` — **one certificate, not two** |
| certify `PKP-…108` (its manifest has no figures) | minted with `materialSource: estimated`, materials **non-empty** — the key-bug fix, proven |
| certify a `collected` pickup · unknown pickup | both rejected |
| override: reason < 12 chars · empty | both rejected |
| 🔴 **override: skip two stages · reverse** | both rejected — *"the only legal next stage is tested"* |
| 🔴 **override: `to=cancelled`** | rejected — not in `LIFECYCLE_STAGES` |
| 🔴 **override: `to=certified`** | rejected — *"Certification is not an override"* |
| override a `certified` pickup | rejected — end of the lifecycle |
| override one legal step | applied, reason recorded |

**Rows written, checked directly:**
- **8 status events, every one `actorRole: 'admin'` with a real `actorId`.**
  🔴 **Zero rows with `'recycler'` or `'hub'` anywhere in the table.** (AD5.)
- **12 `AdminAudit` rows**, all attributed. The single `lifecycle.override` row
  carries its reason; nothing else does, which is `isReasonRequired()` working.
- **Certificates**: `pdfUrl: ""` as designed, and `publicToken` a real 36-char
  uuid — 🔴 proving that a **`dbgenerated()` Postgres default DOES apply** to a
  service-role write, which Prisma-side `@default(uuid())` does not (trap 3).
- **Pro-rating arithmetic verified by hand**: `PKP-…107`'s certificate reads
  Nickel **70.6** = 52.4 (`…404`) + 18.2 (`…405`), Copper 43.7 = 31.0 + 12.7.

**🎯 And the vendor's half, driven as `business@test` on `:3000`:**

| Step | Outcome |
|---|---|
| `/compliance` | the newly-minted certificates are listed |
| 🎯 **`/api/documents/certificate/PKP-…107`** | **200, `application/pdf`, 4,878 bytes, magic `%PDF`** — rendered on demand from `pdfUrl: ""` by the existing lazy pipeline |
| `/api/exports/compliance` | `CERT-2026-PKP-2026-000107-EV,…,458,2850,Nickel: 70.6 kg; Copper: 43.7 kg; …` — the **measured** figures on the CPCB return |

⚠ **The shared database was then fully restored** — every status event, audit
row and certificate deleted, every manifest and pickup status put back.
`npm run verify-seed`: **24/24**. No reseed was needed.

### Two things repaired along the way (neither is Batch 7's own)

1. 🔴 **The malformed manifest uuids are FIXED IN THE LIVE DATABASE.** Batch 6
   fixed the seed and left a one-off repair for the existing rows; it is now
   run. Seven `dispatch_manifests.id` values and six `admin_audits.subject_id`
   values updated (no foreign key points at that column — checked first, in the
   script). `/manifests/<id>` is green without a reseed.

2. **`scripts/smoke.mjs` asserted `'Pickup detail'` on `/pickups/[id]`, and had
   been RED since Batch 5.** C's real screen uses the pickup id as its `<h1>`,
   which is better; the Batch 0 stub's wording simply outlived the stub — trap
   28 running backwards. Replaced with the vendor and agent names, which are
   only reachable through joins. 🔴 **`npm run smoke -- --app=admin` is now
   23/23 for the first time.**

### 🟠 Known, deliberately not done

- 🟠 **`npm run lint` is RED on two pre-existing errors** in files this batch
  never touched: `(admin)/market/page.tsx:31` (`react-hooks/purity` — an impure
  call during render) and `(admin)/pickups/[id]/page.tsx:266` (an `<a>` where a
  `<Link>` belongs). **B's and C's screens.** Not fixed here to keep the batch
  scoped; both look like one-liners. Lint is not on the pre-push list, but it
  should be green before Batch 17.
- 🟠 **No `reconciledAt`, no manifest editing, no pagination** — see decision 7
  and Batch 6's equivalent notes.
- 🟠 **Pro-rating is an allocation, not a measurement.** Decision 4.
- 🟠 **The override is a free-text pickup id**, not a picker. An escape hatch
  should not be a one-click affordance sitting next to the normal buttons.
- **Batch 14 (`/audit`) is what makes the override's reason visible.** Until it
  lands, the reason is written and stored but only readable in the database.

---

## Batch 11 — as built · 2026-08-31 · **A (Aamir), covering B's lane**

**Green.** `npm run build` (three apps, `ƒ Proxy (Middleware)` ×3) ·
`npm run lint` **0 errors** · `npm run test` **277** (core 210, auth 40,
engine 27 — up from 246; the 31 new ones are `engine-config.test.ts`) ·
**all nine smoke runs pass**, admin 23/23.

### 🔴 Why this batch existed at all — read this part

**Batch 11 was recorded as done and was not.** Commit `8581731` ("batch 11")
touched **three files** and landed steps 1 and 2 only. Steps 3–8 — the
`/config` screen, `publishConfig`, the validator, version minting, the supplier
merge and the simulate stub — were never built. `CLAUDE.md`, `PROJECT_STATE.md`
and this sheet all claimed "every screen in the sprint is built" for a day.

**`/config` was still the Batch 0 stub**, rendering the words *"Screen D01 · not
built yet · batch 11"* in production.

🔴 **Smoke did not catch it, and the reason generalises.** The stub was written
in Batch 0 to keep the `<h1>Engine config</h1>` that `scripts/smoke.mjs`
asserts on — deliberately, so the assertion would survive until the screen was
built. The effect was that **`/config` scored a green "ok" for two batches while
rendering nothing**, and `npm run smoke -- --app=admin` reported 23/23 the whole
time. This is trap 9 turned inside out: not "a route that asserts nothing", but
*a route whose assertion is satisfied by its own placeholder*.

**Fixed here.** `/config`'s assertion now names four things only the real screen
can produce — the seeded `v2026-08-26-r1` (proves the row was read),
`Tier 3 — not configurable` (proves the AD8 panel rendered), `NMC622` (proves
the chemistry table was built from the config JSON) and `Publish history`.
🔴 **When you stub a route, do not give the stub the string smoke asserts on.**
Assert on something the stub cannot produce, and let the route fail until it is
built — a red check is the point.

### What shipped

| Step | File | Note |
|---|---|---|
| 1 | `packages/core/src/engine-config.ts` | `getActiveConfig()` — already landed; extended |
| 2 | `apps/agent/src/app/api/quote/route.ts` | AD9 — already landed; **`supplier_id` hardened** |
| 3 | `engine-config.ts` → `buildSupplierMarginOverrides()` | 🔴 the price-moving half |
| 4 | `apps/admin/src/app/(admin)/config/page.tsx` | 532 lines, replaces the stub |
| 5 | `apps/admin/src/app/(admin)/config/actions.ts` | `publishConfig`, append-only |
| 6 | `engine-config.ts` → `validateEngineConfig()` | pure, 31 tests |
| 7 | `engine-config.ts` → `mintConfigVersion()` | `v<YYYY-MM-DD>-r<n>`, IST |
| 8 | `config/page.tsx` | simulate is a stub with the *why* |

### 🔴 Step 3 — the supplier lever was INERT, and that is the real defect

`/suppliers` (Batch 9) writes `Profile.marginTier`. `layers/selection.ts:93`
reads `config.supplier_margin_overrides`. **Nothing built the map between
them.** An admin could set a vendor's margin tier, see the audit row, and change
that vendor's price by exactly zero — no error, no warning. A screen that looked
like it worked and didn't.

`buildSupplierMarginOverrides()` closes it, and `getActiveConfig()` merges the
map so no caller can forget to.

⚠ **That alone was not enough, and this is the part worth knowing.** Nothing in
the agent app ever sent `supplier_id` — `ComputingRunner.tsx` posts seven fields
and that is not one of them — so `computePricingBand` received `undefined` and
the override could never fire even once the map existed. The quote route now
derives it **server-side from `Pickup.vendorId`**.

🔴 **Deliberate deviation, and it is a security decision, not a convenience
one.** Taking `supplier_id` from the request body would be the AD9 defect
wearing a different hat: an agent's browser could name any vendor and pull that
vendor's pricing tier onto this quote. Deriving it from the pickup costs one
indexed lookup and makes the field unspoofable. **Do not "simplify" it back to
`body.supplier_id`.**

### 🔴 Pricing-surface statement — proved, not asserted

Both halves were measured against the live seeded config, read-only:

- **Step 2 is PRICE-NEUTRAL.** Same item, same market row, quoted through the
  active `EngineConfig` and through `DEFAULT_CONFIG`: **net ₹64072.00 both
  ways, `p_recommended` ₹51257.60 both ways**, same pathway. That is the AD8
  drift guard doing its job — the seeded row is byte-identical to the engine's
  defaults, which is exactly what `body.config` used to carry.
- **Step 3 MOVES PRICES, but not on a fresh seed.** A `generous` override takes
  `p_recommended` from ₹51257.60 to **₹57664.80** on that same item — ₹6,407 more
  to the vendor. 🎯 **On a fresh seed nothing moves**, because the one seeded
  override (fixture 7) is `standard`, which is already `computePricingBand`'s
  fallback. Prices move the moment someone sets a non-standard tier.
- `p_min` and `p_max` stay anchored to the tier extremes; an override shifts only
  the recommended point.

### Decisions worth keeping

1. **`getActiveConfig()` THROWS when no row is active** — it does not fall back
   to `DEFAULT_CONFIG` as step 1 of this sheet says. Kept and documented rather
   than "corrected": a fallback is invisible exactly when it matters. The agent
   is in front of a vendor, the quote returns, and nothing in the number says it
   was priced off placeholders. A 503 they can retry is recoverable; a wrong
   price they have already read aloud is not.
2. **A publish overlays the form onto the current config**, rather than building
   one from scratch. That is what makes "tier 3 cannot be submitted"
   *structural* rather than a promise — those values are not `Config` keys at
   all, so there is no field for a crafted POST to land in. It is also why the
   `unknown` chemistry sentinel survives untouched.
3. **A blank composition cell means "absent", not zero.** LFP genuinely has no
   Co, Ni or Mn. Writing 0 instead would put empty rows in every recycle revenue
   breakdown.
4. **The composition sum check carries a `1e-9` epsilon.** `0.07 + 0.05 + 0.15
   + …` does not land on 1.0 in floating point, and without it the validator
   rejects a legitimate config.
5. **The version is minted INSIDE the transaction**, so two concurrent publishes
   cannot read the same highest revision and collide on the `@unique` column.
   It parses the highest existing revision rather than counting rows — a deleted
   row would otherwise make the next mint collide with a survivor.
6. **The audit row carries changed fields only**, diffed as dotted leaf paths.
   The schema comment demands it; a full config on both sides is ~8KB per
   publish and unreadable on `/audit`.
7. **`computeDamageScore` is now exported from the engine barrel** (purely
   additive) so the tier-3 invariant can be pinned by *exercising* the engine.
   Restating `0.4 + 0.35 + 0.25 = 1.0` in a test asserts a constant against
   itself and passes forever; scoring `{3,3,3}` and expecting exactly `3` fails
   the moment someone edits the weights.
8. **`packages/core` now depends on `@clbipp/decision-engine`.** It previously
   type-imported `Config` without declaring it, which works for types and not
   for the value imports the tests need.

### Done-when

- [x] 🎯 A quote with `config` omitted returns identical numbers — **₹64072.00
      net, ₹51257.60 recommended, both ways.**
- [x] `margin_tiers: { aggressive: 0 }` changes nothing — rejected by the
      validator, and unreachable through the route at all.
- [x] Publishing deactivates exactly one and leaves exactly one `isActive` —
      enforced in the transaction; **asserted by query: 1 active row.**
- [x] A config failing any rule is rejected **by the action**, not the form.
- [x] The audit row names both versions and the changed fields; no bare `null`
      in `before` / `after` (trap 21).
- [x] Tier 3 renders and cannot be submitted — no input, no hidden field, no
      accepted key.
- [x] The drift test and all engine tests pass; `npm run test` green at 277.
- [ ] ⚠ **The publish POST itself has never been exercised.** `smoke` fetches
      HTML and does not submit forms, so `publishConfig` is verified by unit
      test and by reading, not by running. Added to
      `docs/MANUAL_TEST_QUEUE.md` (items 47–50) as the highest-value manual
      check left in the sprint.

### 🔴 What the next batch must know

**Batch 17 (deploy) is now the only unbuilt batch, and this time that was
checked** rather than taken from a commit subject: `grep -rl "not built yet"
apps/admin/src` matches nothing, and every `page.tsx` under `(admin)/` is real
code. Run that grep before believing any "all screens built" claim.

---

## Fix pass — as built · 2026-08-31 · **A (Aamir), covering B's and C's lanes**

Not a batch. A review of everything B and C pushed in `bac7bde` (batches 2, 5,
8, 9, 10, 12, 13, 15, 16), and the six defects it found. **All six were in work
already recorded as done, and none was caught by build, lint or tests.** Full
write-up and file list in `docs/LANE_OWNERSHIP.md` under this date.

### What was wrong, and what it cost

| | Defect | Batch | Effect |
|---|---|---|---|
| 1 | Export route committed at `(admin)/exports/compliance.ts/route.ts`; screen linked to a third path | 13 (B) | CPCB download 404'd from every angle |
| 2 | `CATEGORY_LABELS.ev` `'EV pack'` → `'EV'` in the lift | 8 (B) | Every EV row in a filed return changed wording |
| 3 | `/pickups` never read `searchParams.q` | 5 (C) | Topbar search navigated and showed an unfiltered list |
| 4 | `/agents` declared its own four-status live load; `job-load.ts` said three | 9 (C) | Same agent, two different numbers on two screens |
| 5 | All five dashboard KPI tiles were inert `<div>`s | 15 (C) | Read "3 in exception", no way to reach the three |
| 6 | Eleven screens asserted only their Batch 0 stub `<h1>` | 2–16 | A green suite that proved nothing about content |

### 🔴 What the next session must know

1. **No seeded certificate is an EV pickup.** `PKP-2026-000109` is `portable`,
   so the live compliance export never exercises the `ev` label — which is
   exactly why defect 2 survived a working export, a passing build and a green
   smoke run. `packages/core/src/compliance-export.test.ts` (14 tests) is the
   only cover for it. **Do not delete that file as redundant.**
2. **`LIVE_JOB_STATUSES` now includes `collected`, and that changed
   `/dispatch/[id]`.** A collected pickup is in the agent's van until the hub
   drop-off — the hand-over is the `CustodyBatch`, not the status. Both
   `/agents` and the dispatch picker import the constant; neither declares one.
3. **`/trace/[traceId]` asserts its EMPTY state, deliberately.** `quoteData` is
   still unseeded (Batch 1 note 6), so no trace screen renders an engine
   breakdown. The assertion names `'No engine record for this trace id yet'`.
   🔴 **Whoever seeds `quoteData` must edit that line in `scripts/smoke.mjs`** —
   pinning the empty state is what keeps the gap visible instead of
   rediscovered on the screen.
4. **`ADMIN_ISOLATION` is new in `scripts/smoke.mjs`** and asserts that no
   EPR-credit figure appears on `/compliance`. Open question 17 is still open;
   the wireframe's "31.8 credits" is backed by nothing. That absence is now a
   test, because a deliberate omission looks exactly like a missing feature to
   whoever reads the wireframe next.
5. **`DataTable` gained `initialQuery`**, seeded from the URL. It is an
   *initial* value, not a controlled one — once the page is open the box belongs
   to the user. `KpiTile` gained an optional `href`; both are Batch 2 console-kit
   files and 🔴 neither may move into `packages/ui` (AD11).

### Verification — all green, 2026-08-31

`npm run lint` · `npm run test` **291** (core 224, auth 40, engine 27) ·
`npm run build` (three apps, `ƒ Proxy (Middleware)` on each) ·
`npm run smoke` **admin 24 / customer 46 / agent 30** ·
**all six role-gate directions bounce.**

⚠ The admin smoke count rose 23 → 24: `/pickups?q=PKP-2026-000102` is a new
probe. Eleven other routes kept their path and gained real assertions.
