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
// Reschedule now routes to the /reschedule/[id] screen. Cancel calls the
// `cancelPickup` service-role server action (owner-checked, pre-collection
// only), then routes to the cancelled tracking view.
//
// If the pickup is already cancelled, cancelling again is a no-op, so this
// leads with the one action that actually moves the pickup forward:
// rescheduling the same request instead of re-offering "Cancel request".
export function PickupActions({
  pickupId,
  status,
}: {
  pickupId: string;
  status: string;
}) {
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

  if (status === "cancelled") {
    return (
      <>
        <p className="text-sm text-text-secondary text-center">
          This pickup was cancelled.
        </p>
        <Button
          variant="primary"
          fullWidth
          onClick={() => router.push(`/reschedule/${pickupId}`)}
        >
          Reschedule
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        onClick={() => router.push(`/reschedule/${pickupId}`)}
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