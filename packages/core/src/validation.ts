import { z } from "zod";

export const vendortypeSchema = z.enum([
    "individual",
    "fleet",
]);

export const pickupstatusSchema = z.enum([
    "requested",
    "scheduled",
    "collected",
    "tested",
    "processed",
    "recovered",
    "certified",
    "cancelled",
])

export const batterytypeSchema = z.enum([
    "li_ion_nmc",
    "li_ion_lfp",
    "li_ion_nca",
    "lead_acid",
    "nimh",
    "other"
])

export const profileSchema = z.object({
    vendorType: vendortypeSchema,
    fullname: z.string().min(2).max(100),
    email: z.email(),
    phone: z.string().min(10).max(15),
    companyName: z.string().min(2).optional(),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional(),
    businessAddress: z.string().optional(),
    eprRegId: z.string().optional(),
    kycDocUrls: z.array(z.url()).default([]),

}).superRefine((data, ctx) => {
    if (data.vendorType == "fleet"){
        if(!data.companyName){
            ctx.addIssue({
                code: "custom",
                path: ["companyName"],
                message: "Company Name is required",
            });
        }
        if(!data.businessAddress){
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["businessAddress"],
                message: "Business address is required",
            });
        }
    }
}

)

export const addressStatusSchema = z.enum([
    "operational",
    "not_operational",
])

// Optional text/number inputs arrive from a FormData submit as "" rather than
// undefined, which every `.optional()` would otherwise treat as a present-but-
// invalid value. Normalise once here instead of at each call site.
const blankToUndefined = (v: unknown) =>
    typeof v === "string" && v.trim() === "" ? undefined : v;

export const addressSchema = z.object({
    label: z.string().trim().min(2, "Give this address a short label").max(40),
    line1: z.string().trim().min(3, "Address line 1 is required").max(120),
    line2: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
    city: z.string().trim().min(2, "City is required").max(60),
    state: z.string().trim().min(2, "State is required").max(60),
    // Indian PIN: exactly 6 digits, never starting with 0.
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),

    // Captured from navigator.geolocation, so both are optional together —
    // the customer may deny location permission and type the address instead.
    lat: z.preprocess(blankToUndefined, z.coerce.number().min(-90).max(90).optional()),
    lng: z.preprocess(blankToUndefined, z.coerce.number().min(-180).max(180).optional()),

    status: addressStatusSchema.default("operational"),
    isDefault: z.boolean().default(false),
}).refine(
    // One coordinate without the other is meaningless on a map and would let a
    // half-written GPS capture reach the database.
    (d) => (d.lat === undefined) === (d.lng === undefined),
    { path: ["lat"], message: "Latitude and longitude must be set together" },
);

export type AddressInput = z.infer<typeof addressSchema>;

// ─── Booking wizard (Batch 5) ────────────────────────────────────────────────
// The booking payload crosses the client→server boundary as JSON, so this is
// the trust boundary: everything the wizard sends is re-parsed here before it
// reaches `createPickupWithItems`. The wizard validates the same shapes for
// inline field errors, but that copy is a convenience — this one is the guard.

export const batteryCategorySchema = z.enum([
    "portable",
    "automotive",
    "industrial",
    "ev",
]);

export const batteryConditionSchema = z.enum([
    "healthy",
    "swollen",
    "leaking",
    "dead",
]);

// Photos are Storage OBJECT PATHS ("<uid>/bookings/…"), never URLs — the five
// buckets are private, so a path only becomes viewable through a server-signed
// URL. `z.url()` here would reject every real value.
const storagePathSchema = z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^[A-Za-z0-9._\-/]+$/, "Unexpected photo reference")
    // `..` would climb out of the caller's own folder, which is the one thing
    // the "<uid>/…" object layout exists to prevent.
    .refine((p) => !p.includes(".."), "Unexpected photo reference");

export const bookingLineItemSchema = z.object({
    category: batteryCategorySchema,
    quantity: z.number().int().min(1, "Quantity must be at least 1").max(9999),
    // Null means "I can't weigh these" — a supported answer, not a missing one.
    // The quote engine falls back to a typical unit weight and flags the line.
    weightKg: z.number().positive("Weight must be greater than zero").max(100000).nullable(),
    condition: batteryConditionSchema,
    photoUrls: z.array(storagePathSchema).max(6, "Up to 6 photos per line").default([]),
});

export const bookingSubmissionSchema = z.object({
    category: batteryCategorySchema,
    addressId: z.uuid("Choose a pickup address"),
    items: z
        .array(bookingLineItemSchema)
        .min(1, "Add at least one battery line")
        .max(20, "Up to 20 lines per pickup — split a larger load across bookings"),
    // Plain "YYYY-MM-DD". Kept as a string all the way to the write path so a
    // browser timezone can't shift the customer's chosen date by a day.
    preferredDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
        .nullable(),
    notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional().nullable()),
}).refine(
    // Step 1 sets one category for the whole pickup; `Pickup.category` is a
    // single header column, so a mixed-category basket could not be represented
    // faithfully. The wizard never produces one — this catches a hand-rolled payload.
    (d) => d.items.every((item) => item.category === d.category),
    { path: ["items"], message: "Every line must match the pickup category" },
);

export type BookingSubmissionInput = z.infer<typeof bookingSubmissionSchema>;

export const pickupSchema = z.object({
    status: pickupstatusSchema,
    batteryType: batterytypeSchema,
    approxQuantity: z.number().int().positive(),
    approxWeightKg: z.number().positive(),
    location: z.string(),
    preferredDate: z.date().optional(),
    notes: z.string().optional(),
    photoUrls: z.array(z.url()).default([]),
});

export const offerResponseSchema = z.object({
    offerId: z.bigint(),
    accepted: z.boolean(),
});

export const pickupStatusUpdateSchema = z.object({
    pickupId: z.string().min(1),

    status: pickupstatusSchema,

    notes: z.string().max(500).optional(),
});

// ─── Signup (Batch 6) ────────────────────────────────────────────────────────
// The signup actions validate against this rather than profileSchema above:
// that one models a stored profile row (and predates the phone column being
// collected), while this models exactly what the two signup forms post.

/**
 * Indian mobile number → canonical `+91XXXXXXXXXX`.
 *
 * Accepts what people actually type: spaces, dashes, a leading 0, +91 or 91.
 * Returns null when it isn't a valid Indian mobile, so the caller decides
 * whether that's an error or (for an optional field) simply absent.
 * Mobile numbers here start 6–9; landlines and short codes do not, and we're
 * collecting a number the field agent will call on the doorstep.
 */
export function normaliseIndianPhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, "");

    // Strip whichever prefix is present, longest first: +91 / 91 / leading 0.
    const local = digits.startsWith("91") && digits.length === 12
        ? digits.slice(2)
        : digits.startsWith("0") && digits.length === 11
            ? digits.slice(1)
            : digits;

    return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

export const signupBaseSchema = z.object({
    email: z.email("Enter a valid email address."),
    // 6 is Supabase's own minimum; rejecting shorter here gives a field-level
    // message instead of bouncing off the auth API with a raw error string.
    password: z.string().min(6, "Password must be at least 6 characters."),
    fullName: z.string().trim().min(2, "Enter your full name.").max(100),
    phone: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.string()
            .transform((v) => normaliseIndianPhone(v))
            .refine((v): v is string => v !== null, "Enter a valid 10-digit Indian mobile number.")
            .optional(),
    ),
});

export const signupIndividualSchema = signupBaseSchema;

// Presence only — GST/PAN/EPR *format* validation is P5-B, Khalid's half of the
// validation task. Adding a half-right regex here would be the thing his lands
// on top of, so this deliberately stops at "not blank".
export const signupFleetSchema = signupBaseSchema.extend({
    companyName: z.string().trim().min(2, "Enter the company name."),
    eprRegId: z.string().trim().min(1, "EPR registration ID is required."),
    gstNumber: z.string().trim().min(1, "GST number is required."),
    panNumber: z.string().trim().min(1, "PAN number is required."),
    businessAddress: z.string().trim().min(5, "Enter the registered address."),
});

export type SignupIndividualInput = z.infer<typeof signupIndividualSchema>;
export type SignupFleetInput = z.infer<typeof signupFleetSchema>;
