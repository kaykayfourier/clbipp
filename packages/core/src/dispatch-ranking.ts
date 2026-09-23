// ─── Ranked agent selection for dispatch (FV8) ───────────────────────────────
// From the company's field-agent selection notes (docs/field agent selection.txt),
// which expand §2.2 of the presentation feedback. The complaint: "when Admin
// assigns a pickup to a field agent, the dropdown essentially just provides the
// agent's name."
//
// Three signals, in the order the notes' own flowchart puts them:
//   1. AVAILABILITY  — can they realistically take it that day?
//   2. WORKLOAD      — how much unfinished work do they already have, split
//                      into today's jobs and total live jobs?
//   3. PROXIMITY     — how far is their last known position from the pickup?
//
// 🔴 DECISION SUPPORT, NOT AUTO-ASSIGNMENT. The notes are explicit: never
// "Assign Ali", always "Ali — Available · 2 live jobs · 2.4 km away", and let
// the dispatcher choose. This module ranks and explains; it never picks.
//
// 🔴 "Live" is NOT redefined here. The notes say the statuses "should
// ultimately follow CLBIPP's existing lifecycle rather than creating a second
// definition of lifecycle just for dispatch" — so the caller passes counts
// derived from `LIVE_JOB_STATUSES` in apps/admin/src/lib/job-load.ts, which
// remains the single definition shared with /agents and the dispatch board.

export type AgentAvailability = "available" | "busy" | "unavailable";

/**
 * Why an agent is not simply "available". Shown to the dispatcher, because the
 * notes are clear that an unavailable agent should stay VISIBLE and disabled
 * rather than vanish: "That tells the admin why Ahmed isn't being recommended."
 */
export type UnavailabilityReason =
    | "not_safety_trained"
    | "at_capacity"
    | "schedule_conflict"
    | null;

/** Beyond this many jobs already booked for the target day, an agent reads as
 *  busy. Not a hard block — the notes stress the admin may legitimately
 *  override — and deliberately generous, because a full day is context, not a
 *  rule we were given. */
export const BUSY_JOBS_TODAY = 3;

/** A position older than this is still shown, but never presented as current.
 *  The notes: "a location from two hours ago shouldn't be presented as though
 *  it were live." */
export const LOCATION_STALE_MINUTES = 30;

export type AgentSignals = {
    agentId: string;
    fullName: string;
    zone: string | null;
    vehicle: string | null;
    /** Null when the agent has never completed safety training. */
    safetyTrainedAt: Date | null;
    /** Jobs in this agent's hands right now, from LIVE_JOB_STATUSES. */
    liveJobs: number;
    /** Of those, the ones scheduled for the day being dispatched. */
    jobsOnTargetDay: number;
    /** Their most recent operational position, or null if they have none. */
    lastLocation: { lat: number; lng: number; at: Date } | null;
};

export type RankedAgent = AgentSignals & {
    availability: AgentAvailability;
    reason: UnavailabilityReason;
    /** Straight-line km to the pickup. Null when either end has no coordinates. */
    distanceKm: number | null;
    /** Minutes since the last position was recorded. Null with no position. */
    locationAgeMinutes: number | null;
    locationStale: boolean;
    /** One line of decision support, exactly as the notes specify it. */
    summary: string;
};

/**
 * Straight-line distance in km (haversine).
 *
 * ⚠ Straight-line, NOT travel distance, and the UI must never imply otherwise.
 * The notes put "estimated travel time instead of straight-line distance" in
 * the later-enhancements list precisely so this does not have to be a routing
 * service on day one.
 */
export function haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Availability for one agent on the target day.
 *
 * ⚠ WHAT WE CAN HONESTLY DERIVE, AND NOTHING MORE. The notes describe off-duty
 * agents and working-hours windows; this codebase has no shift model, no
 * working hours and no duty roster, and inventing one here would be a screen
 * asserting a fact nobody recorded.
 *
 * So `unavailable` means the one thing we genuinely know: an agent with no
 * `safetyTrainedAt` cannot legally start an intake — `requireSafetyChecklist`
 * gates every intake screen in the agent app — so assigning them a pickup gives
 * them a job they cannot progress. That is "otherwise cannot take the
 * assignment" in the notes' own words.
 *
 * Shift management is on the notes' later-enhancements list. When it lands,
 * this function is where it goes.
 */
export function availabilityOf(agent: AgentSignals): {
    availability: AgentAvailability;
    reason: UnavailabilityReason;
} {
    if (agent.safetyTrainedAt === null) {
        return { availability: "unavailable", reason: "not_safety_trained" };
    }
    if (agent.jobsOnTargetDay >= BUSY_JOBS_TODAY) {
        return { availability: "busy", reason: "at_capacity" };
    }
    if (agent.jobsOnTargetDay > 0) {
        // Not a blocker — a warning. The notes: "It doesn't necessarily need to
        // block assignment. There may be legitimate reasons for an admin to
        // override it."
        return { availability: "busy", reason: "schedule_conflict" };
    }
    return { availability: "available", reason: null };
}

const AVAILABILITY_RANK: Record<AgentAvailability, number> = {
    available: 0,
    busy: 1,
    unavailable: 2,
};

export const AVAILABILITY_LABELS: Record<AgentAvailability, string> = {
    available: "Available",
    busy: "Busy",
    unavailable: "Unavailable",
};

export const REASON_LABELS: Record<NonNullable<UnavailabilityReason>, string> = {
    not_safety_trained: "No safety training on file",
    at_capacity: "Already has a full day",
    schedule_conflict: "Another job that day",
};

/**
 * Rank every agent for one pickup.
 *
 * Order, straight from the notes' flowchart: availability first, then workload,
 * then distance.
 *
 * 🔴 DISTANCE IS THE LAST TIE-BREAKER, NEVER THE FIRST SORT, and the notes call
 * out both failure modes by name. An unavailable agent must not top the list
 * because they are closest; and an agent 1.2 km away with four jobs already
 * booked must not beat one 3 km away with none.
 *
 * An agent with no known position sorts last WITHIN their availability band
 * rather than being pushed to the bottom overall — the notes are explicit that
 * a locationless agent "should still be assignable".
 */
export function rankAgents(
    agents: readonly AgentSignals[],
    pickupLocation: { lat: number; lng: number } | null,
    now: Date = new Date(),
): RankedAgent[] {
    const ranked = agents.map((agent): RankedAgent => {
        const { availability, reason } = availabilityOf(agent);

        const distanceKm =
            pickupLocation && agent.lastLocation
                ? haversineKm(agent.lastLocation, pickupLocation)
                : null;

        const locationAgeMinutes = agent.lastLocation
            ? Math.max(0, Math.round((now.getTime() - agent.lastLocation.at.getTime()) / 60000))
            : null;

        const locationStale =
            locationAgeMinutes !== null && locationAgeMinutes > LOCATION_STALE_MINUTES;

        return {
            ...agent,
            availability,
            reason,
            distanceKm,
            locationAgeMinutes,
            locationStale,
            summary: buildSummary({
                availability,
                reason,
                jobsOnTargetDay: agent.jobsOnTargetDay,
                liveJobs: agent.liveJobs,
                distanceKm,
                locationAgeMinutes,
            }),
        };
    });

    return ranked.sort((a, b) => {
        const byAvailability = AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability];
        if (byAvailability !== 0) return byAvailability;

        if (a.jobsOnTargetDay !== b.jobsOnTargetDay) return a.jobsOnTargetDay - b.jobsOnTargetDay;
        if (a.liveJobs !== b.liveJobs) return a.liveJobs - b.liveJobs;

        // Unknown distance sorts after known, inside the same band.
        if (a.distanceKm === null && b.distanceKm === null) {
            return a.fullName.localeCompare(b.fullName);
        }
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
    });
}

/**
 * The one line of decision support next to each agent.
 *
 * Deliberately says "1 job today • 3 live jobs" rather than "3 live jobs": the
 * notes make this exact point — "four jobs spread over several days are very
 * different from four jobs scheduled this afternoon."
 */
function buildSummary(input: {
    availability: AgentAvailability;
    reason: UnavailabilityReason;
    jobsOnTargetDay: number;
    liveJobs: number;
    distanceKm: number | null;
    locationAgeMinutes: number | null;
}): string {
    if (input.availability === "unavailable" && input.reason) {
        return REASON_LABELS[input.reason];
    }

    const parts = [
        `${input.jobsOnTargetDay} job${input.jobsOnTargetDay === 1 ? "" : "s"} that day`,
        `${input.liveJobs} live job${input.liveJobs === 1 ? "" : "s"}`,
    ];

    if (input.distanceKm !== null) {
        parts.push(`${formatKm(input.distanceKm)} away`);
    } else {
        // 🔴 Said plainly rather than omitted. An absent distance next to three
        // agents that have one reads as zero, not as unknown.
        parts.push("location unknown");
    }

    return parts.join(" • ");
}

export function formatKm(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
}

/** "6 min ago" / "2 h ago". Null age → the caller shows nothing at all. */
export function formatLocationAge(minutes: number): string {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.round(hours / 24)} d ago`;
}
