import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware, protectStore } from "../../middlewares/auth.middleware.js";
import { checkStoreAccountStatus } from "../../middlewares/checkAccountStatus.middleware.js";
import {
    getProfile,
    updateProfile,
    goOnline,
    getDashboard,
} from "../../controllers/store/store.controller.js";

const router = express.Router();

router.use(authMiddleware, protectStore, checkStoreAccountStatus);

router.get("/profile", apiLimiter, getProfile);
router.put("/profile", apiLimiter, updateProfile);
router.put("/status/online", apiLimiter, goOnline);
router.get("/dashboard", apiLimiter, getDashboard);

export default router;