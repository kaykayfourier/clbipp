'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { resolveOfferPrice, vendorOfferRationale } from '@clbipp/core'

// ─── presentOffer (D7: arrived → offered) — Batch 5a · Ali ───────────────────
// The multi-item consequence the wireframe never modelled: per-item prices
// (each already computed and stored by result/actions.ts's saveQuoteResult,
// or the non-lithium rate-card path in result/data.ts) sum into ONE Offer row
// for the whole pickup. Same idempotent shape as job/[id]/actions.ts's
// markArrived — re-presenting an already-offered pickup is a no-op success,
// not a duplicate Offer or a duplicate status_events row.
//
// HOLD items are excluded from the sum, not blocking. A single dead line
// shouldn't hold six good ones off the vendor's screen — it's already been
// (or still needs to be) escalated from its own result screen. Every item
// still has to have been PRICED (unitPricePaise set) before presenting can
// happen at all: an unpriced item means the agent hasn't finished the job.
export async function presentOffer(
  pickupId: string,
  // ─── The agreed price (FV6, feedback round 2) ─────────────────────────────
  // The engine is recommendation-only for the pilot: the price is agreed on a
  // call to the office and typed here. Blank means "offer the recommendation".
  //
  // 🔴 NOT A SECOND PRICING PATH. Every item is still priced and stored; this
  // changes only the total offered. The recommendation and the agent's note are
  // kept on the offer's internal columns, never in `rationale`, which the
  // vendor reads.
  agreed?: { rupees: string | null; note: string | null } | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()

  const { data: pickup, error: pickupError } = await admin
    .from('pickups')
    .select('id, agent_id, vendor_id, status')
    .eq('id', pickupId)
    .single()
  if (pickupError || !pickup) return { error: 'Job not found.' }
  if (pickup.agent_id !== user.id) return { error: 'This job is not assigned to you.' }

  // Already offered (or further along) — idempotent success, same posture as
  // markArrived. Re-clicking "Present offer" after a slow network retry must
  // not create a second Offer row or a second status_events entry.
  const alreadyOffered = pickup.status !== 'arrived'

  const { data: items, error: itemsError } = await admin
    .from('battery_items')
    .select('id, category, chemistry, quantity, weight_kg, confirmed_weight_kg, pathway, unit_price_paise, line_price_paise, quote_data')
    .eq('pickup_id', pickupId)

  if (itemsError) {
    console.error('[presentOffer] items read failed:', itemsError)
    return { error: 'Could not load the items. Try again.' }
  }
  if (!items || items.length === 0) return { error: 'This job has no items to offer.' }

  const unpriced = items.filter((i) => i.unit_price_paise === null || i.line_price_paise === null)
  if (unpriced.length > 0) {
    return { error: `${unpriced.length} item${unpriced.length === 1 ? '' : 's'} still need pricing before you can present.` }
  }

  const isHold = (i: (typeof items)[number]): boolean => {
    const output = (i.quote_data as { output?: { decision?: { flags?: string[] } } } | null)?.output
    return Boolean(output?.decision?.flags?.includes('HOLD'))
  }

  const included = items.filter((i) => !isHold(i))
  if (included.length === 0) {
    return { error: 'Every item on this job is on HOLD — nothing to present. Escalate each item first.' }
  }

  const recommendedPaise = included.reduce((sum, i) => sum + (i.line_price_paise ?? 0), 0)

  // Validated server-side; the form is not the boundary.
  const price = resolveOfferPrice({
    recommendedPaise,
    agreedRupees: agreed?.rupees ?? null,
    note: agreed?.note ?? null,
  })
  if (price.error !== null) return { error: price.error }

  // ⚠ Per-item prices stay the engine's. An agreed total is a decision about the
  // load as a whole; spreading it across items would invent per-battery numbers
  // nobody calculated. Weights only here: this JSON sits on the vendor's offer
  // row, so it carries no prices.
  const materialBreakdown = included.map((i) => ({
    itemId: i.id,
    category: i.category,
    chemistry: i.chemistry,
    pathway: i.pathway,
    weight_kg: Number(i.confirmed_weight_kg ?? i.weight_kg ?? 0),
  }))

  // Offer.pathway is one value for the whole pickup even though items can
  // differ: the pathway of the highest-value included item, or `recycle` when
  // nothing has one (an all-non-lithium job).
  const byValue = [...included].sort((a, b) => (b.line_price_paise ?? 0) - (a.line_price_paise ?? 0))
  const overallPathway = byValue[0]?.pathway ?? 'recycle'

  const rationale = vendorOfferRationale(included.length, items.length)

  if (!alreadyOffered) {
    const { error: upsertError } = await admin.from('offers').upsert(
      {
        pickup_id: pickupId,
        vendor_id: pickup.vendor_id,
        pathway: overallPathway,
        estimated_price: price.value.offeredPaise,
        rationale,
        material_breakdown: materialBreakdown,
        deductions: [],
        recommended_price_paise: price.value.recommendedPaise,
        price_note: price.value.note,
      },
      { onConflict: 'pickup_id' },
    )
    if (upsertError) {
      console.error('[presentOffer] offer upsert failed:', upsertError)
      return { error: 'Could not save the offer. Try again.' }
    }

    const { error: statusError } = await admin
      .from('pickups')
      .update({
        status: 'offered',
        // FV3 · FD0. The inspection is finished at exactly this moment — every
        // item is confirmed, scored and priced, which is what presenting
        // requires. Recorded rather than derived from `status_events` because
        // that log can legitimately run BACKWARDS (a reactivated pickup writes
        // `requested` after `cancelled`), so "when was this inspected" cannot
        // be answered by taking the last matching event.
        inspected_at: new Date().toISOString(),
      })
      .eq('id', pickupId)
      .eq('status', 'arrived') // guards the same race markArrived guards against
    if (statusError) {
      console.error('[presentOffer] status update failed:', statusError)
      return { error: 'Could not update the job. Try again.' }
    }

    const { error: eventError } = await admin.from('status_events').insert({
      pickup_id: pickupId,
      status: 'offered',
      actor_id: user.id,
      actor_role: 'agent',
      // No amounts: the vendor's token can read this table.
      notes: `Offer presented for ${included.length} of ${items.length} line(s)`,
    })
    if (eventError) console.error('[presentOffer] status_events insert failed:', eventError)
  }

  revalidatePath(`/job/${pickupId}`)
  revalidatePath(`/job/${pickupId}/offer`)
  return { error: null }
}

export async function presentOfferAndRedirect(pickupId: string, formData?: FormData): Promise<void> {
  // Both fields are optional: a blank price presents the recommendation.
  const rupees = formData?.get('agreedRupees')
  const note = formData?.get('priceNote')
  const result = await presentOffer(pickupId, {
    rupees: rupees === null || rupees === undefined ? null : String(rupees),
    note: note === null || note === undefined ? null : String(note),
  })
  if (result.error) {
    redirect(`/job/${pickupId}/offer?error=${encodeURIComponent(result.error)}`)
  }
  redirect(`/job/${pickupId}/offer`)
}
