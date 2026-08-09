"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../utils";

// ─── BottomTabBar ────────────────────────────────────────────────────────────
// The 4-tab bottom nav: Home · Track · Certificates · Profile
// Active tab renders in text-primary; inactive in text-disabled.
// SVG stroke/fill values use CSS vars so they track the token system.

// ─── Icons ──────────────────────────────────────────────────────────────────

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

function TrackIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="3"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        fill={active ? "var(--color-text-primary)" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <path
        d="M11 4v2M11 16v2M4 11H2M20 11h-2"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.22 6.22l1.41 1.41M14.36 14.36l1.42 1.42M6.22 15.78l1.41-1.41M14.36 7.64l1.42-1.42"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CertificatesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="2"
        width="14"
        height="18"
        rx="2"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
        fill={active ? "var(--color-text-primary)" : "none"}
        fillOpacity={active ? 0.06 : 0}
      />
      <path
        d="M7 7h8M7 11h8M7 15h5"
        stroke={active ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        strokeWidth="1.5"
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

// ─── Tab config ─────────────────────────────────────────────────────────────

const TABS = [
  {
    label: "Home",
    href: "/dashboard",
    matchPaths: ["/dashboard"],
    icon: HomeIcon,
  },
  {
    label: "Track",
    href: "/track",
    matchPaths: ["/track"],
    icon: TrackIcon,
  },
  {
    label: "Certificates",
    href: "/compliance",
    matchPaths: ["/compliance", "/certificate"],
    icon: CertificatesIcon,
  },
  {
    label: "Profile",
    href: "/profile",
    matchPaths: ["/profile"],
    icon: ProfileIcon,
  },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export interface BottomTabBarProps {
  className?: string;
}

function BottomTabBar({ className }: BottomTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30",
        "flex items-stretch",
        "bg-surface border-t border-border",
        // safe area padding for iOS home indicator
        "pb-safe",
        className
      )}
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        const isActive = tab.matchPaths.some((p) =>
          pathname?.startsWith(p)
        );
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-3",
              "transition-[color,background-color,transform] duration-100 ease-out",
              // Tactile press feedback so taps feel acknowledged immediately,
              // before the destination finishes rendering.
              "active:bg-primary-black/[0.06] active:scale-[0.94]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-green",
              isActive ? "text-text-primary" : "text-text-disabled"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon active={isActive} />
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive ? "text-text-primary" : "text-text-disabled"
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

export { BottomTabBar };