import {prisma} from "src/lib/prisma"

async function main(){
    const pickups = await prisma.pickup.findMany({
    where:{ vendorId: "00000000-0000-0000-0000-000000000001" }
})

console.log(pickups)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
