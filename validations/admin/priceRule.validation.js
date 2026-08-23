import Joi from "joi";

// ID validation parameter schema
export const priceRuleIdSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid price rule ID format",
            "any.required": "Price rule ID is required",
        }),
});

// Service area ID validation parameter schema
export const serviceAreaIdParamSchema = Joi.object({
    serviceAreaId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid service area ID format",
            "any.required": "Service area ID is required",
        }),
});

// Query list validation schema
export const listPriceRulesSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    serviceAreaId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    active: Joi.boolean().optional(),
    sort_by: Joi.string()
        .valid("createdAt", "advanceFee", "hourlyStorageRate", "perKmRate")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// Peak hours sub-schema
const peakHoursSchema = Joi.object({
    startHour: Joi.number().integer().min(0).max(23).allow(null).default(null),
    endHour: Joi.number().integer().min(0).max(23).allow(null).default(null),
});

// Create price rule schema
// Fee breakdown sub-schema
const feeBreakdownSchema = Joi.object({
    platformFee: Joi.number().min(0).required().messages({
        "any.required": "Platform fee is required",
        "number.min": "Platform fee cannot be negative",
    }),
    handlingFee: Joi.number().min(0).default(0).messages({
        "number.min": "Handling fee cannot be negative",
    }),
    packingFee: Joi.number().min(0).default(0).messages({
        "number.min": "Packing fee cannot be negative",
    }),
}).required().messages({
    "any.required": "Fee breakdown is required",
});

// Bag pricing schema
const bagPricingItemSchema = Joi.object({
    basePrice: Joi.number().min(0).required().messages({
        "any.required": "Base price is required",
        "number.min": "Base price cannot be negative",
    }),
    hourlyRate: Joi.number().min(0).required().messages({
        "any.required": "Hourly rate is required",
        "number.min": "Hourly rate cannot be negative",
    }),
});

const bagPricingSchema = Joi.object({
    small: bagPricingItemSchema.optional(),
    medium: bagPricingItemSchema.optional(),
    large: bagPricingItemSchema.optional(),
    other: bagPricingItemSchema.optional(),
}).optional();

// Create price rule schema
export const createPriceRuleSchema = Joi.object({
    name: Joi.string().trim().max(100).required().messages({
        "any.required": "Price rule name is required",
    }),
    serviceAreaId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid service area ID format",
            "any.required": "Service area ID is required",
        }),
    feeBreakdown: feeBreakdownSchema,
    maxAdvanceDistanceKm: Joi.number().min(0).default(15),

    hourlyStorageRate: Joi.number().min(0).required().messages({
        "any.required": "Hourly storage rate is required",
        "number.min": "Hourly storage rate cannot be negative",
    }),
    minChargeableHours: Joi.number().min(0).default(1),
    maxDailyRate: Joi.number().min(0).allow(null).default(null),
    perKmRate: Joi.number().min(0).required().messages({
        "any.required": "Per KM rate is required",
        "number.min": "Per KM rate cannot be negative",
    }),
    peakMultiplier: Joi.number().min(1.0).default(1.0),
    peakHours: peakHoursSchema.optional(),
    bagPricing: bagPricingSchema,
    currency: Joi.string().max(3).default("INR"),
    deactivationReason: Joi.string().max(300).optional().allow("", null),
});

// Replace price rule schema
export const replacePriceRuleSchema = Joi.object({
    name: Joi.string().trim().max(100).required().messages({
        "any.required": "Price rule name is required",
    }),
    basePlatformFee: Joi.number().min(0).required().messages({
        "any.required": "Base platform fee is required",
        "number.min": "Base platform fee cannot be negative",
    }),
    maxAdvanceDistanceKm: Joi.number().min(0).default(15),
    hourlyStorageRate: Joi.number().min(0).required().messages({
        "any.required": "Hourly storage rate is required",
        "number.min": "Hourly storage rate cannot be negative",
    }),
    minChargeableHours: Joi.number().min(0).default(1),
    maxDailyRate: Joi.number().min(0).allow(null).default(null),
    perKmRate: Joi.number().min(0).required().messages({
        "any.required": "Per KM rate is required",
        "number.min": "Per KM rate cannot be negative",
    }),
    peakMultiplier: Joi.number().min(1.0).default(1.0),
    peakHours: peakHoursSchema.optional(),
    currency: Joi.string().max(3).default("INR"),
    deactivationReason: Joi.string().max(300).optional().allow("", null),
});

// Deactivate price rule schema
export const deactivatePriceRuleSchema = Joi.object({
    deactivationReason: Joi.string().max(300).optional().allow("", null),
});

// Update price rule schema (for PUT/PATCH updates)
export const updatePriceRuleSchema = Joi.object({
    name: Joi.string().trim().max(100),
    feeBreakdown: Joi.object({
        platformFee: Joi.number().min(0).optional(),
        handlingFee: Joi.number().min(0).optional(),
        packingFee: Joi.number().min(0).optional(),
    }).optional(),
    advanceFee: Joi.number().min(0),
    hourlyStorageRate: Joi.number().min(0),
    minChargeableHours: Joi.number().min(0),
    maxDailyRate: Joi.number().min(0).allow(null),
    perKmRate: Joi.number().min(0),
    maxAdvanceDistanceKm: Joi.number().min(0),
    peakMultiplier: Joi.number().min(1.0),
    peakHours: peakHoursSchema.optional(),
    bagPricing: bagPricingSchema.optional(),
    currency: Joi.string().max(3),
    active: Joi.boolean(),
    deactivationReason: Joi.string().max(300).allow("", null),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });

// Estimate price schema
export const estimatePriceSchema = Joi.object({
    serviceAreaId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid service area ID format",
            "any.required": "Service area ID is required",
        }),
    pickupLocation: Joi.object({
        lat: Joi.number().required(),
        lng: Joi.number().required(),
        address: Joi.string().optional().allow(""),
    }).required(),
    storeLocation: Joi.object({
        lat: Joi.number().required(),
        lng: Joi.number().required(),
        address: Joi.string().optional().allow(""),
    }).required(),
    luggage: Joi.object({
        small: Joi.number().integer().min(0).default(0),
        medium: Joi.number().integer().min(0).default(0),
        large: Joi.number().integer().min(0).default(0),
        other: Joi.number().integer().min(0).default(0),
    }).optional(),
    storageHours: Joi.number().min(1).default(1),
});

// Clone price rule schema
export const clonePriceRuleSchema = Joi.object({
    targetServiceAreaId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional(),
    name: Joi.string().trim().max(100).optional(),
});

