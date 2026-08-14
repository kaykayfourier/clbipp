# Plan v2 — Customer App rebuild (+ Turborepo migration)

**Written:** 2026-08-07 · **Horizon:** 2 weeks to deliver all three apps
**Scope of this document:** the **customer/vendor app only**, in detail. Agent and
Admin apps get a stub section at the end covering only what Batch 0 pre-builds
for them.

**Supersedes** the "Batch A" plan in `PROJECT_STATE.md` (2026-07-10) for anything
not already merged. The Phase 0–4 remediation work described there is **done and
on `main`** — this plan starts from that finished state.

---

## 0. Decisions taken (so nobody re-litigates them mid-build)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Do the Turborepo migration now, completely.** | Aamir's call, 2026-08-07. Half-migrations are worse than either end state, so this is scoped as a full rewrite of paths/config, with a verification gate. |
| D2 | **Email OTP now; phone collected and stored, verified later.** | Supabase email OTP is built in and free. Phone SMS needs a paid provider *plus* Indian DLT template registration — it would block the entire login flow on procurement. Phone column + `phoneVerified` ship now so the switch is a provider config change. |
| D3 | **Payments: full data model + simulated gateway behind `PAYMENTS_MODE`.** | Every screen is real and the flow demos end-to-end. Swapping in Razorpay later is one server action. |
| D4 | **Teammate C assumed unavailable.** | All work is A + B. C's former lane (booking flow, component library) is redistributed — see §6. A "grab bag" (§7) holds anything either of us can absorb when ahead. |
| D5 | **We are no longer waiting on the company's reply.** | `PROJECT_STATE.md` said work was blocked pending answers to six open questions. With 2 weeks left that block is lifted; we build to our best reading of the documents and flag assumptions. See §1.3 for what we assumed. |
| D6 | **The "no ₹ to the vendor" rule is relaxed.** | It was already recorded as a light rule that follows the company's ask. All three company documents ask for an indicative quote, instant payment, a wallet and an invoice — all value-facing. **The separate "no recovery-rate %" rule stands** — no document asks for it. |
| D7 | **One consolidated schema migration, covering all three apps, done once.** | Every stall in this project's history was the same stall: someone waiting on a schema change. See §3. |

---

## 1. What the source documents actually changed

### 1.1 The new material

`Battery_Waste_App_Documentation.docx` is the **same document** as
`markdown-preview.pdf` — already analysed in `COMPANY_FLOW_REVIEW_2026-08-07.md`,
nothing new. `Battery_App_Simple_Explanation.docx` is a plain-language retelling
of the same 8-step flow, also nothing new.

**`Battery_Waste_App_Build_Documentation.docx` is the one that matters.** Its §6
gives the company's own data model, and it settles the biggest open design
question by itself:

| Entity | Attributes given |
|---|---|
| Pickup Request | `id, customer_id, partner_id, status, category, photo, scheduled time` |
| **Battery Item** | `id, pickup_id, chemistry type, condition, weight, price, photo` |
| Partner | `id, name, zone, vehicle, safety-training status, rating, wallet balance` |
| Facility/Hub | `id, location, current inventory by chemistry, capacity` |
| Recycler | `id, name, CPCB registration no., capacity, accepted chemistries` |
| Dispatch Manifest | `id, facility_id, recycler_id, item list, dispatch date, status` |
| EPR Certificate | `id, manifest_id, producer_id, quantity, issue date, CPCB reference` |

The whole rework compresses to one sentence:

> **`Pickup` becomes a header row (category, partner, address, schedule) and the
> battery detail moves down into a child `BatteryItem` row.**

That single change delivers, at once: bulk pickups (the teammate's `PickupItem`
note), the category/chemistry split, per-item condition flags, per-item photos,
and per-item pricing. It is also exactly what the Agent app writes into.

§9 also gives a build order — *"MVP: booking + pickup + manual pricing + basic
payment, for one battery category"* — which is our P0 in §5.

### 1.2 Where `notes.md` and the company documents agree

Both independently ask for: line items / bulk pickups, photo upload at booking,
category-first selection, condition flags, GPS + address handling,
chain-of-custody event log, real certificate PDFs, and payments. **These are the
plan.** `notes.md` also proposed the Turborepo split, which is D1.

### 1.3 Assumptions we are building on (flag these to the company)

The six open questions never got answered. We are proceeding on:

- **A1** — Wallet + payout are in scope, cash-out simulated. Green-coins /
  gold-silver / coupon gamification is **not** built (§5.4 of the doc scopes it
  to individuals; it is the last thing worth building).
- **A2** — Value **is** shown to the customer: indicative quote, offer, payment,
  invoice. Recovery rate % still is not.
- **A3** — SMS/WhatsApp: **not built.** Instead, the app copy that currently
  promises "we'll notify you at each stage" is reworded to describe in-app
  tracking, in four files (see B7). We say what we actually do.
- **A4** — AI photo assist: **not built.** The photo is captured and stored for
  the audit trail; the customer picks category manually.
- **A5** — Payments: simulated (D3).
- **A6** — Go-to-market wedge: **schema supports both, screens serve both via
  one conditional form.** No second flow is built. This was A's standing
  recommendation and nothing in the new documents contradicts it.

---

## 2. Starting line (verified today, not assumed)

- `npm run build` — **green**, 20 routes.
- `npx vitest run` — **23 passing** (20 decision-engine, 3 auth).
- Dashboard is on **real Prisma** with real stats and status-routed rows — B's
  Phase 2 tail is closed. `PROJECT_STATE.md` still lists it as outstanding; it is not.
- Service-role client, `acceptOffer`/`cancelPickup`, and the RLS self-advance
  fix are all merged. `policies.sql` has no vendor UPDATE policy — correct.
- PWA shipped (`manifest.webmanifest`, `sw.js`, `offline.html`, icons).
- **Cruft found, to be cleaned during the migration:**
  - `src/app/generated/prisma/` — 14 files, **tracked in git despite being
    gitignored**, imported by nothing, and sitting inside `src/app/` where the
    App Router scans for routes. `git rm -r --cached` and delete.
  - `src/types/db.ts` — dead, and its `export type { "BatteryPack", ... }`
    string-literal export form is suspect. Delete it.
  - `pdf-parse`, `csv-parser`, `csv-parse` in dependencies — unused by app code.

---

## 3. Batch 0 — Foundation (the only sync point in this plan)

**Everything else in this plan is parallel. This batch is not.** Budget ~half a
day. The two halves touch disjoint files and run concurrently:

- **0A — Turborepo migration → A** (repo-wide config; A's established lane).
- **0B — the one schema migration → B** (schema owner).

**How they run in parallel without conflicting:** B drafts the full schema diff,
seed, and pricing-rate data **in a scratch file, making no repo edits**, while A
migrates. When 0A lands on `main`, B applies the diff at its new path
(`packages/database/prisma/schema.prisma`) and runs the migration. A moves the
file wholesale; B edits its contents. Near-zero conflict surface.

### 3A — Turborepo migration (A)

Target structure:

```
clbipp/
├── package.json              # npm workspaces: ["apps/*", "packages/*"]
├── turbo.json
├── package-lock.json         # single lockfile, root only
├── apps/
│   ├── customer/             # everything that exists today
│   │   ├── src/app/          # (app)/, (auth)/, t/[token]/
│   │   ├── src/middleware.ts # MUST stay under src/ — see note below
│   │   ├── public/           # manifest, sw.js, offline.html, icons
│   │   ├── next.config.ts · postcss.config.mjs · eslint.config.mjs
│   │   ├── vitest.config.mts · tsconfig.json · vercel.json
│   │   └── package.json
│   ├── agent/                # scaffolded now, built later
│   └── admin/                # scaffolded now, built later
├── packages/
│   ├── database/             # prisma schema + migrations + client + seed
│   ├── auth/                 # supabase server/browser/admin clients, auth.ts,
│   │                         # + createAuthMiddleware() factory
│   ├── ui/                   # components/{ui,layout,states} + tokens.ts
│   ├── core/                 # validation.ts, offer.ts, pricing.ts, lifecycle
│   ├── decision-engine/      # PARKED engine, moves wholesale, stays parked
│   ├── eslint-config/
│   └── tsconfig/             # base.json, nextjs.json, react-library.json
└── supabase/                 # policies.sql, realtime.sql, grants.sql (stays root)
```

**Migration steps, in order:**

1. **npm workspaces, not pnpm.** We are already on npm with a working
   `package-lock.json`. Switching package managers is a second migration we
   don't need.
2. **`git mv` the app** into `apps/customer/`. Use `git mv` so history follows
   the files.
3. **Extract packages** — `src/components/*` + `src/lib/tokens.ts` → `ui`;
   `src/lib/supabase/*` + `supabase-realtime.ts` → `auth`; `validation.ts` +
   `offer.ts` → `core`; `src/lib/decisionEngine/` → `decision-engine`;
   `prisma/` → `database`.
4. **Just-in-time packages** — packages ship raw TypeScript, no build step.
   Each app's `next.config.ts` gets
   `transpilePackages: ['@clbipp/ui', '@clbipp/core', '@clbipp/auth', '@clbipp/database']`.
   This keeps the migration to config and paths, with no compile pipeline to debug.
5. **Prisma moves to `packages/database`** with an **explicit generator output**
   (`output = "../src/generated/client"`, gitignored). Prisma 6 warns about the
   default output path, and an explicit one resolves correctly regardless of
   npm's hoisting. `packages/database/src/index.ts` exports the `prisma`
   singleton *and* re-exports every model type and enum, so app code imports
   types and the client from one place.
6. **Rewrite imports** — mechanical, ~25 files:
   `@/components/ui/*` and `@/lib/tokens` → `@clbipp/ui` · `@/lib/prisma` and
   `@prisma/client` → `@clbipp/database` · `@/lib/supabase/*` → `@clbipp/auth` ·
   `@/lib/validation`, `@/lib/offer` → `@clbipp/core`.
   **`@/*` keeps meaning `./src/*` inside each app**, so every import pointing at
   something that did *not* move is untouched. That is what keeps this cheap.
7. **`moduleResolution: "NodeNext"` → `"Bundler"`** (with `module: "ESNext"`) in
   the shared tsconfig. NodeNext forces `exports`-map gymnastics and `.js`
   extensions on relative imports across workspace packages. Bundler resolution
   is what Next 16 ships by default and makes workspace packages resolve
   cleanly. **This is a deliberate change, not an accident.**
8. **Tailwind v4 `@source`** — ⚠ **the single most likely thing to break
   silently.** Tailwind 4 scans only the importing app's tree, so every class
   used inside `packages/ui` gets purged and shared components render unstyled.
   In `apps/customer/src/app/globals.css`, add
   `@source "../../../../packages/ui/src";`. Verify visually, not just by build.
9. **The app-level auth guard stays under `apps/customer/src/`.** Next's dev
   bundler silently never registers it at the project root when
   `src/app` is in use — this bit us before. The Supabase session logic moves to
   `packages/auth` as `createAuthMiddleware({ publicPaths, homePath, allowRoles })`,
   and each app's guard is a five-line caller. **This is what makes
   the Agent and Admin apps' auth free later** — the single biggest reason the
   migration is worth its cost.
   > **Updated 2026-08-14 (PR #18):** the file is now **`src/proxy.ts`**
   > exporting `proxy`, not `middleware.ts` — Next 16 deprecated the
   > `middleware` file convention. The **location** rule above is what was
   > locked, and it still holds. ⚠ `packages/auth/src/middleware.ts` (the
   > factory) is **not** renamed.
10. **Delete the cruft** listed in §2.
11. **turbo.json tasks** — `build` (`dependsOn: ["^build", "db:generate"]`,
    `outputs: [".next/**"]`), `dev` (persistent, uncached), `lint`, `test`,
    `db:generate`, `db:migrate`.
12. **Vercel: three projects, one repo.** Root Directory `apps/customer` /
    `apps/agent` / `apps/admin`; `vercel.json` (with `regions: ["syd1"]`) moves
    into each app directory; env vars duplicated per project. ⚠ Vercel caches
    `node_modules`, so **`prisma generate` must run in the build command** or the
    client goes stale — the `db:generate` turbo dependency handles it.

**Definition of done — the migration is not finished until all five pass:**

- [ ] `turbo build` green
- [ ] `turbo test` green — **23 tests**, same count as today
- [ ] `turbo lint` clean
- [ ] `turbo dev` serves all 20 existing routes
- [ ] **Visual check: login → dashboard → track is fully styled** (catches the
      Tailwind `@source` trap, which a green build will not)

### 3B — The one schema migration (B)

> **→ Full runbook: `docs/BATCH_0B_SCHEMA.md`.** That is B's working document —
> paste-ready Prisma (already `prisma validate`-clean), migration-safety notes,
> Storage buckets, the seed spec, PricingRate values, the A↔B contract, and a
> checkbox runbook. **B should work from that file, not this section.** What
> follows is the summary for everyone else.

Designed to cover **all three apps at once** so no one is ever blocked on a
migration again. New enums:

```prisma
enum UserRole         { customer  agent  admin }
enum BatteryCategory  { portable  automotive  industrial  ev }
enum BatteryCondition { healthy  swollen  leaking  dead }
enum AddressStatus    { operational  not_operational }
enum PaymentStatus    { pending  processing  paid  failed }
enum PaymentMethod    { upi  bank_transfer  wallet  cash }
enum WalletTxnKind    { payout  redemption  adjustment }
```

Changes to existing models:

```
Profile      + role UserRole @default(customer)     ← unlocks agent + admin auth
             + phoneVerified Boolean @default(false)
             + walletBalancePaise Int @default(0)
Pickup       + category BatteryCategory             ← customer picks (doc §3.A)
             + addressId  → Address
             + agentId    → Profile                 ← assigned partner
             + scheduledSlot DateTime? · etaMinutes Int?
             + indicativeQuotePaise Int?            ← quote at booking
             + conditionFlags BatteryCondition[]    ← customer self-report
             ~ batteryType / approxQuantity / approxWeightKg → nullable,
               superseded by BatteryItem, kept for back-compat + backfill
             ~ location kept as free text, backfilled into Address
StatusEvent  + lat · lng · photoUrls                ← chain-of-custody, doc §5.3
Certificate  + co2AvoidedKg Decimal?                ← impact dashboard
```

New models: **`Address`**, **`BatteryItem`** (the line-item model — the centre of
this whole rework), **`PricingRate`**, **`Payment`**, **`WalletTxn`**,
**`PickupReceipt`** (the §4-step-4 collection document, distinct from the EPR
certificate), **`Invoice`**.

Scaffolded now purely so the Agent/Admin apps never need a second migration:
**`Facility`**, **`Recycler`**, **`DispatchManifest`**, **`SafetyChecklist`**.

Also in 0B:
- **Storage buckets** — `pickup-photos`, `kyc-docs`, `certificates`, `receipts`,
  `invoices`.
- **Seed rewrite** — one coherent demo vendor with a pickup at *every* lifecycle
  stage, each with real `BatteryItem` rows, an agent profile, and `PricingRate`
  rows. The current seed's fake vendor UUIDs have caused repeated "screen shows
  nothing" confusion; every seeded row should belong to the real auth user.

⚠ **`Pickup.id` is a plain `String` with no default** — the app generates
`PKP-YYYY-XXXXXX` client-side. Keep that; do not switch to uuid mid-flight.

---

## 4. The customer app, screen by screen

Existing (20 routes) plus new. **P0/P1/P2 is the stop-anywhere priority** — build
strictly top-down and the demo works at every point you stop.

| Screen | Route | State | Owner | Pri |
|---|---|---|---|---|
| Login (email OTP) | `(auth)/login` | rework | A | P0 |
| OTP code entry | `(auth)/verify` | **new** | A | P0 |
| Signup type / individual / fleet | `(auth)/signup/*` | + phone field | A | P0 |
| **Booking — category** | `(app)/book` step 1 | **new** | A | **P0** |
| **Booking — items + photos + condition** | step 2 | **new** | A | **P0** |
| **Booking — address** | step 3 | **new** | A | **P0** |
| **Booking — quote + confirm** | step 4 | **new** | A+B | **P0** |
| Submitted | `(app)/submitted` | keep | — | P0 |
| Scheduled | `(app)/scheduled` | + partner + ETA | A | P1 |
| Track | `(app)/track/[id]` | + partner card, custody log | A | P0 |
| **Pickup receipt** | `(app)/receipt/[id]` | **new** | A+B | P1 |
| Offer / breakdown | `(app)/offer*` | show ₹ (D6) | A | P1 |
| Handover | `(app)/handover` | keep | — | P1 |
| **Payment** | `(app)/payment/[id]` | **new** | B | P1 |
| **Wallet** | `(app)/wallet` | **new** | B | P2 |
| Certificate | `(app)/certificates/[id]` | real PDF | B | P0 |
| Compliance | `(app)/compliance` | + CSV export | B | P1 |
| **Invoices** | `(app)/invoices[/id]` | **new** | B | P2 |
| Dashboard | `(app)/dashboard` | + CO₂, materials, wallet | B | P0 |
| **Addresses** | `(app)/addresses[/new]` | **new** | A | P1 |
| Profile | `(app)/profile` | + phone, addresses link | A | P2 |
| **History / repeat booking** | `(app)/history` | **new** | A | P2 |
| Public tracking | `t/[token]` | parity w/ new track | A | P2 |

**The P0 demo path:** book (category → items + photos → address → quote) → submit
→ agent assigned → track → collected + receipt → payment → certified → EPR
certificate PDF → dashboard impact. Nothing outside that path is P0.

---

## 5. Batches after Batch 0 — fully parallel, A and B never block each other

### A's batches (auth · addresses · booking · tracking · RLS · deploy)

- **A1 — Email OTP + roles.** `signInWithOtp({ email })`, `/verify` code screen,
  phone captured at signup, `role` written to profile, role-aware middleware via
  the `packages/auth` factory. Keep password login working for demo accounts —
  do not remove a working path on demo week.
- **A2 — Address book.** `/addresses` list, `/addresses/new`, default address,
  operational / not-operational status, GPS capture via `navigator.geolocation`
  (free, no API key, no billing). Address chip in the app header.
  ⚠ **No embedded map picker** unless everything else is done — it needs a
  billed Google Maps key. Lat/lng + text fields deliver the same data.
- **A3 — Storage + RLS.** `packages/auth/storage.ts` upload helper (5 MB/file
  client-side check, per the teammate's note), Storage bucket policies, and RLS
  policies for all eight new tables in `supabase/policies.sql`.
- **A4 — The booking flow.** Four-step wizard, one client component holding a
  `lineItems` array in state, add/remove rows, photo picker per item, condition
  chips, address step, quote step. **Calls two things B provides** (see below) —
  stub both against the agreed shape and keep moving.
- **A5 — Tracking upgrade.** Assigned-partner card (name, phone, vehicle), ETA,
  chain-of-custody timeline rendering per-event GPS + photos. Realtime is
  unchanged and already works.
- **A6 — Deploy.** Three Vercel projects, env vars, PWA per app.

### B's batches (schema · pricing · PDFs · impact · payments)

- **B1 — Batch 0B** (§3B) + seed.
- **B2 — Pricing engine.** `packages/core/pricing.ts`: a pure
  `estimateQuote(items, category) → paise` over `PricingRate` rows. Pure
  function, unit-tested, **zero dependencies on anyone**. Ideal first solo task.
- **B3 — PDF generation.** `@react-pdf/renderer`, three templates: EPR
  certificate, pickup receipt, invoice → rendered server-side to a buffer →
  Supabase Storage → URL on the row. Certificate number format
  `CERT-{YEAR}-{pickupId}-{category}`. Big, self-contained, blocks nobody.
- **B4 — Impact dashboard.** CO₂ avoided, materials recovered, aggregate weight,
  wallet balance. CO₂ needs a per-chemistry kg-CO₂e/kg constant table — **put
  the source in a comment**, it is a compliance-adjacent number.
- **B5 — Compliance CSV export.** `papaparse` is already installed.
- **B6 — Payments + wallet.** `Payment` / `WalletTxn` server actions behind
  `PAYMENTS_MODE=simulated|razorpay`, payment screen, wallet screen.
- **B7 — Notification copy fix.** Reword the "we'll notify you at each stage"
  promise in `track/[id]`, `submitted`, `handover`, `scheduled` (A3 in §1.3).

### The only two hard A↔B interactions in this entire plan

1. **Batch 0B lands before A3 (RLS) and A4 (booking) can finish.** Unavoidable —
   it is the schema. It is also the *only* unavoidable one, which is the whole
   point of doing one big migration.
2. **A4 needs two things from B:** `estimateQuote(items, rates)` (from B2) and
   the `createPickupWithItems(input)` server action that writes `Pickup` +
   `BatteryItem[]` in one transaction. **Both get stubbed** in
   `packages/core/src/mock-data.ts`, per the repo's existing stub-data pattern,
   with `// TODO: swap for real <X> once B ships it`. A never sits idle; the swap
   is a search-and-replace on imports.
   **The exact signatures are pinned in `BATCH_0B_SCHEMA.md` §7** — both lanes
   code against that, and whoever changes it says so the same day.

Everything else is genuinely independent.

---

## 6. Lane changes this plan makes (log these in `LANE_OWNERSHIP.md`)

C is assumed unavailable (D4), so C's lane is redistributed:

- **Booking flow (was C) → A.** It is mostly address, storage and routing, all
  already A's. B contributes only the two pure pieces above.
- **Component library (was C) → `packages/ui`, shared.** Whoever needs a
  component adds it. The clobber-risk warning on `timeline.tsx` in
  `PROJECT_STATE.md` is moot once C is not re-uploading files.
- **Offer / offer-breakdown / handover (was C) → A** — already A's since the
  2026-07-10 shift.
- **The request-pickup button clipped by the phone frame** (from `notes.md`) —
  fold into A4; the booking screen is being rewritten anyway.

If C does become available, hand over from the §7 grab bag — those items need no
repo-wide knowledge and touch nothing security-sensitive.

---

## 7. Grab bag — no dependencies, no owner, take when ahead

Ordered by value. Each is self-contained and safe to pick up solo.

1. Repeat-booking ("book again" from a past pickup) — pure UI over existing data.
2. Order history screen.
3. Public `/t/[token]` parity with the new tracking screen.
4. Invoice screens (if B4/B6 landed but B3's invoice template did not).
5. Wallet redemption UI.
6. Design pass against the reference pictures.
7. Public realtime on `/t/[token]` (token-scoped anon SELECT policy) — deferred
   since 2026-07-07.
8. Signup input validation, P5 — GST/PAN/EPR format checks.
9. Green coins / rewards — **last**, and only if literally everything else ships.

---

## 8. Honest schedule

| Block | Effort | Who |
|---|---|---|
| Batch 0A — Turborepo migration | ~0.5 day | A |
| Batch 0B — schema + storage + seed | ~0.5 day | B (parallel with 0A) |
| P0 customer work | ~1 day | A ∥ B |
| P1 customer work | ~0.5 day | A ∥ B |
| **Customer app demo-ready** | **~2 to 2.5 days** | |
| Agent app | ~3 days | |
| Admin app | ~2 days | |
| Integration + polish + deploy | ~1.5 days | |

**Two to two-and-a-half days, not one to two** — the migration is real work and
it eats half a day before any feature ships. That still leaves roughly nine days
for the other two apps, which is the right trade: the middleware factory and
`packages/database` are what make apps two and three fast.

**If the schedule slips, cut in this order:** P2 screens → wallet → invoices →
receipt PDF (keep the receipt *screen*) → address GPS (keep manual entry).
**Never cut:** the booking flow, `BatteryItem`, tracking, or the EPR certificate —
those are the deliverable.

---

## 9. What Batch 0 pre-builds for the other two apps

Not planned in detail here — deliberately. But Batch 0 exists so that on day 3
neither app starts from zero:

- **Agent app** — `Profile.role = agent`, `Pickup.agentId`, `BatteryItem`
  (its main write target), `SafetyChecklist`, `PricingRate` (payout), the
  `StatusEvent` GPS/photo columns, plus auth and middleware from `packages/auth`.
  What it still needs: a job feed, the safety checklist flow, on-site
  capture/weighing, and hub drop-off.
- **Admin app** — `Facility`, `Recycler`, `DispatchManifest`, `PricingRate`,
  `Invoice`. What it still needs: job assignment, the pricing editor, EPR
  reconciliation, and CPCB report export.

Neither should require a migration. That is the test of whether §3B was drawn
correctly — **if either app later needs a schema change, 0B was scoped wrong.**

---

## 10. First three moves

1. **A** — branch `feat/turborepo`, execute §3A, don't stop until all five
   definition-of-done checks pass.
2. **B** — open **`docs/BATCH_0B_SCHEMA.md`** and work the runbook in §8. The
   schema is written and validated; nothing needs designing. If `feat/turborepo`
   hasn't merged yet, everything up to running the migration can still be
   prepared — see §1 of that doc for which path to use.
3. **B, immediately after the migration** — B2 (pricing engine): a pure,
   unit-tested function that unblocks A's quote step and depends on nothing.

**If you only read one thing:** A → §3A here. B → `BATCH_0B_SCHEMA.md`.
