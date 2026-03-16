import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../../utils/constants.js";

// PARAM VALIDATION
export const userIdSchema = Joi.object({
    user_id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            "string.pattern.base": "Invalid user ID format",
            "any.required": "User ID is required",
        }),
});

// QUERY VALIDATION
export const listUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional(),
    is_active: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "status", "last_login_at")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// SIGNUP
export const signupUserSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50).required().messages({
        "string.min": "First name must be at least 2 characters",
        "any.required": "First name is required",
    }),
    last_name: Joi.string().trim().min(2).max(50).required().messages({
        "string.min": "Last name must be at least 2 characters",
        "any.required": "Last name is required",
    }),
    email: Joi.string().email().required().messages({
        "string.email": "Invalid email address",
        "any.required": "Email is required",
    }),
    gender: Joi.string()
        // GENDER_OPTIONS is an array, not an object
        .valid(...GENDER_OPTIONS)
        .required()
        .messages({
            "any.only": "Invalid gender",
            "any.required": "Gender is required",
        }),
    dob: Joi.date().less("now").required().messages({
        "date.base": "Invalid date of birth",
        "date.less": "Date of birth must be in the past",
        "any.required": "Date of birth is required",
    }),
    address: Joi.string().trim().max(255).required().messages({
        "any.required": "Address is required",
    }),
    lat: Joi.number().min(-90).max(90).required().messages({
        "number.base": "Latitude must be a number",
        "any.required": "Latitude is required",
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        "number.base": "Longitude must be a number",
        "any.required": "Longitude is required",
    }),
});

// UPDATE PROFILE
export const updateUserSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50),
    last_name: Joi.string().trim().min(2).max(50),
    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{6,14}$/)
        .messages({
            "string.pattern.base": "Invalid phone number format",
        }),
    gender: Joi.string().valid(...GENDER_OPTIONS),
    dob: Joi.date().less("now").messages({
        "date.less": "Date of birth must be in the past",
    }),
    address: Joi.string().trim().max(255),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
    });

// UPDATE STATUS
export const updateUserStatusSchema = Joi.object({
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
        })
        .when("status", {
            is: ACCOUNT_STATUS.BLOCKED,
            then: Joi.required().messages({
                "any.required": "Reason is required when blocking",
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
                    "string.pattern.base": "Invalid user ID format",
                })
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