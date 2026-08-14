"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@clbipp/ui";
import { cancelPickup } from "../handover/actions";

// Reschedule / Cancel actions for the scheduled screen.
//
// These were previously inline `onClick` handlers on the server-rendered page,
// which crashed (a server component can't pass an event handler to a client
// component). This "use client" island fixes that.
//
// Reschedule is disabled ("coming soon") — no reschedule flow exists this sprint.
// Cancel calls the `cancelPickup` service-role server action (owner-checked,
// pre-collection only), then routes to the cancelled tracking view.
export function PickupActions({ pickupId }: { pickupId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!window.confirm("Cancel this pickup request? This can't be undone.")) return;
    setError(null);
    startTransition(async () => {
      const { error } = await cancelPickup(pickupId);
      if (error) {
        setError(error);
        return;
      }
      router.push(`/track/${pickupId}`);
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        disabled
        title="Reschedule is coming soon"
      >
        Reschedule
      </Button>

      <Button
        variant="destructive"
        fullWidth
        loading={isPending}
        onClick={handleCancel}
      >
        Cancel request
      </Button>

      {error && (
        <p className="text-sm text-error-text text-center">{error}</p>
      )}
    </>
  );
}
