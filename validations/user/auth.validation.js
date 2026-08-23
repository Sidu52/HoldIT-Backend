import Joi from "joi";
import { GENDER_OPTIONS, OTP_LENGTH } from "../../utils/constants.js";

// Reusable base schemas
const phoneSchema = Joi.string()
    .pattern(/^\+?[1-9]\d{6,14}$/)
    .required()
    .messages({
        "string.pattern.base": "Invalid phone number format",
        "any.required": "Phone number is required",
    });

const otpSchema = Joi.string()
    .length(OTP_LENGTH)
    .pattern(/^\d+$/)
    .required()
    .messages({
        "string.length": `OTP must be ${OTP_LENGTH} digits`,
        "string.pattern.base": "OTP must contain only digits",
        "any.required": "OTP is required",
    });

// Schemas
export const loginSchema = Joi.object({
    phone: phoneSchema,
});

export const resendOTPSchema = Joi.object({
    phone: phoneSchema,
});

export const verifyOTPSchema = Joi.object({
    phone: phoneSchema,
    otp: otpSchema,
});

export const updateUserDetailsSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50).required().messages({
        "any.required": "First name is required",
        "string.min": "First name must be at least 2 characters",
        "string.max": "First name cannot exceed 50 characters",
    }),

    last_name: Joi.string().trim().min(2).max(50).required().messages({
        "any.required": "Last name is required",
        "string.min": "Last name must be at least 2 characters",
    }),

    email: Joi.string().email({ tlds: { allow: false } }).required().messages({
        "string.email": "Invalid email address",
        "any.required": "Email is required",
    }),

    gender: Joi.string()
        .valid(...GENDER_OPTIONS)
        .required()
        .messages({
            "any.only": `Gender must be one of: ${GENDER_OPTIONS.join(", ")}`,
            "any.required": "Gender is required",
        }),

    date_of_birth: Joi.date()
        .less("now")
        .greater("1900-01-01")
        .messages({
            "date.less": "Date of birth must be in the past",
            "date.greater": "Please enter a valid date of birth",
            "any.required": "Date of birth is required",
        }),

    dob: Joi.date()
        .less("now")
        .greater("1900-01-01")
        .messages({
            "date.less": "Date of birth must be in the past",
            "date.greater": "Please enter a valid date of birth",
        }),

    address: Joi.string().trim().min(5).max(255).required().messages({
        "any.required": "Address is required",
        "string.min": "Address is too short",
    }),

    lat: Joi.number().min(-90).max(90).required().messages({
        "number.base": "Latitude must be a number",
        "number.min": "Latitude must be between -90 and 90",
        "number.max": "Latitude must be between -90 and 90",
        "any.required": "Latitude is required",
    }),

    lng: Joi.number().min(-180).max(180).required().messages({
        "number.base": "Longitude must be a number",
        "number.min": "Longitude must be between -180 and 180",
        "number.max": "Longitude must be between -180 and 180",
        "any.required": "Longitude is required",
    }),
}).or("date_of_birth", "dob");