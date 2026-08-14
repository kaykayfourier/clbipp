// ─── Offer display helpers ───────────────────────────────────────────────────
// Shared by /offer and /offer-breakdown so the paise→₹ conversion and pathway
// labels live in one place.

import type { RecoveryPathway } from "@clbipp/database";

import { formatPaise } from "./documents";

// `Offer.estimatedPrice` is stored as an integer number of PAISE (see seed:
// 18450000 = ₹1,84,500).
//
// Batch 8 moved the actual conversion to `formatPaise` in ./documents, because
// the payment, wallet, receipt and invoice surfaces all need the same rupee
// format and money formatting drifting between two implementations is exactly
// the kind of bug nobody notices. This stays as the offer screens' name for it.
export function formatOfferPrice(estimatedPricePaise: number): string {
  return formatPaise(estimatedPricePaise);
}

// Human-readable label for each recovery pathway enum value. Typed as a Record
// over the enum so adding a pathway forces a label here (exhaustiveness).
const PATHWAY_LABELS: Record<RecoveryPathway, string> = {
  recycle: "Recycling",
  refurbish: "Refurbishment",
  reuse: "Reuse",
  dispose: "Disposal",
};

// String-safe lookup — the Supabase client returns `pathway` untyped, so callers
// pass a plain string and fall back to the raw value for anything unexpected.
export function pathwayLabel(pathway: string): string {
  return PATHWAY_LABELS[pathway as RecoveryPathway] ?? pathway;
}

// One recovered material, WEIGHT ONLY. `Offer.materialBreakdown` also carries a
// `value_paise` per line — deliberately dropped here: the locked rule forbids
// rendering material/deduction ₹ to the vendor. Weight (kg) is allowed.
export interface MaterialWeight {
  material: string;
  weightKg: number;
}

// Defensively parse the untyped materialBreakdown JSON into weight-only rows.
// Anything malformed is skipped rather than crashing the offer screen.
export function parseMaterialWeights(raw: unknown): MaterialWeight[] {
  if (!Array.isArray(raw)) return [];
  const rows: MaterialWeight[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { material, weight_kg } = item as Record<string, unknown>;
    if (typeof material === "string" && typeof weight_kg === "number") {
      rows.push({ material, weightKg: weight_kg });
    }
  }
  return rows;
}
