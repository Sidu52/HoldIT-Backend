import express from "express";
import {
      searchStores,
    getNearbyStores,
    getStoreById,
    getStoreAvailability,
} from "../../controllers/user/store.user.controller.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    searchStoresSchema,
    nearbyStoresSchema,
    storeIdSchema,
} from "../../validations/user/store.validator.js";

const router = express.Router();
router.use(authMiddleware);
router.get(
    "/",
    apiLimiter,
    validate(searchStoresSchema),
    searchStores
);

router.get(
    "/nearby",
    apiLimiter,
    validate(nearbyStoresSchema),
    getNearbyStores
);

router.get(
    "/:id",
    apiLimiter,
    validate(storeIdSchema),
    getStoreById
);

router.get(
    "/:id/availability",
    apiLimiter,
    validate(storeIdSchema),
    getStoreAvailability
);

export default router;