# Plan — Presentation Feedback (FV1–FV7)

Source: `docs/CLBIPP_Presentation_Feedback_Changes.docx` (eleven changes, P0–P2)
plus the pilot-run conversation of 2026-09-09 (engine may be off for the pilot;
they want a human step retained).

Open questions are in `docs/CLBIPP_Open_Questions_2026-09-10.html` (rendered to
PDF, sent to the company). **Sections marked BLOCKING there gate the batches
that say so below** — everything else proceeds on the stated recommendation.

Decisions here are numbered **FD0–FD6** and follow the same rule as AD0–AD12:
once settled, not re-litigated mid-build. Note the collision hazard the repo
already warns about — quote the decision with its set (**FD**, not AD or D).

---

## §0 What the feedback asks for, against what exists

| # | Feedback change | Pri | State today | Verdict |
|---|---|---|---|---|
| 1 | Mandatory customer battery photos | P0 | ✅ **BUILT (FV1)** — ≥1 per line, schema-enforced | done |
| 2 | Remove preliminary estimated offer | P0 | ✅ **BUILT (FV1)** — gone from both customer surfaces | done |
| 3 | Mandatory agent inspection photos | P0 | ✅ **BUILT (FV2)** — ≥1 per line, action-enforced | done |
| 4 | Separate inspection from collection | P0 | **Not modelled.** One visit, `offered → collected` | **Largest change in the set** |
| 5 | Verified battery weight | P0 | ✅ **BUILT (FV2)** — `weightMethod` + divergence flag | done |
| 6 | Agent live-job count at assignment | P1 | ✅ **Already built** — `lib/job-load.ts`, shown on `/dispatch/[id]` | Confirm + surface on the board |
| 7 | Dispatch filtering and sorting | P1 | Board is hardcoded `status: 'requested'` | Medium — `DataTable` + `FilterChips` already exist |
| 8 | Second Life / Recycling pathway | P1 | Engine sets 4 pathways; **nothing routes on them** | Partial — routing is BLOCKED on H2/H3 |
| 9 | Battery / pickup tagging | P1/P2 | `traceId` per item; no physical tag | BLOCKED on I1 |
| 10 | QR-tracked transport boxes | P2 | `CustodyBatch` is close but not the same thing | BLOCKED on J3 |
| 11 | Same-day nearby grouping | P2 | No reliable geocoding (`Address.lat/lng` nullable) | BLOCKED on K1 |

---

## §1 Decisions

**FD0 — The nine-stage lifecycle stays locked. Deferred collection adds no
tenth stage.** `requested → scheduled → arrived → offered → collected → tested →
processed → recovered → certified` is asserted in four independent places
(`enum PickupStatus`, `LIFECYCLE_STAGES`, `pickupstatusSchema`, `LIFECYCLE` in
`reset-demo.ts`) and rendered by the shared `buildStages`. "Inspected, accepted,
awaiting a scheduled collection" is `offered` + `Offer.acceptedAt` set +
`Pickup.collectionScheduledAt` in the future — a derived state, exactly as D5
made "pending drop-off" derived from `custodyBatchId`.

> 🔴 **Consequence, stated plainly: `offered` now carries THREE sub-states.**
> awaiting decision (`acceptedAt` null) · accepted, collect now · accepted,
> collection scheduled. The repo already warns that any screen switching on
> `status === 'offered'` must read `acceptedAt` too; after FV3 it must read
> `collectionScheduledAt` as well. The seven places that read `acceptedAt` are
> listed in CLAUDE.md and every one is revisited in FV3. This is a real smell
> and it is still cheaper than a migration across four sources of truth plus the
> PDF templates and the two tracking screens.

**FD1 — Photo requirements are enforced server-side, in the action, not in the
form.** Same posture as AD7 and the engine-config validator: the form is not the
boundary. Customer photos are validated in `bookingSubmissionSchema`
(`packages/core`), agent photos in `confirmItem`.

**FD2 — The indicative estimate is retained in the database and hidden from the
vendor.** `Pickup.indicativeQuotePaise` keeps being computed server-side at
submit; it is removed from every customer surface and relabelled "internal
estimate — not shown to the vendor" on `/dispatch/[id]`. Deleting the column
would throw away the only pre-dispatch signal ops has for triage. (Subject to
B1.)

**FD3 — Measured weight and its provenance are two columns, and neither
overwrites the customer's declaration.** Extends the existing two-halves rule on
`BatteryItem`: `weightMethod` and `weightPhotoUrl` join the agent's half.
Divergence between declared and measured is a *finding*, surfaced, never
reconciled away.

**FD4 — "Second Life" and "Recycling" are a PRESENTATION of the engine's four
pathways, not a replacement for them.** One mapping function in
`packages/core` (`reuse|refurbish → second_life`, `recycle|dispose →
recycling`); the four values stay in the database because the price differs
between reuse and refurbish. No screen re-derives the mapping. (Subject to H4.)

**FD5 — Manual pricing is a MODE, not a fork of the engine.** If the company
confirms L1, the agent's result screen gains an office-quoted path that writes
the same `unitPricePaise` / `linePricePaise` columns the engine writes, with
provenance recorded on the item. 🔴 **The engine still runs and still logs what
it would have said** (L5) — it just stops being the number that is read aloud.
There is no second pricing path and no second `Offer` shape.

**FD6 — Nothing in this set may move a price silently.** FV1–FV4 are
price-neutral by construction and each batch's verification asserts it. FV5 and
FV6 are price-*capable* and say so in their commit messages, per the repo's
standing rule.

---

## §2 Batches

Ordered so that the one migration lands early and once. Each batch ends green on
`npm run build` plus the relevant `npm run smoke`, per `docs/BEFORE_YOU_PUSH.md`.

### FV1 — Customer evidence + estimate removal · P0-1, P0-2 · ✅ BUILT 2026-09-10

Files:
- `packages/core/src/validation.ts` — `photoUrls` gains `.min(1)`; message
  written for a human, not a validator.
- `packages/core/src/validation.test.ts` — a test each way.
- `apps/customer/src/app/(app)/book/StepItems.tsx` — label to "Photos
  (required)", per-line error, disable Continue.
- `.../book/types.ts` — `itemError()` covers the photo rule so the client and
  the schema cannot drift.
- `.../book/StepReview.tsx` — the whole indicative-quote card is deleted;
  replaced by one sentence.
- `.../book/BookingWizard.tsx` — drops the `quoteBooking` call and the
  `QuoteResult` state.
- `.../book/actions.ts` — `quoteBooking` deleted; `submitBooking` keeps
  computing `indicativeQuotePaise` server-side (FD2).
- `.../submitted/page.tsx` — estimate tile removed.
- `apps/admin/.../dispatch/[id]/page.tsx` — relabel to "Internal estimate".
- `scripts/smoke.mjs` — assert no ₹ figure renders on `/submitted`.

Verify: `npm run test` · `npm run build` · `npm run smoke` ·
`npm run smoke -- --app=admin`.

### FV2 — Agent evidence + verified weight · P0-3, P0-5 · ✅ BUILT 2026-09-10

🔴 One migration for the whole set, hand-annotated, deployed with
`prisma migrate deploy` against the shared project — never `migrate dev`.
Name: `feedback_v2`.

Schema delta (all additive, all nullable — no backfill, no price movement):
- `enum WeightMethod { digital_scale, manufacturer_label, estimated }`
- `BatteryItem.weightMethod WeightMethod?`
- `BatteryItem.weightPhotoUrl String?` — storage object path, not a URL, same as
  every other file column in this schema.
- `Pickup.inspectedAt DateTime?` · `Pickup.collectionScheduledAt DateTime?` ·
  `Pickup.collectedAt DateTime?` — **added here though FV3 uses them**, so the
  shared database is migrated once rather than twice.
- `BatteryItem.pathwaySetBy String? @db.Uuid` · `pathwayReason String?` — same
  reasoning, used by FV5.

Then:
- `packages/core/src/intake.ts` — `parseIntakeSubmission` takes the method;
  `weightDivergence(declared, measured)` returns the E5 flag. Tested there.
- `apps/agent/.../items/[itemId]/ItemConfirmForm.tsx` — method selector, scale
  photo slot, photos required, divergence warning shown live.
- `apps/agent/.../items/actions.ts` — enforce ≥1 agent photo and the method
  server-side (FD1).
- `apps/admin/.../pickups/[id]/page.tsx` — show declared vs measured and the
  method beside it.
- `packages/database/prisma/reset-demo.ts` — seed a method on every confirmed
  item; **add a `verify-seed` check** so a fixture cannot lose it silently.

Verify: `npm run test` · `npm run build` · `npm run smoke -- --app=agent` ·
`npm run verify-seed`.

### FV3 — Inspection separated from collection · P0-4 · ✅ BUILT 2026-09-23

Unblocked by FD7 and FD8 rather than by the company. Partial collection is out
(FD8), so this batch stayed the size it was scoped at.

- `apps/agent/.../job/[id]/actions.ts` — new `scheduleCollection(pickupId, date)`
  beside `markArrived`, copying its shape exactly (session identity, service
  role, ownership re-check, idempotent, POST). Writes
  `collectionScheduledAt` and a `status_events` row with **no status change** —
  the note carries the date.
- `apps/agent/.../job/[id]/page.tsx` — after acceptance, two buttons: "Collect
  now" and "Schedule collection".
- `apps/agent/src/lib/job-nav.ts` — the three-sub-state read; a job scheduled
  for a future date is not today's work.
- `apps/agent/.../page.tsx` (day view) — a "Scheduled collections" section.
- `apps/customer/.../handover/page.tsx`, `.../scheduled/page.tsx`,
  `packages/ui/.../lifecycle-view.tsx` — the customer sees the date. ⚠ The
  `/offer` ⇄ `/handover` redirect pair is guarded on `acceptedAt`; **do not
  widen either guard to a status range** — they loop.
- `apps/admin/.../dispatch/page.tsx` — scheduled collections appear as future
  jobs (finished properly in FV4).
- Offer validity (D3) rendered on the offer screen once the window is confirmed.

Verify: `npm run build` · all three smokes · a manual entry in
`docs/MANUAL_TEST_QUEUE.md` for the two-visit path.

### FV4 — Dispatch board: filters, sorting, workload · P1-6, P1-7 · ✅ BUILT 2026-09-23

F1 answered in-house: **service area is the address city**, offered as a filter
alongside agent, bucket and a date range. If the company later supplies a real
zone map it replaces one `<Select>`'s options and nothing else.

- `apps/admin/.../dispatch/page.tsx` becomes a server read over the live
  pipeline; a new client `DispatchBoard.tsx` composes the **existing**
  `DataTable` and `FilterChips` from `components/console/` — no new primitive,
  and nothing lands in `packages/ui` (AD11).
- Filters: status · assigned/unassigned · agent · scheduled-date range ·
  city/pincode. Sort: request date · preferred date · scheduled date · waiting
  time.
- Default view stays "needs action" so the board opens on the same rows it
  opens on today.
- 🔴 Keep the two traps the current board exists to defend: it must **not**
  filter on `agentId: null` (that hides the reactivated-pickup case, fixture 8),
  and flat-rate items must stay visible in every count.
- `liveJobCounts()` surfaced on the board header as well as the assign screen —
  one definition, already the single source (G1).

Verify: `npm run build` · `npm run smoke -- --app=admin`.

### FV5 — Second Life / Recycling, operationally · P1-8 · ✅ BUILT 2026-09-23

Unblocked by FD9. Built:

- `packages/core/src/pathway.ts` — FD4's mapping, plus labels. One home.
- Admin can set/override an item's pathway with a mandatory reason →
  `AdminAudit` row via `ADMIN_AUDIT_ACTIONS` (a new `item.pathway` action, added
  to the closed set, never a bare string).
- The Second Life / Recycling split shown on `/lifecycle`, `/pickups/[id]` and
  the dashboard.
- **Not built:** second-life routing, a refurb-partner directory, or any change
  to what the certificate says. All three wait on H2/H3.

### FV6 — Pilot mode: manual pricing and the human step · ✅ BUILT 2026-09-23 · 🔴 **PRICE-CAPABLE**

Unblocked by FD10. An agent can now present a total other than the engine's.
No price moves on its own — but this batch is the one place a human can move
one, deliberately, with a reason attached.

Previous scoping note: Shape if confirmed: FD5's mode
flag; an office-quoted price path on the agent's result screen; the engine still
running and logging (L5); a tap-to-call number and a callback request on the two
screens where people get stuck (M2).

### FV7 — Tags, containers, grouping · P2 · ⛔ NOT STARTED, BY DECISION (FD11)

Not blocked any more — *declined for the pilot*. J3 still matters whenever it is
picked up: it decides whether a QR container IS the `CustodyBatch` we already
write or a parallel structure, and the wrong answer there is expensive to
unwind.

Original blocking note: J3 in particular decides whether a QR
container *is* the `CustodyBatch` we already write or a parallel structure — the
wrong answer there is expensive to unwind.

---

## §2.5 The blocking questions, answered in-house (2026-09-23)

The company came back undecided — they are still working out what each phase
looks like. Team direction (Aamir, 2026-09-23): **stop waiting, pick the simple
rational option for every blocked question, build it, and let their feedback on
a working thing drive the next round.** That is a better use of a pilot than a
questionnaire.

These are decisions **FD7–FD11**. They are OURS, not the company's — so unlike
FD0–FD6 they are explicitly *provisional*: the first contradicting instruction
from the company wins, and none of them should be defended in a meeting.

**FD7 — An offer is valid for 7 days, and acceptance freezes it.**
`OFFER_VALIDITY_DAYS` in `@clbipp/core/collection`. Derived from
`Offer.createdAt`; no column, no job, no sweeper. 🔴 **An ACCEPTED offer never
expires**, whatever the date says — the vendor agreed a price and we owe them
that price. Expiry pressures the undecided; it does not claw back the decided.
A lapsed undecided offer is *flagged*, never auto-cancelled: cancelling a
vendor's pickup because nobody rang them is a worse failure than a stale price.

**FD8 — No partial collection.** One pickup, one collection event. This is the
single largest complexity saving available: a part-collected pickup splits one
request across two custody chains, potentially two manifests and two
certificates, and AD6 (a pickup advances only when every item is covered) would
have to grow a per-item notion of "collected" that AD5 deliberately refuses. If
the company needs it, it is its own sprint, not a flag.

**FD9 — Second life is a LABEL plus a ROUTING RULE, and nothing else.**
`destinationOf()` maps the engine's four pathways onto two destinations;
`isShippableToRecycler()` keeps a second-life battery off a recycler manifest,
enforced inside `loadManifestBuildStock` so no route into manifest building can
bypass it. No refurb-partner directory (we have no list), no change to what a
certificate says (we have no compliance answer). A second-life item simply
stays at the facility, visibly, until someone tells us where it goes.

**FD10 — The engine stays ON; the agent may override the total with a reason.**
The simplest thing that keeps a human in the loop without building an
asynchronous office-quote flow. 🔴 **There is no second pricing path.** Every
item is still priced by the engine and every one of those numbers is still
written; the override changes only the TOTAL presented to the vendor, and the
engine's figure is named in `Offer.rationale` beside it. That preserves the
comparison the pilot is actually for: what we would have paid, against what we
did. Per-item prices are never back-filled from an override — spreading a
commercial decision about a whole load across individual batteries would invent
numbers nobody calculated and corrupt that comparison.

**FD11 — No physical tagging in the pilot.** Pickup id and item id already
identify everything, and the drop-off already creates a `CustodyBatch`. Until
there is a printer or a roll of pre-printed QR labels in a van, a tagging
feature is a screen that asks an agent to type a code nobody issued. FV7 stays
unstarted, and that is the decision, not a delay.

---

## §3 Ownership

Per the standing map, and per the do-it-and-note-it rule (2026-08-20) — log
actual executors in `docs/LANE_OWNERSHIP.md` rather than waiting on a lane.

| Batch | Default owner | Why |
|---|---|---|
| FV1 | C (customer screens) / B (`packages/core` schema) | read + form work |
| FV2 | B (migration, `packages/core`) + A (the action gate) | schema is B's |
| FV3 | A | it is a lifecycle write, and every lifecycle write is A's |
| FV4 | A (dispatch is A's) with C on the table composition | |
| FV5 | A (audit + override) with B on the pathway mapping | |
| FV6 | B (engine surface) with A on the mode gate | |
| FV7 | unassigned until unblocked | |

## §4 Risks

- **R1 — `offered` carrying three sub-states (FD0).** Mitigated by revisiting
  all seven `acceptedAt` readers in FV3 and by a smoke assertion per state.
  If a fourth sub-state ever appears, that is the signal that the tenth stage
  was the right answer after all.
- **R2 — Mandatory photos on a bad connection.** A warehouse basement with one
  bar makes a required upload a hard stop at the exact moment the agent needs to
  finish. Question N3 exists for this; if the answer is "yes, offline matters",
  it is scoped separately and it is not small.
- **R3 — The shared database.** One migration, `migrate deploy`, announced
  before it runs. `reset-demo` restores rows but not grants.
- **R4 — Price movement.** FV1–FV4 are price-neutral by construction; FV5 and
  FV6 are not, and must say so in their commit messages.


---

## §5 As built — FV1 and FV2 (2026-09-10, both by Aamir + Claude)

### FV1 — shipped
- `bookingLineItemSchema` requires ≥1 photo per line. `.default([])` was
  **removed**, so a payload that omits the field fails too, not just one sending
  an empty array.
- `itemError()` mirrors it for the inline message and says in a comment which of
  the two is authoritative. Checked LAST, after quantity and weight.
- The indicative quote is gone from `/book` step 4 and `/submitted`, and
  `quoteBooking` was **deleted** rather than left as a dead export.
- Still computed in `submitBooking`, still stored, relabelled **"Internal
  estimate · Not shown to the vendor"** on `/dispatch/[id]`.
- `/submitted` was **never in the smoke route list** — which is how it kept a
  price nobody re-checked. It is in now, with both halves asserted.

### FV2 — shipped
- Migration `20260910140859_feedback_v2` applied to the shared project. Seven
  nullable columns + the `WeightMethod` type. **No stage, no price, no rewrite.**
- `parseIntakeSubmission` now requires `weightMethod`; `weightDivergence()`
  owns the declared-vs-measured threshold (20% or 5 kg, whichever is LARGER —
  `max`, not `min`, so a 400 kg pallet is governed by the percentage and a
  0.4 kg laptop pack is not flagged for a 0.1 kg gap).
- `ItemConfirmForm` gained the method radio group and a **live** divergence
  prompt, worded as "worth a second look" — the two halves are allowed to
  disagree, and the disagreement is the finding.
- 🔴 **Agent photos are required on EVERY line now, not just a damaged one**,
  and `confirmItem` enforces it. The old behaviour ("save now, add it later")
  is gone. `requiresPhotoEvidence` survives, but only to decide how sharply the
  prompt is worded.
- `/pickups/[id]` shows the method and the divergence strip.
- Seed writes a method on every confirmed item — **two distinct values**, so a
  screen that only ever renders "Digital scale" is visibly wrong rather than
  plausibly right. Three new `verify-seed` checks pin all of it.

### Verification (both batches)
`npm run test` **317** (was 304) · `npm run build` 4/4 with `ƒ Proxy` ×3 ·
`npm run lint` 0 errors · `npm run verify-seed` **27/27** ·
smoke **48 + 30 + 24 = 102 routes**.

### 🔴 Incident — the shared database was wiped, and recovered

Generating the migration, `prisma migrate diff` was run with the **production
`DIRECT_URL` passed as `--shadow-database-url`**. The shadow database is scratch
space Prisma **drops and recreates**. It wiped the shared project: every row,
all 19 RLS policies, all 124 grants. Structure survived (it had just been
replayed), as did `auth.users` and Storage.

Recovered in full: `reset-demo`, then `grants.sql`, `policies.sql`,
`storage-policies.sql`, `realtime.sql` re-applied, then verified — 14 pickups,
28 items, 19 policies, 124 grants, 102 smoke routes.

**Rules taken from it:**
1. 🔴 **Never pass a real database URL as `--shadow-database-url`.** Use a
   throwaway local Postgres, or `--from-migrations`/`--to-migrations`, which
   needs no shadow at all.
2. **`migrate deploy` does not work on this project** and never did — there is
   no `_prisma_migrations` table, so it fails `P3005`. Every migration here has
   in fact been applied with `prisma db execute --file`. CLAUDE.md said to use
   `deploy`; that instruction was wrong and is corrected.
3. **A dev server can serve a stale build for days.** A `next dev` from 29
   August was still on :3000 and a smoke run tested *it*, not the working tree.
   Check `lsof -ti:3000` before trusting a green run.
4. **A long-running dev server caches the Prisma client.** After a schema
   change and `prisma generate`, restart it or every query 500s.

### FV3–FV6 — shipped (2026-09-23, Aamir + Claude)

Built together in one pass after FD7–FD11 unblocked them in-house. **No
migration**: every column these use shipped in `feedback_v2` back on 2026-09-10,
which is exactly what that batch's "one migration for three batches" note was
buying.

**New shared logic, in `packages/core` and nowhere else:**

- **`collection.ts`** — `offerState()` is the ONE reading of `offered`'s three
  sub-states. 🔴 Eight screens could have done this arithmetic themselves; the
  two-state version of this problem is already documented in CLAUDE.md as
  something seven files each had to get right, and this is what stops the
  three-state version repeating it. Also `parseCollectionDate` (validates the
  agent's chosen date server-side — the form is not the boundary), and
  `isFutureCollection`, which compares **calendar days, not elapsed hours**: an
  agent booking "tomorrow" at 9am on a Monday evening means Tuesday, and a
  24-hour comparison calls that today for another fourteen hours.
- **`pathway.ts`** — `destinationOf()` (4 engine pathways → 2 destinations) and
  🔴 `isShippableToRecycler()`, the routing rule. ⚠ `dispose` maps to
  **Recycling**, not a third bucket. ⚠ An item with **no** pathway (every
  flat-rate line) **is** shippable — filtering on a truthy pathway there would
  silently drop half the stock, which is CLAUDE.md's `trace_id` trap wearing a
  different hat.

**FV3 — inspection ≠ collection.** `scheduleCollection` in the agent app's
`job/[id]/actions.ts` writes `collection_scheduled_at` and a `status_events`
row **carrying the current status** — an event recording a fact, not a
transition. Writing anything else there would invent a tenth stage through the
back door. `/job/[id]/offer` presents "Collect today" or a date picker;
`inspectedAt` is stamped at offer presentation (the inspection is complete at
exactly that moment — every item confirmed, scored and priced) and `collectedAt`
inside the existing collection transaction. The agent day view gained a third
list, **"Booked for later"**, because `isTodaysWork` ≠ `isActiveJob`: a pickup
booked for next Tuesday is still the agent's job and still theirs alone, but
putting it in the "needs you now" count makes that count a liar. The vendor sees
the date on `/handover`.

**FV4 — the dispatch board.** Now reads the whole live pipeline
(`requested → offered`) and hands it to `DispatchBoard`, which composes the
**existing** `DataTable` + `FilterChips` — the swap the old screen's own comment
asked for once the console kit landed. Buckets are operational
(*Needs an agent · Assigned · On site · Booked for later*), not the nine
lifecycle stages, because a dispatcher thinks in work. Default view is still the
unassigned queue, so the screen opens on the rows it always did. 🔴 It still does
**not** filter on `agentId: null` — trap 11, seed fixture 8. Agent workload from
`liveJobCounts()` is now on the board as well as the assign screen (feedback
§2.2), same single definition.

**FV5 — Second Life vs Recycling.** The two-way destination on
`/pickups/[id]`, and `setItemPathway` — an admin override with a **mandatory**
reason and an `item.pathway` `AdminAudit` row. ⚠ Distinct from
`exception.resolve` on purpose: that one says *the engine's flag was wrong* and
advances nothing; this says *the engine's verdict was wrong* and changes where
the battery physically goes. Locked past `tested` — by then the pathway is part
of the record a certificate is built from. The routing rule lives in
`loadManifestBuildStock`, **not** in the picker, so no route into manifest
building can bypass it (same posture as AD7).

**FV6 — the human step.** `presentOffer` takes an optional
`{ totalPaise, reason }`. 🔴 **Not a second pricing path**: the engine still
runs, every item is still priced and stored, and the engine's own total is named
in `Offer.rationale` beside the adjusted one — which is what preserves the
comparison the pilot exists to produce. Guard rails: whole paise, a reason of
10+ characters, and a 10× rail that catches a misplaced decimal typed in front
of a waiting vendor. ⚠ Per-item prices are **never** back-filled from an
override. A "call the office" button sits on the agent's offer screen and
"Talk to us about this offer" on the vendor's, both behind
`NEXT_PUBLIC_OFFICE_PHONE` and both absent when it is unset — a dead `tel:` link
is worse than none, and the company has not given us a number (question M1).

**Verified:** `npm run build` green on all three apps with
`ƒ Proxy (Middleware)` on each · `npm run lint` **0 errors, 0 warnings** (the
two long-standing unused-import warnings were cleared in passing) ·
`npm run test` **342 passing**, up from 317 — 25 new across `collection.test.ts`
(15) and `pathway.test.ts` (10).

🔴 **NOT verified through the real HTTP path.** The shared Supabase project was
unreachable for the whole of this session — see the incident note below — so
`npm run smoke` and `npm run verify-seed` could not run. **Run all three smokes
and `verify-seed` before pushing.**

---

## §6 Incident — the shared Supabase project is PAUSED (2026-09-23)

Discovered when `npm run smoke` failed to resolve the project's API hostname.

- `xlssgnnrtautldouirkt.supabase.co` → **NXDOMAIN**, from the local resolver and
  from `8.8.8.8` alike. General DNS was fine throughout (`google.com` resolved).
- `aws-1-ap-southeast-2.pooler.supabase.com` **does** resolve, but Postgres
  refuses the connection on both 6543 and 5432.
- Last database activity: **2026-09-10**. Thirteen days.

That pattern — API subdomain withdrawn from DNS, database refusing connections,
after more than seven idle days — is Supabase's **free-tier inactivity pause**.

🔴 **Nothing in this session caused it.** No migration was applied, no
destructive command was run, and the FV3–FV6 work touched no database. It is
also NOT a recurrence of the 2026-09-10 wipe: that was a shadow-database
mistake, the data was restored the same day, and a paused project **retains its
data**.

**Recovery is a dashboard action nobody can do from the CLI**: open the project
at supabase.com and restore it. Then, in order — `npm run reset-demo`,
re-apply `grants.sql` / `policies.sql` / `storage-policies.sql` / `realtime.sql`
(⚠ a reseed restores rows, never grants or policies), `npm run verify-seed`, and
all three smokes.

**The standing lesson**: a free-tier project pauses after a week of quiet, and
this repo's verification story — `smoke` and `verify-seed` — depends entirely on
it being awake. A week off over a holiday will do this again. Anyone picking the
project up after a gap should expect it and restore first, rather than debugging
a DNS error.


---

## §7 FV8 — the ranked agent selector (2026-09-23)

Source: `docs/field agent selection.txt`, sent by the company. It expands **§2.2**
of the feedback document, which until now was satisfied only in its weakest
form — a live-job count in a dropdown label.

The complaint, verbatim: *"when Admin assigns a pickup to a field agent, the
dropdown essentially just provides the agent's name."*

**Three signals, in the order the notes' own flowchart puts them:**

1. **Availability** — can they realistically take it that day?
2. **Workload** — today's jobs *and* total live jobs, shown separately, because
   *"four jobs spread over several days are very different from four jobs
   scheduled this afternoon."*
3. **Proximity** — straight-line km from their last known position.

**Where the logic lives.** `packages/core/src/dispatch-ranking.ts` — pure,
19 tests, no Prisma. `apps/admin/src/lib/agent-selection.ts` fetches;
`AgentSelector.tsx` renders. 🔴 **"Live" is NOT redefined**: the count comes from
`LIVE_JOB_STATUSES` in `lib/job-load.ts`, the one definition already shared with
`/agents` and the dispatch board — which is precisely what the notes ask for
("follow CLBIPP's existing lifecycle rather than creating a second definition of
lifecycle just for dispatch").

🔴 **Distance is the LAST tie-breaker, never the first sort.** The notes name
both failure modes and both are pinned by a test: an unavailable agent must not
top the list for being closest, and an agent 1.2 km away with four jobs booked
must not beat one 3 km away with none.

🔴 **Decision support, never auto-assignment.** Nothing is pre-selected; the top
row is badged *Nearest available*, not chosen. The notes are explicit: never
"Assign Ali", always "Ali — Available • 2 live jobs • 2.4 km away".

**Location — Phase 2 of the notes, not Phase 3.** There is no continuous
tracking and none is promised. The agent app already writes `lat`/`lng` onto
`status_events` at Arrived and at collection, so the most recent such row *is*
the last place we genuinely know an agent was, with a real timestamp. **No new
column, no new tracking.** Age is always shown and anything over
`LOCATION_STALE_MINUTES` (30) is marked — *"a location from two hours ago
shouldn't be presented as though it were live."*

⚠ **Availability is derived only from what we can honestly know.** The notes
describe off-duty agents and working-hours windows; this codebase has **no shift
model, no working hours and no duty roster**, and inventing one would be a
screen asserting a fact nobody recorded. So `unavailable` means the one thing we
do know — no `safetyTrainedAt`, which means `requireSafetyChecklist` will block
every intake screen and the job would sit undoable. `busy` is derived from jobs
already booked for the target day. **Shift management is on the notes' own
later-enhancements list; `availabilityOf()` is where it goes when it lands.**

**Edge cases, all five from the notes:** no location → still assignable, shown
as "location unknown" · stale location → shown with its age, never as live ·
no available agents → all agents still listed with reasons · agent becomes
unavailable → surfaced on the row · 🔴 **two admins assigning at once →
`agentStateAtConfirm()` re-reads the agent at the moment of the write**, not
from the list rendered minutes earlier. ⚠ That re-check **refuses only on the
safety gate** — a full day is reported, not blocked, because the notes are clear
an admin may legitimately override workload.

**Verified:** build green on all three apps with `ƒ Proxy (Middleware)` ·
lint 0 errors 0 warnings · **361 tests** (19 new) · `verify-seed` 27/27 ·
smoke **48 + 30 + 24 = 102 routes**, with new assertions on `/dispatch` and
`/dispatch/[id]` that prove the ranked rows render off real agent data rather
than a heading.

**Not built, and deliberately** — the notes' own "later enhancement" list:
working-hours/shift management, geographic zones, travel time instead of
straight-line distance, vehicle capacity, route-aware assignment, automated
recommendation, multi-pickup route optimisation.

---

## §8 What FV8 deliberately does NOT do — and what to build when asked

🔴 **Read this before answering "why doesn't dispatch show who's off today".**
Expect that question. The company's own notes describe off-duty agents and
working-hours windows, and the example UI in
`docs/field agent selection.txt` shows `Ramesh — Unavailable today`. We built
everything around that and then derived availability from something narrower,
**on purpose and for one reason: the data does not exist.**

This section is the answer to "why not", and the shape of the fix.

### 8.1 The gap, stated plainly

`availabilityOf()` in `packages/core/src/dispatch-ranking.ts` returns
`unavailable` for exactly one condition — **no `safetyTrainedAt`** — because
that is the only thing in this database that genuinely stops an agent working a
job (`requireSafetyChecklist` blocks every intake screen, so the job would sit
undoable).

It does **not** know about:

| The notes ask for | Why it isn't there |
|---|---|
| "Off duty" / "Unavailable today" | No duty state, anywhere. `Profile` has `agentZone`, `agentVehicle`, `agentRating`, `safetyTrainedAt` — and nothing about whether someone is working today. |
| Working hours (`09:00 – 18:00`) | Not modelled. |
| "Agent has another job at 13:00" | We count jobs **per day**, not per time window — so we can say "3 jobs that day", never "conflicts with the 13:00". |
| Leave / sick / rest days | Not modelled. |

🔴 **Inventing any of this in a screen would be worse than the gap.** A console
that says "Available" because nobody recorded otherwise is asserting a fact
nobody knows — and a dispatcher who trusts it once and sends an agent out on
their day off will not trust the screen again.

### 8.2 What to build, smallest first

**Step 1 — a duty flag (half a day).** The 80% answer. One enum on `Profile`:

```prisma
enum DutyStatus { on_duty  off_duty }
dutyStatus DutyStatus @default(on_duty) @map("duty_status")
```

Toggled by an admin from `/agents` (that screen is read-only today and is the
natural home). `availabilityOf()` gains one branch above the safety check, and
`UnavailabilityReason` gains `off_duty`. **Every consumer already handles an
`unavailable` agent** — ranked last, shown disabled, reason displayed — so the
UI needs no change at all. That is the whole point of routing every availability
question through one function.

**Step 2 — working hours (a day).** `workingHoursStart` / `workingHoursEnd` on
`Profile`, compared against the slot the dispatcher picked. Produces
"outside 09:00–18:00" as a `busy` reason rather than a block, matching the
notes' insistence that an admin may override.

**Step 3 — time-window conflicts (a day).** The real version of the notes'
`13:30 vs 13:00` example. `rankedAgentsFor()` already loads that day's pickups;
it currently counts them. Return their `scheduledSlot` times instead and
overlap-test against the proposed slot. ⚠ Needs a job-duration assumption —
`Pickup.etaMinutes` exists and is the honest source.

**Step 4 — a roster.** Only if they ask. A per-agent per-date table
(`AgentShift`) is the real answer to leave and rest days, and it is a schema of
its own. Do not start here.

🔴 **Steps 1–3 all land in `availabilityOf()` and `rankedAgentsFor()`.** Nothing
else moves: not the ranker, not `AgentSelector.tsx`, not the assign action. The
boundary was drawn for this.

### 8.3 Also on the notes' own "later enhancement" list, also not built

Geographic zones (⚠ `Profile.agentZone` **exists and is displayed but does not
affect ranking**) · travel time instead of straight-line distance · vehicle
capacity · route-aware assignment · multi-pickup route optimisation · Phase 3
live tracking.

🔴 **"Automated recommended agent" is on that list and we will NOT be building
it without an explicit instruction.** The notes are emphatic in the opposite
direction — *"don't automatically assign the agent"*, *"let the dispatcher make
the final choice"* — so auto-assignment would contradict the same document that
lists it. If it is ever asked for, confirm it means "pre-select the top row",
not "assign without a human".

### 8.4 One edge case handled weakly

**"Agent becomes unavailable after assignment"** (notes, edge case 4). The notes
want a warning or exception the admin can act on. Today the state is *visible*
— a stale or overloaded agent shows on the dispatch board and on the pickup —
but **nothing raises it proactively**. There is an `ItemException` model for
engine flags and no equivalent for dispatch. Worth doing alongside Step 1, since
a duty flag is what makes "became unavailable" detectable in the first place.
