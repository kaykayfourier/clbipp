import 'server-only'

import { prisma } from '@clbipp/database'
import type { StopFacts } from '@clbipp/core/run-planning'

import { dbDateKey, istDateKey } from './ist'

// ─── Collection runs: reading the live pipeline as possible stops (FV11) ─────
// One read, shared by the dispatch board's "same-day groups" panel, the run
// builder and `createCollectionRun`'s validation — so a row the screen offers
// and a row the action accepts come from the same facts. The RULES are pure and
// live in @clbipp/core/run-planning (`runStopEligibility`, `stopDateKey`).

/** The statuses a run can still do something about. `collected` and later are
 *  in the hub's hands; `arrived` is a visit already in progress. */
export const RUN_PIPELINE = ['requested', 'scheduled', 'arrived', 'offered'] as const

export const OPEN_RUN_STATUSES = ['planned', 'in_progress'] as const

export type StopRow = {
  id: string
  status: string
  vendorName: string
  location: string
  city: string | null
  lat: number | null
  lng: number | null
  declaredKg: number
  units: number
  lines: number
  facts: StopFacts
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Every pickup that could conceivably be a run stop, with the facts the
 *  eligibility rule needs. Pass `ids` to read only those (the action does). */
export async function loadStopRows(ids?: readonly string[]): Promise<StopRow[]> {
  const pickups = await prisma.pickup.findMany({
    where: {
      status: { in: [...RUN_PIPELINE] },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      location: true,
      agentId: true,
      preferredDate: true,
      scheduledSlot: true,
      collectionScheduledAt: true,
      vendor: { select: { fullName: true, companyName: true } },
      agent: { select: { fullName: true } },
      address: { select: { city: true, lat: true, lng: true } },
      offer: { select: { acceptedAt: true } },
      collectionRun: { select: { runNo: true, status: true } },
      items: { select: { quantity: true, weightKg: true } },
    },
  })

  return pickups.map((p) => {
    const onOpenRun =
      p.collectionRun && (OPEN_RUN_STATUSES as readonly string[]).includes(p.collectionRun.status)
        ? p.collectionRun.runNo
        : null
    return {
      id: p.id,
      status: p.status,
      vendorName: p.vendor.companyName || p.vendor.fullName,
      location: p.location,
      city: p.address?.city ?? null,
      lat: num(p.address?.lat),
      lng: num(p.address?.lng),
      // `weightKg` is the TOTAL for a line (booking.ts) — sum, never multiply.
      declaredKg: p.items.reduce((s, i) => s + Number(i.weightKg ?? 0), 0),
      units: p.items.reduce((s, i) => s + i.quantity, 0),
      lines: p.items.length,
      facts: {
        status: p.status,
        agentId: p.agentId,
        agentName: p.agent?.fullName ?? null,
        offerAccepted: Boolean(p.offer?.acceptedAt),
        // `preferred_date` is a DATE column; the other two are instants, read
        // as IST calendar days.
        preferredDateKey: p.preferredDate ? dbDateKey(p.preferredDate) : null,
        scheduledDateKey: p.scheduledSlot ? istDateKey(p.scheduledSlot) : null,
        collectionDateKey: p.collectionScheduledAt ? istDateKey(p.collectionScheduledAt) : null,
        openRunNo: onOpenRun,
      },
    }
  })
}

/** The first active facility's coordinates — where a run starts and ends, and
 *  so where the nearest-neighbour stop order begins. Null when it has none. */
export async function depotLocation(): Promise<{ lat: number; lng: number } | null> {
  const facility = await prisma.facility.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { lat: true, lng: true },
  })
  const lat = num(facility?.lat)
  const lng = num(facility?.lng)
  return lat !== null && lng !== null ? { lat, lng } : null
}
