'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma, type RecoveryPathway } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { getMarketData } from '@clbipp/core'
import { getActiveConfig } from '@clbipp/core/engine-config'
import { MAX_PAISE } from '@clbipp/core/format'
import { isLithium, parseBmsReadings, perPackWeightKg, photoPathsBelongTo } from '@clbipp/core/intake'
import {
  computeQuote,
  EngineValidationError,
  StaleMarketDataError,
  type QuoteInput,
} from '@clbipp/decision-engine'
import { intakeClosedMessage } from '@/lib/safety-gate'

// ─── Damage rubric + the lithium price (D1 · Batch 5a, feedback round 2) ─────
// submitDamageRubric records what the agent found on site; computeItemQuote
// then runs the engine ON THE SERVER from what was stored, and writes the price.
// The browser used to run /api/quote and hand the result back to be saved, so
// the server stored whatever price it was sent.

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
  const closed = intakeClosedMessage(pickup.status)
  if (closed) return fail(closed)

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

  // ── BMS quick-entry (workaround). Bounded, so a typo cannot overflow a price.
  const bms = parseBmsReadings({
    sohPct: formData.get('sohPct'),
    capacityKwh: formData.get('capacityKwh'),
    ageYears: formData.get('ageYears'),
    cycleCount: formData.get('cycleCount'),
    distanceKm: formData.get('distanceKm'),
  })
  if (bms.error !== null) return fail(bms.error)
  const { sohPct, capacityKwh, ageYears, cycleCount, distanceKm } = bms.value

  // ── Photos ─────────────────────────────────────────────────────────────────
  const photoPaths = formData
    .getAll('photoPaths')
    .map((p) => String(p))
    .filter((p) => p.length > 0)
  if (!photoPathsBelongTo(photoPaths, user.id)) {
    return fail('Those photos were not uploaded by you.')
  }

  // ── The QuoteInput draft. Weight is ONE pack's share of the agent's confirmed
  // line weight: the engine prices a pack and the line is unit × quantity.
  // (computeItemQuote re-derives it from the item at compute time.) ──
  const { data: itemFull } = await admin
    .from('battery_items')
    .select('confirmed_weight_kg, weight_kg')
    .eq('id', itemId)
    .single()
  const weightKg = perPackWeightKg(
    Number(itemFull?.confirmed_weight_kg ?? itemFull?.weight_kg ?? 0),
    item.quantity,
  )

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
    return fail('Could not save the readings. Try again.')
  }

  revalidatePath(damagePath)
  revalidatePath(`/job/${pickupId}/items/${itemId}`)

  redirect(`/job/${encodeURIComponent(pickupId)}/items/${encodeURIComponent(itemId)}/computing`)
}

// ─── computeItemQuote ─────────────────────────────────────────────────────────
// Runs the decision engine for one lithium item from the readings stored by
// submitDamageRubric, and writes pathway, traceId, unit/line price and the full
// engine output. Everything comes from the database and the session; nothing
// about the price is taken from the browser.
//
// The vendor's margin tier is selected by Pickup.vendorId (AD9): never a field
// a client could name.
type StoredInput = Pick<QuoteInput, 'battery' | 'damage' | 'distance_km'> & {
  inflow_type?: QuoteInput['inflow_type']
}

export async function computeItemQuote(pickupId: string, itemId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Not authenticated.' }

  // Ownership in the query itself: this agent's pickup, and this item on it.
  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId, pickup: { agentId: user.id } },
    select: {
      id: true,
      quantity: true,
      chemistry: true,
      weightKg: true,
      confirmedWeightKg: true,
      quoteData: true,
      pickup: { select: { status: true, vendorId: true } },
    },
  })
  if (!item) return { error: 'Item not found on this job.' }
  const closed = intakeClosedMessage(item.pickup.status)
  if (closed) return { error: closed }
  if (!isLithium(item.chemistry)) return { error: 'Only lithium items are priced by the engine.' }

  const stored = (item.quoteData as { input?: StoredInput } | null)?.input
  if (!stored?.battery || !stored.damage) return { error: 'Fill in the damage readings first.' }

  const lineWeightKg = Number(item.confirmedWeightKg ?? item.weightKg ?? 0)
  const input: StoredInput = {
    ...stored,
    battery: { ...stored.battery, weight_kg: perPackWeightKg(lineWeightKg, item.quantity) },
  }
  const traceId = `${pickupId}-${itemId}`

  let output: ReturnType<typeof computeQuote>
  try {
    const [marketData, config] = await Promise.all([getMarketData(), getActiveConfig()])
    output = computeQuote(
      {
        trace_id: traceId,
        battery: input.battery,
        damage: input.damage,
        distance_km: input.distance_km,
        inflow_type: input.inflow_type ?? 'external',
        supplier_id: item.pickup.vendorId,
      },
      config,
      marketData,
    )
  } catch (err: unknown) {
    console.error('[computeItemQuote] engine failed:', err)
    if (err instanceof EngineValidationError) {
      return { error: 'The engine could not use these readings. Check them on the damage screen.' }
    }
    if (err instanceof StaleMarketDataError) {
      return { error: 'Metal prices are out of date. Ask the office to update them, then try again.' }
    }
    return { error: 'The price could not be worked out right now. Call the office.' }
  }

  // Falls back to net value when there is no pricing band (HOLD, or internal
  // stock), which can be negative; HOLD lines are left out of the offer total.
  const priceRupees = output.pricing?.p_recommended ?? output.economics.net_value
  const unitPricePaise = Math.round(priceRupees * 100)
  const linePricePaise = unitPricePaise * item.quantity
  const fits = (paise: number) => Number.isSafeInteger(paise) && Math.abs(paise) <= MAX_PAISE
  if (!fits(unitPricePaise) || !fits(linePricePaise)) {
    return { error: 'This price is too large to record. Check the readings. Capacity is per pack.' }
  }

  try {
    await prisma.batteryItem.update({
      where: { id: item.id },
      data: {
        // Engine pathway names are UPPERCASE; the enum is lowercase. HOLD is null.
        pathway: output.decision.pathway ? (output.decision.pathway.toLowerCase() as RecoveryPathway) : null,
        traceId: output.trace_id,
        unitPricePaise,
        linePricePaise,
        // A plain JSON copy, the same shape the result screens and /trace read.
        quoteData: JSON.parse(JSON.stringify({ input, output })),
      },
    })
  } catch (err: unknown) {
    console.error('[computeItemQuote] write failed:', err)
    return { error: 'Could not save the price. Try again.' }
  }

  revalidatePath(`/job/${pickupId}/items/${itemId}/result`)
  revalidatePath(`/job/${pickupId}/items`)
  return { error: null }
}
