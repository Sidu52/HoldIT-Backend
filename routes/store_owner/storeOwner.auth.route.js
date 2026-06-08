import express from "express";
import { apiLimiter, loginLimiter, otpLimiter, refreshLimiter } from "../../config/rateLimiter.js";
import {
    loginStoreOwner,
    registerStoreOwner,
    sendOTP,
    verifyOTP,
    refreshToken,
    logout,
} from "../../controllers/store_owner/storeOwner.auth.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginByPhone, verifyOTP as verifyOTPV } from "../../validations/common.validator.js";

const router = express.Router();

router.post("/login", loginLimiter, validate(loginByPhone), loginStoreOwner);
router.post("/register", loginLimiter, validate(loginByPhone), registerStoreOwner);
router.post("/resend", otpLimiter, validate(loginByPhone), sendOTP);
router.post("/verify", otpLimiter, validate(verifyOTPV), verifyOTP);
router.post("/refresh", refreshLimiter, refreshToken);
router.post("/logout", apiLimiter, logout);

export default router;