import * as React from "react";
import { cn } from "../../utils";
import type { LifecycleStage } from "../../tokens";
import { LIFECYCLE_STAGES } from "../../tokens";

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
  currentStage: LifecycleStage;

  stages?: Partial<Record<LifecycleStage, Pick<TimelineStageData, "timestamp" | "sublabel">>>;

  className?: string;

  pulse?: boolean;

  // NEW
  endStage?: LifecycleStage;
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
  recovered: "In progress",
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
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success">
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
          <span className="absolute h-5 w-5 animate-ping rounded-full bg-success opacity-30" />
        )}
        <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-success">
          <span className="h-2 w-2 rounded-full bg-white" />
        </span>
      </span>
    );
  }

  // Pending
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border bg-surface" />
    </span>
  );
}

// ─── Connector line between dots ─────────────────────────────────────────────

function Connector({ completed }: { completed: boolean }) {
  return (
    <span
      className={cn(
        "ml-[9px] block w-0.5 h-8",
        completed ? "bg-success" : "bg-border"
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
  endStage,
}: TimelineProps) {
  const currentIndex = LIFECYCLE_STAGES.indexOf(currentStage);
  const visibleStages =
  endStage === undefined
    ? LIFECYCLE_STAGES
    : LIFECYCLE_STAGES.slice(
        0,
        LIFECYCLE_STAGES.indexOf(endStage) + 1
      );

  return (
    <div className={cn("flex flex-col", className)} role="list" aria-label="Pickup lifecycle">
      {visibleStages.map((stage, idx) => {
        const status = getStatus(stage, currentStage);
        const override = stages[stage];
        const label = STAGE_LABELS[stage];
        const isLast = idx === visibleStages.length - 1;
        const connectorCompleted =
          LIFECYCLE_STAGES.indexOf(stage) < currentIndex;

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

              <div className="flex-1 pb-0.5 min-h-[1.75rem]">
                <span
                  className={cn(
                    "block text-sm font-semibold leading-tight",
                    status === "pending"
                      ? "text-text-disabled"
                      : "text-text-primary"
                  )}
                >
                  {label}
                </span>
                {sublabel && (
                  <span
                    className={cn(
                      "block text-xs mt-0.5",
                      status === "completed"
                        ? "text-text-secondary"
                        : "text-text-disabled"
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

export { Timeline, Connector };