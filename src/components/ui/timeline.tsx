import * as React from "react";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "@/lib/tokens";
import { LIFECYCLE_STAGES } from "@/lib/tokens";

// ─── Timeline ───────────────────────────────────────────────────────────────
// Presentational. Renders the vertical lifecycle timeline seen on the
// tracking screens (in-progress, recovered, certified).
//
// Each stage can be: completed | active | pending
// The component derives this automatically from `currentStage`.
//
// Usage:
// <Timeline currentStage="processed" timestamps={{ collected: "08 Jun, 11:30", ... }} />

export interface TimelineStageData {
  stage: LifecycleStage;
  timestamp?: string;   // e.g. "08 Jun, 11:30" — shown when completed
  label?: string;       // Override display label
  sublabel?: string;    // e.g. "Awaiting agent", "In progress"
}

export type TimelineStatus = "completed" | "active" | "pending";

export interface TimelineProps {
  /** The current (latest reached) stage */
  currentStage: LifecycleStage;
  /**
   * Optional per-stage overrides. Keys are stage names.
   * Merge with defaults; you only need to pass what differs.
   */
  stages?: Partial<Record<LifecycleStage, Pick<TimelineStageData, "timestamp" | "sublabel">>>;
  className?: string;
  /** Show a pulsing indicator on the active stage (use for realtime views) */
  pulse?: boolean;
}

// Human-readable labels for each stage
const STAGE_LABELS: Record<LifecycleStage, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  collected: "Collected",
  tested: "Tested",
  processed: "Processed",
  recovered: "Recovered",
  certified: "Certified",
};

// Default sublabels for pending stages
const PENDING_SUBLABELS: Partial<Record<LifecycleStage, string>> = {
  collected: "Awaiting agent",
  tested: "—",
  processed: "—",
  recovered: "In progress",
  certified: "—",
};

function getStatus(
  stage: LifecycleStage,
  currentStage: LifecycleStage
): TimelineStatus {
  const stageIndex = LIFECYCLE_STAGES.indexOf(stage);
  const currentIndex = LIFECYCLE_STAGES.indexOf(currentStage);
  if (stageIndex < currentIndex) return "completed";
  if (stageIndex === currentIndex) return "active";
  return "pending";
}

// ─── Stage dot ──────────────────────────────────────────────────────────────

function StageDot({
  status,
  pulse,
}: {
  status: TimelineStatus;
  pulse: boolean;
}) {
  if (status === "completed") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]">
          {/* Checkmark */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5l2 2 4-4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    );
  }

  if (status === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {pulse && (
          <span className="absolute h-5 w-5 animate-ping rounded-full bg-[#22C55E] opacity-30" />
        )}
        <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]">
          <span className="h-2 w-2 rounded-full bg-white" />
        </span>
      </span>
    );
  }

  // Pending
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#E5E5E5] bg-white" />
    </span>
  );
}

// ─── Connector line between dots ─────────────────────────────────────────────

function Connector({ completed }: { completed: boolean }) {
  return (
    <span
      className={cn(
        "ml-[9px] block w-0.5 h-6",
        completed ? "bg-[#22C55E]" : "bg-[#E5E5E5]"
      )}
    />
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function Timeline({
  currentStage,
  stages = {},
  className,
  pulse = false,
}: TimelineProps) {
  const currentIndex = LIFECYCLE_STAGES.indexOf(currentStage);

  return (
    <div className={cn("flex flex-col", className)} role="list" aria-label="Pickup lifecycle">
      {LIFECYCLE_STAGES.map((stage, idx) => {
        const status = getStatus(stage, currentStage);
        const override = stages[stage];
        const label = STAGE_LABELS[stage];
        const isLast = idx === LIFECYCLE_STAGES.length - 1;
        const connectorCompleted = idx < currentIndex;

        // Determine sublabel
        let sublabel: string | undefined;
        if (override?.sublabel) {
          sublabel = override.sublabel;
        } else if (status === "completed" && override?.timestamp) {
          sublabel = override.timestamp;
        } else if (status === "pending") {
          sublabel = PENDING_SUBLABELS[stage];
        }

        return (
          <div key={stage} role="listitem">
            {/* Row */}
            <div className="flex items-start gap-3">
              <StageDot status={status} pulse={status === "active" && pulse} />

              <div className="flex-1 pb-0.5">
                <span
                  className={cn(
                    "block text-sm font-semibold leading-tight",
                    status === "pending"
                      ? "text-[#AAAAAA]"
                      : "text-[#111111]"
                  )}
                >
                  {label}
                </span>
                {sublabel && (
                  <span
                    className={cn(
                      "block text-xs mt-0.5",
                      status === "completed"
                        ? "text-[#666666]"
                        : "text-[#AAAAAA]"
                    )}
                  >
                    {sublabel}
                  </span>
                )}
              </div>
            </div>

            {/* Connector */}
            {!isLast && <Connector completed={connectorCompleted} />}
          </div>
        );
      })}
    </div>
  );
}

export { Timeline };
