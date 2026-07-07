import {ListRow} from "@/components/ui/list-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"
import type { Pickup } from "@prisma/client"

type DashboardStats{
  pickupCount: number
  certificateCount: number
}




function PopulatedDashboardPage({pickups,stats,}: {pickups: Pickup[], stats: DashboardStats}) {
    return(
        <div className="flex flex-col gap-4 p-4">

            {/* Heading */}
            <div>
                <h1 className="font-serif text-2xl font-medium text-[#666666]">Hello, Altigreen</h1>
                <p className="text-sm text-[#666666]">Your recovery at a glance</p>

                
            </div>

        {/* Stat cards — map over the object's entries */}
        <div className = "grid grid-cols-3 gap-2">
            <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{stats.pickupCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1"> Pickups </div>
          </CardContent>
        </Card>
            <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold"> - </div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Recovered</div>
          </CardContent>
        </Card>
            <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{stats.certificateCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Certificates</div>
          </CardContent>
        </Card>
        </div>    

        {/* Request Button */}
        <Button variant="primary">Submit request</Button>

        {/* Section Label */}
        <p className="text-[11px] font-semibold tracking-widest uppercase text-[#666666]">
            Recent Pickups
        </p>

        {/*List Rows */}
        <div className="flex flex-col gap-2">
            {pickups.map((pickup) =>(
                <ListRow
                    key = {pickup.id}
                    id = {pickup.id}
                    subtitle = {`${pickup.batteryType} · ${pickup.approxQuantity}`}
                    status = {pickup.status}
                />

                
            ))}
        </div>



        </div>
    )
}

function EmptyDashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 p-8 min-h-[70vh]">
      <div className="w-20 h-20 rounded-2xl bg-[#E8E1D2] flex items-center justify-center text-[#6B6F6B]">
        {/* battery icon here */}
      </div>
      <h1 className="font-serif text-2xl font-medium text-[#0E120E]">No pickups yet</h1>
      <p className="text-sm text-[#3B3F3B] max-w-[220px] leading-relaxed">
        Request your first battery pickup to start recovering materials and earning EPR certificates.
      </p>
      <Button variant="primary" fullWidth className="max-w-[220px]">
        Request a pickup
      </Button>
    </div>
  )
}

export default async function DashboardPage(){
  const pickups = await prisma.pickup.findMany({
        where: {vendorId: "00000000-0000-0000-0000-000000000001", },
        orderBy: {
            createdAt: "desc",
        },
    })
    const hasPickups = pickups.length > 0;

    return hasPickups ? <PopulatedDashboardPage/>  : <EmptyDashboardPage/>;
}