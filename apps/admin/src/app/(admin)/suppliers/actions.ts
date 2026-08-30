'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'

// ─── Supplier margin-tier override — E01, Batch 9 ────────────────────────────
// Same shape as dispatch/actions.ts's assignPickup — that file is the
// reference service-role action for this app, and this one copies its four
// rules: identity from the session (never a form field), the role re-read
// from the database, Prisma bypassing RLS with the action re-verifying the
// caller itself, and the changed row plus its audit trail written in ONE
// transaction.
//
// 🔴 This is a LIVE PRICING LEVER, not a profile edit. `Profile.marginTier`
// is read by the engine's Config.supplier_margin_overrides (see the field's
// own comment in schema.prisma) — the moment this write lands, the next quote
// for this vendor prices differently. That is exactly why `supplier.margin`
// is in `REASON_REQUIRED_ACTIONS` (@clbipp/core/audit): an override with no
// stated reason is a pricing change nobody can explain later.

const AUDIT_ACTION: AdminAuditAction = 'supplier.margin'
const AUDIT_SUBJECT: AdminAuditSubject = 'profile'

const VALID_TIERS = ['aggressive', 'standard', 'generous'] as const
type MarginTierValue = (typeof VALID_TIERS)[number]

export type MarginOverrideResult = { error: string | null }

/**
 * `tier: null` clears the override — the vendor falls back to whatever tier
 * the active EngineConfig assigns by default. That is a real, auditable
 * action too (a company deciding "stop treating this supplier specially" is
 * exactly as consequential as setting an override in the first place), so it
 * goes through the same required-reason path rather than a silent clear.
 */
export async function updateSupplierMarginTier(input: {
  vendorId: string
  tier: MarginTierValue | null
  reason: string
}): Promise<MarginOverrideResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error }
  const admin = gate.admin

  const vendorId = input.vendorId.trim()
  if (!vendorId) return { error: 'No supplier selected.' }

  const reason = input.reason.trim()
  if (!reason) return { error: 'A reason is required for a margin-tier change.' }

  if (input.tier !== null && !VALID_TIERS.includes(input.tier)) {
    return { error: 'That is not a valid margin tier.' }
  }

  const before = await prisma.profile.findUnique({
    where: { id: vendorId },
    select: { id: true, role: true, fullName: true, marginTier: true },
  })
  if (!before) return { error: 'That supplier does not exist.' }
  if (before.role !== 'customer') return { error: 'Only vendor accounts carry a margin tier.' }
  if (before.marginTier === input.tier) {
    return { error: `Already at ${input.tier ?? 'the default tier'} — nothing to change.` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: vendorId },
      data: { marginTier: input.tier },
    })

    await tx.adminAudit.create({
      data: {
        actorId: admin.id,
        action: AUDIT_ACTION,
        subjectType: AUDIT_SUBJECT,
        subjectId: vendorId,
        before: { marginTier: before.marginTier },
        after: { marginTier: input.tier },
        reason,
      },
    })
  })

  revalidatePath('/suppliers')

  return { error: null }
}
