// validations/booking.validation.js

import Joi from "joi";
import { BOOKING_STATUS } from "../../utils/constants.js";

export const listBookingsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid(...Object.values(BOOKING_STATUS)).optional(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  storeId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  serviceAreaId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  search: Joi.string().trim().max(100).allow("").optional(),
  sort_by: Joi.string()
    .valid("createdAt", "status", "lastStatusUpdatedAt")
    .default("createdAt"),
  sort_order: Joi.string().valid("asc", "desc").default("desc"),
  from_date: Joi.date().iso().optional(),
  to_date: Joi.date().iso().min(Joi.ref("from_date")).optional()
    .messages({ "date.min": "to_date must be after from_date" }),
});

export const bookingIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid booking ID format",
      "any.required": "Booking ID is required",
    }),
});

export const updateBookingStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(BOOKING_STATUS))
    .required()
    .messages({
      "any.required": "Status is required",
      "any.only": `Status must be one of: ${Object.values(BOOKING_STATUS).join(", ")}`,
    }),
  reason: Joi.string()
    .trim()
    .max(500)
    .when("status", {
      is: "cancelled",
      then: Joi.required().messages({
        "any.required": "Reason is required when cancelling",
      }),
      otherwise: Joi.optional(),
    }),
});

export const assignDriverSchema = Joi.object({ driverId: Joi.string().required() });
export const reassignDriverSchema = Joi.object({ driverId: Joi.string().required() });
export const reassignStoreSchema = Joi.object({ storeId: Joi.string().required() });
export const assignReturnDriverSchema = Joi.object({ driverId: Joi.string().required() });