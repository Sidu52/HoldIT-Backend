import express from "express";
import { apiLimiter, loginLimiter, otpLimiter, refreshLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    loginSchema,
    verifyOTPSchema,
    resendOTPSchema
} from "../../validations/user/auth.validation.js";
import { updateDriverDetailsSchema } from "../../validations/driver/auth.validation.js";
import {
    authDriver,
    refreshToken,
    sendOTP,
    verifyOTP,
    updateDriverDetails,
    logout,
} from "../../controllers/driver/auth.driver.controller.js";

const router = express.Router();

// Login / Register
router.post(
    "/login",
    loginLimiter,
    validate(loginSchema),
    authDriver
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
    validate(updateDriverDetailsSchema),
    updateDriverDetails
);

// Logout
router.post(
    "/logout",
    apiLimiter,
    logout
);

export default router;
