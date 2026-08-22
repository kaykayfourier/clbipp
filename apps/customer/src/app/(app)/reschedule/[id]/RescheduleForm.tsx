"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@clbipp/ui";
import { Banner } from "@clbipp/ui";
import { reschedulePickup } from "../../handover/actions";

/** Today in the browser's own timezone — matches StepSchedule's helper. */
function todayLocalISO(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function RescheduleForm({
  pickupId,
  currentDate,
}: {
  pickupId: string;
  currentDate: string | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate ? currentDate.slice(0, 10) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!date) {
      setError("Choose a date to reschedule to.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reschedulePickup(pickupId, date);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/track/${pickupId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reschedule-date" className="text-sm font-medium text-text-primary">
          New preferred date
        </label>
        <input
          id="reschedule-date"
          type="date"
          min={todayLocalISO()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-green"
        />
        <p className="text-xs text-text-secondary">
          We&apos;ll confirm the actual slot once an agent is assigned.
        </p>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <Button variant="primary" fullWidth loading={isPending} disabled={isPending} onClick={handleSubmit}>
        Confirm reschedule
      </Button>
    </div>
  );
}
