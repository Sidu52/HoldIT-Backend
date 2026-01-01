import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, roleMiddleware } from "../../middlewares/auth.middleware.js";
import { authUser, refresh, sendOTP, verifyOTP } from "../../controllers/common/auth.commin.controller.js";
import { USER_ROLES } from "../../utils/constants.js";

const router = express.Router();

// Public
router.post("/login", apiLimiter, (req, res) => authUser(req, res, USER_ROLES.USER));
router.post("/signup", apiLimiter, (req, res) => authUser(req, res, USER_ROLES.USER));
router.post("/refresh", apiLimiter, (req, res) => refresh(req, res, USER_ROLES.USER));
router.post("/resend-otp", apiLimiter, sendOTP);
router.post("/verify-otp", apiLimiter, verifyOTP);

// Protected
// router.use(authMiddleware);

export default router;
