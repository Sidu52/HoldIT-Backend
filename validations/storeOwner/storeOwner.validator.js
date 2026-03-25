import Joi from "joi";
import { GENDER_OPTIONS } from "../../utils/constants.js";

const locationSchema = Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    address: Joi.string().trim().max(500).required(),
});

export const completeProfileSchema = Joi.object({
    first_name: Joi.string().trim().max(100).required(),
    last_name: Joi.string().trim().max(100).required(),
    email: Joi.string().email().trim().lowercase().required(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).required(),
    date_of_birth: Joi.date().max("now").optional(),
    address: Joi.string().trim().max(500).optional(),
});

export const updateProfileSchema = Joi.object({
    first_name: Joi.string().trim().max(100).optional(),
    last_name: Joi.string().trim().max(100).optional(),
    email: Joi.string().email().trim().lowercase().optional(),
    gender: Joi.string().valid(...Object.values(GENDER_OPTIONS)).optional(),
    date_of_birth: Joi.date().max("now").optional(),
    address: Joi.string().trim().max(500).optional(),
}).min(1);

export const createStoreSchema = Joi.object({
    phone: Joi.string().trim().min(10).max(15).required(),
    store_name: Joi.string().trim().max(200).required(),
    store_description: Joi.string().trim().max(1000).optional(),
    store_contact_number: Joi.string().trim().max(15).optional(),
    store_open_time: Joi.string().optional(),
    store_close_time: Joi.string().optional(),
    location: locationSchema.required(),
});

export const updateStoreSchema = Joi.object({
    store_name: Joi.string().trim().max(200).optional(),
    store_description: Joi.string().trim().max(1000).optional(),
    store_contact_number: Joi.string().trim().max(15).optional(),
    store_open_time: Joi.string().optional(),
    store_close_time: Joi.string().optional(),
    location: locationSchema.optional(),
}).min(1);

export const goOnlineSchema = Joi.object({
    store_id: Joi.string().trim().required(),
    is_online: Joi.boolean().required(),
});