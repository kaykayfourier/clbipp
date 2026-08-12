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
| 5 | **A4 — 4-step booking wizard** (the centrepiece) | A | ✅ done, committed `a8684fa` |
| 6 | **A1 — email OTP + `/verify` + roles** | A | ✅ done, staged |
| 6.5 | **Demo-blocking fixes from the first manual pass** | A | ✅ done, committed `0b58956` |
| 7A | **Lifecycle: add `arrived` + `offered` stages** | A/B | ✅ done, staged |
| 7B | A5/B7 — tracking upgrade (partner, custody log) + copy fix | A/B | ✅ done, staged |
| 8 | B3/B6 — PDF generation + payment + receipt screens | B | ✅ done, staged |
| 9 | **B4/B5 — dashboard impact (CO₂) + compliance CSV** | B | ✅ done, staged |
| 10 | P2 screens (invoices, history, profile, `/t` parity) + **deploy prep** | A | ✅ done, staged |
| 11 | **Google sign-in + `/onboarding`** (Apple dropped — see below) | A | ✅ done, committed `de602fa` |
| 12 | **Deploy** — deferred out of 10 on purpose, see `docs/DEPLOY.md` | A | 🔨 code half **done**; dashboard half (Google + Vercel) is yours to click |
| 13 | **Full-app scan** — the whole revamp reviewed end to end (brief below) | A | pending, after 12 |

> **🔀 HANDOFF POINT (2026-08-10).** Batch 11 was the last *build* batch. Every
> feature batch of the revamp is done and staged on `feat/customer-v2`. What
> remains is **Batch 12 (deploy)** and **Batch 13 (a thorough scan of the whole
> revamp and app)** — both are their own chats, and both start from this file.
> Read "▶ Resume here" immediately below before anything else.

> **No demo is being shown right now** (changed 2026-08-09). Aamir is finishing
> the revamp and the remaining batches first, then deploying a proper link. So
> "is it demoable today" is no longer a reason to cut or rush a batch — correctness
> and not having to redo work matter more than a screen being showable this week.

**Cut order if time runs short** (Plan v2 §8): P2 screens → wallet → invoices →
receipt PDF (keep the screen) → address GPS.
**Never cut:** booking flow, `BatteryItem`, tracking, EPR certificate.

---

## ▶ Resume here (2026-08-10, after Batch 11)

### Where the code is

- **Branch `feat/customer-v2`**, batches 0A–11 all applied and committed. Batch
  11 is `de602fa` (*feat(customer): Google sign-in + /onboarding for OAuth
  accounts*). The branch has **not** been merged to `main` — the revamp is still
  one branch, and the PR is the end of Batch 13.
- `npm run build` green (**34 routes**) · `npm run lint --force` clean ·
  **142 tests** · `npm run smoke` **44/44** ·
  `npm run smoke -- agent@test demo1234 --blocked` 44/44.
  (42 → 44 in Batch 12: `/handover` is finally safe to fetch.)
- **No reseed needed** — Batch 11 changed no seed data. If you reseed anyway,
  `npm run reset-demo` is safe and idempotent.

### The two things left, in order

**Batch 12 — deploy.** `docs/DEPLOY.md` is the complete runbook. It is
dashboard work (Vercel + Supabase), not code, with one exception already
flagged in its §7 (the `middleware` → `proxy` rename). §6 is now a **required**
step, not an addendum: Google sign-in is merged but not enabled in any
environment, including localhost.

**Batch 13 — full-app scan.** Brief below. This is the first time anyone has
looked at the revamp as a whole rather than batch by batch.

### What a fresh chat should read, and in what order

1. **This file** — the batch tracker, the reasoning trail, and the consolidated
   outstanding list below.
2. `docs/DEPLOY.md` — for Batch 12 only.
3. `CLAUDE.md` + `CLAUDE.local.md` — conventions and working style.
4. `docs/PLAN_V2_CUSTOMER_APP.md` — decisions D1–D7, if a question is "why is it
   like this".

Do **not** read `docs/PROJECT_STATE.md` below its top section — it describes the
pre-monorepo app and will actively mislead on file paths.

---

## What Batch 12 delivered (code half) — 2026-08-10

The deploy itself is dashboard work (`docs/DEPLOY.md`). Three code things went in
alongside it, because all three would have been visible to HR on the first click.

### 1. The Google button was laid out wrong

`OAuthButtons` passed the `<svg>` as a **child** of `Button`, and `Button` wraps
its children in a single `<span>`. So the mark and the label shared one inline
formatting context: the svg sat on the text baseline, which put it ~5px above the
label's optical centre and read as a second line, and the pair became one
shrinkable flex item that could wrap inside the fixed `h-12`.

It now goes through the **`leftIcon` prop**, which is what that prop exists for —
the mark becomes its own `shrink-0` flex item that the button's `items-center`
centres against the label. Plus `whitespace-nowrap` on the button and `block` on
the svg (killing the inline-descender gap). 18px instead of 16px reads better
against 16px semibold text.

### 2. `/handover` no longer mutates on a GET — open since Batch 6.5

The oldest item on the outstanding list, and the one that had to be excluded from
`npm run smoke` for five batches, which meant **the only screen performing a
lifecycle write was the only screen never smoke-tested.**

- **`acceptOfferAndConfirm`** (`handover/actions.ts`) is a POST form action: it
  calls the unchanged `acceptOffer`, then redirects — to `/handover` on success,
  or back to `/offer?…&error=` with a readable reason. Redirect-after-POST also
  means refreshing the confirmation re-renders instead of re-submitting.
- **`handover/AcceptOfferButton.tsx`** is a `<form>` shared by `/offer` and
  `/offer-breakdown`, so the two entry points can't drift into posting different
  things. No `"use client"` — verified to work **with JavaScript disabled**,
  which matters on the button that moves money.
- **`handover/page.tsx` is now a pure read**, and guards a direct GET: a pickup
  still before `collected` is sent back to its offer rather than shown a
  confirmation for a decision nobody made.

### 3. `/handover` was rendering `null units` — never noticed, on the demo path

The confirmation query read `battery_type` and `approx_quantity`. Those are
**schema-v1 columns that `createPickupWithItems` stopped writing in Batch 5** —
confirmed null on all 10 seeded pickups and on everything the wizard creates. So
the summary card rendered a blank battery type and the literal string
`null units`, on the screen that appears the instant a customer accepts an offer.

Now: `category` off the header row, and units + weight summed from the
`BatteryItem` lines. Chemistry is deliberately not shown — it is agent-confirmed
after collection, and this screen fires before that.

### Verified

- `npm run build` green (**34 routes**), `npm run lint --force` clean,
  **142 tests**.
- `npm run smoke` — **44 routes**, up from 42. `/handover?id=…105` is in the list
  for the first time, with content assertions on `Industrial`, `9 units` and
  `360 kg` — figures that can only come from the item rows, so they are what
  proves the schema-v1 read is gone.
- **Two paired assertions cover the GET fix**, and they need each other:
  `/handover?id=…104` must render no confirmation, **and** a re-fetch of
  `/offer?id=…104` *after* that probe must still render the offer — which it only
  does while the pickup is still at `offered`. The first alone would pass even if
  the page advanced the pickup and then redirected. Ordering matters:
  `APP_REJECTS` runs after `ROUTES`, so the re-fetch is its own step
  (`OFFER_SURVIVED_GET`) rather than relying on the earlier pass.
- `npm run smoke -- agent@test demo1234 --blocked` — 44/44 bounce.
- **The accept itself, end to end** (throwaway script, deleted after) — 17
  checks against the real database, submitting the form **as a browser with JS
  disabled would** (multipart POST to the page URL with the `$ACTION_ID_` field,
  no client JS): 303 → `/handover?id=…`; status advanced to `collected`; the
  audit event written with `actorRole: vendor` and the right note; **a second
  submit adds no second event**; the confirmation renders `Automotive`,
  `12 units`, `168 kg` and no `null units`; a non-existent id redirects to
  `/offer?…&error=Pickup%20not%20found.`; an empty id to `/dashboard`.
  `npm run reset-demo` afterwards, so the demo data is back at `offered`.

### Not done, deliberately

`middleware` → `proxy` (`DEPLOY.md` §7) is still outstanding. Renaming the file
that enforces the role gate on deploy day is the wrong order — it stays a
standalone change with a full smoke run either side.

---

## Batch 13 brief — the full-app scan

**Why this is its own batch.** Every batch so far verified *itself*: its own
tests, its own smoke routes, its own throwaway database script. Nothing has
looked across the seams. The known classes of thing that only a whole-app pass
finds:

- **Cross-batch drift** — three screens showing the same number from different
  sources, copy that contradicts between screens, a convention adopted in Batch
  8 that Batch 5's files never got.
- **Dead ends** — screens with no route in, buttons with no handler (Batch 9
  found one: the CPCB export button), `TODO`s that were fixed elsewhere.
- **The rules holding as a whole**, not per-screen: *no recovery-rate % anywhere*
  and *no material-by-material valuation to the vendor* (see "Open rules" in
  `PROJECT_STATE.md` — these are still binding and were scoped, not lifted, in
  Batch 8).
- **The parked boundary** — `packages/decision-engine` and the old field-agent
  intake code must still be untouched by the revamp.

**Suggested shape** (not prescriptive):

1. Take the consolidated outstanding list below as the starting inventory —
   confirm each item is still true rather than trusting it.
2. Read the whole customer app once, screen by screen, against
   `docs/CLBIPP_Vendor_Wireframes_1.html` and the company flow document
   (`docs/markdown-preview.pdf` — image-only, render it).
3. `/code-review` over the full `feat/customer-v2` diff against `main`. It is a
   large diff; consider `/code-review ultra` for the branch.
4. **A real manual pass on a handset** — the one thing no script has covered.
   The accumulated list is in "Manual checks owed" below.
5. Fix what is small and safe; **write up rather than fix** anything that turns
   into its own batch.

**One standing instruction that applies to this scan:** several open items are
waiting on the company, not on us (CO₂ factors, CPCB columns, GST rate,
certificate layout). Do not invent answers to those — they are listed as open
deliberately, and each is a value change in one file once answered.

---

## Consolidated outstanding list (as of Batch 11)

Everything known to be unfinished, gathered from all eleven batch write-ups so a
scan doesn't have to re-derive it. **Verify before acting** — some of these are
several batches old.

### Code — small, in our control

| Item | Since | Note |
|---|---|---|
| ~~**`/handover` mutates on GET**~~ | 6.5 | ✅ **FIXED in Batch 12.** Accept is now `acceptOfferAndConfirm`, a POST form action; `/handover` is a pure read and is finally in `npm run smoke`. See the Batch 12 section |
| `middleware` → `proxy` rename (Next 16.2.6 deprecation) | 10 | `DEPLOY.md` §7. Renames the file enforcing the role gate — do it with room to test, not on deploy day |
| Orphaned booking-draft photos are never swept | 7B | `wipeStorage` only cleans on reseed. Needs a real sweep before launch |
| Forgot-password is still a disabled button | 6 | OTP partly covers the need, so it dropped in priority |
| No wallet redemption ("withdraw to bank") | 8 | Needs bank details the app never collects. `WalletTxnKind.redemption` already exists |
| No "switch account type" flow; `vendor_type` deliberately not self-updatable | 6 | Add it to the `grants.sql` UPDATE allowlist when that screen exists |
| No account linking (same email via Google *and* password) | 11 | Supabase identity-linking behaviour, untested |
| `draftFromPickup` has no unit test | 10 | App-local, and apps hold no tests. Covered end-to-end by a smoke assertion instead |
| P5-B: GST/PAN/EPR **format** validation | 6 | Khalid's half of the validation task — presence-only today, deliberately |
| Role gate costs one `profiles` read per request | 6 | Real fix is a custom access-token hook putting `role` in the JWT (dashboard config) |

### Waiting on the company — do not invent answers

| Item | Where the answer lands |
|---|---|
| 🔴 **CO₂e factor values are unsourced; citations unverified** | `packages/core/src/impact.ts` (a value change in one file) + the copy restated in the seed. Open question 7 |
| Exact CPCB column set for the compliance CSV | `COLUMNS` in `apps/customer/src/lib/compliance-export.ts` |
| Whether GST applies to scrap from an unregistered individual, and at what rate | `taxPaise` is 0 today; the column and the line already exist |
| Authoritative EPR certificate layout | `packages/pdf/src/templates/certificate.tsx` only — the query and `CertificateDoc` are separate from it |

### Dashboard config, not repo state

| Item | Where |
|---|---|
| **Google provider not enabled anywhere, incl. localhost** | `DEPLOY.md` §6. Until then the button fails soft with readable copy |
| Email OTP sends a link, not a 6-digit code, unless the template uses `{{ .Token }}` | Supabase → Auth → Email Templates → Magic Link. Both paths work today |
| Supabase Redirect URLs need every origin | `DEPLOY.md` §4 + §6 |

### Manual checks owed — accumulated, never yet run on a real device

No script covers any of these. They are the substance of Batch 13's step 4.

- A **real Google sign-in round trip** (blocked on the dashboard config above).
- **Type an OTP code from a real inbox** — `business@test` has no deliverable
  domain, and a real send burns the ~2–4/hr SMTP budget.
- **GPS capture on a handset over LAN http** — geolocation is blocked in a
  non-secure context; the `isSecureContext` guard added in Batch 7 names the
  real cause, but the behaviour itself is unverified on a device.
- **How a PDF opens on a phone** — the route sends `Content-Disposition: inline`
  and should hand off to the system viewer rather than dropping a file.
- **At phone width:** the payment screen's radio cards, the history filter chips,
  the invoice line rows, and the profile phone form's `type="tel"` keyboard.
- **The `cancelled` state against real data** — eyeballed only, never tested.

---

## ✅ Open items raised 2026-08-09 — both RESOLVED at the start of Batch 7

Kept here because the reasoning matters, not because there's anything left to
do. Skip to "▶ Next: Batch 8" if you just want the resume point.

### 1. GPS panel — resolved: it was a copy problem after all

**What was actually happening.** Aamir confirmed he was testing on
`localhost:3000` (a secure context, so geolocation is permitted) and *did* see
the one-line `Pin saved as added reference for the collection partner.` So the
permission prompt fired, the success callback ran, and the `captured &&` branch
rendered. Nothing was broken — the copy simply confirmed nothing checkable, which
is what "nothing specific" meant.

The two hypotheses this file listed (stale bundle, non-secure context) were both
wrong for *this* report, and reproducing before rewriting is what established
that.

**The fix landed in the middle of the two extremes.** The committed Batch 6.5
version showed raw lat/lng to 5 dp, which read as too technical for a vendor app;
the working-tree simplification then stripped the coordinates *and* the map link,
leaving nothing to verify. Now: **accuracy in metres** (the one number that tells
a non-technical person whether the pin is worth keeping) plus the plain
`google.com/maps?q=` link restored so the pin can be sanity-checked. Still no
API key, still no billing. `geo.accuracy` was already being captured and had been
unused.

**Also added: a `window.isSecureContext` guard.** It changes nothing on
localhost. It matters because the end-of-revamp manual pass is on a real handset
over LAN **http**, where browsers block geolocation and hand back an error
indistinguishable from a denied prompt — so the old code would have said
"permission was denied" for something that is not a permission problem. Now it
names the real cause.

### 2. Reverse-geocode autofill — dropped, not deferred

Checked against `COMPANY_FLOW_REVIEW_2026-08-07.md` before sizing anything. GPS
appears in the company's flow document in exactly one place: **chain-of-custody
(§5.3)** — *"timestamp, GPS, photos, weight, category"* per pickup event, which
is what Batch 7B just built. The document **never asks for address autofill from
coordinates.**

So there is nothing to size. The Google-vs-Nominatim trade-off written up in
Batch 6.5 is moot unless the company asks. Don't reopen it on a hunch.

### 3. Lifecycle change — built as Batch 7A (see below)

Aamir's call was **settle the lifecycle first, then build the tracking UI once**.
Recorded honestly: A recommended the opposite (build 7B first, insert stages
later) on the grounds that `Timeline` already maps over `LIFECYCLE_STAGES` and
the custody log renders `StatusEvent` rows — both stage-list-agnostic, so the
later rework would have been two label entries plus the track-page buckets rather
than a rebuild. Aamir chose the settle-first path anyway and it was built that
way in full. In hindsight it was the better call for one reason neither side
raised up front: the guard change (`/offer` admitting `offered` exactly) also
changed the *seed*, and doing that after 7B would have meant re-verifying the
custody log against renumbered pickup ids.

---

## What Batch 7A delivered — `arrived` + `offered`

**New locked contract, nine stages:**

```
requested → scheduled → arrived → offered → collected → tested → processed
  → recovered → certified          (+ cancelled)
```

`arrived` before `offered` because the company flow document puts assessment and
quoting **on site**, in that order. The indicative quote shown at booking is a
different object — `Pickup.indicativeQuotePaise`, not an `Offer` row — so the two
models coexist without further reconciliation.

### The migration

`20260809124400_lifecycle_arrived_offered`, hand-written rather than taking
Prisma's generated append:

```sql
alter type "PickupStatus" add value if not exists 'arrived' after 'scheduled';
alter type "PickupStatus" add value if not exists 'offered' after 'arrived';
```

- **Non-destructive.** Adds labels only. No column altered, no row rewritten, no
  backfill possible or needed (neither label existed, so no row could hold one).
- **`AFTER`, not a plain append**, so the Postgres enum sort order matches the
  logical order. Nothing in the app orders by status today (every `orderBy` is
  `createdAt` or `occurredAt` — checked, not assumed), so this is correctness for
  whoever reads the type next rather than a bug fix. **Verified in the live
  database**: `pg_enum` now reads
  `requested → scheduled → arrived → offered → collected → … → cancelled`.
- Safe inside Prisma's transactional migration runner: PG 12+ allows `ADD VALUE`
  in a transaction as long as the new label isn't *used* in the same one.
- Applied with `prisma migrate deploy`, not `migrate dev` — `deploy` applies
  pending migrations without a drift check, which is what you want for a
  hand-written file.

> **Doc discrepancy worth knowing:** `docs/ai-prompts/database-create-migration.md`
> describes **Supabase CLI** migrations in `supabase/migrations/`. This repo has
> no such directory — it uses **Prisma** migrations in
> `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`. The
> runbook's SQL *guidelines* (header comment, lowercase, comment anything
> destructive) were followed; its file-location convention does not apply here.

### Stage order now has one source of truth per layer

| Layer | Where |
|---|---|
| Database | `enum PickupStatus` — `packages/database/prisma/schema.prisma` |
| UI order + labels | `LIFECYCLE_STAGES`, **`STAGE_LABELS`** — `packages/ui/src/tokens.ts` |
| Validation | `pickupstatusSchema` — `packages/core/src/validation.ts` |
| Seed | `LIFECYCLE` — `packages/database/prisma/reset-demo.ts` |

**`track/[id]/page.tsx` and `t/[token]/page.tsx` each carried a private duplicate
of the stage array. Both are deleted.** They were the real drift risk — a stage
added to `tokens.ts` but not to those two would have rendered a timeline the
screens then failed to switch on. Screens now call two new helpers exported from
`@clbipp/ui`:

- **`isLifecycleStage(status)`** — narrows a status string to the linear lifecycle.
- **`isStageBefore(stage, other)`** — ordered comparison. Returns **false** for
  `cancelled` and for anything unknown, rather than the `-1` a bare `indexOf`
  comparison would silently treat as "earliest". A cancelled pickup has left the
  progression; it has not paused partway along it.

`STAGE_LABELS` also moved out of `timeline.tsx` into `tokens.ts`, because the
custody log labels the same stages and a timeline row reading "Agent arrived"
above a custody entry reading "arrived" is the kind of mismatch nobody notices
until a demo.

### The guard change — the point of the whole batch

`/offer` and `/offer-breakdown` guarded on `status !== "requested" && status !==
"scheduled"`. They now guard on **`status !== "offered"`** — an exact match.

That is what makes an offer *addressable* rather than *inferred*. Consequences:

- `handover/actions.ts` replaced its hard-coded `PRE_COLLECTION` set with
  `isStageBefore(status, 'collected')`, so adding a stage can't silently lock
  accept/cancel out of it.
- `scheduled/page.tsx` clamps to `collected` via the same helper instead of a
  two-value ternary, and its `collected` sublabel changed from "Awaiting agent"
  (now `arrived`'s job) to "Awaiting handover" — two consecutive rows saying the
  same thing reads as a bug.
- **Dashboard rows at `offered` now link to `/offer`**, not `/track`. It is the
  one stage waiting on the customer, so the row should land on the decision.
- `StatusBadge` gets `AGENT ON SITE` (info) and `OFFER READY` (**warning**-
  coloured on purpose — `offered` is waiting on the customer and should not read
  as passive progress).

### Seed: 8 pickups → 10, renumbered

One pickup per stage, so ids still track stage order:
`101 requested · 102 scheduled · **103 arrived** · **104 offered** · 105 collected ·
106 tested · 107 processed · 108 recovered · 109 certified · 110 cancelled`.

- **`PKP-2026-000104` is the new offer demo pickup.** `scripts/smoke.mjs` was the
  only other file referencing the old ids.
- **Offers now seed from `offered` onward**, not `scheduled`. Exactly one seeded
  pickup sits *at* `offered`, so exactly one is reachable through the guard.
- The Batch 6.5 `Math.max(spec.daysAgo - 5, 0)` clamp is gone. Offer `createdAt`
  is derived from the `offered` stage index — the same arithmetic the status-event
  loop uses — so it cannot drift into the future the way the fixed offset did.
- `etaMinutes` is set at `scheduled` and **null from `arrived` onward**: once
  they're at the gate, an ETA is wrong.

### Verified

- `npm run build` green, `npm run lint` clean (forced past the turbo cache),
  **78 tests** (unchanged — this batch adds no new pure logic).
- `npm run smoke` — all routes, including `/offer?id=PKP-2026-000104` at 200 with
  content assertions.
- **Against the real database** (throwaway script, deleted after) — 16 checks:
  both enum labels exist *in the right position*; seed is 10 pickups; exactly one
  at `arrived` and one at `offered`; exactly one pickup passes the `/offer`
  guard and it has an Offer row; no offer is future-dated; `PKP-2026-000104`'s
  custody chain is exactly `requested,scheduled,arrived,offered`; every event
  carries GPS; ETA present at `scheduled` and null at `arrived`.

### 🔎 A smoke-test blind spot this batch exposed — worth knowing for Batch 8

The first attempt asserted the tightened guard by expecting a **3xx + `Location`
header**. It failed against a correct app.

**Why:** `/offer` has a `loading.tsx`. Next flushes the shell before the guard's
`await`s finish, so `redirect()` travels **inside the RSC stream** — the response
is a **200 with no `Location` header** even though the redirect works. Confirmed
by fetching with a real session: the body contained none of the offer markers.

**So a redirect on any route with a `loading.tsx` cannot be asserted by status.**
`smoke.mjs` now has an `APP_REJECTS` map asserting on **absent content**, which
survives streaming, and `probe()` gained `mustNotContain`. `/request-pickup`
still shows a clean 307 because it redirects before any `await`.

---

## What Batch 7B delivered — partner card, chain-of-custody, copy fix

### Real photos in the private bucket (the thing deferred three times)

The seed wrote `photoUrls: []` everywhere, so `createSignedUrl` had been written
in Batch 4 and left unexercised through Batches 5, 6 and 6.5 — three batches of
"the next one will use it".

- **`packages/database/prisma/placeholder-image.ts`** — a ~90-line PNG encoder
  (chunk framing + CRC-32 + `node:zlib`). Hand-rolled rather than adding an image
  dependency, and **generated rather than committed**, so no binary fixtures land
  in git. Solid colour with a darker border so a thumbnail grid reads as several
  distinct photos.
- **Path ownership is honest**: booking photos under the **vendor's** uid,
  custody photos under the **agent's** — because that is who took them. Both
  match the `<uid>/…` layout every storage RLS policy checks via
  `storage.foldername(name)[1]`. All reads go through server-minted signed URLs,
  so the split costs nothing.
- **Custody photos only on `arrived` and `collected`.** A `processed` event in a
  facility has a timestamp and a location, not a photo from the agent.
- `Pickup.photoUrls` is kept as the deduped union of its items', so older
  header-field reads still work.

**`wipePhotos` walks the subtree recursively.** The first version only removed
objects at the exact depth the seed writes (`<uid>/bookings/<pickup>/<file>`) —
and verification caught a **real leftover it walked straight past**: an
`istockphoto-….jpg` sitting at `<uid>/bookings/`, uploaded by the booking wizard
during earlier manual testing and orphaned when that draft was abandoned (the
known Batch 5 gap). The recursive version sweeps it. Note this only cleans up
**on reseed** — it is not a fix for the orphaned-draft gap itself, which still
needs a real sweep before launch.

### Assigned-partner card

`packages/ui/src/components/ui/partner-card.tsx` — presentational, rendered only
when `pickup.agentId` is set. No schema change; every field already existed.

- `Profile.fullName`, `phone` as a **`tel:` link** (a phone number you can't tap
  is half a phone number), `agentVehicle`, `agentRating`.
- The track query selects **only those four columns**, not the whole agent
  Profile — pulling `agentZone`, `kycStatus` and `walletBalancePaise` into a
  customer page's payload would be careless.
- **ETA wording is status-dependent, not minutes-dependent**: "Arriving in about
  45 min" at `scheduled`, **"On site now."** at `arrived` (where `etaMinutes` is
  deliberately null), nothing later.

### Chain-of-custody log

`packages/ui/src/components/ui/custody-log.tsx`, fed by
`apps/customer/src/lib/custody.ts` (`server-only`).

**Rendered below `Timeline`, not instead of it** — they answer different
questions. `Timeline` = "how far along, and what's left", including stages that
haven't happened. `CustodyLog` = "what was actually recorded, by whom, where",
from real `StatusEvent` rows only, inventing nothing.

- Per entry: stage label (shared `STAGE_LABELS`), timestamp, actor attribution,
  GPS as a plain `google.com/maps?q=` link, photo thumbnails.
- **One `createSignedUrls` batch call for the whole log**, not one per photo. It
  already drops individual failures, so a missing object costs one thumbnail
  rather than the card.
- Plain `<img>`, not `next/image`: these are 1-hour signed URLs, which the image
  optimiser would try to cache past their lifetime.
- `buildCustodyEntries` lives in the **app**, not `packages/core` — it produces a
  `@clbipp/ui` view model, and core must not depend on the UI package.

**`/t/[token]` gets GPS and the custody timeline but NOT photos, and no partner
card.** `includePhotos: false` **skips minting the URLs entirely** rather than
hiding rendered images — an unrendered signed URL is still a live capability if
it reaches the client. Reasoning: the token is a bearer capability that can be
forwarded to anyone; premises/stock photos are more sensitive than the stage
timestamps and recovered weights already shown there, and an anonymous link
should not hand out an agent's personal phone number. **Deliberate default —
flag it if the company wants otherwise.**

### B7 — notification copy

There is no SMS/WhatsApp/push pipeline (Plan v2 §1.3 A3, not built), so the app
no longer promises one. Three files: `track/[id]` ("This screen updates itself as
your batteries move through each stage"), `submitted` ("Track this pickup here —
the status updates as soon as a collection partner is assigned"), and the
`design-system` sample.

### Verified

- `npm run build` green, `npm run lint` clean, **78 tests**. (The two build
  warnings — the `middleware`→`proxy` deprecation and Prisma's CJS `export *` —
  both pre-date this batch.)
- `npm run smoke` — **all 17 routes**, including two new tracking screens with
  content assertions. `/track/PKP-2026-000103` asserts `Collection partner`,
  `Ravi Kumar`, `On site now`, `Chain of custody`, `Agent arrived`,
  `View location` **and `token=`**. That last one is the load-bearing assertion:
  `token=` only appears in the HTML if `createSignedUrls` actually minted a URL
  for a stored object, so it proves the private-bucket read path **end to end**
  rather than proving an empty photo row rendered.
- `npm run smoke -- agent@test demo1234 --blocked` — all 17 still bounce.
- **Against the real database + Storage** (throwaway script, deleted after) — 14
  checks: every battery item has a photo; booking paths carry the vendor uid and
  custody paths the agent uid; custody photos exist on `arrived,collected` and
  nowhere else; `Pickup.photoUrls` equals the union of its items'; a signed URL
  **fetches 200 and the bytes are a real PNG**; an **unsigned** read of the same
  path returns **400** (private is private); zero orphaned objects and zero
  dangling paths after a reseed.
- **Public route checked directly** for `arrived`, `certified` and `cancelled`
  tokens: 200, custody log and GPS present, **no signed photo URL and no partner
  card in the body** — the isolation is asserted, not assumed.

---

## What Batch 8 delivered — three PDFs, payouts, and a wallet

The P0 demo path runs end to end for the first time: **book → track → collected
+ receipt → payment → certified → EPR certificate PDF.**

### `packages/pdf` — a new workspace package

`@react-pdf/renderer` v4 (React 19 is in its peer range — checked, not assumed).
Its own package rather than a folder in the app, because the admin app will need
the same three documents, and dragging a 3 MB PDF renderer into `packages/core`
(which client components import) or `packages/ui` would be a mistake that's hard
to undo later.

| File | What |
|---|---|
| `src/types.ts` | `CertificateDoc` / `ReceiptDoc` / `InvoiceDoc` — **plain data, no Prisma types and no `Decimal`**. A Decimal reaching a template renders as `[object Object]`; the caller maps |
| `src/theme.ts` | react-pdf `StyleSheet` + `formatDocDate` |
| `src/templates/*.tsx` | certificate · receipt · invoice · shared `brand.tsx` |
| `src/render.tsx` | `renderCertificatePdf` / `renderReceiptPdf` / `renderInvoicePdf` → `Buffer` |

- **`server-only` lives in `render.tsx`, not in the templates or the types** —
  the same split as `@clbipp/auth`'s `storage.ts` / `storage-server.ts`. A
  `server-only` import anywhere in a module's graph turns any client component
  touching it into a build error, so only the *act of rendering* is server-bound.
- `next.config.ts` gains `@clbipp/pdf` in `transpilePackages` **and
  `serverExternalPackages: ["@react-pdf/renderer"]`** — it reaches for `fs`/fonts
  to resolve fonts, and it only ever runs in the Node route handler.
- Helvetica, one of the 14 PDF base fonts, so **no font binary ships with the
  repo**.

### Numbering is derived, so no migration was needed

`packages/core/src/documents.ts` — pure, 9 tests:

- `certificateNumber()` → `CERT-{YEAR}-{pickupId}-{CATEGORY}`, the format in
  Plan v2 §5. `Certificate` has **no number column** and doesn't need one. The
  year comes from the *certification* date, not the pickup id: a load collected
  in December and certified in January belongs to the later compliance year.
- `invoiceNumber()` → `INV-{YEAR}-{serial}`, reusing the pickup's own serial
  rather than a sequence column (which would need a migration *and* a lock;
  `Invoice.pickupId` is already `@unique`).
- **`formatPaise()` is now the single ₹ formatter in the app.**
  `formatOfferPrice` delegates to it, so an offer and a payout can't disagree
  about how ₹1,84,500 is written.

### The download route streams bytes — a deliberate change of plan

`GET /api/documents/{certificate|receipt|invoice}/{pickupId}` (`runtime =
'nodejs'`), backed by `apps/customer/src/lib/documents.ts`.

Batch 7 left a note saying these should use a **signed URL**, the way custody
photos do. That was reconsidered and rejected. A signed URL is a bearer
capability that keeps working for an hour after it leaves our control — pasted
into a chat, sitting in browser history — for a document that names a customer
and states what they were paid. An `<img>` needs a URL; a download does not.
**Streaming keeps the session as the only key**, and it let the smoke test
assert real `%PDF-` bytes. Signed URLs remain correct for photos.

Three more decisions worth knowing:

1. **Generation is lazy.** First request renders → uploads → caches; every
   request after serves the stored object. The seed and the agent flow stay free
   of any PDF dependency, and a template change reaches old documents by deleting
   the cached object rather than by a backfill. A missing object is non-fatal —
   it re-renders.
2. **`pdf_url` holds a storage PATH, not a URL**, despite the column name (kept
   as-is; renaming it is a migration for a cosmetic gain). Storing a signed URL
   would have been the obvious thing and is wrong — it expires, so the stored
   value silently rots.
3. **The ownership-scoped read happens first, unconditionally**, before any
   cached path is trusted. Reversing that would let a known pickup id fetch a
   cached object without ever proving ownership. A foreign id and a missing
   document return the **same 404** — a 403 would confirm that a guessed id
   exists.

### Payments — `packages/core/src/payments.ts` + `payment-actions.ts`

14 more tests. `PAYMENTS_MODE` was already in `turbo.json` `globalEnv`.

- **Defaults to `simulated`, and an unrecognised value falls back to simulated
  too.** The dangerous direction is a typo being read as production, so a typo
  degrades to the simulation, never to real money. `razorpay` mode currently
  fails loudly rather than pretending to settle against a gateway that isn't there.
- **`cash` is excluded from the customer-selectable methods.** It stays in the
  schema enum because an agent may settle in cash on site — but it is something
  that *happened*, not something a customer picks. Accepting it from a form would
  let anyone mark their own payout complete without money moving.
- `settlePayment()` is **idempotent, atomic and ownership-scoped**, in that order
  of importance. A double-tap or replayed post must not write a second
  `WalletTxn`; that would credit the customer twice and put the ledger
  permanently out of step. `creditWallet` guards on the existing row too, so the
  idempotency doesn't depend on the caller.
- Ledger and cache are written **together**: `WalletTxn` is the source of truth,
  `profiles.wallet_balance_paise` is its sum. `nextBalance` throws rather than
  clamping if a debit would go negative — clamping would destroy the evidence
  that the two had already diverged.

### 🐛 A real bug the verification script caught

The first run of `settlePayment` against the **real** database failed:

```
Transaction already closed … timeout was 5000 ms, however 5325 ms passed
```

Prisma's default interactive-transaction timeout is 5s and this transaction does
eight sequential round trips — fine locally, not fine against a remote Supabase
Postgres. **Atomicity did its job** (the balance was unchanged; nothing was
half-written), but a customer whose payout fails because their connection was
slow is a real failure.

Fixed by raising the timeout to 20s rather than splitting the work into separate
transactions: the ledger row and the balance cache **must** land together, and
splitting them to fit a timeout would trade a visible error for a silently wrong
balance. **This is exactly the class of thing `npm run build` cannot see** — it
type-checked green and would have shipped.

### Screens

| Route | What |
|---|---|
| `(app)/receipt/[id]` | receipt no, collection time + agent, units/weight/₹, GPS link, download. Says out loud that it is **not** the EPR certificate |
| `(app)/payment/[id]` | `pending` → method picker; `paid` → confirmation + invoice/receipt/wallet |
| `(app)/wallet` | balance + `WalletTxn` ledger, and a banner for any unsettled payout |
| `(app)/certificates/[id]` | the **dead "Download PDF" button now works**; + derived cert number and CO₂ |
| `(app)/track/[id]` | "Choose how you get paid" / "View collection receipt" / "View payout" from `collected` onward |
| `(app)/profile` | wallet card with the balance (the tab bar is fixed at four, so the wallet hangs off profile) |

- **Settling is a POST form action, never a page render.** `/handover` mutating
  during a GET is the standing example of why — it had to be excluded from the
  smoke test as a result. `/payment/[id]` is safe to fetch, and that is the
  point.
- **`PayoutForm` takes its method options as a PROP** rather than importing them
  from `@clbipp/core`. Core's barrel re-exports `booking-actions` and
  `payment-actions`, both of which import prisma — a *value* import from a client
  component would pull the Prisma client into the browser bundle. The two
  existing client components that touch core get away with it because theirs are
  `import type`, which erases.
- New shared `DetailRow` in `@clbipp/ui` — four screens render stacks of
  label/value rows, and four private copies is how spacing drifts.

### Seed

- **`PKP-2026-000105` (the one pickup at `collected`) now has a `pending`
  payout** — no wallet txn, no invoice. Every payment being seeded as
  already-paid left the payment screen with nothing to actually do. Everything
  further along the lifecycle is `paid` **and now also gets an `Invoice`**, which
  is what `settlePayment` produces.
- `wipePhotos` → **`wipeStorage`**, now sweeping `certificates`, `receipts` and
  `invoices` as well as `pickup-photos`. Without it every reseed orphaned one
  cached PDF per document.
- The invoice number format is **restated** in the seed rather than imported:
  `packages/database` must not depend on `packages/core` (core depends on
  database, and the cycle breaks the generated client's build).

### Verified

- `npm run build` green (**30 routes**, `/api/documents/[kind]/[id]`,
  `/payment/[id]`, `/receipt/[id]`, `/wallet` all present), `npm run lint` clean
  (forced past the turbo cache), **101 tests** (20 decision-engine + 24 auth +
  57 core — **23 new**).
- `npm run smoke` — **all 29 routes**, including the four new screens with
  content assertions and **three document routes asserting `%PDF-` in the body
  and `content-type: application/pdf`**. That last one is the load-bearing
  assertion, the equivalent of 7B's `token=`: those bytes only exist if the route
  rendered a real document, wrote it to a private bucket and streamed it back.
  Three more document routes assert the **opposite** — no invoice for a pending
  payout, no receipt at `requested`, nothing for a non-existent pickup — because
  proving a document route refuses is half of proving it works.
- `npm run smoke -- agent@test demo1234 --blocked` — all 29 bounce, **including
  the document API**.
- **Against the real database + Storage** (throwaway script, deleted after) — 27
  checks: exactly one pending payment and it has no invoice or ledger row; the
  cached balance equals `sum(ledger)` **and** every `balanceAfterPaise` matches
  the running total; a foreign `vendorId` settles nothing; a settle writes
  exactly one txn, one invoice, a `SIM-`-prefixed ref; **a second call adds no
  second txn, no second invoice, and doesn't overwrite the recorded method**;
  `pdf_url` holds a path not a URL; the stored object's bytes are a real PDF; an
  **unsigned** read of that same object is still refused; and the seed was
  restored and re-asserted afterwards.

### Known gaps in this batch

- **No wallet redemption.** "Withdraw to bank" needs bank details the app never
  collects, and a button that removes money from a balance and sends it nowhere
  is worse than no button. `WalletTxnKind.redemption` already exists for when
  that flow does.
- **`taxPaise` is 0 on every invoice.** Whether GST applies to scrap bought from
  an unregistered individual, and at what rate, is a **question for the company**
  — inventing a rate on a tax document would be worse than showing zero. The
  column and the line exist so the answer is a value change, not a schema change.
- **The certificate layout is a placeholder by decision, not by neglect.** The
  company is supplying the authoritative format; when it arrives, only
  `packages/pdf/src/templates/certificate.tsx` changes, because the data query
  and the `CertificateDoc` shape are separate from it.
- **`/handover` still mutates on GET.** Untouched here, and still the highest-
  value small fix outstanding.
- **Needs a real handset:** how a PDF opens on a phone (the route sends
  `Content-Disposition: inline`, so it should hand off to the system viewer
  rather than dropping a file in Downloads), and the payment screen's radio
  cards at phone width.

---

## What Batch 9 delivered — cited CO₂ factors, dashboard impact, CPCB CSV

### `packages/core/src/impact.ts` — the thing that must not be hand-waved

The seed wrote `co2AvoidedKg: Math.round(weight * 8)` — **one figure applied to
every chemistry**, with no citation, on a number that renders on
`/certificates/[id]` **and inside the EPR certificate PDF**. It was therefore an
uncited compliance-adjacent claim printed on a document, and for the seeded
lead-acid loads it overstated by roughly 4×.

There is now one canonical table, `CO2E_AVOIDED_KG_PER_KG`, keyed by
`BatteryType` so a chemistry added later is a **compile error rather than a
silent zero on a certificate**:

| chemistry | kg CO₂e/kg | why |
|---|---|---|
| `li_ion_nmc` | 8.0 | high Ni/Co — the emissions-heavy virgin route it displaces. Range ~6–10 |
| `li_ion_nca` | 7.5 | same family, marginally less cobalt |
| `li_ion_lfp` | 2.5 | no Co, no Ni. Range ~1–4; the **mid-low** end is taken deliberately |
| `lead_acid` | 2.0 | secondary vs primary lead, battery ~65% Pb by mass |
| `nimh` | 4.5 | Ni-dominant |
| `other` | 1.5 | conservative floor — "we don't know what it is" shouldn't earn a chemistry-specific claim |

Sources are named in the file header: Dunn et al. 2015 (*Energy Environ. Sci.* 8,
158–168, Argonne/GREET), Ciez & Whitacre 2019 (*Nature Sustainability* 2,
148–156), and secondary-vs-primary lead for lead-acid. The header also says
plainly what these are **not** — not a certified LCA, not audited, not
CPCB-issued — and that they must be swapped for the company's or a CPCB-accepted
set before any real filing. **Swapping them is a value change in that one file
and nowhere else.** That is the whole reason it exists.

**A second, separate table for unknown chemistry.** `BatteryItem.chemistry` is
*agent-confirmed* and null on everything pre-collection (the customer is never
asked for chemistry at booking — Batch 5). So there is a
`CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY` fallback: `portable 4.0 · automotive 2.0 ·
industrial 2.0 · ev 5.0`. Kept as its own table rather than mapping each category
onto a representative chemistry, for two reasons: a reader can see a fallback is
in play, and the values sit at the **conservative** end of each category's mix —
**a guess must not be able to out-claim a confirmed measurement**, and there is a
test asserting exactly that.

`co2eAvoidedKg()` **rounds once at the end, not per line**: rounding each line
and summing drifts upward on a load with many small rows, and a certificate has
to agree with a recomputation of itself. Also `aggregateMaterials()` /
`formatMaterials()`, which parse the untyped `Certificate.materialSummary` JSON
defensively — the same posture `parseMaterialWeights` already takes in `offer.ts`.

### The one duplication, and how drift is caught

`packages/database` **must not** import `@clbipp/core` (core depends on database;
the cycle breaks the generated client's build) — the same constraint that made
Batch 8 restate the invoice number format in the seed. So `reset-demo.ts`
restates the chemistry table with a pointer comment.

Drift is caught by **verification, not by hope**: the throwaway script asserts
every seeded `co2AvoidedKg` equals what `co2eAvoidedKg()` computes over that
pickup's real `BatteryItem` rows. It passes — `PKP-2026-000109` is now **300 kg**
(31.5 kg NMC + 11.4 kg LFP + 2.6 kg NCA), where the flat rate said 364.

> ⚠ **The seed certifies exactly one pickup, and it is portable Li-ion.** So the
> table's largest correction — lead-acid — is real in the code and in the tests
> but is **not visible in demo data**. If a demo needs to show it, a second
> certified pickup on an automotive load is the change.

### B4 — dashboard impact

`(app)/dashboard` keeps its three tiles and status-routed rows, and gains:

- a **wallet card** reading `profiles.wallet_balance_paise` — the **cache**
  column, the same source as `/wallet` and `/profile`, formatted with
  `formatPaise`, so the three screens cannot disagree;
- an **impact card**: CO₂e avoided as the headline, then recovered materials in
  kg, then the footnote.

**Both figures count `certified` pickups only**, read from the stored
`Certificate.co2AvoidedKg` / `materialSummary`. Deliberate: the same CO₂ number is
printed on the EPR certificate, so counting batteries still in a truck towards
"avoided" would claim an outcome that hasn't happened. The card is headed *"From
your issued certificates"* and its footnote says the CO₂ is **estimated from
published recycling factors, not measured** — the screen states what it is showing
rather than implying a measurement. The card **renders nothing at all** when
nothing is certified: `0 kg CO₂e avoided` on a new account reads as a failure
rather than as "not yet".

One query change, not four: `certificate.count()` became a `findMany` selecting
`co2AvoidedKg` + `materialSummary`, because the count, the CO₂ total and the
material list all come out of the same rows. `Number()` at the boundary so no
Decimal crosses into a component.

### B5 — compliance CSV export

The **"Export for CPCB return" button had no handler at all**. It is now a plain
`<a download>` to a real route — not a fetch + blob, because the route already
sends `Content-Disposition: attachment`, so the browser's own download handling
does the work and it survives JS being disabled or mid-hydration. **The active
year filter rides along**, so what you export is what you are looking at.

| File | What |
|---|---|
| `apps/customer/src/lib/compliance-export.ts` | `server-only`. Ownership-scoped read → `papaparse` → string |
| `apps/customer/src/app/api/exports/compliance/route.ts` | `runtime='nodejs'`, `dynamic='force-dynamic'`, streams `text/csv; charset=utf-8` |

Built on the Batch 8 document route: same `vendorId` scoping in code (Prisma
bypasses RLS), same **stream-the-bytes, never mint a signed URL**, same explicit
no-cache, same own session check rather than trusting the middleware matcher.

- **No stored object, unlike the PDFs.** A CSV is cheap to regenerate and changes
  the moment a certificate is issued; caching it would serve a stale compliance
  return, which is the one document where stale is worst. So the whole export
  path is genuinely read-only — the smoke test's documented PDF write exception
  does not extend to it.
- **One row per certificate.** A CPCB return is filed per consignment, and a
  stable column set is worth more in a spreadsheet than columns that change shape
  between exports — which is what per-material columns would do, since the
  material list varies by chemistry. Materials collapse into one text cell
  (`Nickel: 8 kg; Copper: 4 kg; …`). Columns: `certificate_number, pickup_id,
  certified_on, category, total_weight_kg, co2e_avoided_kg, materials_recovered,
  verification_link`.
- `certified_on` is **ISO, not localised** — a compliance file gets opened in an
  unknown locale where `09/08/2026` is ambiguous.
- `co2e_avoided_kg` is **blank, not 0**, when the column is null. An empty cell
  reads as "not recorded"; a zero reads as a claim.
- `verification_link` is the existing `/t/<publicToken>` page, absolute, built
  from the **request's own origin** so a Vercel export doesn't link to localhost.

### 🐛 A real bug the smoke test caught

The first version used `Papa.unparse(rows, { columns })`, which emits **nothing at
all** for an empty array — so `?year=1999` downloaded a **zero-byte file**. That
reads as a broken download rather than as "no certificates in 1999". Fixed by
switching to the `{ fields, data }` form, which guarantees the header row and the
column order in both cases from the one `COLUMNS` array. Type-checked green and
would have shipped; the assertion that caught it was "**the filter must return
headers and no rows**", not a status check.

### Collateral fix

`ComplianceClient`'s year filter list was hard-coded `["All", "2026"]`. It is now
derived from the data. That was cosmetic until this batch and is not any more:
the filter now **drives the download**, so a stale list would have quietly
exported the wrong year — and would have hidden every certificate the moment the
year rolled over. The "Total certified" card also gained a CO₂e line.

### Verified

- `npm run build` green (**31 routes**, `/api/exports/compliance` present),
  `npm run lint --force` clean, **119 tests** (20 decision-engine + 24 auth + 75
  core — **18 new**, all in `impact.test.ts`).
- `npm run reset-demo` — **required this batch**, the seeded certificate CO₂
  changed.
- `npm run smoke` — **all 32 routes**. The export asserts `content-type:
  text/csv`, the header row, and `CERT-2026-PKP-2026-000109-PORTABLE`. That
  certificate number is the load-bearing assertion, the equivalent of 7B's
  `token=` and 8's `%PDF-`: it is **derived and never stored**, so it is only in
  the file if the route ran the real scoped query and serialised the row through
  `certificateNumber()`. `?year=1999` asserts headers-and-no-rows — a filter that
  silently returns everything is worse on a compliance return than one that
  returns nothing.
- `npm run smoke -- agent@test demo1234 --blocked` — all 32 bounce, **including
  the export route**.
- **Against the real database** (throwaway script, deleted after) — 17 checks:
  the seed↔`impact.ts` drift guard; the dashboard CO₂ total equals
  `sum(certificates.co2_avoided_kg)`; the materials aggregate is sorted
  heaviest-first; the **wallet cache equals `sum(ledger)`** so the dashboard,
  wallet and profile agree; the export row count equals the certificate count; **a
  foreign `vendorId`'s export contains none of `business@test`'s certificates**;
  `?year=` filters and `?year=1999` returns none; the seed is still 10 pickups.
- CSV output eyeballed end to end: correct headers, correct disposition
  (`clbipp-compliance-all.csv`), one well-formed row, no mangled quoting.

### Known gaps in this batch

- 🔴 **THE FACTOR VALUES ARE UNSOURCED AND THE CITATIONS ARE UNVERIFIED.** The
  most important caveat in this batch, and it was initially undersold — the batch
  summary said "cited" when the honest word is **attributed**. The papers were
  named from recall; nobody opened them to check the volume/page numbers, and the
  specific numbers in the tables **were not read off a table in any of them**.
  They are plausible mid-range picks.
  **What is defensible, and is the substance of the fix, is the relative
  ordering** — high Ni/Co ≫ LFP > lead-acid is well established, and it is why
  the flat 8 kg/kg this replaced was wrong. The absolute values are a placeholder
  of the right shape.
  **Deliberately not chased down (Aamir, 2026-08-09):** the company is in EPR
  compliance and may be *required* to use CPCB-accepted factors, which would make
  anything we source ourselves irrelevant. So this waits on them —
  **open question 7** in `COMPANY_FLOW_REVIEW_2026-08-07.md`. Nothing overclaims
  in the meantime: the file header, the batch tracker and the on-screen footnote
  all say estimate. Replacing them is a value change in
  `packages/core/src/impact.ts` alone, plus the copy restated in the seed (which
  the drift check guards).
- **The exact CPCB column set is an open question for the company**, same class
  as the invoice's zero `taxPaise`. Their answer changes `COLUMNS` and the mapper
  in `compliance-export.ts` and nothing else.
- **No totals row in the CSV** — it breaks spreadsheet sorting. The screen shows
  the totals instead.
- **The seed's only certified pickup is portable Li-ion**, so the lead-acid
  correction isn't visible in demo data (see the box above).
- **`/handover` still mutates on GET.** Untouched again, and still the
  highest-value small fix outstanding.

---

## What Batch 10 delivered — invoices, history, profile, `/t` parity, deploy prep

The last of the P2 tier from Plan v2 §4. Four screens plus the one refactor the
public tracking page needed, and the repo half of deploy.

### The three decisions taken before any code

1. **Deploy is prepped, NOT executed** (Aamir, 2026-08-10). OAuth redirect URLs
   are per-origin, so standing the site up before Batch 11 means registering
   callbacks with Google/Apple twice. `docs/DEPLOY.md` is the runbook; the
   Vercel project goes up after 11. Tracked as Batch 12 in the table above.
2. **Profile phone is display + inline edit**, not display-only. `phone` was
   already on the `grants.sql` UPDATE allowlist and `normaliseIndianPhone`
   already existed — a phone row nobody can fill is a dead row.
3. **`/t` parity is delivered by EXTRACTION**, not by copying the current
   layout across. See below — this is the substance of the batch.

### Invoices — `(app)/invoices` + `(app)/invoices/[id]`

The screen renders from **`getInvoiceDoc`, the same mapper `@clbipp/pdf`'s
invoice template consumes** (`apps/customer/src/lib/documents.ts`, exported this
batch). That is the whole design: an invoice screen showing a different line
split or total from the PDF it links to would be the worst bug this surface
could have, and there is now no second implementation that could drift.

- Keyed by **pickup id**, like every other detail screen and like the document
  route. `Invoice.pickupId` is nullable in the schema for a future period-level
  invoice; nothing writes one, so the list renders those as non-navigable rows
  rather than inventing a second route for a shape that does not exist.
- `notFound()` when the mapper returns null — a foreign id and a missing invoice
  are the same answer, per the Batch 8 posture.
- Reached from `/profile` and `/wallet`. No tab: the bar is fixed at four.
- `taxPaise` is still 0 and the line still renders, so the company's answer
  stays a value change.

**🐛 Fixed while here:** the fallback invoice line description was
`"Portable batteries — 12 units"` while `quantity` was *also* its own field —
so the PDF printed the quantity twice (its own column plus the description) and
the new screen would have too. The description is now plain.

### History — `(app)/history` + repeat booking

Server/client split follows `compliance/` exactly. Filter chips (`All · Active ·
Completed · Cancelled`) are **derived from the data**, per the Batch 9 lesson
about the hard-coded `["All", "2026"]` year list.

`historyBucket` files only `certified` as completed. `recovered` means the
materials are out but the EPR certificate — the thing the customer is actually
waiting for — has not been issued, so counting it as done would say the job is
finished when it is not.

**`apps/customer/src/lib/pickup-nav.ts` is new**: `pickupHref`, `pickupSubtitle`,
and the bucket helper, lifted out of `dashboard/page.tsx`. Two lists of the same
rows routing or describing differently is a drift bug, and the status routing
(`requested → /scheduled`, `offered → /offer`) is a Batch 7A decision that
deserves one home. It lives in the app, not `@clbipp/ui`, because it is app
routing rather than a UI primitive.

**Dashboard also gained a cap.** Its `findMany` had no `take`, so an account
with forty pickups rendered forty rows on the home screen. Now five, with
"View all N" → `/history`.

**Repeat booking is `/book?from=<pickupId>`**, via a pure `draftFromPickup` in
`book/types.ts`. Carries category, per-line quantity/weight/condition, and the
address (only if it is still `operational`, else the default).

> ⚠ **Photos are deliberately NOT copied, and that is why the function exists
> rather than a spread.** A photo is evidence of one specific consignment;
> carrying last month's images onto a new booking would attach pictures of
> batteries nobody has seen to a load nobody has assessed, and the agent would
> arrive expecting the photographed goods. Same reasoning as 7B's "custody
> photos only on `arrived` and `collected`". `preferredDate` and `notes` are
> dropped for smaller reasons. Step 1 says all of this on screen.

### Profile — phone, and the screens with no tab

- Phone row with an inline edit form (`PhoneForm.tsx`, collapsed by default).
- `updatePhone` goes through the **server Supabase client, not Prisma** — the
  opposite of `addresses/actions.ts`, and for the opposite reason. Addresses
  needed a transaction so it took Prisma and re-enforced ownership in code.
  This is a single-column write with no invariant, and the thing worth keeping
  is exactly what Prisma would bypass: the `grants.sql` column allowlist.
  `phone` is on it; `role`, `kyc_status`, `wallet_balance_paise` and
  `phone_verified` are not. **A bug here cannot escalate — the database refuses
  the column.**
- Validation is `normaliseIndianPhone` from `@clbipp/core`, the same normaliser
  signup uses, so both paths store `+91XXXXXXXXXX`. Two formats in one column is
  how a later SMS integration breaks on half the rows.
- Clearing the field is supported: phone is nullable and optional at signup.
- New "Manage" card links `/history`, `/invoices`, `/addresses`.

### `/t/[token]` parity — the refactor, not a copy

`/t/[token]` and `/track/[id]` carried ~120 duplicated lines each
(`buildStages`, `safeBreakdown`, `RecoverySummary`, `LifecycleHeader`, the
cancelled-card markup). The public page had fallen behind the authenticated one
three times, always the same way: a change made in one file and not the other.

**This is the same hazard Batch 7A fixed one layer down** — both files used to
carry a private copy of `LIFECYCLE_STAGES` too. Copying the current layout
across would have reset the clock, not fixed anything.

New `packages/ui/src/components/ui/lifecycle-view.tsx` exports `buildStages`,
`LifecycleHeader`, `RecoverySummary`, `CancelledTimeline` and
`lastRecordedStage`. Both screens now render it.

- **Both screens switched to `parseMaterialWeights` from `@clbipp/core`**, which
  already drops `value_paise` defensively. This deletes the two private
  `MaterialItem` types that *named* `value_paise` in screen files — a type
  spelling out the one field the locked rule forbids rendering is a footgun one
  autocomplete away from a violation. `RecoveredMaterialWeight` in the shared
  component has nowhere to put a value, by design.
- **The isolation is now an explicit prop, not an absence.** `/t` still gets no
  photos (`includePhotos: false` skips *minting* the signed URLs, not just
  hiding images), no partner card, no realtime, no auth-only CTA — and the
  reasoning for each is written at the top of the file. Sharing the layout does
  not share the data; do not relax one because the layouts now match.

### Seed: deterministic public tokens — `/t` is finally smoke-tested

`publicToken` defaulted to `gen_random_uuid()`, which changed on every reseed.
That is why **the one screen with no session was the one screen `npm run smoke`
could never cover.** `demoPublicToken` in `reset-demo.ts` now derives it from
the pickup serial: `PKP-2026-000103` → `00000000-0000-4000-8000-000000000103`.
Valid v4 shape, obviously synthetic.

> **DEMO ROWS ONLY.** Real pickups keep the column default. The token is a
> bearer capability for a real customer's data; a derivable one would let anyone
> who knows a pickup id read its public page.

### 🐛 A real bug in the smoke test itself

`probe()` checked `mustNotContain` **before** `mustContain`, and returned
`'guarded (correct)'` as soon as nothing leaked — **silently skipping every
content assertion on any route that had both.** Harmless while the only user was
`APP_REJECTS` (no `mustContain`), wrong the moment the `/t` routes needed to
prove *both* that the page rendered *and* that the isolation held. Reordered,
and routes asserting both now report `ok + isolation held` so it is visible that
two checks ran rather than one.

### Collateral fix — the last duplicate ₹ formatter

`book/copy.ts` had its own `formatPaise` doing a local `/100`, which the
repo-wide rule forbids. It survived Batch 8 for a real reason: `StepReview` is a
**client** component, and a value import from the `@clbipp/core` barrel pulls in
`booking-actions`/`payment-actions` — and therefore Prisma — at bundle time.

Fixed properly with a subpath export: `@clbipp/core/format` → `documents.ts`,
which imports nothing at all. Same split, same reasoning, as `@clbipp/auth`'s
`storage` vs `storage-server`. `copy.ts` now re-exports rather than
reimplements, so no caller changed.

### Deploy prep — `docs/DEPLOY.md`

Repo half only, per decision 1. Vercel project settings, the full env manifest,
the Supabase redirect-URL steps, a PWA check, and the post-deploy
`SMOKE_BASE_URL=` command.

**The load-bearing fact in it:** the generated Prisma client is gitignored, so
the Vercel build command **must** go through turbo
(`cd ../.. && npx turbo run build --filter=customer`) — `turbo.json`'s
`^db:generate` dependency is what generates it. A bare `next build` fails with
missing types and an error that does not obviously point at Prisma.

Also read-and-reported, **not** changed: the `middleware` → `proxy` deprecation
(Next 16.2.6). It is a rename of the file enforcing the role gate and every
route guard, and deploy day is the worst place to find out a renamed auth
boundary behaves differently. Reasoning and a suggested handling are in §7 of
`DEPLOY.md`.

### Verified

- `npm run build` green (**34 routes** — `/invoices`, `/invoices/[id]`,
  `/history` new), `npm run lint --force` clean, **119 tests** (unchanged — see
  the gap below).
- `npm run reset-demo` — **required this batch**, the public tokens changed.
- `npm run smoke` — **all 40 routes** (was 32). New: the three P2 screens, the
  prefilled wizard, **three `/t/<token>` public routes fetched logged-out**, and
  a 404 assertion for a well-formed unknown token.
- `npm run smoke -- agent@test demo1234 --blocked` — all 40 correct: every new
  *authenticated* route bounces, and the three `/t` routes correctly do **not**.
- **The load-bearing assertions this batch** — both negative, in the 7B `token=`
  tradition:
  1. `/t/…103` must contain the custody log **and must NOT contain `token=`,
     `Collection partner` or `Ravi Kumar`.** `token=` appears only if a signed
     URL was minted, so its absence proves an anonymous bearer of a forwardable
     link got no photo capability and no agent phone number.
  2. `/book?from=PKP-2026-000109` must NOT contain `token=` either. The
     verification below confirms that source pickup **genuinely has photos**, so
     that is a real result rather than a vacuous one.
- **Against the real database** (throwaway script, deleted after) — **20 checks,
  all passing**: every `publicToken` equals the derived value and all ten are
  distinct; the three ids smoke hard-codes are at the expected stages; a foreign
  `vendorId` sees zero invoices and gets null on a real pickup id; invoice
  `total = subtotal + tax`, lines sum to subtotal, amounts are integers, and the
  **invoice total equals the settled payout**; the history buckets partition
  every pickup; and the repeat-booking source has lines, an address and photos.

### Known gaps in this batch

- **`draftFromPickup` has no unit test**, which the plan called for. `CLAUDE.md`
  is explicit that apps hold no tests and the customer app has no test runner,
  and the function is app-local UI-draft logic that does not belong in
  `packages/core`. Covered end-to-end instead by the `token=` absence assertion
  above — arguably the stronger check, since it proves the whole path rather
  than a literal `photos: []` in the source.
- **No deployment exists.** Deliberate (decision 1). `docs/DEPLOY.md` §2–4 is
  the click-through; it needs Aamir's Vercel and Supabase dashboards.
- **`middleware` → `proxy` not done.** See above and `DEPLOY.md` §7.
- **No invoice list filtering or CSV.** If one is ever wanted, it is a copy of
  `compliance-export.ts` with a different `COLUMNS`.
- **`/handover` still mutates on GET.** Untouched for the fourth batch running.
  Still the highest-value small fix outstanding, and deliberately not bundled
  into a P2-screens commit.
- **Needs a real handset** (added to the manual list): the history filter chips
  and the invoice line rows at phone width, and the profile phone form's
  keyboard behaviour (`type="tel"`).

---

## What Batch 11 delivered — Google sign-in + `/onboarding`

### Apple is dropped, not deferred-with-code (Aamir, 2026-08-10)

The provider cannot be enabled in Supabase without a **paid Apple Developer
account ($99/yr)**, so an Apple button could only ever return *"provider is not
enabled"*. Shipping dead UI to look complete is worse than not shipping it.

`signInWithOAuth` in `@clbipp/auth` is typed `'google' | 'apple'`, so if the
account is ever bought, Apple is a `<form>` in `oauth-buttons.tsx` plus a
dashboard toggle — no signature change and no rework.

### The design decision — the profile-less branch lives in the MIDDLEWARE

This file's Batch 11 brief said `/auth/callback` should gain the "no profile row
→ `/onboarding`" branch. It was built in `packages/auth/src/middleware.ts`
instead, and the reasoning is worth keeping:

**The callback is one way in, not the only one.** Once the OAuth session cookie
exists, a refresh, a bookmark, a history entry or coming back tomorrow all
arrive with the same profile-less cookie and never pass through
`/auth/callback`. Every one of them hits the middleware — which, before this
batch, signed them out. Fixing only the callback would have left the exact loop
this batch exists to close **reachable by pressing reload**.

It also costs nothing: the middleware already reads `profiles.role` for the
Batch 6 role gate, so this is a branch on a result we already have rather than a
second query. **`/auth/callback` is unchanged** — it already handled the PKCE
`?code=` shape and already refused off-origin `next` values.

New option on the shared factory, so the behaviour is opt-in per app:

| Situation | Before | After |
|---|---|---|
| No profile row, `onboardingPath` set | signOut → `/login` | → `/onboarding` |
| No profile row, already on `/onboarding` | signOut → `/login` | renders |
| **Has** a profile, on `/onboarding` | rendered the form | → `homePath` |
| Wrong role (anywhere, incl. `/onboarding`) | signOut → `/login` | unchanged |
| Infrastructure error on the read | fail **open** | unchanged |
| `onboardingPath` unset (agent · admin) | signOut → `/login` | **unchanged** |

Two rows there are load-bearing beyond the obvious one:

- **"Has a profile, on `/onboarding` → home."** Without it, an onboarded user can
  re-open a form whose submit is an `INSERT`.
- **`/onboarding` is NOT in `publicPaths`.** It needs a *session*; it just
  doesn't need a *role* yet. Adding it to `publicPaths` would make a
  profile-writing form reachable logged out, and there is a smoke assertion
  standing on that so a future redirect loop can't be "fixed" that way.

### The files

| File | What |
|---|---|
| `packages/auth/src/middleware.ts` | `onboardingPath` + the branch above |
| `packages/auth/src/supabase/auth.ts` | `signInWithOAuth`, `createProfileForCurrentUser`, shared `profileInsertPayload` |
| `packages/core/src/validation.ts` | `profileDetailsBaseSchema` + `fleetFieldsShape` extracted; `onboarding{Individual,Fleet}Schema` added |
| `(auth)/onboarding/page.tsx` · `actions.ts` | **new** — account type + the fields that choice decides |
| `(auth)/oauth-buttons.tsx` · `oauth-actions.ts` | **new** — one Google button, shared by `/login` and `/signup` |
| `apps/customer/src/middleware.ts` | one line: `onboardingPath: '/onboarding'` |

### The decisions worth knowing

1. **The uid and the email come from the SESSION, never the form.**
   `createProfileForCurrentUser` reads both from `auth.getUser()`. The uid is
   what `profiles`' RLS INSERT policy checks against `auth.uid()`; the email is
   the one Google actually verified. Accepting either from a form would let a
   row be written for someone else, or under an address nobody proved they own.
   There is a schema test asserting a posted `email`/`password` is stripped
   rather than carried through.
2. **One `profileInsertPayload`, two callers.** `signUpWithProfile` and
   `createProfileForCurrentUser` now share the column list, because
   `supabase/grants.sql`'s INSERT allowlist constrains both and two copies is
   how one of them ends up naming a column the database refuses. **`role` is in
   neither** — the database defaults it and `authenticated` has no INSERT
   privilege on the column. Both paths now carry that regression test.
   **No `grants.sql` change was needed**: its allowlist already covered exactly
   the columns onboarding writes. Verified against the live database rather
   than read off the file.
3. **The schemas were split, not copied.** Onboarding needs signup's fields
   *minus* email and password — reusing `signupIndividualSchema` would reject a
   valid Google account for missing a password it cannot have, and a second copy
   of the fleet field list is how GST validation ends up different on two
   screens. `profileDetailsBaseSchema` + `fleetFieldsShape` are now the shared
   halves; the existing signup tests are the proof the refactor changed nothing.
4. **The origin is read from the request, not an env var.** OAuth redirect URLs
   are per-origin — the fact that made deploy wait for this batch — but the app
   doesn't need telling what its own origin is. `oauth-actions.ts` reads
   `x-forwarded-host`/`host`, so localhost, production **and every preview
   deployment** work with nothing to keep in sync.
5. **An unconfigured provider is a readable error, not a stack trace.** Google
   isn't enabled in the Supabase dashboard yet, so today the button redirects
   back to `/login` saying sign-in isn't available and pointing at password and
   OTP, rather than forwarding *"Unsupported provider: provider is not
   enabled"*. **This is what let the batch be built, built green and smoke-tested
   before Aamir touches the GCP console.**
6. **"Not you? Sign out" exists for a real reason.** Signing in with the wrong
   Google account is otherwise unrecoverable — the middleware sends every route
   back to `/onboarding` until a profile exists, so without it the only way out
   is clearing cookies.
7. **The button is on `/login` AND `/signup`.** With OAuth there is no
   difference between the two, and a user who sees it on one screen will look
   for it on the other. One shared component, asserted on both by smoke.

### Verified

- `npm run build` green — **34 routes**, `/onboarding` new. (Batch 10's "34" was
  one high; the actual count before this batch was 33, checked by building the
  stashed tree.)
- `npm run lint --force` clean. **142 tests** (20 decision-engine + 39 auth +
  83 core — **23 new**).
- **`packages/auth/src/middleware.test.ts` is new**, and it is the important
  one. The profile-less session is the state Google actually produces, and
  `npm run smoke` **structurally cannot create it** — smoke logs in as a seeded
  user and every seeded user has a profile row. Nine tests drive the real
  factory with a mocked Supabase client across all six rows of the table above.
- `npm run smoke` — **all 42 routes** (was 40). `/onboarding` authenticated must
  redirect to `/dashboard`; `/onboarding` anonymous must bounce to `/login`;
  `Continue with Google` asserted on both `/login` and `/signup`.
- `npm run smoke -- agent@test demo1234 --blocked` — all 42 correct, including
  `/onboarding` bouncing (a wrong-role session gets no free pass from the
  onboarding exemption).
- **Against the real database + the running app** (throwaway script, deleted
  after) — **26 checks**: a disposable auth user with **no** profile row is
  created, then `/dashboard` → `/onboarding` and **not** `/login`; a *second*
  request still routes there, which is what proves the session was not destroyed
  (`signOut` clears the refresh token, so a signed-out session cannot recover);
  every other app route routes there too; `/onboarding` renders with the right
  email; an insert naming `role: 'admin'` is **403 and writes nothing**; the
  onboarding-shaped insert succeeds and defaults `role=customer`,
  `kyc_status=pending`, `wallet=0`, `phone_verified=false`; **`/onboarding` then
  redirects to `/dashboard`** and `/dashboard` renders; `business@test` is
  untouched; the seed is still 10 pickups; and the disposable user and its row
  are deleted.
- **🐛 Caught by that script, in the Batch 10 tradition:** smoke's
  `mustNotContain` for `/onboarding` originally listed `'What kind of account'`
  — copy that **appears nowhere in the page** (the real string is lowercase and
  mid-sentence). It passed, vacuously. The verification now asserts all three
  strings are genuinely PRESENT for a profile-less session, so the negative
  assertion in smoke is provably non-vacuous. Exactly the failure mode Batch 10
  found in `probe()` itself, one layer up.

### Known gaps in this batch

- **No real Google round trip has happened.** The provider isn't enabled yet
  (prerequisites below), so what is proven is everything on our side of the
  redirect: the profile-less session, the onboarding write, the guards, and a
  readable failure when the provider is missing. The round trip itself joins
  *"type the code from a real inbox"* on the end-of-revamp manual list.
- **The `/onboarding` server action is exercised through its parts, not as a
  form POST.** `createProfileForCurrentUser` is unit-tested and the resulting
  insert is verified against the live database, but nothing posts the actual
  form — Next server actions need a generated action id, which a script can't
  forge. The real Google run covers it.
- **`vendor_type` still can't be changed afterwards**, by design (Batch 6) — it
  is not on the `grants.sql` UPDATE allowlist. An OAuth user who picks the wrong
  one needs the same "switch account type" flow a password user does, which
  doesn't exist yet.
- **No account linking.** Signing in with Google using an address that already
  has a password account is Supabase's identity-linking behaviour, untested here
  and not something the app does anything special about.
- **`/handover` still mutates on GET.** Untouched for the fifth batch running.
  Still the highest-value small fix outstanding.

### ▶ Next: Batch 12 — deploy

`docs/DEPLOY.md` is the runbook and §6 is now the Google-only OAuth checklist.
**Prerequisites Aamir must do in dashboards, not in the repo** — they gate the
live Google flow, nothing else:

1. GCP → OAuth 2.0 client (Web application). The authorised redirect URI is
   **Supabase's** callback, `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → **Google**: enable, paste the client
   id + secret.
3. Supabase → Authentication → URL Configuration → **Redirect URLs**: add
   `http://localhost:3000/**`, and the Vercel origin as part of the deploy pass.

### ⚠ Still true, still not a code task

Email OTP delivers a **6-digit code only if the Supabase email template contains
`{{ .Token }}`**. The default uses `{{ .ConfirmationURL }}` (a clickable link).
Batch 6 supports both — `/auth/callback` handles the link — so nothing is broken
either way. To make `/verify` the real demo path, edit *Authentication → Email
Templates → Magic Link* in the Supabase dashboard. Dashboard config, not repo
state.

---

## Superseded — the original Batch 7 brief and its open items

Kept for the reasoning trail. Everything below in this section is **done**; the
sections above describe what actually shipped.

### 1. GPS panel still shows nothing specific (reproduce first, don't rewrite)

Aamir pressed "Use my current location" and got nothing specific back.

**The code for this is present and verified**, added in Batch 6.5 at
`apps/customer/src/app/(app)/addresses/AddressForm.tsx` (the `captured &&`
branch). It type-checks and `npm run build` is green, so the branch compiles and
`geo.lat/lng/accuracy` are real. Copy was simplified once already (dropped the
raw coordinates + a "check this pin on a map" link — read as too technical for a
vendor-facing app) to a one-line `Pin saved as added reference for the
collection partner.` If it's still showing nothing, that confirms this isn't a
copy problem — see the repro steps below.

So **start by reproducing, not rewriting**. Most likely causes, in order:

1. **A stale bundle.** This is a `"use client"` component and the change landed
   mid-session — a dev server restart + hard reload may be all it needs.
2. **Not a secure context.** `navigator.geolocation` is blocked on plain HTTP
   from anything that isn't `localhost`. If Aamir was testing from a phone on the
   LAN (`http://192.168.x.x:3000`), the browser refuses silently-ish and the
   `failed` branch renders instead. Confirm the origin first.
3. Only if both are ruled out: check whether `captured` is narrowing as expected
   and whether the success callback actually fires (a `console.log` in
   `getCurrentPosition`'s success handler settles it in one try).

Worth adding whatever the fix turns out to be to the end-of-revamp manual list —
this is device-permission behaviour, which is exactly the class of thing
`npm run smoke` cannot cover.

**Separately flagged, not scoped yet:** Aamir suspects that if GPS capture is
mentioned in the company's flow document at all, they likely expect it to
**autofill** city/state/PIN from the coordinates, not just attach a pin as a
reference. That's reverse geocoding, not a copy fix — it needs an external API
(Google Geocoding = billed key; OSM/Nominatim = free but rate-limited with
weaker Indian coverage, per the Batch 6.5 note this doc already carries) and is
real scope, not a quick add. **Don't build it opportunistically inside the GPS
repro above** — check what the flow document actually asks for first, then size
it as its own task if the document confirms it.

### 2. 🔴 Proposed lifecycle change — `offered` and `arrived` stages

**Aamir's ask:** add a stage for the offer being made, and probably one for the
agent arriving on site. Rationale: offered pickups are currently awkward to
handle because "an offer exists" is an *implicit* sub-state of `scheduled`
rather than a status of its own — which is exactly what made the offer screens
unreachable in Batch 6.5.

**This is a change to a contract recorded as LOCKED** in `CLAUDE.md`,
`CONTEXT.md` and `PROJECT_STATE.md`. It is not a Batch 7 sub-task — treat it as
its own batch and get agreement before touching the enum.

Likely shape (**needs a decision, not an assumption**):

```
requested → scheduled → arrived → offered → collected → tested → processed → recovered → certified
```

The company flow document puts assessment and quoting *on site* — the agent
arrives, assesses, then quotes — which argues for `arrived` before `offered`.
But today's app shows an indicative quote at **booking** and treats the offer as
a pre-collection sub-state of `scheduled`. Those two models need reconciling
before the enum is written; that reconciliation is the actual work here.

**Blast radius — this is a Batch 0B-sized change, not a small one:**

| Where | What changes |
|---|---|
| `packages/database/prisma/schema.prisma` | `PickupStatus` enum + a migration. Postgres enums are ordered — inserting mid-enum needs `ALTER TYPE … ADD VALUE … BEFORE/AFTER`, not a plain append |
| `packages/ui` `tokens.ts` | `LIFECYCLE_STAGES` order + `STATUS_CONFIG` badge variants for the 2 new stages |
| `Timeline` component | two more rows, and their sublabels |
| `track/[id]/page.tsx` · `t/[token]/page.tsx` | the five status buckets both switch on |
| `offer/page.tsx` guard | currently admits `requested`/`scheduled`; would become `offered` — this is the change that makes offers cleanly addressable |
| `dashboard` | status-routed row links |
| `reset-demo.ts` | `LIFECYCLE` array; the seed is "one pickup per stage", so **8 pickups becomes 10** |
| `scripts/smoke.mjs` | the hard-coded `PKP-2026-000102` offer ids |
| docs | the locked-contract text in `CLAUDE.md`, `CONTEXT.md`, `PROJECT_STATE.md` |
| later | the parked decision engine and the Field Agent app both key off these stages |

**⚠ Sequencing — this is the part that matters.** Batch 7 builds the
chain-of-custody timeline, which *renders the lifecycle stages*. Building that
timeline against 8 stages and then inserting two more means reworking it. So
either:

- **(a)** settle the lifecycle first and build Batch 7 once against the final
  stage list — more upfront, no rework; or
- **(b)** build Batch 7 now and accept a second pass over the timeline later.

**(a) is the cheaper path** given the timeline is the whole of Batch 7's UI.
Aamir's call — `CLAUDE.md` fixes phase *order*, and this is an insertion rather
than a reorder, so it needs an explicit decision rather than a default.

---

### The original Batch 7 brief (delivered — see the 7A/7B sections above)

Per Plan v2 §5: assigned-partner card (name, phone, vehicle), ETA, and a
chain-of-custody timeline rendering per-event GPS + photos. Realtime is unchanged
and already works.

Two things Batch 6 left teed up, **both now consumed**:

- ~~`createSignedUrl` is still unconsumed~~ — consumed in 7B, and proven end to
  end (a signed URL fetches a real PNG; an unsigned read of the same path 400s).
- ~~`Profile.phone` populated at signup~~ — the partner card shows the seeded
  `agent@test` number ("Ravi Kumar").

Two Batch 6.5 conventions this batch had to respect, still binding:

- **Bottom-nav clearance is owned by `(app)/layout.tsx`.** Never add
  `contentClassName={NAV_PADDING}` to a screen — it double-pads. Any `(app)`
  screen using `AppShell` must pass `hideNav`.
- ~~`PKP-2026-000102` is the offer demo pickup~~ — **now `PKP-2026-000104`**
  after the 7A renumber, and offers seed from `offered` onward, not `scheduled`.

---

## What Batch 6.5 delivered — first manual test pass, demo-blocking fixes

Aamir ran the first manual pass since the revamp began. Five findings; three were
fixed here, two are deferred with write-ups below.

### The scroll bug was one root cause, not three

Reported as: the last dashboard pickup is clipped, the booking wizard's Back
button is unreachable, and `/submitted`'s "back to home" is unreachable — all
only visible by over-scrolling.

`(app)/layout.tsx` renders a `position: fixed` `BottomTabBar` for every
authenticated screen, but **clearance under it was each page's own job**
(`contentClassName={NAV_PADDING}` on `AppShell`). Pages forgot. The audit:

| Screen | State before |
|---|---|
| `dashboard` | No `AppShell` at all → no clearance |
| `book/BookingWizard` · `submitted` · `handover` | `hideNav` passed, padding not → bottom control fully under the bar |
| `track/[id]` · `profile` · `addresses` · `addresses/new` | Padded, but at `4rem` = 64px against a ~66px bar |

**Fix: the layout that renders the bar now pays for it.** `(app)/layout.tsx`
wraps `{children}` in `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`, and the
per-page `NAV_PADDING` consts are deleted. A page cannot opt out of a bar it
doesn't render, so it shouldn't have been the page's responsibility.

**Convention going forward:** never add bottom-nav padding to an `(app)` screen.
Do pass `hideNav` to `AppShell` there — the layout already renders the bar.

### Two further defects found while tracing it

1. **`pb-safe` was a no-op.** `packages/ui/src/components/ui/tabs.tsx` used
   `pb-safe`, which is not a Tailwind v4 built-in and is defined nowhere in this
   repo — it compiled to nothing, so the tab bar had **no iOS home-indicator
   allowance at all**. Now `pb-[env(safe-area-inset-bottom,0px)]`.
2. **Double tab bar.** `offer`, `offer-breakdown`, `scheduled` and `handover`'s
   error branch called `AppShell` *without* `hideNav`, so `AppShell` rendered a
   second `BottomTabBar` on top of the layout's. All four now pass `hideNav`, and
   the smoke test asserts **exactly one** `aria-label="Main navigation"` per
   authenticated page so it can't come back.

### Offer screens were unreachable — a seed gap, not a bug

`offer/page.tsx` Guard 3 admits only `requested` or `scheduled`, but
`reset-demo.ts` created offers only from `recovered` onward. So every pickup with
an offer was already past the stage that renders it, and the one `scheduled`
pickup had no offer. **No seeded pickup could satisfy both conditions**, and both
offer screens redirected for every id.

This also contradicted the locked model in `PROJECT_STATE.md` — "the offer is a
sub-state of `scheduled` (an Offer row exists)" — so the seed was what was wrong.
Offers are now created from `scheduled` onward (6 offers, was 2), and
`createdAt` is clamped with `Math.max(spec.daysAgo - 5, 0)` because the
`scheduled` pickup is only 3 days old and the old arithmetic dated its offer two
days into the **future**.

**`PKP-2026-000102` (scheduled, automotive) is the offer demo pickup.**
`/offer?id=PKP-2026-000102` and `/offer-breakdown?id=…` are now in the smoke
test with content assertions — a redirect returns no body, so asserting on text
is what proves the screen rendered rather than bounced.

### GPS in the address form now explains itself

The capture worked correctly all along — `lat`/`lng` flow into `Decimal(10,7)`
columns and are read by nobody *yet* (the field agent app navigates by them;
Batch 7's custody log renders per-event GPS). It read as broken because it never
autofills the form. `AddressForm.tsx` now shows the coordinates to 5 dp, links to
a plain `google.com/maps?q=` URL to sanity-check the pin (no API key, no
billing), and says the pin is saved *alongside* the typed address rather than
replacing it. No schema or action change.

**Reverse-geocode autofill was considered and rejected for now** — Google
Geocoding needs a billed key, and free OSM/Nominatim has rate limits and weaker
Indian address coverage. Revisit if the company asks for it.

### 🚩 Flagged, NOT fixed — `/handover` mutates on GET

`handover/page.tsx` calls `acceptOffer(id)` **during render of a GET request**,
advancing the pickup to `collected`. Consequences:

- It is deliberately **excluded from the smoke test**, which is documented as
  read-only — including it would advance `PKP-2026-000102` on every run and break
  the two offer routes. There's a comment in `scripts/smoke.mjs` saying so.
- More seriously, a link prefetch, a bot, or a browser preload can accept an
  offer with no user intent. `handover/loading.tsx` exists, so Next's default
  partial prefetch probably stops at the loading boundary today — but that is a
  framework detail holding up a correctness guarantee, not a design.

**The fix is to make accepting a POST / form action** rather than a page render.
Left alone here because it changes the accept flow's shape and the demo path
works as-is. Worth a small task before launch.

### Verified

- `npm run build` green (**26 routes**), `npm run lint` clean (forced past the
  turbo cache), **78 tests** (unchanged — this batch adds no new logic).
- `npm run reset-demo` then `npm run smoke` — **all 13 routes** ok, including the
  two new offer routes at 200 with their content assertions, and exactly one tab
  bar on every authenticated page.
- `npm run smoke -- agent@test demo1234 --blocked` — all 13 still bounce, so the
  role gate survived the layout change; the new offer routes bounce too.
- **Against the real database** (throwaway script, deleted after): the seed is
  still 8 pickups; offers went 2 → 6; **no offer is future-dated**; and exactly
  one offer (`PKP-2026-000102`) is reachable through the `/offer` status guard.

### Deferred out of this batch

- **Google / Apple sign-in → Batch 11** (see below). Not a small change.
- **Certificate template** → the company will supply the authoritative format.
  Batch 8 must build PDF generation with the layout swappable, not hard-coded.

---

## Superseded — the original Batch 11 brief

**Delivered — see "What Batch 11 delivered" above** for what actually shipped,
including the two places this brief was overtaken: the profile-less branch went
into the **middleware** rather than `/auth/callback` (reasoning up there), and
**Apple was dropped** rather than built. Kept for the reasoning trail.

Requested by Aamir. **The OAuth wiring is the easy half.** The real blocker:

**OAuth creates an `auth.users` row but no `profiles` row**, and the Batch 6 role
gate signs out any session whose profile read returns `PGRST116`. So a Google
sign-in today would land, be found profile-less, be signed out, and bounce to
`/login` — the exact unrecoverable loop that `shouldCreateUser: false` was added
to prevent for OTP (Batch 6 decision 1).

It cannot be fixed by relaxing the gate: the app genuinely needs `vendor_type`
(individual vs fleet), which decides which business fields and which KYC apply,
and OAuth never collects it.

**So the batch is really: OAuth + a post-callback onboarding step.**

1. `signInWithOAuth({ provider })` in `packages/auth/src/supabase/auth.ts`,
   redirecting to the existing `/auth/callback` — which already handles the PKCE
   `?code=` shape and already refuses off-origin `next` values.
2. `/auth/callback` gains a branch: session exists but no `profiles` row →
   redirect to a new `/onboarding` that collects account type + the individual or
   fleet fields, then inserts the profile row through the same allowlisted path
   `signUpWithProfile` uses (remember `role` must stay server-defaulted —
   `grants.sql` has no INSERT privilege on that column, and there's a unit test).
3. Buttons on `/login` and `/signup`.

**Prerequisites Aamir must do in dashboards, not in the repo:**

- **Google** — free: a GCP OAuth client, then client id/secret into Supabase
  → Authentication → Providers → Google. Add the callback URL for both
  `localhost:3000` and the deployed origin.
- **Apple** — needs a **paid Apple Developer account ($99/yr)**. Nothing is
  testable before that exists, so if the account isn't wanted, ship Google alone
  and leave Apple as a follow-up.

Note this interacts with deploy (Batch 10): OAuth redirect URLs are per-origin,
so the Vercel URL has to be registered with both providers.

---

## What Batch 6 delivered — email OTP + `/verify` + the role gate

Password login is **unchanged and still primary**. OTP is additive, and the
login screen shows it below an "OR" divider, because Supabase's built-in SMTP
allows only ~2–4 mails/hour — not enough to demo through.

| File | What it is |
|---|---|
| `packages/auth/src/supabase/auth.ts` | `sendEmailOtp`, `verifyEmailOtp`, `describeOtpError`; `phone` on `SignUpInput` |
| `(auth)/verify/page.tsx` · `actions.ts` | **new** — 6-digit code screen, verify + resend |
| `(auth)/login/page.tsx` · `actions.ts` | + `requestOtp` action and the "email me a code" form |
| `app/auth/callback/route.ts` | **new** — magic-link landing, so link-style emails also work |
| `(auth)/signup/*` | + optional mobile field, now validated through `@clbipp/core` |
| `packages/core/src/validation.ts` | + `normaliseIndianPhone`, `signupIndividualSchema`, `signupFleetSchema` |
| `apps/customer/src/middleware.ts` | `allowRoles: ['customer']` **turned on** |
| `supabase/grants.sql` | + profiles column-level lockdown (see below) |

### The decisions worth knowing

1. **`shouldCreateUser: false` on `sendEmailOtp`.** Left at its default, a
   typo'd address silently creates an `auth.users` row with no `profiles` row.
   Before the role gate that was cosmetic; with it, the middleware finds no
   profile, signs the session out and bounces to `/login` — an unrecoverable
   loop, and the user can't then sign up with the real address either. Account
   creation goes through `/signup`, which writes both rows.
2. **`/auth/callback` exists so the email template is a preference, not a
   prerequisite.** Code-style and link-style emails both land somewhere real. It
   handles both `?token_hash=…&type=…` and the PKCE `?code=…` shape.
3. **The role gate fails *open* on an infrastructure error, closed on a real
   answer.** A dropped connection on the `profiles` read would otherwise log the
   whole app out on a transient blip — and because `signOut` clears the refresh
   token, users could not simply retry. Only `PGRST116` ("no rows", i.e. a
   genuinely half-created account) counts as a rejection.
4. **`role` is never sent by the client at signup.** It defaults to `customer` in
   the database, and `authenticated` now has no INSERT privilege on the column,
   so the database decides it. There's a unit test guarding against someone
   adding it back.
5. **Post-login redirect is now `/dashboard`, not `/profile`** — that TODO
   ("until Person B ships the dashboard") had been stale since Batch 2.
6. **Phone is optional and stays unverified.** `phone_verified` remains false
   until SMS OTP ships (paid provider + Indian DLT registration, Plan v2 D2).
   Stored normalised as `+91XXXXXXXXXX`.

### 🔒 Privilege escalation found and closed (in scope, not scope creep)

`supabase/grants.sql` granted `authenticated` table-wide INSERT/UPDATE on
**every column**, and `policies.sql` lets a user update their own profile row.
Verified live: all 21 profile columns were self-writable. Harmless while `role`
meant nothing — but Batch 6 makes `role` the app-access boundary, so any
logged-in customer could have run

```
PATCH /rest/v1/profiles?id=eq.<own-id>   {"role": "admin"}
```

and walked into the admin app. `kyc_status` (self-clearing compliance
verification), `wallet_balance_paise` (inventing money) and `phone_verified`
(pre-defeating the later SMS OTP) were writable the same way.

Shipping the gate without this would have been a lock with the key taped to it,
so it's fixed in the same batch. **RLS cannot express it** — row policies are
all-or-nothing per statement — so the fix is column privileges in `grants.sql`:
an **allowlist**, so a column added later is non-writable until someone
deliberately opts it in. Note a table-level grant is not reduced by revoking a
column, hence revoke-then-regrant.

This is the same class as the H2 pickups hole, which was already closed.
**Already applied to the live database.** Re-runnable:

```bash
cd packages/database
npx prisma db execute --file ../../supabase/grants.sql --schema prisma/schema.prisma
```

### Verified

- `npm run build` green (**26 routes**, `/verify` + `/auth/callback` present),
  `npm run lint` clean (forced past the turbo cache), **78 tests**
  (20 decision-engine + 24 auth + 34 core — 19 new).
- **`npm run smoke` extended with a `--blocked` mode** that inverts every
  expectation, which is how the role gate is proven rather than assumed:
  - `business@test` → all 8 app routes 200.
  - `agent@test --blocked` and `admin@test --blocked` → **all 8 bounce to
    `/login`**, the first carrying `?error=That+account+cannot+access+this+app.`
  - Public auth routes are now fetched **logged out** and content-asserted
    (`/login` renders both the password form and "Email me a login code";
    `/verify` renders the code input and the email it was given).
- **Against the real database** (throwaway script, deleted after; a disposable
  auth user, `business@test` only ever read; seed asserted back to 8 pickups) —
  19 checks: a `signUpWithProfile`-shaped insert still succeeds and defaults
  `role=customer`/`kyc=pending`/`wallet=0`/`phone_verified=false`; an insert
  naming `role: 'admin'` is **rejected**; PATCHes of `role`, `kyc_status`,
  `wallet_balance_paise` and `phone_verified` all return **403**; a `full_name`
  PATCH still returns 204; nothing privileged moved; cross-user reads still see
  one row.
- **Against the real auth API:** an OTP request for an unknown address returns
  *"Signups not allowed for otp"* and **creates no user** (confirmed by listing
  users) — the `shouldCreateUser: false` guarantee, tested rather than assumed.
  `/auth/callback` with no params redirects to `/login` rather than 500ing, and
  refuses an off-origin `next` (both `https://evil…` and protocol-relative
  `//evil…`), so the login flow can't be turned into an open redirect.

### Known gaps in this batch

- **No email was actually delivered end-to-end.** `business@test` has no
  deliverable domain, and a real send would burn the ~2–4/hr SMTP budget the
  demo depends on. The code path is unit-tested and the API contract verified,
  but *"type the code from a real inbox"* is an end-of-revamp manual check
  against a real address.
- **The role gate costs one `profiles` read per request.** Middleware runs on
  every non-static request, so this roughly doubles its latency. Fine at demo
  scale; the real fix is a custom access-token hook putting `role` in the JWT,
  which is dashboard config — worth doing before launch, not before the demo.
- **Forgot-password is still a disabled button.** OTP partly covers the need
  (you can log in without your password), so this dropped in priority rather
  than being fixed.
- **`vendor_type` is deliberately not self-updatable.** Switching
  individual↔fleet changes which business fields and KYC apply, so it needs a
  real flow rather than a PATCH. Add it to the update allowlist when that screen
  exists.
- GST/PAN/EPR are validated for **presence only** — format validation is P5-B,
  Khalid's half of the validation task, left alone on purpose.

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

> **Since Batch 6, only `business@test` can enter the customer app.** `agent@test`
> and `admin@test` are signed out by the role gate — that is the gate working,
> not a broken account. Use `--blocked` to assert it.

```bash
npm run dev            # customer app (turbo --filter=customer)
npm run build          # all apps + packages
npm run test           # 119 tests (20 decision-engine + 24 auth + 75 core)
npm run lint           # add -- --force when turbo replays a stale cache hit
npm run smoke          # 40 routes since Batch 10 — needs `npm run dev` running
npm run smoke -- agent@test demo1234 --blocked   # role gate MUST block these
                       # (the three /t/<token> routes must NOT bounce)
npm run reset-demo     # wipe + reseed: 10 pickups + Storage photos
                       # (slow — it uploads real objects; give it ~2 min)
npm run create-buckets --workspace=@clbipp/database
npm run db:migrate --workspace=@clbipp/database   # = prisma migrate dev
```

> ⚠ **`npm run dev` straight after `npm run build` 404s EVERY route**, including
> `/` and `/login`, with no error in the log — just "Ready in 355ms" and a wall
> of 404s. `next build` and the Turbopack dev server share `apps/customer/.next`
> and the production output confuses dev. Fix:
> `rm -rf apps/customer/.next` and restart. Hit during Batch 10; it looks
> exactly like a broken router, which is the trap.

> **Public tracking links (Batch 10).** `publicToken` is now derived from the
> pickup serial for demo rows, so these URLs are stable across reseeds:
> `/t/00000000-0000-4000-8000-0000000001NN` where `NN` is the pickup number
> (e.g. `…000103` = the `arrived` pickup). Real pickups still get a random token.

> **Applying a hand-written migration:** `npm run db:migrate` runs
> `prisma migrate dev`, which also diffs for drift. For a migration folder you
> wrote yourself (as Batch 7A did), use `npx prisma migrate deploy` from
> `packages/database` — it applies pending migrations and records them without
> the drift check.

**Demo pickup ids (renumbered in Batch 7A — 10, one per stage):**

| id | stage | what it demos |
|---|---|---|
| `PKP-2026-000101` | requested | `/scheduled` request screen |
| `PKP-2026-000102` | scheduled | partner card with an ETA |
| `PKP-2026-000103` | arrived | partner card "On site now", custody photos |
| **`PKP-2026-000104`** | **offered** | **the only pickup `/offer` + `/offer-breakdown` admit** |
| **`PKP-2026-000105`** | **collected** | **receipt + the only `pending` payout** — `/receipt/…`, `/payment/…` method picker |
| `PKP-2026-000106` … `108` | tested → recovered | in-progress tracking; **settled** payouts + invoices (`/payment/…` paid state) |
| `PKP-2026-000109` | certified | certificate + full 9-stage custody chain + the EPR certificate PDF |
| `PKP-2026-000110` | cancelled | the terminal side-state |

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

### The end-of-revamp manual list, as it stands

Items batches have explicitly deferred to one real-device pass:

1. **Geolocation on a real handset** — the permission prompt itself, and the
   **LAN-http path**: open the app over `http://192.168.x.x:3000` and confirm the
   Batch 7 `isSecureContext` guard says *"Location needs a secure (https)
   connection"* rather than the misleading "permission was denied". This is the
   one thing about GPS that localhost can never test.
2. **Camera / file-picker sheet** in the booking wizard — multi-photo selection,
   and how the 4-step flow feels on a small screen (Batch 5).
3. **Custody photo thumbnails** on `/track/[id]` — the grid is asserted to render
   signed URLs, but not how it looks at phone width (Batch 7B).
4. **Type a real OTP code from a real inbox.** No email has been delivered
   end-to-end; `business@test` has no deliverable domain and real sends burn the
   ~2–4/hr SMTP budget (Batch 6).
5. **Open a PDF on a phone** (Batch 8). The document route sends
   `Content-Disposition: inline`, so it should hand off to the system viewer
   rather than dropping a file in Downloads — that behaviour is the browser's,
   and it can only be checked on a handset. Also the payment screen's radio
   cards at phone width.
6. **PWA install + offline**, and visual/layout polish generally.
7. **Batch 10 screens at phone width** — the `/history` filter chips, the
   `/invoices/[id]` line rows, and the `/profile` phone form's keyboard
   (`type="tel"` should bring up the numeric pad).

---

## Known gaps / deliberate deferrals

- ~~`Certificate.pdfUrl` is `""` in the seed~~ — **Batch 8**: still `""` in the
  seed *by design*. PDFs are generated lazily on first download and the path is
  cached back into `pdf_url` then. The field holds a **storage path, not a URL**.
- **The company will supply the authoritative certificate format** (flagged by
  Aamir 2026-08-09). Batch 8 built to this: the layout is swappable, template
  separate from the data query, so replacing it is a rewrite of
  `packages/pdf/src/templates/certificate.tsx` against an unchanged
  `CertificateDoc`. Don't spend design time on the current look.
- **Invoice `taxPaise` is 0 on every invoice** (Batch 8) — whether GST applies to
  scrap bought from an unregistered individual is a **question for the company**.
  The column and the PDF line exist, so their answer is a value change.
- **No wallet redemption** (Batch 8). Needs bank details the app doesn't collect.
- **The payments gateway is simulated.** `PAYMENTS_MODE=razorpay` deliberately
  fails loudly rather than pretending to settle. The payment screen says so on
  screen in simulated mode rather than hiding it.
- **`/handover` accepts the offer during a GET render** — see the Batch 6.5
  section. Excluded from the smoke test for that reason; should become a POST.
  **Still the highest-value small fix outstanding** (untouched in 7B, 8, 9 and
  10), and Batch 7A made it slightly more urgent: a prefetch that fires
  `acceptOffer` now advances the one pickup at `offered`, which is the only
  pickup the offer screens admit — so an accidental accept doesn't just mutate
  demo data, it empties the offer demo.
- **The custody log renders photos on `/track/[id]` but not on `/t/[token]`.**
  Deliberate (the token is a forwardable bearer capability), and
  `includePhotos: false` skips minting the signed URLs rather than hiding them.
  Flag it if the company wants photos on the public link.
  **Since Batch 10 this is asserted, not just intended**: the smoke test fetches
  three `/t/<token>` routes logged-out and fails if `token=` or
  `Collection partner` appears in the body.
- **The lifecycle presentation is shared, the DATA is not** (Batch 10).
  `/track/[id]` and `/t/[token]` now render the same components from
  `@clbipp/ui/lifecycle-view`. Do not read "the layouts match" as licence to
  pass the public page a partner card, photos or an auth-only CTA — the
  isolation is an explicit prop and the reasoning is at the top of
  `t/[token]/page.tsx`.
- **Repeat booking never copies photos** (Batch 10). `/book?from=<id>` carries
  category, lines and address only. A photo is evidence of one consignment;
  see `draftFromPickup` in `book/types.ts` before "improving" this.
- **Demo pickups have DERIVED public tokens** (Batch 10) so `/t` can be smoke
  tested. Real pickups keep `gen_random_uuid()`. Don't extend the derivation to
  real rows — a guessable bearer token is a leak.
- **No unit test for `draftFromPickup`.** Apps hold no tests (`CLAUDE.md`) and
  the customer app has no test runner; it is covered end-to-end by the
  `token=`-absence assertion in `npm run smoke` instead.
- **The app is not deployed** (Batch 10 decision, deliberate). `docs/DEPLOY.md`
  holds the runbook; it happens after Batch 11 so OAuth redirect URLs are
  registered once. **Batch 11 has now shipped, so this is Batch 12 and it is
  next.** ⚠ The Vercel build command **must** go through turbo — the generated
  Prisma client is gitignored.
- **`middleware` → `proxy` deprecation (Next 16) is unaddressed.** Read and
  written up in `DEPLOY.md` §7, deliberately not changed in Batch 10: it renames
  the file enforcing the role gate and every route guard, and it must stay under
  `src/` whatever it is called.
- **`wipeStorage` in `reset-demo.ts` is not a fix for orphaned draft uploads.** It
  sweeps the demo users' whole subtree in `pickup-photos` (and, since Batch 8,
  in `certificates` / `receipts` / `invoices`) on **reseed** — which is
  how the leftover `istockphoto-….jpg` from an abandoned booking was found — but
  the Batch 5 gap stands: closing the tab mid-booking still orphans objects in
  normal use. That needs a real sweep of `<uid>/bookings/…` objects with no
  referencing `BatteryItem` before launch.
- **A redirect on any route with a `loading.tsx` returns 200, not 3xx.** Next
  flushes the shell before the guard's `await`s finish, so `redirect()` travels
  inside the RSC stream. Assert those with **absent content** (`mustNotContain`
  in `smoke.mjs`), never with a status code. Bit us once in 7A; it will bite
  again in Batch 8 if a PDF route gets a loading boundary.
- Bottom-nav clearance is owned by `(app)/layout.tsx` since Batch 6.5. New `(app)`
  screens must pass `hideNav` to `AppShell` and must **not** add their own bottom
  padding.
- ~~CO₂ in the seed uses ~8 kg CO₂e/kg (Li-ion) inline~~ — **structurally fixed
  in Batch 9**: `packages/core/src/impact.ts` is the canonical per-chemistry
  table, and no screen or seed does CO₂ arithmetic anymore.
  🔴 **But the VALUES are still a placeholder.** They are unsourced mid-range
  picks and the paper attributions are unverified — see the Batch 9 known-gaps
  entry. Only the *relative ordering* is defensible. **Waiting on the company
  (open question 7)** rather than being researched, because EPR compliance may
  mandate a CPCB-accepted factor set. Their answer is a value change in that one
  file, plus the copy restated in the seed.
- **The compliance CSV's column set is an open question for the company** (Batch
  9), same class as the invoice's zero `taxPaise`. `COLUMNS` in
  `apps/customer/src/lib/compliance-export.ts` is the single place their answer
  lands.
- **The seed certifies exactly one pickup, and it is portable Li-ion** — so the
  per-chemistry table's biggest correction (lead-acid, ~4× lower than the old
  flat rate) is real in code and tests but invisible in demo data. A second
  certified pickup on an automotive load would surface it.
- `apps/agent` and `apps/admin` are scaffolds only.
- ~~Old `(app)/request-pickup` still exists~~ — **done in Batch 5**: it is now a
  `redirect('/book')`.
- Email OTP (Batch 6) may hit Supabase's built-in SMTP rate limit (~2–4/hr).
  Password login is kept working as the demo fallback — **do not remove it**.
  `describeOtpError` maps the rate-limit error to copy that points the user at
  the password form, so hitting the limit is survivable rather than a dead end.
- **Supabase email template needs `{{ .Token }}`** for `/verify` to be the real
  demo path (dashboard config, can't live in the repo). Without it the emails
  carry a link, which `/auth/callback` handles — login works either way.
- **The role gate adds a `profiles` read per request.** The durable fix is a
  custom access-token hook putting `role` in the JWT; dashboard config, deferred.
- `apps/agent` / `apps/admin` can now gate themselves by passing
  `allowRoles: ['agent']` / `['admin']` to the same `createAuthMiddleware`
  factory — that was the point of the factory, and it's now proven in one app.
