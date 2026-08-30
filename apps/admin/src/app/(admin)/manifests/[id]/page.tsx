import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'

import { formatIstDateTime } from '@/lib/ist'
import { MANIFEST_STATUS_LABELS } from '@/lib/lifecycle-units'

import { dispatchManifestAction } from '../actions'

// C04 · Manifest detail — Batch 6 (dispatch) + Batch 7 (confirm, reconcile),
// owner A — Aamir.
//
// 🔴 What Batch 6 does here and what it deliberately does NOT:
//   draft → dispatched    ✅ this batch. "It left the building."
//   dispatched → received ❌ Batch 7, and it is the write that advances the
//                            affected pickups tested → processed — but ONLY
//                            those whose EVERY item is covered (AD6).
//   received → reconciled ❌ Batch 7, captures recovered mass per metal.
//
// Dispatching advances NO pickup. A dispatched load is on a lorry; claiming a
// recycler processed it would be a false statement in a compliance trail.
//
// 🔴 The items table reads the manifest's OWN itemIds snapshot, not a live
// query. `DispatchManifest.itemIds` is Json rather than a join table precisely
// because a dispatched manifest is immutable — what shipped must keep reading
// as what shipped even if the underlying items change.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).

export const dynamic = 'force-dynamic'

export default async function ManifestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; created?: string; dispatched?: string }>
}) {
  const { id } = await params
  const { error, created, dispatched } = await searchParams

  const manifest = await prisma.dispatchManifest.findUnique({
    where: { id },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      totalWeightKg: true,
      createdAt: true,
      dispatchedAt: true,
      confirmedAt: true,
      facility: { select: { id: true, name: true, location: true } },
      recycler: {
        select: {
          id: true,
          name: true,
          cpcbRegNo: true,
          isActive: true,
          acceptedChemistries: true,
        },
      },
    },
  })

  if (!manifest) notFound()

  const snapshotIds = Array.isArray(manifest.itemIds)
    ? (manifest.itemIds as unknown[]).filter((i): i is string => typeof i === 'string')
    : []

  const items = await prisma.batteryItem.findMany({
    where: { id: { in: snapshotIds } },
    select: {
      id: true,
      chemistry: true,
      category: true,
      quantity: true,
      weightKg: true,
      confirmedWeightKg: true,
      traceId: true,
      pickup: {
        select: {
          id: true,
          status: true,
          vendor: { select: { fullName: true, companyName: true } },
        },
      },
    },
  })

  // Preserve the snapshot's own order, and surface an id that no longer
  // resolves rather than silently dropping it — a manifest that shipped five
  // items must not quietly render four.
  const byId = new Map(items.map((i) => [i.id, i]))
  const missing = snapshotIds.filter((sid) => !byId.has(sid))

  const accepted = new Set(manifest.recycler.acceptedChemistries as string[])
  const notAccepted = items.filter((i) => i.chemistry === null || !accepted.has(i.chemistry))

  const isDraft = manifest.status === 'draft'
  const canDispatch = isDraft && manifest.recycler.isActive && notAccepted.length === 0 && snapshotIds.length > 0

  // Distinct pickups touched, for the AD6 note. A manifest carries items, and
  // items belong to pickups — a manifest of five items may touch three pickups.
  const pickups = [...new Map(items.map((i) => [i.pickup.id, i.pickup])).values()]

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
            Manifest detail
          </h1>
          <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-text-secondary">
            Dispatch it, then confirm and reconcile what came back.
          </p>
        </div>
        <Link
          href="/manifests"
          className="inline-flex shrink-0 items-center rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary transition-colors hover:bg-background"
        >
          All manifests
        </Link>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {created ? (
        <Banner tone="success">
          Draft created. Nothing has left the building yet — dispatch it below when the load
          actually goes.
        </Banner>
      ) : null}
      {dispatched ? (
        <Banner tone="success">
          {manifest.manifestNo} is dispatched. No pickup advanced: {' '}
          <span className="font-mono text-[11px]">tested → processed</span> happens when the
          recycler confirms receipt, and only for pickups whose every item is covered.
        </Banner>
      ) : null}

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-console-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[13px] font-bold text-text-primary">
              {manifest.manifestNo}
            </div>
            <div className="mt-1.5 inline-flex rounded-full bg-background px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-text-secondary">
              {MANIFEST_STATUS_LABELS[manifest.status]}
            </div>
          </div>

          {isDraft ? (
            // POST, never a link — a GET would let a prefetcher dispatch a
            // shipment. Same rule as the dispatch board and the lifecycle board.
            <form action={dispatchManifestAction}>
              <input type="hidden" name="manifestId" value={manifest.id} />
              <button
                type="submit"
                disabled={!canDispatch}
                className="inline-flex items-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Dispatch to {manifest.recycler.name}
              </button>
            </form>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-console-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From (facility)">
            <div className="text-xs text-text-primary">{manifest.facility.name}</div>
            <div className="text-[11px] text-text-secondary">{manifest.facility.location}</div>
          </Field>
          <Field label="To (recycler)">
            <div className="text-xs text-text-primary">{manifest.recycler.name}</div>
            <div className="font-mono text-[10px] text-text-secondary">
              {manifest.recycler.cpcbRegNo}
            </div>
            {!manifest.recycler.isActive ? (
              <span className="mt-1 inline-flex rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                Inactive
              </span>
            ) : null}
          </Field>
          <Field label="Load">
            <div className="text-xs text-text-primary">
              {snapshotIds.length} item{snapshotIds.length === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-text-secondary">
              {manifest.totalWeightKg ? `${Number(manifest.totalWeightKg).toFixed(1)} kg` : '—'}
            </div>
          </Field>
          <Field label="Timeline">
            <div className="text-[11px] text-text-secondary">
              Created {formatIstDateTime(manifest.createdAt)}
            </div>
            <div className="text-[11px] text-text-secondary">
              {manifest.dispatchedAt
                ? `Dispatched ${formatIstDateTime(manifest.dispatchedAt)}`
                : 'Not dispatched'}
            </div>
            <div className="text-[11px] text-text-secondary">
              {manifest.confirmedAt
                ? `Confirmed ${formatIstDateTime(manifest.confirmedAt)}`
                : 'Not confirmed'}
            </div>
          </Field>
        </dl>
      </div>

      {/* ── AD7 blockers, if any ─────────────────────────────────────────── */}
      {isDraft && !canDispatch ? (
        <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3">
          <div className="text-xs font-bold text-warning-text">This draft cannot be dispatched</div>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-warning-text">
            {snapshotIds.length === 0 ? <li>It has no items on it.</li> : null}
            {!manifest.recycler.isActive ? (
              <li>{manifest.recycler.name} is no longer an active recycler.</li>
            ) : null}
            {notAccepted.length > 0 ? (
              <li>
                {manifest.recycler.name} does not accept{' '}
                {[
                  ...new Set(
                    notAccepted.map((i) =>
                      i.chemistry ? (chemistryLabel(i.chemistry) ?? i.chemistry) : 'unrecorded chemistry',
                    ),
                  ),
                ].join(', ')}
                . AD7: a manifest may only name a recycler that accepts every chemistry on it.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <Banner tone="error">
          {missing.length} item id on this manifest no longer resolves to a battery item. The
          snapshot is intact; the underlying rows are not.
        </Banner>
      ) : null}

      {/* ── The shipped items ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
          Items on this manifest
        </h2>
        <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <Th>Chemistry</Th>
                <Th>Pickup</Th>
                <Th>Vendor</Th>
                <Th>Load</Th>
                <Th>Trace</Th>
                <Th>Pickup stage</Th>
              </tr>
            </thead>
            <tbody>
              {snapshotIds.map((sid) => {
                const item = byId.get(sid)
                if (!item) {
                  return (
                    <tr key={sid} className="border-t border-console-line align-top">
                      <Td>
                        <span className="text-xs text-error-text">Item no longer exists</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[10px] text-text-secondary">{sid}</span>
                      </Td>
                      <Td>{''}</Td>
                      <Td>{''}</Td>
                      <Td>{''}</Td>
                      <Td>{''}</Td>
                    </tr>
                  )
                }
                return (
                  <tr key={sid} className="border-t border-console-line align-top">
                    <Td>
                      <div className="text-xs font-medium text-text-primary">
                        {item.chemistry ? (chemistryLabel(item.chemistry) ?? item.chemistry) : 'Unrecorded'}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        {categoryLabel(item.category)}
                      </div>
                    </Td>
                    <Td>
                      <Link
                        href={`/pickups/${encodeURIComponent(item.pickup.id)}`}
                        className="font-mono text-[11px] text-text-primary underline-offset-2 hover:underline"
                      >
                        {item.pickup.id}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary">
                        {item.pickup.vendor.companyName || item.pickup.vendor.fullName}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary">
                        {item.quantity} unit{item.quantity === 1 ? '' : 's'} ·{' '}
                        {Number(item.confirmedWeightKg ?? item.weightKg ?? 0).toFixed(1)} kg
                      </span>
                    </Td>
                    <Td>
                      {/* 🔴 A flat-rate item has NO traceId and still belongs
                          here. This column says "—", it does not filter. */}
                      <span className="font-mono text-[10px] text-text-secondary">
                        {item.traceId ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary">
                        {item.pickup.status}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── What happens next ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-console-line bg-surface px-4 py-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-text-secondary">
          What confirming this will do
        </div>
        <p className="mt-1.5 max-w-[680px] text-xs leading-relaxed text-text-secondary">
          🔴 AD6 — confirming a manifest advances a pickup only when EVERY one of that
          pickup&rsquo;s items sits on a manifest at or past the same state. This manifest touches{' '}
          {pickups.length} pickup{pickups.length === 1 ? '' : 's'}, and some of them may have items
          on a different manifest entirely, because chemistry segregation sends one pickup&rsquo;s
          load to two recyclers. The lifecycle board shows, per pickup, exactly which items are
          still at the hub.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          <span className="font-mono text-[11px]">confirmManifestReceived()</span> and{' '}
          <span className="font-mono text-[11px]">reconcileManifest()</span> are Batch 7.{' '}
          <Link href="/lifecycle" className="font-bold underline underline-offset-2">
            Lifecycle control
          </Link>
        </p>
      </div>
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
        tone === 'error'
          ? 'border-error-border bg-error-bg text-error-text'
          : 'border-success-border bg-success-bg text-success-text'
      }`}
    >
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 pt-3 pb-2.5 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 text-left">{children}</td>
}
