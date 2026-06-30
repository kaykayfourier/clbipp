import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ─── Card ───────────────────────────────────────────────────────────────────
// Base white surface with border and optional shadow.
// Variants: default, elevated, outline, ghost (no bg), tinted

const cardVariants = cva(
  "rounded-[14px] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-surface border border-border",
        elevated: "bg-surface border border-border shadow-md",
        outline: "bg-transparent border border-border",
        ghost: "bg-transparent",
        tinted: "bg-background border border-border",
      },
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-5",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, className }))}
      {...props}
    />
  )
);

Card.displayName = "Card";

// ─── CardHeader ─────────────────────────────────────────────────────────────

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1", className)}
    {...props}
  />
));

CardHeader.displayName = "CardHeader";

// ─── CardTitle ──────────────────────────────────────────────────────────────

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold text-text-primary leading-tight", className)}
    {...props}
  >
    {children}
  </h3>
));

CardTitle.displayName = "CardTitle";

// ─── CardDescription ────────────────────────────────────────────────────────

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-text-secondary leading-snug", className)}
    {...props}
  />
));

CardDescription.displayName = "CardDescription";

// ─── CardContent ────────────────────────────────────────────────────────────

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));

CardContent.displayName = "CardContent";

// ─── CardFooter ─────────────────────────────────────────────────────────────

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-2 pt-3 mt-3 border-t border-border", className)}
    {...props}
  />
));

CardFooter.displayName = "CardFooter";

// ─── Divider (utility used inside cards) ────────────────────────────────────

function CardDivider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-border my-3", className)} />;
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardDivider,
};
