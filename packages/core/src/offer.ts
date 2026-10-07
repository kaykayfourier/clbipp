// ─── Offer display helpers ───────────────────────────────────────────────────
// Shared by /offer and /offer-breakdown so the paise→₹ conversion and pathway
// labels live in one place.

import type { RecoveryPathway } from "@clbipp/database";

import { formatPaise, isStorablePaise, rupeesToPaise } from "./documents";

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

// ─── Pricing an offer (feedback round 2) ─────────────────────────────────────
// The engine is RECOMMENDATION-ONLY for the pilot. The price is agreed on a
// call to the office; the engine's total is kept internally beside it and never
// shown to the vendor.

/** A typed offer more than this many times the recommendation is a typo. */
export const MAX_OFFER_MULTIPLE = 10;
export const MIN_PRICE_NOTE_CHARS = 10;
export const MAX_PRICE_NOTE_CHARS = 500;

export type ResolvedOfferPrice = {
  /** What the vendor is offered, and paid on collection. */
  offeredPaise: number;
  /** The engine / rate-card total. Internal only. */
  recommendedPaise: number;
  note: string | null;
};

/**
 * Decide the offered amount from the recommendation and what the agent typed.
 * A blank price means "offer the recommendation". A typed price that differs
 * from it needs a note saying how it was agreed.
 */
export function resolveOfferPrice(input: {
  recommendedPaise: number;
  agreedRupees: string | null | undefined;
  note: string | null | undefined;
}): { value: ResolvedOfferPrice; error: null } | { value: null; error: string } {
  const { recommendedPaise } = input;
  if (!isStorablePaise(recommendedPaise)) {
    return { value: null, error: "This load's price is too large to record. Check the readings on each item." };
  }

  const note = (input.note ?? "").trim().slice(0, MAX_PRICE_NOTE_CHARS) || null;
  const raw = (input.agreedRupees ?? "").trim().replace(/,/g, "");
  if (raw === "") {
    return { value: { offeredPaise: recommendedPaise, recommendedPaise, note }, error: null };
  }

  const rupees = Number(raw);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return { value: null, error: "Enter the agreed price as an amount in rupees, greater than zero." };
  }
  const offeredPaise = rupeesToPaise(rupees);
  if (!isStorablePaise(offeredPaise)) {
    return { value: null, error: "That price is too large. Check the amount." };
  }
  if (recommendedPaise > 0 && offeredPaise > recommendedPaise * MAX_OFFER_MULTIPLE) {
    return {
      value: null,
      error: `That is more than ${MAX_OFFER_MULTIPLE} times the recommended price. Check the amount.`,
    };
  }
  if (offeredPaise !== recommendedPaise && (note === null || note.length < MIN_PRICE_NOTE_CHARS)) {
    return { value: null, error: "Add a short note on how this price was agreed, e.g. who you spoke to." };
  }
  return { value: { offeredPaise, recommendedPaise, note }, error: null };
}

/**
 * The one sentence the VENDOR reads under the offer. Never names the engine,
 * a recommendation or an adjustment.
 */
export function vendorOfferRationale(includedLines: number, totalLines: number): string {
  const lines = (n: number) => `${n} battery line${n === 1 ? "" : "s"}`;
  if (includedLines >= totalLines) {
    return `Based on our on-site inspection of ${lines(includedLines)}.`;
  }
  const left = totalLines - includedLines;
  return `Based on our on-site inspection. Covers ${includedLines} of your ${lines(totalLines)}; ${left === 1 ? "the other line needs" : `the other ${left} need`} a closer look and ${left === 1 ? "is" : "are"} not included.`;
}
