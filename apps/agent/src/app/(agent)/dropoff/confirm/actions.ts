'use server'

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { photoPathsBelongTo } from '@clbipp/core/intake'

// ─── confirmDropoff (Batch 7a) ────────────────────────────────────────────────
// Does NOT change any pickup's status — D5 is explicit that a batch drop-off is
// not a tenth lifecycle stage. What it does is set `custodyBatchId` on every
// pickup in the batch (the field jobHref/isActiveJob key off to know a
// `collected` job is done needing the agent) and write one `collected`
// status_event per pickup as the audit trail of the hand-off — same "the
// status_events row is the record, not a status change" pattern as
// escalateToAdmin.
//
// AGENT-ATTESTED ONLY. There is no hub-staff app (open question 3 in the
// plan) — `receivingStaffName` is typed by the agent, not authenticated by the
// person it names, and the confirm screen says so before the agent submits.
export async function confirmDropoff(formData: FormData) {
  const pickupIdsRaw = String(formData.get('pickupIds') ?? '')
  const pickupIds = pickupIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  const facilityId = String(formData.get('facilityId') ?? '')
  const receivingStaffName = String(formData.get('receivingStaffName') ?? '').trim()
  const signaturePath = String(formData.get('signaturePath') ?? '')

  const confirmPath = `/dropoff/confirm?pickups=${pickupIds.join(',')}`
  const fail = (message: string): never =>
    redirect(`${confirmPath}&error=${encodeURIComponent(message)}`)

  if (pickupIds.length === 0) redirect('/dropoff')
  if (!facilityId) return fail('Choose a facility.')
  if (!receivingStaffName) return fail("Enter the receiving staff member's name.")
  if (!signaturePath) return fail('A signature is required to confirm the hand-off.')

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) redirect('/login')

  if (!photoPathsBelongTo([signaturePath], user.id)) {
    return fail('That signature was not uploaded by you.')
  }

  const facility = await prisma.facility.findFirst({ where: { id: facilityId, isActive: true } })
  if (!facility) return fail('That facility is not available.')

  // Ownership + eligibility, all in one query: this agent's, collected, and
  // not already in a batch. Any id in the URL that doesn't match one of these
  // three is silently dropped from the batch rather than failing the whole
  // hand-off — the same "partial success is a real outcome" posture
  // ItemConfirmForm's photo upload uses, applied to a stale selection instead
  // of a failed upload.
  const pickups = await prisma.pickup.findMany({
    where: { id: { in: pickupIds }, agentId: user.id, status: 'collected', custodyBatchId: null },
    select: {
      id: true,
      items: { select: { confirmedWeightKg: true, weightKg: true } },
      receipt: { select: { itemCount: true } },
    },
  })
  if (pickups.length === 0) return fail('None of the selected jobs are still eligible for drop-off.')

  const totalWeightKg = pickups.reduce(
    (sum, p) => sum + p.items.reduce((s, i) => s + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0),
    0,
  )
  const itemCount = pickups.reduce((sum, p) => sum + (p.receipt?.itemCount ?? p.items.length), 0)

  const lat = formData.get('lat') ? Number(formData.get('lat')) : null
  const lng = formData.get('lng') ? Number(formData.get('lng')) : null

  const batchNo = `CB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8)}`

  let batchId: string
  try {
    batchId = await prisma.$transaction(async (tx) => {
      const batch = await tx.custodyBatch.create({
        data: {
          agentId: user.id,
          facilityId: facility.id,
          batchNo,
          totalWeightKg,
          itemCount,
          receivingStaffName,
          signatureUrl: signaturePath,
          lat,
          lng,
        },
      })

      // Guarded update: only pickups still `collected` with no batch yet — the
      // same race guard as every other status-changing write in this app,
      // here protecting against the same job being dropped off twice from two
      // tabs.
      const updated = await tx.pickup.updateMany({
        where: { id: { in: pickups.map((p) => p.id) }, status: 'collected', custodyBatchId: null },
        data: { custodyBatchId: batch.id },
      })
      if (updated.count === 0) {
        throw new Error('NOTHING_TO_HAND_OFF')
      }

      await tx.statusEvent.createMany({
        data: pickups.map((p) => ({
          pickupId: p.id,
          status: 'collected' as const,
          actorId: user.id,
          actorRole: 'agent',
          notes: `Handed off to ${facility.name} in custody batch ${batchNo}. Received by ${receivingStaffName} (agent-attested).`,
          lat,
          lng,
        })),
      })

      return batch.id
    },
    // Prisma's default is 5s. Three sequential round trips here, but this is
    // the hand-off the whole post-hub lifecycle hangs off — a timeout mid-demo
    // costs a custody batch. Same ceiling every other multi-write path in the
    // repo sets after the 8-round-trip / 5.3s measurement (payment-actions.ts).
    { timeout: 20_000, maxWait: 10_000 },
    )
  } catch (e) {
    if (e instanceof Error && e.message === 'NOTHING_TO_HAND_OFF') {
      return fail('These jobs were already handed off.')
    }
    console.error('[confirmDropoff] transaction failed:', e)
    return fail('Could not confirm the hand-off. Nothing was recorded — try again.')
  }

  redirect(`/dropoff/${batchId}`)
}
