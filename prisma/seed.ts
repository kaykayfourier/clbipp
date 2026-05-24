import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.pathwayFactor.create({
    data: {
      configVersion: 'v2026-Q2',
      isActive: true,

      processingRatePerKg: 40,
      refurbLaborRatePerKg: 180,
      cellReplacementRate: 400,
      testingRatePerKg: 50,
      hydrometRatePerKg: 60,

      metalPrices: {
        Li: 1200,
        Co: 2800,
        Ni: 1500,
        Mn: 200,
        Cu: 850,
        Al: 220,
      },

      chemistryComposition: {
        NMC622: {
          Li: 0.07,
          Co: 0.05,
          Ni: 0.15,
          Mn: 0.05,
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