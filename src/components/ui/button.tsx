import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ─── Button ─────────────────────────────────────────────────────────────────
// Variants: primary (green), secondary (outlined black), ghost (text only),
//           destructive (red text, outlined)
// Sizes: sm, md (default), lg
// Supports: loading spinner, left/right icon slots, full-width

const buttonVariants = cva(
  // Base styles shared across all variants
  [
    "inline-flex items-center justify-center gap-2",
    "font-semibold rounded-full",
    "transition-all duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C8F53D]",
    "disabled:pointer-events-none disabled:opacity-40",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[#C8F53D] text-[#111111] hover:brightness-95 active:brightness-90",
        secondary:
          "bg-transparent border-2 border-[#111111] text-[#111111] hover:bg-[#111111]/5 active:bg-[#111111]/10",
        ghost:
          "bg-transparent text-[#666666] hover:text-[#111111] hover:bg-[#111111]/5 active:bg-[#111111]/10",
        destructive:
          "bg-transparent border-2 border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/5 active:bg-[#EF4444]/10",
      },
      size: {
        sm: "text-sm px-4 py-2 h-9",
        md: "text-base px-6 py-3 h-12",
        lg: "text-base px-8 py-4 h-14",
      },
      fullWidth: {
        true: "w-full",
        false: "w-auto",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        {...props}
      >
        {loading ? (
          <>
            <Spinner className="shrink-0" />
            <span>{children}</span>
          </>
        ) : (
          <>
            {leftIcon && (
              <span className="shrink-0 -ml-1">{leftIcon}</span>
            )}
            <span>{children}</span>
            {rightIcon && (
              <span className="shrink-0 -mr-1">{rightIcon}</span>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

// ─── Spinner (internal) ─────────────────────────────────────────────────────
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export { Button, buttonVariants };
