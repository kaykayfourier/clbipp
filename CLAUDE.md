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
- **Agent screens pass `hideNav` and add no bottom padding.** **Admin screens
  use `ConsoleShell` and import no mobile primitive at all** — no `AppShell`,
  no `PhoneFrame`, no `hideNav`.
- **Integer paise everywhere**; `formatPaise` from `@clbipp/core/format` in
  client components.
- 🔴 **A change that moves a price says so in its commit message.**
- 🔴 **Never write `StatusEvent.actorRole: 'recycler'`** (or `'hub'`). Every
  admin-written stage past the hub is an admin asserting something on a party's
  behalf, and the trail has to say so.

## What this project is

Closed-Loop Battery Intelligence & Pricing Platform (CLBIPP). A platform for
battery recovery + EPR compliance — vendor offloads batteries, a field agent
assesses and quotes them, an admin oversees pricing rules and compliance.
Three-person internship build.

Three surfaces, built **in sequence**, as three apps in one **Turborepo
monorepo** (migrated 2026-08-09):

1. **Customer / Vendor app** — `apps/customer` — **built + deployed** (revamp
   merged to `main` 2026-08-15)
2. **Field Agent app** — `apps/agent` — **built** (sprint 2026-08-20 → 08-25).
   Runs on **port 3001** (`npm run dev:agent`). Batches:
   **0b** scaffold + role-gated auth · **0a** schema + seed · **1** day view +
   job detail · **2** safety checklist · **3** multi-item intake · **4** engine +
   pricing · **5a** quote screens + offer · **5b** cross-app seam (D7) · **6**
   collect · **7a** hub drop-off · **7b** chain-of-custody PDF · **8** track,
   history, profile · **PWA + install prompt** (deferred out of 8, built
   2026-08-24). **Everything except Batch 9 (deploy) is built.**

   ✅ **The hole the agent batches never covered — nothing wrote `requested →
   scheduled` or set `Pickup.agentId` — is CLOSED** (Admin Batch 3, 2026-08-27).
   The admin console's `/dispatch` board writes it, with a session behind it and
   an `AdminAudit` row after it. `npm run assign-job` stays as the CLI fallback
   (see "Dispatch" below) — it is faster for "assign everything", but it writes
   no `actorId` and does **not** clear a reactivated pickup's stale agent.
3. **Admin console** — `apps/admin` — **CURRENT SPRINT** (from 2026-08-25).
   Runs on **port 3002** (`npm run dev:admin`). All three can run at once.
   **A's batches 0, 1, 3, 4, 6, 7 and 14 are built** (0 + 1 on 2026-08-26,
   3 on 2026-08-27, 4 on 2026-08-29, 6 + 7 + 14 on 2026-08-31):
   **0** the app scaffold, the auth gate, the `ConsoleShell` desktop chrome,
   `/login` and **all 22 routes as stubs** · **1** the `admin_app_v1` migration
   (`EngineConfig`, `AdminAudit`, `ItemException`, `MarginTier`, W6's market
   columns) **applied to the shared project**, and the seed delta — all eight
   §3 fixtures plus seven manifests and a consistent audit trail ·
   🔴 **3** the **dispatch board** (`/dispatch`, `/dispatch/[id]`,
   `assignPickup`) — `requested → scheduled` + `Pickup.agentId`, the first
   lifecycle write this app owns ·
   🔴 **4** **`raisePayment()`** — a real collection now raises a real payable,
   so the vendor's payout runs off live data instead of a seeded row ·
   🔴 **6** (2026-08-31) **`/lifecycle` + the three `/manifests` screens** —
   `collected → tested` per **custody batch**, and a real `DispatchManifest`
   built and dispatched to a recycler with **AD7 enforced in the action** ·
   🔴 **7** (2026-08-31) **manifest confirm + reconcile, and certification** —
   `tested → processed → recovered` **only for pickups AD6 says are covered**,
   then `recovered → certified`, which mints the `Certificate`. Plus B06's
   manual override. ·
   🔴 **14** (2026-08-31) **`/exceptions` + `/audit`** — `resolveException()`
   closes an engine flag with retest / override / reject, and W7's audit trail
   finally has a reader. 🔴 **Resolving an exception advances NOTHING** — no
   `PickupStatus`, no `status_events`, no pathway (AD4/AD6); `override` there
   means "the engine's flag was wrong about this item", not "advance this
   pickup". Asserted directly.

   **B's and C's batches (2, 5, 8, 9, 10, 11, 12, 13, 15, 16) are all pushed.**
   🎯 **Every screen in the sprint is now built. The only work left is B's
   Batch 17 (deploy).**

   🎯 **BOTH LIFECYCLE HOLES ARE CLOSED (2026-08-31).** Every one of the nine
   stages is written by a screen now, and the journey runs end to end with no
   CLI and no seed edit: vendor books → admin dispatches → agent arrives,
   assesses, offers → vendor accepts → agent collects → **vendor is paid** →
   agent drops at hub → admin advances the batch → admin builds and dispatches a
   manifest → admin confirms and reconciles → admin certifies → **the vendor
   downloads a real EPR certificate PDF from `/compliance`.** Verified in that
   order through the real HTTP path; see "Batch 7 — as built".

   🎯 **A fresh seed cannot demo Batch 6 or 7 on its own, and that is correct.**
   `CB-2026-000301` holds no pickup at `collected`, and the one `collected`
   pickup (`PKP-2026-000105`) deliberately has no custody batch so that "pending
   drop-off" (D5) is a real state. **The end-to-end demo starts in the AGENT
   app**, with a hub drop-off.

   **`apps/admin/src/lib/` now carries the app's server-side helpers**, and they
   are not optional: 🔴 **`requireAdmin()` in `admin-identity.ts` is the write
   gate every admin lifecycle action must call** (under AD3 it and `proxy.ts`
   are the *entire* access boundary), `ist.ts` is the one place the console's
   timezone is decided, and `job-load.ts` holds the live-job counts. Batches 6,
   7 and 9 import them rather than re-deriving.
   `(admin)/dispatch/actions.ts` is the **reference admin lifecycle write** —
   copy its shape, the way the agent app's `job/[id]/actions.ts` is copied there.
   🔴 **`lifecycle-units.ts` (Batches 6–7) holds AD5's unit-of-advance logic and
   the AD6 gate.** `pickupCoverage(pickupId, items, index, floor)` answers "is
   every item of this pickup covered?", and **`advanceCoveredPickups(tx, …)` is
   that rule APPLIED** — it is what `confirmManifestReceived` and
   `reconcileManifest` both call, and the reason "advance the pickups on this
   manifest" is never written anywhere. Never re-derive either in a screen.
   ⚠ `loadItemManifestIndex()` takes an optional **transaction client** and
   callers inside a `$transaction` MUST pass it — the default client is a
   different connection and cannot see the transaction's own uncommitted
   UPDATE, which fails silently and looks exactly like AD6 working (trap 31).
   ⚠ Its `loadManifestBuildStock()` is deliberately NARROWER than
   `lib/facility-stock.ts`'s `computeFacilityStock()` — "what may I ship?"
   excludes items on a draft manifest, "what is on hand?" does not. Both are
   right; do not unify them.

```
apps/customer            the customer app (Next.js App Router)
apps/agent               the field agent app — built, still live code
apps/admin               the admin console — CURRENT SPRINT
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

## Current sprint: Admin console

Read `docs/ADMIN_TASKS.md` first — it is the executable task sheet (files,
numbered steps, done-when checks, and a 17-item trap list, per batch).
`docs/PLAN_ADMIN_APP.md` is the *why* behind it: the wireframe assessment (§0)
and decisions **AD0–AD12**, which are settled and **must not be re-litigated
mid-build**.

**In scope:** the 19 screens in §2 of the plan.
`docs/CLBIPP_AdminWireframes_V1.html` is the layout source, but it has **twelve
known defects** — §0 of the plan lists them all and every one is already
resolved there. **Read §0 before building from the wireframe.**

Headlines you need even if you read nothing else:

- ✅ **Every screen is built (2026-08-31).** Batch 14 was the last feature
  batch; only Batch 17 (deploy, B) remains. 🟠 **`npm run lint` is red on two
  pre-existing one-liners** — `(admin)/market/page.tsx:31` (`react-hooks/purity`,
  B's) and `(admin)/pickups/[id]/page.tsx:266` (an `<a>` where a `<Link>`
  belongs, C's). Neither is on the pre-push list, but both should be green
  before the deploy.
- ✅ **The lifecycle is CLOSED — that priority is discharged.**
  `requested → scheduled` (Batch 3, 2026-08-27) · `collected → tested` and
  manifest build + dispatch (Batch 6, 2026-08-31) · `tested → processed →
  recovered` and `recovered → certified` (Batch 7, 2026-08-31). 🎯 **The full
  journey runs end to end, screens only — and it starts in the agent app with a
  hub drop-off.** Oversight — exceptions + `/audit` (Batch 14) — landed
  2026-08-31; **deploy (Batch 17) is all that is left.**
- **The admin app is pickup-centric, not quote-centric** (AD1). `/pickups` +
  `/pickups/[id]` are the spine; `/quotes` is a lens over `BatteryItem`.
  🔴 **Flat-rate (non-li-ion) items must appear in every operational table** —
  they have no `traceId`, and a `trace_id`-keyed table silently drops half the
  data.
- **The unit of advance differs by stage, because the actor differs** (AD5):
  `collected → tested` per **`CustodyBatch`** · `tested → processed → recovered`
  only via a confirmed **`DispatchManifest`** · `recovered → certified` per
  **`Pickup`**, and that last one **mints the `Certificate` row + PDF**.
  🔴 **Every stage past the hub is an admin recording something on behalf of a
  party that has no app** (there is no hub-staff app and no recycler portal).
  That is only defensible because `StatusEvent.actorRole` says `'admin'` —
  **never write `actorRole: 'recycler'`.** All three of those writes exist now
  and every one of them says `'admin'`; there are zero `'recycler'` / `'hub'`
  rows in `status_events`, asserted directly in Batch 7's verification.
- 🔴 **A pickup advances only when EVERY one of its items is covered** (AD6).
  Chemistry segregation sends one pickup's items to different recyclers on
  different manifests, so "advance the pickups on this manifest" is **wrong**.
  There is deliberately no per-item status column.
- **A manifest may name only an `isActive` recycler whose `acceptedChemistries`
  covers every item on it** (AD7) — enforced in the action, not just the picker.
- **One admin role** (AD2). `ops` is not a `UserRole` value and is not being
  added. `allowRoles: ['admin']`.
- **Admin reads and writes through Prisma + the service role; no RLS policies**
  (AD3) — in-code role and identity checks are the entire access boundary, same
  posture as D10 for the agent app.
- **Engine config: tiers 1 + 2 editable, tier 3 read-only** (AD8). Damage
  weights, damage bands and SoH gates are **literals in the engine's own code**
  (`damage.ts`, `sohGating.ts`), not `Config` parameters — a screen cannot move
  them. The seeded `EngineConfig` is byte-identical to `DEFAULT_CONFIG`, guarded
  by a drift test, 🔴 **so no price moves**.
- 🔴 **The quote route currently trusts `body.config` from the client** — an
  agent's browser can post its own margin tiers. Fixed in Batch 11 (AD9) with a
  server-side `getActiveConfig()`.
- **Admin is a DESKTOP app** — no `AppShell`, no `PhoneFrame`, no `hideNav`, no
  PWA. Its console kit lives in `apps/admin/src/components/console/`, **not
  `packages/ui`** (AD11), because `packages/ui` is a mobile kit two shipped apps
  import. The **shell** (sidebar, topbar, user menu, nav table) is separate and
  already built, at `apps/admin/src/components/shell/` — same AD11 rule applies.
- 🟠 **The admin app keeps the SHARED design-token values, not the admin
  wireframe's** (Batch 0, 2026-08-26). The wireframe defines a near-miss palette
  (`--ink #0E120E` vs `#111111`, `--signal #C5F050` vs `#C8F53D`); adopting it
  would make every `@clbipp/ui` primitive the app imports render off-brand. The
  wireframe's dark rail is carried as a separate `--console-*` block in
  `apps/admin/src/app/globals.css`. **Build the console kit against the shared
  tokens.**
- **The admin sidebar is five groups / sixteen items**, not the wireframe's four
  and twelve — the wireframe's nav predates §0 and omits dispatch, pickups and
  manifests, which are the P0 screens. It lives in one file,
  `apps/admin/src/components/shell/nav.ts`; **adding a screen means adding it
  there**, and no screen derives navigation independently.
- **Admin sees everything, one level beyond the agent** (AD12) — including the
  engine configuration. 🔴 **Nothing from an admin screen may reach a vendor
  screen:** never import from `apps/admin` into `apps/customer`, and never move
  an admin component into `packages/ui`.

**Exactly one file is shared across lanes:** `apps/admin/src/app/(admin)/layout.tsx`.
A created it in Batch 0 along with **all 22 routes as one-line stubs** (§2's
table is headed "19 screens" but lists 22 rows — the heading is the error), and
nobody else creates a file A also creates. Each owner only ever *replaces* their
own stub. **Both are done as of 2026-08-26**, so no lane is waiting on a file to
exist.

## The Field Agent app — built, and still live code

Everything below governs `apps/agent`, which is finished and deployed-pending.
It is not this sprint's build target, but it is live code the admin app writes
alongside — read it before touching an agent screen or the cross-app seam.
`docs/FIELD_AGENT_TASKS.md` is its task sheet and `docs/PLAN_FIELD_AGENT_APP.md`
its plan; decisions **D0–D10** there are settled and still binding.

**The agent app's screens** are the 19 in §2 of that plan.
`docs/CLBIPP_FieldAgentWireframes_V2.html` was the layout source, with nine
known defects resolved in §0 of the plan.

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
  ungated. ⚠ The Batch 8 screens (`/pickups*`, `/history`, `/profile`) are
  **watch-only and deliberately ungated** — they are downstream of nothing and
  gating a read of finished work would be wrong.
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

> ⚠ **"The agent app has no RLS" is no longer strictly true** (changed
> 2026-08-24, Batch 8). It has exactly **two** policies, both SELECT-only, both
> on `supabase/policies.sql`, and both existing solely so the agent's *browser*
> Realtime subscription can see its own rows. **Nothing the agent app reads
> through Prisma is affected** — Prisma connects as the table owner and never
> consults them — so D10 stands and in-code `agentId === user.id` scoping is
> still the entire access boundary on every screen. Agents still get no
> INSERT/UPDATE/DELETE policy anywhere.

**The agent app's auth guard is `apps/agent/src/proxy.ts`** (live since Batch
0b), exporting `proxy`, with `allowRoles: ['agent']` and no `onboardingPath`
(D6). Same rule as the customer app: **it must stay under `src/`** — Next's dev
bundler silently never registers it at the project root when `src/app` is in
use, and an unregistered auth guard fails **OPEN**.

> **All three apps now have one**, and the rule is identical in each:
> `apps/customer/src/proxy.ts` (`['customer']`), `apps/agent/src/proxy.ts`
> (`['agent']`), `apps/admin/src/proxy.ts` (`['admin']`, built 2026-08-26).
> **Verify with `npm run build`: it must print `ƒ Proxy (Middleware)` for each.**
> The admin one carries the most weight — under AD3 that app has no RLS policies
> at all, so the guard plus in-code role checks are its *entire* access boundary.
> **Three apps make SIX wrong-role pairings**, and all six are asserted in
> `scripts/smoke.mjs`.

**Both apps are installable PWAs** (agent's built 2026-08-24). Manifest, icons,
`sw.js` and `offline.html` live in each app's `public/`; `<InstallPrompt />`
from `@clbipp/ui` is on both home screens and gives Chromium a real one-tap
install dialog (iOS gets Share → Add to Home Screen — Safari has no install
API). ⚠ **Anything you add to an app's `public/` root must also be excluded in
that app's `src/proxy.ts` matcher**, or the auth guard 307s it to `/login`.
That is not hypothetical: it silently made the customer app un-installable
until 2026-08-24, because the matcher excluded an `icons/` directory that never
existed while the real icons sat at the root. The service worker is
production-only, so **install and offline cannot be tested on `npm run dev`** —
use `npm run build && npm start`.

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

> 🔴 **Two loose ends on that edge — both narrowed by Batch 5b, neither closed.**
> (1) Reactivation now voids `Offer.acceptedAt` (`voidOfferAcceptance` in
> `handover/actions.ts`, added 2026-08-24 because Batch 6 gates collection on
> that timestamp), but the row **still keeps its old `agentId` and
> `agentFeePaise`** — so a pickup can sit at `requested` with an agent still
> assigned to it. (2) The audit log can still go backwards — a `requested`
> `status_events` row landing after a `cancelled` one. `buildStages` is
> first-wins now, which stops a later event *relabelling* an earlier stage, but
> the ordering fact is unchanged. Written up in `docs/LANE_OWNERSHIP.md`
> (2026-08-23, updated 2026-08-24).

**Stage order has one source of truth per layer, and they must agree:**
`enum PickupStatus` (`schema.prisma`) · `LIFECYCLE_STAGES` + `STAGE_LABELS`
(`packages/ui/src/tokens.ts`) · `pickupstatusSchema` (`packages/core`) ·
`LIFECYCLE` (`reset-demo.ts`). Screens must **not** re-declare the list — use
`isLifecycleStage` / `isStageBefore` from `@clbipp/ui`.

**Who writes which transition (D7 — the cross-app seam):**

| Transition | Written by |
|---|---|
| `scheduled → arrived` | agent app ✅ built (Batch 1) |
| `arrived → offered` | agent app (creates the `Offer`) — Batch 5a |
| vendor accepts | customer app — sets `Offer.acceptedAt`, **status stays `offered`** ✅ built (Batch 5b) |
| `offered → collected` | agent app — Batch 6 |

⚠ A vendor cannot mark their own battery collected. `acceptOffer` in the
customer app used to write `collected`; **Batch 5b changed that on 2026-08-24.**

🔴 **The consequence: `offered` is TWO states, separated only by
`Offer.acceptedAt`** — *awaiting the vendor's decision* (null) and *accepted,
awaiting the agent* (set). The status is identical in both. Any screen that
switches on `status === 'offered'` must read the timestamp too, or it will show
a vendor the Accept button for an offer they already accepted. Seven places
already do: `/offer`, `/offer-breakdown`, `/handover`, `/track/[id]`,
`/t/[token]`, `/scheduled` and `lib/pickup-nav.ts`.

⚠ **`/offer` and `/handover` redirect to each other off that one field** —
`/offer` sends an accepted pickup to `/handover`, `/handover` sends an
unaccepted one back to `/offer`. Change one guard to a status range and they
loop forever. Both files carry a comment saying so.

⚠ **`buildStages` is first-wins** (`packages/ui/.../lifecycle-view.tsx`) because
an accepted pickup has two `offered` events. A timeline entry answers "when did
this pickup *first* reach this stage".

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

The standing map, applied to the Admin console. **Batch-by-batch ownership and
the day-by-day are in §4 of `docs/PLAN_ADMIN_APP.md`.**

| Area | Owner |
|------|-------|
| **A — Aamir.** Supabase Auth, session/route protection, RLS policies, the app scaffold + auth gate, the console shell, **and every lifecycle write** — dispatch, custody-batch advance, manifest dispatch + confirm, certification, exceptions, the audit log. Also `scripts/smoke.mjs`. | A |
| **B — Khalid.** Prisma schema + migrations + seed, the decision engine and all pure pricing logic in `packages/core`, PDF templates, engine config + market feed + compliance screens, **and deployment** | B |
| **C — Ali.** The console component kit, and every read screen: pickups, quotes, traceability, network directories, inventory, dashboard, analytics | C |

**File ownership is spelled out path by path in §4 of the plan, and the lanes
were drawn to barely touch.** Day 1's three batches (scaffold · schema · console
kit) share **no files at all**. The only shared file in the whole sprint is
`apps/admin/src/app/(admin)/layout.tsx`, created once in Batch 0.

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
npm run dev:agent    # Field Agent app dev server (:3001)
npm run dev:admin    # Admin console dev server   (:3002) — all three at once
                     # (dev:admin live since 2026-08-26, Admin Batch 0)
npm run build        # Build every app + package
npm run lint         # ESLint across the workspace
npm run test         # All tests (Vitest) — currently 246 (core 179, auth 40, engine 27)

# Logged-in route check. `npm run build` never renders a page with a session, so
# this is what catches a server component that throws at request time.
npm run smoke                                                     # customer, as business@test
npm run smoke -- --app=agent                                      # agent, as agent@test
npm run smoke -- --app=admin                                      # admin, as admin@test

# The role gate, in every direction. Three apps = SIX pairings; all six must
# bounce, and all six pass as of 2026-08-26.
npm run smoke -- --app=agent --blocked business@test businesstest   # vendor ✗ agent
npm run smoke -- --app=admin --blocked business@test businesstest   # vendor ✗ admin
npm run smoke -- --app=admin --blocked agent@test demo1234          # agent  ✗ admin
npm run smoke -- --app=agent --blocked admin@test demo1234          # admin  ✗ agent
npm run smoke -- --blocked agent@test demo1234                      # agent  ✗ customer
npm run smoke -- --blocked admin@test demo1234                      # admin  ✗ customer

# Run a single test file (from the owning package)
cd packages/core && npx vitest run src/booking.test.ts

# Database
# ⚠ `db:migrate` runs `prisma migrate dev`, which can offer to RESET the shared
# project. Against the shared database use `prisma migrate deploy` instead —
# generate the SQL with `prisma migrate diff`, hand-annotate it the way every
# migration in this repo is, and deploy. See Admin Batch 1's as-built notes.
npm run db:migrate --workspace=@clbipp/database        # Apply schema changes (LOCAL/new DB)
npm run reset-demo                                     # Wipe + reseed the demo data
# Assert the seeded FIXTURES still have the shape the next batch is built
# against — 24 checks, read-only, non-zero exit. `smoke` proves a route renders
# and `test` proves pure logic; neither can catch a fixture quietly vanishing.
# 🔴 Run it after every reseed, and add a check when you add a fixture.
# ⚠ Dispatching a seeded request from /dispatch legitimately BREAKS two of its
# checks (fixture 8's stale agent, and "≥3 unassigned requests"). After a demo,
# reseed before reading a failure as a bug.
npm run verify-seed                                    # Verify the demo fixtures

# Dispatch: assign a `requested` pickup to an agent, i.e. `requested →
# scheduled` + set agentId. ⚠ The admin console's /dispatch board does this
# properly since 2026-08-27 (Admin Batch 3) — prefer it. This stays as the
# fallback when a screen is down mid-demo, and for assigning everything at once.
# Idempotent. Two things it does NOT do: it writes no `actorId` on the status
# event (nobody authenticated to run a CLI), and it does not clear a reactivated
# pickup's stale `agentId` / `agentFeePaise` the way the screen does.
npm run assign-job                    # every `requested` pickup → agent@test
npm run assign-job -- PKP-2026-000101 # just this one
npm run assign-job -- --agent=other@test
npm run create-buckets --workspace=@clbipp/database    # Storage buckets (idempotent)
cd packages/database && npx prisma studio              # Visual DB editor

# Apply hand-written SQL without opening the Supabase dashboard
cd packages/database
npx prisma db execute --file ../../supabase/policies.sql --schema prisma/schema.prisma
```

**Env files:** `apps/customer/.env.local`, `apps/agent/.env.local`,
`apps/admin/.env.local` (Supabase URL + keys, DB URLs — all **three** apps read
the *same* Supabase project; they are separated by `profiles.role` at the proxy,
not by project) and `packages/database/.env` (DB URLs only). All gitignored;
`.env.example` next to each holds the key names.

## Stack

Next.js (TypeScript, App Router) · Prisma → Supabase Postgres · Supabase Auth /
Realtime / Storage · Tailwind + shadcn/ui · Vercel · Vitest

**Prisma manages table structure. RLS is written separately as raw SQL** —
Prisma has no concept of row-level security; different layer, same database,
no conflict.

🔴 **RLS policy expressions are themselves subject to RLS.** A policy that
sub-selects from another table sees that table through *its* policies — so a
policy can be syntactically perfect and match zero rows because the table it
joins to has no policy for that role. It fails **silently**: the query succeeds
and returns nothing. Batch 8 hit this exactly (agent Realtime: 44 rows vs 0);
the write-up and the measured numbers are in the header of `supabase/policies.sql`.
**Whenever you add a policy that references another table, verify it under a real
JWT for that role — never under the service role, which bypasses the layer you
are testing.**

## Stub-data pattern (use when a dependency isn't ready yet)

If the lane you depend on hasn't shipped its real thing yet, don't guess its
shape or wait idle — build against an agreed mock in `packages/core/src/mock-data.ts`
matching the locked contract (offer shape / status lifecycle / schema column
names), and leave a `// TODO: swap for real <X> once <owner> ships it` comment.
When the real thing lands, the swap is a search-and-replace on imports. This
keeps every lane moving in parallel without anyone touching another's files.

## Key docs (read when relevant — don't load all of these by default)

- `docs/NATIVE_APP_HANDOVER.md` — **why these are PWAs and not store apps, what
  a native rebuild would reuse, and the honest iOS answer.** Read before
  discussing distribution with the company. Companion:
  `docs/ANDROID_TWA_BUILD.md`, the runbook that turns a deployed app into a
  signed Play Store package (~half a day, post-deploy).
- `docs/BEFORE_YOU_PUSH.md` — **the second-glance checklist. Read before every
  push.** Pre-push commands, git workflow, shared-database rules, the traps that
  pass review, and the two orderings that actually matter.
- `docs/ADMIN_TASKS.md` — **the executable task sheet for this sprint.** Per
  batch: files, numbered steps, done-when checklist — plus a **17-item trap
  list** at the top that is worth reading once on its own. **Read this first.**
- `docs/PLAN_ADMIN_APP.md` — the operative plan behind it: wireframe assessment
  (§0, twelve defects), decisions **AD0–AD12** (§1), screen map (§2), schema
  delta (§3), lanes + file ownership + day-by-day (§4), risks and the
  pre-agreed cut list (§5), new open questions (§6).
- `docs/CLBIPP_AdminWireframes_V1.html` — layout source for this sprint.
  ⚠ It has **twelve known defects** — **read §0 of the plan before building from
  it.** Three are structural: no dispatch screen, no pickups screen, and an
  engine-config screen that is ~60% unbacked.
- `docs/FIELD_AGENT_TASKS.md` — the Field Agent app's task sheet. Built, but
  still live code — read the "as built" sections before touching an agent
  screen. (`FIELD_AGENT_TASKS.pdf` is a generated rendition — edit the `.md`.)
- `docs/PLAN_FIELD_AGENT_APP.md` — its plan: decisions **D0–D10**, still binding.
- `docs/CLBIPP_FieldAgentWireframes_V2.html` — the agent app's layout source
  (nine defects, resolved in §0 of that plan).
- `docs/REVAMP_BATCHES_2026-08-09.md` — customer-app revamp tracker. Historical
  now; still the reference for demo accounts, commands and the outstanding
  Batch 13 scan.
- `docs/PLAN_V2_CUSTOMER_APP.md` — the customer app's plan (decisions D1–D7).
- `docs/PROJECT_STATE.md` — historical status. Its top section is current; most
  of the detail below that predates the monorepo migration and schema v2.
- `docs/CONTEXT.md` — decisions made and why, conventions, deferred items.
- `docs/LANE_OWNERSHIP.md` — lane policy (**do-it-and-note-it since 2026-08-20**) + the log of who actually did what.
- `docs/MANUAL_TEST_QUEUE.md` — the running list of things a script can't check
  (POST form actions, camera, "does this read right"), collected per batch for
  **one sitting at the end of the sprint**. Batches are verified programmatically
  as they land; add to this file rather than testing by hand as you go.
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
  StatusEvent, Certificate, and since `admin_app_v1` EngineConfig / AdminAudit /
  ItemException). Read before writing any RLS policy or auth code that touches
  these tables. Owned by Person B — don't edit directly. ⚠ **The three admin
  tables are RLS-enabled with ZERO policies** (AD3): closed to `authenticated`,
  reachable only through Prisma (table owner) and the service role. That is
  deliberate — never `disable row level security` to "fix" a read.
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

**Scope note:** the Admin console is the last of the three surfaces, so there is
no "later app" whose docs to ignore any more. All three apps' docs are now live
— but they are not interchangeable. The customer, agent and admin plans each
carry their own decision set (**D1–D7**, **D0–D10**, **AD0–AD12**) and the same
letter means different things in each. **Quote the decision with its app.**

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
- **A vendor's payable is raised by `raisePayment()` in
  `packages/core/src/payment-actions.ts`, never by a `payment.create` in a
  screen** (Admin Batch 4). It takes a **transaction client** and opens none of
  its own, so the payable always lands with the write that justifies it —
  `confirmCollection` in the agent app is the only caller today. Idempotent on
  `Payment.pickupId` (`@unique`), and it never resets a `paid` payment back to
  `pending`. ⚠ **Adding a write to that transaction has a ceiling:** it is at
  **eight** sequential round trips, which is the number measured at **5.3 s**
  against remote Supabase — both `raisePayment`'s caller and `settlePayment` set
  `timeout: 20_000, maxWait: 10_000` for that reason. A new multi-write
  transaction should set them from the start rather than discovering the 5 s
  default in a demo.
- **`AdminAudit.action` and `.subjectType` come from `@clbipp/core/audit`** —
  never a bare string literal, and 🔴 **`/audit`'s filter chips come from
  `ADMIN_AUDIT_ACTIONS` too** (Batch 14). Narrow a value read back out of the
  database with `isAdminAuditAction(x) ? x : null` — a boolean flag beside it
  leaves the value a bare `string`, which cannot index a `Record<AdminAuditAction, …>`. The column is a `String` because the values are
  dotted (`pickup.assign`) and so cannot be a Prisma enum; `ADMIN_AUDIT_ACTIONS`
  is what keeps it a closed set. `isReasonRequired()` says which actions must
  carry a typed reason. Same subpath-import reasoning as `@clbipp/core/format`.
- 🔴 **A `Certificate`'s materials come from `buildCertificatePayload` in
  `packages/core/src/certificate.ts`, and it has TWO sources ranked on purpose.**
  It prefers `DispatchManifest.recoveryData` — what a recycler actually
  MEASURED, captured at reconciliation and pro-rated onto the pickup by mass
  share — and only falls back to `Offer.materialBreakdown`, the engine's
  pre-teardown ESTIMATE, when no covering manifest was ever reconciled. The
  returned `materialSource` (`measured` | `estimated` | `none`) says which, and
  it is recorded on the `pickup.certify` audit row. 🔴 **Never collapse the
  two:** a certificate is a compliance document, and presenting an estimate as a
  measurement is the failure the split exists to prevent. ⚠ **The two blobs use
  DIFFERENT keys** — offers write `weight_kg`, certificates and
  `aggregateMaterials()` read `recovered_kg`. Feeding one to the other yields an
  empty list and throws nothing; that shipped undetected until Batch 7 and is
  pinned by `certificate.test.ts`.
- **A certificate's PDF is rendered LAZILY, never at certification.**
  `certifyPickup` writes `pdfUrl: ''` and `apps/customer/src/lib/documents.ts`
  renders, uploads and caches the object path on first download — the same
  pipeline receipts and invoices use, and the reason the seed writes `""` too.
  Don't add an eager render.
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
  buying in review, on a three-person build with one week left. **All three**
  Vercel projects deploy off `main`, so **a push is a deploy** — run
  `npm run build` and the relevant `npm run smoke` before pushing, not after.
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
- UI/UX question → `docs/CLBIPP_AdminWireframes_V1.html` for the admin console
  (⚠ read §0 of `PLAN_ADMIN_APP.md` first — **twelve** known defects),
  `docs/CLBIPP_FieldAgentWireframes_V2.html` for the agent app (nine defects,
  §0 of its plan), or `docs/CLBIPP_Vendor_Wireframes_1.html` for the customer
  app. Navigation is built into all three (each button's `data-go` shows the
  target).
- Status / "what's done, what's next" → `docs/PROJECT_STATE.md`, then
  `docs/ADMIN_TASKS.md` for the batch you're on.
- "What exactly do I build?" → `docs/ADMIN_TASKS.md`. "Why is it like that?" →
  `docs/PLAN_ADMIN_APP.md`. For the agent app, the same pair with
  `FIELD_AGENT_` in place of `ADMIN_`.
- Stack question → Next.js + Supabase + Prisma in a Turborepo monorepo, deployed
  to Vercel. Don't introduce new frameworks.
- "Where does this file live now?" → the 2026-08-09 migration moved everything.
  App code is under `apps/customer/`, shared code under `packages/`. Search the
  repo rather than trusting a path written in an older doc.
