# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository. It is shared and committed — keep it limited to facts true for
anyone working in this repo. Personal working-style preferences belong in
`CLAUDE.local.md` instead (gitignored, not this file).

## What this project is

Closed-Loop Battery Intelligence & Pricing Platform (CLBIPP). A platform for
battery recovery + EPR compliance — vendor offloads batteries, a field agent
assesses and quotes them, an admin oversees pricing rules and compliance.
Three-person internship build.

Three surfaces, built **in sequence, in this one repo**, separated by route folders:
1. **Vendor / Client app** — `/` and vendor screens — **CURRENT SPRINT**
2. **Field Agent app** — `/field/...` — later
3. **Admin dashboard** — `/admin/...` — later

Shared code (`/lib`, `/components`, Prisma schema, auth) lives at the root.

## Current sprint: Vendor app only

Read `docs/PROJECT_STATE.md` first for live status; `docs/CONTEXT.md` for
decisions made and why. This section is the quick version.

**In scope:** the 17 vendor wireframe screens
(`docs/CLBIPP_Vendor_Wireframes_1.html` is the layout source of truth).

**PARKED — do not edit or extend this sprint:**
- `src/lib/decisionEngine.ts` (Layers 0–5, merged, tested) — belongs to the
  later Field Agent app.
- Any existing field-agent intake-flow code.

**No recovered value / recovery rate shown to the vendor, anywhere.** Offer
screens show price + qualitative rationale only. `Offer.materialBreakdown` /
`Offer.deductions` may exist in the DB but must never render on `offer`,
`offer-breakdown`, or tracking screens. Fine on the certificate (compliance doc).

**Status lifecycle (locked contract):**
`requested → scheduled → collected → tested → processed → recovered → certified`
(plus `cancelled`).

## How to treat the plan in PROJECT_STATE.md

- **Lane ownership and phase sequencing are fixed.** Who builds what, and in
  what order, was decided for reasons outside the codebase (team coordination,
  not yet known to you). Don't propose reassigning work between people.
- **Specific technical implementation choices are defaults, not mandates.** If
  you see a better technical approach for *how* to build a given task — more
  correct, more secure, more maintainable — say so explicitly with your
  reasoning, and wait for a decision before doing it. Don't silently deviate,
  and don't silently follow a worse pattern either.
- When in doubt: a working, secure implementation beats matching the plan's
  suggested detail to the letter. The "who/when" is fixed; the "how" isn't.

## Ownership map (this sprint)

| Area | Owner |
|------|-------|
| Supabase Auth, session/route protection, RLS policies (all tables), login + signup auth wiring, the 3 realtime tracking screens, profile screen | Person A |
| Prisma schema + types, onboarding/KYC screens, dashboard, compliance, certificate PDF generation, internal seed/simulation surface | Person B |
| Component library (from wireframe), the full request → offer → handover flow, PWA + offline, deployment/CI | Person C |

**Do not edit another lane's area, even if faster.** If you need something from
a lane that isn't finished yet, stub it against the agreed shape and leave
`// TODO: replace with <thing> once <owner> ships it`. See "Stub-data pattern" below.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all tests once (Vitest)
npm run test:watch   # Run tests in watch mode

# Run a single test file
npx vitest run src/lib/<path>/<file>.test.ts

# Database (Person B owns schema.prisma — don't edit it directly)
npx prisma migrate dev     # Apply schema changes
npx prisma studio          # Visual DB editor
```

## Stack

Next.js (TypeScript, App Router) · Prisma → Supabase Postgres · Supabase Auth /
Realtime / Storage · Tailwind + shadcn/ui · Vercel · Vitest

**Prisma manages table structure. RLS is written separately as raw SQL** —
Prisma has no concept of row-level security; different layer, same database,
no conflict.

## Stub-data pattern (use when a dependency isn't ready yet)

If the lane you depend on hasn't shipped its real thing yet, don't guess its
shape or wait idle — build against an agreed mock in `src/lib/mock-data.ts`
matching the locked contract (offer shape / status lifecycle / schema column
names), and leave a `// TODO: swap for real <X> once <owner> ships it` comment.
When the real thing lands, the swap is a search-and-replace on imports. This
keeps every lane moving in parallel without anyone touching another's files.

## Key docs (read when relevant — don't load all of these by default)

- `docs/PROJECT_STATE.md` — live status, current phase, open questions. Check first.
- `docs/CONTEXT.md` — decisions made and why, conventions, deferred items.
- `docs/CLBIPP_Vendor_Wireframes_1.html` — UI source of truth for this sprint.
- `prisma/schema.prisma` — the real vendor schema (Profile, Pickup, Offer,
  StatusEvent, Certificate). Read before writing any RLS policy or auth code
  that touches these tables. Owned by Person B — don't edit directly.
- `docs/DecisionSystemBreakdown.pdf` — engine spec. For the LATER Field Agent
  app — not this sprint. Needing this for a vendor-app task is a sign of scope drift.
- `docs/CLBIPP_Vendor_Build_Plan.pdf` — the full granular build plan (screen
  mappings, exact checklists, demo-path definition of done). `PROJECT_STATE.md`
  has the operative summary; only open this PDF if more detail is needed.
- `docs/ai-prompts/database-rls-policies.md` — read before writing/editing any RLS policy.
- `docs/ai-prompts/database-create-migration.md` — read before authoring a migration.

**Ignore `docs/team_tasks_v2.*` if present** — it's the old full-project task
breakdown from before the vendor-only rescope. Superseded by `PROJECT_STATE.md`
and the ownership map above. Do not use it for lane or phase decisions.

**Scope note for future docs:** only the docs listed above are in scope this
sprint. If docs for the later Field Agent or Admin apps get added (e.g. under
`docs/field-agent/` or `docs/admin/`), they are NOT relevant to current
vendor-app work — don't read them for context on this sprint's tasks unless
explicitly asked to.

## Conventions

- App Router structure: pages at `src/app/[route]/page.tsx`, API routes at
  `src/app/api/[route]/route.ts`, pure logic in `src/lib/`.
- Tests co-located as `*.test.ts` next to source files.
- TypeScript strict mode — no `any`; use `unknown` then narrow.
- RLS policies and other hand-written SQL live in a versioned file under
  `supabase/` (e.g. `supabase/policies.sql`). Prototyping a policy in the
  Supabase dashboard is fine; the final version must land in a repo file.
- Wrap Supabase calls (Storage, Realtime, auth) in helpers under
  `src/lib/supabase-*.ts` rather than scattering client calls across pages.
- Branch naming: `feat/<scope>`. No direct pushes to `main` — branch → PR →
  1 review → merge.
- Inline error handling at API route / async boundaries; let internal pure
  functions throw freely.
- Comments explain *why*, not *what*.
- Shared data shapes (e.g. JSON breakdown fields) have stable keys — don't
  change an existing key without updating every consumer.
- One feature = one small branch/PR. Don't bundle unrelated changes.

## Path alias

`@/*` maps to the project root.

## When stuck

- RLS / policy question → read `docs/ai-prompts/database-rls-policies.md` first.
- Migration question → read `docs/ai-prompts/database-create-migration.md` first.
- UI/UX question → check `docs/CLBIPP_Vendor_Wireframes_1.html` — navigation
  between screens is built into it (each button's `data-go` shows the target).
- Status / "what's done, what's next" → check `docs/PROJECT_STATE.md` first.
- Stack question → Next.js + Supabase + Prisma, deployed to Vercel. Don't
  introduce new frameworks.
