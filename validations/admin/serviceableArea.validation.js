import Joi from "joi";

// PARAM VALIDATION
export const serviceableAreaIdSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid serviceable area ID format",
            "any.required": "Serviceable area ID is required",
        }),
});

// QUERY VALIDATION
export const listServiceableAreasSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    city: Joi.string().trim().max(100).optional(),
    state: Joi.string().trim().max(100).optional(),
    is_active: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "name", "city", "service_radius_km")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// LOCATION SCHEMA
const locationSchema = Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array()
        .ordered(
            Joi.number().min(-180).max(180).required()
                .messages({ "number.base": "Longitude must be a number" }),
            Joi.number().min(-90).max(90).required()
                .messages({ "number.base": "Latitude must be a number" })
        )
        .length(2)
        .required()
        .messages({
            "array.length": "Coordinates must be [longitude, latitude]",
        }),
});

// BAG PRICING SCHEMA
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

// CREATE SERVICEABLE AREA
export const createServiceableAreaSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        "any.required": "Area name is required",
    }),
    city: Joi.string().trim().min(2).max(100).required().messages({
        "any.required": "City is required",
    }),
    state: Joi.string().trim().min(2).max(100).required().messages({
        "any.required": "State is required",
    }),
    pincode: Joi.string()
        .pattern(/^\d{4,10}$/)
        .optional()
        .messages({
            "string.pattern.base": "Invalid pincode format",
        }),
    location: locationSchema.required().messages({
        "any.required": "Location with coordinates is required",
    }),
    service_radius_km: Joi.number()
        .min(0.5)
        .max(100)
        .default(5)
        .messages({
            "number.min": "Service radius must be at least 0.5 km",
            "number.max": "Service radius cannot exceed 100 km",
        }),
    delivery_charge: Joi.number()
        .min(0)
        .max(10000)
        .default(0)
        .messages({
            "number.min": "Delivery charge cannot be negative",
        }),
    priceRule: Joi.object({
        name: Joi.string().trim().max(100).optional(),
        feeBreakdown: Joi.object({
            platformFee: Joi.number().min(0).required().messages({
                "any.required": "Platform fee is required in price rule",
            }),
            handlingFee: Joi.number().min(0).default(0),
            packingFee: Joi.number().min(0).default(0),
        }).required().messages({
            "any.required": "Fee breakdown is required in price rule",
        }),
        perKmRate: Joi.number().min(0).required().messages({
            "any.required": "Per KM rate is required in price rule",
        }),
        hourlyStorageRate: Joi.number().min(0).required().messages({
            "any.required": "Hourly storage rate is required in price rule",
        }),
        maxAdvanceDistanceKm: Joi.number().min(0).default(15),
        minChargeableHours: Joi.number().min(0).default(1),
        maxDailyRate: Joi.number().min(0).allow(null).default(null),
        peakMultiplier: Joi.number().min(1.0).default(1.0),
        peakHours: Joi.object({
            startHour: Joi.number().integer().min(0).max(23).allow(null).default(null),
            endHour: Joi.number().integer().min(0).max(23).allow(null).default(null),
        }).optional(),
        bagPricing: bagPricingSchema,
        currency: Joi.string().max(3).default("INR"),
    }).required().messages({
        "any.required": "Pricing rule configuration is required when creating a new Service Area",
    }),
});

// UPDATE SERVICEABLE AREA
export const updateServiceableAreaSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100),
    city: Joi.string().trim().min(2).max(100),
    state: Joi.string().trim().min(2).max(100),
    pincode: Joi.string()
        .pattern(/^\d{4,10}$/)
        .messages({
            "string.pattern.base": "Invalid pincode format",
        }),
    location: locationSchema,
    is_active: Joi.boolean().required().messages({
        "any.required": "is_active field is required",
    }),
    service_radius_km: Joi.number().min(0.5).max(100),
    delivery_charge: Joi.number().min(0).max(10000),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });


// TOGGLE STATUS
export const toggleStatusSchema = Joi.object({
    is_active: Joi.boolean().required().messages({
        "any.required": "is_active field is required",
    }),
});

// CHECK SERVICEABILITY
export const checkServiceableSchema = Joi.object({
    lat: Joi.number().required().messages({
        "any.required": "Latitude is required",
    }),
    lng: Joi.number().required().messages({
        "any.required": "Longitude is required",
    }),
});

// DISTANCE CALCULATION
export const distanceSchema = Joi.object({
    lat1: Joi.number().required().messages({
        "any.required": "Latitude is required",
    }),
    lng1: Joi.number().required().messages({
        "any.required": "Longitude is required",
    }),
    lat2: Joi.number().required().messages({
        "any.required": "Latitude is required",
    }),
    lng2: Joi.number().required().messages({
        "any.required": "Longitude is required",
    }),
});