import express from "express";

import { USER_ROLES } from "../utils/constants.js";
import {authMiddleware,roleMiddleware} from "../middlewares/auth.middleware.js";
import { updatePricing } from "../controllers/pricing.controller.js";
import {
  sendOTP,
  verifyOTP,
  refresh,
  logout
} from "../controllers/auth.controller.js";
import {
  otpLimiter,
  loginLimiter,
  refreshLimiter,
  apiLimiter
} from "../config/rateLimiter.js";


const router = express.Router();

router.post("/pricing",authMiddleware,roleMiddleware(USER_ROLES.SUPER_ADMIN),updatePricing)

// Auth
router.post("/send-otp", otpLimiter, sendOTP);
router.post("/verify-otp", apiLimiter, loginLimiter, verifyOTP);
router.post("/refresh", apiLimiter, refreshLimiter, refresh);
router.post("/logout", apiLimiter, logout);

export default router;