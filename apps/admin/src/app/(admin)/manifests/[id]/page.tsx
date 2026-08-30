import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'

import { formatIstDateTime } from '@/lib/ist'
import {
  MANIFEST_STATUS_LABELS,
  RECOVERY_METALS,
  loadItemManifestIndex,
  parseRecoveryData,
  pickupCoverage,
} from '@/lib/lifecycle-units'

import {
  confirmManifestReceivedAction,
  dispatchManifestAction,
  reconcileManifestAction,
} from '../actions'

// C04 · Manifest detail — Batch 6 (dispatch) + Batch 7 (confirm, reconcile),
// owner A — Aamir. All four manifest states are now driven from this one page.
//
//   draft → dispatched    Batch 6. "It left the building." Advances NO pickup —
//                         a dispatched load is on a lorry, and claiming a
//                         recycler processed it would be false in a compliance
//                         trail.
//   dispatched → received Batch 7. Advances the covered pickups
//                         `tested → processed`.
//   received → reconciled Batch 7. Captures recovered mass per metal into
//                         `DispatchManifest.recoveryData`, and advances the
//                         covered pickups `processed → recovered`.
//
// 🔴 "The covered pickups", never "the pickups on this manifest" (AD6). The
// readiness panel below renders that distinction so an admin can see, BEFORE
// clicking, which pickups this confirmation will and will not move.
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
  searchParams: Promise<{
    error?: string
    created?: string
    dispatched?: string
    confirmed?: string
    reconciled?: string
    advanced?: string
    held?: string
  }>
}) {
  const { id } = await params
  const { error, created, dispatched, confirmed, reconciled, advanced, held } = await searchParams

  const manifest = await prisma.dispatchManifest.findUnique({
    where: { id },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      totalWeightKg: true,
      recoveryData: true,
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

  const isDispatched = manifest.status === 'dispatched'
  const isReceived = manifest.status === 'received'
  const isReconciled = manifest.status === 'reconciled'

  // ── 🔴 AD6 readiness, computed for the NEXT state ──────────────────────────
  //
  // A manifest carries items, and items belong to pickups — a manifest of five
  // items may touch three pickups, and each of those pickups may have items on
  // a completely different manifest. So the question this panel answers is not
  // "which pickups are on this manifest?" but "which of them will actually
  // move when I click, and which will AD6 hold back, and why?".
  //
  // ⚠ The floor is the state the NEXT click asserts, one ahead of where the
  // manifest is now — so the panel is a preview, not a report. Once confirmed,
  // the floor shifts to `reconciled` and it previews the next click instead.
  const previewFloor = isDispatched ? 'received' : 'reconciled'
  const previewFrom = isDispatched ? 'tested' : 'processed'
  const previewTo = isDispatched ? 'processed' : 'recovered'

  const touchedPickupIds = [...new Set(items.map((i) => i.pickup.id))]

  // Every touched pickup WITH ALL of its items — including the ones NOT on this
  // manifest. That "including" is the whole of AD6.
  const [touched, itemIndex] = await Promise.all([
    prisma.pickup.findMany({
      where: { id: { in: touchedPickupIds } },
      select: {
        id: true,
        status: true,
        vendor: { select: { fullName: true, companyName: true } },
        items: { select: { id: true, chemistry: true } },
      },
    }),
    loadItemManifestIndex(),
  ])

  const pickups = touched.map((p) => ({
    ...p,
    coverage: pickupCoverage(p.id, p.items, itemIndex, previewFloor),
  }))

  // Simulate the manifest's own advance: its items count as covered the moment
  // this manifest reaches `previewFloor`, which is exactly what the click does.
  const snapshotSet = new Set(snapshotIds)
  const readiness = pickups.map((p) => {
    const stillElsewhere = p.coverage.uncovered.filter((u) => !snapshotSet.has(u.itemId))
    return {
      pickup: p,
      willAdvance: p.status === previewFrom && stillElsewhere.length === 0,
      stillElsewhere,
    }
  })

  const willAdvanceCount = readiness.filter((r) => r.willAdvance).length
  const heldCount = readiness.filter((r) => !r.willAdvance && r.pickup.status === previewFrom).length

  const recovery = parseRecoveryData(manifest.recoveryData)
  const recoveredTotalKg = recovery.reduce((sum, l) => sum + l.recovered_kg, 0)
  const shippedKg = Number(manifest.totalWeightKg ?? 0)

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

      {confirmed ? (
        <Banner tone="success">
          {manifest.manifestNo} is received. {advanced ?? '0'} pickup
          {advanced === '1' ? '' : 's'} advanced <span className="font-mono text-[11px]">tested →
          processed</span>
          {Number(held ?? '0') > 0 ? (
            <>
              {' '}
              — and {held} held back by AD6, because not every one of their items is on a confirmed
              manifest yet. That is the rule working, not a failure.
            </>
          ) : (
            '.'
          )}
        </Banner>
      ) : null}
      {reconciled ? (
        <Banner tone="success">
          {manifest.manifestNo} is reconciled and its recovery figures are recorded.{' '}
          {advanced ?? '0'} pickup{advanced === '1' ? '' : 's'} advanced{' '}
          <span className="font-mono text-[11px]">processed → recovered</span>
          {Number(held ?? '0') > 0 ? <> — {held} held back by AD6.</> : '.'} Anything that reached
          recovered can now be certified from the lifecycle board.
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

          {isDispatched ? (
            <form action={confirmManifestReceivedAction}>
              <input type="hidden" name="manifestId" value={manifest.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
              >
                Confirm {manifest.recycler.name} received it
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

      {/* ── received: capture what came back ─────────────────────────────── */}
      {isReceived ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
            Reconcile — what actually came back
          </h2>
          <p className="max-w-[680px] text-xs leading-relaxed text-text-secondary">
            🔴 These are the only MEASURED recovery figures the platform holds. Everything upstream
            — the offer&rsquo;s material breakdown, the engine&rsquo;s yields — is an estimate made
            before a battery was opened, and a certificate minted from this load will quote these
            numbers in preference to that estimate. Enter kilograms for the whole shipment; a
            per-pickup certificate takes its share pro-rated by mass.
          </p>
          {/* Plain server-action form, never useActionState (trap 26) — that is
              what keeps it verifiable without a browser. */}
          <form
            action={reconcileManifestAction}
            className="rounded-xl border border-console-line bg-surface p-4"
          >
            <input type="hidden" name="manifestId" value={manifest.id} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {RECOVERY_METALS.map((metal) => (
                <label key={metal} className="flex flex-col gap-1">
                  {/* One template literal, not `{metal} (kg)`. React renders a
                      text node next to an expression with a `<!-- -->` separator
                      between them, so the rendered HTML reads `Nickel<!-- --> (kg)`
                      and a content assertion on "Nickel (kg)" never matches —
                      trap 19's cousin: scripts/smoke.mjs greps HTML, it does not
                      run a browser. */}
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                    {`${metal} (kg)`}
                  </span>
                  <input
                    type="number"
                    name={`kg:${metal}`}
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="rounded-lg border border-console-line bg-background px-2.5 py-1.5 text-xs text-text-primary"
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
              Shipped weight was {shippedKg.toFixed(1)} kg. Recovered mass may not exceed it — the
              action rejects the submission if it does, because a fat-fingered figure here lands on
              a vendor&rsquo;s EPR certificate and on a CPCB return.
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex items-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
            >
              Reconcile {manifest.manifestNo}
            </button>
          </form>
        </section>
      ) : null}

      {/* ── reconciled: the figures, as recorded ─────────────────────────── */}
      {isReconciled ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
            Recovered materials
          </h2>
          {recovery.length === 0 ? (
            <div className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-xs leading-relaxed text-warning-text">
              This manifest is reconciled but carries no recovery figures — it predates the
              <span className="font-mono text-[11px]"> recovery_data </span> column (a back-filled
              seed row). Certificates from this load fall back to the offer&rsquo;s estimate and say
              so.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Recovered</Th>
                    <Th>Share of load</Th>
                  </tr>
                </thead>
                <tbody>
                  {recovery.map((line) => (
                    <tr key={line.material} className="border-t border-console-line">
                      <Td>
                        <span className="text-xs text-text-primary">{line.material}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[11px] text-text-primary">
                          {line.recovered_kg.toFixed(2)} kg
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11px] text-text-secondary">
                          {shippedKg > 0 ? `${((line.recovered_kg / shippedKg) * 100).toFixed(1)}%` : '—'}
                        </span>
                      </Td>
                    </tr>
                  ))}
                  <tr className="border-t border-console-line bg-background">
                    <Td>
                      <span className="text-xs font-bold text-text-primary">Total</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] font-bold text-text-primary">
                        {recoveredTotalKg.toFixed(2)} kg
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[11px] text-text-secondary">
                        {shippedKg > 0
                          ? `${((recoveredTotalKg / shippedKg) * 100).toFixed(1)}% yield`
                          : '—'}
                      </span>
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── 🔴 AD6 readiness ─────────────────────────────────────────────── */}
      {isDispatched || isReceived ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
            What this will move — {willAdvanceCount} of {pickups.length} pickup
            {pickups.length === 1 ? '' : 's'}
          </h2>
          <p className="max-w-[680px] text-xs leading-relaxed text-text-secondary">
            🔴 AD6 — a pickup advances only when EVERY one of its items sits on a manifest at or
            past <span className="font-mono text-[11px]">{previewFloor}</span>. Chemistry
            segregation sends one pickup&rsquo;s load to two recyclers, so a pickup here can be
            half-shipped. {heldCount > 0 ? `${heldCount} will be held back.` : 'None are held back.'}
          </p>
          <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Pickup</Th>
                  <Th>Vendor</Th>
                  <Th>Now</Th>
                  <Th>On this click</Th>
                  <Th>Items still elsewhere</Th>
                </tr>
              </thead>
              <tbody>
                {readiness.map(({ pickup, willAdvance, stillElsewhere }) => (
                  <tr key={pickup.id} className="border-t border-console-line align-top">
                    <Td>
                      <Link
                        href={`/pickups/${encodeURIComponent(pickup.id)}`}
                        className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
                      >
                        {pickup.id}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary">
                        {pickup.vendor.companyName || pickup.vendor.fullName}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary">
                        {pickup.status}
                      </span>
                    </Td>
                    <Td>
                      {willAdvance ? (
                        <span className="rounded-full bg-success-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-success-text">
                          → {previewTo}
                        </span>
                      ) : pickup.status !== previewFrom ? (
                        <span className="text-[11px] text-text-secondary">
                          Not at {previewFrom}
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                          Held (AD6)
                        </span>
                      )}
                    </Td>
                    <Td>
                      {stillElsewhere.length === 0 ? (
                        <span className="text-[11px] text-text-secondary">—</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {stillElsewhere.map((u) => (
                            <li key={u.itemId} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                              <span className="text-text-primary">
                                {u.chemistry ? (chemistryLabel(u.chemistry) ?? u.chemistry) : 'Unrecorded'}
                              </span>
                              {u.at ? (
                                <Link
                                  href={`/manifests/${encodeURIComponent(u.at.manifestId)}`}
                                  className="font-mono text-[10px] text-text-secondary underline-offset-2 hover:underline"
                                >
                                  {u.at.manifestNo} · {MANIFEST_STATUS_LABELS[u.at.status]}
                                </Link>
                              ) : (
                                <span className="font-mono text-[10px] text-warning-text">
                                  Still at the hub
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            A held pickup is not stuck — it advances the moment its other manifest reaches the same
            state.{' '}
            <Link href="/lifecycle" className="font-bold underline underline-offset-2">
              Lifecycle control
            </Link>{' '}
            shows every pickup&rsquo;s coverage across all manifests.
          </p>
        </section>
      ) : null}

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
