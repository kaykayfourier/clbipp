import Link from "next/link";
import { AppShell, PagePadding, SectionLabel } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockOffer } from "@/lib/mockOffer";

// ─── Page ────────────────────────────────────────────────────────────────────
// Static — driven entirely by mockOffer.ts.
// No backend connection on this screen (per spec).
// ?id= is threaded through to the accept flow so the handover page can
// update the correct pickup row.

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function OfferPage({ searchParams }: PageProps) {
  const { id } = await searchParams;
  // id may be undefined during early demo navigation — that's fine here.
  const pickupId = id ?? "";

  return (
    <AppShell
      title={pickupId ? `Offer · ${pickupId}` : "Estimated Offer"}
      showBack
      backHref={pickupId ? `/scheduled?id=${pickupId}` : "/dashboard"}
    >
      <PagePadding className="flex flex-col gap-5">

        {/* Pathway badge */}
        <div className="flex justify-center">
          <Badge variant="success" className="text-xs px-3 py-1 uppercase tracking-wider">
            {mockOffer.pathway}
          </Badge>
        </div>

        {/* Price hero */}
        <Card variant="elevated" className="flex flex-col items-center gap-1 py-6">
          <SectionLabel>Estimated Offer</SectionLabel>
          <p className="text-4xl font-semibold text-text-primary mt-2">
            ₹{mockOffer.estimatedPrice.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-text-secondary mt-1 text-center max-w-[220px] leading-relaxed">
            Estimated — final value confirmed after processing.
          </p>
        </Card>

        {/* Rationale */}
        <Card variant="tinted" className="flex flex-col gap-3">
          <SectionLabel>Why this price?</SectionLabel>
          <ul className="flex flex-col gap-2">
            {mockOffer.rationale.map((reason, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-bg">
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 4l1.5 1.5 3.5-3.5"
                      stroke="var(--color-success)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm text-text-primary leading-snug">
                  {reason}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-1">
          <Link href={`/offer-breakdown?id=${pickupId}`} className="block">
            <Button variant="secondary" fullWidth>
              View full breakdown
            </Button>
          </Link>

          <Link href={`/handover?id=${pickupId}`} className="block">
            <Button variant="primary" fullWidth>
              Accept offer
            </Button>
          </Link>

          <Link href={pickupId ? `/scheduled?id=${pickupId}` : "/dashboard"} className="block">
            <Button variant="ghost" fullWidth>
              Decline
            </Button>
          </Link>
        </div>

      </PagePadding>
    </AppShell>
  );
}
