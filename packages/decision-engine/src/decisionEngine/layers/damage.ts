/**
 * Layer 1 — Physical Damage Scoring
 *
 * Damage_Score = 0.4 × Visual + 0.35 × Leakage + 0.25 × Thermal
 *
 * 0.0 – 1.5: safe for all pathways
 * 1.6 – 2.5: eligible ∩= {REFURBISH, RECYCLE}
 * > 2.5:     force RECYCLE
 *
 * Note on swelling: captured under Visual Integrity per spec.
 * AMBIGUITY: damage rubric inter-rater consistency (spec Open Q #10).
 */

import type { DamageScores, Pathway } from "../types";

const ALL: Pathway[] = ["REUSE", "REFURBISH", "RECYCLE"];

export interface DamageResult {
  damage_score: number;
  eligible: Pathway[];
}

export function computeDamageScore(d: DamageScores): number {
  return 0.4 * d.visual + 0.35 * d.leakage + 0.25 * d.thermal;
}

export function runDamageScoring(d: DamageScores): DamageResult {
  const damage_score = computeDamageScore(d);
  let eligible: Pathway[];

  if (damage_score > 2.5) {
    eligible = ["RECYCLE"];
  } else if (damage_score > 1.5) {
    eligible = ["REFURBISH", "RECYCLE"];
  } else {
    eligible = [...ALL];
  }

  return { damage_score, eligible };
}
