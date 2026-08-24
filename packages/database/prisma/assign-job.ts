/**
 * Dispatch: assign a `requested` pickup to a field agent.
 *
 * ─── Why this script exists ─────────────────────────────────────────────────
 * D2 says jobs are PUSHED, not pulled: `Pickup.agentId` is set when the pickup
 * is scheduled, and the agent app has no nearby-jobs feed to claim from. That
 * makes `requested → scheduled` + assignment somebody's job — and that somebody
 * is the ADMIN app, which is still a bare scaffold.
 *
 * The consequence, before this script: a pickup booked in the customer app sat
 * at `requested` with a null `agentId` forever, and the agent app's day view
 * (`where: { agentId: user.id }`) could never see it. The whole customer →
 * agent journey was a dead end at stage one, and every agent screen was
 * reachable only through seeded rows.
 *
 * This is deliberately a CLI script and NOT a screen in either app:
 *   - Putting it in the customer app would move a lifecycle transition across
 *     the D7 seam, and collapse `requested` into a stage nothing ever occupies.
 *   - Putting it in the agent app would make jobs pull-able, contradicting D2.
 * The admin app is its real home. When that surface is built, lift `assignJob`
 * below into a server action — the logic transfers unchanged.
 *
 * Run:
 *   npm run assign-job                      # every `requested` pickup → agent@test
 *   npm run assign-job -- PKP-2026-000101   # just this one
 *   npm run assign-job -- --agent=other@test
 *
 * Idempotent: a pickup that is already past `requested` is skipped, not
 * reassigned — re-running never rewrites an agent out of a job they are
 * standing in the middle of.
 */
import { createClient } from "@supabase/supabase-js"

import { prisma } from "../src/client"
import { loadAppEnv } from "./env"

const DEFAULT_AGENT_EMAIL = "agent@test"

// The customer app books with a 45-minute ETA on the `scheduled` stage and the
// seed mirrors that (`etaMinutes: spec.status === "scheduled" ? 45 : null`).
// Same number here so a dispatched job is indistinguishable from a seeded one
// on the agent's day view.
const ETA_MINUTES = 45

function adminClient() {
  loadAppEnv()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Resolves an agent's auth uuid by email, and proves the profile is role=agent. */
async function resolveAgent(email: string): Promise<{ id: string; name: string }> {
  const supabase = adminClient()
  const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  const user = list.users.find((u) => u.email === email)
  if (!user) {
    throw new Error(`No auth user for ${email}. Run \`npm run reset-demo\` first.`)
  }

  // Role is the real gate — `apps/agent/src/proxy.ts` admits on profiles.role,
  // so assigning a job to a non-agent would create a row that the agent app can
  // never open and the customer app would show as "assigned" anyway.
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, fullName: true, role: true },
  })
  if (!profile) throw new Error(`${email} has an auth user but no profile row.`)
  if (profile.role !== "agent") {
    throw new Error(`${email} has role "${profile.role}", not "agent".`)
  }

  return { id: profile.id, name: profile.fullName }
}

/**
 * The transition itself. Status, assignment and the audit event are written
 * together — the same posture every agent-side lifecycle write uses (see
 * `apps/agent/src/app/(agent)/job/[id]/actions.ts`, the reference action).
 *
 * The `status: "requested"` in the updateMany WHERE is the idempotency guard:
 * a concurrent or repeated run updates zero rows on the second attempt rather
 * than stamping a second `scheduled` event onto a job already in progress.
 */
async function assignJob(pickupId: string, agent: { id: string; name: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.pickup.updateMany({
      where: { id: pickupId, status: "requested" },
      data: {
        status: "scheduled",
        agentId: agent.id,
        scheduledSlot: new Date(),
        etaMinutes: ETA_MINUTES,
      },
    })
    if (updated.count === 0) return false

    // actorRole "admin" — dispatch is an admin action, and BOTH apps' custody
    // label maps already render it ("Recorded by CLBIPP" in packages/ui's
    // ROLE_LABELS and in the agent's AGENT_ROLE_LABELS), so this shows up
    // correctly on /track/[id], /t/[token] and /pickups/[id] with no UI change.
    //
    // actorId stays NULL deliberately: nobody authenticated as an admin here —
    // an operator ran a CLI. Stamping the agent's uuid on it would credit the
    // agent with assigning themselves the job, which is exactly the thing D2
    // says doesn't happen. The agent is named in the notes instead.
    await tx.statusEvent.create({
      data: {
        pickupId,
        status: "scheduled",
        actorId: null,
        actorRole: "admin",
        notes: `Assigned to ${agent.name} for collection.`,
      },
    })
    return true
  })
}

async function main() {
  const args = process.argv.slice(2)
  const email = args.find((a) => a.startsWith("--agent="))?.slice("--agent=".length) ?? DEFAULT_AGENT_EMAIL
  const ids = args.filter((a) => !a.startsWith("--"))

  const agent = await resolveAgent(email)

  const targets = ids.length
    ? await prisma.pickup.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      })
    : await prisma.pickup.findMany({
        where: { status: "requested" },
        select: { id: true, status: true },
        orderBy: { createdAt: "asc" },
      })

  if (targets.length === 0) {
    console.log(
      ids.length
        ? `No pickup found for: ${ids.join(", ")}`
        : "No pickups are waiting at `requested` — nothing to dispatch.",
    )
    return
  }

  // Names that were asked for but don't exist at all, as opposed to ones that
  // exist and are simply past `requested` — different problems, different fixes.
  const found = new Set(targets.map((t) => t.id))
  for (const missing of ids.filter((id) => !found.has(id))) {
    console.log(`  ✗ ${missing.padEnd(20)} no such pickup`)
  }

  console.log(`\nDispatching to ${agent.name} <${email}>\n`)

  let assigned = 0
  for (const target of targets) {
    const ok = await assignJob(target.id, agent)
    if (ok) {
      assigned++
      console.log(`  ✓ ${target.id.padEnd(20)} requested → scheduled`)
    } else {
      console.log(`  · ${target.id.padEnd(20)} skipped (already ${target.status})`)
    }
  }

  console.log(
    assigned === 0
      ? `\nNothing changed.\n`
      : `\n${assigned} job${assigned === 1 ? "" : "s"} dispatched. They are on the agent's day view now.\n`,
  )
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
