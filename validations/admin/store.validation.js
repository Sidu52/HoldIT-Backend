import Joi from "joi";
import { ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";
import { objectIdField, phoneField } from "../common.validator.js";

export const storeIdSchema = Joi.object({
    store_id: objectIdField("Store ID"),
});

export const storeOwnerIdParamSchema = Joi.object({
    store_owner_id: objectIdField("Store Owner ID"),
});

export const createStoreSchema = Joi.object({
    phone: phoneField,
    store_name: Joi.string().trim().min(2).max(200).required(),
    store_description: Joi.string().trim().max(1000).optional(),
    store_open_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).optional().messages({
        "string.pattern.base": "store_open_time must be in HH:mm format",
    }),
    store_close_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).optional().messages({
        "string.pattern.base": "store_close_time must be in HH:mm format",
    }),
    store_contact_number: Joi.string().trim().max(15).optional(),
    max_booking_capacity: Joi.number().integer().min(1).max(500).optional(),
    store_owner_id: objectIdField("Store Owner ID", false),
    location: Joi.object().keys({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        address: Joi.string().trim().min(5).max(500).required(),
    }).required(),
});

// Update profile
export const updateStoreSchema = Joi.object({
    store_name: Joi.string().trim().min(2).max(200),
    store_description: Joi.string().trim().max(1000),
    store_open_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
        "string.pattern.base": "store_open_time must be in HH:mm format",
    }),
    store_close_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
        "string.pattern.base": "store_close_time must be in HH:mm format",
    }),
    store_contact_number: Joi.string().trim().max(15),
    max_booking_capacity: Joi.number().integer().min(1).max(500),
    verification_status: Joi.string().valid(...Object.values(VERIFICATION_STATUS)),
})
    .min(1)
    .messages({
        "object.min": "At least one field is required to update",
        "object.and": "lat and lng must both be provided together",
    });

// List stores
export const listStoresSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    account_status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    verification_status: Joi.string().valid(...Object.values(VERIFICATION_STATUS)).optional(),
    is_online: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    sort_by: Joi.string().valid("createdAt", "store_name", "account_status", "rating_avg").default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// Online / offline toggle
export const updateStoreOnlineSchema = Joi.object({
    is_online: Joi.boolean().required().messages({
        "any.required": "is_online is required",
    }),
});

// Status update
const STATUSES_REQUIRING_REASON = [
    ACCOUNT_STATUS.BLOCKED,
    ACCOUNT_STATUS.INACTIVE,
].filter(Boolean);

export const updateStoreStatusSchema = Joi.object({
    account_status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    store_deactivated_reason: Joi.string().trim().max(500).when("account_status", {
        is: Joi.valid(...STATUSES_REQUIRING_REASON),
        then: Joi.required().messages({
            "any.required": "Reason is required when blocking or deactivating a store",
        }),
        otherwise: Joi.optional().allow(null, ""),
    }),
})
    .or("account_status", "verification_status")
    .messages({
        "object.missing": "At least one of account_status or verification_status is required",
    });


// Bulk deactivate
export const bulkDeactivateStoresSchema = Joi.object({
    ids: Joi.array()
        .items(objectIdField("Store ID"))
        .min(1)
        .max(50)
        .required()
        .messages({
            "array.min": "At least one store ID is required",
            "array.max": "Cannot deactivate more than 50 stores at once",
            "any.required": "Store IDs are required",
        }),
    reason: Joi.string().trim().max(500).required().messages({
        "any.required": "Reason is required for bulk deactivation",
    }),
});