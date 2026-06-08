import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    adminLogin,
    signUp,
    adminLogout,
    resetPassword,
    verifyAdminInviteToken,
    createAdminForgotPasswordToken,
    updateAdminPassword,
    verifyAdminForgotPasswordToken,
    verifyAuth,
    refresh,
} from "../../controllers/admin/auth.admin.controller.js";
import {
    forgotPasswordSchema,
    loginSchema,
    resetPasswordSchema,
    signupSchema,
    updatePasswordSchema,
    tokenQuerySchema,
} from "../../validations/admin/auth.validation.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { USER_ROLES } from "../../utils/constants.js";

const router = express.Router();

// Login
router.post(
    "/login",
    apiLimiter,
    validate(loginSchema),
    adminLogin
);

// Signup via invite
router.post(
    "/signup",
    apiLimiter,
    validate(signupSchema),
    signUp
);

// Verify invite token
router.get(
    "/verify-invite",
    apiLimiter,
    validate(tokenQuerySchema, "query"),
    verifyAdminInviteToken
);

// Refresh access token
router.post(
    "/refresh",
    apiLimiter,
    (req, res) => refresh(req, res, USER_ROLES.ADMIN)
);

// Request password reset email
router.post(
    "/forgot-password",
    apiLimiter,
    validate(forgotPasswordSchema),
    createAdminForgotPasswordToken
);

// Verify reset token 
router.get(
    "/verify-reset-token",
    apiLimiter,
    validate(tokenQuerySchema, "query"),
    verifyAdminForgotPasswordToken
);

// Set new password with reset token
router.post(
    "/forgot-password/reset",
    apiLimiter,
    validate(resetPasswordSchema),
    updateAdminPassword
);

router.use(authMiddleware);

// Verify current session
router.get(
    "/verify",
    verifyAuth
);

// Logout
router.post(
    "/logout",
    apiLimiter,
    adminLogout
);

// Change password
router.put(
    "/change-password",
    apiLimiter,
    validate(updatePasswordSchema),
    resetPassword
);

export default router;