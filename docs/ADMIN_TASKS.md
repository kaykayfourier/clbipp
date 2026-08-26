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
17. **Smoke the customer app against a production build, not `npm run dev`** —
    the three `api/documents/[kind]/[id]` routes 404 under Turbopack dev.
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

**Done when**
- [ ] 🎯 Book a pickup in the customer app → it appears on `/dispatch` → assign it → **it appears on the agent's day view as SCHEDULED**. That round trip has never worked from a screen before.
- [ ] The customer's `/track/[id]` shows the partner card, the ETA, and a custody entry attributing the assignment.
- [ ] Double-submitting the assign form does not reassign or write a second event.
- [ ] A forged `pickupId` (someone else's, or a `collected` one) is rejected.
- [ ] The reactivated pickup shows its stale-agent marker and is cleared on reassign.

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

**Done when** a pickup collected in the agent app shows a real payable amount at
the customer's `/payment/[id]`, settling it works, calling `confirmCollection`
twice creates one `Payment` and one `WalletTxn`, and `npm run smoke -- --app=agent` is still green.

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

Detailed the same way once the P0 spine lands. Headlines and the traps that
apply:

| # | Batch | Owner | The thing not to get wrong |
|---|---|---|---|
| 9 | Network — suppliers / agents / facilities / recyclers | C | Margin-tier override writes `Profile.marginTier` **and** an `AdminAudit`; it is a live pricing lever (`selection.ts` already honours it). |
| 10 | Inventory | C | Stock is derived from `CustodyBatch` + item state, not a stored counter. Dwell alerts compute off `handedOffAt`. |
| 11 | Engine config | B | 🔴 Tier 3 fields are **read-only** (AD8/W3). `getActiveConfig()` server-side; the quote route stops reading `body.config` (AD9) — **a pricing-surface change: say so in the commit message**, even though AD8 makes it price-neutral. Validator: weights sum to 1.00, tiers ordered, efficiencies in 0..1. "Simulate" is a stub with a `// TODO` (§2). |
| 12 | Quote queue + traceability | C | 🔴 **Flat-rate items must appear** (W2/AD1) — pathway `—`, a `FLAT RATE` chip. Trace reads `BatteryItem.quoteData`, which is exactly what the schema's own TODO hands to this app. |
| 13 | Compliance | B | Reuse Batch 8's export. No EPR-credit figure (open question 17). |
| 14 | Exceptions + `/audit` | A | Every resolution writes `AdminAudit` with before/after and a reason. Resolutions are `retest` / `override` / `reject`, per the wireframe. |
| 15 | Dashboard + analytics | C | Every tile is an aggregate of screens already built — build it **last**, not first. Margin % is fine here (AD12) and must never reach a vendor screen. |
| 16 | Market feed | B | The override writes a **new `MarketPrices` snapshot row** with `source` / `note` / `createdBy`, never an update in place. `market.ts` reads `fxRateUsdInr` instead of the hardcoded 83.2. |

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
