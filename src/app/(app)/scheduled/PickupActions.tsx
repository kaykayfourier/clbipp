"use client";

import { Button } from "@/components/ui/button";

// Reschedule / Cancel actions for the scheduled screen.
//
// These were previously inline `onClick` handlers on the server-rendered page,
// which crashed: a server component cannot pass an event handler to a client
// component. Moving them into this "use client" island fixes that.
//
// Reschedule is disabled ("coming soon") — no reschedule flow exists yet.
// Cancel is wired to the `cancelPickup` service-role server action in Phase 2;
// for now it's a no-op placeholder so the screen renders without crashing.
export function PickupActions({ pickupId }: { pickupId: string }) {
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
        onClick={() => {
          // TODO(Phase 2): call cancelPickup(pickupId) server action + confirm modal
          console.log("Cancel:", pickupId);
        }}
      >
        Cancel request
      </Button>
    </>
  );
}
