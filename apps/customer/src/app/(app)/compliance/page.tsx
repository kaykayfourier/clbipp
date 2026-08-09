import { redirect } from "next/navigation"

import { prisma } from "@clbipp/database"
import { getCurrentProfile } from "@clbipp/auth"

import ComplianceClient from "./ComplianceClient"

export default async function CompliancePage() {
  const current = await getCurrentProfile()

  if (!current) {
    redirect("/login")
  }

  const vendorId = current.user.id

  const certificates = await prisma.certificate.findMany({
    where: {
      vendorId,
    },
    orderBy: {
      certifiedAt: "desc",
    },
  })

  const serializableCertificates = certificates.map((cert) => ({
  id: cert.id.toString(),
  pickupId: cert.pickupId,
  totalWeightKg: Number(cert.totalWeightKg),
  certifiedAt: cert.certifiedAt.getFullYear().toString(),
  publicToken: cert.publicToken,
}))

  return <ComplianceClient certificates={serializableCertificates} />
}