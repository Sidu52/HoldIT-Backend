import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    getAssignedRidesController,
    getActiveRideController,
    getRideDetailsController,
    getRideHistoryController,
    acceptRideController,
    rejectRideController,
    arriveAtPickupController,
    completePickupController,
    arriveAtStoreController,
    cancelRideController,
    getPendingOfferController,
    completeDeliveryController,
} from "../../controllers/driver/driver.ride.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { cancelRideSchema } from "../../validations/driver/ride.driver.validation.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/rides/offer/pending", apiLimiter, getPendingOfferController);
router.get("/rides/assigned",      apiLimiter, getAssignedRidesController);
router.get("/rides/active",        apiLimiter, getActiveRideController);

router.get("/rides/history",       apiLimiter, getRideHistoryController);
router.get("/rides/:booking_id",   apiLimiter, getRideDetailsController);

// OFFER
router.post("/rides/:booking_id/accept", apiLimiter, acceptRideController);
router.post("/rides/:booking_id/reject", apiLimiter, rejectRideController);

// PICKUP
router.put("/rides/:booking_id/arrive-pickup",   apiLimiter, arriveAtPickupController);
router.put("/rides/:booking_id/complete-pickup", apiLimiter, completePickupController);
router.put("/rides/:booking_id/arrive-store",    apiLimiter, arriveAtStoreController);

// CANCELLATION 
router.post(
    "/rides/:booking_id/cancel",
    apiLimiter,
    validate(cancelRideSchema),
    cancelRideController
);

// DELIVERY
router.put("/rides/:booking_id/complete-delivery", apiLimiter, completeDeliveryController);

export default router;