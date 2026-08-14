import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@clbipp/auth/server";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Button } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Badge } from "@clbipp/ui";
import { pathwayLabel, formatOfferPrice, parseMaterialWeights } from "@clbipp/core";
import { AcceptOfferButton } from "../handover/AcceptOfferButton";

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

  // Same guard as /offer — `offered` is the offer stage as of Batch 7A.
  if (pickup.status !== "offered") {
    redirect(`/track/${id}`);
  }

  const { data: offer } = await supabase
    .from("offers")
    .select("pathway, estimated_price, rationale, material_breakdown")
    .eq("pickup_id", id)
    .single();

  if (!offer) redirect(`/scheduled?id=${id}`);

  const pathway = pathwayLabel(offer.pathway);
  // Weight-only — parseMaterialWeights strips the forbidden per-line ₹ values.
  const materials = parseMaterialWeights(offer.material_breakdown);

  return (
    <AppShell
      title="How we valued it"
      showBack
      backHref={`/offer?id=${pickup.id}`}
      hideNav
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

        {/* Recoverable materials — WEIGHT ONLY (no ₹ per locked rule).
            Pending intern-head sign-off; see docs/BATCH_A_FLAGS.md. */}
        {materials.length > 0 && (
          <Card variant="default" className="flex flex-col gap-0">
            <div className="pb-3">
              <SectionLabel>Recoverable materials</SectionLabel>
            </div>
            {materials.map((m, i) => (
              <div
                key={m.material}
                className={`flex items-center justify-between py-2.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="text-sm text-text-secondary">{m.material}</span>
                <span className="text-sm font-medium text-text-primary">
                  {m.weightKg.toLocaleString("en-IN")} kg
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* Explanation */}
        <Card variant="outline">
          <p className="text-sm text-text-secondary leading-relaxed">
            The final price is confirmed after your batteries are collected,
            tested, and processed. Estimates may vary by up to ±8%.
          </p>
        </Card>

        {/* Accept CTA — a POST form, shared with /offer. See AcceptOfferButton. */}
        <AcceptOfferButton pickupId={pickup.id} />

        <Link href={`/offer?id=${pickup.id}`} className="block">
          <Button variant="ghost" fullWidth>
            Back to offer
          </Button>
        </Link>

      </PagePadding>
    </AppShell>
  );
}
