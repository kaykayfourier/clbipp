// ⚠ WORKAROUND (Batch 6, Ali — 2026-08-23). packages/core's real agent-fee.ts
// (Batch 4's rule, owned by the commercial team per the schema's own comment
// on Pickup.agentFeePaise) isn't available in this build. This is a flat
// placeholder — kept in ONE place so the amount shown on /collect and the
// amount actually written by ./actions.ts can never drift apart, the same
// discipline as job-nav.ts's "don't re-declare the stage list" rule.
// TODO: replace with the real per-pathway/per-weight rule once packages/core
// ships it.
export const AGENT_FEE_BASE_PAISE = 15_000 // ₹150
export const AGENT_FEE_PER_ITEM_PAISE = 2_000 // ₹20/item

export function computeAgentFeePaise(itemCount: number): number {
  return AGENT_FEE_BASE_PAISE + AGENT_FEE_PER_ITEM_PAISE * itemCount
}
