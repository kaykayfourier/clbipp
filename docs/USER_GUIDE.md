# CLBIPP — how to use it

For the pilot team: office staff, field agents, and anyone testing the apps.
The screens are kept short on purpose; the explanations live here.

| App | Who | Address |
|---|---|---|
| Vendor app | businesses and people handing over batteries | https://clbipp-customer.vercel.app |
| Field agent app | agents who inspect and collect (phone) | https://clbipp-agent.vercel.app |
| Admin console | office staff (desktop) | https://clbipp-admin.vercel.app |

---

## 1. The whole journey

| # | App · who | What happens | Stage after |
|---|---|---|---|
| 1 | Vendor app · vendor | Books a pickup: battery lines, a photo of each line, address, date | requested |
| 2 | Admin · office | Dispatch: picks an agent from the ranked list (or builds a run) | scheduled |
| 3 | Agent app · agent | Taps **Arrived on site** | arrived |
| 4 | Agent app · agent | Safety checklist | |
| 5 | Agent app · agent | Checks each line: chemistry, weight, condition, photos | |
| 6 | Agent app · agent | Calls the office, agrees the price, presents the offer | offered |
| 7 | Vendor app · vendor | Accepts (or declines) the offer | |
| 8 | Agent app · agent | Collects now, or books a collection date | |
| 9 | Agent app · agent | Tags each line, vendor signs, confirms collection | collected |
| 10 | Vendor app · vendor | Chooses UPI or bank; gets paid, receipt and invoice | |
| 11 | Agent app · agent | Drops the load at the hub | |
| 12 | Admin · hub | Hub check-in: scans each tag in | |
| 13 | Admin · office | Lifecycle: advances the hub batch | tested |
| 14 | Admin · office | Manifests: builds one per recycler and dispatches it | |
| 15 | Admin · office | Manifest: confirms the recycler received it | processed |
| 16 | Admin · office | Manifest: enters what the recycler recovered | recovered |
| 17 | Admin · office | Lifecycle: certifies the pickup | certified |
| 18 | Vendor app · vendor | Downloads the EPR certificate from Compliance | |

There are nine stages and they never change. Booking a later collection date,
dropping off at the hub, tags and boxes are facts recorded along the way, not
extra stages.

---

## 2. Vendor app

- **Book a pickup.** Add each battery line with a photo. No price is shown at
  booking: the price comes after the agent's inspection.
- **The offer.** Shows the price we will pay. **Accept** it, **Decline** it
  (this cancels the pickup; you can rebook it later), or **Talk to us**.
- **Getting paid.** After the agent collects, choose UPI or bank. The amount is
  exactly the offer you accepted. Receipt and invoice are on the payment screen.
- **Tracking.** Every pickup has a timeline you can share with a link.
- **Certificates.** When the pickup is certified, the EPR certificate is under
  **Compliance**. It lists the metals recovered and, separately, any weight sent
  to a refurbisher for a second life.

## 3. Field agent app

Your day view lists the jobs assigned to you. Open a job and press the one
button at the bottom; it always takes you to the next step.

1. **Arrived on site** when you get there.
2. **Safety checklist.** Nothing else opens until it passes.
3. **Each line:** read the chemistry off the label, weigh it (say how: scale,
   label or estimate), pick the condition, take at least one photo.
4. **Lithium lines** also need the damage scores and the battery specs **for one
   pack** (capacity, health, age, cycles). The app works out a recommended price.
   Other batteries are priced from the rate card.
5. **Offer.** The recommended total is for you only; the vendor never sees it.
   **Call the office**, agree the price, type it in, and add a short note if it
   is different from the recommendation (for example "Agreed with Rahul"). Leave
   the price blank to offer the recommendation as it is. Then **Present offer**.
6. After you present, the items are **locked**. If something is wrong, call the
   office.
7. When the vendor accepts: **Collect today**, or book a later date.
8. **Collection:** put one tag from your sheet on each line (or say why there is
   none), take the vendor's signature and photos, then confirm.
9. **Drop off at the hub** at the end of the day.

**Runs.** If the office gave you a run, it is on your day view: open it, scan a
box to start, then visit the stops in order. Every tag you stick goes into the
box you scanned.

## 4. Admin console

- **Dispatch.** New requests, newest first. Open one and pick an agent; the list
  is ranked by who is free, how busy they are that day, then distance. Nothing
  is assigned automatically.
- **Who collects.** After a vendor accepts an offer, the same dispatch page lets
  you hand the collection to a different agent. The agent who inspected stays on
  the record. (Pilot option — see section 7.)
- **Runs.** A same-day route for one agent and one van. Pick the stops; requests
  get assigned to that agent, and accepted collections inspected by someone else
  get that agent as their collector.
- **Tags.** Print sheets of tags for agents to carry. Look up any tag or box
  code to see the battery line, pickup and box it belongs to.
- **Boxes.** Register reusable boxes and print their labels. Click a box to see
  what is in it now, what it carried before, and its trips.
- **Hub check-in** (from Lifecycle). Scan each tag in as a load arrives. A
  pickup moves to *tested* only when every one of its lines is checked in.
- **Manifests.** Build one per recycler from tested stock. A recycler only gets
  chemistries it accepts; second-life batteries go only to a refurbisher. Then
  **Dispatch**, **Confirm received**, and **Reconcile** by entering the recovered
  kg from the recycler's report (a refurbisher gets an outcome note instead).
- **Certify** (from Lifecycle) once a pickup is *recovered*. The certificate is
  created and the vendor can download it.
- **Exceptions** are items an agent escalated; **Config** and **Market** hold the
  engine's settings and metal prices; **Audit** lists every office action.

## 5. Prices: where each number comes from

| Where | Number | Comes from |
|---|---|---|
| Vendor booking | none | — |
| Dispatch page "Internal estimate" | rough guide | rate card × the vendor's declared weight |
| Agent item result, lithium | recommended price and its breakdown | decision engine (Config, Market prices, vendor's margin tier) |
| Agent item result, other batteries | rate × weight | rate card, with the agent's measured weight |
| Agent offer screen | recommended total, and the agreed price | sum of the lines; the agreed price comes from the call to the office |
| Vendor offer, payout, receipt, invoice | one amount | the price offered (agreed or recommended) |
| Admin pickup page | offered, engine recommended, agent's note | the offer; the last two are internal |
| Agent's own fee | ₹150 + ₹20 per line | a fixed placeholder |
| Certificate | no money | kg recovered (recycler's figures, or the engine's estimate) |

For the pilot the engine only **recommends**. The office agrees the real price
by phone. The vendor never sees the recommendation.

## 6. Tags, boxes and runs

- A **tag** is a sticker that identifies a **battery line**. The office prints
  them; the agent sticks one on at collection.
- A **box** is a reusable crate with a permanent QR code. It identifies the
  **container**. It leaves the hub empty in the van and comes back full; nobody
  delivers it to the vendor.
- A **run** is one agent's route for one day. Scanning a box at the start puts
  it "in the van", and each tag stuck on during the run records that box. One box
  can carry lines from several pickups on the same run.
- A job that is not on a run has no box. That is allowed today (see section 7).

## 7. Open questions for the company

These are built as options or left open until the company decides:

1. **Inspector and collector.** A different agent can now be assigned to
   collect. Should collectors be a separate kind of agent (with vans and
   boxes)? Who gets the agent fee when two agents share a job? Should the
   collector redo the safety checklist? Today the collector gets the fee, and the
   checklist done at inspection covers the pickup.
2. **Boxes.** Must every collection go into a box, or only collections on a run?
   Today only run collections use boxes.
3. **Recycler paperwork.** Should the office upload the recycler's report (and
   the weight the recycler received) when reconciling a manifest?

## 8. Testing with the demo data

Accounts (all passwords `demo1234` except the vendor's):

| App | Login | Password |
|---|---|---|
| Vendor | business@test | businesstest |
| Agent | agent@test (Ravi Kumar) | demo1234 |
| Agent, on duty | agent2@test (Neha Verma) | demo1234 |
| Agent, off duty | agent3@test (Mohit Sharma) | demo1234 |
| Admin | admin@test | demo1234 |

`npm run demo-stage` lists every pickup with its stage and what is blocking it.
Run `npm run reset-demo` before a demo (it is a shared database, so tell the team
first); the seed is dated on the day it runs, so an old seed makes the agent's
day view read 0.

| Pickup | Stage | Use it to try |
|---|---|---|
| 101 | requested | Dispatch a request; also groups with 115 into a run |
| 102 | scheduled | Arrived → safety → intake, as Ravi |
| 103 | arrived | Intake and pricing (checklist already done) |
| 104 | offered | Vendor accepts or declines; agent sees "View offer" |
| 105 | collected | Hub drop-off; one line untagged; its tagged line is in box BX-A001W |
| 106, 113 | tested | Hub batch, manifests |
| 107 | processed | Reconcile a received manifest |
| 108 | recovered | Certify |
| 109 | certified | A finished certificate |
| 110 | cancelled | Rebook a cancelled pickup |
| 111, 112 | requested | Dispatch; 111 is far away (not grouped) |
| 114 | requested | A rebooked pickup still carrying its old agent |
| 115 | requested | Same-day group with 101 |
| 116 | tested | Second life (see below) |

**To see a second-life certificate (116):** Manifests → New → pick the
refurbisher (Evergreen) and 116's line → Dispatch → Confirm received → Reconcile
with an outcome note → Lifecycle → Certify 116. The vendor's certificate then
shows 180 kg sent for second life and no metals.
