import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    getAssignedRidesController,
    getActiveRideController,
    getRideDetailsController,
    getRideHistoryController,
    acceptRideController,
    rejectRideController,
    startPickupController,
    completePickupController,
} from "../../controllers/driver/driver.controller.js";
import {
    bookingIdParamSchema,
    rideHistorySchema,
} from "../../validations/driver/ride.driver.validation.js";

const router = express.Router();

// All routes require driver authentication
router.use(authMiddleware);

// ============= Ride Queries =============

// Get all assigned rides
router.get(
    "/rides",
    apiLimiter,
    getAssignedRidesController
);

// Get active ride (currently in progress)
// ⚠️ Static routes BEFORE parameterized
router.get(
    "/rides/active",
    apiLimiter,
    getActiveRideController
);

// Get ride history (completed/cancelled)
router.get(
    "/rides/history",
    apiLimiter,
    validate(rideHistorySchema),
    getRideHistoryController
);

// Get single ride details
router.get(
    "/rides/:booking_id",
    apiLimiter,
    validate(bookingIdParamSchema),
    getRideDetailsController
);

// ============= Ride Actions =============

// Accept ride offer
router.post(
    "/rides/:booking_id/accept",
    apiLimiter,
    validate(bookingIdParamSchema),
    acceptRideController
);

// Reject ride offer
router.post(
    "/rides/:booking_id/reject",
    apiLimiter,
    validate(bookingIdParamSchema),
    rejectRideController
);

// Start pickup (heading to user)
router.put(
    "/rides/:booking_id/start-pickup",
    apiLimiter,
    validate(bookingIdParamSchema),
    startPickupController
);

// Complete pickup (luggage collected)
router.put(
    "/rides/:booking_id/complete-pickup",
    apiLimiter,
    validate(bookingIdParamSchema),
    completePickupController
);

export default router;