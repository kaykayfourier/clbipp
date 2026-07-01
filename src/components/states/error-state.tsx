import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── ErrorState ───────────────────────────────────────────────────────────────
// Shown when a data fetch or action fails.
// Provides a clear message + retry button — never vague.

export interface ErrorStateProps {
  /** Short heading, e.g. "Couldn't load pickups" */
  heading?: string;
  /** Explanation of what went wrong and how to fix it */
  message?: string;
  /** Label for the retry / recovery CTA */
  actionLabel?: string;
  /** Callback for retry */
  onAction?: () => void;
  /** Render as a smaller inline strip instead of full-screen */
  inline?: boolean;
  className?: string;
}

function ErrorState({
  heading = "Something went wrong",
  message = "We couldn't load this page. Check your connection and try again.",
  actionLabel = "Try again",
  onAction,
  inline = false,
  className,
}: ErrorStateProps) {
  if (inline) {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3",
          className
        )}
        role="alert"
      >
        <ErrorIcon className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#B91C1C]">{heading}</p>
          {message && (
            <p className="text-xs text-[#EF4444] mt-0.5 leading-snug">{message}</p>
          )}
        </div>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold text-[#B91C1C] underline-offset-2 hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F53D] rounded"
          >
            {actionLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-8 py-16 gap-4 min-h-[60vh]",
        className
      )}
      role="alert"
    >
      {/* Illustration */}
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FEF2F2]">
        <ErrorIcon size={28} />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[#111111]">{heading}</h2>
        <p className="text-sm text-[#666666] leading-relaxed max-w-xs mx-auto">
          {message}
        </p>
      </div>

      {onAction && (
        <Button variant="secondary" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

// ─── Error icon ───────────────────────────────────────────────────────────────

function ErrorIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.5" />
      <path
        d="M8 5v3.5M8 10.5v.5"
        stroke="#EF4444"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { ErrorState };
