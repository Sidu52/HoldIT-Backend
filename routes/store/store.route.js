import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    getProfile,
    updateProfile,
    goOnline,
    getDashboard,
} from "../../controllers/store/store.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", apiLimiter, getProfile);
router.put("/profile", apiLimiter, updateProfile);
router.put("/status/online", apiLimiter, goOnline);
router.get("/dashboard", apiLimiter, getDashboard);

export default router;