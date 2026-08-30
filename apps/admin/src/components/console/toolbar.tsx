'use client'

import { cn } from '@clbipp/ui'
import type { FilterChipOption } from './types'

// ─── FilterChips ────────────────────────────────────────────────────────────
// A row of toggle chips — "every stage" style filtering (pickups by status,
// manifests by ManifestStatus, exceptions by kind). Controlled: the caller
// owns the selected value and passes it back down, same pattern as every form
// primitive in this repo. Single-select by default; pass `multiple` for a
// screen that needs more than one chip active at once.

export interface FilterChipsProps {
  options: readonly FilterChipOption[]
  /** Single-select: the active value, or null for "all". Multiple-select: the
   * array of active values. */
  value: string | null | readonly string[]
  onChange: (value: string | null | readonly string[]) => void
  /** Renders an "All N" chip first, selecting it clears the filter. Omit when
   * the screen has no meaningful "everything" state. */
  allLabel?: string
  allCount?: number
  multiple?: boolean
}

export function FilterChips({
  options,
  value,
  onChange,
  allLabel,
  allCount,
  multiple = false,
}: FilterChipsProps) {
  const selected = multiple ? (Array.isArray(value) ? value : []) : value

  function isOn(v: string): boolean {
    return multiple ? (selected as readonly string[]).includes(v) : value === v
  }

  function toggle(v: string) {
    if (!multiple) {
      onChange(value === v ? null : v)
      return
    }
    const set = new Set(selected as readonly string[])
    if (set.has(v)) set.delete(v)
    else set.add(v)
    onChange(Array.from(set))
  }

  const allActive = multiple ? (selected as readonly string[]).length === 0 : value === null

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
      {allLabel ? (
        <Chip
          active={allActive}
          onClick={() => onChange(multiple ? [] : null)}
          label={allLabel}
          count={allCount}
        />
      ) : null}
      {options.map((opt) => (
        <Chip key={opt.value} active={isOn(opt.value)} onClick={() => toggle(opt.value)} label={opt.label} count={opt.count} />
      ))}
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors',
        active
          ? 'border-primary-black bg-primary-black text-primary-green'
          : 'border-console-line bg-surface text-text-secondary hover:text-text-primary',
      )}
    >
      {label}
      {count !== undefined ? (
        <span className={cn('font-mono text-[10px]', active ? 'text-primary-green/70' : 'text-text-disabled')}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

// ─── Toolbar ────────────────────────────────────────────────────────────────
// Search box on the left, an arbitrary slot (usually <FilterChips> or a
// <Link>) on the right. The search box is fully controlled — it does not
// filter anything itself, so it can sit above either a <DataTable> (whose own
// `getSearchText` prop does the actual filtering) or a server-side search
// (the caller re-fetches on change). Composing it either way is the caller's
// choice; the component makes no assumption about which.

export interface ToolbarProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  right?: React.ReactNode
  children?: React.ReactNode
}

export function Toolbar({ searchValue, onSearchChange, searchPlaceholder, right, children }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {onSearchChange ? (
          <div className="flex h-9 min-w-[220px] items-center gap-2 rounded-full border border-console-line bg-surface px-3.5">
            <SearchIcon />
            <input
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search…'}
              className="w-full bg-transparent font-mono text-[11.5px] text-text-primary placeholder:text-text-disabled focus:outline-none"
            />
          </div>
        ) : null}
        {children}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-text-disabled">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
