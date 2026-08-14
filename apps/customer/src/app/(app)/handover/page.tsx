import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@clbipp/auth";
import { prisma } from "@clbipp/database";
import { AppShell, PagePadding, SectionLabel } from "@clbipp/ui";
import { Button } from "@clbipp/ui";
import { Card } from "@clbipp/ui";
import { Timeline } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { isStageBefore } from "@clbipp/ui";
import { CATEGORY_LABELS } from "../book/copy";

// ─── Page ────────────────────────────────────────────────────────────────────
// The confirmation screen a customer lands on AFTER accepting an offer.
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
    },
  });

  if (!pickup) redirect("/dashboard");

  // Nothing was accepted — either a hand-typed URL or a stale tab. Send them to
  // the decision instead of confirming one that hasn't been taken.
  if (isStageBefore(pickup.status, "collected")) {
    redirect(`/offer?id=${pickup.id}`);
  }
  if (pickup.status === "cancelled") {
    redirect(`/track/${pickup.id}`);
  }

  const units = pickup.items.reduce((sum, item) => sum + item.quantity, 0);
  const weightKg = pickup.items.reduce((sum, item) => sum + Number(item.weightKg), 0);

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
            <p className="text-sm text-text-secondary mt-1 font-mono">
              {pickup.id}
            </p>
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

