'use client'

import { useMemo, useState } from 'react'

import { createManifestAction } from '../actions'

// C03 · New manifest — the picker. Batch 6, owner A — Aamir.
//
// 🔴 WHY THIS IS A CLIENT COMPONENT AND WHAT THAT DOES NOT BUY IT.
// Everything below is CONVENIENCE: filtering the stock to one facility without
// a page load, running totals as you tick, and greying out the recyclers that
// cannot take the current selection. None of it is a control. AD7 is enforced
// in `createManifest()` server-side, and under AD3 there is no RLS behind that
// — a hand-crafted POST is exactly as likely as a real one, so anything this
// component "prevents" is worth nothing until the action checks it too.
// It checks it too.
//
// ⚠ Deliberately a PLAIN <form action={serverAction}> and NOT useActionState.
// Trap 26: a useActionState form carries $ACTION_REF_n / $ACTION_n:0 /
// $ACTION_KEY instead of $ACTION_ID_…, and Batch 3's verification technique
// (grep the rendered page for $ACTION_ID, post it back) then finds nothing and
// the POST silently re-renders with a 200. A plain form keeps this screen
// scriptable, which is the only way a batch with no manual testing gets
// verified at all. Errors come back via a redirect query param, same as the
// dispatch board.
//
// The checkboxes are REAL <input type="checkbox" name="itemIds"> in the DOM, so
// the form still submits correctly with JavaScript disabled — React only
// controls which of them are checked.

export interface BuilderItem {
  itemId: string
  pickupId: string
  vendorName: string
  chemistry: string | null
  chemistryLabel: string
  categoryLabel: string
  quantity: number
  weightKg: number
  facilityId: string
  facilityName: string
  handedOffLabel: string
}

export interface BuilderRecycler {
  id: string
  name: string
  cpcbRegNo: string
  isActive: boolean
  acceptedChemistries: string[]
  acceptedLabels: string[]
}

export interface BuilderFacility {
  id: string
  name: string
}

export function ManifestBuilder({
  facilities,
  items,
  recyclers,
}: {
  facilities: BuilderFacility[]
  items: BuilderItem[]
  recyclers: BuilderRecycler[]
}) {
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [recyclerId, setRecyclerId] = useState('')

  const visible = useMemo(
    () => items.filter((i) => i.facilityId === facilityId),
    [items, facilityId],
  )

  // Selection is scoped to the visible facility: switching facilities unmounts
  // the other facility's inputs, so they cannot submit. Intersecting here keeps
  // the counters honest about what will actually be sent.
  const selectedVisible = useMemo(
    () => visible.filter((i) => selected.has(i.itemId)),
    [visible, selected],
  )

  const selectedChemistries = useMemo(
    () => [...new Set(selectedVisible.map((i) => i.chemistry).filter((c): c is string => c !== null))],
    [selectedVisible],
  )

  const hasUnrecorded = selectedVisible.some((i) => i.chemistry === null)
  const totalWeight = selectedVisible.reduce((sum, i) => sum + i.weightKg, 0)
  const totalUnits = selectedVisible.reduce((sum, i) => sum + i.quantity, 0)

  /** AD7, mirrored for the UI only. The action is the real gate. */
  function rejectionFor(r: BuilderRecycler): string | null {
    if (!r.isActive) return 'not an active recycler'
    if (selectedVisible.length === 0) return null
    if (hasUnrecorded) return 'an item has no recorded chemistry'
    const missing = selectedChemistries.filter((c) => !r.acceptedChemistries.includes(c))
    if (missing.length === 0) return null
    const labels = missing.map(
      (c) => selectedVisible.find((i) => i.chemistry === c)?.chemistryLabel ?? c,
    )
    return `does not accept ${[...new Set(labels)].join(', ')}`
  }

  const eligible = recyclers.filter((r) => rejectionFor(r) === null)
  const chosen = recyclers.find((r) => r.id === recyclerId) ?? null
  const chosenRejection = chosen ? rejectionFor(chosen) : null

  const canSubmit = selectedVisible.length > 0 && chosen !== null && chosenRejection === null

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length

  return (
    <form action={createManifestAction} className="flex flex-col gap-5">
      {/* ── 1 · Facility ─────────────────────────────────────────────────── */}
      <Panel
        step="1"
        title="Facility"
        hint="One manifest is one shipment leaving one building. The action rejects a selection that spans two."
      >
        <select
          value={facilityId}
          onChange={(e) => {
            setFacilityId(e.target.value)
            setSelected(new Set())
          }}
          className="w-full max-w-[420px] rounded-lg border border-console-line bg-surface px-3 py-2 text-sm text-text-primary"
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Panel>

      {/* ── 2 · Items ────────────────────────────────────────────────────── */}
      <Panel
        step="2"
        title="Tested stock on hand"
        hint="Items on a pickup that has reached tested, physically at this facility, and not already on another manifest — drafts included, so two drafts can never claim the same battery."
      >
        {visible.length === 0 ? (
          <p className="text-xs leading-relaxed text-text-secondary">
            Nothing shippable at this facility. Stock appears here once a hub batch is advanced to
            tested on the lifecycle board.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setSelected(allVisibleSelected ? new Set() : new Set(visible.map((i) => i.itemId)))
                }
                className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-text-primary underline-offset-2 hover:underline"
              >
                {allVisibleSelected ? 'Clear all' : 'Select all'}
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary">
                {selectedVisible.length} of {visible.length} selected
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-console-line">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr>
                    <Th>{''}</Th>
                    <Th>Chemistry</Th>
                    <Th>Pickup</Th>
                    <Th>Vendor</Th>
                    <Th>Load</Th>
                    <Th>At hub since</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => {
                    const isOn = selected.has(i.itemId)
                    return (
                      <tr key={i.itemId} className="border-t border-console-line align-top">
                        <Td>
                          <input
                            type="checkbox"
                            name="itemIds"
                            value={i.itemId}
                            checked={isOn}
                            onChange={() => toggle(i.itemId)}
                            aria-label={`Include item ${i.itemId} from ${i.pickupId}`}
                            className="h-4 w-4 accent-primary-black"
                          />
                        </Td>
                        <Td>
                          <div className="text-xs font-medium text-text-primary">
                            {i.chemistryLabel}
                          </div>
                          <div className="text-[11px] text-text-secondary">{i.categoryLabel}</div>
                        </Td>
                        <Td>
                          <span className="font-mono text-[11px] text-text-primary">
                            {i.pickupId}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs text-text-secondary">{i.vendorName}</span>
                        </Td>
                        <Td>
                          <span className="text-xs text-text-secondary">
                            {i.quantity} unit{i.quantity === 1 ? '' : 's'} ·{' '}
                            {i.weightKg.toFixed(1)} kg
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs text-text-secondary">{i.handedOffLabel}</span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {/* ── 3 · Recycler ─────────────────────────────────────────────────── */}
      <Panel
        step="3"
        title="Recycler"
        hint="AD7 — a manifest may only name an active recycler whose accepted chemistries cover EVERY item on it. That is chemistry-wise segregation, and it is why one pickup's items can end up on two manifests."
      >
        <select
          name="recyclerId"
          value={recyclerId}
          onChange={(e) => setRecyclerId(e.target.value)}
          className="w-full max-w-[520px] rounded-lg border border-console-line bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Choose a recycler…</option>
          {recyclers.map((r) => {
            const rejection = rejectionFor(r)
            return (
              <option key={r.id} value={r.id} disabled={rejection !== null}>
                {r.name}
                {rejection ? ` — ${rejection}` : ''}
              </option>
            )
          })}
        </select>

        <ul className="mt-3 flex flex-col gap-1.5">
          {recyclers.map((r) => {
            const rejection = rejectionFor(r)
            return (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                <span
                  className={
                    rejection ? 'text-text-secondary line-through' : 'font-medium text-text-primary'
                  }
                >
                  {r.name}
                </span>
                <span className="font-mono text-[10px] text-text-secondary">{r.cpcbRegNo}</span>
                <span className="text-text-secondary">
                  accepts {r.acceptedLabels.join(', ') || 'nothing'}
                </span>
              </li>
            )
          })}
        </ul>

        {selectedVisible.length > 0 && eligible.length === 0 ? (
          <div className="mt-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning-text">
            No active recycler accepts every chemistry in this selection. Split it — that is exactly
            what AD7 is for, and it is why a pickup&rsquo;s items legitimately end up on two
            different manifests.
          </div>
        ) : null}
      </Panel>

      {/* ── Summary + submit ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-console-line bg-surface px-4 py-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Summary label="Items" value={String(selectedVisible.length)} />
          <Summary label="Units" value={String(totalUnits)} />
          <Summary label="Weight" value={`${totalWeight.toFixed(1)} kg`} />
          <Summary
            label="Chemistries"
            value={
              selectedChemistries.length === 0
                ? '—'
                : [...new Set(selectedVisible.map((i) => i.chemistryLabel))].join(', ')
            }
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex shrink-0 items-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create draft manifest
        </button>
      </div>

      <p className="text-xs leading-relaxed text-text-secondary">
        This creates a <span className="font-mono text-[11px]">draft</span> only. Nothing has left
        the building and no pickup advances — dispatching it is a separate, deliberate act on the
        manifest&rsquo;s own screen.
      </p>
    </form>
  )
}

function Panel({
  step,
  title,
  hint,
  children,
}: {
  step: string
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-console-line bg-surface p-4">
      <div className="mb-3">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
          {step} · {title}
        </h2>
        <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-text-secondary">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </div>
      <div className="text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 pt-2.5 pb-2 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2.5 text-left">{children}</td>
}
