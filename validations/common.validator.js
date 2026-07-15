import Joi from "joi";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../utils/constants.js";

export const emailField = Joi.string().email().required().messages({
    "string.email": "A valid email address is required",
    "any.required": "Email is required",
});

export const loginByPhone = (label = "Phone", required = true) => Joi.object({
    phone: phoneField,
});

export const verifyOTP = (label = "OTP") => Joi.object({
    phone: phoneField,
    otp: Joi.string()
        .length(4)
        .pattern(/^[0-9]{4}$/)
        .required()
        .messages({
            "string.length": "OTP must be exactly 4 digits",
            "string.pattern.base": "OTP must contain only digits",
            "any.required": "OTP is required",
        }),
});

export const passwordField = (label = "Password") =>
    Joi.string()
        .min(PASSWORD_MIN_LENGTH)
        .max(PASSWORD_MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .required()
        .messages({
            "string.min": `${label} must be at least ${PASSWORD_MIN_LENGTH} characters`,
            "string.max": `${label} must be at most ${PASSWORD_MAX_LENGTH} characters`,
            "string.pattern.base": `${label} must contain uppercase, lowercase, a number, and a special character`,
            "any.required": `${label} is required`,
        });

export const confirmPasswordField = (ref = "password") =>
    Joi.string()
        .valid(Joi.ref(ref))
        .required()
        .messages({
            "any.only": "Passwords do not match",
            "any.required": "Please confirm your password",
        });

export const phoneField = Joi.string()
    .pattern(/^\+?[1-9]\d{6,13}$/)   // 7–14 digits after optional '+'
    .required()
    .messages({
        "string.pattern.base": "Phone number must be a valid international format (e.g. +919876543210)",
        "any.required": "Phone number is required",
    });

export const uuidField = (label = "ID") =>
    Joi.string()
        .guid({ version: ["uuidv4"] })
        .required()
        .messages({
            "string.guid": `${label} must be a valid UUID`,
            "any.required": `${label} is required`,
        });

export const objectIdField = (label = "ID", required = true) => {
    const field = Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .messages({
            "string.pattern.base": `${label} must be a valid ID`,
            "any.required": `${label} is required`,
        });

    return required ? field.required() : field.optional();
};