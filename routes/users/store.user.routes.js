import express from "express";
import {
    checkStoreAvailability
} from "../../controllers/user/store.user.controller.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

const router = express.Router();
router.use(authMiddleware);

// Check Store Availability
router.get(
    "/availability",
    apiLimiter,
    validate(checkStoreAvailability),
    checkStoreAvailability
);

export default router;