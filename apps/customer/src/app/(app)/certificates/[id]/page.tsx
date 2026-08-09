import { prisma } from "@clbipp/database"
import { Button } from "@clbipp/ui"
import { Card } from "@clbipp/ui"
import { getCurrentProfile } from "@clbipp/auth"
import { certificateNumber } from "@clbipp/core"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

// fixed: params is a Promise in Next 16
export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const current = await getCurrentProfile()
  if (!current) redirect("/login")

  const vendorId = current.user.id

  const cert = await prisma.certificate.findFirst({
    where: { pickupId: id, vendorId },
    // Batch 8: the category feeds the certificate number, which is derived
    // rather than stored (see @clbipp/core documents.ts) — so the screen and
    // the PDF show the same number without a schema column for it.
    include: { pickup: { select: { category: true } } },
  })

  if (!cert) notFound()

  const certNumber = certificateNumber({
    pickupId: cert.pickupId,
    category: cert.pickup.category,
    certifiedAt: cert.certifiedAt,
  })

  const summary = cert.materialSummary as Array<{ material: string; recovered_kg: number }>

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-serif text-2xl font-medium text-[#0E120E]">EPR Certificate</h1>

      <Card variant="elevated" padding="none" className="overflow-hidden">
        <div className="bg-[#0E120E] text-[#F2EDE2] px-3.5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-[13px]">
            <div className="w-5 h-5 rounded-[5px] bg-[#C5F050] text-[#0E120E] flex items-center justify-center text-[11px] font-extrabold">
              B2
            </div>
            Back2Basics
          </div>
          <div className="text-[9px] tracking-widest uppercase opacity-80">Recycling</div>
        </div>

        <div className="p-3.5 flex flex-col">
          <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
            <span className="text-[#6B6F6B]">Certificate no.</span>
            <span className="font-bold font-mono text-right">{certNumber}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
            <span className="text-[#6B6F6B]">Battery ID</span>
            <span className="font-bold font-mono">{cert.pickupId}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
            <span className="text-[#6B6F6B]">Weight processed</span>
            <span className="font-bold font-mono">{cert.totalWeightKg.toString()} kg</span>
          </div>

          {summary.map((m) => (
            <div key={m.material} className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">{m.material} recovered</span>
              <span className="font-bold font-mono">{m.recovered_kg} kg</span>
            </div>
          ))}

          {cert.co2AvoidedKg !== null && (
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">CO₂e avoided</span>
              <span className="font-bold font-mono">
                {Number(cert.co2AvoidedKg).toLocaleString("en-IN")} kg
              </span>
            </div>
          )}

          <div className="flex justify-between py-1.5 text-[11.5px]">
            <span className="text-[#6B6F6B]">Date certified</span>
            <span className="font-bold font-mono">
              {cert.certifiedAt.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-3">
            <div
              className="w-16 h-16 rounded-lg border-[3px] border-[#0a0a0a] flex-shrink-0"
              style={{
                background: "conic-gradient(from 0deg,#0a0a0a 25%,#fff 0 50%,#0a0a0a 0 75%,#fff 0)",
                backgroundSize: "16px 16px",
              }}
            />
            <div className="text-[10.5px] text-[#6B6F6B] leading-relaxed">
              Scan to verify on the public recovery record.
              <br />
              <b>{cert.publicToken}</b>
            </div>
          </div>
        </div>
      </Card>

      {/* Batch 8: this was a dead button. It now hits the ownership-checked
          document route, which renders the PDF on first request, caches it in
          the private `certificates` bucket and streams the bytes back. */}
      <a href={`/api/documents/certificate/${cert.pickupId}`} target="_blank" rel="noreferrer">
        <Button variant="primary" fullWidth>Download PDF</Button>
      </a>
      {/* fixed: plural /certificates */}
      <Link href="/compliance">
        <Button variant="secondary" fullWidth>View compliance log</Button>
      </Link>
    </div>
  )
}