# Customer-app revamp — batch tracker (started 2026-08-09)

> **This is the resume point.** Read `PLAN_V2_CUSTOMER_APP.md` for the *why* and
> the decisions (D1–D7); read this file for *where we are* and what to do next.
> Update the status column at the end of every batch.

**Context:** B (Khalid) was unavailable on 2026-08-09 and gave Aamir explicit
permission to execute his lane too — so A is running both lanes for this revamp.
Logged in `LANE_OWNERSHIP.md` (2026-08-09 entry).

**Branch:** `feat/customer-v2` — one branch, one commit per batch, one PR → `main`
at the end. Aamir commits manually; Claude never runs `git commit`.

---

## Status

| # | Batch | Owner (orig.) | Status |
|---|---|---|---|
| 1 | **0A — Turborepo migration** | A | ✅ done, committed `a5c15e2` |
| 2 | **0B — schema v2 + buckets + seed + RLS** | B | ✅ done, staged |
| 3 | **B2 — pricing engine + `createPickupWithItems`** | B | ✅ done, staged |
| 4 | A2/A3 — address book + storage upload helper | A | ⏭ **next** |
| 5 | **A4 — 4-step booking wizard** (the centrepiece) | A | pending |
| 6 | A1 — email OTP + `/verify` + roles | A | pending |
| 7 | A5/B7 — tracking upgrade (partner, custody log) + copy fix | A/B | pending |
| 8 | B3/B6 — PDF generation + payment + receipt screens | B | pending |
| 9 | B4/B5 — dashboard impact (CO₂) + compliance CSV | B | pending |
| 10 | P2 screens (wallet, invoices, history, profile, `/t` parity) + **deploy** | A | pending |

**Cut order if time runs short** (Plan v2 §8): P2 screens → wallet → invoices →
receipt PDF (keep the screen) → address GPS.
**Never cut:** booking flow, `BatteryItem`, tracking, EPR certificate.

---

## What batches 1–2 actually delivered

### Batch 1 — Turborepo migration (`a5c15e2`)

```
apps/customer   ← the entire previous app (git mv, history preserved)
apps/agent      ← buildable scaffold
apps/admin      ← buildable scaffold
packages/ui              components + tokens + cn        → @clbipp/ui
packages/auth            supabase clients + realtime
                         + createAuthMiddleware()        → @clbipp/auth
packages/core            validation + offer              → @clbipp/core
packages/database        prisma schema/migrations/client → @clbipp/database
packages/decision-engine PARKED engine, unchanged
packages/tsconfig · packages/eslint-config
supabase/                policies.sql etc — stayed at repo root
```

- npm workspaces + `turbo.json`. Root scripts: `npm run dev|build|test|lint`.
- Packages ship **raw TypeScript** (`transpilePackages` in each app's
  `next.config.ts`) — no per-package build step.
- `moduleResolution: "Bundler"` (was `NodeNext`) — deliberate, Plan v2 §3A.7.
- **Tailwind v4 `@source "../../../../packages/ui/src";`** in
  `apps/customer/src/app/globals.css` — without it every class used only inside
  `packages/ui` is purged and shared components render unstyled. Verified.
- `apps/customer/src/middleware.ts` is now a 5-line caller of
  `createAuthMiddleware({ publicPaths, homePath, allowRoles? })`. **It must stay
  under `src/`** — Next's dev bundler silently ignores root middleware.
  `allowRoles` is written and ready but **commented out** until Batch 6.
- Deleted: `src/app/generated/prisma/` (tracked-but-gitignored, 0 importers),
  `src/types/db.ts`, dead `api/config/route.ts`, `components/ui/input.tsx`
  (a byte-identical copy of `card.tsx` with no importers), and the unused
  `pdf-parse` / `csv-parser` / `csv-parse` deps.
- `reset-demo` now runs on `tsx` — the old script called `ts-node`, which was
  never installed, so it had been broken.

### Batch 2 — schema v2 + buckets + seed + RLS

- Migration **`20260809072925_schema_v2_battery_items`** applied. 54 statements,
  all additive or widening — no data loss.
- New: `Address`, `BatteryItem`, `PricingRate`, `Payment`, `WalletTxn`,
  `PickupReceipt`, `Invoice` + scaffolds `Facility`, `Recycler`,
  `DispatchManifest`, `SafetyChecklist`. `Profile` gained `role`, `phone`,
  `walletBalancePaise`, agent fields. `Pickup` became a header row.
- **Five private Storage buckets created** (`pickup-photos`, `kyc-docs`,
  `certificates`, `receipts`, `invoices`) via
  `npm run create-buckets --workspace=@clbipp/database` — idempotent, 5 MB limit.
- **Seed fully rewritten** (`packages/database/prisma/reset-demo.ts`,
  `npm run reset-demo`): 8 pickups, **one per lifecycle stage including
  `cancelled`**, 2–3 `BatteryItem` each (one `leaking`, one `swollen`), full
  `StatusEvent` chains with GPS, receipt + payment + wallet ledger from
  `collected` onward, offer at `recovered`, certificate with CO₂ at `certified`,
  2 addresses, 40 pricing rates, 1 facility, 1 recycler.
  **Every row belongs to a real Supabase auth user.** The old fake-vendor
  profiles were deleted and the superseded `prisma/seed.ts` removed.
- RLS for all 8 new tables in `supabase/policies.sql`, plus new
  `supabase/storage-policies.sql`. New tables are **SELECT-only by design** —
  writes go through service-role server actions. The 4 agent/admin scaffolding
  tables get RLS **enabled with no policy** (deny-all) so they aren't left
  readable by any logged-in user.

**Verified end-to-end while logged in as `business@test`:** dashboard lists all
8 pickups; `/track/[id]` renders correctly for certified / scheduled / cancelled;
`/profile`, `/compliance`, `/certificates/[id]`, `/offer`, `/offer-breakdown`,
`/scheduled` and public `/t/[token]` all 200 with zero server errors; the
`/offer` status guard still redirects a `recovered` pickup to `/track`.

### Batch 3 — pricing engine + `createPickupWithItems`

Three new files in `packages/core/src`, all exported from `index.ts`:

- **`booking.ts`** — `BookingLineItem` / `QuoteLine` / `QuoteResult`,
  `estimateQuote(items, rates)` (pure, no DB, no clock) and `getQuote(items)`
  (loads only rates that are active *and* inside their effective window, then
  calls the pure one). Rate lookup is category-first with a chemistry-null
  fallback, because the customer is never asked for chemistry at booking.
- **`booking-actions.ts`** — `createPickupWithItems(input)`: one
  `prisma.$transaction` writing `Pickup` + `BatteryItem[]` + the initial
  `requested` `StatusEvent`. Generates `PKP-YYYY-XXXXXX` (random suffix, retried
  on a unique-key collision).
- **`booking.test.ts`** — 12 tests. Workspace total is now **35**.

**Two deliberate divergences from the §7 contract — both are A's call while A
covers both lanes, but Khalid should know:**

1. **`CreatePickupInput` gains `vendorId`.** The contract implied the function
   resolves the session itself; that would make `packages/core` depend on
   `@clbipp/auth` and stop it being callable from a seed or a test. The customer
   app wraps it in a `"use server"` action that resolves the logged-in user and
   passes the id down. **Batch 5 must do that wrapping — core does not
   authenticate.**
2. **Lines with no weight are still quoted**, using a per-category typical unit
   weight (`TYPICAL_UNIT_WEIGHT_KG`, demo placeholders like the rates) and
   flagged `basis: "per_unit"` with a customer-visible "we'll confirm the real
   weight when we collect" note. A `ratePerUnitPaise` on the rate row wins over
   the estimate when one exists; none are seeded today.

Other decisions worth knowing: `weightKg` on a line is the **line total, not per
unit** (matches the seed — 14 automotive batteries = 196 kg); notes are
qualitative only, never a rupee deduction or a percentage; `Pickup.photoUrls` is
kept as the deduped union of the item photos so older header-field reads still
work; and the address is looked up scoped to `vendorId`, so a guessed
`addressId` can't attach a booking to someone else's address.

**Verified against the real database** (script run then deleted, seed data left
untouched): a 3-line basket quoted ₹15,204 and wrote one pickup, 3 battery
items and one `requested` status event in a single transaction; the empty-basket
and foreign-address paths both return `{ ok: false }` without writing.

---

## ⚠ Defect found in `BATCH_0B_SCHEMA.md` §2 — **tell Khalid**

The runbook's paste-ready schema **omits `@map("battery_type")` on
`Pickup.batteryType`**. Prisma maps a field to a column of the same name unless
told otherwise, so pasting §2 verbatim asks Postgres to *rename* the live
`battery_type` column to `batteryType`:

- Prisma refused to run and warned: *"about to drop the column `battery_type`,
  which still contains 10 non-null values."*
- It would also have broken the old request-pickup form, which inserts
  `battery_type` through raw PostgREST (not Prisma).

**Fixed** in `packages/database/prisma/schema.prisma` and **in §2 of the runbook
itself**, so re-pasting is now safe. Every other field's column mapping was
diffed against the pre-migration schema — this was the only divergence.
**No action needed from Aamir or Khalid**; the applied migration is clean. Khalid
just needs to know so he doesn't re-introduce it from an older copy.

---

## Accounts + commands

| Account | Password | Role |
|---|---|---|
| `business@test` | `businesstest` | customer (the demo account) |
| `agent@test` | `demo1234` | agent (seeded, for the Agent app on day 3) |
| `admin@test` | `demo1234` | admin (seeded) |

```bash
npm run dev            # customer app (turbo --filter=customer)
npm run build          # all apps + packages
npm run test           # 23 tests (3 auth + 20 decision-engine)
npm run lint
npm run reset-demo     # wipe + reseed the whole demo dataset
npm run create-buckets --workspace=@clbipp/database
npm run db:migrate --workspace=@clbipp/database
```

**Applying SQL without the Supabase dashboard** — this is how policies were
applied and it works, so no dashboard trip is needed:

```bash
cd packages/database
npx prisma db execute --file ../../supabase/policies.sql --schema prisma/schema.prisma
```

**Env files:** `apps/customer/.env.local` (Supabase URL/keys + DB URLs) and
`packages/database/.env` (DB URLs only). Both gitignored. Note the file has
`KEY =value` spacing and a quoted service-role key — Next's dotenv tolerates
both; a naive parser does not (see `packages/database/prisma/env.ts`).

---

## The A↔B contract for Batch 3 (shipped — see the two divergences above)

`packages/core/src/booking.ts` must export exactly:

- `BookingLineItem`, `QuoteLine`, `QuoteResult`
- `estimateQuote(items, rates): QuoteResult` — **pure**, no DB, unit-tested
- `getQuote(items): Promise<QuoteResult>` — thin DB wrapper
- `createPickupWithItems(input): Promise<CreatePickupResult>` — **one
  `prisma.$transaction`** writing `Pickup` + `BatteryItem[]` + the initial
  `requested` `StatusEvent`; generates `PKP-YYYY-XXXXXX` server-side

Three invariants the booking screens assume: all money is **integer paise**;
the write is **one transaction**; it **writes the initial StatusEvent** (the
timeline and Realtime both key off that row existing).

Because A is covering both lanes, **no stubs are needed** — Batch 3 builds the
real functions before Batch 5 consumes them.

---

## Known gaps / deliberate deferrals

- `Certificate.pdfUrl` is `""` in the seed — real PDFs land in Batch 8.
- CO₂ in the seed uses ~8 kg CO₂e/kg (Li-ion) inline. The **canonical constants
  table with a cited source** is Batch 9 (`packages/core/src/impact.ts`). This is
  a compliance-adjacent claim — it needs a real citation before any demo.
- `apps/agent` and `apps/admin` are scaffolds only.
- Old `(app)/request-pickup` still exists; Batch 5 replaces it with `(app)/book`
  and leaves a redirect.
- Email OTP (Batch 6) may hit Supabase's built-in SMTP rate limit (~2–4/hr).
  Password login is kept working as the demo fallback — **do not remove it**.
