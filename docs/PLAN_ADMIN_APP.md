# Plan — Admin Console (`apps/admin`)

**Written 2026-08-25.** The third and final surface. One week.

> **What this file is:** the *why* — the wireframe assessment (§0), the settled
> decisions **AD0–AD12** (§1), the screen map (§2), the schema delta (§3), lanes
> and the day-by-day (§4), risks and the pre-agreed cut list (§5), and the open
> questions this sprint adds (§6).
>
> **What to build, step by step, is `docs/ADMIN_TASKS.md`.** Read that second.
>
> **Decisions AD0–AD12 are settled. Do not re-litigate them mid-build.**

---

## The one-paragraph version

The vendor app *requests*, the agent app *assesses and collects*, and the admin
console is where the company **sets the rules both of them run on, dispatches
work, and turns recovered material into a filed EPR return**. It is also the
only surface that can close the two holes that have been open since the project
started: **nothing writes `requested → scheduled`** (so a real booking never
reaches an agent), and **nothing writes any stage past `collected`** (so a real
collection never becomes a certificate). Closing those is P0. Everything else —
engine config, exceptions, analytics — is oversight, and comes after.

---

## §0 · Wireframe assessment — `docs/CLBIPP_AdminWireframes_V1.html`

**Verdict: keep it as the layout source. Do not redo it.** The IA is sound, the
design system matches the other two surfaces byte for byte, it uses the real
nine-stage enum, and it gets the visibility inversion right. But it is **not a
build spec**: it is missing the two screens the demo actually needs, it is
organised around the wrong noun, and its flagship screen is mostly unbacked.

**Twelve defects. Every one is resolved below — read this section before
building from the wireframe.** (Same protocol as §0 of `PLAN_FIELD_AGENT_APP.md`.)

### 🔴 Structural

**W1 — There is no dispatch screen.** No screen in the wireframe writes
`requested → scheduled` or sets `Pickup.agentId`. The sidebar reads Overview /
Quote Queue / Inventory / Traceability — and a *quote* queue is not a *pickup*
queue. This is the hole `CLAUDE.md` flags in red and that `npm run assign-job`
is the CLI stopgap for. **Without this screen the demo cannot start.**
→ **Resolved: two new screens, B02 `/dispatch` and B03 `/dispatch/[id]`, and
they are the first thing built after the scaffold** (AD1, Batch 3).

**W2 — The wireframe is quote-centric; the product is pickup-centric.** Every
table is keyed on `trace_id`. Two consequences:
- `trace_id` exists **only for li-ion items that went through the engine** (D1).
  Lead-acid is priced off `PricingRate` and has no trace at all — so the Quote
  Queue silently drops roughly half the seeded data.
- There is **no pickups screen anywhere**. Admin is the only role with no way to
  look at a pickup as a pickup. Traceability even reads "PKP-2026-004821 · item
  2 of 3" with no route to items 1 and 3.

→ **Resolved (AD1):** `/pickups` + `/pickups/[id]` are the spine. `/quotes`
becomes a *lens* over `BatteryItem`, and **flat-rate items appear in it** with
pathway `—` and a `FLAT RATE` chip, never dropped.

**W3 — Engine Config, the flagship screen, is roughly 60% unbacked.** Three
separate problems, and they need separate fixes:

| | |
|---|---|
| **Tier 1** — a `Config` parameter *and* already has a DB home in `PathwayFactor` | processing / refurb-labour / cell-replacement / testing / hydromet rates, age cap, cycle cap, chemistry composition. **Needs only a UI.** |
| **Tier 2** — a `Config` parameter, but persisted **nowhere** | margin tiers, hurdle rate, recovery efficiencies, reuse + refurb rate cards, chemistry multipliers, logistics rate, overhead, refining %, yield loss, SoH restoration delta, flat repackaging fee, supplier margin overrides. **Needs a place to store a `Config`.** |
| **Tier 3** — **not a parameter at all**, a literal in the engine's own code | damage weights `0.4 / 0.35 / 0.25` ([`damage.ts:24`](../packages/decision-engine/src/decisionEngine/layers/damage.ts)), damage bands `1.5 / 2.5` (same file), SoH gates `75 / 50` ([`sohGating.ts:41`](../packages/decision-engine/src/decisionEngine/layers/sohGating.ts)). **Needs the engine changed before a screen can touch them.** |

→ **Resolved (AD8):** build tiers 1 + 2. **Render tier 3 read-only** with a
"changing this is a code change" note. Tier 3 is a clean follow-up later because
AD8 already builds the storage.

**W3b — 🔴 The engine never reads the database, and the config comes from the
client.** [`apps/agent/src/app/api/quote/route.ts:53`](../apps/agent/src/app/api/quote/route.ts)
passes **`body.config`** straight into `computeQuote`. That is not just a missing
feature — it is a live security defect: an agent's browser could POST
`margin_tiers: { aggressive: 0 }` and reprice its own quote.
→ **Resolved (AD9), Batch 11.**

### 🔴 Screens with no data model behind them

**W4 — Exceptions (D02).** `HOLD` and `REVIEW` are **engine decision flags**
(`decision.pathway === null` plus `flags`), **not pickup statuses**. Nothing
anywhere records "an admin resolved this hold". The screen has no table.
→ **Resolved (AD4):** new `ItemException` model (§3).

**W5 — Compliance (F01).** No EPR-credit model, no per-metal input-vs-recovered
ledger, no targets or spec thresholds. `Certificate.materialSummary` is a Json
blob, and **`Certificate` rows are created only by `reset-demo.ts`**.
→ **Resolved:** certificates are minted by the admin app (AD5), and the
per-metal aggregate is derived in `packages/core` (Batch 8/13). Targets are
config, not schema.

**W6 — Market feed (C02).** `MarketPrices` has no fx rate (hardcoded `83.2` at
[`market.ts:23`](../packages/core/src/market.ts)), no per-metal source, no
override reason or actor. The screen shows all four.
→ **Resolved:** four columns added in §3.

**W7 — "Audit logged" (claimed on four screens).** `StatusEvent` is
pickup-lifecycle-only and keyed to a pickup. Config publishes, market overrides,
exception resolutions, margin overrides and assignments have nowhere to land.
→ **Resolved:** one `AdminAudit` table serving all of them (§3).

### Remaining defects

**W8 — Invented statuses.** `PROCESSING`, `QUOTED`, `PICKED UP` are not in
`PickupStatus`. The wireframe's own CSS aliases them (`chip('QUOTED','collected')`),
so the author knew. → Use the nine real stages and `STAGE_LABELS` from
`@clbipp/ui`. **No screen re-declares the list** (existing repo rule).

**W9 — No manifest dispatch screen.** `/facilities` states "only registered
recyclers may receive a `DispatchManifest`" — but nothing creates one.
`DispatchManifest` is a real table (`draft → dispatched → received →
reconciled`) and facility → recycler is **step 6 of 8 in both HR documents**.
→ **Resolved:** three new screens, C02–C04, and they are **P0** under AD5.

**W10 — `profiles.role` must be `admin` or `ops`.** `UserRole` is
`customer | agent | admin`. → **Resolved (AD2): `ops` is dropped.**

**W11 — `Profile` has no `eprRegNo` and no margin-tier column,** both of which
the Suppliers screen renders. Note the engine **already honours**
`supplier_margin_overrides` ([`selection.ts:92`](../packages/decision-engine/src/decisionEngine/layers/selection.ts))
— it simply has nowhere to persist. → Two columns added in §3.

**W12 — Lifecycle Control is right in principle, too coarse in practice.**
One-at-a-time advance is correct per D5/D7. But "Advance → Certified" implies a
status flip, when it must **mint the `Certificate` row and the PDF** — that is
what lights up the vendor's `/certificates/[id]` and `/compliance`, which today
read a table nothing writes. → **Resolved (AD5).**

**W13 — Two chemistry vocabularies, and they must not merge.** The config screen
uses the engine's `Chemistry` (`NMC622 | NMC811 | LFP | LCO | NCA`); every
operational table's chemistry column is `BatteryType`
(`li_ion_nmc | li_ion_lfp | li_ion_nca | lead_acid | nimh | other`). There is no
622-vs-811 distinction anywhere in app data. Keep them apart.

**W14 — Missing throughout:** empty / loading / error states, pagination
("Showing 7 of 87 — pagination in the real build"), a search results screen for
the topbar search, and a logout control. Same omission the agent wireframe had.
The console kit (Batch 2) supplies all of them.

---

## §0b · The hole the wireframe cannot be blamed for

`confirmCollection` credits the **agent's** fee but never creates the vendor's
`Payment` row ([`collect/actions.ts`](../apps/agent/src/app/\(agent\)/job/\[id\]/collect/actions.ts)).
`payment.create` appears **only in `reset-demo.ts`**. A real vendor who completes
the whole journey lands on `/payment/[id]` reading *"No payment yet — a payout is
raised once your batteries have been collected and weighed"* — permanently. Both
HR documents say **"paid right away"** / "instant payment".
→ **Resolved (AD10), Batch 4.** Not an admin screen, but it is the same
end-to-end demo, and we own it.

---

## §1 · Decisions — AD0–AD12 (settled)

**AD0 — The wireframe stands; §0 resolves its twelve defects.** No new wireframe.
Redoing it costs a day the sprint does not have, and every defect is answerable
in prose. Build from the wireframe *plus* §0, never the wireframe alone.

**AD1 — The admin app is pickup-centric.** `/pickups` and `/pickups/[id]` are the
spine; `/quotes` is a lens over `BatteryItem`. Flat-rate (non-li-ion) items are
first-class citizens of every operational table.

**AD2 — One admin role.** `ops` is dropped. `allowRoles: ['admin']`, no
permission matrix, no second seeded tier. Revisit only if the company asks.

**AD3 — Admin reads and writes through Prisma + the service role. No RLS
policies for admin.** Prisma connects as the table owner and never consults RLS
(the same posture as every agent-app read), so **in-code role and identity
checks are the entire access boundary**, exactly as D10 says for the agent app.
⚠ If any admin screen later needs a *browser* Realtime subscription, that — and
only that — needs policies, and it hits the two-policy trap from Field Agent
Batch 8: **a policy expression is itself subject to RLS**, so an admin policy
that sub-selects `pickups` needs `pickups` to have an admin SELECT policy too,
or it silently matches zero rows. Verify under a real admin JWT, never the
service role.

**AD4 — The nine-stage lifecycle is untouched.** No migration adds a stage.
`HOLD` / `REVIEW` are `ItemException` records attached to a `BatteryItem`, not
statuses. `cancelled` remains re-enterable.

**AD5 — The unit of advance differs by stage, because the actor differs.**
This is the sprint's most consequential decision, and it comes from a plain
reading of who physically does each step:

| Transition | Unit | Who really does it | Who records it |
|---|---|---|---|
| `collected → tested` | one **`CustodyBatch`** | hub staff sort, segregate, test | **admin**, on the hub's behalf |
| `tested → processed` | one **`DispatchManifest`** | recycler receives the shipment | **admin**, on the recycler's behalf |
| `processed → recovered` | one **`DispatchManifest`** | recycler reports materials recovered | **admin**, on the recycler's behalf |
| `recovered → certified` | one **`Pickup`** | we issue the EPR certificate | **admin** — and this **mints the `Certificate` row + PDF** |

🔴 **Every stage past the hub is an admin recording something on behalf of a
party that has no app.** There is no hub-staff app and no recycler portal, and
building either would be a fourth surface. This is not a shortcut we invented —
it is the direct consequence of "Admin/Ops manages the recycler network" plus no
recycler portal in v1. **It is only defensible because we are honest about it:**
`StatusEvent.actorRole` records `'admin'`, so the trail says *an admin asserted
this*, rather than faking a recycler confirmation. Do not write `actorRole:
'recycler'` anywhere.

`/lifecycle` (B06) additionally keeps a **per-pickup manual override** for
corrections. It requires a typed reason and writes `AdminAudit`. It is the
exception path, not the normal one.

**AD6 — A pickup advances only when *every* one of its items is covered.**
Chemistry-wise segregation is a regulatory hard rule, so a single pickup's items
routinely go to **different recyclers on different manifests** — an NMC pack to
Indore Smelter, a lead-acid pack to Pune Lead Recovery. `DispatchManifest.itemIds`
is a list of `BatteryItem` ids, but **status lives on `Pickup`**. So a pickup is
"partially dispatched" until all of its items sit on confirmed manifests, and
only then does it advance. **No per-item status column** — that would fork D5.
⚠ The seed must contain a pickup that splits across two recyclers, or this is
never exercised.

**AD7 — A manifest may name only an `isActive` recycler whose
`acceptedChemistries` covers every item on it.** Enforced server-side in the
action, not just in the picker. This is the "chemistry-wise segregation from
pickup through dispatch" line in the compliance checklist, expressed as code.

**AD8 — Engine config: tiers 1 + 2 editable, tier 3 read-only** (see W3). A new
`EngineConfig` model stores a **validated Json `Config`**, versioned and
append-only. 🔴 **The seeded active row is byte-identical to `DEFAULT_CONFIG`, so
no price moves** — and a drift test asserts it, the same way Batch 9 guards the
CO₂e table.

> Why Json rather than columns: `Config` is the engine's own exported type and is
> already nested (records keyed by chemistry and by metal). It does not flatten
> into columns, and it will change when the engine changes. A zod validator in
> `packages/core` gives the type safety a column list would have.
>
> Why a new table rather than extending `PathwayFactor`: `PathwayFactor` is the
> old single-pack test harness's table, is FK'd from `PathwayDecision`, and is
> half-populated. Grafting twelve columns onto it makes both worse.

**AD9 — The quote route stops trusting `body.config`.** It calls
`getActiveConfig()` server-side and ignores anything in the request body. A
security fix, and price-neutral because of AD8. 🔴 It is nonetheless a change to
a pricing surface — **say so in the commit message.**

**AD10 — The vendor's `Payment` row is raised by the agent's
`confirmCollection`,** inside the transaction that already exists there. Matches
both HR documents' "paid right away", and means the vendor's payout does not
wait on an admin opening a console.

**AD11 — The console component kit lives in `apps/admin/src/components/console/`,
not `packages/ui`.** `packages/ui` is a **mobile** kit imported by two shipped
apps; a nine-column sortable table and a sidebar shell have no consumer there,
and editing that package risks breaking both. Logged in `LANE_OWNERSHIP.md`;
revisit only if a second desktop surface ever appears.

**AD12 — Admin sees everything — one level beyond the agent.** Full revenue,
every cost line, net value, margin %, the P_min/P_rec/P_max band, *and* the
engine configuration that produces them. This is the deliberate inverse of the
vendor-visibility rules, which are **untouched**. 🔴 **Nothing from an admin
screen may reach a vendor screen.** Concretely: never import a component from
`apps/admin` into `apps/customer`, and never move one into `packages/ui`
"because it's shared" (AD11 already forbids it).

---

## §2 · Screen map — 19 screens

`🆕` = not in the wireframe. **P0** = the end-to-end journey; **P1** =
oversight; **P2** = nice-to-have, first on the cut list (§5).

| ID | Route | Screen | Tier | Owner |
|---|---|---|---|---|
| **A · Access** ||||
| A01 | `/login` | Login — email + password, `allowRoles: ['admin']`, no self-signup | P0 | A |
| **B · Operations** ||||
| B01 | `/` | Dashboard overview — five KPI tiles, pathway split, market state, queue head | P2 | C |
| B02 | 🆕 `/dispatch` | **Dispatch board** — unassigned `requested` pickups | **P0** | A |
| B03 | 🆕 `/dispatch/[id]` | Request detail + agent picker + slot + ETA → `scheduled` | **P0** | A |
| B04 | 🆕 `/pickups` | All pickups, all nine stages, filter + search + paginate | **P0** | C |
| B05 | 🆕 `/pickups/[id]` | Pickup detail — items, vendor, agent, timeline, custody, offer, documents | **P0** | C |
| B06 | `/lifecycle` | Stage control — batch/manifest advances (AD5) + per-pickup manual override | **P0** | A |
| **C · Chain of custody** 🆕 *(whole group)* ||||
| C01 | `/inventory` | Facility stock by chemistry, capacity gauges, dwell alerts, custody batches | P1 | C |
| C02 | 🆕 `/manifests` | Manifest list — `draft / dispatched / received / reconciled` | **P0** | A |
| C03 | 🆕 `/manifests/new` | Build a manifest from a facility's stock; recycler picker enforcing AD7 | **P0** | A |
| C04 | 🆕 `/manifests/[id]` | Manifest detail; dispatch, then confirm → advances its pickups (AD5/AD6) | **P0** | A |
| **D · Engine** ||||
| D01 | `/config` | Engine config — tiers 1+2 editable, tier 3 read-only, versioned publish | P1 | B |
| D02 | `/market` | Market feed — prices, freshness, fx, audited manual override | P2 | B |
| D03 | `/quotes` | Quote queue — every `BatteryItem`, engine **and** flat-rate | P1 | C |
| D04 | `/trace/[traceId]` | Traceability — verdict, band, timeline, immutable audit block | P1 | C |
| D05 | `/exceptions` | Exception queue — `ItemException`, resolve → retest / override / reject | P2 | A |
| **E · Network** ||||
| E01 | `/suppliers` | Vendors — EPR reg no., pickups YTD, KYC, margin-tier override | P1 | C |
| E02 | `/agents` | Agent roster — zone, vehicle, safety training, rating, live load | P1 | C |
| E03 | `/facilities` | Facilities we operate + CPCB-registered recyclers | P1 | C |
| **F · Reports** ||||
| F01 | `/compliance` | Batteries handled, mass, recovery by metal vs target, certificate feed, CPCB export | P1 | B |
| F02 | `/analytics` | Throughput + margin trend, pathway mix YTD, top vendors | P2 | C |
| F03 | 🆕 `/audit` | `AdminAudit` — every config publish, override, resolution, assignment | P2 | A |

**Cut from the wireframe:** the "Simulate — replay the last 142 quotes" panel on
D01. It is genuinely buildable off `BatteryItem.quoteData` (which stores the
full `{ input, output }` pair) and it is a *good* feature — but it is a day's
work on a P1 screen. Reduced to a **stub with a `// TODO`**; see §5.

---

## §3 · Schema delta — one migration, `admin_app_v1`

Owned by **B**, Batch 1. Nothing else in the sprint needs a second migration.

**New models**

- **`EngineConfig`** — `version` (unique, `v2026-08-26-r1`), `config Json`,
  `isActive`, `note`, `publishedBy`, `publishedAt`, `parentVersion`.
  Append-only: publishing writes a new row and deactivates the old one; nothing
  is updated in place.
- **`AdminAudit`** — `actorId`, `action` (`pickup.assign` · `config.publish` ·
  `market.override` · `exception.resolve` · `manifest.dispatch` ·
  `manifest.confirm` · `lifecycle.override` · `supplier.margin`), `subjectType`,
  `subjectId`, `before Json?`, `after Json?`, `reason`, `createdAt`. One table
  for all of W7.
- **`ItemException`** — `batteryItemId`, `kind` (`hold | review`), `cause`,
  `detail`, `openedAt`, `resolution` (`retest | override | reject`),
  `resolvedBy`, `resolvedAt`, `notes`.

**New enums:** `ExceptionKind`, `ExceptionResolution`, `MarginTier`
(`aggressive | standard | generous` — matches `keyof Config["margin_tiers"]`).

**Altered**

- `Profile` **+** `eprRegNo String?`, `marginTier MarginTier?`  *(W11)*
- `MarketPrices` **+** `fxRateUsdInr`, `source`, `note`, `createdBy`  *(W6)*

**Not added, deliberately**

- No new `PickupStatus` value (AD4).
- No per-item status column (AD6).
- No `confirmedCategory` — still open question 13 to the company.
- No EPR-credit model. Credits are **derived** from certified mass; inventing a
  ledger before the company answers open question 8 would be guessing at a
  regulatory artifact.

**Seed additions** (same file, same batch) — each exists to make a screen or a
trap real, not to pad the demo:

1. An **active `EngineConfig` byte-identical to `DEFAULT_CONFIG`** + a drift test. 🔴 No price moves.
2. **Two more unassigned `requested` pickups** — so `/dispatch` is not a one-row demo.
3. **Two more recyclers** (three total) covering lead-acid, NMC, and LFP/NCA — so AD7's validation can actually fail.
4. **One pickup whose items split across two chemistries** → two recyclers. Exercises AD6.
5. **One `dispatched` and one `draft` manifest.**
6. **Two or three open `ItemException` rows.**
7. `eprRegNo` + `marginTier` on the vendor profiles.
8. 🔴 **One reactivated pickup** — `cancelled → requested` **carrying a stale `agentId` and `agentFeePaise`**. This is the loose end `CLAUDE.md` flags in red, and Batch 3 is where it finally gets handled.

---

## §4 · Lanes, file ownership, and the day-by-day

Lane policy is unchanged: **lanes are a default, not a gate** (2026-08-20).
Cross a lane to unblock yourself, then log it in `docs/LANE_OWNERSHIP.md`.

### File ownership — designed so the three lanes barely touch

| | Owner | Owns these paths outright |
|---|---|---|
| **A** | Aamir | `apps/admin/src/proxy.ts` · `src/app/layout.tsx` · `src/app/login/**` · `src/components/shell/**` · `(admin)/{dispatch,lifecycle,manifests,exceptions,audit}/**` · `scripts/smoke.mjs` · root `package.json` scripts |
| **B** | Khalid | `packages/database/prisma/**` · `packages/core/src/{engine-config,payment-actions,certificate,compliance-export}.ts` · `packages/decision-engine/**` · `(admin)/{config,market,compliance}/**` · `docs/DEPLOY.md` · the admin Vercel project |
| **C** | Ali | `apps/admin/src/components/console/**` · `(admin)/{pickups,quotes,trace,suppliers,agents,facilities,inventory,analytics}/**` · `(admin)/page.tsx` |

**Exactly one file is shared: `apps/admin/src/app/(admin)/layout.tsx`.** A
creates it in Batch 0 and nobody edits it afterwards. A also creates **every
route as a one-line stub** in Batch 0, so each owner only ever *replaces* their
own — no one is blocked waiting for a file to exist, and no two people create
the same one.

### Batches

| # | Batch | Owner | Tier | Depends on |
|---|---|---|---|---|
| 0 | Scaffold, auth gate, `ConsoleShell`, route stubs, smoke `--app=admin` | **A** | P0 | — |
| 1 | Schema + seed delta (`admin_app_v1`) | **B** | P0 | — |
| 2 | Console data kit — table, KPI, toolbar, gauge, charts, states | **C** | P0 | — |
| 3 | **Dispatch board** — `requested → scheduled` + `agentId` | **A** | P0 | 0 |
| 4 | `raisePayment()` + agent-collect wiring (AD10) | **B** | P0 | — |
| 5 | Pickups list + detail | **C** | P0 | 0, 2 |
| 6 | Custody batch → `tested`; manifest build + dispatch (AD5, AD7) | **A** | P0 | 0, 1 |
| 7 | Manifest confirm → `processed`/`recovered`; `certified` + certificate mint | **A** | P0 | 1, 6, 8 |
| 8 | `buildCertificatePayload()` + shared CPCB/EPR export in `packages/core` | **B** | P0 | 1 |
| 9 | Network — suppliers, agents, facilities, recyclers | **C** | P1 | 0, 1, 2 |
| 10 | Inventory — stock by chemistry, dwell alerts, custody batches | **C** | P1 | 2, 6 |
| 11 | `getActiveConfig()` + `/config` UI + the `body.config` fix (AD8, AD9) | **B** | P1 | 1 |
| 12 | Quote queue + traceability | **C** | P1 | 2 |
| 13 | Compliance — reports, filings, certificate feed | **B** | P1 | 8 |
| 14 | Exceptions + `/audit` | **A** | P2 | 1 |
| 15 | Dashboard + analytics | **C** | P2 | most |
| 16 | Market feed | **B** | P2 | 1, 11 |
| 17 | **Deploy** — third Vercel project + the manual pass | **B** | P0 | all |

### Day by day

| Day | A — Aamir | B — Khalid | C — Ali |
|---|---|---|---|
| 1 | **0** scaffold + gate | **1** schema + seed | **2** console kit |
| 2 | **3** dispatch board | **4** raisePayment | **5** pickups |
| 3 | **6** custody → tested, manifest dispatch | **8** certificate + export | **9** network |
| 4 | **7** manifest confirm → certified | **11** engine config | **10** inventory |
| 5 | **14** exceptions + audit | **13** compliance | **12** quotes + trace |
| 6 | float — whatever slipped | **16** market · **17** deploy | **15** dashboard + analytics |

🎯 **The full journey — vendor books → admin dispatches → agent collects →
vendor paid → admin ships to recycler → certificate issued → vendor sees it —
runs end to end after Day 4** (batches 3 + 4 + 6 + 7). Everything after that is
oversight on top of a working demo. Day 1's three batches share **no files at
all** and can genuinely run in parallel.

---

## §5 · Risks and the pre-agreed cut list

**Decide the cuts now, not at 2am on Day 6.**

**Cut in this order, and only in this order:**
1. **16** market feed → `/market` renders `MarketPrices` read-only; drop the override form.
2. **15** analytics → keep the dashboard, drop `/analytics`.
3. **14** exceptions + audit → `ItemException` rows still exist and still show on `/pickups/[id]`; drop the queue screen.
4. **12** quotes + trace → `/pickups/[id]` already shows each item's verdict.

**Never cut: 0, 1, 2, 3, 4, 6, 7, 8, 17.** Those are the journey. An admin
console that cannot dispatch a job or issue a certificate is not a smaller
version of this product; it is a different one.

### Risks

🔴 **R1 — AD5 makes the journey longer before it is demoable.** Under AD5 nothing
past `collected` moves until manifests exist. Mitigated by sequencing manifests
into **Day 3–4** rather than the back half — but if Batch 6 slips, the demo has
no tail. **Watch this on Day 3.** The escape hatch already exists: B06's
per-pickup manual override (AD5) can walk a pickup all the way through, so a
slipped Batch 6 costs the audit story, not the demo.

🟠 **R2 — AD6's partial-dispatch rule is easy to get wrong.** "Advance the pickups
on this manifest" is the obvious implementation and it is **wrong** — it would
advance a pickup half of whose items are still sitting at the hub. The correct
query asks, for each affected pickup, whether *every* item is on a confirmed
manifest. Seed fixture 4 exists solely to catch this.

🟠 **R3 — The engine-config screen is the one place a bug moves money silently.**
AD8 keeps the seeded config identical to `DEFAULT_CONFIG` and a drift test
guards it, but publishing is still a live pricing lever. Every publish writes
`AdminAudit` with before/after, and the validator (weights sum to 1.00, tiers
ordered, efficiencies in 0..1) runs server-side.

🟡 **R4 — Three apps now deploy off `main`, and a push is a deploy.** Pre-push is
now `npm run build` plus **three** smoke runs. Budget for it.

🟡 **R5 — `apps/admin` is a desktop app in a repo that has only ever built mobile
ones.** No `AppShell`, no `hideNav`, no `PhoneFrame`, no PWA. The failure mode is
importing a mobile primitive out of habit; AD11 and the trap list guard it.

---

## §6 · Open questions this sprint adds to the company

Continuing the numbering in `COMPANY_FLOW_REVIEW_2026-08-07.md`.

15. **Who confirms a recycler actually processed a shipment?** AD5 has an admin
    recording `processed` and `recovered` on the recycler's behalf, because
    there is no recycler portal. Is a recycler login in scope, or is an emailed
    confirmation attached to the manifest sufficient for a CPCB audit?
16. **What is on a dispatch manifest, legally?** We generate `manifest_no`,
    facility, recycler + CPCB reg. no., item list, weight and dates. If a
    prescribed manifest format exists under BWMR 2022, send it — it is a
    template change, not a schema change.
17. **How is an EPR credit actually calculated?** The wireframe shows "EPR
    credits earned — 31.8". We can derive a number from certified mass, but the
    conversion is a regulatory rule we do not have. Until then `/compliance`
    reports **certified mass**, and no credit figure is displayed.
18. **Are hub staff ever going to have an app?** `CustodyBatch.receivingStaffName`
    is typed by the *agent*, and under AD5 `tested` is asserted by an *admin*.
    Both are honest but weak. Related to open question 3.

---

*Written 2026-08-25. Build sheet: `docs/ADMIN_TASKS.md`.*
