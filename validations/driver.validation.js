import Joi from "joi";
import { GENDER_OPTIONS } from "../utils/constants.js";

// Validation for updating driver details
export const updateDriverSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    dob: Joi.date().less("now").optional(),
    address: Joi.string().max(255).optional(),
    email: Joi.string().email().required(),
    vehicle_type: Joi.string().max(50).required(),
    license_number: Joi.string().max(50).required(),
    currentLocation: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        address: Joi.string().max(255).required(),
    }).required(),

});