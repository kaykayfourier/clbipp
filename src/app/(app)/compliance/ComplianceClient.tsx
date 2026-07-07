"use client"

import { useState } from "react"
import Link from "next/link"

import { ListRow } from "@/components/ui/list-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type CertificateRow = {
  id: string
  pickupId: string
  totalWeightKg: number
  certifiedAt: string
  publicToken: string
}

const filters = ["All", "2026"]

export default function ComplianceClient({
  certificates,
}: {
  certificates: CertificateRow[]
}) {
  const [activeFilter, setActiveFilter] = useState("All")

  const filtered = certificates.filter((cert) => {
    if (activeFilter === "All") return true
    return cert.certifiedAt === activeFilter
  })

  const totalWeight = filtered.reduce(
    (sum, cert) => sum + cert.totalWeightKg,
    0
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-medium text-[#0E120E">
          Compliance log
        </h1>

        <p className="text-sm text-[#3B3F3B] mt-1">
          Every certificate in one place, ready for your CPCB return.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
              activeFilter === filter
                ? "bg-[#0E120E] text-[#F2EDE2] border-[#0E120E]"
                : "bg-white text-[#3B3F3B] border-black/10"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((cert) => (
          <Link
            key={cert.id}
            href={`/certificate/${cert.pickupId}`}
          >
            <ListRow
              id={cert.pickupId}
              subtitle={`${cert.totalWeightKg} kg`}
              status="certified"
            />
          </Link>
        ))}
      </div>

      <Card variant="default">
        <CardContent className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#1F231F]">
            Total certified
          </span>

          <span className="font-serif text-xl font-semibold">
            {totalWeight} kg
          </span>
        </CardContent>
      </Card>

      <Button variant="primary" fullWidth>
        Export for CPCB return
      </Button>
    </div>
  )
}