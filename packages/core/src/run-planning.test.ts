import { describe, expect, it } from "vitest";

import {
    orderStops,
    runNumber,
    runStopEligibility,
    slotTimes,
    spreadKm,
    stopDateKey,
    suggestRunGroups,
    type RunCandidate,
    type StopFacts,
} from "./run-planning";

// Real Delhi NCR points, so the distances are the ones a dispatcher would see.
const KALKAJI = { lat: 28.5494, lng: 77.2588 };
const NEHRU_PLACE = { lat: 28.5485, lng: 77.2513 }; // ~0.7 km from Kalkaji
const OKHLA = { lat: 28.5355, lng: 77.2733 }; // ~2 km from Kalkaji
const BHIWADI = { lat: 28.2104, lng: 76.8606 }; // ~55 km away
const MANESAR = { lat: 28.3515, lng: 76.9428 };

function c(id: string, dateKey: string | null, at: { lat: number; lng: number } | null, city = "New Delhi"): RunCandidate {
    return { id, dateKey, city, lat: at?.lat ?? null, lng: at?.lng ?? null };
}

describe("suggestRunGroups", () => {
    it("groups same-day pickups within the radius and leaves a distant one out", () => {
        const groups = suggestRunGroups([
            c("A", "2026-09-27", KALKAJI),
            c("B", "2026-09-27", NEHRU_PLACE),
            c("C", "2026-09-27", BHIWADI, "Bhiwadi"),
        ]);
        expect(groups).toHaveLength(1);
        expect(new Set(groups[0].pickupIds)).toEqual(new Set(["A", "B"]));
        expect(groups[0].basis).toBe("distance");
        expect(groups[0].spreadKm).toBeLessThan(2);
    });

    it("🔴 never groups across dates, however close", () => {
        const groups = suggestRunGroups([c("A", "2026-09-27", KALKAJI), c("B", "2026-09-28", NEHRU_PLACE)]);
        expect(groups).toEqual([]);
    });

    it("links transitively — A near B near C is one run", () => {
        const groups = suggestRunGroups([
            c("A", "2026-09-27", NEHRU_PLACE),
            c("B", "2026-09-27", KALKAJI),
            c("C", "2026-09-27", OKHLA),
        ], { radiusKm: 2.5 });
        expect(groups).toHaveLength(1);
        expect(groups[0].pickupIds).toHaveLength(3);
    });

    it("falls back to the city for pickups with no coordinates, and says so", () => {
        const groups = suggestRunGroups([
            c("A", "2026-09-27", null, "Gurugram"),
            c("B", "2026-09-27", null, "gurugram "),
            c("C", "2026-09-27", null, "Noida"),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].basis).toBe("city");
        expect(groups[0].spreadKm).toBeNull();
    });

    it("ignores pickups with no date — there is no day to group them on", () => {
        expect(suggestRunGroups([c("A", null, KALKAJI), c("B", null, NEHRU_PLACE)])).toEqual([]);
    });

    it("splits an oversized cluster so every suggestion is buildable", () => {
        const many = Array.from({ length: 10 }, (_, i) =>
            c(`P${i}`, "2026-09-27", { lat: KALKAJI.lat + i * 0.001, lng: KALKAJI.lng }),
        );
        const groups = suggestRunGroups(many, { maxStops: 4 });
        expect(groups.every((g) => g.pickupIds.length <= 4 && g.pickupIds.length >= 2)).toBe(true);
        expect(groups.flatMap((g) => g.pickupIds)).toHaveLength(10);
    });

    it("orders groups by date, then biggest first", () => {
        const groups = suggestRunGroups([
            c("A", "2026-09-28", KALKAJI),
            c("B", "2026-09-28", NEHRU_PLACE),
            c("C", "2026-09-27", MANESAR, "Manesar"),
            c("D", "2026-09-27", { lat: MANESAR.lat + 0.01, lng: MANESAR.lng }, "Manesar"),
        ]);
        expect(groups.map((g) => g.dateKey)).toEqual(["2026-09-27", "2026-09-28"]);
    });
});

describe("orderStops", () => {
    it("walks nearest-neighbour from the start point", () => {
        const stops = [
            { id: "far", ...BHIWADI },
            { id: "near", ...NEHRU_PLACE },
            { id: "mid", ...OKHLA },
        ];
        const ordered = orderStops(stops, KALKAJI).map((s) => s.id);
        expect(ordered).toEqual(["near", "mid", "far"]);
    });

    it("keeps an unlocated stop on the run, at the end", () => {
        const ordered = orderStops([
            { id: "x", lat: null, lng: null },
            { id: "a", ...KALKAJI },
        ]).map((s) => s.id);
        expect(ordered).toEqual(["a", "x"]);
    });

    it("returns input order when nothing is located", () => {
        const stops = [
            { id: "1", lat: null, lng: null },
            { id: "2", lat: null, lng: null },
        ];
        expect(orderStops(stops).map((s) => s.id)).toEqual(["1", "2"]);
    });
});

describe("helpers", () => {
    it("spreadKm needs two located points", () => {
        expect(spreadKm([KALKAJI])).toBeNull();
        expect(spreadKm([KALKAJI, BHIWADI])).toBeGreaterThan(40);
    });

    it("slotTimes spaces stops evenly", () => {
        const start = new Date("2026-09-27T04:30:00Z");
        const slots = slotTimes(start, 3, 45);
        expect(slots.map((d) => d.toISOString())).toEqual([
            "2026-09-27T04:30:00.000Z",
            "2026-09-27T05:15:00.000Z",
            "2026-09-27T06:00:00.000Z",
        ]);
    });

    it("runNumber reads the calendar date of a @db.Date, not the local one", () => {
        const n = runNumber({ runId: "ab12cd34-0000-4000-8000-000000000000", runDate: new Date("2026-09-27T00:00:00Z") });
        expect(n).toBe("RUN-20260927-AB12");
    });
});


describe("runStopEligibility", () => {
    const TODAY = "2026-09-27";
    const RUN = { agentId: "ravi", dateKey: TODAY, todayKey: TODAY };
    const facts = (over: Partial<StopFacts>): StopFacts => ({
        status: "requested",
        agentId: null,
        agentName: null,
        offerAccepted: false,
        preferredDateKey: TODAY,
        scheduledDateKey: null,
        collectionDateKey: null,
        openRunNo: null,
        ...over,
    });

    it("a request joins any run and is assigned by it", () => {
        expect(runStopEligibility(facts({}), RUN)).toEqual({ ok: true, assigns: true });
        // …even with a preferred date on another day: the dispatcher decides.
        expect(runStopEligibility(facts({ preferredDateKey: "2026-09-30" }), RUN).ok).toBe(true);
    });

    it("🔴 a stale agent on a request (fixture 8) does not block it", () => {
        expect(runStopEligibility(facts({ agentId: "someone-else" }), RUN)).toEqual({ ok: true, assigns: true });
    });

    it("refuses a job already on another open run", () => {
        const r = runStopEligibility(facts({ openRunNo: "RUN-20260927-AB12" }), RUN);
        expect(r).toEqual({ ok: false, reason: "Already a stop on RUN-20260927-AB12" });
    });

    it("takes a scheduled job only for its own agent, on its own day", () => {
        const scheduled = facts({ status: "scheduled", agentId: "ravi", scheduledDateKey: TODAY });
        expect(runStopEligibility(scheduled, RUN)).toEqual({ ok: true, assigns: false });
        expect(runStopEligibility({ ...scheduled, agentId: "sunita", agentName: "Sunita" }, RUN)).toEqual({
            ok: false,
            reason: "Assigned to Sunita",
        });
        expect(runStopEligibility({ ...scheduled, scheduledDateKey: "2026-09-29" }, RUN).ok).toBe(false);
    });

    it("takes an accepted collection on its booked day — or today when none was booked", () => {
        const offered = facts({ status: "offered", agentId: "ravi", offerAccepted: true });
        expect(runStopEligibility(offered, RUN).ok).toBe(true);
        expect(runStopEligibility({ ...offered, collectionDateKey: "2026-10-02" }, RUN)).toEqual({
            ok: false,
            reason: "Collection booked for 2026-10-02",
        });
        expect(
            runStopEligibility({ ...offered, collectionDateKey: "2026-10-02" }, { ...RUN, dateKey: "2026-10-02" }).ok,
        ).toBe(true);
    });

    it("refuses an offer the vendor has not accepted, and a visit in progress", () => {
        expect(runStopEligibility(facts({ status: "offered", agentId: "ravi" }), RUN).ok).toBe(false);
        expect(runStopEligibility(facts({ status: "arrived", agentId: "ravi" }), RUN).ok).toBe(false);
        expect(runStopEligibility(facts({ status: "collected", agentId: "ravi" }), RUN).ok).toBe(false);
    });

    it("stopDateKey reads the date each state is actually waiting on", () => {
        expect(stopDateKey(facts({ preferredDateKey: "2026-09-28" }), TODAY)).toBe("2026-09-28");
        expect(stopDateKey(facts({ status: "scheduled", scheduledDateKey: "2026-09-29" }), TODAY)).toBe("2026-09-29");
        expect(stopDateKey(facts({ status: "offered", offerAccepted: true }), TODAY)).toBe(TODAY);
        expect(stopDateKey(facts({ status: "offered" }), TODAY)).toBeNull();
    });
});
