import Link from 'next/link'

import { MAX_RUN_STOPS, RUN_RADIUS_KM, runStopEligibility, stopDateKey, suggestRunGroups } from '@clbipp/core/run-planning'
import { formatKm } from '@clbipp/core/dispatch-ranking'
import { STAGE_LABELS, isLifecycleStage } from '@clbipp/ui'

import { rankedAgentsFor } from '@/lib/agent-selection'
import { dateKeyToDbDate, formatDateKey, istDateKey } from '@/lib/ist'
import { loadStopRows } from '@/lib/runs'
import {
  Chip,
  FieldLabel,
  Notice,
  PageHead,
  Panel,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/console'

import { AgentSelector } from '../../dispatch/[id]/AgentSelector'
import { createCollectionRunAction } from '../actions'

// FV11 · Plan a collection run — feedback §4.3, decisions FD14/FD16.
//
// Pick a day, pick the stops (the same-day groups are suggested, never
// pre-applied), pick the agent from FV8's ranked list, and build. Every row's
// eligibility comes from `runStopEligibility` in @clbipp/core — the SAME rule
// createCollectionRun re-checks at the write — so a row greyed out here with a
// reason is refused there with the same reason.
//
// Plain forms, no client state beyond FV8's selector: a GET form to change the
// day, a POST form to build. No shell here (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; pickups?: string | string[]; error?: string }>
}) {
  const sp = await searchParams
  const todayKey = istDateKey(new Date())
  const dateKey = sp.date && dateKeyToDbDate(sp.date) && sp.date >= todayKey ? sp.date : todayKey
  const preselected = new Set(
    (Array.isArray(sp.pickups) ? sp.pickups : (sp.pickups ?? '').split(','))
      .map((s) => s.trim())
      .filter(Boolean),
  )

  const rows = await loadStopRows()
  const withEligibility = rows.map((r) => ({
    row: r,
    eligibility: runStopEligibility(r.facts, { agentId: null, dateKey, todayKey }),
    waitingOn: stopDateKey(r.facts, todayKey),
  }))

  // Suggestions for THIS day, over unassigned requests only — the work a
  // dispatcher is actually grouping. Already-assigned jobs for the chosen agent
  // can still be ticked below.
  const groups = suggestRunGroups(
    withEligibility
      .filter((x) => x.row.status === 'requested' && x.eligibility.ok)
      // A preferred day that has passed rolls forward to today: the request is
      // still waiting, and today is the earliest a run can take it.
      .map((x) => ({
        id: x.row.id,
        dateKey: x.waitingOn !== null && x.waitingOn < todayKey ? todayKey : x.waitingOn,
        city: x.row.city,
        lat: x.row.lat,
        lng: x.row.lng,
      })),
  ).filter((g) => g.dateKey === dateKey)

  const selectable = withEligibility.filter((x) => x.eligibility.ok)
  const blocked = withEligibility.filter((x) => !x.eligibility.ok)
  // Rows for this day first, then the rest of the eligible queue.
  selectable.sort((a, b) => Number(b.waitingOn === dateKey) - Number(a.waitingOn === dateKey))

  // Rank agents for the centre of what is ticked (or of this day's work).
  const focus = (preselected.size > 0 ? selectable.filter((x) => preselected.has(x.row.id)) : selectable.filter((x) => x.waitingOn === dateKey))
    .map((x) => x.row)
    .filter((r) => r.lat !== null && r.lng !== null)
  const centre =
    focus.length > 0
      ? {
          lat: focus.reduce((s, r) => s + (r.lat ?? 0), 0) / focus.length,
          lng: focus.reduce((s, r) => s + (r.lng ?? 0), 0) / focus.length,
        }
      : null
  const agents = await rankedAgentsFor({
    addressLat: centre?.lat ?? null,
    addressLng: centre?.lng ?? null,
    targetDay: dateKeyToDbDate(dateKey) ?? new Date(),
  })

  return (
    <>
      <PageHead
        title="Plan a collection run"
        description="Group nearby pickups for one day into one run: one agent, one vehicle, one or more QR-tracked boxes."
        actions={
          <Link href="/runs" className={secondaryButtonClass}>
            All runs
          </Link>
        }
      />

      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}

      <Panel title="Day">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="date">Run date</FieldLabel>
            <input id="date" name="date" type="date" min={todayKey} defaultValue={dateKey} className={inputClass} />
          </div>
          <button type="submit" className={secondaryButtonClass}>
            Show this day
          </button>
          <p className="text-[11px] text-text-secondary">Planning for {formatDateKey(dateKey)}.</p>
        </form>
      </Panel>

      <Panel
        title="Suggested same-day groups"
        aside={`Unassigned requests within ${RUN_RADIUS_KM} km of each other · straight-line`}
      >
        {groups.length === 0 ? (
          <p className="text-xs text-text-secondary">
            No two unassigned requests for {formatDateKey(dateKey)} sit close enough to share a run. You can still tick
            stops by hand below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <li
                key={g.pickupIds.join(',')}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-console-line px-3 py-2.5"
              >
                <div className="text-xs text-text-primary">
                  <span className="font-mono font-bold">{g.pickupIds.join(' · ')}</span>
                  <span className="ml-2 text-text-secondary">
                    {g.basis === 'distance' && g.spreadKm !== null
                      ? `within ${formatKm(g.spreadKm)}`
                      : 'same city — no coordinates to measure'}
                  </span>
                </div>
                <Link
                  href={`/runs/new?date=${dateKey}&pickups=${g.pickupIds.join(',')}`}
                  className={secondaryButtonClass}
                >
                  Use this group
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <form action={createCollectionRunAction} className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <input type="hidden" name="date" value={dateKey} />

        <div className="flex flex-col gap-[18px]">
          <Panel title="Stops" aside={`Up to ${MAX_RUN_STOPS}. Order is suggested from the hub, nearest first.`}>
            {selectable.length === 0 ? (
              <p className="text-xs text-text-secondary">Nothing in the live pipeline can join a run on this day.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-console-line">
                {selectable.map(({ row, eligibility, waitingOn }) => (
                  <li key={row.id}>
                    <label htmlFor={`stop-${row.id}`} className="flex cursor-pointer items-start gap-3 py-2.5">
                      <input
                        type="checkbox"
                        id={`stop-${row.id}`}
                        name="pickupIds"
                        value={row.id}
                        defaultChecked={preselected.has(row.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary-black"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-text-primary">{row.id}</span>
                          <Chip>{isLifecycleStage(row.status) ? STAGE_LABELS[row.status] : row.status}</Chip>
                          {eligibility.ok && eligibility.assigns ? <Chip tone="warning">Needs an agent</Chip> : null}
                          {row.facts.agentName && !(eligibility.ok && eligibility.assigns) ? (
                            <span className="text-[11px] text-text-secondary">{row.facts.agentName}</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-text-primary">{row.vendorName}</span>
                        <span className="block text-[11px] text-text-secondary">
                          {row.location} · {row.lines} line{row.lines === 1 ? '' : 's'} · {row.units} unit
                          {row.units === 1 ? '' : 's'}
                          {row.declaredKg > 0 ? ` · ${row.declaredKg.toFixed(1)} kg declared` : ''}
                          {waitingOn ? ` · for ${formatDateKey(waitingOn)}` : ' · no date'}
                          {row.lat === null ? ' · no coordinates' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {blocked.length > 0 ? (
            <Panel title="Cannot join a run on this day" aside="And why">
              <ul className="flex flex-col gap-1.5">
                {blocked.map(({ row, eligibility }) => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-mono text-[11px] font-bold text-text-disabled">{row.id}</span>
                    <span className="text-text-secondary">{row.vendorName}</span>
                    <span className="text-text-disabled">— {eligibility.ok ? '' : eligibility.reason}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Panel title="Agent & timing">
            <div className="flex flex-col gap-4">
              <AgentSelector agents={agents} staleAgentId={null} />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="startTime">First stop (IST)</FieldLabel>
                  <input id="startTime" name="startTime" type="time" defaultValue="10:00" required className={inputClass} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="gapMinutes">Minutes per stop</FieldLabel>
                  <input
                    id="gapMinutes"
                    name="gapMinutes"
                    type="number"
                    min={15}
                    max={240}
                    step={5}
                    defaultValue={60}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="vehicle">Vehicle</FieldLabel>
                <input id="vehicle" name="vehicle" placeholder="Defaults to the agent's vehicle" className={inputClass} />
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="notes">Notes for the agent</FieldLabel>
                <textarea id="notes" name="notes" rows={2} className={inputClass} placeholder="Gate codes, loading order…" />
              </div>

              <button type="submit" className={primaryButtonClass}>
                Build run
              </button>
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Stops that still need an agent are assigned to the one you choose (
                <span className="font-mono">requested → scheduled</span>, with a status event and an audit row each),
                at the suggested slots. Jobs already scheduled keep the slot their vendor was given. The agent scans a
                box to start the run.
              </p>
            </div>
          </Panel>
        </div>
      </form>
    </>
  )
}
