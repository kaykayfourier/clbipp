import Link from 'next/link'
import { prisma } from '@clbipp/database'

// Small header chip showing where a pickup would be collected from, so the
// default address is visible without opening the address book. Server
// component — it does its own read and takes the caller's id from the page.
export async function AddressChip({ profileId }: { profileId: string }) {
  const [defaultAddress, total] = await Promise.all([
    prisma.address.findFirst({
      where: { profileId, isDefault: true },
      select: { label: true, city: true, status: true },
    }),
    prisma.address.count({ where: { profileId } }),
  ])

  const label = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.city}`
    : total > 0
      ? 'Choose a default address'
      : 'Add a pickup address'

  return (
    <Link
      href="/addresses"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-background"
    >
      <span aria-hidden="true">📍</span>
      <span className="truncate text-text-primary">{label}</span>
      {defaultAddress?.status === 'not_operational' && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Not operational
        </span>
      )}
      <span aria-hidden="true" className="shrink-0">
        ›
      </span>
    </Link>
  )
}
