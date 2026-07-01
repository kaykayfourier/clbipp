import {ListRow} from "@/components/ui/list-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const MockStats = {
    recycled: "12.4t",
    recovered: "9.1t",
    certificates: 7,
}

const MockPickups: Array<{
    id: string
    subtitle: string
    status: "scheduled" | "processed" | "recovered" | "requested" | "collected" | "tested" | "certified"
}> = [
    { id: "PKP-2042", subtitle: "Li-ion NMC · 24 units", status: "scheduled" },
    { id: "PKP-2041", subtitle: "LFP · 60 units", status: "processed" },
    { id: "PKP-2039", subtitle: "Li-ion NMC · 18 units", status: "recovered" },

]

function PopulatedDashboardPage() {
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
            <div className="font-serif text-xl font-semibold">{MockStats.recycled}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Recycled</div>
          </CardContent>
        </Card>
            <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{MockStats.recovered}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#666666] mt-1">Recovered</div>
          </CardContent>
        </Card>
            <Card variant="elevated">
          <CardContent>
            <div className="font-serif text-xl font-semibold">{MockStats.certificates}</div>
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
            {MockPickups.map((pickup) =>(
                <ListRow
                    key = {pickup.id}
                    id = {pickup.id}
                    subtitle = {pickup.id}
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
const hasPickups = MockPickups.length > 0;
export default function DashboardPage(){
    return hasPickups ? <PopulatedDashboardPage/>  : <EmptyDashboardPage/>;
}