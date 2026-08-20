// /job/[id]/safety  —  Batch 2 · Aamir
//
// NEW (W1). Mandatory gate between `arrived` and intake — the wireframe
// omitted it entirely and all three HR documents require it. Chemistry-aware
// items; writes SafetyChecklist; cannot proceed until passed.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Safety checklist" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Safety checklist</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 2 · Aamir. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
