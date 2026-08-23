import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@clbipp/auth";
import { prisma } from "@clbipp/database";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Button } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Timeline } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { CATEGORY_LABELS } from "../book/copy";

// ─── Page ────────────────────────────────────────────────────────────────────
// The confirmation screen a customer lands on AFTER accepting an offer.
//
// ⚠ Batch 5b (D7) changed what "accepted" means. Accepting no longer collects
// anything: it stamps `Offer.acceptedAt` and leaves the status at `offered`
// until the field agent writes `collected` from the site. So this screen has
// two faces, and the status tells them apart:
//
//   offered + acceptedAt   → "Offer Accepted" — the agent is still coming
//   collected and beyond   → "Handover Confirmed" — the batteries are with us
//
// 🔴 The guard below keys on `offer.acceptedAt`, and /offer's guard keys on the
// SAME field in the opposite direction. They must stay symmetrical: if one ever
// switches back to a status range, the two screens redirect to each other
// forever.
//
// ⚠ It used to be the thing that DID the accepting: it called acceptOffer()
// during its own render, so a GET advanced the lifecycle. Batch 12 moved that
// to `acceptOfferAndConfirm`, the POST form action behind AcceptOfferButton.
// This page is now a pure read, which is why it is finally in `npm run smoke`.
//
// Because the write moved out, a direct GET has to be handled: someone opening
// /handover?id=… by hand has not accepted anything, so an unaccepted pickup is
// sent back to its offer rather than shown a confirmation for a decision nobody
// made.
//
// Data comes from Prisma scoped by vendorId. The old query read `battery_type`
// and `approx_quantity`, which are schema-v1 columns that `createPickupWithItems`
// stopped writing in Batch 5 — they are null on every pickup in the database, so
// the summary card rendered a blank type and the literal string "null units".
// Category lives on the Pickup header and the real quantities/weights live on
// BatteryItem.

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function HandoverPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id) {
    redirect("/dashboard");
  }

  const result = await getCurrentProfile();
  if (!result) redirect("/login");

  // Scoped by vendorId — Prisma bypasses RLS, so ownership is enforced here.
  const pickup = await prisma.pickup.findFirst({
    where: { id, vendorId: result.user.id },
    select: {
      id: true,
      status: true,
      category: true,
      location: true,
      items: { select: { quantity: true, weightKg: true } },
      offer: { select: { acceptedAt: true } },
    },
  });

  if (!pickup) redirect("/dashboard");

  if (pickup.status === "cancelled") {
    redirect(`/track/${pickup.id}`);
  }

  // Nothing was accepted — either a hand-typed URL or a stale tab. Send them to
  // the decision instead of confirming one that hasn't been taken.
  //
  // This used to read `isStageBefore(status, "collected")`, which stopped
  // working the moment accepting left the status at `offered`: an accepted
  // pickup would have been bounced straight back to the offer it had just
  // accepted. The acceptance timestamp is the only honest signal.
  if (!pickup.offer?.acceptedAt) {
    redirect(`/offer?id=${pickup.id}`);
  }

  // Accepted, but the agent hasn't collected yet. Everything below branches on
  // this rather than on a stage comparison, for the reason above.
  const awaitingCollection = pickup.status === "offered";

  const units = pickup.items.reduce((sum, item) => sum + item.quantity, 0);
  const weightKg = pickup.items.reduce((sum, item) => sum + Number(item.weightKg), 0);

  return (
    <AppShell title={awaitingCollection ? "Offer Accepted" : "Handover Confirmed"} hideNav>
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
              {awaitingCollection ? "Offer Accepted" : "Handover Confirmed"}
            </h1>
            <p className="text-sm text-text-secondary mt-1 font-mono">
              {pickup.id}
            </p>
          </div>
        </div>

        {/* Timeline. Truncated at whichever stage the pickup has actually
            reached — accepting an offer does NOT advance it past `offered`, so
            showing `collected` here would tell the customer their batteries had
            been picked up before anyone had been to the site. */}
        <Card variant="default">
          <SectionLabel className="mb-3">Lifecycle</SectionLabel>
          {awaitingCollection ? (
            <Timeline
              currentStage="offered"
              endStage="offered"
              stages={{
                requested: { sublabel: "Complete" },
                scheduled: { sublabel: "Complete" },
                offered: { sublabel: "Accepted" },
              }}
            />
          ) : (
            <Timeline
              currentStage="collected"
              endStage="collected"
              stages={{
                requested: { sublabel: "Complete" },
                scheduled: { sublabel: "Complete" },
                collected: { sublabel: "In progress" },
              }}
            />
          )}
        </Card>

        {/* Pickup summary. Category comes off the header row; units and weight
            are summed from the BatteryItem lines, which is where booking has
            actually written them since Batch 5. Chemistry is deliberately not
            shown — it's the field agent's call, confirmed per item after
            collection, and this screen fires before that. */}
        <Card variant="tinted" className="flex flex-col gap-3">
          <SectionLabel>Pickup Details</SectionLabel>
          <SummaryRow label="Category" value={CATEGORY_LABELS[pickup.category]} />
          <hr className="border-t border-border" />
          <SummaryRow label="Quantity" value={`${units} units`} />
          <hr className="border-t border-border" />
          <SummaryRow
            label="Approx. weight"
            value={`${weightKg.toLocaleString("en-IN")} kg`}
          />
          <hr className="border-t border-border" />
          <SummaryRow label="Location" value={pickup.location} />
        </Card>

        {/* Next steps. The pre-collection copy is the point of Batch 5b: the
            batteries are still the vendor's until the agent has them, and
            saying otherwise here was the visible half of the vendor marking
            their own load collected. */}
        <Banner variant="success">
          {awaitingCollection
            ? "Your offer is accepted. Your collection agent will weigh and load the batteries on site, and confirm the handover from there."
            : "Your batteries have been collected. Our collection partner will contact you shortly to arrange the final handover details."}
        </Banner>

        <Card variant="tinted">
          <SectionLabel className="mb-2">Next Steps</SectionLabel>
          <p className="text-sm text-text-secondary leading-relaxed">
            {awaitingCollection
              ? "Keep the load accessible and the packaging sealed until the agent arrives. Once collected and processed, your EPR certificate will be available under Certificates."
              : "Once processed, your EPR certificate will be available under Certificates. You'll receive a notification at each stage."}
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

