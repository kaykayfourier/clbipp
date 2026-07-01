# CLBIPP — Context & Decisions

> **Stable reference.** The things that don't change often: what the project is,
> the stack, decisions made and *why*, conventions. For live status see
> `PROJECT_STATE.md`. Update this only when a real decision changes.

---

## What the project is

**Closed-Loop Battery Intelligence & Pricing Platform (CLBIPP).** A platform for
battery recovery + EPR compliance. A vendor offloads used batteries; a field agent
assesses and quotes them; an admin oversees pricing rules and compliance. A
deterministic engine picks the pathway (Reuse / Refurbish / Recycle) and a price.

Three-person internship build. Three surfaces, built in sequence:
1. **Vendor / Client app** (current sprint) — the supplier's PWA.
2. **Field Agent app** (later) — mobile intake → quote flow.
3. **Admin dashboard** (later) — config, oversight, compliance reporting.

---

## Stack

- **Next.js** (TypeScript, App Router)
- **Prisma** → **Supabase Postgres** (Prisma manages table structure)
- **Supabase Auth / Realtime / Storage**
- **Tailwind + shadcn/ui**
- **Vercel** (deploy; preview URL per PR)
- **Vitest** (tests)
- PWA via app manifest + service worker

One repo, three apps separated by route folders. Shared code at root.

---

## Decisions made (and why)

- **Vendor app built first, alone this sprint.** It's the surface guaranteed to
  ship and the one the lead circulates for feedback. Field-agent + admin come later.
- **Decision engine is NOT in the vendor app.** The vendor side never shows internal
  pricing mechanics. Offers + status changes are faked by an internal seed/sim
  surface (a protected route + seed script), not the real engine.
- **No recovered value / no recovery rate shown to the vendor — ever.** Lead's
  explicit instruction. Offer carries price + qualitative rationale only. Material
  weights appear ONLY on the EPR certificate (a compliance doc), not on offer/tracking.
- **Prisma stays** (already set up). B extends the existing Prisma schema with the
  vendor tables. RLS is written separately as raw SQL (Prisma has no RLS concept) —
  no conflict, different layers of the same database.
- **Individual vs Fleet split at signup.** Individual = minimal fields. Fleet =
  GST + PAN + business address + EPR ID + KYC document upload.
- **Email confirmation OFF for now.** This sprint's build is evaluated by the
  team only (lead circulates it for feedback), so requiring every tester to
  confirm an email adds friction with no anti-abuse payoff. Auth stays secure —
  passwords, sessions, and RLS all still apply. Flip ON (Supabase dashboard
  toggle + add `src/app/auth/confirm/route.ts` for the callback) when promoting
  toward production.
- **Single repo, not three.** All apps share schema, auth, components — splitting
  would duplicate the foundation or add packaging overhead. Separate by route folder.
- **Phase sequencing is fixed; lane ownership is strict-by-default but shiftable;
  the technical "how" is open.** Claude Code (or anyone) can propose a better
  implementation approach for a task. Phase *order* stays fixed. Lane *ownership*
  holds by default but can move when a task straddles lanes — by agreement,
  flagged, and logged in `LANE_OWNERSHIP.md`. The "who" is a team decision, not a
  silent one.

## Decisions explicitly deferred (do not build yet)

- Green points / coupon / rewards system (future phase).
- Blockchain / crypto rewards idea (future, lead's long-term vision).
- CPCB "return" export logic (flagged a vulnerable spot; lead to finalize ~July 1).
- Decision-engine input tuning (waits on real feedback).
- Bulk-sell flow for fleets (unconfirmed — may just be repeated requests).

---

## Conventions

- Next.js App Router: pages at `src/app/[route]/page.tsx`, APIs at `src/app/api/[route]/route.ts`.
- Pure logic in `src/lib/`. Tests next to source as `*.test.ts`, run with `npm test`.
- Branch naming: `feat/<scope>`. No direct pushes to `main` — branch → PR → 1 review → merge.
- Supabase setup (Storage policies, Realtime, RLS) written as SQL in a versioned file,
  not configured via dashboard clicks (reproducible + reviewable).
- Wrap Supabase calls in helpers in `src/lib/supabase-*.ts` rather than scattering
  client calls across pages.

## Status lifecycle (locked contract)

`requested → scheduled → collected → tested → processed → recovered → certified`
(plus `cancelled`). This is the shared state machine the whole app codes against.

---

## Key project files (in project knowledge)

- `CLBIPP_Vendor_Wireframes_1.html` — current vendor UI, 17 screens. Source of truth for layout.
- `CLBIPP_Vendor_Flows_v3.docx` — vendor-side process flows (V1–V6) behind the wireframe.
- `CLBIPP_Vendor_Build_Plan.pdf` — the 2-week vendor build plan with lanes + phases.
- `CLBIPP_Process_Map_v2.docx` — three-sided process map (vendor / agent / admin).
- `DecisionSystemBreakdown.pdf` — engine spec (relevant to the LATER field-agent app, not this sprint).
- `Price_Discovery_Platform.docx` — original platform brief.
- `team_tasks_v2.pdf` — older full-project task breakdown (superseded for vendor scope by the build plan).

## Ground rules

- Daily 10-min standup, voice, no agenda.
- Blocked > 2 hours → say so in group chat immediately.
- Finished something others wait on → announce it explicitly.
- Contracts (offer shape, status lifecycle) locked in tracker before deep coding.
- Last two days are for fixing, not new features.
