import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { prisma } from '@clbipp/database'
import { AppShell, Button, Card, PagePadding } from '@clbipp/ui'

import { BookingWizard } from './BookingWizard'
import { draftFromPickup, type AddressOption, type InitialDraft } from './types'

// ─── /book — the 4-step booking wizard ───────────────────────────────────────
// Server component: resolves the caller and loads their addresses, then hands a
// plain-JSON shape to the client wizard. Prisma `Decimal` and `Date` do not
// cross the server→client boundary cleanly, so nothing raw is passed down —
// `AddressOption` is a deliberately narrow, serialisable projection.
//
// `userId` is passed to the client on purpose: the photo step uploads straight
// from the browser (a `File` can't survive a trip through a server action), and
// `buildObjectPath` needs the uid to write the "<uid>/…" prefix that every
// storage RLS policy checks. It is not a secret — it's the caller's own id, and
// the server action re-resolves it from the session cookie rather than trusting
// anything the client sends back.

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Only operational addresses can be booked against. `not_operational` means
  // "on file, but we can't collect from it today" — it stays in the address
  // book but must not appear in the picker.
  const addresses = await prisma.address.findMany({
    where: { profileId: user.id, status: 'operational' },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      label: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      pincode: true,
      isDefault: true,
    },
  })

  if (addresses.length === 0) {
    return <NoAddressState />
  }

  const options: AddressOption[] = addresses.map((a) => ({
    id: a.id,
    label: a.label,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  }))

  // ── Repeat booking: /book?from=<pickupId> ──────────────────────────────────
  // Scoped by vendorId, because Prisma bypasses RLS — ownership is enforced
  // here in code, the same rule as @/lib/custody and @/lib/documents. An id
  // belonging to someone else simply finds nothing and the wizard opens blank,
  // which is the right failure: a "not yours" error would confirm it exists.
  //
  // Photos are NOT read at all, let alone copied — see draftFromPickup.
  let initialDraft: InitialDraft | null = null
  if (from) {
    const source = await prisma.pickup.findFirst({
      where: { id: from, vendorId: user.id },
      select: {
        id: true,
        category: true,
        addressId: true,
        items: {
          select: { quantity: true, weightKg: true, condition: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (source) {
      // Only if the address is still bookable. `options` is already filtered to
      // operational addresses, so an address that has since been marked not
      // operational (or deleted) falls back to the default rather than
      // preselecting something the picker won't show.
      const addressStillBookable = options.some((a) => a.id === source.addressId)

      initialDraft = draftFromPickup({
        pickupId: source.id,
        category: source.category,
        addressId: addressStillBookable ? source.addressId : null,
        lines: source.items.map((item) => ({
          quantity: item.quantity,
          // Decimal → number at the boundary; nothing raw crosses to the client.
          weightKg: item.weightKg === null ? null : Number(item.weightKg),
          condition: item.condition,
        })),
      })
    }
  }

  return <BookingWizard userId={user.id} addresses={options} initialDraft={initialDraft} />
}

// A booking cannot be written without an `addressId`, so this is a hard
// prerequisite rather than a step the customer can skip. Sending them to the
// address book is the only useful thing this screen can do.
function NoAddressState() {
  return (
    <AppShell title="Request pickup" showBack backHref="/dashboard" hideNav>
      <PagePadding className="flex flex-col gap-4">
        <Card variant="default" className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-medium text-text-primary">
            Add a pickup address first
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            We need somewhere to send the field agent. Add your warehouse or site address and
            you can book a pickup right after.
          </p>
          <Link href="/addresses/new" className="block">
            <Button variant="primary" fullWidth>
              Add an address
            </Button>
          </Link>
        </Card>

        <p className="text-center text-xs text-text-secondary">
          Already added one?{' '}
          <Link href="/addresses" className="underline">
            Check it isn&apos;t marked not operational
          </Link>
          .
        </p>
      </PagePadding>
    </AppShell>
  )
}
