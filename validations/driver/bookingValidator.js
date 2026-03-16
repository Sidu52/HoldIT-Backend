import Joi from "joi";

export const acceptBookingSchema = Joi.object({
    // No body needed — bookingId comes from URL param
    // Schema exists for future fields (e.g. ETA confirmation)
});

export const rejectBookingSchema = Joi.object({
    reason: Joi.string().trim().max(500).allow("").optional(),
});