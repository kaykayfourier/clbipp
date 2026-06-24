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