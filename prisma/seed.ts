import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {

  await prisma.profile.deleteMany()
  await prisma.pickup.deleteMany()
  await prisma.statusEvent.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.certificate.deleteMany()

  
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



}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })