import Joi from "joi";
import { GENDER_OPTIONS } from "../utils/constants.js";

// Validation for updating user details
export const updateUserSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    dob: Joi.date().less("now").optional(),
    address: Joi.string().max(255).optional(),
    email: Joi.string().email().required(),
});
