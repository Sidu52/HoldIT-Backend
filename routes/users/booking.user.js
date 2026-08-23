import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectUser } from "../../middlewares/auth.middleware.js";
import { checkUserAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    schedulePickup,
    retryPayment,
    getMyBookings,
    getBookingById,
    cancelBooking,
    requestReturn,
    getActiveBookings,
    getBookingHistory,
    getAssignStore,
    getAssignDriver,
    getUserInvoice,
    estimateBookingPrice,
    getActivePricingRule,
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

router.use(authMiddleware, protectUser, checkUserAccountStatus);

// Get active pricing rule for user location / default
router.get("/pricing-rule", apiLimiter, getActivePricingRule);

// Estimate booking price & bill breakdown
router.post("/estimate", apiLimiter, estimateBookingPrice);

// Create new booking
router.post(
    "/",
    apiLimiter,
    validate(schedulePickupSchema),
    schedulePickup
);

router.post("/:bookingId/payment/retry", apiLimiter, retryPayment);

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


// Cancel a booking (supports both PUT and POST)
router.put(
    "/:booking_id/cancel",
    apiLimiter,
    validate(bookingIdSchema),
    validate(cancelBookingSchema),
    cancelBooking
);
router.post(
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

// Get Customer Invoice
router.get(
    "/:booking_id/invoice",
    apiLimiter,
    getUserInvoice
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

import { createReview } from "../../controllers/user/review.controller.js";

// -------------Reviews--------------
// Add review for booking (Driver, Store, Platform)
router.post(
    "/:bookingId/review",
    apiLimiter,
    createReview
);

export default router;