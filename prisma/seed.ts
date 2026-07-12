import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {

  async function seed_data(){

  // Individual Vendor data insertion
  await prisma.profile.create({
    data: {
      id: "00000000-0000-0000-0000-000000000001",
      vendorType: 'individual',
      fullName: "Aamir Hashmi Singh",
      email: "aamirsingh@6969",
      phone: "+91 1234656767",
      
    },
  })
  console.log("Profiles data inserted")

  await prisma.pickup.create({
    data: {
      id: "PKP-2031",
      vendorId: "00000000-0000-0000-0000-000000000001",
      batteryType: "li_ion_nmc",
      approxQuantity: "90 units",
      approxWeightKg: 480.00,
      location: "Johri Farm",
      status: "certified",
      
    },
  })

  console.log('PICKUP data inserted.')

  const stages = ["requested","scheduled","collected","tested","processed","recovered","certified"]
  for (const status of stages) {
    await prisma.statusEvent.create({
      data: {pickupId: "PKP-2031", status: status as any, actorRole: "system"}
    })
  }
  console.log("Status events populated")
  await prisma.offer.create({
  data: {
    pickupId: "PKP-2031",
    vendorId: "00000000-0000-0000-0000-000000000001",
    pathway: "recycle",
    estimatedPrice: 18450000, // paise
    rationale: "High nickel content, metal recovery is the best route.",
    materialBreakdown: [
      { material: "Nickel", weight_kg: 31, value_paise: 12800000 },
      { material: "Cobalt", weight_kg: 12, value_paise: 7400000 },
    ],
    deductions: [
      { label: "Logistics", amount_paise: 800000 },
    ],
  }
})
  console.log("Offers data inserted")

  await prisma.certificate.create({
    data: {
      pickupId: "PKP-2031",
      vendorId: "00000000-0000-0000-0000-000000000001",
      pdfUrl: "certificates/PKP-2031.pdf",
      totalWeightKg: 248,
      materialSummary: [
        { material: "Nickel", recovered_kg: 54 },
        { material: "Cobalt", recovered_kg: 21 },
      ],
    }
  })
  console.log("certificates data inserted")
    


    // Fleet Vendor data insertion
  await prisma.profile.create({
    data: {
      id: "00000000-0000-0000-0000-000000000002",
      vendorType: 'fleet',
      fullName: "Riya Sharma",
      email: "riya@altigreen.com",
      phone: "+91 9876543210",
      companyName: "Altigreen Propulsion",
      gstNumber: "22AAAAA0000A1Z5",
      panNumber: "AAAAA0000A",
      businessAddress: "Plot 12, Bhiwandi Industrial Area, Maharashtra",
      eprRegId: "EPR-PRO-449201",
      kycStatus: "verified",
      kycDocUrls: [],
    },
  })
  console.log("Fleet profile inserted")


  await prisma.pickup.create({
    data: {
      id: "PKP-2024",
      vendorId: "00000000-0000-0000-0000-000000000002",
      batteryType: "li_ion_lfp",
      approxQuantity: "18 units",
      approxWeightKg: 320.00,
      location: "Altigreen Warehouse, Bhiwandi",
      status: "certified",
    }
  })

  for (const status of stages) {
    await prisma.statusEvent.create({
      data: { pickupId: "PKP-2024", status: status as any, actorRole: "system" }
    })
  }

  await prisma.offer.create({
    data: {
      pickupId: "PKP-2024",
      vendorId: "00000000-0000-0000-0000-000000000002",
      pathway: "recycle",
      estimatedPrice: 12200000,
      rationale: "High lithium concentration, full metal recovery recommended.",
      materialBreakdown: [
        { material: "Nickel", weight_kg: 22, value_paise: 7400000 },
        { material: "Lithium", weight_kg: 14, value_paise: 3200000 },
        { material: "Copper", weight_kg: 8,  value_paise: 1100000 },
      ],
      deductions: [
        { label: "Logistics", amount_paise: 600000 },
        { label: "Refining", amount_paise: 900000 },
      ],
    }
  })

  await prisma.certificate.create({
    data: {
      pickupId: "PKP-2024",
      vendorId: "00000000-0000-0000-0000-000000000002",
      pdfUrl: "certificates/PKP-2024.pdf",
      totalWeightKg: 180,
      materialSummary: [
        { material: "Nickel",  recovered_kg: 22 },
        { material: "Lithium", recovered_kg: 14 },
        { material: "Copper",  recovered_kg: 8  },
      ],
    }
  })
  console.log("PKP-2024 certified pickup inserted")

  await prisma.pickup.create({
    data: {
      id: "PKP-2039",
      vendorId: "00000000-0000-0000-0000-000000000002",
      batteryType: "li_ion_lfp",
      approxQuantity: "60 units",
      approxWeightKg: 900.00,
      location: "Altigreen Warehouse, Bhiwandi",
      status: "recovered",
    }
  })

  for (const status of ["requested","scheduled","collected","tested","processed","recovered"]) {
    await prisma.statusEvent.create({
      data: { pickupId: "PKP-2039", status: status as any, actorRole: "system" }
    })
  }

  await prisma.offer.create({
    data: {
      pickupId: "PKP-2039",
      vendorId: "00000000-0000-0000-0000-000000000002",
      pathway: "recycle",
      estimatedPrice: 31000000,
      rationale: "LFP pack in good condition, phosphate recovery viable.",
      materialBreakdown: [
        { material: "Lithium",   weight_kg: 40, value_paise: 18000000 },
        { material: "Iron",      weight_kg: 90, value_paise: 9000000  },
        { material: "Phosphate", weight_kg: 30, value_paise: 6000000  },
      ],
      deductions: [
        { label: "Logistics", amount_paise: 1200000 },
        { label: "Refining",  amount_paise: 1800000 },
      ],
    }
  })
  console.log("PKP-2039 recovered pickup inserted")

  // Pickup 3 — scheduled (agent assigned, not yet collected)
  await prisma.pickup.create({
    data: {
      id: "PKP-2042",
      vendorId: "00000000-0000-0000-0000-000000000002",
      batteryType: "li_ion_nmc",
      approxQuantity: "24 units",
      approxWeightKg: 480.00,
      location: "Bhiwandi WH-3",
      status: "scheduled",
      notes: "Access via gate B, contact Riya on arrival",
    }
  })

  for (const status of ["requested", "scheduled"]) {
    await prisma.statusEvent.create({
      data: { pickupId: "PKP-2042", status: status as any, actorRole: "system" }
    })
  }
  console.log("PKP-2042 scheduled pickup inserted")
    }
  async function reset_data(){
    await prisma.$transaction([
    prisma.statusEvent.deleteMany({
      where: {pickupId: "PKP-3099",}
    }
    ),
    prisma.offer.deleteMany({where: {pickupId: "PKP-3099"}}),
    prisma.certificate.deleteMany({where: {pickupId: "PKP-3099"}}),
    prisma.pickup.deleteMany({where: {id: "PKP-3099"}}),
    //prisma.profile.deleteMany({where: {id: "efc87c57-1659-4de1-98af-86c2068b65e2"}}),
  ]);
  console.log("Seed data deleted. Sim tables reset")
  }

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

  

  await reset_data()
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