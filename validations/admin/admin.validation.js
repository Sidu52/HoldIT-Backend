import Joi from "joi";
import {
  ACCOUNT_STATUS,
  GENDER_OPTIONS,
  ROLES,
  VERIFICATION_STATUS,
} from "../../utils/constants.js";
import {
  emailField,
  objectIdField,
  passwordField,
  phoneField,
} from "../common.validator.js";

export const updateProfileSchema = Joi.object({
  first_name: Joi.string().trim().min(2).max(50).messages({
    "string.min": "First name must be at least 2 characters",
  }),
  last_name: Joi.string().trim().min(2).max(50).messages({
    "string.min": "Last name must be at least 2 characters",
  }),
  phone: phoneField.optional(),
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .messages({
      "any.only": `Gender must be one of: ${GENDER_OPTIONS.join(", ")}`,
    }),
  address: Joi.string().trim().min(2).max(500),
  date_of_birth: Joi.date()
    .min(new Date(1900, 0, 1))
    .max("now")
    .messages({
      "date.max": "Date of birth cannot be in the future",
      "date.min": "Date of birth seems too far in the past",
    }),
  verification_status: Joi.string()
    .valid(...Object.values(VERIFICATION_STATUS))
    .messages({
      "any.only": `verification_status must be one of: ${Object.values(VERIFICATION_STATUS).join(", ")}`,
    }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update",
  });


export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(""),
  account_status: Joi.string()
    .valid(...Object.values(ACCOUNT_STATUS))
    .allow("", null)
    .messages({
      "any.only": `account_status must be empty or one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
    }),
  verification_status: Joi.string()
    .valid(...Object.values(VERIFICATION_STATUS))
    .messages({
      "any.only": `verification_status must be one of: ${Object.values(VERIFICATION_STATUS).join(", ")}`,
    }),
  sort_by: Joi.string()
    .valid("created_at", "first_name", "last_name")
    .default("created_at"),
  sort_order: Joi.string().valid("asc", "desc").default("desc"),
});

export const userIdSchema = Joi.object({
  id: objectIdField("User ID"),
});
const STATUSES_REQUIRING_REASON = [ACCOUNT_STATUS.BLOCKED, ACCOUNT_STATUS.SUSPENDED].filter(Boolean);;

export const updateAccountSchema = Joi.object({
  auth_id: objectIdField("User ID"),
  account_status: Joi.string()
    .valid(...Object.values(ACCOUNT_STATUS))
    .required()
    .messages({
      "any.required": "Account status is required",
      "any.only": `Account status must be one of: ${Object.values(ACCOUNT_STATUS).join(", ")}`,
    }),
  reason: Joi.string()
    .trim()
    .max(500)
    .when("account_status", {
      is: Joi.valid(...STATUSES_REQUIRING_REASON || ""),
      then: Joi.required().messages({
        "any.required": "A reason is required when blocking or suspending an account",
      }),
      otherwise: Joi.optional().allow(null, ""),
    }),
});

export const inviteSchema = Joi.object({
  email: emailField,
  role: Joi.string()
    .valid(...Object.values(ROLES))
    .required()
    .messages({
      "any.required": "Role is required",
      "any.only": `Role must be one of: ${Object.values(ROLES).join(", ")}`,
    }),
});

export const updateAdminSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    "string.min": "Name must be at least 2 characters",
    "any.required": "Name is required",
  }),
  password: passwordField("Password"),
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .required()
    .messages({
      "any.only": `Gender must be one of: ${GENDER_OPTIONS.join(", ")}`,
      "any.required": "Gender is required",
    }),
});