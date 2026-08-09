import * as React from "react";
import { cn } from "../../utils";

// ─── DetailRow ───────────────────────────────────────────────────────────────
// A label on the left, a value on the right, hairline between rows. Pulled into
// the shared library in Batch 8 because the receipt, payment, wallet and
// certificate screens all render stacks of these, and four private copies of
// the same flex row is how spacing drifts between screens.
//
// The row before it in a stack owns the divider (`border-b`), so the caller
// marks the last one rather than the component guessing — a stack that ends on
// a rule looks unfinished.

export interface DetailRowProps {
  label: string;
  /** The value. A node rather than a string so a row can hold a link or a badge. */
  value: React.ReactNode;
  /** Drops the bottom hairline. Pass on the last row of a group. */
  last?: boolean;
  /** Emphasises the value — for a total, or the one number the row is about. */
  strong?: boolean;
  className?: string;
}

function DetailRow({ label, value, last = false, strong = false, className }: DetailRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2.5",
        !last && "border-b border-border",
        className,
      )}
    >
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={cn(
          "text-right text-sm text-text-primary",
          strong ? "font-semibold" : "font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export { DetailRow };
