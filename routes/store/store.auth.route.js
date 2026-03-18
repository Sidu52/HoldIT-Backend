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
router.post("/", apiLimiter, authStore);
router.post("/resend", apiLimiter, sendOTP);
router.post("/verify", apiLimiter, verifyOTP);
router.post("/refresh", apiLimiter, refreshToken);
router.post("/logout", apiLimiter, logout);

export default router;