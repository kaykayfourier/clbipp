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
| 3 | **B2 — pricing engine + `createPickupWithItems`** | B | ✅ done, committed `ac07895` |
| 4 | A2/A3 — address book + storage upload helper | A | ✅ done, committed `73bc512` |
| 5 | **A4 — 4-step booking wizard** (the centrepiece) | A | ✅ done, staged |
| 6 | A1 — email OTP + `/verify` + roles | A | ⏭ **next — start here** |
| 7 | A5/B7 — tracking upgrade (partner, custody log) + copy fix | A/B | pending |
| 8 | B3/B6 — PDF generation + payment + receipt screens | B | pending |
| 9 | B4/B5 — dashboard impact (CO₂) + compliance CSV | B | pending |
| 10 | P2 screens (wallet, invoices, history, profile, `/t` parity) + **deploy** | A | pending |

**Cut order if time runs short** (Plan v2 §8): P2 screens → wallet → invoices →
receipt PDF (keep the screen) → address GPS.
**Never cut:** booking flow, `BatteryItem`, tracking, EPR certificate.

---

## ▶ Next: Batch 6 — A1, email OTP + `/verify` + roles

Everything the booking flow needed is now built, so Batch 6 is back on the auth
lane. Three things are already staged for it:

- **`createAuthMiddleware({ …, allowRoles })`** in `packages/auth/src/middleware.ts`
  is written and wired but **commented out** in `apps/customer/src/middleware.ts`.
  Batch 6 turns it on. `Profile.role` exists and the seed populates it
  (`customer` / `agent` / `admin`).
- **Password login must keep working.** Supabase's built-in SMTP rate-limits at
  roughly 2–4 mails/hour, which is not enough to demo through. OTP is added
  alongside password login, not in place of it.
- `apps/customer/src/middleware.ts` **must stay under `src/`** — Next's dev
  bundler silently never registers root middleware when `src/app` is in use.

---

## What Batch 5 delivered — the 4-step booking wizard

`/book` replaces `/request-pickup` (which is now a redirect). Nine new files
under `apps/customer/src/app/(app)/book/`:

| File | What it is |
|---|---|
| `page.tsx` | server component — resolves the caller, loads operational addresses |
| `BookingWizard.tsx` | `"use client"` — holds the whole draft, owns step nav |
| `StepCategory.tsx` | step 1 — category radio cards |
| `StepItems.tsx` | step 2 — line rows: quantity, weight, condition chips, photos |
| `StepSchedule.tsx` | step 3 — address picker, preferred date, notes |
| `StepReview.tsx` | step 4 — indicative quote + summary |
| `actions.ts` | `"use server"` — `quoteBooking`, `submitBooking` |
| `copy.ts` · `types.ts` | labels + draft shapes, shared by the steps |

**Nothing is written until step 4.** A half-finished booking must not exist as a
row — the dashboard, tracking and compliance screens all read pickups
unconditionally.

### The decisions worth knowing

1. **One category per pickup, not per line.** `Pickup.category` is a single
   header column, so a mixed basket could not be represented faithfully. Step 1
   sets it, every line inherits it, and `bookingSubmissionSchema` has a `.refine`
   that rejects a payload where they disagree. The screen tells the customer to
   book mixed loads as separate pickups. `BatteryItem.category` still exists per
   item because the *agent* may reclassify on site.
2. **The quote is recomputed server-side on submit.** The wizard displays the
   quote it got from `quoteBooking`, but `submitBooking` calls `getQuote` again
   on the submitted lines and writes *that* number to
   `Pickup.indicativeQuotePaise`. A client-supplied price is a price the customer
   can set themselves.
3. **Photo paths are ownership-checked.** Every path must start with
   `<caller-uid>/`. Storage RLS already scopes reads, but without this check a
   hand-rolled payload could attach another customer's object path to its own
   pickup, where it would surface in the agent's and the certificate's view.
4. **A failed quote never blocks a booking.** If `getQuote` throws, the pickup is
   written unpriced and the agent quotes on site. Pricing is a convenience; the
   booking is the product.
5. **`preferredDate` stays a `"YYYY-MM-DD"` string end-to-end**, and the date
   `min=` uses a locally-computed today. `toISOString()` on a local Date shifts
   the day for anyone east of UTC — which is everyone here.
6. **`scheduledSlot` is written as `null`.** The customer states a *preferred*
   date; the slot is what ops confirm. Two columns, two different facts.

**One divergence from this file's Batch 5 brief:** the photo step calls
`uploadFile` per file rather than `uploadFiles` on the batch. Same module, same
behaviour — but the per-file call keeps each result **paired with its `File`**,
which the batch helper's flat `paths` array cannot do once one upload fails. The
pairing is what makes the thumbnail possible: the buckets are private, so the
preview is a local `URL.createObjectURL(file)` blob rather than a signed-URL
round trip per photo. Partial success still behaves as specified — the paths that
landed are kept, and only the failures are re-prompted.

### Collateral fixes (caused by this batch, not scope creep)

New bookings leave the schema-v1 columns null, which broke two screens that
still read them:

- **Dashboard** row subtitle read `batteryType · approxQuantity` and would have
  rendered `null · null`. Now reads category + `_count.items`, with a fallback to
  the old columns for the handful of legacy rows that have no `BatteryItem`.
- **`/submitted`** read `battery_type` through the session client. Now reads via
  Prisma (scoped by `vendorId` in code), and shows category, line count and the
  indicative quote.
- **`/request-pickup`** is a `redirect('/book')`. Kept rather than deleted
  because it's the URL every older doc and screenshot points at.

### Verified

- `npm run build` green (**24 routes**, `/book` present), `npm run lint` clean,
  **59 tests** (20 decision-engine + 16 auth + 23 core — 11 new booking-schema
  tests in `packages/core/src/validation.test.ts`).
- `npm run smoke` — all 8 routes render as `business@test`, including `/book`
  at 200 and `/request-pickup` → 307 → `/book`.
- **Content-asserted, not just status-asserted:** a logged-in fetch of `/book`
  renders step 1 — the step indicator, all four category cards and the
  "you don't need to know it" chemistry disclaimer — and is *not* the
  no-address fallback.
- **Against the real database** (throwaway script, rows deleted after, seed count
  asserted back to 8): a 2-line booking writes one pickup + 2 `BatteryItem` +
  one `requested` `StatusEvent`; `indicativeQuotePaise` equals the recomputed
  quote; `conditionFlags` carries only the non-healthy line; the id matches
  `PKP-YYYY-XXXXXX`; `preferredDate` stores the chosen day; an unknown/foreign
  `addressId` returns `{ ok: false }` without writing; the picker query excludes
  the seeded `not_operational` address; and the schema rejects traversal in a
  photo path and an empty basket.

### Known gaps in this batch

- **Photos uploaded into an abandoned draft are orphaned** in `pickup-photos`.
  Removing a photo or a line deletes its object, but closing the tab mid-booking
  does not. Needs a sweep of `<uid>/bookings/…` objects with no referencing
  `BatteryItem` — worth doing before launch, not before the demo.
- **A draft does not survive a refresh.** State is in React only. Deliberate:
  persisting it means either localStorage (which would hold blob URLs that die
  with the page) or a draft row (which is the "half-finished booking" this batch
  explicitly avoids creating).
- **Stored photos are still never rendered back.** `createSignedUrl` from
  `@clbipp/auth/storage-server` is written and still unconsumed — Batch 7's
  chain-of-custody timeline is where the booking photos get displayed.
- Post-submit the customer lands on `/submitted` → `/scheduled?id=`, the existing
  requested-state screen. Untouched this batch.
- **Needs a real handset** (end-of-revamp manual pass): the camera/file-picker
  sheet, multi-photo selection, and the 4-step flow's feel on a small screen.

---

## What Batch 4 delivered — address book + storage helper

### A3 — storage helper

Two files, deliberately split so `server-only` can't leak into the client bundle:

- **`packages/auth/src/storage.ts`** (browser) — `BUCKETS`, `MAX_FILE_BYTES`,
  `buildObjectPath`, `uploadFile`, `uploadFiles`, `removeFile`. Exported as
  `@clbipp/auth/storage`. `buildObjectPath` is the single place that guarantees
  the `<user-id>/…/<filename>` layout **every** storage RLS policy checks via
  `storage.foldername(name)[1]` — it sanitises the filename, strips traversal,
  and adds a timestamp+random prefix so two `img_0001.jpg` files don't collide
  (we never pass `upsert: true`; an overwrite would destroy an audit photo).
- **`packages/auth/src/storage-server.ts`** (`server-only`) — `createSignedUrl` /
  `createSignedUrls`, exported as `@clbipp/auth/storage-server`. All five buckets
  are private, so this is the only way a stored path ever becomes viewable.
  Not consumed yet; Batch 5/7/8 need it.
- 13 new tests in `storage.test.ts` (path building, traversal, size limits).
  **Workspace total is now 48** (3 auth + 13 storage + 20 decision-engine + 12 booking).

⚠ Unchanged known gap: `kyc-docs` has an upload policy but **no read or delete
policy**, and `certificates` / `receipts` / `invoices` have none at all. All are
read via server-generated signed URLs, so this is fine as designed — but a
browser-client read of a KYC doc will 403.

### A2 — address book

- `/addresses` (list) and `/addresses/new` under `apps/customer/src/app/(app)/addresses/`.
  `page.tsx` is a server component; `AddressList.tsx` is the `"use client"` island
  holding the row buttons (a server component can't pass `onClick` — that's the
  crash that took out `/scheduled`); `AddressForm.tsx` is client for
  `navigator.geolocation`; `AddressChip.tsx` renders on the dashboard.
- `addressSchema` added to `packages/core/src/validation.ts` — 6-digit PIN,
  blank-to-undefined preprocessing for optional FormData fields, and a refine
  that forces lat/lng to be set together.
- GPS via `navigator.geolocation` only. **No embedded map picker** (needs a
  billed Maps key). Coordinates stay optional — a denied permission prompt still
  saves the address.

**Correction to the Batch 2 note below:** "the new tables are SELECT-only,
`Address` included" is **wrong for `addresses`**. `supabase/policies.sql:132-164`
grants the owner all four verbs scoped `auth.uid() = profile_id`, and a
`pg_policies` query confirms all four are applied in the live database — it is
"the one new table the customer writes directly". `battery_items` is the
SELECT-only one. A browser-session address insert *would* succeed.

**We still write from a server action with Prisma, for atomicity, not RLS.**
"Exactly one default per profile" is a two-statement invariant and a session
client has no transaction. The trade is that **Prisma bypasses RLS**, so
ownership is enforced in code: every query in `addresses/actions.ts` is scoped by
`profileId`, and every mutation uses `updateMany`/`deleteMany` with
`{ id, profileId }` so a guessed id from another user matches zero rows.

`deleteAddress` also **refuses to delete an address a pickup points at** —
`Pickup.addressId` is a nullable FK with no cascade, and the seeded default
address is referenced by all 8 demo pickups, so deleting it would have orphaned
the entire demo history. It tells the customer to mark it not-operational instead.

**Verified against the real database** (script run inside a rolled-back
transaction, then deleted; seed left untouched): the default swap leaves exactly
one default, `Decimal(10,7)` lat/lng round-trip exactly when passed as strings,
a foreign address id matches 0 rows on both update and delete, the list query
never crosses users, the in-use guard fires on the 8-pickup address, and
deleting the default promotes a replacement. `npm run build` green (23 routes),
`npm run lint` clean, 48 tests passing.

**Verified rendered while logged in** (`npm run smoke`, see below): `/addresses`
returns 200 as `business@test` and renders both seeded addresses with the
Default and Not-operational badges and the GPS marker; `/addresses/new` and the
dashboard chip ("Warehouse · New Delhi") render; and as `agent@test` the same
routes render with **none** of `business@test`'s data — cross-user isolation
confirmed at the HTTP layer, not just in the query.

**Still needs a real browser** (can't be automated here, deferred to the
end-of-revamp pass): the `navigator.geolocation` permission prompt on a real
device, and visual/layout polish on a handset.

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
  writes go through service-role server actions — **with one exception:
  `addresses`, which grants the owner all four verbs** (see the Batch 4
  correction above). The 4 agent/admin scaffolding tables get RLS **enabled with
  no policy** (deny-all) so they aren't left readable by any logged-in user.

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
npm run test           # 59 tests (20 decision-engine + 16 auth + 23 core)
npm run lint
npm run smoke          # logged-in smoke test — needs `npm run dev` running
npm run smoke -- agent@test demo1234    # …as a different account
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

## Testing posture for this revamp (agreed 2026-08-09)

**Aamir is not manually testing batch by batch** — one manual pass at the end of
the revamp instead. That is a fine trade *provided* each batch is verified
programmatically before it's called done, because the cost of finding a broken
screen grows the more batches are stacked on top of it.

So the bar for "batch done" is:

1. `npm run build` + `npm run lint` green, `npm run test` passing.
2. **`npm run smoke` passing** — every screen renders 200 with a real session.
   Type-checking does not catch a server component that throws at request time.
3. Anything with a data invariant (a transaction, an ownership scope) gets a
   throwaway script run **inside a rolled-back transaction** against the real
   database, then deleted. See the Batch 4 entry for the pattern.

What genuinely can't be automated here, and is the real content of the
end-of-revamp manual pass: device permission prompts (camera, geolocation),
visual/layout polish on a handset, PWA install + offline, and the
feel of the multi-step flows.

---

## Known gaps / deliberate deferrals

- `Certificate.pdfUrl` is `""` in the seed — real PDFs land in Batch 8.
- CO₂ in the seed uses ~8 kg CO₂e/kg (Li-ion) inline. The **canonical constants
  table with a cited source** is Batch 9 (`packages/core/src/impact.ts`). This is
  a compliance-adjacent claim — it needs a real citation before any demo.
- `apps/agent` and `apps/admin` are scaffolds only.
- ~~Old `(app)/request-pickup` still exists~~ — **done in Batch 5**: it is now a
  `redirect('/book')`.
- Email OTP (Batch 6) may hit Supabase's built-in SMTP rate limit (~2–4/hr).
  Password login is kept working as the demo fallback — **do not remove it**.
