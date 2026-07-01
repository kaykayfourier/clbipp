import * as React from "react";
import { cn } from "@/lib/utils";

// ─── PhoneFrame ───────────────────────────────────────────────────────────────
// A decorative phone chrome used on the design-system showcase page and
// in documentation to preview screens. Not used in the production app itself.
//
// Renders a phone outline (iOS-style pill) with a status bar strip and
// a scrollable content area for the child screen.

export interface PhoneFrameProps {
  /** Rendered inside the phone viewport */
  children: React.ReactNode;
  /** Optional label below the frame */
  label?: string;
  className?: string;
}

function PhoneFrame({ children, label, className }: PhoneFrameProps) {
  return (
    <figure
      className={cn("inline-flex flex-col items-center gap-3", className)}
    >
      {/* Phone shell */}
      <div
        className={cn(
          "relative rounded-[40px] overflow-hidden",
          "border-[6px] border-[#1A1A1A]",
          "shadow-xl",
          // Fixed dimensions matching standard phone preview
          "w-[320px] h-[640px]"
        )}
        style={{ backgroundColor: "#111111" }}
      >
        {/* Status bar */}
        <div
          className="relative z-10 flex items-center justify-between px-6 pt-3 pb-1"
          style={{ backgroundColor: "#F8F5EE" }}
        >
          {/* Time */}
          <span className="text-[12px] font-semibold text-[#111111]">9:41</span>

          {/* Notch / island placeholder */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-[#111111]" />

          {/* Signal / battery */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-[#111111]">5G</span>
            {/* Battery icon */}
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden="true">
              <rect
                x="0.5"
                y="0.5"
                width="18"
                height="11"
                rx="2.5"
                stroke="#111111"
                strokeWidth="1"
              />
              <rect x="1.5" y="1.5" width="15" height="9" rx="2" fill="#111111" />
              <path d="M20 4v4" stroke="#111111" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Screen content — scrollable */}
        <div
          className="absolute inset-0 top-[44px] overflow-y-auto overscroll-contain"
          style={{ backgroundColor: "#F8F5EE" }}
        >
          {children}
        </div>
      </div>

      {/* Label */}
      {label && (
        <figcaption className="text-sm text-[#666666] font-medium">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

export { PhoneFrame };
