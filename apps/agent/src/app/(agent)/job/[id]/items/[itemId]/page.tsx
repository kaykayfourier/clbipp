// /job/[id]/items/[itemId]  —  Batch 3 · Ali
//
// NEW (D1). Confirm category + chemistry, weighed kg, condition, photos.
// Branches: li-ion → damage rubric; other → straight to price.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Confirm item" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Confirm item</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 3 · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
