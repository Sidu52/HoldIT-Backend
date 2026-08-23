import Joi from "joi";
import { BOOKING_STATUS } from "../../utils/constants.js";
import { objectIdField } from "../common.validator.js";

const reasonField = (requiredForStatuses = []) =>
  Joi.string()
    .trim()
    .max(500)
    .when("status", {
      is: Joi.valid(...requiredForStatuses),
      then: Joi.required().messages({
        "any.required": `Reason is required when status is: ${requiredForStatuses.join(", ")}`,
      }),
      otherwise: Joi.optional().allow(null, ""),
    });


export const listBookingsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid(...Object.values(BOOKING_STATUS)).optional(),
  user_id: objectIdField("User ID", false),
  store_id: objectIdField("Store ID", false),
  service_area_id: objectIdField("Service Area ID", false),

  search: Joi.string().trim().max(100).allow("").optional(),
  sort_by: Joi.string().valid("created_at", "status", "last_status_updated_at").default("created_at"),
  sort_order: Joi.string().valid("asc", "desc").default("desc"),

  from_date: Joi.date().iso().optional().messages({
    "date.format": "from_date must be a valid ISO date",
  }),
  to_date: Joi.date()
    .iso()
    .when("from_date", {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref("from_date")).messages({
        "date.min": "to_date must be on or after from_date",
        "date.format": "to_date must be a valid ISO date",
      }),
      otherwise: Joi.optional(),
    }),
});


export const bookingIdSchema = Joi.object({
  id: objectIdField("Booking ID"),
});

// Statuses that require a written reason
const STATUSES_REQUIRING_REASON = [
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.REJECTED,
].filter(Boolean);;

export const updateBookingStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(BOOKING_STATUS))
    .required()
    .messages({
      "any.required": "Status is required",
      "any.only": `Status must be one of: ${Object.values(BOOKING_STATUS).join(", ")}`,
    }),
  reason: reasonField(STATUSES_REQUIRING_REASON),
});


export const assignDriverSchema = Joi.object({
  driver_id: objectIdField("Driver ID", false),
  driverId: objectIdField("Driver ID", false),
});

export const reassignDriverSchema = assignDriverSchema;

export const reassignStoreSchema = Joi.object({
  store_id: objectIdField("Store ID"),
});

export const assignReturnDriverSchema = assignDriverSchema;