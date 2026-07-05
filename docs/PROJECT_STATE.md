# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-07-05
**Current sprint:** Vendor / Client web app (PWA) — 2 week build
**Build order across project:** Vendor app FIRST → then Field Agent app → then Admin dashboard

---

## Where we are right now

Phase 1 is complete. Phase 2 is underway. As of 2026-07-05:

- **A** has completed the signup split flow (Phase 1 loose end now closed) and
  is building the tracking screens, profile, and public tracking link.
- **B** has shipped dashboard, compliance, certificate scaffold (all mock data),
  and has agreed to add a `Pickup.publicToken` column (blocks A's Task 5).
- **C** has shipped the full component library and AppShell. PWA/deploy is
  Phase 3.

Target: finish Phase 2 screens this session, then go straight to Phase 3.

---

## The repo (already exists — do NOT create a new one)

Single repo for all three apps. Already contains:
- Next.js + TypeScript + App Router scaffold
- Prisma + Supabase Postgres set up, initial migration done
- `src/middleware.ts` (must live under `src/` — Next's dev bundler silently
  never registers it at the project root when `src/app` is in use, no error,
  no warning; root-level `middleware.ts` was the cause of the Phase 1
  login/signup-redirect bug, fixed 2026-06-29)
- Decision engine (`src/lib/decisionEngine.ts`) — Layers 0–5, 20 passing tests, merged. **PARKED for this sprint** (vendor app does not use it).
- Field-agent intake flow — an early merged branch. **PARKED for this sprint.**
- README with architecture + Prisma guidelines

The three apps live in ONE repo, separated by route folders:
`/` + vendor screens (this sprint) · `/field/...` (later) · `/admin/...` (later).
Shared `/lib`, `/components`, Prisma schema, auth sit at root.

---

## Lanes (this sprint — vendor app only)

| Person | Owns |
|---|---|
| **A (me / Aamir)** | Supabase Auth, session/route protection, RLS policies, login + full signup/account-creation flow (type selector + individual/fleet forms, `auth.signUp` + initial profile-row insert), realtime tracking screens, profile. |
| **B (Teammate 1)** | Prisma schema + types, post-signup KYC upload + verification, dashboard, compliance, certificate PDF generation, internal seed/sim surface. |
| **C (Teammate 2)** | Component library (from wireframe), full request → offer → handover flow, PWA + offline, deployment/CI. |

Setup + final ship are shared by all three.

**Lane shifts are logged in `LANE_OWNERSHIP.md`** (policy: strict-by-default,
flexible-with-flagging). Most recent: signup/account-creation flow moved B → A
on 2026-06-27 (B keeps post-signup KYC).

**My personal context:** beginner, learning the stack as I go. Using Claude Code
as a supervised tool (read + understand what it generates, don't blind-trust).

---

## Status by phase

**Phase 0 — Setup (half day, all three)** — DONE

**Phase 1 — Foundations** — DONE (one A loose end carrying into Phase 2)

Person A:
- ✅ `src/middleware.ts` — route protection, correct src/ location
- ✅ `src/lib/supabase/auth.ts` — signIn, signUpWithProfile (now accepts fleet fields), signOut, getCurrentProfile
- ✅ Login page (`/login`) — AppShell + design tokens, Field/Button
- ✅ Signup split flow — 3-screen split: type selector → individual form / fleet form.
  Fleet fields (GST/PAN/EPR/address/company) collected at signup, written to profile row.
  All auth screens use AppShell with hideNav (no tab bar during onboarding).
- ✅ RLS policies — all 5 tables versioned in `supabase/policies.sql`

Person B:
- ✅ Prisma schema — Profile, Pickup, Offer, StatusEvent, Certificate
- ✅ Zod validation — `src/lib/validation.ts`
- ✅ Seed data — `prisma/seed.ts` (4 pickups: PKP-2031 certified individual,
  PKP-2024 certified fleet, PKP-2039 recovered fleet, PKP-2042 scheduled fleet)

Person C:
- ✅ Design tokens — `src/lib/tokens.ts` (colors, typography, radii, LIFECYCLE_STAGES)
- ✅ Component library — Button, Card, Input, Badge, Banner, ListRow, Tabs, Timeline
- ✅ App shell + phone frame, Empty/Error/Loading states
- ✅ Design system showcase at `/design-system`
- ✅ Tailwind tokens wired in `globals.css`

**Phase 2 — Core journey** — IN PROGRESS

Person B (shipped so far):
- ✅ `src/app/(app)/dashboard/page.tsx` — populated + empty states (mock data)
- ✅ `src/app/(app)/compliance/page.tsx` — filter chips + certificate list (mock data)
- ✅ `src/app/(app)/certificates/[id]/page.tsx` — certificate detail (scaffolded)

Person A — IN PROGRESS (build order below)
Person C — NOT STARTED

**Phase 3 — PWA, hardening, ship** — NOT STARTED

---

## Person A — build order (current session)

Work through these in sequence. Each is one branch/PR.

### ✅ 1. Signup split flow (Phase 1 loose end — DONE 2026-07-05)

Replace the single `/signup` page with a 3-screen split:

| Step | Route | Content |
|---|---|---|
| Type selector | `/signup` | Two option cards: Individual vs Fleet. No form fields — just routes to step 2. |
| Individual form | `/signup/individual` | Full name, email, password → `signUpWithProfile({ vendorType: 'individual' })` |
| Fleet form | `/signup/fleet` | Company name, contact name, email, password, EPR reg ID, GST number, PAN number, business address → `signUpWithProfile({ vendorType: 'fleet', ...fleetFields })` |

KYC upload is Person B's post-signup step — don't add it here. Just collect the
fields and insert the profile row. Use C's `<Input>` and `<Button>` components
(they're available now).

### 2. Tracking screens — static first

Three states of one route: `src/app/(app)/track/[id]/page.tsx`.
Read pickup + status_events from DB via Prisma server component. Render
conditionally based on `pickup.status`.

| Status bucket | Screen | Key content |
|---|---|---|
| `collected` / `tested` / `processed` | track-progress | Lifecycle Timeline (partial). Two banners: "We'll notify you…" (info) + "Certificate unlocks once recovered" (lock). No stats. |
| `recovered` | track-recovered | Full timeline to recovered. Recovery summary card: total weight kg only — NO recovery rate %, NO ₹ amounts. Expandable material breakdown (weight kg per material from `Certificate.materialSummary` is wrong here — use pickup offer's materialBreakdown weights, not values). Lock banner: "Certificate available once certified." |
| `certified` | track-certified | Full timeline all done. Recovery summary card (kg only). Green banner "Certificate ready." Button → `/certificates/[pickupId]` (B's screen). |

**Do NOT display** recovered value (₹) or recovery rate (%) on any tracking screen —
these are visible in the wireframe HTML but were removed by the lead. Weight (kg)
only is fine.

The tab bar "Track" tab routes here. The Dashboard pickup rows route here too
(B's dashboard currently links rows but navigation isn't wired yet).

### 3. Tracking screens — add Realtime

After the static version works: add a Supabase Realtime subscription in
`src/lib/supabase-realtime.ts` so the timeline updates without a page reload
when a `status_events` row is inserted for this pickup.

### 4. Profile screen (full)

Replace the minimal stub at `src/app/(app)/profile/page.tsx` with the full
wireframe version:

- Avatar card: initials from name (e.g. "AH"), company name or full name, EPR reg ID (fleet) or "—" (individual)
- Account section: contact email, batteries submitted count (count of profile's pickups)
- List rows: "Notifications" and "Edit company details" — render as disabled rows with chevrons (stub, not wired this sprint)
- Log out button

Reads from `getCurrentProfile()` + a Prisma count of pickups for this vendor.
**No avg recovery rate** — that was removed by the lead.

### 5. Public tracking link `/t/[token]`

A public (no-auth) route showing a read-only lifecycle timeline for a pickup,
accessible via a token. The handover screen (C's) will link to this.

**B has agreed to add `Pickup.publicToken`** (resolves the timing mismatch —
`Certificate.publicToken` only exists at certified, but the link is shared at
handover/collected). Build this route once B's column + backfill lands. Add a
carve-out for `/t/...` in `src/middleware.ts` at that point.

---

## Seed data reference (for building against)

Seeded by `prisma/seed.ts`. Two vendor accounts (not real Supabase auth users —
used for Prisma-level testing and UI dev only):

| Vendor | ID | Type |
|---|---|---|
| Aamir Hashmi Singh | `00000000-0000-0000-0000-000000000001` | individual |
| Riya Sharma / Altigreen Propulsion | `00000000-0000-0000-0000-000000000002` | fleet |

| Pickup | Vendor | Status | Has offer | Has cert |
|---|---|---|---|---|
| PKP-2031 | individual | certified | ✅ | ✅ |
| PKP-2024 | fleet | certified | ✅ | ✅ |
| PKP-2039 | fleet | recovered | ✅ | ❌ |
| PKP-2042 | fleet | scheduled | ❌ | ❌ |

---

## Phase 2 → Phase 3 prerequisites

**These must be complete before Phase 3 can begin for anyone.** Flag them as
blockers if Phase 2 ends and any of these are missing.

| # | What | Owner | Status |
|---|---|---|---|
| P1 | Wire `BottomTabBar` into `src/app/(app)/layout.tsx` so all logged-in screens share nav | A (with C's OK; log in LANE_OWNERSHIP.md) | Planned in A's Task 2 |
| P2 | `Pickup.publicToken` column added + backfilled in schema | B | B agreed, not yet shipped |
| P3 | A's Task 5 `/t/[token]` route built | A | Blocked on P2 |
| P4 | B's dashboard rows link to **real seeded pickup IDs** (PKP-2031 / 2024 / 2039 / 2042) so dashboard→track navigation resolves | B | Not confirmed yet |
| P5 | Input validation (email format, GST/PAN/EPR patterns, password strength) added to signup forms | A + B (share B's Zod schemas) | **Deferred to Phase 3** — skip for faster Phase 2 testing |

---

## Open questions / standing rules

- **Scheduled screen agent/ETA:** hardcoded demo UI in the wireframe — no
  agent/ETA column in schema (field-agent app doesn't exist yet). Confirmed fake.
- **Do NOT render `Offer.materialBreakdown` / `Offer.deductions` as ₹ values
  on vendor-facing screens.** Weight (kg) is fine on tracking; price values are not.
  Person C to be reminded for offer/offer-breakdown/handover screens.
- **RLS not tested with a real second account yet** — Phase 3 hardening.

---

## Flagged for Person C

**Phase 2 (action before Phase 3):**
- **`(app)/layout.tsx` tab bar wiring** — `BottomTabBar` is built but not wired
  into the group layout. A will wire it in Task 2 with C's OK (log lane shift in
  LANE_OWNERSHIP.md). If A hasn't done it by Phase 2 end, C picks it up.
- **`<Input>` component missing** — `src/components/ui/input.tsx` is mislabeled
  (holds a Card). Auth screens currently use a local `Field` helper with a TODO
  to swap. C should ship the real shared `<Input>` so A/B screens can adopt it.
- **`Offer.materialBreakdown` / `Offer.deductions`** must NOT be rendered as
  ₹ values on offer, offer-breakdown, or handover screens. Lead's instruction.
  The wireframe HTML is stale on this point — the removed KPIs are still visible.

**Phase 3 (design + PWA pass — flag to C now, action in Phase 3):**
- **Max-width mobile container** — on desktop browsers the app stretches full-width.
  Add a `max-w-sm` or `max-w-[390px]` centering wrapper in `AppShell` so desktop
  preview shows a phone-width column. Makes the app feel native-width before PWA.
- **Display font / typography** — wireframe uses a serif display font for headings
  (`.h-display.serif`). Adopt it app-wide in the Phase 3 design pass.
- **Logo** — B2 block is a placeholder. Replace with real mark in Phase 3.
- **Signup hero text** — type-selector screen has a bland subtitle; upgrade copy
  and sizing as part of the design pass.
- **PWA packaging, offline, service worker, deployment/CI** — C's lane, Phase 3.

---

## Wireframe state (current, vendor side)

`CLBIPP_Vendor_Wireframes_1.html` — 17 screens, current and approved. **The HTML
is stale on two points** — the wireframe still shows recovered value (₹) and
recovery rate (%) on offer and tracking screens, but the lead removed those.
Build against the rule in CLAUDE.md, not the wireframe HTML.

Screen list: login · signup-type · signup-individual · signup-fleet · dashboard-empty ·
dashboard · request · submitted · scheduled · offer · offer-breakdown · handover ·
track-progress · track-recovered · track-certified · certificate · compliance · profile.
