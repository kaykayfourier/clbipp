# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-07-06 (Task 4 done, Task 5 next; parked A hardening items H1–H2 from PR #10 review)
**Current sprint:** Vendor / Client web app (PWA) — 2 week build
**Build order across project:** Vendor app FIRST → then Field Agent app → then Admin dashboard

---

## Where we are right now

Phase 1 is complete. Phase 2 is in progress. As of 2026-07-06:

- **A** has completed signup split, static tracking screen, Supabase Realtime,
  and the full profile screen (Task 4). Task 5 (public tracking link) is next.
- **B** has shipped dashboard, compliance, certificate scaffold (all mock data).
  Has agreed to fix dashboard to real Prisma + seed an offer for PKP-3099.
  `Pickup.publicToken` column has been pushed and migrated.
- **C** has shipped the component library and AppShell.

All of A's work through Task 4 is on `origin/main` (merged 2026-07-06).

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
| **A (me / Aamir)** | Supabase Auth, session/route protection, RLS policies, login + full signup flow, tracking screens (`/track/[id]`), track tab navigation, realtime, profile, public tracking link. |
| **B (Teammate 1)** | Prisma schema + types, post-signup KYC, dashboard, compliance, certificate PDF, seed/sim surface. |
| **C (Teammate 2)** | Component library, request → offer → handover flow, PWA + offline, deployment/CI. |

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
- 🔄 Task 5: Public tracking link `/t/[token]` — **NEXT**

Person C — NOT STARTED (request → offer → handover flow)

**Phase 3 — PWA, hardening, ship** — NOT STARTED

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

## Person A — Task 5 plan (NEXT)

### Public tracking link · `src/app/t/[token]/page.tsx`

Goal: a publicly accessible URL (`/t/<uuid>`) that lets anyone with the link
view the lifecycle status of a pickup — no login required. The token is
`Pickup.publicToken` (UUID, already in schema, already backfilled).

**What to show:**
- Pickup ID, current status badge, lifecycle timeline with timestamps.
- Same visual structure as the authenticated `/track/[id]` screen.

**What NOT to show:**
- Vendor name, email, or any personal data.
- Offer value, recovery rate, or any financial figure (locked rule).
- `RecoverySummary` material breakdown is fine (kg weights only) — same rule
  as the authenticated screen.

**Architecture:**
- `src/app/t/[token]/page.tsx` — server component. Queries
  `prisma.pickup.findFirst({ where: { publicToken: token } })`.
  Prisma bypasses RLS (service-role connection), so no auth needed at the
  query layer — the token itself is the capability (knowing it = access).
- `src/middleware.ts` — add `/t` to `PUBLIC_PATHS` so middleware doesn't
  redirect unauthenticated visitors to `/login`.
- No Supabase auth client call needed on this route.
- Render `notFound()` if no pickup matches the token.

**Files to touch:**
1. `src/middleware.ts` — add `'/t'` to `PUBLIC_PATHS`.
2. `src/app/t/[token]/page.tsx` — new file, server component.

**Check wireframe** for any public tracking screen spec before building.
The handover screen references `b2b.app/t/9f3a…·token` but there may not
be a full public-view wireframe — check first.

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
| P4 | Dashboard switches to real Prisma so real pickups show + empty state is testable | B not done |
| P4 | Dashboard pickup rows link to `/track/[id]` | B not done |
| — | Certificate page reads by pickup ID (currently hardcoded PKP-2031) | B not done |
| — | Offer with `materialBreakdown` seeded for PKP-3099 (test pickup) | B not done |

### Phase 2 → Phase 3 prerequisites

| # | What | Owner | Status |
|---|---|---|---|
| P1 | `BottomTabBar` wired into `(app)/layout.tsx` | A ✅ | Done |
| P2 | `Pickup.publicToken` column added + backfilled | B ✅ | Done, migrated locally |
| P3 | `/t/[token]` public route built | A | Task 5, after Task 3+4 |
| P4 | Dashboard rows link to real pickup IDs | B | Not done |
| P5 | Input validation on signup (email, GST/PAN/EPR, password) | A + B | Deferred to Phase 3 |

### Phase 3 hardening — Person A (parked, not this sprint)

Surfaced while reviewing C's request→offer→handover PR (#10). Both are RLS /
status-write concerns in A's lane. **Parked for Phase 3 — do not build now.**

| # | What | Why | Fix (convergent) |
|---|---|---|---|
| H1 | `status_events` "collected" row is never written when the vendor accepts an offer | `acceptOffer` writes as the vendor's own session; RLS only lets the service role write `status_events`, so the insert is silently dropped (non-fatal). The pickup `status` still updates so screens read correctly, but the audit log loses the entry and no realtime ping fires. | In the `handover/actions.ts` server action, write the `status_events` row via a **service-role** Supabase client (stays server-side, bypasses RLS). |
| H2 | A vendor can self-advance their own pickup's lifecycle | The "Vendors can update their own pickups" policy (`policies.sql`) + the vendor's browser token mean a vendor could call the API directly and set their `status` to anything (e.g. jump to `certified`). The UI is not the security boundary — RLS is. | Move all status transitions to service-role server actions, then tighten/remove the broad vendor UPDATE policy so vendors can't set lifecycle status directly. |

Both point the same direction: **status transitions belong in service-role server
actions, not vendor-session writes.** Doing H1 and H2 together also restores the
realtime ping on accept. Needs a service-role client helper under
`src/lib/supabase-*.ts` (doesn't exist yet).

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

## Open rules (locked, do not revisit)

- **Never render `Offer.materialBreakdown` / `Offer.deductions` as ₹ values
  on any vendor-facing screen.** Weight (kg) only. This rule applies to A, B, and C.
- **No recovery rate % shown to vendor anywhere.**
- Status lifecycle (locked): `requested → scheduled → collected → tested → processed → recovered → certified` (+ `cancelled`)
- `src/middleware.ts` must stay under `src/` — not project root.

---

## Design approach (Phase 3)

All design polish (typography, max-width mobile container, serif display font,
logo, spacing) is deferred to Phase 3. A's screens should be functionally
correct and reasonably close to wireframe now. Full design pass happens once
all screens are built.
