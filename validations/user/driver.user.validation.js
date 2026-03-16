import Joi from "joi";
import { DRIVER_DEFAULTS } from "../../constants/user/driver.js";

export const driverIdSchema = {
    params: Joi.object({
        id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                "string.pattern.base": "Invalid driver ID format",
                "any.required": "Driver ID is required",
            }),
    }),
};

export const driverReviewsSchema = {
    params: Joi.object({
        id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                "string.pattern.base": "Invalid driver ID format",
                "any.required": "Driver ID is required",
            }),
    }),
    query: Joi.object({
        page: Joi.number()
            .integer()
            .min(1)
            .default(DRIVER_DEFAULTS.DEFAULT_PAGE)
            .messages({
                "number.min": "Page must be at least 1",
            }),
        limit: Joi.number()
            .integer()
            .min(1)
            .max(DRIVER_DEFAULTS.MAX_LIMIT)
            .default(DRIVER_DEFAULTS.DEFAULT_LIMIT)
            .messages({
                "number.max": `Limit cannot exceed ${DRIVER_DEFAULTS.MAX_LIMIT}`,
            }),
    }),
};