import Joi from "joi";
import { emailField, passwordField, confirmPasswordField } from "../common.validator.js";
import { GENDER_OPTIONS } from "../../utils/constants.js";


export const loginSchema = Joi.object({
  email: emailField,
  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
});

export const signupSchema = Joi.object({
  first_name: Joi.string().trim().min(2).max(50).required().messages({
    "string.min": "First name must be at least 2 characters",
    "any.required": "First name is required",
  }),
  last_name: Joi.string().trim().min(2).max(50).required().messages({
    "string.min": "Last name must be at least 2 characters",
    "any.required": "Last name is required",
  }),
  phone: Joi.string()
    .length(10)
    .pattern(/^\d+$/)
    .required()
    .messages({
      "string.length": "Phone number must be exactly 10 digits",
      "string.pattern.base": "Phone number must contain only digits",
      "any.required": "Phone number is required",
    }),
  address: Joi.string().trim().max(255).required().messages({
    "any.required": "Address is required",
  }),
  date_of_birth: Joi.date().iso().less("now").required().messages({
    "date.less": "Date of birth must be in the past",
    "any.required": "Date of birth is required",
  }),
  email: emailField,
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .required()
    .messages({
      "any.only": `Gender must be one of: ${Object.values(GENDER_OPTIONS).join(", ")}`,
      "any.required": "Gender is required",
    }),
  password: passwordField("Password"),
  confirm_password: confirmPasswordField("password"),
  invite_token: Joi.string().required().messages({
    "any.required": "Invite token is required",
  }),
});

export const forgotPasswordSchema = Joi.object({
  email: emailField,
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Reset token is required",
  }),
  password: passwordField("Password"),
  confirm_password: confirmPasswordField("password"),
});

export const updatePasswordSchema = Joi.object({
  current_password: Joi.string().required().messages({
    "any.required": "Current password is required",
  }),
  new_password: passwordField("New password"),
  confirm_password: confirmPasswordField("new_password"),
});

export const tokenQuerySchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Token is required",
  }),
});