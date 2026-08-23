import * as React from "react";
import { cn } from "../../utils";
import { Card } from "./card";

// ─── CustodyLog ──────────────────────────────────────────────────────────────
// The chain-of-custody record the company flow document asks for (§5.3):
// per-transition timestamp, GPS and photo proof.
//
// Deliberately NOT the same thing as <Timeline>, and rendered below it rather
// than replacing it. Timeline answers "how far along is this, and what's left"
// — it renders every canonical stage including ones that haven't happened.
// CustodyLog answers "what was actually recorded, by whom, where" — it renders
// only real StatusEvent rows and never invents one.
//
// Purely presentational. Photo URLs must already be SIGNED by the caller: every
// bucket is private, so a raw object path renders a broken image. The caller is
// also the one that checked ownership before signing.

export interface CustodyEntry {
  /** Stable key — the StatusEvent id, stringified (it's a BigInt in the DB). */
  id: string;
  /** Display label for the stage, e.g. "Agent arrived". */
  label: string;
  /** Preformatted, e.g. "08 Jun, 11:30". Formatting is locale work — the server does it. */
  timestamp: string;
  /** "customer" | "agent" | … — shown as a plain attribution line. */
  actorRole?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Signed, ready-to-render URLs. Empty is normal: not every stage has photo proof. */
  photoUrls?: string[];
  notes?: string | null;
}

export interface CustodyLogProps {
  entries: CustodyEntry[];
  /** Set false on the public view — see the note in t/[token]/page.tsx. */
  showPhotos?: boolean;
  /**
   * Attribution copy, keyed by `actorRole`. Defaults to the CUSTOMER's
   * perspective (added Batch 8, 2026-08-24).
   *
   * ⚠ This prop exists because "Recorded by you" is a claim about **who is
   * reading**, not about who acted, and the two apps have opposite answers. The
   * default below is right on /track/[id] and /t/[token] and exactly backwards
   * on the agent's /pickups/[id] — it would have credited the agent's own
   * arrival to "the collection partner" and the vendor's booking to "you".
   *
   * Pass AGENT_ROLE_LABELS from the agent app rather than adding a second
   * component.
   */
  roleLabels?: Record<string, string>;
  className?: string;
}

const ROLE_LABELS: Record<string, string> = {
  customer: "Recorded by you",
  vendor: "Recorded by you",
  agent: "Recorded by the collection partner",
  admin: "Recorded by CLBIPP",
};

function CustodyLog({
  entries,
  showPhotos = true,
  roleLabels = ROLE_LABELS,
  className,
}: CustodyLogProps) {
  if (entries.length === 0) return null;

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Chain of custody
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Every handling step, with where and when it was recorded.
        </p>
      </div>

      <ol className="flex flex-col">
        {entries.map((entry, idx) => (
          <li
            key={entry.id}
            className={cn(
              "flex flex-col gap-2 py-3",
              idx > 0 && "border-t border-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-text-primary">
                {entry.label}
              </span>
              <span className="shrink-0 text-xs text-text-secondary">
                {entry.timestamp}
              </span>
            </div>

            {entry.actorRole && roleLabels[entry.actorRole] && (
              <span className="text-xs text-text-secondary">
                {roleLabels[entry.actorRole]}
              </span>
            )}

            {entry.notes && (
              <span className="text-xs text-text-secondary">{entry.notes}</span>
            )}

            {entry.lat != null && entry.lng != null && (
              // Plain maps URL, no embed: an embedded map needs a billed Maps
              // key, and all this has to do is let someone check the location.
              <a
                href={`https://www.google.com/maps?q=${entry.lat},${entry.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-xs font-medium text-primary-green underline underline-offset-2"
              >
                View location
              </a>
            )}

            {showPhotos && (entry.photoUrls?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.photoUrls!.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {/* Plain <img>: these are signed URLs on a Supabase host
                        that expire in an hour, which next/image's optimiser
                        would try to cache past their lifetime. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${entry.label} — photo record`}
                      loading="lazy"
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export { CustodyLog };
