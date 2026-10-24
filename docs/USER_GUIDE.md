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
| 6 | Agent app · agent | Presents the offer: the office's price if it set one, else the recommendation | offered |
| 7 | Vendor app · vendor | Accepts or declines. A decline is not final: the agent can re-offer, the office can set a new price | |
| 8 | Agent app · agent | Collects now, or books a collection date | |
| 9 | Agent app · agent | Tags each line (or the office approves one without a tag), enters the vehicle number, vendor signs, confirms | collected |
| 10 | Vendor app · vendor | Chooses UPI or bank; gets paid, receipt and invoice | |
| 11 | Agent app · agent | Drops the load at the hub, with the vehicle number | |
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

- **Sign up.** A mobile number is required (the agent calls it on the day); it
  is not verified by SMS. A fleet account gives company, GST, PAN and address;
  the EPR registration ID is optional.
- **Book a pickup.** Add each battery line with a photo. No price is shown at
  booking: the price comes after the agent's inspection.
- **The offer.** Shows the price we will pay. **Accept** it, **Decline** it
  (this does not cancel: the agent or the office can come back with another
  price, and you can still accept the one you declined), or **Talk to us**. If
  the price changes while the screen is open, **Accept** stops and shows the new
  price, so you never agree to a figure you did not see. A new price shows as
  "We have updated our offer".
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
   You do **not** type a price. If the price should change, **Call the office**:
   they set it on their screen and it appears on yours by itself ("Office price
   ₹X · set by … · reason"). Add a note if you like, then **Present ₹X**. With no
   office price, **Present recommended ₹Y**.
6. After you present, the items are **locked**. If something is wrong, call the
   office.
7. **If the vendor declines** (or wants more), the offer screen shows every
   round. **Re-offer** a new price with a note, up to the limit shown ("You can
   offer up to ₹… (10% above ₹…)"). Above that, call the office; their new price
   appears on the screen to present. The vendor's **Accept** is final: after it,
   nobody can change the price.
8. When the vendor accepts: **Collect today**, or book a later date.
9. **Collection:** put one tag from your sheet on each line. No tag for a line?
   **Ask the office**, with the reason; collection stays blocked until they
   approve (the screen updates by itself, and there is a call button). If they
   say "tag it", tag it. Enter the **vehicle number** (filled in from your run or
   your profile; change it if you came in a different vehicle). Then the vendor's
   signature and photos, and confirm.
10. **Drop off at the hub** at the end of the day. The vehicle number is filled in
    from the collection; change it if the load came in a different one.

**Notices.** Messages from the office appear at the top of your day view: a job
moved to you or away from you, a new office price, a decision on an untagged
battery. Tap **Got it** to clear one. A job moved away from you disappears from
your list.

**Runs.** If the office gave you a run, it is on your day view: open it, scan a
box to start, then visit the stops in order. Every tag you stick goes into the
box you scanned.

## 4. Admin console

- **Dispatch.** New requests, newest first. Open one and pick an agent; the list
  is ranked by who is free, how busy they are that day, then distance. Nothing
  is assigned automatically.
- **Reassign.** A scheduled job, or one with an offer that is not collected yet,
  can be moved to another agent from its dispatch page: pick from the ranked list
  and give a reason (kept in the audit log, never shown to the vendor). Both
  agents get a notice in their app. Not possible once the agent has arrived, or
  for a stop on an open run (cancel the run first). **Assignment history** on the
  dispatch and pickup pages lists every assignment with who and why.
- **Price** (on a pickup's page). The engine's recommendation, the price offered
  now and the vendor's response, every office price (who set it, why, and when
  the agent presented it), and every negotiation round from the first offer to
  the final one. **Change price** sets the office price: amount and reason. It
  does not change the offer by itself; the agent presents it. Not possible once
  the vendor has accepted.
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
- **Exceptions.** At the top, **Untagged batteries**: agents asking to collect a
  line without a tag. **Approve no tag** (the hub tags it on arrival) or **Reject
  — tag it** with a note the agent reads. Below, the items the engine flagged.
- **Config** holds the engine's settings and the **Negotiation band** (how far
  above the office or engine price an agent may re-offer; 10% by default, 0%
  sends every change to the office). **Market** holds metal prices; **Audit**
  lists every office action.
- **Vehicles.** A pickup's page shows the vehicle it was collected in and dropped
  off in, and any change the agent made to the filled-in number. The hub check-in
  page shows the batch's vehicle.

## 5. Prices: where each number comes from

| Where | Number | Comes from |
|---|---|---|
| Vendor booking | none | — |
| Dispatch page "Internal estimate" | rough guide | rate card × the vendor's declared weight |
| Agent item result, lithium | recommended price and its breakdown | decision engine (Config, Market prices, vendor's margin tier) |
| Agent item result, other batteries | rate × weight | rate card, with the agent's measured weight |
| Agent offer screen | recommended total; the office price; the re-offer limit | sum of the lines (lines on hold left out); the office's Change price; the band on Config |
| Vendor offer, payout, receipt, invoice | one amount | the latest price presented (recommended, office or re-offer) |
| Admin pickup page, Price panel | engine recommended, offered now, office prices, rounds | all internal |
| Agent's own fee | ₹150 + ₹20 per line | a fixed placeholder |
| Certificate | no money | kg recovered (recycler's figures, or the engine's estimate) |

For the pilot the engine only **recommends**. Only the office enters a different
price; the agent can move it only inside the negotiation band. The vendor never
sees the recommendation, the office price or the reasons.

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
4. **Phone verification.** The mobile number is required but not checked by SMS
   (that needs a paid SMS service and DLT registration). Is that enough?
5. **Notices on the phone.** Agents see office notices when they open the app.
   Should they get a push notification on the phone instead? (Possible for an
   installed app; on iPhone only from iOS 16.4.)
6. **Negotiation band.** Is 10% above the office or engine price the right limit
   for an agent's re-offer? It can be changed on Config.
7. **Untagged batteries.** Collection now waits for the office to approve a line
   without a tag. Is a hard stop right, or should the agent be able to proceed and
   the office review afterwards?
8. **Reassigning.** Allowed before the agent arrives, and for an offer not yet
   collected. Should the office also be able to reassign a job the agent is
   standing at, or a whole run?

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
| 103 | arrived | Intake and pricing (checklist already done); the offer screen before presenting; Reassign says why it cannot |
| 104 | offered | Vendor accepts or declines; agent re-offers; office sets a price (admin Price panel); Reassign |
| 105 | collected | Hub drop-off with the vehicle number; one line left untagged with the office's approval; its tagged line is in box BX-A001W |
| 106, 113 | tested | Hub batch, manifests |
| 107 | processed | Reconcile a received manifest |
| 108 | recovered | Certify |
| 109 | certified | A finished certificate |
| 110 | cancelled | Rebook a cancelled pickup |
| 111, 112 | requested | Dispatch; 111 is far away (not grouped) |
| 114 | requested | A rebooked pickup still carrying its old agent |
| 115 | requested | Same-day group with 101 |
| 116 | tested | Second life (see below) |

**To try a negotiation (104):** Admin → Pickups → 104 → Change price (a new
amount and a reason) → agent@test → 104 → Offer: the office price appears;
present it → vendor declines → agent re-offers inside the limit → vendor
accepts. The Price panel then shows every round.

**To try an untagged battery:** take a job to *offered* and have the vendor
accept, then on the agent's collect screen → "No tag available? Ask the office"
→ Admin → Exceptions → Untagged batteries → Approve (or Reject with a note).

**To see a second-life certificate (116):** Manifests → New → pick the
refurbisher (Evergreen) and 116's line → Dispatch → Confirm received → Reconcile
with an outcome note → Lifecycle → Certify 116. The vendor's certificate then
shows 180 kg sent for second life and no metals.
