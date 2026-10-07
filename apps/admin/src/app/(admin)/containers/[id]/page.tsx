import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'
import { RUN_STATUS_LABELS } from '@clbipp/core/run-planning'
import { formatIstDateTime } from '@/lib/ist'
import { Chip, PageHead, Panel, Stat, secondaryButtonClass } from '@/components/console'

// One transport box: what is in it now, what it carried before, and its trips.
//
// A tag keeps the box it travelled in (`item_tags.container_id`) for good. A
// line is IN the box until its load is handed in at the hub (the pickup gets a
// custody batch); after that it is history. The route takes the box's id or its
// printed code, so a scanned code opens it directly.

export const dynamic = 'force-dynamic'

type TagRow = {
  code: string
  boundAt: Date | null
  batteryItem: {
    id: string
    category: string
    chemistry: string | null
    quantity: number
    weightKg: unknown
    confirmedWeightKg: unknown
    pickup: {
      id: string
      status: string
      custodyBatch: { batchNo: string } | null
      vendor: { fullName: string; companyName: string | null }
    }
  } | null
}

export default async function ContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const key = decodeURIComponent(id)
  const box = await prisma.transportContainer.findFirst({
    where: { OR: [{ id: key }, { code: key.toUpperCase() }] },
    select: {
      id: true,
      code: true,
      label: true,
      capacityKg: true,
      isActive: true,
      loads: {
        orderBy: { loadedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          loadedAt: true,
          unloadedAt: true,
          run: { select: { id: true, runNo: true, status: true, agent: { select: { fullName: true } } } },
        },
      },
      tags: {
        orderBy: { boundAt: 'desc' },
        take: 300,
        select: {
          code: true,
          boundAt: true,
          batteryItem: {
            select: {
              id: true,
              category: true,
              chemistry: true,
              quantity: true,
              weightKg: true,
              confirmedWeightKg: true,
              pickup: {
                select: {
                  id: true,
                  status: true,
                  custodyBatch: { select: { batchNo: true } },
                  vendor: { select: { fullName: true, companyName: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!box) notFound()

  const current = box.loads.find(
    (l) => l.unloadedAt === null && (l.run.status === 'planned' || l.run.status === 'in_progress'),
  )
  // Still in the van: tagged, and the load not yet handed in at the hub.
  const inBoxNow = (t: TagRow) =>
    t.batteryItem !== null &&
    t.batteryItem.pickup.custodyBatch === null &&
    (t.batteryItem.pickup.status === 'offered' || t.batteryItem.pickup.status === 'collected')
  const nowTags = box.tags.filter(inBoxNow)
  const pastTags = box.tags.filter((t) => !inBoxNow(t))

  return (
    <>
      <PageHead
        title={`Box ${box.code}`}
        description={box.label}
        actions={
          <a href={`/api/labels/containers?id=${encodeURIComponent(box.id)}`} className={secondaryButtonClass}>
            Print label
          </a>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat
          value={!box.isActive ? 'Retired' : current ? current.run.runNo : 'Free'}
          label={!box.isActive ? 'Not in use' : current ? 'On this run now' : 'At the hub'}
          tone={current ? 'warning' : 'default'}
        />
        <Stat value={String(nowTags.length)} label="Lines in it now" />
        <Stat value={String(box.loads.length)} label="Trips" />
        <Stat value={String(box.tags.length)} label="Lines carried in total" />
      </div>

      <Panel
        title="In this box now"
        aside={
          current ? (
            <>
              <Link href={`/runs/${current.run.id}`} className="font-mono underline underline-offset-2">
                {current.run.runNo}
              </Link>{' '}
              · {current.run.agent.fullName}
            </>
          ) : undefined
        }
      >
        <TagTable tags={nowTags} empty={current ? 'On a run, nothing in it yet.' : 'Empty.'} />
      </Panel>

      <Panel title="Carried before">
        <TagTable tags={pastTags} empty="Nothing yet." showHandIn />
      </Panel>

      <Panel title="Trips">
        {box.loads.length === 0 ? (
          <p className="text-xs text-text-secondary">No trips yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {box.loads.map((load) => (
              <li key={load.id} className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <Link
                  href={`/runs/${load.run.id}`}
                  className="font-mono font-bold text-text-primary underline underline-offset-2"
                >
                  {load.run.runNo}
                </Link>
                <Chip tone={load === current ? 'warning' : 'muted'}>{RUN_STATUS_LABELS[load.run.status]}</Chip>
                <span>
                  {load.run.agent.fullName} · {formatIstDateTime(load.loadedAt)}
                  {load.unloadedAt ? ` → ${formatIstDateTime(load.unloadedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

function TagTable({ tags, empty, showHandIn = false }: { tags: TagRow[]; empty: string; showHandIn?: boolean }) {
  if (tags.length === 0) return <p className="text-xs text-text-secondary">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
            <th className="pb-2 font-semibold">Tag</th>
            <th className="pb-2 font-semibold">Battery line</th>
            <th className="pb-2 font-semibold">Pickup</th>
            <th className="pb-2 font-semibold">Vendor</th>
            {showHandIn ? <th className="pb-2 font-semibold">Handed in</th> : null}
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => {
            const item = tag.batteryItem
            const kg = Number(item?.confirmedWeightKg ?? item?.weightKg ?? 0)
            return (
              <tr key={tag.code} className="border-t border-console-line align-top">
                <td className="py-2 font-mono text-[11px] font-bold">
                  <Link href={`/tags?code=${encodeURIComponent(tag.code)}`} className="underline underline-offset-2">
                    {tag.code}
                  </Link>
                </td>
                <td className="py-2 text-xs">
                  {item
                    ? `${categoryLabel(item.category)} × ${item.quantity}${
                        item.chemistry ? ` · ${chemistryLabel(item.chemistry) ?? item.chemistry}` : ''
                      } · ${kg.toFixed(1)} kg`
                    : '—'}
                </td>
                <td className="py-2 font-mono text-[11px]">
                  {item ? (
                    <Link href={`/pickups/${encodeURIComponent(item.pickup.id)}`} className="underline underline-offset-2">
                      {item.pickup.id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 text-xs text-text-secondary">
                  {item ? item.pickup.vendor.companyName || item.pickup.vendor.fullName : '—'}
                </td>
                {showHandIn ? (
                  <td className="py-2 font-mono text-[11px] text-text-secondary">
                    {item?.pickup.custodyBatch?.batchNo ?? '—'}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
