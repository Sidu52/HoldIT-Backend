// validations/admin.validation.js
import Joi from "joi";
import { ACCOUNT_STATUS, GENDER_OPTIONS } from "../../utils/constants.js";

// Update profile
export const updateProfileSchema = Joi.object({
  first_name: Joi.string().trim().min(2).max(50),
  last_name: Joi.string().trim().min(2).max(50),
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{6,14}$/)
    .message("Invalid phone number format"),
  gender: Joi.string().valid(...GENDER_OPTIONS),
  avatar: Joi.string().uri(),
})
  .min(1) // At least one field required
  .messages({
    "object.min": "At least one field is required to update",
  });

// List query params (pagination + filtering)
export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(""),
  status: Joi.string().valid(...Object.values(ACCOUNT_STATUS)),
  sort_by: Joi.string()
    .valid("created_at", "name", "status")
    .default("created_at"),
  sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

// Update account status
export const updateAccountSchema = Joi.object({
  auth_id: Joi.string().required().messages({
    "any.required": "User ID is required",
  }),
  status: Joi.string()
    .valid(...Object.values(ACCOUNT_STATUS))
    .required()
    .messages({
      "any.required": "Status is required",
      "any.only": `Status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
    }),
  reason: Joi.string().trim().max(500).when("status", {
    is: ACCOUNT_STATUS.BLOCKED,
    then: Joi.required().messages({
      "any.required": "Reason is required when blocking an account",
    }),
    otherwise: Joi.optional(),
  }),
});

// Invite schema
export const inviteSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Valid email is required",
    "any.required": "Email is required",
  }),
  role: Joi.string()
    .valid("admin", "operation_manager", "customer_support")
    .required()
    .messages({
      "any.required": "Role is required",
      "any.only": "Cannot invite super_admin role",
    }),
});
// Validation for updating driver details
export const updateAdminSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  password: Joi.string().min(8).max(50).required(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').required(),
});