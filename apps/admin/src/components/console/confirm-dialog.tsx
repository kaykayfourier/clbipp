'use client'

import { useEffect } from 'react'
import { Button } from '@clbipp/ui'

// ─── ConfirmDialog ──────────────────────────────────────────────────────────
// A centred confirm/cancel modal for a consequential action — dispatching a
// manifest, certifying a pickup, rejecting an exception. Pure/static-prop:
// `onConfirm` is whatever the caller wants to run (typically kicking off a
// server action elsewhere and closing the dialog on success) — this
// component has no idea a server action exists.
//
// Deliberately separate from <Drawer>: a drawer is "look at more detail
// without losing your place", a confirm dialog is "you are about to do
// something, say yes or no" — different intent, different footprint (a
// drawer keeps the list visible at the edge; a dialog blocks it on purpose).

export interface ConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button as destructive (red) rather than primary. */
  destructive?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel, loading])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[30] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Cancel"
        onClick={loading ? undefined : onCancel}
        className="absolute inset-0 bg-primary-black/40"
      />
      <div className="relative w-full max-w-[400px] rounded-2xl border border-console-line bg-surface p-5 shadow-lg">
        <h2 className="font-display text-[17px] font-medium text-text-primary">{title}</h2>
        {description ? <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
