import * as React from "react";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "@/lib/tokens";

// ─── StatusBadge ────────────────────────────────────────────────────────────
// Maps a lifecycle stage to a coloured dot + ALL-CAPS label pill.
// Matches the wireframe badges exactly: SCHEDULED, PROCESSED, RECOVERED, CERTIFIED, etc.

const STATUS_CONFIG: Record<
  LifecycleStage,
  { dot: string; bg: string; text: string; label: string }
> = {
  requested: {
    dot: "#3B82F6",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    label: "REQUESTED",
  },
  scheduled: {
    dot: "#3B82F6",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    label: "SCHEDULED",
  },
  collected: {
    dot: "#F97316",
    bg: "#FFF7ED",
    text: "#C2410C",
    label: "COLLECTED",
  },
  tested: {
    dot: "#F97316",
    bg: "#FFF7ED",
    text: "#C2410C",
    label: "TESTED",
  },
  processed: {
    dot: "#F97316",
    bg: "#FFF7ED",
    text: "#C2410C",
    label: "PROCESSED",
  },
  recovered: {
    dot: "#22C55E",
    bg: "#F0FDF4",
    text: "#15803D",
    label: "RECOVERED",
  },
  certified: {
    dot: "#22C55E",
    bg: "#F0FDF4",
    text: "#15803D",
    label: "CERTIFIED",
  },
};

export interface StatusBadgeProps {
  status: LifecycleStage;
  /** Pulse animation on the dot — use for "live / active" states */
  pulse?: boolean;
  className?: string;
}

function StatusBadge({ status, pulse = false, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-[11px] font-semibold tracking-widest",
        className
      )}
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {/* Dot */}
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            pulse && "animate-ping opacity-75"
          )}
          style={{ backgroundColor: config.dot }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: config.dot }}
        />
      </span>
      {config.label}
    </span>
  );
}

// ─── GenericBadge ───────────────────────────────────────────────────────────
// For non-lifecycle uses: filter chips, category labels, etc.

export type BadgeVariant =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "outline";

const BADGE_VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default:
    "bg-[#F8F5EE] text-[#111111] border border-[#E5E5E5]",
  success:
    "bg-[#F0FDF4] text-[#15803D]",
  error:
    "bg-[#FEF2F2] text-[#B91C1C]",
  warning:
    "bg-[#FFF7ED] text-[#C2410C]",
  info:
    "bg-[#EFF6FF] text-[#1D4ED8]",
  outline:
    "bg-transparent border border-[#E5E5E5] text-[#666666]",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
        "text-xs font-medium",
        BADGE_VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { StatusBadge, Badge };
