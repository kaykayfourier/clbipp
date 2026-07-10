import * as React from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./badge";
import type { PickupStatus } from "./badge";

// ─── ListRow ────────────────────────────────────────────────────────────────
// The repeating pickup row seen in Dashboard (active) and Compliance log.
// Left: battery icon + ID + subtext
// Right: status badge + chevron

// ─── Battery Icon ────────────────────────────────────────────────────────────
function BatteryIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="5" width="15" height="10" rx="2" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
      <path d="M17 8v4" stroke="var(--color-text-disabled)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="7" width="9" height="6" rx="1" fill="var(--color-text-disabled)" fillOpacity="0.3" />
    </svg>
  );
}

// ─── ChevronRight icon ───────────────────────────────────────────────────────
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="var(--color-text-disabled)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface ListRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** e.g. "PKP-2042" */
  id: string;
  /** e.g. "Li-ion NMC · 24 units" */
  subtitle: string;
  status: PickupStatus;
  /** Whether to show the animated pulse on the status badge */
  pulseBadge?: boolean;
  /** Suppress chevron (e.g. non-interactive rows) */
  showChevron?: boolean;
}

const ListRow = React.forwardRef<HTMLButtonElement, ListRowProps>(
  (
    {
      id,
      subtitle,
      status,
      pulseBadge = false,
      showChevron = true,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5",
          "bg-surface border border-border rounded-[14px]",
          "transition-colors duration-100",
          "hover:bg-background active:bg-background-pressed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green",
          "text-left",
          className
        )}
        {...props}
      >
        {/* Battery icon bubble */}
        <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-[10px] bg-background">
          <BatteryIcon />
        </span>

        {/* Text block */}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text-primary font-mono">
            {id}
          </span>
          <span className="block text-xs text-text-secondary truncate mt-0.5">
            {subtitle}
          </span>
        </span>

        {/* Status + chevron */}
        <span className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} pulse={pulseBadge} />
          {showChevron && <ChevronRight />}
        </span>
      </button>
    );
  }
);

ListRow.displayName = "ListRow";

// ─── ListRowSkeleton ─────────────────────────────────────────────────────────
// Placeholder shown during loading

function ListRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        "bg-surface border border-border rounded-[14px]",
        className
      )}
    >
      <div className="w-10 h-10 rounded-[10px] bg-border animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-border rounded-full animate-pulse w-24" />
        <div className="h-2.5 bg-border rounded-full animate-pulse w-36" />
      </div>
      <div className="h-6 w-20 bg-border rounded-full animate-pulse shrink-0" />
    </div>
  );
}

export { ListRow, ListRowSkeleton };