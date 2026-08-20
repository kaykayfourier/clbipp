// …/computing  —  Batch 4 · Khalid
//
// Six-layer stepper. Honest — it reflects the real engine
// (packages/decision-engine, Layers 0–5).
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Computing" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Computing</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 4 · Khalid. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
