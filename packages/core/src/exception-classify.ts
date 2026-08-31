// ─── Engine flag → ItemException classification ──────────────────────────────
//
// One place that answers "the engine flagged this line — what kind of exception
// is that, and why?". Lives here rather than in the agent screen that calls it
// because it is pure, and because the admin console is the other natural caller:
// `/exceptions` renders these `cause` values, so the vocabulary has to be
// decided once. (Convention: pure, shareable logic belongs in a package.)
//
// 🔴 `cause` is machine-readable snake_case and must stay consistent with the
// vocabulary the seed already uses (`soh_below_gate`, `damage_score_high`,
// `bms_entropy_anomaly`) — /exceptions groups on it. `detail` is the human
// sentence rendered beside it.
//
// Where the flags come from (packages/decision-engine):
//   selection.ts   no eligible pathway at all      → HOLD
//   selection.ts   winner net_value < 0            → HOLD
//   selection.ts   winner net_value < hurdle_rate  → REVIEW
//   bmsSafety.ts   BMS read implausible            → RETEST_SOH
//   sohGating.ts   chemistry not recognised        → UNKNOWN_CHEMISTRY

/** The minimal slice of a QuoteOutput this needs — deliberately not the whole
 *  shape, so an app type never has to cross into this package. */
export interface EscalationInput {
  flags: string[];
  eligiblePathways: string[];
  rationale: string;
  netValue?: number | null;
}

export interface EscalationClassification {
  /** Matches the `ExceptionKind` enum in schema.prisma. */
  kind: "hold" | "review";
  cause: string;
  detail: string;
}

export function classifyEscalation(
  input: EscalationInput
): EscalationClassification {
  const flags = input.flags ?? [];
  const isHold = flags.includes("HOLD");

  // Most specific flag wins. UNKNOWN_CHEMISTRY and RETEST_SOH each name
  // something an admin can act on directly; the HOLD sub-causes only say the
  // economics did not clear, which is less actionable on its own.
  const cause = flags.includes("UNKNOWN_CHEMISTRY")
    ? "unknown_chemistry"
    : flags.includes("RETEST_SOH")
      ? "retest_soh"
      : isHold
        ? // HOLD is raised two ways and they need different answers from an
          // admin: nothing was eligible at all, versus the winner priced out
          // negative. Same flag, different question.
          (input.eligiblePathways ?? []).length === 0
          ? "no_eligible_pathway"
          : "negative_net_value"
        : "below_hurdle_rate";

  const netValueNote =
    typeof input.netValue === "number"
      ? ` Net value ${input.netValue.toFixed(2)} at assessment.`
      : "";

  return {
    kind: isHold ? "hold" : "review",
    cause,
    // The engine's own rationale is already the human sentence this column
    // wants — don't re-word it, or the board and the agent's screen will
    // describe the same decision differently.
    detail: `${input.rationale}${netValueNote} Escalated from the field by the assessing agent.`,
  };
}
