# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-06-27
**Current sprint:** Vendor / Client web app (PWA) — 2 week build
**Build order across project:** Vendor app FIRST → then Field Agent app → then Admin dashboard

---

## Where we are right now

Phase 0 complete. Starting Phase 1 — Foundations. Schema drafted by Teammate 1
and reviewed. Repo exists with foundation already in place.

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
My load is light early (days 1–2), peaks mid-sprint (days 4–9, realtime), tapers
to ship. Auth quickstart (~1 hr) to be done in the Day-1 gap while B builds schema.

---

## Status by phase

**Phase 0 — Setup (half day, all three)** — DONE
- Engine + field-agent code confirmed parked. Prisma confirmed, B extended
  schema with 5 vendor tables (reviewed). Lanes confirmed.

**Phase 1 — Foundations (days 1–4)** — IN PROGRESS
- B: schema + types first (everyone waits on this), validation, stub data-display screens.
- A (me): auth, then middleware, then RLS. Auth needs B's types; RLS needs B's schema.
- C: design tokens + core components (Button/Field/Card first).

**Phase 2 — Core journey (days 4–9)** — NOT STARTED
- A (me): realtime tracking screens, secure tracking link, profile.
- B: onboarding/signup screens, dashboard, compliance, certificate PDF, seed/sim surface.
- C: request → offer → handover flow.

**Phase 3 — PWA, hardening, ship (days 9–13)** — NOT STARTED
- C: PWA manifest, service worker, offline, accessibility.
- A (me): re-test RLS with 2nd account, server-side validation, no secret leaks.
- All: click-through QA, Lighthouse, demo seed data, "report an issue" link, README.

---

## My immediate next steps (Person A)

1. Hold the Phase 0 kickoff call (agenda above).
2. Do the Supabase-Auth-with-Next.js quickstart (~1 hr) during Day-1 while B builds schema.
3. Build login/signup auth wiring against mock shapes; swap to B's real types once pushed.
4. Write RLS policies once B's schema lands (see open questions for the gotchas).

> **Email confirmation:** turned OFF for this sprint (team-only eval). Rationale +
> the flip-to-production steps are in `CONTEXT.md`. This is a Supabase dashboard
> toggle (Authentication → Sign In/Providers → Email → "Confirm email").

---

## Flagged for Person C (PWA / component-library shell)

- **Root shell still default Next.js scaffold.** `src/app/globals.css` auto-
  switches to a dark background on `prefers-color-scheme: dark` (the
  create-next-app default), and `src/app/layout.tsx` doesn't constrain width —
  so pages render full-bleed/website-sized instead of phone-app-sized. Noticed
  while testing the new auth screens (2026-06-27). Left untouched since the
  root layout/global styles overlap C's component-library + PWA-shell
  ownership — flagging rather than silently restyling shared code. Worth
  addressing whenever the real app shell/frame gets built.

## Open questions / things to confirm

- **`Pickup.id` type:** confirm it's `@db.Uuid` in Postgres (like `Profile.id`), not plain text — RLS compares against `auth.uid()` which is a UUID. Quick fix if not.
- **`status_events` RLS is indirect:** that table has only `pickup_id` (no `vendor_id`), so its policy must subquery through `pickups`. All other tables have `vendor_id` directly → flat policy.
- **Scheduled screen agent/ETA is fake data:** no agent/ETA field in schema (no field-agent app yet). It's hardcoded demo UI — confirm so nobody hunts for a column.
- **Do NOT render `Offer.materialBreakdown` / `Offer.deductions` on vendor offer screens.** Lead's instruction: no recovered value/recovery rate shown to vendor, period. Data may be stored, just not displayed on `offer`/`offer-breakdown`/tracking. Person C to be told.
- **Where RLS SQL lives:** decide with B — a versioned `.sql` migration file in the repo (so it's committed + reproducible). Learn policies on the Supabase dashboard first, then move to file via Claude Code.

---

## Wireframe state (current, vendor side)

`CLBIPP_Vendor_Wireframes_1.html` — 17 screens, current and approved. Recent changes:
- Recovered value / recovery rate KPI removed from offer, tracking, and profile screens (lead's instruction).
- Signup split into account-type selector → Individual (minimal) vs Fleet (GST/PAN/business address/EPR + KYC upload).

Screen list: login · signup-type · signup-individual · signup-fleet · dashboard-empty ·
dashboard · request · submitted · scheduled · offer · offer-breakdown · handover ·
track-progress · track-recovered · track-certified · certificate · compliance · profile.
