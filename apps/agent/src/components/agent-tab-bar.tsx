"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@clbipp/ui";

// ─── AgentTabBar ─────────────────────────────────────────────────────────────
// The agent app's 4-tab bottom nav: Home · Pickups · History · Profile
// (wireframe `tabbar()`, docs/CLBIPP_FieldAgentWireframes_V2.html).
//
// Why this is local to apps/agent and not @clbipp/ui: the shared BottomTabBar
// hardcodes the CUSTOMER's four destinations (/dashboard, /track, /compliance,
// /profile). Parameterising it with a `tabs` prop would be DRY-er, but
// packages/ui is lane C — that's a straddle needing flag → agree → log, and the
// agent nav shell is explicitly lane A. Cost is the duplicated icon SVGs below.
// TODO (post-sprint, lane C): fold this and BottomTabBar into one `tabs`-prop
// component in @clbipp/ui.
//
// ⚠ `aria-label="Main navigation"` must stay — scripts/smoke.mjs counts it to
// catch a screen that renders a second bar by forgetting `hideNav`.

// ─── Icons ───────────────────────────────────────────────────────────────────
// Stroke/fill read CSS vars so they track the token system, same as @clbipp/ui.

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M2.5 9.5L11 3l8.5 6.5V19a1 1 0 01-1 1h-5v-5h-5v5h-5a1 1 0 01-1-1V9.5z"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? "var(--color-text-primary)" : "none"}
        fillOpacity={active ? 0.08 : 0}
      />
    </svg>
  );
}

function PickupsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="6"
        width="12"
        height="9"
        rx="1.5"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        fill={active ? "var(--color-text-primary)" : "none"}
        fillOpacity={active ? 0.08 : 0}
      />
      <path
        d="M15 9h2.6a1 1 0 01.8.4l1.4 1.9V15h-4.8V9z"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle
        cx="7"
        cy="17"
        r="1.6"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
      />
      <circle
        cx="16"
        cy="17"
        r="1.6"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M4 18V9M9.33 18V5M14.67 18v-6M20 18V7"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle
        cx="11"
        cy="8"
        r="3.5"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        fill={active ? "var(--color-text-primary)" : "none"}
        fillOpacity={active ? 0.1 : 0}
      />
      <path
        d="M4 19c0-3.314 3.134-6 7-6s7 2.686 7 6"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Tab config ──────────────────────────────────────────────────────────────
// `exact` exists because Home is "/", and a startsWith match on "/" would light
// up on every screen in the app.

const TABS = [
  { label: "Home", href: "/", matchPaths: ["/"], exact: true, icon: HomeIcon },
  { label: "Pickups", href: "/pickups", matchPaths: ["/pickups", "/job", "/dropoff"], icon: PickupsIcon },
  { label: "History", href: "/history", matchPaths: ["/history"], icon: HistoryIcon },
  { label: "Profile", href: "/profile", matchPaths: ["/profile"], icon: ProfileIcon },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export interface AgentTabBarProps {
  className?: string;
}

export function AgentTabBar({ className }: AgentTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30",
        "flex items-stretch",
        "bg-surface border-t border-border",
        // Safe-area allowance for the iOS home indicator. Written out rather
        // than `pb-safe`, which is not a Tailwind v4 built-in and compiles to
        // nothing (the bug fixed on the customer side).
        "pb-[env(safe-area-inset-bottom,0px)]",
        className,
      )}
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        const isActive =
          "exact" in tab && tab.exact
            ? pathname === tab.href
            : tab.matchPaths.some((p) => pathname?.startsWith(p));
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-3",
              "transition-[color,background-color,transform] duration-100 ease-out",
              // Tactile press feedback so taps feel acknowledged immediately,
              // before the destination finishes rendering — it matters more on
              // a phone in a warehouse than on a desk.
              "active:bg-primary-black/[0.06] active:scale-[0.94]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-green",
              isActive ? "text-text-primary" : "text-text-disabled",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon active={isActive} />
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive ? "text-text-primary" : "text-text-disabled",
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
