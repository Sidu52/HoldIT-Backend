import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS, ON_BOARDING_STATUS } from "../../utils/constants.js";

// Add/replace in store.validation.js

export const createStoreOwnerSchema = Joi.object({
    // ✅ Fixed: first_name/last_name not "name"
    first_name: Joi.string().trim().min(2).max(100).required(),
    last_name: Joi.string().trim().min(2).max(100).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).required()
        .messages({ "string.pattern.base": "Invalid phone number format" }),
    email: Joi.string().email().optional(),
    gender: Joi.string().valid("male", "female", "other").optional(),
    date_of_birth: Joi.date().iso().max("now").optional(),
    address: Joi.string().trim().max(500).optional(),
});

export const updateStoreOwnerSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(100),
    last_name: Joi.string().trim().min(2).max(100),
    phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/)
        .messages({ "string.pattern.base": "Invalid phone number format" }),
    email: Joi.string().email(),
    gender: Joi.string().valid("male", "female", "other"),
    date_of_birth: Joi.date().iso().max("now"),
    address: Joi.string().trim().max(500),
}).min(1).messages({ "object.min": "At least one field is required to update" });

export const listStoreOwnersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    is_verified: Joi.boolean().optional(),
    is_active: Joi.boolean().optional(),
    onboarding_status: Joi.string().valid(...Object.values(ON_BOARDING_STATUS)).optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string().valid("createdAt", "first_name", "status").default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const updateOwnerStatusSchema = Joi.object({
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).required(),
    reason: Joi.when("status", {
        is: ACCOUNT_STATUS.BLOCKED,
        then: Joi.string().trim().max(500).required(),
        otherwise: Joi.forbidden(),
    }),
});