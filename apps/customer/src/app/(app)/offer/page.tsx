import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@clbipp/auth/server";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Button } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Badge } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { pathwayLabel, formatOfferPrice } from "@clbipp/core";
import { AcceptOfferButton } from "../handover/AcceptOfferButton";

// ─── Page ────────────────────────────────────────────────────────────────────
// Reads the REAL Offer row for ?id= via the RLS-scoped server client (a vendor
// can only read their own pickups/offers). Guarded so it can't be reached with a
// missing/foreign id, for a pickup that's already past the offer stage, or before
// an offer has been priced.
//
// The offer is a sub-state of `scheduled` (an Offer row exists). Locked rule:
// never render materialBreakdown / deductions (₹) — price + qualitative
// rationale + pathway only.

interface PageProps {
  // `error` is set by acceptOfferAndConfirm when the accept is refused — it
  // sends the customer back here rather than on to a confirmation screen
  // confirming something that didn't happen.
  searchParams: Promise<{ id?: string; error?: string }>;
}

export default async function OfferPage({ searchParams }: PageProps) {
  const { id, error } = await searchParams;

  // Guard 1 — no id ⇒ nothing to show.
  if (!id) redirect("/dashboard");

  const supabase = await createClient();

  // Guard 2 — pickup must exist and belong to the caller (RLS scopes to vendor).
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!pickup) redirect("/dashboard");

  // Guard 3 — `offered` IS the offer stage as of Batch 7A, so this is now an
  // exact match rather than a "pre-collection" range. Earlier stages have no
  // offer to show; later ones can't go back to it. Both go to tracking.
  if (pickup.status !== "offered") {
    redirect(`/track/${id}`);
  }

  // Guard 4 — not priced yet ⇒ back to the scheduled screen.
  const { data: offer } = await supabase
    .from("offers")
    .select("pathway, estimated_price, rationale, accepted_at")
    .eq("pickup_id", id)
    .single();

  if (!offer) redirect(`/scheduled?id=${id}`);

  // Guard 5 (Batch 5b) — already accepted. Since D7, accepting stamps
  // `accepted_at` and leaves the status at `offered`, so the status guard above
  // no longer closes this screen once the decision is made. Without this the
  // customer would be shown the Accept button for an offer they had already
  // accepted, and every press would be a fresh POST.
  //
  // 🔴 Symmetrical with /handover's guard, which redirects HERE when
  // `acceptedAt` is null. Both must key on this same field — swap either for a
  // status range and the two screens bounce off each other forever.
  if (offer.accepted_at) redirect(`/handover?id=${id}`);

  const pathway = pathwayLabel(offer.pathway);

  return (
    <AppShell
      title={`Offer · ${pickup.id}`}
      showBack
      backHref={`/scheduled?id=${pickup.id}`}
      hideNav
    >
      <PagePadding className="flex flex-col gap-5">

        {error ? (
          <Banner variant="error">{error}</Banner>
        ) : null}

        {/* Pathway badge */}
        <div className="flex justify-center">
          <Badge variant="success" className="text-xs px-3 py-1 uppercase tracking-wider">
            {pathway}
          </Badge>
        </div>

        {/* Price hero */}
        <Card variant="elevated" className="flex flex-col items-center gap-1 py-6">
          <SectionLabel>Estimated Offer</SectionLabel>
          <p className="text-4xl font-semibold text-text-primary mt-2">
            {formatOfferPrice(offer.estimated_price)}
          </p>
          <p className="text-xs text-text-secondary mt-1 text-center max-w-[220px] leading-relaxed">
            Estimated — final value confirmed after processing.
          </p>
        </Card>

        {/* Rationale — single qualitative string per schema */}
        <Card variant="tinted" className="flex flex-col gap-3">
          <SectionLabel>Why this price?</SectionLabel>
          <p className="text-sm text-text-primary leading-relaxed">
            {offer.rationale}
          </p>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-1">
          <Link href={`/offer-breakdown?id=${pickup.id}`} className="block">
            <Button variant="secondary" fullWidth>
              View full breakdown
            </Button>
          </Link>

          <AcceptOfferButton pickupId={pickup.id} />

          <Link href={`/scheduled?id=${pickup.id}`} className="block">
            <Button variant="ghost" fullWidth>
              Decline
            </Button>
          </Link>
        </div>

      </PagePadding>
    </AppShell>
  );
}
