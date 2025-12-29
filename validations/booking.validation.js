import Joi from "joi";

export const createBookingSchema = Joi.object({
  pickup_location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    address: Joi.string().max(255).required(),
  }).required(),
  bags_count: Joi.number().min(1).max(10).required(),
});