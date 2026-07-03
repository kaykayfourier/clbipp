import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {

  await prisma.$transaction([
    prisma.statusEvent.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.pickup.deleteMany(),
    prisma.profile.deleteMany(),
  ]);

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

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })