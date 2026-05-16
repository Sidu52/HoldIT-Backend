import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    updateDriverInfo,
    updateDriverLocation,
    updateDriverStatus,
    getDriverProfile,
} from "../../controllers/driver/driver.controller.js";
import { getDriverStats } from "../../controllers/driver/driver.stats.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { acceptBooking, getActiveBooking, rejectBooking } from "../../controllers/driver/bookingController.js";
import { acceptBookingSchema,rejectBookingSchema } from "../../validations/driver/bookingValidator.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = express.Router();

// Protected
router.use(authMiddleware);

// get profile 
router.get("/", apiLimiter, getDriverProfile);
router.get("/stats", apiLimiter, getDriverStats);


router.put("/update-driver-info", apiLimiter, updateDriverInfo);
router.put("/update-driver-location", apiLimiter, updateDriverLocation);
router.put("/update-driver-status", apiLimiter, updateDriverStatus);

router.get("/bookings/active", apiLimiter, getActiveBooking);
router.post("/bookings/:bookingId/accept", apiLimiter, validate(acceptBookingSchema), acceptBooking);
router.post("/bookings/:bookingId/reject", apiLimiter, validate(rejectBookingSchema), rejectBooking);

export default router;
