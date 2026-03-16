import Joi from "joi";
import mongoose from "mongoose";

const objectId = Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
    }
    return value;
}, "ObjectId validation");

export const bookingIdParamSchema = {
    params: Joi.object({
        booking_id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                "string.pattern.base": "Invalid booking ID format",
                "any.required": "Booking ID is required",
            }),
    }),
};

export const rideHistorySchema = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(50).default(10),
        sort_order: Joi.string().valid("asc", "desc").default("desc"),
    }),
};

export const cancelRideSchema = {
    params: Joi.object({
        booking_id: objectId.required().messages({
            "any.invalid": "Invalid booking ID.",
            "any.required": "Booking ID is required.",
        }),
    }),
    body: Joi.object({
        reason: Joi.string()
            .trim()
            .min(3)
            .max(300)
            .optional()
            .messages({
                "string.min": "Reason must be at least 3 characters.",
                "string.max": "Reason cannot exceed 300 characters.",
            }),
    }),
};