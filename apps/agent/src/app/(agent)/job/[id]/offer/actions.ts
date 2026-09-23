'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'

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
  // ─── FV6 · FD5: the human step ────────────────────────────────────────────
  // The company wants a person in the loop for the pilot, and may not trust the
  // engine's number yet. So the agent may present a DIFFERENT total, with a
  // reason.
  //
  // 🔴 THIS IS NOT A SECOND PRICING PATH. The engine still runs, every item is
  // still priced, and every one of those numbers is still written — to
  // `BatteryItem.unitPricePaise` / `linePricePaise`, to `material_breakdown`
  // below, and to each item's `quote_data`. The override changes only the TOTAL
  // that goes to the vendor, and the engine's own figure stays recoverable
  // beside it. That is what makes the pilot comparison possible at the end:
  // what we would have paid, against what we did.
  override?: { totalPaise: number; reason: string } | null,
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

  if (itemsError) return { error: itemsError.message }
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

  const enginePrice = included.reduce((sum, i) => sum + (i.line_price_paise ?? 0), 0)

  // ── The override, validated server-side (the form is not the boundary) ──
  let estimatedPrice = enginePrice
  let overrideNote = ''
  if (override) {
    if (!Number.isInteger(override.totalPaise) || override.totalPaise <= 0) {
      return { error: 'An adjusted offer must be a whole amount greater than zero.' }
    }
    // A rail, not a policy: catches a misplaced decimal on a screen where the
    // agent is typing rupees in front of a waiting vendor. Ten times the
    // engine's figure is not a negotiation, it is a typo.
    if (enginePrice > 0 && override.totalPaise > enginePrice * 10) {
      return { error: 'That is more than ten times the calculated price — check the amount.' }
    }
    if (override.reason.trim().length < 10) {
      return { error: 'Say briefly why you adjusted the price.' }
    }
    estimatedPrice = override.totalPaise
    overrideNote = ` Price adjusted by agent from ${enginePrice} paise: ${override.reason.trim()}`
  }

  // ⚠ Per-item prices here are always the ENGINE's, never the override. An
  // adjusted total is a commercial decision about the load as a whole; spreading
  // it back across items would invent per-battery numbers nobody calculated and
  // would corrupt the very comparison the override exists to enable.
  const materialBreakdown = included.map((i) => ({
    itemId: i.id,
    category: i.category,
    chemistry: i.chemistry,
    pathway: i.pathway,
    weight_kg: Number(i.confirmed_weight_kg ?? i.weight_kg ?? 0),
    price_paise: i.line_price_paise,
  }))

  // Offer.pathway is one value for the whole pickup even though items can
  // differ. Pick the pathway of the highest-value included item — the pathway
  // that actually drives most of the price — and fall back to `recycle` when
  // nothing has one (an all-non-lithium job: D1's "essentially all of it is
  // recycled").
  const byValue = [...included].sort((a, b) => (b.line_price_paise ?? 0) - (a.line_price_paise ?? 0))
  const overallPathway = byValue[0]?.pathway ?? 'recycle'

  const pathwayCounts = included.reduce<Record<string, number>>((acc, i) => {
    const key = i.pathway ?? 'recycle'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const mixSummary = Object.entries(pathwayCounts)
    .map(([pathway, count]) => `${count} ${pathway}`)
    .join(', ')
  const excludedNote = items.length > included.length ? ` ${items.length - included.length} item(s) excluded (HOLD).` : ''
  // 🔴 `rationale` carries the override because it IS the answer to "why this
  // price" — which is the column's whole purpose. The engine's own total is
  // named in it explicitly, so the adjustment is never silent.
  const rationale = `Combined offer across ${included.length} item(s): ${mixSummary}.${excludedNote}${overrideNote}`

  if (!alreadyOffered) {
    const { error: upsertError } = await admin.from('offers').upsert(
      {
        pickup_id: pickupId,
        vendor_id: pickup.vendor_id,
        pathway: overallPathway,
        estimated_price: estimatedPrice,
        rationale,
        material_breakdown: materialBreakdown,
        deductions: [],
      },
      { onConflict: 'pickup_id' },
    )
    if (upsertError) {
      console.error('[presentOffer] offer upsert failed:', upsertError)
      return { error: upsertError.message }
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
    if (statusError) return { error: statusError.message }

    const { error: eventError } = await admin.from('status_events').insert({
      pickup_id: pickupId,
      status: 'offered',
      actor_id: user.id,
      actor_role: 'agent',
      notes: `Offer presented: ${included.length} item(s), ${rationale}`,
    })
    if (eventError) console.error('[presentOffer] status_events insert failed:', eventError)
  }

  revalidatePath(`/job/${pickupId}`)
  revalidatePath(`/job/${pickupId}/offer`)
  return { error: null }
}

export async function presentOfferAndRedirect(pickupId: string, formData?: FormData): Promise<void> {
  // The adjusted-price fields are optional: the plain "Present offer" button
  // posts no override and the engine's total stands.
  const rawTotal = formData?.get('overrideRupees')
  const rawReason = formData?.get('overrideReason')
  const rupees = rawTotal === null || rawTotal === undefined ? NaN : Number(String(rawTotal).trim())
  const override =
    Number.isFinite(rupees) && rupees > 0
      ? {
          // 🔴 Rupees in the form, PAISE in the database. Every money value in
          // this repo is an integer paise; rounding here is the one conversion
          // point, and it happens on the server.
          totalPaise: Math.round(rupees * 100),
          reason: String(rawReason ?? ''),
        }
      : null

  const result = await presentOffer(pickupId, override)
  if (result.error) {
    redirect(`/job/${pickupId}/offer?error=${encodeURIComponent(result.error)}`)
  }
  redirect(`/job/${pickupId}`)
}
