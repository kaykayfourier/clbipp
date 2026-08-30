// ─── Console data kit — shared types ─────────────────────────────────────────
// Batch 2, owner C — Ali. Pure types, no runtime code.

/** A column definition for <DataTable>. `T` is the row shape the CALLER owns —
 * this file never imports a Prisma type, so the kit stays usable from a fixture
 * as easily as from a real query result. */
export interface DataTableColumn<T> {
  /** Stable identity for this column — used as the React key and, if
   * `sortValue` is given, as the sort-state key. */
  key: string
  header: string
  /** Renders the cell. Free to return a chip, a link, a stacked two-line cell —
   * whatever the screen needs. */
  cell: (row: T) => React.ReactNode
  /** Present → the column header is clickable and sorts by this. Absent → the
   * column renders but never sorts (e.g. a trailing "open" link column). */
  sortValue?: (row: T) => string | number | null
  align?: 'left' | 'right' | 'center'
  /** A Tailwind width class, e.g. "w-[160px]". Optional — most columns should
   * size to content. */
  width?: string
  /** Hide below this breakpoint (Tailwind prefix, e.g. "md" hides on mobile-
   * width panes). Admin is desktop-first (AD11), but console panes do get
   * squeezed by the sidebar, so a table with nine columns still needs this. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

/** One entry in <FilterChips>. `count` is optional — screens with an
 * expensive per-chip count can omit it rather than compute one just to satisfy
 * a prop. */
export interface FilterChipOption {
  value: string
  label: string
  count?: number
}
