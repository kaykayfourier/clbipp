import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {

  await prisma.pathwayFactor.updateMany({
    where: { isActive: true },
    data: {isActive: false}
  })
  
  await prisma.marketPrices.create({
    data: {
      Li: 1200,
      Co: 2800,
      Ni: 1500,
      Mn: 200,
      Cu: 850,
      Al: 220, 
    },
  })


  await prisma.pathwayFactor.create({
    data: {
      configVersion: 'v2026-Q2',
      isActive: true,

      processingRatePerKg: 40.0,
      refurbLaborRatePerKg: 180.0,
      cellReplacementRate: 400.0,
      testingRatePerKg: 50.0,
      hydrometRatePerKg: 60.0,

      chemistryComposition: {
        NMC622: {
          Li: 0.07,
          Co: 0.05,
          Ni: 0.15,
          Mn: 0.05,
          Cu: 0.12,
          Al: 0.15,
        },
        LFP: {
          Li: 0.04,
          Co: 0.00,
          Ni: 0.00,
          Mn: 0.00,
          Cu: 0.12,
          Al: 0.18,
        },
        C811: {
          Li: 0.07,
          Co: 0.05,
          Ni: 0.15,
          Mn: 0.05,
          Cu: 0.12,
          Al: 0.15,
        },
        LCO: {
          Li: 0.07,
          Co: 0.02,
          Ni: 0.20,
          Mn: 0.03,
          Cu: 0.12,
          Al: 0.15,
        },
      },
    },
  })

  console.log('Seed data inserted.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })