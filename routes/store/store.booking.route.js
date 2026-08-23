import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectStore } from "../../middlewares/auth.middleware.js";
import { checkStoreAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    getIncomingBookings,
    getActiveBookings,
    getReturnParcels,
    getBookingDetail,
    confirmStored,
    getBookingHistory,
    verifyReturnOtp,
    getBookingSettlement,
    getBookingSettlementPdf,
    getPeriodicSettlements,
    getPeriodicSettlementPdf,
} from "../../controllers/store/store.booking.controller.js";
import {
    confirmStoredSchema,
    verifyReturnOtpSchema,
} from "../../validations/store/store.booking.validation.js";

const router = express.Router();

router.use(authMiddleware, protectStore, checkStoreAccountStatus);

router.get("/incoming", apiLimiter, getIncomingBookings);
router.get("/active", apiLimiter, getActiveBookings);
router.get("/return_parcels", apiLimiter, getReturnParcels);
router.get("/history", apiLimiter, getBookingHistory);
router.get("/settlements/periodic", apiLimiter, getPeriodicSettlements);
router.get("/settlements/periodic/:period_id/pdf", apiLimiter, getPeriodicSettlementPdf);
router.get("/:booking_id/settlement", apiLimiter, getBookingSettlement);
router.get("/:booking_id/settlement/pdf", apiLimiter, getBookingSettlementPdf);
router.get("/:booking_id", apiLimiter, getBookingDetail);
router.post("/:booking_id/confirm-stored", apiLimiter, validate(confirmStoredSchema), confirmStored);
router.post("/:booking_id/verify-return-otp", apiLimiter, validate(verifyReturnOtpSchema), verifyReturnOtp);

export default router;