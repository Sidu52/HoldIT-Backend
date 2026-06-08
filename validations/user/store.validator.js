import Joi from "joi";
import { STORE_DEFAULTS } from "../../constants/user/store.js";

// ─── CHECK STORE AVAILABILITY ─────────────────────────────────────────────────
// BUG FIXED: storeId was entirely absent — controller has no way to know
// which store to check without it.
//
// BUG FIXED: radius was hardcoded as a default in the controller function
// signature with no way for the client to pass a different value.
//
// TYPO FIXED: was exported as checkStoreAvability (missing 'i') — renamed to
// checkStoreAvailability to match the route import and controller name.
export const checkStoreAvailability = {
    query: Joi.object({
        storeId: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                "string.pattern.base": "Invalid store ID format",
                "any.required": "Store ID is required",
            }),

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

        // Client-overridable radius; falls back to the constant default
        radius: Joi.number()
            .min(0.1)
            .max(50)
            .default(STORE_DEFAULTS.SEARCH_RADIUS_KM ?? 5)
            .messages({
                "number.min": "Radius must be at least 0.1 km",
                "number.max": "Radius cannot exceed 50 km",
            }),
    }),
};