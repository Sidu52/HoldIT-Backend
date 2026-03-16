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

//  STORE SCHEMAS
export const createStoreSchema = Joi.object({
    store_name: Joi.string().trim().min(2).max(100).required(),
    store_address: Joi.string().trim().min(5).max(255).required(),
    store_capacity: Joi.number().integer().min(1).required(),
    store_open_time: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .required()
        .messages({
            "string.pattern.base": "Open time must be in HH:MM format",
        }),
    store_close_time: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .required()
        .messages({
            "string.pattern.base": "Close time must be in HH:MM format",
        }),
    store_description: Joi.string().trim().max(500).optional(),
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    store_owner_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
});

export const updateStoreSchema = Joi.object({
    store_name: Joi.string().trim().min(2).max(100),
    store_address: Joi.string().trim().min(5).max(255),
    store_capacity: Joi.number().integer().min(1),
    store_open_time: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .messages({
            "string.pattern.base": "Open time must be in HH:MM format",
        }),
    store_close_time: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .messages({
            "string.pattern.base": "Close time must be in HH:MM format",
        }),
    store_description: Joi.string().trim().max(500),
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });

// STORE OWNER SCHEMAS
export const createStoreOwnerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{6,14}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid phone number format",
        }),
    address: Joi.string().trim().max(255).optional(),
});

export const updateStoreOwnerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100),
    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{6,14}$/)
        .messages({
            "string.pattern.base": "Invalid phone number format",
        }),
    address: Joi.string().trim().max(255),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });

// STATUS UPDATE
export const updateStoreStatusSchema = Joi.object({
    is_active: Joi.boolean().required().messages({
        "any.required": "is_active field is required",
    }),
    reason: Joi.string()
        .trim()
        .max(500)
        .when("is_active", {
            is: false,
            then: Joi.required().messages({
                "any.required": "Reason is required when deactivating",
            }),
            otherwise: Joi.optional(),
        }),
});

// OWNER STATUS UPDATE
export const updateOwnerStatusSchema = Joi.object({
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .required(),
    reason: Joi.string()
        .trim()
        .max(500)
        .when("status", {
            is: ACCOUNT_STATUS.BLOCKED,
            then: Joi.required(),
            otherwise: Joi.optional(),
        }),
});