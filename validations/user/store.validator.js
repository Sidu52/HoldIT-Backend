import Joi from "joi";
import { STORE_DEFAULTS } from "../../constants/user/store.js";


export const checkStoreAvability = {
    query: Joi.object({
        lat: Joi.number()
            .min(-90)
            .max(90)
            .required()
            .messages({
                "number.min": "Latitude must be between -90 and 90",
                "number.max": "Latitude must be between -90 and 90",
                "any.required": "Latitude is required",
            }),
        lng: Joi.number()
            .min(-180)
            .max(180)
            .required()
            .messages({
                "number.min": "Longitude must be between -180 and 180",
                "number.max": "Longitude must be between -180 and 180",
                "any.required": "Longitude is required",
            }),
    }),
};


export const searchStoresSchema = {
    query: Joi.object({
        q: Joi.string()
            .trim()
            .max(200)
            .optional()
            .allow("")
            .messages({
                "string.max": "Search query cannot exceed 200 characters",
            }),
        page: Joi.number()
            .integer()
            .min(1)
            .default(STORE_DEFAULTS.DEFAULT_PAGE)
            .messages({
                "number.min": "Page must be at least 1",
            }),
        limit: Joi.number()
            .integer()
            .min(1)
            .max(STORE_DEFAULTS.MAX_LIMIT)
            .default(STORE_DEFAULTS.DEFAULT_LIMIT)
            .messages({
                "number.max": `Limit cannot exceed ${STORE_DEFAULTS.MAX_LIMIT}`,
            }),
        sort_by: Joi.string()
            .valid("rating", "name", "newest")
            .default("rating")
            .messages({
                "any.only": "Sort must be one of: rating, name, newest",
            }),
    }),
};

export const nearbyStoresSchema = {
    query: Joi.object({
        lat: Joi.number()
            .min(-90)
            .max(90)
            .required()
            .messages({
                "number.min": "Latitude must be between -90 and 90",
                "number.max": "Latitude must be between -90 and 90",
                "any.required": "Latitude is required",
            }),
        lng: Joi.number()
            .min(-180)
            .max(180)
            .required()
            .messages({
                "number.min": "Longitude must be between -180 and 180",
                "number.max": "Longitude must be between -180 and 180",
                "any.required": "Longitude is required",
            }),
        radius: Joi.number()
            .min(1)
            .max(STORE_DEFAULTS.MAX_NEARBY_RADIUS_KM)
            .default(STORE_DEFAULTS.NEARBY_RADIUS_KM)
            .messages({
                "number.min": "Radius must be at least 1 km",
                "number.max": `Radius cannot exceed ${STORE_DEFAULTS.MAX_NEARBY_RADIUS_KM} km`,
            }),
        page: Joi.number()
            .integer()
            .min(1)
            .default(STORE_DEFAULTS.DEFAULT_PAGE),
        limit: Joi.number()
            .integer()
            .min(1)
            .max(STORE_DEFAULTS.MAX_LIMIT)
            .default(STORE_DEFAULTS.DEFAULT_LIMIT),
    }),
};

export const storeIdSchema = {
    params: Joi.object({
        id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                "string.pattern.base": "Invalid store ID format",
                "any.required": "Store ID is required",
            }),
    }),
};