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

Three surfaces, built **in sequence**, as three apps in one **Turborepo
monorepo** (migrated 2026-08-09):

1. **Customer / Vendor app** — `apps/customer` — **CURRENT SPRINT**
2. **Field Agent app** — `apps/agent` — scaffolded, built later
3. **Admin dashboard** — `apps/admin` — scaffolded, built last

```
apps/customer            the customer app (Next.js App Router)
apps/agent · apps/admin  scaffolds only
packages/ui              components, design tokens, cn()   → @clbipp/ui
packages/auth            supabase server/browser/admin clients, auth.ts,
                         realtime, createAuthMiddleware()  → @clbipp/auth
packages/core            validation, offer, booking/pricing,
                         document numbering + ₹ formatting,
                         payments/wallet ledger            → @clbipp/core
packages/pdf             EPR certificate · pickup receipt ·
                         invoice templates + renderers     → @clbipp/pdf
packages/database        prisma schema + migrations + client + seed
                                                           → @clbipp/database
packages/decision-engine PARKED engine (Field Agent app, later)
packages/tsconfig · packages/eslint-config
supabase/                policies.sql, storage-policies.sql, realtime.sql,
                         grants.sql — hand-written SQL, stays at repo root
```

**Import rules:** inside an app, `@/*` still means that app's `./src/*`. Anything
shared is imported from `@clbipp/<pkg>` — never by relative path across
packages, and never from `@prisma/client` directly (use `@clbipp/database`,
which re-exports the client *and* every model type and enum).

Packages ship raw TypeScript and are compiled by each app via
`transpilePackages` — there is no per-package build step to maintain.

## Current sprint: Vendor app only

Read `docs/PROJECT_STATE.md` first for live status; `docs/CONTEXT.md` for
decisions made and why. This section is the quick version.

**In scope:** the 17 vendor wireframe screens
(`docs/CLBIPP_Vendor_Wireframes_1.html` is the layout source of truth).

**PARKED — do not edit or extend this sprint:**
- `packages/decision-engine/` (Layers 0–5, merged, tested) — belongs to the
  later Field Agent app.
- Any existing field-agent intake-flow code.

**No recovery rate % shown to the vendor, anywhere.** This one is hard — the
company's flow document doesn't ask for it either.

**No recovered value shown to the vendor — default, now scoped (Batch 8).** Offer
screens show price + qualitative rationale only; `Offer.materialBreakdown` /
`Offer.deductions` may exist in the DB but **don't render them on `offer`,
`offer-breakdown`, or tracking screens** (they're fine on the certificate, a
compliance doc). That part still holds.

What changed 2026-08-09: Plan v2 **D6** relaxes the rule for the money surfaces
the company's flow document explicitly asks for, and Batch 8 built them — so
**`/payment/[id]`, `/wallet`, `/receipt/[id]` and the invoice PDF do show ₹.**
A payout screen that hides the amount is not a payout screen. Use `formatPaise`
from `@clbipp/core` so every ₹ in the app is formatted identically.

So the line is: **what the customer was paid is visible; how we valued it
material-by-material is not.** The separate **no recovery-rate %** rule is
untouched. See `docs/COMPANY_FLOW_REVIEW_2026-08-07.md`.

**Status lifecycle (locked contract):**
`requested → scheduled → arrived → offered → collected → tested → processed →
recovered → certified` (plus `cancelled`).

> `arrived` and `offered` were **added 2026-08-09 (Batch 7A)** — agreed, applied,
> and the contract is locked again at nine stages. Rationale: the company flow
> document puts assessment and quoting *on site*, and before this "an offer
> exists" was an implicit sub-state of `scheduled` rather than a status, which is
> what made the offer screens unreachable in Batch 6.5. `/offer` and
> `/offer-breakdown` now admit `status === 'offered'` exactly.

**Stage order has one source of truth per layer, and they must agree:**
`enum PickupStatus` (`schema.prisma`) · `LIFECYCLE_STAGES` + `STAGE_LABELS`
(`packages/ui/src/tokens.ts`) · `pickupstatusSchema` (`packages/core`) ·
`LIFECYCLE` (`reset-demo.ts`). Screens must **not** re-declare the list — use
`isLifecycleStage` / `isStageBefore` from `@clbipp/ui`.

## How to treat the plan in PROJECT_STATE.md

- **Phase sequencing is fixed; lane ownership is strict-by-default but
  shiftable.** The order of phases was decided for reasons outside the codebase
  (team coordination) — don't reorder it. Lane ownership holds by default, but
  when a task genuinely straddles lanes it can move by agreement: flag it, get
  the other owner's OK, and log it in `docs/LANE_OWNERSHIP.md`. Don't silently
  reassign work, and don't silently absorb another lane's task either.
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
| Supabase Auth, session/route protection, RLS policies (all tables), login + full signup/account-creation flow (account-type selector, individual & fleet forms, `auth.signUp` + initial profile-row insert), the 3 realtime tracking screens, profile screen, **PWA + offline, deployment/CI**, **the cross-lane navigation seam** (dashboard↔flow↔track routing) | Person A |
| Prisma schema + types, post-signup KYC upload + verification, dashboard, compliance, certificate PDF generation, internal seed/simulation surface | Person B |
| Component library (from wireframe), the full request → offer → handover flow | Person C |

> **Temporary override (2026-08-09, customer-app revamp):** C is assumed
> unavailable (Plan v2 D4) and B gave A explicit permission to cover his lane for
> this revamp — so **A is currently executing all three lanes**. Logged in
> `docs/LANE_OWNERSHIP.md`. The map above is what ownership reverts to.

**Do not edit another lane's area, even if faster** — unless ownership has been
shifted by agreement and logged in `docs/LANE_OWNERSHIP.md` (lanes are
strict-by-default but can move when a task straddles them: flag → agree → log).
If you need something from a lane that isn't finished yet, stub it against the
agreed shape and leave `// TODO: replace with <thing> once <owner> ships it`.
See "Stub-data pattern" below.

## Commands

All commands run from the **repo root** (turbo fans them out to the workspaces).

```bash
npm run dev          # Customer app dev server
npm run build        # Build every app + package
npm run lint         # ESLint across the workspace
npm run test         # All tests (Vitest) — currently 35

# Run a single test file (from the owning package)
cd packages/core && npx vitest run src/booking.test.ts

# Database
npm run db:migrate --workspace=@clbipp/database        # Apply schema changes
npm run reset-demo                                     # Wipe + reseed the demo data
npm run create-buckets --workspace=@clbipp/database    # Storage buckets (idempotent)
cd packages/database && npx prisma studio              # Visual DB editor

# Apply hand-written SQL without opening the Supabase dashboard
cd packages/database
npx prisma db execute --file ../../supabase/policies.sql --schema prisma/schema.prisma
```

**Env files:** `apps/customer/.env.local` (Supabase URL + keys, DB URLs) and
`packages/database/.env` (DB URLs only). Both gitignored.

## Stack

Next.js (TypeScript, App Router) · Prisma → Supabase Postgres · Supabase Auth /
Realtime / Storage · Tailwind + shadcn/ui · Vercel · Vitest

**Prisma manages table structure. RLS is written separately as raw SQL** —
Prisma has no concept of row-level security; different layer, same database,
no conflict.

## Stub-data pattern (use when a dependency isn't ready yet)

If the lane you depend on hasn't shipped its real thing yet, don't guess its
shape or wait idle — build against an agreed mock in `packages/core/src/mock-data.ts`
matching the locked contract (offer shape / status lifecycle / schema column
names), and leave a `// TODO: swap for real <X> once <owner> ships it` comment.
When the real thing lands, the swap is a search-and-replace on imports. This
keeps every lane moving in parallel without anyone touching another's files.

## Key docs (read when relevant — don't load all of these by default)

- `docs/REVAMP_BATCHES_2026-08-09.md` — **live status + resume point.** Batch
  tracker for the customer-app revamp, demo accounts, commands, known gaps.
  **Read this first.**
- `docs/PLAN_V2_CUSTOMER_APP.md` — the operative plan (decisions D1–D7, screen
  map, batch definitions).
- `docs/PROJECT_STATE.md` — historical status. Its top section is current; most
  of the detail below that predates the monorepo migration and schema v2.
- `docs/CONTEXT.md` — decisions made and why, conventions, deferred items.
- `docs/LANE_OWNERSHIP.md` — lane-shift policy (strict-by-default, flexible-with-flagging) + the log of ownership changes.
- `docs/markdown-preview.pdf` — **the company's flow document** (sent by HR after
  they reviewed our first draft). The company's intended flow for the app. It is
  an image-only PDF — render the pages to read it, there is no text layer.
- `docs/COMPANY_FLOW_REVIEW_2026-08-07.md` — that document reviewed against what
  we've actually built: every gap, by area and by owner, plus the open questions
  sent back to the company. **Read this before planning any work against the flow
  document.** Status: awaiting the company's reply — don't start building to the
  flow document until they confirm.
- `docs/CLBIPP_Vendor_Wireframes_1.html` — UI source of truth for this sprint.
  Note it predates the company flow document; where the two disagree, the flow
  document wins (once confirmed).
- `docs/BATCH_0B_SCHEMA.md` — reference for what every schema-v2 model means.
  **Already executed** (2026-08-09) — read it, don't run it.
- `packages/database/prisma/schema.prisma` — the real schema (Profile, Pickup,
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

- App Router structure: pages at `apps/<app>/src/app/[route]/page.tsx`, API
  routes at `apps/<app>/src/app/api/[route]/route.ts`. Pure, shareable logic
  belongs in a package (`packages/core`), not in an app.
- Tests co-located as `*.test.ts` next to source files, inside the owning
  package. Apps hold no tests.
- TypeScript strict mode — no `any`; use `unknown` then narrow.
- RLS policies and other hand-written SQL live in a versioned file under
  `supabase/` (e.g. `supabase/policies.sql`). Prototyping a policy in the
  Supabase dashboard is fine; the final version must land in a repo file.
- Wrap Supabase calls (Storage, Realtime, auth) in helpers inside
  `packages/auth` rather than scattering client calls across pages.
- All money is **integer paise** — never a float, never rupees, anywhere.
- Branch naming: `feat/<scope>`. No direct pushes to `main` — branch → PR →
  1 review → merge.
- Inline error handling at API route / async boundaries; let internal pure
  functions throw freely.
- Comments explain *why*, not *what*.
- Shared data shapes (e.g. JSON breakdown fields) have stable keys — don't
  change an existing key without updating every consumer.
- One feature = one small branch/PR. Don't bundle unrelated changes.

## Path alias

`@/*` maps to `./src/*` **within each app** (e.g. `apps/customer/src`). Shared
code is never reached with `@/` — it comes from `@clbipp/{ui,auth,core,database}`.

## When stuck

- RLS / policy question → read `docs/ai-prompts/database-rls-policies.md` first.
- Migration question → read `docs/ai-prompts/database-create-migration.md` first.
- UI/UX question → check `docs/CLBIPP_Vendor_Wireframes_1.html` — navigation
  between screens is built into it (each button's `data-go` shows the target).
- Status / "what's done, what's next" → `docs/REVAMP_BATCHES_2026-08-09.md`.
- Stack question → Next.js + Supabase + Prisma in a Turborepo monorepo, deployed
  to Vercel. Don't introduce new frameworks.
- "Where does this file live now?" → the 2026-08-09 migration moved everything.
  App code is under `apps/customer/`, shared code under `packages/`. Search the
  repo rather than trusting a path written in an older doc.
