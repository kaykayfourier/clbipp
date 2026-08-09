/**
 * Shared helpers for the per-pathway economics layer.
 *
 * `resolveCost` handles the lump-sum vs component-rate ambiguity (spec §4.6).
 */

import type { CostInput } from "../../types";

/**
 * Resolve a CostInput to a final ₹ amount.
 *
 * Lump-sum: use directly.
 * Component: multiply rate by the unit basis (typically weight_kg).
 */
export function resolveCost(input: CostInput, unit_basis: number): number {
  if (input.mode === "lump_sum") return input.amount;
  return input.rate * unit_basis;
}
