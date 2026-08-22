'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { parseIntakeSubmission, photoPathsBelongTo } from '@clbipp/core/intake'

// ─── Per-item intake confirmation (W3/D1 · Batch 3) ──────────────────────────
// Copies the four-point shape of ../actions.ts — the reference service-role
// action for this app — for the reasons documented in full there. In short:
// identity from the session, write through the service role, re-verify
// ownership in code because the service role bypasses RLS, and never trust an
// id that came off the form.
//
// 🔴 THIS ACTION WRITES THE AGENT'S HALF OF A BatteryItem AND NOTHING ELSE.
// `category`, `quantity`, `weightKg`, `condition` and `photoUrls` are the
// CUSTOMER's declaration from booking; `chemistry`, `confirmedWeightKg`,
// `confirmedCondition`, `agentPhotoUrls`, `recordedBy` and `recordedAt` are the
// agent's. Both halves are evidence, and the whole value of having two is that
// they can DISAGREE — a 196 kg declaration that weighs 194.5 kg on site is a
// finding, and overwriting the first with the second destroys it. The declared
// columns never appear in the update payload below; keep it that way.
//
// ⚠ The Batch 2 uuid trap does NOT apply here, and its absence is not an
// oversight. `SafetyChecklist` had to generate its own id because Prisma's
// `@default(uuid())` is applied by the Prisma CLIENT and these actions write
// through Supabase/PostgREST. This action only ever UPDATEs — `BatteryItem` rows
// are created by the customer at booking — so there is no id to supply.
//
// ⚠ NO LIFECYCLE TRANSITION. Confirming items writes no status and no
// `status_events` row. Intake happens entirely within `arrived`; the pickup
// moves to `offered` when Batch 5a presents the offer. The nine stages are
// locked.

/** Belt-and-braces cap on how many photos one line can carry. */
const MAX_PHOTOS_PER_ITEM = 8

export async function confirmItem(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  if (!pickupId || !itemId) redirect('/')

  const itemPath = `/job/${encodeURIComponent(pickupId)}/items/${encodeURIComponent(itemId)}`
  const listPath = `/job/${encodeURIComponent(pickupId)}/items`
  const fail = (message: string): never =>
    redirect(`${itemPath}?error=${encodeURIComponent(message)}`)

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) redirect('/login')

  const admin = createAdminClient()

  // ── Ownership, in two parts ────────────────────────────────────────────────
  // The pickup must be this agent's, AND the item must belong to that pickup.
  // Checking only the first would let an agent post their own pickup id with
  // someone else's item id and write the agent half onto a battery from another
  // job — the item id is a uuid off the URL, and nothing else constrains it.
  const { data: pickup, error: pickupError } = await admin
    .from('pickups')
    .select('id, agent_id, status')
    .eq('id', pickupId)
    .single()

  if (pickupError || !pickup) return fail('Job not found.')

  // 🔴 The ownership check, standing in for a policy. See note 3 in ../actions.ts.
  if (pickup.agent_id !== user.id) return fail('This job is not assigned to you.')
  if (pickup.status === 'cancelled') return fail('This pickup was cancelled.')

  const { data: item, error: itemError } = await admin
    .from('battery_items')
    .select('id, pickup_id')
    .eq('id', itemId)
    .single()

  // 🔴 The second half of the check. Same message either way — an agent poking
  // at ids learns nothing about whether one exists on a job that isn't theirs.
  if (itemError || !item || item.pickup_id !== pickupId) return fail('Item not found on this job.')

  // ── The submission ─────────────────────────────────────────────────────────
  // Enum membership, weight sanity and the two-decimal rounding all live in
  // @clbipp/core/intake, tested there, so the screen's client-side validation
  // and this one can't drift apart.
  const { value, error: parseError } = parseIntakeSubmission({
    chemistry: formData.get('chemistry') as string | null,
    weightKg: formData.get('weightKg') as string | null,
    condition: formData.get('condition') as string | null,
  })

  if (parseError !== null) return fail(parseError)

  // ── Photos ─────────────────────────────────────────────────────────────────
  // The browser uploaded these straight to Storage (the bucket's RLS policy
  // enforces the `<uid>/…` prefix on the way in); what arrives here is only the
  // resulting PATHS. This write is service-role and bypasses RLS entirely, so
  // the prefix has to be re-checked — otherwise an agent could post any object
  // path in the bucket and attach another job's photo as evidence for this one.
  const photoPaths = formData
    .getAll('photoPaths')
    .map((p) => String(p))
    .filter((p) => p.length > 0)

  if (!photoPathsBelongTo(photoPaths, user.id)) {
    return fail('Those photos were not uploaded by you.')
  }

  if (photoPaths.length > MAX_PHOTOS_PER_ITEM) {
    return fail(`Up to ${MAX_PHOTOS_PER_ITEM} photos per line.`)
  }

  // Re-confirming REPLACES the photo set rather than appending to it, so the
  // stored evidence always matches what the agent can see on the screen they
  // just submitted. Appending would make a corrected condition ("actually it's
  // healthy") keep the photo of the leak that prompted the first attempt.
  //
  // ⚠ Photos are evidence of ONE consignment. Nothing here ever copies a path
  // from another item, and the per-item path segments below keep the objects
  // physically separated too.
  const { error: writeError } = await admin
    .from('battery_items')
    .update({
      chemistry: value.chemistry,
      confirmed_weight_kg: value.confirmedWeightKg,
      confirmed_condition: value.confirmedCondition,
      agent_photo_urls: photoPaths,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    // Scoped again at the write. Redundant with the read above by design — this
    // is the statement that actually touches the row, and a check that lives
    // only in a preceding SELECT is one refactor away from being lost.
    .eq('pickup_id', pickupId)

  if (writeError) {
    console.error('[confirmItem] update failed:', writeError)
    return fail(writeError.message)
  }

  revalidatePath(itemPath)
  revalidatePath(listPath)
  revalidatePath(`/job/${pickupId}`)

  // 📌 BATCH 5a: back to the item LIST, not onward to the branch destination.
  // `itemNextHref` in @/lib/job-nav already computes where this item goes next
  // (li-ion → damage rubric, everything else → price) and the list renders it as
  // a link — but both destinations are stubs today, so redirecting into one
  // would strand the agent on an empty page after every single item. When 5a
  // builds them, swap this one line for `itemNextHref(pickupId, itemId,
  // value.chemistry)`.
  redirect(`${listPath}?confirmed=${encodeURIComponent(itemId)}`)
}
