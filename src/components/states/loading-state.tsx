import * as React from "react";
import { cn } from "@/lib/utils";

// ─── LoadingState ─────────────────────────────────────────────────────────────
// Full-screen loader with Back2Basics logo mark centred.
// Used on initial page load / route transitions.

export interface LoadingStateProps {
  /** Optional label below the spinner */
  label?: string;
  /** Use this for small inline spinners, not full-screen */
  inline?: boolean;
  className?: string;
}

function LoadingState({
  label,
  inline = false,
  className,
}: LoadingStateProps) {
  if (inline) {
    return (
      <div
        className={cn("flex items-center justify-center gap-2 py-6", className)}
        role="status"
        aria-label={label ?? "Loading"}
      >
        <Spinner size="sm" />
        {label && (
          <span className="text-sm text-text-secondary">{label}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center min-h-[60vh] gap-4",
        className
      )}
      role="status"
      aria-label={label ?? "Loading"}
    >
      {/* Logo mark */}
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-black">
        <span className="text-primary-green text-xl font-bold font-mono select-none">
          B2
        </span>
      </div>

      <Spinner size="lg" />

      {label && (
        <p className="text-sm text-text-secondary">{label}</p>
      )}
    </div>
  );
}

// ─── Spinner (shared) ─────────────────────────────────────────────────────────

function Spinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <svg
      className={cn("animate-spin text-primary-green", sizeClasses[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────
// Use these for content-aware loading placeholders (better UX than spinners).

function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-border",
        className
      )}
      aria-hidden="true"
    />
  );
}

// Pre-composed skeleton for a dashboard-style card
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-surface p-4 space-y-3",
        className
      )}
      aria-hidden="true"
    >
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <SkeletonBlock className="h-8 flex-1" />
        <SkeletonBlock className="h-8 flex-1" />
      </div>
    </div>
  );
}

// Pre-composed skeleton that matches a ListRow
function SkeletonListRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        "bg-surface border border-border rounded-[14px]",
        className
      )}
      aria-hidden="true"
    >
      <SkeletonBlock className="w-10 h-10 rounded-[10px] shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="h-3 w-24 rounded-full" />
        <SkeletonBlock className="h-2.5 w-36 rounded-full" />
      </div>
      <SkeletonBlock className="h-6 w-20 rounded-full shrink-0" />
    </div>
  );
}

export { LoadingState, Spinner, SkeletonBlock, SkeletonCard, SkeletonListRow };

