# CLBIPP — Lane Ownership: Policy & Change Log

> How lane ownership works this sprint, and a record of every shift to it.
> The canonical ownership map lives in `../CLAUDE.md` (and `PROJECT_STATE.md`
> for the live version). This file holds the *policy* for changing lanes and
> the *log* of changes made. Update the log whenever a lane shifts.

---

## Policy: do it and note it (since 2026-08-20)

> **This replaces the previous "strict by default, flexible by agreement"
> policy.** The old three-step flag → agree → log was costing more in waiting
> than it saved in tidiness, on a three-person build with one week left. The old
> text is preserved at the bottom of this file for the record; entries logged
> under it stand.

Lanes are now a **default assignment, not a gate.**

- **If a task straddles lanes, or its owner isn't ready, do it.** Don't wait for
  agreement first. Blocking on someone else's lane is the expensive failure mode
  this sprint, not stepping on their toes.
- **Then log it here** — one entry saying what you took on and why. The log is
  the point; the permission step is what's gone. Update the ownership map in
  `CLAUDE.md` and `PROJECT_STATE.md` if the change outlives one batch.
- **Attribute by who actually did the work,** not by whose lane it nominally
  was. A handover doc that credits the wrong person is worse than no doc.

Still true:

- **Phase sequencing is fixed.** Lanes moved; the order of phases did not.
- **Don't silently reassign.** Doing the work without saying so is the one thing
  that still breaks the record. Writing it down takes a minute.
- **Prefer building the real thing over stubbing it.** The stub-data pattern in
  `CLAUDE.md` is now for dependencies you genuinely *can't* build (a decision you
  don't own, credentials you don't have) — not for ones that are merely someone
  else's.

---

## Change log

### 2026-08-24 — `smoke.mjs` agent probe count + Batch 7b done-when wording — A, into B's lane

- **Done by:** Aamir (A). Both files are Khalid's (B) — deployment/CI owns
  `scripts/smoke.mjs`, and Batch 7b is his batch on the task sheet.
- **What:** the agent run's `total` omitted the custody-PDF probe. `total` added
  the customer-only sections behind `isCustomer` and nothing for agent, so
  `npm run smoke -- --app=agent` executed 29 probes and printed "All 28" (27
  `AGENT_ROUTES` + 1 `AGENT_PUBLIC_ROUTES`). One line: `(appName === 'agent' ? 1 : 0)`.
- **Severity:** cosmetic, not a coverage hole. `probeDocument` shares the
  `failures` counter and the exit code is `failures === 0`, so a broken custody
  route always failed the run. The wrong total is the problem — 28 was being
  read as proof the document section ran.
- **Also:** corrected the Batch 7b done-when line, which said the route belongs
  in `DOCUMENT_ROUTES`. It doesn't — that array is inside the `isCustomer` gate
  and is fetched against :3000, so an agent route there would be skipped for
  agent and fail against customer. Khalid's separate `appName === 'agent'` block
  is the correct shape; the checklist wording predates the two-app split and had
  already cost one review round-trip.
- **Why taken:** two one-line fixes found while reviewing Khalid's reply on that
  exact question. Handing them back would have cost another round-trip each.
- **For Khalid:** nothing to redo. Your Batch 7b block stands as written — only
  the denominator and the stale checklist line changed. An agent run now reports
  29.

### 2026-08-24 — Batch 8 (track, history, profile) — A, in lane, two cross-lane edits taken

- **Done by:** Aamir (A). Batch 8 is A's own lane — tracking/realtime, history,
  profile, and the RLS that goes with them. Nothing was reassigned.
- **Cross-lane edit 1 — `packages/database/prisma/reset-demo.ts` (B's file).**
  Added the agent's `agent_fee` `WalletTxn` ledger (5 rows on the agent's
  profile), hoisted `agentFeePaise` into a local so the pickup column and the
  ledger row cannot drift, and added `walletBalancePaise: 0` to the agent's
  upsert `update` clause.
  - **Why taken:** the profile screen's whole earnings section reads that
    ledger, and no writer for it exists until Ali's Batch 6 collects a job. The
    alternative was shipping a profile screen that reads ₹0 on a fresh seed and
    a "done when" that passes vacuously at 0 === 0.
  - **For Khalid:** the balance-reset line is the one to keep. Profiles are not
    wiped (they match real auth users) but `wallet_txns` is, so without it a
    second `reset-demo` leaves the agent's cache at double their ledger. The
    vendor's upsert already had the equivalent.
  - **For Ali (Batch 6):** write the *same shape* at collection — same kind,
    same `pickupId`, `balanceAfterPaise` running, and the profile cache in the
    same transaction. The profile screen reconciles ledger vs cache and shows a
    red banner when they disagree.
- **Cross-lane edit 2 — `packages/ui/src/components/ui/custody-log.tsx` (C's
  package).** Added an optional `roleLabels` prop, ~6 lines, default unchanged.
  - **Why taken:** the component's attribution copy was hardcoded to the
    customer's perspective — "Recorded by you" for the vendor, "Recorded by the
    collection partner" for the agent — which is exactly backwards on an agent
    screen. It was a correctness bug on A's screen living in C's file.
  - **For Ali:** the default is untouched, so `/track/[id]` and `/t/[token]`
    behave identically. Nothing to redo.
- **Also touched (A's own):** `supabase/policies.sql` (two agent SELECT
  policies, applied to the shared project), `supabase/realtime.sql` (header
  comment only), `scripts/smoke.mjs`, and stale RLS comments in three existing
  agent screens.
- **Announce-worthy:** `npm run reset-demo` was run against the **shared**
  Supabase project during this batch, and `policies.sql` was applied to it.

### 2026-08-24 — Batch 5b (cross-app seam) — A, in lane, one cross-lane edit taken

Batch 5b is A's own (the cross-app seam is explicitly in A's lane). Logging it
for the one file outside it and for one thing done beyond the task sheet.

**Taken from C's lane:** `packages/ui/src/components/ui/lifecycle-view.tsx` —
`buildStages` changed from last-wins to **first-wins**. Not optional and not
cosmetic: an accepted pickup now carries **two `offered` status events** (the
agent's offer and the vendor's acceptance of it, because the acceptance advances
no stage), and last-wins relabelled the timeline's "Offered" row with the
acceptance date. Three lines including the comment. C keeps the component.

**Done beyond the task sheet:** `voidOfferAcceptance` in
`handover/actions.ts` — `cancelPickup` and reschedule-after-cancel now clear
`Offer.acceptedAt`. The sheet's Batch 5b has three steps and this is not one of
them, but the batch is what makes that timestamp load-bearing (Batch 6 gates the
agent's Collect button on it), so shipping the field without the hygiene would
have handed Batch 6 a hole to guard against. Written up against the
2026-08-23 entry below, which is where the loose end was first flagged.

**Not done, and deliberately left for C's Batch 6:** the seed row for a pickup
at `offered` **with** `acceptedAt` set. It is Batch 6's admit fixture more than
it is 5b's, and adding an eleventh pickup shifts the dashboard counts, "earned
today" and the compliance export totals that existing smoke assertions depend
on — a cost worth paying once, by the batch that needs it. Flagged in
"Batch 5b — as built" and in `PROJECT_STATE.md`.

**Two steps of the sheet were already done** by the customer app's Batch 12
(`/handover` as a POST, and back in `smoke.mjs`). No work, no ownership question.

---

### 2026-08-23 — Batch 3 (multi-item intake): C → A, whole batch

- **Taken by A (Aamir). Was C's (Ali).** The item list, the per-item confirm
  screen, its client form and the `confirmItem` server action —
  `apps/agent/src/app/(agent)/job/[id]/items/**` and `…/scan/page.tsx`.
- **Why:** Batch 3 is the critical path. Batches **5a, 6 and 7a all depend on
  it** and the sprint ends 2026-08-27; nothing else in the on-site flow can start
  until it lands. Under the do-it-and-note-it policy that is a do-it, not a wait.
  Batches 0b, 0a, 1 and 2 were already done and A was otherwise going to start
  5b, which blocks nobody.
- **C (Ali) keeps 5a, 6 and 7a** — unchanged. The screens were written to be
  extended rather than replaced, and "Batch 3 — as built" in
  `FIELD_AGENT_TASKS.md` names the exact one-line change (`itemNextHref` in the
  confirm redirect) that hands the flow into 5a.
- **Two cross-lane one-liners taken with it, both behaviour-preserving:**
  1. `apps/agent/src/app/api/quote/route.ts` (**B — Khalid**, Batch 4): its local
     `LI_ION_TYPES` array replaced with `isLithium` from `@clbipp/core/intake`,
     so the D1 branch has one definition instead of two. **Moves no price.**
  2. `scripts/smoke.mjs` (shared): the `AGENT_ITEMS_GATE` maintenance note that
     Batch 2 left came due — its assertion strings came from the stub this batch
     deleted, one of which no longer exists anywhere in the repo.
- **New shared file:** `packages/core/src/intake.ts` + 39 tests. Pure and
  browser-safe, exported as the `@clbipp/core/intake` subpath. It is where the
  li-ion branch, the confirmation rule and the submission validation live —
  **not in a screen**, so 5a's roll-up and the admin app read the same answers.
- **Agreed by:** decided with Aamir at the start of the session, before building.

### 2026-08-23 — Batch 2 (safety checklist) — A, in lane, two cross-lane edits taken

Batch 2 is A's own lane (W1 — the mandatory safety gate). Two files outside it
were edited rather than waiting, per the do-it-and-note-it policy above.

**1. `apps/agent/src/app/(agent)/job/[id]/items/page.tsx` — Ali's file (Batch 3).**
Added a session read plus one line: `await requireSafetyChecklist(id, user.id)`.
*Why:* the task sheet's Batch 2 step 3 puts the gate in the items page
explicitly — "the gate lives in the items page, server-side" — so this is Batch
2's work landing in a file Batch 3 owns, not a land grab. The stub body is
untouched.
*Risk, and what was done about it:* Ali replaces that file wholesale in Batch 3,
and a gate written inline would be deleted by the rewrite with nothing failing
visibly. So the logic lives in `apps/agent/src/lib/safety-gate.ts` (A's `lib/`),
the call site is one line with a loud comment block above it, and
`scripts/smoke.mjs` asserts the gate still rejects. Flagged for Ali in the
"Batch 2 — as built" section of `FIELD_AGENT_TASKS.md`.

**2. `packages/database/prisma/reset-demo.ts` — Khalid's file.**
Added a `SafetyChecklist` seed block: a passing row for every pickup at
`arrived` or beyond, and deliberately none for `PKP-2026-000102`.
*Why:* the lifecycle implies it — the check is mandatory before any battery is
handled, so an assessed pickup necessarily passed one, and a seeded history
without these rows depicts an app whose central compliance gate nobody used.
*And it unblocks Ali:* Batch 3 needs a job that is **past** the gate to build
against. `PKP-2026-000103` is now that job. Without this, every intake route Ali
builds would redirect straight back to the checklist.
*Same file A edited two lines of in Batch 1* — that entry is below.

**Also, and worth Khalid knowing:** this batch found that Prisma's
`@default(uuid())` does **not** apply to a service-role write, because the
migration created `safety_checklists.id` as plain `TEXT NOT NULL` with no
database default. It affects every uuid-keyed table these agent actions write.
Details in the as-built notes; no schema change was made.

### 2026-08-23 — 🔴 NOTED, not actioned: reschedule-after-cancel needs the lifecycle contract updated

Spotted while rebasing Batch 1 onto `8d51cbe` / `3470b34` (customer app auth +
rescheduling). **Not touched — flagging only, per lane policy.** Owner: whoever
wrote `feature/customer-tweaks`.

`reschedulePickup` in `apps/customer/src/app/(app)/handover/actions.ts` writes
`cancelled → requested`, reactivating a cancelled pickup instead of making the
customer file a new request.

**The behaviour is correct — HR asked for it.** The gap is that it is a real
change to the lifecycle contract and the contract still says otherwise:
`CLAUDE.md` and `schema.prisma` both describe `cancelled` as the **terminal**
side-state. Right now the only place the new edge is written down is inside the
action. Every screen that treats `cancelled` as final is making an assumption
that no longer holds, and nobody reading the contract would know.

**The fix is documentation, not code:** state in `CLAUDE.md` and in
`schema.prisma`'s `PickupStatus` comment that `cancelled` is re-enterable via
reschedule. Still nine stages; no migration.

Three consequences that follow, and are worth a look once the contract says so:

1. **The audit log can go backwards.** A `requested` `status_events` row now
   lands *after* a `cancelled` one. `buildStages` / `lifecycle-view` (shared,
   A's) assume monotonic progression — worth checking what a reactivated
   pickup's timeline actually renders.
2. **Reactivation clears nothing else.** The row keeps its old `agentId`,
   `agentFeePaise`, `Offer` and `Offer.acceptedAt`. So a pickup can sit at
   `requested` while still carrying an accepted offer and an assigned agent.
   Probably wants the offer voided and the agent unassigned on reactivation —
   the vendor is re-requesting, not resuming.
3. **It surfaces in the agent day view.** `isActiveJob('requested', …)` is true,
   so a reactivated pickup that kept its `agentId` reappears in the agent's
   active list labelled "In recovery — nothing to do" (`job-nav.ts`).
   Unreachable until (2) is decided, since nothing else produces a `requested`
   pickup with an agent — deliberately left alone rather than special-cased
   around it.

**Nothing here blocks Batch 1, and nothing was changed for it.** (2) is the one
with teeth; (3) resolves itself once (2) does.

> **UPDATE 2026-08-24 (Batch 5b, A).** Partly actioned, because (2) stopped
> being theoretical: `Offer.acceptedAt` is now what the agent app reads as
> permission to collect.
>
> - **(2) half-fixed.** `cancelPickup` and the reactivation path in
>   `reschedulePickup` now null out `Offer.acceptedAt` via a shared
>   `voidOfferAcceptance` helper. **Still open:** the row keeps its `agentId`
>   and `agentFeePaise`, so (3) is unchanged too.
> - **(1) improved, not fixed.** `buildStages` is now first-wins, so a
>   reactivated pickup's timeline keeps the date it *first* reached each stage
>   instead of being relabelled by the later event. The underlying "the audit log
>   can go backwards" fact is untouched.
> - **The documentation gap this entry is really about is still open** —
>   `schema.prisma`'s `PickupStatus` comment still describes `cancelled` as
>   terminal. `CLAUDE.md` says otherwise. One of them should move.

### 2026-08-22 — Batch 1 (day view + job detail) — A, in lane, one seed edit taken

- **In lane, no shift:** `apps/agent/src/app/(agent)/page.tsx`,
  `job/[id]/page.tsx`, `job/[id]/actions.ts`, `src/lib/job-nav.ts`. A owns the
  agent nav shell, job detail and the cross-app seam.
- **Taken from B:** two lines of `packages/database/prisma/reset-demo.ts` — the
  agent's live jobs (`scheduled` / `arrived`) now get a `scheduledSlot` of
  *today*, and the one `collected` pickup moved from `daysAgo: 6` to `4` so its
  `collected` status event lands today.
  - **Why:** the day view's three stats are date-bounded to today, per §2 of the
    plan. With the old fixture dates nothing was dated today at all, so a fresh
    seed rendered `0 / 0 / ₹0` — a home screen that looks broken rather than
    quiet. Two numbers were cheaper than reinterpreting the spec's stat labels.
  - **Blast radius checked:** `npm run smoke` is 45/45 against the customer
    production build both before and after, so no customer screen depends on
    those dates.
  - **Khalid:** the `agentFee` seed placeholder is still a flat 10%. Your Batch 4
    D3 rule replaces it and **will move the "Earned today" number** on the
    agent's home screen — that is the silent-economics-drift case, so say so in
    the commit.
- **Deferred, not dropped:** the wireframe's offline banner on the day view. It
  has nothing to read until the PWA/offline queue exists — it belongs to Batch 8,
  which is also A's.

🔴 **Found while verifying, unrelated to this batch:** `npm run smoke` reports 3
failures against `npm run dev` (`/api/documents/{certificate,receipt,invoice}/…`
return Next's own HTML 404 instead of a PDF) but is **45/45 against the
production build** (`next build` then `next start`). It reproduces at clean
`HEAD` with this batch stashed, so it is not Batch 1's, and the deployed app is
unaffected. It looks like Turbopack dev not matching the doubly-nested dynamic
API route `api/documents/[kind]/[id]`. **Owner: Khalid (PDF templates + deploy).**
Until it's understood, smoke the customer app against a production build before
pushing, not against `npm run dev`.

### 2026-08-21 — Batch 0a EXECUTED by A, plus three things taken on the way

Follow-up to the 2026-08-20 entry below, which reassigned Batch 0a from Khalid
to Aamir. It is **done** — `agent_app_v1` is applied, the seed is extended, and
`npm run build` / `test` / `smoke` (customer, agent, and the role gate both
ways) are all green. Three items crossed into B's lane while doing it:

1. **`PathwayDecision.traceId` added** (`packages/database`, B's lane, but it is
   the same migration 0a already owns). §3 of the plan says
   `BatteryItem.traceId` "links to PathwayDecision", and there was no column to
   link to — the engine mints its own `TRC-YYYY-NNNN`. Added now so the sprint
   needs one migration rather than two. **Khalid: the join exists; no action.**

2. **RLS closed on six decision-engine tables** — `market_prices`,
   `pathway_factors`, `pathway_decisions`, `battery_packs`,
   `battery_inspections`, `battery_diagnostics`. RLS is A's lane, the tables are
   B's. They had RLS **off entirely**, so any logged-in vendor session could
   read our pricing internals over PostgREST. Enabled with no policy (denies
   `authenticated`, admits only the service role); nothing reads them through a
   Supabase client, so behaviour is unchanged. Verified: a real vendor session
   gets `200 []` from `/rest/v1/market_prices`.

3. **`reset-demo.ts` no longer needs a pre-existing `business@test` profile.**
   It used to throw "log in once to create it". Forced by the incident below.

**🔴 The incident, which everyone needs to know about.** Mid-batch the shared
Supabase project turned up with **every row of `public.profiles` gone and every
`GRANT` on schema `public` gone**, while all 36 `auth.users` rows were intact.
Not caused by this batch (the migration is additive; `wipe()` deletes two
hard-coded uuids). Most likely a destructive run against the shared project by
someone between 2026-08-20 and 2026-08-21 — **if that was you, no blame, but say
so**, because whatever it was may also have hit Storage.

Two lasting lessons, both written up in "Batch 0a — as built" in
`docs/FIELD_AGENT_TASKS.md`:
- **`npm run reset-demo` is not recovery.** It restores rows, not grants or
  policies. Re-apply `supabase/grants.sql` **first**, then `policies.sql`,
  `storage-policies.sql`, `realtime.sql`.
- **Missing grants do not look like an outage.** The app half-works: Prisma
  pages render, Supabase-client pages render *empty with a 200*, API routes
  401, and `/onboarding` lets an onboarded session through — because the auth
  guard deliberately fails **open** on an infrastructure error. `npm run smoke`
  read 18/45 with no single obvious cause. Check grants first if you see that.

Also fixed while there: the database had **no Prisma migration history**
(`_prisma_migrations` empty, `migrate deploy` refused with `P3005`). Verified
the live schema matched migration 8 exactly, then baselined the eight prior
migrations. **History is tracked now — the next migration is an ordinary
`migrate deploy`.**

- **Executed by:** Aamir. **Nominal owner of items 1–2:** Khalid.
- **Under the do-it-and-note-it policy** — no prior agreement sought, logged here.

### 2026-08-20 — Batch 0a (schema + seed): B → A

- **Whose lane it is normally:** B's (Khalid). `packages/database/prisma/schema.prisma`,
  its migrations, and `reset-demo.ts`.
- **What A is taking on:** the whole of Batch 0a — the §3 schema delta from
  `PLAN_FIELD_AGENT_APP.md`, the single `agent_app_v1` migration, and the
  `reset-demo.ts` extension (agent-assigned pickups at five stages, mixed-category
  `BatteryItem` rows, one `MarketPrices` row, one `Facility` row).
- **Why:** it blocks **everything**. A's Batches 1 and 2 cannot read data without
  it, and C's Batch 3 needs the seeded multi-item pickups. Under the new
  do-it-and-note-it policy, waiting is the wrong call with a week on the clock.
- **Not yet started as of this entry** — logged here in advance so the record is
  straight before the work begins. Attribute it to **A**.
- **Khalid should know:** don't also build 0a. His lane this sprint is now
  **Batch 4 (engine + pricing), Batch 7b (custody PDF), Batch 9 (deploy)** — and
  the agent app's Vercel project, see `DEPLOY.md` §5.

### 2026-08-20 — Policy change: lanes stop being a gate

- **What changed:** the flag → agree → log sequence is replaced by do-it-and-note-it.
  See the Policy section above. Decided by Aamir (repo owner) on time-pressure
  grounds, not because the old policy was wrong in principle.
- **Also changed the same day:** git workflow is now **direct commits to `main`**,
  no branches and no PRs. Recorded in `CLAUDE.md` → Conventions.
- **Consequence worth stating:** both Vercel projects deploy off `main`, so a
  push is a deploy. Run `npm run build` and the relevant `npm run smoke` before
  pushing.

### 2026-08-20 — Batch 0b (agent scaffold + auth gate) — A, in lane

- Not a shift; noted because two decisions inside it touched the lane question.
- **`AgentTabBar` was built local to `apps/agent`** rather than parameterising
  `BottomTabBar` in `packages/ui` (C's lane), *under the old policy*. **Under the
  policy adopted the same day that call would go the other way** — fold both into
  one `tabs`-prop component in `packages/ui` directly. Left as-is for now because
  it works and C's Batch 3 is live in that directory; revisit post-sprint.
- **`packages/auth/src/middleware.ts` gained a comment** (no behaviour change)
  documenting that `getUser()` fails closed on a network error. That file is A's
  lane already.
- **`scripts/smoke.mjs` gained `--app=agent`** and its customer summary total was
  corrected from 44 to 45 (it never counted `OFFER_SURVIVED_GET`). Same probes.

### 2026-08-20 — Customer-app revamp override LAPSES; ownership reverts (Field Agent app)

- **What changed:** the 2026-08-09 entry below handed B's entire lane to A
  because B was unavailable for the customer-app revamp. That revamp is merged
  and the cover is **spent**. All three of us are available for the Field Agent
  app, so **ownership reverts to the `CLAUDE.md` map** for this sprint.
- **Who owns what now** (batch numbers from `PLAN_FIELD_AGENT_APP.md` §4):
  - **A (Aamir)** — auth + role gate, app scaffold, nav shell, job detail,
    safety checklist, tracking + realtime, history, profile, and the cross-app
    seam. Batches 0b, 1, 2, 5b, 8.
  - **B (Khalid)** — schema + migration + seed, the decision engine and all pure
    pricing logic, the PDF template, and deploy. Batches 0a, 4, 7b, 9.
  - **C (Ali)** — the on-site flow: intake → assessment → quote → collect → hub
    drop-off. Batches 3, 5a, 6, 7a.
- **No lane shift was needed and none is being logged as one.** The agent app
  decomposes along the same three seams the vendor app did — it is the same
  architecture seen from the other side — so the standing map already fits.
- **One thing to watch:** Batch 5b has A editing the *customer* app
  (`handover/actions.ts`), which is normally C's flow area. That is A's
  cross-app-seam ownership, which A has held since the 2026-07-10 entry below —
  not a new shift.
- **If C is unavailable again**, A absorbs 3/5a/6/7a and the cut list in §5 of
  the plan stops being a contingency and becomes the plan. Flag it early; don't
  absorb it silently.

---

### 2026-08-09 — Lifecycle enum change (Batch 7A) executed by A under the revamp cover

- **Whose lane it is normally:** B's. `packages/database/prisma/schema.prisma`
  and its migrations are the schema owner's, and `CLAUDE.md` says not to edit
  that file directly.
- **What A did:** added `arrived` and `offered` to `enum PickupStatus`, wrote the
  migration `20260809124400_lifecycle_arrived_offered` by hand, and reshaped the
  seed from 8 pickups to 10.
- **Why it's covered:** the 2026-08-09 entry below already assigns B's whole lane
  to A for the duration of this revamp, with B's explicit permission. No new
  agreement needed — logged separately because it changes a **contract recorded
  as LOCKED** in three docs, which is worth its own line in the record.
- **Khalid needs to know two things when he's back:**
  1. The status lifecycle is now **nine stages**, and `/offer` guards on
     `status === 'offered'` exactly. Anything he writes against the old
     seven-stage list is stale.
  2. Demo pickup ids were **renumbered** — the certified pickup is now
     `PKP-2026-000109` (was `…107`) and the offer pickup is `PKP-2026-000104`
     (was `…102`).
- **Reverts with the rest of the temporary override.**

### 2026-08-09 — Customer-app revamp: B's entire lane → A (temporary, for this revamp)
- **Moved to A (Aamir):** all of B's (Khalid's) lane for the customer-app
  revamp — the Batch 0B schema migration + Storage buckets + seed rewrite, the
  pricing engine and `createPickupWithItems`, PDF generation (certificate,
  receipt, invoice), the impact dashboard, compliance CSV export, payments +
  wallet, and the notification-copy fix. In practice: `packages/database/*`,
  `packages/core/*`, and B's screens.
- **Why:** B was unavailable on 2026-08-09 and the goal was to finish the
  customer-app revamp in one day. B's work sits at the *front* of the dependency
  chain — the schema blocks the booking flow, and the pricing engine blocks the
  quote step — so waiting would have stalled A's lane entirely.
- **Agreed by:** Khalid, verbally, in advance — explicit permission to do "his
  side of the work if it blocks me, or his whole side if that's what it takes".
- **Scope + duration:** this revamp only. Ownership reverts to the map in
  `CLAUDE.md` once Khalid is back. Nothing here changes the permanent lane map.
- **What Khalid should know on return** (nothing is blocked on him):
  1. `BATCH_0B_SCHEMA.md` §2 had a real defect — `Pickup.batteryType` was
     missing `@map("battery_type")`, which would have renamed a live column with
     10 rows and broken the raw-PostgREST insert path. Fixed in the repo *and*
     in the runbook. Don't re-paste an older copy of §2 over it.
  2. The seed is a full rewrite (`prisma/reset-demo.ts`); the old
     `prisma/seed.ts` is deleted. Every row now belongs to a real auth user.
  3. Live status + resume point: `docs/REVAMP_BATCHES_2026-08-09.md`.
  4. The Batch 3 A↔B contract (`BATCH_0B_SCHEMA.md` §7) shipped with two
     deliberate divergences — `CreatePickupInput` gains `vendorId` (core does
     not read the session), and weightless lines are still quoted from a typical
     unit weight. Both are written up in `REVAMP_BATCHES_2026-08-09.md`
     → "Batch 3".

### 2026-07-10 — Netting-up: seam + flow/component crash-fixes + PWA/deploy → A
- **Moved to A (Aamir):** the cross-lane navigation seam (dashboard↔flow↔track
  routing), the flow-screen + component-library crash-fixes (`badge.tsx`,
  `timeline.tsx`, `tokens.ts`, `scheduled/`, `offer/`, `offer-breakdown/`,
  `handover/` incl. `handover/actions.ts`, `design-system/page.tsx`), and
  **PWA + deploy**.
- **Why:** manual testing showed the app was two half-connected pickup stacks
  (C's query-param flow + A's state-driven `/track`) with no guards. The
  connecting work spans all three lanes and needs whole-repo visibility;
  screen-by-screen edits without it kept re-introducing seam bugs. PWA/deploy is
  repo-wide config, a poor fit for anyone without full-repo sight. A is on Claude
  Code (whole-repo view).
- **B (Khalid) keeps:** all data/schema + his own screens — seed fix, cert-by-id,
  compliance link, dashboard wiring (row routing + request-button link, done to
  A's spec in `REMEDIATION_PLAN.md`). Unchanged lane otherwise.
- **C (Mohammed) keeps:** component-library ownership generally; scoped this
  round to **visual polish on his own flow screens** (no wiring/DB), done after
  A's crash-fixes land. A's crash-fixes to C's component files are flagged here.
- **A also owns (own lane):** `supabase/policies.sql` RLS tightening (H2) +
  service-role client (`src/lib/supabase/admin.ts`) + the `acceptOffer`/
  `cancelPickup` service-role rewrite (H1).
- **One hard interaction (A↔B only):** B seeds the Offer that A's offer screen
  reads; A+B share the `service_role` key + applying the RLS change on the DB.
- **Agreed by:** flagged in GC 2026-07-10; plan in `docs/REMEDIATION_PLAN.md`,
  findings in `docs/REVIEW_findings_2026-07-10.md`.

### 2026-07-05 — `(app)/layout.tsx` tab-bar wiring: C → A
- **Moved to A (was implicitly C):** wiring `BottomTabBar` into
  `src/app/(app)/layout.tsx` so all authenticated screens get shared nav.
- **Why:** the layout stub was created by A; `BottomTabBar` is built but unwired.
  Doing it here in Task 2 (tracking screen) rather than waiting for Phase 3 is a
  Phase 2 prerequisite (P1 in PROJECT_STATE.md). A's screens need the nav; so do
  B's existing screens. Doing it now prevents a Phase 3 merge scramble.
- **C keeps:** `BottomTabBar` component ownership, PWA/offline, deployment
  (*superseded 2026-07-10 — PWA/offline + deployment moved to A, see entry
  above*). Also
  retains the Phase 3 task of adding a max-width mobile container to AppShell.
- **Agreed by:** flagged to C. C to acknowledge; A proceeding as P1 blocker.

### 2026-06-27 — Signup / account-creation flow: B → A
- **Moved to A (was B):** the account-type selector, the individual & fleet
  signup forms, and the initial `profiles` row insert that happens at signup.
- **Why:** account creation should be one atomic unit — `auth.signUp` *and* the
  `profiles` insert together — to avoid a half-created account (an `auth.users`
  record with no matching `profiles` row, which breaks RLS and every
  profile-dependent screen). That whole path is auth's concern, which is A's
  lane.
- **B keeps:** KYC document upload + verification (`kyc_status`, `kyc_doc_urls`,
  Supabase Storage) as a *post-signup* onboarding step. Fleet accounts sign up
  first, then complete KYC.
- **Agreed by:** B. Flagged + recorded per the policy above.

---

## 2026-08-24 — dispatch script, PWA + install prompt (Aamir)

Done under the do-it-and-note-it rule. Four things, three of which crossed a
lane.

1. **`npm run assign-job`** (`packages/database/prisma/assign-job.ts`) — B's
   lane (seed/scripts), built by A. **It closes a hole nobody had noticed: no
   code anywhere wrote `requested → scheduled` or set `Pickup.agentId`.** Only
   the seed did. So a pickup booked in the customer app was invisible to the
   agent app forever, and the whole cross-app journey worked *only* on seeded
   rows. That transition belongs to the admin app (still a scaffold), so this is
   a CLI stopgap rather than a screen — putting it in the customer app would
   cross the D7 seam, and putting it in the agent app would contradict D2.
   When the admin surface exists, lift `assignJob` into a server action; the
   logic transfers unchanged.

2. **Agent PWA** (`apps/agent/public/*`, `ServiceWorkerRegister`, layout
   metadata) — A's own lane. **This was Batch 8's and was silently dropped**;
   the layout still carried "PWA + offline is Batch 8" as a comment. The agent
   app had no `public/` directory at all. Icon is deliberately the inverse of
   the customer's (black "FA" on lime vs lime "B2" on black) because the
   two-device demo puts both on one home screen.

3. **`<InstallPrompt />`** (`packages/ui`) — C's lane (component library), built
   by A, and wired into **both** apps' home screens. Neither app had one, which
   is why installing meant finding "Add to Home Screen" in a browser menu.
   Chromium gets a real one-tap install dialog; iOS gets the Share-sheet
   instructions, because Safari has no install API and never has.

4. 🔴 **A live bug in the deployed customer app, found while testing the above.**
   Both apps' proxy matchers excluded a directory `icons/` that has never
   existed, while the real icon files sit at the public root — so
   `icon-192.png`, `icon-512.png`, `icon.svg` and `apple-touch-icon.png` all
   **307'd to /login**. Chrome must be able to fetch the 192 and 512 icons
   before it will offer an install, so the customer app was **not installable at
   all**, and iOS used a screenshot of the page as the home-screen icon. The
   manifest itself was public and returned 200, so nothing looked wrong. Fixed
   in both `src/proxy.ts` files by naming the four files explicitly; the
   comments there say why, at length, so nobody "tidies" them back.

Also fixed the agent smoke table, which had gone stale when Batches 5a/6/7a
landed: two routes were failing, and five more were passing vacuously (a 307
with no assertions scores "ok"). Agent is 30/30 now, asserted in both
directions.

---

## Superseded policy (2026-06-27 → 2026-08-20) — kept for the record

Entries logged above under dates before 2026-08-20 were made under this rule,
and stand as written.

> **Strict by default, flexible by agreement.** Work inside your lane; don't
> edit another lane's area just because it's faster. When a task genuinely
> straddles two lanes: (1) flag it before building across the line, (2) get the
> other owner's OK, (3) log it here and update the ownership map.
>
> Replaced on 2026-08-20 because step 2 was producing waiting, not quality.
