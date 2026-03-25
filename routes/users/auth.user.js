import express from "express";
import { apiLimiter, loginLimiter, otpLimiter, refreshLimiter } from "../../config/rateLimiter.js";
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
    loginLimiter,
    validate(loginSchema),
    authUser
);

// Resend OTP
router.post(
    "/resend-otp",
    otpLimiter,
    validate(resendOTPSchema),
    sendOTP
);

// Verify OTP
router.post(
    "/verify-otp",
    otpLimiter,
    validate(verifyOTPSchema),
    verifyOTP
);

// Refresh token
router.post(
    "/refresh",
    refreshLimiter,
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