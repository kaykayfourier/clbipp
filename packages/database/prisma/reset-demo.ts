import { prisma } from "../src/client"

async function seedForExistingUser(email: string) {
  const profile = await prisma.profile.findFirst({ where: { email } })
  if (!profile) throw new Error(`No profile found for ${email}`)

  const vendorId = profile.id
  console.log(`Seeding for ${profile.fullName} (${vendorId})`)

  await prisma.$transaction([

    // ── PKP-3099 · certified ──────────────────────────────────────────
    prisma.pickup.create({
      data: {
        id: "PKP-3099",
        vendorId,
        batteryType: "li_ion_nmc",
        approxQuantity: "30 units",
        approxWeightKg: 480,
        location: "Delhi NCR, Kalkaji Mandir",
        status: "certified",
        notes: "Demo seeded pickup — certified",
      },
    }),
    ...["requested","scheduled","collected","tested","processed","recovered","certified"].map(
      (status, i) => prisma.statusEvent.create({
        data: {
          pickupId: "PKP-3099",
          status: status as any,
          actorRole: "system",
          occurredAt: new Date(Date.now() - (7 - i) * 24 * 60 * 60 * 1000),
        },
      })
    ),
    prisma.offer.create({
      data: {
        pickupId: "PKP-3099",
        vendorId,
        pathway: "recycle",
        estimatedPrice: 18450000,
        rationale: "High nickel content — metal recovery is the best route for this NMC pack.",
        materialBreakdown: [
          { material: "Nickel",  weight_kg: 31, value_paise: 12800000 },
          { material: "Cobalt",  weight_kg: 12, value_paise: 7400000  },
          { material: "Lithium", weight_kg: 18, value_paise: 3200000  },
          { material: "Copper",  weight_kg: 9,  value_paise: 1200000  },
        ],
        deductions: [
          { label: "Intake & sorting",         amount_paise: 1920000 },
          { label: "Refining & recovery",       amount_paise: 2830000 },
          { label: "Logistics · 100 km",        amount_paise: 800000  },
          { label: "QA, compliance & handling", amount_paise: 600000  },
        ],
      },
    }),
    prisma.certificate.create({
      data: {
        pickupId: "PKP-3099",
        vendorId,
        pdfUrl: "certificates/PKP-3099.pdf",
        totalWeightKg: 248,
        materialSummary: [
          { material: "Nickel",  recovered_kg: 31 },
          { material: "Cobalt",  recovered_kg: 12 },
          { material: "Lithium", recovered_kg: 18 },
          { material: "Copper",  recovered_kg: 9  },
        ],
      },
    }),

    // ── PKP-3100 · scheduled ──────────────────────────────────────────
    prisma.pickup.create({
      data: {
        id: "PKP-3100",
        vendorId,
        batteryType: "li_ion_lfp",
        approxQuantity: "60 units",
        approxWeightKg: 900,
        location: "Okhla Phase II, Delhi",
        status: "scheduled",
        notes: "Gate B entry, call on arrival",
      },
    }),
    ...["requested","scheduled"].map(
      (status, i) => prisma.statusEvent.create({
        data: {
          pickupId: "PKP-3100",
          status: status as any,
          actorRole: "system",
          occurredAt: new Date(Date.now() - (2 - i) * 24 * 60 * 60 * 1000),
        },
      })
    ),
    prisma.offer.create({
      data: {
        pickupId: "PKP-3100",
        vendorId,
        pathway: "refurbish",
        estimatedPrice: 31000000,
        rationale: "LFP pack health above 80% SoH — refurbishment preferred over recycling.",
        materialBreakdown: [
          { material: "Lithium",   weight_kg: 40, value_paise: 18000000 },
          { material: "Iron",      weight_kg: 90, value_paise: 9000000  },
          { material: "Phosphate", weight_kg: 30, value_paise: 6000000  },
        ],
        deductions: [
          { label: "Logistics",          amount_paise: 1200000 },
          { label: "Refurbishment cost", amount_paise: 1800000 },
        ],
      },
    }),

    // ── PKP-3101 · recovered ──────────────────────────────────────────
    prisma.pickup.create({
      data: {
        id: "PKP-3101",
        vendorId,
        batteryType: "li_ion_nca",
        approxQuantity: "12 units",
        approxWeightKg: 210,
        location: "Noida Sector 62",
        status: "recovered",
      },
    }),
    ...["requested","scheduled","collected","tested","processed","recovered"].map(
      (status, i) => prisma.statusEvent.create({
        data: {
          pickupId: "PKP-3101",
          status: status as any,
          actorRole: "system",
          occurredAt: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000),
        },
      })
    ),
    prisma.offer.create({
      data: {
        pickupId: "PKP-3101",
        vendorId,
        pathway: "recycle",
        estimatedPrice: 9500000,
        rationale: "NCA chemistry — cobalt and nickel recovery viable at current metal rates.",
        materialBreakdown: [
          { material: "Nickel",  weight_kg: 18, value_paise: 6000000 },
          { material: "Cobalt",  weight_kg: 7,  value_paise: 4100000 },
          { material: "Aluminium", weight_kg: 12, value_paise: 800000 },
        ],
        deductions: [
          { label: "Logistics", amount_paise: 500000 },
          { label: "Refining",  amount_paise: 900000 },
        ],
      },
    }),

  ])

  console.log("Seed complete for", email)
}

async function resetDemo() {
  const email = "business@test"
  const profile = await prisma.profile.findFirst({ where: { email } })
  if (!profile) throw new Error("Profile not found")

  const vendorId = profile.id

  // wipe in FK-safe order
  await prisma.certificate.deleteMany({ where: { vendorId } })
  await prisma.offer.deleteMany({ where: { vendorId } })
  await prisma.statusEvent.deleteMany({
    where: { pickup: { vendorId } }
  })
  await prisma.pickup.deleteMany({ where: { vendorId } })

  console.log("Wiped. Re-seeding...")

}

async function main(){

    await resetDemo()
    await seedForExistingUser("business@test")

}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })