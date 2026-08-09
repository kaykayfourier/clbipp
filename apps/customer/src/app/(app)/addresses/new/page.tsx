import { AppShell, PagePadding } from '@clbipp/ui'

import { AddressForm } from '../AddressForm'
import { createAddress } from '../actions'

const NAV_PADDING = 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))]'

// Server shell around the client form. Validation failures come back as
// ?error= rather than a thrown exception so the screen still renders.
export default async function NewAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AppShell
      title="Add address"
      showBack
      backHref="/addresses"
      hideNav
      contentClassName={NAV_PADDING}
    >
      <PagePadding className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <AddressForm action={createAddress} />
      </PagePadding>
    </AppShell>
  )
}
