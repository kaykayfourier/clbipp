// /job/[id]/collect  —  Batch 6 · Ali
//
// Photos, drop-off slot, contact confirm, signature, agent fee. Gated on
// Offer.acceptedAt (D7) — the vendor accepts in apps/customer and status
// STAYS `offered`. Vendor-declines is a branch of this screen.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Collect" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Collect</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 6 · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
