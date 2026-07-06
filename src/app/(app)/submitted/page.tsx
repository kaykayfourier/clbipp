import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PagePadding } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/states/error-state";

// ─── Page ────────────────────────────────────────────────────────────────────
// Server component — reads ?id= from the URL, fetches the pickup row, renders.

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function SubmittedPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const { data: pickup, error } = await supabase
    .from("pickups")
    .select("id, status, battery_type, location, created_at")
    .eq("id", id)
    .single();

  if (error || !pickup) {
    return (
      <AppShell title="Request Submitted" hideNav>
        <PagePadding>
          <ErrorState
            heading="Pickup not found"
            message="We couldn't find that pickup request. It may have been removed."
          />
        </PagePadding>
      </AppShell>
    );
  }

  return (
    <AppShell title="Request Submitted" hideNav>
      <PagePadding className="flex flex-col gap-6">

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
          <h1 className="text-2xl font-semibold text-text-primary">
            Request Submitted
          </h1>
          <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
            We&apos;ll notify you the moment a field agent is assigned to your
            pickup.
          </p>
        </div>

        {/* Pickup details card */}
        <Card variant="default" className="flex flex-col gap-4">
          <DetailRow label="Pickup ID" value={pickup.id} mono />
          <Divider />
          <DetailRow
            label="Current Status"
            value={
              <StatusBadge
                status={pickup.status as Parameters<typeof StatusBadge>[0]["status"]}
              />
            }
          />
          <Divider />
          <DetailRow label="Battery type" value={formatBatteryType(pickup.battery_type)} />
          <Divider />
          <DetailRow label="Collection address" value={pickup.location} />
          <Divider />
          <DetailRow
            label="Submitted"
            value={new Date(pickup.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
        </Card>

        {/* Message */}
        <p className="text-sm text-text-secondary text-center leading-relaxed">
          A field agent will be assigned shortly. You&apos;ll receive a
          notification with their ETA.
        </p>

        {/* CTA */}
        <Link href={`/scheduled?id=${pickup.id}`} className="block">
          <Button variant="primary" fullWidth>
            Track Pickup
          </Button>
        </Link>

        <Link href="/dashboard" className="block">
          <Button variant="ghost" fullWidth>
            Back to Home
          </Button>
        </Link>

      </PagePadding>
    </AppShell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-secondary shrink-0">{label}</span>
      {typeof value === "string" ? (
        <span
          className={`text-sm font-medium text-text-primary text-right ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </span>
      ) : (
        <span className="shrink-0">{value}</span>
      )}
    </div>
  );
}

function Divider() {
  return <hr className="border-t border-border" />;
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
