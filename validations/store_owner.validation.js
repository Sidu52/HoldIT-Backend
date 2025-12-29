import Joi from "joi";
import { GENDER_OPTIONS } from "../utils/constants.js";

// Validation for updating driver details
export const updateStoreOwnerSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    dob: Joi.date().less("now").optional(),
    address: Joi.string().max(255).optional(),
    email: Joi.string().email().required(),
});

export const updateStoreSchema = Joi.object({
  store_name: Joi.string().min(2).max(50).required(),
  store_address: Joi.string().max(255).optional(),
  store_capacity: Joi.number().integer().min(1).max(100).required(),
  store_open_time: Joi.string().optional(),
  store_close_time: Joi.string().optional(),
  store_description: Joi.string().max(255).optional(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required()
}).unknown(false);
