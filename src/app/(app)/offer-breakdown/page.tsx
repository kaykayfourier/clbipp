import Link from "next/link";
import { AppShell, PagePadding, SectionLabel } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDivider } from "@/components/ui/card";
import { mockOffer } from "@/lib/mockOffer";

// ─── Page ────────────────────────────────────────────────────────────────────
// No backend connection — driven entirely by mockOffer.ts breakdown.
// Hazard Deduction is coloured using colors.hazard token.

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function OfferBreakdownPage({ searchParams }: PageProps) {
  const { id } = await searchParams;
  const pickupId = id ?? "";
  const { breakdown, estimatedPrice } = mockOffer;

  return (
    <AppShell
      title="How we valued it"
      showBack
      backHref={`/offer?id=${pickupId}`}
    >
      <PagePadding className="flex flex-col gap-5">

        {/* Breakdown card */}
        <Card variant="default" className="flex flex-col gap-0">

          {/* Final estimate hero */}
          <div className="flex items-center justify-between py-1 pb-4">
            <SectionLabel>Estimated Value</SectionLabel>
            <p className="text-2xl font-semibold text-text-primary">
              ₹{estimatedPrice.toLocaleString("en-IN")}
            </p>
          </div>

          <CardDivider className="my-0" />

          {/* Line items */}
          <div className="flex flex-col gap-0 pt-3">
            <LineItem
              label="Base Value"
              value={breakdown.baseValue}
              sign="positive"
            />
            <LineItem
              label="Recovery Bonus"
              value={breakdown.recoveryBonus}
              sign="positive"
            />
            <LineItem
              label="Transport"
              value={breakdown.transport}
              sign="negative"
            />
            {/* Hazard Deduction — uses hazard token colour */}
            <LineItem
              label="Hazard Deduction"
              value={breakdown.hazardDeduction}
              sign="hazard"
            />
          </div>

          <CardDivider />

          {/* Final */}
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-semibold text-text-primary">
              Final Estimate
            </span>
            <span className="text-base font-semibold text-text-primary">
              ₹{breakdown.finalEstimate.toLocaleString("en-IN")}
            </span>
          </div>
        </Card>

        {/* Explanation */}
        <Card variant="tinted">
          <p className="text-sm text-text-secondary leading-relaxed">
            The final price is confirmed after your batteries are collected,
            tested, and processed. Estimates may vary by up to ±8%.
          </p>
        </Card>

        {/* Accept CTA */}
        <Link href={`/handover?id=${pickupId}`} className="block">
          <Button variant="primary" fullWidth>
            Accept offer
          </Button>
        </Link>

        <Link href={`/offer?id=${pickupId}`} className="block">
          <Button variant="ghost" fullWidth>
            Back to offer
          </Button>
        </Link>

      </PagePadding>
    </AppShell>
  );
}

// ─── LineItem ────────────────────────────────────────────────────────────────

type LineItemSign = "positive" | "negative" | "hazard";

function LineItem({
  label,
  value,
  sign,
}: {
  label: string;
  value: number;
  sign: LineItemSign;
}) {
  const abs = Math.abs(value);
  const isDeduction = value < 0;

  let valueClass = "text-text-primary";
  if (sign === "hazard") {
    valueClass = "text-hazard";
  } else if (sign === "negative") {
    valueClass = "text-warning-text";
  }

  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-medium ${valueClass}`}>
        {isDeduction ? "−" : "+"}₹{abs.toLocaleString("en-IN")}
      </span>
    </div>
  );
}
