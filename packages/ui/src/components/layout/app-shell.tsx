"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "../../utils";
import { BottomTabBar } from "../ui/tabs";

// ─── AppShell ────────────────────────────────────────────────────────────────
// The outer layout wrapper for every authenticated screen.
// Provides:
//   - Status bar area (transparent, system handles colour)
//   - Top header with optional back button, title, and right action
//   - Main scrollable content area with bottom-nav padding
//   - BottomTabBar (can be hidden for sub-screens like onboarding)

export interface AppShellProps {
  /** Top bar title */
  title?: string;
  /** Show the back button */
  showBack?: boolean;
  /** Where the back button navigates (default: browser back) */
  backHref?: string;
  /** Custom right-side element in the header */
  headerRight?: React.ReactNode;
  /** Hide the bottom tab bar (onboarding, auth screens) */
  hideNav?: boolean;
  /** Additional classes on the main content wrapper */
  contentClassName?: string;
  className?: string;
  children: React.ReactNode;
}

function AppShell({
  title,
  showBack = false,
  backHref,
  headerRight,
  hideNav = false,
  contentClassName,
  className,
  children,
}: AppShellProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col min-h-screen bg-background",
        className
      )}
    >
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      {(title || showBack || headerRight) && (
        <header className="sticky top-0 z-20 flex items-center h-14 px-4 bg-background border-b border-border">
          {/* Back button */}
          {showBack && (
            <BackButton href={backHref} />
          )}

          {/* Title */}
          {title && (
            <h1
              className={cn(
                "flex-1 text-base font-semibold text-text-primary text-center",
                // When there's a back button and no right element, centre precisely
                showBack && !headerRight && "pr-9"
              )}
            >
              {title}
            </h1>
          )}

          {/* Right slot */}
          {headerRight && (
            <div className="ml-auto shrink-0">{headerRight}</div>
          )}
        </header>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main
        className={cn(
          "flex-1 overflow-y-auto",
          // Pad bottom so content isn't hidden under the nav bar
          !hideNav && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]",
          contentClassName
        )}
      >
        {children}
      </main>

      {/* ── Bottom navigation ───────────────────────────────────────────── */}
      {!hideNav && <BottomTabBar />}
    </div>
  );
}

// ─── BackButton ──────────────────────────────────────────────────────────────

function BackButton({ href }: { href?: string }) {
  const inner = (
    <span
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-full",
        "hover:bg-primary-black/5 active:bg-primary-black/10",
        "transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
      )}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M12.5 15l-5-5 5-5"
          stroke="var(--color-text-primary)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">Back</span>
    </span>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }

  // JavaScript back — only attach onClick to avoid Next.js router issues
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="Go back"
    >
      {inner}
    </button>
  );
}

// ─── PagePadding (convenience wrapper) ───────────────────────────────────────
// Wrap screen content in this for consistent horizontal padding.

function PagePadding({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("px-4 py-5", className)}>{children}</div>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────────────
// The ALL-CAPS spaced label used above groups (e.g. "RECENT PICKUPS")

function SectionLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold tracking-widest text-text-secondary uppercase",
        className
      )}
    >
      {children}
    </p>
  );
}

export { AppShell, BackButton, PagePadding, SectionLabel };