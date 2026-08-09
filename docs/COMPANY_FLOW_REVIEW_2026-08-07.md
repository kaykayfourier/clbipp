# Company flow-document review — 2026-08-07

**Source document:** `docs/markdown-preview.pdf` — "Battery Waste Collection App —
Documentation (Based on the EpiCircle scrap-collection model)". Sent to the team
by company HR after the company reviewed our first vendor-app draft. Described to
us as the flow the company intends for the app, with "minor tweaks".

**Status: PROPOSED — nothing confirmed, nothing built.** This note is analysis
only. No code and no schema was changed. A summary of the list below was sent to
the company for confirmation; work starts only after they reply. See "Open
questions" at the end.

---

## Scope

The document describes **three** components (§3), which map onto our three
surfaces:

| Doc | Ours |
|---|---|
| A. Customer App | Vendor / Client app — **this sprint** |
| B. Partner App ("Battery Warrior") | Field Agent app — later |
| C. Admin / Compliance Dashboard | Admin dashboard — later |

Everything below covers **§3.A only**, plus the customer-visible parts of §4
(end-to-end flow) and §5 (key design differences). §3.B and §3.C are the two
parked apps.

---

## §3.A Customer App — the six required capabilities

### 1. Book pickup: photo + category selection — **partial, two gaps**

Doc asks for a photo of the battery plus a category: portable / automotive /
industrial / EV.

- **Category is missing.** `src/app/(app)/request-pickup/page.tsx` (L14–24) asks
  for battery **chemistry** (Li-ion NMC/LFP/NCA, lead-acid, NiMH, other), backed
  by the `BatteryType` enum in `prisma/schema.prisma` (L158–165). Chemistry is a
  different axis from category — see "Category vs chemistry" below.
- **Photo upload does not exist.** `photoUrls` is hardcoded `[]` at L75 and
  `photo_urls: []` at L122. The `photo_urls` column exists (`schema.prisma` L214)
  and is never written. No Storage bucket, no upload UI.

### 2. Indicative quote + condition flags — **missing**

- Our `/offer` is the *post-assessment* offer (an `Offer` row created by someone
  else). The doc wants a value estimate shown **at booking time**, weight- or
  unit-based. Today the vendor submits and waits.
- **Condition flags (leaking / swollen / dead) do not exist** anywhere — no UI,
  no column on `Pickup`. The doc ties these to a different handling path (§5.2).

### 3. Real-time tracking of the assigned partner — **partial**

`src/app/(app)/track/[id]/page.tsx` + Realtime on `status_events` tracks
**status**, not a **partner**. No assigned-agent identity, no ETA, no location.
`Pickup` has no agent/assignment field.

### 4. Digital invoice + disposal certificate — **partial**

- Certificate exists (`src/app/(app)/certificates/[id]/page.tsx` + compliance
  log), but the "Download PDF" button (L89) is inert and `Certificate.pdfUrl` is
  never used.
- **Invoice does not exist** — no screen, no model.

### 5. Wallet (cash payout / redeemable rewards) — **missing**

Nothing. No wallet, payout, or rewards concept. Note the doc itself scopes
gamified rewards to the *individual* segment (§5.4). Already on our deferred list
in `CONTEXT.md` ("Green points / coupon / rewards system").

### 6. Personal impact dashboard — **partial**

`src/app/(app)/dashboard/page.tsx` (L35–54) shows Pickups / Recovered kg /
Certificates. Missing: **materials-recovered breakdown** on the dashboard, and
**CO₂ avoided**, which appears nowhere in the app.

---

## §5 Key design differences — flow-shaped gaps

1. **Category-first UX (§5.1).** The doc is explicit that the *first* screen in
   the booking flow asks "what kind of battery?", with photo-based AI assist,
   *"because pricing, safety handling, and the eventual recycler all depend on
   this."* Ours is one flat form with battery type as one of six fields. This is
   a restructure, not a field addition.
2. **Condition flagging (§5.2)** — missing, as above.
3. **Chain-of-custody by default (§5.3).** Doc wants an immutable record per
   pickup: timestamp, GPS, photos, weight, category. We have `status_events`
   (timestamp + status + actor) — right skeleton, but no GPS, photos, or
   per-event weight/category.
4. **Two customer segments, two flows (§5.4)** — see the dedicated section below.
   Largest item on the list.
5. **Facility safety module (§5.5)** — Admin app, out of scope.
6. **Compliance dashboard as first-class (§5.6)** — Admin app. Our vendor-side
   compliance log exists.

---

## §4 End-to-end flow — the two-certificate finding

The doc has **two distinct documents**:

- **Step 4**, at collection — *"customer gets a digital pickup certificate"*
  (a chain-of-custody receipt at handover).
- **Step 8**, at the end — the EPR certificate from recycler confirmation.

We only have the second. `src/app/(app)/handover/page.tsx` ends with a message
and produces no receipt artifact.

---

## §6 Integrations named in the doc — all absent

Payment gateway / UPI, **SMS/WhatsApp notifications for pickup scheduling**, CPCB
EPR portal, AI/ML image-based battery detection.

⚠ Our copy already *promises* notifications — "We'll notify you as your battery
moves through each stage" appears in `track/[id]/page.tsx` (L191),
`submitted/page.tsx` (L72), `handover/page.tsx` (L138), `scheduled/page.tsx`
(L152) — with no notification channel behind it. In-app realtime only. Either
build a channel or reword the copy.

---

## Category vs chemistry (why this is not a rename)

They are two different questions on near-independent axes:

- **Chemistry** = what the battery is made of. Our current `BatteryType` enum.
- **Category** = what the battery is for: portable / automotive / industrial / EV.

An EV battery may be NMC *or* LFP; an industrial battery may be lead-acid *or*
Li-ion. Knowing one does not give you the other, so our current data cannot be
rolled up by category at all.

**The doc already assigns the two fields to two different people:**

- §3.A (Customer App): *"category selection: portable / automotive / industrial / EV"*
- §4 step 3 (Partner, on-site): *"partner tags chemistry (Li-ion, lead-acid,
  NiMH, etc.), condition (healthy/swollen/leaking), and photographs it for the
  audit trail"*

So the intended split is: **customer picks category at booking; the field agent
confirms chemistry on-site.** Our form currently asks the customer the field
agent's question and never asks them their own.

Why category specifically matters, per the doc: the vendor can actually answer it
(§5.1 even asks for AI assist for non-technical users); EPR reporting is done by
category (§2 — *"kg collected by category, recycler destination, EPR certificates
generated"*); and category determines recycler routing and transport handling.

**Implication:** adding `category` to `Pickup` is a schema change → **B's call**.
The form restructure on top of it is **C's**.

---

## Fleet vs individual — is the split real?

Position (A's analysis, for team discussion — not decided):

**Yes, the split is genuine and long-term significant — but the significant part
is the data model, not two separate UIs.**

### Reasons that hold up

1. **The compliance document is a product for one segment and decoration for the
   other.** A household has no EPR obligation. A telecom-tower operator, EV
   fleet, or UPS company has auditors and client contracts requiring proof that
   hazardous waste reached a registered recycler. The doc says this in §3.A:
   certificates are *"important for businesses/RWAs for their own compliance."*
2. **Money flows in opposite directions.** Individual: we pay them, instantly,
   small amounts. Bulk: negotiated rates, invoicing, payment terms — plus the
   §2.1 B2B stream where producers/OEMs pay *us* for EPR credits.
3. **A fleet request does not fit in our `Pickup` row.** `schema.prisma`
   (L204–231) encodes *one vendor, one address, one date, one battery type, one
   pickup*: `location` is a single string, `preferredDate` a single date,
   `batteryType` a single enum. A fleet with multiple depots, mixed chemistries
   and a standing collection cannot express itself in that row. `Offer` and
   `Certificate` are both 1:1 with `Pickup`, so an invoice covering thirty
   pickups has nowhere to live either.
4. **Scheduling model differs.** Individual is on-demand; bulk is contracted and
   recurring. Recurrence needs an entity that does not exist.

### Reason that does not hold up

**Gamification.** Rewards are a retention mechanic for high-frequency low-value
users. Real for the individual segment, but the last thing to build — not
evidence that two apps are needed.

### The app is already fleet-shaped (nobody chose this deliberately)

The shared request form is written for warehouses: address labelled **"Warehouse
address"** (L228), weight **"Total batch weight"**, placeholder *e.g. 480* kg
(L206–212), quantity placeholder *e.g. 24* units, notes hint *"Access via gate B,
contact Ravi on arrival"* (L271). An individual with three dead laptop batteries
is being asked for their warehouse address and total batch weight.

**So the incoherent path today is `individual`, not `fleet`.** We built a B2B app
and bolted an account-type selector onto the front.

### Recommendation

**Split the schema now; split the screens later.** Screens are cheap to rewrite;
a data model with live pickup rows in it is not. If `Pickup` keeps assuming
one-site / one-date / one-chemistry, retrofitting bulk later means a migration
plus touching every screen that reads it. One form with conditional sections can
serve both today and be cleaved into two flows when it is worth it.

### Counter-point from the document itself

§7.1: *"Decide your primary go-to-market wedge... Many successful battery-recycling
platforms in India end up doing both, but usually start with one."*

The doc does **not** actually ask for both flows now — it asks the company to
pick. Worth putting back to them. This is also the one place the "minor tweaks"
framing is wrong: two-segment support is a data-model change, not a tweak.

---

## Open questions sent to the company

1. **Wallet and rewards** — in this round? For which customer type?
2. **Value shown to the customer** — confirming we now surface indicative quote /
   invoice / payout value on customer screens (see rule change below).
3. **SMS/WhatsApp notifications** — build a channel, or reword the app copy?
4. **AI photo assist** — now or later?
5. **Payments (gateway / UPI)** — customer payouts in scope this round?
6. **Which segment is the go-to-market wedge** (per §7.1) — added so that the
   two-flow item can be scoped as "schema now, second flow when you pick".
7. **CO₂e emission factors — do you have CPCB-accepted ones we must use?**
   (added 2026-08-09, Batch 9.) The impact dashboard and the EPR certificate both
   state a kg-CO₂e-avoided figure. It is currently computed from a per-chemistry
   table in `packages/core/src/impact.ts` whose values are **plausible
   literature-magnitude estimates that have not been traced to a source**, and
   whose paper attributions are unverified. The relative ordering
   (Li-ion NMC ≫ LFP > lead-acid) is sound; the absolute numbers are a
   placeholder of the right shape. Since this is EPR compliance you may be
   *required* to use a specific factor set, which would make anything we source
   ourselves irrelevant — so we are waiting rather than researching. **Their
   answer is a value change in that one file** (plus the copy restated in the
   seed, which the Batch 9 drift check guards).
8. **CPCB return format** (added 2026-08-09, Batch 9) — what columns does the
   return actually want? The CSV export at `/api/exports/compliance` is one row
   per certificate with a stable column set; `COLUMNS` in
   `apps/customer/src/lib/compliance-export.ts` is the one place their answer
   lands.
9. **GST on scrap bought from an unregistered individual** (carried from Batch
   8) — does it apply, and at what rate? Every invoice currently shows
   `taxPaise: 0`. The column and the PDF line exist so the answer is a value
   change, not a schema change.

---

## Rule change recorded from this review

The "never show recovered value / material breakdown to the vendor" rule was
being carried in `CLAUDE.md`, `CONTEXT.md` and `PROJECT_STATE.md` as **locked, do
not revisit**. Per A (2026-08-07) that was always a **light rule, not a hard
one — it follows the company's ask.** The company doc asks for an indicative
quote, an invoice, and a wallet, all of which are value-facing.

The three docs have been corrected to record it as a **default that the company
can change**, pending their answer to open question 2. **No screen has been
changed** — the rule's current practical effect is unchanged until they reply.

The separate **"no recovery rate % to the vendor"** line is untouched: the company
document does not ask for it.
