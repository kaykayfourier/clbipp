// ─── Console data kit — barrel ───────────────────────────────────────────────
// Batch 2, owner C — Ali. Every screen in apps/admin/src/app/(admin) imports
// from here rather than reaching into individual files, same convention as
// @clbipp/ui's own index.ts.
//
// 🔴 Nothing exported below may be re-exported from packages/ui (AD11/AD12) —
// this kit is desktop-console-only, and packages/ui is the mobile kit two
// shipped apps depend on.

export * from './types'
export * from './page-head'
export * from './kpi-tile'
export * from './status-pill'
export * from './toolbar'
export * from './data-table'
export * from './capacity-gauge'
export * from './mini-bar-chart'
export * from './split-bar'
export * from './drawer'
export * from './confirm-dialog'
export * from './states'
export * from './fixtures'
