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
| 1 | Mandatory customer battery photos | P0 | Optional (`StepItems`, max 6/line) | Small — form + schema gate |
| 2 | Remove preliminary estimated offer | P0 | Shown on `/book` step 4 and `/submitted` | Small — remove two renders, keep the column |
| 3 | Mandatory agent inspection photos | P0 | Optional (`agentPhotoUrls`, max 8/line) | Small — action + form gate |
| 4 | Separate inspection from collection | P0 | **Not modelled.** One visit, `offered → collected` | **Largest change in the set** |
| 5 | Verified battery weight | P0 | `confirmedWeightKg` exists and prices; **no method, no evidence** | Migration + form |
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

### FV1 — Customer evidence + estimate removal · P0-1, P0-2 · no migration

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

### FV2 — Agent evidence + verified weight · P0-3, P0-5 · **one migration**

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

### FV3 — Inspection separated from collection · P0-4 · no further migration

🔴 **BLOCKED on D1, D3, D5.** D5 in particular: if partial collection is in
scope this batch is not this batch.

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

### FV4 — Dispatch board: filters, sorting, workload · P1-6, P1-7

🔴 **BLOCKED on F1** (what "service area" means). Everything else can start.

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

### FV5 — Second Life / Recycling, operationally · P1-8 · **price-capable**

🔴 **BLOCKED on H1, H2, H3** for anything involving a destination. What can be
built without them:

- `packages/core/src/pathway.ts` — FD4's mapping, plus labels. One home.
- Admin can set/override an item's pathway with a mandatory reason →
  `AdminAudit` row via `ADMIN_AUDIT_ACTIONS` (a new `item.pathway` action, added
  to the closed set, never a bare string).
- The Second Life / Recycling split shown on `/lifecycle`, `/pickups/[id]` and
  the dashboard.
- **Not built:** second-life routing, a refurb-partner directory, or any change
  to what the certificate says. All three wait on H2/H3.

### FV6 — Pilot mode: manual pricing and the human step · **price-capable**

🔴 **BLOCKED on L1, L3.** Scoped, not started. Shape if confirmed: FD5's mode
flag; an office-quoted price path on the agent's result screen; the engine still
running and logging (L5); a tap-to-call number and a callback request on the two
screens where people get stuck (M2).

### FV7 — Tags, containers, grouping · P2

🔴 **BLOCKED on I1, J3, K1.** Not started. J3 in particular decides whether a QR
container *is* the `CustodyBatch` we already write or a parallel structure — the
wrong answer there is expensive to unwind.

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
