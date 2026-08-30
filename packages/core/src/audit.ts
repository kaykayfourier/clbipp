/**
 * The admin audit vocabulary (W7).
 *
 * `AdminAudit.action` is a plain `String` column, for two reasons: the values
 * are dotted (`pickup.assign`), which is not a legal Prisma enum identifier,
 * and a ninth action should not cost a migration. This file is the closed set
 * that makes that safe — 🔴 **write rows through `AdminAuditAction`, never a
 * bare string literal**, or the audit log grows typo-variants of the same
 * action and every `where: { action: … }` read silently under-counts.
 *
 * Pure: no Prisma import, no I/O. It is deliberately NOT re-exported from the
 * package barrel — `@clbipp/core` pulls in `booking-actions` / `payment-actions`
 * and therefore Prisma, so a client component importing an action label would
 * drag the query engine into the browser bundle. Import the subpath:
 *
 *     import { ADMIN_AUDIT_ACTIONS } from "@clbipp/core/audit"
 *
 * The list is PLAN_ADMIN_APP.md §3's, unchanged. Adding one means adding it
 * here first — nowhere else needs to know.
 */

export const ADMIN_AUDIT_ACTIONS = [
  /** `requested → scheduled` + `Pickup.agentId`, from the dispatch board. */
  "pickup.assign",
  /** A new `EngineConfig` row published and the previous one deactivated. */
  "config.publish",
  /** A hand-typed `MarketPrices` row replacing the feed's. */
  "market.override",
  /** An `ItemException` closed with retest / override / reject. */
  "exception.resolve",
  /**
   * A `CustodyBatch` advanced `collected → tested` — every pickup in one hub
   * drop-off, in one write (AD5's per-stage unit for that edge).
   *
   * ⚠ Added in Admin Batch 6, not in PLAN_ADMIN_APP.md §3's original list. The
   * omission was an oversight rather than a decision: `"custody_batch"` is
   * already in ADMIN_AUDIT_SUBJECTS below, so §3 clearly expected rows pointing
   * at one — it just never named the verb. Reusing `lifecycle.override` instead
   * would have been wrong twice over: `isReasonRequired()` forces a typed
   * reason on it, and `/audit` could then never separate a routine batch
   * advance from a manual escape-hatch correction.
   */
  "custody.advance",
  /** `DispatchManifest` `draft → dispatched`. */
  "manifest.dispatch",
  /** `dispatched → received`, and `received → reconciled`. */
  "manifest.confirm",
  /** B06's single-step manual advance. Requires a typed `reason`. */
  "lifecycle.override",
  /** A supplier's `Profile.marginTier` changed. */
  "supplier.margin",
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]

/**
 * The subject an audit row points at. `subjectType` is a string column too, and
 * this is its vocabulary for the same reason.
 */
export const ADMIN_AUDIT_SUBJECTS = [
  "pickup",
  "battery_item",
  "engine_config",
  "market_prices",
  "item_exception",
  "dispatch_manifest",
  "custody_batch",
  "profile",
] as const

export type AdminAuditSubject = (typeof ADMIN_AUDIT_SUBJECTS)[number]

/** Narrows an unknown string read back out of the database. */
export function isAdminAuditAction(value: string): value is AdminAuditAction {
  return (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(value)
}

/**
 * 🔴 `reason` is REQUIRED for these, enforced by the calling action rather than
 * by the column (most actions genuinely do not need one, and a NOT NULL column
 * would just collect empty strings). Batch 7 step 5 and Batch 9's exception
 * resolution both depend on this being checked.
 */
export const REASON_REQUIRED_ACTIONS: readonly AdminAuditAction[] = [
  "lifecycle.override",
  "market.override",
  "supplier.margin",
]

export function isReasonRequired(action: AdminAuditAction): boolean {
  return REASON_REQUIRED_ACTIONS.includes(action)
}
