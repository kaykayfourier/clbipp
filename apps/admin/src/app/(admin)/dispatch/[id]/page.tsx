import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel } from '@clbipp/core/intake'
import { formatPaise } from '@clbipp/core/format'
import { STAGE_LABELS, isLifecycleStage } from '@clbipp/ui'

import { MIN_REASSIGN_REASON_CHARS, reassignEligibility } from '@clbipp/core/assignment'

import { assignPickupAction, reassignPickupAction } from '../actions'
import { rankedAgentsFor } from '@/lib/agent-selection'
import { ASSIGNMENT_VERBS, assignmentHistory } from '@/lib/assignment-history'
import { inspectorOf } from '@/lib/inspector'
import { toCoord } from './coords'

import { AgentSelector } from './AgentSelector'
import type { RankedAgent } from '@clbipp/core/dispatch-ranking'
import { formatAge, formatIstDate, formatIstDateTime, parseIstLocal, toIstLocalValue } from '@/lib/ist'

// B03 · Dispatch request — Batch 3, owner A — Aamir.
//
// The request in full, plus the agent picker that schedules it. This is the one
// screen in the whole product that writes `requested → scheduled`.
//
// It renders for a pickup at ANY status, not just `requested`:
//   · at `requested` it shows the picker;
//   · past it, it shows who the job went to and routes on to /pickups/[id].
// That is not politeness — `scripts/smoke.mjs` points this route at
// PKP-2026-000101, and the moment anyone assigns that row in a demo the route
// would 404 for every later smoke run if this page insisted on `requested`.
//
// The agent list is read INLINE here (task sheet step 2) rather than waiting on
// C's /agents screen (E02). Same data, different question: that screen is a
// roster, this is a picker with today's load on it.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function DispatchDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; assigned?: string; reassigned?: string }>
}) {
  const { id } = await params
  const { error, assigned, reassigned } = await searchParams

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      preferredDate: true,
      scheduledSlot: true,
      etaMinutes: true,
      location: true,
      category: true,
      notes: true,
      agentId: true,
      agentFeePaise: true,
      indicativeQuotePaise: true,
      collectionScheduledAt: true,
      offer: { select: { acceptedAt: true } },
      collectionRun: { select: { runNo: true, status: true } },
      conditionFlags: true,
      vendor: {
        select: {
          fullName: true,
          companyName: true,
          email: true,
          phone: true,
          eprRegId: true,
          vendorType: true,
        },
      },
      agent: { select: { id: true, fullName: true, agentZone: true, agentVehicle: true } },
      address: { select: { label: true, line1: true, line2: true, city: true, state: true, pincode: true, lat: true, lng: true } },
      items: {
        select: { id: true, category: true, quantity: true, weightKg: true, condition: true },
        orderBy: { createdAt: 'asc' },
      },
      statusEvents: {
        select: { id: true, status: true, actorRole: true, notes: true, occurredAt: true },
        orderBy: { occurredAt: 'desc' },
        take: 6,
      },
    },
  })

  if (!pickup) notFound()

  const isOpen = pickup.status === 'requested'
  // 🔴 Trap 11 again: `requested` does NOT imply "never assigned". A pickup the
  // vendor cancelled and rebooked keeps the old agent and the old fee.
  const staleAgent = isOpen && pickup.agentId ? pickup.agent : null

  // FV8 — the ranked selector. Availability, today's workload, total live
  // workload and distance from the agent's last known operational position, all
  // gathered in one place (lib/agent-selection.ts) and ordered by the pure
  // ranker in @clbipp/core. The dispatcher still chooses.
  // AF3 · FD21 — scheduled or offered, not on an open run: the job can move to
  // another agent. reassignPickup refuses with the same rule.
  const openRun =
    pickup.collectionRun && (pickup.collectionRun.status === 'planned' || pickup.collectionRun.status === 'in_progress')
      ? pickup.collectionRun.runNo
      : null
  const reassign = reassignEligibility({ status: pickup.status, openRunNo: openRun })
  const reassignOpen = reassign.ok && pickup.agentId !== null
  const rankedAgents =
    isOpen || reassignOpen
      ? await rankedAgentsFor({
          addressLat: toCoord(pickup.address?.lat),
          addressLng: toCoord(pickup.address?.lng),
          // The day "jobs that day" is counted against: the vendor's preferred
          // day for a request, the slot for a scheduled job, the booked
          // collection day for an offer.
          targetDay:
            (isOpen
              ? pickup.preferredDate
              : pickup.status === 'offered'
                ? pickup.collectionScheduledAt
                : pickup.scheduledSlot) ?? new Date(),
        })
      : []
  const inspector = isOpen ? null : await inspectorOf(pickup.id)
  const history = await assignmentHistory(pickup.id)

  const now = new Date()
  const units = pickup.items.reduce((sum, i) => sum + i.quantity, 0)
  const kg = pickup.items.reduce((sum, i) => sum + Number(i.weightKg ?? 0), 0)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
            Dispatch request
          </h1>
          <p className="mt-1 font-mono text-[11px] text-text-secondary">{pickup.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={pickup.status} />
          <Link
            href="/dispatch"
            className="rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-background"
          >
            Back to board
          </Link>
        </div>
      </div>

      {assigned && !isOpen ? (
        <Banner tone="success">
          Scheduled with {pickup.agent?.fullName ?? 'the agent'}
          {pickup.scheduledSlot ? `, ${formatIstDateTime(pickup.scheduledSlot)}` : ''}.
        </Banner>
      ) : null}

      {reassigned ? (
        <Banner tone="success">
          Reassigned to {pickup.agent?.fullName ?? 'the agent'}. Both agents have been notified in the app.
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      ) : null}

      {staleAgent ? (
        // The seed's fixture 8 (PKP-2026-000114) is exactly this state, and this
        // panel is the thing the task sheet's step 4 asks for. The wording is
        // deliberate: the vendor did nothing wrong, and the old agent is not on
        // this job any more — the DATA just still says they are.
        <Banner tone="warning">
          <strong className="font-bold">Previously assigned to {staleAgent.fullName}.</strong> The
          vendor rebooked
          {pickup.agentFeePaise !== null
            ? ` (old fee ${formatPaise(pickup.agentFeePaise)})`
            : ''}
          . Assigning below replaces the old agent.
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-[18px]">
          <Panel title="Request">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row label="Vendor" value={pickup.vendor.companyName || pickup.vendor.fullName} />
              <Row label="Contact" value={pickup.vendor.fullName} />
              <Row label="Phone" value={pickup.vendor.phone ?? '—'} mono />
              <Row label="Email" value={pickup.vendor.email} />
              <Row label="EPR reg. id" value={pickup.vendor.eprRegId ?? '—'} mono />
              <Row label="Vendor type" value={pickup.vendor.vendorType} />
              <Row label="Category" value={categoryLabel(pickup.category)} />
              <Row
                label="Preferred date"
                value={pickup.preferredDate ? formatIstDate(pickup.preferredDate) : 'No preference'}
              />
              <Row label="Requested" value={`${formatIstDateTime(pickup.createdAt)} · ${formatAge(pickup.createdAt, now)} ago`} />
              {/* 🔴 INTERNAL ONLY (FV1 · FD2, 2026-09-10). The vendor no longer
                  sees this figure anywhere — it was removed from the booking
                  wizard and the confirmation screen so that their first price
                  is the agent's post-inspection offer. It survives here because
                  ops triage against it, and the label has to say so: read it
                  out to a vendor and the change is undone. */}
              <Row
                label="Internal estimate"
                value={
                  pickup.indicativeQuotePaise !== null
                    ? formatPaise(pickup.indicativeQuotePaise)
                    : '—'
                }
                mono
                hint="Not shown to the vendor"
              />
            </dl>

            <div className="mt-4 border-t border-console-line pt-4">
              <Label>Collection address</Label>
              <p className="mt-1 text-sm leading-relaxed text-text-primary">{pickup.location}</p>
              {pickup.address ? (
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {pickup.address.label}: {pickup.address.line1}
                  {pickup.address.line2 ? `, ${pickup.address.line2}` : ''}, {pickup.address.city},{' '}
                  {pickup.address.state} {pickup.address.pincode}
                </p>
              ) : null}
            </div>

            {pickup.notes ? (
              <div className="mt-4 border-t border-console-line pt-4">
                <Label>Vendor notes</Label>
                <p className="mt-1 text-sm leading-relaxed text-text-primary">{pickup.notes}</p>
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Declared items"
            aside={`${pickup.items.length} line${pickup.items.length === 1 ? '' : 's'} · ${units} unit${
              units === 1 ? '' : 's'
            }${kg > 0 ? ` · ${kg.toFixed(1)} kg` : ''}`}
          >
            {/* ⚠ These are the CUSTOMER's declaration, and nothing on this
                screen may overwrite them. The agent's confirmed chemistry,
                weight and condition are the other half of BatteryItem and are
                not filled in until intake — a mismatch between the two is a
                finding, not a bug (CLAUDE.md). */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Weight</Th>
                  <Th>Declared condition</Th>
                </tr>
              </thead>
              <tbody>
                {pickup.items.map((item) => (
                  <tr key={item.id} className="border-t border-console-line">
                    <Td>{categoryLabel(item.category)}</Td>
                    <Td align="right">{item.quantity}</Td>
                    <Td align="right">
                      {item.weightKg !== null ? `${Number(item.weightKg).toFixed(1)} kg` : '—'}
                    </Td>
                    <Td>{item.condition}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pickup.conditionFlags.length > 0 ? (
              <p className="mt-3 text-xs text-text-secondary">
                Vendor flagged: {pickup.conditionFlags.join(', ')}
              </p>
            ) : null}
          </Panel>

          <Panel title="Recent status events">
            {/* Read-only. The order here is newest-first because this is an
                operational log, not the customer's timeline — buildStages
                (first-wins, oldest-first) is what renders that, on /track. */}
            <ul className="flex flex-col gap-2.5">
              {pickup.statusEvents.map((event) => (
                <li key={String(event.id)} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <StatusChip status={event.status} />
                  <span className="text-xs text-text-secondary">
                    {formatIstDateTime(event.occurredAt)}
                    {event.actorRole ? ` · ${event.actorRole}` : ''}
                  </span>
                  {event.notes ? (
                    <span className="w-full text-xs text-text-primary">{event.notes}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-[18px]">
          {isOpen ? (
            <AssignPanel
              pickupId={pickup.id}
              agents={rankedAgents}
              defaultSlot={defaultSlotValue(pickup.preferredDate, now)}
              staleAgentId={pickup.agentId}
            />
          ) : (
            <Panel title="Assigned">
              <dl className="grid grid-cols-1 gap-3">
                <Row label="Agent" value={pickup.agent?.fullName ?? 'Unassigned'} />
                {inspector && inspector.id !== pickup.agentId ? (
                  <Row label="Inspected by" value={inspector.fullName} />
                ) : null}
                <Row label="Zone" value={pickup.agent?.agentZone ?? '—'} />
                <Row
                  label="Slot"
                  value={pickup.scheduledSlot ? formatIstDateTime(pickup.scheduledSlot) : '—'}
                />
                <Row label="ETA" value={pickup.etaMinutes ? `${pickup.etaMinutes} min` : '—'} />
                <Row
                  label="Agent fee"
                  value={
                    pickup.agentFeePaise !== null
                      ? formatPaise(pickup.agentFeePaise)
                      : 'Not yet earned'
                  }
                  mono
                />
              </dl>
              <Link
                href={`/pickups/${encodeURIComponent(pickup.id)}`}
                className="mt-3 inline-flex items-center rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-background"
              >
                Open pickup
              </Link>
            </Panel>
          )}
          {reassignOpen ? (
            <Panel title="Reassign">
              <form action={reassignPickupAction} className="flex flex-col gap-4">
                <input type="hidden" name="pickupId" value={pickup.id} />
                <AgentSelector agents={rankedAgents} staleAgentId={pickup.agentId} markLabel="Has this job" />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reason" className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    Reason
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    required
                    minLength={MIN_REASSIGN_REASON_CHARS}
                    rows={2}
                    placeholder="Why is this job moving?"
                    className="rounded-lg border border-console-line bg-surface px-3 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
                  />
                  <p className="text-[11px] leading-relaxed text-text-secondary">Kept in the audit log. Not shown to the vendor.</p>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-primary-black px-4 py-3 text-sm font-bold text-primary-green transition-opacity hover:opacity-90"
                >
                  Reassign
                </button>
              </form>
            </Panel>
          ) : !reassign.ok && (pickup.status === 'arrived' || openRun) ? (
            <Panel title="Reassign">
              <p className="text-xs leading-relaxed text-text-secondary">{reassign.reason}</p>
            </Panel>
          ) : null}
          {history.length > 0 ? (
            <Panel title="Assignment history">
              <ul className="flex flex-col gap-2.5">
                {history.map((h) => (
                  <li key={h.id} className="text-xs leading-relaxed">
                    <span className="font-bold text-text-primary">{ASSIGNMENT_VERBS[h.action] ?? h.action}</span>
                    <span className="text-text-primary">
                      {h.fromName && h.action !== 'pickup.assign' ? ` · ${h.fromName} → ${h.toName ?? '—'}` : ` · ${h.toName ?? '—'}`}
                    </span>
                    <span className="block text-text-secondary">
                      {formatIstDateTime(h.at)} · by {h.byName}
                      {h.reason ? ` · “${h.reason}”` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  )
}

// ── The picker ───────────────────────────────────────────────────────────────
// A plain <form action={serverAction}> — POST, not a link, and no client
// component: nothing here needs state. The action re-validates every field
// server-side (the agent's role included), because this form is exactly as easy
// to forge as any other POST and AD3 leaves no RLS behind it.
function AssignPanel({
  pickupId,
  agents,
  defaultSlot,
  staleAgentId,
}: {
  pickupId: string
  agents: readonly RankedAgent[]
  defaultSlot: string
  staleAgentId: string | null
}) {
  return (
    <Panel title="Assign an agent">
      {agents.length === 0 ? (
        <p className="text-xs leading-relaxed text-text-secondary">
          No agents yet.
        </p>
      ) : (
        <form action={assignPickupAction} className="flex flex-col gap-4">
          <input type="hidden" name="pickupId" value={pickupId} />

          <AgentSelector agents={agents} staleAgentId={staleAgentId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="scheduledSlot" className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Collection slot (IST)
            </label>
            <input
              id="scheduledSlot"
              name="scheduledSlot"
              type="datetime-local"
              required
              defaultValue={defaultSlot}
              className="rounded-lg border border-console-line bg-surface px-3 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
            />
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Defaults to 10:00 on the preferred date.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="etaMinutes" className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              ETA (minutes)
            </label>
            <input
              id="etaMinutes"
              name="etaMinutes"
              type="number"
              min={5}
              max={480}
              step={5}
              defaultValue={45}
              className="rounded-lg border border-console-line bg-surface px-3 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
            />
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Shown to the vendor.
            </p>
          </div>

          <button
            type="submit"
            className="mt-1 w-full rounded-lg bg-primary-black px-4 py-3 text-sm font-bold text-primary-green transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green focus-visible:ring-offset-2"
          >
            Assign &amp; schedule
          </button>

        </form>
      )}
    </Panel>
  )
}

/** 10:00 IST on the vendor's preferred date, or on tomorrow if that has passed. */
function defaultSlotValue(preferred: Date | null, now: Date): string {
  const base = preferred && preferred.getTime() > now.getTime() ? preferred : new Date(now.getTime() + 86_400_000)
  const day = toIstLocalValue(base).slice(0, 10)
  return toIstLocalValue(parseIstLocal(`${day}T10:00`) ?? base)
}

// ── Local presentation ───────────────────────────────────────────────────────
// Local on purpose — C's console kit (Batch 2) does not exist yet and this
// batch must not block on it. Swap for Panel/DataTable/Banner when it lands.

function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-console-line bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.09em] text-text-secondary">
          {title}
        </h2>
        {aside ? <span className="text-xs text-text-secondary">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
      {children}
    </span>
  )
}

function Row({
  label,
  value,
  mono,
  hint,
}: {
  label: string
  value: string
  mono?: boolean
  /** A qualifier on the VALUE, not a description of the field — used where the
   *  number means something different to an admin than it would to a vendor. */
  hint?: string
}) {
  return (
    <div>
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className={`mt-0.5 text-sm text-text-primary ${mono ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[10px] text-text-secondary">{hint}</p>}
    </div>
  )
}

// 🔴 Never a hand-written stage label (trap 13). STAGE_LABELS from @clbipp/ui is
// the one source, shared with both mobile apps' timelines — a chip reading
// "Offer made" here and "offered" on the vendor's screen is the drift this
// prevents. `cancelled` is not on the linear lifecycle, so it is the fallback.
function StatusChip({ status }: { status: string }) {
  const label = isLifecycleStage(status) ? STAGE_LABELS[status] : 'Cancelled'
  return (
    <span className="inline-flex items-center rounded-full bg-background px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-text-primary">
      {label}
    </span>
  )
}

function Banner({
  tone,
  role,
  children,
}: {
  tone: 'success' | 'error' | 'warning'
  role?: string
  children: React.ReactNode
}) {
  const tones = {
    success: 'border-success-border bg-success-bg text-success-text',
    error: 'border-error-border bg-error-bg text-error-text',
    warning: 'border-warning-border bg-warning-bg text-warning-text',
  }
  return (
    <div role={role} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`px-2 pb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <td className={`px-2 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
}
