import Joi from 'joi';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USER_ROLES } from '../utils/constants.js';
import { GENDER_OPTIONS } from '../utils/constants.js';

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(8).max(50).required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});

export const updatePasswordSchema = Joi.object({
  oldPassword: Joi.string().min(8).max(50).required()
    .messages({
      'string.empty': 'Old password is required',
      'any.required': 'Old password is required',
    }),
  newPassword: Joi.string().min(8).max(50).required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      'string.max': `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.empty': 'New password is required',
      'any.required': 'New password is required',
    }),
  confirmPassword: Joi.ref('newPassword'),
});

export const updateAccountSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "BLOCKED", "DELETED", "PENDING").required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().min(10).max(15).allow('', null).optional(),
})
  .or('email', 'phone');

export const signupSchema = Joi.object({
  first_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'First Name must be at least 2 characters long',
      'string.max': 'FirstName cannot exceed 100 characters',
      'string.empty': 'First Name is required',
      'any.required': 'First Name is required',
    }),
  last_name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Last Name must be at least 2 characters long',
      'string.max': 'Last Name cannot exceed 100 characters',
      'string.empty': 'Last Name is required',
      'any.required': 'Last Name is required',
    }),
  password: Joi.string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      'string.max': `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.empty': 'Password is required',
      'any.required': 'Password is required',
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Confirm password is required',
      'any.required': 'Confirm password is required',
    }),
  gender: Joi.string()
    .valid(...GENDER_OPTIONS)
    .required()
    .messages({
      'any.only': `Gender must be one of: ${GENDER_OPTIONS.join(', ')}`,
      'string.empty': 'Gender is required',
      'any.required': 'Gender is required',
    }),
  phone: Joi.string()
    .min(10)
    .max(15)
    .allow('', null)
    .required(),
  address: Joi.string()
    .min(10)
    .max(100)
    .allow('', null)
    .required(),
  dateOfBirth: Joi.date()
    .allow('', null)
    .required()
});


export const inviteSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),
  role: Joi.string()
    .required()
    .valid(USER_ROLES.CUSTOMER_SUPPORT, USER_ROLES.OPERATION_MANAGER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN)
    .messages({
      'any.only': `Role must be one of: ${USER_ROLES.CUSTOMER_SUPPORT}, ${USER_ROLES.OPERATION_MANAGER}, ${USER_ROLES.ADMIN}, ${USER_ROLES.SUPER_ADMIN}`,
      'string.empty': 'Role is required',
      'any.required': 'Role is required',
    }),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'string.empty': 'Token is required',
      'any.required': 'Token is required',
    }),
  newPassword: Joi.string()
    .min(8)
    .max(50)
    .required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      'string.max': `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.empty': 'New password is required',
      'any.required': 'New password is required',
    }),
});
