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