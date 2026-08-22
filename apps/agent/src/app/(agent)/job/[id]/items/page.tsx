// /job/[id]/items  —  Batch 3 · Ali's lane, built by Aamir 2026-08-23
//
// NEW (W3/D1). The spine of the multi-item flow: every BatteryItem on the pickup
// with a confirmed/pending state and a running total. This is what the wireframe
// was missing — it assumed one battery per job (W3), and our model has always
// been Pickup → BatteryItem[].
//
// The two halves of each row are the point. LEFT is what the customer declared
// at booking; RIGHT is what the agent found. They are allowed to disagree, and a
// disagreement is a finding rather than something to tidy away — see the header
// of ./actions.ts.
//
// `hideNav` is required: (agent)/layout.tsx renders the nav and owns the
// clearance under it, and AppShell's own bar is the CUSTOMER's. Add no bottom
// padding.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 THE MANDATORY SAFETY GATE (W1 · Batch 2) IS THE TWO LINES BELOW MARKED
// "THE GATE". They survived this rewrite, which is exactly what the Batch 2 note
// asked for, and they must survive the next one:
//
//     const { data: { user } } = await createClient().auth.getUser()
//     await requireSafetyChecklist(id, user.id)
//
// `requireSafetyChecklist` enforces BOTH the passing-checklist requirement and
// this agent's ownership of the pickup, and it throws rather than returning a
// boolean — so once it has run, the pickup is this agent's and no separate
// ownership check is needed on this screen.
//
// Delete it and intake silently stops being gated: every screen still works, the
// checklist still saves, and the only thing that changed is that an agent can
// start handling batteries without confirming it is safe to.
// `scripts/smoke.mjs` asserts the gate in both directions (AGENT_ITEMS_GATE).
//
// Rationale in full: apps/agent/src/lib/safety-gate.ts
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import {
  categoryLabel,
  chemistryLabel,
  conditionLabel,
  intakeTotals,
  itemConfirmationState,
  outstandingReason,
  type ItemConfirmationState,
} from '@clbipp/core/intake'
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  PagePadding,
  SectionLabel,
} from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { itemNextHref, itemNextLabel } from '@/lib/job-nav'

const STATE_BADGE: Record<ItemConfirmationState, { label: string; variant: 'success' | 'warning' | 'default' }> = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  'needs-photo': { label: 'Photo needed', variant: 'warning' },
  pending: { label: 'Pending', variant: 'default' },
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ confirmed?: string }>
}) {
  const { id } = await params
  const { confirmed } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 🔴 THE GATE. Keep this. See the note at the top of the file.
  await requireSafetyChecklist(id, user.id)

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      vendor: { select: { fullName: true, companyName: true } },
      items: {
        select: {
          id: true,
          category: true,
          quantity: true,
          weightKg: true,
          condition: true,
          chemistry: true,
          confirmedWeightKg: true,
          confirmedCondition: true,
          agentPhotoUrls: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  // The gate already established that this pickup exists and is this agent's, so
  // a miss here means it was deleted between the two reads.
  if (!pickup) redirect('/')

  // Prisma `Decimal` columns cross into @clbipp/core as plain numbers — the
  // module is browser-safe and must not know what a Decimal is.
  const items = pickup.items.map((item) => ({
    ...item,
    weightKg: item.weightKg === null ? null : Number(item.weightKg),
    confirmedWeightKg: item.confirmedWeightKg === null ? null : Number(item.confirmedWeightKg),
  }))

  const totals = intakeTotals(items)

  return (
    <AppShell title="Items" showBack backHref={`/job/${pickup.id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {confirmed && (
          <Banner variant="success">
            Item recorded.{' '}
            {totals.allConfirmed
              ? 'Every line on this job is confirmed.'
              : `${totals.lines - totals.confirmedLines} still to go.`}
          </Banner>
        )}

        {/* ── The running total ────────────────────────────────────────────
            Weighed kg counts CONFIRMED lines only, so it never overstates what
            has actually been on a scale; declared kg counts every line. The two
            legitimately disagree mid-intake, which is why both are shown with
            their source named. */}
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              {/* One template string, not three JSX children: React's SSR output
                  puts `<!-- -->` separators between adjacent expression and text
                  nodes, which splits "0 of 3 confirmed" across the HTML and makes
                  it unassertable in scripts/smoke.mjs. */}
              <span className="text-[15px] font-bold text-text-primary">
                {`${totals.confirmedLines} of ${totals.lines} confirmed`}
              </span>
              <span className="font-mono text-xs text-text-secondary">{pickup.id}</span>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              {totals.units} unit{totals.units === 1 ? '' : 's'} ·{' '}
              <span className="font-semibold text-text-primary">
                {totals.weighedKg.toFixed(1)} kg weighed
              </span>{' '}
              against {totals.declaredKg.toFixed(1)} kg declared by{' '}
              {pickup.vendor.companyName ?? pickup.vendor.fullName}.
            </p>
          </CardContent>
        </Card>

        <SectionLabel>Lines on this job</SectionLabel>

        {items.length === 0 ? (
          <Banner variant="error">
            This job has no battery lines on it. Nothing can be assessed — raise it
            with the office before collecting anything.
          </Banner>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, index) => {
              const state = itemConfirmationState(item)
              const badge = STATE_BADGE[state]
              const reason = outstandingReason(item)

              return (
                <Card key={item.id} variant="elevated">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-text-primary">
                          Line {index + 1} · {categoryLabel(item.category)} × {item.quantity}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          Declared {Number(item.weightKg ?? 0).toFixed(1)} kg ·{' '}
                          {conditionLabel(item.condition) ?? item.condition}
                        </p>
                      </div>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>

                    {/* What the agent has recorded so far, or why not. */}
                    {state === 'pending' && !item.chemistry ? (
                      <p className="text-xs leading-relaxed text-text-secondary">
                        Not assessed yet.
                      </p>
                    ) : (
                      <div className="rounded-[10px] bg-background px-3 py-2">
                        <p className="text-xs font-semibold text-text-primary">
                          You recorded: {chemistryLabel(item.chemistry) ?? '—'} ·{' '}
                          {item.confirmedWeightKg === null
                            ? '— kg'
                            : `${item.confirmedWeightKg.toFixed(1)} kg`}{' '}
                          · {conditionLabel(item.confirmedCondition) ?? '—'}
                          {item.agentPhotoUrls.length > 0 &&
                            ` · ${item.agentPhotoUrls.length} photo${
                              item.agentPhotoUrls.length === 1 ? '' : 's'
                            }`}
                        </p>
                        {reason && (
                          <p className="mt-1 text-[11px] leading-relaxed text-warning-text">
                            {reason}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <Link href={`/job/${pickup.id}/items/${item.id}`}>
                        <Button variant={state === 'confirmed' ? 'secondary' : 'primary'} fullWidth>
                          {state === 'confirmed' ? 'Review this line' : 'Assess this line'}
                        </Button>
                      </Link>

                      {/* The D1 branch, surfaced on the row. Only ever offered
                          on a confirmed line — routing an unassessed item to a
                          rubric would ask the agent to score damage on a
                          chemistry nobody has established yet. */}
                      {state === 'confirmed' && (
                        <Link
                          href={itemNextHref(pickup.id, item.id, item.chemistry)}
                          className="text-center text-xs font-semibold text-text-primary underline"
                        >
                          {itemNextLabel(item.chemistry)}
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* ── Onward ───────────────────────────────────────────────────────
            One Offer covers the whole pickup (Batch 5a's roll-up screen), so
            this is genuinely blocked until every line has a price behind it.
            Rendered as inert text rather than a disabled button: a disabled
            control tells an agent nothing about what is missing, which is the
            same call the safety checklist's submit button made. */}
        {totals.allConfirmed ? (
          <Link href={`/job/${pickup.id}/offer`}>
            <Button variant="primary" fullWidth>
              Continue to quote
            </Button>
          </Link>
        ) : (
          <p className="rounded-[10px] border border-border px-4 py-3 text-center text-xs leading-relaxed text-text-secondary">
            Quote unlocks once all {totals.lines} line{totals.lines === 1 ? '' : 's'} are
            confirmed — the vendor gets one offer for the whole job.
          </p>
        )}
      </PagePadding>
    </AppShell>
  )
}
