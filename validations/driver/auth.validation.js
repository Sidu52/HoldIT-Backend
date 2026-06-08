import Joi from "joi";
import { GENDER_OPTIONS, VEHICLE_TYPES } from "../../utils/constants.js";

// UPDATE DRIVER DETAILS
export const updateDriverDetailsSchema = Joi.object({
    first_name: Joi.string().trim().min(2).max(50).required().messages({
        "any.required": "First name is required",
        "string.min": "First name must be at least 2 characters",
    }),
    last_name: Joi.string().trim().min(2).max(50).required().messages({
        "any.required": "Last name is required",
    }),
    email: Joi.string().email().required().messages({
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
    date_of_birth: Joi.date().less("now").required().messages({
        "date.less": "Date of birth must be in the past",
        "any.required": "Date of birth is required",
    }),
    address: Joi.string().trim().min(5).max(500).required().messages({
        "any.required": "Address is required",
        "string.min": "Address must be at least 5 characters",
    }),
    vehicle_type: Joi.string()
        .valid(...Object.values(VEHICLE_TYPES))
        .required()
        .messages({
            "any.required": "Vehicle type is required",
        }),
    license_number: Joi.string().trim().min(5).required().messages({
        "any.required": "License number is required",
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