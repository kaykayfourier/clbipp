import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PagePadding, SectionLabel } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Timeline } from "@/components/ui/timeline";
import { Banner } from "@/components/ui/banner";
import { ErrorState } from "@/components/states/error-state";
import { acceptOffer } from "./actions";

// ─── Page ────────────────────────────────────────────────────────────────────
// Server component. Vendor arrives here by pressing "Accept offer" on /offer or
// /offer-breakdown. On load:
//   1. Call acceptOffer() — updates pickup status → "collected" + status_event
//   2. Fetch the updated pickup for display
//   3. Render the handover confirmation screen

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function HandoverPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id) {
    redirect("/dashboard");
  }

  // Run the accept action — idempotent if already "collected"
  const { error: acceptError } = await acceptOffer(id);

  if (acceptError) {
    return (
      <AppShell title="Handover" showBack backHref={`/offer?id=${id}`}>
        <PagePadding>
          <ErrorState
            heading="Couldn't confirm handover"
            message={acceptError}
          />
          <div className="mt-4">
            <Link href={`/offer?id=${id}`}>
              <Button variant="secondary" fullWidth>
                Back to offer
              </Button>
            </Link>
          </div>
        </PagePadding>
      </AppShell>
    );
  }

  // Fetch updated pickup for the confirmation display
  const supabase = await createClient();
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, status, battery_type, approx_quantity, location")
    .eq("id", id)
    .single();

  return (
    <AppShell title="Handover Confirmed" hideNav>
      <PagePadding className="flex flex-col gap-5">

        {/* Success icon + heading */}
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success">
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 14l5 5 11-11"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              Handover Confirmed
            </h1>
            {pickup && (
              <p className="text-sm text-text-secondary mt-1 font-mono">
                {pickup.id}
              </p>
            )}
          </div>
        </div>

        {/* Timeline — requested ✓ → scheduled ✓ → collected ● */}
        <Card variant="default">
          <SectionLabel className="mb-3">Lifecycle</SectionLabel>
          <Timeline
            currentStage="collected"
            endStage="collected"
            stages={{
              requested: { sublabel: "Complete" },
              scheduled: { sublabel: "Complete" },
              collected: { sublabel: "In progress" },
            }}
          />
        </Card>

        {/* Pickup summary */}
        {pickup && (
          <Card variant="tinted" className="flex flex-col gap-3">
            <SectionLabel>Pickup Details</SectionLabel>
            <SummaryRow
              label="Battery type"
              value={formatBatteryType(pickup.battery_type)}
            />
            <hr className="border-t border-border" />
            <SummaryRow
              label="Quantity"
              value={`${pickup.approx_quantity} units`}
            />
            <hr className="border-t border-border" />
            <SummaryRow label="Location" value={pickup.location} />
          </Card>
        )}

        {/* Next steps */}
        <Banner variant="success">
          Your batteries have been collected. Our collection partner will
          contact you shortly to arrange the final handover details.
        </Banner>

        <Card variant="tinted">
          <SectionLabel className="mb-2">Next Steps</SectionLabel>
          <p className="text-sm text-text-secondary leading-relaxed">
            Once processed, your EPR certificate will be available under
            Certificates. You&apos;ll receive a notification at each stage.
          </p>
        </Card>

        {/* Navigation — track the pickup is the primary next step (wireframe:
            handover → track-progress). */}
        <div className="flex flex-col gap-3 pt-1">
          <Link href={`/track/${id}`} className="block">
            <Button variant="primary" fullWidth>
              Track pickup
            </Button>
          </Link>
          <Link href="/dashboard" className="block">
            <Button variant="ghost" fullWidth>
              Back to Home
            </Button>
          </Link>
        </div>

      </PagePadding>
    </AppShell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text-primary text-right">
        {value}
      </span>
    </div>
  );
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
