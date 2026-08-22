/**
 * Demo reset + seed (BATCH_0B_SCHEMA.md §5).
 *
 * Rule this seed exists to fix: EVERY seeded row belongs to a REAL Supabase
 * auth user. The old seed used invented vendor UUIDs, so screens rendered empty
 * for the account you actually logged in as — that burned time repeatedly.
 *
 * Seeds one pickup at every lifecycle stage so every screen state is reachable
 * without hand-editing the database.
 *
 * Run: npm run reset-demo
 */
import { createClient } from "@supabase/supabase-js"
import { prisma } from "../src/client"
import type { BatteryCategory, BatteryCondition, BatteryType, PickupStatus } from "../src/generated/client"
import { loadAppEnv } from "./env"
import { solidPng, PHOTO_COLOURS } from "./placeholder-image"

const CUSTOMER_EMAIL = "business@test"
const AGENT_EMAIL = "agent@test"
const ADMIN_EMAIL = "admin@test"
// Demo-only password for the seeded agent/admin logins. Not a secret; these
// accounts exist so the Agent and Admin apps have something to log into.
const DEMO_PASSWORD = "demo1234"
// The customer's is different and predates this script — `scripts/smoke.mjs`
// signs in with it (`defaultUser` in its APPS map). Kept separate rather than
// unified so a reseed can never rotate the password smoke logs in with.
const CUSTOMER_PASSWORD = "businesstest"

// Ordered lifecycle, `cancelled` excluded (it leaves the progression rather
// than sitting on it). Must match `enum PickupStatus` in schema.prisma and
// LIFECYCLE_STAGES in packages/ui/src/tokens.ts. `arrived` + `offered` added in
// Batch 7A, which is why the seed is 10 pickups (one per stage) and not 8.
const LIFECYCLE = [
  "requested",
  "scheduled",
  "arrived",
  "offered",
  "collected",
  "tested",
  "processed",
  "recovered",
  "certified",
] as const

/**
 * A stable `publicToken` for a demo pickup, derived from its serial.
 *
 * `PKP-2026-000103` → `00000000-0000-4000-8000-000000000103`.
 *
 * A valid v4-shaped UUID (version nibble 4, variant nibble 8) so it satisfies
 * both the Postgres `uuid` column and the format guard in `/t/[token]`, and
 * obviously synthetic so nobody mistakes a seeded token for a real one.
 *
 * DEMO ROWS ONLY. Real pickups keep the `gen_random_uuid()` column default —
 * the token is a bearer capability for a real customer's data, and a derivable
 * one would let anyone who knows a pickup id read its public page.
 */
function demoPublicToken(pickupId: string): string {
  const serial = (pickupId.split("-").pop() ?? "0").padStart(12, "0")
  return `00000000-0000-4000-8000-${serial}`
}

/**
 * A stable `BatteryItem.id` for a demo item — `PKP-2026-000102` item 1 →
 * `00000000-0000-4000-8000-000000102001`.
 *
 * Last group is 12 hex: 3 padding zeros + the pickup's 6-digit serial + a
 * 1-based 3-digit item index. Same trick, same reasoning and same v4 shape as
 * `demoPublicToken` above. `BatteryItem.id` is `@default(uuid())`, so before
 * this every reseed handed the item screens a different id and
 * `scripts/smoke.mjs` had nothing it could point at — the agent app's
 * `/job/[id]/items/[itemId]/…` routes are half its route table.
 * DEMO ROWS ONLY; real items keep the column default.
 */
function demoItemId(pickupId: string, index: number): string {
  const serial = (pickupId.split("-").pop() ?? "0").padStart(6, "0").slice(-6)
  return `00000000-0000-4000-8000-000${serial}${String(index + 1).padStart(3, "0")}`
}

/**
 * The one seeded hub drop-off. Pinned rather than generated for the same reason
 * item ids are — `scripts/smoke.mjs` reserves this exact constant for
 * `/dropoff/[batchId]`.
 */
const CUSTODY_BATCH_ID = "00000000-0000-4000-8000-000000000301"
const CUSTODY_BATCH_NO = "CB-2026-000301"

/**
 * Pickups already handed in at the hub. Everything past `collected` must have
 * reached a facility to get there, so "collected but no custodyBatchId" is
 * exactly the derived "pending drop-off" state (D5) — which is why the ONE
 * pickup at `collected` deliberately stays out of the batch.
 */
const DROPPED_OFF: PickupStatus[] = ["tested", "processed", "recovered", "certified"]

/**
 * What the agent earns on a job, as a share of the load's value.
 *
 * ⚠ SEED PLACEHOLDER. The real rule is D3 and lands in B's Batch 4 — when it
 * does, this number moves on the agent's "earned today" tile. Flat 10% here
 * only so the tile has something non-null to render before Batch 4 exists.
 * Integer paise: `Math.round`, never a float.
 */
const agentFee = (quotePaise: number) => Math.round(quotePaise * 0.1)

// Delhi NCR, roughly — the demo pickups all sit in this area.
const GEO = { lat: 28.5355, lng: 77.391 }

const day = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

// ─── Auth users ───────────────────────────────────────────────────────────────

function adminClient() {
  loadAppEnv()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Creates (or finds) a confirmed auth user and returns its uuid.
 *
 * Note the order: create first, look up only on failure. An EXISTING user's
 * password is therefore never rewritten — which is what lets the customer keep
 * a different one from the agent and admin.
 */
async function ensureAuthUser(
  email: string,
  fullName: string,
  password = DEMO_PASSWORD,
): Promise<string> {
  const supabase = adminClient()

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (!error && created.user) return created.user.id

  // Already registered — look it up instead.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Could not create or find auth user ${email}: ${error?.message}`)
  return existing.id
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

/**
 * Clears all app data. Order matters: children before parents, because the
 * schema only cascades from Pickup to BatteryItem.
 */
async function wipe() {
  await prisma.safetyChecklist.deleteMany()
  await prisma.dispatchManifest.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.certificate.deleteMany()
  await prisma.pickupReceipt.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.walletTxn.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.statusEvent.deleteMany()
  await prisma.batteryItem.deleteMany()
  await prisma.pickup.deleteMany()
  await prisma.address.deleteMany()
  await prisma.pricingRate.deleteMany()
  // After pickups (they hold the FK) and before facilities (it holds one).
  await prisma.custodyBatch.deleteMany()
  await prisma.facility.deleteMany()
  await prisma.recycler.deleteMany()
  await prisma.marketPrices.deleteMany()
  // Drop the old seed's invented vendor profiles (no matching auth user).
  await prisma.profile.deleteMany({
    where: { id: { in: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"] } },
  })
  console.log("Wiped app data.")
}

// ─── Reference data ───────────────────────────────────────────────────────────

// Demo placeholders, right order of magnitude for Indian battery scrap — NOT
// researched market rates (BATCH_0B_SCHEMA.md §6). Do not present as such.
const RATES: Array<[BatteryCategory, BatteryType | null, number]> = [
  ["automotive", "lead_acid", 8500],
  ["industrial", "lead_acid", 8000],
  ["portable", "li_ion_nmc", 21000],
  ["portable", "li_ion_lfp", 15000],
  ["portable", null, 12000],
  ["ev", "li_ion_nmc", 25000],
  ["ev", "li_ion_lfp", 18000],
  ["ev", null, 20000],
  ["automotive", null, 7000],
  ["industrial", null, 7500],
]

// Condition multipliers in basis points (10000 = 1.00x). A dead battery keeps
// nearly full material value — it is end-of-life, not damaged; only swollen and
// leaking carry real handling cost.
const CONDITION_BP: Record<BatteryCondition, number> = {
  healthy: 10000,
  dead: 8500,
  swollen: 7000,
  leaking: 5000,
}

/**
 * Spot metal prices the decision engine's Layer 2 revenue model reads.
 *
 * ⚠ DEMO PLACEHOLDERS, same standing as RATES above — right order of magnitude
 * for ₹/kg on the Indian market, NOT researched or dated quotes. Do not present
 * these as market data, and do not let a demo imply we have a price feed.
 * The engine treats a stale row as low-confidence (B's Batch 4 fixes the
 * market-freshness defect), which is why the row is seeded with `updatedAt` at
 * reseed time rather than a fixed date — an old reseed should not silently
 * degrade every quote in the demo.
 */
const MARKET_PRICES = { Li: 1450, Co: 2600, Ni: 1550, Mn: 180, Cu: 780, Al: 240 }

/** @returns the seeded hub facility — CustodyBatch needs its id. */
async function seedReferenceData() {
  await prisma.marketPrices.create({ data: MARKET_PRICES })

  await prisma.pricingRate.createMany({
    data: RATES.flatMap(([category, chemistry, ratePerKgPaise]) =>
      (Object.keys(CONDITION_BP) as BatteryCondition[]).map((condition) => ({
        category,
        chemistry,
        condition,
        ratePerKgPaise,
        conditionMultiplierBp: CONDITION_BP[condition],
      })),
    ),
  })

  const facility = await prisma.facility.create({
    data: {
      name: "CLBIPP Hub — Okhla",
      location: "Okhla Industrial Area Phase II, New Delhi",
      lat: 28.5355,
      lng: 77.2733,
      capacityKg: 50000,
    },
  })

  await prisma.recycler.create({
    data: {
      name: "Attero Recycling Pvt Ltd",
      cpcbRegNo: "CPCB/EPR/BW/2023/000418",
      acceptedChemistries: ["li_ion_nmc", "li_ion_lfp", "li_ion_nca", "lead_acid"],
      capacityKg: 250000,
    },
  })

  return facility
}

// ─── Demo photos ──────────────────────────────────────────────────────────────
// The chain-of-custody log (Batch 7B) renders stored photos through
// `createSignedUrl`, and every bucket is private — so an empty `photo_urls`
// array means the whole signed-URL path renders nothing and is never actually
// proven to work. These uploads give it something real to sign.
//
// Path layout matches `buildObjectPath` in @clbipp/auth/storage:
// `<uploader-uid>/<segments>/<filename>`. Every storage RLS policy checks
// `storage.foldername(name)[1] = auth.uid()`, so the uid prefix is not cosmetic.
// Booking photos sit under the VENDOR's uid and custody photos under the
// AGENT's, because that is who actually took them — reads all go through
// server-minted signed URLs, so the split costs nothing and stays honest.

const PHOTO_BUCKET = "pickup-photos"

/**
 * Uploads one generated placeholder and returns its object path.
 *
 * `upsert: true` here ONLY because this is the seed and must be re-runnable —
 * the app never upserts, since overwriting would destroy an audit photo.
 */
async function uploadPhoto(
  ownerId: string,
  segments: string[],
  filename: string,
  colour: keyof typeof PHOTO_COLOURS,
): Promise<string | null> {
  const supabase = adminClient()
  const objectPath = [ownerId, ...segments, filename].join("/")

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, solidPng(320, 240, PHOTO_COLOURS[colour]), {
      contentType: "image/png",
      upsert: true,
    })

  if (error) {
    // Non-fatal: a demo without photos is still a usable demo, and failing the
    // whole reseed over a storage hiccup would be a poor trade.
    console.warn(`  ! photo upload failed (${objectPath}): ${error.message}`)
    return null
  }
  return objectPath
}

/**
 * Every object under a prefix, at any depth.
 *
 * Supabase Storage has no real directories — `list` returns one row per
 * immediate child, and a "folder" is a synthetic row with `id: null`. So the
 * only way to enumerate a subtree is to walk it.
 */
async function listObjectsRecursive(bucket: string, prefix: string): Promise<string[]> {
  const supabase = adminClient()
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })

  if (error || !data) return []

  const paths: string[] = []
  for (const entry of data) {
    const child = `${prefix}/${entry.name}`
    // id === null marks a synthetic folder row; anything else is a real object.
    if (entry.id === null) paths.push(...(await listObjectsRecursive(bucket, child)))
    else paths.push(child)
  }
  return paths
}

/**
 * Buckets a reseed must clear. Photos are the demo's own uploads; the three
 * document buckets hold PDFs generated lazily on first download (Batch 8) and
 * cached against a `pdf_url` the wipe is about to delete — leaving them would
 * orphan a file per document per reseed.
 */
const WIPE_BUCKETS = [PHOTO_BUCKET, "certificates", "receipts", "invoices"] as const

/**
 * Clears every object owned by the demo users so re-running doesn't accumulate
 * orphans. The database wipe doesn't touch Storage.
 *
 * Walks the whole subtree rather than the fixed depth the seed itself writes:
 * `<uid>/bookings/<pickup>/…` is the seed's shape, but the booking wizard also
 * writes real uploads here, and abandoned drafts leave them behind (a known gap
 * since Batch 5). Those sit at a different depth and a fixed-depth sweep walked
 * straight past them.
 */
async function wipeStorage(ownerIds: string[]) {
  const supabase = adminClient()
  for (const bucket of WIPE_BUCKETS) {
    for (const ownerId of ownerIds) {
      const paths = await listObjectsRecursive(bucket, ownerId)
      // remove() takes up to 1000 keys per call.
      for (let i = 0; i < paths.length; i += 1000) {
        const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 1000))
        if (error) console.warn(`  ! ${bucket} wipe failed: ${error.message}`)
      }
      if (paths.length) console.log(`Cleared ${paths.length} object(s) from ${bucket} for ${ownerId}.`)
    }
  }
}

// ─── Pickup fixtures ──────────────────────────────────────────────────────────

type ItemSpec = {
  category: BatteryCategory
  quantity: number
  weightKg: number
  condition: BatteryCondition
  chemistry: BatteryType
}

type PickupSpec = {
  id: string
  status: PickupStatus
  category: BatteryCategory
  location: string
  notes?: string
  daysAgo: number
  items: ItemSpec[]
}

const PICKUPS: PickupSpec[] = [
  {
    id: "PKP-2026-000101",
    status: "requested",
    category: "portable",
    location: "Kalkaji Mandir, New Delhi",
    notes: "Office laptop and power-bank cells cleared from storage.",
    daysAgo: 1,
    items: [
      { category: "portable", quantity: 24, weightKg: 12.5, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "portable", quantity: 8, weightKg: 4.2, condition: "dead", chemistry: "li_ion_lfp" },
    ],
  },
  {
    // ── THE INTAKE DEMO JOB (Batch 0a). `scheduled` + assigned to agent@test,
    // so it is the one the agent app's day view opens and the one C's Batch 3
    // multi-item intake is built against. Three items spanning TWO categories
    // and BOTH chemistry families on purpose: a single-chemistry job never
    // exercises the "no mixed chemistry" safety item (Batch 2) or the
    // per-item engine run (D1), and those are the two things this job exists
    // to prove. Do not simplify it back to one category.
    id: "PKP-2026-000102",
    status: "scheduled",
    category: "automotive",
    location: "Okhla Phase II, New Delhi",
    notes: "Gate B entry — call on arrival. Mixed load: truck batteries + UPS packs.",
    daysAgo: 2,
    items: [
      { category: "automotive", quantity: 14, weightKg: 196, condition: "healthy", chemistry: "lead_acid" },
      // Deliberately hazardous so the condition path is visible in the demo.
      { category: "automotive", quantity: 2, weightKg: 28, condition: "leaking", chemistry: "lead_acid" },
      // Li-ion on a lead-acid job — this is what makes the load "mixed".
      { category: "industrial", quantity: 6, weightKg: 33.5, condition: "healthy", chemistry: "li_ion_lfp" },
    ],
  },
  {
    // Batch 7A — the agent is on site, assessing. No offer yet: the company
    // flow document puts assessment and quoting on site, in that order.
    // Mixed the same way PKP-2026-000102 is (Batch 0a), so the assessment
    // screens have a second mixed job to work against.
    id: "PKP-2026-000103",
    status: "arrived",
    category: "portable",
    location: "Lajpat Nagar II, New Delhi",
    notes: "Agent on site — assessing the load.",
    daysAgo: 3,
    items: [
      { category: "portable", quantity: 18, weightKg: 9.4, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "portable", quantity: 4, weightKg: 2.1, condition: "swollen", chemistry: "li_ion_nmc" },
      { category: "automotive", quantity: 1, weightKg: 14, condition: "dead", chemistry: "lead_acid" },
    ],
  },
  {
    // Batch 7A — THE OFFER DEMO PICKUP. `offered` is the only status the
    // /offer and /offer-breakdown guards admit, so this is the one pickup
    // those two screens render for. scripts/smoke.mjs asserts on this id.
    id: "PKP-2026-000104",
    status: "offered",
    category: "automotive",
    location: "Mayapuri Industrial Area, New Delhi",
    notes: "Assessed on site — offer sent to the vendor.",
    daysAgo: 4,
    items: [
      { category: "automotive", quantity: 9, weightKg: 126, condition: "healthy", chemistry: "lead_acid" },
      { category: "automotive", quantity: 3, weightKg: 42, condition: "dead", chemistry: "lead_acid" },
    ],
  },
  {
    id: "PKP-2026-000105",
    status: "collected",
    category: "industrial",
    location: "Noida Sector 62, UP",
    daysAgo: 6,
    items: [
      { category: "industrial", quantity: 6, weightKg: 240, condition: "healthy", chemistry: "lead_acid" },
      { category: "industrial", quantity: 3, weightKg: 120, condition: "swollen", chemistry: "lead_acid" },
    ],
  },
  {
    id: "PKP-2026-000106",
    status: "tested",
    category: "portable",
    location: "Gurugram Cyber City, Haryana",
    daysAgo: 9,
    items: [
      { category: "portable", quantity: 40, weightKg: 21, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "portable", quantity: 15, weightKg: 7.8, condition: "healthy", chemistry: "li_ion_lfp" },
    ],
  },
  {
    id: "PKP-2026-000107",
    status: "processed",
    category: "ev",
    location: "Faridabad Sector 24, Haryana",
    daysAgo: 14,
    items: [
      { category: "ev", quantity: 2, weightKg: 310, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "ev", quantity: 1, weightKg: 148, condition: "dead", chemistry: "li_ion_lfp" },
    ],
  },
  {
    id: "PKP-2026-000108",
    status: "recovered",
    category: "ev",
    location: "Dwarka Sector 21, New Delhi",
    daysAgo: 21,
    items: [
      { category: "ev", quantity: 3, weightKg: 465, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "ev", quantity: 1, weightKg: 152, condition: "swollen", chemistry: "li_ion_nmc" },
    ],
  },
  {
    id: "PKP-2026-000109",
    status: "certified",
    category: "portable",
    location: "Saket District Centre, New Delhi",
    daysAgo: 30,
    items: [
      { category: "portable", quantity: 60, weightKg: 31.5, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "portable", quantity: 22, weightKg: 11.4, condition: "healthy", chemistry: "li_ion_lfp" },
      { category: "portable", quantity: 5, weightKg: 2.6, condition: "dead", chemistry: "li_ion_nca" },
    ],
  },
  {
    id: "PKP-2026-000110",
    status: "cancelled",
    category: "portable",
    location: "Rohini Sector 3, New Delhi",
    notes: "Customer rescheduled to next quarter.",
    daysAgo: 11,
    items: [
      { category: "portable", quantity: 10, weightKg: 5.1, condition: "healthy", chemistry: "li_ion_nmc" },
    ],
  },
]

const totalWeight = (items: ItemSpec[]) => items.reduce((sum, i) => sum + i.weightKg, 0)

/**
 * kg CO₂e avoided per kg recycled, by chemistry.
 *
 * ⚠ MUST MATCH `CO2E_AVOIDED_KG_PER_KG` in `packages/core/src/impact.ts`, which
 * is the canonical table and carries the sources, the ranges, and the warning
 * about what these numbers are not. Restated here rather than imported because
 * `packages/database` must not depend on `packages/core` — core depends on
 * database, and the cycle breaks the generated client's build. Exactly the
 * reason Batch 8's invoice number format is restated in this file too.
 *
 * Drift between the two is caught by verification, not by hope: the Batch 9
 * check asserts every seeded `co2AvoidedKg` equals what `co2eAvoidedKg()`
 * computes over the same pickup's items.
 *
 * This replaced a flat `weight * 8` applied to every chemistry — which meant the
 * seeded lead-acid certificates claimed roughly 4× the CO₂ they should.
 */
const CO2E_AVOIDED_KG_PER_KG: Record<BatteryType, number> = {
  li_ion_nmc: 8.0,
  li_ion_nca: 7.5,
  li_ion_lfp: 2.5,
  lead_acid: 2.0,
  nimh: 4.5,
  other: 1.5,
}

/** Rounded once over the whole load, the same way `co2eAvoidedKg` does it. */
const co2Avoided = (items: ItemSpec[]) =>
  Math.round(items.reduce((sum, i) => sum + i.weightKg * CO2E_AVOIDED_KG_PER_KG[i.chemistry], 0))

/** Rough line price: rate × weight × condition multiplier, in integer paise. */
function linePrice(item: ItemSpec): number {
  const rate =
    RATES.find(([c, chem]) => c === item.category && chem === item.chemistry)?.[2] ??
    RATES.find(([c, chem]) => c === item.category && chem === null)?.[2] ??
    10000
  return Math.round((rate * item.weightKg * CONDITION_BP[item.condition]) / 10000)
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  // All three demo accounts as REAL auth users (BATCH_0B_SCHEMA.md §5).
  //
  // The customer used to be the odd one out: this script REQUIRED a profiles
  // row to already exist and threw "log in once to create it" otherwise. That
  // made a reseed depend on invisible prior state, and on 2026-08-21 the shared
  // Supabase project turned up with `profiles` empty while all 36 auth users
  // were intact — which made the seed unrunnable by anyone, and the seed is
  // what unblocks all three lanes. Creating the row here removes the
  // precondition entirely; a reseed is now self-sufficient from a wiped DB.
  const vendorId = await ensureAuthUser(CUSTOMER_EMAIL, "Aarav Sharma", CUSTOMER_PASSWORD)
  const agentId = await ensureAuthUser(AGENT_EMAIL, "Ravi Kumar")
  const adminId = await ensureAuthUser(ADMIN_EMAIL, "Priya Nair")

  await prisma.profile.upsert({
    where: { id: vendorId },
    // An existing row keeps whatever the account actually filled in at signup —
    // only the fields this demo depends on are forced.
    update: { role: "customer", phone: "+91 98110 22334", walletBalancePaise: 0 },
    create: {
      id: vendorId,
      email: CUSTOMER_EMAIL,
      fullName: "Aarav Sharma",
      vendorType: "fleet",
      role: "customer",
      phone: "+91 98110 22334",
      companyName: "Sharma Logistics Pvt Ltd",
      gstNumber: "07AABCS1429B1ZQ",
      businessAddress: "Plot 14, Okhla Industrial Area Phase II, New Delhi 110020",
      eprRegId: "CPCB/EPR/PROD/2024/0091",
      kycStatus: "verified",
      walletBalancePaise: 0,
    },
  })

  await prisma.profile.upsert({
    where: { id: agentId },
    update: { role: "agent" },
    create: {
      id: agentId,
      email: AGENT_EMAIL,
      fullName: "Ravi Kumar",
      vendorType: "individual",
      role: "agent",
      phone: "+91 98730 41288",
      agentZone: "Delhi NCR — South",
      agentVehicle: "Tata Ace · DL 1LR 4471",
      safetyTrainedAt: day(60),
      agentRating: 4.7,
    },
  })

  await prisma.profile.upsert({
    where: { id: adminId },
    update: { role: "admin" },
    create: {
      id: adminId,
      email: ADMIN_EMAIL,
      fullName: "Priya Nair",
      vendorType: "individual",
      role: "admin",
      phone: "+91 99100 77321",
    },
  })

  const facility = await seedReferenceData()

  // The one seeded hub drop-off, created BEFORE the pickup loop because the
  // pickups in it carry the FK. Weight and count are summed from the specs
  // rather than counted afterwards, which keeps this a single insert.
  const droppedOffSpecs = PICKUPS.filter((p) => DROPPED_OFF.includes(p.status))
  await prisma.custodyBatch.create({
    data: {
      id: CUSTODY_BATCH_ID,
      batchNo: CUSTODY_BATCH_NO,
      agentId,
      facilityId: facility.id,
      totalWeightKg: droppedOffSpecs.reduce((sum, p) => sum + totalWeight(p.items), 0),
      itemCount: droppedOffSpecs.reduce(
        (sum, p) => sum + p.items.reduce((n, i) => n + i.quantity, 0),
        0,
      ),
      receivingStaffName: "Sunita Rao",
      // Agent-attested, no signature or PDF yet — Batches 7a and 7b fill those
      // in. GPS is the hub's own coordinates, which is where the hand-off is.
      lat: facility.lat,
      lng: facility.lng,
      handedOffAt: day(8),
    },
  })

  // Storage isn't covered by the database wipe — objects would otherwise pile
  // up across reseeds and the pickup ids they're filed under were renumbered in
  // Batch 7A, so the old ones are unreferenced by anything.
  await wipeStorage([vendorId, agentId])

  const warehouse = await prisma.address.create({
    data: {
      profileId: vendorId,
      label: "Warehouse",
      line1: "Plot 14, Okhla Industrial Area Phase II",
      line2: "Near Govindpuri Metro",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110020",
      lat: 28.5355,
      lng: 77.2733,
      isDefault: true,
    },
  })

  await prisma.address.create({
    data: {
      profileId: vendorId,
      label: "Depot 2",
      line1: "B-42, Sector 62",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201309",
      lat: 28.6272,
      lng: 77.3719,
      status: "not_operational",
    },
  })

  for (const spec of PICKUPS) {
    const weight = totalWeight(spec.items)
    const quote = spec.items.reduce((sum, i) => sum + linePrice(i), 0)
    const hasAgent = spec.status !== "requested" && spec.status !== "cancelled"
    // How far along the lifecycle this pickup got. `cancelled` isn't part of
    // the ordered lifecycle — it stops after `requested`.
    const reachedIndex =
      spec.status === "cancelled" ? 0 : LIFECYCLE.indexOf(spec.status as (typeof LIFECYCLE)[number])

    // Booking photos — one per line item, uploaded as the vendor (they took
    // them at booking time). Nullable results are filtered so a failed upload
    // degrades to "no photo" rather than a broken path in the database.
    const itemPhotos = await Promise.all(
      spec.items.map((_, idx) =>
        uploadPhoto(vendorId, ["bookings", spec.id], `item-${idx + 1}.png`, "booking"),
      ),
    )

    await prisma.pickup.create({
      data: {
        id: spec.id,
        vendorId,
        // Batch 10. `publicToken` defaults to gen_random_uuid(), which made the
        // one screen with NO SESSION — /t/<token> — the one screen `npm run
        // smoke` could never cover, because the URL changed on every reseed.
        // Deriving it from the pickup's own serial fixes that at no cost: these
        // are demo rows, the token is not a secret in a seeded database, and
        // real pickups still get a random one from the column default.
        publicToken: demoPublicToken(spec.id),
        agentId: hasAgent ? agentId : null,
        category: spec.category,
        addressId: warehouse.id,
        location: spec.location,
        notes: spec.notes,
        status: spec.status,
        indicativeQuotePaise: quote,
        // What the AGENT earns, not what the vendor is paid. Only on jobs an
        // agent actually has (D3).
        agentFeePaise: hasAgent ? agentFee(quote) : null,
        // Null on `collected` is the derived "pending drop-off" state (D5).
        custodyBatchId: DROPPED_OFF.includes(spec.status) ? CUSTODY_BATCH_ID : null,
        conditionFlags: [...new Set(spec.items.map((i) => i.condition))],
        scheduledSlot: hasAgent ? day(spec.daysAgo - 1) : null,
        etaMinutes: spec.status === "scheduled" ? 45 : null,
        preferredDate: day(spec.daysAgo - 1),
        createdAt: day(spec.daysAgo),
        // Header field kept as the deduped union of the item photos, so older
        // reads against Pickup.photoUrls still see something.
        photoUrls: [...new Set(itemPhotos.filter((p): p is string => p !== null))],
        items: {
          create: spec.items.map((item, idx) => ({
            id: demoItemId(spec.id, idx),
            category: item.category,
            quantity: item.quantity,
            weightKg: item.weightKg,
            condition: item.condition,
            photoUrls: itemPhotos[idx] ? [itemPhotos[idx]] : [],
            // Agent-confirmed half is only filled once collection has happened.
            ...(reachedIndex >= LIFECYCLE.indexOf("collected")
              ? {
                  chemistry: item.chemistry,
                  confirmedWeightKg: item.weightKg,
                  confirmedCondition: item.condition,
                  recordedBy: agentId,
                  recordedAt: day(spec.daysAgo - 2),
                  unitPricePaise: Math.round(linePrice(item) / item.quantity),
                  linePricePaise: linePrice(item),
                }
              : {}),
          })),
        },
      },
    })

    // Chain-of-custody log: one event per stage reached, each with GPS.
    const stages: PickupStatus[] =
      spec.status === "cancelled"
        ? ["requested", "cancelled"]
        : [...LIFECYCLE.slice(0, reachedIndex + 1)]

    for (const [i, status] of stages.entries()) {
      // Only the on-site stages carry photo proof — that is what the company
      // doc's chain-of-custody actually is (§5.3). A `processed` event in a
      // facility has a timestamp and a location, not a photo from the agent.
      const proofColour =
        status === "arrived" ? "arrived" : status === "collected" ? "collected" : null

      const eventPhoto = proofColour
        ? await uploadPhoto(agentId, ["custody", spec.id], `${status}.png`, proofColour)
        : null

      await prisma.statusEvent.create({
        data: {
          pickupId: spec.id,
          status,
          actorId: i === 0 ? vendorId : agentId,
          actorRole: i === 0 ? "customer" : "agent",
          lat: GEO.lat + i * 0.004,
          lng: GEO.lng - i * 0.003,
          photoUrls: eventPhoto ? [eventPhoto] : [],
          occurredAt: day(spec.daysAgo - i),
        },
      })
    }

    // Collection produces a receipt, a payment and a wallet credit — the
    // company doc's step 4, distinct from the EPR certificate at step 8.
    if (reachedIndex >= LIFECYCLE.indexOf("collected")) {
      await prisma.pickupReceipt.create({
        data: {
          pickupId: spec.id,
          receiptNo: `RCP-${spec.id.slice(4)}`,
          totalWeightKg: weight,
          itemCount: spec.items.reduce((sum, i) => sum + i.quantity, 0),
          amountPaise: quote,
          agentId,
          capturedLat: GEO.lat,
          capturedLng: GEO.lng,
          collectedAt: day(spec.daysAgo - 2),
        },
      })

      // The ONE pickup still at `collected` keeps its payout unsettled, so the
      // payment screen has a live `pending` state to demo (Batch 8) — choosing
      // a method and confirming is the flow, and every payment being seeded as
      // already-paid left nothing to actually do. Everything further along the
      // lifecycle is paid, which is also just true: the money settles long
      // before a load is recycled and certified.
      const settled = spec.status !== "collected"

      await prisma.payment.create({
        data: {
          pickupId: spec.id,
          vendorId,
          amountPaise: quote,
          method: "upi",
          status: settled ? "paid" : "pending",
          paidAt: settled ? day(spec.daysAgo - 2) : null,
          gatewayRef: settled ? `SIM-SEED-${spec.id.slice(-6)}` : null,
        },
      })

      if (settled) {
        const balance = await prisma.profile
          .findUniqueOrThrow({ where: { id: vendorId }, select: { walletBalancePaise: true } })
          .then((p) => p.walletBalancePaise + quote)

        // WalletTxn is the source of truth; profiles.wallet_balance_paise is a
        // cache. Always write both together.
        await prisma.$transaction([
          prisma.walletTxn.create({
            data: {
              profileId: vendorId,
              deltaPaise: quote,
              kind: "payout",
              balanceAfterPaise: balance,
              pickupId: spec.id,
              note: `Payout for ${spec.id}`,
            },
          }),
          prisma.profile.update({
            where: { id: vendorId },
            data: { walletBalancePaise: balance },
          }),
        ])

        // An invoice accompanies a settled payout, exactly as settlePayment
        // creates one. Number format matches invoiceNumber() in @clbipp/core —
        // restated rather than imported because packages/database must not
        // depend on packages/core (core depends on database, and the cycle
        // would break the generated client's build).
        const issuedAt = day(spec.daysAgo - 2)
        await prisma.invoice.create({
          data: {
            vendorId,
            pickupId: spec.id,
            number: `INV-${issuedAt.getFullYear()}-${spec.id.split("-").pop()}`,
            subtotalPaise: quote,
            taxPaise: 0,
            totalPaise: quote,
            issuedAt,
          },
        })
      }
    }

    // An Offer exists from `offered` onward — the stage now says so, which is
    // the whole point of Batch 7A. Before it, "an offer exists" was an implicit
    // sub-state of `scheduled`, and the mismatch between that and the /offer
    // guard is what made both offer screens unreachable until Batch 6.5 patched
    // the seed. Exactly one seeded pickup sits AT `offered`, so exactly one is
    // reachable through the guard.
    if (reachedIndex >= LIFECYCLE.indexOf("offered")) {
      await prisma.offer.create({
        data: {
          pickupId: spec.id,
          vendorId,
          pathway: "recycle",
          estimatedPrice: quote,
          rationale:
            "Material recovery is the best route for this load — chemistry and condition both support full recycling.",
          materialBreakdown: [
            { material: "Nickel", weight_kg: Math.round(weight * 0.18) },
            { material: "Cobalt", weight_kg: Math.round(weight * 0.07) },
            { material: "Lithium", weight_kg: Math.round(weight * 0.05) },
            { material: "Copper", weight_kg: Math.round(weight * 0.09) },
          ],
          deductions: [],
          // D7: the vendor accepting sets ONLY this — the status stays
          // `offered` until the AGENT collects. So every pickup at `collected`
          // or beyond must have an accepted offer behind it, and the one
          // sitting AT `offered` must not: that null is the live "awaiting the
          // vendor" state Batch 5b writes and Batch 6 reads.
          acceptedAt:
            reachedIndex >= LIFECYCLE.indexOf("collected")
              ? day(Math.max(spec.daysAgo - LIFECYCLE.indexOf("collected"), 0))
              : null,
          // Dated to the `offered` status event itself rather than a fixed
          // offset from creation. The old `daysAgo - 5` dated the youngest
          // pickup's offer into the FUTURE and had to be clamped; deriving it
          // from the stage index can't drift, because it is the same arithmetic
          // the status-event loop below uses.
          createdAt: day(Math.max(spec.daysAgo - LIFECYCLE.indexOf("offered"), 0)),
        },
      })
    }

    if (spec.status === "certified") {
      await prisma.certificate.create({
        data: {
          pickupId: spec.id,
          vendorId,
          pdfUrl: "",
          totalWeightKg: weight,
          materialSummary: [
            { material: "Nickel", recovered_kg: Math.round(weight * 0.18) },
            { material: "Cobalt", recovered_kg: Math.round(weight * 0.07) },
            { material: "Lithium", recovered_kg: Math.round(weight * 0.05) },
            { material: "Copper", recovered_kg: Math.round(weight * 0.09) },
          ],
          // Per-chemistry, not a flat rate — see CO2E_AVOIDED_KG_PER_KG above.
          // Canonical table + citations live in packages/core/src/impact.ts.
          co2AvoidedKg: co2Avoided(spec.items),
          certifiedAt: day(spec.daysAgo - 6),
        },
      })
    }
  }

  console.log(`Seeded ${PICKUPS.length} pickups (one per lifecycle stage) for ${CUSTOMER_EMAIL}.`)
  console.log(`Agent login: ${AGENT_EMAIL} / ${DEMO_PASSWORD}`)
  console.log(`Admin login: ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`)
}

async function main() {
  await wipe()
  await seed()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
