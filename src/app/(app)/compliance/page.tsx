"use client"

import { useState } from "react"
import { ListRow } from "@/components/ui/list-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const mockCertificates = [
  { id: "PKP-2031", subtitle: "248 kg ", type: "Recycling", year: "2026", status: "certified" as const },
  { id: "PKP-2024", subtitle: "180 kg ", type: "Recycling", year: " 2026", status: "requested" as const },
  { id: "PKP-2018", subtitle: "12 kg ", type: "Refurbishment", year: "2026", status: "scheduled" as const },
  { id: "PKP-2009", subtitle: "320 kg ", type: "Recycling", year: "2026", status: "certified" as const},
]

const filters = ["All", "Recycling", "Refurb", "2026"]

export default function CompliancePage() {
  const [activeFilter, setActiveFilter] = useState("All")

  const filtered = mockCertificates.filter((c) => {
    if (activeFilter === "All") return true
    if (activeFilter === "Refurb") return c.type === "Refurbishment"
    if (activeFilter === "Recycling") return c.type === "Recycling"
    if (activeFilter === "2026") return c.year === "2026"
    return true
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-medium text-[#0E120E]">Compliance log</h1>
        <p className="text-sm text-[#3B3F3B] mt-1">
          Every certificate in one place, ready for your CPCB return.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
              activeFilter === f
                ? "bg-[#0E120E] text-[#F2EDE2] border-[#0E120E]"
                : "bg-white text-[#3B3F3B] border-black/10"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((cert) => (
          <ListRow
            key={cert.id}
            id={`${cert.id} · ${cert.type}`}
            subtitle={cert.subtitle}
            status = {cert.status }
          />
        ))}
      </div>

      <Card variant="default">
        <CardContent className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#1F231F]">Total certified</span>
          <span className="font-serif text-xl font-semibold">9.1 t</span>
        </CardContent>
      </Card>

      <Button variant="primary" fullWidth>
        Export for CPCB return
      </Button>
    </div>
  )
}