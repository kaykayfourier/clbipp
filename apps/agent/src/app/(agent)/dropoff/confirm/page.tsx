// /dropoff/confirm  —  Batch 7a · Ali
//
// Hub, batch summary, GPS + timestamp, staff signature. AGENT-ATTESTED ONLY
// — there is no hub-staff app, so the receiving staff name is typed, not
// authenticated. The screen must say so.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Confirm hand-off" showBack backHref="/dropoff" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Confirm hand-off</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 7a · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
