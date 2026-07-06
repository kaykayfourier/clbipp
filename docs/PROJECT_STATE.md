# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-07-06 (Task 3 done)
**Current sprint:** Vendor / Client web app (PWA) — 2 week build
**Build order across project:** Vendor app FIRST → then Field Agent app → then Admin dashboard

---

## Where we are right now

Phase 1 is complete. Phase 2 is in progress. As of 2026-07-06:

- **A** has completed signup split (Phase 1 loose end), the full static
  tracking screen with all lifecycle states, and Supabase Realtime on the
  tracking screen. Task 4 (profile screen) is next.
- **B** has shipped dashboard, compliance, certificate scaffold (all mock data).
  Has agreed to fix dashboard to real Prisma + seed an offer for PKP-3099.
  `Pickup.publicToken` column has been pushed and migrated.
- **C** has shipped the component library and AppShell.

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

Person A — Tasks 1 + 2 done:
- ✅ Task 1: Signup split flow (Phase 1 loose end, DONE 2026-07-05)
- ✅ Task 2: Static tracking screen + tab bar wiring (DONE 2026-07-05/06)
- ✅ Task 3: Realtime on tracking (DONE 2026-07-06)
- 🔄 Task 4: Full profile screen — **NEXT**
- ⬜ Task 5: Public tracking link `/t/[token]`

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

## Person A — Task 4 plan (NEXT)

### Full profile screen · branch `feat/profile`

Goal: `/profile` screen showing the logged-in vendor's account details.

**What to show:**
- Full name, email, vendor type (individual / fleet)
- Fleet-only fields when `vendor_type === 'fleet'`: company name, GST number,
  PAN number, EPR reg ID, business address
- A sign-out button (calls `signOut()` from `src/lib/supabase/auth.ts`, then
  redirects to `/login`)

**Data source:** `getCurrentProfile()` in `src/lib/supabase/auth.ts` already
returns `{ user, profile }` — but currently only selects `full_name, email,
vendor_type`. Needs to also select the fleet fields:
`company_name, gst_number, pan_number, epr_reg_id, business_address`.

**Architecture:**
- `src/app/(app)/profile/page.tsx` — server component, calls `getCurrentProfile()`,
  renders the profile display. Fleet fields section conditionally rendered.
- Sign-out is a form action or a small `"use client"` button component (since
  `signOut()` needs to run client-side or in a server action).
- Tab bar already in `(app)/layout.tsx` — profile tab should be wired up.

**Check wireframe** (`docs/CLBIPP_Vendor_Wireframes_1.html`) for exact layout
before building — it has the profile screen spec.

---

## Person A — what is NOT yet tested on my screens

Carry these into the next chat — do not assume they work:

- **Timeline dates/timestamps** — partially tested. PKP-3099 now has manually
  inserted `status_events` rows (added during Task 3 Realtime testing). Timestamps
  appear on completed stages. Full end-to-end (agent flow auto-inserting events)
  still blocked on B's real flow.
- **Recovered state recovery summary with real data** — RecoverySummary currently
  shows "—/Pending finalisation" because PKP-3099 has no offer. Blocked on B
  seeding an offer with `materialBreakdown` for PKP-3099.
- **Certified state end-to-end** — the "View certificate" button links to
  `/certificates/[id]`, but B's cert page is hardcoded to PKP-2031, so the link
  target is wrong until B fixes it.
- **Dashboard → track navigation** — cannot test; B's dashboard rows don't link
  to `/track/[id]` yet and use mock data.
- **Cancelled state** — new red end-state added this session, eyeballed only,
  not tested against a real cancelled pickup.
- **Track tab routing** — works but noted as slightly slow (extra DB query on
  every tab tap). Acceptable for now.
- **Signup fleet fields** — confirmed writing to profile row earlier, but not
  re-verified after recent changes.

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
