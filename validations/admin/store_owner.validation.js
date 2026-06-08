import Joi from "joi";
import {
    ACCOUNT_STATUS,
    GENDER_OPTIONS,
    VERIFICATION_STATUS,
} from "../../utils/constants.js";
import { objectIdField, phoneField } from "../common.validator.js";

export const storeOwnerIdSchema = Joi.object({
    store_owner_id: objectIdField("Store Owner ID"),
});

export const createStoreOwnerSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(100).required().messages({
        "any.required": "First name is required",
        "string.min": "First name must be at least 2 characters",
    }),
    last_name: Joi.string().trim().min(2).max(100).optional(),
    phone: phoneField,
    email: Joi.string().email().lowercase().optional().messages({
        "string.email": "A valid email address is required",
    }),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).optional().messages({
        "any.only": `Gender must be one of: ${Object.values(GENDER_OPTIONS).join(", ")}`,
    }),
    date_of_birth: Joi.date().iso().max("now").optional().messages({
        "date.max": "Date of birth cannot be in the future",
    }),
    address: Joi.string().trim().max(500).optional(),
});

export const updateStoreOwnerSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(100),
    last_name: Joi.string().trim().min(2).max(100),
    phone: phoneField.optional(),
    email: Joi.string().email().lowercase(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).messages({
        "any.only": `Gender must be one of: ${Object.values(GENDER_OPTIONS).join(", ")}`,
    }),
    date_of_birth: Joi.date().iso().max("now").messages({
        "date.max": "Date of birth cannot be in the future",
    }),
    address: Joi.string().trim().max(500),
})
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });

export const listStoreOwnersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),

    account_status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    verification_status: Joi.string().valid(...Object.values(VERIFICATION_STATUS)).optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "last_name", "account_status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

const STATUSES_REQUIRING_REASON = [
    ACCOUNT_STATUS.BLOCKED,
    ACCOUNT_STATUS.INACTIVE,
].filter(Boolean);

export const updateOwnerStatusSchema = Joi.object({
    account_status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .required()
        .messages({
            "any.required": "Account status is required",
            "any.only": `Account status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
        }),
    account_deactivated_reason: Joi.string().trim().max(500).when("account_status", {
        is: Joi.valid(...STATUSES_REQUIRING_REASON),
        then: Joi.required().messages({
            "any.required": "Reason is required when blocking or deactivating an account",
        }),
        otherwise: Joi.optional().allow(null, ""),
    }),
});


export const bulkDeactivateStoreOwnersSchema = Joi.object({
    ids: Joi.array()
        .items(objectIdField("Store Owner ID"))
        .min(1)
        .max(50)
        .required()
        .messages({
            "array.min": "At least one store owner ID is required",
            "array.max": "Cannot deactivate more than 50 store owners at once",
            "any.required": "Store owner IDs are required",
        }),
    reason: Joi.string().trim().max(500).required().messages({
        "any.required": "Reason is required for bulk deactivation",
    }),
});