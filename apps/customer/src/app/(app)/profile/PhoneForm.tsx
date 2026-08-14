'use client'

import { useActionState, useState } from 'react'

import { Button } from '@clbipp/ui'

import { updatePhone, type PhoneActionResult } from './actions'

// ─── PhoneForm ───────────────────────────────────────────────────────────────
// The phone row on /profile, which is a display row until you tap "Change".
//
// Collapsed by default on purpose: a permanently open text input on an account
// screen invites accidental edits to a field nothing else prompts you about.
// The row reads as information, and editing is a choice.
//
// Validation is server-side only — `normaliseIndianPhone` in the action is the
// single source of what a valid number is (the same one signup uses). A second
// regex here would be a second definition, and the client is not the boundary.

const INITIAL: PhoneActionResult = { error: null, ok: false }

export function PhoneForm({ phone }: { phone: string | null }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(updatePhone, INITIAL)

  // Close on success, ONCE per submission.
  //
  // Two things this has to get right. First, `useActionState` hands back a NEW
  // object each run, so comparing by reference distinguishes "just succeeded"
  // from "succeeded a while ago and is still the current state" — without that,
  // `state.ok` stays true forever and the form slams shut the instant you
  // reopen it to make a second change.
  //
  // Second, this is a render-phase adjustment rather than an effect. React
  // documents this exact pattern for "adjust state when something changes", and
  // it re-renders before committing, so there is no flash of the open form
  // after a successful save. An effect would also trip
  // react-hooks/set-state-in-effect, which is the lint rule pointing at the
  // same thing.
  const [seenResult, setSeenResult] = useState(state)
  if (seenResult !== state) {
    setSeenResult(state)
    if (state.ok) setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-4 py-1.5">
        <span className="shrink-0 text-sm text-text-secondary">Phone</span>
        <span className="flex items-center gap-3">
          <span className="text-right text-sm font-medium text-text-primary">
            {phone ?? 'Not added'}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 text-xs font-semibold text-text-primary underline underline-offset-2"
          >
            {phone ? 'Change' : 'Add'}
          </button>
        </span>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 py-2">
      <label htmlFor="phone" className="text-[11px] font-bold tracking-wide text-text-secondary">
        Phone
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={phone ?? ''}
        placeholder="98765 43210"
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green"
      />
      <span className="text-[11px] text-text-secondary">
        Used by the collection agent to reach you on the day. Leave it blank to
        remove the number.
      </span>

      {state.error && <span className="text-[11px] text-error-text">{state.error}</span>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
