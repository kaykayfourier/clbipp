// ─── Hub check-in: what a custody batch is ready for (FV12 · FD15) ───────────
// Feedback §6 step 10: "The facility scans and reconciles the received
// batteries." A drop-off is agent-attested (there is no hub-staff app); the
// check-in is the hub's own count of what actually arrived, recorded by an
// admin on the hub's behalf — `actorRole: 'admin'`, never 'hub'.
//
// 🔴 THE GATE ON `collected → tested`. A pickup is ready to advance only when
// EVERY one of its lines has been checked in as received. One missing line
// holds the whole pickup — AD6's "every item, or not at all", one edge earlier.
// Advancing a pickup with a battery unaccounted for would put a false "tested
// at the hub" on its chain of custody.
//
// Pure: the caller reads the rows; this decides what they mean. Shared by the
// hub check-in screen, `/lifecycle`, and `advanceCustodyBatch` — so the button,
// the count and the write can never disagree.

export type CheckOutcome = "received" | "missing";

export type LineForCheck = {
    itemId: string;
    /** Null until the hub has looked at this line. */
    outcome: CheckOutcome | null;
};

export type PickupCheckState = {
    pickupId: string;
    total: number;
    received: number;
    missing: number;
    unchecked: number;
    /** 🔴 True only when every line is received — the advance gate. */
    ready: boolean;
};

export function pickupCheckState(pickupId: string, lines: readonly LineForCheck[]): PickupCheckState {
    const received = lines.filter((l) => l.outcome === "received").length;
    const missing = lines.filter((l) => l.outcome === "missing").length;
    return {
        pickupId,
        total: lines.length,
        received,
        missing,
        unchecked: lines.length - received - missing,
        // A pickup with no lines is never "ready" — that would advance an empty
        // shell on the strength of nothing (same guard as pickupCoverage).
        ready: lines.length > 0 && received === lines.length,
    };
}

export function batchCheckSummary(pickups: readonly { pickupId: string; lines: readonly LineForCheck[] }[]): {
    pickups: PickupCheckState[];
    total: number;
    received: number;
    missing: number;
    unchecked: number;
    readyPickupIds: string[];
    heldPickupIds: string[];
} {
    const states = pickups.map((p) => pickupCheckState(p.pickupId, p.lines));
    return {
        pickups: states,
        total: states.reduce((s, p) => s + p.total, 0),
        received: states.reduce((s, p) => s + p.received, 0),
        missing: states.reduce((s, p) => s + p.missing, 0),
        unchecked: states.reduce((s, p) => s + p.unchecked, 0),
        readyPickupIds: states.filter((p) => p.ready).map((p) => p.pickupId),
        heldPickupIds: states.filter((p) => !p.ready).map((p) => p.pickupId),
    };
}

/** A hand-recorded line (confirmed without a scan, or declared missing) must
 *  say why. Same floor as the admin lifecycle override and a pathway change. */
export const MIN_CUSTODY_NOTE_CHARS = 12;

export const CHECK_METHOD_LABELS: Record<"scan" | "tagged_at_hub" | "manual", string> = {
    scan: "Scanned",
    tagged_at_hub: "Tagged at the hub",
    manual: "Confirmed by hand",
};
