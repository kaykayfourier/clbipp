import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { chemistryLabel } from '@clbipp/core/intake'

import { formatAge, formatIstDateTime } from '@/lib/ist'
import {
  loadItemManifestIndex,
  pickupCoverage,
  MANIFEST_STATUS_LABELS,
} from '@/lib/lifecycle-units'

import { advanceCustodyBatchAction } from './actions'

// B06 · Lifecycle control — Batch 6, owner A — Aamir.
//
// 🔴 The screen that closes the SECOND lifecycle hole. Until Batch 6 nothing in
// any of the three apps wrote a stage past `collected`, so a real collection
// could never become a certificate. This is where the rest of the journey
// happens.
//
// 🔴 AD5 IS THE WHOLE LAYOUT. The unit of advance differs by stage because the
// ACTOR differs, and this screen refuses to hide that behind a uniform "Next
// stage" button per pickup:
//
//   collected → tested     one CustodyBatch    (one hub drop-off, one lorry)
//   tested → processed     one DispatchManifest, on CONFIRMATION (Batch 7)
//   processed → recovered  the same manifest, on RECONCILIATION (Batch 7)
//   recovered → certified  one Pickup at a time, and it mints a Certificate
//
// Batch 6 wires the FIRST row. The other three render with their real units and
// their real blockers so the board is honest about what is waiting — Batch 7
// adds the buttons. Every "Batch 7" note below is a deliberate placeholder, not
// an unfinished thought.
//
// 🔴 AD6 is rendered, not just enforced: a pickup at `tested` shows which of
// its items are on which manifest, because chemistry segregation splits one
// pickup across two recyclers (seed fixture 4, PKP-2026-000113) and an admin
// staring at a pickup that will not advance needs to see why.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).

// Reads go through Prisma as the table owner; no RLS is involved (AD3).
export const dynamic = 'force-dynamic'

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; advanced?: string }>
}) {
  const { error, advanced } = await searchParams

  const [batches, staged, itemIndex] = await Promise.all([
    prisma.custodyBatch.findMany({
      orderBy: { handedOffAt: 'desc' },
      select: {
        id: true,
        batchNo: true,
        handedOffAt: true,
        itemCount: true,
        totalWeightKg: true,
        facility: { select: { name: true } },
        agent: { select: { fullName: true } },
        pickups: {
          select: {
            id: true,
            status: true,
            vendor: { select: { fullName: true, companyName: true } },
          },
        },
      },
    }),
    prisma.pickup.findMany({
      where: { status: { in: ['collected', 'tested', 'processed', 'recovered'] } },
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        custodyBatchId: true,
        vendor: { select: { fullName: true, companyName: true } },
        items: { select: { id: true, chemistry: true } },
      },
    }),
    loadItemManifestIndex(),
  ])

  const now = new Date()

  // ── collected ──────────────────────────────────────────────────────────────
  // Split in two, because they need completely different things. A collected
  // pickup with no custodyBatchId is the DERIVED "pending drop-off" state (D5)
  // — the agent has it in the van and no admin can do anything about it.
  const collected = staged.filter((p) => p.status === 'collected')
  const pendingDropOff = collected.filter((p) => p.custodyBatchId === null)

  const advanceableBatches = batches
    .map((b) => ({
      ...b,
      waiting: b.pickups.filter((p) => p.status === 'collected'),
    }))
    .filter((b) => b.waiting.length > 0)

  // ── tested ─────────────────────────────────────────────────────────────────
  // 🔴 AD6 made visible. `'received'` is the floor because that is what the NEXT
  // advance (tested → processed, Batch 7) asserts.
  const tested = staged
    .filter((p) => p.status === 'tested')
    .map((p) => ({ pickup: p, coverage: pickupCoverage(p.id, p.items, itemIndex, 'received') }))

  const testedUnmanifested = tested.filter((t) =>
    t.coverage.items.some((i) => i.at === null),
  ).length

  // ── processed ──────────────────────────────────────────────────────────────
  const processed = staged
    .filter((p) => p.status === 'processed')
    .map((p) => ({ pickup: p, coverage: pickupCoverage(p.id, p.items, itemIndex, 'reconciled') }))

  const recovered = staged.filter((p) => p.status === 'recovered')

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Lifecycle control
        </h1>
        <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-text-secondary">
          Stage advances, by the unit each stage actually belongs to (AD5). A hub batch is tested
          as one load; a manifest is confirmed as one shipment; a pickup is certified on its own.
        </p>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {advanced ? (
        <Banner tone="success">
          Advanced {advanced} pickup{advanced === '1' ? '' : 's'} to tested. They are now shippable
          from <span className="font-mono text-[11px]">/manifests/new</span>.
        </Banner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={String(collected.length)} label="At collected" />
        <Stat
          value={String(pendingDropOff.length)}
          label="Pending drop-off"
          tone={pendingDropOff.length > 0 ? 'warning' : 'default'}
        />
        <Stat value={String(tested.length)} label="At tested" />
        <Stat
          value={String(testedUnmanifested)}
          label="Not yet manifested"
          tone={testedUnmanifested > 0 ? 'warning' : 'default'}
        />
        <Stat value={String(processed.length)} label="At processed" />
        <Stat value={String(recovered.length)} label="Awaiting certification" />
      </div>

      {/* ── collected → tested ─────────────────────────────────────────────── */}
      <Section
        stage="collected → tested"
        unit="Unit: one custody batch"
        blurb="Everything one agent handed in at one hub, tested as one load. Advancing writes a status event per pickup, all attributed to you — there is no hub-staff app, so this is an admin recording it on the hub's behalf."
      >
        {advanceableBatches.length === 0 ? (
          <Empty>
            No hub batch is waiting. A batch appears here the moment an agent completes a drop-off
            in the field agent app.
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {advanceableBatches.map((b) => (
              <div key={b.id} className="rounded-xl border border-console-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[11px] font-bold text-text-primary">
                      {b.batchNo}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {b.facility.name} · handed in by {b.agent.fullName} ·{' '}
                      {formatIstDateTime(b.handedOffAt)} ({formatAge(b.handedOffAt, now)} ago)
                    </div>
                  </div>
                  {/* POST, not a link — a GET would let a prefetcher advance
                      the lifecycle (the customer app shipped exactly that bug). */}
                  <form action={advanceCustodyBatchAction}>
                    <input type="hidden" name="batchId" value={b.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
                    >
                      Mark {b.waiting.length} tested
                    </button>
                  </form>
                </div>
                <ul className="mt-3 flex flex-col gap-1 border-t border-console-line pt-3">
                  {b.waiting.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="font-mono text-[11px] font-bold text-text-primary">
                        {p.id}
                      </span>
                      <span className="text-text-secondary">
                        {p.vendor.companyName || p.vendor.fullName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {pendingDropOff.length > 0 ? (
          <div className="mt-3 rounded-xl border border-warning-border bg-warning-bg p-4">
            <div className="text-xs font-bold text-warning-text">
              {pendingDropOff.length} collected pickup{pendingDropOff.length === 1 ? '' : 's'} not
              yet handed in
            </div>
            <p className="mt-1 max-w-[560px] text-xs leading-relaxed text-warning-text">
              These are with the agent, not at a hub — the derived &ldquo;pending drop-off&rdquo;
              state (D5), not a tenth lifecycle stage. There is nothing to advance until the agent
              completes a drop-off; that is the agent app&rsquo;s write, not this console&rsquo;s.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {pendingDropOff.map((p) => (
                <li key={p.id} className="font-mono text-[11px] text-warning-text">
                  {p.id}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {/* ── tested → processed ─────────────────────────────────────────────── */}
      <Section
        stage="tested → processed"
        unit="Unit: one dispatch manifest, on confirmation"
        blurb="A pickup advances only when EVERY one of its items is on a confirmed manifest (AD6). Chemistry segregation splits one pickup across two recyclers, so a pickup can be half-shipped — the column below says which half."
        action={
          <Link
            href="/manifests/new"
            className="inline-flex items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
          >
            Build a manifest
          </Link>
        }
      >
        {tested.length === 0 ? (
          <Empty>Nothing is sitting at tested. Advance a hub batch above to fill this.</Empty>
        ) : (
          <CoverageTable rows={tested} floorLabel="confirmed" now={now} />
        )}
      </Section>

      {/* ── processed → recovered ──────────────────────────────────────────── */}
      <Section
        stage="processed → recovered"
        unit="Unit: the same manifest, on reconciliation"
        blurb="Recovered mass per metal is captured when the manifest is reconciled. Same AD6 rule: every item has to be on a reconciled manifest."
      >
        {processed.length === 0 ? (
          <Empty>Nothing is sitting at processed.</Empty>
        ) : (
          <CoverageTable rows={processed} floorLabel="reconciled" now={now} />
        )}
        <BatchSevenNote>
          Reconciling is <span className="font-mono text-[11px]">reconcileManifest()</span>, Batch 7.
        </BatchSevenNote>
      </Section>

      {/* ── recovered → certified ──────────────────────────────────────────── */}
      <Section
        stage="recovered → certified"
        unit="Unit: one pickup"
        blurb="The end of the journey, and the only advance that mints a document — the Certificate row and its PDF, which is what the vendor downloads from their own compliance screen."
      >
        {recovered.length === 0 ? (
          <Empty>Nothing is waiting to be certified.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Pickup</Th>
                  <Th>Vendor</Th>
                  <Th>Items</Th>
                  <Th>Waiting</Th>
                </tr>
              </thead>
              <tbody>
                {recovered.map((p) => (
                  <tr key={p.id} className="border-t border-console-line align-top">
                    <Td>
                      <Link
                        href={`/pickups/${encodeURIComponent(p.id)}`}
                        className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
                      >
                        {p.id}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-primary">
                        {p.vendor.companyName || p.vendor.fullName}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary">{p.items.length}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-text-secondary">
                        {formatAge(p.updatedAt, now)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <BatchSevenNote>
          Certifying is <span className="font-mono text-[11px]">certifyPickup()</span>, Batch 7 — it
          mints the certificate and the PDF, and it is idempotent.
        </BatchSevenNote>
      </Section>
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────
// Local to this screen on purpose, same call as Batch 3's dispatch board: C's
// console kit (DataTable, KpiTile) is a CLIENT component, and everything on
// this page is a server-rendered read next to a server-action form. Swapping in
// DataTable would mean shipping the whole board to the browser to gain sorting
// on tables with a handful of demo rows. See docs/LANE_OWNERSHIP.md.

/** 🔴 AD6, as a table. The "where are its items" column is the whole point. */
function CoverageTable({
  rows,
  floorLabel,
  now,
}: {
  rows: Array<{
    pickup: {
      id: string
      updatedAt: Date
      vendor: { fullName: string; companyName: string | null }
    }
    coverage: ReturnType<typeof pickupCoverage>
  }>
  floorLabel: string
  /** Passed in rather than read here: `new Date()` inside a render function is
   *  an impure call, and the whole board should age against ONE clock reading
   *  anyway — two columns computed a millisecond apart can disagree. */
  now: Date
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr>
            <Th>Pickup</Th>
            <Th>Vendor</Th>
            <Th>Where its items are</Th>
            <Th>Ready</Th>
            <Th>Waiting</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pickup, coverage }) => (
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
                <span className="text-xs text-text-primary">
                  {pickup.vendor.companyName || pickup.vendor.fullName}
                </span>
              </Td>
              <Td>
                <ul className="flex flex-col gap-1">
                  {coverage.items.map((i) => (
                    <li key={i.itemId} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                      <span className="text-text-primary">
                        {/* A flat-rate item still shows up here. It has no
                            traceId at all, which is exactly why no operational
                            table in this app may be keyed on trace_id. */}
                        {i.chemistry ? (chemistryLabel(i.chemistry) ?? i.chemistry) : 'Unrecorded'}
                      </span>
                      {i.at ? (
                        <Link
                          href={`/manifests/${encodeURIComponent(i.at.manifestId)}`}
                          className="font-mono text-[10px] text-text-secondary underline-offset-2 hover:underline"
                        >
                          {i.at.manifestNo} · {MANIFEST_STATUS_LABELS[i.at.status]}
                        </Link>
                      ) : (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                          Still at the hub
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Td>
              <Td>
                {coverage.covered ? (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-success-text">
                    All {floorLabel}
                  </span>
                ) : (
                  <span className="text-xs text-text-secondary">
                    {coverage.uncovered.length} of {coverage.items.length} not {floorLabel}
                  </span>
                )}
              </Td>
              <Td>
                <span className="font-mono text-[11px] text-text-secondary">
                  {formatAge(pickup.updatedAt, now)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({
  stage,
  unit,
  blurb,
  action,
  children,
}: {
  stage: string
  unit: string
  blurb: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
            {stage}
          </h2>
          <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
            {unit}
          </div>
          <p className="mt-1.5 max-w-[620px] text-xs leading-relaxed text-text-secondary">{blurb}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function BatchSevenNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-text-secondary">{children}</p>
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-console-line bg-surface px-6 py-8 text-center">
      <p className="mx-auto max-w-[420px] text-xs leading-relaxed text-text-secondary">{children}</p>
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

function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: string
  label: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={`min-w-[150px] flex-1 rounded-xl border px-4 py-3 ${
        tone === 'warning' ? 'border-warning-border bg-warning-bg' : 'border-console-line bg-surface'
      }`}
    >
      <div className="font-display text-xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </div>
    </div>
  )
}
