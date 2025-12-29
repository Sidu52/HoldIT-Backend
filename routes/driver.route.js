import express from "express";
import {
  authUser,
} from "../controllers/auth.controller.js";
import {
  apiLimiter,
  otpLimiter,
} from "../config/rateLimiter.js";
import { USER_ROLES } from "../utils/constants.js";
import { updateDriverSchema } from "../validations/driver.validation.js";
import { validate } from "../middlewares/validate.middleware.js";
import {authMiddleware,roleMiddleware} from "../middlewares/auth.middleware.js";
import { updateDriverDetails, driverOnDuty, acceptBooking, driverArrived, confirmPickup, resendPickupOtp, requestStoreOtp, deliveryConfirmed } from "../controllers/driver.controller.js";

const router = express.Router();

// Auth
router.post('/', apiLimiter, otpLimiter, (req, res) => authUser(req, res, USER_ROLES.DRIVER));
router.put("/", apiLimiter, validate(updateDriverSchema), authMiddleware, roleMiddleware(USER_ROLES.DRIVER), updateDriverDetails);
router.put("/status", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), driverOnDuty);
router.post("/bookings/:id/accept", authMiddleware, roleMiddleware(USER_ROLES.DRIVER), acceptBooking);
router.post("/bookings/:id/arrived", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), driverArrived);
router.post("/bookings/:id/confirm-pickup", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), confirmPickup);
router.post('/bookings/:id/resend-pickup-otp', apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), resendPickupOtp);
router.post("/bookings/:id/request-store-otp", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), requestStoreOtp);
router.post("/bookings/:id/request-return-pickup-otp", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), requestStoreOtp);
router.post("/bookings/:id/delivery-confirmed", apiLimiter, authMiddleware, roleMiddleware(USER_ROLES.DRIVER), deliveryConfirmed);
export default router;
