// /job/[id]/items  —  Batch 3 · Ali
//
// NEW (W3/D1). The spine of the multi-item flow: every BatteryItem with a
// confirmed/pending state and a running total.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Items" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Items</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 3 · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
