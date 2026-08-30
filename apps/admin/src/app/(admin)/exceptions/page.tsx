import Link from 'next/link'

import { prisma, ExceptionResolution } from '@clbipp/database'
import { categoryLabel, chemistryLabel } from '@clbipp/core/intake'

import { formatAge, formatIstDateTime } from '@/lib/ist'

import { resolveExceptionAction } from './actions'

// D05 · Exception queue — Batch 14, owner A — Aamir.
//
// W4's screen finally has a table under it. The wireframe drew an exceptions
// board over nothing: `HOLD` and `REVIEW` are engine decision flags
// (`decision.pathway === null` plus `flags`), and no model recorded that an
// admin had cleared one. `ItemException` (Admin Batch 1, AD4) is that model,
// and this is its reader and its one writer.
//
// 🔴 THREE THINGS THIS SCREEN IS NOT:
//
//   1. It is not a lifecycle board. Resolving an exception advances nothing —
//      no PickupStatus, no StatusEvent, no pathway. See the action's header.
//      A pickup carrying a flagged item still sits at whatever stage it
//      reached, and that is correct (AD4).
//   2. It is not keyed on `trace_id`. 🔴 A flat-rate (non-li-ion) item has NO
//      traceId at all, and seed fixture 6 deliberately opens one exception on
//      exactly such an item (PKP-2026-000113's lead-acid line). A trace-keyed
//      table would silently drop it — W2/AD1, and the reason every operational
//      table in this console keys on `battery_item_id`.
//   3. It is not filtered by an open/closed column. 🔴 "Open" is
//      `resolvedAt: null`; there is no boolean and none is being added. The
//      `@@index([resolvedAt])` does NOT sort open rows to the front either —
//      nulls sort last on a DESC index in Postgres — so this screen FILTERS,
//      it does not lean on ordering.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).

// Reads go through Prisma as the table owner; no RLS is involved (AD3).
export const dynamic = 'force-dynamic'

type StateFilter = 'open' | 'resolved' | 'all'

const STATE_FILTERS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

const KIND_LABELS: Record<string, string> = {
  hold: 'Hold',
  review: 'Review',
}

/**
 * The engine's `cause` is machine-readable on purpose — it is what a future
 * report groups by. This map is presentation only, and an UNKNOWN cause falls
 * back to the raw string rather than being hidden: a new engine flag must show
 * up on this board the day it starts firing, not the day someone remembers to
 * add a label for it.
 */
const CAUSE_LABELS: Record<string, string> = {
  soh_below_gate: 'SoH below the reuse gate',
  damage_score_high: 'Damage score above threshold',
  bms_entropy_anomaly: 'BMS entropy anomaly',
  bms_anomaly: 'BMS anomaly',
}

const RESOLUTION_LABELS: Record<string, string> = {
  retest: 'Retest — send it back for a second read',
  override: 'Override — the flag was wrong, clear it',
  reject: 'Reject — the flag stands, the item is out',
}

/** Built from the Prisma enum, so the <select> and the action's validator can
 *  never disagree about what the three legal values are. */
const RESOLUTIONS = Object.values(ExceptionResolution)

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string
    kind?: string
    error?: string
    resolved?: string
    already?: string
  }>
}) {
  const params = await searchParams
  const state: StateFilter =
    params.state === 'resolved' || params.state === 'all' ? params.state : 'open'
  const kind = params.kind === 'hold' || params.kind === 'review' ? params.kind : null

  const [rows, openCount, resolvedCount] = await Promise.all([
    prisma.itemException.findMany({
      where: {
        ...(state === 'open' ? { resolvedAt: null } : {}),
        ...(state === 'resolved' ? { resolvedAt: { not: null } } : {}),
        ...(kind ? { kind } : {}),
      },
      // Oldest first inside the open view — an exception that has been sitting
      // for six days is the one that needs an admin, not the newest one.
      orderBy: { openedAt: 'asc' },
      select: {
        id: true,
        kind: true,
        cause: true,
        detail: true,
        openedAt: true,
        resolution: true,
        resolvedAt: true,
        notes: true,
        resolver: { select: { fullName: true } },
        batteryItem: {
          select: {
            id: true,
            category: true,
            chemistry: true,
            traceId: true,
            quantity: true,
            pickup: {
              select: {
                id: true,
                status: true,
                vendor: { select: { fullName: true, companyName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.itemException.count({ where: { resolvedAt: null } }),
    prisma.itemException.count({ where: { resolvedAt: { not: null } } }),
  ])

  // ⚠ ONE clock reading for the whole board. Two age columns computed a
  // millisecond apart can disagree, and `new Date()` inside a render function
  // is an impure call — same rule as /lifecycle's CoverageTable.
  const now = new Date()

  const oldestOpenDays = rows
    .filter((r) => r.resolvedAt === null)
    .reduce((max, r) => Math.max(max, daysBetween(r.openedAt, now)), 0)

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Exception queue
        </h1>
        <p className="mt-1 max-w-[660px] text-xs leading-relaxed text-text-secondary">
          Engine holds and reviews, per battery item, resolved as retest, override or reject.
          Resolving one records a decision — it does not move a pickup. An item&rsquo;s pickup stays
          at whatever stage it reached.
        </p>
      </div>

      {params.error ? <Banner tone="error">{params.error}</Banner> : null}
      {params.resolved ? (
        <Banner tone="success">
          Exception resolved. The decision, who made it and the note are on the{' '}
          <Link href="/audit" className="font-semibold underline underline-offset-2">
            audit log
          </Link>
          . Nothing about the item&rsquo;s pickup changed.
        </Banner>
      ) : null}
      {params.already ? (
        <Banner tone="success">
          That exception was already resolved — the first resolution stands and no second one was
          written. Resolution is idempotent by design.
        </Banner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={String(openCount)} label="Open" tone={openCount > 0 ? 'warning' : 'default'} />
        <Stat value={String(resolvedCount)} label="Resolved" />
        <Stat
          value={oldestOpenDays > 0 ? `${oldestOpenDays}d` : '—'}
          label="Oldest open, in view"
          tone={oldestOpenDays >= 5 ? 'warning' : 'default'}
        />
      </div>

      {/* Filters are <Link>s, not state — the whole board is a server read, and
          a query string is shareable, back-buttonable and needs no client
          bundle. C's <FilterChips> is a client component; using it here would
          ship the table to the browser to gain nothing. */}
      <div className="flex flex-wrap items-center gap-4">
        <FilterRow label="State">
          {STATE_FILTERS.map((f) => (
            <FilterLink
              key={f.value}
              href={hrefFor({ state: f.value, kind })}
              active={state === f.value}
            >
              {f.label}
            </FilterLink>
          ))}
        </FilterRow>
        <FilterRow label="Kind">
          <FilterLink href={hrefFor({ state, kind: null })} active={kind === null}>
            Any
          </FilterLink>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <FilterLink key={value} href={hrefFor({ state, kind: value })} active={kind === value}>
              {label}
            </FilterLink>
          ))}
        </FilterRow>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {state === 'resolved'
            ? 'Nothing has been resolved yet. Close an open exception and it appears here with who closed it and why.'
            : state === 'open'
              ? 'No open exceptions. Every engine hold and review has been dealt with.'
              : 'No exceptions at all — the engine has not flagged an item.'}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ExceptionCard key={row.id} row={row} now={now} />
          ))}
        </div>
      )}

      <p className="max-w-[680px] text-xs leading-relaxed text-text-secondary">
        🔴 A resolution is a decision about an <em>item</em>, not about its pickup.
        <span className="font-mono text-[11px]"> override</span> here means the engine&rsquo;s flag
        was wrong, not &ldquo;advance this pickup&rdquo;. If a rejection ought to stop a pickup
        moving, that is the manual override on{' '}
        <Link href="/lifecycle" className="font-semibold underline underline-offset-2">
          lifecycle control
        </Link>
        , which takes a typed reason and writes a status event.
      </p>
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────
// Local on purpose, the same call Batches 3, 6 and 7 made: C's console kit
// (DataTable, FilterChips) is a CLIENT component, and every row here sits next
// to a server-action form. Using it would mean shipping the board to the
// browser to gain sorting over a handful of rows. See docs/LANE_OWNERSHIP.md.

type ExceptionRow = {
  id: string
  kind: string
  cause: string
  detail: string | null
  openedAt: Date
  resolution: string | null
  resolvedAt: Date | null
  notes: string | null
  resolver: { fullName: string } | null
  batteryItem: {
    id: string
    category: string
    chemistry: string | null
    traceId: string | null
    quantity: number
    pickup: {
      id: string
      status: string
      vendor: { fullName: string; companyName: string | null }
    }
  }
}

function ExceptionCard({ row, now }: { row: ExceptionRow; now: Date }) {
  const open = row.resolvedAt === null
  const item = row.batteryItem
  const pickup = item.pickup

  return (
    <section
      className={`rounded-xl border bg-surface p-4 ${
        open ? 'border-warning-border' : 'border-console-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${
                row.kind === 'hold'
                  ? 'bg-error-bg text-error-text'
                  : 'bg-warning-bg text-warning-text'
              }`}
            >
              {KIND_LABELS[row.kind] ?? row.kind}
            </span>
            {/* 🔴 The machine-readable cause, shown verbatim next to its
                sentence. A future report groups by this string, so it must be
                readable off the screen rather than translated away. */}
            <span className="font-mono text-[11px] font-bold text-text-primary">{row.cause}</span>
            <span className="text-xs text-text-secondary">
              {CAUSE_LABELS[row.cause] ?? 'Uncatalogued engine flag'}
            </span>
          </div>
          {row.detail ? (
            <p className="mt-1.5 max-w-[620px] text-xs leading-relaxed text-text-primary">
              {row.detail}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[11px] text-text-secondary">
            {formatIstDateTime(row.openedAt)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-disabled">
            {/* Trap 32 — one text node, so a smoke grep can see the whole
                string. `{formatAge(…)} open` would render an HTML comment in
                the middle of it. */}
            {`opened ${formatAge(row.openedAt, now)} ago`}
          </div>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t border-console-line pt-3">
        <Field label="Item">
          <span className="text-xs text-text-primary">
            {chemistryLabel(item.chemistry) ?? categoryLabel(item.category)}
          </span>
          {/* 🔴 A flat-rate item has NO traceId, and one of the seeded open
              exceptions is on exactly such an item. It says so rather than
              rendering a blank cell — an empty column reads as missing data. */}
          <span className="ml-2 font-mono text-[10px] text-text-secondary">
            {item.traceId ?? 'flat-rate · no trace'}
          </span>
        </Field>
        <Field label="Pickup">
          <Link
            href={`/pickups/${encodeURIComponent(pickup.id)}`}
            className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
          >
            {pickup.id}
          </Link>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary">
            {pickup.status}
          </span>
        </Field>
        <Field label="Vendor">
          <span className="text-xs text-text-primary">
            {pickup.vendor.companyName || pickup.vendor.fullName}
          </span>
        </Field>
      </dl>

      {open ? (
        <form action={resolveExceptionAction} className="mt-3 border-t border-console-line pt-3">
          <input type="hidden" name="exceptionId" value={row.id} />
          {/* Carried only so the action can revalidate that pickup's detail
              page, which renders an open-exception banner. It is NOT identity
              and nothing is authorised off it. */}
          <input type="hidden" name="pickupId" value={pickup.id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[280px] flex-1 flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                Resolution
              </span>
              <select
                name="resolution"
                required
                defaultValue=""
                className="rounded-lg border border-console-line bg-surface px-2.5 py-1.5 text-xs text-text-primary"
              >
                <option value="" disabled>
                  Choose one…
                </option>
                {RESOLUTIONS.map((value) => (
                  <option key={value} value={value}>
                    {RESOLUTION_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[320px] flex-[2] flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                Notes (optional — they land on the audit trail)
              </span>
              <input
                type="text"
                name="notes"
                maxLength={600}
                placeholder="Re-tested at the hub; damage is cosmetic."
                className="rounded-lg border border-console-line bg-surface px-2.5 py-1.5 text-xs text-text-primary"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
            >
              Resolve
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 border-t border-console-line pt-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full bg-success-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-success-text">
              {row.resolution ?? 'resolved'}
            </span>
            <span className="text-xs text-text-secondary">
              {`by ${row.resolver?.fullName ?? 'an admin'} on ${formatIstDateTime(row.resolvedAt!)}`}
            </span>
          </div>
          {row.notes ? (
            <p className="mt-1.5 max-w-[620px] text-xs leading-relaxed text-text-primary">
              {row.notes}
            </p>
          ) : (
            <p className="mt-1.5 text-xs italic text-text-disabled">No note was written.</p>
          )}
        </div>
      )}
    </section>
  )
}

function hrefFor({ state, kind }: { state: StateFilter; kind: string | null }): string {
  const q = new URLSearchParams()
  if (state !== 'open') q.set('state', state)
  if (kind) q.set('kind', kind)
  const s = q.toString()
  return s ? `/exceptions?${s}` : '/exceptions'
}

function daysBetween(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000))
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
        active
          ? 'border-primary-black bg-primary-black text-primary-green'
          : 'border-console-line bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </Link>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-console-line bg-surface px-6 py-12 text-center">
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
