import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    updateDriverInfo,
    updateDriverLocation,
    updateDriverStatus,
    updatePushToken,
    getDriverProfile,
} from "../../controllers/driver/driver.controller.js";
import { getDriverStats } from "../../controllers/driver/driver.stats.controller.js";
import { authMiddleware, protectDriver } from "../../middlewares/auth.middleware.js";
import { checkDriverAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { acceptBooking, getActiveBooking, rejectBooking } from "../../controllers/driver/bookingController.js";
import { acceptBookingSchema,rejectBookingSchema } from "../../validations/driver/bookingValidator.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = express.Router();

// Protected
router.use(authMiddleware, protectDriver, checkDriverAccountStatus);

// get profile 
router.get("/", apiLimiter, getDriverProfile);
router.get("/stats", apiLimiter, getDriverStats);


router.put("/update-driver-info", apiLimiter, updateDriverInfo);
router.put("/update-driver-location", apiLimiter, updateDriverLocation);
router.put("/update-driver-status", apiLimiter, updateDriverStatus);
router.put("/update-push-token", apiLimiter, updatePushToken);

router.get("/bookings/active", apiLimiter, getActiveBooking);
router.post("/bookings/:bookingId/accept", apiLimiter, validate(acceptBookingSchema), acceptBooking);
router.post("/bookings/:bookingId/reject", apiLimiter, validate(rejectBookingSchema), rejectBooking);

export default router;
