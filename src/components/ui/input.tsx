import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Input ──────────────────────────────────────────────────────────────────
// Styled text input matching wireframe: light border, rounded-lg, clean focus ring

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          // Base
          "w-full rounded-[10px] border bg-surface px-4 py-3",
          "text-base text-text-primary placeholder:text-text-disabled",
          "transition-colors duration-100",
          // Default border
          "border-border",
          // Focus
          "focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-0 focus:border-transparent",
          // Error
          error && "border-error focus:ring-error",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

// ─── Select ─────────────────────────────────────────────────────────────────

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-[10px] border bg-surface px-4 py-3 pr-10",
            "text-base text-text-primary",
            "transition-colors duration-100",
            "border-border",
            "focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-0 focus:border-transparent",
            error && "border-error focus:ring-error",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {/* Chevron icon — uses CSS var so it tracks the token */}
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="var(--color-text-secondary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    );
  }
);

Select.displayName = "Select";

// ─── Textarea ───────────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-[10px] border bg-surface px-4 py-3",
          "text-base text-text-primary placeholder:text-text-disabled",
          "resize-none transition-colors duration-100",
          "border-border",
          "focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-0 focus:border-transparent",
          error && "border-error focus:ring-error",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

// ─── Field (label + input + hint + error) ───────────────────────────────────
// Composes Input/Select/Textarea with accessible label and helper text.

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-text-primary"
      >
        {label}
        {required && (
          <span className="ml-1 text-error" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {/* Hint or error — error takes precedence */}
      {(error || hint) && (
        <p
          id={htmlFor ? `${htmlFor}-hint` : undefined}
          className={cn(
            "text-xs",
            error ? "text-error" : "text-text-secondary"
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export { Input, Select, Textarea, Field };
