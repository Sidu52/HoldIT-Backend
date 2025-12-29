import Joi from "joi";
import { GENDER_OPTIONS } from "../utils/constants.js";

// Validation for updating driver details
export const updateAdminSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    password: Joi.string().min(8).max(50).required(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').required(),
});