import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    authUser,
    refreshToken,
    sendOTP,
    verifyOTP,
    updateUserDetails,
    logout,
} from "../../controllers/user/auth.user.controller.js";
import {
    loginSchema,
    verifyOTPSchema,
    resendOTPSchema,
    updateUserDetailsSchema,
} from "../../validations/user/auth.validation.js";

const router = express.Router();

// Login / Register
router.post(
    "/login",
    apiLimiter,
    validate(loginSchema),
    authUser
);

// Resend OTP
router.post(
    "/resend-otp",
    apiLimiter,
    validate(resendOTPSchema),
    sendOTP
);

// Verify OTP
router.post(
    "/verify-otp",
    apiLimiter,
    validate(verifyOTPSchema),
    verifyOTP
);

// Refresh token
router.post(
    "/refresh",
    apiLimiter,
    refreshToken
);

// PROTECTED ROUTES
router.use(authMiddleware);

// Complete profile
router.put(
    "/complete-profile",
    apiLimiter,
    validate(updateUserDetailsSchema),
    updateUserDetails
);

// Logout
router.post(
    "/logout",
    apiLimiter,
    logout
);

export default router;