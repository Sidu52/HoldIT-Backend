import Joi from "joi";
import { BOOKING_STATUS } from "../../utils/constants.js";

// LOCATION SUB-SCHEMA
const locationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required()
        .messages({
            "number.min": "Latitude must be between -90 and 90",
            "number.max": "Latitude must be between -90 and 90",
            "any.required": "Latitude is required",
        }),
    lng: Joi.number().min(-180).max(180).required()
        .messages({
            "number.min": "Longitude must be between -180 and 180",
            "number.max": "Longitude must be between -180 and 180",
            "any.required": "Longitude is required",
        }),
    address: Joi.string().trim().max(500).optional(),
});


const luggageSchema = Joi.object({
    small: Joi.number().integer().min(0).max(20).default(0),
    medium: Joi.number().integer().min(0).max(20).default(0),
    large: Joi.number().integer().min(0).max(20).default(0),
    other: Joi.number().integer().min(0).max(20).default(0),
}).custom((value, helpers) => {
    const total = (value.small || 0) + (value.medium || 0) + (value.large || 0) + (value.other || 0);
    if (total < 1) {
        return helpers.error("any.custom", { message: "At least one luggage item is required" });
    }
    return value;
}).messages({
    "any.custom": "{{#message}}",
});

const bookingIdParamSchema = Joi.object({
    booking_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid booking ID format",
            "any.required": "Booking ID is required",
        }),
});

// SCHEDULE PICKUP
export const schedulePickupSchema = Joi.object({
    pickupLocation: locationSchema.required().messages({
        "any.required": "Pickup location is required",
    }),
    pickupScheduledAt: Joi.date()
        .iso()
        .min("now")
        .required()
        .messages({
            "date.base": "Invalid pickup date",
            "date.min": "Pickup time must be in the future",
            "any.required": "Pickup scheduled time is required",
        }),
    luggage: luggageSchema,
    notes: Joi.string().trim().max(500).allow("").optional(),
});

export const listBookingsSchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        status: Joi.string()
            .valid(...Object.values(BOOKING_STATUS))
            .optional()
            .messages({
                "any.only": "Invalid booking status filter",
            }),
        sort_order: Joi.string().valid("asc", "desc").default("desc"),
    }),
};

export const bookingIdSchema = {
    params: bookingIdParamSchema,
};

export const cancelBookingSchema = {
    body: Joi.object({
        reason: Joi.string().trim().min(5).max(500).required()
            .messages({
                "string.min": "Cancellation reason must be at least 5 characters",
                "string.max": "Cancellation reason cannot exceed 500 characters",
                "any.required": "Cancellation reason is required",
            }),
    }),
};

export const requestReturnSchema = {
    body: Joi.object({
        returnLocation: locationSchema.required().messages({
            "any.required": "Return location is required",
        }),
        returnScheduledAt: Joi.date().iso().greater("now").required()
            .messages({
                "date.greater": "Return time must be in the future",
                "any.required": "Return scheduled time is required",
            }),
        notes: Joi.string().trim().max(500).optional().allow(""),
    }),
};

export const historySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        sort_order: Joi.string().valid("asc", "desc").default("desc"),
    }),
};