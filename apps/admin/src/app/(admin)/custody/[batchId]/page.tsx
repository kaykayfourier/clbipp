import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'
import { CHECK_METHOD_LABELS, MIN_CUSTODY_NOTE_CHARS, batchCheckSummary } from '@clbipp/core/custody-check'
import { STAGE_LABELS, isLifecycleStage } from '@clbipp/ui'

import { formatIstDateTime } from '@/lib/ist'
import {
  Chip,
  FieldLabel,
  Notice,
  PageHead,
  Panel,
  Stat,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/console'

import { advanceCustodyBatchAction } from '../../lifecycle/actions'
import { checkInByScanAction, recordLineByHandAction, tagAtHubAction } from '../actions'

// FV12 · Hub check-in — feedback §4.2 ("QR or scannable identifiers can be used
// to reconcile items at the facility") and §6 step 10, decision FD15.
//
// Every battery line in one hub drop-off, and whether the hub has seen it.
// 🔴 `collected → tested` for a pickup is gated on EVERY one of its lines being
// checked in as received — the "Mark tested" button below and on /lifecycle
// only moves pickups that are ready, and the action re-checks.
//
// The scan box is an ordinary autofocused text input on purpose: a USB or
// Bluetooth barcode scanner is a keyboard that types the code and presses
// Enter, so a desk at the hub needs no camera and no extra software.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function CustodyCheckIn({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const { batchId } = await params
  const { ok, error } = await searchParams

  const batch = await prisma.custodyBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNo: true,
      handedOffAt: true,
      receivingStaffName: true,
      facility: { select: { name: true } },
      agent: { select: { fullName: true } },
      pickups: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          status: true,
          vendor: { select: { fullName: true, companyName: true } },
          collectionRun: { select: { id: true, runNo: true } },
          items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              category: true,
              quantity: true,
              chemistry: true,
              weightKg: true,
              confirmedWeightKg: true,
              untaggedReason: true,
              tag: { select: { code: true, boundAtHub: true, container: { select: { code: true } } } },
              custodyCheck: { select: { outcome: true, method: true, note: true, checkedAt: true } },
            },
          },
        },
      },
    },
  })
  if (!batch) notFound()

  const summary = batchCheckSummary(
    batch.pickups.map((p) => ({
      pickupId: p.id,
      lines: p.items.map((i) => ({ itemId: i.id, outcome: i.custodyCheck?.outcome ?? null })),
    })),
  )
  const stateById = new Map(summary.pickups.map((s) => [s.pickupId, s]))
  const readyToAdvance = batch.pickups.filter((p) => p.status === 'collected' && stateById.get(p.id)?.ready)
  const stillCollected = batch.pickups.filter((p) => p.status === 'collected')
  const boxes = [...new Set(batch.pickups.flatMap((p) => p.items.map((i) => i.tag?.container?.code).filter(Boolean)))]

  return (
    <>
      <PageHead
        title={`Hub check-in · ${batch.batchNo}`}
        description={`${batch.facility.name} · handed in by ${batch.agent.fullName} on ${formatIstDateTime(batch.handedOffAt)} · received by ${batch.receivingStaffName} (agent-recorded)`}
        actions={
          <Link href="/lifecycle" className={secondaryButtonClass}>
            Lifecycle
          </Link>
        }
      />

      {ok ? <Notice tone="success">{ok}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={`${summary.received} / ${summary.total}`} label="Lines received" tone={summary.received === summary.total && summary.total > 0 ? 'success' : 'default'} />
        <Stat value={String(summary.unchecked)} label="Not yet checked" tone={summary.unchecked > 0 ? 'warning' : 'default'} />
        <Stat value={String(summary.missing)} label="Declared missing" tone={summary.missing > 0 ? 'warning' : 'default'} />
        <Stat value={boxes.length > 0 ? boxes.join(', ') : '—'} label="Boxes in this load" />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-[18px]">
          {batch.pickups.map((p) => {
            const state = stateById.get(p.id)
            return (
              <Panel
                key={p.id}
                title={`${p.id} · ${p.vendor.companyName || p.vendor.fullName}`}
                aside={
                  <span className="flex items-center gap-2">
                    {p.collectionRun ? (
                      <Link href={`/runs/${p.collectionRun.id}`} className="font-mono text-[11px] underline underline-offset-2">
                        {p.collectionRun.runNo}
                      </Link>
                    ) : null}
                    <Chip>{isLifecycleStage(p.status) ? STAGE_LABELS[p.status] : p.status}</Chip>
                    {p.status === 'collected' ? (
                      state?.ready ? <Chip tone="success">Ready to test</Chip> : <Chip tone="warning">Held</Chip>
                    ) : null}
                  </span>
                }
              >
                <ul className="flex flex-col divide-y divide-console-line">
                  {p.items.map((item, idx) => {
                    const check = item.custodyCheck
                    const weight = Number(item.confirmedWeightKg ?? item.weightKg ?? 0)
                    return (
                      <li key={item.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-text-primary">
                              Line {idx + 1} · {categoryLabel(item.category)} · {item.quantity} unit
                              {item.quantity === 1 ? '' : 's'}
                              {item.chemistry ? ` · ${chemistryLabel(item.chemistry) ?? item.chemistry}` : ''} ·{' '}
                              {weight.toFixed(1)} kg
                            </div>
                            <div className="mt-0.5 text-[11px] text-text-secondary">
                              {item.tag ? (
                                <>
                                  <span className="font-mono font-bold text-text-primary">{item.tag.code}</span>
                                  {item.tag.container ? ` · box ${item.tag.container.code}` : ''}
                                  {item.tag.boundAtHub ? ' · tagged here' : ''}
                                </>
                              ) : (
                                <span className="text-warning-text">
                                  Untagged{item.untaggedReason ? ` — “${item.untaggedReason}”` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {check ? (
                              <>
                                <Chip tone={check.outcome === 'received' ? 'success' : 'error'}>{check.outcome}</Chip>
                                <div className="mt-1 text-[11px] text-text-secondary">
                                  {CHECK_METHOD_LABELS[check.method]} · {formatIstDateTime(check.checkedAt)}
                                </div>
                                {check.note ? <div className="mt-0.5 max-w-[260px] text-[11px] text-text-secondary">“{check.note}”</div> : null}
                              </>
                            ) : (
                              <Chip tone="muted">Not checked</Chip>
                            )}
                          </div>
                        </div>

                        {check?.outcome !== 'received' ? (
                          <div className="mt-2 flex flex-wrap items-start gap-4">
                            {!item.tag ? (
                              <form action={tagAtHubAction} className="flex items-center gap-2">
                                <input type="hidden" name="batchId" value={batch.id} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <input
                                  name="code"
                                  placeholder="TG-… fresh tag"
                                  aria-label={`Fresh tag for ${p.id} line ${idx + 1}`}
                                  className={`${inputClass} w-[150px] py-1.5 font-mono text-xs`}
                                  autoComplete="off"
                                />
                                <button type="submit" className={secondaryButtonClass}>
                                  Tag now
                                </button>
                              </form>
                            ) : null}
                            <details className="text-xs">
                              <summary className="cursor-pointer text-text-secondary underline underline-offset-2">
                                Record by hand…
                              </summary>
                              <form action={recordLineByHandAction} className="mt-2 flex flex-col gap-2">
                                <input type="hidden" name="batchId" value={batch.id} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <select name="outcome" defaultValue="received" className={`${inputClass} py-1.5 text-xs`}>
                                  <option value="received">Received — label unreadable</option>
                                  <option value="missing">Missing — not in the load</option>
                                </select>
                                <input
                                  name="note"
                                  required
                                  minLength={MIN_CUSTODY_NOTE_CHARS}
                                  placeholder="What was seen, and by whom"
                                  className={`${inputClass} w-[280px] py-1.5 text-xs`}
                                />
                                <button type="submit" className={secondaryButtonClass}>
                                  Record
                                </button>
                              </form>
                            </details>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            )
          })}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Panel title="Scan a tag">
            <form action={checkInByScanAction} className="flex flex-col gap-3">
              <input type="hidden" name="batchId" value={batch.id} />
              <FieldLabel htmlFor="code">Tag code</FieldLabel>
              <input
                id="code"
                name="code"
                // A scan desk: the field IS the screen, so it takes focus.
                autoFocus
                autoComplete="off"
                placeholder="Scan or type TG-…"
                className={`${inputClass} font-mono`}
              />
              <button type="submit" className={primaryButtonClass}>
                Check in
              </button>
              <p className="text-[11px] leading-relaxed text-text-secondary">
                A USB or Bluetooth barcode scanner works here as-is — it types the code and presses Enter. A tag from
                another batch, or one never issued, is refused with the reason.
              </p>
            </form>
          </Panel>

          <Panel title="Advance to tested">
            {stillCollected.length === 0 ? (
              <p className="text-xs text-text-secondary">Every pickup in this batch is already past collected.</p>
            ) : (
              <form action={advanceCustodyBatchAction} className="flex flex-col gap-3">
                <input type="hidden" name="batchId" value={batch.id} />
                <p className="text-xs leading-relaxed text-text-primary">
                  {readyToAdvance.length} of {stillCollected.length} pickup{stillCollected.length === 1 ? '' : 's'} fully
                  checked in.
                </p>
                <button type="submit" className={primaryButtonClass} disabled={readyToAdvance.length === 0}>
                  Mark {readyToAdvance.length} tested
                </button>
                <p className="text-[11px] leading-relaxed text-text-secondary">
                  Only pickups whose every line is received move. One unchecked or missing line holds its whole pickup
                  — the same rule manifests follow (AD6).
                </p>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
