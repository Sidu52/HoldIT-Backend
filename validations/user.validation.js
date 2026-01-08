import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../utils/constants.js";

export const updateUserSchema = Joi.object({
    first_name: Joi.string().min(2).optional(),
    last_name: Joi.string().min(2).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().min(8).optional(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).optional(),
    dob: Joi.date().optional(),
    address: Joi.string().optional(),
});

export const updateUserStatusSchema = Joi.object({
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)),
    reason: Joi.string().optional(),
    is_active: Joi.boolean(),
});
