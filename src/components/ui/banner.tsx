import * as React from "react";
import { cn } from "@/lib/utils";
import { colors } from "@/lib/tokens";

// ─── Banner ─────────────────────────────────────────────────────────────────
// Inline notification strip. Matches the wireframe's blue info banner
// ("We'll notify you as your battery moves through each stage.")
// and the locked-state tinted banner.
// Variants: info, success, warning, error, tinted (neutral cream)
//
// BANNER_CONFIG uses colors from tokens.ts for bg/border/text values that are
// applied via style={} (runtime). SVG stroke attributes also reference CSS vars
// so they remain in sync with the token system.

export type BannerVariant = "info" | "success" | "warning" | "error" | "tinted";

const BANNER_CONFIG: Record<
  BannerVariant,
  { bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  info: {
    bg: colors.infoBg,
    border: colors.infoBorder,
    text: colors.infoText,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="var(--color-info)" strokeWidth="1.5" />
        <path d="M8 7v4M8 5.5v.5" stroke="var(--color-info)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  success: {
    bg: colors.successBg,
    border: colors.successBorder,
    text: colors.successText,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="var(--color-success)" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  warning: {
    bg: colors.warningBg,
    border: colors.warningBorder,
    text: colors.warningText,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2L14.5 13.5H1.5L8 2z" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 7v3M8 11.5v.5" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  error: {
    bg: colors.errorBg,
    border: colors.errorBorder,
    text: colors.errorText,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="var(--color-error)" strokeWidth="1.5" />
        <path d="M6 6l4 4M10 6l-4 4" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  tinted: {
    bg: colors.background,
    border: colors.border,
    text: colors.textSecondary,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="3" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
        <path d="M5 8h6M8 5v6" stroke="var(--color-text-disabled)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
};

export interface BannerProps {
  variant?: BannerVariant;
  /** Override the default icon with any node (or null to hide) */
  icon?: React.ReactNode | null;
  className?: string;
  children: React.ReactNode;
}

function Banner({
  variant = "info",
  icon,
  className,
  children,
}: BannerProps) {
  const config = BANNER_CONFIG[variant];
  const showIcon = icon !== null;
  const iconNode = icon === undefined ? config.icon : icon;

  return (
    <div
      className={cn("flex items-start gap-3 rounded-[10px] border px-4 py-3", className)}
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
        color: config.text,
      }}
      role="note"
    >
      {showIcon && iconNode && (
        <span className="shrink-0 mt-0.5">{iconNode}</span>
      )}
      <p className="text-sm leading-snug">{children}</p>
    </div>
  );
}

// ─── OfflineBanner ──────────────────────────────────────────────────────────
// Persistent strip shown when the app detects no network.

function OfflineBanner({ className }: { className?: string }) {
  return (
    <Banner variant="warning" className={cn("rounded-none border-x-0", className)}>
      You&apos;re offline. Some features may not be available until you reconnect.
    </Banner>
  );
}

export { Banner, OfflineBanner };
