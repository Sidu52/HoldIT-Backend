import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    getAssignedRidesController,
    getActiveRideController,
    getRideDetailsController,
    getRideHistoryController,
    acceptRideController,
    rejectRideController,
    startPickupController,
    completePickupController,
} from "../../controllers/driver/driver.ride.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Protected
router.use(authMiddleware);


router.get("/rides/assigned", getAssignedRidesController);
router.get("/rides/active", apiLimiter, getActiveRideController);
router.get("/rides/:booking_id", apiLimiter, getRideDetailsController);
router.get("/rides/history", apiLimiter, getRideHistoryController);

router.post("/rides/:booking_id/accept", apiLimiter, acceptRideController);
router.post("/rides/:booking_id/reject", apiLimiter, rejectRideController);
router.put("/rides/:booking_id/start-pickup", apiLimiter, startPickupController);
router.put("/rides/:booking_id/complete-pickup", apiLimiter, completePickupController);


export default router;
