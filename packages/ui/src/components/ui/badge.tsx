import * as React from "react";
import { cn } from "../../utils";
import { colors } from "../../tokens";
import type { LifecycleStage } from "../../tokens";

// ─── StatusBadge ────────────────────────────────────────────────────────────
// Maps a lifecycle stage to a coloured dot + ALL-CAPS label pill.
// Dot and background colours come from tokens.ts colors.status — the JS object
// is the right place for these since they are applied via style={} (dynamic),
// not as static Tailwind classes.

// A pickup's status is the linear lifecycle PLUS the terminal `cancelled`
// side-state. Anything that renders a status (StatusBadge, ListRow) accepts
// this wider union; the ordered LIFECYCLE_STAGES array stays cancelled-free.
export type PickupStatus = LifecycleStage | "cancelled";

const STATUS_CONFIG: Record<
  PickupStatus,
  { dot: string; bg: string; text: string; label: string }
> = {
  requested: {
    dot: colors.info,
    bg: colors.infoBg,
    text: colors.infoText,
    label: "REQUESTED",
  },
  scheduled: {
    dot: colors.info,
    bg: colors.infoBg,
    text: colors.infoText,
    label: "SCHEDULED",
  },
  collected: {
    dot: colors.warning,
    bg: colors.warningBg,
    text: colors.warningText,
    label: "COLLECTED",
  },
  tested: {
    dot: colors.warning,
    bg: colors.warningBg,
    text: colors.warningText,
    label: "TESTED",
  },
  processed: {
    dot: colors.warning,
    bg: colors.warningBg,
    text: colors.warningText,
    label: "PROCESSED",
  },
  recovered: {
    dot: colors.success,
    bg: colors.successBg,
    text: colors.successText,
    label: "RECOVERED",
  },
  certified: {
    dot: colors.success,
    bg: colors.successBg,
    text: colors.successText,
    label: "CERTIFIED",
  },
  cancelled: {
    dot: colors.textDisabled,
    bg: colors.background,
    text: colors.textSecondary,
    label: "CANCELLED",
  },
};

export interface StatusBadgeProps {
  status: PickupStatus;
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
    "bg-background text-text-primary border border-border",
  success:
    "bg-success-bg text-success-text",
  error:
    "bg-error-bg text-error-text",
  warning:
    "bg-warning-bg text-warning-text",
  info:
    "bg-info-bg text-info-text",
  outline:
    "bg-transparent border border-border text-text-secondary",
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