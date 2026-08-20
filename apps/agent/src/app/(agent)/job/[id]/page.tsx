// /job/[id]  —  Batch 1 · Aamir
//
// Assigned job, not a pool offer (D2). Vendor, address, category, declared
// items, agent fee. Actions: Open in Google Maps, Call (tel:), Arrived.
// Writes scheduled → arrived.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Job" showBack backHref="/" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Job</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 1 · Aamir. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
