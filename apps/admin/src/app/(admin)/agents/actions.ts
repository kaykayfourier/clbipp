'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'

// ─── On duty / off duty (FV15 · FD19) ────────────────────────────────────────
// §8 Step 1 of docs/PLAN_FEEDBACK_V2.md: the one duty fact this database holds.
// Read only through `availabilityOf()` in @clbipp/core/dispatch-ranking, so the
// ranked selector, the dispatch write and the run builder all learn it at once
// — and so there is no second availability check anywhere to drift.
//
// Written through Prisma, never PostgREST: grants.sql's profile column
// allowlist does not include `duty_status`, so an agent cannot mark themselves
// on or off. That is deliberate for the pilot — dispatch owns the roster.

const AUDIT_ACTION: AdminAuditAction = 'agent.duty'
const AUDIT_SUBJECT: AdminAuditSubject = 'profile'

export async function setAgentDuty(agentId: string, onDuty: boolean): Promise<{ error: string | null }> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error }
  const admin = gate.admin

  const agent = await prisma.profile.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, fullName: true, dutyStatus: true },
  })
  if (!agent || agent.role !== 'agent') return { error: 'That account is not an agent.' }

  const next = onDuty ? 'on_duty' : 'off_duty'
  if (agent.dutyStatus === next) return { error: null }

  await prisma.$transaction([
    prisma.profile.update({ where: { id: agentId }, data: { dutyStatus: next } }),
    prisma.adminAudit.create({
      data: {
        actorId: admin.id,
        action: AUDIT_ACTION,
        subjectType: AUDIT_SUBJECT,
        subjectId: agentId,
        before: { dutyStatus: agent.dutyStatus },
        after: { dutyStatus: next },
      },
    }),
  ])
  return { error: null }
}

export async function setAgentDutyAction(formData: FormData) {
  const agentId = String(formData.get('agentId') ?? '')
  const onDuty = String(formData.get('onDuty') ?? '') === '1'
  if (!agentId) redirect('/agents')
  const { error } = await setAgentDuty(agentId, onDuty)
  if (error) redirect(`/agents?error=${encodeURIComponent(error)}`)
  revalidatePath('/agents')
  revalidatePath('/dispatch')
  redirect('/agents')
}
