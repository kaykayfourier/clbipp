# CLBIPP — Demo Runbook

> **What this is.** The click path for showing the whole product to the company,
> in order, with the exact pickup to use at each step and what each screen should
> say when you get there. Written 2026-08-31, after a full re-verification of all
> three apps.
>
> **Two scripts, and they are for different things:**
>
> | | Length | Use it for |
> |---|---|---|
> | **§3 The relay** | ~12 min | **What you present.** Live at both ends, seeded pickups in the middle. Every screen shows real data. |
> | **§4 The full walk** | ~30 min | **What you rehearse.** One pickup, all nine stages, no shortcuts. Proves the lifecycle genuinely closes. |
>
> Rehearse §4 at least once before demo day. Present §3 unless the rehearsal was
> clean *and* you have the time.

---

## §1 · Pre-flight — do this the morning of, not five minutes before

### 1.1 Reseed. This is not optional.

```bash
npm run reset-demo      # 🔴 ANNOUNCE IN THE GROUP FIRST — shared Supabase project
npm run verify-seed     # must print: ✅ all fixture checks passed  (24 checks)
```

🔴 **Why it is not optional.** The seed dates several fixtures relative to *when
it runs* (`day(0)`). On a seed that is a few days old the agent's home screen
reads **`0 Assigned · 0 Collected · ₹0 Earned`** — correct, and it reads as
broken. On a fresh seed the same screen reads **`2 assigned · 1 collected ·
₹2,592.00`**. That is the single most visible difference between a demo that
looks alive and one that looks abandoned.

⚠ `reset-demo` restores **rows, not grants or policies.** If the apps start
behaving oddly after a reseed — pages rendering empty with a 200, API routes
401ing — read `docs/BEFORE_YOU_PUSH.md` §3 before debugging anything else.

### 1.2 See the board before you present it

```bash
npm run demo-stage      # every pickup, its stage, and what is blocking it
```

Expected after a fresh reseed:

```
PKP-2026-000101  requested                                    ← you may dispatch this live
PKP-2026-000102  scheduled    not yet assessed
PKP-2026-000103  arrived      not yet assessed                ← the engine demo starts here
PKP-2026-000104  offered      awaiting vendor acceptance      ← the acceptance + money demo
PKP-2026-000105  collected    pending drop-off                ← 🎯 the whole admin tail
PKP-2026-000106  tested
PKP-2026-000107  processed
PKP-2026-000108  recovered
PKP-2026-000109  certified                                    ← a finished certificate to show
PKP-2026-000110  cancelled
PKP-2026-000113  tested       (split across two manifests — the AD6 story)
PKP-2026-000114  requested    🔴 stale agent (reactivated)
PKP-2026-000115  requested                                    ← same-day partner of 101 (Beat 2's run)
PKP-2026-000116  tested       second life, on no manifest     ← Beat 6b: ships to the refurbisher
Agent day view today: 2 assigned · 1 collected · ₹2592.00
```

Plus, from the seed's last lines: `4 transport boxes, 48 tags (13 bound, 35
unused), 12 hub check-ins, run RUN-<date>-5EED` (in progress: box `BX-A001W`,
stops 105 and 102). `npm run verify-seed` should print **38/38**.

### 1.3 Servers

Three terminals. **Use production builds, not `npm run dev`** — dev is slower,
and the PWA install prompt and offline card only exist in a production build.

```bash
npm run build
(cd apps/customer && npx next start -p 3000)   # vendor
(cd apps/agent    && npx next start -p 3001)   # field agent
(cd apps/admin    && npx next start -p 3002)   # admin console
```

Once Khalid's deploy lands, the first two can be the Vercel URLs instead
(`clbipp-customer.vercel.app`, `clbipp-agent.vercel.app`) — both verified live.

### 1.4 Accounts

| App | Port | Login |
|---|---|---|
| Vendor | 3000 | `business@test` / `businesstest` |
| Field agent | 3001 | `agent@test` / `demo1234` |
| Field agent 2 | 3001 | `agent2@test` / `demo1234` — Neha Verma, on duty, no jobs (added 2026-09-27) |
| Field agent 3 | 3001 | `agent3@test` / `demo1234` — Mohit Sharma, **off duty** (shows as unavailable) |
| Admin console | 3002 | `admin@test` / `demo1234` |

**The tag sheet and boxes (2026-09-27).** The seed issues one sheet of 48 tags
(`TG-DM0001V` … `TG-DM0048C`); the first 13 are already on collected batteries.
Unused ones to type or scan in the demo: **`TG-DM00145`, `TG-DM0015G`,
`TG-DM0016V`, `TG-DM00176`, `TG-DM0018H`**. Boxes: **`BX-A001W`** (on today's
run), `BX-A0023`, `BX-A003A`, `BX-A004H`. Better still: print a sheet from
`/tags` and the box labels from `/containers` and scan real paper with a phone.

Log all three in **before** the company is in the room. Put the agent app on a
real phone if you can — it is a field app and it reads like one.

### 1.5 Two things to say out loud, early

- 🔴 **The three recyclers are invented.** *Meridian Metals Recovery*, *Sunrise
  Lead Recyclers*, *Verdant Cell Recovery*, with invented CPCB numbers. Say so
  before someone asks, and ask them for real partner names.
- **The CO₂e factors are placeholders.** Only their relative ordering is
  defensible; the company's CPCB-accepted set is open question 7. One file
  changes when they answer (`packages/core/src/impact.ts`).

---

## §2 · The one-sentence story

> A vendor books a battery pickup, an admin dispatches a field agent, the agent
> assesses each battery and makes a priced offer the vendor accepts, the vendor
> is paid, the batteries move into custody, out to a certified recycler, and back
> as an EPR compliance certificate the vendor can download.

Nine stages: `requested → scheduled → arrived → offered → collected → tested →
processed → recovered → certified`. **Every one of them is written by a screen.**
No CLI, no database edit. That is the claim the demo is making — so do not reach
for a terminal mid-demo, even to fix something.

---

## §3 · The relay — what you present (~12 min)

Live at the front, live at the back, seeded pickups in the middle so nobody
watches you tap through eight assessment screens.

### Beat 1 — the vendor books (:3000, ~90s)

Log in as `business@test` → **Book a pickup**. Add two lines, pick a preferred
date, submit.

- ✅ Lands on a confirmation with a real `PKP-2026-…` id. **Write it down.**
- 💬 *"That is a real row. Nothing here is a mock."*

### Beat 2 — the admin dispatches (:3002, ~90s)

`/dispatch`.

- ✅ The new booking is at the **bottom** — the board is oldest-first, because
  the longest-waiting vendor is the most urgent.
- Open it → assign `agent@test` → pick a slot. Use a **distinctive time like
  07:15** so you can point at it later on two other screens.
- ✅ Status goes `requested → scheduled`.
- Show `/audit` → the `pickup.assign` row, with a before/after diff and **who**
  did it.
- 💬 *"Every admin action is logged with an actor. This is a compliance product."*
- **New (FV14/FV15):** point at the **Priority** column (a swollen or leaking
  declaration is *Urgent*) and the **Battery type / Load size / Priority**
  filters. In the agent list, **Mohit Sharma — Unavailable · Off duty**: marked
  on `/agents`, and dispatch refuses him.
- **New (FV11 — feedback §4.3), optional, ~60s:** the **Same-day groups** panel
  proposes `PKP-2026-000101 · PKP-2026-000115` (0.7 km apart, both for today).
  **Plan a run** → pick **Neha Verma** → **Build run**. 💬 *"The board suggests;
  a person decides. Nothing is grouped or assigned on its own."* (⚠ This
  assigns 101 — do it after Beat 2's own dispatch, or pick 101 there.)

### Beat 3 — the engine (:3001, ~3 min) — **the most impressive part, do not rush it**

Log in as `agent@test`. The new job is on the day view as **SCHEDULED**.

Now **hop to `PKP-2026-000103`** (already `arrived`, un-assessed) rather than
walking the new one from scratch.

- Open it → **Safety checklist** first. ✅ It is mandatory and it gates intake —
  every HR document asked for it.
- Items → open the first item → confirm chemistry / weight / condition.
  💬 *"What the vendor declared and what the agent finds are two different
  things, and we keep both. Disagreeing is a finding, not an error."*
- Damage rubric → **Compute**.
- ✅ The result screen: pathway (Reuse / Refurbish / Recycle), net value, the
  full cost breakdown, and the **P_min / P_recommended / P_max** band.
- 💬 *"The agent sees everything — margin, recovered value, the whole band. The
  vendor sees the price and the reasoning, never the margin. That inversion is
  deliberate."*
- Tap **Why this pathway** → the engine explains itself.

**Optional, if they look engaged — show a HOLD.** On another item enter
**SoH 30 · LFP · 0.4 kWh · 2.5 kg · damage 3 / 3 / 3 · 60 km**.
✅ Net value comes out **negative (≈ −362)** and the screen refuses to offer:
*"Do not present an offer for this line — escalate to admin."*
Press **Escalate to admin** → then show it land on the admin's `/exceptions`
board. 💬 *"The app will stop an agent from making an offer that loses money."*
(SoH 45 · NMC · 1.0 kWh · 6 kg · damage 2/1/1 · 250 km gives a **REVIEW** instead
— borderline rather than refused.)

### Beat 4 — the offer, and the money (~3 min)

**Hop to `PKP-2026-000104`** — already `offered`, awaiting the vendor.

- **:3000 as the vendor** → the offer screen → price + rationale, **no margin,
  no recovery rate %**. Press **Accept**.
- ✅ Lands on **"Offer Accepted"** — *not* "Handover Confirmed". The batteries
  have not moved. 💬 *"A vendor cannot mark their own battery collected."*
- **:3001 as the agent** → the same job now offers **Collect**. 🆕 **Tag the
  load first** (feedback §4.2): line 1 → **Scan tag** (or type `TG-DM00145`);
  line 2 → **No tag available?** → "sheet ran out" — to show the way out.
  💬 *"Every battery leaves with a tag or a recorded reason. The check
  character means a mistyped code is refused, never bound to the wrong
  battery."* Then **draw a real signature** and confirm.
- ✅ **Confirm collection** stays disabled until every line is tagged or
  explained — and the server refuses it too.
- ✅ `offered → collected`, and a payable is raised for the vendor automatically.
- **:3000 as the vendor** → `/payment/[id]` → the amount is the offer they
  accepted, to the paise. Settle it.
- ✅ Wallet credited, invoice available.

### Beat 5 — into custody (:3001, ~90s)

**Hop to `PKP-2026-000105`** (`collected`, no custody batch — "pending drop-off").
It is also the collected stop on **today's run** (`RUN-…-5EED`, card on the day
view, box `BX-A001W`). Line 1 carries `TG-DM0001V`; line 2 left **untagged** with
a reason — that is the hub's job in Beat 6.

- Agent app → **Drop-off** → select it (and 104 if you collected it) →
  receiving staff name → signature.
- ✅ A `CustodyBatch` is created. The run **stays open with its box still on
  it** — `PKP-2026-000102` is still to visit, so the van goes back out. (A
  drop-off that leaves no stop to visit closes the run and frees the box; the
  agent can also end the run from `/run/[id]` once the van is empty.) The receipt screen lists
  every line with its **tag and box**. Show the **chain-of-custody PDF**.

### Beat 6 — the admin tail (:3002, ~4 min) — **the part no competitor demo has**

- `/lifecycle` → the new custody batch is there → 🆕 **Check in** first
  (feedback §6 step 10). Type/scan `TG-DM0001V` → received. On 105's untagged
  line → **Tag now** with `TG-DM0016V`. (104's lines: its tag code, and **Tag
  now** for the one you left untagged.) Try a code from another batch —
  `TG-DM00026` — and show the refusal.
  💬 *"The drop-off is the agent's word. The check-in is the hub's own count —
  and nothing is tested until every battery is accounted for."*
- **Mark tested** → `collected → tested`. (One unchecked or *missing* line holds
  its whole pickup.)
  💬 *"The unit of advance changes with the stage, because the actor changes."*
- `/manifests/new` → facility → select **both** of 105's lead-acid lines →
  recycler **Sunrise Lead** (the only one that accepts lead-acid — watch the
  other two grey out) → create → **Dispatch**.
- `/manifests/[id]` → **Confirm received** → `tested → processed`.
  ✅ The readiness panel says how many pickups will move **before** you click.
- **Reconcile** → enter recovered masses → `processed → recovered`.
  💬 *"These are measured figures from the recycler, not our estimate — and the
  certificate says which it used."*
- **Certify** → `recovered → certified`. The `Certificate` row is minted here.

**The AD6 moment, if there is time.** Open `/lifecycle` and point at
`PKP-2026-000113`: one item on a dispatched manifest, one **still at the hub**.
💬 *"This pickup will not advance until every one of its items is accounted for.
Chemistry segregation sends one pickup's batteries to different recyclers, so
'the manifest arrived' is not the same as 'the pickup is done'."*

### Beat 6b — Second Life (:3002, ~2 min, optional) 🆕

`PKP-2026-000116` is tested and its EV packs were judged fit for refurbishment.

- `/manifests/new` → **Second Life → refurbisher** → tick 116's line → only
  **Evergreen Second-Life Cells** is offered (the recyclers are for recycling
  stock). Create → Dispatch → **Confirm received** (116 → processed) →
  **Reconcile** asks for an *outcome report*, not metals → recovered →
  `/lifecycle` → **Certify**.
- ✅ The certificate states **180 kg routed to second life** and claims **no
  recovered metal**. 💬 *"A reused battery was not broken down, so we don't
  pretend it yielded nickel."*

### Beat 7 — close the loop (:3000, ~60s)

Vendor → `/compliance` → the certificate for the pickup you just certified.
**Download the PDF.**

- 💬 *"That is the document that makes their EPR filing defensible. It started as
  a booking twelve minutes ago."*

---

## §4 · The full walk — ONE pickup, all nine stages (~30 min)

**This is the rehearsal, and it doubles as the admin verification pass.** Walking
one pickup end to end executes every admin lifecycle write there is — dispatch,
custody advance, manifest confirm, manifest reconcile, certify. Until this has
been run against the deployed apps, those five writes have never executed in
production and the "screens only" claim is untested. Run it once the night
before; the trail it leaves is real and it is correct to leave it there.

### The one decision that makes or breaks this walk

🔴 **Confirm EVERY item on the demo pickup to `li_ion_lfp`.**

Two independent rules meet on this choice, and getting it wrong strands the
pickup at `tested` with no obvious cause:

- **AD6** — a pickup advances only when *every* one of its items is on a
  confirmed manifest. Mixed chemistries are realistic and correct, but they need
  two manifests to two recyclers, both confirmed, before the pickup moves.
- **AD7** — a manifest may only name a recycler whose `acceptedChemistries`
  covers every item on it.

`li_ion_lfp` is the choice that satisfies both *and* keeps the demo interesting:

| Chemistry confirmed | Engine runs? | Legal recycler |
|---|---|---|
| `li_ion_lfp` | ✅ full pathway + price band | **Verdant Cell Recovery** (LFP only) |
| `li_ion_nmc` / `li_ion_nca` | ✅ | Meridian Metals Recovery |
| `lead_acid` | ❌ flat rate — **no engine, no trace id** | Sunrise Lead Recyclers |

Lead-acid items skip the decision engine entirely, so a lead-acid demo silently
drops the most impressive screen in the product. Use LFP.

Keep the booking to **two items**. One does not show multi-item intake; three
means walking the rubric three times while people watch.

### Pre-flight (the morning of — not five minutes before)

```bash
npm run reset-demo      # ⚠ announce first — shared Supabase project
npm run verify-seed     # 24 fixture checks, must pass
npm run demo-stage      # the board + what blocks each row
```

`demo-stage` must print `Agent day view today: 2 assigned · 1 collected ·
₹2592.00`. If it reads `0 · 0 · ₹0` the seed is stale — reseed. Several fixtures
are dated at seed time, so a stale seed makes the agent home screen look broken
when it is merely old.

### The walk

| # | Stage written | Where | What you do |
|---|---|---|---|
| 1 | `requested` | Customer | Book a pickup, 2 items. **Write down the `PKP-` id.** |
| 2 | `scheduled` | Admin | `/dispatch` → the new row is at the **bottom** (oldest-first) → assign `agent@test`, slot **07:15** |
| 3 | `arrived` | Agent | Day view → the job → **Arrived** |
| — | *gate* | Agent | **Safety checklist** — mandatory, blocks intake |
| — | *intake* | Agent | Each item → confirm **`li_ion_lfp`**, weight, condition → damage rubric → **Compute** |
| 4 | `offered` | Agent | Review the band → **Send offer** |
| — | `acceptedAt` | Customer | Accept. Lands on **"Offer Accepted"** — status does *not* move |
| 5 | `collected` | Agent | **Collect** → 🆕 bind a tag to each line (`TG-DM00145`, `TG-DM0015G`) → draw a real signature. A payable is raised automatically |
| — | *money* | Customer | `/payment/[id]` → amount matches the offer to the paise → settle |
| — | *custody* | Agent | **Drop-off** → select the pickup → staff name → signature → `CustodyBatch` + PDF |
| — | *check-in* | Admin | 🆕 `/lifecycle` → the new batch → **Check in** → scan/type both tags → every line **received** |
| 6 | `tested` | Admin | **Mark tested** (disabled until the check-in is complete) |
| 7 | `processed` | Admin | `/manifests/new` → Okhla hub → both items → **Verdant Cell Recovery** → create → **Dispatch** → **Confirm received** |
| 8 | `recovered` | Admin | Same manifest → **Reconcile** → enter recovered masses |
| 9 | `certified` | Admin | `/lifecycle` → **Certify** → mints the `Certificate` |
| — | *close* | Customer | `/compliance` → **download the certificate PDF** |

### The three lines worth saying out loud

At step 2, on `/audit`: *"Every admin action is logged with an actor. This is a
compliance product."*

At step 7, when two of the three recyclers grey out: *"A manifest can only name a
recycler certified for that chemistry. That is enforced in the action, not just
in the picker — a crafted request cannot get past it either."*

At step 8: *"These are the masses the recycler measured, not our estimate. The
certificate records which of the two it used, and it will not present an estimate
as a measurement."*

### Verify the pass actually landed

```bash
npm run demo-stage      # your pickup should read `certified`, cert `Y`
```

Then confirm the admin writes are attributed correctly — this is the check that
closes the audit finding:

```sql
select status, actor_role, count(*) from status_events
where actor_role = 'admin' group by 1,2 order by 1;
```

Expect `scheduled`, `tested`, `processed`, `recovered`, `certified`. **Zero rows
means no admin screen wrote anything** and the walk did not do what it looked
like it did.

---

## §5 · When something goes wrong

**Rule zero: do not open a terminal in front of the company.** Move to the next
beat with a seeded pickup — the seed has one at every stage, which is what it is
for. Fix it afterwards.

| Symptom | What it is | What to do |
|---|---|---|
| Agent home reads `0 · 0 · ₹0` | Stale seed, not a bug | Nothing, mid-demo. Reseed before the next one. |
| A booked pickup never reaches the agent | Nothing wrote `requested → scheduled` | Dispatch it on `/dispatch`. Fallback: `npm run assign-job` |
| `/lifecycle` has nothing to advance | No custody batch exists yet | Do Beat 5 (the agent drop-off) first — this is by design |
| **Mark tested** is greyed out | The hub has not checked every line in (FD15) | **Check in** → scan/type each tag; **Tag now** for an untagged line |
| **Confirm collection** is greyed out | A line has no tag and no reason (FD13) | Scan a tag from the sheet, or "No tag available?" with a reason |
| Scanner says "does not check out" | A character was misread or mistyped | That is the check character working — re-type carefully |
| Camera will not open on the phone | Not HTTPS (a LAN IP over http is not a secure context) | Type the code — every scan field takes typing |
| A pickup will not leave `tested` | AD6 — an item is still at the hub | Open `/lifecycle`, read the coverage row. Expected, not broken |
| The recycler dropdown is empty | No active recycler accepts that chemistry | Check the item chemistries — AD7 is enforced in the action |
| Need to re-run a beat | — | `npm run demo-stage -- --reset <pickup-id>` **after** the demo |

**After any rehearsal, before the real thing:**

```bash
npm run reset-demo && npm run verify-seed
```

⚠ Dispatching a seeded request from `/dispatch` legitimately breaks two
`verify-seed` checks (fixture 8's stale agent, and "≥3 unassigned requests").
That is expected after a demo — reseed rather than reading it as a defect.

---

## §6 · Do not say / do not show

- ❌ **No recovery-rate % to the vendor, ever.** Hard rule, and there is no
  screen that shows it — do not go looking for one on a shared screen.
- ❌ **No material-by-material valuation on a vendor screen.** What they were
  paid is visible; how we valued it is not. (It is fine on the certificate — that
  is a compliance document.)
- ❌ Do not present the three recycler names as real partners (§1.5).
- ❌ Do not quote the CO₂e numbers as verified (§1.5).
- ⚠ If asked about the admin console's security: it has **no RLS policies** by
  design (AD3) — the auth guard plus in-code role checks are the whole boundary.
  All six wrong-role login pairings are asserted and bounce. That is a
  deliberate, documented posture, not an oversight.

---

## §7 · Verified state as of 2026-09-27

Everything below was run, not assumed (details: §10 of `PLAN_FEEDBACK_V2.md`):

| Check | Result |
|---|---|
| `npm run build` | 3/3 apps, `ƒ Proxy (Middleware)` on each |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test` | 420 passing |
| `npm run verify-seed` | 38/38 |
| `npm run smoke` (dev) | customer 48/48 · agent 32/32 · admin 31/31 |
| Six role-gate pairings | all six bounce |
| FV9–FV16 HTTP harness | tags, boxes, runs, drop-off, hub check-in, second life, scale photo — see the plan |
| Deployed apps | all three live; **FV9–FV16 not pushed yet** — production still runs the 2026-09-23 build |

⚠ If the demo machine's dev servers have been up for hours and actions start
timing out, restart them — a long-lived `next dev` exhausted the connection pool
on 2026-09-27.

Two warnings carried in older docs were re-tested and **could not be reproduced**
— the `api/documents/*` 404 under Turbopack dev, and the 24-hour market-freshness
cliff (`snapshot_timestamp` is stamped at read time, so it never ages out).
