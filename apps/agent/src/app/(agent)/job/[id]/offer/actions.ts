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
export async function presentOffer(pickupId: string): Promise<{ error: string | null }> {
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

  const estimatedPrice = included.reduce((sum, i) => sum + (i.line_price_paise ?? 0), 0)

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
  const rationale = `Combined offer across ${included.length} item(s): ${mixSummary}.${excludedNote}`

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
      .update({ status: 'offered' })
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

export async function presentOfferAndRedirect(pickupId: string): Promise<void> {
  const result = await presentOffer(pickupId)
  if (result.error) {
    redirect(`/job/${pickupId}/offer?error=${encodeURIComponent(result.error)}`)
  }
  redirect(`/job/${pickupId}`)
}
