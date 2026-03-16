import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    authStore,
    sendOTP,
    verifyOTP,
    refreshToken,
    logout,
} from "../../controllers/store/store.auth.controller.js";

const router = express.Router();

// Public — no auth required
router.post("/", apiLimiter, authStore);    // request OTP
router.post("/resend", apiLimiter, sendOTP);      // resend OTP
router.post("/verify", apiLimiter, verifyOTP);    // verify OTP → get tokens
router.post("/refresh", apiLimiter, refreshToken); // refresh access token
router.post("/logout", apiLimiter, logout);       // clear session

export default router;