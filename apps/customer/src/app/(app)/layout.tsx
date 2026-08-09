// BottomTabBar is position: fixed, so it floats above all content without
// affecting flow. Placing it here means every authenticated screen gets the
// shared nav — including B's screens — without needing AppShell individually.
// Lane shift logged in docs/LANE_OWNERSHIP.md (2026-07-05).
import { BottomTabBar } from '@clbipp/ui'

// Clearance for that fixed bar is owned HERE, not by individual pages.
//
// It used to be each screen's job (`contentClassName={NAV_PADDING}` on AppShell),
// and screens forgot: the dashboard renders no AppShell at all, and the booking
// wizard, /submitted and /handover all passed `hideNav` without the matching
// padding — so their bottom-most control sat underneath the bar and was only
// reachable by over-scrolling. Pages cannot opt out of a bar they don't render,
// so the layout that renders it pays for it.
//
// 5rem against a ~66px bar (py-3 24 + 22px icon + gap 4 + ~15px label + 1px
// border) is deliberate headroom — the previous 4rem was ~2px short even where
// it was applied, which is its own clipping bug.
const NAV_CLEARANCE = 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={NAV_CLEARANCE}>{children}</div>
      <BottomTabBar />
    </>
  )
}
