import express from "express";
import {
  authUser,
} from "../controllers/auth.controller.js";
import {
  apiLimiter,
  otpLimiter,
} from "../config/rateLimiter.js";
import { USER_ROLES } from "../utils/constants.js";
import { updateUserSchema } from "../validations/user.validation.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateUserDetails, requestReturnLuggage } from "../controllers/user.controller.js";
import {authMiddleware,roleMiddleware} from "../middlewares/auth.middleware.js";


const router = express.Router();

// Auth
router.post("/", apiLimiter, otpLimiter, (req, res) => authUser(req, res, USER_ROLES.USER));
router.put("/", apiLimiter, validate(updateUserSchema), authMiddleware, roleMiddleware(USER_ROLES.USER), updateUserDetails);

// booking
router.post("/bookings/:id/return", authMiddleware, roleMiddleware(USER_ROLES.USER), requestReturnLuggage);

export default router;
