// /job/[id]/items  —  Batch 3 · Ali
//
// NEW (W3/D1). The spine of the multi-item flow: every BatteryItem with a
// confirmed/pending state and a running total.
//
// STUB (Batch 0b). A heading and nothing else, so links resolve and the
// route is smoke-tested before the screen exists. Replace the body; keep
// `hideNav` — (agent)/layout.tsx renders the nav and owns the clearance
// under it, and AppShell's own bar is the CUSTOMER's. Add no bottom padding.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ALI — READ BEFORE YOU REPLACE THIS FILE (added by Batch 2, Aamir).
//
// The two lines marked below are the mandatory safety gate (W1). They are not
// part of the stub and they must survive your rewrite:
//
//     const { data: { user } } = await createClient().auth.getUser()
//     await requireSafetyChecklist(id, user.id)
//
// `requireSafetyChecklist` enforces BOTH the passing-checklist requirement and
// this agent's ownership of the pickup, and it throws rather than returning a
// boolean — so once it is called you can treat the pickup as yours. You need the
// session user anyway for your own scoped read; this just uses the same one.
//
// Delete it and intake silently stops being gated: every screen still works,
// the checklist still saves, and the only thing that changed is that an agent
// can start handling batteries without confirming it is safe to. That is the
// exact failure the batch exists to prevent. `scripts/smoke.mjs` asserts the
// gate holds (AGENT_ITEMS_GATE) and will fail if it goes missing.
//
// Rationale in full: apps/agent/src/lib/safety-gate.ts
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { AppShell, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 🔴 THE GATE. Keep this. See the note at the top of the file.
  await requireSafetyChecklist(id, user.id)

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
