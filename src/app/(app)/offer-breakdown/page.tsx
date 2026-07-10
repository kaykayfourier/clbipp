import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PagePadding, SectionLabel } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pathwayLabel, formatOfferPrice } from "@/lib/offer";

// ─── Page ────────────────────────────────────────────────────────────────────
// Reads the same real Offer as /offer (RLS-scoped, same guard sequence).
//
// Design consequence of the locked no-₹ rule: the real Offer has no per-line
// price components — only estimatedPrice plus the forbidden material/deduction ₹.
// So this "breakdown" is price + pathway + the full qualitative rationale +
// explanation, NOT a ₹ line-item table (the old mock money rows are gone).

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function OfferBreakdownPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id) redirect("/dashboard");

  const supabase = await createClient();

  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!pickup) redirect("/dashboard");

  if (pickup.status !== "requested" && pickup.status !== "scheduled") {
    redirect(`/track/${id}`);
  }

  const { data: offer } = await supabase
    .from("offers")
    .select("pathway, estimated_price, rationale")
    .eq("pickup_id", id)
    .single();

  if (!offer) redirect(`/scheduled?id=${id}`);

  const pathway = pathwayLabel(offer.pathway);

  return (
    <AppShell
      title="How we valued it"
      showBack
      backHref={`/offer?id=${pickup.id}`}
    >
      <PagePadding className="flex flex-col gap-5">

        {/* Estimate + pathway */}
        <Card variant="default" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Estimated Value</SectionLabel>
            <Badge variant="success" className="text-[11px] px-2.5 py-0.5 uppercase tracking-wider">
              {pathway}
            </Badge>
          </div>
          <p className="text-3xl font-semibold text-text-primary">
            {formatOfferPrice(offer.estimated_price)}
          </p>
        </Card>

        {/* Full rationale */}
        <Card variant="tinted" className="flex flex-col gap-3">
          <SectionLabel>Why this valuation?</SectionLabel>
          <p className="text-sm text-text-primary leading-relaxed">
            {offer.rationale}
          </p>
        </Card>

        {/* Explanation */}
        <Card variant="outline">
          <p className="text-sm text-text-secondary leading-relaxed">
            The final price is confirmed after your batteries are collected,
            tested, and processed. Estimates may vary by up to ±8%.
          </p>
        </Card>

        {/* Accept CTA */}
        <Link href={`/handover?id=${pickup.id}`} className="block">
          <Button variant="primary" fullWidth>
            Accept offer
          </Button>
        </Link>

        <Link href={`/offer?id=${pickup.id}`} className="block">
          <Button variant="ghost" fullWidth>
            Back to offer
          </Button>
        </Link>

      </PagePadding>
    </AppShell>
  );
}
