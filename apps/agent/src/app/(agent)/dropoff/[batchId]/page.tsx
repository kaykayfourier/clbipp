// /dropoff/[batchId]  —  Batch 7b · Khalid
//
// Chain-of-custody receipt. New PDF template in packages/pdf.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Chain of custody" showBack backHref="/dropoff" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Chain of custody</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 7b · Khalid. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
