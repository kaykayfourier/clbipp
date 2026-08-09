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

/** Creates (or finds) a confirmed auth user and returns its uuid. */
async function ensureAuthUser(email: string, fullName: string): Promise<string> {
  const supabase = adminClient()

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
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
  await prisma.facility.deleteMany()
  await prisma.recycler.deleteMany()
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

async function seedReferenceData() {
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

  await prisma.facility.create({
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
async function listObjectsRecursive(prefix: string): Promise<string[]> {
  const supabase = adminClient()
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list(prefix, { limit: 1000 })

  if (error || !data) return []

  const paths: string[] = []
  for (const entry of data) {
    const child = `${prefix}/${entry.name}`
    // id === null marks a synthetic folder row; anything else is a real object.
    if (entry.id === null) paths.push(...(await listObjectsRecursive(child)))
    else paths.push(child)
  }
  return paths
}

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
async function wipePhotos(ownerIds: string[]) {
  const supabase = adminClient()
  for (const ownerId of ownerIds) {
    const paths = await listObjectsRecursive(ownerId)
    // remove() takes up to 1000 keys per call.
    for (let i = 0; i < paths.length; i += 1000) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 1000))
      if (error) console.warn(`  ! photo wipe failed: ${error.message}`)
    }
    if (paths.length) console.log(`Cleared ${paths.length} stored photo(s) for ${ownerId}.`)
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
    id: "PKP-2026-000102",
    status: "scheduled",
    category: "automotive",
    location: "Okhla Phase II, New Delhi",
    notes: "Gate B entry — call on arrival.",
    daysAgo: 2,
    items: [
      { category: "automotive", quantity: 14, weightKg: 196, condition: "healthy", chemistry: "lead_acid" },
      // Deliberately hazardous so the condition path is visible in the demo.
      { category: "automotive", quantity: 2, weightKg: 28, condition: "leaking", chemistry: "lead_acid" },
    ],
  },
  {
    // Batch 7A — the agent is on site, assessing. No offer yet: the company
    // flow document puts assessment and quoting on site, in that order.
    id: "PKP-2026-000103",
    status: "arrived",
    category: "portable",
    location: "Lajpat Nagar II, New Delhi",
    notes: "Agent on site — assessing the load.",
    daysAgo: 3,
    items: [
      { category: "portable", quantity: 18, weightKg: 9.4, condition: "healthy", chemistry: "li_ion_nmc" },
      { category: "portable", quantity: 4, weightKg: 2.1, condition: "swollen", chemistry: "li_ion_nmc" },
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
  const customer = await prisma.profile.findFirst({ where: { email: CUSTOMER_EMAIL } })
  if (!customer) throw new Error(`No profile for ${CUSTOMER_EMAIL} — log in once to create it.`)
  const vendorId = customer.id

  // Agent + admin as REAL auth users, so the Agent and Admin apps have
  // something to log into on day 3 (BATCH_0B_SCHEMA.md §5).
  const agentId = await ensureAuthUser(AGENT_EMAIL, "Ravi Kumar")
  const adminId = await ensureAuthUser(ADMIN_EMAIL, "Priya Nair")

  await prisma.profile.update({
    where: { id: vendorId },
    data: { role: "customer", phone: "+91 98110 22334", walletBalancePaise: 0 },
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

  await seedReferenceData()

  // Storage isn't covered by the database wipe — objects would otherwise pile
  // up across reseeds and the pickup ids they're filed under were renumbered in
  // Batch 7A, so the old ones are unreferenced by anything.
  await wipePhotos([vendorId, agentId])

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
        agentId: hasAgent ? agentId : null,
        category: spec.category,
        addressId: warehouse.id,
        location: spec.location,
        notes: spec.notes,
        status: spec.status,
        indicativeQuotePaise: quote,
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

      await prisma.payment.create({
        data: {
          pickupId: spec.id,
          vendorId,
          amountPaise: quote,
          method: "upi",
          status: "paid",
          paidAt: day(spec.daysAgo - 2),
        },
      })

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
          // ~8 kg CO2e avoided per kg of Li-ion recycled vs virgin material.
          // Canonical constants + citation live in packages/core/src/impact.ts.
          co2AvoidedKg: Math.round(weight * 8),
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
