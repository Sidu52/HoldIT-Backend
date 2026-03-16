// validations/driver/ride.driver.validation.js
import Joi from "joi";

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