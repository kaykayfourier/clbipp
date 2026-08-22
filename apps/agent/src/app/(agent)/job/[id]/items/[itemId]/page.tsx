// /job/[id]/items/[itemId]  —  Batch 3 · Ali's lane, built by Aamir 2026-08-23
//
// NEW (D1). One line of the pickup: the customer's declaration shown read-only,
// and the agent's confirmation captured beside it — chemistry, weighed kg,
// condition, photos.
//
// 🔴 THE GATE RUNS HERE TOO. Batch 2 wired `requireSafetyChecklist` into the
// item LIST only, and left a note that every screen downstream of intake should
// call it. This is the first of those. It is one indexed read, it enforces
// ownership as well as the checklist, and without it this screen is a way around
// the gate: the item id is a uuid, but the pickup id is right there in the URL.
//
// 🔴 OWNERSHIP IS TWO CHECKS, NOT ONE. The gate proves the PICKUP is this
// agent's. The `pickupId` filter on the item read proves the ITEM belongs to
// that pickup. Without the second, an agent could open their own job's URL with
// another job's item id and see — then overwrite — a battery that isn't on this
// site. ./actions.ts makes the identical pair of checks on the write.
//
// `hideNav` is required: (agent)/layout.tsx owns the nav and the clearance under
// it. Add no bottom padding.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import {
  categoryLabel,
  chemistryLabel,
  conditionLabel,
  itemConfirmationState,
  outstandingReason,
} from '@clbipp/core/intake'
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  DetailRow,
  PagePadding,
  SectionLabel,
} from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { itemNextHref, itemNextLabel } from '@/lib/job-nav'

import { ItemConfirmForm } from './ItemConfirmForm'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id, itemId } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 🔴 THE GATE — checklist + pickup ownership, in one call. See the note above.
  await requireSafetyChecklist(id, user.id)

  // 🔴 Scoped to the pickup, not just the item id. See the note above.
  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId: id },
    select: {
      id: true,
      pickupId: true,
      category: true,
      quantity: true,
      weightKg: true,
      condition: true,
      photoUrls: true,
      chemistry: true,
      confirmedWeightKg: true,
      confirmedCondition: true,
      agentPhotoUrls: true,
      recordedAt: true,
    },
  })

  // `notFound()` rather than a message — same posture as job detail and the
  // checklist screen: don't confirm that an item id exists to someone with no
  // business knowing.
  if (!item) notFound()

  const declaredWeightKg = item.weightKg === null ? null : Number(item.weightKg)
  const confirmedWeightKg =
    item.confirmedWeightKg === null ? null : Number(item.confirmedWeightKg)

  const state = itemConfirmationState({
    chemistry: item.chemistry,
    confirmedWeightKg,
    confirmedCondition: item.confirmedCondition,
    agentPhotoUrls: item.agentPhotoUrls,
  })
  const reason = outstandingReason({
    chemistry: item.chemistry,
    confirmedWeightKg,
    confirmedCondition: item.confirmedCondition,
    agentPhotoUrls: item.agentPhotoUrls,
  })

  // Every bucket is private, so a stored path is only viewable through a
  // short-lived signed URL — and signing a path grants access to it, which is
  // why the two ownership checks above have to come first. Both photo sets are
  // minted in one round trip; they are kept visually apart below because they
  // are evidence from two different people.
  const { urls } = await createSignedUrls('pickup-photos', [
    ...item.photoUrls,
    ...item.agentPhotoUrls,
  ])
  const photoUrl = new Map(urls.map((u) => [u.path, u.url]))

  return (
    <AppShell title={`Line · ${categoryLabel(item.category)}`} showBack backHref={`/job/${id}/items`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}

        {/* ── What the customer declared ────────────────────────────────────
            Read-only, always. This half is evidence and the agent never edits
            it — including `category`, which the task sheet listed as an agent
            field but which has no confirmed counterpart in the schema. See the
            CATEGORY_LABELS note in @clbipp/core/intake. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Customer declared</SectionLabel>
            <Badge variant={state === 'confirmed' ? 'success' : 'default'}>
              {state === 'confirmed' ? 'Confirmed' : 'Not yet confirmed'}
            </Badge>
          </div>

          <Card variant="elevated">
            <CardContent className="flex flex-col">
              <DetailRow label="Category" value={categoryLabel(item.category)} />
              <DetailRow label="Quantity" value={`${item.quantity} unit${item.quantity === 1 ? '' : 's'}`} />
              <DetailRow
                label="Weight"
                value={declaredWeightKg === null ? 'Not given' : `${declaredWeightKg.toFixed(1)} kg`}
              />
              <DetailRow
                label="Condition"
                value={conditionLabel(item.condition) ?? item.condition}
                last
              />
            </CardContent>
          </Card>

          {item.photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {item.photoUrls.map((path) => {
                const url = photoUrl.get(path)
                if (!url) return null
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={path}
                    src={url}
                    alt="Customer's photo of this line at booking"
                    className="aspect-square w-full rounded-[10px] border border-border object-cover"
                  />
                )
              })}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-text-secondary">
            Recorded by the customer at booking. Nothing you enter below changes
            it — the two records are kept side by side on purpose.
          </p>
        </div>

        {/* ── Already recorded ──────────────────────────────────────────────
            Shown above the form so a returning agent can see what is stored
            without reading it out of pre-filled inputs. */}
        {item.recordedAt && (
          <Card variant="elevated">
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm font-bold text-text-primary">
                You recorded {chemistryLabel(item.chemistry) ?? '—'} ·{' '}
                {confirmedWeightKg === null ? '— kg' : `${confirmedWeightKg.toFixed(1)} kg`} ·{' '}
                {conditionLabel(item.confirmedCondition) ?? '—'}
              </p>
              <p className="text-[11px] text-text-secondary">
                {item.recordedAt.toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {declaredWeightKg !== null && confirmedWeightKg !== null && (
                  <>
                    {' · '}
                    {Math.abs(confirmedWeightKg - declaredWeightKg) < 0.05
                      ? 'matches the declared weight'
                      : `${confirmedWeightKg > declaredWeightKg ? '+' : ''}${(
                          confirmedWeightKg - declaredWeightKg
                        ).toFixed(1)} kg against declared`}
                  </>
                )}
              </p>
              {reason && (
                <p className="text-[11px] font-semibold leading-relaxed text-warning-text">
                  {reason}
                </p>
              )}

              {item.agentPhotoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {item.agentPhotoUrls.map((path) => {
                    const url = photoUrl.get(path)
                    if (!url) return null
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={path}
                        src={url}
                        alt="Your photo of this line on site"
                        className="aspect-square w-full rounded-[10px] border border-border object-cover"
                      />
                    )
                  })}
                </div>
              )}

              {state === 'confirmed' && (
                <Link href={itemNextHref(id, item.id, item.chemistry)}>
                  <Button variant="primary" fullWidth>
                    {itemNextLabel(item.chemistry)}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── The confirmation ──────────────────────────────────────────────
            Re-submitting is always allowed: an agent who mis-taps a chemistry
            two lines into a job must be able to fix it without an admin. */}
        <SectionLabel>{item.recordedAt ? 'Re-record this line' : 'What you found'}</SectionLabel>

        <ItemConfirmForm
          pickupId={id}
          itemId={item.id}
          userId={user.id}
          declaredWeightKg={declaredWeightKg}
          declaredCondition={item.condition}
          defaultChemistry={item.chemistry}
          defaultCondition={item.confirmedCondition ?? item.condition}
          existingPhotoPaths={item.agentPhotoUrls}
        />
      </PagePadding>
    </AppShell>
  )
}
