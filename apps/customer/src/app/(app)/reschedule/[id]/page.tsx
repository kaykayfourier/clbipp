import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@clbipp/auth/server";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { ErrorState } from "@clbipp/ui";
import { isStageBefore } from "@clbipp/ui";
import { RescheduleForm } from "./RescheduleForm";

// ─── /reschedule/[id] ─────────────────────────────────────────────────────────
// The proper reschedule screen: reachable from the "Reschedule" button on
// /scheduled and from the cancelled view on /track/[id]. Reads through the
// vendor's own (RLS-scoped) session client, same as /scheduled — the actual
// write happens in reschedulePickup (handover/actions.ts), which re-verifies
// ownership itself via the admin client.

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReschedulePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pickup, error } = await supabase
    .from("pickups")
    .select("id, status, location, preferred_date")
    .eq("id", id)
    .single();

  if (error || !pickup) {
    return (
      <AppShell title="Reschedule" showBack backHref="/dashboard" hideNav>
        <PagePadding>
          <ErrorState
            heading="Pickup not found"
            message="We couldn't find that pickup. It may have been removed."
          />
        </PagePadding>
      </AppShell>
    );
  }

  // Same window as cancel, plus cancelled itself — a cancelled pickup is the
  // one status outside the normal pre-collection run that's still allowed to
  // reschedule, since doing so reactivates it.
  const canReschedule = isStageBefore(pickup.status, "collected") || pickup.status === "cancelled";

  return (
    <AppShell title="Reschedule pickup" showBack backHref={`/track/${pickup.id}`} hideNav>
      <PagePadding className="flex flex-col gap-5">
        {pickup.status === "cancelled" && (
          <Banner variant="info">
            This pickup was cancelled. Rescheduling brings back the same request with a
            new date — no need to start over.
          </Banner>
        )}

        {!canReschedule ? (
          <>
            <Banner variant="error">
              This pickup has already moved past collection and can no longer be
              rescheduled.
            </Banner>
            <Link
              href={`/track/${pickup.id}`}
              className="text-center text-sm font-medium underline"
            >
              Back to tracking
            </Link>
          </>
        ) : (
          <>
            <Card variant="default" className="flex flex-col gap-2">
              <SectionLabel>Pickup</SectionLabel>
              <p className="text-sm text-text-secondary">{pickup.location ?? "Your pickup"}</p>
            </Card>

            <RescheduleForm pickupId={pickup.id} currentDate={pickup.preferred_date} />
          </>
        )}
      </PagePadding>
    </AppShell>
  );
}
