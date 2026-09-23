'use client'

import { useState } from 'react'

import {
  AVAILABILITY_LABELS,
  formatKm,
  formatLocationAge,
  type RankedAgent,
} from '@clbipp/core/dispatch-ranking'

// ─── The ranked agent selector (FV8) ─────────────────────────────────────────
// Replaces the plain <select> the company's notes single out: "the dropdown
// essentially just provides the agent's name."
//
// 🔴 DECISION SUPPORT, NEVER AUTO-ASSIGNMENT. The notes are explicit that the
// screen must not say "Assign Ali" — it shows "Ali — Available • 2 live jobs •
// 2.4 km away" and the dispatcher chooses. Nothing here is pre-selected, and
// the top row is labelled a recommendation rather than a decision.
//
// 🔴 UNAVAILABLE AGENTS STAY VISIBLE. The notes: showing them disabled "tells
// the admin why Ahmed isn't being recommended." An absent agent looks like a
// missing agent; a greyed one with a reason is information.

type Availability = RankedAgent['availability']

const TONE: Record<Availability, string> = {
  available: 'bg-success-bg text-success-text',
  busy: 'bg-warning-bg text-warning-text',
  unavailable: 'bg-background text-text-disabled',
}

export function AgentSelector({
  agents,
  staleAgentId,
}: {
  agents: readonly RankedAgent[]
  /** The agent left on a reactivated pickup — trap 11. Called out, not hidden. */
  staleAgentId: string | null
}) {
  const [selected, setSelected] = useState<string>('')

  const selectable = agents.filter((a) => a.availability !== 'unavailable')
  const noneAvailable = selectable.length === 0

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Agent
      </span>

      {/* Edge case 3 from the notes: with nobody free the admin must still see
          the agents AND understand why none is recommended. */}
      {noneAvailable && (
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
          No agents are currently available. The reasons are listed below — you can still assign
          one if you have a reason to override.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {agents.map((a, index) => {
          const isRecommended = index === 0 && a.availability === 'available'
          const checked = selected === a.agentId

          return (
            <label
              key={a.agentId}
              htmlFor={`agent-${a.agentId}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                checked
                  ? 'border-primary-black bg-background'
                  : 'border-console-line hover:border-text-disabled'
              }`}
            >
              <input
                type="radio"
                id={`agent-${a.agentId}`}
                name="agentId"
                value={a.agentId}
                required
                checked={checked}
                onChange={() => setSelected(a.agentId)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-black"
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{a.fullName}</span>

                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] ${TONE[a.availability]}`}
                  >
                    {AVAILABILITY_LABELS[a.availability]}
                  </span>

                  {isRecommended && (
                    <span className="rounded-full bg-primary-black px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-primary-green">
                      Nearest available
                    </span>
                  )}

                  {a.agentId === staleAgentId && (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-warning-text">
                      Was on this job
                    </span>
                  )}
                </span>

                <span className="mt-0.5 block text-xs text-text-secondary">{a.summary}</span>

                {/* 🔴 Never present a stale position as current (notes, edge
                    case 2). The age is shown whenever we have a position at
                    all, and called out explicitly once it is old. */}
                {a.locationAgeMinutes !== null && (
                  <span
                    className={`mt-0.5 block text-[10px] ${
                      a.locationStale ? 'text-warning-text' : 'text-text-disabled'
                    }`}
                  >
                    {a.distanceKm !== null ? `${formatKm(a.distanceKm)} · ` : ''}
                    location updated {formatLocationAge(a.locationAgeMinutes)}
                    {a.locationStale ? ' — may have moved since' : ''}
                  </span>
                )}

                {(a.zone || a.vehicle) && (
                  <span className="mt-0.5 block text-[10px] text-text-disabled">
                    {[a.zone, a.vehicle].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-text-secondary">
        Ranked by availability, then how much work they already have that day, then distance.
        Distance is straight-line from the agent&rsquo;s last recorded position, not travel time.
        The order is a suggestion — assign whoever you judge right.
      </p>
    </div>
  )
}
