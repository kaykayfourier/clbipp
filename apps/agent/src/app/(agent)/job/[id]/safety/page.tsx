// /job/[id]/safety  —  Batch 2 · Aamir
//
// NEW (W1). The mandatory gate between `arrived` and intake. The wireframe
// omitted it entirely and all three HR documents require it — plan §2 calls it
// the one feature that makes this a battery app.
//
// ⚠ THE SCREEN IS NOT THE GATE. This page renders the checklist; the gate is
// `requireSafetyChecklist` in @/lib/safety-gate, called server-side from the
// items page. Hiding a button is not access control, and the "Done when" list
// for this batch says so explicitly: the block is verified by URL.
//
// Deliberately NOT gated on `arrived`. Ownership is checked; the stage is not.
// Reading or filling a checklist writes no lifecycle state, so an early or
// re-visited checklist is harmless — whereas a stage gate here would trap an
// agent who tapped back out of intake, and would make the screen unreachable
// for exactly the seeded job the smoke run opens it on.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import {
  hasDamagedUnits,
  labelsFor,
  lithiumLikelyFromCategories,
  readStoredAnswers,
  readStoredLithiumPresent,
  type SafetyItemKey,
} from '@clbipp/core/safety'
import { AppShell, Banner, Button, Card, CardContent, PagePadding } from '@clbipp/ui'

import { SafetyChecklistForm } from './SafetyChecklistForm'

const CATEGORY_LABELS: Record<string, string> = {
  portable: 'Portable',
  automotive: 'Automotive',
  industrial: 'Industrial',
  ev: 'EV',
}

/**
 * Why the lithium toggle starts where it does, in words the agent can check.
 *
 * Shown because the default is a GUESS and the agent needs to know that to
 * decide whether to override it. A pre-set control with no stated basis reads
 * as fact.
 */
function lithiumGuessReason(categories: string[], likely: boolean): string {
  const listed = [...new Set(categories)]
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .join(', ')

  if (!likely) {
    return `The customer declared ${listed || 'no items'} only, which is usually lead-acid — so this starts at No. Change it if you can see lithium packs.`
  }
  return `The customer declared ${listed || 'no items'}, which can include lithium — so this starts at Yes. Chemistry is not confirmed until you assess each item.`
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; failed?: string }>
}) {
  const { id } = await params
  const { error, failed } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      status: true,
      vendor: { select: { fullName: true, companyName: true } },
      items: { select: { category: true, condition: true } },
      safetyChecklist: { select: { items: true, passed: true, completedAt: true } },
    },
  })

  // 🔴 Ownership enforced in code — Prisma bypasses RLS (D10) and there is no
  // agent SELECT policy behind this read. `notFound()` rather than a "not
  // yours" message, so the screen doesn't confirm a pickup id exists to an
  // agent with no business knowing. Same call as job detail makes.
  if (!pickup || pickup.agentId !== user.id) notFound()

  const categories = pickup.items.map((item) => item.category)
  const conditions = pickup.items.map((item) => item.condition)

  const guessedLithium = lithiumLikelyFromCategories(categories)
  const damagedUnitsPresent = hasDamagedUnits(conditions)

  const stored = pickup.safetyChecklist
  const defaultAnswers = readStoredAnswers(stored?.items)
  const defaultLithiumPresent = readStoredLithiumPresent(stored?.items, guessedLithium)

  // Outstanding items from the previous submission, highlighted inline on the
  // rows they belong to. Only surfaced when the agent has just come back from a
  // failed submit — otherwise a returning agent gets a red list for a checklist
  // they may be about to complete anyway.
  const missing: SafetyItemKey[] =
    failed === '1' && stored && !stored.passed
      ? (readStoredMissing(stored.items) as SafetyItemKey[])
      : []

  const alreadyPassed = stored?.passed === true

  return (
    <AppShell title="Safety checklist" showBack backHref={`/job/${pickup.id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}

        {missing.length > 0 && (
          <Banner variant="error">
            {missing.length} item{missing.length === 1 ? '' : 's'} still outstanding:{' '}
            {labelsFor(missing).join(' · ')}. Intake stays locked until every item is
            confirmed.
          </Banner>
        )}

        {alreadyPassed ? (
          // ── Completed state ───────────────────────────────────────────────
          // Re-submitting is still allowed (the row upserts on a unique
          // pickup_id) but it is not the default action — the agent's next step
          // is intake, and re-opening a passed checklist should be a decision,
          // not the path of least resistance.
          <>
            <Banner variant="success">
              Safety checklist completed
              {stored?.completedAt
                ? ` ${stored.completedAt.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : ''}
              .
            </Banner>

            <Card variant="elevated">
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm font-bold text-text-primary">
                  {pickup.vendor.companyName ?? pickup.vendor.fullName}
                </p>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Every required item was confirmed for this job. Intake is
                  unlocked.
                </p>
              </CardContent>
            </Card>

            <Link href={`/job/${pickup.id}/items`}>
              <Button variant="primary" fullWidth>
                Continue to intake
              </Button>
            </Link>

            <details className="text-xs text-text-secondary">
              <summary className="cursor-pointer py-2 font-semibold">
                Redo the checklist
              </summary>
              <div className="pt-2">
                <SafetyChecklistForm
                  pickupId={pickup.id}
                  defaultAnswers={defaultAnswers}
                  defaultLithiumPresent={defaultLithiumPresent}
                  damagedUnitsPresent={damagedUnitsPresent}
                  missing={[]}
                  lithiumGuessReason={lithiumGuessReason(categories, guessedLithium)}
                />
              </div>
            </details>
          </>
        ) : (
          // ── The checklist ─────────────────────────────────────────────────
          <>
            <Banner variant="warning">
              Complete this before handling any battery. Required on every pickup.
            </Banner>

            <SafetyChecklistForm
              pickupId={pickup.id}
              defaultAnswers={defaultAnswers}
              defaultLithiumPresent={defaultLithiumPresent}
              damagedUnitsPresent={damagedUnitsPresent}
              missing={missing}
              lithiumGuessReason={lithiumGuessReason(categories, guessedLithium)}
            />
          </>
        )}
      </PagePadding>
    </AppShell>
  )
}

/**
 * The `missing` array off a stored row.
 *
 * Local rather than in @clbipp/core/safety because it is a presentation detail
 * of this one screen — the package's job is to COMPUTE `missing`, and it already
 * returns it from `evaluateChecklist`. Reads defensively for the same reason
 * `readStoredAnswers` does: this is a Json column, and a row it can't parse
 * should highlight nothing rather than throw.
 */
function readStoredMissing(items: unknown): string[] {
  if (typeof items !== 'object' || items === null) return []
  const record = items as Record<string, unknown>
  if (!Array.isArray(record.missing)) return []
  return record.missing.filter((k): k is string => typeof k === 'string')
}
