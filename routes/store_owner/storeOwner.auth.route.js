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

const router = express.Router();

router.post("/login", loginLimiter, loginStoreOwner);
router.post("/register", loginLimiter, registerStoreOwner);
router.post("/resend", otpLimiter, sendOTP);
router.post("/verify", otpLimiter, verifyOTP);
router.post("/refresh", refreshLimiter, refreshToken);
router.post("/logout", apiLimiter, logout);

export default router;