# Plan — Presentation Feedback (FV1–FV16)

Source: `docs/CLBIPP_Presentation_Feedback_Changes.docx` (eleven changes, P0–P2)
plus the pilot-run conversation of 2026-09-09 (engine may be off for the pilot;
they want a human step retained), plus `docs/field agent selection.txt` (the
company's expansion of §2.2 into a ranked agent selector).

Decisions here are numbered **FD0–FD19** and follow the same rule as AD0–AD12:
once settled, not re-litigated mid-build. Note the collision hazard the repo
already warns about — quote the decision with its set (**FD**, not AD or D).
⚠ **FD0–FD6 are settled. FD7–FD19 are OURS and provisional** — see §2.5 and §9.2.

---

## STATE AS OF 2026-09-27 (evening) — read this first

**Every change in the feedback document is built.** P0 and P1 shipped by
2026-09-23 (FV1–FV8, live). On 2026-09-27 the company moved to an iterative
loop — "build something, we react" — so the remainder was built in one pass as
**FV9–FV16** (§9 plan, §10 as built): battery tags, QR transport boxes,
same-day collection runs, hub check-in, second life routed to a refurbisher,
the optional dispatch filters, the scale-reading photo, and the duty flag.

| | |
|---|---|
| §1 Core workflow (all 5) | ✅ FV1, FV2, FV3 (+ FV10's scale photo) |
| §2.1 Dispatch filters + sorting | ✅ FV4 + FV14 (type, size, priority) |
| §2.2 Live job count → ranked selector | ✅ FV8 + FV15 (off duty) |
| §3 Agent inspection + pickup | ✅ FV2, FV3, FV10 |
| §4.1 QR transport boxes | ✅ FV11 |
| §4.2 Battery tags + facility reconciliation | ✅ FV10 + FV12 |
| §4.3 Same-day nearby grouping | ✅ FV11 |
| §5 Second Life / Recycling | ✅ FV5 + FV13 (a destination) |
| §6 Revised workflow, steps 1–12 | ✅ every step has a screen |

**The things a fresh session should know:**

1. 🔴 **FV9–FV16 are verified locally, NOT pushed.** The migration IS applied
   to the shared project (additive — the live apps run fine on it). Pushing is
   Aamir's call; `docs/BEFORE_YOU_PUSH.md` applies, and after the push run the
   three production smokes.
2. 🔴 **FD7–FD19 are our provisional calls, not the company's answers** (§2.5,
   §9.2). Don't defend them in a meeting; the first contradicting instruction
   wins. FD12 reversed FD11.
3. ⚠ **The manual pass has not happened** — cameras on real phones, a printed
   sticker sheet, a USB scanner at the hub desk. `docs/MANUAL_TEST_QUEUE.md`
   has the checklist.
4. **Expect the next conversation to be their reaction** to the new logistics
   screens. The cheapest likely asks are in §10's "Still not built" list.

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

### FV7 — Tags, containers, grouping · P2 · ➡️ SUPERSEDED by FV10–FV12 (2026-09-27)

⚠ Historical. FD11 declined this for the pilot; FD12 reversed that on
2026-09-27 and it was built as FV10 (tags), FV11 (boxes + runs) and FV12 (hub
check-in). J3 was answered: a box is NOT the `CustodyBatch` (FD14). See §9–§10.
The original note follows.

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

**FD11 — No physical tagging in the pilot.** ➡️ *Reversed by FD12 on
2026-09-27: the office prints tag sheets on sticker stock, so no printer is
needed in the van.* Pickup id and item id already
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

---

## §9 Completing the document — FV9–FV16 (planned 2026-09-27)

**Why this section exists.** On 2026-09-27 the company switched to an iterative
approach: they will not specify §4 and §5 in advance; we build something
reasonable, they react, we fold the reaction in. Team direction (Aamir): **finish
every change in the feedback document now**, make sensible product calls where
detail is missing, and make sure it all works. That reverses FD11 (no tagging in
the pilot) and completes FD9 (second life was a label with no destination).

### 9.1 What was still open, measured against the document

| Doc § | Ask | State on 2026-09-27 | Batch |
|---|---|---|---|
| 3.1 | "allow a photograph showing the battery and the scale reading" | `weightPhotoUrl` column exists since FV2 — **nothing writes or reads it** | FV10 |
| 2.1 | "optionally filter by battery quantity/type and operational priority" | not built | FV14 |
| 4.1 | QR-tracked reusable transport boxes, scanned at the start of a run | not built (FD11) | FV11 |
| 4.2 | a tag per battery / lot, linked to pickup, item and box; reconciled at the facility | not built (FD11) | FV10, FV12 |
| 4.3 | group nearby same-day pickups into one run, one agent, one vehicle | not built (FD11) | FV11 |
| 5 | "route the battery to the appropriate second-life process/facility" | label + a rule that keeps it OFF recycler manifests — and **no destination at all** | FV13 |
| 6 step 10 | "the facility scans and reconciles the received batteries" | not built — `collected → tested` is one click | FV12 |
| 6 step 12 | chain-of-custody records updated | agent's `/dropoff/[batchId]` is **still the Batch 0b stub** ("Not built yet"); the custody PDF prints the facility's **uuid** as its name, reads the superseded `approxWeightKg`, labels an item count "Pickups in batch", and uploads twice | FV12 |

🔴 **A real defect found while planning, not just a gap.** FV5 keeps a
second-life item off every recycler manifest — correctly — but AD6 advances a
pickup past `tested` only when EVERY item is covered by a manifest. Nothing can
ever cover a second-life item, so **a pickup holding one second-life line could
never advance again** except by the manual override. It never showed because the
seed sets every item to `recycle`. FV13 is its fix.

### 9.2 Decisions FD12–FD19 — OURS, and provisional

Same standing as FD7–FD11 (§2.5): taken in-house because the company asked us to
propose rather than wait, **the first contradicting instruction from them wins**,
and none should be defended in a meeting as their requirement.

**FD12 — Tags are pre-issued by the office, one per battery LINE, bound at
collection.** The console mints codes (`TG-` + 6 Crockford base-32 characters + a
check character, so a mistyped code is rejected rather than bound) and prints
them as an A4 sticker sheet on any office printer. That dissolves FD11's
objection — nobody needs a printer in the van, only a sheet in the glovebox. One
tag per `BatteryItem` because a line IS the lot in this data model (there is no
per-unit row); a 14-battery line is strapped or crated and tagged as a lot, which
is exactly the document's "or an operationally appropriate battery lot".

**FD13 — Tagging is mandatory at collection, with a recorded way out.** Every
line is tagged, or marked "no tag available" with a typed reason; the hub then
tags that line on receipt. Never a hard stop in front of a waiting vendor — the
same posture as `weightMethod: estimated` (FD3) and risk R2.

**FD14 — A transport box is a permanent registered object; a collection run is
a dispatcher's same-day grouping; NEITHER is the `CustodyBatch`** (this is J3's
answer). A custody batch is a hand-off EVENT at a hub. A box is reusable and does
many runs; one drop-off can empty several boxes. They are linked through the
items (each tag records the box its line went into), never merged. The agent
scans a box to start a run; the drop-off that leaves no stop to visit completes
the run and frees the box (a mid-run drop-off keeps both).

**FD15 — Hub check-in gates `collected → tested`.** A pickup advances only when
every one of its lines has been checked in at the hub — scanned, tagged at
receipt, or confirmed by hand with a reason. A line declared missing HOLDS its
pickup. This is AD6's posture ("every item, or not at all") applied one edge
earlier. Manual paths write an `AdminAudit` row with a mandatory reason; a scan
does not (the check row itself records who and when).

**FD16 — Runs are decision support, never automation.** The board SUGGESTS
same-day groups — same date, within 8 km straight-line, city as the fallback
when an address has no coordinates — and a dispatcher builds the run. Stop order
is a nearest-neighbour suggestion, not route optimisation, and says so. Nothing
is auto-assigned (FV8's rule stands). Max 8 stops.

**FD17 — Second life gets a destination: a downstream partner has a KIND.**
`Recycler.kind` is `recycler | refurbisher`. A second-life item ships on a
manifest to a refurbisher; a recycling (or unrouted flat-rate) item to a
recycler — enforced in the ACTION, not the picker (AD7's posture). The existing
manifest lifecycle (dispatch → received → reconciled) carries both, so AD6
coverage works for second life with no new machinery. A refurbisher
reconciliation records an outcome note, not recovered metals, and **the
certificate states second-life mass separately and never counts it as recovered
material** — the estimate fallback is scaled to the recycled share only.

**FD18 — Dispatch priority is derived, never stored.** `urgent` = a declared
swollen or leaking line (a thermal risk sitting at a vendor's site) · `high` =
waiting ≥ 3 days, or its date is today or past · `normal` otherwise.

**FD19 — Duty status is one admin-set flag** (§8, Step 1 — built now because
the iterative loop will put dispatch in front of them again). Off duty =
`unavailable` through `availabilityOf()`, shown disabled with its reason, and
refused at assignment. No working hours, no roster (§8 Steps 2–4 still unbuilt).

### 9.3 Batches

One migration for the whole set (`feedback_logistics`), additive only: new
tables and enums, nullable columns or NOT NULL with a default, **no value added
to an existing enum** — so the deployed apps keep working against the migrated
database until the code is pushed. RLS is enabled on every new table INSIDE the
migration (grants.sql hands `anon` SELECT on every future table) and restated in
`policies.sql`.

| Batch | What | Doc § |
|---|---|---|
| **FV9** | Migration + shared pure logic in `packages/core` (tags, run planning, priority, hub check-in, partner kind, duty) with tests | — |
| **FV10** | Tags: issue + print (admin `/tags`), camera QR scan + bind at collection (agent), scale-reading photo, tag codes on the vendor's receipt | 3.1, 4.2 |
| **FV11** | Boxes (admin `/containers`), runs (`/runs`, `/runs/new`, `/runs/[id]`), same-day suggestions on `/dispatch`; agent `/run/[id]` (scan a box to start) and a run card on the day view; the drop-off that leaves no stop to visit completes the run and frees its boxes | 4.1, 4.3 |
| **FV12** | Hub check-in (`/custody/[batchId]`) gating `collected → tested`; agent `/dropoff/[batchId]` built; custody PDF fixed and extended with boxes + tags | 4.2, 6.10, 6.12 |
| **FV13** | Refurbisher partners; manifests routed by partner kind; certificate second-life mass | 5 |
| **FV14** | Dispatch filters: battery type, load size, priority (+ priority column) | 2.1 |
| **FV15** | Duty status on `/agents`, through `availabilityOf()` | 2.2 / §8 |
| **FV16** | Seed, `verify-seed`, `demo-stage --reset`, smoke; docs | — |

**Verification plan:** `npm run test` · `npm run build` · `npm run lint` ·
reseed + `verify-seed` · all three smokes · every new POST action driven through
the real HTTP path by a throwaway harness (the Batch 3/6/7 technique) · reseed
again to leave the shared project clean.

---

## §10 As built — FV9–FV16 (2026-09-27, Aamir + Claude)

All eight batches of §9 were built in one pass. Everything the feedback
document asks for now exists on a screen; FD12–FD19 (§9.2) are the calls made
where it was silent.

### What each batch shipped

**FV9 — migration + shared logic.** `20260927120000_feedback_logistics`:
five enums, five tables, seven columns, all additive, RLS enabled inside the
migration. Generated with `migrate diff --from-schema-datamodel <HEAD's schema>
--to-schema-datamodel` — two files in, SQL out, **no database and no shadow** —
and applied with `db execute`. New pure modules in `packages/core`, each with
tests and a subpath export: `tags` (codes, check character, `parseCode`),
`run-planning` (`suggestRunGroups`, `orderStops`, `runStopEligibility`),
`dispatch-priority`, `custody-check`; plus `isShippableTo` in `pathway`, the
`off_duty` branch in `availabilityOf`, seven new audit verbs, and `secondLifeKg`
in `buildCertificatePayload`.

**FV10 — tags (§4.2) + the scale photo (§3.1).**
- Admin `/tags`: issue a sheet (1–240), download it as an A4 3 × 8 sticker PDF
  (`/api/labels/tags`, QR drawn as vectors from `qrcode`), and look any code up
  — tag → line → pickup → box → run → hub check-in.
- Agent collect screen: **Tag the load** — one card per line with a camera scan
  (`components/qr-scanner.tsx`: native `BarcodeDetector`, lazy `jsqr` fallback)
  or typed entry; "No tag available?" records a reason (FD13).
  `confirmCollection` refuses a line that is neither. The collected status event
  names the tags. A line left untagged can still be tagged from the receipt
  until drop-off.
- The vendor's receipt PDF lists each line's tag.
- `ItemConfirmForm`: an optional "photo of the scale reading" for a scale or
  label weight, worded harder when the weight diverges from the declaration;
  dropped for an `estimated` weight. Shown on the admin pickup screen, and a
  divergence with no photo says so.

**FV11 — boxes (§4.1) + same-day runs (§4.3).**
- Admin `/containers`: register (code minted, permanent), print labels, retire —
  refused while the box is on an open run.
- `/dispatch` suggests **same-day groups** of unassigned requests within 8 km
  (city fallback), each with **Plan a run** → `/runs/new` (date, ticked stops,
  FV8's ranked agent list centred on the stops, start time, gap, vehicle).
  `createCollectionRun` re-checks every stop with the same rule, assigns the
  `requested` ones exactly as `/dispatch` would, and writes `run.create` + one
  `pickup.assign` per stop. `/runs` and `/runs/[id]` are the run sheets; a
  planned run can be cancelled (stops keep their agent).
- Agent: a run card on the day view; `/run/[id]` — scan a box to start, stops in
  suggested order, finish an empty run. Tags bound on a run record the loaded
  box. A drop-off completes the run and frees its boxes only when no stop is
  left to visit and nothing is in the van; a mid-run drop-off keeps the run
  open with its boxes on it (caught by the harness 2026-09-27 — the first
  version closed the run as soon as the van was empty, stranding stop 102).
- A single `/dispatch` assignment and a vendor reschedule both take a pickup off
  any run.

**FV12 — hub check-in (§4.2, §6 step 10) + the custody record (§6 step 12).**
- Admin `/custody/[batchId]`: every line of a hand-off, a scan field
  (keyboard-wedge USB scanners work as-is), **Tag now** for an untagged line,
  **Record by hand** (received / missing, reason required, audit row).
- `advanceCustodyBatch` advances only fully checked-in pickups; `/lifecycle`
  shows `Check in n/m` per batch.
- Agent `/dropoff/[batchId]` **built** — it was Batch 7b's stub ("Not built
  yet"), and every real drop-off had been redirecting to it.
- Custody PDF rebuilt: facility name (was its UUID), agent name (was an email),
  per-line weights (was a superseded column), tags and boxes per line; cached in
  the `receipts` bucket (the `documents` bucket it used never existed, so every
  download re-rendered).

**FV13 — second life to a refurbisher (§5).** `Recycler.kind`; the manifest
builder's step 0 is the destination; `createManifest` / `dispatchManifest`
enforce `isShippableTo`; a refurbisher reconciliation takes an outcome note and
never metals (even from a crafted POST); the certificate shows a SECOND LIFE
line and claims no metal for it. `/facilities` shows the kind.

**FV14 — dispatch filters (§2.1).** Battery type, load size (declared kg bands)
and priority (FD18) filters, a sortable priority column with its reason, a run
badge on rows, and an "Urgent — declared hazard" tile.

**FV15 — duty (§8 Step 1).** `/agents` toggles on/off duty (`agent.duty` audit);
the selector shows **Unavailable · Off duty**; `assignPickup` and
`createCollectionRun` refuse.

**FV16 — seed, checks, tooling.** Seed: `agent2@test` (Neha Verma, on duty) and
`agent3@test` (Mohit Sharma, off duty); per-site vendor addresses with real
coordinates for the requested fixtures; **fixture 9** (`PKP-2026-000115`, the
same-day partner of 101) and **fixture 10** (`PKP-2026-000116`, second-life
stock on no manifest); a refurbisher; four boxes; a 48-tag sheet with 13 bound;
105's second line untagged with a reason; every line in CB-2026-000301 checked
in; run `RUN-…-5EED` under way. `verify-seed` gained checks for each of those.
`demo-stage --reset` now also clears tags, check-ins, run membership, FV2/FV3
columns — and the collection receipt, whose unique `pickupId` previously made a
reset pickup impossible to collect again.

### Defects found and fixed on the way

1. 🔴 **A pickup with any second-life line could never advance past `tested`**
   (FV5 kept the line off recycler manifests; AD6 needs every line on one).
2. 🔴 **`/dropoff/[batchId]` was a stub** that every real drop-off landed on.
3. The custody PDF printed a UUID as the facility, an email as the agent, null
   weights, "Pickups in batch" over an item count, uploaded twice, and cached to
   a bucket that does not exist.
4. `demo-stage --reset` left the `PickupReceipt`, so the reset pickup could not
   be collected again.
5. `weightPhotoUrl` (FV2) had a column and no screen.

### Verification

All run 2026-09-27 against the shared project, on `next dev`:

| Check | Result |
|---|---|
| `npm run test` | **420 passing** (core 353, auth 40, engine 27) |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | 3/3 apps, `ƒ Proxy (Middleware)` on each |
| `npm run verify-seed` | **38/38** (11 new checks for FV9–FV16) |
| `npm run smoke` | admin 31/31 · agent 32/32 · customer 48/48 = **111 routes** (was 102) |
| Role gates | all six wrong-role pairings bounce; agent3@test (off duty) barred from admin |
| HTTP harness (real session cookies, real server actions) | **73 checks, all passing** (44 in run 2 up to the drop-off, where it caught the defect below; 29 in the resumed run, covering hub check-in, second life, the scale photo and the fix itself) |

The harness drove every new write through the real HTTP path: tag issue +
label PDF, box register/retire, duty toggle, dispatch + run builder refusing an
off-duty agent, run build (2 × `pickup.assign` + `run.create`), box loading and
run finishing, collection refused with untagged lines, check-character rejection,
tag normalisation, hub drop-off + custody PDF (cached in `receipts`), hub
check-in (box code / foreign batch / never-bound tag all refused), by-hand
`custody.reconcile`, partial advance holding a short pickup, second life →
refurbisher (both mismatches refused), reconcile with an outcome note and no
metals, certificate with `secondLifeKg` 180 and no materials, the scale photo.

**Flags from verification:**

- 🔴 **Defect found and fixed: a hub drop-off closed the run as soon as the van
  was empty**, even with a stop still unvisited (seeded 102) — and freed its
  boxes. Now the run completes only when no stop is left to visit AND nothing is
  in the van; a mid-run drop-off keeps the run open with its boxes on it. The
  agent can still end a run with nothing in the van from `/run/[id]`.
- ⚠ **Long-lived dev servers exhausted the connection pool.** Harness run 1
  died at step A3 with P1017 ("Server has closed the connection") after dev
  servers had been up for hours; even a one-row update hung. Restarting them
  fixed it. If a demo machine starts timing out, restart the servers first.
- ⚠ **`reset-demo` takes 10+ minutes** and must not be wrapped in a timeout
  (added to `BEFORE_YOU_PUSH.md` §3).
- ⚠ Remote Supabase answered in 5–16 s per server action on the day — slow,
  not broken.
- The Turbopack `export *` warning from the generated Prisma client is
  pre-existing and harmless.
- Not covered by the HTTP harness: the FV6 price override and the FV3
  collection-date flows (unit-tested and smoke-rendered only). Camera scanning
  (`QrScanner`) is in `MANUAL_TEST_QUEUE.md` — a script cannot hold a phone.

### Still not built, deliberately

Working hours / per-day roster (§8 Steps 2–4) · route optimisation and travel
time (straight-line nearest-neighbour only, and the screens say so) · a
refurb-partner *directory* editor (partners come from the seed, like recyclers)
· voiding a damaged tag · per-unit tracking inside a line (one tag per line is
FD12) · agent self-service duty toggling · an offline queue for scans.
