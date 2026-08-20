// Local, presentational label+input field for the login screen.
// This is NOT the shared <Input> — Person C owns the component kit and hasn't
// shipped a real Input yet. Copied from apps/customer/src/app/(auth)/field.tsx
// so the two auth screens stay visually identical.
// TODO: swap for C's <Input> once it lands — in both apps at the same time.
import * as React from 'react'

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
}

export function Field({ label, name, ...props }: FieldProps) {
  return (
    <label htmlFor={name} className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-wide text-text-secondary">
        {label}
      </span>
      <input
        id={name}
        name={name}
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
        {...props}
      />
    </label>
  )
}
