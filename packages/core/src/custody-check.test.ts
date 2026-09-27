import { describe, expect, it } from "vitest";

import { batchCheckSummary, pickupCheckState } from "./custody-check";

describe("pickupCheckState", () => {
    it("is ready only when every line is received", () => {
        expect(pickupCheckState("P", [{ itemId: "a", outcome: "received" }, { itemId: "b", outcome: "received" }]).ready).toBe(true);
        expect(pickupCheckState("P", [{ itemId: "a", outcome: "received" }, { itemId: "b", outcome: null }]).ready).toBe(false);
    });

    it("🔴 a single missing line holds the pickup", () => {
        const s = pickupCheckState("P", [
            { itemId: "a", outcome: "received" },
            { itemId: "b", outcome: "missing" },
        ]);
        expect(s.ready).toBe(false);
        expect(s.missing).toBe(1);
        expect(s.unchecked).toBe(0);
    });

    it("never calls an empty pickup ready", () => {
        expect(pickupCheckState("P", []).ready).toBe(false);
    });
});

describe("batchCheckSummary", () => {
    it("splits a batch into ready and held pickups and totals the lines", () => {
        const s = batchCheckSummary([
            { pickupId: "P1", lines: [{ itemId: "a", outcome: "received" }] },
            { pickupId: "P2", lines: [{ itemId: "b", outcome: "received" }, { itemId: "c", outcome: null }] },
            { pickupId: "P3", lines: [{ itemId: "d", outcome: "missing" }] },
        ]);
        expect(s.readyPickupIds).toEqual(["P1"]);
        expect(s.heldPickupIds).toEqual(["P2", "P3"]);
        expect({ total: s.total, received: s.received, missing: s.missing, unchecked: s.unchecked }).toEqual({
            total: 4,
            received: 2,
            missing: 1,
            unchecked: 1,
        });
    });
});
