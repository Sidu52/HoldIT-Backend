import Joi from "joi";
import { GENDER_OPTIONS } from "../../utils/constants.js";


// UPDATE USER DETAILS
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
    dob: Joi.date().less("now").required().messages({
        "date.less": "Date of birth must be in the past",
        "any.required": "Date of birth is required",
    }),
    address: Joi.string().trim().min(5).max(255).required().messages({
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