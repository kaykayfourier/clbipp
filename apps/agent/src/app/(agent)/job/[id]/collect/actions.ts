'use server'

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { photoPathsBelongTo } from '@clbipp/core/intake'
import { raisePayment } from '@clbipp/core'

import { computeAgentFeePaise } from './agent-fee'
// ─── confirmCollection (D7: offered → collected) — Batch 6 · Ali ────────────
// Gated on Offer.acceptedAt by collect/page.tsx before this form is even
// rendered; re-checked here too, same "never trust the screen that got you
// here" posture as every gate in this app.
//
// Uses prisma.$transaction rather than the raw admin-client pattern the rest
// of this app's writes use (see job/[id]/actions.ts, items/actions.ts). This
// is the one write in the whole agent app that touches real money — the
// wallet balance — and the plan calls wallet idempotency out as the highest-
// risk seam in the build. Five things have to land together or not at all:
// the status flip, the receipt, the WalletTxn, the balance cache update
// (Profile.walletBalancePaise — "always write both in one transaction", per
// the schema's own comment on that field), and — since Admin Batch 4 — the
// VENDOR's payable. A partial write here is a wallet bug, not a display bug.

export async function confirmCollection(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/')

  const collectPath = `/job/${encodeURIComponent(pickupId)}/collect`
  const fail = (message: string): never =>
    redirect(`${collectPath}?error=${encodeURIComponent(message)}`)

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) redirect('/login')

  const pickup = await prisma.pickup.findFirst({
    where: { id: pickupId, agentId: user.id },
    select: {
      id: true,
      status: true,
      vendorId: true,
      offer: { select: { acceptedAt: true, estimatedPrice: true } },
      _count: { select: { items: true } },
      items: { select: { confirmedWeightKg: true, weightKg: true } },
    },
  })
  if (!pickup) return fail('Job not found.')

  // Idempotent: already collected (or beyond) — the receipt exists already,
  // just show it rather than fail a re-submit from a slow network retry.
  if (pickup.status !== 'offered') {
    redirect(`/job/${encodeURIComponent(pickupId)}/receipt`)
  }
  if (!pickup.offer?.acceptedAt) return fail('The vendor has not accepted this offer yet.')

  const signaturePath = String(formData.get('signaturePath') ?? '')
  if (!signaturePath) return fail('A signature is required to confirm collection.')
  const photoPaths = formData.getAll('photoPaths').map((p) => String(p)).filter(Boolean)
  if (!photoPathsBelongTo([signaturePath, ...photoPaths], user.id)) {
    return fail('Those files were not uploaded by you.')
  }

  const lat = formData.get('lat') ? Number(formData.get('lat')) : null
  const lng = formData.get('lng') ? Number(formData.get('lng')) : null

  const totalWeightKg = pickup.items.reduce(
    (sum, i) => sum + Number(i.confirmedWeightKg ?? i.weightKg ?? 0),
    0,
  )
  const itemCount = pickup._count.items
  const agentFeePaise = computeAgentFeePaise(itemCount)
  const receiptNo = `RCP-${pickup.id.replace(/^PKP-/, '')}`

  try {
    await prisma.$transaction(async (tx) => {
      // Guard the race the same way markArrived / presentOffer do — the
      // WHERE clause only matches while status is still `offered`, so a
      // concurrent double-submit updates zero rows on the second attempt
      // rather than double-crediting the wallet.
      const updated = await tx.pickup.updateMany({
        where: { id: pickupId, status: 'offered' },
        data: { status: 'collected', agentFeePaise },
      })
      if (updated.count === 0) {
        throw new Error('ALREADY_COLLECTED')
      }

      await tx.pickupReceipt.create({
        data: {
          pickupId,
          receiptNo,
          totalWeightKg,
          itemCount,
          amountPaise: pickup.offer!.estimatedPrice,
          agentId: user.id,
          capturedLat: lat,
          capturedLng: lng,
          signatureUrl: signaturePath,
        },
      })

      const profile = await tx.profile.findUniqueOrThrow({
        where: { id: user.id },
        select: { walletBalancePaise: true },
      })
      const balanceAfterPaise = profile.walletBalancePaise + agentFeePaise

      await tx.walletTxn.create({
        data: {
          profileId: user.id,
          deltaPaise: agentFeePaise,
          kind: 'agent_fee',
          balanceAfterPaise,
          pickupId,
          note: `Collection fee — ${itemCount} item${itemCount === 1 ? '' : 's'}, ${pickup.id}`,
        },
      })
      await tx.profile.update({
        where: { id: user.id },
        data: { walletBalancePaise: balanceAfterPaise },
      })

      await tx.statusEvent.create({
        data: {
          pickupId,
          status: 'collected',
          actorId: user.id,
          actorRole: 'agent',
          notes: `Collected — signed and confirmed with vendor. Agent fee ₹${(agentFeePaise / 100).toFixed(2)} credited.`,
          lat,
          lng,
          photoUrls: photoPaths,
        },
      })

      // ── The VENDOR's payable (Admin Batch 4 · AD10) ────────────────────
      // Everything above this line is the AGENT's side of the collection —
      // their fee, their ledger, their receipt. This is the other party's:
      // we have just taken the batteries, so we now owe the vendor for them.
      //
      // Until this call existed, `Payment` rows came only from the seed. A
      // real collection left the vendor with a receipt and no payout to
      // claim — /track/[id] shows "Choose how you get paid" only when a
      // payment is `pending`, so the CTA simply never appeared.
      //
      // Amount is the offer the vendor accepted, the same figure the receipt
      // above records. Inside THIS transaction on purpose: a collection that
      // succeeded while the payable it created did not is exactly the drift
      // the single-transaction rule at the top of this file exists to stop.
      await raisePayment(tx, {
        pickupId,
        vendorId: pickup.vendorId,
        amountPaise: pickup.offer!.estimatedPrice,
      })
    }, {
      // Prisma's default interactive-transaction timeout is 5s, and this
      // transaction now does EIGHT sequential round trips. settlePayment in
      // @clbipp/core carries a measured note on exactly that number: against
      // a remote Supabase Postgres, eight round trips took 5.3s and the whole
      // thing rolled back. Atomicity did its job there, but an agent whose
      // collection fails because the office wifi is slow is a real failure —
      // and unlike a payout, they are standing in front of the customer.
      //
      // Raised rather than split: the five writes above MUST land together
      // (see the header). Splitting them to fit a timeout would trade a
      // visible error for a silently half-collected pickup.
      timeout: 20_000,
      maxWait: 10_000,
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_COLLECTED') {
      redirect(`/job/${encodeURIComponent(pickupId)}/receipt`)
    }
    console.error('[confirmCollection] transaction failed:', e)
    return fail('Could not confirm collection. Nothing was charged or recorded — try again.')
  }

  redirect(`/job/${encodeURIComponent(pickupId)}/receipt`)
}
