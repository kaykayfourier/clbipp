"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@clbipp/ui";
import { declineOffer } from "../handover/actions";

// Declining records the decision for the office to follow up. It does NOT
// cancel: the price may still be negotiated, and the vendor can accept later.
export function DeclineOfferButton({ pickupId }: { pickupId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleDecline() {
    if (!window.confirm("Decline this offer? Our office will contact you to discuss it.")) return;
    setError(null);
    startTransition(async () => {
      const result = await declineOffer(pickupId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" fullWidth loading={isPending} onClick={handleDecline}>
        Decline
      </Button>
      {done ? <p className="text-center text-xs text-text-secondary">Declined. Our office will contact you.</p> : null}
      {error ? <p className="text-center text-xs text-error-text">{error}</p> : null}
    </div>
  );
}
