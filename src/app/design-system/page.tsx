// src/app/design-system/page.tsx
// ─── Back2Basics · Design System Showcase ────────────────────────────────────
// Route: /design-system
// Shows every primitive so the team can review tokens and components
// without needing a real Supabase backend.
// Protected in production — only accessible via the seed/sim surface.

import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardDivider,
} from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Banner, OfflineBanner } from "@/components/ui/banner";
import { ListRow, ListRowSkeleton } from "@/components/ui/list-row";
import { Timeline } from "@/components/ui/timeline";
import { EmptyState } from "@/components/states/empty-state";
import {
  LoadingState,
  SkeletonCard,
  SkeletonListRow,
} from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { PhoneFrame } from "@/components/layout/phone-frame";
import { colors, LIFECYCLE_STAGES } from "@/lib/tokens";
import type { LifecycleStage } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Design System · Back2Basics",
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#111111]">{title}</h2>
        {description && (
          <p className="text-sm text-[#666666] mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  );
}

// ─── Colour swatch ────────────────────────────────────────────────────────────

function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex flex-col gap-1.5 items-start">
      <div
        className="w-16 h-16 rounded-[10px] border border-[#E5E5E5]"
        style={{ backgroundColor: hex }}
      />
      <span className="text-xs font-medium text-[#111111]">{label}</span>
      <span className="text-[11px] text-[#666666] font-mono">{hex}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-[#F8F5EE]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#E5E5E5] bg-[#F8F5EE] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#111111]">
            <span className="text-[#C8F53D] text-sm font-bold font-mono">B2</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#111111]">Design System</h1>
            <p className="text-xs text-[#666666]">Back2Basics · Phase 1 primitives</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-14">

        {/* ── 1. Colour tokens ───────────────────────────────────────── */}
        <Section
          title="Colour tokens"
          description="Extracted from the wireframe. Map directly to Tailwind config + CSS vars."
        >
          <div className="flex flex-wrap gap-5">
            <Swatch label="Primary Green" hex={colors.primaryGreen} />
            <Swatch label="Primary Black" hex={colors.primaryBlack} />
            <Swatch label="Background" hex={colors.background} />
            <Swatch label="Surface" hex={colors.surface} />
            <Swatch label="Border" hex={colors.border} />
            <Swatch label="Text Primary" hex={colors.textPrimary} />
            <Swatch label="Text Secondary" hex={colors.textSecondary} />
            <Swatch label="Success" hex={colors.success} />
            <Swatch label="Error" hex={colors.error} />
            <Swatch label="Warning" hex={colors.warning} />
            <Swatch label="Info" hex={colors.info} />
          </div>
        </Section>

        {/* ── 2. Typography ──────────────────────────────────────────── */}
        <Section
          title="Typography"
          description="Scale used across all screens."
        >
          <div className="space-y-3 bg-white border border-[#E5E5E5] rounded-[14px] p-5">
            {(
              [
                ["text-4xl", "₹1,84,500", "4xl · 36px · Price hero"],
                ["text-2xl", "Dashboard", "2xl · 24px · Screen heading"],
                ["text-xl", "Recent pickups", "xl · 20px · Section heading"],
                ["text-lg font-semibold", "PKP-2042", "lg semibold · 18px"],
                ["text-base", "Request your first battery pickup to start recovering materials.", "base · 16px · Body"],
                ["text-sm", "Li-ion NMC · 24 units", "sm · 14px · List sub-text"],
                ["text-xs text-[#666666]", "08 Jun, 11:30", "xs · 12px · Caption / timestamp"],
                ["text-[11px] tracking-widest uppercase font-semibold text-[#666666]", "RECENT PICKUPS", "11px · All-caps label"],
              ] as [string, string, string][]
            ).map(([cls, sample, label]) => (
              <div key={label} className="flex items-baseline gap-4">
                <span className={`flex-1 ${cls}`}>{sample}</span>
                <span className="text-xs text-[#AAAAAA] shrink-0 hidden sm:block">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 3. Buttons ─────────────────────────────────────────────── */}
        <Section
          title="Button"
          description="Four variants × three sizes. Full-width and icon slots."
        >
          <Row>
            <Button variant="primary">Submit request</Button>
            <Button variant="secondary">View breakdown</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Cancel request</Button>
          </Row>
          <Row>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row>
            <Button loading>Submitting…</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Button fullWidth>Request a pickup</Button>
        </Section>

        {/* ── 4. Inputs ──────────────────────────────────────────────── */}
        <Section
          title="Field / Input"
          description="Field wraps Input, Select, or Textarea with label + hint + error."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="ds-company" required>
              <Input
                id="ds-company"
                placeholder="Altigreen Propulsion"
              />
            </Field>

            <Field
              label="Battery type"
              htmlFor="ds-battery"
              hint="Select the primary chemistry"
            >
              <Select id="ds-battery">
                <option value="">Select type</option>
                <option>Li-ion NMC</option>
                <option>LFP</option>
                <option>NiMH</option>
              </Select>
            </Field>

            <Field
              label="EPR / Producer registration ID"
              htmlFor="ds-epr"
              error="This field is required"
            >
              <Input
                id="ds-epr"
                placeholder="EPR-PRO-XXXXXX"
                error
              />
            </Field>

            <Field
              label="Notes (optional)"
              htmlFor="ds-notes"
              hint="Access details, contact on site…"
            >
              <Textarea id="ds-notes" rows={3} placeholder="Access via gate B…" />
            </Field>
          </div>
        </Section>

        {/* ── 5. Cards ───────────────────────────────────────────────── */}
        <Section
          title="Card"
          description="Base surface container — five variants."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Card variant="default">
              <CardHeader>
                <CardTitle>Default card</CardTitle>
                <CardDescription>Border, no shadow</CardDescription>
              </CardHeader>
              <CardDivider />
              <CardContent>
                <p className="text-sm text-[#666666]">Card content goes here.</p>
              </CardContent>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated card</CardTitle>
                <CardDescription>Border + shadow — used for key stats</CardDescription>
              </CardHeader>
            </Card>

            <Card variant="tinted">
              <CardHeader>
                <CardTitle>Tinted card</CardTitle>
                <CardDescription>Cream background — info / locked states</CardDescription>
              </CardHeader>
            </Card>

            <Card variant="outline">
              <CardHeader>
                <CardTitle>Outline card</CardTitle>
                <CardDescription>Transparent background</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button size="sm" variant="secondary">Action</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* ── 6. Status badges ───────────────────────────────────────── */}
        <Section
          title="StatusBadge"
          description="All seven lifecycle stages. Pass pulse=true for the active state."
        >
          <Row>
            {LIFECYCLE_STAGES.map((stage) => (
              <StatusBadge key={stage} status={stage as LifecycleStage} />
            ))}
          </Row>
          <Row>
            <StatusBadge status="scheduled" pulse />
            <span className="text-sm text-[#666666]">← pulse=true (active stage)</span>
          </Row>
          <Row>
            <Badge variant="default">All</Badge>
            <Badge variant="success">Recycling</Badge>
            <Badge variant="warning">Refurb</Badge>
            <Badge variant="outline">2026</Badge>
          </Row>
        </Section>

        {/* ── 7. Banners ─────────────────────────────────────────────── */}
        <Section
          title="Banner"
          description="Inline notification strips."
        >
          <div className="space-y-3">
            <Banner variant="info">
              We&apos;ll notify you as your battery moves through each stage.
            </Banner>
            <Banner variant="success">
              PKP-2042 has been collected. Your receipt and a secure tracking link are on the way.
            </Banner>
            <Banner variant="warning">
              Pickup is scheduled for tomorrow between 10:00–12:00.
            </Banner>
            <Banner variant="error">
              Certificate generation failed. Try downloading again.
            </Banner>
            <Banner variant="tinted" icon={null}>
              Recovery breakdown and certificate unlock once recovered.
            </Banner>
            <OfflineBanner />
          </div>
        </Section>

        {/* ── 8. List rows ───────────────────────────────────────────── */}
        <Section
          title="ListRow"
          description="Pickup rows for the dashboard and compliance log."
        >
          <div className="space-y-2">
            <ListRow
              id="PKP-2042"
              subtitle="Li-ion NMC · 24 units"
              status="scheduled"
              pulseBadge
            />
            <ListRow
              id="PKP-2041"
              subtitle="LFP · 60 units"
              status="processed"
            />
            <ListRow
              id="PKP-2039"
              subtitle="Li-ion NMC · 18 units"
              status="recovered"
            />
            <ListRow
              id="PKP-2031"
              subtitle="Li-ion NMC · 30 units"
              status="certified"
            />
            {/* Skeleton */}
            <ListRowSkeleton />
          </div>
        </Section>

        {/* ── 9. Timeline ────────────────────────────────────────────── */}
        <Section
          title="Timeline"
          description="Presentational lifecycle tracker. Pass currentStage + optional timestamps."
        >
          <div className="grid gap-6 sm:grid-cols-3">
            {/* In-progress */}
            <Card>
              <CardHeader>
                <CardTitle>In progress</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <Timeline
                  currentStage="processed"
                  pulse
                  stages={{
                    collected: { timestamp: "08 Jun, 11:30" },
                    tested: { timestamp: "09 Jun, 16:10" },
                    processed: { sublabel: "In progress" },
                  }}
                />
              </CardContent>
            </Card>

            {/* Recovered */}
            <Card>
              <CardHeader>
                <CardTitle>Recovered</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <Timeline
                  currentStage="recovered"
                  stages={{
                    collected: { timestamp: "02 Jun" },
                    tested: { timestamp: "03 Jun" },
                    processed: { timestamp: "05 Jun" },
                    recovered: { timestamp: "07 Jun, 13:20" },
                  }}
                />
              </CardContent>
            </Card>

            {/* Certified */}
            <Card>
              <CardHeader>
                <CardTitle>Certified</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <Timeline
                  currentStage="certified"
                  stages={{
                    collected: { timestamp: "24 May" },
                    tested: { timestamp: "25 May" },
                    processed: { timestamp: "27 May" },
                    recovered: { timestamp: "29 May" },
                    certified: { timestamp: "31 May, 17:00" },
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── 10. State components ───────────────────────────────────── */}
        <Section
          title="States"
          description="Empty, loading, and error — consistent across all screens."
        >
          <div className="grid gap-6 sm:grid-cols-3">
            <Card padding="none">
              <EmptyState
                heading="No pickups yet"
                description="Request your first battery pickup to start recovering materials and earning EPR certificates."
                actionLabel="Request a pickup"
              />
            </Card>

            <Card padding="none">
              <LoadingState label="Loading pickups…" />
            </Card>

            <Card padding="none">
              <ErrorState
                heading="Couldn't load pickups"
                message="Check your connection and try again."
                actionLabel="Try again"
              />
            </Card>
          </div>

          {/* Skeletons */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#666666]">Skeletons</p>
            <SkeletonListRow />
            <SkeletonCard />
          </div>

          {/* Inline error */}
          <ErrorState
            inline
            heading="Upload failed"
            message="File must be under 5 MB."
            actionLabel="Retry"
          />
        </Section>

        {/* ── 11. Phone frames ───────────────────────────────────────── */}
        <Section
          title="PhoneFrame"
          description="Used to preview screens in documentation. Not rendered in the production app."
        >
          <div className="flex flex-wrap gap-8">
            <PhoneFrame label="Empty dashboard">
              <EmptyState
                heading="No pickups yet"
                description="Request your first battery pickup to start recovering materials and earning EPR certificates."
                actionLabel="Request a pickup"
              />
            </PhoneFrame>

            <PhoneFrame label="Timeline — in progress">
              <div className="px-4 py-5">
                <p className="text-[11px] font-semibold tracking-widest text-[#666666] uppercase mb-4">LIFECYCLE</p>
                <Timeline
                  currentStage="processed"
                  pulse
                  stages={{
                    collected: { timestamp: "08 Jun, 11:30" },
                    tested: { timestamp: "09 Jun, 16:10" },
                    processed: { sublabel: "In progress" },
                  }}
                />
              </div>
            </PhoneFrame>
          </div>
        </Section>

      </div>

      {/* Footer */}
      <footer className="border-t border-[#E5E5E5] px-6 py-6 text-center">
        <p className="text-xs text-[#AAAAAA]">
          Back2Basics · Person C deliverable · Phase 1 · Design system
        </p>
      </footer>
    </div>
  );
}
