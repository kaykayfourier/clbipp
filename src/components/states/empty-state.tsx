import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Used for: dashboard (no pickups yet), compliance log (no certificates), search.
// Matches the wireframe "No pickups yet" screen exactly.

export interface EmptyStateProps {
  /** SVG or image node to render above the heading */
  illustration?: React.ReactNode;
  heading: string;
  description?: string;
  /** Primary CTA label */
  actionLabel?: string;
  /** Called when the CTA is clicked */
  onAction?: () => void;
  /** Optional secondary text link */
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

// Default battery illustration matching the wireframe empty dashboard.
// SVG fill values use CSS vars so they track the token system.
function BatteryEmptyIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="10" y="20" width="54" height="36" rx="8" fill="var(--color-border)" />
      <rect x="64" y="30" width="8" height="16" rx="4" fill="var(--color-border)" />
      <rect x="14" y="24" width="46" height="28" rx="6" fill="var(--color-background)" />
      {/* Low charge bar */}
      <rect x="14" y="24" width="12" height="28" rx="6" fill="var(--color-primary-green)" />
    </svg>
  );
}

function EmptyState({
  illustration,
  heading,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-8 py-16 gap-4",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Illustration */}
      <div className="mb-2">
        {illustration ?? <BatteryEmptyIllustration />}
      </div>

      {/* Text */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-text-primary">{heading}</h2>
        {description && (
          <p className="text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
            {description}
          </p>
        )}
      </div>

      {/* Actions */}
      {actionLabel && (
        <div className="flex flex-col items-center gap-3 w-full max-w-[280px] mt-2">
          <Button fullWidth onClick={onAction}>
            {actionLabel}
          </Button>
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="text-sm text-text-secondary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green rounded"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
