// The sidebar's route table. Data only — <Sidebar> renders it and nothing else
// derives navigation independently.
//
// ⚠ This is the console's mirror of apps/customer/src/lib/pickup-nav.ts and
// apps/agent/src/lib/job-nav.ts: app routing lives in one file per app, not
// re-derived inside screens.
//
// It corrects the wireframe rather than copying it. The wireframe's sidebar has
// FOUR groups and twelve items (Workspace / Engine / Network / Reports) — but
// that list predates §0, which adds three screen groups the wireframe simply
// does not have: dispatch (W1), pickups (W2) and manifests (W9). Those are the
// P0 screens; leaving them out of the nav would leave the demo unreachable.
// So: five groups, sixteen items, matching §2 of docs/PLAN_ADMIN_APP.md —
// nineteen since feedback_logistics (2026-09-27) added Runs, Boxes and Tags.
//
// Detail routes (/dispatch/[id], /pickups/[id], /manifests/new,
// /manifests/[id], /trace/[traceId]) are deliberately NOT nav items — they are
// reached from their list screen. `matchPrefix` is what keeps the parent item
// lit while you are on one of them.

export type NavItem = {
  /** The wireframe's two-digit rail number (.csb-item .num). Cosmetic. */
  num: string
  label: string
  href: string
  icon: IconName
  /**
   * Also highlight this item for any route beginning with `href/`. On for list
   * screens that own detail routes; off for `/`, which would otherwise match
   * every route in the app.
   */
  matchPrefix?: boolean
  /** Screen id in §2 of the plan, so a nav item can be traced to its spec. */
  screen: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export type IconName =
  | 'route'
  | 'box'
  | 'tag'
  | 'grid'
  | 'send'
  | 'truck'
  | 'layers'
  | 'db'
  | 'clipboard'
  | 'sliders'
  | 'trend'
  | 'list'
  | 'alert'
  | 'users'
  | 'badge'
  | 'building'
  | 'shield'
  | 'chart'
  | 'history'

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { num: '01', label: 'Overview', href: '/', icon: 'grid', screen: 'B01' },
      { num: '02', label: 'Dispatch', href: '/dispatch', icon: 'send', matchPrefix: true, screen: 'B02' },
      { num: '03', label: 'Pickups', href: '/pickups', icon: 'clipboard', matchPrefix: true, screen: 'B04' },
      // FV11 · FD16. Same-day grouping — built from the board's suggestions.
      { num: '04', label: 'Runs', href: '/runs', icon: 'route', matchPrefix: true, screen: 'FV11' },
      // FV12: /custody/[batchId] (hub check-in) is a lifecycle detail screen
      // under a different prefix — isNavItemActive keeps this item lit on it.
      { num: '05', label: 'Lifecycle', href: '/lifecycle', icon: 'layers', screen: 'B06' },
    ],
  },
  {
    label: 'Chain of custody',
    items: [
      { num: '06', label: 'Inventory', href: '/inventory', icon: 'db', screen: 'C01' },
      { num: '07', label: 'Manifests', href: '/manifests', icon: 'truck', matchPrefix: true, screen: 'C02' },
      // FV10–FV11 · FD12, FD14. The physical kit: reusable boxes and tag sheets.
      { num: '08', label: 'Boxes', href: '/containers', icon: 'box', screen: 'FV11' },
      { num: '09', label: 'Tags', href: '/tags', icon: 'tag', screen: 'FV10' },
    ],
  },
  {
    label: 'Engine',
    items: [
      { num: '10', label: 'Config', href: '/config', icon: 'sliders', screen: 'D01' },
      { num: '11', label: 'Market feed', href: '/market', icon: 'trend', screen: 'D02' },
      { num: '12', label: 'Quote queue', href: '/quotes', icon: 'list', screen: 'D03' },
      { num: '13', label: 'Exceptions', href: '/exceptions', icon: 'alert', screen: 'D05' },
    ],
  },
  {
    label: 'Network',
    items: [
      { num: '14', label: 'Suppliers', href: '/suppliers', icon: 'users', screen: 'E01' },
      { num: '15', label: 'Agents', href: '/agents', icon: 'badge', screen: 'E02' },
      { num: '16', label: 'Facilities', href: '/facilities', icon: 'building', screen: 'E03' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { num: '17', label: 'Compliance', href: '/compliance', icon: 'shield', screen: 'F01' },
      { num: '18', label: 'Analytics', href: '/analytics', icon: 'chart', screen: 'F02' },
      { num: '19', label: 'Audit log', href: '/audit', icon: 'history', screen: 'F03' },
    ],
  },
]

/**
 * Is `item` the one the current pathname belongs to?
 *
 * `/` is exact-match only — `matchPrefix` on the dashboard would light it up on
 * every route in the console, which is the classic version of this bug.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true
  // FV12 — the hub check-in screen belongs to Lifecycle, where its batches are
  // listed, though its URL does not share the prefix.
  if (item.href === '/lifecycle' && pathname.startsWith('/custody/')) return true
  return Boolean(item.matchPrefix) && pathname.startsWith(`${item.href}/`)
}
