'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { photoPathsBelongTo } from '@clbipp/core/intake'

// ─── The damage rubric submit (D1 · Batch 5a) ────────────────────────────────
// Copies the four-point shape of ../../actions.ts (the app's reference
// service-role action) and the two-part ownership check ../actions.ts adds for
// items: pickup is this agent's, AND the item belongs to that pickup.
//
// This action does NOT call the engine. It only records what the agent found
// on site — the three raw damage scores and the BMS quick-entry workaround
// (see BatteryItem.quoteData in schema.prisma) — and redirects to /computing,
// which calls POST /api/quote from the browser. Two reasons the engine call
// doesn't happen here:
//   1. /api/quote already exists (Batch 4) and is the one place that builds
//      MarketData and maps engine errors to HTTP status. Duplicating that here
//      would be a second pricing path — exactly what the task sheet forbids.
//   2. The wireframe's own computing screen is a ~1.5s loader that calls the
//      API "in background" — that needs to happen client-side, after this
//      redirect, not inside this action.

/** Engine Chemistry from the DB's BatteryType. See DamageRubricForm's note on
 * why NMC622 is the assumed variant — the schema doesn't distinguish 622 from
 * 811 for li_ion_nmc, and the engine wants ONE of them. TODO: split this once
 * the schema (or Entroview) can tell the two apart. */
function toEngineChemistry(batteryType: string | null): 'NMC622' | 'LFP' | 'NCA' | 'unknown' {
  if (batteryType === 'li_ion_nmc') return 'NMC622'
  if (batteryType === 'li_ion_lfp') return 'LFP'
  if (batteryType === 'li_ion_nca') return 'NCA'
  return 'unknown'
}

export async function submitDamageRubric(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  if (!pickupId || !itemId) redirect('/')

  const damagePath = `/job/${encodeURIComponent(pickupId)}/items/${encodeURIComponent(itemId)}/damage`
  const fail = (message: string): never =>
    redirect(`${damagePath}?error=${encodeURIComponent(message)}`)

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) redirect('/login')

  const admin = createAdminClient()

  // ── Ownership, in two parts. See ../actions.ts for the full rationale. ──
  const { data: pickup, error: pickupError } = await admin
    .from('pickups')
    .select('id, agent_id, status')
    .eq('id', pickupId)
    .single()
  if (pickupError || !pickup) return fail('Job not found.')
  if (pickup.agent_id !== user.id) return fail('This job is not assigned to you.')

  const { data: item, error: itemError } = await admin
    .from('battery_items')
    .select('id, pickup_id, chemistry, quantity')
    .eq('id', itemId)
    .single()
  if (itemError || !item || item.pickup_id !== pickupId) return fail('Item not found on this job.')

  // ── The three raw scores ──────────────────────────────────────────────────
  const visual = Number(formData.get('visual'))
  const leakage = Number(formData.get('leakage'))
  const thermal = Number(formData.get('thermal'))
  for (const [name, v] of [['visual', visual], ['leakage', leakage], ['thermal', thermal]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 3) return fail(`${name} score must be 0–3.`)
  }
  // MUST match packages/decision-engine/src/decisionEngine/layers/damage.ts
  // exactly — this is the record of what was submitted, the engine recomputes
  // the same formula from the same three inputs at compute time.
  const damageScore = 0.4 * visual + 0.35 * leakage + 0.25 * thermal

  // ── BMS quick-entry (workaround) ──────────────────────────────────────────
  const sohPct = Number(formData.get('sohPct'))
  const capacityKwh = Number(formData.get('capacityKwh'))
  const ageYears = Number(formData.get('ageYears'))
  const cycleCount = Number(formData.get('cycleCount'))
  if (!Number.isFinite(sohPct) || sohPct < 0 || sohPct > 100) return fail('State of health must be 0–100%.')
  if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) return fail('Capacity must be greater than 0.')
  if (!Number.isFinite(ageYears) || ageYears < 0) return fail('Age must be 0 or more.')
  if (!Number.isFinite(cycleCount) || cycleCount < 0) return fail('Cycle count must be 0 or more.')

  const distanceKm = Number(formData.get('distanceKm') ?? 0)

  // ── Photos ─────────────────────────────────────────────────────────────────
  const photoPaths = formData
    .getAll('photoPaths')
    .map((p) => String(p))
    .filter((p) => p.length > 0)
  if (!photoPathsBelongTo(photoPaths, user.id)) {
    return fail('Those photos were not uploaded by you.')
  }

  // ── The QuoteInput draft. `weight_kg` comes off the item's CONFIRMED weight
  // (Batch 3), never the customer's declared one — the agent's own scale
  // reading is what the engine should price against. ──
  const { data: itemFull } = await admin
    .from('battery_items')
    .select('confirmed_weight_kg, weight_kg')
    .eq('id', itemId)
    .single()
  const weightKg = Number(itemFull?.confirmed_weight_kg ?? itemFull?.weight_kg ?? 0)

  const quoteInputDraft = {
    battery: {
      soh_nominal: sohPct,
      chemistry: toEngineChemistry(item.chemistry),
      capacity_kWh: capacityKwh,
      weight_kg: weightKg,
      age_years: ageYears,
      cycle_count: cycleCount,
      // ⚠ WORKAROUND — no instrument reads these on this build. Defaulted to
      // "no anomaly detected" rather than guessed. See DamageRubricForm.tsx
      // and the BatteryItem.quoteData comment in schema.prisma.
      entropy_anomalies_count: 0,
      ir_imbalance_ratio: 0,
      voltage_imbalance_mv: 0,
      temperature_history_max_c: 25,
    },
    damage: { visual, leakage, thermal },
    distance_km: { in: distanceKm },
    inflow_type: 'external' as const,
    photoPaths,
  }

  const { error: writeError } = await admin
    .from('battery_items')
    .update({
      damage_visual: visual,
      damage_leakage: leakage,
      damage_thermal: thermal,
      damage_score: damageScore,
      quote_data: { input: quoteInputDraft },
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('pickup_id', pickupId)

  if (writeError) {
    console.error('[submitDamageRubric] update failed:', writeError)
    return fail(writeError.message)
  }

  revalidatePath(damagePath)
  revalidatePath(`/job/${pickupId}/items/${itemId}`)

  redirect(`/job/${encodeURIComponent(pickupId)}/items/${encodeURIComponent(itemId)}/computing`)
}

// ─── saveQuoteResult ──────────────────────────────────────────────────────────
// Called by the /computing screen once POST /api/quote returns. Persists the
// engine's QuoteOutput onto the item (see the quoteData workaround note again)
// and the columns the schema always intended for this: pathway, traceId,
// unitPricePaise, linePricePaise.
export async function saveQuoteResult(
  pickupId: string,
  itemId: string,
  output: {
    trace_id: string
    decision: { pathway: string | null }
    economics: { net_value: number }
    pricing?: { p_recommended: number }
  },
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
    .select('id, agent_id')
    .eq('id', pickupId)
    .single()
  if (pickupError || !pickup) return { error: 'Job not found.' }
  if (pickup.agent_id !== user.id) return { error: 'This job is not assigned to you.' }

  const { data: item, error: itemError } = await admin
    .from('battery_items')
    .select('id, pickup_id, quantity, quote_data')
    .eq('id', itemId)
    .single()
  if (itemError || !item || item.pickup_id !== pickupId) return { error: 'Item not found on this job.' }

  // Engine pathway names are UPPERCASE (REUSE/REFURBISH/RECYCLE); the schema's
  // RecoveryPathway enum is lowercase and also has `dispose`, which the engine
  // never returns. HOLD (pathway: null) stays null here too — nothing to sell
  // yet, so nothing to price.
  const pathway = output.decision.pathway ? output.decision.pathway.toLowerCase() : null

  // rupeesToPaise (packages/core/src/documents.ts, Batch 4) is the repo's one
  // rupee→paise converter — round half-up at the paise level, never a float
  // round-trip. Falls back to net_value when there's no pricing band (internal
  // stock, or HOLD), matching D8's "recovered value" reading for that case.
  const priceRupees = output.pricing?.p_recommended ?? output.economics.net_value
  const unitPricePaise = Math.round(priceRupees * 100)
  const linePricePaise = unitPricePaise * item.quantity

  const existingQuoteData =
    typeof item.quote_data === 'object' && item.quote_data !== null ? item.quote_data : {}

  const { error: writeError } = await admin
    .from('battery_items')
    .update({
      pathway,
      trace_id: output.trace_id,
      unit_price_paise: unitPricePaise,
      line_price_paise: linePricePaise,
      quote_data: { ...existingQuoteData, output },
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('pickup_id', pickupId)

  if (writeError) {
    console.error('[saveQuoteResult] update failed:', writeError)
    return { error: writeError.message }
  }

  revalidatePath(`/job/${pickupId}/items/${itemId}/result`)
  revalidatePath(`/job/${pickupId}/items`)

  return { error: null }
}
