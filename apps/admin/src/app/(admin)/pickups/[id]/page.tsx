import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import { formatPaise } from '@clbipp/core/format'
import { categoryLabel, chemistryLabel, conditionLabel } from '@clbipp/core/intake'
import {
  DetailRow,
  Card,
  CardContent,
  Timeline,
  CancelledTimeline,
  CustodyLog,
  buildStages,
  lastRecordedStage,
  isLifecycleStage,
  STAGE_LABELS,
  type LifecycleStage,
  type CustodyEntry,
} from '@clbipp/ui'

import { PageHead, StatusPill } from '@/components/console'

// B05 · Pickup detail — Batch 5, owner C — Ali.
//
// Vendor, agent, address, EVERY BatteryItem with both halves side by side
// (customer-declared vs agent-confirmed — they are allowed to disagree; that
// is a finding, not a bug), the offer, the timeline via buildStages, the
// custody log, ItemException rows, and links to the receipt / invoice /
// certificate where they exist.
//
// READ-ONLY. Every write on this pickup belongs to A's batches (dispatch,
// lifecycle, manifests) — this screen has no server actions and no forms.
//
// 🔴 Trap 10: `offered` is TWO states. The status pill below always reads
// `offer.acceptedAt`, never just `status === 'offered'`.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

// Admin is reading someone ELSE's chain of custody, not "their own" or "the
// vendor's own" — CustodyLog's default roleLabels assume one of those two
// (see the component's own comment), and neither is right here.
const ADMIN_ROLE_LABELS: Record<string, string> = {
  customer: 'Recorded by the vendor',
  vendor: 'Recorded by the vendor',
  agent: 'Recorded by the field agent',
  admin: 'Recorded by admin',
}

export default async function PickupDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      category: true,
      location: true,
      createdAt: true,
      agentFeePaise: true,
      vendor: {
        select: {
          fullName: true,
          companyName: true,
          email: true,
          phone: true,
          gstNumber: true,
          eprRegId: true,
          kycStatus: true,
          marginTier: true,
          vendorType: true,
        },
      },
      agent: {
        select: { fullName: true, agentZone: true, agentVehicle: true, agentRating: true },
      },
      address: { select: { label: true, line1: true, line2: true, city: true, state: true, pincode: true } },
      items: {
        select: {
          id: true,
          category: true,
          quantity: true,
          weightKg: true,
          condition: true,
          photoUrls: true,
          chemistry: true,
          confirmedWeightKg: true,
          confirmedCondition: true,
          agentPhotoUrls: true,
          recordedAt: true,
          damageVisual: true,
          damageLeakage: true,
          damageThermal: true,
          damageScore: true,
          pathway: true,
          traceId: true,
          unitPricePaise: true,
          linePricePaise: true,
          exceptions: {
            select: { id: true, kind: true, cause: true, detail: true, openedAt: true, resolution: true, resolvedAt: true, notes: true },
            orderBy: { openedAt: 'desc' },
          },
        },
      },
      offer: { select: { pathway: true, estimatedPrice: true, rationale: true, acceptedAt: true, createdAt: true } },
      statusEvents: {
        orderBy: { occurredAt: 'asc' },
        select: { id: true, status: true, actorRole: true, notes: true, lat: true, lng: true, photoUrls: true, occurredAt: true },
      },
      custodyBatch: { select: { batchNo: true, handedOffAt: true, facility: { select: { name: true } } } },
      receipt: { select: { receiptNo: true, pdfUrl: true } },
      certificate: { select: { pdfUrl: true, certifiedAt: true } },
      invoice: { select: { number: true, pdfUrl: true } },
      payment: { select: { amountPaise: true, status: true } },
    },
  })

  if (!pickup) notFound()

  // Sign every photo path this screen might show in one batch, rather than one
  // round trip per item/event — a pickup with a dozen items and a dozen status
  // events would otherwise fire two dozen separate signed-url calls.
  const allPaths = [
    ...pickup.items.flatMap((i) => [...i.photoUrls, ...i.agentPhotoUrls]),
    ...pickup.statusEvents.flatMap((e) => e.photoUrls),
  ]
  const { urls: signedList } = allPaths.length > 0 ? await createSignedUrls('pickup-photos', allPaths) : { urls: [] }
  const signedMap = new Map<string, string>()
  allPaths.forEach((path, i) => {
    const entry = signedList[i]
    if (entry?.url) signedMap.set(path, entry.url)
  })

  const stages = buildStages(pickup.statusEvents.map((e) => ({ status: e.status, occurredAt: e.occurredAt })))

  const custodyEntries: CustodyEntry[] = pickup.statusEvents.map((e) => ({
    id: String(e.id),
    label: statusEventLabel(e.status),
    timestamp: e.occurredAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    actorRole: e.actorRole,
    lat: e.lat ? Number(e.lat) : null,
    lng: e.lng ? Number(e.lng) : null,
    photoUrls: e.photoUrls.map((p) => signedMap.get(p)).filter((u): u is string => Boolean(u)),
    notes: e.notes,
  }))

  const openExceptions = pickup.items.flatMap((i) => i.exceptions.filter((x) => x.resolvedAt === null).map((x) => ({ ...x, itemId: i.id })))

  const totalWeightKg = pickup.items.reduce((sum, i) => sum + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0)

  return (
    <>
      <PageHead
        title={pickup.id}
        description={`${categoryLabel(pickup.category)} · ${pickup.items.length} item${pickup.items.length === 1 ? '' : 's'} · ${totalWeightKg.toFixed(1)} kg`}
        actions={<StatusPill status={pickup.status} offerAccepted={pickup.offer?.acceptedAt != null} />}
      />

      {openExceptions.length > 0 ? (
        <div className="rounded-xl border border-error-border bg-error-bg px-4 py-3">
          <p className="text-[13px] font-bold text-error-text">
            {openExceptions.length} open exception{openExceptions.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {openExceptions.map((x) => (
              <p key={x.id} className="text-xs text-text-secondary">
                <span className="font-mono font-bold uppercase text-error-text">{x.kind}</span> · {x.cause}
                {x.detail ? ` — ${x.detail}` : ''}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <Section title="Items">
            <div className="flex flex-col gap-3">
              {pickup.items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </Section>

          <Section title="Offer">
            {pickup.offer ? (
              <Card variant="outline">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col">
                    <DetailRow label="Pathway" value={pickup.offer.pathway} />
                    <DetailRow label="Estimated price" value={formatPaise(pickup.offer.estimatedPrice)} strong />
                    <DetailRow
                      label="Vendor response"
                      value={pickup.offer.acceptedAt ? `Accepted ${formatDateTime(pickup.offer.acceptedAt)}` : 'Awaiting vendor'}
                      last
                    />
                  </div>
                  <div className="border-t border-console-line pt-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Rationale</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{pickup.offer.rationale}</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-xs text-text-secondary">No offer presented yet.</p>
            )}
          </Section>

          <Section title="Chain of custody">
            {custodyEntries.length > 0 ? (
              <CustodyLog entries={custodyEntries} roleLabels={ADMIN_ROLE_LABELS} />
            ) : (
              <p className="text-xs text-text-secondary">No status events recorded yet.</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Timeline">
            <Card variant="outline" className="overflow-visible">
              {pickup.status === 'cancelled' ? (
                <CancelledTimeline
                  lastStage={lastRecordedStage(pickup.statusEvents.map((e) => ({ status: e.status, occurredAt: e.occurredAt })))}
                  stages={stages}
                />
              ) : (
                <CardContent>
                  <Timeline currentStage={pickup.status as LifecycleStage} stages={stages} />
                </CardContent>
              )}
            </Card>
          </Section>

          <Section title="Vendor">
            <Card variant="outline">
              <CardContent className="flex flex-col">
                <DetailRow label="Name" value={pickup.vendor.companyName || pickup.vendor.fullName} />
                {pickup.vendor.companyName ? <DetailRow label="Contact" value={pickup.vendor.fullName} /> : null}
                <DetailRow label="Type" value={pickup.vendor.vendorType} />
                <DetailRow label="Email" value={pickup.vendor.email} />
                <DetailRow label="Phone" value={pickup.vendor.phone ?? '—'} />
                <DetailRow label="GST" value={pickup.vendor.gstNumber ?? '—'} />
                <DetailRow label="EPR reg." value={pickup.vendor.eprRegId ?? '—'} />
                <DetailRow label="KYC" value={pickup.vendor.kycStatus} />
                <DetailRow label="Margin tier" value={pickup.vendor.marginTier ?? 'default (active config)'} last />
              </CardContent>
            </Card>
          </Section>

          <Section title="Agent">
            {pickup.agent ? (
              <Card variant="outline">
                <CardContent className="flex flex-col">
                  <DetailRow label="Name" value={pickup.agent.fullName} />
                  <DetailRow label="Zone" value={pickup.agent.agentZone ?? '—'} />
                  <DetailRow label="Vehicle" value={pickup.agent.agentVehicle ?? '—'} />
                  <DetailRow label="Rating" value={pickup.agent.agentRating ? `★ ${Number(pickup.agent.agentRating).toFixed(1)}` : '—'} />
                  <DetailRow label="Agent fee" value={pickup.agentFeePaise !== null ? formatPaise(pickup.agentFeePaise) : '—'} last />
                </CardContent>
              </Card>
            ) : (
              <p className="text-xs text-text-secondary">
                Not yet assigned — <Link href="/dispatch" className="underline">dispatch board</Link>.
              </p>
            )}
          </Section>

          <Section title="Address">
            <Card variant="outline">
              <CardContent className="flex flex-col">
                {pickup.address ? (
                  <>
                    <DetailRow label={pickup.address.label} value={pickup.address.line1} />
                    {pickup.address.line2 ? <DetailRow label=" " value={pickup.address.line2} /> : null}
                    <DetailRow label="City" value={`${pickup.address.city}, ${pickup.address.state} ${pickup.address.pincode}`} last />
                  </>
                ) : (
                  <DetailRow label="Location" value={pickup.location} last />
                )}
              </CardContent>
            </Card>
          </Section>

          {pickup.custodyBatch ? (
            <Section title="Hub hand-off">
              <Card variant="outline">
                <CardContent className="flex flex-col">
                  <DetailRow label="Batch" value={pickup.custodyBatch.batchNo} />
                  <DetailRow label="Facility" value={pickup.custodyBatch.facility.name} />
                  <DetailRow label="Handed off" value={formatDateTime(pickup.custodyBatch.handedOffAt)} last />
                </CardContent>
              </Card>
            </Section>
          ) : null}

          <Section title="Documents">
            <Card variant="outline">
              <CardContent className="flex flex-col">
                <DetailRow
                  label="Receipt"
                  value={pickup.receipt ? <DocLink no={pickup.receipt.receiptNo} pdfUrl={pickup.receipt.pdfUrl} /> : 'Not yet collected'}
                />
                <DetailRow
                  label="Invoice"
                  value={pickup.invoice ? <DocLink no={pickup.invoice.number} pdfUrl={pickup.invoice.pdfUrl} /> : '—'}
                />
                <DetailRow
                  label="Payment"
                  value={pickup.payment ? `${formatPaise(pickup.payment.amountPaise)} · ${pickup.payment.status}` : 'Not raised yet'}
                />
                <DetailRow
                  label="Certificate"
                  value={
                    pickup.certificate ? (
                      <DocLink no={formatDateTime(pickup.certificate.certifiedAt)} pdfUrl={pickup.certificate.pdfUrl} />
                    ) : (
                      'Not certified yet'
                    )
                  }
                  last
                />
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>
    </>
  )
}

// ── Local presentation ──────────────────────────────────────────────────────
// Local to this screen, same convention dispatch/page.tsx documents: nothing
// here is generic enough to earn a place in the Batch 2 console kit.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">{title}</h2>
      {children}
    </div>
  )
}

function DocLink({ no, pdfUrl }: { no: string; pdfUrl: string | null }) {
  if (!pdfUrl) return <span>{no} · not generated yet</span>
  return (
    <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
      {no} · PDF
    </a>
  )
}

type ItemWithExceptions = {
  id: string
  category: string
  quantity: number
  weightKg: unknown
  condition: string
  photoUrls: string[]
  chemistry: string | null
  confirmedWeightKg: unknown
  confirmedCondition: string | null
  agentPhotoUrls: string[]
  recordedAt: Date | null
  damageVisual: number | null
  damageLeakage: number | null
  damageThermal: number | null
  damageScore: unknown
  pathway: string | null
  traceId: string | null
  unitPricePaise: number | null
  linePricePaise: number | null
  exceptions: Array<{ id: string; kind: string; cause: string; detail: string | null; resolvedAt: Date | null; resolution: string | null }>
}

// The two-halves display: customer-declared and agent-confirmed side by
// side. They are allowed to disagree — a customer who said "healthy" and an
// agent who found "swollen" is a genuine finding for admin to see, not
// something this screen should reconcile or hide by only showing one half.
function ItemCard({ item }: { item: ItemWithExceptions }) {
  const isConfirmed = item.recordedAt !== null
  const openCount = item.exceptions.filter((x) => x.resolvedAt === null).length

  return (
    <Card variant="outline" className={openCount > 0 ? 'border-error-border' : undefined}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-text-primary">{categoryLabel(item.category)}</span>
            {item.traceId ? (
              <span className="font-mono text-[10.5px] text-text-secondary">{item.traceId}</span>
            ) : (
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-disabled">FLAT RATE</span>
            )}
          </div>
          {openCount > 0 ? (
            <span className="rounded-full bg-error-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase text-error-text">
              {openCount} open
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Customer-declared</p>
            <MiniRow label="Qty" value={String(item.quantity)} />
            <MiniRow label="Weight" value={item.weightKg !== null ? `${Number(item.weightKg).toFixed(1)} kg` : '—'} />
            <MiniRow label="Condition" value={conditionLabel(item.condition) ?? item.condition} />
            <MiniRow label="Photos" value={String(item.photoUrls.length)} />
          </div>
          <div className="rounded-lg bg-background p-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-text-disabled">Agent-confirmed</p>
            {isConfirmed ? (
              <>
                <MiniRow label="Chemistry" value={chemistryLabel(item.chemistry) ?? item.chemistry ?? '—'} />
                <MiniRow label="Weight" value={item.confirmedWeightKg !== null ? `${Number(item.confirmedWeightKg).toFixed(1)} kg` : '—'} />
                <MiniRow label="Condition" value={item.confirmedCondition ? (conditionLabel(item.confirmedCondition) ?? item.confirmedCondition) : '—'} />
                <MiniRow label="Photos" value={String(item.agentPhotoUrls.length)} />
              </>
            ) : (
              <p className="text-xs text-text-disabled">Not yet on site</p>
            )}
          </div>
        </div>

        {item.damageScore !== null ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-console-line pt-2.5 text-xs">
            <span className="font-mono font-bold text-text-primary">Damage {Number(item.damageScore).toFixed(2)}</span>
            <span className="text-text-secondary">
              V{item.damageVisual} · L{item.damageLeakage} · T{item.damageThermal}
            </span>
            {item.pathway ? <span className="font-mono uppercase text-text-secondary">{item.pathway}</span> : null}
            {item.unitPricePaise !== null ? (
              <span className="ml-auto font-mono font-bold text-text-primary">
                {formatPaise(item.linePricePaise ?? item.unitPricePaise)}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.exceptions.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-console-line pt-2.5">
            {item.exceptions.map((x) => (
              <p key={x.id} className="text-[11px] text-text-secondary">
                <span className={x.resolvedAt ? 'font-mono font-bold uppercase text-text-disabled' : 'font-mono font-bold uppercase text-error-text'}>
                  {x.kind}
                </span>{' '}
                {x.cause}
                {x.resolution ? ` — resolved: ${x.resolution}` : ''}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-[11.5px]">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  )
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusEventLabel(status: string): string {
  // Reuses the same STAGE_LABELS vocabulary as StatusPill and Timeline
  // (trap 13) — 'cancelled' is the one value STAGE_LABELS doesn't cover
  // (tokens.ts: a terminal side-state, not a position in the progression).
  if (isLifecycleStage(status)) return STAGE_LABELS[status]
  if (status === 'cancelled') return 'Cancelled'
  return status.charAt(0).toUpperCase() + status.slice(1)
}
