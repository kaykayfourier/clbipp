import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'

// ─── 🔴 THE INTAKE GATE (W1 · Batch 2) ───────────────────────────────────────
//
// The mandatory safety checklist is only mandatory because of this function.
// Everything else about the feature — the screen, the stored row, the banner on
// job detail — is presentation. This is the part that actually stops an agent
// starting intake on a load they have not confirmed is safe to touch.
//
// ⚠ IT LIVES HERE, NOT INLINE IN THE ITEMS PAGE, ON PURPOSE.
// `app/(agent)/job/[id]/items/page.tsx` is Ali's file and Batch 3 REPLACES its
// body wholesale. A gate written inline would be deleted by that rewrite and
// nobody would notice — the screens would keep working, the checklist would keep
// saving, and the only thing that changed is that intake stopped being gated.
// One import and one line is small enough to survive a rewrite, and
// `scripts/smoke.mjs` fails if it doesn't (see AGENT_ITEMS_GATE there).
//
// 📌 TO WHOEVER BUILDS BATCH 3 AND BEYOND: every screen from intake onward —
// items, the per-item confirm, damage, scan, collect — should call this. It is
// cheap (one indexed read) and it is the only thing standing between a rushed
// agent and an unchecked lithium load.

/**
 * Require a PASSING safety checklist before rendering an intake screen.
 *
 * Redirects to the checklist when one is absent or failed. Call it at the top of
 * a server component, before any other work:
 *
 * ```ts
 * await requireSafetyChecklist(id, user.id)
 * ```
 *
 * Also enforces ownership, so a caller does not need a separate check — the two
 * belong together anyway. A pickup that is not this agent's is `notFound()`,
 * matching what job detail and the checklist screen do: don't confirm that an id
 * exists to someone with no business knowing.
 *
 * Returns nothing. It either falls through or throws (`redirect`/`notFound` both
 * throw), so there is no boolean for a caller to forget to check — which is the
 * failure mode of every `canDoX()` helper ever written.
 */
export async function requireSafetyChecklist(pickupId: string, userId: string): Promise<void> {
  const pickup = await prisma.pickup.findUnique({
    where: { id: pickupId },
    select: {
      id: true,
      agentId: true,
      safetyChecklist: { select: { passed: true } },
    },
  })

  // Ownership first — Prisma bypasses RLS (D10), so this read is unscoped until
  // it is scoped here.
  if (!pickup || pickup.agentId !== userId) notFound()

  // Absent OR failed. A written-but-failed checklist is a real state in this app
  // (a failing submission is recorded rather than discarded, so the hazard the
  // agent found survives in the audit trail) and it must NOT open the gate.
  if (pickup.safetyChecklist?.passed !== true) {
    redirect(`/job/${encodeURIComponent(pickupId)}/safety`)
  }
}
