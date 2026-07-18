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
    arriveAtStoreForReturnController,
    cancelRideController,
    getPendingOfferController,
    arriveAtUserReturnController,
    completeDeliveryController,
    completePickupAtStoreController,
} from "../../controllers/driver/driver.ride.controller.js";

import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    cancelRideSchema,
    completeRideSchema
} from "../../validations/driver/ride.driver.validation.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/offer/pending", apiLimiter, getPendingOfferController);
router.get("/assigned", apiLimiter, getAssignedRidesController);
router.get("/active", apiLimiter, getActiveRideController);

router.get("/history", apiLimiter, getRideHistoryController);
router.get("/:booking_id", apiLimiter, getRideDetailsController);

// OFFER
router.post("/:booking_id/accept", apiLimiter, acceptRideController);
router.post("/:booking_id/reject", apiLimiter, rejectRideController);

// PICKUP
router.put("/:booking_id/arrive-pickup", apiLimiter, arriveAtPickupController);
router.put(
    "/:booking_id/complete-pickup",
    apiLimiter,
    upload.array("photos", 5),
    validate(completeRideSchema),
    completePickupController
);
router.put("/:booking_id/complete-pickup-at-store", apiLimiter, completePickupAtStoreController);

router.put("/:booking_id/arrive-store", apiLimiter, arriveAtStoreController);
router.put("/:booking_id/arrive-store-return", apiLimiter, arriveAtStoreForReturnController);

// CANCELLATION 
router.post(
    "/:booking_id/cancel",
    apiLimiter,
    validate(cancelRideSchema),
    cancelRideController
);

// DELIVERY
router.put("/:booking_id/arrive-delivery", apiLimiter, arriveAtUserReturnController);
router.put(
    "/:booking_id/complete-delivery",
    apiLimiter,
    upload.array("photos", 5),
    validate(completeRideSchema),
    completeDeliveryController
);


export default router;