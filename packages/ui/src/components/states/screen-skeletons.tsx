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

// Clearance under the fixed BottomTabBar is owned by (app)/layout.tsx, which
// wraps every authenticated screen — including these fallbacks. Don't add it
// here too, or the skeleton sits at a different offset than the screen it is
// standing in for and the content jumps when the real render arrives.

// List screens (dashboard, compliance) — no AppShell header in the real screens,
// so match: a heading block + a few list-row skeletons.
export function ListScreenSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="px-4 py-5">
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
// tab bar.
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
    <AppShell title={title} showBack={showBack} hideNav>
      <PagePadding className="flex flex-col gap-5">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </PagePadding>
    </AppShell>
  );
}
