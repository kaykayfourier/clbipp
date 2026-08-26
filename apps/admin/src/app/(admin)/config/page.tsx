// D01 · Engine config — Batch 11, owner B — Khalid.
//
// STUB, created in Batch 0. Every route in §2 of docs/PLAN_ADMIN_APP.md was
// stubbed in one go so that no two lanes ever create the same file — each
// owner only ever REPLACES their own stub. Replace this whole file when you
// build the screen; do not add a second route beside it.
//
// Keep the <h1> text ("Engine config") when you do: scripts/smoke.mjs asserts on it,
// and that assertion is what stops this route silently 500ing or 404ing later.
// A route that only ever returns a status code is asserting nothing (trap 9).
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav: those are the mobile kit's
// (AD11, trap 15).
export default function ConfigPage() {
  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Engine config
        </h1>
        <p className="mt-1 text-xs text-text-secondary">Pricing parameters. Tiers 1 and 2 editable, tier 3 read-only (AD8).</p>
      </div>
      <p className="font-mono text-[10px] tracking-[0.09em] uppercase text-text-secondary">
        Screen D01 · not built yet · batch 11
      </p>
    </>
  )
}
