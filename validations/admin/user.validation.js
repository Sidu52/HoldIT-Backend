import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../../utils/constants.js";
import { objectIdField, phoneField } from "../common.validator.js";

//  Params
export const userIdSchema = Joi.object({
    user_id: objectIdField("User ID"),
});

// List / pagination
export const listUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),

    account_status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional()
        .messages({
            "any.only": `account_status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
        }),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "last_name", "account_status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// Update profile
export const updateUserSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(100),
    last_name: Joi.string().trim().min(2).max(100),
    phone: phoneField.optional(),
    email: Joi.string().email().lowercase().trim(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).messages({
        "any.only": `Gender must be one of: ${Object.values(GENDER_OPTIONS).join(", ")}`,
    }),
    date_of_birth: Joi.date().iso().max("now").messages({
        "date.max": "Date of birth cannot be in the future",
    }),
})
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });

// Update status
const STATUSES_REQUIRING_REASON = [
    ACCOUNT_STATUS.BLOCKED,
    ACCOUNT_STATUS.INACTIVE,
].filter(Boolean);

export const updateUserStatusSchema = Joi.object({
    account_status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .required()
        .messages({
            "any.required": "Account status is required",
            "any.only": `account_status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
        }),
    reason: Joi.string().trim().max(500).when("account_status", {
        is: Joi.valid(...STATUSES_REQUIRING_REASON),
        then: Joi.required().messages({
            "any.required": "Reason is required when blocking or deactivating a user",
        }),
        otherwise: Joi.optional().allow(null, ""),
    }),
});

// Bulk deactivate
export const bulkDeactivateUsersSchema = Joi.object({
    ids: Joi.array()
        .items(objectIdField("User ID"))
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

// Update User Address
const coordinatesField = Joi.array()
    .items(Joi.number())
    .length(2)
    .optional()
    .messages({
        "array.length": "Coordinates must be exactly [longitude, latitude].",
        "array.base": "Coordinates must be an array.",
    });

// Add — required fields enforced, is_serviceable excluded (set server-side)
export const addAddressSchema = Joi.object({
    type: Joi.string().trim().valid("Home", "Office", "Other").optional(),
    street: Joi.string().trim().required(),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    postal_code: Joi.string().trim().required(),
    country: Joi.string().trim().required(),
    coordinates: coordinatesField,
    is_default: Joi.boolean().optional(),
});

// Update — all fields optional, at least one required, is_serviceable excluded
export const updateAddressSchema = Joi.object({
    type: Joi.string().trim().valid("Home", "Office", "Other").optional(),
    street: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    state: Joi.string().trim().optional(),
    postal_code: Joi.string().trim().optional(),
    country: Joi.string().trim().optional(),
    coordinates: coordinatesField,
    is_default: Joi.boolean().optional(),
}).min(1).messages({
    "object.min": "At least one address field must be provided for update.",
});