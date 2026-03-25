import Joi from "joi";

export const confirmStoredSchema = Joi.object({
    notes: Joi.string().trim().max(500).optional(),
});

export const verifyReturnOtpSchema = Joi.object({
    otp: Joi.string().trim().required(),
});