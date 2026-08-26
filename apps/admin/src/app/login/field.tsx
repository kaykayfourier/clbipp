// Local, presentational label+input field for the login screen.
//
// This is NOT the shared <Input> — there still isn't one — and it is NOT the
// console kit either: Batch 2 (C's kit) is a table/KPI/chart kit for logged-in
// screens, and /login renders before any of that exists. A local copy keeps
// Batch 0 free of a dependency on another lane, which is the whole point of
// Batch 0.
//
// Kept a mirror of apps/agent/src/app/(auth)/field.tsx, restyled for a desktop
// form (larger hit targets, no phone-width assumptions). The show/hide password
// toggle is carried across deliberately: it drifted out of the agent copy once
// already and had to be back-ported in a later commit.
// TODO: swap all three for a shared <Input> if one ever lands.
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

  const inputClass =
    'w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green'

  return (
    <label htmlFor={name} className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-bold tracking-[0.09em] uppercase text-text-secondary">
        {label}
      </span>
      {isPassword ? (
        <div className="relative flex items-center">
          <input
            id={name}
            name={name}
            type={showPassword ? 'text' : 'password'}
            className={`${inputClass} pr-14`}
            {...props}
          />
          {/* Same row as the input, pinned to its right corner via the
              relative/absolute pairing above. tabIndex -1 so Tab still goes
              input → submit, not input → toggle. */}
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
        <input id={name} name={name} type={type} className={inputClass} {...props} />
      )}
    </label>
  )
}
