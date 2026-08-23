import * as React from "react";

import { Card } from "./card";
import { StatusBadge } from "./badge";
import { Timeline, Connector } from "./timeline";
import { isLifecycleStage } from "../../tokens";
import type { LifecycleStage } from "../../tokens";

// ─── Shared lifecycle presentation ───────────────────────────────────────────
// Extracted in Batch 10. `/track/[id]` (authenticated) and `/t/[token]`
// (public, token-scoped) render the same lifecycle to two different audiences,
// and until now they did it with ~120 lines of duplicated JSX each. The public
// page fell behind the authenticated one three separate times.
//
// This is the same fix Batch 7A applied to the stage array itself: both screens
// used to carry a private copy of LIFECYCLE_STAGES, and a stage added to
// tokens.ts but not to those copies would have rendered a timeline the screens
// then failed to switch on. Duplicated presentation is the same hazard, one
// layer up.
//
// What is deliberately NOT shared, and stays in the two pages: the status
// buckets themselves (their banner copy genuinely differs — one addresses the
// customer, one addresses a stranger holding a link), the partner card, the
// realtime subscription, and every auth-only call to action. See the isolation
// note in t/[token]/page.tsx before moving any of those in here.

// ─── buildStages ─────────────────────────────────────────────────────────────

/** The minimum a status event needs for the timeline. */
export interface LifecycleEvent {
  status: string;
  occurredAt: Date;
}

/**
 * StatusEvent rows → the `stages` map `Timeline` renders timestamps from.
 *
 * Non-lifecycle statuses (`cancelled`, and anything unrecognised) are skipped
 * rather than coerced, via `isLifecycleStage` — the same narrowing both track
 * screens already used.
 *
 * ⚠ FIRST WRITE WINS, and that is load-bearing as of Batch 5b. A stage can now
 * legitimately have more than one event: the vendor accepting an offer (D7)
 * writes a second `offered` row, because the acceptance advances nothing — it
 * stamps `Offer.acceptedAt` and leaves the status where it was. Last-wins would
 * have relabelled the timeline's "Offered" with the date it was ACCEPTED, which
 * is a different fact.
 *
 * The rule generalises: a timeline entry answers "when did this pickup first
 * reach this stage", so the earliest event is always the right answer. Callers
 * pass events ordered by `occurredAt` ascending.
 */
export function buildStages(
  events: LifecycleEvent[],
): Partial<Record<LifecycleStage, { timestamp: string }>> {
  const map: Partial<Record<LifecycleStage, { timestamp: string }>> = {};
  for (const event of events) {
    if (isLifecycleStage(event.status) && !map[event.status]) {
      map[event.status] = {
        timestamp: new Date(event.occurredAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      };
    }
  }
  return map;
}

// ─── LifecycleHeader ─────────────────────────────────────────────────────────

export function LifecycleHeader({ status }: { status: LifecycleStage }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
        Lifecycle
      </p>
      <StatusBadge status={status} />
    </div>
  );
}

// ─── RecoverySummary ─────────────────────────────────────────────────────────

/**
 * One recovered material. Structurally typed rather than imported from
 * `@clbipp/core` — this package does not depend on core, and both callers
 * already produce exactly this shape via core's `parseMaterialWeights`.
 *
 * ⚠ WEIGHT ONLY. `Offer.materialBreakdown` also carries a `value_paise` per
 * line; the locked rule forbids rendering material-by-material ₹ to the vendor,
 * and the way this component enforces it is by having nowhere to put it. Do not
 * add a value field here.
 */
export interface RecoveredMaterialWeight {
  material: string;
  weightKg: number;
}

export function RecoverySummary({
  materials,
}: {
  materials: RecoveredMaterialWeight[];
}) {
  const totalKg =
    materials.length > 0
      ? materials.reduce((sum, item) => sum + (item.weightKg ?? 0), 0)
      : null;

  return (
    <Card>
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-secondary">
        Recovery summary
      </p>
      <div className="inline-flex flex-col rounded-lg border border-border px-4 py-3">
        <span className="text-2xl font-bold text-text-primary">
          {totalKg !== null ? `${totalKg} kg` : "—"}
        </span>
        <span className="mt-0.5 text-xs text-text-secondary">
          {totalKg !== null ? "Recovered" : "Pending finalisation"}
        </span>
      </div>
      {materials.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-text-primary">
            View material breakdown
          </summary>
          <ul className="mt-3 flex flex-col">
            {materials.map((item) => (
              <li
                key={item.material}
                className="flex justify-between border-t border-border py-2 text-sm"
              >
                <span className="text-text-secondary">{item.material}</span>
                <span className="font-medium text-text-primary">
                  {item.weightKg} kg
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// ─── CancelledTimeline ───────────────────────────────────────────────────────

/**
 * The terminal card for a cancelled pickup: the timeline up to the last stage
 * that actually happened, then a red X row.
 *
 * `lastStage` is the last recorded LIFECYCLE event, not the pickup's status —
 * `cancelled` is a side-state, not a point on the line, which is also why
 * `isStageBefore` returns false for it.
 */
export function CancelledTimeline({
  lastStage,
  stages,
}: {
  lastStage: LifecycleStage;
  stages: Partial<Record<LifecycleStage, { timestamp: string }>>;
}) {
  return (
    // overflow-visible: Card's default overflow-hidden clips the timeline's
    // animate-ping glow.
    <Card className="overflow-visible">
      <Timeline currentStage={lastStage} stages={stages} />
      <Connector completed={false} />
      <div className="flex items-start gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-error">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M3 3l4 4M7 3l-4 4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="min-h-[1.75rem] flex-1 pb-0.5">
          <span className="block text-sm font-semibold leading-tight text-error">
            Cancelled
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * The last stage a pickup actually reached, for `CancelledTimeline`. Falls back
 * to `requested` so the timeline always renders, even for a pickup cancelled
 * before any event was recorded.
 */
export function lastRecordedStage(events: LifecycleEvent[]): LifecycleStage {
  const last = [...events].reverse().find((e) => isLifecycleStage(e.status));
  return (last?.status ?? "requested") as LifecycleStage;
}
