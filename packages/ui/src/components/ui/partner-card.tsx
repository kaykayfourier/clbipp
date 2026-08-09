import * as React from "react";
import { cn } from "../../utils";
import { Card } from "./card";

// ─── PartnerCard ─────────────────────────────────────────────────────────────
// The assigned collection partner on the tracking screen (Plan v2 §5 A5).
//
// Purely presentational — the caller resolves the agent Profile and decides
// whether to render this at all. It shows only what a customer needs in order
// to meet someone at a gate: who is coming, how to reach them, what they're
// driving, and when. No agent zone, no rating breakdown, nothing internal.

export interface PartnerCardProps {
  name: string;
  /** E.164 or local. Rendered as a tel: link — a phone number you can't tap is half a phone number. */
  phone?: string | null;
  vehicle?: string | null;
  /** 0–5, one decimal. Hidden when absent rather than shown as "—". */
  rating?: number | null;
  /**
   * Free-text ETA line, e.g. "Arriving in about 45 min" or "On site now".
   * The page owns this wording because it depends on status, not just minutes.
   */
  eta?: string | null;
  className?: string;
}

/** Initials for the avatar. Two letters max — "Ravi Kumar" → "RK". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function PartnerCard({
  name,
  phone,
  vehicle,
  rating,
  eta,
  className,
}: PartnerCardProps) {
  const details = [vehicle, rating != null ? `${rating.toFixed(1)} ★` : null].filter(
    Boolean,
  );

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
        Collection partner
      </p>

      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-sm font-bold text-text-primary"
        >
          {initials(name)}
        </span>

        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary">
            {name}
          </span>
          {details.length > 0 && (
            <span className="block truncate text-xs text-text-secondary">
              {details.join(" · ")}
            </span>
          )}
        </div>

        {phone && (
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-primary"
          >
            Call
          </a>
        )}
      </div>

      {eta && (
        <p className="border-t border-border pt-3 text-xs text-text-secondary">
          {eta}
        </p>
      )}
    </Card>
  );
}

export { PartnerCard };
