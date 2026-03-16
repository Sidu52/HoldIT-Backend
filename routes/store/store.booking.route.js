import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    getIncomingBookings,
    getActiveBookings,
    getBookingDetail,
    confirmStored,
    getBookingHistory,
} from "../../controllers/store/store.booking.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/incoming", apiLimiter, getIncomingBookings);
router.get("/active", apiLimiter, getActiveBookings);
router.get("/history", apiLimiter, getBookingHistory);
router.get("/:booking_id", apiLimiter, getBookingDetail);


router.put("/:booking_id/confirm-stored", apiLimiter, confirmStored);

export default router;