# Batch 0B — the one schema migration (B's runbook)

**Owner:** B (Khalid) · **Budget:** ~half a day · **Blocks:** A's booking flow
(A4) and RLS (A3). Nothing else in the project.

This is the detailed version of §3B in `PLAN_V2_CUSTOMER_APP.md`. Everything
below is **paste-ready and already validated** — the schema in §2 was run through
`prisma validate` on 2026-08-07 and passed. You should not have to design
anything; if you find yourself designing, something is wrong with this doc — say
so rather than improvising, because A is coding against these exact shapes.

**Why this batch is big:** it is deliberately one migration covering all three
apps, so that nobody in this project ever waits on a schema change again. Every
stall we have had was the same stall. The test of whether it worked: **if the
Agent or Admin app later needs a migration, this batch was scoped wrong.**

---

## 1. Before you start

1. **Wait for `feat/turborepo` (Batch 0A, A's) to merge.** The schema moves to
   `packages/database/prisma/schema.prisma`. You can write everything below
   before then — just don't run the migration until the move has landed, or you
   will migrate a file that is about to be relocated.
2. Branch: `feat/schema-v2`.
3. Confirm you are pointed at the right database — `DATABASE_URL` in `.env`.

**If 0A is delayed and you want to start anyway:** the schema path is still
`prisma/schema.prisma`. Apply there, and A will move the folder wholesale during
0A. A moves files, you edit contents — the conflict surface is near zero.

---

## 2. The schema

Replace **everything from the `// ── Enums ──` comment onwards** (i.e. the whole
vendor-app section, currently lines 133–288). **Leave lines 1–132 untouched** —
that is the parked decision-engine section (`BatteryPack`, `BatteryInspection`,
`BatteryDiagnostic`, `MarketPrices`, `PathwayFactor`, `PathwayDecision`,
`Chemistry`, `Pathway`). It belongs to the later Field Agent app and is not ours
to edit.

⚠ **Two enums look similar — do not mix them up.** `Chemistry`
(`LFP/NMC622/NMC811/LCO`) belongs to the parked engine. **`BatteryType`
(`li_ion_nmc`, `lead_acid`, …) is the one this app uses.** `BatteryItem.chemistry`
is typed `BatteryType`.

```prisma
// ── Enums ────────────────────────────────────────────────────────────────────

enum VendorType {
  individual
  fleet
}

enum KycStatus {
  pending
  submitted
  verified
  rejected
}

enum PickupStatus {
  requested
  scheduled
  collected
  tested
  processed
  recovered
  certified
  cancelled
}

enum BatteryType {
  li_ion_nmc
  li_ion_lfp
  li_ion_nca
  lead_acid
  nimh
  other
}

enum RecoveryPathway {
  recycle
  refurbish
  reuse
  dispose
}

enum UserRole {
  customer
  agent
  admin
}

enum BatteryCategory {
  portable
  automotive
  industrial
  ev
}

enum BatteryCondition {
  healthy
  swollen
  leaking
  dead
}

enum AddressStatus {
  operational
  not_operational
}

enum PaymentStatus {
  pending
  processing
  paid
  failed
}

enum PaymentMethod {
  upi
  bank_transfer
  wallet
  cash
}

enum WalletTxnKind {
  payout
  redemption
  adjustment
}

enum ManifestStatus {
  draft
  dispatched
  received
  reconciled
}

// ── Models ───────────────────────────────────────────────────────────────────

model Profile {
  id         String     @id @db.Uuid
  vendorType VendorType @map("vendor_type")
  // Drives which app a session may enter. Middleware reads this.
  role       UserRole   @default(customer)

  fullName      String  @map("full_name")
  email         String
  phone         String?
  // Collected at signup now; flipped true when we add SMS OTP later.
  phoneVerified Boolean @default(false) @map("phone_verified")

  companyName     String? @map("company_name")
  gstNumber       String? @map("gst_number")
  panNumber       String? @map("pan_number")
  businessAddress String? @map("business_address")
  eprRegId        String? @map("epr_reg_id")

  kycStatus  KycStatus @default(pending) @map("kyc_status")
  kycDocUrls String[]  @map("kyc_doc_urls")

  // Denormalised cache of sum(wallet_txns.delta_paise). WalletTxn is the source
  // of truth; always write both in one transaction (same pattern as
  // pickups.status vs status_events).
  walletBalancePaise Int @default(0) @map("wallet_balance_paise")

  // agent-only (null for customer/admin) — used by the Agent app
  agentZone       String?   @map("agent_zone")
  agentVehicle    String?   @map("agent_vehicle")
  safetyTrainedAt DateTime? @map("safety_trained_at")
  agentRating     Decimal?  @map("agent_rating") @db.Decimal(3, 2)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  // Two relations to Pickup (as vendor, as assigned agent) so both MUST be
  // named — Prisma cannot disambiguate them otherwise.
  pickups         Pickup[]      @relation("VendorPickups")
  assignedPickups Pickup[]      @relation("AgentPickups")
  addresses       Address[]
  offers          Offer[]
  certificates    Certificate[]
  payments        Payment[]
  walletTxns      WalletTxn[]
  invoices        Invoice[]

  @@index([role])
  @@map("profiles")
}

model Address {
  id        String @id @default(uuid())
  profileId String @map("profile_id") @db.Uuid

  label   String // "Warehouse", "Home", "Depot 2"
  line1   String
  line2   String?
  city    String
  state   String
  pincode String

  // Captured from navigator.geolocation at add-time. Nullable: manual entry
  // must stay possible when the user denies location permission.
  lat Decimal? @db.Decimal(10, 7)
  lng Decimal? @db.Decimal(10, 7)

  status    AddressStatus @default(operational)
  isDefault Boolean       @default(false) @map("is_default")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  profile Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  pickups Pickup[]

  @@index([profileId])
  @@map("addresses")
}

// A Pickup is now a HEADER row: who, where, when, which category, which agent.
// The battery detail lives in BatteryItem (company build doc §6).
model Pickup {
  id       String  @id
  vendorId String  @map("vendor_id") @db.Uuid
  agentId  String? @map("agent_id") @db.Uuid

  // Customer picks category at booking; the agent tags chemistry per item
  // on-site. Two different questions — see COMPANY_FLOW_REVIEW.
  category  BatteryCategory @default(portable)
  addressId String?         @map("address_id")

  // ── Superseded by BatteryItem. Nullable now, kept so existing rows and the
  // old request form don't break during the transition. Do not build new
  // reads against these three. ──
  batteryType    BatteryType?
  approxQuantity String?      @map("approx_quantity")
  approxWeightKg Decimal?     @map("approx_weight_kg")

  // Free-text address. Still required; backfilled into Address by the seed.
  location String

  preferredDate DateTime? @map("preferred_date") @db.Date
  scheduledSlot DateTime? @map("scheduled_slot")
  etaMinutes    Int?      @map("eta_minutes")

  // Shown to the customer at booking, before any agent sees the request.
  indicativeQuotePaise Int?               @map("indicative_quote_paise")
  // Customer's own self-report. The agent's assessment is per-item.
  conditionFlags       BatteryCondition[] @map("condition_flags")

  notes       String?
  photoUrls   String[] @map("photo_urls")
  publicToken String   @unique @default(dbgenerated("gen_random_uuid()")) @map("public_token") @db.Uuid

  status PickupStatus @default(requested)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  vendor          Profile          @relation("VendorPickups", fields: [vendorId], references: [id])
  agent           Profile?         @relation("AgentPickups", fields: [agentId], references: [id])
  address         Address?         @relation(fields: [addressId], references: [id])
  items           BatteryItem[]
  statusEvents    StatusEvent[]
  offer           Offer?
  certificate     Certificate?
  payment         Payment?
  receipt         PickupReceipt?
  invoice         Invoice?
  safetyChecklist SafetyChecklist?

  @@index([vendorId])
  @@index([agentId])
  @@index([status])
  @@index([createdAt(sort: Desc)])
  @@map("pickups")
}

// THE centre of this rework. One row per battery line in a request.
// Two halves: what the customer declared, and what the agent confirmed on site.
model BatteryItem {
  id       String @id @default(uuid())
  pickupId String @map("pickup_id")

  // ── Customer-declared at booking ──
  category  BatteryCategory
  quantity  Int              @default(1)
  weightKg  Decimal?         @map("weight_kg") @db.Decimal(8, 2)
  condition BatteryCondition @default(healthy)
  photoUrls String[]         @map("photo_urls")

  // ── Agent-confirmed on site (all null until collection) ──
  chemistry          BatteryType?
  confirmedWeightKg  Decimal?          @map("confirmed_weight_kg") @db.Decimal(8, 2)
  confirmedCondition BatteryCondition? @map("confirmed_condition")
  agentPhotoUrls     String[]          @map("agent_photo_urls")
  recordedBy         String?           @map("recorded_by") @db.Uuid
  recordedAt         DateTime?         @map("recorded_at")

  // ── Pricing (paise, integers only — never floats for money) ──
  unitPricePaise Int? @map("unit_price_paise")
  linePricePaise Int? @map("line_price_paise")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  pickup Pickup @relation(fields: [pickupId], references: [id], onDelete: Cascade)

  @@index([pickupId])
  @@map("battery_items")
}

// Drives both the customer's indicative quote and the agent's payout.
// A row with null chemistry/condition is the category-wide fallback.
model PricingRate {
  id String @id @default(uuid())

  category  BatteryCategory
  chemistry BatteryType?
  condition BatteryCondition?

  ratePerKgPaise   Int  @map("rate_per_kg_paise")
  ratePerUnitPaise Int? @map("rate_per_unit_paise")
  // Basis points, 10000 = 1.00x. Integer so money math never touches a float.
  conditionMultiplierBp Int @default(10000) @map("condition_multiplier_bp")

  isActive      Boolean   @default(true) @map("is_active")
  effectiveFrom DateTime  @default(now()) @map("effective_from")
  effectiveTo   DateTime? @map("effective_to")

  createdAt DateTime @default(now()) @map("created_at")

  @@index([category, isActive])
  @@map("pricing_rates")
}

// Append-only event log. NEVER update a row here — insert a new one.
// pickups.status is the denormalised fast-read cache of the latest event.
model StatusEvent {
  id         BigInt       @id @default(autoincrement())
  pickupId   String       @map("pickup_id")
  status     PickupStatus
  actorId    String?      @map("actor_id") @db.Uuid
  actorRole  String?      @map("actor_role")
  notes      String?
  // Chain-of-custody (company doc §5.3): where + photo proof per transition.
  lat        Decimal?     @db.Decimal(10, 7)
  lng        Decimal?     @db.Decimal(10, 7)
  photoUrls  String[]     @map("photo_urls")
  occurredAt DateTime     @default(now()) @map("occurred_at")

  pickup Pickup @relation(fields: [pickupId], references: [id])

  @@index([pickupId])
  @@index([occurredAt])
  @@map("status_events")
}

model Offer {
  id       BigInt @id @default(autoincrement())
  pickupId String @unique @map("pickup_id")
  vendorId String @map("vendor_id") @db.Uuid

  pathway           RecoveryPathway
  // PAISE. 18450000 = ₹1,84,500. See packages/core formatOfferPrice().
  estimatedPrice    Int             @map("estimated_price")
  rationale         String
  materialBreakdown Json            @default("[]") @map("material_breakdown")
  deductions        Json            @default("[]")

  createdAt DateTime @default(now()) @map("created_at")

  pickup Pickup  @relation(fields: [pickupId], references: [id])
  vendor Profile @relation(fields: [vendorId], references: [id])

  @@index([vendorId])
  @@map("offers")
}

model Payment {
  id       String @id @default(uuid())
  pickupId String @unique @map("pickup_id")
  vendorId String @map("vendor_id") @db.Uuid

  amountPaise Int           @map("amount_paise")
  method      PaymentMethod @default(upi)
  status      PaymentStatus @default(pending)

  // Populated only when PAYMENTS_MODE=razorpay. Null in simulated mode.
  gatewayRef   String?   @map("gateway_ref")
  gatewayOrder String?   @map("gateway_order")
  paidAt       DateTime? @map("paid_at")
  failureNote  String?   @map("failure_note")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  pickup Pickup  @relation(fields: [pickupId], references: [id])
  vendor Profile @relation(fields: [vendorId], references: [id])

  @@index([vendorId])
  @@map("payments")
}

// Append-only ledger. profiles.wallet_balance_paise is the cache.
model WalletTxn {
  id        String @id @default(uuid())
  profileId String @map("profile_id") @db.Uuid

  deltaPaise        Int           @map("delta_paise") // signed: +credit / -debit
  kind              WalletTxnKind
  balanceAfterPaise Int           @map("balance_after_paise")
  pickupId          String?       @map("pickup_id")
  note              String?

  createdAt DateTime @default(now()) @map("created_at")

  profile Profile @relation(fields: [profileId], references: [id])

  @@index([profileId, createdAt(sort: Desc)])
  @@map("wallet_txns")
}

// Company doc §4 step 4: the receipt handed over AT COLLECTION.
// This is NOT the EPR certificate — that comes at step 8, after recycling.
model PickupReceipt {
  id       String @id @default(uuid())
  pickupId String @unique @map("pickup_id")

  receiptNo   String  @unique @map("receipt_no")
  pdfUrl      String? @map("pdf_url")
  publicToken String  @unique @default(dbgenerated("gen_random_uuid()")) @map("public_token") @db.Uuid

  totalWeightKg Decimal @map("total_weight_kg") @db.Decimal(10, 2)
  itemCount     Int     @map("item_count")
  amountPaise   Int?    @map("amount_paise")

  agentId     String?  @map("agent_id") @db.Uuid
  capturedLat Decimal? @map("captured_lat") @db.Decimal(10, 7)
  capturedLng Decimal? @map("captured_lng") @db.Decimal(10, 7)

  collectedAt DateTime @default(now()) @map("collected_at")

  pickup Pickup @relation(fields: [pickupId], references: [id])

  @@map("pickup_receipts")
}

model Certificate {
  id       BigInt @id @default(autoincrement())
  pickupId String @unique @map("pickup_id")
  vendorId String @map("vendor_id") @db.Uuid

  pdfUrl      String @map("pdf_url")
  publicToken String @unique @default(dbgenerated("gen_random_uuid()")) @map("public_token") @db.Uuid

  totalWeightKg   Decimal  @map("total_weight_kg")
  materialSummary Json     @default("[]") @map("material_summary")
  // Impact dashboard. See §6 — this number needs a cited source before demo.
  co2AvoidedKg    Decimal? @map("co2_avoided_kg") @db.Decimal(10, 2)

  certifiedAt DateTime @default(now()) @map("certified_at")

  pickup Pickup  @relation(fields: [pickupId], references: [id])
  vendor Profile @relation(fields: [vendorId], references: [id])

  @@index([vendorId])
  @@map("certificates")
}

// pickupId null = a consolidated invoice covering a period (fleet accounts).
model Invoice {
  id       String  @id @default(uuid())
  vendorId String  @map("vendor_id") @db.Uuid
  pickupId String? @unique @map("pickup_id")

  number String @unique

  periodStart DateTime? @map("period_start") @db.Date
  periodEnd   DateTime? @map("period_end") @db.Date

  subtotalPaise Int @map("subtotal_paise")
  taxPaise      Int @default(0) @map("tax_paise")
  totalPaise    Int @map("total_paise")

  pdfUrl   String?  @map("pdf_url")
  issuedAt DateTime @default(now()) @map("issued_at")

  vendor Profile @relation(fields: [vendorId], references: [id])
  pickup Pickup? @relation(fields: [pickupId], references: [id])

  @@index([vendorId])
  @@map("invoices")
}

// ── Below: scaffolded for the Agent + Admin apps so neither needs a second
// migration. No customer-app screen reads these. Seed one row each and move on.

model Facility {
  id       String   @id @default(uuid())
  name     String
  location String
  lat      Decimal? @db.Decimal(10, 7)
  lng      Decimal? @db.Decimal(10, 7)

  capacityKg Decimal? @map("capacity_kg") @db.Decimal(10, 2)
  isActive   Boolean  @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")

  manifests DispatchManifest[]

  @@map("facilities")
}

model Recycler {
  id        String @id @default(uuid())
  name      String
  cpcbRegNo String @unique @map("cpcb_reg_no")

  acceptedChemistries BatteryType[] @map("accepted_chemistries")
  capacityKg          Decimal?      @map("capacity_kg") @db.Decimal(10, 2)
  isActive            Boolean       @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")

  manifests DispatchManifest[]

  @@map("recyclers")
}

model DispatchManifest {
  id         String @id @default(uuid())
  facilityId String @map("facility_id")
  recyclerId String @map("recycler_id")

  manifestNo String         @unique @map("manifest_no")
  status     ManifestStatus @default(draft)

  // BatteryItem ids in this dispatch. Json rather than a join table because a
  // manifest is an immutable snapshot once dispatched — it must not change when
  // the underlying items do.
  itemIds Json @default("[]") @map("item_ids")

  totalWeightKg Decimal?  @map("total_weight_kg") @db.Decimal(10, 2)
  dispatchedAt  DateTime? @map("dispatched_at")
  confirmedAt   DateTime? @map("confirmed_at")

  createdAt DateTime @default(now()) @map("created_at")

  facility Facility @relation(fields: [facilityId], references: [id])
  recycler Recycler @relation(fields: [recyclerId], references: [id])

  @@index([status])
  @@map("dispatch_manifests")
}

model SafetyChecklist {
  id       String @id @default(uuid())
  pickupId String @unique @map("pickup_id")
  agentId  String @map("agent_id") @db.Uuid

  // { terminalsInsulated: bool, fireSafeCrate: bool, noMixedChemistry: bool, ... }
  items  Json    @default("{}")
  passed Boolean @default(false)

  completedAt DateTime @default(now()) @map("completed_at")

  pickup Pickup @relation(fields: [pickupId], references: [id])

  @@map("safety_checklists")
}
```

---

## 3. Migration safety — read before running

Every change above is **additive or a widening**, so it applies cleanly to a
table with rows. Specifically:

| Change | Safe because |
|---|---|
| `Pickup.batteryType` required → optional | Widening. Existing values survive. |
| `Pickup.approxQuantity` required → optional | Same. |
| New array columns (`conditionFlags`, `photoUrls`) | Postgres defaults them to `{}`. |
| New nullable columns | No backfill needed. |
| New tables | Nothing to migrate. |

⚠ **One thing to be aware of:** `Pickup.category` is **NOT NULL with
`@default(portable)`**. Existing rows will silently become `portable`, which is
wrong for some of them. This is fine *only because the seed is being rewritten in
this same batch* — no real row inherits a bad value. If you decide to keep any
existing production-ish rows, fix their category by hand after migrating.

Run it:

```bash
npx prisma migrate dev --name schema_v2_battery_items
npx prisma generate
```

Name the migration exactly that — A's plan references it.

---

## 4. Storage buckets

Create in the Supabase dashboard (or SQL). All **private**; access goes through
signed URLs.

| Bucket | Written by | Read by |
|---|---|---|
| `pickup-photos` | customer (booking), agent (on-site) | customer, agent, admin |
| `kyc-docs` | customer | admin |
| `certificates` | server (service role) | customer |
| `receipts` | server (service role) | customer |
| `invoices` | server (service role) | customer |

**Bucket creation is yours; the RLS/storage policies are A's (task A3).** Just
make the buckets exist and tell A the names — don't write the policies, you'll
collide with A's `policies.sql`.

---

## 5. Seed rewrite

The current seed's biggest problem: it uses **fake vendor UUIDs**, so screens
render empty for the account you actually log in as. That has burned time
repeatedly. **Every seeded row must belong to a real Supabase auth user.**

Seed this:

- **Profiles** — the existing real customer (`business@test`,
  `efc87c57-1659-4de1-98af-86c2068b65e2`, `role: customer`), plus **one agent**
  (`role: agent`, zone/vehicle/`safetyTrainedAt` set) and **one admin**
  (`role: admin`). Create the agent + admin as real auth users too, so the Agent
  and Admin apps have something to log into on day 3.
- **Addresses** — two for the customer, one `isDefault: true`.
- **Pickups — one per lifecycle stage**, so every screen state is reachable
  without hand-editing the DB: `requested`, `scheduled` (agent assigned + ETA),
  `collected` (+ `PickupReceipt` + `Payment(paid)` + `WalletTxn`), `tested`,
  `processed`, `recovered` (+ `Offer` with `materialBreakdown`), `certified`
  (+ `Certificate` with `co2AvoidedKg`), `cancelled`.
- **BatteryItems** — 2–3 per pickup, mixed categories. At least one pickup with
  a `swollen` or `leaking` item so the condition path is visible.
- **StatusEvents** — a full chain per pickup, with `lat`/`lng` set, so the
  chain-of-custody timeline has something to render.
- **PricingRates** — the table in §6.
- **One `Facility`, one `Recycler`** (with a plausible CPCB reg number).

`prisma/reset-demo.ts` already exists — extend it rather than writing a new one.

---

## 6. PricingRate seed values

⚠ **These are demo placeholders, not market data.** They are the right order of
magnitude for Indian battery scrap so the demo reads as plausible. Do not present
them to the company as researched rates.

| Category | Chemistry | ₹/kg | `ratePerKgPaise` |
|---|---|---|---|
| `automotive` | `lead_acid` | ₹85 | `8500` |
| `industrial` | `lead_acid` | ₹80 | `8000` |
| `portable` | `li_ion_nmc` | ₹210 | `21000` |
| `portable` | `li_ion_lfp` | ₹150 | `15000` |
| `portable` | *(null — fallback)* | ₹120 | `12000` |
| `ev` | `li_ion_nmc` | ₹250 | `25000` |
| `ev` | `li_ion_lfp` | ₹180 | `18000` |
| `ev` | *(null — fallback)* | ₹200 | `20000` |
| `automotive` | *(null — fallback)* | ₹70 | `7000` |
| `industrial` | *(null — fallback)* | ₹75 | `7500` |

Condition multipliers (`conditionMultiplierBp`, 10000 = 1.00×):

| Condition | bp | Why |
|---|---|---|
| `healthy` | `10000` | baseline |
| `dead` | `8500` | **a dead battery still has full material value** — it is not damaged, just discharged/end-of-life. Only a small handling discount. |
| `swollen` | `7000` | needs careful handling + a fire-safe crate |
| `leaking` | `5000` | hazardous handling, possible partial loss |

**For B4 (CO₂ on the dashboard):** put the constants in one exported table with a
`// Source:` comment above it. Rough industry figures are ~1–2 kg CO₂e avoided
per kg of lead-acid recycled and ~5–15 kg CO₂e per kg of Li-ion. **Pick a value,
cite where you got it, and keep the citation in the code** — this is a
compliance-adjacent claim the company may repeat to a client. Do not invent a
number with no source.

---

## 7. The A↔B contract — pin these signatures

A is building the booking flow against these **exact** shapes and will stub them
in `packages/core/src/mock-data.ts` until you ship. **If you change a name or a
type here, tell A the same day** — this is the one place the two lanes touch.

Put these in `packages/core/src/booking.ts`:

```ts
import type { BatteryCategory, BatteryCondition, PricingRate } from "@clbipp/database"

// One line in the booking form. Maps 1:1 to a BatteryItem row on submit.
export type BookingLineItem = {
  category: BatteryCategory
  quantity: number
  weightKg: number | null
  condition: BatteryCondition
  photoUrls: string[]
}

export type QuoteLine = {
  index: number          // position in the input array
  linePaise: number
  basis: "per_kg" | "per_unit"
  note: string | null    // qualitative, safe to show the customer
}

export type QuoteResult = {
  totalPaise: number
  lines: QuoteLine[]
  disclaimer: string     // e.g. "Indicative only. Final value confirmed on inspection."
}

// PURE. No DB, no async — rates are passed in. This is what makes it
// unit-testable and what lets A stub it trivially.
export function estimateQuote(
  items: BookingLineItem[],
  rates: PricingRate[],
): QuoteResult

// Thin DB wrapper around the above. A calls this one from the quote step.
export async function getQuote(items: BookingLineItem[]): Promise<QuoteResult>
```

And the server action (`packages/core/src/booking-actions.ts` or an app-local
`actions.ts` — your call, just tell A which):

```ts
export type CreatePickupInput = {
  category: BatteryCategory        // the header category (step 1)
  addressId: string
  items: BookingLineItem[]
  preferredDate: string | null     // "YYYY-MM-DD"
  scheduledSlot: string | null     // ISO datetime
  notes: string | null
  indicativeQuotePaise: number | null
}

export type CreatePickupResult =
  | { ok: true; pickupId: string }
  | { ok: false; error: string }

// Writes Pickup + BatteryItem[] + the initial 'requested' StatusEvent in ONE
// prisma.$transaction. Generates the PKP-YYYY-XXXXXX id server-side.
export async function createPickupWithItems(
  input: CreatePickupInput,
): Promise<CreatePickupResult>
```

Three things that must hold, because A's screens assume them:

1. **All money is integer paise.** Never a float, never rupees.
2. **`createPickupWithItems` is one transaction.** A partial write (pickup with
   no items) breaks every downstream screen.
3. **It writes the initial `StatusEvent`** — the tracking timeline and Realtime
   both key off that row existing.

---

## 8. Your runbook

- [ ] **B1** — Wait for `feat/turborepo`. Branch `feat/schema-v2`.
- [ ] **B1** — Paste §2 over the vendor section. `npx prisma validate`.
- [ ] **B1** — `npx prisma migrate dev --name schema_v2_battery_items`.
- [ ] **B1** — Create the five Storage buckets (§4). Tell A the names.
- [ ] **B1** — Rewrite the seed (§5) + PricingRates (§6). **Tell A the moment
      this lands** — it unblocks A3 and A4.
- [ ] **B2** — `estimateQuote` (§7), pure, **with Vitest tests**. Depends on
      nothing. Do this next; it is what A is stubbing.
- [ ] **B2** — `createPickupWithItems`, one transaction.
- [ ] **B3** — `@react-pdf/renderer`; three templates: EPR certificate, pickup
      receipt, invoice → render to buffer → Storage → URL on the row.
      Cert number: `CERT-{YEAR}-{pickupId}-{category}`.
- [ ] **B4** — Dashboard impact: CO₂, materials recovered, wallet balance.
- [ ] **B5** — Compliance CSV export (`papaparse`, already installed).
- [ ] **B6** — Payment + WalletTxn server actions behind
      `PAYMENTS_MODE=simulated|razorpay`; payment + wallet screens.
- [ ] **B7** — Reword the "we'll notify you at each stage" copy in
      `track/[id]/page.tsx`, `submitted/page.tsx`, `handover/page.tsx`,
      `scheduled/page.tsx`. We have no SMS channel; the copy should describe
      in-app tracking.

**B2 through B7 have no dependency on A at all.** If A is unavailable, keep
going straight down the list.

---

## 9. Definition of done for 0B

- [ ] `npx prisma validate` passes
- [ ] Migration applied; `npx prisma generate` clean
- [ ] `npm run build` still green
- [ ] Seed runs and logging in as `business@test` shows **a pickup at every
      lifecycle stage**, each with real `BatteryItem` rows
- [ ] An agent account and an admin account exist and can log in
- [ ] The five Storage buckets exist and A has the names
- [ ] §7's signatures are exported (even if stubbed) so A can import them
