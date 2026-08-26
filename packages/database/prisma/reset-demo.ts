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
// The engine's own defaults, imported rather than retyped — the seeded
// `EngineConfig` row must BE `DEFAULT_CONFIG`, not a copy that can drift from
// it (Admin Batch 1 step 6). Safe direction of dependency: decision-engine has
// no dependencies at all, so `database → decision-engine` creates no cycle —
// unlike `database → core`, which is why the CO₂e factors and the invoice
// number format below are still restated by hand.
import { DEFAULT_CONFIG } from "@clbipp/decision-engine"
import { prisma } from "../src/client"
import type {
  BatteryCategory,
  BatteryCondition,
  BatteryType,
  ManifestStatus,
  PickupStatus,
} from "../src/generated/client"
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
  // Admin console (admin_app_v1). item_exceptions cascades from battery_items
  // anyway, but the order is stated rather than relied on — the other two hold
  // FKs to `profiles`, which this function deliberately does NOT wipe (they
  // match real auth users), so they must go before anything else touches it.
  await prisma.itemException.deleteMany()
  await prisma.adminAudit.deleteMany()
  await prisma.engineConfig.deleteMany()
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

/**
 * 🔴 The FX rate the engine records against every quote.
 *
 * MUST stay 83.2 unless someone deliberately moves it: that is the exact
 * constant `packages/core/src/market.ts` hardcoded before admin_app_v1 added
 * the column, and it is also the column's database default. The engine does no
 * arithmetic with it — `metal_price` is already ₹/kg — it only echoes it into
 * the audit output, so changing this changes what every quote SAYS it was
 * priced against without changing the price. That is the worst kind of drift.
 */
const FX_RATE_USD_INR = 83.2

/**
 * The published pricing configuration, Admin Batch 1 fixture 1.
 *
 * ⚠ TWO VERSION STRINGS and they deliberately disagree. This is the ROW's
 * publish identity; `DEFAULT_CONFIG.config_version` ("v0.1.0-placeholder") is
 * the engine's own build stamp inside the JSON. The row stores DEFAULT_CONFIG
 * byte-identical — a drift test in packages/decision-engine guards that, and
 * 🔴 rewriting the JSON to reconcile the two would move every quote's audit
 * trail. Batch 11's getActiveConfig() decides which one the engine should name.
 */
const ENGINE_CONFIG_VERSION = "v2026-08-26-r1"

/**
 * The three recyclers, Admin Batch 1 fixture 3.
 *
 * 🔴 `acceptedChemistries` are NON-OVERLAPPING on purpose. AD7 says a manifest
 * may name only an `isActive` recycler whose accepted chemistries cover every
 * item on it, enforced in the action and not just the picker — and a single
 * recycler that takes everything (which is what this seed had until now) makes
 * that rule impossible to fail, so it would never be tested. Chemistry-wise
 * segregation is the whole reason one pickup's items end up on two manifests
 * (AD6), which is fixture 4 below.
 *
 * ⚠ `nimh` and `other` are accepted by NOBODY. That is not an omission: it is
 * the AD7 gate having something real to reject. No seeded item uses either.
 *
 * ⚠ The single recycler this replaces was a REAL Indian company's name carrying
 * a CPCB registration number we invented. These three are deliberately not real
 * firms — a demo should not attribute a fabricated regulatory registration to a
 * company that exists. Nothing read the `recyclers` table before this batch, so
 * the rename costs nothing.
 */
const RECYCLERS = [
  {
    key: "nickel",
    name: "Meridian Metals Recovery Pvt Ltd",
    cpcbRegNo: "CPCB/EPR/BW/2024/000418",
    acceptedChemistries: ["li_ion_nmc", "li_ion_nca"] as BatteryType[],
    capacityKg: 250000,
  },
  {
    key: "lead",
    name: "Sunrise Lead Recyclers Pvt Ltd",
    cpcbRegNo: "CPCB/EPR/BW/2024/000572",
    acceptedChemistries: ["lead_acid"] as BatteryType[],
    capacityKg: 400000,
  },
  {
    key: "lfp",
    name: "Verdant Cell Recovery Pvt Ltd",
    cpcbRegNo: "CPCB/EPR/BW/2025/000133",
    acceptedChemistries: ["li_ion_lfp"] as BatteryType[],
    capacityKg: 180000,
  },
] as const

type RecyclerKey = (typeof RECYCLERS)[number]["key"]

/** Which recycler takes which chemistry. The inverse of the table above. */
const RECYCLER_FOR_CHEMISTRY: Partial<Record<BatteryType, RecyclerKey>> = {
  li_ion_nmc: "nickel",
  li_ion_nca: "nickel",
  li_ion_lfp: "lfp",
  lead_acid: "lead",
  // nimh / other: deliberately unassigned. See the note on RECYCLERS.
}

/**
 * The li-ion chemistries, i.e. the ones that take the engine path (D1).
 *
 * ⚠ MUST MATCH `LI_ION_CHEMISTRIES` in `packages/core/src/intake.ts`, which is
 * the canonical list. Restated here for the same reason the CO₂e factors and
 * the invoice number format are: `packages/database` must not depend on
 * `packages/core` — core depends on database, and the cycle breaks the
 * generated client's build.
 *
 * 🔴 This is what decides which seeded items get a `traceId`. A flat-rate
 * (non-li-ion) item has NO trace, which is exactly the trap CLAUDE.md flags:
 * an operational table keyed on `trace_id` silently drops half the data.
 */
const LI_ION: readonly BatteryType[] = ["li_ion_nmc", "li_ion_lfp", "li_ion_nca"]
const isLithiumChemistry = (c: BatteryType) => LI_ION.includes(c)

/**
 * A stable `BatteryItem.traceId` for a demo item — the engine's own run id
 * format is `TRC-YYYY-NNNN` (layers/intake.ts). Derived from the pickup serial
 * and the item index for the same reason `demoItemId` is: `scripts/smoke.mjs`
 * needs a `/trace/<id>` URL that survives a reseed.
 *
 * `PKP-2026-000113` item 0 → `TRC-2026-1130`.
 */
function demoTraceId(pickupId: string, index: number): string {
  const serial = (pickupId.split("-").pop() ?? "0").slice(-3)
  return `TRC-2026-${serial}${index}`
}

/** @returns the seeded hub facility — CustodyBatch needs its id. */
async function seedReferenceData(adminId: string) {
  await prisma.marketPrices.create({
    data: {
      ...MARKET_PRICES,
      fxRateUsdInr: FX_RATE_USD_INR,
      // W6: where the row came from and who typed it. A seeded row has no
      // human author — `createdBy` is for a hand-entered override (C02).
      source: "seed",
      note: "Demo placeholders — right order of magnitude, not researched quotes.",
    },
  })

  // ── The active EngineConfig (Admin Batch 1 fixture 1) ────────────────────
  // 🔴 The margin tiers the engine prices against and the MarginTier enum a
  // supplier's override is stored in are two declarations of one list, in two
  // packages that cannot import each other. This is the only place both are in
  // scope, so this is where they get compared. A mismatch here means
  // Profile.marginTier can hold a value the engine has no tier for, and the
  // failure would surface as a silently unapplied override on a real quote.
  const engineTiers = Object.keys(DEFAULT_CONFIG.margin_tiers).sort()
  const schemaTiers = ["aggressive", "generous", "standard"]
  if (JSON.stringify(engineTiers) !== JSON.stringify(schemaTiers)) {
    throw new Error(
      `MarginTier drift: schema.prisma has [${schemaTiers}] but ` +
        `DEFAULT_CONFIG.margin_tiers has [${engineTiers}]. Fix both, then reseed.`,
    )
  }

  await prisma.engineConfig.create({
    data: {
      version: ENGINE_CONFIG_VERSION,
      // Byte-identical to DEFAULT_CONFIG, imported not retyped. AD8: tiers 1
      // and 2 are editable through B02; tier 3 (damage weights, damage bands,
      // SoH gates) lives as literals in the engine's own code and no screen can
      // move it. 🔴 No price moves on this seed.
      config: DEFAULT_CONFIG as object,
      isActive: true,
      note: "Seeded from DEFAULT_CONFIG — the engine's own reference values, unmodified.",
      publishedBy: adminId,
      parentVersion: null,
      publishedAt: day(30),
    },
  })

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

  const recyclerIds = {} as Record<RecyclerKey, string>
  for (const r of RECYCLERS) {
    const row = await prisma.recycler.create({
      data: {
        name: r.name,
        cpcbRegNo: r.cpcbRegNo,
        acceptedChemistries: [...r.acceptedChemistries],
        capacityKg: r.capacityKg,
      },
    })
    recyclerIds[r.key] = row.id
  }

  return { facility, recyclerIds }
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

  /**
   * Admin Batch 1 fixture 8. The stage this pickup HAD reached before it was
   * cancelled and then reactivated (`cancelled → requested`). Its `status` is
   * `requested` again, but its history — safety checklist, offer, status
   * events — is the history of everything it went through first.
   *
   * 🔴 Set this and the pickup keeps its `agentId` and `agentFeePaise`. That is
   * not a seed bug, it is the loose end CLAUDE.md flags in red: `reschedulePickup`
   * in the customer app voids `Offer.acceptedAt` but leaves both of those
   * columns alone, so a live pickup can sit at `requested` with an agent still
   * assigned to it. Batch 3's dispatch board is where it finally gets handled.
   */
  reactivatedFrom?: PickupStatus

  /** Override for the derived preferred date — a reactivation picks a NEW one. */
  preferredDateDaysAgo?: number
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
    // 4, not 6, so this pickup's `collected` status event lands on day(0) —
    // TODAY. Event dates are derived as day(daysAgo - i) over the stage list,
    // so for a 5-stage `collected` pickup 4 is the smallest value that keeps
    // every event non-future. This is the row behind the agent day view's
    // "Collected today" and "Earned today" (Batch 1); drop it back to 6 and
    // both stats read zero again.
    daysAgo: 4,
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

  // ── Admin Batch 1 fixtures ────────────────────────────────────────────────

  {
    // Fixture 2, row 1 of 2. `/dispatch` reading one unassigned pickup is a
    // demo of a list with nothing to choose between; three is a board.
    id: "PKP-2026-000111",
    status: "requested",
    category: "industrial",
    location: "Bhiwadi Industrial Area, Rajasthan",
    notes: "UPS bank decommissioned — needs a two-person lift.",
    daysAgo: 1,
    items: [
      { category: "industrial", quantity: 12, weightKg: 480, condition: "healthy", chemistry: "lead_acid" },
      { category: "industrial", quantity: 4, weightKg: 22, condition: "dead", chemistry: "li_ion_lfp" },
    ],
  },
  {
    // Fixture 2, row 2 of 2.
    id: "PKP-2026-000112",
    status: "requested",
    category: "ev",
    location: "Manesar Sector 8, Haryana",
    notes: "Two-wheeler fleet swap — packs already crated.",
    daysAgo: 2,
    items: [
      { category: "ev", quantity: 22, weightKg: 154, condition: "healthy", chemistry: "li_ion_nca" },
    ],
  },
  {
    // 🔴 FIXTURE 4 — the row that catches the wrong AD6 implementation.
    //
    // Two items, two chemistries, and under the non-overlapping recycler table
    // above they go to two DIFFERENT recyclers on two DIFFERENT manifests: the
    // li-ion nmc item onto the dispatched manifest, the lead-acid item onto a
    // manifest still sitting at `draft`.
    //
    // So when Batch 7's confirmManifestReceived() runs on the dispatched
    // manifest, this pickup MUST NOT advance — half its load is still at the
    // hub. The obvious implementation ("advance the pickups on this manifest")
    // advances it anyway, and every other seeded pickup lets that pass. This
    // one does not. Do not simplify it to a single chemistry.
    //
    // It also carries the OTHER trap: the lead-acid item is flat-rate, so it
    // has no `traceId` at all. A table keyed on trace_id drops it silently.
    id: "PKP-2026-000113",
    status: "tested",
    category: "industrial",
    location: "Ghaziabad Sahibabad Site IV, UP",
    notes: "Mixed load — segregated at the hub into two recycler streams.",
    daysAgo: 12,
    items: [
      { category: "portable", quantity: 30, weightKg: 15.8, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "industrial", quantity: 8, weightKg: 320, condition: "healthy", chemistry: "lead_acid" },
    ],
  },
  {
    // 🔴 FIXTURE 8 — a reactivated pickup, carrying a stale agent.
    //
    // It reached `offered`, the vendor cancelled, then rescheduled — and
    // `reschedulePickup` writes `cancelled → requested` rather than making them
    // file a new request (changed 2026-08-23; `cancelled` is re-enterable and
    // is NOT terminal). What it does NOT do is clear `agentId` or
    // `agentFeePaise`, so this row sits at `requested` with an agent still on
    // it. See `reactivatedFrom` above; Batch 3 is where dispatch has to cope.
    //
    // Two visible symptoms this fixture makes real, both already written up in
    // docs/LANE_OWNERSHIP.md:
    //   1. It shows up in the AGENT app's day view, which queries `agentId`
    //      with no status floor — a job the agent can neither start nor lose.
    //   2. Its audit log runs BACKWARDS: a `requested` event dated after a
    //      `cancelled` one. `buildStages` is first-wins, so the timeline still
    //      reads correctly; the ordering fact underneath it does not.
    id: "PKP-2026-000114",
    status: "requested",
    reactivatedFrom: "offered",
    category: "automotive",
    location: "Peeragarhi, New Delhi",
    notes: "Cancelled and rebooked by the vendor — original quote no longer valid.",
    daysAgo: 20,
    preferredDateDaysAgo: -3,
    items: [
      { category: "automotive", quantity: 6, weightKg: 84, condition: "healthy", chemistry: "lead_acid" },
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
    update: {
      role: "customer",
      phone: "+91 98110 22334",
      walletBalancePaise: 0,
      // Admin Batch 1 fixture 7. Feeds Config.supplier_margin_overrides, which
      // selection.ts already honours (W11). `standard` is DEFAULT_CONFIG's
      // middle tier, so seeding it moves NO price — it is what the engine
      // already applies when there is no override at all.
      //
      // ⚠ The other half of fixture 7, `eprRegNo`, is deliberately absent: the
      // vendor's `eprRegId` below already carries it. See the note on
      // Profile.marginTier in schema.prisma.
      marginTier: "standard",
    },
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
      marginTier: "standard",
    },
  })

  await prisma.profile.upsert({
    where: { id: agentId },
    // `walletBalancePaise: 0` for the same reason the vendor's upsert above
    // forces it (Batch 8): profiles are NOT wiped — they match real auth users —
    // but wallet_txns are, and the pickup loop re-credits the agent's fee from
    // scratch on every run. Without this reset a second `npm run reset-demo`
    // leaves the cache at double the ledger it is supposed to cache, and the
    // profile screen reconciles the two.
    update: { role: "agent", walletBalancePaise: 0 },
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

  const { facility, recyclerIds } = await seedReferenceData(adminId)

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
    // 🔴 A REACTIVATED pickup keeps its agent even though it is back at
    // `requested` — that is fixture 8's entire point, not an oversight here.
    const hasAgent =
      spec.reactivatedFrom !== undefined ||
      (spec.status !== "requested" && spec.status !== "cancelled")
    // Hoisted out of the pickup create (Batch 8) so the pickup column and the
    // agent's ledger entry below are literally the same number — the profile
    // screen reconciles the two, and computing agentFee(quote) twice is exactly
    // how they would drift.
    const agentFeePaise = hasAgent ? agentFee(quote) : null
    // How far along the lifecycle this pickup got. `cancelled` isn't part of
    // the ordered lifecycle — it stops after `requested`.
    //
    // For a reactivated pickup this is the stage it reached BEFORE being
    // cancelled, not its current `requested`: its safety checklist and its
    // offer are real history and must be seeded. The offer's `acceptedAt` still
    // comes out null, because `reachedIndex` stays short of `collected` — which
    // is exactly what voidOfferAcceptance leaves behind.
    const reachedIndex = spec.reactivatedFrom
      ? LIFECYCLE.indexOf(spec.reactivatedFrom as (typeof LIFECYCLE)[number])
      : spec.status === "cancelled"
        ? 0
        : LIFECYCLE.indexOf(spec.status as (typeof LIFECYCLE)[number])

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
        agentFeePaise,
        // Null on `collected` is the derived "pending drop-off" state (D5).
        custodyBatchId: DROPPED_OFF.includes(spec.status) ? CUSTODY_BATCH_ID : null,
        conditionFlags: [...new Set(spec.items.map((i) => i.condition))],
        // The agent's LIVE jobs sit on today's slate; everything past `offered`
        // keeps its historical slot. This is what makes the Field Agent day
        // view's "Assigned today" non-zero on a fresh seed (Batch 1) — and it
        // is also just true: a job you are scheduled for, or standing at, is
        // today's work. Without it every seeded slot is at least a day old and
        // the agent's home screen reads 0 / 0 / ₹0, which looks broken rather
        // than quiet.
        scheduledSlot: hasAgent
          ? spec.status === "scheduled" || spec.status === "arrived"
            ? day(0)
            : day(spec.daysAgo - 1)
          : null,
        etaMinutes: spec.status === "scheduled" ? 45 : null,
        // A reactivation picks a NEW preferred date, usually a future one —
        // that is the one field reschedulePickup actually rewrites.
        preferredDate: day(spec.preferredDateDaysAgo ?? spec.daysAgo - 1),
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
                  // The verdict for this item. Every seeded load is a recycle
                  // — the offers below already say so — so this agrees with
                  // Offer.pathway rather than inventing a second answer.
                  pathway: "recycle" as const,
                  // 🔴 LI-ION ONLY (D1). A flat-rate item never runs the engine
                  // and therefore has no engine run id. Every admin table that
                  // joins on `trace_id` has to survive that — half the seeded
                  // items have none. See fixture 4.
                  ...(isLithiumChemistry(item.chemistry)
                    ? { traceId: demoTraceId(spec.id, idx) }
                    : {}),
                }
              : {}),
          })),
        },
      },
    })

    // ── Mandatory pre-pickup safety checklist (W1 · Batch 2, Aamir) ─────────
    // Seeded for every pickup that reached `arrived` or beyond, because the
    // lifecycle implies it: all three HR documents make the check mandatory
    // BEFORE any battery is handled, so a pickup that got assessed necessarily
    // passed one. A seeded history without these rows would depict an app whose
    // central compliance gate nobody ever went through.
    //
    // ⚠ DELIBERATELY NOT SEEDED for PKP-2026-000102, the `scheduled` intake demo
    // job. That is the job the agent app's day view opens, and it must arrive at
    // the checklist un-done — it is both the demo of the gate and what
    // `scripts/smoke.mjs` asserts the gate REJECTS. Seeding it would make the
    // one screen this batch exists for unreachable in a fresh demo.
    //
    // PKP-2026-000103 (`arrived`) is the paired ADMIT case: it gets a passing
    // row, so /job/PKP-2026-000103/items renders and Ali's Batch 3 has a job
    // that is past the gate to build against.
    //
    // The shape must stay in step with `buildChecklistJson` in
    // packages/core/src/safety.ts. This file cannot import it — packages/database
    // must not depend on packages/core (the cycle breaks the generated client),
    // the same restatement the CO₂e factors already live with — so the keys are
    // repeated here and Batch 9's verification is where the two get compared.
    // `lithiumBasis: 'declared-category'` is honest: no agent answered these.
    if (reachedIndex >= LIFECYCLE.indexOf("arrived")) {
      const lithiumPresent = spec.items.some((i) => i.category !== "automotive")
      const damagedUnitsPresent = spec.items.some(
        (i) => i.condition === "swollen" || i.condition === "leaking",
      )

      const answers: Record<string, boolean> = {
        terminalsInsulated: true,
        noPuncturing: true,
        fireSafeCrate: true,
        noMixedChemistry: true,
        ppeWorn: true,
        ...(lithiumPresent
          ? { lithiumStateOfCharge: true, lithiumDamagedCellsIsolated: true }
          : {}),
        ...(damagedUnitsPresent ? { damagedUnitsContained: true } : {}),
      }

      await prisma.safetyChecklist.create({
        data: {
          pickupId: spec.id,
          agentId,
          items: {
            version: 1,
            lithiumPresent,
            lithiumBasis: "declared-category",
            damagedUnitsPresent,
            answers,
            required: Object.keys(answers),
            missing: [],
          },
          passed: true,
          // Before the agent started assessing — the check gates intake, so it
          // has to predate the work it gates.
          completedAt: day(spec.daysAgo),
        },
      })
    }

    // Chain-of-custody log: one event per stage reached, each with GPS.
    //
    // Dated `day(spec.daysAgo - i)` — one stage per day, walking forward to the
    // present — except for the reactivation tail below, which is the one place
    // the log deliberately runs out of order.
    const walked: PickupStatus[] =
      spec.status === "cancelled"
        ? ["requested", "cancelled"]
        : [...LIFECYCLE.slice(0, reachedIndex + 1)]

    type SeededEvent = { status: PickupStatus; daysAgo: number; role: "customer" | "vendor" | "agent" }

    const stages: SeededEvent[] = walked.map((status, i) => ({
      status,
      daysAgo: spec.daysAgo - i,
      role: i === 0 ? "customer" : "agent",
    }))

    // 🔴 The reactivation tail (fixture 8), written exactly the way
    // `reschedulePickup` writes it in apps/customer/handover/actions.ts: the
    // vendor cancels, then a SECOND `requested` event lands afterwards with
    // `actorRole: 'vendor'` and the reactivation note.
    //
    // Note this event is dated LATER than the `cancelled` one, which means the
    // append-only log genuinely runs backwards through the lifecycle. That is
    // the documented loose end, reproduced rather than papered over —
    // `buildStages` is first-wins precisely so the timeline still reads right.
    //
    // ⚠ `actorRole: 'vendor'` and not `'customer'` is not a slip either: it is
    // the literal string reschedulePickup inserts, while every other
    // vendor-written event in this seed says 'customer'. The two spellings for
    // one role are a real inconsistency in live code — noted for a cleanup,
    // not silently normalised here, because the seed's job is to look like
    // production.
    if (spec.reactivatedFrom) {
      stages.push({ status: "cancelled", daysAgo: spec.daysAgo - walked.length, role: "vendor" })
      stages.push({ status: "requested", daysAgo: 2, role: "vendor" })
    }

    for (const [i, { status, daysAgo, role }] of stages.entries()) {
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
          actorId: role === "agent" ? agentId : vendorId,
          actorRole: role,
          notes:
            spec.reactivatedFrom && status === "requested" && i > 0
              ? "Pickup rescheduled by vendor (reactivated from cancelled)"
              : undefined,
          lat: GEO.lat + i * 0.004,
          lng: GEO.lng - i * 0.003,
          photoUrls: eventPhoto ? [eventPhoto] : [],
          occurredAt: day(daysAgo),
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

      // ── The AGENT's fee, as a ledger entry (Batch 8, Aamir) ──────────────
      // A different person's money from the block above: `payout` credits the
      // VENDOR for the batteries, `agent_fee` credits the AGENT for the job
      // (D3). Two profiles, two ledgers, one table — which is why every read on
      // either side must filter by `profileId`, and why adding these rows moves
      // no vendor figure anywhere.
      //
      // Unconditional within `collected`+, unlike the vendor payout above:
      // the agent is paid ON collection (the job screen's own copy says so),
      // so it does not wait on the vendor's payout settling. The one pickup
      // still at `collected` has an unsettled vendor payment AND a paid agent —
      // that combination is correct, not an inconsistency.
      //
      // ⚠ Batch 6 writes exactly this row for real at collection time. When it
      // does, it must produce the SAME shape — the day view's "earned today"
      // tile derives from `agentFeePaise` on the pickup, and this ledger is
      // what funds it; the two disagreeing is a bug on the profile screen.
      if (agentFeePaise !== null) {
        const agentBalance = await prisma.profile
          .findUniqueOrThrow({ where: { id: agentId }, select: { walletBalancePaise: true } })
          .then((p) => p.walletBalancePaise + agentFeePaise)

        // Same rule as the vendor block: WalletTxn is the source of truth,
        // profiles.wallet_balance_paise is a cache, always written together.
        await prisma.$transaction([
          prisma.walletTxn.create({
            data: {
              profileId: agentId,
              deltaPaise: agentFeePaise,
              kind: "agent_fee",
              balanceAfterPaise: agentBalance,
              pickupId: spec.id,
              note: `Collection fee for ${spec.id}`,
              createdAt: day(spec.daysAgo - 2),
            },
          }),
          prisma.profile.update({
            where: { id: agentId },
            data: { walletBalancePaise: agentBalance },
          }),
        ])
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

  const manifestCount = await seedManifests(facility.id, recyclerIds)
  const exceptionCount = await seedExceptions(adminId)
  await seedAuditTrail(adminId, ENGINE_CONFIG_VERSION)

  console.log(`Seeded ${PICKUPS.length} pickups (one per lifecycle stage) for ${CUSTOMER_EMAIL}.`)
  console.log(`Seeded ${RECYCLERS.length} recyclers, ${manifestCount} manifests, ${exceptionCount} item exceptions.`)
  console.log(`Agent login: ${AGENT_EMAIL} / ${DEMO_PASSWORD}`)
  console.log(`Admin login: ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`)
}


// ─── Dispatch manifests (Admin Batch 1, fixtures 4 + 5) ──────────────────────
//
// A manifest is facility → recycler, and its status maps one-to-one onto how
// far the pickups on it have got (AD5):
//
//   draft       nothing has left the hub
//   dispatched  it left  →  its pickups sit at `tested`
//   received    the recycler confirmed  →  `processed`
//   reconciled  recovery captured  →  `recovered` (and on to `certified`)
//
// §3 asks only for one `dispatched` and one `draft`. This seeds the HISTORY as
// well: without it, every pickup already at processed / recovered / certified
// reached a recycler via nothing at all, and `/trace/[traceId]` would show a
// certified battery whose chain of custody stops at the hub. Decision logged in
// "Batch 1 — as built".
//
// 🔴 GROUPED BY (target status, recycler) ACROSS PICKUPS, which is what makes
// fixture 4 work: one pickup's items land on two different manifests, because
// chemistry segregation sends them to two different recyclers. `itemIds` is a
// Json snapshot rather than a join table on purpose — a dispatched manifest is
// immutable (schema comment says so), so it must not change when the items do.

/** Which manifest status a pickup at this stage implies. */
const MANIFEST_STAGE: Partial<Record<PickupStatus, ManifestStatus>> = {
  tested: "dispatched",
  processed: "received",
  recovered: "reconciled",
  certified: "reconciled",
}

/**
 * 🔴 THE ONE DELIBERATE GAP. This group is forced back to `draft` instead of
 * `dispatched`, which is what leaves PKP-2026-000113's lead-acid half sitting
 * at the hub while its li-ion half is out with a recycler.
 *
 * That is fixture 4's trap: confirming the dispatched manifest must NOT advance
 * PKP-2026-000113, because AD6 says a pickup advances only when EVERY one of
 * its items is covered. Remove this override and Batch 7's naive
 * "advance the pickups on this manifest" would pass its own tests.
 *
 * It doubles as §3 fixture 5's required `draft` manifest.
 */
const DRAFT_GROUP = { stage: "dispatched" as ManifestStatus, recycler: "lead" as RecyclerKey }

/**
 * Manifest ids are PINNED, same reasoning as CUSTODY_BATCH_ID: `scripts/smoke.mjs`
 * needs a `/manifests/<id>` URL that survives a reseed. 401 is the first one
 * generated, i.e. the dispatched li-ion manifest — the one fixture 4 turns on.
 */
const MANIFEST_ID_BASE = 401

async function seedManifests(
  facilityId: string,
  recyclerIds: Record<RecyclerKey, string>,
): Promise<number> {
  type Line = { pickupId: string; itemId: string; weightKg: number; daysAgo: number }
  // Keyed "<manifest status>|<recycler key>" so the order below is stable and
  // the pinned ids never shuffle between reseeds.
  const groups = new Map<string, Line[]>()

  for (const spec of PICKUPS) {
    const stage = MANIFEST_STAGE[spec.status]
    if (!stage) continue

    spec.items.forEach((item, idx) => {
      const recycler = RECYCLER_FOR_CHEMISTRY[item.chemistry]
      // No recycler accepts this chemistry — the AD7 gate having something real
      // to reject. Nothing seeded hits this today.
      if (!recycler) return

      const key = `${stage}|${recycler}`
      const lines = groups.get(key) ?? []
      lines.push({
        pickupId: spec.id,
        itemId: demoItemId(spec.id, idx),
        weightKg: item.weightKg,
        daysAgo: spec.daysAgo,
      })
      groups.set(key, lines)
    })
  }

  // Deterministic order: by manifest stage, then by the RECYCLERS table's own
  // order. Both are fixed lists, so the nth manifest is always the same one.
  const stageOrder: ManifestStatus[] = ["dispatched", "received", "reconciled"]
  const ordered: Array<[ManifestStatus, RecyclerKey, Line[]]> = []
  for (const stage of stageOrder) {
    for (const r of RECYCLERS) {
      const lines = groups.get(`${stage}|${r.key}`)
      if (lines?.length) ordered.push([stage, r.key, lines])
    }
  }

  let n = 0
  for (const [stage, recyclerKey, lines] of ordered) {
    const serial = MANIFEST_ID_BASE + n
    n += 1

    const isDraft = stage === DRAFT_GROUP.stage && recyclerKey === DRAFT_GROUP.recycler
    const status: ManifestStatus = isDraft ? "draft" : stage

    // Dated off the most recent pickup on the manifest, walking the same
    // one-stage-per-day clock the status-event loop uses. ⚠ Indicative, not a
    // reconstructed audit — do not read a seeded manifest timestamp as evidence
    // of anything. A real one is stamped by the action that writes it.
    const ref = Math.min(...lines.map((l) => l.daysAgo))
    const dispatchedAt = day(Math.max(ref - LIFECYCLE.indexOf("tested"), 0))
    const confirmedAt = day(Math.max(ref - LIFECYCLE.indexOf(status === "reconciled" ? "recovered" : "processed"), 0))

    await prisma.dispatchManifest.create({
      data: {
        id: `00000000-0000-4000-8000-00000000${serial}`,
        manifestNo: `MFT-2026-000${serial}`,
        facilityId,
        recyclerId: recyclerIds[recyclerKey],
        status,
        itemIds: lines.map((l) => l.itemId),
        totalWeightKg: lines.reduce((sum, l) => sum + l.weightKg, 0),
        // A draft has not left the building — both timestamps stay null, and
        // that is what `/manifests/new` is for.
        dispatchedAt: status === "draft" ? null : dispatchedAt,
        confirmedAt: status === "received" || status === "reconciled" ? confirmedAt : null,
        createdAt: day(Math.max(ref - LIFECYCLE.indexOf("tested"), 0)),
      },
    })
  }

  return n
}

// ─── Item exceptions (Admin Batch 1, fixture 6) ──────────────────────────────
//
// Engine HOLD / REVIEW flags an admin has to clear (W4/AD4). 🔴 These are per
// BATTERY ITEM and they are NOT a status: a pickup carrying a flagged item
// still sits at whatever lifecycle stage it reached. "Open" is `resolvedAt IS
// NULL` — there is no open/closed column.
//
// The four below are chosen to make `/exceptions` non-trivial:
//   * one on a flat-rate item with NO traceId — the row a trace_id-keyed table
//     would silently drop
//   * one already resolved, so the screen has both states to render
//   * three open, spread across two kinds
async function seedExceptions(adminId: string): Promise<number> {
  const rows = [
    {
      // PKP-2026-000106, the li-ion LFP line. A real SoH gate rejection.
      batteryItemId: demoItemId("PKP-2026-000106", 1),
      kind: "review" as const,
      cause: "soh_below_gate",
      detail: "SoH 58% — under the reuse gate but above the recycle floor. Needs a second read.",
      openedAt: day(3),
    },
    {
      // 🔴 PKP-2026-000113's LEAD-ACID line — a flat-rate item, so it has NO
      // traceId. Deliberate: the exceptions table must key on battery_item_id,
      // never on trace_id, or half the estate becomes invisible on this screen.
      batteryItemId: demoItemId("PKP-2026-000113", 1),
      kind: "hold" as const,
      cause: "damage_score_high",
      detail: "Casing damage found at the hub after intake. Held pending re-inspection.",
      openedAt: day(2),
    },
    {
      // PKP-2026-000107, the EV LFP line.
      batteryItemId: demoItemId("PKP-2026-000107", 1),
      kind: "review" as const,
      cause: "bms_entropy_anomaly",
      detail: "Entropy anomalies above threshold on the last read before dispatch.",
      openedAt: day(6),
    },
    {
      // Already closed — so the screen has a resolved row to render and the
      // audit trail below has something real to point at.
      batteryItemId: demoItemId("PKP-2026-000108", 1),
      kind: "review" as const,
      cause: "soh_below_gate",
      detail: "Swollen EV pack flagged at intake.",
      openedAt: day(18),
      resolution: "override" as const,
      resolvedBy: adminId,
      resolvedAt: day(16),
      notes: "Re-tested at the hub; damage is cosmetic. Cleared for the recycle stream.",
    },
  ]

  for (const row of rows) await prisma.itemException.create({ data: row })
  return rows.length
}

// ─── Admin audit trail (Admin Batch 1) ───────────────────────────────────────
//
// Not in §3's fixture list. Seeded anyway, because `/audit` would otherwise be
// an empty screen for the whole sprint — and more importantly because an audit
// log that does NOT account for the seeded world is worse than none: every
// other fixture here depicts an admin action nobody is recorded as having
// taken. These rows exist to be CONSISTENT with the rest of the seed, and each
// one points at a row this file actually created.
//
// 🔴 `action` values come from ADMIN_AUDIT_ACTIONS in packages/core/src/audit.ts,
// which is the closed vocabulary. Restated as literals here for the usual
// reason — packages/database must not depend on packages/core.
async function seedAuditTrail(adminId: string, configVersion: string) {
  const config = await prisma.engineConfig.findUniqueOrThrow({
    where: { version: configVersion },
    select: { id: true },
  })

  const manifests = await prisma.dispatchManifest.findMany({
    where: { status: { in: ["dispatched", "received", "reconciled"] } },
    select: { id: true, manifestNo: true, status: true, dispatchedAt: true },
    orderBy: { manifestNo: "asc" },
  })

  const exception = await prisma.itemException.findFirst({
    where: { resolvedAt: { not: null } },
    select: { id: true, batteryItemId: true, resolvedAt: true },
  })

  await prisma.adminAudit.create({
    data: {
      actorId: adminId,
      action: "config.publish",
      subjectType: "engine_config",
      subjectId: config.id,
      // `before` omitted, not written as null: a Prisma `Json?` column
      // distinguishes SQL NULL (Prisma.DbNull) from the JSON value `null`
      // (Prisma.JsonNull), and a bare `null` is a type error. There is no prior
      // config here, so leaving the column unset is the honest one.
      after: { version: configVersion, parentVersion: null },
      reason: "Initial published configuration — the engine's own reference values.",
      createdAt: day(30),
    },
  })

  for (const m of manifests) {
    await prisma.adminAudit.create({
      data: {
        actorId: adminId,
        action: "manifest.dispatch",
        subjectType: "dispatch_manifest",
        subjectId: m.id,
        before: { status: "draft" },
        after: { status: "dispatched", manifestNo: m.manifestNo },
        createdAt: m.dispatchedAt ?? day(5),
      },
    })
  }

  if (exception) {
    await prisma.adminAudit.create({
      data: {
        actorId: adminId,
        action: "exception.resolve",
        subjectType: "item_exception",
        subjectId: exception.id,
        before: { resolution: null },
        after: { resolution: "override", batteryItemId: exception.batteryItemId },
        reason: "Re-tested at the hub; damage is cosmetic.",
        createdAt: exception.resolvedAt ?? day(16),
      },
    })
  }
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
