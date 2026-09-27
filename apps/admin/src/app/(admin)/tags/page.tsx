import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'
import { CHECK_METHOD_LABELS } from '@clbipp/core/custody-check'
import { MAX_TAGS_PER_ISSUE, TAG_LABELS_PER_SHEET, parseCode } from '@clbipp/core/tags'

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

import { issueTagsAction } from './actions'

// FV10 · Battery tags — feedback §4.2, decision FD12 (ours, provisional).
//
// Three jobs on one screen:
//   1. ISSUE a sheet of tags and download it to print (the office, before a run);
//   2. see every sheet issued and how much of it has been used;
//   3. LOOK UP any tag and follow it — tag → battery line → pickup → box → run
//      → hub check-in. That chain is what the feedback means by "tag should link
//      to the pickup ID … the battery/item ID … the transport box".
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ issued?: string; error?: string; code?: string }>
}) {
  const { issued, error, code } = await searchParams

  const [batches, boundCounts, total, bound, boundAtHub] = await Promise.all([
    prisma.itemTag.groupBy({
      by: ['issueBatch'],
      _count: { _all: true },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'desc' } },
      take: 20,
    }),
    prisma.itemTag.groupBy({
      by: ['issueBatch'],
      where: { batteryItemId: { not: null } },
      _count: { _all: true },
    }),
    prisma.itemTag.count(),
    prisma.itemTag.count({ where: { batteryItemId: { not: null } } }),
    prisma.itemTag.count({ where: { boundAtHub: true } }),
  ])
  const usedByBatch = new Map(boundCounts.map((b) => [b.issueBatch, b._count._all]))

  return (
    <>
      <PageHead
        title="Battery tags"
        description="Pre-issued QR tags. Print a sheet before a run; the agent binds one to each battery line at collection, and the hub scans each one back in."
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {issued ? (
        <Notice tone="success">
          Issued <span className="font-mono text-[12px] font-bold">{issued}</span>.{' '}
          <a
            href={`/api/labels/tags?batch=${encodeURIComponent(issued)}`}
            className="font-bold underline underline-offset-2"
          >
            Download the sheet to print
          </a>{' '}
          — A4, {TAG_LABELS_PER_SHEET} labels a page, standard 63.5 × 33.9 mm sticker stock (or plain paper and
          scissors).
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={String(total)} label="Tags issued" />
        <Stat value={String(bound)} label="Bound to a battery line" />
        <Stat value={String(total - bound)} label="Unused, in circulation" />
        <Stat value={String(boundAtHub)} label="Applied at the hub" tone={boundAtHub > 0 ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-[18px]">
          <Panel title="Look up a tag">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="code">Tag or box code</FieldLabel>
                <input
                  id="code"
                  name="code"
                  defaultValue={code ?? ''}
                  placeholder="TG-…"
                  className={`${inputClass} w-[220px] font-mono`}
                  autoComplete="off"
                />
              </div>
              <button type="submit" className={secondaryButtonClass}>
                Look up
              </button>
            </form>
            {code ? <TagLookup raw={code} /> : null}
          </Panel>

          <Panel title="Issued sheets" aside="Newest first">
            {batches.length === 0 ? (
              <p className="text-xs text-text-secondary">No tags issued yet. Issue a sheet to start.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                    <th className="pb-2 font-semibold">Batch</th>
                    <th className="pb-2 font-semibold">Issued</th>
                    <th className="pb-2 text-right font-semibold">Tags</th>
                    <th className="pb-2 text-right font-semibold">Used</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const used = usedByBatch.get(b.issueBatch) ?? 0
                    return (
                      <tr key={b.issueBatch} className="border-t border-console-line">
                        <td className="py-2.5 font-mono text-[11px] font-bold text-text-primary">{b.issueBatch}</td>
                        <td className="py-2.5 text-xs text-text-secondary">
                          {b._min.createdAt ? formatIstDateTime(b._min.createdAt) : '—'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs">{b._count._all}</td>
                        <td className="py-2.5 text-right font-mono text-xs">{used}</td>
                        <td className="py-2.5 text-right">
                          <a
                            href={`/api/labels/tags?batch=${encodeURIComponent(b.issueBatch)}`}
                            className="text-xs font-bold text-text-primary underline underline-offset-2"
                          >
                            PDF
                          </a>
                          {used < b._count._all ? (
                            <a
                              href={`/api/labels/tags?batch=${encodeURIComponent(b.issueBatch)}&unused=1`}
                              className="ml-3 text-xs text-text-secondary underline underline-offset-2"
                            >
                              unused only
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <Panel title="Issue a sheet">
          <form action={issueTagsAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="count">How many tags</FieldLabel>
              <input
                id="count"
                name="count"
                type="number"
                min={1}
                max={MAX_TAGS_PER_ISSUE}
                step={1}
                defaultValue={TAG_LABELS_PER_SHEET}
                required
                className={inputClass}
              />
              <p className="text-[11px] leading-relaxed text-text-secondary">
                {TAG_LABELS_PER_SHEET} fill one A4 sheet. Up to {MAX_TAGS_PER_ISSUE} at a time.
              </p>
            </div>
            <button type="submit" className={primaryButtonClass}>
              Issue tags
            </button>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Every code carries a check character, so a tag typed by hand with one character wrong is refused
              rather than bound to the wrong battery. One tag per battery line — a lot of small cells is bagged or
              crated and tagged once.
            </p>
          </form>
        </Panel>
      </div>
    </>
  )
}

/** Follow one tag through everything it is linked to. */
async function TagLookup({ raw }: { raw: string }) {
  const parsed = parseCode(raw)
  if (!parsed.ok) return <p className="mt-4 text-xs text-error-text">{parsed.error}</p>

  if (parsed.kind === 'container') {
    return (
      <p className="mt-4 text-xs text-text-secondary">
        <span className="font-mono font-bold text-text-primary">{parsed.code}</span> is a transport box —{' '}
        <Link href="/containers" className="underline underline-offset-2">
          see Boxes
        </Link>
        .
      </p>
    )
  }

  const tag = await prisma.itemTag.findUnique({
    where: { code: parsed.code },
    select: {
      code: true,
      issueBatch: true,
      createdAt: true,
      boundAt: true,
      boundAtHub: true,
      container: { select: { code: true, label: true } },
      batteryItem: {
        select: {
          category: true,
          quantity: true,
          chemistry: true,
          weightKg: true,
          confirmedWeightKg: true,
          custodyCheck: { select: { outcome: true, method: true, checkedAt: true, custodyBatchId: true } },
          pickup: {
            select: {
              id: true,
              status: true,
              vendor: { select: { fullName: true, companyName: true } },
              collectionRun: { select: { id: true, runNo: true } },
              custodyBatch: { select: { id: true, batchNo: true, facility: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })

  if (!tag) {
    return (
      <p className="mt-4 text-xs text-error-text">
        {parsed.code} is a well-formed code, but it was never issued by this console. Check the sticker.
      </p>
    )
  }

  const item = tag.batteryItem
  return (
    <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-console-line pt-4 sm:grid-cols-2">
      <LookupRow label="Tag" value={<span className="font-mono font-bold">{tag.code}</span>} />
      <LookupRow label="Issued" value={`${tag.issueBatch} · ${formatIstDateTime(tag.createdAt)}`} />
      {!item ? (
        <LookupRow label="Status" value={<Chip tone="muted">Unused</Chip>} />
      ) : (
        <>
          <LookupRow
            label="Bound"
            value={
              <>
                {tag.boundAt ? formatIstDateTime(tag.boundAt) : '—'}{' '}
                {tag.boundAtHub ? <Chip tone="warning">At the hub</Chip> : <Chip>At collection</Chip>}
              </>
            }
          />
          <LookupRow
            label="Battery line"
            value={`${categoryLabel(item.category)} · ${item.quantity} unit${item.quantity === 1 ? '' : 's'}${
              item.chemistry ? ` · ${chemistryLabel(item.chemistry) ?? item.chemistry}` : ''
            } · ${Number(item.confirmedWeightKg ?? item.weightKg ?? 0).toFixed(1)} kg`}
          />
          <LookupRow
            label="Pickup"
            value={
              <Link href={`/pickups/${encodeURIComponent(item.pickup.id)}`} className="font-mono font-bold underline underline-offset-2">
                {item.pickup.id}
              </Link>
            }
          />
          <LookupRow label="Vendor" value={item.pickup.vendor.companyName || item.pickup.vendor.fullName} />
          <LookupRow label="Box" value={tag.container ? `${tag.container.code} · ${tag.container.label}` : '—'} />
          <LookupRow
            label="Run"
            value={
              item.pickup.collectionRun ? (
                <Link href={`/runs/${item.pickup.collectionRun.id}`} className="font-mono underline underline-offset-2">
                  {item.pickup.collectionRun.runNo}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <LookupRow
            label="Hub check-in"
            value={
              item.custodyCheck ? (
                <>
                  <Chip tone={item.custodyCheck.outcome === 'received' ? 'success' : 'error'}>
                    {item.custodyCheck.outcome}
                  </Chip>{' '}
                  {CHECK_METHOD_LABELS[item.custodyCheck.method]} · {formatIstDateTime(item.custodyCheck.checkedAt)}
                </>
              ) : item.pickup.custodyBatch ? (
                <Link href={`/custody/${item.pickup.custodyBatch.id}`} className="underline underline-offset-2">
                  Awaiting check-in at {item.pickup.custodyBatch.facility.name}
                </Link>
              ) : (
                'Not at a hub yet'
              )
            }
          />
        </>
      )}
    </dl>
  )
}

function LookupRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-primary">{value}</dd>
    </div>
  )
}
