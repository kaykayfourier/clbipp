'use client'

import { useMemo, useState } from 'react'
import { cn } from '@clbipp/ui'
import type { DataTableColumn, SortDirection, SortState } from './types'
import { EmptyState } from './states'

// ─── DataTable ────────────────────────────────────────────────────────────
// Sortable, filterable, paginated — entirely off the `rows` prop already in
// hand. Batch 2's rule is "static props, zero DB": this component never
// fetches anything and never talks to a server action. A screen with a
// thousand rows either paginates server-side and hands this one page at a
// time, or hands it everything and lets this paginate client-side — both are
// legitimate, and which one a screen picks is that screen's call, not this
// component's.
//
// Sorting: click a column with `sortValue` set to cycle asc → desc → off.
// Filtering: `getSearchText`, if given, turns on a free-text box that matches
// against it — this is a SECOND, finer-grained filter underneath whatever a
// <FilterChips> row already narrowed `rows` down to; DataTable does not know
// or care that a chip filter happened upstream.
// Pagination: fixed page size (default 20), Prev/Next, "Showing X–Y of Z" —
// the exact wording the wireframe was missing (W14).

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  getRowKey: (row: T) => string
  /** When given, a search box appears above the table and filters rows whose
   * search text contains the query (case-insensitive substring). */
  getSearchText?: (row: T) => string
  searchPlaceholder?: string
  onRowClick?: (row: T) => void
  pageSize?: number
  initialSort?: SortState
  emptyHeading?: string
  emptyDescription?: string
  /** A short label for the row unit in the "Showing X–Y of Z ___" line —
   * defaults to "rows". */
  rowNounPlural?: string
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getSearchText,
  searchPlaceholder,
  onRowClick,
  pageSize = 20,
  initialSort,
  emptyHeading = 'Nothing here',
  emptyDescription,
  rowNounPlural = 'rows',
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    if (!getSearchText || query.trim() === '') return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) => getSearchText(row).toLowerCase().includes(q))
  }, [rows, query, getSearchText])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return filtered
    const withValues = filtered.map((row) => ({ row, v: col.sortValue!(row) }))
    withValues.sort((a, b) => {
      if (a.v === null && b.v === null) return 0
      if (a.v === null) return 1 // nulls last, both directions
      if (b.v === null) return -1
      if (a.v < b.v) return sort.direction === 'asc' ? -1 : 1
      if (a.v > b.v) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
    return withValues.map((w) => w.row)
  }, [filtered, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return
    setPage(0)
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, direction: 'asc' }
      if (prev.direction === 'asc') return { key: col.key, direction: 'desc' }
      return null
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {getSearchText ? (
        <div className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-full border border-console-line bg-surface px-3.5">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-text-disabled">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder={searchPlaceholder ?? 'Search…'}
            className="w-full bg-transparent font-mono text-[11.5px] text-text-primary placeholder:text-text-disabled focus:outline-none"
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 pt-3 pb-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    !col.align && 'text-left',
                    col.width,
                    col.hideBelow && `hidden ${col.hideBelow}:table-cell`,
                  )}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className="inline-flex items-center gap-1 hover:text-text-primary"
                    >
                      {col.header}
                      <SortGlyph active={sort?.key === col.key} direction={sort?.key === col.key ? sort.direction : undefined} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-2">
                  <EmptyState heading={emptyHeading} description={emptyDescription} compact />
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-t border-console-line align-top',
                    onRowClick && 'cursor-pointer hover:bg-background',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-3',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.hideBelow && `hidden ${col.hideBelow}:table-cell`,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10.5px] text-text-secondary">
            Showing {safePage * pageSize + 1}–{Math.min(sorted.length, safePage * pageSize + pageRows.length)} of{' '}
            {sorted.length} {rowNounPlural}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <PageButton disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Prev
              </PageButton>
              <span className="font-mono text-[10.5px] text-text-secondary">
                {safePage + 1} / {pageCount}
              </span>
              <PageButton disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Next
              </PageButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SortGlyph({ active, direction }: { active?: boolean; direction?: SortDirection }) {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" className={cn('shrink-0', active ? 'text-text-primary' : 'text-text-disabled')}>
      {direction === 'desc' ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}
    </svg>
  )
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-console-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-primary disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}
