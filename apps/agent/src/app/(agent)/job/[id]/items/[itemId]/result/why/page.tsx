// …/result/why  —  Batch 5a · Ali
//
// Rationale, alternatives, sensitivity, audit footer. The wireframe's 'AI
// explanation' button is CUT — no /api/explain exists and it is not in
// scope.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Why this price" showBack backHref="…/result" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Why this price</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 5a · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
