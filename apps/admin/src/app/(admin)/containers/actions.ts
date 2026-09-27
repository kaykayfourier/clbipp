'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { Prisma, prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { mintCode } from '@clbipp/core/tags'

import { requireAdmin } from '@/lib/admin-identity'

// ─── Transport boxes (FV11 · FD14) ───────────────────────────────────────────
// A box is a permanent object: registered once, labelled once, used for many
// runs. It is NOT the CustodyBatch (question J3) — that is one hand-off event;
// a box does many runs and one drop-off can empty several boxes.

const REGISTER_ACTION: AdminAuditAction = 'container.register'
const STATUS_ACTION: AdminAuditAction = 'container.status'
const SUBJECT: AdminAuditSubject = 'transport_container'

const MAX_LABEL_CHARS = 60
const NUMBER_ATTEMPTS = 5

export type ContainerResult = { error: string | null; code: string | null }

export async function registerContainer(input: { label: string; capacityKg: string }): Promise<ContainerResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, code: null }
  const admin = gate.admin

  const label = input.label.trim()
  if (label.length < 3) return { error: 'Give the box a name someone can find it by — "Blue crate 60 L #3".', code: null }
  if (label.length > MAX_LABEL_CHARS) return { error: `Keep the name under ${MAX_LABEL_CHARS} characters.`, code: null }

  const capRaw = input.capacityKg.trim()
  const capacity = capRaw === '' ? null : Number(capRaw)
  if (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0 || capacity > 5000)) {
    return { error: 'Capacity must be a positive number of kilograms, or left blank.', code: null }
  }

  // Retry on the (rare) unique collision of a random code — the same pattern
  // createManifest uses for its number.
  for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
    const code = mintCode('container')
    try {
      const box = await prisma.transportContainer.create({
        data: { code, label, capacityKg: capacity !== null ? new Prisma.Decimal(capacity.toFixed(2)) : null },
        select: { id: true, code: true },
      })
      await prisma.adminAudit.create({
        data: {
          actorId: admin.id,
          action: REGISTER_ACTION,
          subjectType: SUBJECT,
          subjectId: box.id,
          after: { code: box.code, label, capacityKg: capacity },
        },
      })
      return { error: null, code: box.code }
    } catch (err) {
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!collision || attempt === NUMBER_ATTEMPTS - 1) throw err
    }
  }
  return { error: 'Could not mint a box code. Try again.', code: null }
}

/**
 * Retire or reinstate a box. 🔴 A box that is loaded on an open run cannot be
 * retired — it is physically in a van with batteries in it, and retiring it
 * would strand the load record. Unload it at the hub first.
 */
export async function setContainerActive(id: string, active: boolean): Promise<ContainerResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, code: null }
  const admin = gate.admin

  const box = await prisma.transportContainer.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      isActive: true,
      loads: {
        where: { unloadedAt: null, run: { status: { in: ['planned', 'in_progress'] } } },
        select: { run: { select: { runNo: true } } },
      },
    },
  })
  if (!box) return { error: 'That box does not exist.', code: null }
  if (box.isActive === active) return { error: null, code: box.code }
  if (!active && box.loads.length > 0) {
    return {
      error: `${box.code} is loaded on ${box.loads[0].run.runNo}. It can be retired once it is unloaded at the hub.`,
      code: null,
    }
  }

  await prisma.$transaction([
    prisma.transportContainer.update({ where: { id }, data: { isActive: active } }),
    prisma.adminAudit.create({
      data: {
        actorId: admin.id,
        action: STATUS_ACTION,
        subjectType: SUBJECT,
        subjectId: id,
        before: { isActive: box.isActive },
        after: { isActive: active },
      },
    }),
  ])
  return { error: null, code: box.code }
}

export async function registerContainerAction(formData: FormData) {
  const { error, code } = await registerContainer({
    label: String(formData.get('label') ?? ''),
    capacityKg: String(formData.get('capacityKg') ?? ''),
  })
  if (error || !code) redirect(`/containers?error=${encodeURIComponent(error ?? 'Could not register the box.')}`)
  revalidatePath('/containers')
  redirect(`/containers?registered=${encodeURIComponent(code)}`)
}

export async function setContainerActiveAction(formData: FormData) {
  const id = String(formData.get('containerId') ?? '')
  const active = String(formData.get('active') ?? '') === '1'
  if (!id) redirect('/containers')
  const { error } = await setContainerActive(id, active)
  if (error) redirect(`/containers?error=${encodeURIComponent(error)}`)
  revalidatePath('/containers')
  redirect('/containers')
}
