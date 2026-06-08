import Joi from "joi";
import {
    ACCOUNT_STATUS,
    GENDER_OPTIONS,
    VEHICLE_TYPES,
    VERIFICATION_STATUS,
} from "../../utils/constants.js";
import { objectIdField, phoneField } from "../common.validator.js";

export const driverIdSchema = Joi.object({
    driver_id: objectIdField("Driver ID"),
});
export const listDriversSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    account_status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .optional()
        .messages({
            "any.only": `account_status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
        }),
    verification_status: Joi.string()
        .valid(...Object.values(VERIFICATION_STATUS))
        .optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
    is_online: Joi.boolean().optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "last_name", "account_status", "rating_avg")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const updateDriverSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(100),
    last_name: Joi.string().trim().min(2).max(100),
    phone: phoneField.optional(),
    email: Joi.string().email().lowercase().trim(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)),
    date_of_birth: Joi.date().iso().max("now").messages({
        "date.max": "Date of birth cannot be in the future",
    }),
    address: Joi.string().trim().max(500),
    vehicle_type: Joi.string().valid(...Object.values(VEHICLE_TYPES)),
    license_number: Joi.string().trim().max(50),
    service_area_id: objectIdField("Service Area ID", false),
})
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });


export const updateLocationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required().messages({
        "number.min": "Latitude must be between -90 and 90",
        "number.max": "Latitude must be between -90 and 90",
        "any.required": "Latitude is required",
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
        "number.min": "Longitude must be between -180 and 180",
        "number.max": "Longitude must be between -180 and 180",
        "any.required": "Longitude is required",
    }),
    address: Joi.string().trim().max(500).optional(),
});


export const updateDriverAccountSchema = Joi.object({
    account_status: Joi.string()
        .valid(...Object.values(ACCOUNT_STATUS))
        .messages({
            "any.only": `account_status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
        }),
    account_deactivated_reason: Joi.string().trim().max(500).when("account_status", {
        is: Joi.valid(
            ...[ACCOUNT_STATUS.BLOCKED, ACCOUNT_STATUS.INACTIVE].filter(Boolean)
        ),
        then: Joi.required().messages({
            "any.required": "Reason is required when blocking or deactivating a driver",
        }),
        otherwise: Joi.optional().allow(null, ""),
    }),
})
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });


export const bulkDeactivateSchema = Joi.object({
    ids: Joi.array()
        .items(objectIdField("Driver ID"))
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