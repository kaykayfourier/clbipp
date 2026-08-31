import { describe, expect, it } from "vitest";

import { classifyEscalation, type EscalationInput } from "./exception-classify";

const base: EscalationInput = {
  flags: [],
  eligiblePathways: ["RECYCLE"],
  rationale: "Recycle wins on net value.",
  netValue: 1200,
};

describe("classifyEscalation", () => {
  describe("kind", () => {
    it("is `hold` when the engine raised HOLD", () => {
      expect(classifyEscalation({ ...base, flags: ["HOLD"] }).kind).toBe("hold");
    });

    it("is `review` when it did not", () => {
      expect(classifyEscalation({ ...base, flags: ["REVIEW"] }).kind).toBe(
        "review"
      );
    });

    // Both enum values in schema.prisma are covered above; nothing else is a
    // legal ExceptionKind, so an unknown flag must still land on one of them.
    it("falls back to `review` for a flag it does not know", () => {
      expect(classifyEscalation({ ...base, flags: ["SOMETHING_NEW"] }).kind).toBe(
        "review"
      );
    });
  });

  describe("cause — most specific flag wins", () => {
    it("prefers unknown_chemistry over everything", () => {
      const out = classifyEscalation({
        ...base,
        flags: ["HOLD", "RETEST_SOH", "UNKNOWN_CHEMISTRY"],
        eligiblePathways: [],
      });
      expect(out.cause).toBe("unknown_chemistry");
      // …but the kind still reflects that this was a HOLD.
      expect(out.kind).toBe("hold");
    });

    it("prefers retest_soh over the HOLD sub-causes", () => {
      expect(
        classifyEscalation({
          ...base,
          flags: ["HOLD", "RETEST_SOH"],
          eligiblePathways: [],
        }).cause
      ).toBe("retest_soh");
    });

    it("distinguishes no_eligible_pathway from negative_net_value", () => {
      // selection.ts raises HOLD both ways; an admin needs to tell them apart.
      expect(
        classifyEscalation({ ...base, flags: ["HOLD"], eligiblePathways: [] })
          .cause
      ).toBe("no_eligible_pathway");

      expect(
        classifyEscalation({
          ...base,
          flags: ["HOLD"],
          eligiblePathways: ["RECYCLE"],
          netValue: -450,
        }).cause
      ).toBe("negative_net_value");
    });

    it("maps a bare REVIEW to below_hurdle_rate", () => {
      expect(classifyEscalation({ ...base, flags: ["REVIEW"] }).cause).toBe(
        "below_hurdle_rate"
      );
    });
  });

  describe("detail", () => {
    it("leads with the engine's own rationale, unmodified", () => {
      const out = classifyEscalation({
        ...base,
        flags: ["HOLD"],
        rationale: "Every pathway returns a negative net value.",
        netValue: -450.5,
      });
      expect(out.detail).toContain("Every pathway returns a negative net value.");
      expect(out.detail.startsWith("Every pathway")).toBe(true);
    });

    it("carries the net value to two decimals when there is one", () => {
      expect(
        classifyEscalation({ ...base, flags: ["HOLD"], netValue: -450.5 }).detail
      ).toContain("Net value -450.50 at assessment.");
    });

    it("omits the net-value sentence when there is none", () => {
      const out = classifyEscalation({
        ...base,
        flags: ["HOLD"],
        netValue: null,
      });
      expect(out.detail).not.toContain("Net value");
      expect(out.detail).toContain("Escalated from the field");
    });

    it("records that a person escalated it, not the engine", () => {
      // The board must not read as if the engine filed this itself — the whole
      // point of escalate-only is that an agent asked for a human look.
      expect(classifyEscalation({ ...base, flags: ["HOLD"] }).detail).toContain(
        "Escalated from the field by the assessing agent."
      );
    });
  });

  describe("defensive", () => {
    it("survives a missing flags array", () => {
      const out = classifyEscalation({
        ...base,
        flags: undefined as unknown as string[],
      });
      expect(out.kind).toBe("review");
      expect(out.cause).toBe("below_hurdle_rate");
    });

    it("survives a missing eligiblePathways array on a HOLD", () => {
      expect(
        classifyEscalation({
          ...base,
          flags: ["HOLD"],
          eligiblePathways: undefined as unknown as string[],
        }).cause
      ).toBe("no_eligible_pathway");
    });
  });
});
