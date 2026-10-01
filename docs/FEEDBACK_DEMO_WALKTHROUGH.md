# Feedback demo — one run that shows every change

For presenting the company's feedback round (FV1–FV16) back to them: not a full
demo, just "here is each change, and here is where it lives". The full click
path with expected numbers is `DEMO_RUNBOOK.md`; this is the short version.

**Before:** `npm run reset-demo` the same morning (announce it — shared
database; ~10 min), then `npm run verify-seed` (38/38). Keep a battery photo on
the laptop to upload. Ask teammates not to touch pickups 101–116 until after.

**Tabs:** Vendor `business@test` / `businesstest` · Agent `agent@test` /
`demo1234` · Admin `admin@test` / `demo1234`. (Also `agent2@test` on duty,
`agent3@test` off duty, both `demo1234`.)

Numbers in brackets are the change numbers below.

## The run

**1. Vendor tab**
- **Book a pickup** — a line without a photo is blocked [1]; submit — no price anywhere [2].
- **Offer on `PKP-2026-000104`** — "Talk to us about this offer" [14] → **Accept**.

**2. Agent tab**
- **`PKP-2026-000103` → Items** — on each of its 3 lines: photo required [3],
  weight method + optional scale photo [4]; on one line type a weight far from
  the declared one to show the warning [4].
- **Offer screen** — "Adjust the price before presenting" + "Call the office" [14] → **Present offer**.
- **`PKP-2026-000104` → Offer screen** — "Collect today" vs "Schedule collection" [5] → **Collect today**.
- **Collect** — tag line 1 `TG-DM00145`, give a reason on line 2 → sign → confirm [9].

**3. Vendor tab** — accept 103's offer.

**4. Agent tab**
- **103 → Offer screen → Schedule collection → tomorrow** [5].
- **Home** — 103 under "Booked for later" [5]; today's run card.
- **Open the run** — type box `BX-A003A` to load it [10].
- **Drop-off** — 104 + 105 → sign → custody PDF lists tags and boxes [12].
  The run stays open (102 is still to visit).

**5. Admin tab**
- **Dispatch** — tabs, filters, sorting [7]; 103 under "Booked for later" [5];
  "Same-day groups" → **Build run** for 101 + 115 with Neha [11]; open the new
  booking → "Internal estimate · Not shown to the vendor" [2], ranked agents with
  job counts, Mohit off duty [6].
- **Tags → Issue tags** — prints a QR sheet [9].
- **Boxes → Register a box** [10].
- **Lifecycle → the new batch → Check in** — type `TG-DM0001V`, `TG-DM00145`;
  **Tag now** on the two untagged lines with `TG-DM0015G`, `TG-DM0016V` → advance [13].
- **Pickups → `PKP-2026-000116`** — Second Life destination, "Override destination" [8].
- **Manifests → New** — second-life only goes to the refurbisher [8].

## The changes, by the company's priority

| # | Change | Priority |
|---|---|---|
| 1 | Customer photos mandatory | P0 |
| 2 | No estimate shown to the customer | P0 |
| 3 | Agent inspection photos mandatory | P0 |
| 4 | Verified weight (method, scale photo, divergence warning) | P0 |
| 5 | Inspection separate from collection | P0 |
| 6 | Live job count while assigning (+ off duty) | P1 |
| 7 | Dispatch filters and sorting | P1 |
| 8 | Second Life vs Recycling (refurbisher, override, certificate) | P1 |
| 9 | Battery tags | P1/P2 |
| 10 | QR transport boxes | P2 |
| 11 | Same-day nearby grouping (runs) | P2 |
| 12 | Hub drop-off with tags and boxes (workflow step 9) | — |
| 13 | Facility check-in gates "tested" (workflow step 10) | — |
| 14 | Pilot mode: price override + call-the-office (from the follow-up meeting, not the doc) | — |

**Opening line:** "Everything in your doc is built. Where it left a choice open
we made a reasonable call — tell us what you'd do differently."

**Things to say, not hide:** the office buttons are disabled until they give us a
number · there is no on/off switch for the engine, the agent override covers it ·
working hours and a roster are still not built (§8 of `PLAN_FEEDBACK_V2.md`) ·
FD12–FD19 are our provisional calls.
