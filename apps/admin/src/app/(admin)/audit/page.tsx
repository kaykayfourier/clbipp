import Link from 'next/link'

import { prisma } from '@clbipp/database'
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_SUBJECTS,
  isAdminAuditAction,
  isReasonRequired,
} from '@clbipp/core/audit'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { formatIstDateTime } from '@/lib/ist'

// F03 · Audit log — Batch 14, owner A — Aamir.
//
// W7's trail finally has a reader. Four screens in the wireframe claimed "audit
// logged" over nothing: `StatusEvent` is pickup-lifecycle-only and keyed to a
// pickup, so a config publish, a market override, an exception resolution, a
// margin change and a dispatch assignment had nowhere to land. `AdminAudit`
// (Admin Batch 1) is that one table, and this is the screen that reads it.
//
// 🔴 THE FILTER LIST COMES FROM `ADMIN_AUDIT_ACTIONS`, NEVER A HAND-WRITTEN
// ARRAY. Same reason the writes go through the type: a typo-variant makes every
// `where: { action }` read under-count, silently and forever. If an action is
// missing from the chips below, the fix is in packages/core/src/audit.ts — not
// here.
//
// 🟠 THIS SCREEN DELIBERATELY DOES NOT MERGE `StatusEvent` INTO THE TRAIL.
// It was considered and rejected for this batch, for a reason worth writing
// down rather than rediscovering:
//
//   `status_events` carries TWO SPELLINGS OF ONE ROLE — the seed writes
//   `'customer'` for a vendor action, and `reschedulePickup` in the customer
//   app writes `'vendor'` (Admin Batch 1's notes). Rendering both streams here
//   would mean either half-doing that (two labels for one party, on the screen
//   whose whole job is to be believable) or migrating the column, which is a
//   schema change in B's lane on the last build day. The task sheet's own
//   instruction is "pick one and migrate, or handle both; do not half-do it" —
//   so this screen does neither, and says so.
//
//   The practical consequence is visible and intended: an AGENT action writes
//   no `AdminAudit` row, so a real collection appears NOWHERE on this page.
//   That is correct — this is the log of what an ADMIN did. The lifecycle trail
//   for a pickup lives on its own timeline, and the note at the foot of the
//   page points there so the absence never reads as data loss.
//
// 🔴 `AdminAudit.actor` is a real FK with no `onDelete` (Prisma's Restrict) —
// an actor cannot vanish out of the trail. Leave that alone.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).

// Reads go through Prisma as the table owner; no RLS is involved (AD3).
export const dynamic = 'force-dynamic'

// Server-side pagination, not client-side. The audit table only grows — it is
// the one table in this console that is append-only by design — so handing the
// whole thing to a client component would get slower every day the app is used.
const PAGE_SIZE = 25

/** Human labels for the closed vocabulary. An action with no entry falls back
 *  to its own dotted string rather than disappearing: adding a tenth action to
 *  @clbipp/core/audit must make it show up here on the same day, not on the day
 *  someone remembers this map exists. */
const ACTION_LABELS: Record<AdminAuditAction, string> = {
  'pickup.assign': 'Pickup dispatched',
  'config.publish': 'Engine config published',
  'market.override': 'Market prices overridden',
  'exception.resolve': 'Exception resolved',
  'custody.advance': 'Custody batch advanced',
  'manifest.dispatch': 'Manifest dispatched',
  'manifest.confirm': 'Manifest confirmed',
  'pickup.certify': 'Pickup certified',
  'lifecycle.override': 'Lifecycle overridden',
  'supplier.margin': 'Supplier margin changed',
}

const SUBJECT_LABELS: Record<AdminAuditSubject, string> = {
  pickup: 'Pickup',
  battery_item: 'Battery item',
  engine_config: 'Engine config',
  market_prices: 'Market prices',
  item_exception: 'Exception',
  dispatch_manifest: 'Manifest',
  custody_batch: 'Custody batch',
  profile: 'Profile',
}

/**
 * Where a subject id is readable, link to it. A subject with no screen of its
 * own is rendered as plain text rather than as a dead link — a link that goes
 * nowhere is worse than none on a page whose job is to be trustworthy.
 */
function subjectHref(subjectType: string, subjectId: string): string | null {
  switch (subjectType) {
    case 'pickup':
      return `/pickups/${encodeURIComponent(subjectId)}`
    case 'dispatch_manifest':
      return `/manifests/${encodeURIComponent(subjectId)}`
    case 'item_exception':
      // No per-exception route; the "all" view is where a resolved one is
      // visible at all (the default view filters to open).
      return '/exceptions?state=all'
    case 'custody_batch':
      return '/lifecycle'
    case 'engine_config':
      return '/config'
    case 'market_prices':
      return '/market'
    case 'profile':
      return '/suppliers'
    default:
      return null
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; subject?: string; actor?: string; page?: string }>
}) {
  const params = await searchParams

  // 🔴 Narrowed through the vocabulary's own type guard. An unknown `?action=`
  // is dropped rather than passed to Prisma — otherwise a typo in a shared URL
  // renders an empty page that looks exactly like "nothing has happened".
  const action = params.action && isAdminAuditAction(params.action) ? params.action : null
  const subject =
    params.subject && (ADMIN_AUDIT_SUBJECTS as readonly string[]).includes(params.subject)
      ? params.subject
      : null
  const actor = params.actor?.trim() || null

  const pageParam = Number(params.page ?? '1')
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

  const where = {
    ...(action ? { action } : {}),
    ...(subject ? { subjectType: subject } : {}),
    ...(actor ? { actorId: actor } : {}),
  }

  const [total, rows, actionCounts, subjectCounts, actorCounts] = await Promise.all([
    prisma.adminAudit.count({ where }),
    prisma.adminAudit.findMany({
      where,
      // The `@@index([createdAt(sort: Desc)])` exists for exactly this read.
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        subjectType: true,
        subjectId: true,
        before: true,
        after: true,
        reason: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true, email: true, role: true } },
      },
    }),
    // Counts are computed over the WHOLE table, not over the current filter —
    // a chip showing "0" because another chip is active would be a lie about
    // what is in the log.
    prisma.adminAudit.groupBy({ by: ['action'], _count: { _all: true } }),
    prisma.adminAudit.groupBy({ by: ['subjectType'], _count: { _all: true } }),
    prisma.adminAudit.groupBy({ by: ['actorId'], _count: { _all: true } }),
  ])

  const countByAction = new Map(actionCounts.map((c) => [c.action, c._count._all]))
  const countBySubject = new Map(subjectCounts.map((c) => [c.subjectType, c._count._all]))

  const actors = await prisma.profile.findMany({
    where: { id: { in: actorCounts.map((c) => c.actorId) } },
    select: { id: true, fullName: true },
  })
  const countByActor = new Map(actorCounts.map((c) => [c.actorId, c._count._all]))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(total, (page - 1) * PAGE_SIZE + rows.length)

  // Only actions that have actually happened get a chip, plus the active one so
  // a shared URL never loses its own filter. Ten chips for ten actions when
  // four have ever fired is noise on a screen meant to be scanned.
  const visibleActions = ADMIN_AUDIT_ACTIONS.filter(
    (a) => (countByAction.get(a) ?? 0) > 0 || a === action,
  )
  const visibleSubjects = ADMIN_AUDIT_SUBJECTS.filter(
    (s) => (countBySubject.get(s) ?? 0) > 0 || s === subject,
  )

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Audit log
        </h1>
        <p className="mt-1 max-w-[660px] text-xs leading-relaxed text-text-secondary">
          Every write this console has made: dispatch assignments, config publishes, market
          overrides, exception resolutions, custody advances, manifest dispatches and confirmations,
          certifications and margin changes — who, when, and what changed.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Stat value={String(total)} label={action || subject || actor ? 'Matching rows' : 'Rows'} />
        <Stat value={String(actionCounts.length)} label="Distinct actions" />
        <Stat value={String(actors.length)} label="Actors" />
      </div>

      {/* Filters are <Link>s, not state: the read is server-side and paginated,
          so a chip has to re-query anyway. A query string is also shareable and
          back-buttonable, which a client-side filter is not. */}
      <div className="flex flex-col gap-2">
        <FilterRow label="Action">
          <FilterLink href={hrefFor({ action: null, subject, actor })} active={action === null}>
            All
          </FilterLink>
          {visibleActions.map((a) => (
            <FilterLink
              key={a}
              href={hrefFor({ action: a, subject, actor })}
              active={action === a}
              count={countByAction.get(a)}
            >
              {ACTION_LABELS[a]}
            </FilterLink>
          ))}
        </FilterRow>
        <FilterRow label="Subject">
          <FilterLink href={hrefFor({ action, subject: null, actor })} active={subject === null}>
            All
          </FilterLink>
          {visibleSubjects.map((s) => (
            <FilterLink
              key={s}
              href={hrefFor({ action, subject: s, actor })}
              active={subject === s}
              count={countBySubject.get(s)}
            >
              {SUBJECT_LABELS[s]}
            </FilterLink>
          ))}
        </FilterRow>
        <FilterRow label="Actor">
          <FilterLink href={hrefFor({ action, subject, actor: null })} active={actor === null}>
            Anyone
          </FilterLink>
          {actors.map((a) => (
            <FilterLink
              key={a.id}
              href={hrefFor({ action, subject, actor: a.id })}
              active={actor === a.id}
              count={countByActor.get(a.id)}
            >
              {a.fullName}
            </FilterLink>
          ))}
        </FilterRow>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {total === 0 && !action && !subject && !actor
            ? 'Nothing has been written yet. Every admin write in this console lands here.'
            : 'No rows match this filter. Clear it to see the whole trail.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Subject</Th>
                <Th>What changed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const href = subjectHref(row.subjectType, row.subjectId)
                // 🔴 Narrow, don't just test — a boolean flag next to
                // `row.action` leaves it a bare `string`, which cannot index
                // the label map or reach isReasonRequired(). This is the one
                // line that keeps the whole vocabulary type-safe at the read
                // end as well as the write end.
                const known = isAdminAuditAction(row.action) ? row.action : null
                return (
                  <tr key={row.id} className="border-t border-console-line align-top">
                    <Td>
                      <div className="font-mono text-[11px] text-text-primary">
                        {formatIstDateTime(row.createdAt)}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-xs text-text-primary">{row.actor.fullName}</div>
                      <div className="font-mono text-[10px] text-text-secondary">
                        {row.actor.email}
                      </div>
                    </Td>
                    <Td>
                      {/* The dotted string is shown verbatim under the label —
                          it is what a `where: { action }` query uses, and an
                          admin reading this page is the person most likely to
                          need it. */}
                      <div className="text-xs font-semibold text-text-primary">
                        {known ? ACTION_LABELS[known] : 'Unrecognised action'}
                      </div>
                      <div className="font-mono text-[10px] text-text-secondary">{row.action}</div>
                    </Td>
                    <Td>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                        {SUBJECT_LABELS[row.subjectType as AdminAuditSubject] ?? row.subjectType}
                      </div>
                      {href ? (
                        <Link
                          href={href}
                          className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
                        >
                          {shortId(row.subjectId)}
                        </Link>
                      ) : (
                        <span className="font-mono text-[11px] text-text-primary">
                          {shortId(row.subjectId)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Diff before={row.before} after={row.after} />
                      {row.reason ? (
                        <p className="mt-1.5 max-w-[420px] rounded-lg bg-background px-2.5 py-1.5 text-[11px] leading-relaxed text-text-primary">
                          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                            Reason
                          </span>
                          <br />
                          {row.reason}
                        </p>
                      ) : known && isReasonRequired(known) ? (
                        // A reason-required action with no reason is a row
                        // written before the check existed, or around it. Say
                        // so rather than rendering an indistinguishable blank.
                        <p className="mt-1.5 text-[11px] italic text-warning-text">
                          No reason recorded — this action requires one.
                        </p>
                      ) : null}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10.5px] text-text-secondary">
            {`Showing ${firstRow}–${lastRow} of ${total} entries`}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <PageLink
                href={hrefFor({ action, subject, actor, page: page - 1 })}
                disabled={page <= 1}
              >
                Prev
              </PageLink>
              <span className="font-mono text-[10.5px] text-text-secondary">
                {`${page} / ${pageCount}`}
              </span>
              <PageLink
                href={hrefFor({ action, subject, actor, page: page + 1 })}
                disabled={page >= pageCount}
              >
                Next
              </PageLink>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="max-w-[680px] text-xs leading-relaxed text-text-secondary">
        🟠 This is the log of what an <em>admin</em> did. A vendor accepting an offer or an agent
        collecting a pickup writes a{' '}
        <span className="font-mono text-[11px]">status_events</span> row, not an audit row, so those
        appear on the pickup&rsquo;s own timeline rather than here — that absence is the design, not
        a gap. Open a pickup from{' '}
        <Link href="/pickups" className="font-semibold underline underline-offset-2">
          pickups
        </Link>{' '}
        to see its full custody trail.
      </p>
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────
// Local on purpose, the same call every A-lane screen in this app made: C's
// <DataTable> is a client component and paginates in the browser, which is the
// wrong shape for an append-only table read one page at a time on the server.
// See docs/LANE_OWNERSHIP.md.

/**
 * The before/after diff.
 *
 * ⚠ Both columns are `Json?`, so a value can be an object, a scalar, an array,
 * SQL NULL, or the JSON value `null` (trap 21) — this renders all of those
 * without throwing. A row with `before` unset (a config publish with no parent,
 * a certification that created something rather than changing it) is a real and
 * correct shape, and shows as "created" rather than as an empty cell.
 */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = asRecord(before)
  const a = asRecord(after)

  if (!b && !a) {
    return <span className="text-xs text-text-disabled">No field-level record.</span>
  }

  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]))

  return (
    <ul className="flex flex-col gap-0.5">
      {keys.map((key) => {
        const from = b ? b[key] : undefined
        const to = a ? a[key] : undefined
        const changed = JSON.stringify(from) !== JSON.stringify(to)
        return (
          <li key={key} className="flex flex-wrap items-baseline gap-1.5 font-mono text-[10.5px]">
            <span className="text-text-secondary">{key}</span>
            {b ? (
              <>
                <span className="text-text-disabled">{render(from)}</span>
                <span className="text-text-disabled">→</span>
              </>
            ) : null}
            <span className={changed ? 'font-bold text-text-primary' : 'text-text-secondary'}>
              {render(to)}
            </span>
          </li>
        )
      })}
      {!b ? (
        <li className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-disabled">
          created — no prior value
        </li>
      ) : null}
    </ul>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function render(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value === '' ? '""' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** Document numbers (PKP-…, MFT-…) read fine in full; a raw uuid does not. */
function shortId(id: string): string {
  return id.length > 20 && id.includes('-') && !/^[A-Z]{3}-/.test(id) ? `${id.slice(0, 8)}…` : id
}

function hrefFor({
  action,
  subject,
  actor,
  page,
}: {
  action: string | null
  subject: string | null
  actor: string | null
  page?: number
}): string {
  const q = new URLSearchParams()
  if (action) q.set('action', action)
  if (subject) q.set('subject', subject)
  if (actor) q.set('actor', actor)
  if (page && page > 1) q.set('page', String(page))
  const s = q.toString()
  return s ? `/audit?${s}` : '/audit'
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[52px] shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterLink({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
        active
          ? 'border-primary-black bg-primary-black text-primary-green'
          : 'border-console-line bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
      {count !== undefined ? (
        <span
          className={`font-mono text-[10px] ${active ? 'text-primary-green/70' : 'text-text-disabled'}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center rounded-lg border border-console-line px-3 py-1.5 text-[11.5px] font-semibold text-text-disabled">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-text-primary hover:bg-background"
    >
      {children}
    </Link>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-console-line bg-surface px-6 py-12 text-center">
      <p className="mx-auto max-w-[420px] text-xs leading-relaxed text-text-secondary">{children}</p>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-console-line bg-surface px-4 py-3">
      <div className="font-display text-xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </div>
    </div>
  )
}
