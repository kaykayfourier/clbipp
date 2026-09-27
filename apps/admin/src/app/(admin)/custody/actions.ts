'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { isReasonRequired } from '@clbipp/core/audit'
import { MIN_CUSTODY_NOTE_CHARS } from '@clbipp/core/custody-check'
import { parseCode } from '@clbipp/core/tags'

import { requireAdmin } from '@/lib/admin-identity'

// ─── Hub check-in (FV12 · FD15) ──────────────────────────────────────────────
// Feedback §6 step 10: "The facility scans and reconciles the received
// batteries." The agent's drop-off is AGENT-attested; this is the hub's own
// count, line by line, and it is what `advanceCustodyBatch` now gates
// `collected → tested` on.
//
// 🔴 AN ADMIN RECORDING THIS ON THE HUB'S BEHALF. There is no hub-staff app, so
// `checkedBy` is the admin and every note says so. Never a 'hub' actor — the
// same rule as `actorRole` on status_events (AD5).
//
// Three ways a line gets checked in, cheapest first:
//   · SCAN     — the line's tag is scanned (or typed). No audit row: the check
//                row records who and when, and a scan asserts nothing a person
//                could have got wrong.
//   · TAG AT HUB — a line that left the vendor untagged (FD13) gets a fresh tag
//                now, which is also its check-in. No audit row, same reason.
//   · BY HAND  — received without a scan (a torn label), or MISSING. Both need a
//                typed reason and write a `custody.reconcile` audit row, because
//                a person is vouching for something no scanner saw.

const RECONCILE_ACTION: AdminAuditAction = 'custody.reconcile'
const SUBJECT: AdminAuditSubject = 'custody_batch'

export type CheckResult = { error: string | null; message: string | null }

/** The batch, its lines, and each line's tag — the one read every path needs. */
async function loadBatchLines(batchId: string) {
  return prisma.custodyBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNo: true,
      pickups: {
        select: {
          id: true,
          status: true,
          items: { select: { id: true, tag: { select: { code: true } } } },
        },
      },
    },
  })
}

export async function checkInByScan(batchId: string, raw: string): Promise<CheckResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, message: null }
  const admin = gate.admin

  const parsed = parseCode(raw)
  if (!parsed.ok) return { error: parsed.error, message: null }
  if (parsed.kind === 'container') {
    return {
      error: `${parsed.code} is a transport box, not a battery. Scan the tags on the batteries inside it.`,
      message: null,
    }
  }

  const batch = await loadBatchLines(batchId)
  if (!batch) return { error: 'That custody batch does not exist.', message: null }

  const tag = await prisma.itemTag.findUnique({
    where: { code: parsed.code },
    select: {
      code: true,
      batteryItemId: true,
      batteryItem: {
        select: { pickupId: true, pickup: { select: { custodyBatch: { select: { batchNo: true } } } } },
      },
    },
  })
  if (!tag) return { error: `${parsed.code} was never issued by this console. Check the label.`, message: null }
  if (!tag.batteryItemId || !tag.batteryItem) {
    return {
      error: `${parsed.code} was never bound to a battery at collection. If it is on a battery in this batch, use "Tag now" on that line instead.`,
      message: null,
    }
  }

  const lines = batch.pickups.flatMap((p) => p.items.map((i, idx) => ({ pickupId: p.id, itemId: i.id, idx, of: p.items.length })))
  const line = lines.find((l) => l.itemId === tag.batteryItemId)
  if (!line) {
    const elsewhere = tag.batteryItem.pickup.custodyBatch?.batchNo
    return {
      error: `${parsed.code} belongs to ${tag.batteryItem.pickupId}, which is ${
        elsewhere ? `in batch ${elsewhere}` : 'not handed in at any hub yet'
      } — not this one. Set it aside and flag it.`,
      message: null,
    }
  }

  const existing = await prisma.custodyItemCheck.findUnique({
    where: { batteryItemId: line.itemId },
    select: { outcome: true },
  })
  if (existing?.outcome === 'received') {
    return { error: null, message: `${parsed.code} was already checked in — ${line.pickupId}, line ${line.idx + 1} of ${line.of}.` }
  }

  await prisma.custodyItemCheck.upsert({
    where: { batteryItemId: line.itemId },
    create: {
      custodyBatchId: batch.id,
      batteryItemId: line.itemId,
      outcome: 'received',
      method: 'scan',
      tagCode: parsed.code,
      checkedBy: admin.id,
    },
    // A line declared missing and then FOUND: the scan is the better evidence,
    // so it replaces the missing record (the audit row for "missing" stays).
    update: { outcome: 'received', method: 'scan', tagCode: parsed.code, note: null, checkedBy: admin.id, checkedAt: new Date() },
  })

  return {
    error: null,
    message: `${parsed.code} received — ${line.pickupId}, line ${line.idx + 1} of ${line.of}${existing?.outcome === 'missing' ? ' (was marked missing — now found)' : ''}.`,
  }
}

export async function tagAtHub(batchId: string, itemId: string, raw: string): Promise<CheckResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, message: null }
  const admin = gate.admin

  const parsed = parseCode(raw)
  if (!parsed.ok) return { error: parsed.error, message: null }
  if (parsed.kind !== 'tag') return { error: 'That is a box code. Stick a battery tag on the line and scan that.', message: null }

  const batch = await loadBatchLines(batchId)
  if (!batch) return { error: 'That custody batch does not exist.', message: null }
  const pickup = batch.pickups.find((p) => p.items.some((i) => i.id === itemId))
  const item = pickup?.items.find((i) => i.id === itemId)
  if (!pickup || !item) return { error: 'That line is not in this batch.', message: null }
  if (item.tag) return { error: `That line already carries ${item.tag.code}. Scan it instead.`, message: null }

  const tag = await prisma.itemTag.findUnique({ where: { code: parsed.code }, select: { id: true, batteryItemId: true } })
  if (!tag) return { error: `${parsed.code} was never issued by this console.`, message: null }
  if (tag.batteryItemId) return { error: `${parsed.code} is already on another battery. Use a fresh tag.`, message: null }

  const done = await prisma.$transaction(async (tx) => {
    // Guarded on "still unbound" — two admins tagging at once cannot both win.
    const bound = await tx.itemTag.updateMany({
      where: { id: tag.id, batteryItemId: null },
      data: { batteryItemId: itemId, boundBy: admin.id, boundAt: new Date(), boundAtHub: true },
    })
    if (bound.count === 0) return false
    await tx.custodyItemCheck.upsert({
      where: { batteryItemId: itemId },
      create: {
        custodyBatchId: batch.id,
        batteryItemId: itemId,
        outcome: 'received',
        method: 'tagged_at_hub',
        tagCode: parsed.code,
        checkedBy: admin.id,
      },
      update: { outcome: 'received', method: 'tagged_at_hub', tagCode: parsed.code, note: null, checkedBy: admin.id, checkedAt: new Date() },
    })
    return true
  })
  if (!done) return { error: `${parsed.code} was bound a moment ago. Use a fresh tag.`, message: null }

  return { error: null, message: `${parsed.code} applied at the hub and checked in — ${pickup.id}.` }
}

export async function recordLineByHand(
  batchId: string,
  itemId: string,
  outcome: string,
  note: string,
): Promise<CheckResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, message: null }
  const admin = gate.admin

  if (outcome !== 'received' && outcome !== 'missing') return { error: 'Record the line as received or missing.', message: null }
  const reason = note.trim()
  if (isReasonRequired(RECONCILE_ACTION) && reason.length < MIN_CUSTODY_NOTE_CHARS) {
    return {
      error: `Say why in at least ${MIN_CUSTODY_NOTE_CHARS} characters — nobody scanned this line, so the note is the only record of what was seen.`,
      message: null,
    }
  }

  const batch = await loadBatchLines(batchId)
  if (!batch) return { error: 'That custody batch does not exist.', message: null }
  const pickup = batch.pickups.find((p) => p.items.some((i) => i.id === itemId))
  const item = pickup?.items.find((i) => i.id === itemId)
  if (!pickup || !item) return { error: 'That line is not in this batch.', message: null }

  const before = await prisma.custodyItemCheck.findUnique({
    where: { batteryItemId: itemId },
    select: { outcome: true, method: true },
  })

  await prisma.$transaction([
    prisma.custodyItemCheck.upsert({
      where: { batteryItemId: itemId },
      create: {
        custodyBatchId: batch.id,
        batteryItemId: itemId,
        outcome,
        method: 'manual',
        tagCode: item.tag?.code ?? null,
        note: reason,
        checkedBy: admin.id,
      },
      update: { outcome, method: 'manual', note: reason, checkedBy: admin.id, checkedAt: new Date() },
    }),
    prisma.adminAudit.create({
      data: {
        actorId: admin.id,
        action: RECONCILE_ACTION,
        subjectType: SUBJECT,
        subjectId: batch.id,
        before: before ? { itemId, outcome: before.outcome, method: before.method } : { itemId, outcome: null },
        after: { itemId, pickupId: pickup.id, outcome, method: 'manual', tagCode: item.tag?.code ?? null },
        reason,
      },
    }),
  ])

  return {
    error: null,
    message:
      outcome === 'missing'
        ? `Line marked MISSING on ${pickup.id}. That pickup is held at collected until the line turns up or an admin overrides with a reason.`
        : `Line confirmed received by hand on ${pickup.id}.`,
  }
}

// ─── Form actions ────────────────────────────────────────────────────────────

function back(batchId: string, result: CheckResult): never {
  revalidatePath(`/custody/${batchId}`)
  revalidatePath('/lifecycle')
  const q = result.error ? `error=${encodeURIComponent(result.error)}` : `ok=${encodeURIComponent(result.message ?? 'Done.')}`
  redirect(`/custody/${encodeURIComponent(batchId)}?${q}`)
}

export async function checkInByScanAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) redirect('/lifecycle')
  back(batchId, await checkInByScan(batchId, String(formData.get('code') ?? '')))
}

export async function tagAtHubAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) redirect('/lifecycle')
  back(batchId, await tagAtHub(batchId, String(formData.get('itemId') ?? ''), String(formData.get('code') ?? '')))
}

export async function recordLineByHandAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) redirect('/lifecycle')
  back(
    batchId,
    await recordLineByHand(
      batchId,
      String(formData.get('itemId') ?? ''),
      String(formData.get('outcome') ?? ''),
      String(formData.get('note') ?? ''),
    ),
  )
}
