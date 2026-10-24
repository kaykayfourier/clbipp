'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { MIN_UNTAGGED_REASON_CHARS, parseCode } from '@clbipp/core/tags'

// ─── Tagging the load at collection (FV10 · FD12, FD13) ──────────────────────
// Feedback §4.2: "each battery, or an operationally appropriate battery lot,
// should therefore receive an identifiable tag" linked to the pickup, the item
// and the transport box. One pre-issued tag per battery LINE (a line is the lot
// in this data model), bound here, before the vendor signs.
//
// 📌 The agent app's write rules, as in job/[id]/actions.ts: identity from the
// SESSION, never a form field; the `agentId === user.id` re-check in code
// standing in for the RLS policy Prisma bypasses (D10); POST, never GET.
//
// Plain server-action FORMS rather than client-side calls, so each write has a
// `$ACTION_ID_…` in the rendered page and can be driven through the real HTTP
// path in verification — the same reason the admin console's forms are plain.
//
// ⚠ Allowed from the moment the vendor accepts until the hub drop-off — so an
// agent who collected with a line untagged (FD13) can still tag it in the van.
// After drop-off the hub owns tagging (`tagAtHub` in the admin app).
//
// 🔴 AF4 · FD22 REVERSES FD13's "never a hard stop". An agent can no longer
// decide alone that a line leaves without a tag: they REQUEST it
// (`requestTagExceptionAction`), and collection stays blocked until an admin
// approves on /exceptions. The approval is what writes `untaggedReason`, so
// confirmCollection's gate (tag OR reason) and every reader after it are
// unchanged.

type Ctx = { pickupId: string; itemId: string; back: string }

function readCtx(formData: FormData): Ctx {
  const pickupId = String(formData.get('pickupId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  // Only two places render these forms; anything else falls back to collect.
  const requested = String(formData.get('returnTo') ?? '')
  const base = `/job/${encodeURIComponent(pickupId)}`
  const back = requested === `${base}/receipt` ? requested : `${base}/collect`
  return { pickupId, itemId, back }
}

function finish(ctx: Ctx, result: { error?: string; ok?: string }): never {
  revalidatePath(ctx.back)
  const q = result.error ? `error=${encodeURIComponent(result.error)}` : `ok=${encodeURIComponent(result.ok ?? 'Done.')}`
  redirect(`${ctx.back}?${q}`)
}

/** The session agent's own pickup, in a state where tagging is allowed. */
async function loadTaggablePickup(ctx: Ctx) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pickup = await prisma.pickup.findFirst({
    // 🔴 In-code ownership: the whole access boundary on this write (D10).
    where: { id: ctx.pickupId, agentId: user.id },
    select: {
      id: true,
      status: true,
      custodyBatchId: true,
      offer: { select: { acceptedAt: true } },
      collectionRun: {
        select: {
          id: true,
          agentId: true,
          containers: { where: { unloadedAt: null }, select: { containerId: true } },
        },
      },
      items: { select: { id: true, untaggedReason: true, tag: { select: { code: true } } } },
    },
  })
  if (!pickup) return { user, pickup: null, error: 'Job not found.' }

  const taggable =
    (pickup.status === 'offered' && pickup.offer?.acceptedAt) ||
    (pickup.status === 'collected' && pickup.custodyBatchId === null)
  if (!taggable) {
    return {
      user,
      pickup: null,
      error:
        pickup.status === 'offered'
          ? 'Tags go on once the vendor has accepted the offer.'
          : 'This load has been handed in at the hub — the hub tags any line still without one.',
    }
  }
  return { user, pickup, error: null }
}

export async function bindItemTagAction(formData: FormData) {
  const ctx = readCtx(formData)
  const { user, pickup, error } = await loadTaggablePickup(ctx)
  if (!pickup) finish(ctx, { error: error ?? 'Job not found.' })

  const item = pickup.items.find((i) => i.id === ctx.itemId)
  if (!item) finish(ctx, { error: 'That line is not on this job.' })

  const parsed = parseCode(String(formData.get('code') ?? ''))
  if (!parsed.ok) finish(ctx, { error: parsed.error })
  if (parsed.kind !== 'tag') {
    finish(ctx, { error: `${parsed.code} is a transport box. Scan the battery tag from your sheet.` })
  }

  if (item.tag) {
    if (item.tag.code === parsed.code) finish(ctx, { ok: `${parsed.code} is already on this line.` })
    finish(ctx, { error: `This line already carries ${item.tag.code}. Remove it first if that was a mistake.` })
  }

  // The box this line goes into: the one chosen, if it is really loaded on this
  // job's run; otherwise the run's only loaded box; otherwise none (a
  // standalone job, or a run not started yet).
  const loaded = pickup.collectionRun?.agentId === user.id ? pickup.collectionRun.containers.map((c) => c.containerId) : []
  const chosen = String(formData.get('containerId') ?? '')
  const containerId = chosen && loaded.includes(chosen) ? chosen : loaded.length === 1 ? loaded[0] : null

  const tag = await prisma.itemTag.findUnique({ where: { code: parsed.code }, select: { id: true, batteryItemId: true } })
  if (!tag) finish(ctx, { error: `${parsed.code} was never issued. Check the sticker, or use another from your sheet.` })
  if (tag.batteryItemId) finish(ctx, { error: `${parsed.code} is already on another battery. Use a fresh tag.` })

  const bound = await prisma.$transaction(async (tx) => {
    // Guarded on "still unbound" — the same tag cannot be won twice.
    const updated = await tx.itemTag.updateMany({
      where: { id: tag.id, batteryItemId: null },
      data: { batteryItemId: item.id, containerId, boundBy: user.id, boundAt: new Date(), boundAtHub: false },
    })
    if (updated.count === 0) return false
    // A line tagged after an earlier "no tag" is tagged now — the reason goes.
    if (item.untaggedReason) {
      await tx.batteryItem.update({ where: { id: item.id }, data: { untaggedReason: null } })
    }
    // AF4 — and a request the office has not answered yet is moot.
    await tx.tagException.updateMany({
      where: { batteryItemId: item.id, status: 'pending' },
      data: { status: 'withdrawn' },
    })
    return true
  })
  if (!bound) finish(ctx, { error: `${parsed.code} was just used on another battery. Use a fresh tag.` })

  finish(ctx, { ok: `${parsed.code} bound.` })
}

export async function unbindItemTagAction(formData: FormData) {
  const ctx = readCtx(formData)
  const { pickup, error } = await loadTaggablePickup(ctx)
  if (!pickup) finish(ctx, { error: error ?? 'Job not found.' })
  const item = pickup.items.find((i) => i.id === ctx.itemId)
  if (!item?.tag) finish(ctx, { error: 'That line has no tag to remove.' })

  // Back to unused: the sticker came off (or went on the wrong battery) before
  // the load left the agent's hands, so nothing downstream has seen it.
  await prisma.itemTag.updateMany({
    where: { batteryItemId: item.id },
    data: { batteryItemId: null, containerId: null, boundBy: null, boundAt: null },
  })
  finish(ctx, { ok: `${item.tag.code} removed from the line.` })
}

/**
 * AF4 · FD22 — ask the office to let this line leave without a tag.
 *
 * Creates a PENDING `tag_exceptions` row and nothing else: `untaggedReason`
 * stays null, so confirmCollection keeps refusing until an admin approves
 * (`decideTagException` in the admin app writes the reason). Asking again
 * withdraws the earlier pending request for the line — one pending per line,
 * held here because Prisma cannot express a partial unique index.
 *
 * Only while the job is waiting to be collected (`offered`, accepted): after
 * collection a line is either tagged or already approved.
 */
export async function requestTagExceptionAction(formData: FormData) {
  const ctx = readCtx(formData)
  const { user, pickup, error } = await loadTaggablePickup(ctx)
  if (!pickup) finish(ctx, { error: error ?? 'Job not found.' })
  if (pickup.status !== 'offered') finish(ctx, { error: 'This load is already collected.' })
  const item = pickup.items.find((i) => i.id === ctx.itemId)
  if (!item) finish(ctx, { error: 'That line is not on this job.' })
  if (item.tag) finish(ctx, { error: `This line already carries ${item.tag.code}.` })
  if (item.untaggedReason) finish(ctx, { ok: 'The office has already approved this line without a tag.' })

  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < MIN_UNTAGGED_REASON_CHARS) {
    finish(ctx, { error: `Say why this line has no tag (at least ${MIN_UNTAGGED_REASON_CHARS} characters).` })
  }

  await prisma.$transaction(async (tx) => {
    await tx.tagException.updateMany({
      where: { batteryItemId: item.id, status: 'pending' },
      data: { status: 'withdrawn' },
    })
    await tx.tagException.create({
      data: { batteryItemId: item.id, pickupId: pickup.id, reason: reason.slice(0, 200), requestedBy: user.id },
    })
  })
  finish(ctx, { ok: 'Sent to the office. Collection stays blocked until they approve, or you tag the line.' })
}
