// ─── Recycling impact — CO₂e factors + material aggregation ──────────────────
// Pure helpers: no DB, no clock, no I/O. Same shape as ./documents.
//
// ⚠ READ THIS BEFORE CHANGING A NUMBER BELOW.
//
// These are LITERATURE-DERIVED, ORDER-OF-MAGNITUDE factors for the greenhouse
// gas emissions AVOIDED by recovering material from a battery instead of
// producing that material from virgin ore. They are **not a certified LCA**, not
// audited, and not CPCB-issued. They exist so the app stops doing what the seed
// used to do — apply one hard-coded 8 kg/kg figure to every chemistry, including
// lead-acid, where it overstates by roughly 4×.
//
// The figure derived from these renders on `/certificates/[id]` and inside the
// EPR certificate PDF, which makes it a compliance-adjacent claim on a document.
// So: every row carries its source and the published range it sits inside, the
// customer-facing copy calls it an estimate, and **before any real compliance
// filing these must be replaced with the company's own or a CPCB-accepted set**.
// Replacing them is a value change here and nowhere else — that is the point of
// this file existing.
//
// Sources:
//   [1] Dunn, Gaines, Kelly, James & Gallagher (2015), "The significance of
//       Li-ion batteries in electric vehicle life-cycle energy and emissions and
//       recycling's role in its reduction", Energy & Environmental Science 8,
//       158–168 (Argonne National Laboratory / GREET).
//   [2] Ciez & Whitacre (2019), "Examining different recycling processes for
//       lithium-ion batteries", Nature Sustainability 2, 148–156.
//   [3] Secondary vs primary lead production — secondary lead is consistently
//       reported at a fraction of primary lead's cradle-to-gate GHG intensity;
//       a lead-acid battery is roughly 60–70% lead by mass.

import type { BatteryCategory, BatteryType } from "@clbipp/database";

/**
 * kg CO₂e avoided per kg of battery recycled, by CONFIRMED chemistry.
 *
 * Typed as a Record over the enum on purpose: adding a chemistry to
 * `BatteryType` becomes a compile error here rather than a silent zero on a
 * certificate.
 */
export const CO2E_AVOIDED_KG_PER_KG: Record<BatteryType, number> = {
  // High-nickel/cobalt cathodes carry the largest avoided burden, because the
  // virgin route they displace (nickel and cobalt refining) is the emissions-
  // heavy part of a cell. Sources [1][2]; published range ~6–10.
  li_ion_nmc: 8.0,
  // Same family, marginally lower cobalt. [1][2]; range ~6–9.
  li_ion_nca: 7.5,
  // No cobalt and no nickel, so recycling displaces far less. [2] finds the
  // savings for LFP marginal and, for pyrometallurgy, close to zero. Range ~1–4;
  // the mid-low end is taken rather than the mid, because overclaiming on the
  // chemistry with the weakest evidence is the worst place to be optimistic.
  li_ion_lfp: 2.5,
  // Secondary vs primary lead, scaled for a battery being ~65% lead by mass.
  // [3]; range ~1.5–2.5.
  lead_acid: 2.0,
  // Nickel-dominant, no cobalt-grade refining displaced. Range ~3–6.
  nimh: 4.5,
  // Deliberate conservative floor: `other` means we do not know what it is, so
  // it should not earn a chemistry-specific claim.
  other: 1.5,
};

/**
 * Fallback factors for battery whose chemistry is NOT yet known.
 *
 * `BatteryItem.chemistry` is an agent-confirmed field — it is null on everything
 * before collection, because the customer is never asked for chemistry at
 * booking (Batch 5 decision). Anything pre-collection therefore has only the
 * customer-declared `category` to go on.
 *
 * Kept as its own table rather than mapping each category onto a representative
 * chemistry, for two reasons: a reader can see at a glance that a fallback is
 * being used, and the values are picked at the CONSERVATIVE end of each
 * category's plausible chemistry mix rather than at its best case. A guess
 * should not be able to out-claim a confirmed measurement.
 */
export const CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY: Record<BatteryCategory, number> = {
  // Mixed consumer Li-ion (NMC-heavy but with real LFP volume) — well below
  // NMC's 8.0 because the mix is unknown.
  portable: 4.0,
  // SLI batteries are overwhelmingly lead-acid.
  automotive: 2.0,
  // Stationary/backup, also lead-acid dominated.
  industrial: 2.0,
  // NMC and LFP packs in roughly comparable volumes.
  ev: 5.0,
};

/**
 * One line of a load, as much of it as impact needs. Loosely typed on purpose:
 * `chemistry` arrives from Prisma as `BatteryType | null`, and `category` is
 * read straight off a row, so callers should not have to cast.
 */
export interface ImpactItem {
  weightKg: number;
  category: string;
  chemistry?: string | null;
}

/** The factor a single line earns, and whether it is confirmed or a fallback. */
export function co2eFactorFor(item: Pick<ImpactItem, "category" | "chemistry">): number {
  if (item.chemistry) {
    const confirmed = CO2E_AVOIDED_KG_PER_KG[item.chemistry as BatteryType];
    if (typeof confirmed === "number") return confirmed;
  }
  const fallback = CO2E_AVOIDED_KG_PER_KG_BY_CATEGORY[item.category as BatteryCategory];
  // An unrecognised category is not a reason to claim nothing happened, but it
  // is a reason to claim as little as the table allows.
  return typeof fallback === "number" ? fallback : CO2E_AVOIDED_KG_PER_KG.other;
}

/**
 * Total kg CO₂e avoided for a set of lines.
 *
 * Rounded ONCE at the end rather than per line — rounding each line and summing
 * drifts upward on a load with many small rows, and a certificate should not
 * disagree with a recomputation of itself by a kilo.
 */
export function co2eAvoidedKg(items: ImpactItem[]): number {
  const total = items.reduce((sum, item) => {
    const weight = Number(item.weightKg);
    if (!Number.isFinite(weight) || weight <= 0) return sum;
    return sum + weight * co2eFactorFor(item);
  }, 0);
  return Math.round(total);
}

/** One recovered material and how much of it came back, in kg. */
export interface RecoveredMaterial {
  material: string;
  kg: number;
}

/**
 * Fold any number of `Certificate.materialSummary` JSON blobs into one list,
 * heaviest first.
 *
 * The column is untyped `Json`, so this parses defensively and skips anything
 * malformed rather than crashing the dashboard — the same posture as
 * `parseMaterialWeights` in ./offer, which does this for the offer screens.
 * Stable key: `recovered_kg` (the seed and the certificate PDF both write it).
 */
export function aggregateMaterials(summaries: unknown[]): RecoveredMaterial[] {
  const totals = new Map<string, number>();

  for (const raw of summaries) {
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null) continue;
      const { material, recovered_kg } = entry as Record<string, unknown>;
      if (typeof material !== "string" || material.length === 0) continue;
      const kg = Number(recovered_kg);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      totals.set(material, (totals.get(material) ?? 0) + kg);
    }
  }

  return [...totals.entries()]
    .map(([material, kg]) => ({ material, kg: Math.round(kg * 10) / 10 }))
    .sort((a, b) => b.kg - a.kg);
}

/**
 * `Nickel: 5.7 kg; Cobalt: 2.2 kg` — one CSV cell, one certificate row.
 *
 * The compliance export needs a stable column set (see the route), so the
 * per-material figures collapse into a single text column rather than becoming
 * columns that change shape between exports.
 */
export function formatMaterials(materials: RecoveredMaterial[]): string {
  return materials.map((m) => `${m.material}: ${m.kg} kg`).join("; ");
}
