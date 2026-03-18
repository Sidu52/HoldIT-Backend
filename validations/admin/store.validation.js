import Joi from "joi";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

// PARAM VALIDATION
export const storeIdSchema = Joi.object({
    store_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid store ID format",
            "any.required": "Store ID is required",
        }),
});

export const createStoreSchema = Joi.object({
    // Required
    phone:        Joi.string().pattern(/^[0-9+]{10,15}$/).required(),
    store_name:   Joi.string().min(2).max(200).required(),
    lat:          Joi.number().min(-90).max(90).required(),
    lng:          Joi.number().min(-180).max(180).required(),
    address:      Joi.string().min(5).max(500).required(),

    // Optional
    store_description:    Joi.string().max(1000).optional(),
    store_open_time:      Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // HH:mm
    store_close_time:     Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    store_contact_number: Joi.string().max(15).optional(),
    max_booking_capacity: Joi.number().min(1).max(500).optional(),
    store_owner_id:       Joi.string().hex().length(24).optional(), // MongoDB ObjectId
});

export const storeOwnerIdSchema = Joi.object({
    store_owner_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid store owner ID format",
            "any.required": "Store owner ID is required",
        }),
});

// QUERY VALIDATION
export const listStoresSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
    is_active: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "store_name", "status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const listStoreOwnersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
    verification_status: Joi.string()
        .valid(...Object.values(VERIFICATION_STATUS))
        .optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "name", "status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const updateStoreSchema = Joi.object({
    store_name: Joi.string().min(2).max(200),
    max_booking_capacity: Joi.number().min(1).max(500),
    store_open_time: Joi.string(),
    store_close_time: Joi.string(),
    store_contact_number: Joi.string().max(15),
    store_description: Joi.string().max(1000),
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
    address: Joi.string().max(255),
}).min(1);

export const updateStoreDutySchema = Joi.object({
    is_online: Joi.boolean().required(),
});

export const updateStoreStatusSchema = Joi.object({
    is_active: Joi.boolean().required(),
    reason: Joi.when("is_active", {
        is: false,
        then: Joi.string().max(500).optional(),
        otherwise: Joi.forbidden(),
    }),
});

export const updateStoreVerificationSchema = Joi.object({
    verification_status: Joi.string()
        .valid(...Object.values(VERIFICATION_STATUS))
        .required(),
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
});