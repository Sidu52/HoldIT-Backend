import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    schedulePickup,
    getMyBookings,
    getBookingById,
    cancelBooking,
    requestReturn,
    getActiveBookings,
    getBookingHistory,
    getAssignStore,
    getAssignDriver,
} from "../../controllers/user/booking.user.controller.js";
import {
    schedulePickupSchema,
    bookingIdSchema,
    cancelBookingSchema,
    requestReturnSchema,
    listBookingsSchema,
    historySchema,
} from "../../validations/user/booking.user.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Create new booking
router.post(
    "/",
    apiLimiter,
    validate(schedulePickupSchema),
    schedulePickup
);

// Get all user bookings
router.get(
    "/",
    apiLimiter,
    validate(listBookingsSchema.query),
    getMyBookings
);


// Get active bookings
router.get(
    "/active",
    apiLimiter,
    getActiveBookings
);


router.get(
    "/history",
    apiLimiter,
    getBookingHistory
);

// Get single booking
router.get(
    "/:booking_id",
    apiLimiter,
    validate(bookingIdSchema),
    getBookingById
);


// Cancel a booking
router.put(
    "/:booking_id/cancel",
    apiLimiter,
    validate(bookingIdSchema),
    validate(cancelBookingSchema),
    cancelBooking
);

// Request return luggage
router.post(
    "/:booking_id/return-request",
    apiLimiter,
    validate(bookingIdSchema),
    validate(requestReturnSchema),
    requestReturn
);

// Get Assign Driver
router.get(
    "/:booking_id/assign-driver",
    apiLimiter,
    getAssignDriver
);

// Assign Store
router.get(
    "/:booking_id/assign-store",
    apiLimiter,
    getAssignStore
);


// // -------------Pricing & Estimation--------------
// // Calculate storage price
// router.post(
//     "/calculate-price",
//     apiLimiter,
//     ()=>{}
// );
// // Estimate pickup/delivery time
// router.post(
//     "/estimate-time",
//     apiLimiter,
//     ()=>{}
// );

// // -------------Tracking--------------
// // Track booking status
// router.post(
//     "/:booking_id/track",
//     apiLimiter,
//     ()=>{}
// );
// // Get assigned driver's live location
// router.get(
//     "/:booking_id/live-location",
//     apiLimiter,
//     ()=>{}
// );

// // -------------Reviews--------------
// // Add review for service
// router.post(
//     "/:booking_id/review",
//     apiLimiter,
//     ()=>{}
// );

// // Update review
// router.put(
//     "/:booking_id/review/",
//     apiLimiter,
//     ()=>{}
// );

export default router;