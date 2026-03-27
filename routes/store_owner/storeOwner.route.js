import express from "express";
import { apiLimiter } from "../../config/rateLimiter.js";
import {
    getProfile,
    updateProfile,
    completeProfile,
    getStores,
    getStore,
    createStore,
    updateStore,
    deleteStore,
    getDashboard,
    goOnline,
} from "../../controllers/store_owner/storeOwner.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    completeProfileSchema,
    updateProfileSchema,
    createStoreSchema,
    updateStoreSchema,
    goOnlineSchema,
} from "../../validations/storeOwner/storeOwner.validator.js";

const router = express.Router();

// Protected
router.use(authMiddleware);

// Profile
router.get("/profile", apiLimiter, getProfile);
router.put("/profile", apiLimiter, validate(updateProfileSchema), updateProfile);
router.post("/complete-profile", apiLimiter, validate(completeProfileSchema), completeProfile);

// Dashboard
router.get("/dashboard", apiLimiter, getDashboard);

// Stores
router.get("/stores", apiLimiter, getStores);
router.post("/stores", apiLimiter, validate(createStoreSchema), createStore);
router.get("/stores/:id", apiLimiter, getStore);
router.put("/stores/:id", apiLimiter, validate(updateStoreSchema), updateStore);
router.delete("/stores/:id", apiLimiter, deleteStore);

// Online status
router.put("/stores/:store_id/go-online", apiLimiter, validate(goOnlineSchema), goOnline);

export default router;