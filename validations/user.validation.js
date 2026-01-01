import Joi from "joi";
import { GENDER_OPTIONS, ACCOUNT_STATUS, USER_ROLES } from "../utils/constants.js";

export const updateUserSchema = Joi.object({
    id: Joi.string().required(),
    first_name: Joi.string().min(2).optional(),
    last_name: Joi.string().min(2).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().min(8).optional(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).optional(),
    dob: Joi.date().optional(),
    address: Joi.string().optional(),
    status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)).optional(),
    role: Joi.string().valid(...Object.values(USER_ROLES)).optional(),
});
