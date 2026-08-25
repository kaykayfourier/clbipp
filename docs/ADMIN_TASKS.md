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

**Done when**
- [ ] `npm run dev`, `npm run dev:agent`, `npm run dev:admin` all run together.
- [ ] `npm run build` prints **`ƒ Proxy (Middleware)`** for admin. *(trap 1)*
- [ ] `npm run smoke -- --app=admin` is green with a **content assertion** on `/`. *(trap 9)*
- [ ] `npm run smoke -- --app=admin --blocked business@test businesstest` bounces.
- [ ] `npm run smoke -- --app=admin --blocked agent@test demo1234` bounces.
- [ ] `npm run smoke -- --blocked admin@test demo1234` — admin barred from the customer app.
- [ ] No `AppShell` / `PhoneFrame` import anywhere in `apps/admin`. *(trap 15)*

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

**Done when**
- [ ] `npm run db:migrate` and `npm run reset-demo` both green.
- [ ] The `EngineConfig` drift test passes. 🔴 **No existing test's expected price changed.**
- [ ] `/dispatch` would have ≥3 unassigned rows; three recyclers exist with non-overlapping chemistries.
- [ ] Grants re-applied after the reseed. *(trap 7)*

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

**Done when** both render off real seeded data with content assertions in smoke,
a pickup at every one of the ten statuses renders without throwing, and the
two-halves display never overwrites either half.

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
npm run smoke -- --app=admin --blocked business@test businesstest   # vendor barred
npm run smoke -- --app=admin --blocked agent@test demo1234          # agent barred
npm run smoke -- --blocked admin@test demo1234                      # admin barred from customer

npm run build && npm run test && npm run lint
```

---

## Batch N — as built

*Append a section here when a batch lands: what actually shipped, what deviated
from this sheet and why, and what the next batch must know. Same convention as
`FIELD_AGENT_TASKS.md` — that habit is why this sheet has a trap list.*
