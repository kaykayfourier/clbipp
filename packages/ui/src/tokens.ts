// ─── Back2Basics · Design Tokens ───────────────────────────────────────────
// Single source of truth. Import this anywhere you need raw values.
// globals.css @theme reads these names — keep them in sync.

export const colors = {
  // Brand
  primaryGreen: "#C8F53D",
  primaryBlack: "#111111",

  // Backgrounds
  background: "#F8F5EE",
  surface: "#FFFFFF",

  // Borders
  border: "#E5E5E5",
  borderStrong: "#CCCCCC",

  // Text
  textPrimary: "#111111",
  textSecondary: "#666666",
  textDisabled: "#AAAAAA",
  textOnGreen: "#111111",

  // Semantic — fill colours
  success: "#22C55E",
  successBg: "#F0FDF4",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  warning: "#F97316",
  warningBg: "#FFF7ED",
  info: "#3B82F6",
  infoBg: "#EFF6FF",
  hazard: "#FF5A1F",
  hazardBg: "#FFF3EE",

  // Semantic — text-on-coloured-bg shades (darker for WCAG contrast)
  successText: "#0cb349",
  errorText: "#B91C1C",
  warningText: "#C2410C",
  infoText: "#1D4ED8",

  // Semantic — banner/chip border tints
  successBorder: "#BBF7D0",
  errorBorder: "#FECACA",
  warningBorder: "#FED7AA",
  infoBorder: "#BFDBFE",

  // Status badge colours (maps to lifecycle)
  status: {
    requested: { dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8" },
    scheduled: { dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8" },
    collected: { dot: "#F97316", bg: "#FFF7ED", text: "#C2410C" },
    tested: { dot: "#F97316", bg: "#FFF7ED", text: "#C2410C" },
    processed: { dot: "#F97316", bg: "#FFF7ED", text: "#C2410C" },
    recovered: { dot: "#22C55E", bg: "#F0FDF4", text: "#15803D" },
    certified: { dot: "#22C55E", bg: "#F0FDF4", text: "#15803D" },
  },

  // Upload / Dropzone states
  upload: {
    empty: {
      border: "#E5E5E5",
      bg: "#FFFFFF",
      text: "#666666",
    },
    selected: {
      border: "#C8F53D",
      bg: "#F8F5EE",
      text: "#111111",
    },
    uploading: {
      border: "#3B82F6",
      bg: "#EFF6FF",
      text: "#1D4ED8",
    },
  },
} as const;

export const typography = {
  // Font families — loaded via next/font or global CSS
  fontDisplay: "var(--font-display)",   // Used for hero numbers / large headings
  fontBody: "var(--font-body)",         // Everything else
  fontMono: "var(--font-mono)",         // IDs, codes, PKP numbers

  // Scale (rem, base 16px)
  size: {
    xs: "0.75rem",   // 12px — captions, labels
    sm: "0.875rem",  // 14px — body small
    base: "1rem",    // 16px — body
    lg: "1.125rem",  // 18px — body large / sub-heading
    xl: "1.25rem",   // 20px — section heading
    "2xl": "1.5rem", // 24px — screen heading
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem",  // 36px — large price / stat
  },

  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  lineHeight: {
    tight: "1.2",
    snug: "1.35",
    normal: "1.5",
    relaxed: "1.65",
  },

  letterSpacing: {
    tight: "-0.02em",
    normal: "0",
    wide: "0.04em",
    widest: "0.08em",
  },
} as const;

export const radii = {
  none: "0",
  sm: "0.375rem",   // 6px
  md: "0.625rem",   // 10px
  lg: "0.875rem",   // 14px — cards, inputs
  xl: "1rem",       // 16px
  "2xl": "1.25rem", // 20px
  full: "9999px",   // pills, badges, round buttons
} as const;

export const shadows = {
  none: "none",
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
} as const;

export const spacing = {
  // Consistent spacing scale (Tailwind-compatible multiples of 4px)
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
  tooltip: 50,
} as const;

// Lifecycle stage order — used by Timeline + status logic everywhere.
// This is the *ordered, linear* progression only. `cancelled` is a terminal
// side-state that is NOT part of this array (it would render a phantom timeline
// row and break the Record<LifecycleStage,…> maps). For a value that may also be
// cancelled, use `PickupStatus` from components/ui/badge.
//
// This array is the single source of truth for stage ORDER. It must stay in
// step with `enum PickupStatus` in packages/database/prisma/schema.prisma.
// Screens derive their status buckets from it — don't re-declare the list
// locally (track/[id] and t/[token] used to, and that is why adding a stage
// used to be a multi-file edit).
export const LIFECYCLE_STAGES = [
  "requested",
  "scheduled",
  // Added Batch 7A. The agent assesses and quotes ON SITE (company flow doc
  // §5), so arrival precedes the offer.
  "arrived",
  "offered",
  "collected",
  "tested",
  "processed",
  "recovered",
  "certified",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type StatusVariant = LifecycleStage;

/**
 * Customer-facing name for each stage. Lives here rather than inside Timeline
 * because the chain-of-custody log labels the same stages and the two must not
 * drift — a timeline row reading "Agent arrived" above a custody entry reading
 * "arrived" is the kind of mismatch nobody notices until a demo.
 */
export const STAGE_LABELS: Record<LifecycleStage, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  arrived: "Agent arrived",
  offered: "Offer made",
  collected: "Collected",
  tested: "Tested",
  processed: "Processed",
  recovered: "Recovered",
  certified: "Certified",
};

/** Narrow an arbitrary status string to a stage on the linear lifecycle. */
export function isLifecycleStage(value: string): value is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/**
 * True when `stage` sits strictly before `other` in the lifecycle.
 *
 * Anything off the linear lifecycle (`cancelled`, or an unknown string) is
 * never "before" anything — a cancelled pickup has left the progression, it has
 * not paused partway along it. Callers get a safe `false` rather than the -1
 * that a bare `indexOf` comparison would silently treat as earliest.
 */
export function isStageBefore(stage: string, other: LifecycleStage): boolean {
  if (!isLifecycleStage(stage)) return false;
  return LIFECYCLE_STAGES.indexOf(stage) < LIFECYCLE_STAGES.indexOf(other);
}
