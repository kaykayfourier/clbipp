// /profile  —  Batch 8 · Aamir
//
// Wallet, earnings, stats, offline queue, sign out. Add read-only safety-
// training status (D6). No 'Cash out' / 'Notifications' unless there is room
// — dead buttons are worse than absent ones.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Profile" hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Profile</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 8 · Aamir. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
