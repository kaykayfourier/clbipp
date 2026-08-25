// Local, presentational label+input field for the login screen.
// This is NOT the shared <Input> — Person C owns the component kit and hasn't
// shipped a real Input yet.
//
// Kept a byte-for-byte mirror of apps/customer/src/app/(auth)/field.tsx so the
// two auth screens stay visually identical. It had drifted: the customer side
// gained the show/hide password toggle below and this copy did not, so an agent
// on a phone keyboard had no way to check a mistyped password. Change both
// together.
// TODO: swap for C's <Input> once it lands — in both apps at the same time.
'use client'

import * as React from 'react'

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
}

// 'use client' + useState only kick in for password fields (the show/hide
// toggle needs local state); every other field renders exactly as before.
export function Field({ label, name, type, ...props }: FieldProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const isPassword = type === 'password'

  return (
    <label htmlFor={name} className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-wide text-text-secondary">
        {label}
      </span>
      {isPassword ? (
        <div className="relative flex items-center">
          <input
            id={name}
            name={name}
            type={showPassword ? 'text' : 'password'}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-14 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
            {...props}
          />
          {/* Same row as the input, pinned to its right corner via the
              relative/absolute pairing above. tabIndex -1 so Tab still goes
              input → next field, not input → toggle. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 text-[11px] font-bold tracking-wide text-text-secondary hover:text-text-primary"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
          {...props}
        />
      )}
    </label>
  )
}
