import 'server-only'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import { isLifecycleStage, STAGE_LABELS } from '@clbipp/ui'
import type { CustodyEntry } from '@clbipp/ui'

// ─── Chain-of-custody entries, agent side ────────────────────────────────────
// The agent's mirror of `apps/customer/src/lib/custody.ts`. Both turn
// StatusEvent rows into the <CustodyLog> view model; they are near-twins and
// deliberately separate for now.
//
// TODO (post-sprint): unify these two. The blocker is not effort, it is where
// the shared version would live — it needs `createSignedUrls` (packages/auth)
// AND `STAGE_LABELS` (packages/ui), and neither package may depend on the
// other. The fix is to make the label map a parameter, which turns it into a
// pure function that can sit in packages/core. That is a refactor across two
// apps and a shared package, which is not a thing to start with a one-week
// deadline and Batches 5a/6/7a still open.
//
// SERVER-ONLY. It mints signed URLs with the service-role key, so it must never
// end up in a client bundle.
//
// ⚠ Ownership is the CALLER's job. `createSignedUrls` bypasses RLS, so signing a
// path grants access to it — every caller must already have checked
// `pickup.agentId === user.id` before passing events in.

/**
 * Attribution copy for the agent app.
 *
 * 🔴 The INVERSE of `CustodyLog`'s default map, which is written for the
 * customer. "Recorded by you" is a claim about who is reading the screen, and
 * on this app the reader is the agent — so the vendor is the other party here,
 * not the collection partner. Passing this in is what stops the agent's own
 * arrival being attributed to somebody else.
 */
export const AGENT_ROLE_LABELS: Record<string, string> = {
  customer: 'Recorded by the vendor',
  vendor: 'Recorded by the vendor',
  agent: 'Recorded by you',
  admin: 'Recorded by CLBIPP',
}

/** The StatusEvent fields this needs. Structural, so Prisma's row type satisfies it. */
export type CustodyEventInput = {
  id: bigint
  status: string
  occurredAt: Date
  actorRole: string | null
  notes: string | null
  lat: unknown
  lng: unknown
  photoUrls: string[]
}

/** Prisma Decimal → number. Returns null for null/unparseable rather than NaN. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatWhen(date: Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Builds the custody view model, signing every stored photo in ONE round trip.
 *
 * Photos are included here, unlike the public `/t/[token]` view: this is the
 * agent's own record of work they did, on a screen only they can reach, and the
 * photo proof is the substantive half of a chain-of-custody entry.
 */
export async function buildAgentCustodyEntries(
  events: CustodyEventInput[],
): Promise<CustodyEntry[]> {
  const paths = events.flatMap((e) => e.photoUrls)

  // One batch call for the whole log. createSignedUrls already drops individual
  // failures rather than blanking the gallery, so a missing object costs one
  // thumbnail, not the card.
  const { urls } = await createSignedUrls('pickup-photos', paths)
  const signed = new Map(urls.map((u) => [u.path, u.url]))

  return events.map((event) => ({
    id: String(event.id),
    label: isLifecycleStage(event.status)
      ? STAGE_LABELS[event.status]
      : // `cancelled` is the only non-lifecycle status that reaches here, and it
        // still deserves a row — the custody record is what happened, not what
        // the progression expected.
        event.status.charAt(0).toUpperCase() + event.status.slice(1),
    timestamp: formatWhen(event.occurredAt),
    actorRole: event.actorRole,
    notes: event.notes,
    lat: toNumber(event.lat),
    lng: toNumber(event.lng),
    photoUrls: event.photoUrls
      .map((p) => signed.get(p))
      .filter((u): u is string => Boolean(u)),
  }))
}
