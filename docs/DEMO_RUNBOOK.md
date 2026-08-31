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
Agent day view today: 2 assigned · 1 collected · ₹2592.00
```

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
| Admin console | 3002 | `admin@test` / `demo1234` |

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
- **:3001 as the agent** → the same job now offers **Collect**. Complete it —
  **draw a real signature**.
- ✅ `offered → collected`, and a payable is raised for the vendor automatically.
- **:3000 as the vendor** → `/payment/[id]` → the amount is the offer they
  accepted, to the paise. Settle it.
- ✅ Wallet credited, invoice available.

### Beat 5 — into custody (:3001, ~90s)

**Hop to `PKP-2026-000105`** (`collected`, no custody batch — "pending drop-off").

- Agent app → **Drop-off** → select it → receiving staff name → signature.
- ✅ A `CustodyBatch` is created. Show the **chain-of-custody PDF**.

### Beat 6 — the admin tail (:3002, ~4 min) — **the part no competitor demo has**

- `/lifecycle` → the new custody batch is there → **Advance** → `collected → tested`.
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

### Beat 7 — close the loop (:3000, ~60s)

Vendor → `/compliance` → the certificate for the pickup you just certified.
**Download the PDF.**

- 💬 *"That is the document that makes their EPR filing defensible. It started as
  a booking twelve minutes ago."*

---

## §4 · The full walk — what you rehearse (~30 min)

Same beats, but **one pickup carries all nine stages** and nothing is hopped.
Book fresh at :3000, then follow §3's beats 2–7 on that one pickup, assessing
**every** item in the agent app.

🔴 **The one thing that will catch you out.** A pickup only advances past
`tested` when **every** one of its items is on a confirmed manifest (AD6). Since
the agent picks each item's chemistry during intake, and a recycler only accepts
certain chemistries:

> **Confirm every item on the demo pickup to the same chemistry family** — all
> lead-acid, or all LFP. Mixed chemistries are realistic and correct, but they
> need **two** manifests to two recyclers, both confirmed, before the pickup
> moves. That doubles Beat 6 and, if you are not expecting it, looks like the
> app is stuck.

That is exactly why the relay uses `PKP-2026-000105`: **both** its items are
lead-acid, so one manifest to Sunrise Lead clears AD6 in a single pass.

**Also budget for:** the safety checklist (once), ~4 screens per item in the
agent app, two signature captures, and eight numeric inputs at reconcile.

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

## §7 · Verified state as of 2026-08-31

Everything below was run, not assumed:

| Check | Result |
|---|---|
| `npm run build` | 3/3 apps, `ƒ Proxy (Middleware)` on each |
| `npm run lint` | 0 errors (1 known unused-var warning) |
| `npm run test` | 304 passing |
| `npm run verify-seed` | 24/24 |
| `npm run smoke` (dev **and** production builds) | customer 46/46 · agent 30/30 · admin 24/24 |
| Six role-gate pairings | all six bounce |
| PDF document routes | real PDFs on dev **and** production |
| Deployed apps | customer + agent live (admin pending Khalid's Batch 17) |

Two warnings carried in older docs were re-tested and **could not be reproduced**
— the `api/documents/*` 404 under Turbopack dev, and the 24-hour market-freshness
cliff (`snapshot_timestamp` is stamped at read time, so it never ages out).
