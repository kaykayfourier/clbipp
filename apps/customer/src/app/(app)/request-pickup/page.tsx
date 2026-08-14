import { redirect } from 'next/navigation'

// ─── /request-pickup → /book ─────────────────────────────────────────────────
// Replaced by the 4-step wizard in Batch 5. The old single-page form wrote a
// pickup through raw PostgREST with `battery_type` / `approx_quantity` — the
// three columns schema v2 superseded — and had no `BatteryItem`, no address
// link and no indicative quote, so it could not be repaired in place.
//
// The route is kept as a redirect rather than deleted: it is the URL every
// older doc, screenshot and bookmark points at, and a 404 there reads as a
// broken app. Safe to remove once nothing references it.
export default function RequestPickupPage() {
  redirect('/book')
}
