import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    updateDriverInfo,
    updateDriverLocation,
    updateDriverStatus,
} from "../../controllers/driver/driver.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Protected
router.use(authMiddleware);

router.put("/update-driver-info", apiLimiter, updateDriverInfo);
router.put("/update-driver-location", apiLimiter, updateDriverLocation);
router.put("/update-driver-status", apiLimiter, updateDriverStatus);

export default router;
