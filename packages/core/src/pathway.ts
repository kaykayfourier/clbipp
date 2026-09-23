// ─── Second Life vs Recycling (FV5 · FD4) ────────────────────────────────────
// The company's feedback: "the system should make the downstream pathway
// operationally clear rather than treating every collected battery as recycling
// material." Two destinations — Second Life and Recycling.
//
// 🔴 THE FOUR ENGINE PATHWAYS ARE NOT REPLACED, THEY ARE PRESENTED.
// `RecoveryPathway` stays `reuse | refurbish | recycle | dispose` in the
// database because the PRICE differs between reuse and refurbish — collapsing
// them would quietly change what a battery is worth. This module is the mapping
// from what the engine decided to what an operator is shown, and it is the only
// place that mapping exists.
//
// ⚠ `dispose` maps to Recycling, not to a third bucket. A battery too far gone
// to recover still goes to a CPCB-registered recycler for safe handling — it is
// the same physical journey with a worse yield, and giving it its own
// destination would imply a facility we do not have.

export type RecoveryDestination = "second_life" | "recycling";

export const DESTINATION_LABELS: Record<RecoveryDestination, string> = {
    second_life: "Second Life",
    recycling: "Recycling",
};

export const DESTINATION_DESCRIPTIONS: Record<RecoveryDestination, string> = {
    second_life:
        "Fit for continued use after refurbishment. Held at the facility for reuse rather than broken down.",
    recycling: "Routed to a registered recycler for material recovery.",
};

/**
 * Where an item physically goes, from the engine's verdict.
 *
 * Null in, null out: a flat-rate (non-li-ion) item never runs the engine and so
 * has no pathway of its own. It is NOT defaulted to recycling here — the caller
 * decides how to present an unrouted item, and silently inventing a destination
 * for one is how a screen ends up claiming a decision nobody made. (D1's "all
 * of it is recycled" is true of those items in practice, but it becomes true
 * when a manifest is built, not when a table is rendered.)
 */
export function destinationOf(pathway: string | null | undefined): RecoveryDestination | null {
    if (pathway === "reuse" || pathway === "refurbish") return "second_life";
    if (pathway === "recycle" || pathway === "dispose") return "recycling";
    return null;
}

/**
 * May this item be put on a recycler manifest?
 *
 * 🔴 THE ROUTING RULE, and the operational half of FD4. A second-life battery
 * on a recycler manifest is a battery about to be shredded by mistake — the
 * manifest is a legal chain-of-custody handover, not a shipping note.
 *
 * An UNROUTED item (no pathway — every flat-rate line) IS shippable: those have
 * always gone to a recycler and nothing in this feedback round changes that.
 * Only an explicit second-life verdict holds an item back.
 */
export function isShippableToRecycler(pathway: string | null | undefined): boolean {
    return destinationOf(pathway) !== "second_life";
}

/** Split a set of items by destination, for a screen that shows both. */
export function splitByDestination<T>(
    items: readonly T[],
    pathwayOf: (item: T) => string | null | undefined,
): { secondLife: T[]; recycling: T[]; unrouted: T[] } {
    const secondLife: T[] = [];
    const recycling: T[] = [];
    const unrouted: T[] = [];
    for (const item of items) {
        const destination = destinationOf(pathwayOf(item));
        if (destination === "second_life") secondLife.push(item);
        else if (destination === "recycling") recycling.push(item);
        else unrouted.push(item);
    }
    return { secondLife, recycling, unrouted };
}

/** The four values an admin may set by hand, with the destination each implies. */
export const PATHWAY_OPTIONS = [
    { value: "reuse", label: "Reuse", destination: "second_life" as const },
    { value: "refurbish", label: "Refurbish", destination: "second_life" as const },
    { value: "recycle", label: "Recycle", destination: "recycling" as const },
    { value: "dispose", label: "Dispose", destination: "recycling" as const },
] as const;

export type PathwayValue = (typeof PATHWAY_OPTIONS)[number]["value"];

export function isPathwayValue(value: unknown): value is PathwayValue {
    return PATHWAY_OPTIONS.some((o) => o.value === value);
}

/** An override needs a real reason, not a keystroke. Same floor as the admin
 *  lifecycle override, and for the same purpose: it is the only record of why
 *  the engine's verdict was set aside. */
export const MIN_PATHWAY_REASON_CHARS = 12;
