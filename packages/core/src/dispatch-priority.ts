// ─── Dispatch priority and load size (FV14 · FD18) ──────────────────────────
// Feedback §2.1: "Optionally filter by battery quantity/type and operational
// priority." Type is the declared category; this module supplies the other two.
//
// 🔴 PRIORITY IS DERIVED, NEVER STORED. A stored priority is a field someone
// sets once and nobody updates, and within a week it describes the day it was
// typed rather than today. Everything here is recomputed from facts the pickup
// already carries, every time the board renders.
//
// Pure: no Prisma, no timezone. The caller passes `todayKey` ("YYYY-MM-DD" in
// IST, from the admin app's lib/ist) so this file never decides what today is.

export type DispatchPriority = "urgent" | "high" | "normal";

export const PRIORITY_LABELS: Record<DispatchPriority, string> = {
    urgent: "Urgent",
    high: "High",
    normal: "Normal",
};

/** Lower sorts first. */
export const PRIORITY_RANK: Record<DispatchPriority, number> = { urgent: 0, high: 1, normal: 2 };

/** A request unassigned this long is overdue attention, not just queued. */
export const LONG_WAIT_DAYS = 3;

/** Declared conditions that make a load a hazard while it sits at the vendor's. */
const HAZARDOUS = new Set(["swollen", "leaking"]);

export function dispatchPriority(
    input: {
        status: string;
        /** Every declared condition on the pickup's lines. */
        conditions: readonly string[];
        createdAt: Date;
        /** The date the job is waiting on: booked collection, else preferred. */
        dateKey: string | null;
    },
    todayKey: string,
    now: Date = new Date(),
): { priority: DispatchPriority; reasons: string[] } {
    const reasons: string[] = [];

    // Urgent: a swollen or leaking battery is a thermal risk on somebody's
    // premises, and every day it waits is a day it can vent. Safety first,
    // whatever else is true.
    const hazards = [...new Set(input.conditions.filter((c) => HAZARDOUS.has(c)))];
    if (hazards.length > 0) {
        reasons.push(`Declared ${hazards.join(" / ")} — handle as a hazard`);
    }

    const waitedDays = Math.floor((now.getTime() - input.createdAt.getTime()) / 86_400_000);
    if (input.status === "requested" && waitedDays >= LONG_WAIT_DAYS) {
        reasons.push(`Waiting ${waitedDays} days for an agent`);
    }
    if (input.dateKey !== null) {
        if (input.dateKey < todayKey) reasons.push("Its date has passed");
        else if (input.dateKey === todayKey) reasons.push("Due today");
    }

    const priority: DispatchPriority = hazards.length > 0 ? "urgent" : reasons.length > 0 ? "high" : "normal";
    return { priority, reasons };
}

// ─── Load size ───────────────────────────────────────────────────────────────

export type LoadSize = "small" | "medium" | "large";

/** Bands by DECLARED kilograms — the only weight known before a visit. Chosen
 *  around vehicle reality: a two-wheeler run, a small-van load, and anything
 *  that needs the Tata Ace or two people. */
export const LOAD_SIZE_BANDS: Record<LoadSize, { label: string; maxKg: number }> = {
    small: { label: "Small · under 50 kg", maxKg: 50 },
    medium: { label: "Medium · 50–250 kg", maxKg: 250 },
    large: { label: "Large · over 250 kg", maxKg: Infinity },
};

export function loadSizeOf(declaredKg: number): LoadSize {
    if (declaredKg < LOAD_SIZE_BANDS.small.maxKg) return "small";
    if (declaredKg <= LOAD_SIZE_BANDS.medium.maxKg) return "medium";
    return "large";
}
