import Joi from "joi";
import { GENDER_OPTIONS } from "../../utils/constants.js";


// UPDATE USER DETAILS
export const updateStoreDetailsSchema = Joi.object({
    store_name: Joi.string().trim().min(2).max(50).required().messages({
        "any.required": "Store name is required",
        "string.min": "Store name must be at least 2 characters",
    }),
    store_contact_number: Joi.string().trim().min(2).max(15).required().messages({
        "any.required": "Store contact number is required",
        "string.min": "Store contact number must be at least 2 characters",
    }),
    store_open_time: Joi.string().trim().min(2).max(15).required().messages({
        "any.required": "Store open time is required",
        "string.min": "Store open time must be at least 2 characters",
    }),
    store_close_time: Joi.string().trim().min(2).max(15).required().messages({
        "any.required": "Store close time is required",
        "string.min": "Store close time must be at least 2 characters",
    }),
    store_description: Joi.string().trim().min(2).max(1000).required().messages({
        "any.required": "Store description is required",
        "string.min": "Store description must be at least 2 characters",
    }),
    
    lat : Joi.number().required().messages({
        "any.required": "Latitude is required",
    }),

    lng : Joi.number().required().messages({
        "any.required": "Longitude is required",
    }),

    address : Joi.string().trim().min(2).max(500).required().messages({
        "any.required": "Address is required",
        "string.min": "Address must be at least 2 characters",
    }),
});