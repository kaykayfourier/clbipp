// BottomTabBar is position: fixed, so it floats above all content without
// affecting flow. Placing it here means every authenticated screen gets the
// shared nav — including B's screens — without needing AppShell individually.
// Lane shift logged in docs/LANE_OWNERSHIP.md (2026-07-05).
import { BottomTabBar } from '@clbipp/ui'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomTabBar />
    </>
  )
}
