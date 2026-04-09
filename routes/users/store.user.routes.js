import express from "express";
import {
    // searchStores,
    // getNearbyStores,
    // getStoreById,
    // getStoreAvailability,
    storeAvailability
} from "../../controllers/user/store.user.controller.js";
import { apiLimiter } from "../../config/rateLimiter.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
    // searchStoresSchema,
    // nearbyStoresSchema,
    // storeIdSchema,
    checkStoreAvability,
} from "../../validations/user/store.validator.js";

const router = express.Router();
router.use(authMiddleware);


// Check Store Availability
router.get(
    "/availability",
    apiLimiter,
    validate(checkStoreAvability),
    storeAvailability
);


// router.get(
//     "/",
//     apiLimiter,
//     validate(searchStoresSchema),
//     searchStores
// );

// router.get(
//     "/nearby",
//     apiLimiter,
//     validate(nearbyStoresSchema),
//     getNearbyStores
// );

// router.get(
//     "/:id",
//     apiLimiter,
//     validate(storeIdSchema),
//     getStoreById
// );

// router.get(
//     "/:id/availability",
//     apiLimiter,
//     validate(storeIdSchema),
//     getStoreAvailability
// );

export default router;