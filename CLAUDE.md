# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository. It is shared and committed — keep it limited to facts true for
anyone working in this repo. Personal working-style preferences belong in
`CLAUDE.local.md` instead (gitignored, not this file).

## ⚠ Second glance — `docs/BEFORE_YOU_PUSH.md`

**Read `docs/BEFORE_YOU_PUSH.md` before every push.** It is the consolidated
list of things that have already cost this team an hour each — pre-push checks,
the shared-database rules, and the traps that pass review. The essentials, so
they are in context even if nothing else is:

- **A push to `main` is a deploy, and there is no CI.** Run `npm run build`
  (never optional) plus `npm run smoke` for anything that touches a route or a
  server action. `build` never renders a page with a session; only `smoke`
  catches a server component that throws at request time.
- **One shared Supabase project.** Announce before `npm run reset-demo`, and
  remember it restores rows but **not** grants or policies — missing grants make
  the app half-work rather than fail.
- **The auth guard must stay at `apps/<app>/src/proxy.ts`** — unregistered, it
  fails **OPEN**.
- **Agent screens pass `hideNav` and add no bottom padding.**
- **Integer paise everywhere**; `formatPaise` from `@clbipp/core/format` in
  client components.
- 🔴 **A change that moves a price says so in its commit message.**

## What this project is

Closed-Loop Battery Intelligence & Pricing Platform (CLBIPP). A platform for
battery recovery + EPR compliance — vendor offloads batteries, a field agent
assesses and quotes them, an admin oversees pricing rules and compliance.
Three-person internship build.

Three surfaces, built **in sequence**, as three apps in one **Turborepo
monorepo** (migrated 2026-08-09):

1. **Customer / Vendor app** — `apps/customer` — **built + deployed** (revamp
   merged to `main` 2026-08-15)
2. **Field Agent app** — `apps/agent` — **CURRENT SPRINT** (one week, from
   2026-08-20). Runs on **port 3001** (`npm run dev:agent`). Done so far:
   **0b** scaffold + role-gated auth · **0a** schema + seed · **1** day view +
   job detail · **2** safety checklist · **3** multi-item intake · **4** engine +
   pricing. **Next: Batch 5a (quote screens + offer, Ali); Aamir's own next is
   Batch 5b, the cross-app seam.**
3. **Admin dashboard** — `apps/admin` — scaffolded, built last

```
apps/customer            the customer app (Next.js App Router)
apps/agent               the field agent app — CURRENT SPRINT
apps/admin               scaffold only
packages/ui              components, design tokens, cn()   → @clbipp/ui
packages/auth            supabase server/browser/admin clients, auth.ts,
                         realtime, createAuthMiddleware()  → @clbipp/auth
packages/core            validation, offer, booking/pricing,
                         document numbering + ₹ formatting,
                         payments/wallet ledger,
                         CO₂e impact factors (impact.ts)   → @clbipp/core
packages/pdf             EPR certificate · pickup receipt ·
                         invoice templates + renderers     → @clbipp/pdf
packages/database        prisma schema + migrations + client + seed
                                                           → @clbipp/database
packages/decision-engine pathway + pricing engine (Layers 0–5). Live code this
                         sprint — see "The decision engine" below
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

## Current sprint: Field Agent app

Read `docs/FIELD_AGENT_TASKS.md` first — it is the executable task sheet
(files, steps, done-when checks, traps, per batch). `docs/PLAN_FIELD_AGENT_APP.md`
is the *why* behind it: the wireframe assessment and decisions **D0–D10**, which
are settled and **must not be re-litigated mid-build**.

**In scope:** the 19 screens in §2 of the plan. `docs/CLBIPP_FieldAgentWireframes_V2.html`
is the layout source, but it has nine known defects — §0 of the plan lists them
all and every one is already resolved there. **Read §0 before building from the
wireframe.**

Headlines you need even if you read nothing else:

- **The agent app is the mirror of the vendor app.** The agent sees *everything*:
  full revenue, every cost line, net value, margin %, and the P_min/P_recommended/
  P_max band. That is deliberate, and it is exactly the inverse of the vendor
  rule below — which is untouched. Nothing agent-side may leak onto a vendor screen.
- **The nine-stage lifecycle is unchanged.** No migration adds a stage. The
  wireframe invents `Draft` / `Quoted` / `Pending drop-off` and a 6-stage
  timeline — all of those are derived UI states or existing stages renamed. See
  D5.
- **Jobs are pushed, not pulled** (D2) — `Pickup.agentId` is set when scheduled;
  there is no nearby-jobs feed.
- **A mandatory safety checklist gates intake** (W1). All three HR documents
  require it; the wireframe omitted it entirely. It is enforced by
  `requireSafetyChecklist` in `apps/agent/src/lib/safety-gate.ts`, called
  server-side from **every** intake screen — `/items`, `/items/[itemId]` and
  `/scan` today. **Any new screen downstream of intake adds the same two lines**;
  `/damage`, `/computing`, `/result*` and `/collect` are still stubs and still
  ungated.
- **The D1 chemistry branch has one home:** `isLithium` / `LI_ION_CHEMISTRIES` in
  `packages/core/src/intake.ts`. Never re-list the li-ion chemistries in a screen
  or an API route — `apps/agent/.../api/quote/route.ts` had a second copy and it
  was removed in Batch 3.
- **A `BatteryItem` has two halves and neither overwrites the other.**
  `category` / `quantity` / `weightKg` / `condition` / `photoUrls` are the
  customer's declaration; `chemistry` / `confirmedWeightKg` /
  `confirmedCondition` / `agentPhotoUrls` / `recordedBy` / `recordedAt` are the
  agent's. They are allowed to disagree — that is a finding, not a bug. There is
  deliberately **no `confirmedCategory`**.
- **Chat, VoIP call and turn-by-turn navigation are cut** (D4) — `tel:` link,
  static Leaflet map, Google Maps deep link.
- **Agents do not self-sign-up** (D6). Login only; accounts come from the seed.

**The agent app's auth guard is `apps/agent/src/proxy.ts`** (live since Batch
0b), exporting `proxy`, with `allowRoles: ['agent']` and no `onboardingPath`
(D6). Same rule as the customer app: **it must stay under `src/`** — Next's dev
bundler silently never registers it at the project root when `src/app` is in
use, and an unregistered auth guard fails **OPEN**.

**Every agent screen must pass `hideNav` to `AppShell`.** `apps/agent/src/app/(agent)/layout.tsx`
renders the agent's own `<AgentTabBar />` and owns the clearance under it;
`AppShell`'s built-in bar is the *customer's*. A screen that forgets `hideNav`
renders two navs, and a screen that adds its own bottom padding double-pads.
`npm run smoke` fails on anything but exactly one `aria-label="Main navigation"`.

**Status lifecycle (locked contract):**
`requested → scheduled → arrived → offered → collected → tested → processed →
recovered → certified` (plus `cancelled`).

> `arrived` and `offered` were **added 2026-08-09 (Batch 7A)** and the contract is
> locked again at nine stages. The Field Agent app is what `arrived` was added
> for: the agent taps "Arrived" on site.

⚠ **`cancelled` is NOT terminal — it is re-enterable** (changed 2026-08-23). HR
asked for reschedule-after-cancel, so `reschedulePickup` in the customer app's
`handover/actions.ts` writes **`cancelled → requested`** to reactivate a pickup
rather than making the vendor file a new request. Still nine stages, no
migration. Don't write code that assumes a cancelled pickup is final.

> 🔴 **Two loose ends on that edge, neither resolved.** (1) Reactivation clears
> nothing else — the row keeps its old `agentId`, `agentFeePaise`, `Offer` and
> `Offer.acceptedAt`, so a pickup can sit at `requested` while still carrying an
> accepted offer and an assigned agent. The vendor is re-requesting, not
> resuming, so that probably wants voiding. (2) The audit log can now go
> backwards — a `requested` `status_events` row landing after a `cancelled` one,
> which `buildStages` / `lifecycle-view` assume can't happen. Written up in
> `docs/LANE_OWNERSHIP.md` (2026-08-23).

**Stage order has one source of truth per layer, and they must agree:**
`enum PickupStatus` (`schema.prisma`) · `LIFECYCLE_STAGES` + `STAGE_LABELS`
(`packages/ui/src/tokens.ts`) · `pickupstatusSchema` (`packages/core`) ·
`LIFECYCLE` (`reset-demo.ts`). Screens must **not** re-declare the list — use
`isLifecycleStage` / `isStageBefore` from `@clbipp/ui`.

**Who writes which transition (D7 — the cross-app seam):**

| Transition | Written by |
|---|---|
| `scheduled → arrived` | agent app |
| `arrived → offered` | agent app (creates the `Offer`) |
| vendor accepts | customer app — sets `Offer.acceptedAt`, **status stays `offered`** |
| `offered → collected` | agent app |

⚠ A vendor cannot mark their own battery collected. `acceptOffer` in the
customer app used to write `collected`; Batch 5b changes that.

## Vendor-visibility rules (still live — the agent app is their inverse)

These govern the **customer app**. The Field Agent app deliberately shows the
opposite; nothing from an agent screen may leak onto a vendor screen.

**No recovery rate % shown to the vendor, anywhere.** The company's flow
document doesn't ask for it either. This one is hard.

**No recovered value shown to the vendor — default, scoped in Batch 8.** Offer
screens show price + qualitative rationale only; `Offer.materialBreakdown` /
`Offer.deductions` may exist in the DB but **don't render them on `offer`,
`offer-breakdown`, or tracking screens** (they're fine on the certificate, a
compliance doc).

Plan v2 **D6** relaxes the rule for the money surfaces the company's flow
document explicitly asks for, and Batch 8 built them — so **`/payment/[id]`,
`/wallet`, `/receipt/[id]` and the invoice PDF do show ₹.** A payout screen that
hides the amount is not a payout screen. Use `formatPaise` from `@clbipp/core`
so every ₹ in the app is formatted identically.

So the line is: **what the customer was paid is visible; how we valued it
material-by-material is not.** The separate **no recovery-rate %** rule is
untouched. See `docs/COMPANY_FLOW_REVIEW_2026-08-07.md`.

## The decision engine

`packages/decision-engine` is **no longer parked** (D0, 2026-08-18). Its logic is
the asset; its code is not frozen, and it may be corrected or extended where
that's right.

- **Where the engine and the HR documents disagree, the HR documents win.** The
  engine predates the company's flow document; it is not a specification.
- It has **20 passing tests** and is a live pricing surface. Fix defects and
  anything the documents contradict; **don't refactor it because it could be
  nicer.**
- 🔴 **A change that moves a price must say so explicitly in its PR.** Silent
  economics drift is the one failure here nobody notices until a demo.
- Two known defects are fixed in Batch 4: market-freshness is a module constant
  that breaks any demo older than 24h, and `trace_id` is an in-memory counter
  that collides across serverless cold starts.

**Parked instead:** any existing field-agent intake-flow code from the early
merged branch. It predates the monorepo and schema v2 — don't build on it.

## How to treat the plan in PROJECT_STATE.md

- **Phase sequencing is fixed; lane ownership no longer blocks anyone**
  (changed 2026-08-20). The order of phases was decided for reasons outside the
  codebase (team coordination) — don't reorder it. But lanes are now a default
  assignment, not a gate: **if a task straddles lanes or its owner isn't ready,
  do it and note who actually did it** in `docs/LANE_OWNERSHIP.md`. No waiting
  for agreement first. The one-week deadline outranks tidy ownership. Still
  write down what you did and why — silent reassignment is the thing to avoid,
  not reassignment.
- **Specific technical implementation choices are defaults, not mandates.** If
  you see a better technical approach for *how* to build a given task — more
  correct, more secure, more maintainable — say so explicitly with your
  reasoning, and wait for a decision before doing it. Don't silently deviate,
  and don't silently follow a worse pattern either.
- When in doubt: a working, secure implementation beats matching the plan's
  suggested detail to the letter. The "who/when" is fixed; the "how" isn't.

## Ownership map (this sprint)

All three of us are available for the Field Agent app, so the 2026-08-09
override (A covering all three lanes for the customer-app revamp) **has lapsed**.
Ownership is back to the standing map.

| Area | Owner |
|------|-------|
| **A — Aamir.** Supabase Auth, session/route protection, RLS policies, the app scaffold + auth gate, nav shell, job detail, the safety checklist, realtime + tracking screens, history, profile, PWA + offline, **and the cross-app seam** | A |
| **B — Khalid.** Prisma schema + migrations + seed, the decision engine and all pure pricing logic in `packages/core`, PDF templates, **and deployment/CI** | B |
| ↳ **Batch 0a (schema + seed) moved to A on 2026-08-20** — it blocks A's Batches 1 and 2 and every other lane, so it was taken over rather than waited on. Logged in `docs/LANE_OWNERSHIP.md`. | A |
| **C — Ali.** Component library, and the full on-site flow: intake → assessment → quote → collect → hub drop-off | C |

The agent app decomposes along the same three seams the vendor app did — it's
the same architecture from the other side — so no lane shift was needed.
Batch-by-batch ownership is in §4 of `docs/PLAN_FIELD_AGENT_APP.md`.

**Editing another lane's area is fine when it unblocks you** (changed
2026-08-20) — do the work, then log what you took on in `docs/LANE_OWNERSHIP.md`
so the record is honest. Don't sit blocked waiting for an owner.

Prefer the stub-data pattern only when the dependency is genuinely *unbuildable*
by you (it needs a decision you don't own, or credentials you don't have) —
otherwise just build the real thing. When you do stub, match the locked contract
and leave `// TODO: replace with <thing> once <owner> ships it`. See
"Stub-data pattern" below.

## Commands

All commands run from the **repo root** (turbo fans them out to the workspaces).

```bash
npm run dev          # Customer app dev server  (:3000)
npm run dev:agent    # Field Agent app dev server (:3001) — both can run at once
npm run build        # Build every app + package
npm run lint         # ESLint across the workspace
npm run test         # All tests (Vitest) — currently 142

# Logged-in route check. `npm run build` never renders a page with a session, so
# this is what catches a server component that throws at request time.
npm run smoke                                                     # customer, as business@test
npm run smoke -- --app=agent                                      # agent, as agent@test
npm run smoke -- --app=agent --blocked business@test businesstest # role gate, both
npm run smoke -- --blocked agent@test demo1234                    # directions

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

**Env files:** `apps/customer/.env.local`, `apps/agent/.env.local` (Supabase URL
+ keys, DB URLs — the two apps read the *same* Supabase project; they are
separated by `profiles.role` at the proxy, not by project) and
`packages/database/.env` (DB URLs only). All gitignored; `.env.example` next to
each holds the key names.

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

- `docs/BEFORE_YOU_PUSH.md` — **the second-glance checklist. Read before every
  push.** Pre-push commands, git workflow, shared-database rules, the traps that
  pass review, and the two orderings that actually matter.
- `docs/FIELD_AGENT_TASKS.md` — **the executable task sheet for this sprint.**
  Per batch: files, numbered steps, done-when checklist, traps. **Read this
  first.** (`FIELD_AGENT_TASKS.pdf` is a generated rendition — edit the `.md`.)
- `docs/PLAN_FIELD_AGENT_APP.md` — the operative plan behind it: wireframe
  assessment (§0), decisions **D0–D10**, screen map (§2), schema delta (§3),
  lanes and day-by-day (§4), risks (§5).
- `docs/CLBIPP_FieldAgentWireframes_V2.html` — layout source for this sprint.
  ⚠ It has nine known defects — **read §0 of the plan before building from it.**
- `docs/REVAMP_BATCHES_2026-08-09.md` — customer-app revamp tracker. Historical
  now; still the reference for demo accounts, commands and the outstanding
  Batch 13 scan.
- `docs/PLAN_V2_CUSTOMER_APP.md` — the customer app's plan (decisions D1–D7).
- `docs/PROJECT_STATE.md` — historical status. Its top section is current; most
  of the detail below that predates the monorepo migration and schema v2.
- `docs/CONTEXT.md` — decisions made and why, conventions, deferred items.
- `docs/LANE_OWNERSHIP.md` — lane policy (**do-it-and-note-it since 2026-08-20**) + the log of who actually did what.
- `docs/markdown-preview.pdf` — **the company's flow document** (sent by HR after
  they reviewed our first draft). The company's intended flow for the app. It is
  an image-only PDF — render the pages to read it, there is no text layer.
- `docs/COMPANY_FLOW_REVIEW_2026-08-07.md` — that document reviewed against what
  we've actually built: every gap, by area and by owner, plus the open questions
  sent back to the company. **Read this before planning any work against the flow
  document.** Status: awaiting the company's reply — don't start building to the
  flow document until they confirm.
- `docs/CLBIPP_Vendor_Wireframes_1.html` — UI source for the *customer* app.
  Predates the company flow document; where the two disagree, the flow doc wins.
- `docs/BATCH_0B_SCHEMA.md` — reference for what every schema-v2 model means.
  **Already executed** (2026-08-09) — read it, don't run it.
- `packages/database/prisma/schema.prisma` — the real schema (Profile, Pickup,
  StatusEvent, Certificate). Read before writing any RLS policy or auth code
  that touches these tables. Owned by Person B — don't edit directly.
- `docs/DecisionSystemBreakdown.pdf` — the engine spec. **Relevant this sprint**
  (Batch 4). Where it and the HR documents disagree, the HR documents win (D0).
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
- All money is **integer paise** — never a float, never rupees, anywhere. Format
  it with `formatPaise` from `@clbipp/core`, never a local `/100`. From a
  **client** component import it from **`@clbipp/core/format`** instead: the
  package barrel re-exports `booking-actions` / `payment-actions`, so a value
  import from `@clbipp/core` would pull Prisma into the browser bundle. The
  subpath resolves to `documents.ts`, which imports nothing.
- **The two tracking screens share one implementation.** `/track/[id]` and
  `/t/[token]` both render `packages/ui/src/components/ui/lifecycle-view.tsx`
  (`buildStages`, `LifecycleHeader`, `RecoverySummary`, `CancelledTimeline`).
  Change the lifecycle presentation there, not in a screen.
  ⚠ **Sharing the layout does not share the data.** The public page
  deliberately gets no photos (`includePhotos: false` skips *minting* the signed
  URLs), no partner card, no realtime and no auth-only CTA — the token is a
  forwardable bearer capability. The reasoning is at the top of
  `t/[token]/page.tsx`; read it before passing that page anything new.
- **Pickup row routing lives in `apps/customer/src/lib/pickup-nav.ts`**
  (`pickupHref`, `pickupSubtitle`). The dashboard and `/history` both import it —
  don't re-derive a row's destination inside a screen.
  **The agent app's mirror is `apps/agent/src/lib/job-nav.ts`** (`jobHref`,
  `isActiveJob`, `jobSubtitle`, `jobNextStep`). Same rule. The two are separate
  files on purpose — the same nine statuses map to completely different screens
  in the two apps, so this is app routing, not a shared UI primitive.
- **Every agent lifecycle write copies `apps/agent/src/app/(agent)/job/[id]/actions.ts`.**
  It is the reference service-role action for that app (Batch 1): session
  identity — never a form field — plus `createAdminClient()`, an in-code
  `agentId === user.id` re-check standing in for the missing RLS policy, status
  and `status_events` written together, idempotent, and a POST rather than a GET.
- **Profile writes go through the server Supabase client, not Prisma**, so
  `supabase/grants.sql`'s column allowlist applies (Prisma bypasses it).
  `updatePhone` in `profile/actions.ts` is the pattern. Use Prisma for profile
  data only when you genuinely need a transaction, and then re-enforce ownership
  in code.
- **CO₂e factors live only in `packages/core/src/impact.ts`** — never write CO₂
  arithmetic in a screen or a seed. ⚠ **The values there are a placeholder and
  the citations are unverified** (only the relative ordering is defensible) —
  read the file header before quoting a number anywhere. Awaiting the company's
  CPCB-accepted set, open question 7 in `COMPANY_FLOW_REVIEW_2026-08-07.md`;
  their answer is a value change in that one file. `packages/database` restates
  the table (it must not import `packages/core` — the cycle breaks the generated
  client), and Batch 9's verification asserts the two agree.
- **Git: commit and push straight to `main`. No branches, no PRs** (changed
  2026-08-20). Branch-and-PR was costing more time in merge friction than it was
  buying in review, on a three-person build with one week left. Both Vercel
  projects deploy off `main`, so **a push is a deploy** — run `npm run build`
  and the relevant `npm run smoke` before pushing, not after.
- Inline error handling at API route / async boundaries; let internal pure
  functions throw freely.
- Comments explain *why*, not *what*.
- Shared data shapes (e.g. JSON breakdown fields) have stable keys — don't
  change an existing key without updating every consumer.
- One feature = one small commit. Don't bundle unrelated changes.

## Path alias

`@/*` maps to `./src/*` **within each app** (e.g. `apps/customer/src`). Shared
code is never reached with `@/` — it comes from `@clbipp/{ui,auth,core,database}`.

## When stuck

- RLS / policy question → read `docs/ai-prompts/database-rls-policies.md` first.
- Migration question → read `docs/ai-prompts/database-create-migration.md` first.
- UI/UX question → `docs/CLBIPP_FieldAgentWireframes_V2.html` for the agent app
  (⚠ read §0 of the plan first — nine known defects), or
  `docs/CLBIPP_Vendor_Wireframes_1.html` for the customer app. Navigation is
  built into both (each button's `data-go` shows the target).
- Status / "what's done, what's next" → `docs/PROJECT_STATE.md`, then
  `docs/FIELD_AGENT_TASKS.md` for the batch you're on.
- "What exactly do I build?" → `docs/FIELD_AGENT_TASKS.md`. "Why is it like
  that?" → `docs/PLAN_FIELD_AGENT_APP.md`.
- Stack question → Next.js + Supabase + Prisma in a Turborepo monorepo, deployed
  to Vercel. Don't introduce new frameworks.
- "Where does this file live now?" → the 2026-08-09 migration moved everything.
  App code is under `apps/customer/`, shared code under `packages/`. Search the
  repo rather than trusting a path written in an older doc.
