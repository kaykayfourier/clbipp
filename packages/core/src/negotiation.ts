/**
 * Re-offering after a decline (AF5 · FD24, 2026-10-24).
 *
 * FD24 (ours, provisional): a decline is not final — the vendor may press it by
 * mistake, or want more. The agent may re-offer up to an admin-set BAND above
 * the SANCTIONED price; above it, the office sets a new price (FD23). Every
 * round is recorded in `offer_rounds`. The vendor's Accept is the confirmation
 * and an accepted price stays fixed (FD7). The vendor never sees the engine's
 * or the office's figures.
 *
 * Pure: no Prisma import. `getNegotiationBandBp` takes the client as an
 * argument so this file stays importable anywhere.
 *
 *     import { checkReoffer } from "@clbipp/core/negotiation"
 */

import { formatPaise, isStorablePaise } from "./documents";

/** The band an admin may set on /config: 0–50%. */
export const NEGOTIATION_BAND_MAX_BP = 5000;
/** FD24's decided default, and what the migration seeds. */
export const DEFAULT_NEGOTIATION_BAND_BP = 1000;

/**
 * What the agent negotiates from: the office's latest price when there is one,
 * else the engine's recommendation.
 */
export function sanctionedPricePaise({
  enginePaise,
  officePricePaise,
}: {
  enginePaise: number;
  officePricePaise: number | null | undefined;
}): number {
  return officePricePaise ?? enginePaise;
}

/** Highest price the agent may offer alone. Integer paise, rounded down. */
export function reofferCeilingPaise(sanctionedPaise: number, bandBp: number): number {
  const band = Math.min(Math.max(Math.trunc(bandBp), 0), NEGOTIATION_BAND_MAX_BP);
  return Math.floor((sanctionedPaise * (10_000 + band)) / 10_000);
}

export type ReofferCheck = { ok: true } | { ok: false; error: string };

export function checkReoffer({
  pricePaise,
  currentPaise,
  sanctionedPaise,
  bandBp,
}: {
  pricePaise: number;
  /** What the vendor is looking at now. A re-offer must change it. */
  currentPaise: number;
  sanctionedPaise: number;
  bandBp: number;
}): ReofferCheck {
  if (!Number.isInteger(pricePaise) || pricePaise <= 0) {
    return { ok: false, error: "Enter the new price in rupees, greater than zero." };
  }
  if (!isStorablePaise(pricePaise)) return { ok: false, error: "That price is too large. Check the amount." };
  if (pricePaise === currentPaise) return { ok: false, error: "That is the price the vendor already has." };
  const ceiling = reofferCeilingPaise(sanctionedPaise, bandBp);
  if (pricePaise > ceiling) {
    return {
      ok: false,
      error: `That is above what you can offer (${formatPaise(ceiling)}). Call the office to set a new price.`,
    };
  }
  return { ok: true };
}

/** Basis points → "10%" / "12.5%". */
export function formatBandBp(bp: number): string {
  const pct = bp / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/**
 * The live band. 🔴 A missing row FAILS CLOSED to 0% — every change then goes
 * through the office — never a silent default that lets agents move prices.
 */
export async function getNegotiationBandBp(db: {
  opsSettings: { findUnique(args: { where: { id: string }; select: { negotiationBandBp: true } }): Promise<{ negotiationBandBp: number } | null> };
}): Promise<number> {
  const row = await db.opsSettings.findUnique({ where: { id: "default" }, select: { negotiationBandBp: true } });
  if (!row) return 0;
  return Math.min(Math.max(row.negotiationBandBp, 0), NEGOTIATION_BAND_MAX_BP);
}
