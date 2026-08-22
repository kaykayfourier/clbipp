'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { buildChecklistJson, SAFETY_ITEMS, type SafetyAnswers } from '@clbipp/core/safety'

// ─── Safety checklist submission (W1 · Batch 2) ──────────────────────────────
// Copies the four-point shape of ../actions.ts — the reference service-role
// action for this app — for the same reasons, which are documented in full
// there. In short: identity from the session, write through the service role,
// re-verify `agent_id === user.id` in code because the service role bypasses
// RLS, and never trust an id that came off the form.
//
// `safety_checklists` has RLS enabled with NO policy (supabase/policies.sql),
// so an authenticated session cannot reach it at all — only the service role
// can, and this action is the only thing that writes it.
//
// ⚠ This action writes NO lifecycle transition and NO status_events row. A
// safety checklist is not a lifecycle stage; the nine are locked and no
// migration adds one (CLAUDE.md). It gates intake by its existence, not by
// moving the pickup.

/**
 * Persist the checklist for a pickup, pass or fail.
 *
 * A FAILING checklist is written, deliberately — it is a compliance record that
 * a hazard was found on site, which is most of the point of asking. Intake stays
 * blocked either way (see @/lib/safety-gate); the difference is whether the
 * finding survives anywhere an auditor could see it.
 */
export async function submitSafetyChecklist(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/')

  const safetyPath = `/job/${encodeURIComponent(pickupId)}/safety`

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) redirect('/login')

  const admin = createAdminClient()

  // Ownership + the job's own declared rows, in one read. The rows matter: the
  // required-item set is recomputed from them below rather than taken from the
  // form, so they have to come from the database on this request.
  const { data: pickup, error: readError } = await admin
    .from('pickups')
    .select('id, agent_id, status, battery_items(condition)')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) {
    redirect(`${safetyPath}?error=${encodeURIComponent('Job not found.')}`)
  }

  // 🔴 The ownership check, standing in for a policy. See note 3 in ../actions.ts.
  if (pickup.agent_id !== user.id) {
    redirect(`${safetyPath}?error=${encodeURIComponent('This job is not assigned to you.')}`)
  }

  if (pickup.status === 'cancelled') {
    redirect(`${safetyPath}?error=${encodeURIComponent('This pickup was cancelled.')}`)
  }

  // ── What the agent ticked ──────────────────────────────────────────────────
  // Only the catalogue's own keys are read, so nothing else on the form can
  // reach the stored JSON. buildChecklistJson filters again on the way in; this
  // is the first of the two passes.
  const answers: SafetyAnswers = {}
  for (const item of SAFETY_ITEMS) {
    if (formData.get(item.key) === 'on') answers[item.key] = true
  }

  // ── What was required ──────────────────────────────────────────────────────
  // 🔴 Recomputed SERVER-SIDE. The agent's lithium answer is genuine input — it
  // is a judgement only they can make, standing in front of the load — but the
  // required set and the pass verdict are derived here, from it plus the
  // pickup's own declared rows. A client that posts `lithiumPresent=false` gets
  // a shorter list; it does not get to skip the HR-mandated five, because those
  // are unconditional in @clbipp/core/safety and nothing in this request can
  // remove them.
  const lithiumPresent = formData.get('lithiumPresent') === 'yes'
  const conditions = (pickup.battery_items ?? []).map((i: { condition: string }) => i.condition)
  const damagedUnitsPresent = conditions.some((c) => c === 'swollen' || c === 'leaking')

  const { json, passed } = buildChecklistJson({
    answers,
    lithiumPresent,
    lithiumBasis: 'agent',
    damagedUnitsPresent,
  })

  // ── Write ──────────────────────────────────────────────────────────────────
  // `pickup_id` is @unique, so a job has exactly one checklist and re-submitting
  // must UPDATE rather than duplicate. Read-then-branch instead of an upsert so
  // the primary key stays stable across re-submissions — an upsert would have to
  // supply a fresh `id` on every call and would rewrite the PK each time.
  //
  // 🔴 TRAP, and it will bite every later agent action that writes a uuid-keyed
  // table through the service role (Batches 3, 5b, 6, 7a all do):
  //
  //   `SafetyChecklist.id` is `@id @default(uuid())` in schema.prisma, but that
  //   default is applied by the PRISMA CLIENT — the migration created the column
  //   as plain `TEXT NOT NULL` with NO database default. These actions write
  //   through Supabase/PostgREST, which never goes near Prisma, so the id must
  //   be generated here or the insert fails with a not-null violation.
  //
  // `status_events` gets away with omitting its id only because that column is
  // BIGSERIAL — a real database default. Don't generalise from it.
  const { data: existing } = await admin
    .from('safety_checklists')
    .select('id')
    .eq('pickup_id', pickupId)
    .maybeSingle()

  const row = {
    pickup_id: pickupId,
    agent_id: user.id,
    items: json,
    passed,
    completed_at: new Date().toISOString(),
  }

  const { error: writeError } = existing
    ? await admin.from('safety_checklists').update(row).eq('id', existing.id)
    : await admin.from('safety_checklists').insert({ id: crypto.randomUUID(), ...row })

  if (writeError) {
    console.error('[submitSafetyChecklist] upsert failed:', writeError)
    redirect(`${safetyPath}?error=${encodeURIComponent(writeError.message)}`)
  }

  // Job detail renders the completed banner from this row, and the day view's
  // row copy is derived from the same lifecycle position.
  revalidatePath(safetyPath)
  revalidatePath(`/job/${pickupId}`)
  revalidatePath('/')

  // TODO (Admin app): a failed checklist blocks this agent but notifies nobody.
  // The hazard the agent just recorded should reach a supervisor — there is no
  // admin surface to send it to yet. Pairs with the plan's open note that the
  // HOLD verdict's "Escalate to admin" must also do something (Batch 5a).
  if (!passed) {
    redirect(`${safetyPath}?failed=1`)
  }

  redirect(`/job/${encodeURIComponent(pickupId)}/items`)
}
