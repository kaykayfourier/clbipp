import { Button } from '@clbipp/ui'
import { acceptOfferAndConfirm } from './actions'

/**
 * "Accept offer" — the one lifecycle write a customer can trigger.
 *
 * A <form>, not a <Link>. The pickup id rides in a hidden field rather than a
 * query string because this is a POST body now, and it keeps the accepted id
 * and the button that accepted it in the same element.
 *
 * No "use client": a plain form with a server action needs no JavaScript, so
 * this works mid-hydration and with JS disabled. That matters more here than on
 * most screens — this is the button that moves money.
 *
 * Shared by /offer and /offer-breakdown so the two entry points can't drift
 * into posting different things.
 */
export function AcceptOfferButton({ pickupId, pricePaise }: { pickupId: string; pricePaise: number }) {
  // AF5 — the price this button was rendered next to. acceptOffer accepts only
  // that price, so a re-offer that lands while the page is open is never
  // accepted blind.
  return (
    <form action={acceptOfferAndConfirm}>
      <input type="hidden" name="pickupId" value={pickupId} />
      <input type="hidden" name="pricePaise" value={pricePaise} />
      <Button type="submit" variant="primary" fullWidth>
        Accept offer
      </Button>
    </form>
  )
}
