// ─── Mock Offer ──────────────────────────────────────────────────────────────
// Used by /offer and /offer-breakdown screens.
// NOT connected to the decision engine — that is Phase 3 work.
// Replace this with a real DB read when the offer pipeline is live.

export const mockOffer = {
  pathway: "Refurbishment" as const,
  estimatedPrice: 5140,
  rationale: [
    "Battery health is suitable for refurbishment",
    "Recovery pathway selected based on chemistry profile",
    "Low logistics cost due to proximity",
  ],

  // Breakdown figures used on /offer-breakdown
  breakdown: {
    baseValue: 6200,
    recoveryBonus: 480,
    transport: -890,
    hazardDeduction: -650,
    // Final = baseValue + recoveryBonus + transport + hazardDeduction = 5140
    finalEstimate: 5140,
  },
} as const;

export type MockOffer = typeof mockOffer;
