// F01 · Compliance — Batch 13 · B (Khalid)
// Admin aggregate view: certified mass, CO₂ avoided, per-metal breakdown,
// certificate feed, and CPCB export.
// 🔴 No EPR-credit figure — report certified mass only (open question 17).

import { prisma } from "@clbipp/database"
import { buildAdminComplianceAggregate } from "@clbipp/core/compliance-export"
import { aggregateMaterials, formatMaterials, certificateNumber } from "@clbipp/core"
import { requireAdmin } from "@/lib/admin-identity"
import { redirect } from "next/navigation"

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect("/login")

  const { year } = await searchParams

  const aggregate = await buildAdminComplianceAggregate({ year })

  const certificates = await prisma.certificate.findMany({
    orderBy: { certifiedAt: "desc" },
    take: 50,
    include: { pickup: { select: { category: true } } },
  })

  const serialized = certificates.map((cert) => ({
    certNo: certificateNumber({
      pickupId:    cert.pickupId,
      category:    cert.pickup.category,
      certifiedAt: cert.certifiedAt,
    }),
    pickupId:      cert.pickupId,
    certifiedAt:   cert.certifiedAt.toISOString().slice(0, 10),
    totalWeightKg: Number(cert.totalWeightKg),
    co2AvoidedKg:  cert.co2AvoidedKg !== null ? Number(cert.co2AvoidedKg) : null,
    materials:     formatMaterials(aggregateMaterials([cert.materialSummary])),
    publicToken:   cert.publicToken,
  }))

  const exportHref = year
    ? `/api/admin/exports/compliance?year=${year}`
    : `/api/admin/exports/compliance`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Compliance
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Mass handled, recovery by metal, certificate feed and CPCB export.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Certified mass
          </div>
          <div className="mt-2 font-display text-3xl font-medium text-text-primary">
            {aggregate.certifiedMassKg.toLocaleString("en-IN")} kg
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {aggregate.period === "all" ? "All time" : aggregate.period}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            CO₂e avoided
          </div>
          <div className="mt-2 font-display text-3xl font-medium text-text-primary">
            {aggregate.co2AvoidedKg.toLocaleString("en-IN")} kg
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            Estimated — see impact.ts
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Certificates issued
          </div>
          <div className="mt-2 font-display text-3xl font-medium text-text-primary">
            {serialized.length}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            Showing latest 50
          </div>
        </div>
      </div>

      {aggregate.byMetal.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            Recovery by metal
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Material
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Recovered (kg)
                  </th>
                </tr>
              </thead>
              <tbody>
                {aggregate.byMetal.map((m) => (
                  <tr key={m.material} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-text-primary">{m.material}</td>
                    <td className="px-4 py-2 text-right font-mono text-text-primary">
                      {m.totalRecoveredKg.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Recent certificates
          </h2>
          <a
            href={exportHref}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90"
          >
            Export for CPCB return
          </a>
        </div>

        {serialized.length === 0 ? (
          <p className="text-sm text-text-secondary">No certificates issued yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Certificate no.
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Pickup
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Certified on
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Weight (kg)
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    CO₂e (kg)
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Materials
                  </th>
                </tr>
              </thead>
              <tbody>
                {serialized.map((cert) => (
                  <tr key={cert.certNo} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-text-primary">
                      {cert.certNo}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-primary">
                      {cert.pickupId}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {cert.certifiedAt}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">
                      {cert.totalWeightKg.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">
                      {cert.co2AvoidedKg !== null
                        ? cert.co2AvoidedKg.toLocaleString("en-IN")
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-secondary">
                      {cert.materials}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}