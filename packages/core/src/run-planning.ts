// ─── Same-day collection runs (FV11 · FD16) ──────────────────────────────────
// Feedback §4.3: "Admin Dispatch should eventually support grouping
// geographically nearby pickups scheduled for the same day into one collection
// run." Select compatible nearby pickups → one agent → one vehicle → one box.
//
// 🔴 DECISION SUPPORT, NEVER AUTOMATION. This module SUGGESTS groups and a stop
// order; a dispatcher builds the run and chooses the agent. Nothing here
// assigns anyone — FV8's rule ("don't automatically assign the agent") applies
// to runs exactly as it does to single pickups.
//
// ⚠ "Nearby" is straight-line (haversine), the same honesty FV8's selector
// keeps: travel time is a routing service we do not have. And the stop order
// is a nearest-neighbour SUGGESTION, not route optimisation — the screens say
// so wherever it is shown.
//
// Pure: no Prisma, no I/O, no timezone. The caller supplies date KEYS
// ("YYYY-MM-DD", already in IST) so this file never decides what "today" is.

import { haversineKm } from "./dispatch-ranking";

/** Two pickups within this straight-line distance can share a run. A van in
 *  city traffic covers ~8 km between stops in well under an hour. */
export const RUN_RADIUS_KM = 8;

/** More stops than this and the day stops being one van's day. */
export const MAX_RUN_STOPS = 8;

/** Default spacing between suggested stop slots. */
export const DEFAULT_STOP_GAP_MINUTES = 60;

export type RunCandidate = {
    id: string;
    /** The date this pickup is waiting on — preferred date, or booked collection. */
    dateKey: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
};

export type RunGroup = {
    dateKey: string;
    /** In suggested stop order. */
    pickupIds: string[];
    /** How nearness was judged: coordinates, or the city fallback. */
    basis: "distance" | "city";
    /** Widest pairwise straight-line distance in the group, when known. */
    spreadKm: number | null;
};

function hasCoords<T extends { lat: number | null; lng: number | null }>(
    p: T,
): p is T & { lat: number; lng: number } {
    return p.lat !== null && p.lng !== null && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/** Widest pairwise distance, or null when fewer than two points have coordinates. */
export function spreadKm(points: readonly { lat: number | null; lng: number | null }[]): number | null {
    const located = points.filter(hasCoords);
    if (located.length < 2) return null;
    let widest = 0;
    for (let i = 0; i < located.length; i += 1) {
        for (let j = i + 1; j < located.length; j += 1) {
            widest = Math.max(widest, haversineKm(located[i], located[j]));
        }
    }
    return widest;
}

/**
 * Suggested stop order: nearest-neighbour from `start` (the depot, say) or,
 * without one, from the first stop that has coordinates. Stops with no
 * coordinates keep their input order and go LAST — they are still on the run,
 * we just cannot say where they fit.
 */
export function orderStops<T extends { id: string; lat: number | null; lng: number | null }>(
    stops: readonly T[],
    start: { lat: number; lng: number } | null = null,
): T[] {
    const located = stops.filter(hasCoords);
    const unlocated = stops.filter((s) => !hasCoords(s));
    if (located.length === 0) return [...stops];

    const remaining = [...located];
    const ordered: T[] = [];
    let here: { lat: number; lng: number } = start ?? remaining[0];

    while (remaining.length > 0) {
        let best = 0;
        let bestKm = Infinity;
        for (let i = 0; i < remaining.length; i += 1) {
            const km = haversineKm(here, remaining[i]);
            if (km < bestKm) {
                bestKm = km;
                best = i;
            }
        }
        const [next] = remaining.splice(best, 1);
        ordered.push(next);
        here = next;
    }
    return [...ordered, ...unlocated];
}

/**
 * Group candidates into suggested runs: same date, and either within
 * `radiusKm` of each other (single-linkage — A near B near C is one run) or,
 * for pickups with no coordinates, in the same city.
 *
 * Only groups of two or more are returned: a "run" of one is just a pickup.
 * A cluster bigger than `maxStops` is split in stop order, so every suggestion
 * is buildable as-is.
 */
export function suggestRunGroups(
    candidates: readonly RunCandidate[],
    opts: { radiusKm?: number; maxStops?: number } = {},
): RunGroup[] {
    const radiusKm = opts.radiusKm ?? RUN_RADIUS_KM;
    const maxStops = opts.maxStops ?? MAX_RUN_STOPS;

    const byDate = new Map<string, RunCandidate[]>();
    for (const c of candidates) {
        if (!c.dateKey) continue;
        const list = byDate.get(c.dateKey) ?? [];
        list.push(c);
        byDate.set(c.dateKey, list);
    }

    const groups: RunGroup[] = [];

    for (const [dateKey, list] of byDate) {
        // ── Located pickups: connected components under the radius ──────────
        const located = list.filter(hasCoords);
        const parent = located.map((_, i) => i);
        const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        for (let i = 0; i < located.length; i += 1) {
            for (let j = i + 1; j < located.length; j += 1) {
                if (haversineKm(located[i], located[j]) <= radiusKm) parent[find(i)] = find(j);
            }
        }
        const components = new Map<number, RunCandidate[]>();
        located.forEach((c, i) => {
            const root = find(i);
            const comp = components.get(root) ?? [];
            comp.push(c);
            components.set(root, comp);
        });
        for (const comp of components.values()) {
            if (comp.length < 2) continue;
            const ordered = orderStops(comp);
            for (let k = 0; k < ordered.length; k += maxStops) {
                const chunk = ordered.slice(k, k + maxStops);
                if (chunk.length < 2) continue;
                groups.push({
                    dateKey,
                    pickupIds: chunk.map((c) => c.id),
                    basis: "distance",
                    spreadKm: spreadKm(chunk),
                });
            }
        }

        // ── Unlocated pickups: the city fallback ───────────────────────────
        const byCity = new Map<string, RunCandidate[]>();
        for (const c of list) {
            if (hasCoords(c) || !c.city) continue;
            const key = c.city.trim().toLowerCase();
            const cityList = byCity.get(key) ?? [];
            cityList.push(c);
            byCity.set(key, cityList);
        }
        for (const cityList of byCity.values()) {
            for (let k = 0; k < cityList.length; k += maxStops) {
                const chunk = cityList.slice(k, k + maxStops);
                if (chunk.length < 2) continue;
                groups.push({ dateKey, pickupIds: chunk.map((c) => c.id), basis: "city", spreadKm: null });
            }
        }
    }

    return groups.sort((a, b) =>
        a.dateKey !== b.dateKey ? a.dateKey.localeCompare(b.dateKey) : b.pickupIds.length - a.pickupIds.length,
    );
}

/** Suggested slot for each stop: `start`, then every `gapMinutes`. */
export function slotTimes(start: Date, count: number, gapMinutes: number = DEFAULT_STOP_GAP_MINUTES): Date[] {
    return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * gapMinutes * 60_000));
}

/**
 * `RUN-YYYYMMDD-XXXX` from the run's own id and date — the same "derive the
 * number from the id" approach as `manifestNumber()`, so the caller generates
 * the uuid and retries on the (rare) unique collision.
 */
export function runNumber(input: { runId: string; runDate: Date }): string {
    const d = input.runDate;
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    return `RUN-${key}-${input.runId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export const RUN_STATUS_LABELS: Record<"planned" | "in_progress" | "completed" | "cancelled", string> = {
    planned: "Planned",
    in_progress: "On the road",
    completed: "Completed",
    cancelled: "Cancelled",
};

// ─── Which pickups may be a stop on a run ────────────────────────────────────
// Shared by the run builder (which greys ineligible rows out and says why) and
// `createCollectionRun` (which refuses them) — so the screen and the write can
// never disagree. A run is one agent's one day, so the rule is about WHO the
// job already belongs to and WHICH DAY it is already committed to.

export type StopFacts = {
    status: string;
    agentId: string | null;
    agentName: string | null;
    /** Offer.acceptedAt is set. Only meaningful at `offered`. */
    offerAccepted: boolean;
    /** IST keys ("YYYY-MM-DD") of the three dates a job can be waiting on. */
    preferredDateKey: string | null;
    scheduledDateKey: string | null;
    collectionDateKey: string | null;
    /** Set when the pickup is already a stop on ANOTHER open run. */
    openRunNo: string | null;
};

export type StopEligibility =
    | { ok: true; /** True for a `requested` stop: building the run assigns it. */ assigns: boolean }
    | { ok: false; reason: string };

/** The date a job is waiting on — what "same day" is judged against. */
export function stopDateKey(facts: StopFacts, todayKey: string): string | null {
    if (facts.status === "requested") return facts.preferredDateKey;
    if (facts.status === "scheduled") return facts.scheduledDateKey;
    if (facts.status === "offered" && facts.offerAccepted) return facts.collectionDateKey ?? todayKey;
    return null;
}

export function runStopEligibility(
    facts: StopFacts,
    run: { agentId: string | null; dateKey: string; todayKey: string },
): StopEligibility {
    if (facts.openRunNo) return { ok: false, reason: `Already a stop on ${facts.openRunNo}` };

    switch (facts.status) {
        case "requested":
            // Needs an agent — building the run assigns it to the run's agent.
            // (A stale agentId from a cancelled-and-rebooked pickup, seed
            // fixture 8, is overwritten exactly as /dispatch overwrites it.)
            return { ok: true, assigns: true };

        case "scheduled": {
            if (run.agentId && facts.agentId !== run.agentId) {
                return { ok: false, reason: `Assigned to ${facts.agentName ?? "another agent"}` };
            }
            if (facts.scheduledDateKey !== run.dateKey) {
                return { ok: false, reason: `Scheduled for ${facts.scheduledDateKey ?? "another day"}` };
            }
            return { ok: true, assigns: false };
        }

        case "offered": {
            if (!facts.offerAccepted) return { ok: false, reason: "Waiting on the vendor's decision" };
            if (run.agentId && facts.agentId !== run.agentId) {
                return { ok: false, reason: `Collection belongs to ${facts.agentName ?? "another agent"}` };
            }
            // Accepted with no date = "collect today" (FV3); with a date, that day.
            const due = facts.collectionDateKey ?? run.todayKey;
            if (due !== run.dateKey) return { ok: false, reason: `Collection booked for ${due}` };
            return { ok: true, assigns: false };
        }

        case "arrived":
            return { ok: false, reason: "The agent is on site now" };

        default:
            return { ok: false, reason: `Already ${facts.status}` };
    }
}
