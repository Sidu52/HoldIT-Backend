import Joi from "joi";
import {
    ACCOUNT_STATUS,
    GENDER_OPTIONS,
    VEHICLE_TYPES,
} from "../../utils/constants.js";

// PARAM VALIDATION
export const driverIdSchema = Joi.object({
    driver_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid driver ID format",
            "any.required": "Driver ID is required",
        }),
});

// QUERY VALIDATION
export const listDriversSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    is_online: Joi.boolean().optional(),
    verification_status: Joi.string()
        .valid("pending", "verified", "rejected")
        .optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// UPDATE DRIVER
export const updateDriverSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50),
    last_name: Joi.string().trim().min(2).max(50),
    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{6,14}$/)
        .messages({
            "string.pattern.base": "Invalid phone number format",
        }),
    gender: Joi.string()
        .valid(...GENDER_OPTIONS)
        .optional(),
    date_of_birth: Joi.date().less("now").optional(),
    address: Joi.string().trim().max(255).optional(),
    vehicle_type: Joi.string()
        .valid(...Object.values(VEHICLE_TYPES))
        .optional(),
    license_number: Joi.string().trim().max(50).optional(),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });

// UPDATE DRIVER STATUS
export const updateDriverStatusSchema = Joi.object({
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
    is_active: Joi.boolean().optional(),
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
})
    .or("status", "is_active")
    .messages({
        "object.missing":
            "At least one of status or is_active is required",
    });

// BULK DEACTIVATE
export const bulkDeactivateSchema = Joi.object({
    ids: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-fA-F]{24}$/)
                .messages({
                    "string.pattern.base": "Invalid driver ID format",
                })
        )
        .min(1)
        .max(50)
        .required()
        .messages({
            "array.min": "At least one driver ID is required",
            "array.max": "Cannot deactivate more than 50 drivers at once",
            "any.required": "Driver IDs are required",
        }),
    reason: Joi.string().trim().max(500).required().messages({
        "any.required": "Reason is required for bulk deactivation",
    }),
});