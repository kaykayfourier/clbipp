"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PagePadding } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { createClient } from "@/lib/supabase/client";
import { pickupSchema, batterytypeSchema } from "@/lib/validation";
import { z } from "zod";

// ─── Battery type display labels ────────────────────────────────────────────
const BATTERY_TYPE_LABELS: Record<
  z.infer<typeof batterytypeSchema>,
  string
> = {
  li_ion_nmc: "Li-ion NMC",
  li_ion_lfp: "Li-ion LFP",
  li_ion_nca: "Li-ion NCA",
  lead_acid: "Lead Acid",
  nimh: "NiMH",
  other: "Other",
};

// ─── Form state ─────────────────────────────────────────────────────────────
type FormState = {
  batteryType: string;
  approxQuantity: string;
  approxWeightKg: string;
  location: string;
  preferredDate: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  batteryType: "",
  approxQuantity: "",
  approxWeightKg: "",
  location: "",
  preferredDate: "",
  notes: "",
};

export default function RequestPickupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    // ── Parse + validate ──────────────────────────────────────────────────
    const parsed = pickupSchema.safeParse({
      status: "requested",
      batteryType: form.batteryType,
      approxQuantity: form.approxQuantity ? parseInt(form.approxQuantity, 10) : undefined,
      approxWeightKg: form.approxWeightKg ? parseFloat(form.approxWeightKg) : undefined,
      location: form.location,
      preferredDate: form.preferredDate ? new Date(form.preferredDate) : undefined,
      notes: form.notes || undefined,
      photoUrls: [],
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormState;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    // ── Submit to Supabase ────────────────────────────────────────────────
    setLoading(true);
    try {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setSubmitError("You must be logged in to request a pickup.");
        return;
      }

      // Generate a short human-readable pickup ID: PKP-YYYY-XXXXXX
      const year = new Date().getFullYear();
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const pickupId = `PKP-${year}-${rand}`;

      const { error: insertError } = await supabase.from("pickups").insert({
        id: pickupId,
        vendor_id: user.id,
        battery_type: parsed.data.batteryType,
        approx_quantity: String(parsed.data.approxQuantity),
        approx_weight_kg: parsed.data.approxWeightKg ?? null,
        location: parsed.data.location,
        preferred_date: parsed.data.preferredDate
          ? parsed.data.preferredDate.toISOString().split("T")[0]
          : null,
        notes: parsed.data.notes ?? null,
        photo_urls: [],
        status: "requested",
      });

      if (insertError) {
        console.log("Insert error:", JSON.stringify(insertError, null, 2));
        setSubmitError(insertError.message || "Failed to submit request. Please try again.");
        return;
      }

      router.push(`/submitted?id=${pickupId}`);
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Request Pickup" showBack backHref="/dashboard" hideNav>
      <PagePadding>
        <form onSubmit={handleSubmit} noValidate>
          <Card variant="default" className="flex flex-col gap-5">

          {/* Battery Type */}
          <div className="flex flex-col gap-2">
            <label htmlFor="battery-type" className="text-sm font-medium">
            Battery type <span className="text-red-500">*</span>
            </label>

            <select
            id="battery-type"
            value={form.batteryType}
            onChange={(e) => set("batteryType", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
            >
            <option value="">Select battery type</option>
            {Object.entries(BATTERY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            </select>

            {errors.batteryType && (
              <p className="text-xs text-red-500">{errors.batteryType}</p>
          )}
        </div>

        {/* Approx Quantity */}
        <div className="flex flex-col gap-2">
          <label htmlFor="approx-quantity" className="text-sm font-medium">
            Approx. quantity (units) <span className="text-red-500">*</span>
          </label>

          <input
            id="approx-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="e.g. 24"
            value={form.approxQuantity}
            onChange={(e) => set("approxQuantity", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
          />

          {errors.approxQuantity && (
            <p className="text-xs text-red-500">{errors.approxQuantity}</p>
          )}
        </div>

        {/* Approx Weight */}
        <div className="flex flex-col gap-2">
          <label htmlFor="approx-weight" className="text-sm font-medium">
            Approx. weight (kg)
          </label>

          <input
            id="approx-weight"
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            placeholder="e.g. 480"
            value={form.approxWeightKg}
            onChange={(e) => set("approxWeightKg", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
          />

          <p className="text-xs text-gray-500">Total batch weight</p>

          {errors.approxWeightKg && (
            <p className="text-xs text-red-500">{errors.approxWeightKg}</p>
          )}
        </div>

        {/* Pickup Address */}
        <div className="flex flex-col gap-2">
          <label htmlFor="location" className="text-sm font-medium">
            Pickup address <span className="text-red-500">*</span>
          </label>

          <input
            id="location"
            type="text"
            placeholder="Warehouse address"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
          />

          {errors.location && (
            <p className="text-xs text-red-500">{errors.location}</p>
          )}
        </div>

        {/* Preferred Date */}
        <div className="flex flex-col gap-2">
          <label htmlFor="preferred-date" className="text-sm font-medium">
            Preferred date
          </label>

          <input
            id="preferred-date"
            type="date"
            value={form.preferredDate}
            onChange={(e) => set("preferredDate", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
          />

          <p className="text-xs text-gray-500">
            Optional — we'll confirm availability
          </p>

          {errors.preferredDate && (
            <p className="text-xs text-red-500">{errors.preferredDate}</p>
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes (optional)
          </label>

          <textarea
            id="notes"
            rows={3}
            placeholder="Access via gate B, contact Ravi on arrival..."
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-400"
          />

          <p className="text-xs text-gray-500">
            Access details, on-site contact, special instructions...
          </p>
        </div>

        {/* Submit error banner */}
        {submitError && (
          <Banner variant="error">
            {submitError}
          </Banner>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
        >
          Submit request
        </Button>

      </Card>
    </form>
  </PagePadding>
</AppShell>   
  );
}
