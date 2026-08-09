# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-08-09 (**Batches 0A + 0B + B2 + 4 + 5 + 6 executed** — repo
is now a Turborepo monorepo, schema v2 is live, the booking quote engine +
`createPickupWithItems` shipped in `packages/core`, the address book + Storage
upload helper landed, **the 4-step booking wizard at `/book` is done** — the
centrepiece of the revamp — and **email OTP + `/verify` + the role gate are
live**. Next: **Batch 7, tracking upgrade (partner card, chain-of-custody)**.
Prior: 2026-08-07 Plan v2 written)
**Current sprint:** all three apps — 2 weeks. Customer app first (~2–2.5 days).
**Build order across project:** Customer app FIRST → then Field Agent app → then Admin dashboard

---

## READ FIRST — resume point (2026-08-09)

**→ `docs/REVAMP_BATCHES_2026-08-09.md` is the live status file and the place to
resume.** It has the batch tracker, what batches 1–2 delivered, the demo
accounts + passwords, the commands, and the known gaps.

`docs/PLAN_V2_CUSTOMER_APP.md` remains the operative *plan* (the why, and
decisions D1–D7). This file (`PROJECT_STATE.md`) is now largely **historical
below this section** — it describes the pre-monorepo, pre-schema-v2 app.

### The three structural facts that invalidate most of the detail below

1. **The repo is a Turborepo monorepo** (Batch 0A, commit `a5c15e2`). Every path
   written below as `src/...` now lives at `apps/customer/src/...`, and shared
   code moved into `packages/{ui,auth,core,database,decision-engine}`. Imports
   are `@clbipp/*`, not `@/lib/*` or `@/components/*`. `prisma/` is now
   `packages/database/prisma/`.
2. **Schema v2 is applied** (Batch 0B, migration
   `20260809072925_schema_v2_battery_items`). `Pickup` is a header row and
   battery detail lives in the new `BatteryItem`. `Address`, `PricingRate`,
   `Payment`, `WalletTxn`, `PickupReceipt`, `Invoice` exist, plus agent/admin
   scaffolding tables. The seed is fully rewritten — 8 pickups, one per
   lifecycle stage, all owned by real auth users.
3. **The booking write path now lives in `packages/core`** (Batch 3):
   `booking.ts` (`estimateQuote` / `getQuote`) and `booking-actions.ts`
   (`createPickupWithItems`). Anything below describing a pickup being inserted
   from a page via raw PostgREST is the *old* request form — new booking code
   goes through these two.
4. **There is now a logged-in smoke test** (Batch 4): `npm run smoke` logs in as
   a real seeded user, forges the `@supabase/ssr` session cookie and fetches
   every screen. `npm run build` type-checks but never renders a page with a
   session, so this is the check that catches a server component throwing at
   request time. Run it after every batch; add new routes to `ROUTES` in
   `scripts/smoke.mjs` as they land.
5. **Auth is role-gated and OTP-capable** (Batch 6). `apps/customer/src/middleware.ts`
   now passes `allowRoles: ['customer']`, so **only `business@test` can enter the
   customer app** — `agent@test` and `admin@test` are signed out to `/login`.
   Email OTP (`/verify`) sits alongside password login, which stays primary
   because Supabase's built-in SMTP allows only ~2–4 mails/hour. Anything below
   describing login as password-only, or the post-login landing as `/profile`,
   is historical — it now lands on `/dashboard`.
   ⚠ **`supabase/grants.sql` gained a profiles column-level lockdown** in the
   same batch: `authenticated` previously had UPDATE on every column, so a
   customer could PATCH their own `role` to `admin`, self-clear `kyc_status`, or
   invent a `wallet_balance_paise`. Applied to the live database. Read it before
   touching profile writes — an insert or update naming a column outside the
   allowlist now fails with a 403 rather than an RLS error.
6. **Booking now happens at `/book`, not `/request-pickup`** (Batch 5). The
   4-step wizard is the only way a customer creates a pickup, and it goes through
   the `"use server"` actions in `apps/customer/src/app/(app)/book/actions.ts` →
   `getQuote` + `createPickupWithItems`. `/request-pickup` is a redirect; the old
   raw-PostgREST insert it used to do is gone. Anything below describing that
   form is historical. The schema-v1 columns (`batteryType`, `approxQuantity`,
   `approxWeightKg`) are **null on every new pickup** — read `category` and the
   `BatteryItem` rows instead.

**Lane note:** B (Khalid) was unavailable on 2026-08-09 and gave A permission to
cover his lane for this revamp. Logged in `LANE_OWNERSHIP.md`. Ownership reverts
to the `CLAUDE.md` map when he is back.

### Blockers list below is fully resolved

Every item in "Blocked on B" and the P0/P1 lists further down is done: the
dashboard is on real Prisma, the seed provides an Offer + Certificate for the
real login, `updated_at` has its default, and the certificate page reads by id.
Do not treat that table as live.

### Plan v2 summary (2026-08-07 — still the operative plan)

**`docs/PLAN_V2_CUSTOMER_APP.md` is the operative plan.** It supersedes the
"Batch A" plan below for anything not already merged, and records seven decisions
(D1–D7) that should not be re-litigated mid-build. Headlines:

- **All three apps in 2 weeks.** Customer app rebuild first, ~2–2.5 days.
- **Turborepo migration happens now, in full** (Aamir's call). Batch 0A.
- **One consolidated schema migration covering all three apps** (Batch 0B) — so
  nobody is ever blocked on a migration again. This is the fix for the single
  failure mode that has stalled every phase of this project.
- **We are no longer waiting on the company's reply.** The six open questions
  went unanswered; assumptions are listed in §1.3 of the plan.
- **Teammate C assumed unavailable** — C's lane is redistributed in §6 of the plan.
- **Email OTP** (not phone SMS — that needs a paid provider + DLT registration).
- **Payments: full model + simulated gateway.**

### The three `.docx` files — READ, no longer outstanding

- `Battery_Waste_App_Documentation.docx` — **same document** as
  `markdown-preview.pdf`. Nothing new.
- `Battery_App_Simple_Explanation.docx` — plain-language retelling. Nothing new.
- `Battery_Waste_App_Build_Documentation.docx` — **the one that matters.** Its §6
  gives the company's own data model, including a **`Battery Item`** entity
  (`pickup_id, chemistry, condition, weight, price, photo`). That settles the
  rework: **`Pickup` becomes a header row; battery detail moves to a child
  `BatteryItem`.** One change delivers bulk pickups, the category/chemistry
  split, condition flags, per-item photos, and per-item pricing.

### Corrections to the record below (verified 2026-08-07)

- **B's dashboard is done** — real Prisma, real stats, status-routed rows. The
  "Blocked on B" table below is stale on this point.
- Build is **green** (20 routes); tests **23 passing**.
- Cruft found: `src/app/generated/prisma/` is tracked in git despite being
  gitignored and is imported by nothing; `src/types/db.ts` is dead. Both are
  deleted in Batch 0A.

---

## Company flow review — 2026-08-07 (superseded by Plan v2 above)

The company reviewed our first vendor-app draft and HR sent back the flow they
intend for the app: **`docs/markdown-preview.pdf`** (image-only PDF, 6 pages —
render it to read it; there is no text layer). It was described to us as "minor
tweaks". It is not minor.

- **Full gap analysis: `docs/COMPANY_FLOW_REVIEW_2026-08-07.md`.** Read that
  before planning any of this work.
- **Nothing was built or changed.** The review is analysis only; no code, no
  schema, no migration.
- ~~**Blocked on the company.**~~ **Block lifted 2026-08-07** — the six open
  questions went unanswered and there are 2 weeks left. We build to our best
  reading of the documents; assumptions are listed in §1.3 of Plan v2.

**Headline gaps** (detail in the review doc): category-first booking (doc wants
portable/automotive/industrial/EV — we ask chemistry, which the doc assigns to the
*field agent*, not the customer); photo upload at booking; condition flags
(leaking/swollen/dead); indicative quote at booking; assigned-partner + ETA on
tracking; a pickup receipt at collection separate from the final EPR certificate;
invoice; CO₂ + materials on the impact dashboard; and **two customer segments with
genuinely different flows** (bulk/recurring pickups for fleets) — the largest item,
and a data-model change rather than a screen change.

**Two things that need a team decision before anyone codes:**
1. Adding `category` to `Pickup` is a **schema change → B's call**; the booking-form
   restructure on top of it is **C's**.
2. Fleet vs individual: A's position is **split the schema now, split the screens
   later**. Note §7.1 of the company doc tells us to pick one go-to-market wedge
   first — we have asked which one.

**Rule change:** the "never show recovered value / material breakdown to the
vendor" rule was recorded across our docs as *locked, do not revisit*. Per A it
was always a **light rule that follows the company's ask**, and has been corrected
to that in `CLAUDE.md`, `CONTEXT.md` and below. No screen changed — practical
effect is unchanged until the company answers. The separate **no recovery-rate-%**
rule is untouched (the company doc does not ask for it).

~~**Also unreviewed:** three `.docx` files...~~ **All three read 2026-08-07** —
findings folded into the "READ FIRST — Plan v2" section at the top of this file.

> Everything below this section predates the company review. It is still the
> accurate record of what is built and what was outstanding as of 2026-07-10 —
> but the plan in it is now subject to whatever the company confirms.

---

## Where we are right now

Phase 1 is complete. Phase 2 is in progress. As of 2026-07-07:

- **A** has completed all Phase 2 lane tasks (1–5): signup split, tracking
  screen, Realtime, profile, and the public tracking link `/t/[token]` (Task 5,
  DONE 2026-07-07). **A's Phase 2 lane is fully complete** and is now moving into
  Phase 3 hardening (H1/H2). Nothing left blocking A's own screens except items
  gated on B (see blockers).
- **B** has shipped dashboard, compliance, certificate scaffold (all mock data).
  Has agreed to fix dashboard to real Prisma + seed an offer for PKP-3099.
  `Pickup.publicToken` column has been pushed and migrated.
- **C** has shipped the component library and AppShell, and the full Phase 2
  request → offer → handover flow (PR #10, **merged 2026-07-06**): request-pickup,
  submitted, scheduled, offer, offer-breakdown, handover + `mockOffer.ts`.

All of A's work through Task 4 is on `origin/main` (merged 2026-07-06). C's PR #10
is merged and pulled locally.

---

## Phase 3 netting-up — remediation (2026-07-10)

A full manual + automated test pass exposed that the app is two half-connected
pickup stacks (C's query-param flow + A's state-driven `/track`) with no guards.
Symptoms: dead dashboard "Request" button, `/scheduled` crash, static `mockOffer`
shown for any id with no persistence/guards, cancelled-pickup dashboard crash,
cert 404s, red `npm run build`. B's blocker-removal commit fixed the P0
`pickups.updated_at` default (real migration on `main` ✅) but introduced these.

- **Findings:** `docs/REVIEW_findings_2026-07-10.md` (what's broken, by owner).
- **Plan:** `docs/REMEDIATION_PLAN.md` (batched fixes, by owner).
- **Model decided:** status-routed navigation, both screen sets kept; offer is a
  sub-state of `scheduled` (an Offer row exists); `/offer|offer-breakdown|handover`
  are mid-flow only + guarded.
- **Lane shift (logged in `LANE_OWNERSHIP.md` 2026-07-10):** the seam +
  flow/component crash-fixes + PWA/deploy consolidated onto **A**. B keeps his
  data batch; C does isolated visual polish.

### A's resume plan — "Batch A" (start here in a fresh chat)
Full execution detail: plan file `~/.claude/plans/cheerful-hugging-unicorn.md`.
Phased so we stop where the day runs out:

- **Phase 0 — crash-fixes / build green (no deps, do first):** remove `cancelled`
  from ordered `LIFECYCLE_STAGES` (`tokens.ts`); add `cancelled` to badge
  `STATUS_CONFIG` + `PickupStatus = LifecycleStage | "cancelled"`; fix `/scheduled`
  server-side `onClick` crash (extract client `PickupActions`); fix
  `design-system/page.tsx` broken imports.
- **Phase 1 — real offer + guards:** `/offer` + `/offer-breakdown` read the real
  Offer (retire `mockOffer`), vendor-scoped, gated by status (redirect if
  missing/foreign/ahead). `/offer-breakdown` = price + qualitative rationale only
  (no ₹ line items — locked rule; schema has no per-line price fields anyway).
- **Phase 2 — persist accept + close RLS hole (H1/H2):** new
  `src/lib/supabase/admin.ts` service-role client; rewrite `acceptOffer` (+ add
  `cancelPickup`) to write via service role; drop the broad vendor UPDATE policy
  in `policies.sql`. **GATED on the service-role key prereq below.**
- **Phase 3 — seam:** `handover → /track/${id}`; `/track` shows "View offer" CTA
  when an Offer exists; certified "View certificate" works once B ships cert-by-id.
- **Phase 4 — PWA + deploy (last):** manifest + SW + install; Vercel env; needs
  build green first.

**Prerequisites A cannot self-serve (A↔B, do before Phase 2):**
1. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (+ Vercel) — absent today.
2. Apply the `policies.sql` RLS change in the Supabase SQL editor.
3. Confirm `Offer.estimatedPrice` unit with B (seed `18450000` implies paise →
   display `/100`).

**Deferred:** P5 signup input validation (not a demo blocker). **Parked-app
boundary:** vendor can't create offers or advance collected→certified — B
seeds/simulates those.

### Other lanes' batches (handover)
- **B (Khalid):** seed fix (one consistent pickup for real user `business@test`:
  a `scheduled` pickup + real Offer w/ materialBreakdown, and a `certified` pickup
  + Certificate); cert page read-by-id + `await params`; compliance link
  `/certificate`→`/certificates`; dashboard request-button `<Link>` + row `href`
  by status. Self-contained. Detail in `REMEDIATION_PLAN.md` "Batch B".
- **C (Mohammed):** visual polish on his own flow screens, after A's crash-fixes
  land. Off critical path.

---

## The repo (already exists — do NOT create a new one)

Single repo for all three apps. Already contains:
- Next.js + TypeScript + App Router scaffold
- Prisma + Supabase Postgres set up, initial migration done
- `src/middleware.ts` (must live under `src/` — Next's dev bundler silently
  never registers it at the project root when `src/app` is in use)
- Decision engine (`src/lib/decisionEngine.ts`) — Layers 0–5, 20 passing tests. **PARKED for this sprint.**
- Field-agent intake flow — early merged branch. **PARKED for this sprint.**

---

## Lanes (this sprint — vendor app only)

| Person | Owns |
|---|---|
| **A (me / Aamir)** | Supabase Auth, session/route protection, RLS policies, login + full signup flow, tracking screens (`/track/[id]`), track tab navigation, realtime, profile, public tracking link. **PWA + offline, deployment/CI, and the cross-lane navigation seam** (shifted from C 2026-07-10). |
| **B (Teammate 1)** | Prisma schema + types, post-signup KYC, dashboard, compliance, certificate PDF, seed/sim surface. |
| **C (Teammate 2)** | Component library, request → offer → handover flow. (PWA + offline and deployment/CI moved to A on 2026-07-10.) |

**Note on track tab:** A wired `BottomTabBar` into `(app)/layout.tsx` (logged in
`LANE_OWNERSHIP.md`). Track tab navigation logic (`/track/page.tsx`) is A's.
Currently routes to most recent non-cancelled pickup; falls back to dashboard
if none exist.

---

## Status by phase

**Phase 0 — Setup** — DONE

**Phase 1 — Foundations** — DONE

Person A:
- ✅ `src/middleware.ts` — route protection, correct src/ location
- ✅ `src/lib/supabase/auth.ts` — signIn, signUpWithProfile (accepts fleet fields), signOut, getCurrentProfile
- ✅ Login page (`/login`) — AppShell + design tokens
- ✅ Signup split flow — type selector → individual / fleet forms. Fleet fields written to profile row at signup.
- ✅ RLS policies — all 5 tables versioned in `supabase/policies.sql`

Person B:
- ✅ Prisma schema — Profile, Pickup, Offer, StatusEvent, Certificate (incl. `Pickup.publicToken`)
- ✅ Zod validation — `src/lib/validation.ts`
- ✅ Seed data — `prisma/seed.ts` (PKP-2031 certified individual, PKP-2024 certified fleet, PKP-2039 recovered fleet, PKP-2042 scheduled fleet; all fake vendorIds)

Person C:
- ✅ Design tokens — `src/lib/tokens.ts`
- ✅ Component library — Button, Card, Badge, Banner, ListRow, Tabs, Timeline
- ✅ App shell + phone frame, Empty/Error/Loading states

**Phase 2 — Core journey** — IN PROGRESS

Person B (shipped so far):
- ✅ `src/app/(app)/dashboard/page.tsx` — mock data (not real Prisma yet)
- ✅ `src/app/(app)/compliance/page.tsx` — mock data
- ✅ `src/app/(app)/certificates/[id]/page.tsx` — hardcoded to PKP-2031 (not real)

Person A — Tasks 1–4 done:
- ✅ Task 1: Signup split flow (Phase 1 loose end, DONE 2026-07-05)
- ✅ Task 2: Static tracking screen + tab bar wiring (DONE 2026-07-05/06)
- ✅ Task 3: Realtime on tracking (DONE 2026-07-06)
- ✅ Task 4: Full profile screen (DONE 2026-07-06)
- ✅ Task 5: Public tracking link `/t/[token]` (DONE 2026-07-07)

**A's Phase 2 lane is complete.** Next A work is Phase 3 hardening (H1/H2).

Person C — request → offer → handover flow SHIPPED (PR #10, merged 2026-07-06):
- ✅ `request-pickup/page.tsx` — form, inserts to `pickups` via the browser client
- ✅ `submitted/`, `scheduled/` — confirmation + scheduled screens
- ✅ `offer/`, `offer-breakdown/` — driven by `mockOffer.ts` (real pricing parked)
- ✅ `handover/page.tsx` + `actions.ts` — `acceptOffer()` sets status → collected
- ⚠ **Not yet end-to-end:** the request insert fails until B adds the
  `pickups.updated_at` DB default (see Blocked on B); dashboard listing of the new
  pickup needs B's real-Prisma switch. The `status_events` write on accept is
  RLS-dropped — see hardening H1.

**Phase 3 — PWA, hardening, ship** — STARTING. This is the whole-app netting-up
phase: full design pass (once all screens exist), correct end-to-end DB
linking/inserts/updates, input validation (P5, A+B), PWA + offline + deploy (A),
and hardening. It splits into two kinds of work:

- **Concentrated / lane-owned** — clear, single-owner tasks that need no
  coordination to start. For A: **H1/H2** (RLS + status-write hardening; see
  below) and A's half of **P5** (signup email/password validation).
- **Shared / all-hands finishing** — design consistency pass, verifying the full
  request→track→certificate chain links + writes correctly across lanes. These
  depend on other lanes being in place (design pass waits until all screens
  built; linking waits on B's real-Prisma dashboard). Task split between A/B/C
  still to be agreed.

A's concentrated slice (H1/H2, P5-A) is lane-independent and can start now. B
still has Phase 2 tails (dashboard real Prisma, cert-by-ID); C's flow is gated on
B's `updated_at` default — so the team is not uniformly in Phase 3 yet, and the
shared finishing work can't fully land until those close.

---

## Person A — Task 2 detail (what was built)

### Tracking screen — `src/app/(app)/track/[id]/page.tsx`

Server component. Queries `prisma.pickup.findFirst({ where: { id, vendorId } })` —
scoped by vendorId so a vendor cannot view another's pickup.

Five status buckets:

| Status | What renders |
|---|---|
| `cancelled` | Timeline up to last known stage (falls back to `requested`) + error banner |
| `requested` / `scheduled` | LifecycleHeader + StatusBadge + Timeline in Card + info banner |
| `collected` / `tested` / `processed` | LifecycleHeader + StatusBadge + Timeline (pulse) in Card + 2 banners |
| `recovered` | LifecycleHeader + StatusBadge + full Timeline in Card + RecoverySummary + lock banner |
| `certified` | LifecycleHeader + StatusBadge + full Timeline in Card + RecoverySummary + success banner + View certificate button |

**RecoverySummary:** Shows total weight kg as a stat box. Shows "—" / "Pending finalisation" 
when no offer data yet. Expandable material breakdown (kg per material). 
**₹ values and recovery rate % are never rendered anywhere on vendor screens.**

### Track tab — `src/app/(app)/track/page.tsx`

Server component. Queries most recent non-cancelled pickup for the logged-in user.
Redirects to `/track/[id]` if found, `/dashboard` if none.

### Tab bar — `src/app/(app)/layout.tsx`

`BottomTabBar` wired here. `position: fixed` — floats above all content.
All authenticated screens (A's + B's) get it automatically.
Lane shift logged in `docs/LANE_OWNERSHIP.md`.

### Shared component edits made by A (to make tracking screens look right)

These live in C's component files but were changed by A because they broke A's
tracking screen. Not a lane dispute — just fixes A needed:

- `timeline.tsx`: removed meaningless "—" pending sublabels (`tested`, `processed`,
  `certified`); kept "Awaiting agent" (collected) + "In progress" (recovered).
- `timeline.tsx`: added `min-h-[1.75rem]` on stage label block + taller connector
  (`h-8`) so rows are evenly spaced whether or not they have a sublabel.
- `timeline.tsx`: exported `Connector` so the track page can reuse it for the
  cancelled end-state.
- Track page: `Card` wrapping each Timeline now uses `overflow-visible` — the
  default `overflow-hidden` on Card was clipping the `animate-ping` pulse glow.
- Cancelled state: now renders the timeline up to last known stage + a red X dot
  and "Cancelled" label inside the card (connected by a red connector), then the
  error banner.

⚠ **Clobber risk:** `timeline.tsx` is C's file. If C re-uploads it, these edits
are lost and the tracking screen regresses (uneven rows, clipped pulse). If that
happens, re-apply the four `timeline.tsx` changes above. Consider that these
tracking-specific tweaks may be worth moving into a track-local wrapper later so
they can't be overwritten.

---

## Person A — Task 3 detail (what was built)

### Realtime — `src/lib/supabase-realtime.ts` + `track/[id]/TrackingRealtime.tsx`

`supabase-realtime.ts`: exports `subscribeToPickupEvents(pickupId, onEvent)`.
Opens a channel on the browser Supabase client, listens for `INSERT` on
`status_events` filtered to this pickup, fires the callback, returns an
unsubscribe fn. Payload is intentionally ignored — the callback is a signal only.

`TrackingRealtime.tsx`: `"use client"`, renders `null`. On mount subscribes and
calls `router.refresh()` on each event; on unmount unsubscribes. `router.refresh()`
re-runs the server component so the whole page (timeline, banners, RecoverySummary,
cert button) re-renders with fresh Prisma data. Server stays the single source of
truth — no stage-derivation logic on the client.

Mounted in the 3 non-terminal branches of `track/[id]/page.tsx` (early,
in-progress, recovered). Terminal branches (certified, cancelled) have no
subscription — no further events expected.

**One-time SQL:** `supabase/realtime.sql` — adds `status_events` to the
`supabase_realtime` publication (re-runnable, guarded). Must be run in the
Supabase SQL editor; already applied.

**Pulse bug fixed:** `recovered` branch now passes `pulse` + `overflow-visible`
to the Timeline Card (was missing both — the bug was flagged in Task 2 notes).

---

## Person A — Task 4 detail (DONE 2026-07-06)

### Profile screen — `src/app/(app)/profile/page.tsx`

Server component. Calls `getCurrentProfile()` (RLS-scoped) + 3 Prisma aggregates
in `Promise.all`. Renders:

- **Identity card** — avatar monogram (initials), display name (company for fleet,
  full name for individual), EPR reg ID subtitle (fleet) or "Individual account".
- **Account summary grid** — 3 stat boxes: Submitted (pickup count), Recycled
  (certified weight kg/t), Certificates (certificate count). Prisma reads only.
  Weight + counts only — never recovery rate or value (locked rule).
- **Account card** — name (individual only), email, account type.
- **Business details card** — fleet only, conditionally rendered:
  company, contact name, GST, PAN, EPR reg ID, business address.
- **Log out button** — server action (`profile/actions.ts` → `signOut()` → redirect `/login`).

`getCurrentProfile()` extended to select fleet fields:
`company_name, gst_number, pan_number, epr_reg_id, business_address`.

**Certificate count note:** counts rows in `certificates` table (actual issued
documents), not pickups at status `certified`. PKP-3099 has no Certificate row
yet — count shows 0 until B's cert-generation flow runs. Intentional.

**Profile tab** was already wired in `tabs.tsx` to `/profile`. AppShell uses
`hideNav` + `NAV_PADDING` (same pattern as tracking screen) — no double tab bar.

**Wireframe divergence:** wireframe shows "Avg recovery rate" row — omitted
(locked rule). Notifications and Edit details rows omitted (no backend yet;
flag to B for notifications preference column; edit details is a future branch).

---

## Person A — Task 5 detail (DONE 2026-07-07)

### Public tracking link — `src/app/t/[token]/page.tsx`

Publicly accessible URL (`/t/<uuid>`) showing a pickup's lifecycle to anyone
holding the link — no login. Token is `Pickup.publicToken` (UUID). Two files:

- **`src/middleware.ts`** — added `'/t'` to `PUBLIC_PATHS`. Existing matcher
  (`pathname === p || startsWith('/t/')`) now lets `/t/<anything>` through logged
  out. No collision with `/track` (verified: neither `=== '/t'` nor `startsWith('/t/')`).
- **`src/app/t/[token]/page.tsx`** — new server component. Lives at **top-level
  `src/app/t/`, outside the `(app)` group**, so it does NOT inherit the
  authenticated `BottomTabBar`. Self-contained (copies `buildStages`,
  `safeBreakdown`, `LIFECYCLE`, `LifecycleHeader`, `RecoverySummary` from the
  authed page — the merged/tested `/track/[id]` screen was left untouched).

Key decisions:
- **UUID-format guard before the query** — `publicToken` is a Postgres `uuid`
  column; a non-UUID string throws on cast (500) rather than returning null. Guard
  → `notFound()` (404) on malformed tokens.
- Queries by `publicToken` only, no `vendorId` scoping — the token IS the scope.
  Prisma bypasses RLS.
- Same 5 status buckets as `/track/[id]`, stripped for anon: `hideNav` + no back
  button, **no `TrackingRealtime`**, and certified branch **omits the "View
  certificate" button** (it links to the auth-only `/certificates` route).
- Renders only pickup ID, status badge, timeline, kg-only RecoverySummary — no
  vendor identity, no ₹/recovery-rate.

**Verified:** loads logged-out (incognito) without redirect to `/login`; bad
token → 404. Wireframe has no dedicated public-view screen — `/t/` appears only
as the link string on the handover screen; the `track-progress` screen is the
visual model.

**Deferred (Phase 3 follow-up):** no live updates on the public page. Realtime
subscribes via the anon browser client, which RLS on `status_events` scopes to
the owning vendor — an anon subscription would silently no-op. Public realtime
would need a token-scoped path (dedicated anon SELECT policy, or poll) — its own
small task, not built.

---

## Person A — what is NOT yet tested on my screens

Carry these into the next chat — do not assume they work:

- **Timeline dates/timestamps** — partially tested. PKP-3099 has manually
  inserted `status_events` rows. Full end-to-end blocked on B's real agent flow.
- **Recovered state recovery summary with real data** — shows "—/Pending
  finalisation" because PKP-3099 has no offer. Blocked on B.
- **Certified state end-to-end** — "View certificate" links to `/certificates/[id]`
  but B's cert page is hardcoded to PKP-2031. Broken until B fixes it.
- **Dashboard → track navigation** — B's dashboard rows don't link to
  `/track/[id]` yet and use mock data.
- **Cancelled state** — eyeballed only, not tested against a real cancelled pickup.
- **Public link `/t/[token]`** — verified logged-out load + 404 guard against
  PKP-3099. Not tested against every status bucket with real data, and public
  realtime was intentionally omitted (see Task 5 detail).
- **Profile certificate/recycled stats** — count and weight show 0 for PKP-3099
  because no Certificate row exists for that vendor. Correct behaviour, but not
  testable until B's cert flow runs.
- **Signup fleet fields** — confirmed writing to profile row, not re-verified
  after recent changes.

---

## Pending items / blockers

### Blocked on B

| # | What | Status |
|---|---|---|
| — | **`pickups.updated_at` needs a DB default** — C's request-pickup insert (raw PostgREST, not Prisma) fails with a NOT NULL violation until then; same one-line fix B already did for `profiles`. **Gates C's whole flow.** | B says done, but NOT in any migration on `main` — **verify** |
| P4 | Dashboard switches to real Prisma so real pickups show + empty state is testable | B not done |
| P4 | Dashboard pickup rows link to `/track/[id]` | B not done |
| — | Certificate page reads by pickup ID (currently hardcoded PKP-2031) | B not done |
| — | Offer with `materialBreakdown` seeded for PKP-3099 (test pickup) | B not done |

### Phase 2 → Phase 3 prerequisites

| # | What | Owner | Status |
|---|---|---|---|
| P1 | `BottomTabBar` wired into `(app)/layout.tsx` | A ✅ | Done |
| P2 | `Pickup.publicToken` column added + backfilled | B ✅ | Done, migrated locally |
| P3 | `/t/[token]` public route built | A ✅ | Done 2026-07-07 (Task 5) |
| P4 | Dashboard rows link to real pickup IDs | B | Not done |
| P5 | Input validation on signup (email, GST/PAN/EPR, password) | A + B | Deferred to Phase 3 |

### Phase 3 hardening — Person A (H1/H2 — ACTIVE, Chat 1)

Surfaced while reviewing C's request→offer→handover PR (#10). Both are RLS /
status-write concerns in A's lane. **Now active — these are A's Phase 3 Chat 1
concentrated tasks (see execution plan below).**

| # | What | Why | Fix (convergent) |
|---|---|---|---|
| H1 | `status_events` "collected" row is never written when the vendor accepts an offer | `acceptOffer` writes as the vendor's own session; RLS only lets the service role write `status_events`, so the insert is silently dropped (non-fatal). The pickup `status` still updates so screens read correctly, but the audit log loses the entry and no realtime ping fires. | In the `handover/actions.ts` server action, write the `status_events` row via a **service-role** Supabase client (stays server-side, bypasses RLS). |
| H2 | A vendor can self-advance their own pickup's lifecycle | The "Vendors can update their own pickups" policy (`policies.sql`) + the vendor's browser token mean a vendor could call the API directly and set their `status` to anything (e.g. jump to `certified`). The UI is not the security boundary — RLS is. | Move all status transitions to service-role server actions, then tighten/remove the broad vendor UPDATE policy so vendors can't set lifecycle status directly. |

Both point the same direction: **status transitions belong in service-role server
actions, not vendor-session writes.** Doing H1 and H2 together also restores the
realtime ping on accept. Needs a service-role client helper under
`src/lib/supabase-*.ts` (doesn't exist yet).

---

## Phase 3 execution plan — Person A (2 chats, ~1 day)

Small friendly college/internship team — lanes are light structure, not rigid
gates. A can grab a quick OK from C to touch a shared file, and can pick up
shared / loose-end tasks solo when finished early. Coordination = a heads-up (+ a
one-line `LANE_OWNERSHIP.md` note if a file changes hands), not a formal process.

### Chat 1 — A's concentrated tasks (single-owner, no blockers to start)

1. **H2** (pure A): add a service-role Supabase client helper under
   `src/lib/supabase-*.ts`; move status transitions into service-role server
   actions; tighten/remove the broad vendor UPDATE policy in `policies.sql` so a
   vendor can't self-advance their own lifecycle. Security boundary is RLS, not UI.
2. **H1** (A, edits C's `handover/actions.ts` — quick OK from C first): write the
   `status_events` "collected" row via the service-role client so it's no longer
   RLS-dropped. Restores the audit entry + realtime ping on accept. Do with H2.
3. **P5-A** (pure A; if time, else roll to netting-up): email + password
   validation on the signup form A owns.

Git: one branch `feat/status-hardening`, one PR to main, merge.

### Final chat — net up the whole app with B & C (priority-ranked)

Goal: a working, demoable end-to-end app in the remaining day. Do this list
**top-down and stop where time runs out** — lower items are polish / nice-to-have.
A can assign or absorb any of these solo once ahead.

**P0 — core journey must work at all**
- [ ] Verify B's `pickups.updated_at` DB default is actually on `main` (in a
      migration), not just claimed. Without it the request-pickup insert fails →
      the whole request→offer→handover→track chain is dead. **Highest priority.**
- [ ] Confirm H1/H2 merged (from Chat 1).

**P1 — end-to-end demo path works + is testable**
- [ ] B: dashboard → real Prisma (real pickups + empty state), rows link to
      `/track/[id]`. This is the demo's main navigation.
- [ ] B: certificate page reads by pickup ID (currently hardcoded PKP-2031) — so
      A's certified "View certificate" button actually works.
- [ ] B: seed an Offer with `materialBreakdown` for PKP-3099 — so A's recovered /
      certified RecoverySummary and profile recycled stats show real data.

**P2 — validation + verify A's untested states against real data**
- [x] P5-A: email + password (+ phone) validation on signup — **done in Batch 6**
      via `signupIndividualSchema` / `signupFleetSchema` in `packages/core`.
- [ ] P5-B: GST/PAN/EPR **format** validation (B, `validation.ts`) — pairs with
      P5-A, which deliberately stopped at presence-only for those three fields.
- [ ] Verify with real data: cancelled state, timeline timestamps, public
      `/t/[token]` across status buckets, profile cert/recycled stats, signup
      fleet fields (re-verify after recent changes).

**P3 — polish + ship**
- [ ] Design consistency pass across all screens (design tokens). Each person
      polishes own screens; C drives overall consistency.
- [x] A: PWA + offline — shipped (manifest, icons, SW, `offline.html`, install).
- [ ] A: deploy/CI — pending; needs `SUPABASE_SERVICE_ROLE_KEY` + env in Vercel
      (see `docs/BATCH_A_FLAGS.md` → PWA-deploy).
- [ ] Optional robustness: move A's tracking-specific `timeline.tsx` tweaks into a
      track-local wrapper so a C re-upload can't clobber them (see Task 2 detail).

**P4 — nice-to-have (only if time left over)**
- [ ] Public realtime on `/t/[token]` (token-scoped path, A) — explicitly deferred.

---

## Seed data reference

Two vendor accounts (fake UUIDs — not real Supabase auth users):

| Vendor | ID | Type |
|---|---|---|
| Aamir Hashmi Singh | `00000000-0000-0000-0000-000000000001` | individual |
| Riya Sharma / Altigreen | `00000000-0000-0000-0000-000000000002` | fleet |

| Pickup | Vendor | Status | Has offer | Has cert |
|---|---|---|---|---|
| PKP-2031 | individual | certified | ✅ | ✅ |
| PKP-2024 | fleet | certified | ✅ | ✅ |
| PKP-2039 | fleet | recovered | ✅ | ❌ |
| PKP-2042 | fleet | scheduled | ❌ | ❌ |
| PKP-3099 | real auth user (Aamir) `efc87c57-1659-4de1-98af-86c2068b65e2` (login: `business@test`) | varies (test manually) | ❌ | ❌ |

PKP-3099 is the only pickup with a real Supabase auth `vendorId` — use this for
testing. Manually insert `status_events` rows + update `pickups.status` to test
different states (the INSERT fires Realtime; the UPDATE is what the server render reads).
To test recovery summary, B needs to seed an offer with `materialBreakdown` for it.

---

## Open rules

**Locked (do not revisit):**

- Status lifecycle: `requested → scheduled → collected → tested → processed → recovered → certified` (+ `cancelled`)
- `src/middleware.ts` must stay under `src/` — not project root.
- **No recovery rate % shown to vendor anywhere.** The company flow document does
  not ask for it, so this one stands.

**Default, but changeable on the company's ask (corrected 2026-08-07):**

- **Don't render `Offer.materialBreakdown` / `Offer.deductions` as ₹ values on
  vendor-facing screens** — weight (kg) only. Applies to A, B, and C.
  **This is a light rule, not a hard one** (it was previously mis-recorded here as
  locked). The company flow document asks for an indicative quote, an invoice and a
  wallet, all value-facing — so it may be relaxed. **Nothing changes until the
  company answers open question 2** in `COMPANY_FLOW_REVIEW_2026-08-07.md`; until
  then, keep building to the rule as written above.

---

## Design approach (Phase 3)

All design polish (typography, max-width mobile container, serif display font,
logo, spacing) is deferred to Phase 3. A's screens should be functionally
correct and reasonably close to wireframe now. Full design pass happens once
all screens are built.
