import { AgentTabBar } from '@/components/agent-tab-bar'

// AgentTabBar is position: fixed, so it floats above all content without
// affecting flow. Rendering it here means every authenticated agent screen gets
// the nav without needing AppShell to supply it — which is just as well, since
// AppShell's built-in bar is the CUSTOMER's.
//
// ⚠ Every screen under (agent) must therefore pass `hideNav` to AppShell. A
// screen that forgets it renders the customer's four tabs underneath these
// four. scripts/smoke.mjs counts `aria-label="Main navigation"` and fails on
// anything other than exactly one.

// Clearance for the fixed bar is owned HERE, not by individual pages.
//
// The customer app learned this the hard way (Batch 6.5): when it was each
// screen's job via `contentClassName`, screens forgot, and their bottom-most
// control sat underneath the bar reachable only by over-scrolling. A page
// cannot opt out of a bar it doesn't render, so the layout that renders it pays
// for it. Pages add no bottom padding of their own — doing so double-pads.
//
// 5rem against a ~66px bar (py-3 24 + 22px icon + gap 4 + ~15px label + 1px
// border) is deliberate headroom.
const NAV_CLEARANCE = 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={NAV_CLEARANCE}>{children}</div>
      <AgentTabBar />
    </>
  )
}
