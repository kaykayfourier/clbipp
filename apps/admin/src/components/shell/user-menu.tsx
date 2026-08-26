'use client'

import * as React from 'react'

import { logout } from './actions'

// The topbar avatar and its dropdown — the console's logout control (W14).
//
// A client component only because the menu opens and closes. The sign-out
// itself is a <form action={logout}> POST to the server action, not an onClick
// fetch, so it still works if hydration has not finished — which matters on the
// one control whose whole job is to end a privileged session.

type UserMenuProps = {
  name: string
  email: string
  initials: string
}

export function UserMenu({ name, email, initials }: UserMenuProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape. Without this the menu stays open
  // behind whatever you navigate to next, because the shell does not remount.
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary-black font-display text-xs font-bold text-primary-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green focus-visible:ring-offset-2"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-console-line bg-surface shadow-lg"
        >
          <div className="border-b border-console-line px-4 py-3">
            <p className="truncate text-[13px] font-bold text-text-primary">{name}</p>
            <p className="truncate font-mono text-[10px] text-text-secondary">{email}</p>
            {/* The role line the wireframe renders as "ADMIN · OPS". `ops` is
                not a UserRole and is not being added (W10 / AD2), so it says
                what is actually true of the session. */}
            <p className="mt-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase text-text-secondary">
              Admin
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="w-full px-4 py-3 text-left text-[13px] font-bold text-error-text hover:bg-error-bg focus-visible:outline-none focus-visible:bg-error-bg"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
