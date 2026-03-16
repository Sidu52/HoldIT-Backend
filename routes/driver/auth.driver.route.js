import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { authDriver, refresh, sendOTP, verifyOTP, updateDriverDetails } from "../../controllers/driver/auth.driver.controller.js";

const router = express.Router();

// Public
router.post("/login", apiLimiter, authDriver);
router.post("/refresh", apiLimiter, refresh);
router.post("/resend-otp", apiLimiter, sendOTP);
router.post("/verify-otp", apiLimiter, verifyOTP);

// Protected
// router.use(authMiddleware);


export default router;
