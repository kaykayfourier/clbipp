import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const mockCertificate = {
  pickupId: "PKP-2031",
  weight: "248 kg",
  nickel: "54 kg",
  cobalt: "21 kg",
  lithium: "29 kg",
  dateCertified: "31 May 2026",
  publicToken: "CERT-2031-NMC",
}

export default function CertificatePage() {
  const cert = mockCertificate // replace with Prisma query by params.id later

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

        <div className="p-3.5">
          <div className="flex flex-col">
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">Battery ID</span>
              <span className="font-bold font-mono">{cert.pickupId}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">Weight processed</span>
              <span className="font-bold font-mono">{cert.weight}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">Nickel recovered</span>
              <span className="font-bold font-mono">{cert.nickel}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">Cobalt recovered</span>
              <span className="font-bold font-mono">{cert.cobalt}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-black/10 text-[11.5px]">
              <span className="text-[#6B6F6B]">Lithium recovered</span>
              <span className="font-bold font-mono">{cert.lithium}</span>
            </div>
            <div className="flex justify-between py-1.5 text-[11.5px]">
              <span className="text-[#6B6F6B]">Date certified</span>
              <span className="font-bold font-mono">{cert.dateCertified}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3">
            <div
              className="w-16 h-16 rounded-lg border-[3px] border-[#0a0a0a] flex-shrink-0"
              style={{
                background:
                  "conic-gradient(from 0deg,#0a0a0a 25%,#fff 0 50%,#0a0a0a 0 75%,#fff 0)",
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

      <Button variant="primary" fullWidth>
        Download PDF
      </Button>
      <Button variant="secondary" fullWidth>
        View compliance log
      </Button>
    </div>
  )
}