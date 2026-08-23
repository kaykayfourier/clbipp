import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@clbipp/auth/server";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Button } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Timeline } from "@clbipp/ui";
import { StatusBadge } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { ErrorState } from "@clbipp/ui";
import { isStageBefore } from "@clbipp/ui";
import type { LifecycleStage } from "@clbipp/ui";
import { PickupActions } from "./PickupActions";

// ─── Page ────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ScheduledPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const { data: pickup, error } = await supabase
    .from("pickups")
    .select("id, status, battery_type, approx_quantity, location, preferred_date, created_at")
    .eq("id", id)
    .single();

  if (error || !pickup) {
    return (
      <AppShell title="Scheduled" showBack backHref="/dashboard" hideNav>
        <PagePadding>
          <ErrorState
            heading="Pickup not found"
            message="We couldn't find that pickup. It may have been cancelled or removed."
          />
        </PagePadding>
      </AppShell>
    );
  }

  // An offer only exists once the field agent has assessed and priced the
  // batteries on site. Until then there's nothing to view, so the "View Offer"
  // CTA stays hidden. Since Batch 7A that moment is its own status (`offered`)
  // rather than a sub-state of `scheduled` — but this screen still keys off the
  // row existing, because it is reachable from earlier stages too.
  const { data: offer } = await supabase
    .from("offers")
    .select("pickup_id, accepted_at")
    .eq("pickup_id", id)
    .maybeSingle();

  const hasOffer = Boolean(offer);
  // Batch 5b (D7): accepting stamps `accepted_at` and leaves the status at
  // `offered`, so an accepted offer is still reachable from this screen. /offer
  // redirects an accepted pickup to /handover, so point straight there instead
  // of sending the customer through the bounce.
  const offerAccepted = Boolean(offer?.accepted_at);

  // This screen's timeline is truncated at `collected`, so any status at or
  // past collection is clamped back to the last stage it can render.
  const currentStage = isStageBefore(pickup.status, "collected")
    ? (pickup.status as LifecycleStage)
    : "collected";

  return (
    <AppShell
      title={pickup.id}
      showBack
      backHref="/dashboard"
      hideNav
    >
      <PagePadding className="flex flex-col gap-5">

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <SectionLabel>Pickup Request</SectionLabel>
          <StatusBadge
            status={pickup.status as Parameters<typeof StatusBadge>[0]["status"]}
          />
        </div>

        {/* Timeline — shows requested → scheduled → collected only */}
        <Card variant="default" className="flex flex-col gap-1">
          <Timeline
            currentStage={currentStage}
            endStage="collected"
            pulse
            stages={{
              requested: { sublabel: formatDate(pickup.created_at) },
              // Not "Awaiting agent" — `arrived` carries that sublabel now, and
              // two consecutive rows saying the same thing reads as a bug.
              collected: { sublabel: "Awaiting handover" },
            }}
          />
        </Card>

        {/* Agent placeholder */}
        <Card variant="tinted" className="flex flex-col gap-4">
          <SectionLabel>Field Agent</SectionLabel>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-border">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="9"
                  cy="6"
                  r="3"
                  stroke="var(--color-text-disabled)"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6"
                  stroke="var(--color-text-disabled)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Pending Assignment
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                ETA — To be updated
              </p>
            </div>
          </div>
        </Card>

        {/* Pickup details */}
        <Card variant="default" className="flex flex-col gap-3">
          <SectionLabel>Pickup Details</SectionLabel>
          <PickupDetailRow label="Battery type" value={formatBatteryType(pickup.battery_type)} />
          <hr className="border-t border-border" />
          <PickupDetailRow label="Quantity" value={`${pickup.approx_quantity} units`} />
          <hr className="border-t border-border" />
          <PickupDetailRow label="Location" value={pickup.location} />
          {pickup.preferred_date && (
            <>
              <hr className="border-t border-border" />
              <PickupDetailRow
                label="Preferred date"
                value={formatDate(pickup.preferred_date)}
              />
            </>
          )}
        </Card>

        {/* Info banner — agent will be assigned soon */}
        <Banner variant="info">
          You&apos;ll be notified as soon as a field agent is assigned and
          a collection time is confirmed.
        </Banner>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-1">
          {/* Only surfaced once the agent has priced the batteries (offer exists) */}
          {hasOffer && (
            <Link
              href={
                offerAccepted
                  ? `/handover?id=${pickup.id}`
                  : `/offer?id=${pickup.id}`
              }
              className="block"
            >
              <Button variant="primary" fullWidth>
                {offerAccepted ? "View Acceptance" : "View Offer"}
              </Button>
            </Link>
          )}

          <PickupActions pickupId={pickup.id} status={pickup.status} />
        </div>

      </PagePadding>
    </AppShell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PickupDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text-primary text-right">
        {value}
      </span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatBatteryType(raw: string): string {
  const map: Record<string, string> = {
    li_ion_nmc: "Li-ion NMC",
    li_ion_lfp: "Li-ion LFP",
    li_ion_nca: "Li-ion NCA",
    lead_acid: "Lead Acid",
    nimh: "NiMH",
    other: "Other",
  };
  return map[raw] ?? raw;
}
