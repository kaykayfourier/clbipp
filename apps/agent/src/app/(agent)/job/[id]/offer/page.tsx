// /job/[id]/offer  —  Batch 5a · Ali
//
// NEW. Per-item prices roll up into ONE Offer for the pickup — the multi-
// item consequence the wireframe had no screen for. Creates the Offer row
// and writes arrived → offered.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Offer" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Offer</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 5a · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
