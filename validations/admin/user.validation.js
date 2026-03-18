import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../../utils/constants.js";

export const userIdSchema = Joi.object({
    user_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid user ID format",
            "any.required": "User ID is required",
        }),
});

export const listUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    is_active: Joi.boolean().optional(),
    is_verified: Joi.boolean().optional(),
    is_serviceable: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "status", "last_login_at")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const updateUserSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50),
    last_name: Joi.string().trim().min(2).max(50),
    email: Joi.string().trim().email().min(6).max(100),
    phone: Joi.number().integer().min(1).default(10),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)),
    dob: Joi.date().less("now").messages({
        "date.less": "Date of birth must be in the past",
    }),
}).min(1).messages({
    "object.min": "At least one field is required to update",
});

export const updateUserStatusSchema = Joi.object({
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    is_active: Joi.boolean().optional(),
    // ✅ Fixed: single .when() with switch-style validation
    reason: Joi.string().trim().max(500).when("is_active", {
        is: false,
        then: Joi.required().messages({
            "any.required": "Reason is required when deactivating",
        }),
        otherwise: Joi.when("status", {
            is: ACCOUNT_STATUS.BLOCKED,
            then: Joi.required().messages({
                "any.required": "Reason is required when blocking",
            }),
            otherwise: Joi.optional(),
        }),
    }),
}).or("status", "is_active").messages({
    "object.missing": "At least one of status or is_active is required",
});

export const bulkDeactivateSchema = Joi.object({
    ids: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-fA-F]{24}$/)
                .messages({ "string.pattern.base": "Invalid user ID format" })
        )
        .min(1)
        .max(50)
        .required()
        .messages({
            "array.min": "At least one user ID is required",
            "array.max": "Cannot deactivate more than 50 users at once",
            "any.required": "User IDs are required",
        }),
    reason: Joi.string().trim().max(500).required().messages({
        "any.required": "Reason is required for bulk deactivation",
    }),
});