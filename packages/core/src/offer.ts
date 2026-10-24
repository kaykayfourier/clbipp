// ─── Offer display helpers ───────────────────────────────────────────────────
// Shared by /offer and /offer-breakdown so the paise→₹ conversion and pathway
// labels live in one place.

import type { RecoveryPathway } from "@clbipp/database";

import { formatPaise, isStorablePaise, rupeesToPaise } from "./documents";
import { isLithium } from "./intake";

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

// ─── Pricing an offer (feedback round 2 → AF5) ───────────────────────────────
// The engine is RECOMMENDATION-ONLY for the pilot. Since AF5 · FD23 only the
// OFFICE enters a changed price (the agent's typed "Agreed price" field is
// gone — the company's worry was an agent mishearing or mistyping it), and the
// agent re-offers only inside the band (./negotiation). The engine's total is
// kept internally beside the offered price and never shown to the vendor.

/** A price more than this many times the recommendation is a typo. */
export const MAX_OFFER_MULTIPLE = 10;
export const MIN_PRICE_NOTE_CHARS = 10;
export const MAX_PRICE_NOTE_CHARS = 500;

/** A typed rupee amount ("48,000", "51257.60") → integer paise, or why not. */
export function parsePriceRupees(
  raw: string | null | undefined,
): { paise: number; error: null } | { paise: null; error: string } {
  const text = (raw ?? "").trim().replace(/,/g, "");
  const rupees = Number(text);
  if (text === "" || !Number.isFinite(rupees) || rupees <= 0) {
    return { paise: null, error: "Enter the price as an amount in rupees, greater than zero." };
  }
  const paise = rupeesToPaise(rupees);
  if (!isStorablePaise(paise)) return { paise: null, error: "That price is too large. Check the amount." };
  return { paise, error: null };
}

/**
 * The office's price, checked against the engine's recommendation: a typo
 * guard (×MAX_OFFER_MULTIPLE), never a business rule — the office may go
 * anywhere below it, including well under the engine.
 */
export function checkOfficePrice({ pricePaise, enginePaise }: { pricePaise: number; enginePaise: number }): string | null {
  if (!isStorablePaise(pricePaise) || pricePaise <= 0) return "That price is too large. Check the amount.";
  if (enginePaise > 0 && pricePaise > enginePaise * MAX_OFFER_MULTIPLE) {
    return `That is more than ${MAX_OFFER_MULTIPLE} times the recommended price. Check the amount.`;
  }
  return null;
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

// ─── The engine's recommendation for a whole load (AF5) ──────────────────────
// ONE reading of "what is the recommended total", for the agent's offer page,
// presentOffer, and the admin Price panel. Until AF5 the HOLD rule existed
// twice and disagreed: the page left out a line only when it was lithium AND
// on HOLD, presentOffer left out any line carrying a HOLD flag — so in the one
// case they differed (a non-lithium line with a stale engine quote) the vendor
// was offered less than the total the agent had just read out. HOLD is an
// engine verdict and the engine prices lithium only (D1), so the page's rule
// is the right one.

export type OfferItemForTotal = {
  id: string;
  chemistry: string | null;
  unitPricePaise: number | null;
  linePricePaise: number | null;
  quoteData: unknown;
};

/** True when the engine put this lithium line on HOLD — left out of the offer. */
export function isHeldItem(item: Pick<OfferItemForTotal, "chemistry" | "quoteData">): boolean {
  if (!isLithium(item.chemistry)) return false;
  const output = (item.quoteData as { output?: { decision?: { flags?: unknown } } } | null)?.output;
  const flags = output?.decision?.flags;
  return Array.isArray(flags) && flags.includes("HOLD");
}

export type RecommendedOfferTotal<T extends OfferItemForTotal> = {
  /** Sum of the included lines' prices, paise. */
  totalPaise: number;
  included: T[];
  held: T[];
  unpriced: T[];
  /** Every line priced and at least one included. */
  canPresent: boolean;
};

export function recommendedOfferTotal<T extends OfferItemForTotal>(items: readonly T[]): RecommendedOfferTotal<T> {
  const held = items.filter((i) => isHeldItem(i));
  const included = items.filter((i) => !isHeldItem(i));
  const unpriced = items.filter((i) => i.unitPricePaise === null || i.linePricePaise === null);
  const totalPaise = included.reduce((sum, i) => sum + (i.linePricePaise ?? 0), 0);
  return { totalPaise, included, held, unpriced, canPresent: unpriced.length === 0 && included.length > 0 };
}

