import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    getIncomingBookings,
    getActiveBookings,
    getReturnParcels,
    getBookingDetail,
    confirmStored,
    getBookingHistory,
    verifyReturnOtp,
} from "../../controllers/store/store.booking.controller.js";
import {
    confirmStoredSchema,
    verifyReturnOtpSchema,
} from "../../validations/store/store.booking.validation.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/incoming", apiLimiter, getIncomingBookings);
router.get("/active", apiLimiter, getActiveBookings);
router.get("/return_parcels", apiLimiter, getReturnParcels);
router.get("/history", apiLimiter, getBookingHistory);
router.get("/:booking_id", apiLimiter, getBookingDetail);
router.post("/:booking_id/confirm-stored", apiLimiter, validate(confirmStoredSchema), confirmStored);
router.post("/:booking_id/verify-return-otp", apiLimiter, validate(verifyReturnOtpSchema), verifyReturnOtp);

export default router;