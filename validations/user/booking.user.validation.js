import Joi from "joi";
import { BOOKING_STATUS } from "../../utils/constants.js";

// Reusable sub-schemas
const locationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required().messages({
        "number.min": "Latitude must be between -90 and 90",
        "number.max": "Latitude must be between -90 and 90",
        "any.required": "Latitude is required",
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        "number.min": "Longitude must be between -180 and 180",
        "number.max": "Longitude must be between -180 and 180",
        "any.required": "Longitude is required",
    }),
    address: Joi.string().trim().max(500).optional().allow(""),
});

const luggageSchema = Joi.object({
    small: Joi.number().integer().min(0).max(20).default(0),
    medium: Joi.number().integer().min(0).max(20).default(0),
    large: Joi.number().integer().min(0).max(20).default(0),
    other: Joi.number().integer().min(0).max(20).default(0),
}).custom((value, helpers) => {
    const total =
        (value.small ?? 0) +
        (value.medium ?? 0) +
        (value.large ?? 0) +
        (value.other ?? 0);
    if (total < 1) {
        return helpers.error("any.custom", {
            message: "At least one luggage item is required",
        });
    }
    return value;
}).messages({
    "any.custom": "{{#message}}",
});

// MongoDB ObjectId pattern
const objectIdSchema = Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
        "string.pattern.base": "Invalid ID format",
        "any.required": "ID is required",
    });

// Param schemas
export const bookingIdParamSchema = Joi.object({
    booking_id: objectIdSchema.messages({
        "string.pattern.base": "Invalid booking ID format",
        "any.required": "Booking ID is required",
    }),
});

// SCHEDULE PICKUP
export const schedulePickupSchema = Joi.object({
    pickupLocation: locationSchema.required().messages({
        "any.required": "Pickup location is required",
    }),

    luggage: luggageSchema.required().messages({
        "any.required": "Luggage details are required",
    }),

    // Optional guest / contact override info
    userInfo: Joi.object({
        firstName: Joi.string().trim().max(100).optional().allow(""),
        lastName: Joi.string().trim().max(100).optional().allow(""),
        // Phone validation mirrors the auth phone pattern
        phone: Joi.string()
            .pattern(/^\+?[1-9]\d{6,14}$/)
            .optional()
            .allow("")
            .messages({
                "string.pattern.base": "Invalid phone number in userInfo",
            }),
    }).optional(),

    tipAmount: Joi.number().min(0).optional().default(0),

    // Coupon codes are short — 50 chars is generous; 500 was a copy-paste error
    couponCode: Joi.string().trim().max(50).optional().allow(""),

    notes: Joi.string().trim().max(500).optional().allow(""),
});

// LIST MY BOOKINGS
export const listBookingsSchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        status: Joi.string()
            .valid(...Object.values(BOOKING_STATUS))
            .optional()
            .messages({ "any.only": "Invalid booking status filter" }),
        sort_order: Joi.string().valid("asc", "desc").default("desc"),
    }),
};

// GET BOOKING BY ID
export const bookingIdSchema = {
    params: bookingIdParamSchema,
};

// CANCEL BOOKING
export const cancelBookingSchema = {
    params: bookingIdParamSchema,
    body: Joi.object({
        reason: Joi.string().trim().max(500).optional().default("User cancelled booking").allow(""),
    }),
};

// REQUEST RETURN
export const requestReturnSchema = {
    params: bookingIdParamSchema,
    body: Joi.object({
        returnLocation: locationSchema.required().messages({
            "any.required": "Return location is required",
        }),
 
        notes: Joi.string().trim().max(500).optional().allow(""),
    }),
};

// GET BOOKING HISTORY
export const historySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        sort_order: Joi.string().valid("asc", "desc").default("desc"),
    }),
};

// GET ASSIGNED DRIVER / STORE
export const assignedDriverSchema = { params: bookingIdParamSchema };
export const assignedStoreSchema = { params: bookingIdParamSchema };