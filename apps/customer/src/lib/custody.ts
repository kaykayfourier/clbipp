import 'server-only'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import { isLifecycleStage, STAGE_LABELS } from '@clbipp/ui'
import type { CustodyEntry } from '@clbipp/ui'

// ─── Chain-of-custody entry builder ──────────────────────────────────────────
// Shared by the authenticated /track/[id] screen and the public /t/[token] one,
// which render the same record from two different scopes. It lives in the app
// rather than in packages/core because it is presentation glue: it produces the
// <CustodyLog> view model, and core must not depend on the UI package.
//
// SERVER-ONLY. It mints signed URLs with the service-role key, so it must never
// end up in a client bundle.
//
// ⚠ Ownership is the CALLER's job. `createSignedUrls` bypasses RLS, so signing a
// path grants access to it — every caller here must already have scoped its
// query (by vendorId, or by the public token) before passing events in.

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
 * `includePhotos: false` skips signing entirely — not just hiding the images.
 * The public view passes it, and not minting URLs it won't render is the point:
 * an unrendered signed URL is still a live capability if it reaches the client.
 */
export async function buildCustodyEntries(
  events: CustodyEventInput[],
  { includePhotos = true }: { includePhotos?: boolean } = {},
): Promise<CustodyEntry[]> {
  const paths = includePhotos ? events.flatMap((e) => e.photoUrls) : []

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
