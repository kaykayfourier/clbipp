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

  // Everything crossing into the client component is a plain JSON value —
  // `id` is a BigInt and `totalWeightKg` / `co2AvoidedKg` are Decimals, neither
  // of which survives serialisation.
  const serializableCertificates = certificates.map((cert) => ({
    id: cert.id.toString(),
    pickupId: cert.pickupId,
    totalWeightKg: Number(cert.totalWeightKg),
    // Batch 9: the year the row is filtered and grouped by. Still a string
    // because the filter chips compare against it.
    certifiedAt: cert.certifiedAt.getFullYear().toString(),
    // Nullable on certificates issued before the column existed — 0 contributes
    // nothing to the total, which is the honest answer for "not recorded".
    co2AvoidedKg: Number(cert.co2AvoidedKg ?? 0),
    publicToken: cert.publicToken,
  }))

  return <ComplianceClient certificates={serializableCertificates} />
}