'use client'

import { useEffect } from 'react'
import { cn } from '@clbipp/ui'

// ─── Drawer ─────────────────────────────────────────────────────────────────
// A right-edge slide-over — for a row's quick detail without leaving the list
// (e.g. a manifest preview from /manifests, an exception's detail from
// /exceptions). Pure/static-prop: open state and its contents are entirely
// the caller's — this component owns only the chrome (backdrop, panel,
// close button, escape-to-close) and never fetches anything itself.
//
// Desktop-only by construction (no bottom-sheet fallback, no swipe gesture) —
// admin is a desktop app (AD11) and a drawer is the console's own idiom, not
// a mobile one borrowed from the other two apps.

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  /** Rendered pinned to the bottom of the panel — usually a row of actions. */
  footer?: React.ReactNode
  widthClassName?: string
}

export function Drawer({ open, onClose, title, description, children, footer, widthClassName }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[30] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-primary-black/35"
      />
      <div
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden border-l border-console-line bg-surface shadow-lg',
          widthClassName ?? 'max-w-[440px]',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-console-line px-5 py-4">
          <div>
            <h2 className="font-display text-[17px] font-medium text-text-primary">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-text-secondary">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? <div className="flex items-center justify-end gap-2 border-t border-console-line px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  )
}
