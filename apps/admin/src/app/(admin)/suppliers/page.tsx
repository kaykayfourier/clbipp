import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { SuppliersTable, type SupplierRow } from './SuppliersTable'

// E01 · Suppliers — Batch 9, owner C — Ali.
//
// Vendors, EPR registration, KYC and the margin-tier override — the one
// mutation in this batch, and a live pricing lever (selection.ts already
// honours Profile.marginTier). See ./actions.ts for the write.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1)

  const vendors = await prisma.profile.findMany({
    where: { role: 'customer' },
    select: {
      id: true,
      fullName: true,
      companyName: true,
      vendorType: true,
      kycStatus: true,
      eprRegId: true,
      marginTier: true,
      _count: { select: { pickups: { where: { createdAt: { gte: startOfYear } } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const rows: SupplierRow[] = vendors.map((v) => ({
    id: v.id,
    name: v.companyName || v.fullName,
    contactName: v.companyName ? v.fullName : null,
    vendorType: v.vendorType,
    kycStatus: v.kycStatus,
    eprRegId: v.eprRegId,
    pickupsYtd: v._count.pickups,
    marginTier: v.marginTier,
  }))

  return (
    <>
      <PageHead title="Suppliers" description="Vendors, EPR registration, KYC status, and each one's margin-tier override." />
      <SuppliersTable rows={rows} />
    </>
  )
}
