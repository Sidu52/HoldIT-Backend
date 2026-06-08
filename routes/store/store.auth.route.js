import express from "express";
import { apiLimiter, loginLimiter, otpLimiter, refreshLimiter } from "../../config/rateLimiter.js";
import {
    loginStore,
    sendOTP,
    verifyOTP,
    refreshToken,
    logout,
} from "../../controllers/store/store.auth.controller.js";

const router = express.Router();

// Public — no auth required
router.post("/login", loginLimiter, loginStore);
router.post("/resend", otpLimiter, sendOTP);
router.post("/verify", otpLimiter, verifyOTP);
router.post("/refresh", refreshLimiter, refreshToken);
router.post("/logout", apiLimiter, logout);

export default router;