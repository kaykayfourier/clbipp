// ─── Inspection, acceptance and collection are three moments, not one ────────
// FV3 · FD0 (2026-09-12). The company's presentation feedback separates
// inspection from collection: an agent may assess today and collect next
// Tuesday, because of vehicle capacity, safety, or sheer quantity.
//
// 🔴 THIS ADDS NO LIFECYCLE STAGE. The nine stages are asserted independently in
// four places and rendered by one shared `buildStages`. "Accepted, awaiting a
// scheduled collection" is DERIVED — exactly as "pending drop-off" is derived
// from `Pickup.custodyBatchId` (D5).
//
// 🔴 THE CONSEQUENCE THIS FILE EXISTS TO CONTAIN: `offered` now carries THREE
// sub-states, not two. Before FV3 a screen had to read `Offer.acceptedAt`
// alongside the status or it would show a vendor the Accept button for an offer
// they had already accepted. Now it has to read a second timestamp too.
//
// Rather than let eight screens each do that arithmetic — which is how the
// two-state version went wrong the first time — every one of them calls
// `offerState()`. There is one definition, it is tested, and a fourth sub-state
// would be added here once instead of missed in three places.

/** How long an agent's offer stands before it has to be re-confirmed. */
export const OFFER_VALIDITY_DAYS = 7;

export type OfferState =
    /** Offer made, vendor has not decided. `Offer.acceptedAt` is null. */
    | "awaiting_vendor"
    /** Accepted, and the agent is collecting on this visit. */
    | "collect_now"
    /** Accepted, collection booked for a later date. */
    | "collection_scheduled";

export type OfferTiming = {
    state: OfferState;
    /** When the offer stops being valid. Null when there is no offer yet. */
    expiresAt: Date | null;
    /**
     * Past its validity window AND not yet accepted.
     *
     * 🔴 An ACCEPTED offer never expires, whatever the date says. The vendor
     * agreed a price and we owe them that price; re-pricing a load somebody
     * already said yes to is the behaviour this whole feedback round removed
     * from the booking screen, and it would be worse here. Expiry pressures the
     * UNDECIDED, it does not claw back the decided.
     */
    expired: boolean;
    /** Whole days remaining, floored. Negative once past. Null with no offer. */
    daysRemaining: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The one reading of an offer's state. Every screen that switches on
 * `status === 'offered'` calls this instead of comparing timestamps itself.
 *
 * Takes the three fields rather than a Pickup, so it stays callable from a
 * client component, a server action and a test without any of them holding a
 * Prisma row.
 */
export function offerState(input: {
    offerCreatedAt: Date | null | undefined;
    acceptedAt: Date | null | undefined;
    collectionScheduledAt: Date | null | undefined;
    now?: Date;
}): OfferTiming {
    const now = input.now ?? new Date();
    const accepted = input.acceptedAt != null;

    const state: OfferState = !accepted
        ? "awaiting_vendor"
        : input.collectionScheduledAt != null
          ? "collection_scheduled"
          : "collect_now";

    if (input.offerCreatedAt == null) {
        return { state, expiresAt: null, expired: false, daysRemaining: null };
    }

    const expiresAt = new Date(input.offerCreatedAt.getTime() + OFFER_VALIDITY_DAYS * DAY_MS);
    const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);

    return {
        expiresAt,
        daysRemaining,
        state,
        // Accepted offers are immune — see the note on `expired` above.
        expired: !accepted && now.getTime() > expiresAt.getTime(),
    };
}

/**
 * Is a collection booked for a later day than today?
 *
 * Compared on CALENDAR DAY, not elapsed hours: an agent who schedules a
 * collection for "tomorrow" at 9am on a Monday evening means Tuesday, and a
 * 24-hour comparison would still call that today for another fourteen hours.
 * Both dates are read in the server's zone, which for this deployment is the
 * same zone the agents work in.
 */
export function isFutureCollection(
    collectionScheduledAt: Date | null | undefined,
    now: Date = new Date(),
): boolean {
    if (collectionScheduledAt == null) return false;
    const a = new Date(collectionScheduledAt);
    const b = new Date(now);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return a.getTime() > b.getTime();
}

/**
 * How far ahead a collection may be booked.
 *
 * Not a rule the company gave us — a guard rail against a mis-typed year. Three
 * months is far longer than any real deferral and still catches "2027".
 */
export const MAX_COLLECTION_DAYS_AHEAD = 90;

export type CollectionDateError =
    | "missing"
    | "unparseable"
    | "past"
    | "too_far";

export const COLLECTION_DATE_MESSAGES: Record<CollectionDateError, string> = {
    missing: "Pick a collection date.",
    unparseable: "That date could not be read. Use the date picker.",
    past: "A collection date cannot be in the past.",
    too_far: `A collection cannot be booked more than ${MAX_COLLECTION_DAYS_AHEAD} days ahead.`,
};

/**
 * Validate the agent's chosen collection date.
 *
 * Takes "YYYY-MM-DD" and returns a Date at local midnight, matching how
 * `preferredDate` is handled at booking: kept as a plain date string to the edge
 * so a browser timezone cannot shift the chosen day backwards by one.
 *
 * TODAY IS ALLOWED. "Schedule" and "collect now" are different actions, but an
 * agent who books today's date has said something meaningful — collect later in
 * the day, after the rest of the round — and refusing it would be pedantry.
 */
export function parseCollectionDate(
    raw: string | null | undefined,
    now: Date = new Date(),
): { value: Date; error: null } | { value: null; error: CollectionDateError } {
    const text = (raw ?? "").trim();
    if (text === "") return { value: null, error: "missing" };

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return { value: null, error: "unparseable" };

    const [, y, m, d] = match;
    const value = new Date(Number(y), Number(m) - 1, Number(d));
    if (
        Number.isNaN(value.getTime()) ||
        value.getFullYear() !== Number(y) ||
        value.getMonth() !== Number(m) - 1 ||
        value.getDate() !== Number(d)
    ) {
        // Catches 2026-02-31, which the Date constructor silently rolls forward.
        return { value: null, error: "unparseable" };
    }

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (value.getTime() < today.getTime()) return { value: null, error: "past" };

    const limit = new Date(today.getTime() + MAX_COLLECTION_DAYS_AHEAD * DAY_MS);
    if (value.getTime() > limit.getTime()) return { value: null, error: "too_far" };

    return { value, error: null };
}
