"use client"

import { useState } from "react"
import Link from "next/link"

import { ListRow } from "@clbipp/ui"
import { Button } from "@clbipp/ui"
import { Card, CardContent } from "@clbipp/ui"

type CertificateRow = {
  id: string
  pickupId: string
  totalWeightKg: number
  certifiedAt: string
  co2AvoidedKg: number
  publicToken: string
}

const ALL = "All"

export default function ComplianceClient({
  certificates,
}: {
  certificates: CertificateRow[]
}) {
  const [activeFilter, setActiveFilter] = useState(ALL)

  // Derived from the data rather than hard-coded. This list used to be
  // `["All", "2026"]`, which would have silently hidden every certificate the
  // moment the year rolled over — and quietly exported the wrong year with it,
  // now that the filter drives the download.
  const years = [...new Set(certificates.map((cert) => cert.certifiedAt))].sort(
    (a, b) => Number(b) - Number(a),
  )
  const filters = [ALL, ...years]

  const filtered = certificates.filter((cert) => {
    if (activeFilter === ALL) return true
    return cert.certifiedAt === activeFilter
  })

  const totalWeight = filtered.reduce((sum, cert) => sum + cert.totalWeightKg, 0)
  const totalCo2 = Math.round(filtered.reduce((sum, cert) => sum + cert.co2AvoidedKg, 0))

  // Batch 9 (B5). The button was dead — no handler at all. It is a plain link to
  // the export route rather than a fetch + blob: the route already sets
  // `Content-Disposition: attachment`, so the browser's own download handling
  // does the work, and it keeps working with JS disabled or mid-hydration.
  //
  // The active year rides along, so what you export is what you are looking at.
  const exportHref =
    activeFilter === ALL
      ? "/api/exports/compliance"
      : `/api/exports/compliance?year=${activeFilter}`

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        {/* fixed: closed bracket on color class */}
        <h1 className="font-serif text-2xl font-medium text-[#0E120E]">
          Compliance log
        </h1>
        <p className="text-sm text-[#3B3F3B] mt-1">
          Every certificate in one place, ready for your CPCB return.
        </p>
      </div>

      {filters.length > 1 && (
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
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((cert) => (
          // fixed: plural /certificates
          <Link key={cert.id} href={`/certificates/${cert.pickupId}`}>
            <ListRow
              id={cert.pickupId}
              subtitle={`${cert.totalWeightKg} kg · ${cert.certifiedAt}`}
              status="certified"
            />
          </Link>
        ))}
      </div>

      <Card variant="default">
        <CardContent className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-[#1F231F]">Total certified</span>
            <span className="font-serif text-xl font-semibold">{totalWeight} kg</span>
          </div>
          {totalCo2 > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-secondary">CO₂e avoided</span>
              <span className="text-sm font-semibold text-text-primary">
                {totalCo2.toLocaleString("en-IN")} kg
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* `download` is a hint only — the route's Content-Disposition is what
          actually names the file, and it is the half a caller can't override. */}
      <a href={exportHref} download className="block">
        <Button variant="primary" fullWidth>
          Export for CPCB return
        </Button>
      </a>
    </div>
  )
}
