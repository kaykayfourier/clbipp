import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { AppShell, Button, PagePadding } from '@clbipp/ui'

import { AddressCard } from './AddressList'

// AppShell renders its own BottomTabBar unless hideNav is set, and (app)/layout
// already renders one (and owns the clearance under it) — so hideNav, same as
// track/[id].

export default async function AddressesPage() {
  const result = await getCurrentProfile()
  if (!result) redirect('/login')

  // Prisma bypasses RLS — the profileId scope here is what keeps one customer's
  // address book out of another's.
  const addresses = await prisma.address.findMany({
    where: { profileId: result.user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })

  return (
    <AppShell title="Pickup addresses" showBack backHref="/dashboard" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {addresses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <h2 className="font-serif text-lg font-medium text-text-primary">
              No pickup addresses yet
            </h2>
            <p className="max-w-xs text-sm text-text-secondary">
              Add the place we should collect from. You can save more than one and pick
              between them when you book.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              The default address is preselected when you book a pickup.
            </p>

            <div className="flex flex-col gap-3">
              {addresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={{
                    id: address.id,
                    label: address.label,
                    line1: address.line1,
                    line2: address.line2,
                    city: address.city,
                    state: address.state,
                    pincode: address.pincode,
                    // Decimal → plain boolean: the client island only needs to
                    // know whether coordinates exist, and a Prisma Decimal is
                    // not serialisable across the server/client boundary.
                    hasCoords: address.lat !== null && address.lng !== null,
                    status: address.status,
                    isDefault: address.isDefault,
                  }}
                />
              ))}
            </div>
          </>
        )}

        <Link href="/addresses/new">
          <Button variant={addresses.length === 0 ? 'primary' : 'secondary'} fullWidth>
            Add an address
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}
