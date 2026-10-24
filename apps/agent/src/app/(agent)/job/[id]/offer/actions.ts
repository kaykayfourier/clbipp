'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import {
  MAX_PRICE_NOTE_CHARS,
  MIN_PRICE_NOTE_CHARS,
  parsePriceRupees,
  recommendedOfferTotal,
  vendorOfferRationale,
} from '@clbipp/core'
import { isStorablePaise } from '@clbipp/core/format'
import { checkReoffer, getNegotiationBandBp, sanctionedPricePaise } from '@clbipp/core/negotiation'

// ─── The offer, and every price after it (D7 · FV6 · AF5) ────────────────────
//
// presentOffer: `arrived → offered`. Per-item prices (each computed and stored
// by the item's own quote action, or the rate card) sum into ONE Offer for the
// pickup via recommendedOfferTotal() — the same function the screen and the
// admin Price panel read, so all three agree on what was recommended.
//
// 🔴 AF5 · FD23 — THE AGENT NO LONGER TYPES A PRICE. The company's worry was an
// agent mishearing or mistyping a figure agreed on the phone. Only the OFFICE
// enters a changed price (setOfficePrice in the admin app); the agent presents
// the office's price when there is one, the engine's recommendation when there
// is not. The office price is read HERE, server-side: the hidden officePriceId
// on the form only proves which one the agent was looking at, and a stale one
// is refused rather than silently swapped.
//
// reofferPrice: AF5 · FD24 — a decline is not final. The agent may re-offer up
// to the admin-set band above the sanctioned price (checkReoffer), or present a
// newer office price. Every round is an `offer_rounds` row; `Offer.estimatedPrice`
// stays the CURRENT price, a cache of the latest round (like pickups.status vs
// status_events). An accepted price is fixed (FD7): every write is guarded on
// `acceptedAt IS NULL`.
//
// 🔴 No amounts on status_events — the vendor's own token reads that table.
//
// Prisma rather than the service-role client this file used before AF5: the
// offer, its round, the office price's acknowledgement and the status change
// must land together, and only Prisma gives this app a transaction. Same
// reasoning as confirmCollection. Ownership is still re-checked in code
// (`agentId: user.id` in every WHERE), standing in for the RLS policy Prisma
// bypasses (D10).

const TX = { timeout: 20_000, maxWait: 10_000 }

async function sessionAgent(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

const offerItemsSelect = {
  id: true,
  category: true,
  chemistry: true,
  pathway: true,
  weightKg: true,
  confirmedWeightKg: true,
  unitPricePaise: true,
  linePricePaise: true,
  quoteData: true,
} as const

export async function presentOffer(
  pickupId: string,
  input: { officePriceId: string; note: string },
): Promise<{ error: string | null }> {
  const userId = await sessionAgent()
  if (!userId) return { error: 'Not authenticated.' }

  const pickup = await prisma.pickup.findFirst({
    where: { id: pickupId, agentId: userId },
    select: {
      id: true,
      status: true,
      vendorId: true,
      items: { select: offerItemsSelect },
      officePrices: { orderBy: { setAt: 'desc' }, take: 1, select: { id: true, pricePaise: true, reason: true } },
    },
  })
  if (!pickup) return { error: 'Job not found.' }

  // Already offered (or further along) — idempotent success, same posture as
  // markArrived: a re-tap after a slow network must not make a second round.
  if (pickup.status !== 'arrived') return { error: null }

  if (pickup.items.length === 0) return { error: 'This job has no items to offer.' }
  const rec = recommendedOfferTotal(pickup.items)
  if (rec.unpriced.length > 0) {
    return { error: `${rec.unpriced.length} item${rec.unpriced.length === 1 ? '' : 's'} still need pricing before you can present.` }
  }
  if (rec.included.length === 0) {
    return { error: 'Every item on this job is on HOLD — nothing to present. Escalate each item first.' }
  }
  if (!isStorablePaise(rec.totalPaise)) {
    return { error: "This load's price is too large to record. Check the readings on each item." }
  }

  const office = pickup.officePrices[0] ?? null
  if ((office?.id ?? '') !== input.officePriceId.trim()) {
    return { error: 'The office has just set a price. Check it before presenting.' }
  }
  const offeredPaise = office ? office.pricePaise : rec.totalPaise
  const note = input.note.trim().slice(0, MAX_PRICE_NOTE_CHARS) || null

  // Weights only: this JSON sits on the vendor's offer row, so it carries no
  // prices. Per-item prices stay the engine's — an agreed total is a decision
  // about the load, and spreading it across items would invent numbers.
  const materialBreakdown = rec.included.map((i) => ({
    itemId: i.id,
    category: i.category,
    chemistry: i.chemistry,
    pathway: i.pathway,
    weight_kg: Number(i.confirmedWeightKg ?? i.weightKg ?? 0),
  }))
  // One pathway for the whole offer: the highest-value included item's, or
  // `recycle` when nothing has one (an all-non-lithium job).
  const byValue = [...rec.included].sort((a, b) => (b.linePricePaise ?? 0) - (a.linePricePaise ?? 0))
  const pathway = byValue[0]?.pathway ?? 'recycle'
  const rationale = vendorOfferRationale(rec.included.length, pickup.items.length)
  const priceNote = [office ? `Office: ${office.reason}` : null, note ? `Agent: ${note}` : null].filter(Boolean).join(' · ') || null

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date()
      // Guards the same race markArrived guards: only while still `arrived`.
      const moved = await tx.pickup.updateMany({
        where: { id: pickupId, agentId: userId, status: 'arrived' },
        // FV3 · FD0 — the inspection is finished at exactly this moment.
        data: { status: 'offered', inspectedAt: now },
      })
      if (moved.count === 0) throw new Error('ALREADY_OFFERED')

      // Upsert: a reactivated pickup still has the offer row from before.
      const fields = {
        pathway,
        estimatedPrice: offeredPaise,
        rationale,
        materialBreakdown,
        deductions: [],
        recommendedPricePaise: rec.totalPaise,
        priceNote,
        acceptedAt: null,
      }
      await tx.offer.upsert({
        where: { pickupId },
        create: { pickupId, vendorId: pickup.vendorId, ...fields },
        update: fields,
      })

      const last = await tx.offerRound.findFirst({ where: { pickupId }, orderBy: { roundNo: 'desc' }, select: { roundNo: true } })
      await tx.offerRound.updateMany({ where: { pickupId, outcome: null }, data: { outcome: 'superseded', outcomeAt: now } })
      await tx.offerRound.create({
        data: {
          pickupId,
          roundNo: (last?.roundNo ?? 0) + 1,
          pricePaise: offeredPaise,
          basis: office ? 'office' : 'engine',
          officePriceId: office?.id ?? null,
          note,
          presentedBy: userId,
          presentedAt: now,
        },
      })
      if (office) {
        await tx.officePrice.update({
          where: { id: office.id },
          data: { acknowledgedBy: userId, acknowledgedAt: now, agentNote: note },
        })
      }

      await tx.statusEvent.create({
        data: {
          pickupId,
          status: 'offered',
          actorId: userId,
          actorRole: 'agent',
          notes: `Offer presented for ${rec.included.length} of ${pickup.items.length} line(s)`,
        },
      })
    }, TX)
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_OFFERED') return { error: null }
    console.error('[presentOffer] transaction failed:', e)
    return { error: 'Could not save the offer. Nothing was changed — try again.' }
  }

  revalidatePath(`/job/${pickupId}`)
  revalidatePath(`/job/${pickupId}/offer`)
  return { error: null }
}

// Plain form actions with the pickup id in a hidden field — not `.bind()`, so
// each form carries a `$ACTION_ID_…` and can be driven over the real HTTP path.
export async function presentOfferAndRedirect(formData: FormData): Promise<void> {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/')
  const result = await presentOffer(pickupId, {
    officePriceId: String(formData.get('officePriceId') ?? ''),
    note: String(formData.get('note') ?? ''),
  })
  const base = `/job/${encodeURIComponent(pickupId)}/offer`
  if (result.error) redirect(`${base}?error=${encodeURIComponent(result.error)}`)
  redirect(base)
}

/**
 * A new price in front of the vendor, before they accept.
 *   mode 'agent'  — the agent's re-offer, inside the band, with a note.
 *   mode 'office' — the office's newer price, as set; no band check.
 */
export async function reofferPrice(
  pickupId: string,
  input: { mode: 'agent' | 'office'; rupees: string; note: string; officePriceId: string },
): Promise<{ error: string | null; ok?: string }> {
  const userId = await sessionAgent()
  if (!userId) return { error: 'Not authenticated.' }

  const pickup = await prisma.pickup.findFirst({
    where: { id: pickupId, agentId: userId },
    select: {
      status: true,
      offer: { select: { estimatedPrice: true, acceptedAt: true } },
      items: { select: offerItemsSelect },
      officePrices: { orderBy: { setAt: 'desc' }, take: 1, select: { id: true, pricePaise: true, reason: true, acknowledgedAt: true } },
    },
  })
  if (!pickup) return { error: 'Job not found.' }
  if (pickup.status !== 'offered' || !pickup.offer) return { error: 'There is no open offer to change.' }
  if (pickup.offer.acceptedAt) return { error: 'The vendor has accepted. That price is fixed.' }

  const office = pickup.officePrices[0] ?? null
  const note = input.note.trim().slice(0, MAX_PRICE_NOTE_CHARS) || null
  let pricePaise: number
  if (input.mode === 'office') {
    if (!office || office.id !== input.officePriceId.trim()) {
      return { error: 'The office has changed the price again. Check the new one.' }
    }
    if (office.acknowledgedAt) return { error: null, ok: 'That office price has already been presented.' }
    pricePaise = office.pricePaise
  } else {
    const parsed = parsePriceRupees(input.rupees)
    if (parsed.error !== null) return { error: parsed.error }
    if (!note || note.length < MIN_PRICE_NOTE_CHARS) {
      return { error: 'Add a short note: what the vendor asked for, or why the price changed.' }
    }
    const rec = recommendedOfferTotal(pickup.items)
    const bandBp = await getNegotiationBandBp(prisma)
    const check = checkReoffer({
      pricePaise: parsed.paise,
      currentPaise: pickup.offer.estimatedPrice,
      sanctionedPaise: sanctionedPricePaise({ enginePaise: rec.totalPaise, officePricePaise: office?.pricePaise }),
      bandBp,
    })
    if (!check.ok) return { error: check.error }
    pricePaise = parsed.paise
  }

  const current = pickup.offer.estimatedPrice
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date()
      // 🔴 FD7 — guarded on "not accepted" AND on the price we read, so a
      // vendor accepting, or a second re-offer, in the same moment wins cleanly.
      const changed = await tx.offer.updateMany({
        where: { pickupId, acceptedAt: null, estimatedPrice: current, pickup: { agentId: userId, status: 'offered' } },
        data: {
          estimatedPrice: pricePaise,
          priceNote: input.mode === 'office' ? `Office: ${office!.reason}${note ? ` · Agent: ${note}` : ''}` : `Agent re-offer: ${note}`,
        },
      })
      if (changed.count === 0) throw new Error('OFFER_CHANGED')

      const last = await tx.offerRound.findFirst({ where: { pickupId }, orderBy: { roundNo: 'desc' }, select: { roundNo: true } })
      await tx.offerRound.updateMany({ where: { pickupId, outcome: null }, data: { outcome: 'superseded', outcomeAt: now } })
      await tx.offerRound.create({
        data: {
          pickupId,
          roundNo: (last?.roundNo ?? 0) + 1,
          pricePaise,
          basis: input.mode === 'office' ? 'office' : 'agent',
          officePriceId: input.mode === 'office' ? office!.id : null,
          note,
          presentedBy: userId,
          presentedAt: now,
        },
      })
      if (input.mode === 'office') {
        await tx.officePrice.update({
          where: { id: office!.id },
          data: { acknowledgedBy: userId, acknowledgedAt: now, agentNote: note },
        })
      }
      // The vendor's timeline says the offer changed — never by how much.
      await tx.statusEvent.create({
        data: { pickupId, status: 'offered', actorId: userId, actorRole: 'agent', notes: 'Offer revised' },
      })
    }, TX)
  } catch (e) {
    if (e instanceof Error && e.message === 'OFFER_CHANGED') {
      return { error: 'The offer changed a moment ago (the vendor may have accepted). Check the screen.' }
    }
    console.error('[reofferPrice] transaction failed:', e)
    return { error: 'Could not change the offer. Nothing was changed — try again.' }
  }

  revalidatePath(`/job/${pickupId}`)
  revalidatePath(`/job/${pickupId}/offer`)
  return { error: null, ok: 'New price sent. The vendor sees it now.' }
}

export async function reofferPriceAndRedirect(formData: FormData): Promise<void> {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/')
  const mode = String(formData.get('mode') ?? '') === 'office' ? 'office' : 'agent'
  const result = await reofferPrice(pickupId, {
    mode,
    rupees: String(formData.get('rupees') ?? ''),
    note: String(formData.get('note') ?? ''),
    officePriceId: String(formData.get('officePriceId') ?? ''),
  })
  const base = `/job/${encodeURIComponent(pickupId)}/offer`
  if (result.error) redirect(`${base}?error=${encodeURIComponent(result.error)}`)
  redirect(result.ok ? `${base}?ok=${encodeURIComponent(result.ok)}` : base)
}
