'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Banner, Button } from '@clbipp/ui'
import { confirmPayout, type PaymentActionState } from './actions'

// The payout method picker. A real <form> with a server action, not an onClick
// — so settling requires a submit, and the page render can never do it by
// accident the way /handover does.
//
// ⚠ The method options arrive as a PROP rather than being imported from
// @clbipp/core. Core's barrel re-exports booking-actions and payment-actions,
// both of which import prisma — a value import from here would pull the Prisma
// client into the browser bundle. The two existing client components that touch
// core (BookingWizard, StepReview) get away with it because theirs are
// `import type`, which erases. The server page reads the list and passes it down.

const initialState: PaymentActionState = { error: null }

export type PayoutMethodOption = {
  value: string
  label: string
  hint: string
}

function SubmitButton({ amount }: { amount: string }) {
  // useFormStatus has to live inside the form to see it, hence the split
  // component rather than a `pending` prop threaded down.
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? 'Sending your payout…' : `Receive ${amount}`}
    </Button>
  )
}

export function PayoutForm({
  pickupId,
  amount,
  methods,
}: {
  pickupId: string
  amount: string
  methods: PayoutMethodOption[]
}) {
  const [state, formAction] = useActionState(confirmPayout, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="pickupId" value={pickupId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-text-secondary">
          How should we pay you?
        </legend>

        {methods.map((method, i) => (
          <label
            key={method.value}
            className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-border bg-surface p-4 has-[:checked]:border-text-primary has-[:checked]:bg-background"
          >
            <input
              type="radio"
              name="method"
              value={method.value}
              defaultChecked={i === 0}
              className="mt-1 accent-[var(--color-text-primary)]"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-text-primary">{method.label}</span>
              <span className="mt-0.5 text-xs text-text-secondary">{method.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && <Banner variant="error">{state.error}</Banner>}

      <SubmitButton amount={amount} />
    </form>
  )
}
