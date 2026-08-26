// B03 · Dispatch request — Batch 3, owner A — Aamir.
//
// STUB, created in Batch 0. Every route in §2 of docs/PLAN_ADMIN_APP.md was
// stubbed in one go so that no two lanes ever create the same file — each
// owner only ever REPLACES their own stub. Replace this whole file when you
// build the screen; do not add a second route beside it.
//
// Keep the <h1> text ("Dispatch request") when you do: scripts/smoke.mjs asserts on it,
// and that assertion is what stops this route silently 500ing or 404ing later.
// A route that only ever returns a status code is asserting nothing (trap 9).
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav: those are the mobile kit's
// (AD11, trap 15).
export default async function DispatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Dispatch request
        </h1>
        <p className="mt-1 text-xs text-text-secondary">The request in full, plus the agent picker that schedules it.</p>
      </div>
      <p className="font-mono text-[11px] text-text-secondary">id: {id}</p>
      <p className="font-mono text-[10px] tracking-[0.09em] uppercase text-text-secondary">
        Screen B03 · not built yet · batch 3
      </p>
    </>
  )
}
