# Field Agent App — Task Sheet

> **Companion to `PLAN_FIELD_AGENT_APP.md`.** That document is the *why*: the
> wireframe assessment and decisions D0–D10. **This one is the *what to do*.**
>
> Read the plan once, at the start. Then work from this sheet.
>
> Every batch below is: what it depends on, the exact files, numbered steps, a
> **Done when** checklist you can verify yourself, and the repo-specific traps
> that will otherwise cost you an hour. If a step here contradicts the plan, the
> plan wins — tell whoever owns that batch.

---

## Day-1 kickoff — 30 minutes, all three

Do this before anyone writes code. It is the only meeting in the week.

1. **Confirm lanes** (§4 of the plan): A = Aamir · B = Khalid · C = Ali.
2. **Confirm the four seams** (§4 seam table) — especially that C builds the
   quote screens against a mock `QuoteOutput`, not against B's API.
3. **B starts the migration immediately.** A and C are both blocked on it, and
   only on it. It's fully specified in §3 of the plan; there is nothing to design.
4. ~~Agree the branch names~~ — **superseded 2026-08-20: we push straight to
   `main`, no branches.** Coordinate by not editing the same file at the same
   time, and by pushing small and often so nobody rebases a day's work.

Then split up. The seam table exists so you don't need to talk again until
Batch 9.

---

## Conventions — everyone, every batch

Non-negotiable, and every one of them has bitten this repo before.

**Imports**
- Inside `apps/agent`, `@/*` means `apps/agent/src/*`. Nothing shared is ever
  reached with `@/` — it comes from `@clbipp/{ui,auth,core,database,pdf}`.
- **Never import from `@prisma/client`.** Use `@clbipp/database`, which
  re-exports the client *and* every model type and enum.

**What you'll actually import**

| Need | Import from |
|---|---|
| Prisma client + types + enums | `@clbipp/database` |
| Server Supabase client (session) | `@clbipp/auth/server` → `createClient()` |
| Service-role client (bypasses RLS) | `@clbipp/auth/admin` → `createAdminClient()` |
| Photo upload | `@clbipp/auth/storage` → `uploadFile`, `uploadFiles`, `buildObjectPath`, `MAX_FILE_BYTES` |
| Signed URLs for `<img>` | `@clbipp/auth/storage-server` → `createSignedUrl`, `createSignedUrls` |
| Realtime | `@clbipp/auth/realtime` → `subscribeToPickupEvents` |
| UI + tokens + lifecycle | `@clbipp/ui` → `AppShell`, `BottomTabBar`, `Card`, `Banner`, `Badge`, `ListRow`, `Timeline`, `buildStages`, `LifecycleHeader`, `RecoverySummary`, `LIFECYCLE_STAGES`, `STAGE_LABELS`, `isLifecycleStage`, `isStageBefore` |
| ₹ formatting in a **client** component | `@clbipp/core/format` → `formatPaise` |

⚠ **`formatPaise` in a client component must come from `@clbipp/core/format`,
not `@clbipp/core`.** The package barrel re-exports `booking-actions` /
`payment-actions`, so a value import from the barrel drags Prisma into the
browser bundle. The subpath resolves to `documents.ts`, which imports nothing.

**Money**
- Integer paise everywhere. Never a float, never rupees, never a local `/100`.
- The engine returns **rupee floats** — convert at the boundary with
  `rupeesToPaise` (B builds it in Batch 4). Nowhere else.

**Lifecycle**
- Never re-declare the stage array in a screen. Use `isLifecycleStage` /
  `isStageBefore` / `STAGE_LABELS` from `@clbipp/ui`.
- The nine stages are locked. No migration adds one.

**Writes**
- Every agent lifecycle write goes through a `"use server"` action using
  `createAdminClient()`, which **re-verifies `pickup.agentId === user.id` in
  code** because the service role bypasses RLS.
- Read the session identity from `createClient().auth.getUser()`. **Never trust
  an id that came from the form.**
- Copy the shape from `apps/customer/src/app/(app)/handover/actions.ts` — it is
  the reference implementation.

**Before you open a PR**
```bash
npm run build      # type-checks every app + package
npm run test       # Vitest, all packages
npm run smoke      # logs in as a real seeded user and fetches every route
```
`npm run build` never renders a page with a session, so **`npm run smoke` is the
check that catches a server component throwing at request time.** Add every new
route to `ROUTES` in `scripts/smoke.mjs` as it lands.

**Tests** live in the package that owns the code, as `*.test.ts` next to the
source. **Apps hold no tests.** If logic is worth testing, it belongs in
`packages/core`, not in a screen.

**Git (changed 2026-08-20):** commit and **push straight to `main`**. No
branches, no PRs — branch-and-PR was costing more in merge friction than it was
buying in review. One feature = one small commit; don't bundle unrelated changes.

⚠ **Both Vercel projects deploy off `main`, so a push is a deploy.** The three
commands above are no longer a pre-PR courtesy — they are the only gate left.

---

## Batch 0a — Schema + seed · **Aamir** *(moved from Khalid 2026-08-20)* · ~0.4d ✅ DONE 2026-08-21

> Shipped straight to `main`. Verified: `npm run build` green (agent app still
> prints `ƒ Proxy (Middleware)`); lint clean; **142 tests pass**;
> `npm run smoke` **45/45**; `npm run smoke -- --app=agent` **23/23**; and the
> role gate holds both ways — `--app=agent --blocked business@test` 23/23 and
> `--blocked agent@test` 45/45. Plus 30 scripted DB assertions over the fresh
> seed. **A's Batch 1, A's Batch 2 and C's Batch 3 are all unblocked; B's Batch
> 4 has its `MarketPrices` row and its persistence columns.**
>
> ⚠ **Read "Batch 0a — as built" at the bottom of this file before Batch 1 or
> Batch 4.** Two deviations, one live incident recovered mid-batch (the shared
> Supabase project had lost its schema grants *and* every `profiles` row), and a
> new seeded-id contract that `scripts/smoke.mjs` now depends on.

**Depends on:** nothing. **Blocks:** everything. Do it first, ship it same-day.

> **Owner changed 2026-08-20.** It blocks A's Batches 1 and 2 *and* C's Batch 3,
> so under the new do-it-and-note-it lane policy it was taken over rather than
> waited on. Logged in `docs/LANE_OWNERSHIP.md`. **Khalid: don't also build
> this** — your lane is now Batch 4, Batch 7b, Batch 9, and the agent app's
> Vercel project (`DEPLOY.md` §9).
>
> Two extra steps beyond the list below, both consequences of Batch 0b:
> 1. **Re-point the agent smoke ids** once the seed is real — `AGENT_PICKUP` /
>    `AGENT_ARRIVED` / `AGENT_ITEM` / `AGENT_BATCH` in `scripts/smoke.mjs` are
>    placeholders that only 200 today because the stubs query nothing.
> 2. Read `docs/ai-prompts/database-create-migration.md` before authoring the
>    migration.

**Edit**
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/reset-demo.ts`

**Steps**
1. Apply the §3 schema delta from the plan, exactly as written:
   `Pickup.agentFeePaise` · `Offer.acceptedAt` · `BatteryItem.damageVisual /
   damageLeakage / damageThermal / damageScore / pathway / traceId` ·
   `WalletTxnKind + agent_fee` · new `CustodyBatch` · `Pickup.custodyBatchId`.
2. `npm run db:migrate --workspace=@clbipp/database` — one migration, named
   `agent_app_v1`.
3. Extend `reset-demo.ts`:
   - The existing `agent@test` profile already has zone/vehicle/rating — leave it.
   - Assign `agentId` on pickups so the agent has **at least one at each of**
     `scheduled`, `arrived`, `offered`, `collected`, and two further along for
     the watch-only timeline.
   - Give the `scheduled` and `arrived` ones **2–3 `BatteryItem` rows each, mixed
     categories** — at least one li-ion and one lead-acid. C cannot build the
     multi-item flow without this.
   - Seed one `MarketPrices` row and one `Facility` row.
4. `npm run reset-demo`, then open `npx prisma studio` and eyeball it.

**Done when**
- [x] `npm run build` green
- [x] `npm run reset-demo` runs clean from a wiped DB
- [x] `agent@test` has ≥1 pickup at each of the five stages above
- [x] At least one pickup has a mixed-category `BatteryItem` set

**Watch out**
- `LIFECYCLE` in `reset-demo.ts` must stay in sync with `enum PickupStatus`,
  `LIFECYCLE_STAGES` in `packages/ui/src/tokens.ts`, and `pickupstatusSchema` in
  `packages/core`. You are not changing the list — just don't let it drift.
- `packages/database` **must not import `packages/core`** — the cycle breaks the
  generated client. If you need the CO₂ table, restate it (there's already a
  test asserting the two agree).

---

## Batch 0b — App scaffold + auth gate · **Aamir** · ~0.5d ✅ DONE 2026-08-20

> Shipped on `feat/agent-b0b-scaffold`. Verified: `npm run build` prints
> `ƒ Proxy (Middleware)` for `apps/agent`; lint clean; 142 tests pass;
> `npm run smoke -- --app=agent` 23/23; `npm run smoke` 45/45 (unchanged);
> and the role gate holds in **both** directions —
> `--app=agent --blocked business@test` 23/23 and `--blocked agent@test` 45/45.
> **C's Batch 3 is unblocked.** What was actually built, and the four things
> that differ from the steps below, are in "Batch 0b — as built" at the bottom
> of this file. Read that before Batch 1.

**Depends on:** nothing (start in parallel with 0a). **Blocks:** C's Batch 3.

**Create**
- `apps/agent/src/proxy.ts`
- `apps/agent/src/app/(agent)/layout.tsx`
- `apps/agent/src/app/(auth)/login/page.tsx`
- `apps/agent/src/app/(agent)/page.tsx` — placeholder home
- Stub `page.tsx` for every route in §2 of the plan (a heading and nothing else)

**Edit**
- `apps/agent/package.json`, `next.config.ts` (mirror `apps/customer`'s
  `transpilePackages`)
- `scripts/smoke.mjs`

**Steps**
1. Copy `apps/customer`'s `next.config.ts` and `tsconfig.json` shape into
   `apps/agent`. Packages ship raw TS and are compiled per-app via
   `transpilePackages` — there is no per-package build step.
2. Write `apps/agent/src/proxy.ts`:
   ```ts
   export const proxy = createAuthMiddleware({
     publicPaths: ['/login', '/auth'],
     homePath: '/',
     allowRoles: ['agent'],
   })
   ```
   No `onboardingPath` — agents don't self-sign-up (D6).
3. `(agent)/layout.tsx`: own the bottom-nav clearance the way
   `apps/customer/src/app/(app)/layout.tsx` does — the **layout** pays for the
   fixed bar, never the page. Screens pass `hideNav` to `AppShell` and nothing else.
4. Login page: email + password only. No Agent ID, no OTP (D6/W7).
5. Stub every §2 route so links resolve before the screens exist.
6. Extend `scripts/smoke.mjs` to run against the agent app as `agent@test`.

**Done when**
- [x] `npm run build` shows `ƒ Proxy (Middleware)` for `apps/agent`
- [x] `agent@test` can log in and land on `/`
- [x] `business@test` (a customer) is **signed out** when hitting the agent app
- [x] `npm run smoke` passes against the agent app
- [x] Every §2 route returns 200, even if the page is empty

**Watch out**
- 🔴 **`proxy.ts` must live at `apps/agent/src/proxy.ts`, not the project root.**
  Next's dev bundler silently never registers a root-level proxy file when
  `src/app` is in use, and **an unregistered auth guard fails OPEN**. This is the
  single most dangerous mistake available in this repo.
- ⚠ `packages/auth/src/middleware.ts` is **not** renamed and must not be — it's
  the `createAuthMiddleware` factory, an ordinary module, not a convention file.
- Don't give a page its own bottom padding. The layout owns clearance; per-page
  padding double-pads (the bug Batch 6.5 fixed on the customer side).

---

## Batch 1 — Day view + job detail · **Aamir** · ~0.75d ✅ DONE 2026-08-22

> Shipped to `main`. Verified: `npm run build` green (agent app still prints
> `ƒ Proxy (Middleware)`); lint clean; **154 tests pass** (142 + Batch 4's 12);
> `npm run smoke -- --app=agent` **23/23** with real content assertions on both
> new screens; `npm run smoke` **45/45 against the customer production build**;
> and 12 scripted checks over the `Arrived` write, its idempotency and its
> ownership guard — including a **forged `pickupId`**, which is turned away.
>
> ⚠ **Read "Batch 1 — as built" at the bottom of this file before Batch 2 or
> Batch 3.** One seed edit, one deferred wireframe element, and a live
> dev-server-only smoke failure that is NOT this batch's.

**Depends on:** 0a + 0b.

**Create**
- `apps/agent/src/app/(agent)/page.tsx` — day view
- `apps/agent/src/app/(agent)/job/[id]/page.tsx`
- `apps/agent/src/app/(agent)/job/[id]/actions.ts`
- `apps/agent/src/lib/job-nav.ts`

**Steps**
1. Day view: Prisma read of pickups where `agentId === user.id`, scoped **in
   code**. Stats = assigned today / collected today / earned today. No "Avg
   margin" (it's a business figure, wrong on a contractor's home screen).
2. **No "New requests nearby" section** — jobs are pushed (D2).
3. `job-nav.ts` owns row → destination routing, mirroring
   `apps/customer/src/lib/pickup-nav.ts`. **Don't re-derive a row's destination
   inside a screen.**
4. Job detail: vendor, address, category, the customer's declared items and
   photos, agent fee. Actions:
   - **Open in Google Maps** — `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` from `Address.lat/lng`
   - **Call** — a plain `tel:` link
   - **Arrived** — server action, writes `arrived`
5. `actions.ts` — the **reference service-role action for this app**. C copies
   it, so make it clean and comment the ownership re-check.

**Done when**
- [ ] Day view lists only `agent@test`'s own pickups
- [ ] Tapping "Arrived" moves a `scheduled` pickup to `arrived` and writes a
      `StatusEvent` with `actorRole: 'agent'`
- [ ] Re-tapping "Arrived" is a **no-op, not an error** (idempotent)
- [ ] The action rejects a pickup belonging to a different agent
- [ ] Maps link opens; `tel:` link dials
- [ ] Both routes in `smoke.mjs`, `npm run smoke` green

**Watch out**
- `Address.lat/lng` are **nullable** — fall back to a text address search.
- Write `pickups.status` **and** the `status_events` row in one action. The
  status column is a denormalised cache of the event log; drift here is
  invisible until a timeline looks wrong.

---

## Batch 2 — Safety checklist · **Aamir** · ~0.5d ✅ DONE 2026-08-23

> Shipped to `main`. Verified: `npm run build` green (agent app still prints
> `ƒ Proxy (Middleware)`); lint clean; **174 tests pass** (154 + 20 new in
> `packages/core/src/safety.test.ts`); `npm run smoke -- --app=agent` **25/25**
> with the gate asserted in BOTH directions; `npm run smoke` **45/45 against the
> customer production build**; role gate holds both ways (**25/25** and
> **45/45**); and 15 scripted checks over the gate, the failed-checklist record,
> the upsert and a **forged `pickupId`**, which is turned away.
>
> ⚠ **Read "Batch 2 — as built" at the bottom of this file before Batch 3.** One
> real bug found (Prisma `@default(uuid())` does NOT apply on a service-role
> write), one line Ali must not delete from `items/page.tsx`, and a seed change
> that unblocks Batch 3.

**Depends on:** 1. **This is the feature HR looks for first (W1).**

**Create**
- `apps/agent/src/app/(agent)/job/[id]/safety/page.tsx`
- `apps/agent/src/app/(agent)/job/[id]/safety/actions.ts`

**Steps**
1. Checklist items, chemistry-aware, straight from the HR docs:
   terminals insulated · no puncturing · fire-safe crate · no mixed chemistry ·
   PPE worn. Show lithium-specific items only when the pickup has a li-ion item.
2. Write a `SafetyChecklist` row (`items` Json, `passed` bool). The model
   already exists — no migration.
3. **Gate intake on it.** `/job/[id]/items` redirects back to `/safety` unless a
   `passed` checklist exists. The gate lives in the items page, server-side.
4. Show it as a completed step on the job detail screen once passed.

**Done when**
- [ ] Cannot reach `/job/[id]/items` without a passing checklist — verified by
      URL, not just by hiding the button
- [ ] All three HR-named items are present
- [ ] Re-submitting updates rather than duplicating (`pickupId` is `@unique`)
- [ ] Route in `smoke.mjs`, `npm run smoke` green

**Watch out**
- The UI is not the security boundary. Hiding the button is not the gate — the
  server-side redirect is.

---

## Batch 3 — Multi-item intake · **Ali's lane, built by Aamir** · ~1.0d ✅ DONE 2026-08-23

> Shipped to `main`. Verified: `npm run build` green (agent app still prints
> `ƒ Proxy (Middleware)`); lint clean apart from one **pre-existing** warning in
> Khalid's `api/quote/route.ts`; **213 tests pass** (174 + 39 new in
> `packages/core/src/intake.test.ts`); `npm run smoke -- --app=agent` **28/28**
> with the safety gate now asserted in both directions on **three** routes;
> `npm run smoke` **45/45**; the role gate holds both ways (**28/28** and
> **45/45**); and 30 scripted checks over the real server action, including a
> **forged item id from another pickup** and a **photo path under another user's
> uid**, both turned away.
>
> ⚠ **Read "Batch 3 — as built" at the bottom of this file before Batch 5a.**
> Four deviations, one contradiction in the steps below that had to be resolved,
> and the one-line change that flips the confirm redirect into 5a's screens.

**Depends on:** 0a + 0b. **The biggest UI batch — start it day 2.**

**Create**
- `apps/agent/src/app/(agent)/job/[id]/items/page.tsx` — the list
- `apps/agent/src/app/(agent)/job/[id]/items/[itemId]/page.tsx` — confirm one
- `apps/agent/src/app/(agent)/job/[id]/items/actions.ts`
- `apps/agent/src/app/(agent)/job/[id]/scan/page.tsx` — optional, do last

**Steps**
1. **Item list** — the spine of the flow. Every `BatteryItem` on the pickup, each
   showing declared vs confirmed state, plus a running total (count + kg).
   "Continue to quote" is disabled until every item is confirmed.
2. **Item confirm** — per item, the agent sets: category, chemistry
   (`BatteryType`), weighed kg, condition, photos. These write the
   *agent-confirmed half* of `BatteryItem`: `chemistry`, `confirmedWeightKg`,
   `confirmedCondition`, `agentPhotoUrls`, `recordedBy`, `recordedAt`.
   **Never overwrite the customer-declared fields** — both halves are evidence.
3. **Branch on chemistry:** li-ion (`li_ion_nmc` / `li_ion_lfp` / `li_ion_nca`)
   → "Continue to damage rubric". Everything else → straight to price. This is
   D1 and it is the whole reason this batch is big.
4. **Photos** upload through a `"use server"` action using the service role —
   agent photos are written by the service role per `storage-policies.sql`.
   Bucket `pickup-photos`; build the path with `buildObjectPath`. Check
   `MAX_FILE_BYTES` client-side before sending — the bucket limit is a backstop
   that fails *after* a full upload, which is a bad thing to learn on mobile data.
5. QR scan last, and only if there's time. Manual entry is the primary path.

**Done when**
- [ ] A pickup with 3 mixed-category items can be fully confirmed
- [ ] Li-ion items route to the rubric; lead-acid items skip it
- [ ] Photos land in `pickup-photos` and render back via `createSignedUrl`
- [ ] Leaving mid-way and returning keeps confirmed items confirmed
- [ ] Customer-declared fields are unchanged after confirming
- [ ] Routes in `smoke.mjs`, `npm run smoke` green

**Watch out**
- ⚠ **If this overruns by more than half a day, stop and fall back** to one
  li-ion item per pickup, keeping the loop only for the simple path. Contained
  retreat, decided on the spot — say so in the group chat, don't absorb it
  silently. (§5 risk 2.)
- Photos are evidence of one consignment — never copy them between items.

---

## Batch 4 — Engine + pricing · **Khalid** · ~1.2d

**Depends on:** 0a. Pure logic — **no UI, no app files.**

**Create**
- `packages/core/src/agent-fee.ts` + `agent-fee.test.ts`
- `packages/core/src/market.ts` — `MarketPrices` row → engine `MarketData`
- `packages/core/src/mock-data.ts` — **a mock `QuoteOutput`. Ship this on day 2;
  C is building against it.**
- `apps/agent/src/app/api/quote/route.ts`

**Edit**
- `packages/decision-engine/src/decisionEngine/layers/intake.ts`
- `packages/decision-engine/src/decisionEngine/{types,defaults}.ts`
- `packages/core/src/documents.ts` — add `rupeesToPaise`

**Steps**
1. **Fix defect 1 (market freshness).** `MARKET_FRESHNESS_MAX_HOURS = 24` is a
   module constant in `intake.ts`. Move it to a `Config` field. Then have
   `market.ts` stamp `snapshot_timestamp` at read time in simulated mode — same
   posture as `PAYMENTS_MODE`. **A row seeded Monday otherwise breaks the demo
   Tuesday.**
2. **Fix defect 2 (trace_id).** `traceCounter` is a module-level in-memory
   counter; on Vercel every cold start resets it, so IDs collide and the audit
   trail the "Why" screen is built on quietly corrupts. Accept a caller-supplied
   `trace_id`, derive it from the pickup/item id, keep the counter as a test-only
   fallback.
3. `rupeesToPaise` — round **half-up at the paise level**. Never round-trip back
   to a float.
4. `agent-fee.ts` — `base_fee + per_km_rate × distance_km`, rounded to the
   rupee, constants in that one file (D3).
5. `POST /api/quote` — validate input, call `computeQuote`, persist a
   `PathwayDecision`, return `QuoteOutput`. Map `EngineValidationError` → 422 and
   `StaleMarketDataError` → 503, as the engine's own header instructs.
6. Non-li-ion items price through the **existing** `estimateQuote` in
   `packages/core/src/booking.ts`. Don't write a second pricing path.
7. Tests for all of it, in `packages/core` / `packages/decision-engine`.

**Done when**
- [ ] `npm run test` green — the engine's existing **20 tests still pass**
- [ ] New tests cover both defect fixes
- [ ] `POST /api/quote` returns a valid `QuoteOutput` for a seeded li-ion item
- [ ] A >24h-old market row no longer throws in simulated mode
- [ ] Two concurrent quotes get **different** trace IDs
- [ ] `mock-data.ts` exports a realistic `QuoteOutput` (shipped day 2)

**Watch out**
- 🔴 **A change that moves a price must say so explicitly in the PR.** Silent
  economics drift is the one failure here nobody notices until a demo.
- Fix defects and anything the HR documents contradict. **Don't refactor the
  engine because it could be nicer** — 1,476 lines, 20 tests, live pricing
  surface, seven-day week.

---

## Batch 5a — Quote screens + offer · **Ali** · ~0.75d

**Depends on:** 3. **Not on Batch 4** — build against `mock-data.ts`.

**Create**
- `apps/agent/src/app/(agent)/job/[id]/items/[itemId]/damage/page.tsx`
- `.../[itemId]/computing/page.tsx`
- `.../[itemId]/result/page.tsx` · `result/breakdown/page.tsx` · `result/why/page.tsx`
- `apps/agent/src/app/(agent)/job/[id]/offer/page.tsx` + `actions.ts`

**Steps**
1. **Damage rubric** — Visual 0.40 / Leakage 0.35 / Thermal 0.25, each 0–3 with
   a photo slot. Matches `DamageScores` in the engine exactly. Show the live
   weighted score and the routing rule (≤1.5 all pathways · 1.6–2.5
   Refurbish/Recycle · >2.5 forces Recycle). Build the forced-Recycle state too.
2. **Computing** — the six-layer stepper. Honest: it reflects the real layers.
3. **Result: Verdict / Breakdown / Why.** Render `QuoteOutput` 1:1. This is the
   deliberate **inverse** of the vendor rule — the agent sees full revenue,
   every cost line, net value, margin, and the P_min/P_rec/P_max band.
   **Cut the "AI explanation" button** — there is no `/api/explain`.
4. **HOLD and REVIEW branches.** HOLD blocks presenting an offer. "Escalate to
   admin" must actually **write** something — a flag and a note on the pickup —
   not navigate home.
5. **Offer roll-up screen** — the multi-item consequence: per-item prices sum
   into **one** `Offer` for the pickup. Creates the `Offer` row and writes
   `offered`. The wireframe had no such screen because it assumed one battery.
6. When B's `/api/quote` lands, swap the mock import. One line.

**Done when**
- [ ] All three result tabs render from a `QuoteOutput`
- [ ] HOLD cannot reach the offer screen; REVIEW can, with a warning
- [ ] "Escalate to admin" persists something visible in the DB
- [ ] Presenting creates exactly one `Offer` and writes `offered`
- [ ] `Offer.estimatedPrice` is **paise**, and every ₹ uses `formatPaise`
- [ ] Routes in `smoke.mjs`, `npm run smoke` green

**Watch out**
- ⚠ Everything on these screens is **agent-only**. None of it may leak to a
  vendor surface — `/offer` and `/offer-breakdown` in the customer app stay
  price + qualitative rationale, weight-only, no margins, no recovery rate.
- `estimatedPrice` is `Int` paise; the engine speaks rupee floats. Convert once,
  with `rupeesToPaise`.

---

## Batch 5b — Cross-app seam · **Aamir** · ~0.4d ✅ DONE 2026-08-24

> ⚠ **Read "Batch 5b — as built" at the bottom of this file before Batch 6.**
> Steps 2 and 3 below were already shipped by the customer app's Batch 12; the
> real work was step 1 plus a fan-out across six screens the sheet did not
> anticipate.

**Depends on:** 0a. **Highest-risk correctness item in the plan (D7/W9).**

**Edit**
- `apps/customer/src/app/(app)/handover/actions.ts`
- `apps/customer/src/app/(app)/handover/page.tsx`
- `apps/customer/src/app/(app)/offer/page.tsx`

**Steps**
1. `acceptOffer` currently jumps `offered → collected`. **Stop it writing
   `collected`.** It now sets `Offer.acceptedAt` and leaves status at `offered`.
   A vendor cannot mark their own battery collected — only the agent on site can.
2. Make `/handover` a **POST**, not a GET-time mutation. It currently mutates on
   page load, which is why it is excluded from `npm run smoke`. Fix that here and
   **add it back to `ROUTES`.**
3. Update the customer's copy: accepting now means "agent will collect", not
   "collected".

**Done when**
- [ ] Accepting an offer sets `acceptedAt` and leaves status `offered`
- [ ] Loading `/handover` mutates **nothing**
- [ ] `/handover` is back in `smoke.mjs` and passes
- [ ] The customer app's existing flows still work end to end
- [ ] `npm run build` + `npm run test` + `npm run smoke` green **for both apps**

**Watch out**
- 🔴 This touches a **merged, deployed** app. Small PR, own branch, nothing else
  bundled with it. Coordinate with Khalid if the customer app is mid-deploy.

---

## Batch 6 — Collect · **Ali** · ~0.75d

**Depends on:** 5a + 5b.

**Create**
- `apps/agent/src/app/(agent)/job/[id]/collect/page.tsx` + `actions.ts`
- `apps/agent/src/app/(agent)/job/[id]/receipt/page.tsx`

**Steps**
1. Gate the screen on `Offer.acceptedAt` being set (5b writes it). If the vendor
   hasn't accepted, say so — don't show a collect button.
2. Capture: battery photo, sealed-packaging photo, drop-off slot, contact
   confirm, and a **signature** (canvas → PNG → `pickup-photos` via the service
   role).
3. On confirm, in **one action**: write `collected` + the `StatusEvent` (with
   GPS from `navigator.geolocation`) + a `PickupReceipt` row + a `WalletTxn` of
   kind `agent_fee` for the agent, and update the cached
   `profiles.wallet_balance_paise` **in the same transaction**.
4. Receipt screen: pickup id, wallet credit, share action, "Go to hub drop-off".
5. Vendor-declines branch: closes the request, collects nothing.

**Done when**
- [ ] Collect is unreachable until the vendor has accepted
- [ ] Confirming writes status + event + receipt + wallet txn **atomically**
- [ ] `wallet_balance_paise` equals `sum(wallet_txns.delta_paise)` afterwards
- [ ] Re-submitting doesn't double-credit the wallet
- [ ] Declining closes the request and collects nothing
- [ ] Routes in `smoke.mjs`, `npm run smoke` green

**Watch out**
- 🔴 **Wallet writes must be idempotent.** A double-tap on a flaky connection
  paying an agent twice is the worst bug available in this batch. Follow
  `settlePayment` in `packages/core/src/payment-actions.ts` — it's already
  idempotent, atomic and ownership-scoped.
- `WalletTxn` is the source of truth; the profile column is a cache. Always
  write both together.

---

## Batch 7a — Hub drop-off UI · **Ali** · ~0.6d

**Depends on:** 6.

**Create**
- `apps/agent/src/app/(agent)/dropoff/page.tsx` — batch select
- `apps/agent/src/app/(agent)/dropoff/confirm/page.tsx` + `actions.ts`
- `apps/agent/src/app/(agent)/dropoff/[batchId]/page.tsx` — receipt

**Steps**
1. **Select:** every pickup at `collected` with no `custodyBatchId`, checkable,
   with a running item count and weight.
2. **Confirm:** pick a `Facility`, show the batch summary, capture GPS +
   timestamp, type the receiving staff name, capture a staff signature.
3. Write one `CustodyBatch` and set `custodyBatchId` on each pickup in it.
4. **Receipt** screen renders the batch and links to the PDF (Khalid's 7b).
5. On screen, state plainly that the hand-off is **agent-attested** — there is no
   hub-staff app, so the receiving name is typed, not authenticated. Being honest
   in a chain-of-custody document matters more than looking complete.

**Done when**
- [ ] Only `collected`, un-batched pickups are selectable
- [ ] Confirming creates one `CustodyBatch` and stamps every pickup in it
- [ ] Those pickups stop appearing in the next drop-off selection
- [ ] GPS + timestamp are persisted
- [ ] Routes in `smoke.mjs`, `npm run smoke` green

---

## Batch 7b — Chain-of-custody PDF · **Khalid** · ~0.4d

**Depends on:** 0a (the `CustodyBatch` model). Pure render — no UI.

**Create**
- `packages/pdf/src/templates/custody.tsx`
- `apps/agent/src/app/api/documents/custody/[batchId]/route.ts`

**Steps**
1. Template alongside the three existing ones, same `theme.ts`, same shape.
   Contents: batch no, agent, facility, per-pickup lines, total weight + count,
   GPS, timestamp, receiving staff.
2. Route follows the **Batch 8 document pattern exactly**: ownership-scoped read,
   then **stream the bytes**. Do not mint a signed URL (that's for photos, which
   need a URL for `<img>`).
3. Generate lazily on first download, then cache. **`pdfUrl` holds a storage
   PATH, not a URL** — same as every other document in this repo.
4. Derive the batch number the way `certificateNumber` / `invoiceNumber` are
   derived in `packages/core/src/documents.ts` — no new column.

**Done when**
- [ ] The PDF renders for a seeded batch
- [ ] Another agent's batch is rejected
- [ ] Second download serves the cached copy
- [x] Route in `smoke.mjs` — as its own `appName === 'agent'` document block,
      **not** in `DOCUMENT_ROUTES`. That array sits inside the `isCustomer` gate
      and is fetched against :3000, so the agent route would never run there.
      This line predates the two-app split. `npm run smoke -- --app=agent` green.

---

## Batch 8 — Track, history, profile · **Aamir** · ~0.75d ✅ DONE 2026-08-24

**Depends on:** 0a (seeded data — **not** on C's batches).

**Create**
- `apps/agent/src/app/(agent)/pickups/page.tsx` · `pickups/[id]/page.tsx` ·
  `pickups/[id]/map/page.tsx`
- `apps/agent/src/app/(agent)/history/page.tsx` · `history/[id]/page.tsx`
- `apps/agent/src/app/(agent)/profile/page.tsx`

**Edit**
- `supabase/policies.sql`

**Steps**
1. `/pickups` — active jobs with a bulk drop-off shortcut.
2. `/pickups/[id]` — **render `lifecycle-view.tsx` from `@clbipp/ui`**
   (`buildStages`, `LifecycleHeader`). Do **not** write the wireframe's
   Collected → Transit → Warehouse → Refurb/QA → Done timeline; that vocabulary
   doesn't exist (D5/W4). Add the "your role ends at drop-off" lock banner.
3. **Realtime:** ⚠ RLS on `status_events` is vendor-scoped, so an agent's browser
   subscription **silently receives nothing**. Add an agent-scoped SELECT policy
   to `supabase/policies.sql` (~6 lines, mirroring the vendor one but joining on
   `pickups.agent_id`), then use `subscribeToPickupEvents`. Prototyping in the
   dashboard is fine — **the final version must land in the repo file.**
4. Map — Leaflet + OSM, static. No turn-by-turn (D4).
5. History — filterable, and **rows link to a real detail view** (the wireframe's
   link to themselves).
6. Profile — wallet balance, earnings from `WalletTxn`, stats, read-only
   safety-training status from `safetyTrainedAt`, sign out. **Delete "Cash out"
   and "Notifications" unless you have time to make them work** — dead buttons
   are worse than absent ones.

**Done when**
- [x] Timeline renders through the shared component, not a local copy
- [~] An agent receives a realtime ping on their own pickup's new event — **the
  RLS half is proved** (an agent JWT now reads 44 `status_events` where it read
  0; see "as built"). The browser ping itself needs two devices and is in
  `MANUAL_TEST_QUEUE.md`.
- [x] The new polic**ies** are in `supabase/policies.sql` — **two, not one.**
  Read the "as built" section below before touching them.
- [x] History rows open a real detail view (`/pickups/[id]`)
- [x] Wallet balance matches the sum of the agent's `WalletTxn` rows
- [x] Routes in `smoke.mjs`, `npm run smoke` green (agent 28/28, customer 46/46)

---

## Batch 9 — Deploy + verification · **Khalid**, then all three · ~0.5d

**Depends on:** everything.

**Steps**
1. New Vercel project for `apps/agent`, GitHub-synced. **Build command must go
   through turbo** — the generated Prisma client is gitignored.
2. Env vars + Supabase redirect URLs for the new domain. Follow
   `docs/DEPLOY.md` and `docs/HANDOVER_KHALID_2026-08-12.md` — same shape as the
   customer app.
3. `npm run build && npm run test && npm run smoke` for **both** apps.
4. **Then all three, together — the one manual pass**, on a real handset:
   - Customer books → agent sees it assigned → arrives → safety checklist →
     confirms items → quote → presents offer → **customer accepts on a second
     device** → agent collects → hub drop-off → both apps show the right state.
   - That cross-app hop is the part no automated check covers. Do it last, do it
     properly, and do it with time left to fix what it finds.

**Done when**
- [ ] Both apps deployed and reachable
- [ ] `agent@test` cannot enter the customer app, and vice versa
- [ ] The full two-device journey above completes
- [ ] Any gaps found are written down, owner named, before anyone goes home

---

## If the week slips

Cut in this order, and **say so in the group chat** — a decided cut is fine, a
half-finished batch is not:

1. Batch 8 extras — map, then history detail, then wallet cash-out
2. QR scan (Batch 3)
3. HOLD / REVIEW branches (Batch 5a)

**Batches 0–7 minus those are the demo path and cannot be cut.**

---

## Batch 0b — as built (2026-08-20, Aamir)

Read this before Batch 1. The batch shipped as specified; the notes below are
the decisions taken inside it, the four deviations, and what the next person
needs from it.

### What exists now

`apps/agent` is a full app, not a scaffold: Tailwind v4 + PostCSS, ESLint, the
Prisma-engine prebuild, its own `.env.local`, and `dev` on **port 3001** (root
script `npm run dev:agent`, so both apps run side by side).

| Thing | Where |
|---|---|
| Auth guard | `apps/agent/src/proxy.ts` — `allowRoles: ['agent']`, `homePath: '/'`, no `onboardingPath` |
| Root layout | `apps/agent/src/app/layout.tsx` — same three fonts as the customer app, **no service worker** (PWA is Batch 8) |
| Design tokens | `apps/agent/src/app/globals.css` — byte-copy of the customer's, incl. the `@source` line that stops Tailwind purging `packages/ui` |
| Nav shell | `apps/agent/src/app/(agent)/layout.tsx` + `apps/agent/src/components/agent-tab-bar.tsx` |
| Login | `apps/agent/src/app/(auth)/login/{page.tsx,actions.ts}` + `(auth)/field.tsx` |
| 22 stubs | `apps/agent/src/app/(agent)/**/page.tsx` |

### Four deviations from the steps above

1. **The bottom tab bar is local to `apps/agent`, not `@clbipp/ui`.**
   `BottomTabBar` in `packages/ui` hardcodes the *customer's* four destinations.
   Parameterising it would be DRY-er but `packages/ui` is lane C — a straddle
   needing flag → agree → log. `CLAUDE.md` puts the nav shell in lane A, so the
   agent bar is `apps/agent/src/components/agent-tab-bar.tsx`. Tabs are
   Home `/` · Pickups `/pickups` · History `/history` · Profile `/profile`.
   **Post-sprint (lane C): fold both into one `tabs`-prop component.**

2. **The `…/result*` screens live under `items/[itemId]`.** §2 of the plan
   writes them as `…/result`, which leaves the parent ambiguous. The engine runs
   **per item** (D1), so the full paths are
   `/job/[id]/items/[itemId]/result{,/breakdown,/why}`.

3. **The Prisma-engine prebuild shipped now**, in the scaffold, rather than
   waiting for the first screen that queries. Same script and
   `outputFileTracingIncludes` as the customer app. Without it every Prisma
   query 500s on Vercel while the build stays green (confirmed 2026-08-15) —
   cheaper here than inside Batch 9. **Khalid: `apps/agent` therefore needs its
   own Vercel project and the same env vars.**

4. **`scripts/smoke.mjs` grew a `--app=` switch** rather than a second file.
   Per-app config is the `APPS` map near the top; the customer-only sections
   (documents, CSV export, public `/t/` tracking, the `/onboarding` probes) are
   gated on `app === 'customer'` rather than given empty tables — an assertion
   over an empty table passes vacuously.

   ⚠ One behaviour change to the **customer** run: the summary total was
   undercounting by one (it never counted `OFFER_SURVIVED_GET`). It now reads
   `45`, not `44`. Same probes, corrected count.

### Traps for whoever writes the next agent screen

- 🔴 **Every screen under `(agent)` must pass `hideNav` to `AppShell`.** The
  layout renders the nav; `AppShell`'s built-in bar is the *customer's*. Forget
  it and you get two bars — `npm run smoke` counts `aria-label="Main navigation"`
  and fails on anything but exactly one.
- **Pages add no bottom padding.** `(agent)/layout.tsx` owns the clearance. This
  is the bug customer Batch 6.5 fixed.
- **The pickup ids in the agent smoke tables are placeholders**
  (`PKP-2026-000102`, `PKP-2026-000103`, and two synthetic uuids for item and
  batch). They 200 today only because the stubs query nothing. **Khalid's Batch
  0a must assign `agentId` to those pickups, or re-point the constants** —
  `AGENT_PICKUP` / `AGENT_ARRIVED` / `AGENT_ITEM` / `AGENT_BATCH` in
  `scripts/smoke.mjs`. The failure surfaces the moment Batch 1 makes
  `/job/[id]` real.
- **Agent smoke content assertions are stub headings** and are meant to be
  replaced batch by batch with real screen content. A heading is a weak
  assertion.

### One thing worth knowing about the guard

A flaky connection makes `npm run smoke` report `BOUNCED TO LOGIN` on routes
that are fine. `supabase.auth.getUser()` in `packages/auth/src/middleware.ts`
**fails closed** — a DNS blip returns `user: null` and every authenticated route
bounces. That is deliberate (you cannot admit a request whose user you could not
verify) and survivable (nothing calls `signOut()` on that path, so a retry
works), and it is now commented in the factory. Seen for real on 2026-08-20 on a
cold dev server: **check the dev-server log for `getaddrinfo ENOTFOUND` before
hunting a guard bug.**

### Deferred out of this batch, on purpose

- PWA / offline — `ServiceWorkerRegister`, manifest, icons. Batch 8. Registering
  a service worker now would cache the scaffold and serve it over real screens.
- No `loading.tsx` anywhere yet — add per screen as real data lands, as the
  customer app did.
- `(auth)/field.tsx` is now duplicated in both apps. Same TODO as the customer's:
  swap for C's real `<Input>` when it ships, in both at once.

---

## Batch 0a — as built (2026-08-21, Aamir)

Read this before Batch 1 (A) and before Batch 4 (B). The batch shipped as
specified; below are the two deviations, the live incident it ran into, and the
contract the next person inherits.

### What exists now

| Thing | Where |
|---|---|
| The migration | `packages/database/prisma/migrations/20260821150142_agent_app_v1/` |
| Schema delta | §3 of the plan, in full — `Pickup.agentFeePaise` + `custodyBatchId`, `Offer.acceptedAt`, `BatteryItem`'s damage rubric + `pathway` + `traceId`, `WalletTxnKind.agent_fee`, new `CustodyBatch` |
| RLS | `supabase/policies.sql` — `custody_batches` **plus six engine tables** (see deviation 2) |
| Seed | `packages/database/prisma/reset-demo.ts` — `MarketPrices`, mixed-chemistry intake jobs, deterministic item ids, one `CustodyBatch`, agent fees, offer acceptance |
| Smoke ids | `scripts/smoke.mjs` — all four agent constants are now real seeded rows |

The nine-stage lifecycle is **unchanged**; the migration adds no `PickupStatus`
value, and a seeded assertion checks the enum still has exactly 9 + `cancelled`.

### Two deviations from §3

1. **`PathwayDecision.traceId` was added too** (`String? @unique`). §3 gives
   `BatteryItem.traceId` as "links to PathwayDecision", but `PathwayDecision`
   had no such column — only a uuid `id` — while the engine mints its own
   `TRC-YYYY-NNNN` in `decisionEngine/layers/intake.ts:110`. As literally
   specified the link was a dangling string. Added here rather than in Batch 4
   so the sprint needs only one migration. **Khalid: the join you want exists.**

2. **RLS was closed on six pre-existing engine tables** — `market_prices`,
   `pathway_factors`, `pathway_decisions`, `battery_packs`,
   `battery_inspections`, `battery_diagnostics`. RLS had never been enabled on
   any of them, so our pricing internals (market rates, cost factors, every
   computed P_min/P_max) were readable over PostgREST by **any** logged-in
   session, a vendor's included — the exact inverse of the vendor-visibility
   rule. Enabled with no policy, which denies `authenticated` and admits only
   the service role. **Zero behaviour change**: nothing in either app reads
   these through a Supabase client, only through Prisma, which connects as the
   table owner and bypasses RLS. Verified end-to-end — a real vendor session
   now gets `200 []` from `/rest/v1/market_prices`.

### 🔴 The incident — read this one

Mid-batch, `npm run reset-demo` failed with *"No profile for business@test"*.
The shared Supabase project had lost **every row in `public.profiles`** (all 36
`auth.users` rows were intact) **and every `GRANT` on schema `public`**. Neither
was caused by this batch: the migration is additive-only and `wipe()` deletes
two hard-coded uuids. Most likely a destructive run against the shared project
by someone else between 2026-08-20 and 2026-08-21.

Three things came out of it, and all three matter more than the batch itself:

- **`npm run reset-demo` no longer requires a pre-existing profile.** It used to
  throw "log in once to create it" for `business@test` while creating the agent
  and admin accounts itself. It now creates all three via `ensureAuthUser`, so a
  reseed is self-sufficient from a wiped database. `CUSTOMER_PASSWORD` is kept
  separate from `DEMO_PASSWORD` (`businesstest` vs `demo1234`) because
  `scripts/smoke.mjs` signs in with the former; `ensureAuthUser` creates first
  and only looks up on failure, so an existing user's password is never rewritten.

- 🔴 **`reset-demo` does NOT restore grants or policies. Reseeding is not
  recovery.** With the grants gone, the symptom was *not* an obvious failure:
  the app half-worked. Prisma-backed pages rendered fine, Supabase-client pages
  rendered **empty with a 200**, API routes 401'd, and `/onboarding` let a fully
  onboarded session through — because `middleware.ts` deliberately fails **open**
  on an infrastructure error (`42501`), and "permission denied for schema
  public" is one. `npm run smoke` read 18/45 failed with no single obvious cause.
  If you ever see that shape again, check grants **first**:

  ```bash
  cd packages/database
  npx prisma db execute --file ../../supabase/grants.sql   --schema prisma/schema.prisma  # order matters
  npx prisma db execute --file ../../supabase/policies.sql --schema prisma/schema.prisma
  npx prisma db execute --file ../../supabase/storage-policies.sql --schema prisma/schema.prisma
  npx prisma db execute --file ../../supabase/realtime.sql --schema prisma/schema.prisma
  ```
  All four are re-runnable. `grants.sql` must go first — it says so in its own
  header, and that is exactly the step that was missing.

- **The database had no Prisma migration history.** `_prisma_migrations` was
  empty, so `migrate deploy` refused with `P3005`. Confirmed the live schema was
  byte-identical to migration 8 (`migrate diff` against the datasource returned
  precisely the agent_app_v1 delta and nothing else), then baselined the eight
  prior migrations with `migrate resolve --applied` before deploying. **History
  is now tracked** — the next migration is an ordinary `migrate deploy`.

  ⚠ `prisma migrate dev` cannot run in a non-interactive shell (it needs to
  prompt). The scriptable equivalent used here was `migrate diff` → write the
  migration file → `migrate deploy`.

### The seeded-id contract (new — `smoke.mjs` depends on it)

Demo rows now have derivable ids, the same trick `demoPublicToken` already used
and for the same reason: `@default(uuid())` changed on every reseed, so the
agent app's `/job/[id]/items/[itemId]/…` routes — half its route table — had
nothing stable to point at.

| Constant | Value | Minted by |
|---|---|---|
| `AGENT_PICKUP` | `PKP-2026-000102` (`scheduled`) | `PICKUPS` fixture |
| `AGENT_ARRIVED` | `PKP-2026-000103` (`arrived`) | `PICKUPS` fixture |
| `AGENT_ITEM` | `00000000-0000-4000-8000-000000102001` | `demoItemId(pickupId, idx)` |
| `AGENT_BATCH` | `00000000-0000-4000-8000-000000000301` | `CUSTODY_BATCH_ID` |

`demoItemId` = 3 padding zeros + the pickup's 6-digit serial + a 1-based 3-digit
item index. **Change either file and the other must change with it.** Real rows
keep the column defaults — this is demo-only.

### What the seed now guarantees

- `agent@test` has a pickup at **each** of `scheduled`, `arrived`, `offered`,
  `collected`, and four beyond it.
- `PKP-2026-000102` and `PKP-2026-000103` each carry **3 items across 2
  categories, mixing a li-ion and a lead-acid chemistry**. That is deliberate
  and load-bearing: a single-chemistry job never exercises the "no mixed
  chemistry" safety item (Batch 2) or the per-item engine run (D1). **Don't
  simplify them back.**
- One `MarketPrices` row (demo placeholders, `updatedAt` at reseed time so an
  old reseed doesn't silently degrade every quote), one `Facility`, one
  `CustodyBatch` (`CB-2026-000301`).
- **`Offer.acceptedAt` encodes the D7 state machine**: every offer at
  `collected` or beyond is accepted; the one pickup sitting *at* `offered` is
  deliberately **not** — that null is the live "awaiting the vendor" state
  Batch 5b writes and Batch 6 reads. Don't "fix" it.
- **"Pending drop-off" is derived, not a stage** (D5): the one `collected`
  pickup has `custodyBatchId: null`; the four beyond it point at the batch.
- Every agent-assigned pickup has a non-null `agentFeePaise`.

### Flagged for later — none of these block anyone

1. 🔴 **Batch 2's chemistry-aware safety checklist has nothing to read.**
   `BatteryItem`'s customer-declared half has `category` but **no chemistry** —
   the agent tags chemistry on site in Batch 3, *after* the checklist is meant to
   gate intake. So "show lithium items only when the pickup has a li-ion item"
   cannot be answered from declared data. **Decide this at the top of Batch 2**:
   a heuristic on `category` (`ev`/`portable` ⇒ treat as li-ion), or show every
   item and let the agent tick N/A. Not resolvable in 0a.
2. **`agentFeePaise` is seeded at a flat 10%** of the indicative quote. The real
   rule is D3, in Batch 4. 🔴 That change **moves a number on the agent's home
   screen** ("earned today") — say so in the commit, per the silent-economics-
   drift rule.
3. **`CustodyBatch` has no `publicToken`**, unlike `PickupReceipt` and
   `Certificate`. §3 didn't ask for one and Batch 7b's PDF is agent-facing, so
   it's out — but a shareable custody link later means a second migration.
4. **Drop-off is agent-attested only.** `receivingStaffName` + a signature is
   the weakest link in the chain of custody until there's a hub-staff app —
   open question 3 in §7 of the plan.
5. **The `prisma db execute` route can't print query results**, so the RLS and
   seed assertions were run through a throwaway `tsx` script (not committed).
   Re-create it from the "Done when" list if you need to re-verify.

---

## Batch 1 — as built (2026-08-22, Aamir)

Read this before Batch 2 (A) and Batch 3 (C). The batch shipped as specified;
below are the deviations, the pattern C is meant to copy, and one live issue
that belongs to someone else.

### What exists now

| Thing | Where |
|---|---|
| Day view | `apps/agent/src/app/(agent)/page.tsx` |
| Job detail | `apps/agent/src/app/(agent)/job/[id]/page.tsx` |
| `scheduled → arrived` | `apps/agent/src/app/(agent)/job/[id]/actions.ts` |
| Row → destination routing | `apps/agent/src/lib/job-nav.ts` |
| Content assertions | `scripts/smoke.mjs` → `AGENT_APP_CONTENT` |

### 📌 `actions.ts` is the pattern — copy it, don't reinvent it

C's Batch 3 and every later agent write should copy the shape of
`markArrived` / `markArrivedAndContinue`. Four things make it the shape:

1. **Caller identity comes from the session**, never from the form. A form field
   is attacker-controlled; using it would make the ownership check compare the
   request against itself.
2. **The write uses `createAdminClient()`** — there are no agent-scoped RLS
   policies on `pickups`, and only the service role may write `status_events`
   (D10).
3. **Therefore the action re-verifies `agent_id === user.id` itself.** That line
   is standing in for a policy. This is verified adversarially, not just by
   reading it: a POST carrying another pickup's id, using an action id harvested
   from a job the agent *does* own, is turned away with
   `This job is not assigned to you.` and writes nothing.
4. **Status and event are written together.** `pickups.status` is a denormalised
   cache of the event log; drift is invisible until a timeline renders wrong.

Plus: it is a **POST form action, not a `<Link>`**, and it is **idempotent** —
a re-tap re-runs the whole thing, writes no duplicate event, doesn't go
backwards, and still routes onward. A field agent on one bar of signal taps
twice; that must not be an error.

### Deviations from the plan

1. **The wireframe's offline banner is deferred to Batch 8.** It has nothing to
   read until the PWA/offline queue exists, and a hard-coded "2 items queued"
   would be a lie on the screen. A `TODO (Batch 8)` marks the spot.
2. **The "resumable draft" row is derived, not stored** (D5). An `arrived` job
   *is* the resumable one; `jobNextStep()` labels it "Resume — safety checklist,
   then intake" and `jobHref()` routes it to `/job/[id]/safety`. Real per-item
   draft state arrives with C's Batch 3.
3. **Two lines of `reset-demo.ts` were edited** (B's file — logged in
   `LANE_OWNERSHIP.md`). The stats are date-bounded to today, and no seeded row
   was dated today, so a fresh seed rendered `0 / 0 / ₹0`. Now: the agent's live
   jobs get a `scheduledSlot` of today, and the one `collected` pickup moved to
   `daysAgo: 4` so its `collected` event lands today.
   ⚠ **`daysAgo: 4` is a floor, not a preference.** Event dates are derived as
   `day(daysAgo - i)` over the stage list, so anything lower future-dates that
   pickup's own events.

### 🔴 Not this batch's, but it will bite you

`npm run smoke` reports **3 failures against `npm run dev`** — the three
`/api/documents/{certificate,receipt,invoice}/…` routes return Next's own HTML
404 instead of a PDF. It is **45/45 against the production build**
(`npm run build`, then `npx next start` in `apps/customer`), and it reproduces
at clean `HEAD` with this batch stashed. Almost certainly Turbopack dev failing
to match the doubly-nested dynamic API route `api/documents/[kind]/[id]`.

**Until it's understood, smoke the customer app against a production build
before pushing.** Owner: Khalid (PDF templates + deploy).

### For Batch 2 — the chemistry problem is still open

Batch 0a flagged that `BatteryItem` has `category` but **no chemistry** on the
customer-declared half, so "show lithium items only when the pickup has a li-ion
item" can't be answered from declared data. Batch 1 changed nothing here — job
detail renders `category` and `condition` only. **Still the first decision of
Batch 2.**

Job detail already reads `pickup.safetyChecklist` and renders a completed-state
banner plus a "Continue to intake" button when `passed` is true, so Batch 2 only
has to write the row — the job screen's half of step 4 is done.

### Verification worth re-running

`packages/database/prisma/verify-batch1.ts` was written for the "Done when" list
and is **not committed** (same convention as Batch 0a's assertion script). It
logs in as `agent@test`, harvests the server-action id from the job page, drives
`Arrived` over HTTP, and asserts the write, the idempotency and the ownership
guard — then restores `PKP-2026-000102` to `scheduled` so it is re-runnable.
Recreate it from the checklist above if you need it.

---

## Batch 2 — as built (2026-08-23, Aamir)

Read this before Batch 3 (C). The batch shipped as specified; below are the one
real bug it uncovered, the line that must survive Ali's rewrite, the deviations,
and what is deliberately left for later.

### What exists now

| Thing | Where |
|---|---|
| Checklist catalogue + rules (pure, tested) | `packages/core/src/safety.ts` |
| 20 tests | `packages/core/src/safety.test.ts` |
| Checklist screen | `apps/agent/src/app/(agent)/job/[id]/safety/page.tsx` |
| The form (client, lithium toggle only) | `…/safety/SafetyChecklistForm.tsx` |
| The write | `…/safety/actions.ts` |
| 🔴 **The intake gate** | `apps/agent/src/lib/safety-gate.ts` |
| Seeded passing checklists (`arrived`+) | `packages/database/prisma/reset-demo.ts` |
| Gate asserted both directions | `scripts/smoke.mjs` → `AGENT_ITEMS_GATE` |

### 🔴 ALI — one line in your file must survive Batch 3

`apps/agent/src/app/(agent)/job/[id]/items/page.tsx` now calls:

```ts
await requireSafetyChecklist(id, user.id)
```

That call **is** the mandatory gate. Everything else about this feature is
presentation. Delete it and intake silently stops being gated: every screen
still works, the checklist still saves, and the only change is that an agent can
start handling batteries without confirming it is safe to.

It also enforces ownership and **throws** rather than returning a boolean, so
once it has run you may treat the pickup as this agent's — you don't need a
separate check. There is a long comment block at the top of that file and the
full rationale in `safety-gate.ts`.

**Extend it to your other screens.** `/items/[itemId]`, `/damage`, `/scan` and
`/collect` are all downstream of the gate and none of them call it yet — this
batch only wired the entry point. One indexed read each.

`scripts/smoke.mjs` fails if the gate goes missing from `/items`, but note the
📌 **BATCH 3 MAINTENANCE** comment next to `AGENT_ITEMS_GATE`: its two assertion
strings come from the stub you are about to replace, and must be swapped for
text only your built screen renders — otherwise it passes by asserting the
absence of text that no longer exists anywhere (the Batch 10 vacuous-assertion
lesson).

### 🔴 The bug this batch found — it will bite Batches 3, 5b, 6 and 7a

**Prisma's `@default(uuid())` does not apply to a service-role write.**

`SafetyChecklist.id` is `@id @default(uuid())` in `schema.prisma`, but the
migration created the column as plain `TEXT NOT NULL` with **no database
default**. That default is applied by the *Prisma client*. Agent actions write
through `createAdminClient()` (Supabase/PostgREST), which never goes near
Prisma — so the insert failed with:

```
null value in column "id" of relation "safety_checklists" violates not-null constraint
```

The id is now generated in the action with `crypto.randomUUID()`.

⚠ **Batch 1's `status_events` insert gets away with omitting its id only because
that column is `BIGSERIAL` — a real database default. Do not generalise from
it.** Every uuid-keyed table written through the service role needs the id
supplied in code. Check the migration, not `schema.prisma`.

### Design decisions taken

1. **The chemistry problem is resolved by asking the agent.** `BatteryItem.chemistry`
   is in the agent-confirmed half of the model and is null until intake — the
   screen this one gates — so the plan's "show lithium items only when the pickup
   has a li-ion item" names a field that cannot be read at this point in the
   flow. The screen asks instead, defaulting the toggle from the declared
   category and recording `lithiumBasis` in the row so the audit trail says
   which it was.

   **The five HR-named items are unconditionally required.** Nothing the agent
   or a heuristic does can remove one — the conditional logic only ever *adds*.
   That direction is the whole safety argument, and `safety.test.ts` asserts it
   across every flag combination.

   ⚠ `lithiumLikelyFromCategories` is a **denylist** (`automotive` is the only
   assumed-lead-acid category), not an allowlist. Written the other way, an
   unrecognised category — a new enum value, a typo — would read as "no lithium"
   and silently drop the fire-safety items. This was caught by a test during the
   batch, having been written wrong the first time.

2. **A failing checklist is recorded, not discarded.** `passed: false` is
   written, intake stays blocked, and the agent gets the outstanding items back
   with their previous ticks pre-filled. A compliance checklist whose whole
   purpose is finding hazards should not throw away the finding.

3. **A third, condition-derived item** (`damagedUnitsContained`) appears when the
   customer declared a `swollen` or `leaking` line. Unlike `chemistry`,
   `condition` *is* customer-declared and reliable here. `PKP-2026-000102` has a
   leaking line, so the demo exercises it.

4. **The safety screen is NOT gated on `arrived`** — ownership is checked, the
   stage is not. Filling a checklist writes no lifecycle state, and a stage gate
   would trap an agent who tapped back out of intake.

5. **No `status_events` row and no lifecycle transition.** A safety checklist is
   not a stage; the nine are locked. It gates intake by its existence.

### Deviations from the plan

1. **A third file was added** — `packages/core/src/safety.ts` + tests, against
   the task sheet's two-file list. Agreed before starting. The pass/fail rule is
   the thing most worth testing, apps hold no tests, and the admin app and Batch
   7b's PDF will need to describe a checklist they didn't render.
2. **Two cross-lane edits**, both logged in `docs/LANE_OWNERSHIP.md`: one line in
   Ali's `items/page.tsx` (the gate — the task sheet's step 3 puts it there), and
   a seed block in Khalid's `reset-demo.ts`.
3. **`packages/database` restates the checklist JSON shape** rather than
   importing it, because it must not depend on `packages/core` (the cycle breaks
   the generated client) — the same restatement the CO₂e factors already live
   with. Batch 9's verification is where the two should be compared.

### Seed change — this one unblocks Ali

Every pickup at `arrived` or beyond now gets a **passing** `SafetyChecklist`,
because the lifecycle implies it: the check is mandatory before any battery is
handled, so a pickup that got assessed necessarily passed one.

⚠ **`PKP-2026-000102` deliberately gets none.** It is the `scheduled` intake demo
job, it must arrive at the checklist un-done, and it is what smoke asserts the
gate rejects. **`PKP-2026-000103` is the paired admit case** — it has a passing
row, so `/job/PKP-2026-000103/items` renders and **Batch 3 has a job past the
gate to build against.** Without it, every intake route Ali builds would redirect
away.

### ⚠ Wording provenance — needs HR confirmation

The five always-required items are HR-named. The three conditional ones
(`lithiumStateOfCharge`, `lithiumDamagedCellsIsolated`, `damagedUnitsContained`)
are **our wording** — defensible battery-handling practice, but not quoted from
anything the company sent. Same standing as the placeholder factors in
`packages/core/src/impact.ts`; the file header says so. **Add to the open
questions in `COMPANY_FLOW_REVIEW_2026-08-07.md`.** Their answer is a text change
in one file.

### Deliberately not in this batch

- **Hazard escalation.** A failed checklist blocks this agent but notifies
  nobody — there is no admin surface to send it to. `TODO` in `actions.ts`.
  Pairs with the plan's existing note that the HOLD verdict's "Escalate to
  admin" must also do something (Batch 5a).
- **Photo evidence on the checklist** — HR doesn't ask for it; camera work lands
  with Batch 6.
- **`Profile.safetyTrainedAt`** read-only display — Batch 8 (D6).
- **Gating the downstream intake screens** — see the Ali note above.

### Testing notes for the end-of-sprint manual pass

Everything below is verified programmatically already; these are the things
worth *looking at* on a real phone when the app is finished.

1. `/job/PKP-2026-000102/safety` — the lithium toggle. Tap No; the two li-ion
   rows disappear and the five HR rows stay. Tap Yes; they come back.
2. Submit with two items ticked. Check the red banner names exactly what is
   outstanding, and that the two you ticked are still ticked.
3. Complete it. You land on `/items`. Go back to `/safety` — it should show the
   completed state with "Redo the checklist" collapsed, not a blank form.
4. Type `/job/PKP-2026-000102/items` into the URL bar before completing the
   checklist. It must bounce to `/safety`.
5. Checkbox tap targets with gloves on — rows are 44px, but worth a real check.
6. `/job/PKP-2026-000103/safety` — the seeded completed state.

### Verification worth re-running

`packages/database/prisma/verify-batch2.ts` was written for the "Done when" list
and is **not committed** (same convention as Batches 0a and 1). It drove all 15
checks over HTTP as `agent@test` and restored `PKP-2026-000102` afterwards.

📌 **If you recreate it — or write one for your own batch — the server-action
POST must be `multipart/form-data`.** The rendered form is
`encType="multipart/form-data"`, and that is the only encoding Next's no-JS
progressive-enhancement path parses the `$ACTION_ID_<id>` field out of. A
urlencoded body is **silently ignored**: the POST returns 200 with the page
re-rendered and writes nothing, which looks exactly like a broken action. Adding
a `Next-Action` header instead switches Next to the JS-driven RSC protocol, which
wants a different body again. Pass a `FormData` to `fetch` and let it set the
boundary. This cost ~20 minutes.

---

## Batch 3 — as built (2026-08-23, Aamir · Ali's lane)

Read this before Batch 5a. The batch shipped as specified except where the steps
contradicted themselves or the schema — those are the four deviations below, all
agreed before building.

### Why Aamir and not Ali

Batch 3 is the critical path: 5a, 6 and 7a all depend on it, and the week ends
2026-08-27. Taken over under the do-it-and-note-it policy (2026-08-20) rather
than waiting. Logged in `docs/LANE_OWNERSHIP.md`. **Ali still owns 5a, 6 and 7a**
and every screen below is written to be extended, not replaced.

### What exists now

| Thing | Where |
|---|---|
| Chemistry catalogue, condition catalogue, confirmation rules (pure, tested) | `packages/core/src/intake.ts` |
| 39 tests | `packages/core/src/intake.test.ts` |
| Item list — the spine | `apps/agent/src/app/(agent)/job/[id]/items/page.tsx` |
| Per-item confirm | `…/items/[itemId]/page.tsx` |
| The form (client, photos + live branch hint) | `…/items/[itemId]/ItemConfirmForm.tsx` |
| The write | `…/items/actions.ts` |
| 🔴 **The D1 branch as a URL** | `apps/agent/src/lib/job-nav.ts` → `itemNextHref` |
| Honest deferral of QR scan, gated | `…/job/[id]/scan/page.tsx` |
| Gate asserted on 3 routes, both directions | `scripts/smoke.mjs` → `AGENT_ITEMS_GATE` |

### 🔴 ALI — the one line that flips this into your batch

`items/actions.ts` ends with a redirect back to the item **list**:

```ts
redirect(`${listPath}?confirmed=${encodeURIComponent(itemId)}`)
```

When your rubric and result screens exist, that becomes:

```ts
redirect(itemNextHref(pickupId, itemId, value.chemistry))
```

`itemNextHref` already computes the D1 destination (li-ion → `/damage`,
everything else → `/result`) and both screens already render it as a link, so
the branch is live and asserted today — it just doesn't *redirect* into a stub.
**Don't re-derive the branch in your screens.** `isLithium` from
`@clbipp/core/intake` is its one home, and `api/quote/route.ts` was pointed at it
in this batch precisely so a second list can't drift.

### 🔴 Two things that must survive Batch 5a

1. **`requireSafetyChecklist` now runs on three screens** — `/items`,
   `/items/[itemId]` and `/scan` — not just the entry point. Batch 2 only wired
   the first and left a note asking for the rest; this is the rest, for the
   screens that existed. **`/damage`, `/computing`, `/result*` and `/collect` are
   still ungated stubs.** Add the two lines when you build them:

   ```ts
   const { data: { user } } = await createClient().auth.getUser()
   await requireSafetyChecklist(id, user.id)
   ```

   It enforces ownership as well as the checklist and it *throws*, so once it has
   run you may treat the pickup as this agent's with no further check.

2. **Ownership on an item read is TWO checks, not one.** The gate proves the
   *pickup* is this agent's; a `pickupId` filter on the item read proves the
   *item* belongs to that pickup. Every screen and the action do both. Without
   the second, an agent can open their own job's URL carrying another job's item
   id — the item id is a bare uuid and nothing else constrains it. Verified by a
   scripted forged-id POST.

### The four deviations, and why

1. **Photos upload from the BROWSER, not through a service-role server action,
   through TWO inputs.**
   The steps above say the latter. Next's server actions cap the request body at
   **`serverActions.bodySizeLimit`, which defaults to 1 MB** and is not raised in
   either `next.config.ts`; `MAX_FILE_BYTES` is **5 MB**. Three photos of a
   leaking pack would fail at the framework boundary before Supabase saw them.
   The browser path needs **no policy change** — `pickup-photos` INSERT already
   checks `(storage.foldername(name))[1] = auth.uid()` and an agent is an
   authenticated user — and it is what the customer app's `StepItems.tsx` does.
   Only the PATHS cross into the server action, which re-checks the uid prefix
   (`photoPathsBelongTo`) because the service role bypasses RLS.

   > ⚠ Cost: photo capture needs JS. The rest of the form is uncontrolled inputs
   > and posts fine without it.
   >
   > 🔴 **Two inputs, not one** (added on review, same day). `capture="environment"`
   > opens the rear camera — but when `capture` is present the browser ignores
   > `multiple` **and offers no other way in**. A denied permission or a
   > locked-down handset would leave the agent unable to attach evidence at all,
   > and a damaged line cannot be confirmed without a photo. The second input
   > drops `capture`, restoring the ordinary picker as a fallback. Anything that
   > touches this control must keep both.

2. **The agent does NOT confirm `category`.** Step 2 lists it among the agent's
   fields *and* says never overwrite the customer-declared ones — and
   `BatteryItem` has **no `confirmedCategory` column**, so `category` *is* the
   declaration. It renders read-only. Chemistry is what drives the branch;
   category is a form factor. **A mis-declared category is now an open item** for
   the admin app — there is nowhere to record a correction. No migration.

3. **A photo is REQUIRED on a damaged line** (`swollen` / `leaking` / `dead`),
   optional otherwise. Not specified either way. That line is the one that gets
   argued about later and the agent is standing in front of it; a healthy line is
   not worth blocking a job over. `itemConfirmationState` returns a distinct
   `needs-photo` state so the screen can say *what* is missing rather than just
   "pending".

   > ⚠ **Wider than the safety checklist's damaged set, deliberately.** Safety
   > excludes `dead` because it needs no special handling; intake includes it
   > because it is a valuation claim. The two sets are not interchangeable and
   > `intake.test.ts` asserts the difference.

4. **Confirming returns to the item list, not into a Batch 5a stub.** See the
   Ali note above.

### Cross-lane edits, both logged

- `apps/agent/src/app/api/quote/route.ts` (Khalid, Batch 4) — its local
  `LI_ION_TYPES` array was replaced with `isLithium` from `@clbipp/core/intake`.
  Behaviour-identical; it removes a second copy of the D1 branch.
  **This moves no price.**
- `scripts/smoke.mjs` — see below.

### Smoke: the Batch 3 maintenance note came due

`AGENT_ITEMS_GATE`'s two strings were `'Items'` and `'Batch 3 · Ali'`, both from
the stub this batch deleted — the second **no longer exists anywhere in the
repo**, so it had already become a vacuous assertion. Replaced with text only the
built screens render, and **every one of those strings is now asserted
POSITIVELY on `PKP-2026-000103`** in `AGENT_APP_CONTENT`. That pairing is the
design: the same string must render on the admitted job and be absent on the
rejected one, so neither half can pass by accident. **If you change the copy on
these screens, change it in both places.**

The item-confirm routes also **moved from `PKP-2026-000102` to
`PKP-2026-000103`**. Once `/items/[itemId]` gained the gate, a route under 102
could only ever redirect, so render assertions there would have tested nothing.
102 keeps three routes as the reject half.

> ⚠ **React splits adjacent JSX expressions with `<!-- -->` in SSR output.**
> `{a} of {b} confirmed` is unassertable as one string; the running total is
> emitted as a single template literal for exactly this reason. Cost ~10 minutes.
> Check any new assertion string is contiguous in the rendered HTML.

### Design decisions taken

1. **Nothing is preselected in the chemistry picker.** Chemistry is the one thing
   the agent is on site to determine, and a pre-set control with no stated basis
   reads as fact — the same call the safety screen's lithium toggle documented.
2. **The weight field starts EMPTY**, with the declared weight beside it for
   comparison. Prefilling a number whose whole purpose is to record what the
   scale said gets it accepted unread.
3. **Condition defaults to the declaration.** Unlike category, it *has* its own
   confirmed column, so an override is non-destructive — both values survive.
4. **Re-confirming REPLACES the photo set rather than appending.** A corrected
   condition ("actually it's healthy") must not keep the photo of the leak that
   prompted the first attempt.
5. **An empty pickup is never "fully confirmed."** `intakeTotals` returns
   `allConfirmed: false` for zero lines — `0 === 0` would otherwise let Batch 5a
   raise an `Offer` for nothing.
6. **No lifecycle transition and no `status_events` row.** Intake happens
   entirely within `arrived`; the pickup moves to `offered` when 5a presents.
7. **QR scan deferred, honestly.** Step 5 says "last, only if there's time" and
   it is #2 on the cut list. `/scan` keeps its route, inherits the gate, and says
   plainly that manual entry is the primary path. **Nothing links to it** — a
   dead button is worse than an absent one.

### The uuid trap does NOT apply here — and that is not an oversight

Batch 2 found that Prisma's `@default(uuid())` is applied by the *Prisma client*,
so a service-role insert must generate its own id. **`confirmItem` only ever
UPDATEs** — `BatteryItem` rows are created by the customer at booking — so there
is no id to supply. Batches 5a (`Offer`, `PathwayDecision`), 6 (`PickupReceipt`,
`WalletTxn`) and 7a (`CustodyBatch`) all **insert**, and all still need
`crypto.randomUUID()`. Check the migration, not `schema.prisma`.

### Flagged for later — none of these block anyone

- **No way to record a mis-declared category** (deviation 2). Needs either a
  column or an admin-app correction flow. Not this sprint.
- **Removing a saved photo does not delete the object** from the bucket — it is
  still referenced by the stored row until the form is submitted, and an agent
  who taps remove then backs out must not find their evidence gone. Orphans are
  possible if they remove and then never submit. Cheap to sweep later; wrong to
  fix by deleting eagerly.
- **The chemistry catalogue's `help` text is ours, not HR's.** Same standing as
  the three conditional safety items and the CO₂e factors: defensible, unverified.
  Grouped with them in the open questions.
- **`packages/core/src/intake.ts` restates the `BatteryType` and
  `BatteryCondition` enum values** rather than importing them, because it must
  stay browser-safe. Nothing checks the two agree at build time — but the server
  action validates every submitted value against the restated list before
  writing, so drift fails closed at the write. **Batch 9's verification is where
  this should be compared**, alongside the CO₂e table.

### Testing notes for the end-of-sprint manual pass

All verified programmatically already. These are the things worth *looking at* on
a real handset:

1. `/job/PKP-2026-000103/items` — three lines, all Pending, "Quote unlocks once
   all 3 lines are confirmed". The quote button must not be there.
2. Assess line 1. Pick a chemistry — the branch hint under the picker should
   change between "goes through the damage rubric" and "priced straight off the
   rate card" as you switch between li-ion and lead-acid.
3. **Take a real photo with the rear camera** (`capture="environment"`). This is
   the only part of the batch that needs JS and the only part not covered by the
   scripted run. Watch it upload on mobile data, not wifi.
   **Then deny the camera permission and use "Choose existing"** — that button
   exists because `capture` leaves no other way in, and a damaged line cannot be
   confirmed without a photo, so a failed camera would otherwise be a dead end on
   site. Added 2026-08-23 after the batch, on review.
4. Line 2 is declared **swollen** — confirm it with no photo. It must come back
   as "Photo needed", the quote must stay locked, and the row must say why.
5. Confirm all three; the header should read "3 of 3 confirmed" and the weighed
   total should differ from the declared total. Both numbers must be labelled.
6. Go back into a confirmed line. The stored values appear in a card *above* the
   form, not pre-filled into it; the form is for re-recording.
7. Type `/job/PKP-2026-000102/items/00000000-0000-4000-8000-000000102001` into
   the URL bar. It must bounce to `/safety`.
8. Tap targets with gloves on — the chemistry and condition rows are 44px.

### Verification worth re-running

`verify-batch3.mjs` was written for the "Done when" list and is **not committed**
(same convention as Batches 0a, 1 and 2). 30 checks over HTTP as `agent@test`,
restoring `PKP-2026-000103` afterwards:

1. Three mixed lines confirm; the list reaches 3 of 3 and unlocks the quote.
2. 🔴 **Declared category/quantity/weight/condition/photos byte-identical before
   and after** — the load-bearing check of the whole batch.
3. Li-ion routes to `/damage`, lead-acid to `/result`, on both screens.
4. A forged item id from another pickup is rejected and that item is unchanged.
5. A photo path under another user's uid prefix is rejected, and nothing written.
6. Five validation cases: bad chemistry, bad condition, empty / zero / oversized
   weight.
7. Re-confirming overwrites, replaces the photo set, moves `recordedAt`, and
   writes no lifecycle transition.
8. A damaged line stripped of its photo drops back to 2 of 3 and re-locks the
   quote.

📌 **The POST must be `multipart/form-data`** and must carry the
`$ACTION_ID_<id>` field scraped from the rendered form — the Batch 2 lesson,
unchanged. A urlencoded body returns 200 with the page re-rendered and writes
nothing.

---

## Batch 5b — as built (2026-08-24, Aamir)

Read this before Batch 6 (C) — it changes what "the vendor accepted" means and
Batch 6's collect gate is built on it. Also read it before touching any customer
screen that switches on `status === 'offered'`.

### The one thing to take away

**`offered` is now two states, and only `Offer.acceptedAt` tells them apart.**

| `acceptedAt` | Means | Vendor screen |
|---|---|---|
| `null` | Awaiting the vendor's decision | `/offer` renders; `/handover` bounces to it |
| set | Accepted, awaiting the agent | `/handover` renders "Offer Accepted"; `/offer` bounces to it |

The status stays `offered` through both. `acceptOffer` no longer writes
`collected` — the agent app does, in Batch 6, from the field. That was the whole
of D7 and it is now live.

### Two steps were already done

The sheet's steps 2 and 3 above were shipped by the customer app's **Batch 12**,
before this sprint: `/handover` is already a pure read behind the
`acceptOfferAndConfirm` POST action, and it is already back in `smoke.mjs`
`ROUTES`. Nothing to do for either. What was left was step 1 plus the fan-out
below, which the sheet did not anticipate.

### What actually changed

| File | Change |
|---|---|
| `handover/actions.ts` | `acceptOffer` stamps `offers.accepted_at`, writes a `status_events` row, and **does not touch `pickups.status`**. Guard tightened from a pre-collection range to `status === 'offered'` exactly. Idempotent on re-submit — an already-accepted offer is not re-stamped. |
| `handover/page.tsx` | Guard keys on `offer.acceptedAt`, not a stage comparison. Two faces: "Offer Accepted" (timeline truncated at `offered`) and the original "Handover Confirmed" for `collected`+. |
| `offer/page.tsx`, `offer-breakdown/page.tsx` | New guard: an accepted offer redirects to `/handover`. **Both**, because they share `AcceptOfferButton` — one alone leaves a second accept path open. |
| `lib/pickup-nav.ts` | `pickupHref(status, id, offerAccepted = false)`. Callers `dashboard/page.tsx` and `history/page.tsx` now select `offer.acceptedAt`. |
| `track/[id]/page.tsx`, `t/[token]/page.tsx` | The `offered` banner branches on acceptance. The authenticated CTA becomes "View acceptance" → `/handover`. |
| `scheduled/page.tsx` | Same, for its "View Offer" button. |
| `packages/ui/.../lifecycle-view.tsx` | `buildStages` is **first-wins**, see below. |

### 🔴 The trap, and why the two guards are symmetrical

`/offer` redirects to `/handover` when `acceptedAt` is set; `/handover`
redirects to `/offer` when it is not. **Both must key on that same field.** Swap
either one back to a status range and the two screens redirect to each other
forever — there is no status that distinguishes them any more. There is a
comment saying so at the top of both files; leave it there.

### 🔴 `buildStages` changed from last-wins to first-wins

An accepted pickup now has **two `offered` status events** — the agent's offer
and the vendor's acceptance of it, because the acceptance advances nothing.
Last-wins relabelled the timeline's "Offered" row with the date it was
*accepted*, which is a different fact. It is now `!map[event.status]` guarded.

This is shared by `/track/[id]` and `/t/[token]`. It also nudges the known
"audit log can go backwards after a cancelled → requested reschedule" problem in
the right direction, but **does not fix it** — that stays open in
`LANE_OWNERSHIP.md`.

### Beyond the sheet: `acceptedAt` hygiene

`cancelPickup` and `reschedulePickup` (reactivation path only) now null out
`offers.accepted_at` via a shared `voidOfferAcceptance` helper. Once Batch 6
gates collection on that timestamp, an acceptance outliving its pickup is an
agent being sent to collect a load the vendor called off. This closes half of
loose end (1) in `CLAUDE.md`; the other half — reactivation keeping `agentId`
and `agentFeePaise` — is still open.

### 🔴 What Batch 6 needs from the seed, and does not have

**There is no seeded pickup at `offered` WITH `acceptedAt` set.** That is
deliberate — the seed comment on `PKP-2026-000104` says its null is the live
"awaiting the vendor" fixture and must not be "fixed" — but it means the accepted
branch of every screen above has **no permanent smoke assertion**, and Batch 6's
collect gate has nothing to render its admit path against.

Batch 6 should add an **eleventh pickup** at `offered`, assigned to `agent@test`,
with `acceptedAt` set. It was not added here because a new row shifts the
dashboard counts, "earned today" and the compliance export totals that other
smoke assertions already depend on — that is Batch 6's cost to pay, alongside
the gate it unblocks. Until then the state is verified by the throwaway script
below.

### Smoke changes

- `/track/PKP-2026-000104` added to `ROUTES` + `APP_CONTENT` — the *un*-accepted
  half, which the seed can express.
- 📌 `APP_REJECTS['/handover?id=PKP-2026-000104']` now asserts the absence of
  **both** `'Handover Confirmed'` and `'Offer Accepted'`. Asserting only the
  first would pass vacuously the moment the acceptance guard broke, because the
  page would render the *other* heading. Same lesson as Batch 10, one heading
  later. **If you add a third heading to that page, add it here too.**
- `OFFER_SURVIVED_GET` unchanged and still passing — no GET advances anything.

### Verification worth re-running

`seam-check.mjs`, **not committed** (same convention as Batches 0a, 1, 2 and 3).
15 checks over HTTP as `business@test`. It stamps `accepted_at` on
`PKP-2026-000104`, asserts the accepted branch everywhere, then restores the
fixture and re-checks that `/offer` is reachable again:

1. 🔴 The pickup status is **still `offered`** after acceptance — the load-bearing
   check of the whole batch.
2. `/handover` says "Offer Accepted", and never "have been collected".
3. `/offer` and `/offer-breakdown` both close — no Accept button, no price hero.
4. `/track` shows the accepted banner, the "View acceptance" CTA, and the
   acceptance entry in the custody log.
5. The timeline's Offered date is still the date the offer was **made**
   (first-wins). Worth noting the run that verified this had a genuine 3-day gap
   between the two — the assertion was not vacuous.
6. The dashboard row links an accepted pickup to `/track`, not back to `/offer`.
7. `accepted_at` is null again afterwards and the `status_events` count matches.

**Not covered by any script:** `voidOfferAcceptance` on cancel and on
reschedule-after-cancel. Both are server actions and need a real click-through —
they are in `docs/MANUAL_TEST_QUEUE.md`.

---

## Batch 8 — as built (2026-08-24, Aamir)

Read this before Batch 9, before touching `supabase/policies.sql`, and before
anyone writes another Realtime subscription in either app.

### The one thing to take away

**The Realtime fix needed TWO policies, and the one this sheet specified would
have failed silently.**

Step 3 above said "~6 lines, mirroring the vendor one but joining on
`pickups.agent_id`". That policy on its own returns **nothing**, because
Postgres applies row security to tables referenced *inside* a policy expression
as well. The vendor's `status_events` policy sub-selects from `pickups` and
works only because `pickups` already carries a vendor SELECT policy for that
sub-select to see rows through. `pickups` had **no agent SELECT policy**, so the
agent-scoped sub-select was filtered to zero rows and the outer policy matched
nothing.

Measured against the shared project, as `agent@test`'s own JWT:

| State | `status_events` rows visible |
|---|---|
| Both policies present | **44** |
| `pickups` policy dropped (= this sheet's version) | **0** |
| Both restored | **44** |

Nothing about the middle row looks broken from the outside: the subscription
still reports `SUBSCRIBED`, the screen still renders, it just never updates. So
`supabase/policies.sql` now carries **two** agent policies, both SELECT-only,
with those numbers written into the header comment so nobody "simplifies" it
back.

**D10 is not contradicted.** It says agents get no **UPDATE** policy on
`pickups` — still true — and it explicitly authorised the `status_events` read
for Realtime. The `pickups` SELECT is the prerequisite that authorisation
implies. Every Prisma read in the app is unaffected either way: Prisma connects
as the table owner and never consults a policy, which is why the in-code
`agentId === user.id` check is still the entire access boundary on every screen.
The stale "there is no agent SELECT policy" comments in `job/[id]/page.tsx`,
`job/[id]/safety/page.tsx` and `(agent)/page.tsx` were corrected to say so.

### What was built

| Screen | Notes |
|---|---|
| `/pickups` | Two groups off `isActiveJob` — **Needs you** (routed by `jobHref`, same as the day view) and **Handed over — in recovery** (routed to the timeline; nothing left to resume). `certified`/`cancelled` are excluded — they are `/history`'s. Plus the **pending drop-off** card, rendered only when a job is `collected` with a null `custodyBatchId` (the derived D5 state, not a tenth stage). |
| `/pickups/[id]` | `buildStages` + `LifecycleHeader` + `Timeline` from `@clbipp/ui`. `CancelledTimeline` for the cancelled branch. `CustodyLog` with photos. Realtime. The "your role ends at drop-off" lock banner. |
| `/pickups/[id]/map` | Leaflet + OSM, fully static. `Address.lat/lng` are both nullable → no pin means no map, address text + a working deep link, never a marker at 0°N 0°E. |
| `/history` | Server reads + hands down plain JSON, client filters. Chips derived from the rows present. **Rows link to `/pickups/[id]`** — the wireframe's self-link defect, fixed. |
| `/profile` | Identity, jobs/weight stats, the agent's own ledger, read-only `safetyTrainedAt`, log out. **No "Cash out", no "Notifications"** — nothing writes `WalletTxnKind.redemption` and there is no notification pipeline. |

### Three things that are not where you would guess

1. **`CustodyLog` grew a `roleLabels` prop** (`packages/ui`, lane C — logged in
   `LANE_OWNERSHIP.md`). Its copy was hardcoded to the customer's perspective:
   "Recorded by you" for the vendor, "Recorded by the collection partner" for
   the agent. On the agent's own screen that is exactly backwards. The agent
   passes `AGENT_ROLE_LABELS` from `@/lib/custody`.
   📌 The smoke table asserts `'Recorded by you'` **present** and
   `'Recorded by the collection partner'` **absent** on the same route. Both are
   needed: drop the prop and the first string still renders (for the vendor's
   `requested` event) while every agent action is mislabelled. Same lesson as
   Batch 5b's two-heading assertion.
2. **`mapsHref` moved from `job/[id]/page.tsx` into `lib/job-nav.ts`**, with
   `toCoord` beside it. Two screens with a "get me there" button that disagree
   about where *there* is would be a genuinely dangerous kind of drift.
3. **`apps/agent/src/lib/custody.ts` is a near-twin of the customer's** and is
   deliberately not shared yet. The blocker is placement, not effort: a shared
   version needs `createSignedUrls` (packages/auth) **and** `STAGE_LABELS`
   (packages/ui), and neither package may depend on the other. The fix is to make
   the label map a parameter, which turns it into a pure function that belongs in
   `packages/core`. That is a refactor across two apps and a shared package —
   not something to start with Batches 5a/6/7a still open. The TODO is in the
   file header.

### 🔴 The seed grew an agent ledger — and one trap with it

`reset-demo.ts` now writes one `agent_fee` `WalletTxn` per pickup at `collected`
or later, on the **agent's** profile (5 rows, ₹28,308.42 total). Blast radius
was checked and is nil: the vendor's rows are keyed `profileId = vendorId`, so
`/wallet` and `/dashboard` are untouched, and the day view's "earned today"
reads `agentFeePaise` off `status_events`, not the ledger. **No price moved.**

⚠ **The trap:** profiles are NOT wiped by `wipe()` — they match real auth users
— but `wallet_txns` **is**, and the loop re-credits from scratch every run. The
agent's upsert therefore had to gain `walletBalancePaise: 0` in its `update`
clause, exactly as the vendor's already had. Without it a second
`npm run reset-demo` leaves the cache at double the ledger. The profile screen
reconciles the two and shows a red banner when they disagree, which is how this
was caught.

`agentFeePaise` is also now hoisted into a local in the pickup loop and used by
both the column and the ledger row — computing `agentFee(quote)` twice is
exactly how those two numbers would drift apart.

### Smoke changes

- `'My pickups'` / `'History'` / `'Profile'` — the three Batch-0b stub strings —
  are gone. Every replacement is anchored on something that can only render off
  the agent-scoped Prisma read (seeded ids, `Ravi Kumar`, `Delhi NCR — South`,
  the ledger's `₹`), not on static JSX.
- New `AGENT_BATCH8_REJECTS`, wired through the existing `appIsolation` hook.
  Asserts absent: the customer's custody wording, the "your part is done" lock
  on a pre-collection job, the D5/W4 invented stages, and `Cash out` /
  `Notifications` / `recovery rate` / `Avg margin` on the profile.
- ⚠ **A React SSR gotcha cost time and will again.** `{n} load to drop off`
  written as JSX text is **not** a contiguous string in the server HTML — React
  separates adjacent text nodes with `<!-- -->` markers, so `body.includes(...)`
  never matches. Any string smoke asserts on must be built as **one template
  literal** inside a single `{}`. There is a comment saying so in
  `pickups/page.tsx`.

### ⚠ A dev-server trap worth knowing before Batch 9

Running `npm run build` and then `npm run dev` against the same app makes
**every dynamic route 404** — `/job/[id]`, `/pickups/[id]`, `/dropoff/[batchId]`
— while every static route serves 200. No Prisma query is logged, because the
404 fires before the page code runs. It looks exactly like a seed or an
ownership bug and it is neither. `rm -rf apps/<app>/.next` and restart. Cost
about fifteen minutes here; it will cost Batch 9 more, because that batch runs
`build` and `smoke` back to back.

### Verification

`npm run build` green · **213 tests** (22 engine + 39 auth + 152 core, unchanged
— Batch 8 added no pure logic; `agentHistoryBucket` lives in the app beside
`isActiveJob`, and apps hold no tests) · lint clean (2 pre-existing warnings
from Batch 7b's PDF route) · `npm run smoke` **46/46** · `--app=agent`
**28/28** · `--app=agent --blocked business@test` **28/28** ·
`--blocked agent@test` **46/46**.

Plus `batch8-check.mjs`, **not committed** (same convention as Batches 0a, 1, 2,
3 and 5b). **21 checks, all passing:**

1. 🔴 Under a real **agent JWT** — not the service role, which bypasses the layer
   under test — the agent reads 8 pickups and 44 `status_events`; every row
   belongs to them; an unassigned pickup (`PKP-2026-000101`) is invisible.
2. `/pickups/<not yours>` and its `/map` both **404**, proving the in-code
   ownership check independently of RLS.
3. The ledger reconciles three ways: 5 rows, all `agent_fee`, sum === the cached
   `wallet_balance_paise`, and === the sum of `agent_fee_paise` on the agent's
   `collected`+ pickups.
4. 🔴 `offered` × `acceptedAt` on the agent's timeline: unaccepted says
   "Offer is with the vendor", stamping `accepted_at` flips it to
   "The vendor accepted", and the fixture is restored to null afterwards —
   `PKP-2026-000104`'s null is Batch 5b's deliberate "awaiting the vendor"
   fixture and must not be "fixed".
5. D5/W4 holds: no `Refurb` / `In transit` / `Warehouse stage` / `QA stage` on
   the timeline, and `Offer made` proves the labels come from `STAGE_LABELS`.

### Not covered by any script — for the end-of-sprint pass

- **The Realtime ping itself.** The RLS half is proved above; the browser half
  needs the vendor advancing a pickup on :3000 while the agent watches
  `/pickups/[id]` on :3001.
- **The map actually drawing.** `MapCanvas` is loaded via `next/dynamic` with
  `ssr: false`, so it is *absent by design* from the server HTML that
  `npm run smoke` reads. Smoke proves the page renders, the placeholder is
  wired, the coordinates reach the deep link, and no Leaflet leaked into the
  server pass — it cannot prove a tile ever painted.
- **Log out**, which is a POST server action.

All three are in `docs/MANUAL_TEST_QUEUE.md`.
