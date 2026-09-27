import { describe, expect, it } from "vitest";

import { dispatchPriority, loadSizeOf, PRIORITY_RANK } from "./dispatch-priority";

const NOW = new Date("2026-09-27T06:00:00Z");
const TODAY = "2026-09-27";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("dispatchPriority", () => {
    it("🔴 makes a declared swollen or leaking line urgent, whatever else is true", () => {
        const r = dispatchPriority(
            { status: "scheduled", conditions: ["healthy", "leaking"], createdAt: daysAgo(0), dateKey: "2026-10-05" },
            TODAY,
            NOW,
        );
        expect(r.priority).toBe("urgent");
        expect(r.reasons[0]).toMatch(/leaking/);
    });

    it("raises a request that has waited three days", () => {
        const r = dispatchPriority(
            { status: "requested", conditions: ["healthy"], createdAt: daysAgo(3), dateKey: null },
            TODAY,
            NOW,
        );
        expect(r.priority).toBe("high");
        expect(r.reasons).toContain("Waiting 3 days for an agent");
    });

    it("does not count waiting against a job that already has an agent", () => {
        const r = dispatchPriority(
            { status: "scheduled", conditions: ["healthy"], createdAt: daysAgo(10), dateKey: "2026-10-01" },
            TODAY,
            NOW,
        );
        expect(r.priority).toBe("normal");
    });

    it("raises a job due today and one whose date has passed", () => {
        const base = { status: "requested", conditions: ["dead"], createdAt: daysAgo(0) };
        expect(dispatchPriority({ ...base, dateKey: TODAY }, TODAY, NOW).reasons).toContain("Due today");
        expect(dispatchPriority({ ...base, dateKey: "2026-09-20" }, TODAY, NOW).reasons).toContain("Its date has passed");
    });

    it("is normal with nothing pressing", () => {
        const r = dispatchPriority(
            { status: "requested", conditions: ["healthy", "dead"], createdAt: daysAgo(1), dateKey: "2026-09-30" },
            TODAY,
            NOW,
        );
        expect(r).toEqual({ priority: "normal", reasons: [] });
    });

    it("ranks urgent before high before normal", () => {
        expect(PRIORITY_RANK.urgent).toBeLessThan(PRIORITY_RANK.high);
        expect(PRIORITY_RANK.high).toBeLessThan(PRIORITY_RANK.normal);
    });
});

describe("loadSizeOf", () => {
    it("bands by declared kilograms", () => {
        expect(loadSizeOf(16.7)).toBe("small");
        expect(loadSizeOf(50)).toBe("medium");
        expect(loadSizeOf(250)).toBe("medium");
        expect(loadSizeOf(502)).toBe("large");
    });
});
