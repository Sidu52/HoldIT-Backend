import Joi from "joi";
import { GENDER_OPTIONS } from "../../utils/constants.js";

//  NEAREST STORE QUERY
export const nearestStoreSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required().messages({
        "number.base": "Latitude must be a number",
        "number.min": "Latitude must be between -90 and 90",
        "number.max": "Latitude must be between -90 and 90",
        "any.required": "Latitude is required",
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        "number.base": "Longitude must be a number",
        "number.min": "Longitude must be between -180 and 180",
        "number.max": "Longitude must be between -180 and 180",
        "any.required": "Longitude is required",
    }),
    max_distance: Joi.number()
        .min(500)
        .max(50000)
        .default(5000)
        .messages({
            "number.min": "Max distance must be at least 500 meters",
            "number.max": "Max distance cannot exceed 50km",
        }),
});

// UPDATE PROFILE
export const updateProfileSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50),
    last_name: Joi.string().trim().min(2).max(50),
    gender: Joi.string().valid(...GENDER_OPTIONS),
    date_of_birth: Joi.date().less("now").messages({
        "date.less": "Date of birth must be in the past",
    }),
    address: Joi.string().trim().min(5).max(255),
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    })
    .and("lat", "lng")
    .messages({
        "object.and": "Both lat and lng are required to update location",
    });

// STORE ID PARAM
export const storeIdSchema = Joi.object({
    store_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid store ID format",
            "any.required": "Store ID is required",
        }),
});