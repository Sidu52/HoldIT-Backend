import Joi from "joi";
import {
    ACCOUNT_STATUS,
    GENDER_OPTIONS,
    VEHICLE_TYPES,
    VERIFICATION_STATUS,
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
        .valid(...Object.values(VERIFICATION_STATUS))
        .optional(),
    sort_by: Joi.string()
        .valid("createdAt", "first_name", "status")
        .default("createdAt"),
    sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// UPDATE DRIVER
export const updateDriverSchema = Joi.object({
    first_name: Joi.string().min(2).max(50),
    last_name: Joi.string().min(2).max(50),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/),
    email: Joi.string().email(),
    gender: Joi.string().valid("male", "female", "other"),
    date_of_birth: Joi.date().iso().max("now"),
    address: Joi.string().max(255),
    vehicle_type: Joi.string().valid("bike", "car", "van"),
    license_number: Joi.string().max(50),
    service_area_id: Joi.string().hex().length(24),
}).min(1); // at least one field required

export const updateDriverLocationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    address: Joi.string().max(255),
});

export const updateDriverAccountSchema = Joi.object({
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)),
    is_active: Joi.boolean(),
    is_Online: Joi.boolean(),
    is_on_trip: Joi.boolean(),
    is_verified: Joi.boolean(),
    is_serviceable: Joi.boolean(),
    verification_status: Joi.string().valid(
        "PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"
    ),
}).min(1); // at least one field required

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