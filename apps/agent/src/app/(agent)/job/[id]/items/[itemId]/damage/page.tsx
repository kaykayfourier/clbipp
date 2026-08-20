// …/damage  —  Batch 3 · Ali
//
// Li-ion only. Visual 0.40 / Leakage 0.35 / Thermal 0.25 with photo slots —
// matches DamageScores exactly. Both states: clean, and forced-Recycle.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.

import { AppShell, PagePadding } from '@clbipp/ui'

export default function Page() {
  return (
    <AppShell title="Damage" showBack hideNav>
      <PagePadding>
        <h1 className="text-xl font-semibold text-text-primary">Damage</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Batch 3 · Ali. Not built yet.
        </p>
      </PagePadding>
    </AppShell>
  )
}
