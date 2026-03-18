import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    getProfile,
    updateProfile,
    goOnline,
    goOffline,
    getDashboard,
    completeProfile,
} from "../../controllers/store/store.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { updateStoreDetailsSchema } from "../../validations/store/auth.validation.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", apiLimiter, getProfile);
router.put("/profile", apiLimiter, updateProfile);
router.put("/status/online", apiLimiter, goOnline);
router.put("/status/offline", apiLimiter, goOffline);
router.get("/dashboard", apiLimiter, getDashboard);

router.post ("/complete-profile", apiLimiter, validate(updateStoreDetailsSchema),completeProfile);

export default router;