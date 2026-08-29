# CLBIPP — Project State

> **Living status file.** Update this at the end of any working chat. It is the
> first thing to read when starting a new chat. For stable background (stack,
> decisions, conventions) see `CONTEXT.md`. For how to maintain these files see
> `HANDOFF_PROTOCOL.md`.

**Last updated:** 2026-08-29 — **the Admin console sprint is building. Batches 0
(scaffold, auth gate, console shell, all route stubs), 1 (schema + seed delta),
3 (🔴 the dispatch board) and 4 (🔴 `raisePayment()`) are done.** The Field Agent
app is done except Batch 9 (deploy). Both existing apps are installable, and the
**vendor → admin → agent → vendor-gets-paid** journey now runs from screens
alone, with no CLI step and no seeded row standing in for a real one.

> ## 2026-08-29 — Admin console Batch 4: 🔴 the vendor actually gets paid (Aamir)
>
> **`Payment` rows used to exist only in the seed.** A pickup collected for real
> in the field agent app produced a receipt and an agent fee and **no payable at
> all** — so the vendor's "Choose how you get paid" button never appeared, and
> `settlePayment`, fully built since customer Batch 8, had nothing to settle.
>
> **`raisePayment(tx, { pickupId, vendorId, amountPaise })`** is new in
> `packages/core/src/payment-actions.ts` and is called inside
> `confirmCollection`'s **existing** transaction, for `Offer.estimatedPrice` —
> the amount the vendor actually accepted, the same figure the receipt records.
> Idempotent on `Payment.pickupId` (`@unique`), and it never resets an
> already-`paid` payment back to `pending`.
>
> 🔴 **The batch's real risk was not the feature.** That transaction ran on
> Prisma's **5 s default** doing six sequential round trips; the payable makes it
> **eight** — and `settlePayment` carries a *measured* note that eight round
> trips against remote Supabase took **5.3 s and rolled the whole thing back**.
> The timeout is now `20_000` / `maxWait 10_000`, raised rather than split,
> because the five writes must land together.
>
> **Verified end to end over real HTTP** on `PKP-2026-000104`, 26 assertions:
> vendor accepts (status stays `offered`, per D7) → agent collects → a `pending`
> payment appears for exactly the offer → **three re-submits leave one payment,
> one ledger row, no second status event** → `/track/[id]` offers the payout →
> `/payment/[id]` shows **₹13,745** → settling writes the `payout` ledger row,
> **INV-2026-000104**, and moves the wallet by exactly the offer. Database
> restored afterwards; `npm run verify-seed` 21/21.
>
> **Green:** `npm run build` (three proxies), `lint`, `test` **229** (was 220),
> `smoke` **22 / 30 / 46** — all three against **production builds** — and all
> six role-gate directions.
>
> ⚠ **Two things to carry forward.** (1) 🔴 **Not every server-action form
> carries `$ACTION_ID_…`** — a `useActionState` form (`/payment/[id]`) uses
> `$ACTION_REF_n` / `$ACTION_n:0` / `$ACTION_KEY` instead, and Batch 3's
> verification technique silently no-ops against one. Replay every hidden input
> instead. (2) **Batch 7 will cross the same eight-round-trip ceiling** —
> certification writes a certificate, a PDF, a status event and an audit row.
> Set the timeout explicitly from the start.
>
> Next: **Batch 6 and 7** close the second lifecycle hole (custody batch →
> `tested`, manifest dispatch/confirm, certification). **Batch 2 (C's console
> kit) is the last unbuilt Day-1 P0** and Batch 5 waits on it.
>

> ## 2026-08-27 — Admin console Batch 3: 🔴 the dispatch board is built (Aamir)
>
> **The lifecycle hole this project has had since day one is closed.**
> `/dispatch` lists every `requested` pickup oldest-first; `/dispatch/[id]` shows
> the request in full with an agent picker (live job counts read inline, no
> dependency on C's `/agents`); `assignPickup` writes **`requested → scheduled`
> + `Pickup.agentId` + `scheduledSlot` + `etaMinutes`**, a `status_events` row
> with `actorRole: 'admin'` **and a real `actorId`**, and an `AdminAudit`
> `pickup.assign` row — all in ONE Prisma transaction, guarded by
> `updateMany({ where: { id, status: 'requested' } })` so a double-submit changes
> nothing.
>
> 🔴 **Seed fixture 8 is handled**: a pickup reactivated after a cancellation
> keeps its old `agentId` *and* `agentFeePaise`, so the board shows it (it does
> **not** filter on `agentId: null`, which would hide the most-stuck row) with a
> "previously assigned to X" marker, and assignment **clears the stale fee** —
> verified 71400 → null.
>
> **Verified end to end** by posting the real server action over HTTP: the job
> then appeared on the agent's day view as SCHEDULED, `/job/[id]` opened for that
> agent, and the vendor's `/track/[id]` showed the partner card, the ETA and the
> custody entry. Four further submits were all correctly rejected. The shared
> database was restored afterwards and `npm run verify-seed` is 21/21 again.
>
> **Green:** `npm run build` (three proxies), `lint`, `test` 220, `smoke`
> 22 / 30 / 46, all six role-gate directions.
>
> ⚠ **Three things to carry forward.** (1) `requireAdmin()` in
> `apps/admin/src/lib/admin-identity.ts` is the write gate for **every** admin
> lifecycle action — Batches 6, 7 and 9 import it, they do not re-derive it.
> (2) The console fixes its timezone at **IST** (`src/lib/ist.ts`) because a
> `datetime-local` input submits no offset and Vercel runs UTC. (3) The screens
> carry local table/panel components because **C's Batch 2 console kit is not
> built yet** — swapping them is mechanical when it lands, and nothing was
> written into `components/console/`.
>
> Next: **Batch 6 and 7** (custody batch → `tested`, manifest dispatch/confirm,
> certification) close the second lifecycle hole. Batch 5 (`/pickups`) and Batch
> 2 (console kit) are C's and still open.
>

> ## 2026-08-26 — Admin console Batch 1: built (Aamir, covering B's lane)
>
> **The `admin_app_v1` migration is applied to the shared Supabase project and
> the demo data is reseeded.** Green: `npm run build` (three proxies registered),
> `npm run lint`, `npm run test` **220 passing** (was 214), `npm run smoke`
> **22 / 30 / 46**, **all six role-gate directions**, and a new
> `npm run verify-seed` at **21/21**.
>
> **New:** `EngineConfig` (append-only, seeded byte-identical to `DEFAULT_CONFIG`
> with a drift test — 🔴 no price moved), `AdminAudit` (one table for all of W7),
> `ItemException` (W4), the `MarginTier` enum, `Profile.marginTier`, and W6's
> four `MarketPrices` columns. 🔴 **All three new tables are RLS-enabled with
> ZERO policies** (AD3) — closed to `authenticated`, reachable only through
> Prisma and the service role.
>
> **The seed now carries all eight §3 fixtures**, plus seven dispatch manifests
> and a consistent audit trail. Two of them exist to fail a later batch:
> **`PKP-2026-000113`** splits across a `dispatched` and a `draft` manifest, so
> Batch 7's naive "advance the pickups on this manifest" must not pass (AD6);
> **`PKP-2026-000114`** sits at `requested` still carrying a stale `agentId` and
> `agentFeePaise`, which Batch 3's dispatch board has to clear.
>
> **Three judgement calls**, all in `LANE_OWNERSHIP.md` and "Batch 1 — as built":
> `Profile.eprRegNo` was **not** added (§3/W11 are wrong on the facts —
> `epr_reg_id` already exists and is fully wired); the manifest history goes
> deeper than §3 asks so the seed does not contradict AD5; and
> `packages/core/src/audit.ts` is new, holding the closed `AdminAudit.action`
> vocabulary that Batches 3, 6, 7 and 9 must import rather than retype.
>
> 🔴 **`npm run assign-job` is STILL the only way to get a booked pickup to an
> agent.** Batch 3 is what changes that.
>
> ⚠ **Use `prisma migrate deploy` against the shared project, never `migrate
> dev`** — the latter can offer to reset it.

> ## 2026-08-26 — Admin console Batch 0: built (Aamir)
>
> **`apps/admin` is a real app now**, on **port 3002** (`npm run dev:admin`), and
> all three run at once. Green: `npm run build` for all three apps, `npm run
> lint`, `npm run smoke -- --app=admin` **22/22 with a content assertion on every
> route**, and **all six role-gate directions** — three apps make six wrong-role
> pairings, not the five the task sheet listed.
>
> **What this unblocks:** every one of the 22 screens in §2 now exists as a stub,
> so **B can start Batch 1 (schema) and C can start Batch 2 (console kit) without
> either of them creating a file A also creates.** That was the entire point of
> the batch. The only file shared across lanes,
> `apps/admin/src/app/(admin)/layout.tsx`, is created and closed.
>
> **What is NOT built:** every screen is still a heading with no data access. The
> two holes the sprint exists to close are both still open — nothing writes
> `requested → scheduled` (Batch 3, A) and nothing writes any stage past
> `collected` (Batches 6–7, A). 🔴 **`npm run assign-job` is still the only way to
> get a booked pickup to an agent, and it is still required before any demo.**
>
> **Three things decided in the build**, all written up in `docs/LANE_OWNERSHIP.md`
> and the "Batch 0 — as built" section of `docs/ADMIN_TASKS.md`:
>
> 1. 🟠 The admin app keeps the **shared design-token values**, not the admin
>    wireframe's near-miss palette — otherwise every `@clbipp/ui` primitive it
>    imports renders off-brand. The wireframe's dark rail is a separate
>    `--console-*` block. **C builds the kit against the shared tokens.**
> 2. The sidebar is **five groups / sixteen items**, not the wireframe's four and
>    twelve: the wireframe's nav predates §0 and omits dispatch, pickups and
>    manifests — the P0 screens.
> 3. §2's table is headed "19 screens" but **lists 22 rows**. All 22 were built.
>    The heading is the error.
>
> Two contracts A imposed on other lanes, both `TODO`-marked in code and added to
> the owning batch's steps: **C's Batch 5** must read `searchParams.q` on
> `/pickups` (the topbar search posts there), and **B's Batch 1** must swap two
> placeholder ids in `scripts/smoke.mjs` once the manifest and trace fixtures
> exist.
>
> Also caught: `.gitignore` had no entry for `apps/admin/src/generated/`, so the
> 35 MB Prisma query-engine binary would have been committed on the first
> `git add -A`.

> ## 2026-08-25 — Admin console: planned (Aamir)
>
> The third and final surface. **`docs/PLAN_ADMIN_APP.md` (the why) and
> `docs/ADMIN_TASKS.md` (the how) are written; nothing is built yet.** The
> wireframe `docs/CLBIPP_AdminWireframes_V1.html` was assessed against all three
> HR documents and the live schema.
>
> **Verdict on the wireframe: keep it, don't redo it — but it is not a build
> spec.** Twelve defects, all resolved in §0 of the plan. Three are structural:
>
> 🔴 **1. There is no dispatch screen.** Nothing in the wireframe writes
> `requested → scheduled` or sets `Pickup.agentId` — the exact hole that has been
> open since the project started and that `npm run assign-job` is the stopgap
> for. Two new screens (B02/B03), and they are **the first thing built after the
> scaffold** (Batch 3).
>
> 🔴 **2. It is quote-centric; the product is pickup-centric.** Every table is
> keyed on `trace_id`, which exists **only for li-ion items that went through
> the engine** — so lead-acid, priced off `PricingRate`, is silently dropped from
> every screen. And there is no pickups screen at all: admin was the only role
> with no way to look at a pickup as a pickup. Two more new screens (B04/B05).
>
> 🔴 **3. The engine-config screen is ~60% unbacked**, in three different ways.
> Some fields are `Config` parameters with a DB home; some are parameters stored
> nowhere; and **damage weights, damage bands and SoH gates are literals inside
> `damage.ts` and `sohGating.ts`** — not parameters at all, so no screen can move
> them. Resolved by AD8: tiers 1+2 editable, tier 3 read-only.
>
> **A live security defect found while reading the engine:**
> `apps/agent/src/app/api/quote/route.ts` passes **`body.config`** — the config
> comes from the *client request body*. An agent's browser can post its own
> margin tiers and reprice its own quote. Fixed in Batch 11 (AD9); it is
> exploitable today and could be pulled forward independently.
>
> **A second demo-breaking hole, not the wireframe's fault:** `confirmCollection`
> credits the *agent's* fee but never creates the vendor's `Payment` row —
> `payment.create` appears **only in `reset-demo.ts`**. A real vendor lands on
> `/payment/[id]` reading "No payment yet" permanently, against two HR documents
> that both say "paid right away". Batch 4 (AD10) puts it in the agent's collect
> transaction.
>
> **Four decisions taken with Aamir before writing the plan:** the payout goes in
> the agent's collect action (AD10) · engine config is tiers 1+2 only (AD8) ·
> `ops` is dropped, one admin role (AD2) · and **the unit of advance differs by
> stage because the actor differs** (AD5) — `collected → tested` per
> `CustodyBatch`, `tested → processed → recovered` only via a confirmed
> `DispatchManifest`, `recovered → certified` per `Pickup`, minting the
> certificate.
>
> 🔴 **AD5 forced AD6 into the open:** chemistry segregation sends one pickup's
> items to *different* recyclers on *different* manifests, so a pickup can be
> half-dispatched. "Advance the pickups on this manifest" is **wrong** — a pickup
> advances only when *every* item is on a confirmed manifest. Seed fixture 4
> exists solely to catch this.
>
> 🎯 **The full journey — book → dispatch → collect → pay → ship to recycler →
> certify → vendor downloads it — runs end to end, screens only, after Day 4.**
> Day 1's three batches share no files at all.
>
> **Next: Batch 0 (scaffold + auth gate) — Aamir · Batch 1 (schema + seed) —
> Khalid · Batch 2 (console kit) — Ali.** All three in parallel.

> ## 2026-08-25 — audit, dispatch, PWA + install (Aamir)
>
> A full audit of the Field Agent app against the customer app. Build, tests and
> lint green; **customer smoke 46/46, agent 30/30, and both role-gate
> (`--blocked`) directions green** — agent isolation holds in both directions.
> Four findings, two of them serious.
>
> 🔴 **1. A customer booking could never reach the agent app.** Nothing anywhere
> wrote `requested → scheduled` or set `Pickup.agentId` — only the seed did. That
> transition belongs to the **admin app**, which is a scaffold, so no batch ever
> owned it, and the entire cross-app journey worked *only* on seeded rows. Fixed
> with **`npm run assign-job`** (`packages/database/prisma/assign-job.ts`),
> idempotent, deliberately a CLI and not a screen — the customer app would cross
> the D7 seam, the agent app would contradict D2. Lift into an admin server
> action when that surface exists. **Proven end to end:** dispatching
> PKP-2026-000101 put it on the agent's day view as SCHEDULED while the
> customer's `/track` showed the partner card, ETA and a custody entry reading
> "Recorded by CLBIPP — Assigned to Ravi Kumar for collection."
>
> 🔴 **2. The deployed customer app was not installable, and had not been.** Both
> `src/proxy.ts` matchers excluded a directory `icons/` that has never existed,
> while the real icons sit at the public root — so `icon-192.png`,
> `icon-512.png`, `icon.svg` and `apple-touch-icon.png` all **307'd to
> `/login`**. Chrome will not offer an install unless it can fetch the 192 and
> 512 icons, so `beforeinstallprompt` never fired; iOS used a screenshot of the
> page as the home-screen icon. **Nothing looked broken** — the manifest itself
> was excluded and returned 200, so the only symptom was an install prompt that
> never appeared. Fixed in both apps, with the filenames named explicitly.
>
> **3. The agent app had no PWA at all** — no `public/` directory. Batch 8 was
> marked done but silently dropped its PWA half; the layout still carried "PWA +
> offline is Batch 8" as a comment. Built: manifest, `sw.js`, `offline.html`,
> icons, `ServiceWorkerRegister`, metadata. Icon is the deliberate inverse of the
> customer's (black "FA" on lime vs lime "B2" on black) because the two-device
> demo puts both on one home screen.
>
> **4. Agent smoke was red at 2 of 29 — and five more routes were passing
> vacuously.** Stale table entries from Batches 5a/6/7a. Once those screens went
> behind the safety gate they returned 307, and **a 307 with no assertions
> scores a bare "ok"**, so five routes were asserting nothing at all. Rebuilt as
> the gate's reject half (asserted on absent content) plus a render half on
> PKP-2026-000104, the one pickup with an `Offer`.
>
> Also: a shared **`<InstallPrompt />`** (`packages/ui`) on both apps' home
> screens — one-tap install on Chromium, Share-sheet instructions on iOS — and
> `/.well-known/assetlinks.json` served from `ANDROID_*` env vars in both apps,
> so the Play Store fingerprint can be set at deploy time with no code change.
>
> ⚠ **A stale Turbopack dev server 404s `result/breakdown` and `result/why`**
> and the safety gate never runs. Not an app bug — `rm -rf apps/agent/.next`.
> Same family as the stale-`.next` warning below.
>
> **Distribution:** both apps are installable PWAs. Android/desktop get a
> one-tap prompt; **iOS uses Share → Add to Home Screen because Safari has no
> install API** — an Apple platform decision, not a gap here. A Play Store
> package is ~half a day post-deploy and keeps instant updates
> (`docs/ANDROID_TWA_BUILD.md`); the App Store would mean rebuilding the client
> against an API (`docs/NATIVE_APP_HANDOVER.md`). Raised with the company as
> **open question 14**.
>
> **Next: Batch 9 (deploy) — Khalid,** then the one manual pass on real
> handsets, then the TWA package.

> **Batch 8 (track, history, profile) shipped 2026-08-24.** The last five
> Batch-0b stubs are real screens: `/pickups` (two groups + the pending
> drop-off card), `/pickups/[id]` (the shared `lifecycle-view` timeline, custody
> log, Realtime, and the "your role ends at drop-off" lock), `/pickups/[id]/map`
> (Leaflet + OSM, static), `/history` (filterable, **rows open a real detail
> view** — the wireframe's self-link defect), and `/profile` (identity, stats,
> the agent's own ledger, read-only training status, log out).
>
> 🔴 **The finding to carry forward: the Realtime RLS fix needed TWO policies,
> not the one the task sheet specified — and the one-policy version fails
> silently.** Postgres applies row security to tables referenced inside a policy
> expression, so an agent-scoped sub-select on `pickups` (which had no agent
> SELECT policy) was filtered to zero rows. Measured as `agent@test`'s own JWT:
> **44 `status_events` rows with both policies, 0 with only the one, 44 again
> when restored.** The subscription still reports `SUBSCRIBED` in the broken
> state — it just never fires. Both policies are in `supabase/policies.sql` with
> those numbers in the header, and **applied to the shared project**. D10 is
> intact: agents still get no UPDATE anywhere, and Prisma never consults either
> policy, so in-code `agentId` scoping is still the whole access boundary.
>
> Two other things came with it: **`CustodyLog` gained a `roleLabels` prop**
> (its copy was hardcoded to the customer's perspective and read backwards on an
> agent screen), and **the seed now writes the agent's `agent_fee` ledger** —
> which required adding `walletBalancePaise: 0` to the agent's upsert, or a
> second `reset-demo` doubles the cache. **No price moved.** 213 tests,
> `npm run build`, `npm run smoke` 46/46 + 28/28 and both role-gate directions
> green, plus 21 scripted checks.
>
> ⚠ **Before Batch 9:** running `npm run build` then `npm run dev` on the same
> app makes **every dynamic route 404** while static ones serve 200, with no
> Prisma query logged. It is a stale `.next`, not a data bug — `rm -rf
> apps/<app>/.next`. Batch 9 runs build and smoke back to back, so it will hit
> this.
>
> ~~**Next up: Batch 5a (quote screens + offer) — Ali,** then Batch 6 (collect)
> and Batch 7a (hub drop-off UI).~~ **All three shipped 2026-08-24** (commit
> `777f627`); see the 2026-08-25 entry at the top.

> **Batch 5b (the cross-app seam, D7) shipped 2026-08-24** — the highest-risk
> correctness item in the plan. `acceptOffer` no longer writes `collected`: a
> vendor accepting an offer now stamps `Offer.acceptedAt` and **leaves the
> status at `offered`** until the field agent collects from the site. A vendor
> can no longer mark their own battery collected, which is what D7 says and what
> made Batch 6 buildable at all.
>
> 🔴 **The consequence to carry into every later batch: `offered` is now TWO
> states**, and only `Offer.acceptedAt` separates them — "awaiting the vendor"
> and "accepted, awaiting the agent". Six customer screens learned the
> difference (`/offer`, `/offer-breakdown`, `/handover`, `/track/[id]`,
> `/t/[token]`, `/scheduled`, plus `lib/pickup-nav.ts`). `/offer` and
> `/handover` now redirect to each other off that one field — **they must stay
> symmetrical or they loop.**
>
> Two other things changed with it: **`buildStages` is first-wins** (an accepted
> pickup has two `offered` events, and the timeline must keep the date the offer
> was *made*), and **`cancelPickup` / reschedule-after-cancel now void
> `acceptedAt`** — beyond the sheet, but the timestamp became load-bearing this
> batch. **No price moved.** 213 tests, `npm run build` + `npm run smoke` green
> for both apps.
>
> 🔴 **Batch 6 needs a seed row that doesn't exist yet:** a pickup at `offered`
> **with** `acceptedAt` set. `PKP-2026-000104`'s null is the deliberate
> "awaiting the vendor" fixture and must not be repurposed. Details and the
> reason it wasn't added here are in "Batch 5b — as built".
>
> ~~**Next up: Batch 5a — Ali.** Aamir's own next is **Batch 8**~~ — **Batch 8
> done 2026-08-24, see the top of this file.**

Prior entry (2026-08-23): **Batches 0b, 0a, 1, 2, 3 and 4 are done.**

> **Batch 3 (multi-item intake) shipped 2026-08-23** — the spine of the on-site
> flow and the critical path for 5a, 6 and 7a. `/job/[id]/items` lists every
> `BatteryItem` with a running total; `/job/[id]/items/[itemId]` captures the
> agent's half (chemistry, weighed kg, condition, photos) **without ever touching
> the customer-declared half**, which is asserted byte-for-byte. The D1 chemistry
> branch has one home — `isLithium` in `packages/core/src/intake.ts` (39 tests) —
> and `api/quote/route.ts` was pointed at it, deleting a second copy.
> **213 tests.** Built by **Aamir in Ali's lane** to keep the critical path
> moving (logged in `LANE_OWNERSHIP.md`); Ali still owns 5a, 6 and 7a.
>
> ⚠ Three deviations worth knowing: **photos upload from the browser**, not
> through a server action (Next caps server-action bodies at 1 MB by default,
> our files are 5 MB); **the agent does not confirm `category`** because there is
> no `confirmedCategory` column and the declaration must not be overwritten; and
> **a damaged line requires a photo** before it counts as confirmed. All four
> deviations and the one-line change that hands the flow to Batch 5a are in
> "Batch 3 — as built" in `FIELD_AGENT_TASKS.md`.
>
> **The safety gate now runs on three screens** (`/items`, `/items/[itemId]`,
> `/scan`). `/damage`, `/computing`, `/result*` and `/collect` are still ungated
> stubs — whoever builds them adds the two lines.
>
> ~~**Next up: Batch 5a — Ali.** Aamir's own next is **Batch 5b**~~ — **5b done
> 2026-08-24, see the top of this file.**

Prior entry (2026-08-23): **Batches 0b, 0a, 1 and 2 are done.** Batch 1 shipped the day view, job detail and the first agent-owned
lifecycle write (`scheduled → arrived`) — that action is the **reference
service-role action** every later agent batch copies. **Batch 2 shipped the
mandatory safety checklist (W1)** — the gate between `arrived` and intake, the
feature HR looks for first. `/job/[id]/items` now redirects to `/safety` unless
a passing `SafetyChecklist` exists, enforced server-side in
`apps/agent/src/lib/safety-gate.ts` and asserted by URL in `npm run smoke`.
Checklist rules and their 20 tests live in `packages/core/src/safety.ts`
(**174 tests** total).
⚠ Batch 2 found that **Prisma's `@default(uuid())` does not apply to a
service-role write** — the id must be generated in the action. It affects every
uuid-keyed table Batches 3, 5b, 6 and 7a will write; see "Batch 2 — as built" in
`FIELD_AGENT_TASKS.md`.
~~**Next up: Batch 3 (multi-item intake) — Ali**~~ — **done 2026-08-23, see
above.** Khalid's Batch 4 has landed too. Working practice as of
2026-08-20 still stands: **lanes are no longer a gate** (do it and log it) and
**we push straight to `main`** — no branches, no PRs. See the ▶ READ FIRST
section below. Everything under "Historical" describes the customer app and is
kept for the record.

Prior entry (2026-08-10): (**Batches 0A + 0B + B2 + 4 + 5 + 6 + 6.5 + 7A + 7B
+ 8 + 9 + 10 + 11 executed** — repo is now a Turborepo monorepo, schema v2 is live, the
booking quote engine + `createPickupWithItems` shipped in `packages/core`, the
address book + Storage upload helper landed, **the 4-step booking wizard at
`/book` is done** — the centrepiece of the revamp — **email OTP + `/verify` + the
role gate are live**, **Batch 6.5 cleared the first manual test pass**, **Batch 7A
added the `arrived` + `offered` lifecycle stages** (the locked contract is now
nine stages), **Batch 7B shipped the tracking upgrade** — assigned-partner card,
ETA, and a chain-of-custody log rendering real per-event GPS and real photos out
of the private bucket — **Batch 8 shipped the three PDF documents, payouts and
the wallet**, which makes the P0 demo path run end to end for the first time, and
**Batch 9 shipped the cited per-chemistry CO₂ table, the dashboard impact card
and the working CPCB CSV export**, and **Batch 10 shipped the P2 tier —
invoices, history + repeat booking, the profile phone edit, and `/t/[token]`
parity delivered as a real de-duplication into `@clbipp/ui` rather than a second
copy of the layout — plus deploy PREP (`docs/DEPLOY.md`), with the deploy itself
deliberately held until after Batch 11 so OAuth redirect URLs are registered
once**, and **Batch 11 shipped Google sign-in plus the `/onboarding` step that
makes it possible — the profile-less-session branch went into the shared
middleware rather than `/auth/callback`, and Apple was dropped (it needs a paid
developer account)**.
Next: **Batch 12, the actual deploy**.
Prior: 2026-08-07 Plan v2 written)

> **⚡ Superseded on 2026-08-14/15 — read this before the paragraph above.**
> The revamp is **merged to `main`** (PR #17). The customer app's auth guard is
> now **`apps/customer/src/proxy.ts`** exporting `proxy`, not `middleware.ts`
> (PR #18) — every `src/middleware.ts` path below is historical.
> **Batch 12 (deploy) is in progress and belongs to Khalid**, on his
> GitHub-synced Vercel project; Aamir's manual-deploy project was unlinked and is
> being deleted. Live detail and the deploy fixes are in
> `REVAMP_BATCHES_2026-08-09.md` → "▶ Resume here", and the runbook Khalid
> follows is `HANDOVER_KHALID_2026-08-12.md`.
**Build order across project:** Customer app ✅ → Field Agent app ✅ (deploy
pending) → **Admin console (current)**

---

## ▶ READ FIRST — resume point (2026-08-25)

**Current sprint: the Admin console (`apps/admin`). From 2026-08-25.**

**→ `docs/ADMIN_TASKS.md` is the live task sheet and the place to resume.** Per
batch: exact files, numbered steps, a done-when checklist — and a **17-item trap
list** at the top, every entry of which has already cost this team an hour in an
earlier sprint. `docs/PLAN_ADMIN_APP.md` is the *why* — wireframe assessment
(§0, twelve defects), decisions **AD0–AD12** (§1), screen map (§2), schema delta
(§3), lanes + file ownership + day-by-day (§4), risk + pre-agreed cut list (§5),
new open questions for the company (§6).

⚠ **Read §0 before building from `docs/CLBIPP_AdminWireframes_V1.html`.** The
wireframe is the layout source and it is good, but three of its twelve defects
are structural and two of the screens the demo needs are simply not in it.

**Batch 0 · A · Batch 1 · B · Batch 2 · C — all three start in parallel and
share no files.**

### The nine decisions most likely to be second-guessed mid-build

- **AD1** — pickup-centric, not quote-centric. Flat-rate items appear everywhere.
- **AD2** — one admin role. `ops` is not a `UserRole` value.
- **AD3** — Prisma + service role, no RLS for admin; in-code checks are the boundary.
- **AD5** — the unit of advance differs by stage. Never `actorRole: 'recycler'`.
- **AD6** — a pickup advances only when **every** item is covered.
- **AD7** — a manifest's recycler must accept every chemistry on it.
- **AD8** — engine config tiers 1+2 editable, tier 3 read-only. Seeded config ≡ `DEFAULT_CONFIG`.
- **AD10** — the vendor's payout is raised by the agent's collect action.
- **AD11/AD12** — desktop kit stays in `apps/admin`; nothing admin-side reaches a vendor screen.

### State of play

- **Customer app: done and merged to `main`** (PR #17). Deploy (Batch 12) is
  Khalid's, on his GitHub-synced Vercel project; runbook is
  `HANDOVER_KHALID_2026-08-12.md`. **Batch 13 — the full-app scan — is still
  open** and has been deferred to after all three apps exist.
- **Field Agent app: Batch 0b done (2026-08-20), on `feat/agent-b0b-scaffold`.**
  `apps/agent` is now a real app — Tailwind, ESLint, Prisma-engine prebuild, its
  own `.env.local`, dev on **:3001** via `npm run dev:agent` — with a role-gated
  `src/proxy.ts`, an email+password login, an agent-specific bottom nav, and a
  stub for all 22 §2 routes plus `/login`. `scripts/smoke.mjs` takes `--app=agent`.
  **C's Batch 3 is unblocked.** Details and traps: "Batch 0b — as built" at the
  bottom of `FIELD_AGENT_TASKS.md`.
- **Batch 0a done (2026-08-21), pushed to `main`.** The one migration
  (`agent_app_v1`) is applied and the seed is extended: `agent@test` has a
  pickup at every stage the app needs, the two intake jobs carry **3 items each
  across 2 categories mixing li-ion and lead-acid**, and there is a
  `MarketPrices` row, a `Facility` and a `CustodyBatch`. Demo item and batch ids
  are now **deterministic**, so all four agent constants in `scripts/smoke.mjs`
  point at real rows. **A's Batch 1, A's Batch 2 and C's Batch 3 are unblocked;
  B's Batch 4 has everything it needs.** Two deviations (a
  `PathwayDecision.traceId` column, and RLS closed on six decision-engine
  tables) — see "Batch 0a — as built" in `FIELD_AGENT_TASKS.md`.
- 🔴 **The shared Supabase project lost all `profiles` rows and all schema
  grants** at some point before 2026-08-21, and it was recovered inside Batch
  0a. **`npm run reset-demo` does not restore grants** — re-apply
  `supabase/grants.sql` first, then `policies.sql`, `storage-policies.sql`,
  `realtime.sql`. Missing grants do **not** look like an outage: the app
  half-works and `npm run smoke` fails diffusely. Full write-up in the
  "as built" section and in `LANE_OWNERSHIP.md`. The database also had **no
  Prisma migration history**; it is baselined and tracked now.
- **Batch 1 done (2026-08-23), pushed to `main`.** The day view (`/`) and job
  detail (`/job/[id]`) are real screens, plus `job-nav.ts` (row → destination
  routing, the agent-side mirror of the customer's `pickup-nav.ts`) and
  **`job/[id]/actions.ts` — the reference service-role action for this app.**
  Verified: agent smoke **23/23** with real content assertions on both screens,
  customer smoke **45/45**, role gate both ways, and 12 scripted checks over the
  `Arrived` write including a **forged `pickupId`**, which is rejected. Two
  seed lines were edited (B's file, logged) so the day-view stats aren't all
  zero; it now reads **2 assigned / 1 collected / ₹2,592 earned** today. See
  "Batch 1 — as built" in `FIELD_AGENT_TASKS.md`.
- **Batch 4 (engine + pricing) landed from Khalid** (`5e19f02`, fixed in
  `2e5a5e5`). `packages/core` gained `agent-fee.ts` and `market.ts`, the agent
  app gained `/api/quote`, and test count is now **154**.
- **Admin console: planned, not started (2026-08-25).** `apps/admin` is still
  the bare scaffold — no Tailwind, no ESLint, no `proxy.ts`, no `.env.local`,
  no dev script, one placeholder page. Batch 0 turns it into a real app on port
  **3002**. The plan and task sheet are written; see the top of this file.
- 🔴 **Two holes the admin sprint closes, both found 2026-08-25:** the quote
  route trusts `body.config` **from the client** (an agent can reprice their own
  quote — Batch 11), and `confirmCollection` never creates the vendor's
  `Payment` row, so a real vendor is never paid (Batch 4).

**Next up: Batch 2 — the safety checklist (A).** It is the feature HR looks for
first (W1), and **it opens with an unresolved decision** — see "A's next action"
below.

### Lanes — Admin console (2026-08-25)

The standing map. **File ownership is spelled out path by path in §4 of
`PLAN_ADMIN_APP.md`, and the lanes were drawn to barely touch** — Day 1's three
batches share no files, and the only shared file in the sprint is
`apps/admin/src/app/(admin)/layout.tsx`, created once in Batch 0.

| | Owner | Batches |
|---|---|---|
| **A** | Aamir | **0** scaffold + auth gate + `ConsoleShell` + 19 route stubs ← **next** · **3** dispatch board · **6** custody→tested + manifest dispatch · **7** manifest confirm → certified · **14** exceptions + audit |
| **B** | Khalid | **1** schema + seed (`admin_app_v1`) ← **next** · **4** `raisePayment` · **8** certificate payload + CPCB export · **11** engine config · **13** compliance · **16** market feed · **17** deploy |
| **C** | Ali | **2** console data kit ← **next** · **5** pickups list + detail · **9** network · **10** inventory · **12** quotes + trace · **15** dashboard + analytics |

**Cut list, pre-agreed** (§5): 16, then 15, then 14, then 12. **Never cut 0, 1,
2, 3, 4, 6, 7, 8, 17** — those are the journey.

**Lane policy (2026-08-20, unchanged): lanes are a default, not a gate.** If a
task straddles lanes or its owner isn't ready, **do it and log it** in
`LANE_OWNERSHIP.md`. Attribute work to whoever actually did it. Batch 4 already
crosses into Ali's lane by design (AD10) — log it when it lands.

**Git (2026-08-20, unchanged): commit and push straight to `main`.** No branches,
no PRs. **All three** Vercel projects deploy off `main`, so **a push is a
deploy** — `npm run build` plus the relevant `npm run smoke` first. Pre-push is
now three smoke runs, not two.

### A's next action — **Batch 0, the admin scaffold + auth gate**

Everyone is blocked on it, so it is a half-day, not a day.
**Read first:** `docs/ADMIN_TASKS.md` → the trap list, then §Batch 0.

`apps/admin` today is a bare scaffold: two files under `src/app`, no Tailwind,
no ESLint, no `proxy.ts`, no `.env.local`, no dev script. Batch 0 copies
`apps/agent`'s build setup verbatim — do not invent a new one — and adds:

- **`apps/admin/src/proxy.ts`** with `allowRoles: ['admin']`, `publicPaths:
  ['/login','/auth']`, `homePath: '/'`, `onboardingPath: undefined` (AD2 — no
  `ops`, no self-signup).
  🔴 **It must live at `src/proxy.ts`, never the project root** — Next's dev
  bundler silently never registers a root-level proxy when `src/app` is in use,
  and an unregistered auth guard fails **OPEN**. Verify `npm run build` prints
  `ƒ Proxy (Middleware)` for admin.
- **`ConsoleShell`** — sidebar, topbar, **and a working logout** (the wireframe
  has none). Desktop-first, in `apps/admin/src/components/shell/`. 🔴 No
  `AppShell`, no `PhoneFrame`, no `hideNav` — those are the other two apps'
  mobile primitives (AD11).
- **All 19 routes as one-line stubs.** This is the highest-value thing in the
  batch: it is what lets B and C work without ever creating a file A also
  creates.
- **`dev:admin` on port 3002**, and `scripts/smoke.mjs --app=admin`.

⚠ **A smoke route that 307s scores a bare "ok".** Five agent routes asserted
nothing at all for two batches because of this — **every admin route needs a
content assertion**, not just a status code.

**The action pattern for Batch 3 is already in this repo:** copy
`apps/agent/src/app/(agent)/job/[id]/actions.ts` — session identity (never a
form field) + `createAdminClient()` + an in-code role re-check + status and
`status_events` written together + idempotent + POST, never a GET.

**Verification commands, now that there are three apps:**

```bash
npm run dev          # customer, :3000
npm run dev:agent    # agent,    :3001
npm run dev:admin    # admin,    :3002

npm run smoke                                                     # customer
npm run smoke -- --app=agent                                      # agent
npm run smoke -- --app=admin                                      # admin

# The role gate, every direction. All six must bounce.
npm run smoke -- --app=agent --blocked business@test businesstest
npm run smoke -- --app=admin --blocked business@test businesstest
npm run smoke -- --app=admin --blocked agent@test demo1234
npm run smoke -- --blocked agent@test demo1234
npm run smoke -- --blocked admin@test demo1234
```

🔴 **Smoke the CUSTOMER app against a production build, not `npm run dev`** —
the three `api/documents/[kind]/[id]` routes 404 under Turbopack dev. Unchanged
from the last sprint; the runbook is in the historical section below.

---

### Field Agent — A's completed actions (historical)

Batches 0b, 0a, 1, 2, 5b and 8 all shipped; see the dated entries at the top of
this file and the "as built" sections in `FIELD_AGENT_TASKS.md`.

### Decisions that are settled — do not re-litigate

**This sprint: AD0–AD12 in `PLAN_ADMIN_APP.md` §1** — the nine most likely to be
second-guessed are listed under "READ FIRST" above.

⚠ **Three decision sets are now live and the same letter means different things
in each** — the customer app's D1–D7, the agent app's D0–D10, and the admin
console's AD0–AD12. **Always quote the decision with its app.**

**Still binding from the Field Agent sprint** (D0–D10 in
`PLAN_FIELD_AGENT_APP.md` §1) — the agent app is finished but is live code the
admin app writes alongside:

- **D0** — the decision engine is live code, not frozen. Where it and the HR
  documents disagree, **the HR documents win**. Fix defects; don't refactor it.
- **D1** — all four battery categories; the engine runs on li-ion only.
  Lead-acid prices off `PricingRate` (it's a commodity, not a pathway decision).
- **D2** — jobs are pushed, not pulled. No nearby-jobs feed.
- **D5** — the nine-stage lifecycle is untouched. No migration adds a stage.
- **D7** — the cross-app seam: the agent writes `collected`, never the vendor.

---

## Historical — customer app (2026-08-10)

### Resume point as of 2026-08-10 — superseded, kept for the record

**→ `docs/REVAMP_BATCHES_2026-08-09.md` is the live status file and the place to
resume.** It has the batch tracker, what batches 1–2 delivered, the demo
accounts + passwords, the commands, and the known gaps. Start at its
**"▶ Resume here"** section.

> **🔀 The revamp's build phase is over (2026-08-10).** Batches 0A–11 are all
> applied on `feat/customer-v2`. Two things remain, each its own chat:
> **Batch 12 — deploy** (`docs/DEPLOY.md` is the runbook) and **Batch 13 — a
> full-app scan**, the first pass that looks across batch seams rather than
> inside one batch. The **consolidated outstanding list** — every known gap from
> all eleven batches, plus the manual checks owed on a real handset — is in
> `REVAMP_BATCHES_2026-08-09.md` under that heading. Don't rebuild that list
> from the per-batch sections; it's already been done.

`docs/PLAN_V2_CUSTOMER_APP.md` remains the operative *plan* (the why, and
decisions D1–D7). This file (`PROJECT_STATE.md`) is now largely **historical
below this section** — it describes the pre-monorepo, pre-schema-v2 app.

### The structural facts that invalidate most of the detail below

1. **The repo is a Turborepo monorepo** (Batch 0A, commit `a5c15e2`). Every path
   written below as `src/...` now lives at `apps/customer/src/...`, and shared
   code moved into `packages/{ui,auth,core,database,decision-engine}`. Imports
   are `@clbipp/*`, not `@/lib/*` or `@/components/*`. `prisma/` is now
   `packages/database/prisma/`.
2. **Schema v2 is applied** (Batch 0B, migration
   `20260809072925_schema_v2_battery_items`). `Pickup` is a header row and
   battery detail lives in the new `BatteryItem`. `Address`, `PricingRate`,
   `Payment`, `WalletTxn`, `PickupReceipt`, `Invoice` exist, plus agent/admin
   scaffolding tables. The seed is fully rewritten — **10 pickups since Batch 7A**
   (was 8), one per lifecycle stage, all owned by real auth users, and each
   carrying real photo objects in the private `pickup-photos` bucket since 7B.
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
5. **Auth is role-gated and OTP-capable** (Batch 6). `apps/customer/src/proxy.ts`
   (was `middleware.ts` until PR #18)
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
6. **Bottom-nav clearance and the offer seed changed in Batch 6.5.** Two things
   below are now stale: (a) any instruction to give a screen its own
   `NAV_PADDING` / bottom padding — `(app)/layout.tsx` owns clearance for the
   fixed `BottomTabBar` and per-page padding now double-pads; new `(app)` screens
   pass `hideNav` to `AppShell` and nothing else. (b) The seed creates an Offer
   from **`scheduled`** onward, not `recovered` — before this, no seeded pickup
   could satisfy the `/offer` status guard, so both offer screens redirected for
   every id. (⚠ Superseded by Batch 7A: offers now seed from **`offered`**
   onward and the offer demo pickup is **`PKP-2026-000104`**, not `…000102`.)
   ⚠ Also flagged, not fixed: **`/handover` calls `acceptOffer()` during a GET
   render**, so it mutates on page load. It is excluded from `npm run smoke` for
   that reason. Should become a POST before launch.
7. **Booking now happens at `/book`, not `/request-pickup`** (Batch 5). The
   4-step wizard is the only way a customer creates a pickup, and it goes through
   the `"use server"` actions in `apps/customer/src/app/(app)/book/actions.ts` →
   `getQuote` + `createPickupWithItems`. `/request-pickup` is a redirect; the old
   raw-PostgREST insert it used to do is gone. Anything below describing that
   form is historical. The schema-v1 columns (`batteryType`, `approxQuantity`,
   `approxWeightKg`) are **null on every new pickup** — read `category` and the
   `BatteryItem` rows instead.
8. **Documents and money exist as of Batch 8.** Three PDF templates live in a new
   `packages/pdf` (`@clbipp/pdf`), rendered server-side and handed out by
   `GET /api/documents/{certificate|receipt|invoice}/{pickupId}`, which
   **streams the bytes** after an ownership-scoped read — it does not mint a
   signed URL (that stays the mechanism for photos, which need a URL for `<img>`).
   PDFs are generated lazily on first download and cached; **`pdf_url` holds a
   storage PATH, not a URL.** Certificate and invoice numbers are **derived**
   (`certificateNumber` / `invoiceNumber` in `packages/core/src/documents.ts`),
   so neither needed a column or a migration.
   Payouts settle through `settlePayment` in `packages/core/src/payment-actions.ts`
   — idempotent, atomic, ownership-scoped, behind `PAYMENTS_MODE` (defaults to
   `simulated`; an unrecognised value falls back to simulated, never to live).
   New screens: `/payment/[id]`, `/receipt/[id]`, `/wallet`.
   ⚠ **All money is formatted by `formatPaise` from `@clbipp/core`** — don't
   write a local `/100` anywhere. And ⚠ the "no recovered value to the vendor"
   default is now **scoped, not lifted**: those money surfaces show ₹ per Plan v2
   D6, while `/offer`, `/offer-breakdown` and `/track` stay weight-only. Anything
   below describing the vendor app as showing no ₹ at all is stale.
9. **Impact numbers have one source as of Batch 9**:
   `packages/core/src/impact.ts`. `CO2E_AVOIDED_KG_PER_KG` (per `BatteryType`)
   plus a deliberately conservative `…_BY_CATEGORY` fallback for pre-collection
   loads, where `BatteryItem.chemistry` is still null. It replaced a flat
   `weight * 8` in the seed that overstated lead-acid by ~4×.
   **Never write CO₂ arithmetic in a screen.**
   🔴 **The factor VALUES are a placeholder and the citations are unverified.**
   Only the relative ordering (Li-ion NMC ≫ LFP > lead-acid) is defensible; the
   absolute numbers were not read off any source. **Waiting on the company —
   open question 7 in `COMPANY_FLOW_REVIEW_2026-08-07.md`** — because EPR
   compliance may mandate a CPCB-accepted set, which would make anything we
   source ourselves moot. Their answer is a value change in that one file, plus
   the copy restated in the seed. Read the file header before quoting a number.
   `packages/database` restates the table (it must not import `packages/core` —
   the cycle breaks the generated client), and the Batch 9 verification asserts
   the two agree.
   The **dashboard impact card counts `certified` pickups only**, from the stored
   `Certificate.co2AvoidedKg` / `materialSummary` — the same figure is printed on
   the EPR certificate, so claiming it for batteries still in a truck would claim
   an outcome that hasn't happened.
   Also new: **`GET /api/exports/compliance[?year=]`** streams the CPCB CSV,
   following the Batch 8 document route (ownership-scoped read, stream the bytes,
   no signed URL, no cache). The column set lives in `COLUMNS` in
   `apps/customer/src/lib/compliance-export.ts` and is an open question for the
   company.
10. **The P2 screens exist and the two tracking pages share one implementation
   (Batch 10).** New routes: `(app)/invoices`, `(app)/invoices/[id]`,
   `(app)/history`, and `/book?from=<pickupId>` for repeat booking. The build is
   **34 routes** and `npm run smoke` covers **40**.
   - **`/invoices/[id]` renders from `getInvoiceDoc`**, the same mapper
     `@clbipp/pdf` uses — so the screen and its PDF cannot disagree. Keyed by
     pickup id, like every other detail screen.
   - **`apps/customer/src/lib/pickup-nav.ts` owns pickup row routing**
     (`pickupHref`, `pickupSubtitle`). The dashboard and `/history` both import
     it; don't re-derive a row's destination in a screen. The dashboard now caps
     "Recent Pickups" at 5 with "View all" → `/history`.
   - **`packages/ui/src/components/ui/lifecycle-view.tsx` is the shared
     lifecycle presentation** — `buildStages`, `LifecycleHeader`,
     `RecoverySummary`, `CancelledTimeline`. `/track/[id]` and `/t/[token]` both
     render it instead of carrying ~120 duplicated lines each. Both now use
     `parseMaterialWeights` from `@clbipp/core`; the private `MaterialItem`
     types that named `value_paise` are gone.
     ⚠ **Sharing the layout does NOT share the data.** `/t` still gets no
     photos, no partner card, no realtime and no auth-only CTA — deliberate, and
     now asserted by the smoke test rather than merely intended.
   - **Repeat booking never copies photos** — `draftFromPickup` in
     `book/types.ts`. A photo is evidence of one consignment.
   - **`updatePhone` writes through the SERVER SUPABASE CLIENT, not Prisma**, so
     `grants.sql`'s column allowlist applies. That is the pattern any future
     profile write (including Batch 11's `/onboarding` insert) should follow.
   - **Demo pickups have derived `publicToken`s** (`00000000-0000-4000-8000-
     0000000001NN`) so `/t` is smoke-testable. **Real pickups keep the random
     column default** — a guessable bearer token would be a leak.
   - **`@clbipp/core/format` is a new subpath export** → `documents.ts`, which
     imports nothing, so client components can value-import `formatPaise`
     without dragging Prisma into the browser bundle. The last local `/100` is
     gone.
   - **The app is NOT deployed.** `docs/DEPLOY.md` is the runbook; it runs after
     Batch 11. The Vercel build command must go through turbo — the generated
     Prisma client is gitignored.
11. **OAuth exists and it brought a new session state with it (Batch 11).**
   `signInWithOAuth` + `createProfileForCurrentUser` in `@clbipp/auth`, one
   Google button shared by `/login` and `/signup`, and a new `/onboarding`
   screen. The build is **34 routes** and `npm run smoke` covers **42**.
   - **Google creates an `auth.users` row and NO `profiles` row**, which the
     Batch 6 role gate reads as a half-created account and signs out. The fix is
     a new `onboardingPath` option on `createAuthMiddleware`: a profile-less
     session is redirected to `/onboarding` instead of being signed out, and a
     session that *has* a profile is redirected **off** `/onboarding` so the
     form's INSERT can't be posted twice.
     ⚠ **It lives in the middleware, not `/auth/callback`, deliberately.** The
     callback is one way in; a refresh or a bookmark carries the same
     profile-less cookie and never passes through it. `/auth/callback` is
     unchanged.
     ⚠ **`/onboarding` is NOT a public path.** It needs a session, just not a
     role. There is a smoke assertion standing on that.
   - **`signUpWithProfile` and `createProfileForCurrentUser` share one
     `profileInsertPayload`** — both are constrained by `grants.sql`'s INSERT
     allowlist, and `role` is in neither. **No `grants.sql` change was needed**;
     its allowlist already matched, verified live.
   - **The uid and email come from the session, never the form.** Same posture
     as everything else that touches identity.
   - The origin for the OAuth `redirectTo` is read from the **request headers**,
     not an env var, so localhost, production and previews all work unchanged.
   - **Apple was dropped** (needs a paid Apple Developer account) — the helper
     is provider-typed so it stays a one-form addition.
   - **`packages/auth/src/middleware.test.ts` is new** because the profile-less
     session is the one state `npm run smoke` cannot construct.

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

- Status lifecycle: `requested → scheduled → arrived → offered → collected →
  tested → processed → recovered → certified` (+ `cancelled`)
  **Changed 2026-08-09 in Batch 7A** — `arrived` and `offered` added, agreed and
  migrated (`20260809124400_lifecycle_arrived_offered`). Locked again at nine
  stages. Rationale and the reuse rule (never re-declare the stage array in a
  screen — use `isLifecycleStage` / `isStageBefore` from `@clbipp/ui`) are in
  `CONTEXT.md`.
- The customer app's auth guard must stay under `src/` — not project root.
  **The file is `apps/customer/src/proxy.ts` since 2026-08-14 (PR #18)**, renamed
  from `middleware.ts` for the Next 16 convention change; it exports `proxy`.
  The location rule is what's locked, not the name: Next's dev bundler silently
  never registers it at the project root when `src/app` is in use, and an
  unregistered auth guard fails **OPEN**.
  ⚠ `packages/auth/src/middleware.ts` is **not** renamed and must not be — it is
  the `createAuthMiddleware` factory, an ordinary module, not a convention file.
- **No recovery rate % shown to vendor anywhere.** The company flow document does
  not ask for it, so this one stands.

**Default, but changeable on the company's ask (corrected 2026-08-07):**

- **Don't render `Offer.materialBreakdown` / `Offer.deductions` as ₹ values on
  vendor-facing screens** — weight (kg) only. Applies to A, B, and C.
  **This is a light rule, not a hard one** (it was previously mis-recorded here as
  locked).

  **Scoped in Batch 8 (2026-08-09), not lifted.** Plan v2 D6 relaxes it for the
  money surfaces the company's flow document explicitly asks for, and those are
  now built: **`/payment/[id]`, `/wallet`, `/receipt/[id]` and the invoice PDF
  show ₹** — a payout screen that hides the amount isn't a payout screen.
  **`/offer`, `/offer-breakdown` and `/track` are untouched and stay
  weight-only**, and the material-by-material valuation (`value_paise`,
  `deductions`) is still not rendered anywhere on a vendor screen.

  The line is: **what the customer was paid is visible; how we valued it
  material-by-material is not.** Open question 2 in
  `COMPANY_FLOW_REVIEW_2026-08-07.md` is still unanswered — this is our reading
  of the flow document, not their confirmation.

---

## Design approach (Phase 3)

All design polish (typography, max-width mobile container, serif display font,
logo, spacing) is deferred to Phase 3. A's screens should be functionally
correct and reasonably close to wireframe now. Full design pass happens once
all screens are built.
