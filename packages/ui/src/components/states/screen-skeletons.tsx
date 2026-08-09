import { AppShell, PagePadding } from "../layout/app-shell";
import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonListRow,
} from "../states/loading-state";

// Reusable Suspense fallbacks for `loading.tsx` files. Showing these the instant
// a navigation starts (instead of blocking on the server render) is what makes
// tab taps / screen changes feel responsive — the region fix cut the actual
// latency, these cover the remaining wait.

// Bottom padding so content clears the fixed BottomTabBar (rendered by
// (app)/layout.tsx). Mirrors NAV_PADDING on the real tracking screen.
const NAV_PADDING = "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]";

// List screens (dashboard, compliance) — no AppShell header in the real screens,
// so match: a heading block + a few list-row skeletons.
export function ListScreenSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={`px-4 py-5 ${NAV_PADDING}`}>
      <SkeletonBlock className="mb-5 h-6 w-40" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </div>
    </div>
  );
}

// Detail screens (track, scheduled, offer, profile, handover) — AppShell header
// + a stack of card skeletons. hideNav because the layout already renders the
// tab bar; contentClassName restores the bottom padding hideNav would drop.
export function DetailScreenSkeleton({
  title,
  showBack = true,
  cards = 3,
}: {
  title?: string;
  showBack?: boolean;
  cards?: number;
}) {
  return (
    <AppShell title={title} showBack={showBack} hideNav contentClassName={NAV_PADDING}>
      <PagePadding className="flex flex-col gap-5">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </PagePadding>
    </AppShell>
  );
}
